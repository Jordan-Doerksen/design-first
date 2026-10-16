# entry.ps1 - design-first SessionStart hook (startup | resume | clear | compact).
#
# Puts the brain's entry path in front of the agent on turn one. Plain stdout becomes session
# context. Read-mostly: it writes only the heartbeat, the pointer's pluginRoot, and housekeeping
# of its own markers and log.
#   1. Refresh pointer.pluginRoot from CLAUDE_PLUGIN_ROOT when the running plugin's kind matches
#      pointer.pluginKind (checkout = not under a plugins\cache folder; cache = under one).
#      A mismatch is a dual install: warn once per session, leave the pointer alone.
#   2. Heartbeat <brain>/state/last-session.json.
#   3. On a compaction or a clear, delete this session's route file. Delete the marker files of
#      every other session none of whose files was written for a day; truncate the hooks log to 90 days.
#   4. cwd under root: print <brain>/entry.json in order, MISSING: for absent files, never skip.
#      "kit:" entries resolve under pointer.pluginRoot (the kit the brain's LAW.md and Doctor
#      run from; the running plugin root when the pointer has none), "brain:" under the brain.
#      Outside root: one line. No pointer: the /design-first:adopt line.
#   5. cwd inside a repository whose top-level folder the route policy maps to a state-card group
#      (a game repository), or, with stateCard.anyRepoWithHandoff on, inside any repository under
#      root that holds HANDOFF.md or docs\HANDOFF.md: print the state card built from its documents
#      and git (GAME-13, DES-14, lib\state-card.ps1).
# Output is buffered and printed once, so an internal error can still answer as JSON on both
# channels with the ERROR logged.
#
# anchor: entry-path  mode: advise  verbs: load-context

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$lines = [Collections.Generic.List[string]]::new()

function Get-PluginKind([string]$path) {
    if ($path -match '(?i)[\\/]plugins[\\/]cache([\\/]|$)') { return 'cache' }
    return 'checkout'
}

