/**
 * Zotero Claude Bridge - Bootstrap
 *
 * Zotero 7 laedt dieses Skript beim Start des Plugins. Es haengt die
 * HTTP-Endpunkte an den lokalen Zotero-Server und fuegt einen Menuepunkt
 * unter "Werkzeuge" ein.
 */

var ZoteroClaude;
var chromeHandle;

function log(msg) {
	Zotero.debug("Zotero Claude Bridge: " + msg);
}

function install() {}

function startup({ id, version, rootURI }) {
	log("Starte Version " + version);

	var aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Components.interfaces.amIAddonManagerStartup);
	var manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", "zoteroclaude", rootURI + "chrome/content/"]
	]);

	Services.scriptloader.loadSubScript(rootURI + "src/api.js");
	Services.scriptloader.loadSubScript(rootURI + "src/bridge.js");

	ZoteroClaude.init({ id, version, rootURI });
	ZoteroClaude.addToAllWindows();
}

function onMainWindowLoad({ window }) {
	if (ZoteroClaude) {
		ZoteroClaude.addToWindow(window);
	}
}

function onMainWindowUnload({ window }) {
	if (ZoteroClaude) {
		ZoteroClaude.removeFromWindow(window);
	}
}

function shutdown() {
	log("Beende Plugin");

	if (ZoteroClaude) {
		ZoteroClaude.removeFromAllWindows();
		ZoteroClaude.shutdown();
		ZoteroClaude = undefined;
	}

	if (chromeHandle) {
		chromeHandle.destruct();
		chromeHandle = null;
	}
}

function uninstall() {}
