# cases-stop-git.ps1 - hook self-test cases for the Stop card reading the turn's changes from git
# (lib/turn-changes.ps1). Dot-sourced by run.ps1, which owns the fixtures and helpers used here
# ($T, $TMSYS, $root, $brain, NewRepo, Put, RunGit, Record, Classify, Invoke-Hook, Route, Stop,
# GuardEdit). Never run directly.
#
# Each case is one turn: a prompt (route.ps1 writes the turn's start time), a tool call the guard
# sees (it nominates the repository), a change made on the disk the way a script makes it (no Edit
# call), then the stop. A file is "changed by a script" here by writing it directly.

Write-Host '-- stop.ps1: the turn''s changes are read from git'
function GuardShell([string]$session, [string]$cwd, [string]$cmd) {
    return (Invoke-Hook 'guard.ps1' (@{ session_id = $session; cwd = $cwd; hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = @{ command = $cmd } } | ConvertTo-Json -Compress))
}
function Marker([string]$session, [string]$ext) { return (Join-Path $env:DF_MARKER_DIR ($session + $ext)) }
function StopVerdict($r) { if ($r.code -ne 0) { return "exit$($r.code)" } elseif ([string]::IsNullOrWhiteSpace($r.out)) { return 'silent' } else { return (Classify $r.out) } }

$turnRepo = NewRepo 'repo-turn'
Put (Join-Path $turnRepo '.gitignore') "ignored/`n"
Put (Join-Path $turnRepo 'DECISIONS.md') "# Decisions`n`n## Change Log`n`n| Date | Change |`n|---|---|`n| 2026-01-01 | Manifest created |`n"
Put (Join-Path $turnRepo 'README.md') 'readme'
Put (Join-Path $turnRepo 'src\a.py') 'a = 1'
Put (Join-Path $turnRepo 'src\b.py') 'b = 1'
Put (Join-Path $turnRepo 'src\c.py') 'c = 1'
RunGit $turnRepo @('add', '-A'); RunGit $turnRepo @('commit', '-q', '-m', 'init')

# 1. a script changes source and a document; no Edit call names either
$null = Route 'patch the scan' 'tg1' $root
$null = GuardShell 'tg1' $turnRepo 'python tools/patch.py DECISIONS.md spec.json'
Put (Join-Path $turnRepo 'src\a.py') 'a = 2'
Add-Content -LiteralPath (Join-Path $turnRepo 'DECISIONS.md') -Value '| 2026-02-02 | The scan is cached |' -Encoding utf8
$r = Stop 'tg1' $false
Record 'git: source changed by a command, no Edit call -> the card fires' 'block' (StopVerdict $r) $r.out
Record 'git: a document a script wrote is a document touched' 'named' $(if ($r.out -like '*repo-turn: 1 source file(s) changed*' -and $r.out -like '*Documents touched: DECISIONS.md.*') { 'named' } else { 'wrong' }) $r.out
Record 'git: a dated row added by a script counts as the Change Log row' 'quiet' $(if ($r.out -notlike '*no Change Log row*') { 'quiet' } else { 'nagged' }) $r.out
Record 'git: the card says where its count came from' 'said' $(if ($r.out -like '*Read from git*') { 'said' } else { 'missing' }) $r.out

# 2. what was dirty before the prompt is not this turn's work
$null = Route 'look around' 'tg2' $root
$null = GuardShell 'tg2' $turnRepo 'git status'
$r = Stop 'tg2' $false
Record 'git: files left uncommitted by an earlier turn are not counted' 'silent' (StopVerdict $r) $r.out

# 3. a commit made this turn counts, though the tree is clean again
$null = Route 'commit it' 'tg3' $root
$null = GuardShell 'tg3' $turnRepo 'git commit -m work -- src/a.py DECISIONS.md'
RunGit $turnRepo @('add', '-A'); RunGit $turnRepo @('commit', '-q', '-m', 'the scan is cached')
$r = Stop 'tg3' $false
Record 'git: files in a commit made since the prompt are counted' 'counted' $(if ((StopVerdict $r) -eq 'block' -and $r.out -like '*repo-turn: 1 source file(s) changed*' -and $r.out -like '*Documents touched: DECISIONS.md.*') { 'counted' } else { "wrong:$(StopVerdict $r)" }) $r.out

# 4. a commit from before the prompt does not count
$null = Route 'next' 'tg4' $root
$null = GuardShell 'tg4' $turnRepo 'git log --oneline'
$r = Stop 'tg4' $false
Record 'git: a commit made before the prompt is not counted' 'silent' (StopVerdict $r) $r.out

# 5. the shell's folder is the root; the command names the repository (an MSYS path after cd)
$null = Route 'edit by sed' 'tg5' $root
$null = GuardShell 'tg5' $root "cd $TMSYS/root/repo-turn && sed -i s/b/B/ src/b.py"
Put (Join-Path $turnRepo 'src\b.py') 'B = 1'
$r = Stop 'tg5' $false
Record 'git: a repository named in the command (cd <path>) is looked at' 'block' (StopVerdict $r) $r.out
Record 'git: source changed, no document -> the DES-07 line, now true' 'des07' $(if ($r.out -like '*Documents touched: none*') { 'des07' } else { 'wrong' }) $r.out

