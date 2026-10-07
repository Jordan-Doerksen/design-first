# common.ps1 - shared helpers for the design-first hooks. Dot-sourced by guard.ps1, fence.ps1,
# entry.ps1. Never run directly.
#
# Fixed locations (SPEC 5.4) and the test seams that override them. The self-tests set the
# DF_* variables so a test run never reads the real pointer and never writes the real logs.
#   pointer     %USERPROFILE%\.claude\design-first.json        DF_POINTER_PATH
#   hooks log   %USERPROFILE%\.claude\design-first-hooks.log   DF_LOG_PATH
#   fence log   %USERPROFILE%\.claude\fence-log.txt            DF_FENCE_LOG_PATH
#   markers     %TEMP%\design-first\                           DF_MARKER_DIR

# Workaround: pwsh 7.4+ can promote native stderr to a terminating error when
# $ErrorActionPreference is Stop. git writes "fatal:" to stderr on the exit codes we read on
# purpose (1, 128), so that promotion is switched off here and every git call also gets 2>$null.
$PSNativeCommandUseErrorActionPreference = $false

function Get-DfPointerPath {
    if ($env:DF_POINTER_PATH) { return $env:DF_POINTER_PATH }
    return (Join-Path $env:USERPROFILE '.claude\design-first.json')
}
function Get-DfLogPath {
    if ($env:DF_LOG_PATH) { return $env:DF_LOG_PATH }
    return (Join-Path $env:USERPROFILE '.claude\design-first-hooks.log')
}
function Get-DfFenceLogPath {
    if ($env:DF_FENCE_LOG_PATH) { return $env:DF_FENCE_LOG_PATH }
    return (Join-Path $env:USERPROFILE '.claude\fence-log.txt')
}
function Get-DfMarkerDir {
    if ($env:DF_MARKER_DIR) { return $env:DF_MARKER_DIR }
    return (Join-Path $env:TEMP 'design-first')
}

function Get-DfIso { return (Get-Date).ToString('o') }

# Appends "<ISO> <LEVEL> <hook> <msg>" to the hooks log. Swallows its own failures: a log that
# cannot be written must not stop the hook from answering.
function Write-DfLog([string]$level, [string]$hook, [string]$msg) {
    try {
        $p = Get-DfLogPath
        $dir = Split-Path -Parent $p
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        $line = '{0} {1} {2} {3}' -f (Get-DfIso), $level, $hook, (($msg -replace "`r", ' ') -replace "`n", ' ')
        Add-Content -LiteralPath $p -Value $line -Encoding utf8
    } catch { }
}

function Add-DfTextLine([string]$path, [string]$line) {
    try {
        $dir = Split-Path -Parent $path
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $path -Value $line -Encoding utf8
    } catch { }
}

# ---------------------------------------------------------------- hook output (one JSON object)

function New-DfDeny([string]$hook, [string]$title, [string]$reason) {
    return [ordered]@{
        systemMessage      = "$($hook.ToUpper()): $title"
        hookSpecificOutput = [ordered]@{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $reason
        }
    }
}

# Advisory: both channels (SPEC 5.4 channels). $items is a list of @{ title; body }.
function New-DfAdvisory([string]$hook, [object[]]$items) {
    $titles = @($items | ForEach-Object { $_.title }) -join ' | '
    $bodies = @($items | ForEach-Object { $_.body }) -join "`n`n"
    return [ordered]@{
        systemMessage      = "$($hook.ToUpper()): $titles"
        hookSpecificOutput = [ordered]@{
            hookEventName     = 'PreToolUse'
            additionalContext = $bodies
        }
    }
}

# Internal error: allow, log, surface on both channels (SPEC 5.4 internal errors).
function New-DfErrorOutput([string]$hook, [string]$msg) {
    Write-DfLog 'ERROR' $hook $msg
    $body = "$hook hook hit an internal error and ALLOWED this call without inspecting it: $msg. " +
            "Logged to $(Get-DfLogPath). The Doctor reports ERROR lines in that log for 7 days."
    return New-DfAdvisory $hook @(@{ title = "internal error, call allowed ($msg)"; body = $body })
}

