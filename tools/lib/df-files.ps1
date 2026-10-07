# df-files.ps1 - file helpers shared by tools/adopt.ps1, tools/remove.ps1 and tools/tests/adopt-selftest.ps1.
# Dot-sourced; never run directly.
#
# Bytes rule (SPEC 5.1, 5.6, F9): everything written is UTF-8 without BOM. Text is LF, except
# .ps1 / .bat / .cmd which are CRLF. The sha256 recorded in installed.json is taken over the bytes
# AFTER mapping CRLF to LF, so a checkout whose autocrlf rewrote line endings does not make a
# kit-written file look hand-edited (finding 77).
#
# Test seams (env vars only, SPEC 5.4 style):
#   DF_POINTER_PATH   where the pointer lives     (default %USERPROFILE%\.claude\design-first.json)
#   DF_MARKER_DIR     once-per-session markers    (default %TEMP%\design-first)

$script:DfUtf8 = [Text.UTF8Encoding]::new($false)
# Workaround: pwsh 7.4+ can promote native stderr to a terminating error under $ErrorActionPreference
# = 'Stop'. git diff --no-index exits 1 when files differ, on purpose. Promotion is off here.
$PSNativeCommandUseErrorActionPreference = $false

function Get-DfPointerFile {
    if ($env:DF_POINTER_PATH) { return $env:DF_POINTER_PATH }
    return (Join-Path $env:USERPROFILE '.claude\design-first.json')
}
function Get-DfMarkerFolder {
    if ($env:DF_MARKER_DIR) { return $env:DF_MARKER_DIR }
    return (Join-Path $env:TEMP 'design-first')
}

