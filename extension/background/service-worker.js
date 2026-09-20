/**
 * Hintergrunddienst der Erweiterung.
 *
 * Er ist die einzige Stelle, die mit Zotero spricht. Das Inhaltsskript auf
 * claude.ai schickt nur noch fertige Aufträge ("suche das", "baue mir den
 * Zitat-Text") und bekommt Text zurück.
 */

import { getSettings, setSettings, DEFAULT_SETTINGS } from "./settings.js";
import { local, ZoteroError } from "./zotero-local.js";
import { web } from "./zotero-web.js";
import * as format from "./format.js";

/** Fehlerarten, bei denen ein Umschalten auf die Online-API sinnvoll ist. */
const FALLBACK_KINDS = new Set(["offline", "no-token", "bad-response"]);

async function canUseWeb(settings) {
	return !!(settings.useWebFallback && settings.webApiKey && settings.webUserID);
}

/**
 * Ruft erst das lokale Zotero auf und weicht nur bei Verbindungsproblemen
 * auf zotero.org aus. Fachliche Fehler (z. B. "kein Volltext") werden
 * durchgereicht, damit der Nutzer eine ehrliche Meldung sieht.
 */
async function withFallback(methodName, args) {
	const settings = await getSettings();

	try {
		const result = await local[methodName](args);
		return { ...result, source: "local" };
	}
	catch (error) {
		const kind = error instanceof ZoteroError ? error.kind : "error";
		if (!FALLBACK_KINDS.has(kind) || !(await canUseWeb(settings))) {
			throw error;
		}
		if (typeof web[methodName] !== "function") {
			throw error;
		}
		return web[methodName]({
			...args,
			style: args.style || settings.style,
			locale: args.locale || settings.locale
		});
	}
}

async function getStatus() {
	const settings = await getSettings();
	const status = {
		local: { connected: false, message: "", tokenValid: false },
		web: { configured: false, connected: false, message: "" },
		settings: { hasToken: !!settings.token, port: settings.port }
	};

	try {
		const pong = await local.ping(settings);
		status.local.connected = true;
		status.local.tokenValid = !!pong.tokenValid;
		status.local.version = pong.version;
		status.local.zoteroVersion = pong.zoteroVersion;
		if (!pong.enabled) {
			status.local.message = "Die Verbindung ist in Zotero deaktiviert.";
		}
		else if (!pong.tokenValid) {
			status.local.message = settings.token
				? "Das hinterlegte Token passt nicht zu Zotero."
				: "Es ist noch kein Token hinterlegt.";
		}
	}
	catch (error) {
		status.local.message = error.message;
	}

	status.web.configured = await canUseWeb(settings);
	if (status.web.configured) {
		try {
			await web.ping(settings);
			status.web.connected = true;
		}
		catch (error) {
			status.web.message = error.message;
		}
	}

	return status;
}

/* --------------------------------------------------------------------- *
 * Textbausteine für den Chat
 * --------------------------------------------------------------------- */

async function loadItem(key) {
	return withFallback("item", { key });
}

async function loadCitation(keys) {
	const settings = await getSettings();
	return withFallback("citation", {
		keys,
		style: settings.style,
		locale: settings.locale,
		format: "text"
	});
}

async function composeSingle(action, key) {
	const settings = await getSettings();
	const item = await loadItem(key);

	switch (action) {
		case "citation": {
			const citation = await loadCitation([key]);
			return format.formatCitation(item, citation);
		}
		case "reference": {
			const citation = await loadCitation([key]);
			return format.formatReference(item, citation.bibliography);
		}
		case "summary":
			return format.formatSummary(item);

		case "abstract":
			return format.formatAbstract(item);

		case "notes": {
			const result = await withFallback("notes", { key });
			return format.formatNotes(item, result.notes);
		}
		case "annotations": {
			const result = await withFallback("annotations", { key });
			return format.formatAnnotations(item, result.annotations);
		}
		case "fulltext": {
			const result = await withFallback("fulltext", {
				key,
				maxChars: settings.fulltextChars
			});
			return format.formatFullText(item, result);
		}
		case "bibtex": {
			const result = await withFallback("exportItems", { keys: [key], translator: "bibtex" });
			return format.formatCodeBlock(result.output, "bibtex");
		}
		case "all": {
			const blocks = [format.formatSummary(item)];

			const notes = await withFallback("notes", { key }).catch(() => null);
			if (notes && notes.notes && notes.notes.length) {
				blocks.push(format.formatNotes(item, notes.notes));
			}

			const annotations = await withFallback("annotations", { key }).catch(() => null);
			if (annotations && annotations.annotations && annotations.annotations.length) {
				blocks.push(format.formatAnnotations(item, annotations.annotations));
			}

			const fulltext = await withFallback("fulltext", {
				key,
				maxChars: settings.fulltextChars
			}).catch(() => null);
			if (fulltext) {
				blocks.push(format.formatFullText(item, fulltext));
			}

			return blocks.join("\n\n");
		}
		default:
			throw new Error(`Unbekannte Aktion: ${action}`);
	}
}

