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
    # Workaround: the cut length is taken AFTER the newline fold. Taken before, a failing case whose
    # detail held a CRLF asked Substring for more characters than the folded text had, and the
    # printer threw on the first FAIL instead of showing it.
    if (-not $ok -and $detail) { $flat = $detail -replace "`r?`n", ' '; Write-Host ('        ' + $flat.Substring(0, [Math]::Min(300, $flat.Length))) -ForegroundColor DarkGray }
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
    # Guard rules 8 and 9 (0.1.17). No earlier case runs a scheduling command or edits under trading.
    forbidScheduling = $true
    contentRules = @(@{ id = 'SAFE-02'; under = @('${ROOT}\trading'); except = @('${ROOT}\trading\action'); exceptParts = @('tests')
                        extensions = @('.py'); pattern = '(?i)(?<![A-Za-z0-9])place_?orders?\s*\('; shell = $true; why = 'SAFE-02 fixture: nothing under trading places an order.' })
} | ConvertTo-Json -Depth 5)
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
Put (Join-Path $repoClean 'DECISIONS.md') '# decisions'
RunGit $repoClean @('add', '-A'); RunGit $repoClean @('commit', '-q', '-m', 'init')

# A repo with source and no manifest: guard rule 5 (DES-02) must ask once per session here.
$repoNoManifest = NewRepo 'repo-nomanifest'
Put (Join-Path $repoNoManifest 'src\app.py') 'print(2)'
Put (Join-Path $repoNoManifest 'notes.md') 'not source'
RunGit $repoNoManifest @('add', '-A'); RunGit $repoNoManifest @('commit', '-q', '-m', 'init')

