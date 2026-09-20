/**
 * Optionsseite. Spricht ausschließlich über den Hintergrunddienst mit
 * Zotero, damit die Fehlerbehandlung an einer Stelle liegt.
 */

const FIELDS = [
	["token", "value"],
	["port", "valueAsNumber"],
	["searchMode", "value"],
	["style", "value"],
	["locale", "value"],
	["fulltextChars", "valueAsNumber"],
	["useWebFallback", "checked"],
	["webUserID", "value"],
	["webApiKey", "value"]
];

function $(id) {
	return document.getElementById(id);
}

function send(message) {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage(message, (response) => {
			if (chrome.runtime.lastError) {
				resolve({ ok: false, error: chrome.runtime.lastError.message });
				return;
			}
			resolve(response || { ok: false, error: "Keine Antwort erhalten." });
		});
	});
}

function setStatus(id, text, kind = "") {
	const element = $(id);
	element.textContent = text;
	element.className = kind ? `status status-${kind}` : "status";
}

function fillStyleSelect(styles, current) {
	const select = $("style");
	select.textContent = "";

	const list = styles && styles.length
		? styles
		: [
			{ id: "http://www.zotero.org/styles/apa", title: "APA (Voreinstellung)" },
			{ id: "http://www.zotero.org/styles/din-1505-2", title: "DIN 1505-2" },
			{ id: "http://www.zotero.org/styles/chicago-note-bibliography", title: "Chicago" },
			{ id: "http://www.zotero.org/styles/ieee", title: "IEEE" },
			{ id: "http://www.zotero.org/styles/mla", title: "MLA" }
		];

	for (const style of list) {
		const option = document.createElement("option");
		option.value = style.id;
		option.textContent = style.title;
		select.appendChild(option);
	}

	// Ein gespeicherter Stil, den Zotero nicht (mehr) kennt, geht sonst
	// beim nächsten Speichern verloren.
	if (current && !list.some(style => style.id === current)) {
		const option = document.createElement("option");
		option.value = current;
		option.textContent = `${current} (nicht installiert)`;
		select.appendChild(option);
	}

	select.value = current;
}

async function loadSettings() {
	const response = await send({ type: "getSettings" });
	if (!response.ok) {
		setStatus("save-status", response.error, "error");
		return null;
	}

	const settings = response.settings;
	for (const [id, prop] of FIELDS) {
		if (id === "style") {
			continue;
		}
		$(id)[prop] = settings[id];
	}

	const styles = await send({ type: "styles" });
	fillStyleSelect(styles.ok ? styles.styles : null, settings.style);
	if (!styles.ok) {
		$("style-hint").textContent =
			"Zotero ist gerade nicht erreichbar – es wird eine kleine Standardauswahl gezeigt.";
	}

	return settings;
}

async function save() {
	const patch = {};
	for (const [id, prop] of FIELDS) {
		let value = $(id)[prop];
		if (prop === "valueAsNumber" && (Number.isNaN(value) || value <= 0)) {
			value = id === "port" ? 23119 : 20000;
		}
		if (typeof value === "string") {
			value = value.trim();
		}
		patch[id] = value;
	}

	const response = await send({ type: "setSettings", patch });
	if (!response.ok) {
		setStatus("save-status", response.error, "error");
		return;
	}
	setStatus("save-status", "Gespeichert.", "ok");
	setTimeout(() => setStatus("save-status", ""), 3000);
}

async function testLocal() {
	$("test").disabled = true;
	setStatus("test-status", "Prüfe …");

	await save();
	const response = await send({ type: "status" });
	$("test").disabled = false;

	if (!response.ok) {
		setStatus("test-status", response.error, "error");
		return;
	}

	const local = response.local;
	if (!local.connected) {
		setStatus("test-status", local.message || "Zotero antwortet nicht.", "error");
		return;
	}
	if (!local.tokenValid) {
		setStatus("test-status", local.message || "Das Token passt nicht.", "error");
		return;
	}
	setStatus(
		"test-status",
		`Verbunden mit Zotero ${local.zoteroVersion || ""} (Plugin ${local.version || "?"}).`.trim(),
		"ok"
	);
}

async function testWeb() {
	$("test-web").disabled = true;
	setStatus("test-web-status", "Prüfe …");

	await save();
	const response = await send({ type: "status" });
	$("test-web").disabled = false;

	if (!response.ok) {
		setStatus("test-web-status", response.error, "error");
		return;
	}
	if (!response.web.configured) {
		setStatus("test-web-status",
			"Bitte Haken setzen und Benutzer-ID sowie Schlüssel eintragen.", "warn");
		return;
	}
	if (!response.web.connected) {
		setStatus("test-web-status", response.web.message || "Kein Zugriff.", "error");
		return;
	}
	setStatus("test-web-status", "Online-Zugang funktioniert.", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
	loadSettings();
	$("save").addEventListener("click", save);
	$("test").addEventListener("click", testLocal);
	$("test-web").addEventListener("click", testWeb);
});