async function composeMultiple(action, keys) {
	switch (action) {
		case "bibliography": {
			const citation = await loadCitation(keys);
			const items = [];
			for (const key of keys) {
				items.push(await loadItem(key));
			}
			return format.formatBibliography(items, citation);
		}
		case "bibtex": {
			const result = await withFallback("exportItems", { keys, translator: "bibtex" });
			return format.formatCodeBlock(result.output, "bibtex");
		}
		case "summary": {
			const blocks = [];
			for (const key of keys) {
				blocks.push(format.formatSummary(await loadItem(key)));
			}
			return blocks.join("\n\n");
		}
		default: {
			const blocks = [];
			for (const key of keys) {
				blocks.push(await composeSingle(action, key));
			}
			return blocks.join("\n\n");
		}
	}
}

/* --------------------------------------------------------------------- *
 * Nachrichtenempfang
 * --------------------------------------------------------------------- */

/** Felder, die nie an ein Inhaltsskript auf einer Webseite gehen. */
const SECRET_FIELDS = ["token", "webApiKey"];

/**
 * Unterscheidet Anfragen aus den eigenen Seiten der Erweiterung
 * (Einstellungen, Popup) von denen des Inhaltsskripts auf claude.ai.
 * Webseiten selbst koennen hier nichts einschleusen: ohne
 * "externally_connectable" im Manifest nimmt Chrome ihre Nachrichten
 * gar nicht erst an.
 */
function fromExtensionPage(sender) {
	const prefix = chrome.runtime.getURL("");
	return !!(sender && sender.url && sender.url.startsWith(prefix));
}

function withoutSecrets(settings) {
	const copy = { ...settings };
	for (const field of SECRET_FIELDS) {
		copy[field] = settings[field] ? "\u2022".repeat(8) : "";
	}
	return copy;
}

const handlers = {
	async status() {
		return getStatus();
	},

	async openOptions() {
		await chrome.runtime.openOptionsPage();
		return {};
	},

	async getSettings(message, sender) {
		const settings = await getSettings();
		return {
			settings: fromExtensionPage(sender) ? settings : withoutSecrets(settings),
			defaults: DEFAULT_SETTINGS
		};
	},

	async setSettings({ patch }, sender) {
		if (!fromExtensionPage(sender)) {
			throw new Error("Einstellungen lassen sich nur auf der Optionsseite ändern.");
		}
		return { settings: await setSettings(patch) };
	},

	async search({ query, collectionKey, limit, mode }) {
		const settings = await getSettings();
		// Ohne ausdruecklichen Wunsch gilt die Voreinstellung aus den Optionen.
		const searchMode = mode || settings.searchMode;
		return withFallback("search", { query, collectionKey, limit, mode: searchMode });
	},

	async collections() {
		return withFallback("collections", {});
	},

	async styles() {
		return withFallback("styles", {});
	},

	async item({ key }) {
		return loadItem(key);
	},

	async compose({ action, keys }) {
		const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
		if (!list.length) {
			throw new Error("Es ist kein Eintrag ausgewählt.");
		}
		const text = list.length === 1
			? await composeSingle(action, list[0])
			: await composeMultiple(action, list);
		return { text };
	}
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const handler = handlers[message && message.type];

	if (!handler) {
		sendResponse({ ok: false, error: `Unbekannte Anfrage: ${message && message.type}` });
		return false;
	}

	handler(message, sender)
		.then(result => sendResponse({ ok: true, ...result }))
		.catch((error) => {
			console.error("[Zotero für Claude]", error);
			sendResponse({
				ok: false,
				error: error && error.message ? error.message : String(error),
				kind: error && error.kind ? error.kind : "error"
			});
		});

	// true hält den Kanal offen, bis die Antwort da ist.
	return true;
});
