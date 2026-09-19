/**
 * Zugriff auf das lokal laufende Zotero über das Plugin "Zotero Claude Bridge".
 *
 * Die Anfragen laufen bewusst hier im Hintergrunddienst und nicht im
 * Inhaltsskript: Erweiterungen dürfen mit host_permissions direkt auf
 * 127.0.0.1 zugreifen, eine normale Webseite darf das nicht.
 */

import { getSettings } from "./settings.js";

const TIMEOUT_MS = 30000;

export class ZoteroError extends Error {
	constructor(message, { status = 0, kind = "error" } = {}) {
		super(message);
		this.name = "ZoteroError";
		this.status = status;
		this.kind = kind;
	}
}

function baseURL(port) {
	return `http://127.0.0.1:${port}/claude`;
}

async function request(path, { method = "POST", body = null, settings = null, requireToken = true } = {}) {
	const config = settings || (await getSettings());

	if (requireToken && !config.token) {
		throw new ZoteroError(
			"Es ist kein Verbindungs-Token hinterlegt. Öffne die Einstellungen der Erweiterung "
			+ "und trage das Token aus Zotero (Werkzeuge → Claude-Verbindung) ein.",
			{ kind: "no-token" }
		);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	let response;
	try {
		response = await fetch(baseURL(config.port) + path, {
			method,
			headers: {
				"Content-Type": "application/json",
				"X-Zotero-Claude-Token": config.token
			},
			body: method === "GET" ? undefined : JSON.stringify(body || {}),
			signal: controller.signal
		});
	}
	catch (e) {
		throw new ZoteroError(
			"Zotero ist nicht erreichbar. Läuft das Programm und ist das Plugin installiert?",
			{ kind: "offline" }
		);
	}
	finally {
		clearTimeout(timer);
	}

	let payload;
	try {
		payload = await response.json();
	}
	catch (e) {
		throw new ZoteroError(
			`Unerwartete Antwort von Zotero (HTTP ${response.status}). Ist das Plugin "Zotero Claude Bridge" installiert?`,
			{ status: response.status, kind: "bad-response" }
		);
	}

	if (!response.ok || payload.ok === false) {
		throw new ZoteroError(
			payload.error || `Zotero meldet einen Fehler (HTTP ${response.status}).`,
			{ status: response.status, kind: response.status === 401 ? "bad-token" : "error" }
		);
	}

	return payload;
}

export const local = {
	async ping(settings) {
		return request("/ping", { method: "POST", body: {}, settings, requireToken: false });
	},

	async search({ query, collectionKey, limit, mode }) {
		return request("/search", { body: { query, collectionKey, limit, mode } });
	},

	async recent({ limit }) {
		return request("/recent", { body: { limit } });
	},

	async item({ key }) {
		return request("/item", { body: { key } });
	},

	async fulltext({ key, maxChars }) {
		return request("/fulltext", { body: { key, maxChars } });
	},

	async notes({ key }) {
		return request("/notes", { body: { key } });
	},

	async annotations({ key }) {
		return request("/annotations", { body: { key } });
	},

	async citation({ keys, style, locale, format }) {
		return request("/citation", { body: { keys, style, locale, format } });
	},

	async exportItems({ keys, translator }) {
		return request("/export", { body: { keys, translator } });
	},

	async collections() {
		return request("/collections", { body: {} });
	},

	async styles() {
		return request("/styles", { body: {} });
	}
};