# Guard rule 10 (GATE-08, GATE-09): a declared design gate with no record, a cleared one, a bad record.
$repoGated = NewRepo 'repo-gated'
Put (Join-Path $repoGated 'src\core.py') 'print(3)'
Put (Join-Path $repoGated 'DECISIONS.md') "# decisions`n`nDesign gate: on`n"
RunGit $repoGated @('add', '-A'); RunGit $repoGated @('commit', '-q', '-m', 'init')
$repoGatedOk = NewRepo 'repo-gated-ok'
Put (Join-Path $repoGatedOk 'src\core.py') 'print(4)'
Put (Join-Path $repoGatedOk 'DECISIONS.md') "# decisions`n`n| Design gate | on |`n"
Put (Join-Path $repoGatedOk 'records\gate-cleared.md') "# Gate cleared`n`nFindings: 2`n`n- F1 resolved: the spec names the failure mode`n- F2 recorded: open question 3, owner named`n"
RunGit $repoGatedOk @('add', '-A'); RunGit $repoGatedOk @('commit', '-q', '-m', 'init')
$repoGatedBad = NewRepo 'repo-gated-bad'
Put (Join-Path $repoGatedBad 'src\core.py') 'print(5)'
Put (Join-Path $repoGatedBad 'DECISIONS.md') "# decisions`n`nDesign gate: on`n"
Put (Join-Path $repoGatedBad 'records\gate-cleared.md') "# Gate cleared`n`nFindings: 0`n"
RunGit $repoGatedBad @('add', '-A'); RunGit $repoGatedBad @('commit', '-q', '-m', 'init')
$repoGatedOpen = NewRepo 'repo-gated-open'
Put (Join-Path $repoGatedOpen 'src\core.py') 'print(6)'
Put (Join-Path $repoGatedOpen 'DECISIONS.md') "# decisions`n`nDesign gate: on`n"
Put (Join-Path $repoGatedOpen 'records\gate-cleared.md') "Findings: 2`n`n- F1 resolved: yes`n- F2 still thinking about it`n"
RunGit $repoGatedOpen @('add', '-A'); RunGit $repoGatedOpen @('commit', '-q', '-m', 'init')

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
    if ($j.decision -eq 'block') { return 'block' }
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
            } elseif ($event -eq 'UserPromptSubmit') {
                @{ session_id = 'smoke'; cwd = $root; hook_event_name = 'UserPromptSubmit'; prompt_id = 'smoke'; prompt = 'smoke prompt' } | ConvertTo-Json -Compress
            } elseif ($event -eq 'SubagentStart') {
                @{ session_id = 'smoke'; cwd = $root; hook_event_name = 'SubagentStart'; agent_id = 'smoke'; agent_type = 'general-purpose' } | ConvertTo-Json -Compress
            } elseif ($event -eq 'Stop') {
                @{ session_id = 'smoke'; cwd = $root; hook_event_name = 'Stop'; stop_hook_active = $false; last_assistant_message = 'smoke' } | ConvertTo-Json -Compress
            } else {
                @{ session_id = 'smoke'; cwd = $root; hook_event_name = $event; tool_name = 'Edit'; tool_input = @{ file_path = (Join-Path $root 'ordinary\x.gd'); old_string = 'a'; new_string = 'b' } } | ConvertTo-Json -Compress
            }
            $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            try { $out = @($payload | & pwsh -NoProfile -Command $command 2>&1 | ForEach-Object { [string]$_ }) -join "`n"; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
            $expected = if ($event -eq 'SessionStart') { 'exit0+stdout' } elseif ($event -eq 'UserPromptSubmit') { 'exit0+any' } else { 'exit0+empty-or-json' }
            $got = if ($code -ne 0) { "exit$code" }
                   elseif ($event -eq 'UserPromptSubmit') { 'exit0+any' }
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
    $script = switch ([string]$c.hook) { 'fence' { 'fence.ps1' } 'agent' { 'agent.ps1' } 'ask' { 'ask.ps1' } default { 'guard.ps1' } }
    $cwd = if ($c.cwd) { Expand $c.cwd } else { $repoClean }
    $session = if ($c.session) { $c.session } else { 's-default' }
    if ($c.PSObject.Properties['stdin']) { $stdin = [string]$c.stdin }
    else {
        $ti = @{}
        switch ($c.tool) {
            { $_ -in 'Bash', 'PowerShell' } { $ti.command = Expand $c.cmd }
            'NotebookEdit' { $ti.notebook_path = Expand $c.path; $ti.new_source = 'x' }
            'Write' { $ti.file_path = Expand $c.path; $ti.content = if ($null -ne $c.content) { [string]$c.content } else { 'x' } }
            'AskUserQuestion' {
                $n = if ($c.n) { [int]$c.n } else { 1 }
                $ti.questions = @(1..$n | ForEach-Object { @{ question = "q$_"; header = 'h'; options = @(@{ label = 'a'; description = 'a' }, @{ label = 'b'; description = 'b' }) } })
            }
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

# ------------------------------------------------------------------ 4. route.ps1 + subagent.ps1 (DES-13)
Write-Host '-- route.ps1 and subagent.ps1'
# The sandbox brain has no LAW.md and no route-policy.json, so the kit's LAW.md and template policy
# are the index and the policy: the no-brain-files path.
function Route([string]$prompt, [string]$session, [string]$cwd) {
    $stdin = @{ session_id = $session; cwd = $cwd; hook_event_name = 'UserPromptSubmit'; prompt_id = 'p'; prompt = $prompt } | ConvertTo-Json -Compress
    return (Invoke-Hook 'route.ps1' $stdin)
}
function Sub([string]$session, [string]$type) {
    $stdin = @{ session_id = $session; cwd = $root; hook_event_name = 'SubagentStart'; agent_id = 'a'; agent_type = $type } | ConvertTo-Json -Compress
    return (Invoke-Hook 'subagent.ps1' $stdin)
}
$r = Route 'please build the new feature and commit it' 'r1' $root
Record 'route: a build+commit prompt injects DES and VCS rows' 'des+vcs' $(if ($r.code -eq 0 -and $r.out -match 'group DES' -and $r.out -match 'group VCS' -and $r.out -match 'DES-01 \[') { 'des+vcs' } else { 'wrong' }) $r.out
Record 'route: rows name the owning file as a real path' 'resolved' $(if ($r.out -match 'full text: ' -and $r.out -notmatch 'kit:instructions') { 'resolved' } else { 'unresolved' }) $r.out
Record 'route: the active set is recorded for the session' 'recorded' $(if ((Test-Path -LiteralPath (Join-Path $env:DF_MARKER_DIR 'r1.routes')) -and ((Get-Content (Join-Path $env:DF_MARKER_DIR 'r1.routes')) -contains 'DES')) { 'recorded' } else { 'missing' }) ''
$r = Route 'yes please' 'r1' $root
Record 'route: a follow-up that names nothing injects nothing' 'silent' $(if ($r.code -eq 0 -and [string]::IsNullOrWhiteSpace($r.out)) { 'silent' } else { 'noisy' }) $r.out
$r = Route 'now commit and push the repo' 'r1' $root
Record 'route: an already-active group is not injected twice' 'silent' $(if ($r.code -eq 0 -and [string]::IsNullOrWhiteSpace($r.out)) { 'silent' } else { 'again' }) $r.out
$r = Route 'start the server and check the log' 'r1' $root
Record 'route: a new group later in the session is added' 'obs' $(if ($r.out -match 'group OBS' -and $r.out -notmatch 'group DES') { 'obs' } else { 'wrong' }) $r.out
$r = Route 'The goal is to design a loop' 'r2' $root
Record 'route: whole words (design and loop match)' 'des+auto' $(if ($r.out -match 'group DES' -and $r.out -match 'group AUTO') { 'des+auto' } else { 'wrong' }) $r.out
$r = Route 'the designer looped' 'r3' $root
Record 'route: substrings do not match (designer, looped)' 'silent' $(if ([string]::IsNullOrWhiteSpace($r.out)) { 'silent' } else { 'matched' }) $r.out
$r = Sub 'r1' 'general-purpose'
Record 'subagent: gets SAFE plus the session active groups as JSON context' 'safe+active' $(if ($r.code -eq 0 -and $r.out -match 'group SAFE' -and $r.out -match 'group DES' -and $r.out -match 'group OBS' -and $r.out -match '"hookEventName":"SubagentStart"') { 'safe+active' } else { 'wrong' }) $r.out
$r = Sub 'r-fresh' 'Explore'
Record 'subagent: with no routes yet, SAFE alone' 'safe-only' $(if ($r.out -match 'group SAFE' -and $r.out -notmatch 'group DES') { 'safe-only' } else { 'wrong' }) $r.out
# advise-by-role (CR-2026-10-13-HONOUR): the ADVISE clauses ride with the role that judges them
$r = Sub 'r1' 'design-first:reviewer'
Record 'subagent: the Reviewer gets the ADVISE clauses with the report instruction' 'advised' $(if ($r.out -match 'ADVISE clauses' -and $r.out -match 'OWN-06 \(deliver\)' -and $r.out -match 'You are the Reviewer') { 'advised' } else { 'wrong' }) $r.out
$r = Sub 'r1' 'general-purpose'
Record 'subagent: a Builder gets the same clauses, told the Reviewer names them' 'advised' $(if ($r.out -match 'ADVISE clauses' -and $r.out -match 'GAME-14 \(cite\)' -and $r.out -match 'the Reviewer names each one' -and $r.out -notmatch 'You are the Reviewer') { 'advised' } else { 'wrong' }) $r.out
# skills (DES-12): a prompt that shares a word with an installed skill names the skill, once
$skillDir = Join-Path $root '.claude\skills\sandbox-skill'
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
Set-Content -LiteralPath (Join-Path $skillDir 'SKILL.md') -Value "---`nname: sandbox-skill`ndescription: Build a pitchsite for a local business the house way.`n---`nbody" -Encoding utf8
$r = Route 'make a pitchsite for the cafe' 'r4' $root
Record 'route: a prompt sharing a word with a skill names it, with its path' 'named' $(if ($r.out -match 'design-first skills \(DES-12\)' -and $r.out -match 'sandbox-skill: Build a pitchsite' -and $r.out -match 'SKILL\.md') { 'named' } else { 'silent' }) $r.out
$r = Route 'another pitchsite please' 'r4' $root
Record 'route: the same skill is not named twice in a session' 'silent' $(if ($r.out -notmatch 'sandbox-skill') { 'silent' } else { 'again' }) $r.out
$r = Route 'the pitches' 'r5' $root
Record 'route: a substring (pitches) does not match the skill' 'silent' $(if ($r.out -notmatch 'sandbox-skill') { 'silent' } else { 'matched' }) $r.out
$e = Entry $root 'r1' 'compact'
Record 'entry: compaction clears the session routes' 'cleared' $(if (-not (Test-Path -LiteralPath (Join-Path $env:DF_MARKER_DIR 'r1.routes'))) { 'cleared' } else { 'kept' }) $e.out
$r = Route 'commit it' 'r1' $root
Record 'route: after compaction the group is injected again' 'vcs-again' $(if ($r.out -match 'group VCS') { 'vcs-again' } else { 'silent' }) $r.out

# ------------------------------------------------------------------ 5. stop.ps1 + the edit ledger (DES-07, GATE-05/06/07)
Write-Host '-- stop.ps1 and the edit ledger'
function Stop([string]$session, [bool]$active) {
    $stdin = @{ session_id = $session; cwd = $root; hook_event_name = 'Stop'; stop_hook_active = $active; last_assistant_message = 'x' } | ConvertTo-Json -Compress
    return (Invoke-Hook 'stop.ps1' $stdin)
}
function Ledger([string]$session) { return (Join-Path $env:DF_MARKER_DIR ($session + '.edits')) }
# the guard writes the ledger for an allowed source edit, with the changelog flag on a DECISIONS.md write that carries a row
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'st-ledger'; cwd = $repoClean; hook_event_name = 'PreToolUse'; tool_name = 'Edit'; tool_input = @{ file_path = (Join-Path $repoClean 'src\main.py'); old_string = 'a'; new_string = 'b' } } | ConvertTo-Json -Compress)
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'st-ledger'; cwd = $repoClean; hook_event_name = 'PreToolUse'; tool_name = 'Edit'; tool_input = @{ file_path = (Join-Path $repoClean 'DECISIONS.md'); old_string = 'a'; new_string = "| 2026-10-08 | a row | r |`n" } } | ConvertTo-Json -Compress)
$null = Invoke-Hook 'guard.ps1' (@{ session_id = 'st-ledger'; cwd = $repoClean; hook_event_name = 'PreToolUse'; tool_name = 'Edit'; tool_input = @{ file_path = (Join-Path $root 'frozen\x.py'); old_string = 'a'; new_string = 'b' } } | ConvertTo-Json -Compress)
$led = if (Test-Path -LiteralPath (Ledger 'st-ledger')) { Get-Content -LiteralPath (Ledger 'st-ledger') -Raw } else { '' }
Record 'ledger: an allowed source edit is recorded' 'recorded' $(if ($led -like "*src\main.py*") { 'recorded' } else { 'missing' }) $led
Record 'ledger: a DECISIONS.md edit with a Change Log row is flagged' 'flagged' $(if ($led -match 'DECISIONS\.md\tchangelog') { 'flagged' } else { 'unflagged' }) $led
Record 'ledger: a denied edit (frozen path) is not recorded' 'absent' $(if ($led -notlike '*frozen*') { 'absent' } else { 'present' }) $led
# stop: source changed, docs touched with a changelog row -> block, card names the docs and no GATE-06 line
$r = Stop 'st-ledger' $false
Record 'stop: source changed this turn -> block with the card' 'block' $(if ($r.code -eq 0) { Classify $r.out } else { "exit$($r.code)" }) $r.out
Record 'stop: the card names the documents touched' 'named' $(if ($r.out -like '*Documents touched: DECISIONS.md*') { 'named' } else { 'missing' }) $r.out
Record 'stop: a Change Log row present -> no GATE-06 line' 'quiet' $(if ($r.out -notlike '*no Change Log row*') { 'quiet' } else { 'nagged' }) $r.out
$r = Stop 'st-ledger' $true
Record 'stop: second attempt (stop_hook_active) -> yields' 'allow' $(if ($r.code -eq 0 -and [string]::IsNullOrWhiteSpace($r.out)) { 'allow' } else { 'blocked-again' }) $r.out
# stop: source changed, no doc touched -> DES-07 line; DECISIONS edited with no row -> GATE-06 line
Put (Ledger 'st-nodoc') ((Join-Path $repoClean 'src\main.py') + "`t`n")
$r = Stop 'st-nodoc' $false
Record 'stop: no document touched -> DES-07 line' 'des07' $(if ((Classify $r.out) -eq 'block' -and $r.out -like '*Documents touched: none*') { 'des07' } else { 'wrong' }) $r.out
Put (Ledger 'st-norow') ((Join-Path $repoClean 'src\main.py') + "`t`n" + (Join-Path $repoClean 'DECISIONS.md') + "`t`n")
$r = Stop 'st-norow' $false
Record 'stop: DECISIONS.md edited with no Change Log row -> GATE-06 line' 'gate06' $(if ($r.out -like '*no Change Log row*') { 'gate06' } else { 'quiet' }) $r.out
# stop: GATE-01, a repository born this turn with no question asked this session -> the interview line
$null = Route 'yes please' 'st-born' $root          # writes the turn marker, injects nothing
$null = Route 'yes please' 'st-born-asked' $root
Start-Sleep -Milliseconds 50
$repoBorn = NewRepo 'repo-born'
Put (Join-Path $repoBorn 'src\new.py') 'print(7)'
Put (Join-Path $repoBorn 'DECISIONS.md') '# decisions'
Put (Ledger 'st-born') ((Join-Path $repoBorn 'src\new.py') + "`t`n")
$r = Stop 'st-born' $false
Record 'stop: a repo created this turn, no question asked -> GATE-01 line' 'gate01' $(if ((Classify $r.out) -eq 'block' -and $r.out -like '*GATE-01*') { 'gate01' } else { 'quiet' }) $r.out
Put (Join-Path $env:DF_MARKER_DIR 'st-born-asked.asked') '2026-10-13T00:00:00Z'
Put (Ledger 'st-born-asked') ((Join-Path $repoBorn 'src\new.py') + "`t`n")
$r = Stop 'st-born-asked' $false
Record 'stop: the same repo with a question asked this session -> no GATE-01 line' 'quiet' $(if ((Classify $r.out) -eq 'block' -and $r.out -notlike '*GATE-01*') { 'quiet' } else { 'nagged' }) $r.out
Record 'stop: an old repo (repo-clean) never gets the GATE-01 line' 'quiet' $(if ((Stop 'st-nodoc' $false).out -notlike '*GATE-01*') { 'quiet' } else { 'nagged' }) ''
# ask: an allowed question writes the session's interview marker
$null = Invoke-Hook 'ask.ps1' (@{ session_id = 'st-ask-marker'; cwd = $root; hook_event_name = 'PreToolUse'; tool_name = 'AskUserQuestion'; tool_input = @{ questions = @(@{ question = 'q'; header = 'h'; options = @(@{ label = 'a'; description = 'd' }, @{ label = 'b'; description = 'e' }); multiSelect = $false }) } } | ConvertTo-Json -Compress -Depth 6)
Record 'ask: an allowed question writes the .asked marker' 'written' $(if (Test-Path -LiteralPath (Join-Path $env:DF_MARKER_DIR 'st-ask-marker.asked')) { 'written' } else { 'missing' }) ''
# stop: docs only, or nothing -> silent
Put (Ledger 'st-docs') ((Join-Path $repoClean 'README.md') + "`t`n")
$r = Stop 'st-docs' $false
Record 'stop: only documents changed -> silent' 'allow' $(if ([string]::IsNullOrWhiteSpace($r.out)) { 'allow' } else { 'blocked' }) $r.out
$r = Stop 'st-empty' $false
Record 'stop: no ledger -> silent' 'allow' $(if ([string]::IsNullOrWhiteSpace($r.out)) { 'allow' } else { 'blocked' }) $r.out
# ledger scope: only a path in a git repository, and under the root when the pointer names one, is a
# code change. The first live card counted the session scratchpad as a repository.
function GuardEdit([string]$session, [string]$path) {
    return (Invoke-Hook 'guard.ps1' (@{ session_id = $session; cwd = $root; hook_event_name = 'PreToolUse'; tool_name = 'Write'; tool_input = @{ file_path = $path; content = 'x = 1' } } | ConvertTo-Json -Compress))
}
function LedgerText([string]$session) { if (Test-Path -LiteralPath (Ledger $session)) { return (Get-Content -LiteralPath (Ledger $session) -Raw) } else { return '' } }
$repoOut = Join-Path $T 'outside\repo-out'
New-Item -ItemType Directory -Force -Path $repoOut | Out-Null
RunGit $repoOut @('init', '-q', '-b', 'main')
Put (Join-Path $repoOut 'DECISIONS.md') '# decisions'
$scratch = Join-Path $T 'outside\scratch.py'
$null = GuardEdit 'sc-norepo' (Join-Path $root 'ordinary\new.py')
Record 'ledger scope: under the root, in no repository -> not recorded' 'absent' $(if ([string]::IsNullOrWhiteSpace((LedgerText 'sc-norepo'))) { 'absent' } else { 'present' }) (LedgerText 'sc-norepo')
$null = GuardEdit 'sc-scratch' $scratch
Record 'ledger scope: outside the root, in no repository -> not recorded' 'absent' $(if ([string]::IsNullOrWhiteSpace((LedgerText 'sc-scratch'))) { 'absent' } else { 'present' }) (LedgerText 'sc-scratch')
$null = GuardEdit 'sc-repoout' (Join-Path $repoOut 'a.py')
Record 'ledger scope: a repository outside the root -> not recorded' 'absent' $(if ([string]::IsNullOrWhiteSpace((LedgerText 'sc-repoout'))) { 'absent' } else { 'present' }) (LedgerText 'sc-repoout')
$saved = $env:DF_POINTER_PATH; $env:DF_POINTER_PATH = Join-Path $T 'no-such-pointer.json'
$null = GuardEdit 'sc-noptr' (Join-Path $repoOut 'a.py')
$null = GuardEdit 'sc-noptr' $scratch
$env:DF_POINTER_PATH = $saved
$led = LedgerText 'sc-noptr'
Record 'ledger scope: no pointer, a repository edit is recorded, a loose file is not' 'repo-only' $(if ($led -like '*repo-out\a.py*' -and $led -notlike '*scratch.py*') { 'repo-only' } else { 'wrong' }) $led
# a ledger written before the fix (or by hand) is filtered by the Stop hook as well
Put (Ledger 'sc-old') ($scratch + "`t`n")
$r = Stop 'sc-old' $false
Record 'stop: only an out-of-scope path in the ledger -> silent' 'allow' $(if ($r.code -eq 0 -and [string]::IsNullOrWhiteSpace($r.out)) { 'allow' } else { 'blocked' }) $r.out
Put (Ledger 'sc-mixed') ($scratch + "`t`n" + (Join-Path $repoOut 'a.py') + "`t`n" + (Join-Path $repoClean 'src\main.py') + "`t`n")
$r = Stop 'sc-mixed' $false
Record 'stop: in-scope and out-of-scope source -> the card counts the repository only' 'one-repo' $(if ((Classify $r.out) -eq 'block' -and $r.out -like '*repo-clean: 1 source file*' -and $r.out -notlike '*outside*') { 'one-repo' } else { 'wrong' }) $r.out
# a new prompt clears the ledger
$null = Route 'yes' 'st-ledger' $root
Record 'route: a new prompt clears the edit ledger' 'cleared' $(if (-not (Test-Path -LiteralPath (Ledger 'st-ledger'))) { 'cleared' } else { 'kept' }) ''

# ------------------------------------------------------------------ 6, 7 and 8. cases split by domain (DES-03)
# 6: the commit-msg check (VCS-23). 7: the state card (GAME-13). 8: the Stop card reading the turn's
# changes from git. Each file uses the fixtures and helpers above and records into the same result list.
. (Join-Path $here 'cases-law-claim.ps1')
. (Join-Path $here 'cases-state-card.ps1')
. (Join-Path $here 'cases-stop-git.ps1')

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
