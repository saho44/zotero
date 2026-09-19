/**
 * Zentrale Verwaltung der Einstellungen. Wird vom Hintergrunddienst,
 * der Optionsseite und dem Popup benutzt.
 */

export const DEFAULT_SETTINGS = {
	// Verbindung zum lokalen Zotero
	token: "",
	port: 23119,

	// Zitierstil
	style: "http://www.zotero.org/styles/apa",
	locale: "de-DE",

	// Wie viel PDF-Text maximal eingefügt wird
	fulltextChars: 20000,

	// Online-Reserve über zotero.org, falls Zotero nicht läuft
	useWebFallback: false,
	webApiKey: "",
	webUserID: "",

	// Standardaktion beim Klick auf einen Treffer
	defaultAction: "citation"
};

export async function getSettings() {
	const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
	return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(patch) {
	await chrome.storage.local.set(patch);
	return getSettings();
}