# 6. DECISIONS.md changed by a script with no dated row -> GATE-06
$null = Route 'reword a decision' 'tg6' $root
$null = GuardShell 'tg6' $turnRepo 'python tools/reword.py'
Put (Join-Path $turnRepo 'src\c.py') 'c = 2'
Add-Content -LiteralPath (Join-Path $turnRepo 'DECISIONS.md') -Value 'A decision reworded, with no row.' -Encoding utf8
$r = Stop 'tg6' $false
Record 'git: DECISIONS.md changed by a script with no dated row -> GATE-06 line' 'gate06' $(if ($r.out -like '*no Change Log row*') { 'gate06' } else { 'quiet' }) $r.out

# 7. a file deleted this turn counts
RunGit $turnRepo @('add', '-A'); RunGit $turnRepo @('commit', '-q', '-m', 'tidy fixture')
$null = Route 'remove it' 'tg7' $root
$null = GuardShell 'tg7' $turnRepo 'git rm src/c.py'
Remove-Item -LiteralPath (Join-Path $turnRepo 'src\c.py') -Force
$r = Stop 'tg7' $false
Record 'git: a source file deleted this turn is counted' 'block' (StopVerdict $r) $r.out

# 8. an Edit call the guard allowed, but the file never changed (the tool failed) -> nothing to answer for
$null = Route 'try an edit' 'tg8' $root
$null = GuardEdit 'tg8' (Join-Path $turnRepo 'src\a.py')
$r = Stop 'tg8' $false
Record 'git: an allowed Edit that changed nothing is not counted' 'silent' (StopVerdict $r) $r.out

# 9. an ignored file is in no git list; an Edit that named it and wrote it still counts
$null = Route 'edit an ignored file' 'tg9' $root
$null = GuardEdit 'tg9' (Join-Path $turnRepo 'ignored\gen.py')
Put (Join-Path $turnRepo 'ignored\gen.py') 'g = 1'
$r = Stop 'tg9' $false
Record 'git: a file git ignores counts when an Edit named it and wrote it' 'block' (StopVerdict $r) $r.out

# 10. the written residual: a repository no call pointed at is not looked at
$quiet = NewRepo 'repo-unnamed'
Put (Join-Path $quiet 'x.py') 'x = 1'; RunGit $quiet @('add', '-A'); RunGit $quiet @('commit', '-q', '-m', 'init')
$null = Route 'run a build' 'tg10' $root
$null = GuardShell 'tg10' $root 'pwsh build.ps1'
Put (Join-Path $quiet 'x.py') 'x = 2'
$r = Stop 'tg10' $false
Record 'git: a repository no call pointed at is NOT seen (written residual)' 'silent' (StopVerdict $r) $r.out

# 11. a background-task notice is not a turn boundary, and its words are not routed
$null = Route 'start the long job' 'tg11' $root
$null = GuardShell 'tg11' $turnRepo 'python tools/patch.py'
Put (Join-Path $turnRepo 'src\a.py') 'a = 3'
$stampBefore = Get-Content -LiteralPath (Marker 'tg11' '.turn') -Raw
$notice = "<task-notification>`n<task-id>b1</task-id>`n<status>completed</status>`n<summary>Background command `"Start the server and read the log`" completed (exit code 0)</summary>`n</task-notification>"
$n = Route $notice 'tg11' $root
Record 'route: a task notice does not move the turn''s start' 'kept' $(if ((Get-Content -LiteralPath (Marker 'tg11' '.turn') -Raw) -eq $stampBefore -and (Test-Path -LiteralPath (Marker 'tg11' '.repos'))) { 'kept' } else { 'reset' }) ''
Record 'route: the words inside a task notice are not routed' 'silent' $(if ([string]::IsNullOrWhiteSpace($n.out)) { 'silent' } else { 'routed' }) $n.out
$r = Stop 'tg11' $false
Record 'git: a change made before a task notice still counts at the stop' 'block' (StopVerdict $r) $r.out

# 12. stopFromGit false: back to counting Edit and Write calls only
$cfgPath = Join-Path $brain 'doctor.config.json'
$cfgSaved = Get-Content -LiteralPath $cfgPath -Raw
$cfgObj = $cfgSaved | ConvertFrom-Json; $cfgObj | Add-Member -NotePropertyName stopFromGit -NotePropertyValue $false -Force
Put $cfgPath ($cfgObj | ConvertTo-Json -Depth 6)
$null = Route 'script again' 'tg12' $root
$null = GuardShell 'tg12' $turnRepo 'python tools/patch.py'
Put (Join-Path $turnRepo 'src\b.py') 'B = 2'
$r = Stop 'tg12' $false
Record 'git: stopFromGit false -> a command''s change is not seen, as before 0.1.15' 'silent' (StopVerdict $r) $r.out
Put $cfgPath $cfgSaved
