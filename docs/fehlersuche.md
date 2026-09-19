# Fehlersuche

## Die Seitenleiste erscheint nicht auf claude.ai

1. Seite neu laden (F5). Inhaltsskripte werden erst beim Laden aktiv.
2. `chrome://extensions` öffnen: Ist „Zotero für Claude“ eingeschaltet?
3. Bei Fehlern dort auf **Fehler** klicken – oder mit F12 die Konsole
   der Seite öffnen und nach `Zotero für Claude` suchen.

## „Zotero ist nicht erreichbar“

* Läuft Zotero? Das Programm muss geöffnet sein.
* In Zotero: **Bearbeiten → Einstellungen → Erweitert** – die Option
  zur Kommunikation mit anderen Programmen muss aktiv sein.
* Prüfen, ob der Server antwortet:

  ```bash
  curl http://127.0.0.1:23119/connector/ping
  ```

  Kommt hier nichts, ist der Zotero-Server aus. Kommt hier etwas, aber

  ```bash
  curl http://127.0.0.1:23119/claude/ping
  ```

  schlägt fehl, dann ist das Plugin nicht installiert oder nicht
  geladen (Zotero neu starten).
* Läuft Zotero auf einem anderen Port, muss der Port auch in den
  Erweiterungseinstellungen stehen.

## „Ungültiges oder fehlendes Token“

Das Token in Zotero unter **Werkzeuge → Claude-Verbindung …** neu
kopieren und in den Einstellungen der Erweiterung ersetzen. Nach
„Neues Token erzeugen“ ist das alte sofort ungültig.

## „Kein durchsuchbarer Volltext vorhanden“

Zotero hat für dieses PDF keinen Text im Index. Mögliche Gründe:

* Das PDF ist ein Scan ohne Texterkennung (OCR).
* Die Indizierung läuft noch – in Zotero unten rechts sichtbar.
* Der Eintrag hat gar keinen PDF-Anhang.

Rechtsklick auf den Anhang → **Volltextindex neu aufbauen** hilft
manchmal.

## Der Text landet nicht im Eingabefeld

Die Erweiterung schreibt in das Eingabefeld von Claude. Ändert Claude
seinen Editor, kann das fehlschlagen – die Erweiterung legt den Text
dann in die Zwischenablage und sagt das auch. Mit `Strg + V` einfügen.

Vorher hilft oft: einmal in das Eingabefeld klicken und die Aktion
wiederholen.

## Zotero-Konsole für tiefergehende Fehler

In Zotero: **Werkzeuge → Entwickler → Fehlerkonsole**. Meldungen des
Plugins beginnen mit `Zotero Claude Bridge`.

Einzelne Funktionen lassen sich dort auch direkt ausprobieren
(**Werkzeuge → Entwickler → Run JavaScript**):

```js
return await ZoteroClaudeAPI.search({ query: "Klima", limit: 3 });
```

## Die Online-Reserve funktioniert nicht

* Benutzer-ID ist die Zahl von <https://www.zotero.org/settings/keys>,
  nicht der Benutzername.
* Der Schlüssel braucht Leserechte für die Bibliothek.
* Die Reserve greift nur, wenn das lokale Zotero nicht erreichbar ist –
  fachliche Fehler (etwa fehlender Volltext) werden nicht umgangen.
