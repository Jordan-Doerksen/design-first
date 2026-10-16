# cases-truth.ps1 - hook self-test cases for the places where the Stop card or a session marker said
# something false, or a count passed silently (CR-2026-10-15-GAPS D5). Dot-sourced by run.ps1 after
# cases-gate.ps1. It reads these names from run.ps1's scope: $T, $root, $brain, $kit, $hooks, NewRepo,
# Put, RunGit, Record, Classify, Invoke-Hook, Route, Stop, Entry and Ledger. Never run directly.
#
# Each block names the fix it holds and what the hook did before it:
#   1  the Change Log flag counts only ADDED dated rows. A Write that kept an old row, or an Edit
#      that reworded one, was flagged as a new entry, git's diff took a reworded row for a new one,
#      and the ledger flag overrode git, so the GATE-06 line never appeared. git now decides for a
#      file it lists; the rows of a file staged before the first commit all count as added.
#   2  the docs test reads the path inside the repository, and a source extension wins. A repository
#      below any folder named docs got no card at all; docs\build.ps1 was a document.
#   3  a repository past the git status cap is carded, its count called a floor. The capped flag was
#      set and never read, so a change past the cap passed without a word.
#   4  a time budget, a guard-error count and an earlier turn reset. The host ended a slow Stop hook
#      without a word; a call the guard failed on vanished from the card, also when a guard library
#      failed to load before the call was read; a router whose libraries failed to load left the
#      last turn's record in place.
#   5  housekeeping keeps a live session's markers. A session resumed after a day lost its interview
#      marker, and the card said no question was asked when one was.
#   6  a clear deletes the session's routes, as a compaction does.
#   7  a skill counts as named only once it printed, and prints alone when no group fits. It was
#      marked before printing and lost for the session when it did not print.
#   8  a call with no question writes no interview marker.
#   9  every card asks the Change Request question (GATE-06) and names GATE-06 on its first line,
#      with or without the Change Log line. A fix round named GATE-06 only with the Change Log
#      line, so a behaviour change that did not touch DECISIONS.md got no GATE-06 at all (second
#      CR-2026-10-15-GAPS review); with that change put back, cases 9a and 9c fail, and with the
#      question line taken out, 9a, 9b and 9c fail.
# Run against the seven hook files of 9409b1c (2026-10-15), 32 of the 38 cases in blocks 1-8 fail. Of the 6 that
# pass there, 4 hold the other side: a Write that adds a row is flagged, a row added in git is no
# GATE-06 line, an idle session's markers go, and a skill that printed is marked. 2 hold this
# chunk's own changes against a regression: a row staged before the first commit (the old ledger
# flag covered it; git's count must now), and a stopBudgetSeconds of 0 (it must keep the default).

function TtVerdict($r) {
    if ($r.code -ne 0) { return "exit$($r.code)" }
    if ([string]::IsNullOrWhiteSpace($r.out)) { return 'silent' }
    try { $j = $r.out | ConvertFrom-Json } catch { return 'bad-output' }
    if ($j.decision -eq 'block') { return 'block' }
    if ($j.systemMessage -and -not $j.hookSpecificOutput) { return 'notice' }
    return (Classify $r.out)
}
function TtGuard([string]$session, [string]$cwd, [string]$tool, $ti) {
    return (Invoke-Hook 'guard.ps1' (@{ session_id = $session; cwd = $cwd; hook_event_name = 'PreToolUse'; tool_name = $tool; tool_input = $ti } | ConvertTo-Json -Compress -Depth 5))
}
function TtMarker([string]$session, [string]$ext) { return (Join-Path $env:DF_MARKER_DIR ($session + $ext)) }
function TtText([string]$path) { if (Test-Path -LiteralPath $path -PathType Leaf) { return [string](Get-Content -LiteralPath $path -Raw) } else { return '' } }
function TtLogSince([int]$from) { $t = TtText $env:DF_LOG_PATH; if ($t.Length -gt $from) { return $t.Substring($from) } else { return '' } }
function TtOld([string]$path) { (Get-Item -LiteralPath $path).LastWriteTime = (Get-Date).AddDays(-2) }
$ttCfgPath = Join-Path $brain 'doctor.config.json'
function TtSetConfig([string]$key, $value) {
    $o = (TtText $ttCfgPath) | ConvertFrom-Json
    $o | Add-Member -NotePropertyName $key -NotePropertyValue $value -Force
    Put $ttCfgPath ($o | ConvertTo-Json -Depth 6)
}