function Get-DfFullPath([string] $p) { return [IO.Path]::GetFullPath($p).TrimEnd('\') }

function Get-DfPluginKind([string] $pluginRoot) {
    # Same test as hooks/entry.ps1: under a plugins\cache folder = cache, anything else = checkout.
    if ($pluginRoot -match '(?i)[\\/]plugins[\\/]cache([\\/]|$)') { return 'cache' }
    return 'checkout'
}

# ---------------------------------------------------------------- text, line endings, bytes

function Test-DfCrlfExtension([string] $path) {
    $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
    return ($ext -in @('.ps1', '.bat', '.cmd'))
}

function ConvertTo-DfEol([string] $text, [string] $path) {
    $t = $text -replace "`r`n", "`n"
    if (Test-DfCrlfExtension $path) { $t = $t -replace "`n", "`r`n" }
    return $t
}

function Get-DfTextBytes([string] $text, [string] $path) {
    return $script:DfUtf8.GetBytes((ConvertTo-DfEol $text $path))
}

function Read-DfText([string] $path) { return [IO.File]::ReadAllText($path, $script:DfUtf8) }

function Read-DfJson([string] $path) { return (Read-DfText $path | ConvertFrom-Json -Depth 32) }

function Write-DfBytes([string] $path, [byte[]] $bytes) {
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [IO.File]::WriteAllBytes($path, $bytes)
}

function Get-DfNormalisedSha256([byte[]] $bytes) {
    # Drop every CR that is immediately followed by LF, then SHA-256, lowercase hex.
    $out = [Collections.Generic.List[byte]]::new($bytes.Length)
    $n = $bytes.Length
    for ($i = 0; $i -lt $n; $i++) {
        if ($bytes[$i] -eq 13 -and ($i + 1) -lt $n -and $bytes[$i + 1] -eq 10) { continue }
        $out.Add($bytes[$i])
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash($out.ToArray()) } finally { $sha.Dispose() }
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Get-DfFileSha256([string] $path) { return (Get-DfNormalisedSha256 ([IO.File]::ReadAllBytes($path))) }

# ---------------------------------------------------------------- installed.json (SPEC 5.6, finding 77)

function New-DfInstalledRecord([string] $path, [byte[]] $bytes, [bool] $generated) {
    return [pscustomobject]@{ path = $path; sha256 = (Get-DfNormalisedSha256 $bytes); generated = $generated }
}

function Read-DfInstalled([string] $path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @() }
    $j = Read-DfJson $path
    if ($null -eq $j -or $null -eq $j.PSObject.Properties['files']) { return @() }
    return @($j.files | ForEach-Object {
        [pscustomobject]@{ path = [string]$_.path; sha256 = [string]$_.sha256; generated = [bool]$_.generated }
    })
}

function Merge-DfInstalled([object[]] $existing, [object[]] $written) {
    # Merged by path, case-insensitive: a path written this run replaces its old record; every other
    # existing record is kept as it was.
    $map = [ordered]@{}
    foreach ($e in @($existing)) { if ($e) { $map[([string]$e.path).ToLowerInvariant()] = $e } }
    foreach ($w in @($written))  { if ($w) { $map[([string]$w.path).ToLowerInvariant()] = $w } }
    return @($map.Values | Sort-Object -Property path -Culture '')
}

function Write-DfInstalled([string] $path, [object[]] $records) {
    $doc = [ordered]@{
        schema   = 1
        _comment = 'Every file adopt.ps1 wrote, with sha256 over CRLF->LF-mapped bytes. remove.ps1 deletes a file only when its hash still matches, or when generated is true (regenerable). Written by adopt.ps1; merged by path on every run.'
        files    = @($records)
    }
    $json = ($doc | ConvertTo-Json -Depth 5) + "`n"
    Write-DfBytes $path (Get-DfTextBytes $json $path)
}

# ---------------------------------------------------------------- diffs (attach mode, finding 37)

function Show-DfDiff([string] $existing, [byte[]] $proposed, [string] $label) {
    # Unified diff: what adopt would have written -> the existing file, so a `+` line is something
    # the owner has that the template lacks (their edit), and a `-` line is template text they
    # removed. Nothing is changed. git diff --no-index when git is on PATH; a plain line diff
    # otherwise. Line endings are ignored because the hash rule treats CRLF and LF as the same bytes.
    $tmpDir = Join-Path ([IO.Path]::GetTempPath()) 'design-first-adopt'
    if (-not (Test-Path -LiteralPath $tmpDir)) { New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null }
    $tmp = Join-Path $tmpDir ('proposed-' + [IO.Path]::GetFileName($existing))
    [IO.File]::WriteAllBytes($tmp, $proposed)
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add("  --- diff $label  (what adopt would write -> what is on disk; + is yours; the file was NOT changed)")
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { $raw = @(& git diff --no-index --no-color --ignore-cr-at-eol -- $tmp $existing 2>$null | ForEach-Object { [string]$_ }) }
        finally { $ErrorActionPreference = $prev }
        # The four git header lines name the temp file; they carry nothing the reader needs.
        foreach ($l in $raw) { if ($l -notmatch '^(diff --git |index |--- |\+\+\+ )') { $lines.Add('      ' + $l) } }
    } else {
        $a = @(($script:DfUtf8.GetString($proposed)) -replace "`r`n", "`n" -split "`n")
        $b = @((Read-DfText $existing) -replace "`r`n", "`n" -split "`n")
        foreach ($d in @(Compare-Object -ReferenceObject $a -DifferenceObject $b)) {
            $sign = if ($d.SideIndicator -eq '=>') { '+' } else { '-' }
            $lines.Add('      ' + $sign + $d.InputObject)
        }
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    return $lines
}

# ---------------------------------------------------------------- git

function Invoke-DfGit([string] $dir, [string[]] $gitArgs) {
    # Returns @{ code; out }. stderr is dropped: exit codes 1 and 128 are answers here.
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $out = @(& git -C $dir @gitArgs 2>$null | ForEach-Object { [string]$_ })
        return @{ code = $LASTEXITCODE; out = $out }
    } finally { $ErrorActionPreference = $prev }
}

function Test-DfGitWorkTree([string] $dir) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $false }
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return $false }
    $r = Invoke-DfGit $dir @('rev-parse', '--is-inside-work-tree')
    return ($r.code -eq 0 -and (($r.out -join '') -match 'true'))
}
