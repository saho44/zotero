/**
 * Smoke-Test für das Zotero-Plugin.
 *
 * Lädt src/api.js und src/bridge.js in einen Kontext mit einem
 * nachgebildeten Zotero und ruft die HTTP-Endpunkte so auf, wie Zotero
 * es täte. Aufruf:  node tests/plugin-smoke-test.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { buildZotero } from "./fake-zotero.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = join(here, "..", "zotero-plugin");

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
	checks++;
	if (condition) {
		console.log(`  ok   ${label}`);
	}
	else {
		failures++;
		console.log(`  FAIL ${label}${detail ? ` – ${detail}` : ""}`);
	}
}

function section(title) {
	console.log(`\n${title}`);
}

/** Baut den Plugin-Kontext neu auf, wie beim Start von Zotero. */
function loadPlugin() {
	const sandbox = {
		Zotero: buildZotero(),
		console,
		setTimeout,
		clearTimeout
	};
	sandbox.globalThis = sandbox;
	const context = vm.createContext(sandbox);

	for (const file of ["src/api.js", "src/bridge.js"]) {
		vm.runInContext(readFileSync(join(pluginDir, file), "utf8"), context, { filename: file });
	}

	vm.runInContext(
		'ZoteroClaude.init({ id: "test", version: "0.1.0", rootURI: "" });',
		context
	);
	return sandbox;
}

/** Ruft einen Endpunkt so auf, wie es der Zotero-Server tut. */
async function call(sandbox, path, { method = "POST", data = {}, token, query = {} } = {}) {
	const Endpoint = sandbox.Zotero.Server.Endpoints[path];
	if (!Endpoint) {
		throw new Error(`Endpunkt fehlt: ${path}`);
	}
	const endpoint = new Endpoint();
	const headers = token === undefined ? {} : { "X-Zotero-Claude-Token": token };
	const [status, contentType, body] = await endpoint.init({
		method, pathname: path, query, headers, data
	});
	return { status, contentType, body: JSON.parse(body) };
}

