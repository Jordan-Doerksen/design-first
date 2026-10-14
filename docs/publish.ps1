# publish.ps1 - copies the built page to the owner's one site and registers it there (DECISIONS 3.1).
#
#   pwsh -NoProfile -File docs/publish.ps1 [-Site <path to jordan-doerksen.github.io checkout>]
#
# Copies docs/index.html, page.css, page.js to <site>/tools/design-first/ and adds one entry to
# <site>/data/registry.json if the slug is absent (never edits an existing entry). It does not
# commit: the owner reads the diff and commits. Runs docs/build.ps1 -Check first; a stale
# index.html stops the publish.

[CmdletBinding()]
param([string] $Site = 'C:\projects\web\jordan-doerksen.github.io')

$ErrorActionPreference = 'Stop'
$docs = $PSScriptRoot
& pwsh -NoProfile -File (Join-Path $docs 'build.ps1') -Check
if ($LASTEXITCODE -ne 0) { throw 'docs/index.html is stale; run docs/build.ps1 and commit it first' }
if (-not (Test-Path (Join-Path $Site 'data\registry.json'))) { throw "not the site checkout (no data/registry.json): $Site" }

$dest = Join-Path $Site 'tools\design-first'
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in 'index.html', 'page.css', 'page.js') {
    Copy-Item (Join-Path $docs $f) (Join-Path $dest $f) -Force
    Write-Output "copied $f -> tools/design-first/$f"
}

$regPath = Join-Path $Site 'data\registry.json'
$raw = [IO.File]::ReadAllText($regPath, [Text.UTF8Encoding]::new($false))
$reg = $raw | ConvertFrom-Json
if (@($reg.projects | Where-Object { $_.slug -eq 'design-first' }).Count -gt 0) {
    Write-Output 'registry: design-first already registered; not touched'
} else {
    $plugin = (Get-Content (Join-Path (Split-Path -Parent $docs) '.claude-plugin\plugin.json') -Raw) | ConvertFrom-Json
    $entry = [ordered] @{
        slug = 'design-first'; name = 'design-first'; category = 'tools'
        blurb = 'A working method for building with coding agents, as a Claude Code plugin: interview before code, every rule graded by what enforces it, a Doctor that checks the disk.'
        tags = @('Tools', 'Claude Code', 'PowerShell'); status = 'live'; tier = 'full'
        url = '/tools/design-first/'; repo = 'https://github.com/Jordan-Doerksen/design-first'; featured = $false
        spec = "v$($plugin.version) · MIT · WINDOWS"
    }
    $reg.projects += [pscustomobject] $entry
    $json = $reg | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText($regPath, ($json -replace "`r`n", "`n") + "`n", [Text.UTF8Encoding]::new($false))
    Write-Output 'registry: added design-first (tools, full); read the diff before committing'
}
Write-Output "done. In the site checkout: git -C `"$Site`" status"
