/** Kleines Statusfenster hinter dem Symbol in der Browser-Leiste. */

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

function setBadge(id, text, kind) {
	const element = document.getElementById(id);
	element.textContent = text;
	element.className = kind ? `status-${kind}` : "";
}

async function refresh() {
	const response = await send({ type: "status" });

	if (!response.ok) {
		setBadge("local", "Fehler", "error");
		setBadge("web", "–");
		document.getElementById("message").textContent = response.error;
		return;
	}

	const { local, web } = response;

	if (local.connected && local.tokenValid) {
		setBadge("local", "verbunden", "ok");
	}
	else if (local.connected) {
		setBadge("local", "Token fehlt", "warn");
	}
	else {
		setBadge("local", "nicht erreichbar", "error");
	}

	if (!web.configured) {
		setBadge("web", "nicht eingerichtet");
	}
	else if (web.connected) {
		setBadge("web", "verbunden", "ok");
	}
	else {
		setBadge("web", "Fehler", "error");
	}

	document.getElementById("message").textContent =
		(local.connected && local.tokenValid) ? "" : (local.message || web.message || "");
}

document.addEventListener("DOMContentLoaded", () => {
	refresh();
	document.getElementById("options").addEventListener("click", () => {
		chrome.runtime.openOptionsPage();
		window.close();
	});
});
