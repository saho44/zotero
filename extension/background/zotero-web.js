/**
 * Reserve-Zugriff über die Online-API von zotero.org.
 *
 * Wird nur benutzt, wenn Zotero auf dem Rechner nicht läuft und der Nutzer
 * in den Einstellungen einen API-Schlüssel hinterlegt hat. Der Umfang ist
 * kleiner als lokal: kein PDF-Volltext ohne Indizierung in der Cloud und
 * keine Auswahl beliebiger Exportformate.
 */

import { getSettings } from "./settings.js";
import { ZoteroError } from "./zotero-local.js";

const API_BASE = "https://api.zotero.org";
const TIMEOUT_MS = 30000;

async function request(path, params = {}, settings = null) {
	const config = settings || (await getSettings());

	if (!config.webApiKey || !config.webUserID) {
		throw new ZoteroError(
			"Für den Online-Zugriff fehlen API-Schlüssel oder Benutzer-ID.",
			{ kind: "no-web-credentials" }
		);
	}

	const url = new URL(`${API_BASE}/users/${encodeURIComponent(config.webUserID)}${path}`);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== "") {
			url.searchParams.set(key, value);
		}
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	let response;
	try {
		response = await fetch(url.toString(), {
			headers: {
				"Zotero-API-Version": "3",
				"Zotero-API-Key": config.webApiKey
			},
			signal: controller.signal
		});
	}
	catch (e) {
		throw new ZoteroError("zotero.org ist nicht erreichbar.", { kind: "offline" });
	}
	finally {
		clearTimeout(timer);
	}

	if (response.status === 403) {
		throw new ZoteroError(
			"zotero.org lehnt den API-Schlüssel ab. Bitte Schlüssel und Benutzer-ID prüfen.",
			{ status: 403, kind: "bad-token" }
		);
	}
	if (!response.ok) {
		throw new ZoteroError(
			`zotero.org meldet einen Fehler (HTTP ${response.status}).`,
			{ status: response.status }
		);
	}

	return response.json();
}

/**
 * Lokal heissen Stile "http://www.zotero.org/styles/apa", die Online-API
 * erwartet nur "apa".
 */