# ------------------------------------------------------------------ 1. the Change Log flag
Write-Host '-- truth D5-1: the Change Log flag counts only added dated rows'
$clRepo = NewRepo 'repo-tr-rows'
$clHead = "# Decisions`n`n## Change Log`n`n| Date | Change |`n|---|---|`n"
$clOld  = $clHead + "| 2026-01-01 | Manifest created |`n"
Put (Join-Path $clRepo 'DECISIONS.md') $clOld
Put (Join-Path $clRepo 'src\app.py') 'a = 1'
RunGit $clRepo @('add', '-A'); RunGit $clRepo @('commit', '-q', '-m', 'init')
$clDecisions = Join-Path $clRepo 'DECISIONS.md'
$clSrc = Join-Path $clRepo 'src\app.py'
$clKept     = "# Decisions`n`nA decision reworded.`n`n## Change Log`n`n| Date | Change |`n|---|---|`n| 2026-01-01 | Manifest created |`n"
$clReworded = $clHead + "| 2026-01-01 | Manifest created, reworded |`n"
$clAdded    = $clOld + "| 2026-10-15 | A new decision |`n"

# 1a. the ledger alone (no prompt time on record, so the card counts Edit and Write calls)
$null = TtGuard 'tr-cl-w' $clRepo 'Write' @{ file_path = $clDecisions; content = $clKept }
$null = TtGuard 'tr-cl-w' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 1'; new_string = 'a = 2' }
$led = TtText (Ledger 'tr-cl-w')
Record 'truth D5-1: a Write of DECISIONS.md that keeps its old rows is not flagged' 'unflagged' $(if ($led -match 'DECISIONS\.md\t\r?\n' -and $led -notmatch '\tchangelog') { 'unflagged' } else { 'flagged' }) $led
$r = Stop 'tr-cl-w' $false
Record 'truth D5-1: that Write, from the ledger -> the GATE-06 line' 'gate06' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*no Change Log row*') { 'gate06' } else { "quiet:$(TtVerdict $r)" }) $r.out
$null = TtGuard 'tr-cl-e' $clRepo 'Edit' @{ file_path = $clDecisions; old_string = '| 2026-01-01 | Manifest created |'; new_string = '| 2026-01-01 | Manifest created, reworded |' }
$null = TtGuard 'tr-cl-e' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 1'; new_string = 'a = 2' }
$led = TtText (Ledger 'tr-cl-e')
Record 'truth D5-1: an Edit that rewords an old row is not flagged' 'unflagged' $(if ($led -like '*DECISIONS.md*' -and $led -notmatch '\tchangelog') { 'unflagged' } else { 'flagged' }) $led
$r = Stop 'tr-cl-e' $false
Record 'truth D5-1: that Edit, from the ledger -> the GATE-06 line' 'gate06' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*no Change Log row*') { 'gate06' } else { "quiet:$(TtVerdict $r)" }) $r.out
$null = TtGuard 'tr-cl-a' $clRepo 'Write' @{ file_path = $clDecisions; content = $clAdded }
$null = TtGuard 'tr-cl-a' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 1'; new_string = 'a = 2' }
$led = TtText (Ledger 'tr-cl-a')
Record 'truth D5-1: a Write that adds a dated row is flagged (the other side)' 'flagged' $(if ($led -match 'DECISIONS\.md\tchangelog') { 'flagged' } else { 'unflagged' }) $led

