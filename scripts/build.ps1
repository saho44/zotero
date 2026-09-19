# Baut das Zotero-Plugin (.xpi) und die Browser-Erweiterung (.zip) unter Windows.
# Bequemer per Doppelklick auf scripts\build.cmd.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "build"

function Get-ManifestVersion($path) {
	(Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json).version
}

$pluginVersion = Get-ManifestVersion (Join-Path $root "zotero-plugin\manifest.json")
$extVersion = Get-ManifestVersion (Join-Path $root "extension\manifest.json")

if (Test-Path $build) {
	Remove-Item -Recurse -Force $build
}
New-Item -ItemType Directory -Path $build | Out-Null

Write-Host "Baue Zotero-Plugin $pluginVersion ..."
$xpiZip = Join-Path $build "zotero-claude-bridge-$pluginVersion.zip"
$xpi = Join-Path $build "zotero-claude-bridge-$pluginVersion.xpi"
# Das Sternchen ist wichtig: Im Archiv muss manifest.json ganz oben liegen,
# nicht in einem Unterordner - sonst lehnt Zotero die Datei ab.
Compress-Archive -Path (Join-Path $root "zotero-plugin\*") -DestinationPath $xpiZip -Force
Move-Item -Path $xpiZip -Destination $xpi -Force

Write-Host "Baue Browser-Erweiterung $extVersion ..."
$extZip = Join-Path $build "zotero-fuer-claude-$extVersion.zip"
Compress-Archive -Path (Join-Path $root "extension\*") -DestinationPath $extZip -Force

Write-Host ""
Write-Host "Fertig. Die Dateien liegen in:"
Write-Host "  $build"
Get-ChildItem $build | Format-Table Name, Length