function shortStyle(style) {
	if (!style) {
		return "apa";
	}
	return String(style).replace(/^https?:\/\/www\.zotero\.org\/styles\//, "");
}

function htmlToText(html) {
	if (!html) {
		return "";
	}
	return String(html)
		.replace(/<\s*br\s*\/?\s*>/gi, "\n")
		.replace(/<\/\s*(p|div|li)\s*>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function authorString(creators) {
	const names = creators
		.filter(c => !c.creatorType || c.creatorType === "author")
		.map(c => c.lastName || c.name)
		.filter(Boolean);
	if (!names.length) {
		return "";
	}
	if (names.length === 1) {
		return names[0];
	}
	if (names.length === 2) {
		return `${names[0]} & ${names[1]}`;
	}
	return `${names[0]} et al.`;
}

/** Online-Antwort auf dieselbe Struktur bringen, die das Plugin liefert. */
function mapItem(entry) {
	const data = entry.data || {};
	const meta = entry.meta || {};
	const creators = (data.creators || []).map(c => ({
		creatorType: c.creatorType || "author",
		firstName: c.firstName || "",
		lastName: c.lastName || c.name || "",
		name: c.name || [c.firstName, c.lastName].filter(Boolean).join(" ")
	}));

	return {
		key: entry.key,
		libraryID: null,
		itemType: data.itemType || "",
		title: data.title || "",
		creators,
		authorString: meta.creatorSummary || authorString(creators),
		year: meta.parsedDate ? String(meta.parsedDate).slice(0, 4) : "",
		date: data.date || "",
		publication: data.publicationTitle || data.bookTitle || data.proceedingsTitle || "",
		publisher: data.publisher || "",
		volume: data.volume || "",
		issue: data.issue || "",
		pages: data.pages || "",
		DOI: data.DOI || "",
		ISBN: data.ISBN || "",
		url: data.url || "",
		language: data.language || "",
		abstract: data.abstractNote || "",
		tags: (data.tags || []).map(t => t.tag),
		collections: [],
		dateAdded: data.dateAdded || "",
		dateModified: data.dateModified || "",
		hasPDF: (meta.numChildren || 0) > 0,
		numAttachments: meta.numChildren || 0,
		numNotes: 0,
		numAnnotations: 0,
		zoteroURI: `zotero://select/library/items/${entry.key}`,
		source: "web",
		bib: entry.bib ? htmlToText(entry.bib) : "",
		citationText: entry.citation ? htmlToText(entry.citation) : ""
	};
}

export const web = {
	async ping(settings) {
		const config = settings || (await getSettings());
		await request("/items/top", { limit: 1, format: "json" }, config);
		return { ok: true, source: "web" };
	},

	async search({ query, limit, style, locale, mode }) {
		const entries = await request("/items/top", {
			q: query || "",
			// "everything" schliesst Abstract, Notizen, Tags, Zeitschrift,
			// Verlag und den synchronisierten PDF-Volltext ein.
			qmode: mode === "titleCreatorYear" ? "titleCreatorYear" : "everything",
			limit: Math.min(Number(limit) || 20, 100),
			format: "json",
			include: "data,bib,citation",
			style: shortStyle(style),
			locale: locale || "de-DE",
			linkwrap: 0,
			sort: query ? undefined : "dateModified"
		});
		const items = entries.map(mapItem);
		return { ok: true, items, total: items.length, source: "web" };
	},

	async item({ key, style, locale }) {
		const entry = await request(`/items/${encodeURIComponent(key)}`, {
			format: "json",
			include: "data,bib,citation",
			style: shortStyle(style),
			locale: locale || "de-DE",
			linkwrap: 0
		});
		const item = mapItem(entry);

		const children = await request(`/items/${encodeURIComponent(key)}/children`, {
			format: "json",
			include: "data"
		}).catch(() => []);

		item.notes = children
			.filter(child => child.data && child.data.itemType === "note")
			.map(child => ({
				key: child.key,
				title: (htmlToText(child.data.note) || "").split("\n")[0].slice(0, 80),
				text: htmlToText(child.data.note)
			}));
		item.attachments = children
			.filter(child => child.data && child.data.itemType === "attachment")
			.map(child => ({
				key: child.key,
				title: child.data.title || "",
				contentType: child.data.contentType || "",
				filename: child.data.filename || ""
			}));
		item.annotations = [];
		item.numNotes = item.notes.length;

		return { ok: true, ...item };
	},

	async fulltext({ key, maxChars }) {
		const children = await request(`/items/${encodeURIComponent(key)}/children`, {
			format: "json",
			include: "data"
		});
		const attachments = children.filter(child =>
			child.data
			&& child.data.itemType === "attachment"
			&& child.data.contentType === "application/pdf");

		const limit = Math.min(Number(maxChars) || 20000, 200000);

		for (const attachment of attachments) {
			const result = await request(
				`/items/${encodeURIComponent(attachment.key)}/fulltext`,
				{}
			).catch(() => null);

			if (result && result.content && result.content.trim()) {
				const text = result.content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
				return {
					ok: true,
					key,
					attachmentKey: attachment.key,
					attachmentTitle: attachment.data.title || "",
					contentType: "application/pdf",
					totalChars: text.length,
					truncated: text.length > limit,
					text: text.slice(0, limit),
					source: "web"
				};
			}
		}

		throw new ZoteroError(
			"Online ist kein Volltext hinterlegt. Der PDF-Text wird nur übertragen, wenn "
			+ "Zotero ihn synchronisiert hat.",
			{ kind: "no-fulltext" }
		);
	},

	async citation({ keys, style, locale }) {
		const entries = await request("/items", {
			itemKey: keys.join(","),
			format: "json",
			include: "data,bib,citation",
			style: shortStyle(style),
			locale: locale || "de-DE",
			linkwrap: 0
		});

		return {
			ok: true,
			style: shortStyle(style),
			locale: locale || "de-DE",
			format: "text",
			bibliography: entries.map(e => htmlToText(e.bib)).filter(Boolean).join("\n"),
			inTextCitations: entries.map(e => ({
				key: e.key,
				citation: htmlToText(e.citation)
			})),
			source: "web"
		};
	},

	async exportItems({ keys, translator }) {
		const format = translator === "ris" ? "ris" : "bibtex";
		const config = await getSettings();
		const url = new URL(`${API_BASE}/users/${encodeURIComponent(config.webUserID)}/items`);
		url.searchParams.set("itemKey", keys.join(","));
		url.searchParams.set("format", format);

		const response = await fetch(url.toString(), {
			headers: {
				"Zotero-API-Version": "3",
				"Zotero-API-Key": config.webApiKey
			}
		});
		if (!response.ok) {
			throw new ZoteroError(`Export über zotero.org fehlgeschlagen (HTTP ${response.status}).`);
		}
		return { ok: true, translator: format, output: (await response.text()).trim(), source: "web" };
	},

	async notes({ key }) {
		const detail = await this.item({ key });
		return { ok: true, key, notes: detail.notes || [], total: (detail.notes || []).length };
	},

	async annotations() {
		throw new ZoteroError(
			"PDF-Anmerkungen stehen nur zur Verfügung, wenn Zotero auf diesem Rechner läuft.",
			{ kind: "unsupported" }
		);
	},

	async collections() {
		const entries = await request("/collections", { format: "json", limit: 100 });
		return {
			ok: true,
			collections: entries.map(entry => ({
				key: entry.key,
				name: entry.data ? entry.data.name : "",
				parentKey: entry.data && entry.data.parentCollection ? entry.data.parentCollection : null,
				level: 0
			})),
			source: "web"
		};
	},

	async styles() {
		// Die Online-API kennt keine Stilliste; eine kleine Auswahl reicht.
		return {
			ok: true,
			styles: [
				{ id: "apa", title: "APA" },
				{ id: "chicago-note-bibliography", title: "Chicago (Fußnoten)" },
				{ id: "mla", title: "MLA" },
				{ id: "ieee", title: "IEEE" },
				{ id: "harvard-cite-them-right", title: "Harvard" },
				{ id: "din-1505-2", title: "DIN 1505-2" }
			],
			source: "web"
		};
	}
};