# 1b. git reads the turn: each case writes the file on the disk as the tool would, then commits it
# so the next case starts from a clean tree.
function TtClTurn([string]$session, [string]$tool, $ti, [string]$content) {
    $null = Route 'reword the decisions' $session $root
    $null = TtGuard $session $clRepo $tool $ti
    Put $clDecisions $content
    Put $clSrc ("a = '{0}'" -f $session)
    $r = Stop $session $false
    RunGit $clRepo @('add', '-A'); RunGit $clRepo @('commit', '-q', '-m', $session)
    return $r
}
$r = TtClTurn 'tr-cl-gw' 'Write' @{ file_path = $clDecisions; content = $clKept } $clKept
Record 'truth D5-1: git, a Write that keeps the old rows -> the GATE-06 line' 'gate06' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*no Change Log row*') { 'gate06' } else { "quiet:$(TtVerdict $r)" }) $r.out
$r = TtClTurn 'tr-cl-ge' 'Edit' @{ file_path = $clDecisions; old_string = '| 2026-01-01 | Manifest created |'; new_string = '| 2026-01-01 | Manifest created, reworded |' } ($clKept -replace 'Manifest created', 'Manifest created, reworded')
Record 'truth D5-1: git, an Edit that rewords an old row -> the GATE-06 line' 'gate06' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*no Change Log row*') { 'gate06' } else { "quiet:$(TtVerdict $r)" }) $r.out
$clNow = TtText $clDecisions
$r = TtClTurn 'tr-cl-ga' 'Write' @{ file_path = $clDecisions; content = ($clNow + "| 2026-10-15 | A new decision |`n") } ($clNow + "| 2026-10-15 | A new decision |`n")
Record 'truth D5-1: git, a dated row added -> no GATE-06 line (the other side)' 'quiet' $(if ((TtVerdict $r) -eq 'block' -and $r.out -notlike '*no Change Log row*') { 'quiet' } else { "wrong:$(TtVerdict $r)" }) $r.out
# git decides over the ledger flag. The guard runs before the tool, so an Edit that adds a row is
# flagged even when the tool then rejects it (old_string not found); the file on the disk changed
# only in its prose, and git sees no added row.
$clNow = TtText $clDecisions
$r = TtClTurn 'tr-cl-stale' 'Edit' @{ file_path = $clDecisions; old_string = '## Change Log'; new_string = "## Change Log`n`n| 2026-10-15 | A row the tool never wrote |" } ($clNow -replace 'A decision reworded\.', 'A decision reworded again.')
Record 'truth D5-1: git, a flagged Edit whose row never reached the disk -> the GATE-06 line' 'gate06' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*no Change Log row*') { 'gate06' } else { "quiet:$(TtVerdict $r)" }) $r.out
# A repository with no commit yet: the turn writes DECISIONS.md with a dated row and stages it. git
# lists the file but has no HEAD to diff it against, so every row in it is an added row.
$unRepo = NewRepo 'repo-tr-unborn'
$unDecisions = Join-Path $unRepo 'DECISIONS.md'
$null = Route 'start the repository' 'tr-cl-unborn' $root
$null = TtGuard 'tr-cl-unborn' $unRepo 'Write' @{ file_path = $unDecisions; content = $clOld }
Put $unDecisions $clOld
Put (Join-Path $unRepo 'src\main.py') 'm = 1'
RunGit $unRepo @('add', '-A')
$r = Stop 'tr-cl-unborn' $false
Record 'truth D5-1: git, DECISIONS.md with a row staged before the first commit -> no GATE-06 line' 'quiet' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*repo-tr-unborn*' -and $r.out -notlike '*no Change Log row*') { 'quiet' } else { "wrong:$(TtVerdict $r)" }) $r.out

# ------------------------------------------------------------------ 2. the docs test
Write-Host '-- truth D5-2: the docs test reads the path inside the repository'
$inDocs = NewRepo 'docs\repo-tr-indocs'
Put (Join-Path $inDocs 'src\x.py') 'x = 1'
RunGit $inDocs @('add', '-A'); RunGit $inDocs @('commit', '-q', '-m', 'init')
Put (Ledger 'tr-docs-under') ((Join-Path $inDocs 'src\x.py') + "`t`n")
$r = Stop 'tr-docs-under' $false
Record 'truth D5-2: a repository below a folder named docs gets its card' 'block' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*repo-tr-indocs: 1 source file(s) changed*') { 'block' } else { TtVerdict $r }) $r.out
$docSrc = NewRepo 'repo-tr-docsrc'
Put (Join-Path $docSrc 'docs\build.ps1') 'Write-Output 1'
Put (Join-Path $docSrc 'docs\guide.md') '# guide'
RunGit $docSrc @('add', '-A'); RunGit $docSrc @('commit', '-q', '-m', 'init')
Put (Ledger 'tr-docs-src') ((Join-Path $docSrc 'docs\build.ps1') + "`t`n" + (Join-Path $docSrc 'docs\guide.md') + "`t`n")
$r = Stop 'tr-docs-src' $false
Record 'truth D5-2: a source-extension file under docs\ counts as source' 'source' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*repo-tr-docsrc: 1 source file(s) changed*') { 'source' } else { TtVerdict $r }) $r.out
Record 'truth D5-2: a Markdown file under docs\ is still a document' 'document' $(if ($r.out -like '*Documents touched: guide.md.*') { 'document' } else { 'missing' }) $r.out