function Write-DfJson($obj) {
    if ($null -eq $obj) { return }
    Write-Output ($obj | ConvertTo-Json -Depth 8 -Compress)
}

# ---------------------------------------------------------------- paths

# Full path, trailing separator trimmed. Relative paths resolve against $base (the tool call's
# cwd), then the process cwd. Returns $null for empty or unresolvable input.
function ConvertTo-DfFullPath([string]$p, [string]$base) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $null }
    $s = $p.Trim()
    # Workaround: Git Bash on Windows writes drive paths as /c/x/y. Without this mapping a frozen
    # path typed in MSYS form is not recognised as the same folder.
    if ($s -match '^/([A-Za-z])(/|$)') { $s = $Matches[1].ToUpper() + ':\' + $s.Substring(2).TrimStart('/') }
    $s = $s -replace '/', '\'
    if ($s -match '^~(\\|$)') { $s = Join-Path $env:USERPROFILE $s.Substring(1).TrimStart('\') }
    try {
        if (-not [IO.Path]::IsPathRooted($s)) {
            if ([string]::IsNullOrWhiteSpace($base)) { $base = (Get-Location).Path }
            $s = Join-Path $base $s
        }
        $full = [IO.Path]::GetFullPath($s)
    } catch { return $null }
    return $full.TrimEnd('\')
}

# Case-insensitive "is $full equal to or under $root" (SPEC 5.4 path comparison).
function Test-DfUnder([string]$full, [string]$root) {
    if ([string]::IsNullOrWhiteSpace($full) -or [string]::IsNullOrWhiteSpace($root)) { return $false }
    $r = $root.TrimEnd('\', '/')
    if ($full.Equals($r, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $full.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Get-DfLeaf([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return '' }
    $parts = $p.TrimEnd('\', '/') -split '[\\/]'
    return $parts[$parts.Count - 1]
}

# Nearest existing ancestor folder of a path that may not exist yet (SPEC 7, finding 46).
function Get-DfNearestExistingDir([string]$full) {
    $d = $full
    if (-not (Test-Path -LiteralPath $d -PathType Container)) { $d = Split-Path -Parent $d }
    while ($d -and -not (Test-Path -LiteralPath $d -PathType Container)) { $d = Split-Path -Parent $d }
    return $d
}

# ---------------------------------------------------------------- pointer, brain, config

# Returns @{ pointer; path; brain; root; warning }. pointer is $null when the file is absent or
# unreadable; an unreadable file sets warning so the caller can surface it instead of guessing.
function Read-DfPointer {
    $path = Get-DfPointerPath
    $r = @{ pointer = $null; path = $path; brain = $null; root = $null; warning = $null }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $r }
    try {
        $p = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
        $r.pointer = $p
        if ($p.brain) { $r.brain = ConvertTo-DfFullPath ([string]$p.brain) }
        if ($p.root)  { $r.root  = ConvertTo-DfFullPath ([string]$p.root) }
    } catch {
        $r.warning = "pointer at $path could not be parsed: $($_.Exception.Message)"
    }
    return $r
}

# Expands ${ROOT} / ${BRAIN} / %USERPROFILE%; a bare relative path is root-relative (SPEC 5.3).
function Expand-DfConfigPath([string]$p, [string]$root, [string]$brain) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $null }
    $s = $p.Replace('${ROOT}', [string]$root).Replace('${BRAIN}', [string]$brain)
    $s = $s.Replace('%USERPROFILE%', $env:USERPROFILE)
    $s = $s -replace '/', '\'
    if (-not [IO.Path]::IsPathRooted($s)) {
        if ([string]::IsNullOrWhiteSpace($root)) { return $null }
        $s = Join-Path $root $s
    }
    return (ConvertTo-DfFullPath $s)
}

# Brain config, or $null when there is no brain (no pointer, no folder, or no config file).
# Returns @{ protected = full paths; exceptions = full paths; reason = why null }.
function Read-DfBrainConfig($ptr) {
    $out = @{ protected = @(); exceptions = @(); present = $false; reason = $null }
    if ($null -eq $ptr.pointer) { $out.reason = "no pointer at $($ptr.path)"; return $out }
    if (-not $ptr.brain -or -not (Test-Path -LiteralPath $ptr.brain -PathType Container)) {
        $out.reason = "brain folder missing: $($ptr.brain)"; return $out
    }
    $cfgPath = Join-Path $ptr.brain 'doctor.config.json'
    if (-not (Test-Path -LiteralPath $cfgPath -PathType Leaf)) { $out.reason = "no doctor.config.json in $($ptr.brain)"; return $out }
    $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding utf8 | ConvertFrom-Json
    $out.present = $true
    foreach ($k in 'frozenPaths', 'tombstonedPaths') {
        foreach ($p in @($cfg.$k)) { $f = Expand-DfConfigPath ([string]$p) $ptr.root $ptr.brain; if ($f) { $out.protected += $f } }
    }
    foreach ($e in @($cfg.secretExceptions)) { $f = Expand-DfConfigPath ([string]$e) $ptr.root $ptr.brain; if ($f) { $out.exceptions += $f } }
    return $out
}

# ASCII fold for names the console might mangle (SPEC 5.4: ASCII fallback for non-ASCII names).
function ConvertTo-DfAscii([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return $s }
    if (-not ($s.ToCharArray() | Where-Object { [int]$_ -gt 127 })) { return $s }
    $d = $s.Normalize([Text.NormalizationForm]::FormD)
    $sb = [Text.StringBuilder]::new()
    foreach ($ch in $d.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -eq [Globalization.UnicodeCategory]::NonSpacingMark) { continue }
        if ([int]$ch -gt 127) { [void]$sb.Append('?') } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

# owner.name from <brain>/me.md YAML front-matter; "the owner" when absent.
function Get-DfOwnerName([string]$brain) {
    $fallback = 'the owner'
    if (-not $brain) { return $fallback }
    $me = Join-Path $brain 'me.md'
    if (-not (Test-Path -LiteralPath $me -PathType Leaf)) { return $fallback }
    try {
        $lines = Get-Content -LiteralPath $me -Encoding utf8 -TotalCount 60
        if ($lines.Count -lt 3 -or $lines[0].Trim() -ne '---') { return $fallback }
        $inOwner = $false
        for ($i = 1; $i -lt $lines.Count; $i++) {
            $l = $lines[$i]
            if ($l.Trim() -eq '---') { break }
            if ($l -match '^owner\.name\s*:\s*(.+)$') { return (ConvertTo-DfAscii $Matches[1].Trim().Trim('"', "'")) }
            if ($l -match '^owner\s*:\s*$') { $inOwner = $true; continue }
            if ($inOwner -and $l -match '^\s+name\s*:\s*(.+)$') { return (ConvertTo-DfAscii $Matches[1].Trim().Trim('"', "'")) }
            if ($inOwner -and $l -match '^\S') { $inOwner = $false }
        }
    } catch { }
    return $fallback
}

# Once-per-session marker. Returns $true the first time it is called for ($sessionId, $kind).
function Test-DfFirstTime([string]$sessionId, [string]$kind) {
    if ([string]::IsNullOrWhiteSpace($sessionId)) { $sessionId = 'unknown' }
    $dir = Get-DfMarkerDir
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $safe = ($sessionId -replace '[^A-Za-z0-9_.-]', '_')
    $marker = Join-Path $dir "$safe.$kind"
    if (Test-Path -LiteralPath $marker) { return $false }
    Set-Content -LiteralPath $marker -Value (Get-DfIso) -Encoding utf8
    return $true
}

# Runs git with the given arguments in $dir; returns @{ code; out }. stderr is discarded on
# purpose: exit codes 1 and 128 are answers here, not failures.
function Invoke-DfGit([string]$dir, [string[]]$gitArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & git -C $dir @gitArgs 2>$null
        return @{ code = $LASTEXITCODE; out = $out }
    } finally { $ErrorActionPreference = $prev }
}
