# HTTP-Schnittstelle des Zotero-Plugins

Das Plugin hängt sich an den HTTP-Server, den Zotero ohnehin betreibt
(Voreinstellung `http://127.0.0.1:23119`). Alle Endpunkte liegen unter
`/claude/`.

## Authentifizierung

Jeder Endpunkt außer `/claude/ping` verlangt das Token aus
**Werkzeuge → Claude-Verbindung …**. Es wird entweder als Kopfzeile

```
X-Zotero-Claude-Token: <token>
```

oder als Abfrageparameter `?token=<token>` übergeben. Ohne gültiges
Token antwortet das Plugin mit `401`.

Der Vergleich läuft zeitkonstant, damit das Token nicht zeichenweise
erraten werden kann.

## Antwortformat

Immer JSON. Erfolg:

```json
{ "ok": true, "...": "endpunktspezifische Felder" }
```

Fehler (Status `400`, `401` oder `403`):

```json
{ "ok": false, "error": "Beschreibung im Klartext" }
```

## Endpunkte

Parameter können als JSON-Body (`POST`) oder als Abfrageparameter
(`GET`) übergeben werden. `keys` wird bei `GET` als kommagetrennte Liste
erwartet.

### `POST /claude/ping`

Ohne Token erreichbar. Liefert Plugin- und Zotero-Version sowie
`tokenValid`, falls ein Token mitgeschickt wurde.

### `POST /claude/search`

| Parameter | Bedeutung |
| --- | --- |
| `query` | Suchbegriff; leer = zuletzt geänderte Einträge |
| `mode` | `titleCreatorYear` (Standard) oder `everything` |
| `collectionKey` | Auf eine Sammlung samt Unterordnern einschränken |
| `itemType`, `tag` | Zusätzliche Filter |
| `limit` | Höchstens 100, Standard 20 |
| `libraryID` | Standard ist die eigene Bibliothek |

Antwort: `items` (siehe unten), `total`, `truncated`.

### `POST /claude/recent`

Wie `search` ohne Suchbegriff, sortiert nach Aufnahmedatum.

### `POST /claude/item`

`key` → vollständiger Eintrag samt `notes`, `attachments` und
`annotations`.

### `POST /claude/fulltext`

`key`, optional `maxChars` (Standard 40 000, Obergrenze 200 000).
Nimmt den ersten Anhang mit erkanntem Text, PDFs zuerst. Ohne Text
antwortet der Endpunkt mit `400` und einer Erklärung.

### `POST /claude/notes` und `POST /claude/annotations`

`key` → Notizen bzw. PDF-Markierungen mit Kommentar, Seitenangabe und
Farbe.

### `POST /claude/citation`

| Parameter | Bedeutung |
| --- | --- |
| `keys` | Liste von Eintragsschlüsseln |
| `style` | Stil-ID, Standard `http://www.zotero.org/styles/apa` |
| `locale` | Standard `de-DE` |
| `format` | `text` (Standard) oder `html` |

Antwort: `bibliography` und `inTextCitations`.

### `POST /claude/export`

`keys` plus `translator`: `bibtex`, `biblatex`, `ris`, `csljson` oder
direkt eine Translator-ID. Antwort: `output`.

### `GET /claude/styles`, `GET /claude/translators`, `GET /claude/collections`, `GET /claude/libraries`

Listen zur Auswahl in der Oberfläche.

## Struktur eines Eintrags

```json
{
  "key": "ABCD1234",
  "libraryID": 1,
  "itemType": "journalArticle",
  "title": "…",
  "creators": [{ "creatorType": "author", "firstName": "…", "lastName": "…", "name": "…" }],
  "authorString": "Meier et al.",
  "year": "2021",
  "date": "2021-03-04",
  "publication": "…",
  "publisher": "…",
  "volume": "12", "issue": "3", "pages": "45-67",
  "DOI": "…", "ISBN": "…", "url": "…", "language": "de",
  "abstract": "…",
  "tags": ["…"],
  "collections": [{ "key": "…", "name": "…" }],
  "dateAdded": "…", "dateModified": "…",
  "hasPDF": true,
  "numAttachments": 1, "numNotes": 2, "numAnnotations": 14,
  "zoteroURI": "zotero://select/library/items/ABCD1234"
}
```

## Von Hand testen

```bash
curl -s http://127.0.0.1:23119/claude/ping | jq

curl -s -X POST http://127.0.0.1:23119/claude/search \
  -H 'Content-Type: application/json' \
  -H 'X-Zotero-Claude-Token: DEIN_TOKEN' \
  -d '{"query":"Klima","limit":5}' | jq '.items[].title'
```

## Hinweis zu CORS

Die Endpunkte sind für den Hintergrunddienst der Browser-Erweiterung
gedacht. Der darf dank `host_permissions` direkt auf `127.0.0.1`
zugreifen; die Beschränkungen des Browsers für normale Webseiten gelten
dort nicht. Eine gewöhnliche Webseite kann die Antworten also nicht
auslesen – zusätzlich zum Token.