# ------------------------------------------------------------------ 3. the git status cap
Write-Host '-- truth D5-3: a repository past the git status cap is carded as a floor'
$capRepo = NewRepo 'repo-tr-capped'
Put (Join-Path $capRepo 'README.md') 'capped'
RunGit $capRepo @('add', '-A'); RunGit $capRepo @('commit', '-q', '-m', 'init')
# 4001 untracked files written before the prompt: git status lists each, the hook reads the first 4000
# (Get-DfTurnChanges, cap 4000). The source file the turn writes sorts after them, past the cap.
$genDir = Join-Path $capRepo 'gen'
New-Item -ItemType Directory -Force -Path $genDir | Out-Null
foreach ($i in 1..4001) { [IO.File]::WriteAllText((Join-Path $genDir ('f{0:D4}.txt' -f $i)), 'g') }
$logFrom = (TtText $env:DF_LOG_PATH).Length
$null = Route 'generate the files' 'tr-cap' $root
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'tr-cap'; cwd = $capRepo; hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = @{ command = 'python tools/gen.py' } } | ConvertTo-Json -Compress)
Put (Join-Path $capRepo 'zz\new.py') 'n = 1'
$r = Stop 'tr-cap' $false
Record 'truth D5-3: a change past the git status cap is carded, not passed' 'block' (TtVerdict $r) $r.out
Record 'truth D5-3: the card calls that count a floor' 'floor' $(if ($r.out -like '*repo-tr-capped: 0 source file(s) changed*' -and $r.out -like '*more than 4000 entries here*this count is a floor*') { 'floor' } else { 'missing' }) $r.out
Record 'truth D5-3: the cap is logged as a WARN line' 'logged' $(if ((TtLogSince $logFrom) -like '*WARN stop git status in*repo-tr-capped listed more than 4000 entries*') { 'logged' } else { 'missing' }) (TtLogSince $logFrom)
Remove-Item -LiteralPath $genDir -Recurse -Force -ErrorAction SilentlyContinue

