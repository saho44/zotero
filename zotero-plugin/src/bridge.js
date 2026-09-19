/**
 * Zotero Claude Bridge - HTTP-Schnittstelle und Fensterintegration
 *
 * Zotero betreibt bereits einen lokalen HTTP-Server auf Port 23119 (den
 * benutzt der Zotero Connector). Hier haengen wir zusaetzliche Endpunkte
 * unter /claude/ ein. Jeder Endpunkt ausser /claude/ping verlangt ein
 * Token, damit nicht jede beliebige Webseite die Bibliothek auslesen kann.
 */

var ZoteroClaude = {
	id: null,
	version: null,
	rootURI: null,
	initialized: false,

	PREF_TOKEN: "extensions.zotero.claudebridge.token",
	PREF_ENABLED: "extensions.zotero.claudebridge.enabled",

	ENDPOINT_PREFIX: "/claude/",

	/** Endpunkt -> Handler. Handler bekommen die geparsten Request-Daten. */
	ROUTES: {
		"ping": { auth: false, handler: null },
		"search": { auth: true, handler: "search" },
		"recent": { auth: true, handler: "recent" },
		"item": { auth: true, handler: "itemDetail" },
		"fulltext": { auth: true, handler: "fullText" },
		"notes": { auth: true, handler: "notes" },
		"annotations": { auth: true, handler: "annotations" },
		"citation": { auth: true, handler: "citations" },
		"export": { auth: true, handler: "export" },
		"styles": { auth: true, handler: "styles" },
		"translators": { auth: true, handler: "translators" },
		"collections": { auth: true, handler: "collections" },
		"libraries": { auth: true, handler: "libraries" }
	},

	init: function ({ id, version, rootURI }) {
		if (this.initialized) {
			return;
		}
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		this.initialized = true;

		// Beim ersten Start ein Token erzeugen, damit der Nutzer es
		// sofort im Dialog kopieren kann.
		this.getToken();
		this.registerEndpoints();

		Zotero.debug("Zotero Claude Bridge: Endpunkte registriert");
	},

	shutdown: function () {
		this.unregisterEndpoints();
		this.initialized = false;
	},

	/* ----------------------------------------------------------------- *
	 * Token
	 * ----------------------------------------------------------------- */

	getToken: function () {
		let token = "";
		try {
			token = Zotero.Prefs.get(this.PREF_TOKEN, true) || "";
		}
		catch (e) {
			token = "";
		}
		if (!token) {
			token = this.regenerateToken();
		}
		return token;
	},

	regenerateToken: function () {
		let token = Zotero.Utilities.randomString(40);
		Zotero.Prefs.set(this.PREF_TOKEN, token, true);
		return token;
	},

	isEnabled: function () {
		try {
			let value = Zotero.Prefs.get(this.PREF_ENABLED, true);
			return value === undefined || value === null ? true : !!value;
		}
		catch (e) {
			return true;
		}
	},

	setEnabled: function (enabled) {
		Zotero.Prefs.set(this.PREF_ENABLED, !!enabled, true);
	},

	/**
	 * Zeitkonstanter Vergleich, damit das Token nicht zeichenweise
	 * erraten werden kann.
	 */
	_tokenMatches: function (candidate) {
		let expected = this.getToken();
		if (typeof candidate !== "string" || candidate.length !== expected.length) {
			return false;
		}
		let diff = 0;
		for (let i = 0; i < expected.length; i++) {
			diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
		}
		return diff === 0;
	},

	_tokenFromRequest: function (requestData) {
		let headers = requestData.headers || {};
		for (let name of Object.keys(headers)) {
			if (name.toLowerCase() === "x-zotero-claude-token") {
				return String(headers[name] || "");
			}
		}
		let query = this._query(requestData);
		if (query.token) {
			return String(query.token);
		}
		if (requestData.data && typeof requestData.data === "object" && requestData.data.token) {
			return String(requestData.data.token);
		}
		return "";
	},

	/* ----------------------------------------------------------------- *
	 * HTTP-Endpunkte
	 * ----------------------------------------------------------------- */

	registerEndpoints: function () {
		if (!Zotero.Server || !Zotero.Server.Endpoints) {
			Zotero.logError(new Error(
				"Zotero Claude Bridge: Der lokale Zotero-Server ist deaktiviert. "
				+ "Bitte unter Einstellungen -> Erweitert die Option zur Kommunikation "
				+ "mit anderen Programmen aktivieren."
			));
			return;
		}

		for (let name of Object.keys(this.ROUTES)) {
			this._registerEndpoint(name, this.ROUTES[name]);
		}
	},

	unregisterEndpoints: function () {
		if (!Zotero.Server || !Zotero.Server.Endpoints) {
			return;
		}
		for (let name of Object.keys(this.ROUTES)) {
			delete Zotero.Server.Endpoints[this.ENDPOINT_PREFIX + name];
		}
	},

	_registerEndpoint: function (name, route) {
		let bridge = this;
		let path = this.ENDPOINT_PREFIX + name;

		let Endpoint = function () {};
		Endpoint.prototype = {
			supportedMethods: ["GET", "POST", "OPTIONS"],
			supportedDataTypes: ["application/json"],
			permitBookmarklet: false,

			init: async function (requestData) {
				return bridge.handleRequest(name, route, requestData);
			}
		};

		Zotero.Server.Endpoints[path] = Endpoint;
	},

	handleRequest: async function (name, route, requestData) {
		try {
			if (requestData.method === "OPTIONS") {
				return [200, "text/plain", ""];
			}

			if (name === "ping") {
				return this._json(200, {
					ok: true,
					plugin: "zotero-claude-bridge",
					version: this.version,
					zoteroVersion: Zotero.version,
					enabled: this.isEnabled(),
					// Der Client kann so pruefen, ob sein Token noch passt,
					// ohne dass wir das Token selbst preisgeben.
					tokenValid: this._tokenMatches(this._tokenFromRequest(requestData))
				});
			}

			if (!this.isEnabled()) {
				return this._json(403, {
					ok: false,
					error: "Die Claude-Verbindung ist in Zotero deaktiviert."
				});
			}

			if (route.auth && !this._tokenMatches(this._tokenFromRequest(requestData))) {
				return this._json(401, {
					ok: false,
					error: "Ungueltiges oder fehlendes Token. Bitte in Zotero unter "
						+ "Werkzeuge -> Claude-Verbindung das Token kopieren und in der "
						+ "Browser-Erweiterung eintragen."
				});
			}

			let params = this._params(requestData);
			let result = await ZoteroClaudeAPI[route.handler](params);
			return this._json(200, Object.assign({ ok: true }, result));
		}
		catch (e) {
			Zotero.logError(e);
			return this._json(400, {
				ok: false,
				error: (e && e.message) ? e.message : String(e)
			});
		}
	},

	/**
	 * GET-Parameter und JSON-Body auf ein gemeinsames Objekt abbilden,
	 * damit die API-Funktionen nicht zwischen beidem unterscheiden muessen.
	 */
	_params: function (requestData) {
		let params = {};
		let query = this._query(requestData);

		for (let key of Object.keys(query)) {
			if (key === "token") {
				continue;
			}
			if (key === "keys") {
				params.keys = String(query[key]).split(",").map(k => k.trim()).filter(Boolean);
			}
			else {
				params[key] = query[key];
			}
		}

		if (requestData.data && typeof requestData.data === "object") {
			for (let key of Object.keys(requestData.data)) {
				if (key === "token") {
					continue;
				}
				params[key] = requestData.data[key];
			}
		}

		return params;
	},

	/**
	 * Zotero liefert die Query je nach Version als einfaches Objekt oder als
	 * URLSearchParams. Beides auf ein Objekt normalisieren.
	 */
	_query: function (requestData) {
		let query = {};
		let raw = requestData.query || requestData.searchParams;
		if (!raw) {
			return query;
		}
		if (typeof raw.forEach === "function" && typeof raw.get === "function") {
			raw.forEach((value, key) => {
				query[key] = value;
			});
			return query;
		}
		for (let key of Object.keys(raw)) {
			query[key] = raw[key];
		}
		return query;
	},

	_json: function (status, body) {
		return [status, "application/json", JSON.stringify(body)];
	},

	/* ----------------------------------------------------------------- *
	 * Menuepunkt in den Zotero-Fenstern
	 * ----------------------------------------------------------------- */

	addToWindow: function (win) {
		let doc = win.document;
		if (!doc || doc.getElementById("zoteroclaude-tools-menuitem")) {
			return;
		}
		let toolsPopup = doc.getElementById("menu_ToolsPopup");
		if (!toolsPopup) {
			return;
		}

		let menuitem = doc.createXULElement("menuitem");
		menuitem.id = "zoteroclaude-tools-menuitem";
		menuitem.setAttribute("label", "Claude-Verbindung …");
		menuitem.addEventListener("command", () => this.openConnectionDialog(win));
		toolsPopup.appendChild(menuitem);
	},

	removeFromWindow: function (win) {
		let doc = win.document;
		if (!doc) {
			return;
		}
		let menuitem = doc.getElementById("zoteroclaude-tools-menuitem");
		if (menuitem) {
			menuitem.remove();
		}
	},

	addToAllWindows: function () {
		for (let win of Zotero.getMainWindows()) {
			if (win.ZoteroPane) {
				this.addToWindow(win);
			}
		}
	},

	removeFromAllWindows: function () {
		for (let win of Zotero.getMainWindows()) {
			if (win.ZoteroPane) {
				this.removeFromWindow(win);
			}
		}
	},

	openConnectionDialog: function (win) {
		win.openDialog(
			"chrome://zoteroclaude/content/connection.xhtml",
			"zoteroclaude-connection",
			"chrome,centerscreen,resizable=yes",
			{ Zotero: Zotero, ZoteroClaude: this }
		);
	}
};
