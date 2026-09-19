# Zotero ↔ Claude

Verbindet die Zotero-Literaturverwaltung mit Claude im Browser. Auf
`claude.ai` erscheint eine Seitenleiste, in der du deine Bibliothek
durchsuchst und Zitate, Abstracts, Notizen, PDF-Anmerkungen oder den
kompletten PDF-Text mit einem Klick in den Chat einfügst.

Das Projekt besteht aus zwei Teilen, die zusammenarbeiten:

| Teil | Ordner | Aufgabe |
| --- | --- | --- |
| **Zotero-Plugin** „Zotero Claude Bridge“ | `zotero-plugin/` | Stellt deine Bibliothek über den lokalen Zotero-Server bereit – Token-geschützt. |
| **Browser-Erweiterung** „Zotero für Claude“ | `extension/` | Baut die Seitenleiste auf claude.ai ein und holt die Daten vom Plugin. |

## Warum zwei Teile?

`claude.ai` läuft im Browser und darf aus Sicherheitsgründen nicht auf
Programme auf deinem Rechner zugreifen. Zotero bringt aber bereits einen
kleinen lokalen Server mit (Port 23119 – darüber spricht auch der Zotero
Connector). Das Plugin hängt dort zusätzliche Funktionen ein, und die
Browser-Erweiterung ist die einzige Stelle, die sie abrufen darf: Sie
weist sich mit einem Token aus, das nur in Zotero und in den
Erweiterungseinstellungen steht.

```
claude.ai (Seitenleiste)
        │  interne Nachricht
Browser-Erweiterung (Hintergrunddienst)
        │  HTTP an 127.0.0.1:23119 + Token
Zotero-Plugin  →  deine Zotero-Bibliothek
```

Läuft Zotero gerade nicht, kann die Erweiterung wahlweise auf deine
synchronisierte Bibliothek auf `zotero.org` ausweichen (siehe unten).

## Installation

### Voraussetzungen

* Zotero 7, 8 oder 9 auf dem Rechner installiert
* Chrome oder Edge

### Schritt 1 – Pakete besorgen

Die fertigen Pakete liegen im Ordner [`dist/`](dist/) und lassen sich
dort direkt herunterladen:

* `zotero-claude-bridge-0.1.3.xpi` – das Zotero-Plugin
* `zotero-fuer-claude-0.1.0.zip` – die Browser-Erweiterung

Auf GitHub: Datei anklicken, dann oben rechts auf **Download raw file**.

> **Bei einer neuen Zotero-Hauptversion:** Zotero lehnt Plugins ab, deren
> `strict_max_version` unter der eigenen Version liegt. Erscheint nach
> einem Zotero-Update die Meldung „eventuell inkompatibel“, genügt es,
> in `zotero-plugin/manifest.json` die Zahl in `strict_max_version`
> anzuheben und neu zu bauen.

Selbst bauen (nur nötig, wenn du etwas am Code geändert hast):

| System | Befehl |
| --- | --- |
| Windows | Doppelklick auf `scripts\build.cmd` |
| macOS, Linux | `./scripts/build.sh` |

Die Pakete landen dann im Ordner `build/`.

Ganz ohne Skript geht es auch von Hand: den **Inhalt** von
`zotero-plugin/` (also `manifest.json`, `bootstrap.js`, `src`, `chrome`)
in eine ZIP-Datei packen und diese auf `.xpi` umbenennen. Wichtig ist,
dass `manifest.json` im Archiv ganz oben liegt und nicht in einem
Unterordner – sonst lehnt Zotero die Datei ab.

### Schritt 2 – Zotero-Plugin installieren

1. Zotero öffnen
2. **Werkzeuge → Add-ons**
3. Oben auf das Zahnrad klicken → **Install Add-on From File …**
4. Die Datei `build/zotero-claude-bridge-0.1.3.xpi` auswählen
5. Zotero neu starten

### Schritt 3 – Token kopieren

In Zotero: **Werkzeuge → Claude-Verbindung …**

Dort steht ein langes Zeichenkennwort. Auf **Kopieren** klicken. Dieses
Fenster zeigt außerdem, ob der lokale Server läuft.

### Schritt 4 – Browser-Erweiterung installieren