# ------------------------------------------------------------------ 4. the time budget, the guard-error count, the turn reset
Write-Host '-- truth D5-4: a short count says so'
$cfgSaved = TtText $ttCfgPath
TtSetConfig 'stopBudgetSeconds' 0.001   # spent before the first repository is read
$null = Route 'patch it' 'tr-bud1' $root
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'tr-bud1'; cwd = $clRepo; hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = @{ command = 'python tools/patch.py' } } | ConvertTo-Json -Compress)
Put $clSrc 'a = 3'
$logFrom = (TtText $env:DF_LOG_PATH).Length
$r = Stop 'tr-bud1' $false
Record 'truth D5-4: budget spent, nothing to card -> a notice naming the repository' 'notice' $(if ((TtVerdict $r) -eq 'notice' -and $r.out -like '*time budget*repo-tr-rows*') { 'notice' } else { TtVerdict $r }) $r.out
Record 'truth D5-4: the spent budget is logged as a WARN line' 'logged' $(if ((TtLogSince $logFrom) -like '*WARN stop time budget of*repo-tr-rows*') { 'logged' } else { 'missing' }) (TtLogSince $logFrom)
$null = Route 'edit it' 'tr-bud2' $root
$null = TtGuard 'tr-bud2' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 3'; new_string = 'a = 4' }
Put $clSrc 'a = 4'
$r = Stop 'tr-bud2' $false
Record 'truth D5-4: budget spent, an Edit in the ledger -> the card says git was not read' 'said' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*ran out before git was read here*') { 'said' } else { TtVerdict $r }) $r.out
# A carded repository and an unread one with nothing in the ledger: the card names the unread one.
$null = Route 'edit it' 'tr-bud3' $root
$null = TtGuard 'tr-bud3' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 4'; new_string = 'a = 41' }
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'tr-bud3'; cwd = $docSrc; hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = @{ command = 'pwsh -File docs/build.ps1' } } | ConvertTo-Json -Compress)
Put $clSrc 'a = 41'
$r = Stop 'tr-bud3' $false
Record 'truth D5-4: budget spent, the card names a repository it did not read' 'named' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*Not read: the time budget*repo-tr-docsrc*') { 'named' } else { TtVerdict $r }) $r.out
# A value outside (0, 18] keeps the default: 0 would spend the budget before the first repository.
TtSetConfig 'stopBudgetSeconds' 0
$null = Route 'edit it' 'tr-bud0' $root
$null = TtGuard 'tr-bud0' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 41'; new_string = 'a = 42' }
Put $clSrc 'a = 42'
$r = Stop 'tr-bud0' $false
Record 'truth D5-4: a stopBudgetSeconds of 0 keeps the default, so git is read' 'git' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*Read from git*' -and $r.out -notlike '*time budget*') { 'git' } else { TtVerdict $r }) $r.out
Put $ttCfgPath $cfgSaved
RunGit $clRepo @('add', '-A'); RunGit $clRepo @('commit', '-q', '-m', 'budget cases')

# the guard fails inside: the call is counted, the card says the count may be short
$null = Route 'edit it' 'tr-gerr' $root
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'tr-gerr'; cwd = $root; hook_event_name = 'PreToolUse'; tool_name = 'Edit' } | ConvertTo-Json -Compress)
$gerr = TtText (TtMarker 'tr-gerr' '.guard-error')
Record 'truth D5-4: a guard internal error is counted in <session>.guard-error' 'counted' $(if (@($gerr -split "`n" | Where-Object { $_.Trim() }).Count -eq 1 -and $gerr -like '*no tool_input*') { 'counted' } else { 'missing' }) $gerr
$r = Stop 'tr-gerr' $false
Record 'truth D5-4: guard failed, nothing recorded -> a notice, not a silent pass' 'notice' $(if ((TtVerdict $r) -eq 'notice' -and $r.out -like '*guard failed on 1 call(s)*') { 'notice' } else { TtVerdict $r }) $r.out
$null = TtGuard 'tr-gerr' $clRepo 'Edit' @{ file_path = $clSrc; old_string = 'a = 4'; new_string = 'a = 5' }
Put $clSrc 'a = 5'
$r = Stop 'tr-gerr' $false
Record 'truth D5-4: guard failed, a source edit recorded -> the card says the count may be short' 'said' $(if ((TtVerdict $r) -eq 'block' -and $r.out -like '*guard failed on 1 call(s)*may be short*') { 'said' } else { TtVerdict $r }) $r.out
RunGit $clRepo @('add', '-A'); RunGit $clRepo @('commit', '-q', '-m', 'guard-error cases')
Put (TtMarker 'tr-gerr2' '.guard-error') "2026-10-15T00:00:00Z`tleft by the last turn`n"
$null = Route 'next' 'tr-gerr2' $root
Record 'truth D5-4: a new prompt clears the guard-error count' 'cleared' $(if (-not (Test-Path -LiteralPath (TtMarker 'tr-gerr2' '.guard-error'))) { 'cleared' } else { 'kept' }) ''