# Entry forms (templates/entry.json): "kit:<rel>" is under the kit root, "brain:<rel>" is under
# the brain. The older forms still work: ${ROOT}, ${BRAIN}, %USERPROFILE%, and a bare relative
# path, which is brain-relative. Only those two words are prefixes; "C:\x" has a colon too and
# must stay a rooted path. Returns $null when an entry cannot be resolved at all.
# 2026-10-07: before this, both prefixes fell through to Join-Path against the brain and every
# prefixed entry printed as MISSING: C:\...\AI-Brain\kit:instructions\... The self-test fixture
# only used the older forms, so it never caught it.
function Expand-EntryPath([string]$p, $ptr, [string]$kitRoot) {
    $s = $p.Trim()
    if ($s -match '^(kit|brain):(.*)$') {
        $base = if ($Matches[1] -ieq 'kit') { $kitRoot } else { [string]$ptr.brain }
        $rel  = ($Matches[2] -replace '/', '\').TrimStart('\')
        if ([string]::IsNullOrWhiteSpace($base) -or [string]::IsNullOrWhiteSpace($rel)) { return $null }
        return (ConvertTo-DfFullPath (Join-Path $base $rel))
    }
    $s = $s.Replace('${ROOT}', [string]$ptr.root).Replace('${BRAIN}', [string]$ptr.brain).Replace('%USERPROFILE%', $env:USERPROFILE)
    $s = $s -replace '/', '\'
    if (-not [IO.Path]::IsPathRooted($s)) { $s = Join-Path $ptr.brain $s }
    return (ConvertTo-DfFullPath $s)
}

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')

    $raw = ''
    try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { }
    $j = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $j = $raw | ConvertFrom-Json } catch { $j = $null } }
    $sessionId = if ($j -and $j.session_id) { [string]$j.session_id } else { 'unknown' }
    $source    = if ($j -and $j.source) { [string]$j.source } else { 'unknown' }
    $cwd       = if ($j -and $j.cwd) { ConvertTo-DfFullPath ([string]$j.cwd) } else { (Get-Location).Path }

    # Unexpanded variable: the literal string means the host did not substitute it (C4, finding 81).
    $pluginRootEnv = [string]$env:CLAUDE_PLUGIN_ROOT
    if ($pluginRootEnv -like '*${CLAUDE_PLUGIN_ROOT}*' -or $PSScriptRoot -like '*${CLAUDE_PLUGIN_ROOT}*') {
        Write-DfLog 'ERROR' 'entry' 'CLAUDE_PLUGIN_ROOT arrived unexpanded (literal ${CLAUDE_PLUGIN_ROOT})'
        $lines.Add('design-first: ERROR - CLAUDE_PLUGIN_ROOT arrived unexpanded; logged.')
        $pluginRootEnv = ''
    }

    $ptr = Read-DfPointer
    if ($ptr.warning) { Write-DfLog 'ERROR' 'entry' $ptr.warning; $lines.Add("design-first: ERROR - $($ptr.warning)") }

    if ($null -eq $ptr.pointer) {
        $lines.Add("design-first: no brain is set up on this profile (no pointer at $($ptr.path)). Run /design-first:adopt to create one.")
    }
    else {
        # 1. pluginRoot refresh, kind-checked (findings 43, 84, 85).
        if ($pluginRootEnv) {
            $runningRoot = ConvertTo-DfFullPath $pluginRootEnv
            $runningKind = Get-PluginKind $runningRoot
            $recordedKind = [string]$ptr.pointer.pluginKind
            if (-not $recordedKind) { $recordedKind = $runningKind }
            if ($runningKind -eq $recordedKind) {
                $recorded = if ($ptr.pointer.pluginRoot) { ConvertTo-DfFullPath ([string]$ptr.pointer.pluginRoot) } else { $null }
                if ($recorded -ne $runningRoot -or [string]$ptr.pointer.pluginKind -ne $runningKind) {
                    $ptr.pointer.pluginRoot = $runningRoot
                    if ($ptr.pointer.PSObject.Properties['pluginKind']) { $ptr.pointer.pluginKind = $runningKind }
                    else { $ptr.pointer | Add-Member -NotePropertyName pluginKind -NotePropertyValue $runningKind }
                    $ptr.pointer | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ptr.path -Encoding utf8NoBOM
                }
            }
            elseif (Test-DfFirstTime $sessionId 'kindwarned') {
                Write-DfLog 'WARN' 'entry' "plugin kind mismatch: pointer says $recordedKind, running plugin is $runningKind at $runningRoot"
                $lines.Add("design-first: WARNING - the pointer records a '$recordedKind' install but this session runs a '$runningKind' install ($runningRoot). Two installs on one profile is unsupported; the pointer was left unchanged.")
            }
        }

        # 2. heartbeat
        $brainOk = $ptr.brain -and (Test-Path -LiteralPath $ptr.brain -PathType Container)
        if ($brainOk) {
            $stateDir = Join-Path $ptr.brain 'state'
            if (-not (Test-Path -LiteralPath $stateDir)) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }
            [ordered]@{ when = Get-DfIso; session_id = $sessionId; source = $source; cwd = $cwd; pluginRoot = [string]$ptr.pointer.pluginRoot } |
                ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'last-session.json') -Encoding utf8NoBOM
        }
        else { $lines.Add("design-first: WARNING - brain folder missing: $($ptr.brain). Heartbeat and entry path skipped.") }

        # 3a. compaction or clear: forget this session's routes so the next prompt re-injects its law
        # (DES-13). A clear empties the context as a compaction does (CR-2026-10-15-GAPS D5; a clear
        # used to keep the routes). The delete is keyed by the session id the host reports; when the
        # host gives a clear a new id, there is no route file under it and nothing to delete. No kit
        # file records which the host does, so a clear logs one INFO line that says what it found.
        if ($source -in @('compact', 'clear')) {
            $routeFile = Join-Path (Get-DfMarkerDir) ((($sessionId -replace '[^A-Za-z0-9_.-]', '_')) + '.routes')
            $hadRoutes = Test-Path -LiteralPath $routeFile
            if ($hadRoutes) { Remove-Item -LiteralPath $routeFile -Force -ErrorAction SilentlyContinue }
            if ($source -eq 'clear') {
                Write-DfLog 'INFO' 'entry' ("clear: session {0} {1}" -f $sessionId, $(if ($hadRoutes) { 'had a route file, so the host kept the session id; routes deleted' } else { 'had no route file (a new session id, or nothing routed yet)' }))
            }
        }
        # 3. housekeeping: the marker files of a session none of whose files was written for a day, and
        # never the starting session's own. A file is named "<session>.<kind>"; the session is the part
        # before the first dot. Workaround (CR-2026-10-15-GAPS D5): every marker older than a day was
        # deleted, a live session's too, so a session resumed after a day lost its interview marker and
        # the Stop card said "no question was asked this session" when one was, and its routes came again.
        $markerDir = Get-DfMarkerDir
        if (Test-Path -LiteralPath $markerDir) {
            $cut = (Get-Date).AddDays(-1)
            $own = ($sessionId -replace '[^A-Za-z0-9_.-]', '_') + '.'
            $bySession = Get-ChildItem -LiteralPath $markerDir -File |
                Where-Object { -not $_.Name.StartsWith($own, [StringComparison]::OrdinalIgnoreCase) } |
                Group-Object { ($_.Name -split '\.', 2)[0] }
            foreach ($grp in $bySession) {
                if (@($grp.Group | Where-Object { $_.LastWriteTime -ge $cut }).Count -gt 0) { continue }   # written within the day: live
                $grp.Group | Remove-Item -Force -ErrorAction SilentlyContinue
            }
        }
        $logPath = Get-DfLogPath
        if (Test-Path -LiteralPath $logPath -PathType Leaf) {
            $cut = [DateTimeOffset]::Now.AddDays(-90)
            $all = Get-Content -LiteralPath $logPath -Encoding utf8
            $keep = @($all | Where-Object {
                # Lines without a parseable ISO stamp are kept; only dated lines older than 90 days go.
                # The [ref] target must be typed, or PowerShell cannot pick the TryParse overload.
                [DateTimeOffset]$d = [DateTimeOffset]::MinValue
                if ($_ -match '^(\S+)\s' -and [DateTimeOffset]::TryParse($Matches[1], [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$d)) { $d -ge $cut } else { $true }
            })
            if ($keep.Count -lt @($all).Count) { Set-Content -LiteralPath $logPath -Value $keep -Encoding utf8 }
        }

        # 4. the entry path
        if ($brainOk) {
            if ($ptr.root -and (Test-DfUnder $cwd $ptr.root)) {
                $entryFile = Join-Path $ptr.brain 'entry.json'
                $lines.Add("design-first: entry path (brain $($ptr.brain)). Read these in order before the first build or edit task; say which you read.")
                if (-not (Test-Path -LiteralPath $entryFile -PathType Leaf)) { $lines.Add("MISSING: $entryFile") }
                else {
                    $entry = Get-Content -LiteralPath $entryFile -Raw -Encoding utf8 | ConvertFrom-Json
                    $items = if ($entry.PSObject.Properties['entries']) { @($entry.entries) } else { @($entry) }
                    # Kit root for "kit:" entries: the pointer's pluginRoot first (the kit of record), else
                    # the plugin this hook is running from (hooks\ is one level under the plugin root).
                    $kitRoot = if ($ptr.pointer.pluginRoot) { ConvertTo-DfFullPath ([string]$ptr.pointer.pluginRoot) } else { ConvertTo-DfFullPath (Split-Path -Parent $PSScriptRoot) }
                    $n = 0
                    foreach ($it in $items) {
                        $n++
                        $rel  = if ($it -is [string]) { $it } else { [string]$it.path }
                        $note = if ($it -is [string]) { '' } elseif ($it.note) { [string]$it.note } elseif ($it.why) { [string]$it.why } else { '' }
                        $full = Expand-EntryPath $rel $ptr $kitRoot
                        $suffix = if ($note) { " - $note" } else { '' }
                        if ($full -and (Test-Path -LiteralPath $full -PathType Leaf)) { $lines.Add(" $n. $full$suffix") }
                        elseif ($full) { $lines.Add(" $n. MISSING: $full$suffix") }
                        else { $lines.Add(" $n. MISSING: $rel (could not be resolved)$suffix") }
                    }
                    if ($n -eq 0) { $lines.Add(" (entry.json lists no files)") }
                }
                # 5. the state card (GAME-13, DES-14): which repositories get one is item 5 at the
                #    top of this file. A failure here must not cost the session its entry path, so
                #    it is caught, logged and said.
                try {
                    . (Join-Path $PSScriptRoot 'lib\law-rows.ps1')
                    . (Join-Path $PSScriptRoot 'lib\state-card.ps1')
                    foreach ($cl in @(Get-DfStateCardLines $cwd $ptr)) { $lines.Add([string]$cl) }
                } catch {
                    Write-DfLog 'ERROR' 'entry' "state card failed: $($_.Exception.Message)"
                    $lines.Add("design-first: the state card could not be built ($($_.Exception.Message)); logged. Build it by hand from the repository's documents (GAME-13).")
                }
            }
            else {
                $lines.Add("design-first: session is outside root ($($ptr.root)); entry path not loaded.")
            }
        }
    }
    foreach ($l in $lines) { Write-Output $l }
}
catch {
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR entry {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    $body = ("entry hook hit an internal error: $msg. Logged to the design-first hooks log. Partial output:`n" + ($lines -join "`n")).TrimEnd()
    @{
        systemMessage      = "ENTRY: internal error ($msg)"
        hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $body }
    } | ConvertTo-Json -Depth 5 -Compress
}
exit 0
