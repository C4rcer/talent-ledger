# Packages the extension for AMO submission.
# Compress-Archive writes backslash entry names that break web stores, so
# entries are added manually with forward slashes and verified afterwards.
param([string]$OutDir = "dist")

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$zipDir = Join-Path $root $OutDir
$zipPath = Join-Path $zipDir ("talent-ledger-" + $manifest.version + ".zip")

New-Item -ItemType Directory -Force $zipDir | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Explicit allowlist so dev and doc files never leak into the package.
$include = @(
    "manifest.json",
    "LICENSE",
    "background.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "lib/env.js",
    "lib/xlsx.js",
    "lib/csv.js",
    "lib/backup.js",
    "lib/model.js",
    "icons/icon.svg"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fs = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($rel in $include) {
        $src = Join-Path $root ($rel -replace '/', [string][IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path $src)) { throw "Missing file: $rel" }
        $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
        $es = $entry.Open()
        $bytes = [System.IO.File]::ReadAllBytes($src)
        $es.Write($bytes, 0, $bytes.Length)
        $es.Dispose()
    }
}
finally {
    $zip.Dispose()
    $fs.Dispose()
}

# Verify: every entry name must use forward slashes only.
$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $bad = @($check.Entries | Where-Object { $_.FullName -match '\\' })
    if ($bad.Count) { throw ("Backslash entries found: " + (($bad | ForEach-Object FullName) -join ", ")) }
    Write-Host "Entries:"
    $check.Entries | ForEach-Object { Write-Host ("  " + $_.FullName) }
}
finally {
    $check.Dispose()
}

Write-Host "Built $zipPath"