1. `build/zotero-fuer-claude-0.1.0.zip` in einen Ordner entpacken
   (alternativ direkt den Ordner `extension/` verwenden)
2. In Chrome/Edge `chrome://extensions` öffnen (Adresse eintippen)
3. Rechts oben **Entwicklermodus** einschalten
4. **Entpackte Erweiterung laden** und den entpackten Ordner auswählen

> Im Auswahldialog erscheint keine `manifest.json` – Ordnerdialoge zeigen
> nie Dateien an. Dass dort `background`, `content`, `icons`, `options`
> und `popup` stehen, heißt: richtige Stelle. Auf **Ordner auswählen**
> klicken.

### Schritt 5 – Token eintragen

1. Auf das Symbol der Erweiterung klicken → **Einstellungen öffnen**
2. Das Token aus Schritt 3 einfügen
3. **Verbindung testen** – es sollte „Verbunden mit Zotero …“ erscheinen
4. Zitierstil und Sprache wählen, dann **Speichern**

### Schritt 6 – Loslegen

`claude.ai` öffnen (Seite einmal neu laden). Am rechten Rand erscheint
ein **Z**-Knopf, der die Seitenleiste öffnet – oder **Alt + Z**.

## Was die Seitenleiste kann

Suche nach Titel, Autor:in oder Jahr; optional auf eine Sammlung
eingeschränkt. Ein Klick auf einen Treffer klappt die Aktionen auf:

| Aktion | Fügt ein |
| --- | --- |
| **Zitat** | Kurzbeleg wie „(Meier, 2021)“ plus vollständige Literaturangabe |
| **Literaturangabe** | Nur den Eintrag im gewählten Zitierstil |
| **Kurzinfo** | Alle Metadaten als Liste, dazu das Abstract |
| **Abstract** | Nur die Zusammenfassung |
| **Notizen** | Deine Zotero-Notizen als Text |
| **Anmerkungen** | Markierungen und Kommentare aus dem PDF, mit Seitenzahl |
| **Volltext** | Den erkannten Text des PDFs (Länge einstellbar) |
| **BibTeX** | Den BibTeX-Eintrag als Codeblock |
| **Alles** | Kurzinfo + Notizen + Anmerkungen + Volltext am Stück |

Über die Kästchen links lassen sich mehrere Treffer auswählen und
gemeinsam als **Literaturverzeichnis**, **Kurzinfos** oder **BibTeX**
einfügen.

## Ohne Installationsrechte: nur über zotero.org

Lässt sich das Zotero-Plugin nicht installieren – etwa auf einem
verwalteten Dienstrechner –, funktioniert die Erweiterung auch allein
mit deiner synchronisierten Online-Bibliothek. Eine Browser-Erweiterung
im Entwicklermodus zu laden erfordert keine Administratorrechte.

1. Auf <https://www.zotero.org/settings/keys> auf **Create new private
   key** klicken, Leserechte genügen. Den Schlüssel sofort kopieren –
   er wird nur einmal angezeigt. Die **Benutzer-ID** (eine Zahl) steht
   auf derselben Seite unter *Your userID for use in API calls*.
2. In den Einstellungen der Erweiterung unter *Reserve über zotero.org*
   den Haken setzen, Benutzer-ID und Schlüssel eintragen, **Speichern**.
3. **Online-Zugang testen** – es sollte „Online-Zugang funktioniert“
   erscheinen.

Das Feld für das Zotero-Token bleibt dabei leer. Die Erweiterung
versucht zuerst das lokale Zotero, scheitert dort sofort und benutzt
danach die Online-Bibliothek.

Was in diesem Modus fehlt:

| Funktion | Online verfügbar |
| --- | --- |
| Suche, Metadaten, Abstract | ja |
| Zitate und Literaturverzeichnis | ja |
| Notizen | ja |
| BibTeX und RIS | ja |
| PDF-Volltext | nur wenn Zotero ihn synchronisiert hat |
| PDF-Anmerkungen (Markierungen) | nein |
| Eigene Zitierstile aus Zotero | nein, nur eine Standardauswahl |

Vorausgesetzt ist, dass deine Bibliothek tatsächlich mit zotero.org
synchronisiert ist (in Zotero unter *Einstellungen → Sync*).

