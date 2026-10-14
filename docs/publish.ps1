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
    # The entry is inserted as text at the end of the "projects" array, in the file's own indent and
    # line endings. Workaround: ConvertTo-Json rewrote the whole file in its own layout (one run
    # produced a 2,045-line diff for a 12-line change), so the file is never round-tripped.
    $nl = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
    $unit = if ($raw -match "`n( +)`"categories`"") { $Matches[1] } else { '  ' }
    $i2 = $unit * 2; $i3 = $unit * 3
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add("$i2{")
    $keys = @($entry.Keys)
    for ($k = 0; $k -lt $keys.Count; $k++) {
        $key = $keys[$k]; $v = $entry[$key]
        $val = if ($v -is [string]) { '"' + ($v -replace '\\', '\\' -replace '"', '\"') + '"' }
               elseif ($v -is [bool]) { if ($v) { 'true' } else { 'false' } }
               else { '[' + (($v | ForEach-Object { '"' + $_ + '"' }) -join ', ') + ']' }
        $comma = if ($k -lt $keys.Count - 1) { ',' } else { '' }
        $lines.Add("$i3`"$key`": $val$comma")
    }
    $lines.Add("$i2}")
    $block = ($lines -join $nl)
    # The projects array closes with the last "]" before the final "}" of the document.
    $closeDoc = $raw.LastIndexOf('}')
    $closeArr = $raw.LastIndexOf(']', $closeDoc)
    if ($closeArr -lt 0) { throw 'registry.json: could not find the end of the projects array' }
    $before = $raw.Substring(0, $closeArr).TrimEnd()
    $after  = $raw.Substring($closeArr)
    $new = $before + ',' + $nl + $block + $nl + $unit + $after.TrimStart()
    [IO.File]::WriteAllText($regPath, $new, [Text.UTF8Encoding]::new($false))
    Write-Output 'registry: added design-first (tools, full) as a text insert; read the diff before committing'
}
Write-Output "done. In the site checkout: git -C `"$Site`" status"