# the router resets the turn before its libraries load: a copy of the hooks with a library that throws
$brokenHooks = Join-Path $T 'hooks-broken'
Copy-Item -LiteralPath $hooks -Destination $brokenHooks -Recurse -Force
Set-Content -LiteralPath (Join-Path $brokenHooks 'lib\law-rows.ps1') -Value "throw 'law-rows.ps1 broken on purpose (cases-truth fixture)'" -Encoding utf8
Put (TtMarker 'tr-rbroken' '.edits') ((Join-Path $clRepo 'src\app.py') + "`t`n")
Put (TtMarker 'tr-rbroken' '.repos') ($clRepo + "`tnone`n")
Put (TtMarker 'tr-rbroken' '.turn') '2026-01-01T00:00:00.0000000+00:00'
$stdin = @{ session_id = 'tr-rbroken'; cwd = $root; hook_event_name = 'UserPromptSubmit'; prompt_id = 'p'; prompt = 'commit it' } | ConvertTo-Json -Compress
$prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
try { $rb = @($stdin | & pwsh -NoProfile -File (Join-Path $brokenHooks 'route.ps1') 2>&1 | ForEach-Object { [string]$_ }) -join "`n" } finally { $ErrorActionPreference = $prev }
$turnNow = (TtText (TtMarker 'tr-rbroken' '.turn')).Trim()
Record 'truth D5-4: a router whose library fails still starts the turn' 'reset' $(if ($rb -like '*internal error*' -and -not (Test-Path -LiteralPath (TtMarker 'tr-rbroken' '.edits')) -and -not (Test-Path -LiteralPath (TtMarker 'tr-rbroken' '.repos')) -and $turnNow -notlike '2026-01-01*') { 'reset' } else { 'kept' }) ("out: $rb | turn: $turnNow")
# The guard fails while it loads a library, before it has read the call: the call still counts under its session.
Set-Content -LiteralPath (Join-Path $brokenHooks 'lib\guard-loop-rules.ps1') -Value "throw 'guard-loop-rules.ps1 broken on purpose (cases-truth fixture)'" -Encoding utf8
$stdin = @{ session_id = 'tr-gerr-lib'; cwd = $clRepo; hook_event_name = 'PreToolUse'; tool_name = 'Edit'; tool_input = @{ file_path = $clSrc; old_string = 'a'; new_string = 'b' } } | ConvertTo-Json -Compress
$prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
try { $gb = @($stdin | & pwsh -NoProfile -File (Join-Path $brokenHooks 'guard.ps1') 2>&1 | ForEach-Object { [string]$_ }) -join "`n" } finally { $ErrorActionPreference = $prev }
$gerr = TtText (TtMarker 'tr-gerr-lib' '.guard-error')
Record 'truth D5-4: a guard whose library fails counts the call under its session' 'counted' $(if ($gb -like '*internal error*' -and $gerr -like '*broken on purpose*') { 'counted' } else { 'missing' }) ("out: $gb | marker: $gerr")

# ------------------------------------------------------------------ 5. housekeeping keeps a live session's markers
Write-Host '-- truth D5-5: housekeeping keeps a live session''s markers'
Put (TtMarker 'tr-live' '.asked') '2026-10-13T00:00:00Z'; TtOld (TtMarker 'tr-live' '.asked')
$null = Entry $root 'tr-live' 'resume'
Record 'truth D5-5: a session resumed after a day keeps its own interview marker' 'kept' $(if (Test-Path -LiteralPath (TtMarker 'tr-live' '.asked')) { 'kept' } else { 'deleted' }) ''
Put (TtMarker 'tr-busy' '.asked') '2026-10-13T00:00:00Z'; TtOld (TtMarker 'tr-busy' '.asked')
Put (TtMarker 'tr-busy' '.turn') (Get-Date).ToString('o')
Put (TtMarker 'tr-idle' '.asked') '2026-10-13T00:00:00Z'; TtOld (TtMarker 'tr-idle' '.asked')
Put (TtMarker 'tr-idle' '.turn') '2026-10-13T00:00:00Z'; TtOld (TtMarker 'tr-idle' '.turn')
$null = Entry $root 'tr-other' 'startup'
Record 'truth D5-5: another session that wrote a marker within the day keeps its old ones' 'kept' $(if (Test-Path -LiteralPath (TtMarker 'tr-busy' '.asked')) { 'kept' } else { 'deleted' }) ''
Record 'truth D5-5: a session idle for a day loses its markers (the other side)' 'deleted' $(if (-not (Test-Path -LiteralPath (TtMarker 'tr-idle' '.asked')) -and -not (Test-Path -LiteralPath (TtMarker 'tr-idle' '.turn'))) { 'deleted' } else { 'kept' }) ''