## Reserve über zotero.org (optional)

Wenn Zotero auf dem Rechner nicht läuft, kann die Erweiterung auf deine
synchronisierte Online-Bibliothek ausweichen.

1. Auf <https://www.zotero.org/settings/keys> einen Schlüssel mit
   Leserechten erstellen; dort steht auch deine Benutzer-ID
2. Beides in den Erweiterungseinstellungen unter „Reserve über
   zotero.org“ eintragen und den Haken setzen

Eingeschränkt: PDF-Anmerkungen gibt es nur lokal, und PDF-Volltext nur,
wenn Zotero ihn in die Cloud synchronisiert hat.

## Datenschutz

* Die Bibliotheksdaten laufen ausschließlich über `127.0.0.1` – sie
  verlassen den Rechner nur, wenn **du** sie in den Chat einfügst.
* Ohne gültiges Token beantwortet das Plugin keine Anfrage, andere
  Webseiten kommen also nicht an die Bibliothek.
* Die Online-Reserve ist standardmäßig aus.
* Die Erweiterung sendet nichts an Dritte und sammelt keine Statistik.

## Fehlersuche

| Meldung | Ursache und Abhilfe |
| --- | --- |
| „Zotero ist nicht erreichbar“ | Zotero starten. Falls es läuft: in Zotero unter **Bearbeiten → Einstellungen → Erweitert** die Kommunikation mit anderen Programmen aktivieren. |
| „Das hinterlegte Token passt nicht zu Zotero“ | Token in Zotero neu kopieren (**Werkzeuge → Claude-Verbindung …**) und in den Einstellungen ersetzen. |
| „Kein durchsuchbarer Volltext vorhanden“ | Das PDF ist ein reiner Scan ohne Texterkennung, oder Zotero hat es noch nicht indiziert. |
| Seitenleiste erscheint nicht | claude.ai einmal neu laden. Die Erweiterung wird erst nach dem Laden der Seite aktiv. |
| Text landet nicht im Eingabefeld | Einmal ins Eingabefeld von Claude klicken und die Aktion wiederholen. Klappt es weiterhin nicht, liegt der Text in der Zwischenablage. |

Ausführlicher: [`docs/fehlersuche.md`](docs/fehlersuche.md).
Die HTTP-Schnittstelle des Plugins ist in
[`docs/api.md`](docs/api.md) beschrieben.

## Entwicklung

```
dist/                   Fertige Pakete zum Herunterladen
zotero-plugin/
  bootstrap.js          Start/Stop des Plugins in Zotero 7
  src/api.js            Lesezugriff auf die Bibliothek
  src/bridge.js         HTTP-Endpunkte, Token, Menüeintrag
  chrome/content/       Dialog „Claude-Verbindung“
extension/
  background/           Hintergrunddienst: Zotero-Zugriff und Textaufbau
  content/sidebar.js    Seitenleiste auf claude.ai (Shadow DOM)
  options/, popup/      Einstellungen und Statusfenster
scripts/
  build.sh              Baut .xpi und .zip (macOS, Linux)
  build.cmd/.ps1        Dasselbe für Windows
  make-icons.py         Erzeugt die Symbole
tests/
  plugin-smoke-test.mjs Plugin-Endpunkte gegen ein nachgebildetes Zotero
  format-test.mjs       Aufbau der eingefügten Textblöcke
```

### Tests

```bash
npm test
```

Der erste Test lädt `src/api.js` und `src/bridge.js` in einen
abgeschotteten Kontext mit einem nachgebauten `Zotero`-Objekt und ruft
die Endpunkte genauso auf, wie es der Zotero-Server tut – inklusive
Token-Prüfung, Fehlerfällen und Abbau beim Beenden. Zotero selbst wird
dafür nicht gebraucht. Er ersetzt aber keinen Durchlauf im echten
Programm: Die Feinheiten der Zotero-Datenobjekte bildet das Doppel nur
grob nach.

Während der Entwicklung lädt man das Plugin am schnellsten als
„Install Add-on From File“ neu; die Browser-Erweiterung über den
Neu-laden-Knopf auf `chrome://extensions`.

## Lizenz

MIT – siehe [`LICENSE`](LICENSE).
