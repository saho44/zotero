/**
 * Dialog "Werkzeuge -> Claude-Verbindung".
 * Zeigt das Token und den Status des lokalen Zotero-Servers.
 */

var ZoteroClaudeDialog = {
	Zotero: null,
	bridge: null,

	load: function () {
		let args = window.arguments && window.arguments[0] ? window.arguments[0] : {};
		this.Zotero = args.Zotero;
		this.bridge = args.ZoteroClaude;

		if (!this.bridge) {
			document.getElementById("status-text").textContent =
				"Das Plugin ist nicht korrekt geladen. Bitte Zotero neu starten.";
			return;
		}

		document.getElementById("token-field").value = this.bridge.getToken();
		document.getElementById("enabled-checkbox").checked = this.bridge.isEnabled();
		this.refreshStatus();
	},

	refreshStatus: function () {
		let Zotero = this.Zotero;
		let lines = [];
		let port = 23119;

		try {
			port = Zotero.Prefs.get("httpServer.port") || 23119;
		}
		catch (e) {
			port = 23119;
		}

		let serverRunning = !!(Zotero.Server && Zotero.Server.Endpoints);
		lines.push(serverRunning
			? "Lokaler Zotero-Server: laeuft auf Port " + port
			: "Lokaler Zotero-Server: AUS. Bitte in den Zotero-Einstellungen unter "
				+ "„Erweitert“ die Kommunikation mit anderen Programmen aktivieren.");

		let registered = serverRunning && !!Zotero.Server.Endpoints["/claude/ping"];
		lines.push("Claude-Endpunkte: " + (registered ? "registriert" : "nicht registriert"));
		lines.push("Testadresse: http://127.0.0.1:" + port + "/claude/ping");

		let container = document.getElementById("status-text");
		container.textContent = "";
		for (let line of lines) {
			let div = document.createElement("div");
			div.textContent = line;
			container.appendChild(div);
		}
	},

	copyToken: function () {
		let token = document.getElementById("token-field").value;
		try {
			this.Zotero.Utilities.Internal.copyTextToClipboard(token);
			this.setCopyStatus("In die Zwischenablage kopiert.");
		}
		catch (e) {
			let field = document.getElementById("token-field");
			field.select();
			this.setCopyStatus("Bitte mit Strg+C kopieren.");
		}
	},

	setCopyStatus: function (text) {
		let status = document.getElementById("copy-status");
		status.textContent = text;
		window.setTimeout(() => {
			status.textContent = "";
		}, 4000);
	},

	regenerate: function () {
		let message = "Das alte Token wird ungueltig. Du musst das neue Token danach "
			+ "in der Browser-Erweiterung eintragen. Fortfahren?";
		let confirmed;
		try {
			confirmed = Services.prompt.confirm(window, "Neues Token erzeugen", message);
		}
		catch (e) {
			confirmed = window.confirm(message);
		}
		if (!confirmed) {
			return;
		}
		document.getElementById("token-field").value = this.bridge.regenerateToken();
		this.setCopyStatus("Neues Token erzeugt.");
	},

	toggleEnabled: function () {
		this.bridge.setEnabled(document.getElementById("enabled-checkbox").checked);
		this.refreshStatus();
	}
};
