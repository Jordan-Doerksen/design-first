# run.ps1 - design-first hook self-tests. Run under pwsh:  pwsh -NoProfile -File tools/tests/run.ps1
#
# Exit 0 only when every case passes. Prints one table row per case: case, expected, got.
#
# Every fixture is created here, in a fresh temp folder: a fake brain, a fake pointer, four small
# git repos, a folder outside any repo. The hooks read the pointer, the logs and the marker folder
# through the DF_* seams (see hooks/lib/common.ps1), so this run never touches the real pointer,
# the real hooks log or the real fence log.
#
# The cases live in guard-cases.json, deliberately. A PreToolUse hook on the machine running this
# test inspects the test's own command string; a case embedded inline would be blocked by the very
# guard it is testing. Reading cases from disk keeps the test's own command clean.
#
# Usage:  run.ps1 [-KeepTemp] [-Filter <substring>]

param([switch]$KeepTemp, [string]$Filter)

$ErrorActionPreference = 'Stop'
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$kit   = (Resolve-Path (Join-Path $here '..\..')).Path.TrimEnd('\')
$hooks = Join-Path $kit 'hooks'
$casesFile = Join-Path $here 'guard-cases.json'

$T = Join-Path $env:TEMP ('df-run-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
# Workaround: the folder name must not contain test|probe|spec|verify|assert, or the fence would
# treat every fixture as a measuring file (that is the same path regex the live fence uses).
New-Item -ItemType Directory -Force -Path $T | Out-Null
$T = (Resolve-Path $T).Path.TrimEnd('\')
$TFWD  = $T -replace '\\', '/'
$TMSYS = if ($T -match '^([A-Za-z]):\\(.*)$') { '/' + $Matches[1].ToLower() + '/' + ($Matches[2] -replace '\\', '/') } else { $TFWD }

$results = [Collections.Generic.List[object]]::new()
function Record([string]$name, [string]$expected, [string]$got, [string]$detail) {
    $ok = ($expected -eq $got)
    $results.Add([pscustomobject]@{ pass = $ok; name = $name; expected = $expected; got = $got; detail = $detail })
    $tag = if ($ok) { 'PASS' } else { 'FAIL' }
    $color = if ($ok) { 'Green' } else { 'Red' }
    $line = '  {0}  {1,-72} {2,-8} {3}' -f $tag, $name.Substring(0, [Math]::Min(72, $name.Length)), $expected, $got
    Write-Host $line -ForegroundColor $color
    if (-not $ok -and $detail) { Write-Host ('        ' + ($detail -replace "`r?`n", ' ').Substring(0, [Math]::Min(300, $detail.Length))) -ForegroundColor DarkGray }
}

# ------------------------------------------------------------------ fixtures
function RunGit([string]$dir, [string[]]$a) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & git.exe -C $dir -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c core.autocrlf=false @a 2>&1 | Out-Null } finally { $ErrorActionPreference = $prev }
}
function Put([string]$path, [string]$content) {
    $d = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    Set-Content -LiteralPath $path -Value $content -Encoding utf8NoBOM -NoNewline
}
function NewRepo([string]$name) {
    $d = Join-Path $T "root\$name"
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    RunGit $d @('init', '-q', '-b', 'main')
    return $d
}

Write-Host ''
Write-Host "design-first self-tests  (temp: $T)"
Write-Host ''

$brain = Join-Path $T 'brain'
$root  = Join-Path $T 'root'
New-Item -ItemType Directory -Force -Path $brain, $root, (Join-Path $T 'outside'), (Join-Path $T 'markers'), (Join-Path $T 'plugins\cache\design-first') | Out-Null
Put (Join-Path $brain 'doctor.config.json') (@{
    schema = 1
    frozenPaths = @('${ROOT}\frozen')
    tombstonedPaths = @((Join-Path $root 'tomb'))
    secretExceptions = @('repo-plain/allowed/.env')
} | ConvertTo-Json)
Put (Join-Path $brain 'me.md') "---`nowner:`n  name: `"Test Owner`"`n---`n# About the owner`n"
# Entries 4-6 use the kit:/brain: prefixes the shipped templates/entry.json uses. 6 is a file that
# exists under the kit but not the brain, so a brain: entry resolved against the kit would be caught.
Put (Join-Path $brain 'entry.json') (@{ schema = 1; entries = @(@{ path = 'me.md'; note = 'who you are talking to' }, @{ path = 'not-here.md'; note = 'deliberately absent' }, '${BRAIN}\doctor.config.json', 'kit:hooks/entry.ps1', 'brain:me.md', 'brain:hooks/entry.ps1') } | ConvertTo-Json -Depth 4)
Put (Join-Path $root 'frozen\x.py') 'x = 1'
Put (Join-Path $root 'tomb\x.md') 'retired'
Put (Join-Path $root 'ordinary\x.gd') 'var a = 1'
Put (Join-Path $root 'ordinary\big.txt') ('x' * 1000)
Put (Join-Path $root 'tests\probe_x.js') 'assert(a);'

$repoPlain = NewRepo 'repo-plain'
Put (Join-Path $repoPlain '.gitignore') "node_modules/`n"
Put (Join-Path $repoPlain 'README.md') 'plain'
RunGit $repoPlain @('add', '-A'); RunGit $repoPlain @('commit', '-q', '-m', 'init')
Put (Join-Path $repoPlain '.env') 'TOKEN=untracked-not-ignored'
Put (Join-Path $repoPlain 'allowed\.env') 'TOKEN=the-recorded-exception'
New-Item -ItemType Directory -Force -Path (Join-Path $repoPlain 'sub') | Out-Null
Put (Join-Path $repoPlain 'sub\keep.txt') 'k'

$repoIgnored = NewRepo 'repo-ignored'
Put (Join-Path $repoIgnored '.gitignore') ".env`n.env.*`n!.env.example`n"
Put (Join-Path $repoIgnored 'README.md') 'ignored'
RunGit $repoIgnored @('add', '-A'); RunGit $repoIgnored @('commit', '-q', '-m', 'init')
Put (Join-Path $repoIgnored '.env') 'TOKEN=ignored'

$repoClean = NewRepo 'repo-clean'
Put (Join-Path $repoClean 'src\main.py') 'print(1)'
RunGit $repoClean @('add', '-A'); RunGit $repoClean @('commit', '-q', '-m', 'init')

$repoTracked = NewRepo 'repo-tracked'
Put (Join-Path $repoTracked '.env') 'TOKEN=tracked-by-mistake'
RunGit $repoTracked @('add', '-A'); RunGit $repoTracked @('commit', '-q', '-m', 'init')

$pointerPath = Join-Path $T 'pointer.json'
function WritePointer([string]$pluginRoot, [string]$kind) {
    Put $pointerPath (@{ schema = 1; root = $root; brain = $brain; pluginRoot = $pluginRoot; pluginKind = $kind } | ConvertTo-Json)
}
WritePointer $kit 'checkout'

$env:DF_POINTER_PATH   = $pointerPath
$env:DF_LOG_PATH       = Join-Path $T 'hooks.log'
$env:DF_FENCE_LOG_PATH = Join-Path $T 'fence.log'
$env:DF_MARKER_DIR     = Join-Path $T 'markers'
$env:CLAUDE_PLUGIN_ROOT = $null

# ------------------------------------------------------------------ invoking a hook
function Invoke-Hook([string]$script, [string]$stdin) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $out = @($stdin | & pwsh -NoProfile -File (Join-Path $hooks $script) 2>&1 | ForEach-Object { [string]$_ })
        return @{ code = $LASTEXITCODE; out = ($out -join "`n") }
    } finally { $ErrorActionPreference = $prev }
}
function Classify([string]$out) {
    if ([string]::IsNullOrWhiteSpace($out)) { return 'allow' }
    try { $j = $out | ConvertFrom-Json } catch { return "bad-output" }
    $h = $j.hookSpecificOutput
    if ($h -and $h.permissionDecision -eq 'deny') { return 'deny' }
    if ($h -and $h.permissionDecision -eq 'ask') { return 'ask' }
    if ($h -and $h.updatedInput) { return 'rewrite' }
    if ($h -and $h.additionalContext) {
        if (-not $j.systemMessage) { return 'advise-one-channel' }
        return 'advise'
    }
    return 'unknown-json'
}
function Expand([string]$s) {
    if ($null -eq $s) { return $null }
    return $s.Replace('${T}', $T).Replace('${TFWD}', $TFWD).Replace('${TMSYS}', $TMSYS).Replace('${KIT}', $kit)
}

