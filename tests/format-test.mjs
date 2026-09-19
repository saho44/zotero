/**
 * Prüft die Textbausteine der Erweiterung.
 * Aufruf:  node tests/format-test.mjs
 */

import * as format from "../extension/background/format.js";

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
	checks++;
	console.log(condition ? `  ok   ${label}` : `  FAIL ${label}${detail ? ` – ${detail}` : ""}`);
	if (!condition) {
		failures++;
	}
}

const item = {
	key: "AAAA1111",
	itemType: "journalArticle",
	title: "Klimawandel und Küstenstädte",
	creators: [
		{ name: "Anna Meier", creatorType: "author" },
		{ name: "Bert Schulz", creatorType: "author" }
	],
	authorString: "Meier & Schulz",
	year: "2021",
	publication: "Zeitschrift für Geographie",
	publisher: "",
	volume: "12",
	issue: "3",
	pages: "45-67",
	DOI: "10.1000/xyz",
	url: "https://example.org/a",
	language: "de",
	abstract: "Eine Untersuchung der Folgen für Hafenstädte.",
	tags: ["Klima", "Stadt"]
};

const bareItem = { ...item, abstract: "", tags: [], DOI: "", publication: "" };

console.log("\nKurzinfo");
const summary = format.formatSummary(item);
check("Überschrift mit Autor und Jahr",
	summary.startsWith("### Klimawandel und Küstenstädte (Meier & Schulz, 2021)"), summary.split("\n")[0]);
check("Band und Heft zusammengefasst", summary.includes("**Band/Heft:** 12/3"));
check("Abstract angehängt", summary.includes("**Abstract:**"));
check("leere Felder werden weggelassen", !summary.includes("**Verlag:**"));
check("ohne Abstract kein Abschnitt", !format.formatSummary(bareItem).includes("**Abstract:**"));

console.log("\nAbstract");
check("Abstract wird ausgegeben",
	format.formatAbstract(item).endsWith("Eine Untersuchung der Folgen für Hafenstädte."));
check("fehlendes Abstract wird benannt",
	format.formatAbstract(bareItem).includes("kein Abstract hinterlegt"));

console.log("\nZitat");
const citationResult = {
	bibliography: "Meier, A., & Schulz, B. (2021). Klimawandel und Küstenstädte.",
	inTextCitations: [{ key: "AAAA1111", citation: "(Meier & Schulz, 2021)" }]
};
const citation = format.formatCitation(item, citationResult);
check("Kurzbeleg vorangestellt", citation.startsWith("(Meier & Schulz, 2021) — Meier, A."), citation);
check("ohne Kurzbeleg nur die Literaturangabe",
	format.formatCitation(item, { bibliography: "X.", inTextCitations: [] }) === "X.");
check("ohne Zitierstil wird aus Metadaten gebaut",
	format.formatReference(item, "").includes("Klimawandel und Küstenstädte"));
check("DOI wird zur Adresse ausgebaut",
	format.formatReference(item, "").includes("https://doi.org/10.1000/xyz"));

console.log("\nNotizen und Anmerkungen");
check("leere Notizliste wird benannt",
	format.formatNotes(item, []).includes("Keine Notizen vorhanden"));
const notes = format.formatNotes(item, [{ title: "Kernaussage", text: "Pegel steigt." }]);
check("Notiz nummeriert", notes.includes("**1. Kernaussage**"));

const annotations = format.formatAnnotations(item, [
	{ text: "Der Pegel\nsteigt.", comment: "Kapitel 2", page: "47" },
	{ text: "", comment: "", page: "50" }
]);
check("Markierung als Zitat mit Seite", annotations.includes("> Der Pegel steigt. (S. 47)"), annotations);
check("Kommentar angehängt", annotations.includes("Kommentar: Kapitel 2"));
check("leere Anmerkung erzeugt keine Leerzeile", !annotations.includes("(S. 50)"));
check("leere Liste wird benannt",
	format.formatAnnotations(item, []).includes("Keine Anmerkungen"));

console.log("\nVolltext");
const fulltext = format.formatFullText(item, {
	text: "Seite 1",
	totalChars: 12345,
	truncated: true
});
check("Kürzung wird ausgewiesen", fulltext.includes("Gekürzt auf"));
check("Text im Codeblock", fulltext.includes("```text\nSeite 1\n```"));
check("vollständiger Text ohne Kürzungshinweis",
	!format.formatFullText(item, { text: "Seite 1", totalChars: 7, truncated: false })
		.includes("Gekürzt"));

console.log("\nLiteraturverzeichnis");
const bibliography = format.formatBibliography([item, bareItem], citationResult);
check("Zitierstil wird bevorzugt", bibliography.includes("Meier, A., & Schulz, B. (2021)"));
const fallback = format.formatBibliography([item], null);
check("ohne Zitierstil als Liste", fallback.includes("- Meier & Schulz"), fallback);

console.log("\nCodeblock");
check("BibTeX eingerahmt",
	format.formatCodeBlock("@article{x}", "bibtex") === "```bibtex\n@article{x}\n```");

console.log(`\n${checks - failures}/${checks} Prüfungen bestanden.`);
if (failures) {
	process.exitCode = 1;
}
