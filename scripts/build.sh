#!/usr/bin/env bash
# Baut das Zotero-Plugin (.xpi) und die Browser-Erweiterung (.zip).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"

plugin_version=$(node -p "require('$ROOT/zotero-plugin/manifest.json').version")
ext_version=$(node -p "require('$ROOT/extension/manifest.json').version")

rm -rf "$BUILD"
mkdir -p "$BUILD"

echo "Erzeuge Symbole …"
python3 "$ROOT/scripts/make-icons.py" > /dev/null

echo "Baue Zotero-Plugin $plugin_version …"
(
	cd "$ROOT/zotero-plugin"
	zip -q -r -X "$BUILD/zotero-claude-bridge-$plugin_version.xpi" \
		manifest.json bootstrap.js src chrome \
		-x '*.DS_Store'
)

echo "Baue Browser-Erweiterung $ext_version …"
(
	cd "$ROOT/extension"
	zip -q -r -X "$BUILD/zotero-fuer-claude-$ext_version.zip" \
		manifest.json background content options popup icons \
		-x '*.DS_Store'
)

echo
echo "Fertig:"
ls -lh "$BUILD"