# ------------------------------------------------------------------ 1. pre-body smoke (hooks.json as registered)
Write-Host '-- pre-body smoke: every hooks.json entry, ${CLAUDE_PLUGIN_ROOT} substituted'
$hj = Get-Content -LiteralPath (Join-Path $hooks 'hooks.json') -Raw | ConvertFrom-Json
$env:CLAUDE_PLUGIN_ROOT = $kit
foreach ($event in $hj.hooks.PSObject.Properties.Name) {
    foreach ($entry in $hj.hooks.$event) {
        foreach ($h in $entry.hooks) {
            $command = $h.command.Replace('${CLAUDE_PLUGIN_ROOT}', $kit)
            $payload = if ($event -eq 'SessionStart') {
                @{ session_id = 'smoke'; cwd = $root; hook_event_name = 'SessionStart'; source = $entry.matcher } | ConvertTo-Json -Compress
            } else {
                @{ session_id = 'smoke'; cwd = $root; hook_event_name = $event; tool_name = 'Edit'; tool_input = @{ file_path = (Join-Path $root 'ordinary\x.gd'); old_string = 'a'; new_string = 'b' } } | ConvertTo-Json -Compress
            }
            $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            try { $out = @($payload | & pwsh -NoProfile -Command $command 2>&1 | ForEach-Object { [string]$_ }) -join "`n"; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
            $expected = if ($event -eq 'SessionStart') { 'exit0+stdout' } else { 'exit0+empty-or-json' }
            $got = if ($code -ne 0) { "exit$code" }
                   elseif ($event -eq 'SessionStart') { if ([string]::IsNullOrWhiteSpace($out)) { 'exit0+EMPTY' } else { 'exit0+stdout' } }
                   else { if ([string]::IsNullOrWhiteSpace($out)) { 'exit0+empty-or-json' } else { try { $null = $out | ConvertFrom-Json; 'exit0+empty-or-json' } catch { 'exit0+NOT-JSON' } } }
            Record "smoke $event/$($entry.matcher) -> $(Split-Path -Leaf ($h.command -replace '"', ''))" $expected $got $out
        }
    }
}
$env:CLAUDE_PLUGIN_ROOT = $null

# ------------------------------------------------------------------ 2. guard + fence cases
Write-Host '-- guard and fence cases'
$cases = Get-Content -LiteralPath $casesFile -Raw -Encoding utf8 | ConvertFrom-Json
foreach ($c in $cases) {
    if ($c.PSObject.Properties['_']) { continue }
    if ($Filter -and $c.name -notlike "*$Filter*") { continue }
    $script = switch ([string]$c.hook) { 'fence' { 'fence.ps1' } 'agent' { 'agent.ps1' } default { 'guard.ps1' } }
    $cwd = if ($c.cwd) { Expand $c.cwd } else { $repoClean }
    $session = if ($c.session) { $c.session } else { 's-default' }
    if ($c.PSObject.Properties['stdin']) { $stdin = [string]$c.stdin }
    else {
        $ti = @{}
        switch ($c.tool) {
            { $_ -in 'Bash', 'PowerShell' } { $ti.command = Expand $c.cmd }
            'NotebookEdit' { $ti.notebook_path = Expand $c.path; $ti.new_source = 'x' }
            'Write' { $ti.file_path = Expand $c.path; $ti.content = if ($null -ne $c.content) { [string]$c.content } else { 'x' } }
            'Agent' {
                $ti.description = 'case'; $ti.prompt = [string]$c.prompt
                if ($c.type)  { $ti.subagent_type = [string]$c.type }
                if ($c.model) { $ti.model = [string]$c.model }
            }
            default { $ti.file_path = Expand $c.path; $ti.old_string = if ($null -ne $c.old) { [string]$c.old } else { 'a' }; $ti.new_string = if ($null -ne $c.new) { [string]$c.new } else { 'b' } }
        }
        $payload = @{ session_id = $session; cwd = $cwd; hook_event_name = 'PreToolUse'; tool_name = $c.tool; tool_input = $ti }
        if ($c.prompt_id) { $payload.prompt_id = [string]$c.prompt_id }
        if ($c.agent_id)  { $payload.agent_id  = [string]$c.agent_id }
        $stdin = $payload | ConvertTo-Json -Depth 5 -Compress
    }
    $savedPointer = $env:DF_POINTER_PATH
    if ($c.pointer -eq 'none') { $env:DF_POINTER_PATH = Join-Path $T 'no-such-pointer.json' }
    $logBefore = if (Test-Path -LiteralPath $env:DF_LOG_PATH) { (Get-Content -LiteralPath $env:DF_LOG_PATH -Raw) } else { '' }
    try { $r = Invoke-Hook $script $stdin } finally { $env:DF_POINTER_PATH = $savedPointer }
    $got = if ($r.code -ne 0) { "exit$($r.code)" } else { Classify $r.out }
    if ($got -eq $c.expect -and $c.contains -and ($r.out -notlike "*$($c.contains)*")) { $got = "missing-text:$($c.contains)" }
    if ($got -eq $c.expect -and $c.logContains) {
        $logNow = if (Test-Path -LiteralPath $env:DF_LOG_PATH) { (Get-Content -LiteralPath $env:DF_LOG_PATH -Raw) } else { '' }
        if ($logNow.Substring($logBefore.Length) -notlike "*$($c.logContains)*") { $got = "log-missing:$($c.logContains)" }
    }
    Record $c.name $c.expect $got $r.out
}

# ------------------------------------------------------------------ 3. entry.ps1 behaviour
Write-Host '-- entry.ps1'
function Entry([string]$cwd, [string]$session, [string]$source) {
    $stdin = @{ session_id = $session; cwd = $cwd; hook_event_name = 'SessionStart'; source = $source } | ConvertTo-Json -Compress
    return (Invoke-Hook 'entry.ps1' $stdin)
}
# old marker + old log line, to prove housekeeping
$oldMarker = Join-Path $env:DF_MARKER_DIR 'old-session.advised'
Put $oldMarker 'x'; (Get-Item -LiteralPath $oldMarker).LastWriteTime = (Get-Date).AddDays(-2)
$freshMarker = Join-Path $env:DF_MARKER_DIR 'fresh-session.advised'
Put $freshMarker 'x'
Add-Content -LiteralPath $env:DF_LOG_PATH -Value ("{0} ERROR guard ancient line to truncate" -f (Get-Date).AddDays(-100).ToString('o')) -Encoding utf8
Add-Content -LiteralPath $env:DF_LOG_PATH -Value ("{0} WARN entry recent line to keep" -f (Get-Date).AddDays(-5).ToString('o')) -Encoding utf8

$e = Entry $root 'e1' 'startup'
Record 'entry: cwd under root lists entry.json in order' 'listed' $(if ($e.code -eq 0 -and $e.out -match '(?m)^ 1\. .*me\.md - who' -and $e.out -match '(?m)^ 2\. MISSING: .*not-here\.md' -and $e.out -match '(?m)^ 3\. .*doctor\.config\.json') { 'listed' } else { 'not-listed' }) $e.out
$kitHook   = [regex]::Escape((Join-Path $kit 'hooks\entry.ps1'))
$brainMe   = [regex]::Escape((Join-Path $brain 'me.md'))
$brainHook = [regex]::Escape((Join-Path $brain 'hooks\entry.ps1'))
Record 'entry: kit: resolves under the kit, brain: under the brain' 'prefixed' $(if ($e.out -match "(?m)^ 4\. $kitHook`$" -and $e.out -match "(?m)^ 5\. $brainMe`$" -and $e.out -match "(?m)^ 6\. MISSING: $brainHook`$" -and $e.out -notmatch 'kit:|brain:') { 'prefixed' } else { 'wrong' }) $e.out
Record 'entry: heartbeat written to <brain>/state/last-session.json' 'present' $(if (Test-Path -LiteralPath (Join-Path $brain 'state\last-session.json')) { 'present' } else { 'absent' }) ''
Record 'entry: marker older than 1 day deleted, fresh kept' 'old-gone' $(if (-not (Test-Path -LiteralPath $oldMarker) -and (Test-Path -LiteralPath $freshMarker)) { 'old-gone' } else { 'wrong' }) ''
$logText = Get-Content -LiteralPath $env:DF_LOG_PATH -Raw
Record 'entry: hooks log truncated to 90 days' 'truncated' $(if ($logText -notlike '*ancient line*' -and $logText -like '*recent line to keep*') { 'truncated' } else { 'not-truncated' }) $logText

$e = Entry (Join-Path $T 'outside') 'e2' 'resume'
Record 'entry: cwd outside root prints one line' 'one-line' $(if ($e.code -eq 0 -and @($e.out -split "`n" | Where-Object { $_.Trim() }).Count -eq 1 -and $e.out -like '*outside root*') { 'one-line' } else { 'wrong' }) $e.out

$saved = $env:DF_POINTER_PATH; $env:DF_POINTER_PATH = Join-Path $T 'no-such-pointer.json'
$e = Entry $root 'e3' 'startup'
$env:DF_POINTER_PATH = $saved
Record 'entry: no pointer prints the /design-first:adopt line' 'adopt-line' $(if ($e.code -eq 0 -and $e.out -like '*/design-first:adopt*') { 'adopt-line' } else { 'wrong' }) $e.out

WritePointer (Join-Path $T 'stale-plugin-root') 'checkout'
$env:CLAUDE_PLUGIN_ROOT = $kit
$e = Entry $root 'e4' 'startup'
$p = Get-Content -LiteralPath $pointerPath -Raw | ConvertFrom-Json
Record 'entry: pluginRoot refreshed when kind matches (checkout)' 'refreshed' $(if ($p.pluginRoot -eq $kit -and $p.pluginKind -eq 'checkout') { 'refreshed' } else { "still:$($p.pluginRoot)" }) $e.out

$cacheRoot = Join-Path $T 'plugins\cache\design-first'
$env:CLAUDE_PLUGIN_ROOT = $cacheRoot
$e = Entry $root 'e5' 'startup'
$p = Get-Content -LiteralPath $pointerPath -Raw | ConvertFrom-Json
Record 'entry: kind mismatch (cache vs checkout) warns once, pointer unchanged' 'warned+kept' $(if ($p.pluginRoot -eq $kit -and $e.out -like '*WARNING*unsupported*') { 'warned+kept' } else { 'wrong' }) $e.out
$e = Entry $root 'e5' 'compact'
Record 'entry: kind mismatch, same session, no second warning' 'quiet' $(if ($e.out -notlike '*WARNING*') { 'quiet' } else { 'warned-again' }) $e.out

$env:CLAUDE_PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}'
$e = Entry $root 'e6' 'startup'
$logText = Get-Content -LiteralPath $env:DF_LOG_PATH -Raw
Record 'entry: literal ${CLAUDE_PLUGIN_ROOT} logs ERROR' 'logged' $(if ($logText -like '*ERROR entry*unexpanded*' -and $e.out -like '*unexpanded*') { 'logged' } else { 'not-logged' }) $e.out
$env:CLAUDE_PLUGIN_ROOT = $null

# The personal-word leak scan is NOT here: a word list in this file would itself be the leak. The
# Doctor's tree_free_of claim owns that scan (SPEC 5.2, C6).

# ------------------------------------------------------------------ summary
$passed = @($results | Where-Object pass).Count
$failed = @($results | Where-Object { -not $_.pass }).Count
Write-Host ''
Write-Host ("  {0} passed, {1} failed, {2} total" -f $passed, $failed, $results.Count) -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host ''
if ($failed -eq 0 -and -not $KeepTemp) { Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue }
else { Write-Host "  fixtures kept at $T" }
foreach ($v in 'DF_POINTER_PATH', 'DF_LOG_PATH', 'DF_FENCE_LOG_PATH', 'DF_MARKER_DIR') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
if ($failed -gt 0) { exit 1 }
exit 0