async function main() {
	const sandbox = loadPlugin();
	const token = sandbox.ZoteroClaude.getToken();

	section("Registrierung");
	const paths = Object.keys(sandbox.Zotero.Server.Endpoints);
	check("13 Endpunkte registriert", paths.length === 13, `gefunden: ${paths.length}`);
	check("alle unter /claude/", paths.every(p => p.startsWith("/claude/")));
	check("Token wurde erzeugt", typeof token === "string" && token.length === 40);

	section("Zugriffsschutz");
	const noToken = await call(sandbox, "/claude/search", { token: undefined });
	check("ohne Token: 401", noToken.status === 401, `Status ${noToken.status}`);
	const badToken = await call(sandbox, "/claude/search", { token: "falsch" });
	check("falsches Token: 401", badToken.status === 401, `Status ${badToken.status}`);
	const ping = await call(sandbox, "/claude/ping", { token: undefined });
	check("ping ohne Token: 200", ping.status === 200);
	check("ping meldet tokenValid=false", ping.body.tokenValid === false);
	const pingAuth = await call(sandbox, "/claude/ping", { token });
	check("ping mit Token: tokenValid=true", pingAuth.body.tokenValid === true);
	const tokenInQuery = await call(sandbox, "/claude/search", { token: undefined, query: { token } });
	check("Token als Abfrageparameter akzeptiert", tokenInQuery.status === 200);

	section("Abschaltung in Zotero");
	sandbox.ZoteroClaude.setEnabled(false);
	const disabled = await call(sandbox, "/claude/search", { token });
	check("deaktiviert: 403", disabled.status === 403, `Status ${disabled.status}`);
	sandbox.ZoteroClaude.setEnabled(true);

	section("Suche");
	const search = await call(sandbox, "/claude/search", { token, data: { query: "Klima" } });
	check("Treffer gefunden", search.body.items.length === 1, JSON.stringify(search.body.error));
	const hit = search.body.items[0];
	check("Titel übernommen", hit.title === "Klimawandel und Küstenstädte");
	check("Autorenkurzform", hit.authorString === "Meier et al.", hit.authorString);
	check("Jahr aus Datum", hit.year === "2021", hit.year);
	check("Zeitschrift übernommen", hit.publication === "Zeitschrift für Geographie");
	check("PDF erkannt", hit.hasPDF === true);
	check("Notizen gezählt", hit.numNotes === 1);
	check("Anmerkungen gezählt", hit.numAnnotations === 1, String(hit.numAnnotations));
	check("Schlagwörter übernommen", hit.tags.join(",") === "Klima,Stadt");
	check("Sammlung übernommen", hit.collections[0].name === "Dissertation");
	check("Daten wurden nachgeladen", sandbox.Zotero.Items.get(1).loadCount > 0);

	const emptyQuery = await call(sandbox, "/claude/search", { token, data: {} });
	check("leere Suche liefert zuletzt geändert zuerst",
		emptyQuery.body.items[0].key === "AAAA1111", emptyQuery.body.items[0]?.key);

	const limited = await call(sandbox, "/claude/search", { token, data: { limit: 1 } });
	check("limit wird beachtet", limited.body.items.length === 1);
	check("truncated gesetzt", limited.body.truncated === true);

	const inCollection = await call(sandbox, "/claude/search",
		{ token, data: { collectionKey: "COLL0010" } });
	check("Sammlungsfilter greift", inCollection.body.items.length === 1);
	const badCollection = await call(sandbox, "/claude/search",
		{ token, data: { collectionKey: "GIBTSNICHT" } });
	check("unbekannte Sammlung: 400", badCollection.status === 400);

	section("Einzelner Eintrag");
	const detail = await call(sandbox, "/claude/item", { token, data: { key: "AAAA1111" } });
	check("Notiztext extrahiert",
		detail.body.notes[0].text === "Kernaussage: Pegel steigt.", detail.body.notes[0]?.text);
	check("Anhang gelistet", detail.body.attachments[0].filename === "meier2021.pdf");
	check("Anmerkung enthalten", detail.body.annotations[0].page === "47");
	const missing = await call(sandbox, "/claude/item", { token, data: { key: "FEHLT" } });
	check("unbekannter Schlüssel: 400", missing.status === 400);
	check("Fehlermeldung im Klartext",
		typeof missing.body.error === "string" && missing.body.error.includes("FEHLT"));

	section("Volltext");
	const fulltext = await call(sandbox, "/claude/fulltext", { token, data: { key: "AAAA1111" } });
	check("Text geliefert", fulltext.body.text.startsWith("Seite 1"));
	check("Leerzeilen zusammengefasst", !fulltext.body.text.includes("\n\n\n"));
	const short = await call(sandbox, "/claude/fulltext",
		{ token, data: { key: "AAAA1111", maxChars: 10 } });
	check("maxChars schneidet ab", short.body.text.length === 10);
	check("truncated gemeldet", short.body.truncated === true);
	const noText = await call(sandbox, "/claude/fulltext", { token, data: { key: "BBBB2222" } });
	check("ohne PDF: 400 mit Erklärung",
		noText.status === 400 && noText.body.error.includes("Volltext"));

	section("Anmerkungen und Notizen");
	const annotations = await call(sandbox, "/claude/annotations", { token, data: { key: "AAAA1111" } });
	check("Markierung übernommen",
		annotations.body.annotations[0].text.startsWith("Der Meeresspiegel"));
	check("Kommentar übernommen",
		annotations.body.annotations[0].comment === "Für Kapitel 2 verwenden");
	const notes = await call(sandbox, "/claude/notes", { token, data: { key: "AAAA1111" } });
	check("Notiz geliefert", notes.body.total === 1);

	section("Zitate und Export");
	const citation = await call(sandbox, "/claude/citation",
		{ token, data: { keys: ["AAAA1111"] } });
	check("Literaturverzeichnis erzeugt", citation.body.bibliography.startsWith("Meier, A."));
	check("Kurzbeleg erzeugt",
		citation.body.inTextCitations[0].citation === "(Meier et al., 2021)");
	const badStyle = await call(sandbox, "/claude/citation",
		{ token, data: { keys: ["AAAA1111"], style: "gibt-es-nicht" } });
	check("unbekannter Stil: 400", badStyle.status === 400);

	const bibtex = await call(sandbox, "/claude/export",
		{ token, data: { keys: ["AAAA1111"], translator: "bibtex" } });
	check("BibTeX erzeugt", bibtex.body.output.startsWith("@article"));
	check("Translator-ID aufgelöst",
		bibtex.body.translator === "9cb70025-a888-4a29-a210-93ec52da40d4");

	section("Listen");
	const collections = await call(sandbox, "/claude/collections", { token, method: "GET" });
	check("Sammlungen gelistet", collections.body.collections[0].name === "Dissertation");
	const styles = await call(sandbox, "/claude/styles", { token, method: "GET" });
	check("Stile gelistet", styles.body.styles[0].title === "APA");
	const libraries = await call(sandbox, "/claude/libraries", { token, method: "GET" });
	check("Bibliotheken gelistet", libraries.body.libraries[0].isDefault === true);

	section("Fehlerprotokoll");
	check("erwartete Fehler wurden protokolliert",
		sandbox.Zotero.errors.length > 0, "keine Einträge");
	// instanceof greift hier nicht: der vm-Kontext hat einen eigenen Error
	check("Protokoll enthält Fehler mit Meldung",
		sandbox.Zotero.errors.every(e => e && typeof e.message === "string"));

	section("Abbau");
	sandbox.ZoteroClaude.shutdown();
	check("Endpunkte wieder entfernt",
		Object.keys(sandbox.Zotero.Server.Endpoints).length === 0);

	console.log(`\n${checks - failures}/${checks} Prüfungen bestanden.`);
	if (failures) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
