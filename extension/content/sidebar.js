/**
 * Inhaltsskript für claude.ai.
 *
 * Blendet eine Seitenleiste ein, über die die Zotero-Bibliothek durchsucht
 * wird, und fügt den gewählten Text in das Eingabefeld von Claude ein.
 * Die Oberfläche steckt in einem Shadow DOM, damit sich die Stile von
 * claude.ai und der Erweiterung nicht gegenseitig stören.
 */

(function () {
	"use strict";

	if (window.__zoteroForClaudeLoaded) {
		return;
	}
	window.__zoteroForClaudeLoaded = true;

	const SEARCH_DEBOUNCE_MS = 300;

	const ITEM_ACTIONS = [
		{ id: "citation", label: "Zitat", title: "Kurzbeleg und Literaturangabe" },
		{ id: "reference", label: "Literaturangabe", title: "Vollständiger Eintrag im gewählten Zitierstil" },
		{ id: "summary", label: "Kurzinfo", title: "Alle Metadaten und das Abstract" },
		{ id: "abstract", label: "Abstract", title: "Nur die Zusammenfassung" },
		{ id: "notes", label: "Notizen", title: "Deine Notizen zu diesem Eintrag" },
		{ id: "annotations", label: "Anmerkungen", title: "Markierungen und Kommentare aus dem PDF" },
		{ id: "fulltext", label: "Volltext", title: "Text des PDFs (gekürzt nach Einstellung)" },
		{ id: "bibtex", label: "BibTeX", title: "BibTeX-Eintrag" },
		{ id: "all", label: "Alles", title: "Kurzinfo, Notizen, Anmerkungen und Volltext" }
	];

	const BULK_ACTIONS = [
		{ id: "bibliography", label: "Literaturverzeichnis" },
		{ id: "summary", label: "Kurzinfos" },
		{ id: "bibtex", label: "BibTeX" }
	];

	const state = {
		open: false,
		query: "",
		collectionKey: "",
		results: [],
		selected: new Set(),
		expanded: null,
		busy: false,
		status: null
	};

	let root = null;
	let elements = {};
	let searchTimer = null;

	/* ----------------------------------------------------------------- *
	 * Kommunikation mit dem Hintergrunddienst
	 * ----------------------------------------------------------------- */

	function send(message) {
		return new Promise((resolve) => {
			try {
				chrome.runtime.sendMessage(message, (response) => {
					if (chrome.runtime.lastError) {
						resolve({
							ok: false,
							error: "Die Erweiterung wurde neu geladen. Bitte die Seite aktualisieren."
						});
						return;
					}
					resolve(response || { ok: false, error: "Keine Antwort erhalten." });
				});
			}
			catch (e) {
				resolve({ ok: false, error: "Die Erweiterung ist nicht erreichbar." });
			}
		});
	}

	/* ----------------------------------------------------------------- *
	 * Text in das Eingabefeld von Claude einfügen
	 * ----------------------------------------------------------------- */

	function findComposer() {
		const candidates = [
			'div[contenteditable="true"].ProseMirror',
			'div.ProseMirror[contenteditable="true"]',
			'[data-testid="chat-input"] div[contenteditable="true"]',
			'div[contenteditable="true"]'
		];
		for (const selector of candidates) {
			const element = document.querySelector(selector);
			if (element && element.isConnected) {
				return element;
			}
		}
		return null;
	}

	function placeCaretAtEnd(element) {
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(element);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	function insertIntoComposer(text) {
		const composer = findComposer();
		if (!composer) {
			return false;
		}

		composer.focus();
		placeCaretAtEnd(composer);

		const payload = text.endsWith("\n") ? text : text + "\n";

		// Ein Paste-Ereignis ist der zuverlässigste Weg: der Editor von
		// Claude (ProseMirror) verarbeitet damit auch Zeilenumbrüche korrekt.
		try {
			const transfer = new DataTransfer();
			transfer.setData("text/plain", payload);
			const event = new ClipboardEvent("paste", {
				clipboardData: transfer,
				bubbles: true,
				cancelable: true
			});
			const notHandled = composer.dispatchEvent(event);
			if (!notHandled) {
				return true;
			}
		}
		catch (e) {
			// Fällt unten auf execCommand zurück
		}

		try {
			if (document.execCommand("insertText", false, payload)) {
				return true;
			}
		}
		catch (e) {
			// weiter zum letzten Versuch
		}

		composer.dispatchEvent(new InputEvent("beforeinput", {
			inputType: "insertText",
			data: payload,
			bubbles: true,
			cancelable: true
		}));
		return !!findComposer();
	}

	async function copyToClipboard(text) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		}
		catch (e) {
			return false;
		}
	}

	/* ----------------------------------------------------------------- *
	 * Oberfläche
	 * ----------------------------------------------------------------- */

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) {
			node.className = className;
		}
		if (text !== undefined) {
			node.textContent = text;
		}
		return node;
	}

	function buildUI() {
		const host = document.createElement("div");
		host.id = "zotero-for-claude-host";
		host.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
		document.documentElement.appendChild(host);

		root = host.attachShadow({ mode: "open" });

		const stylesheet = document.createElement("link");
		stylesheet.rel = "stylesheet";
		stylesheet.href = chrome.runtime.getURL("content/sidebar.css");
		root.appendChild(stylesheet);

		const launcher = el("button", "zfc-launcher");
		launcher.type = "button";
		launcher.title = "Zotero-Bibliothek durchsuchen (Alt+Z)";
		launcher.appendChild(el("span", "zfc-launcher-mark", "Z"));
		launcher.appendChild(el("span", "zfc-launcher-label", "Zotero"));
		launcher.addEventListener("click", togglePanel);
		root.appendChild(launcher);

		const panel = el("aside", "zfc-panel");
		panel.setAttribute("aria-hidden", "true");

		const header = el("header", "zfc-header");
		const heading = el("div", "zfc-heading");
		heading.appendChild(el("span", "zfc-mark", "Z"));
		heading.appendChild(el("span", "zfc-title", "Zotero"));
		header.appendChild(heading);

		const headerActions = el("div", "zfc-header-actions");
		const settingsButton = el("button", "zfc-icon-button", "⚙");
		settingsButton.type = "button";
		settingsButton.title = "Einstellungen";
		settingsButton.addEventListener("click", () => send({ type: "openOptions" }));
		headerActions.appendChild(settingsButton);

		const closeButton = el("button", "zfc-icon-button", "×");
		closeButton.type = "button";
		closeButton.title = "Schließen";
		closeButton.addEventListener("click", togglePanel);
		headerActions.appendChild(closeButton);
		header.appendChild(headerActions);
		panel.appendChild(header);

		const statusBar = el("div", "zfc-status");
		panel.appendChild(statusBar);

		const searchRow = el("div", "zfc-search");
		const input = el("input", "zfc-input");
		input.type = "search";
		input.placeholder = "Titel, Autor:in oder Jahr suchen …";
		input.addEventListener("input", () => {
			state.query = input.value;
			scheduleSearch();
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				runSearch();
			}
			else if (event.key === "Escape") {
				togglePanel();
			}
			// Verhindert, dass claude.ai auf Tastendrücke im Suchfeld reagiert
			event.stopPropagation();
		});
		searchRow.appendChild(input);

		const collectionSelect = el("select", "zfc-select");
		collectionSelect.addEventListener("change", () => {
			state.collectionKey = collectionSelect.value;
			runSearch();
		});
		searchRow.appendChild(collectionSelect);
		panel.appendChild(searchRow);

		const results = el("div", "zfc-results");
		panel.appendChild(results);

		const footer = el("footer", "zfc-footer");
		panel.appendChild(footer);

		const toast = el("div", "zfc-toast");
		panel.appendChild(toast);

		root.appendChild(panel);

		elements = {
			host, launcher, panel, statusBar, input, collectionSelect, results, footer, toast
		};
	}

	function showToast(message, kind = "info") {
		const toast = elements.toast;
		toast.textContent = message;
		toast.className = `zfc-toast zfc-toast-${kind} zfc-toast-visible`;
		clearTimeout(toast._timer);
		toast._timer = setTimeout(() => {
			toast.className = "zfc-toast";
		}, 4500);
	}

	function renderStatus() {
		const bar = elements.statusBar;
		bar.textContent = "";
		bar.className = "zfc-status";

		if (!state.status) {
			bar.classList.add("zfc-status-neutral");
			bar.textContent = "Verbindung wird geprüft …";
			return;
		}

		const { local, web } = state.status;

		if (local.connected && local.tokenValid) {
			bar.classList.add("zfc-status-ok");
			bar.textContent = `Mit Zotero verbunden (Version ${local.zoteroVersion || "?"})`;
			return;
		}

		if (web.connected) {
			bar.classList.add("zfc-status-warn");
			bar.textContent = "Zotero läuft nicht – benutze zotero.org (eingeschränkt)";
			return;
		}

		bar.classList.add("zfc-status-error");
		const message = local.message || "Keine Verbindung zu Zotero.";
		bar.appendChild(el("span", null, message + " "));

		const link = el("button", "zfc-link", "Einstellungen öffnen");
		link.type = "button";
		link.addEventListener("click", () => send({ type: "openOptions" }));
		bar.appendChild(link);
	}

	function renderCollections(collections) {
		const select = elements.collectionSelect;
		select.textContent = "";

		const all = document.createElement("option");
		all.value = "";
		all.textContent = "Ganze Bibliothek";
		select.appendChild(all);

		for (const collection of collections) {
			const option = document.createElement("option");
			option.value = collection.key;
			option.textContent = " ".repeat((collection.level || 0) * 2) + collection.name;
			select.appendChild(option);
		}
		select.value = state.collectionKey;
	}

	function itemSubtitle(item) {
		return [item.authorString, item.year, item.publication]
			.filter(Boolean)
			.join(" · ");
	}

	function renderResults() {
		const container = elements.results;
		container.textContent = "";

		if (state.busy) {
			container.appendChild(el("div", "zfc-placeholder", "Suche läuft …"));
			return;
		}

		if (!state.results.length) {
			container.appendChild(el("div", "zfc-placeholder",
				state.query
					? "Keine Treffer. Andere Schreibweise versuchen?"
					: "Suchbegriff eingeben – oder leer lassen für die zuletzt geänderten Einträge."));
			return;
		}

		for (const item of state.results) {
			container.appendChild(renderItemCard(item));
		}
	}

	function renderItemCard(item) {
		const card = el("article", "zfc-card");
		if (state.expanded === item.key) {
			card.classList.add("zfc-card-expanded");
		}

		const top = el("div", "zfc-card-top");

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "zfc-checkbox";
		checkbox.checked = state.selected.has(item.key);
		checkbox.title = "Für Sammelaktion auswählen";
		checkbox.addEventListener("click", event => event.stopPropagation());
		checkbox.addEventListener("change", () => {
			if (checkbox.checked) {
				state.selected.add(item.key);
			}
			else {
				state.selected.delete(item.key);
			}
			renderFooter();
		});
		top.appendChild(checkbox);

		const main = el("div", "zfc-card-main");
		main.appendChild(el("h3", "zfc-card-title", item.title || "Ohne Titel"));
		main.appendChild(el("p", "zfc-card-subtitle", itemSubtitle(item)));

		const badges = el("div", "zfc-badges");
		if (item.hasPDF) {
			badges.appendChild(el("span", "zfc-badge", "PDF"));
		}
		if (item.numNotes) {
			badges.appendChild(el("span", "zfc-badge", `${item.numNotes} Notiz(en)`));
		}
		if (item.numAnnotations) {
			badges.appendChild(el("span", "zfc-badge", `${item.numAnnotations} Anmerkung(en)`));
		}
		if (badges.children.length) {
			main.appendChild(badges);
		}
		top.appendChild(main);

		top.addEventListener("click", () => {
			state.expanded = state.expanded === item.key ? null : item.key;
			renderResults();
		});
		card.appendChild(top);

		if (state.expanded === item.key) {
			const actions = el("div", "zfc-actions");
			for (const action of ITEM_ACTIONS) {
				const button = el("button", "zfc-chip", action.label);
				button.type = "button";
				button.title = action.title;
				button.addEventListener("click", (event) => {
					event.stopPropagation();
					runAction(action.id, [item.key], button);
				});
				actions.appendChild(button);
			}
			card.appendChild(actions);
		}

		return card;
	}

	function renderFooter() {
		const footer = elements.footer;
		footer.textContent = "";

		if (!state.selected.size) {
			footer.className = "zfc-footer";
			return;
		}

		footer.className = "zfc-footer zfc-footer-visible";
		footer.appendChild(el("span", "zfc-footer-count", `${state.selected.size} ausgewählt`));

		const actions = el("div", "zfc-footer-actions");
		for (const action of BULK_ACTIONS) {
			const button = el("button", "zfc-chip", action.label);
			button.type = "button";
			button.addEventListener("click", () => {
				runAction(action.id, Array.from(state.selected), button);
			});
			actions.appendChild(button);
		}

		const clear = el("button", "zfc-link", "Auswahl leeren");
		clear.type = "button";
		clear.addEventListener("click", () => {
			state.selected.clear();
			renderResults();
			renderFooter();
		});
		actions.appendChild(clear);
		footer.appendChild(actions);
	}

	/* ----------------------------------------------------------------- *
	 * Abläufe
	 * ----------------------------------------------------------------- */

	function scheduleSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
	}

	async function runSearch() {
		clearTimeout(searchTimer);
		state.busy = true;
		renderResults();

		const response = await send({
			type: "search",
			query: state.query,
			collectionKey: state.collectionKey,
			limit: 25
		});

		state.busy = false;

		if (!response.ok) {
			state.results = [];
			renderResults();
			showToast(response.error, "error");
			refreshStatus();
			return;
		}

		state.results = response.items || [];
		state.expanded = state.results.length === 1 ? state.results[0].key : state.expanded;
		renderResults();
	}

	async function runAction(action, keys, button) {
		const originalLabel = button ? button.textContent : "";
		if (button) {
			button.disabled = true;
			button.textContent = "…";
		}

		const response = await send({ type: "compose", action, keys });

		if (button) {
			button.disabled = false;
			button.textContent = originalLabel;
		}

		if (!response.ok) {
			showToast(response.error, "error");
			return;
		}

		if (insertIntoComposer(response.text)) {
			showToast("In den Chat eingefügt.", "ok");
			return;
		}

		const copied = await copyToClipboard(response.text);
		showToast(
			copied
				? "Eingabefeld nicht gefunden – Text in die Zwischenablage kopiert."
				: "Eingabefeld nicht gefunden und Kopieren fehlgeschlagen.",
			copied ? "warn" : "error"
		);
	}

	async function refreshStatus() {
		const response = await send({ type: "status" });
		state.status = response.ok ? response : null;
		renderStatus();

		if (response.ok && (response.local.connected || response.web.connected)) {
			const collections = await send({ type: "collections" });
			if (collections.ok) {
				renderCollections(collections.collections || []);
			}
		}
	}

	function togglePanel() {
		state.open = !state.open;
		elements.panel.classList.toggle("zfc-panel-open", state.open);
		elements.panel.setAttribute("aria-hidden", String(!state.open));
		elements.launcher.classList.toggle("zfc-launcher-hidden", state.open);

		if (state.open) {
			refreshStatus();
			if (!state.results.length) {
				runSearch();
			}
			setTimeout(() => elements.input.focus(), 50);
		}
	}

	/* ----------------------------------------------------------------- *
	 * Start
	 * ----------------------------------------------------------------- */

	function init() {
		buildUI();
		renderStatus();
		renderResults();
		renderFooter();

		document.addEventListener("keydown", (event) => {
			if (event.altKey && !event.ctrlKey && !event.metaKey
				&& (event.key === "z" || event.key === "Z")) {
				event.preventDefault();
				togglePanel();
			}
			if (event.key === "Escape" && state.open) {
				togglePanel();
			}
		});

		chrome.runtime.onMessage.addListener((message) => {
			if (message && message.type === "togglePanel") {
				togglePanel();
			}
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	}
	else {
		init();
	}
})();