# ------------------------------------------------------------------ 6. a clear deletes the session's routes
Write-Host '-- truth D5-6: a clear deletes the session''s routes'
$null = Route 'commit it' 'tr-clear' $root
$hadRoutes = Test-Path -LiteralPath (TtMarker 'tr-clear' '.routes')
$logFrom = (TtText $env:DF_LOG_PATH).Length
$null = Entry $root 'tr-clear' 'clear'
Record 'truth D5-6: a clear deletes the session''s routes' 'cleared' $(if ($hadRoutes -and -not (Test-Path -LiteralPath (TtMarker 'tr-clear' '.routes'))) { 'cleared' } else { "kept (had: $hadRoutes)" }) ''
Record 'truth D5-6: a clear logs what it found under the session id' 'logged' $(if ((TtLogSince $logFrom) -like '*INFO entry clear: session tr-clear had a route file*') { 'logged' } else { 'missing' }) (TtLogSince $logFrom)
$r = Route 'commit it' 'tr-clear' $root
Record 'truth D5-6: after a clear the group is injected again' 'vcs-again' $(if ($r.out -match 'group VCS') { 'vcs-again' } else { 'silent' }) $r.out

# ------------------------------------------------------------------ 7. a skill is named once it printed
Write-Host '-- truth D5-7: a skill counts as named only once it printed'
$polPath = Join-Path $brain 'route-policy.json'
function TtPolicy([int]$maxChars) {
    $p = Get-Content -LiteralPath (Join-Path $kit 'templates\route-policy.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $p.maxChars = $maxChars
    Put $polPath ($p | ConvertTo-Json -Depth 10)
}
# The sandbox skill is run.ps1's (root\.claude\skills\sandbox-skill, "pitchsite").
TtPolicy 200   # every group is over the cap
$r = Route 'make a pitchsite for the shop' 'tr-sk1' $root
Record 'truth D5-7: no group fits under the cap -> the skill prints alone' 'named' $(if ($r.out -match 'design-first skills \(DES-12\)' -and $r.out -match 'sandbox-skill: Build a pitchsite' -and $r.out -notmatch 'group OWN') { 'named' } else { 'silent' }) $r.out
Record 'truth D5-7: a skill that printed is marked as named' 'marked' $(if ((TtText (TtMarker 'tr-sk1' '.skills')) -like '*sandbox-skill*') { 'marked' } else { 'unmarked' }) ''
# Measure where the skill block starts when everything fits, then set the cap just past the groups.
Remove-Item -LiteralPath $polPath -Force
$m = Route 'make a pitchsite and commit it' 'tr-sk-measure' $root
$at = $m.out.IndexOf('design-first skills')
if ($at -lt 0) {
    Record 'truth D5-7: the measuring prompt names the skill' 'named' 'silent' $m.out
} else {
    # The hook counts CRLF line ends; the captured text has LF. Add one per line before the block.
    $cap = $at + ([regex]::Matches($m.out.Substring(0, $at), "`n")).Count + 20
    TtPolicy $cap
    $r = Route 'make a pitchsite and commit it' 'tr-sk2' $root
    Remove-Item -LiteralPath $polPath -Force
    Record 'truth D5-7: groups print, the skill block does not fit and is not marked' 'unmarked' $(if ($r.out -match 'group VCS' -and $r.out -notmatch 'sandbox-skill' -and (TtText (TtMarker 'tr-sk2' '.skills')) -notlike '*sandbox-skill*') { 'unmarked' } else { 'wrong' }) ("cap $cap | " + $r.out)
    $r = Route 'another pitchsite please' 'tr-sk2' $root
    Record 'truth D5-7: a skill that did not print is named on the next matching prompt' 'named' $(if ($r.out -match 'sandbox-skill: Build a pitchsite') { 'named' } else { 'lost' }) $r.out
}
if (Test-Path -LiteralPath $polPath) { Remove-Item -LiteralPath $polPath -Force }

# ------------------------------------------------------------------ 8. a call with no question writes no marker
Write-Host '-- truth D5-8: a call with no question writes no interview marker'
$r = Invoke-Hook 'ask.ps1' (@{ session_id = 'tr-ask0'; cwd = $root; hook_event_name = 'PreToolUse'; tool_name = 'AskUserQuestion'; tool_input = @{ questions = @() } } | ConvertTo-Json -Compress -Depth 6)
Record 'truth D5-8: a call with no question is let through and writes no .asked marker' 'allow-unmarked' $(if ((TtVerdict $r) -eq 'silent' -and -not (Test-Path -LiteralPath (TtMarker 'tr-ask0' '.asked'))) { 'allow-unmarked' } else { "$(TtVerdict $r)/marked:$(Test-Path -LiteralPath (TtMarker 'tr-ask0' '.asked'))" }) $r.out

# ------------------------------------------------------------------ 9. GATE-06 on every card
Write-Host '-- truth 9: every card asks the Change Request question and names GATE-06'
function TtHeadIds($r) {
    # The clause ids in the card's first line: "... then stop (DES-07, GATE-05, ...; the hook asks once per turn)."
    $head = try { [string]@((($r.out | ConvertFrom-Json).reason) -split "`n")[0] } catch { '' }
    if ($head -notmatch '\(([^;)]*);') { return @() }
    return @($Matches[1] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
# No turn marker for these sessions, so each card counts the ledger, and the ledger's changelog flag
# says whether the DECISIONS.md edit carried a row (the guard sets it).
function TtCrAsked($r) {
    # The Change Request question, on the card itself, not only the id on its first line.
    $reason = try { [string](($r.out | ConvertFrom-Json).reason) } catch { '' }
    return ($reason -like '*Change Request (GATE-06): did this turn change design, behaviour, config, risk, execution, data flow or dependencies?*name its Change Request*')
}
$tthRepo = NewRepo 'repo-tr-head'
$tthSrc = Join-Path $tthRepo 'src\h.py'; $tthDec = Join-Path $tthRepo 'DECISIONS.md'
Put $tthSrc 'h = 1'
Put $tthDec '# decisions'
# 9a: the common case of a missing Change Request, a behaviour change that does not touch DECISIONS.md.
Put (Ledger 'tr-h06-src') ($tthSrc + "`t`n")
$r = Stop 'tr-h06-src' $false
$tthIds = TtHeadIds $r
Record 'truth 9a: source only, no Change Log line -> GATE-06 named and the Change Request question asked' 'asked' $(if ((TtVerdict $r) -ne 'block') { TtVerdict $r } elseif ($r.out -like '*no Change Log row*') { 'changelog-line' } elseif ($tthIds -notcontains 'GATE-06') { 'unnamed: ' + ($tthIds -join ', ') } elseif (-not (TtCrAsked $r)) { 'not-asked' } else { 'asked' }) $r.out
Put (Ledger 'tr-h06-norow') ($tthSrc + "`t`n" + $tthDec + "`t`n")
$r = Stop 'tr-h06-norow' $false
$tthIds = TtHeadIds $r
Record 'truth 9b: DECISIONS.md with no row -> the Change Log line as well, GATE-06 named, the question asked' 'asked' $(if ((TtVerdict $r) -ne 'block') { TtVerdict $r } elseif ($r.out -notlike '*no Change Log row*') { 'no-changelog-line' } elseif ($tthIds -notcontains 'GATE-06') { 'unnamed: ' + ($tthIds -join ', ') } elseif (-not (TtCrAsked $r)) { 'not-asked' } else { 'asked' }) $r.out
Record 'truth 9b: the first line keeps the order of the lines it names' 'ordered' $(if (($tthIds -join ',') -eq 'DES-07,GATE-05,GATE-06,GATE-07,GAME-12') { 'ordered' } else { $tthIds -join ',' }) $r.out
Put (Ledger 'tr-h06-row') ($tthSrc + "`t`n" + $tthDec + "`tchangelog`n")
$r = Stop 'tr-h06-row' $false
$tthIds = TtHeadIds $r
Record 'truth 9c: DECISIONS.md with a row -> no Change Log line, GATE-06 still named and the question asked' 'asked' $(if ((TtVerdict $r) -ne 'block') { TtVerdict $r } elseif ($r.out -like '*no Change Log row*') { 'changelog-line' } elseif ($tthIds -notcontains 'GATE-06') { 'unnamed: ' + ($tthIds -join ', ') } elseif (-not (TtCrAsked $r)) { 'not-asked' } else { 'asked' }) $r.out
