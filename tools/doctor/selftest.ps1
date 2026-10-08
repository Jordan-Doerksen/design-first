# selftest.ps1 - plant every failure and require the Doctor to CATCH it; plant every truth and
# require it to pass. A health check that cannot fail is worse than no health check, so every
# claim type gets one true and one false case here, and the three exit codes are each proven.
#
# Builds a throwaway pointer, brain, root and kit-like tree under %TEMP%, points USERPROFILE at a
# fake home (so %USERPROFILE% expansion, the default pointer location and the fence-log-absent case
# are all exercised without touching the real machine), runs the Doctor six ways, deletes it all.
# Run under pwsh:  pwsh -NoProfile -File tools/doctor/selftest.ps1

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$doctor = Join-Path $here 'doctor.ps1'
$templates = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'templates'
$pass = 0; $fail = 0
$utf8 = [Text.UTF8Encoding]::new($false)

function Ok   { param([string] $Name) Write-Host ("  PASS  {0}" -f $Name) -ForegroundColor Green; $script:pass++ }
function Bad  { param([string] $Name, [string] $Why) Write-Host ("  FAIL  {0}" -f $Name) -ForegroundColor Red; Write-Host ("        {0}" -f $Why) -ForegroundColor DarkGray; $script:fail++ }
function Assert-Has    { param([string] $Name, [string] $Out, [string] $Needle) if ($Out.Contains($Needle)) { Ok $Name } else { Bad $Name "expected the output to contain: $Needle" } }
function Assert-HasNot { param([string] $Name, [string] $Out, [string] $Needle) if ($Out.Contains($Needle)) { Bad $Name "output must NOT contain: $Needle" } else { Ok $Name } }
function Assert-Exit   { param([string] $Name, [int] $Actual, [int] $Expected) if ($Actual -eq $Expected) { Ok ("{0} (exit {1})" -f $Name, $Actual) } else { Bad $Name "exit was $Actual, expected $Expected" } }
function Assert-Count  { param([string] $Name, [string] $Out, [string] $Needle, [int] $Expected) $n = ([regex]::Matches($Out, [regex]::Escape($Needle))).Count; if ($n -eq $Expected) { Ok ("{0} ({1}x)" -f $Name, $n) } else { Bad $Name "expected '$Needle' $Expected time(s), found $n" } }
function W    { param([string] $Path, [string] $Text) $d = Split-Path -Parent $Path; if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }; [IO.File]::WriteAllText($Path, $Text, $utf8) }
function WJ   { param([string] $Path, $Obj) W $Path (($Obj | ConvertTo-Json -Depth 12) + "`n") }
function NewDir { param([string] $Path) New-Item -ItemType Directory -Path $Path -Force | Out-Null; return $Path }

$T = Join-Path $env:TEMP ('design-first-selftest-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$root = NewDir (Join-Path $T 'root'); $brain = NewDir (Join-Path $T 'brain'); $kit = NewDir (Join-Path $T 'kit'); $fakeHome = NewDir (Join-Path $T 'home\.claude')
$fakeHome = Split-Path -Parent $fakeHome
Write-Host ''; Write-Host ("  Planting in {0}" -f $T) -ForegroundColor Cyan; Write-Host ''

function New-TestRepo {
    param([string] $Parent, [string] $Name, [switch] $NoCommit)
    $p = NewDir (Join-Path $Parent $Name)
    & git -C $p init -q 2>&1 | Out-Null
    & git -C $p config user.email 'selftest@local' 2>&1 | Out-Null
    & git -C $p config user.name 'selftest' 2>&1 | Out-Null
    if (-not $NoCommit) { W (Join-Path $p 'README.md') "test`n"; & git -C $p add -A 2>&1 | Out-Null; & git -C $p commit -q -m seed 2>&1 | Out-Null }
    return $p
}

function Invoke-Doctor {
    # Child env: fake USERPROFILE so %USERPROFILE% and the default pointer resolve into the sandbox.
    param([string[]] $DoctorArgs, [string] $Profile, [string] $PointerOverride = '')
    $saveUp = $env:USERPROFILE; $savePtr = $env:DF_POINTER_PATH
    try {
        $env:USERPROFILE = $Profile
        if ($PointerOverride) { $env:DF_POINTER_PATH = $PointerOverride } else { Remove-Item Env:DF_POINTER_PATH -ErrorAction SilentlyContinue }
        $out = & pwsh -NoProfile -File $doctor @DoctorArgs 2>&1 | Out-String
        return [PSCustomObject]@{ out = $out; code = $LASTEXITCODE }
    } finally {
        $env:USERPROFILE = $saveUp
        if ($null -ne $savePtr) { $env:DF_POINTER_PATH = $savePtr } else { Remove-Item Env:DF_POINTER_PATH -ErrorAction SilentlyContinue }
    }
}

try {
    # ---------------------------------------------------------------- the span fixture
    # The permitted form is the slug; the bare first name is DERIVED from it so this file carries the
    # slug only (the kit's own leak claim allows exactly that here, and nothing else).
    $slug = 'Jordan-Doerksen'
    $first = $slug.Split('-')[0]

    # ---------------------------------------------------------------- root: repos and files
    New-TestRepo $root 'unbacked' | Out-Null
    $foreign = New-TestRepo $root 'foreign';  & git -C $foreign remote add origin 'https://github.com/someone-else/thing.git' 2>&1 | Out-Null
    $owned = New-TestRepo $root 'ownedrepo';  & git -C $owned remote add origin 'https://github.com/test-owner/ownedrepo.git' 2>&1 | Out-Null
    $shallow = New-TestRepo $root 'shallowrepo'; W (Join-Path $shallow '.git\shallow') "0000000000000000000000000000000000000000`n"
    $frozen = New-TestRepo $root 'frozenref'; W (Join-Path $frozen 'drift.txt') "someone edited a frozen thing`n"
    $leaky = New-TestRepo $root 'leaky'; W (Join-Path $leaky '.env') "TOKEN=abc123`n"; & git -C $leaky add -A -f 2>&1 | Out-Null; & git -C $leaky commit -q -m oops 2>&1 | Out-Null
    # Linked worktrees: one parent with a tracked .env (no exception registered) and two worktrees.
    # The secret must be reported ONCE, the worktrees folded into one INFO line, and the second
    # worktree, which sits under frozenPaths and is dirty, must still trip frozenDirty.
    $wtMain = New-TestRepo $root 'wtmain'; W (Join-Path $wtMain '.env') "TOKEN=shared`n"; & git -C $wtMain add -A -f 2>&1 | Out-Null; & git -C $wtMain commit -q -m env 2>&1 | Out-Null
    & git -C $wtMain worktree add -q (Join-Path $root 'wtmain-wt1') -b wt1 2>&1 | Out-Null
    & git -C $wtMain worktree add -q (Join-Path $root 'wtmain-wt2') -b wt2 2>&1 | Out-Null
    W (Join-Path $root 'wtmain-wt2\moved.txt') "edited inside a frozen worktree`n"
    W (Join-Path $root 'unversioned\work.txt') "real work, no history`n"
    W (Join-Path $root '_backups\old-snapshot\dump.txt') "deliberately not in git`n"
    $nested = New-TestRepo (NewDir (Join-Path $root 'category')) 'nested-repo'
    W (Join-Path $root 'CLAUDE.md') "# entry`n`nThe prohibitions, in full.`n"
    WJ (Join-Path $root '.claude\settings.json') ([ordered]@{
        permissions = [ordered]@{ deny = @('Read(**/.env)'); ask = @('Bash(npm install *)') }
        autoMode = [ordered]@{ soft_deny = @('Bash(rm *)', 'Edit(**/frozenref/**)') }
    })

    # ---------------------------------------------------------------- brain
    & git -C $brain init -q 2>&1 | Out-Null
    W (Join-Path $brain 'me.md') "---`nowner: test`n---`n"
    W (Join-Path $brain 'records\restore-drill.log') "2019-01-01 09:00  PASS   games\ok  (tree deadbeef)`n2019-01-01 09:01  FAIL   games\broken  (local aaaa vs restored bbbb)`n"
    $ep = NewDir (Join-Path $brain 'entry-point')
    W (Join-Path $ep 'drifted.md') "rule one`nrule two`nrule three`n";  W (Join-Path $ep 'drifted.md.snapshot') "rule one`nrule two`n"
    W (Join-Path $ep 'nosnapshot.md') "governs everything, backed up nowhere`n"
    W (Join-Path $ep 'eolonly.md') "same content`r`nsecond line`r`n";    W (Join-Path $ep 'eolonly.md.snapshot') "same content`nsecond line`n"
    WJ (Join-Path $brain 'config-old.json') ([ordered]@{ schema = 0 })
    # json_keyed_match fixtures: a nested collection (dotted path), keyed by `id`. A and B share
    # ids 1 and 2 (equal, with B's property order shuffled) and each holds a key the other lacks.
    # C repeats A but changes one nested field of the shared id 2.
    $vecA = [ordered]@{ meta = [ordered]@{ v = 1 }; vectors = [ordered]@{ cases = @(
        [ordered]@{ id = 1; name = 'one'; out = [ordered]@{ pnl = 12; legs = @(1, 2) } },
        [ordered]@{ id = 2; name = 'two'; out = [ordered]@{ pnl = -3; legs = @(4) } },
        [ordered]@{ id = 3; name = 'only in A'; out = [ordered]@{ pnl = 0; legs = @() } }) } }
    $vecB = [ordered]@{ vectors = [ordered]@{ cases = @(
        [ordered]@{ out = [ordered]@{ legs = @(4); pnl = -3 }; name = 'two'; id = 2 },
        [ordered]@{ id = 1; name = 'one'; out = [ordered]@{ pnl = 12; legs = @(1, 2) } },
        [ordered]@{ id = 4; name = 'only in B'; out = [ordered]@{ pnl = 9; legs = @(7) } }) } }
    $vecC = [ordered]@{ vectors = [ordered]@{ cases = @(
        [ordered]@{ id = 1; name = 'one'; out = [ordered]@{ pnl = 12; legs = @(1, 2) } },
        [ordered]@{ id = 2; name = 'two'; out = [ordered]@{ pnl = -3; legs = @(5) } }) } }
    WJ (Join-Path $brain 'vectors-a.json') $vecA; WJ (Join-Path $brain 'vectors-b.json') $vecB; WJ (Join-Path $brain 'vectors-c.json') $vecC
    $old = (Get-Date).ToUniversalTime().AddDays(-20).ToString('yyyy-MM-ddTHH:mm:ssZ'); $new = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    W (Join-Path $fakeHome '.claude\hooks-old.log') "$old ERROR guard old failure`nbanner line without a date`n"
    W (Join-Path $fakeHome '.claude\hooks-new.log') "$old ERROR guard old failure`n$new ERROR guard fresh failure`n"

    $cfg = [ordered]@{
        schema = 1; surveyStrict = $false; maxDepth = 3
        excludePathParts = @('\_none_\'); archivedPathParts = @('\_archive\')
        ownerRemotePatterns = @('github.com/test-owner/')
        frozenPaths = @('${ROOT}/frozenref', '${ROOT}/wtmain-wt2'); tombstonedPaths = @()
        unversionedMaxDepth = 3; unversionedIgnorePathParts = @('\_backups\')
        secretExceptions = @()
        acceptedExceptions = @([ordered]@{ path = 'foreign'; kinds = @('foreignRemote'); since = '2026-01-01'; reason = 'vendored, planted' })
        entryPointSnapshots = @(
            [ordered]@{ live = 'entry-point/drifted.md';    snapshot = 'entry-point/drifted.md.snapshot' },
            [ordered]@{ live = 'entry-point/nosnapshot.md'; snapshot = 'entry-point/nosnapshot.md.snapshot' },
            [ordered]@{ live = 'entry-point/eolonly.md';    snapshot = 'entry-point/eolonly.md.snapshot' })
        enforcement = [ordered]@{ fenceLogStaleDays = 30 }
        gitTimeoutSeconds = 20   # dead key: must be reported
    }
    WJ (Join-Path $brain 'doctor.config.json') $cfg
    $strict = [ordered]@{} + $cfg; $strict.surveyStrict = $true; $strict.Remove('gitTimeoutSeconds')
    WJ (Join-Path $brain 'doctor.config.strict.json') $strict

    # ---------------------------------------------------------------- kit-like tree
    $hooks = NewDir (Join-Path $kit 'hooks')
    W (Join-Path $hooks 'good-guard.ps1')  "exit 0`n"
    W (Join-Path $hooks 'bad-guard.ps1')   "Write-Output 'this is not json'`nexit 0`n"
    W (Join-Path $hooks 'crash-guard.ps1') "Write-Error 'planted crash'`nexit 1`n"
    W (Join-Path $hooks 'good-entry.ps1')  "Write-Output 'entry path line one'`nexit 0`n"
    W (Join-Path $hooks 'bad-entry.ps1')   "exit 0`n"
    W (Join-Path $hooks 'hooks.json') (@'
{ "hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [ { "type": "command", "shell": "powershell", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/good-guard.ps1\"" } ] },
    { "matcher": "Bash", "hooks": [ { "type": "command", "shell": "powershell", "args": ["pwsh", "-NoProfile", "-File", "${CLAUDE_PLUGIN_ROOT}/hooks/bad-guard.ps1"] } ] },
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/crash-guard.ps1\"" } ] },
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/gone-guard.ps1\"" } ] }
  ],
  "SessionStart": [
    { "matcher": "startup", "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/good-entry.ps1\"" } ] },
    { "matcher": "startup", "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/bad-entry.ps1\"" } ] }
  ] } }
'@)
    # A stand-in generator honouring the chunk-1 CLI contract: LF output, exit 1 on a planted flag.
    W (Join-Path $kit 'tools\law\build-law.ps1') (@'
param([Parameter(Mandatory)] [string] $Source, [string] $Overlay, [string] $Installed, [Parameter(Mandatory)] [string] $Out, [string] $BrainRoot)
$j = Get-Content -LiteralPath $Source -Raw | ConvertFrom-Json
if ($j.fail) { Write-Error 'planted generator failure'; exit 1 }
$lines = @('# LAW (test)') + @($j.clauses | ForEach-Object { "- $($_.id)" })
if ($Overlay) { $lines += '- overlay: ' + (Split-Path -Leaf $Overlay) }
[IO.File]::WriteAllText($Out, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
exit 0
'@)
    WJ (Join-Path $kit 'law.json') ([ordered]@{ schema = 1; clauses = @([ordered]@{ id = 'A-01' }, [ordered]@{ id = 'A-02' }) })
    WJ (Join-Path $kit 'law-fail.json') ([ordered]@{ fail = $true })
    W (Join-Path $kit 'LAW.md')       "# LAW (test)`r`n- A-01`r`n- A-02`r`n"       # CRLF copy of the LF output: must PASS
    W (Join-Path $kit 'LAW-drift.md') "# LAW (test)`r`n- A-01`r`n- A-02 (edited)`r`n"
    # Leak trees. ok: slug in the allowed file, a longer word that merely contains the name, the
    # name in an excluded file and in an unscanned extension. bad: the bare name in a scanned file.
    # span: the slug in a file the allow table does not cover.
    W (Join-Path $kit 'leak-ok\README.md')  "Author: $slug. See the ${first}ian border (not a whole word).`n"
    W (Join-Path $kit 'leak-ok\LICENSE')    "Copyright $first`n"
    W (Join-Path $kit 'leak-ok\notes.png')  "$first`n"
    W (Join-Path $kit 'leak-ok\clean.json') "{ `"a`": 1 }`n"
    W (Join-Path $kit 'leak-bad\README.md') "Author: $slug`n"
    W (Join-Path $kit 'leak-bad\notes.md')  "written by $first alone`n"
    W (Join-Path $kit 'leak-span\README.md') "Author: $slug`n"
    W (Join-Path $kit 'leak-span\other.md')  "also $slug here`n"
    # Equal trees. a and b: same files, one differing only by CRLF, one excluded file that differs.
    # c: one edited file and one extra file. d: a folder that does not exist.
    W (Join-Path $kit 'eq-a\notes.md')    "line one`nline two`n"
    W (Join-Path $kit 'eq-a\sub\x.json')  "{ `"a`": 1 }`n"
    W (Join-Path $kit 'eq-a\skip.txt')    "generated here`n"
    W (Join-Path $kit 'eq-b\notes.md')    "line one`r`nline two`r`n"
    W (Join-Path $kit 'eq-b\sub\x.json')  "{ `"a`": 1 }`n"
    W (Join-Path $kit 'eq-b\skip.txt')    "generated there`n"
    W (Join-Path $kit 'eq-c\notes.md')    "line one`nline two (edited)`n"
    W (Join-Path $kit 'eq-c\sub\x.json')  "{ `"a`": 1 }`n"
    W (Join-Path $kit 'eq-c\extra.md')    "only here`n"
    # The Doctor itself, copied in, so -Kit resolves ${KIT} to this sandbox and reads its claims.
    $kitDoctor = NewDir (Join-Path $kit 'tools\doctor')
    Get-ChildItem -LiteralPath $here -Filter '*.ps1' | Where-Object { $_.Name -ne 'selftest.ps1' } | Copy-Item -Destination $kitDoctor
    $leakWords = @($first, $slug, 'Zeta'); $leakExt = @('.md', '.json'); $leakAllow = @([ordered]@{ path = 'README.md'; words = @($slug) })
    WJ (Join-Path $kitDoctor 'claims.json') ([ordered]@{ schema = 1; claims = @(
        [ordered]@{ id = 'K-POINTER'; type = 'pointer_valid'; why = 'kit' },
        [ordered]@{ id = 'K-TREE'; type = 'tree_free_of'; root = '${KIT}/leak-ok'; words = $leakWords; extensions = $leakExt; exclude = @('LICENSE'); allow = $leakAllow; why = 'kit' }) })

    # ---------------------------------------------------------------- pointer (default location under the fake home)
    WJ (Join-Path $fakeHome '.claude\design-first.json') ([ordered]@{ schema = 1; root = $root; brain = $brain; pluginRoot = $kit; pluginKind = 'checkout' })
    $badPointer = Join-Path $T 'bad-pointer.json'
    WJ $badPointer ([ordered]@{ schema = 1; root = $root; brain = (Join-Path $T 'no-such-brain'); pluginRoot = $kit; pluginKind = 'checkout' })

    # ---------------------------------------------------------------- claim sets
    $subsetOk  = [ordered]@{ autoMode = [ordered]@{ soft_deny = @('Edit(**/frozenref/**)', 'Bash(rm *)') } }   # order swapped on purpose
    $subsetBad = [ordered]@{ autoMode = [ordered]@{ soft_deny = @('Edit(**/frozenref/**)', 'Bash(wrong *)') } }
    $trueClaims = @(
        [ordered]@{ id = 'T-PATH';        type = 'path_exists';        path = 'me.md'; why = 't' },
        [ordered]@{ id = 'T-ABSENT';      type = 'path_absent';        path = '${BRAIN}/nope.md'; why = 't' },
        [ordered]@{ id = 'T-CONTAINS';    type = 'file_contains';      path = '${ROOT}/CLAUDE.md'; needle = 'prohibitions'; why = 't' },
        [ordered]@{ id = 'T-NOTCONTAINS'; type = 'file_not_contains';  path = '${ROOT}/CLAUDE.md'; needle = 'forbidden thing'; why = 't' },
        [ordered]@{ id = 'T-LOG';         type = 'log_window_free_of'; path = '%USERPROFILE%\.claude\hooks-old.log'; needle = 'ERROR'; days = 7; why = 't' },
        [ordered]@{ id = 'T-REMOTE';      type = 'remote_is';          path = '${ROOT}/ownedrepo'; remote = 'origin'; pattern = 'github\.com/test-owner/'; why = 't' },
        [ordered]@{ id = 'T-JSON';        type = 'json_subset_equal';  path = '${ROOT}/.claude/settings.json'; subset = $subsetOk; why = 't' },
        [ordered]@{ id = 'T-KEYED';       type = 'json_keyed_match';   path = 'vectors-a.json'; other = '${BRAIN}/vectors-b.json'; collection = 'vectors.cases'; key = 'id'; why = 't' },
        [ordered]@{ id = 'T-GEN';         type = 'generated_matches';  generator = 'tools/law/build-law.ps1'; source = '${KIT}/law.json'; output = '${KIT}/LAW.md'; why = 't' },
        [ordered]@{ id = 'T-TREE';        type = 'tree_free_of';       root = '${KIT}/leak-ok'; words = $leakWords; extensions = $leakExt; exclude = @('LICENSE'); allow = $leakAllow; why = 't' },
        [ordered]@{ id = 'T-TREEEQ';      type = 'tree_equals';        path = '${KIT}/eq-a'; other = '${KIT}/eq-b'; exclude = @('skip.txt'); why = 't' },
        [ordered]@{ id = 'T-TREEEQ-SAME'; type = 'tree_equals';        path = '${KIT}/eq-a'; other = '${KIT}/eq-a'; why = 't' },
        [ordered]@{ id = 'T-SMOKE-PRE';   type = 'hook_smoke';         hook = 'good-guard'; event = 'PreToolUse'; why = 't' },
        [ordered]@{ id = 'T-SMOKE-START'; type = 'hook_smoke';         hook = 'good-entry'; event = 'SessionStart'; why = 't' },
        [ordered]@{ id = 'T-POINTER';     type = 'pointer_valid';      why = 't' },
        [ordered]@{ id = 'T-SCHEMA';      type = 'config_schema';      path = 'doctor.config.json'; expected = 1; why = 't' }
    )
    $falseClaims = @(
        [ordered]@{ id = 'F-PATH';        type = 'path_exists';        path = '${BRAIN}/nope.md'; why = 'f' },
        [ordered]@{ id = 'F-ABSENT';      type = 'path_absent';        path = 'me.md'; why = 'f' },
        [ordered]@{ id = 'F-CONTAINS';    type = 'file_contains';      path = '${ROOT}/CLAUDE.md'; needle = 'unicorns'; why = 'f' },
        [ordered]@{ id = 'F-NOTCONTAINS'; type = 'file_not_contains';  path = '${ROOT}/CLAUDE.md'; needle = 'prohibitions'; why = 'f' },
        [ordered]@{ id = 'F-LOG';         type = 'log_window_free_of'; path = '%USERPROFILE%\.claude\hooks-new.log'; needle = 'ERROR'; days = 7; why = 'f' },
        [ordered]@{ id = 'F-REMOTE';      type = 'remote_is';          path = '${ROOT}/foreign'; remote = 'origin'; pattern = 'github\.com/test-owner/'; why = 'f' },
        [ordered]@{ id = 'F-JSON';        type = 'json_subset_equal';  path = '${ROOT}/.claude/settings.json'; subset = $subsetBad; why = 'f' },
        [ordered]@{ id = 'F-KEYED';       type = 'json_keyed_match';   path = 'vectors-a.json'; other = 'vectors-c.json'; collection = 'vectors.cases'; key = 'id'; why = 'f' },
        [ordered]@{ id = 'F-KEYED-ALL';   type = 'json_keyed_match';   path = 'vectors-a.json'; other = 'vectors-b.json'; collection = 'vectors.cases'; key = 'id'; requireAll = $true; why = 'f' },
        [ordered]@{ id = 'F-GEN';         type = 'generated_matches';  generator = 'tools/law/build-law.ps1'; source = '${KIT}/law.json'; output = '${KIT}/LAW-drift.md'; why = 'f' },
        [ordered]@{ id = 'F-TREE';        type = 'tree_free_of';       root = '${KIT}/leak-bad'; words = $leakWords; extensions = $leakExt; exclude = @('LICENSE'); allow = $leakAllow; why = 'f' },
        [ordered]@{ id = 'F-TREE-SPAN';   type = 'tree_free_of';       root = '${KIT}/leak-span'; words = $leakWords; extensions = $leakExt; exclude = @('LICENSE'); allow = $leakAllow; why = 'f' },
        [ordered]@{ id = 'F-TREEEQ';      type = 'tree_equals';        path = '${KIT}/eq-a'; other = '${KIT}/eq-c'; exclude = @('skip.txt'); why = 'f' },
        [ordered]@{ id = 'F-TREEEQ-SKIP'; type = 'tree_equals';        path = '${KIT}/eq-a'; other = '${KIT}/eq-b'; why = 'f' },
        [ordered]@{ id = 'F-SMOKE-PRE';   type = 'hook_smoke';         hook = 'bad-guard'; event = 'PreToolUse'; why = 'f' },
        [ordered]@{ id = 'F-SMOKE-CRASH'; type = 'hook_smoke';         hook = 'crash-guard'; event = 'PreToolUse'; why = 'f' },
        [ordered]@{ id = 'F-SMOKE-GONE';  type = 'hook_smoke';         hook = 'gone-guard'; event = 'PreToolUse'; why = 'f' },
        [ordered]@{ id = 'F-SMOKE-START'; type = 'hook_smoke';         hook = 'bad-entry'; event = 'SessionStart'; why = 'f' },
        [ordered]@{ id = 'F-SCHEMA';      type = 'config_schema';      path = 'config-old.json'; expected = 1; why = 'f' }
    )
    $unknownClaims = @(
        [ordered]@{ id = 'U-GEN';      type = 'generated_matches'; generator = 'tools/law/build-law.ps1'; source = '${KIT}/law-fail.json'; output = '${KIT}/LAW.md'; why = 'u' },
        [ordered]@{ id = 'U-CONTAINS'; type = 'file_contains';     path = '${BRAIN}/missing.md'; needle = 'x'; why = 'u' },
        [ordered]@{ id = 'U-KEYED';    type = 'json_keyed_match';  path = 'vectors-a.json'; other = 'vectors-b.json'; collection = 'vectors.nope'; key = 'id'; why = 'u' },
        [ordered]@{ id = 'U-SMOKE';    type = 'hook_smoke';        hook = 'unregistered'; event = 'PreToolUse'; why = 'u' },
        [ordered]@{ id = 'U-TREEEQ';   type = 'tree_equals';       path = '${KIT}/eq-a'; other = '${KIT}/eq-d'; why = 'u' },
        [ordered]@{ id = 'U-TYPE';     type = 'bogus_type';        why = 'u' }
    )
    WJ (Join-Path $brain 'claims.json')         ([ordered]@{ schema = 1; claims = $trueClaims })
    WJ (Join-Path $brain 'claims-false.json')   ([ordered]@{ schema = 1; claims = $falseClaims })
    WJ (Join-Path $brain 'claims-unknown.json') ([ordered]@{ schema = 1; claims = $unknownClaims })

    # ================================================================ run A: everything true, survey REPORTED -> exit 0
    Write-Host '  Run A: true claims, surveyStrict false' -ForegroundColor Cyan
    $a = Invoke-Doctor -DoctorArgs @() -Profile $fakeHome
    Assert-Exit 'A: survey findings alone leave exit 0' $a.code 0
    Assert-Has 'A: verdict GREEN with findings reported' $a.out 'VERDICT: GREEN'
    Assert-Has 'A: no remote' $a.out 'no remote: unbacked'
    Assert-Has 'A: foreign remote accepted, still shown' $a.out 'FOREIGN remote: foreign'
    Assert-Has 'A: accepted marker' $a.out '[accepted 2026-01-01: vendored, planted]'
    Assert-Has 'A: shallow clone' $a.out 'SHALLOW clone: shallowrepo'
    Assert-Has 'A: frozen reference moved (${ROOT}-relative frozenPaths)' $a.out 'frozen reference has MOVED: frozenref'
    Assert-Has 'A: tracked .env' $a.out 'tracked .env: leaky'
    Assert-Count 'A: worktree parent secret reported ONCE, not once per worktree' $a.out 'tracked .env: wtmain/.env' 1
    Assert-Has 'A: worktrees folded into one INFO line per parent' $a.out '2 linked worktree(s) of wtmain: wtmain-wt1, wtmain-wt2'
    Assert-HasNot 'A: a worktree is not surveyed as its own repo (no remote)' $a.out 'no remote: wtmain-wt'
    Assert-HasNot 'A: a worktree is not surveyed as its own repo (gitattributes)' $a.out 'no .gitattributes: wtmain-wt'
    Assert-Has 'A: a dirty frozen worktree still trips frozenDirty' $a.out 'frozen reference has MOVED: wtmain-wt2'
    Assert-Has 'A: repo count line folds worktrees' $a.out '8 repositories under root (0 archived, not counted; 2 worktree(s) folded into their parents)'
    Assert-Has 'A: no git at all (enumerated)' $a.out 'no git at all: unversioned'
    Assert-HasNot 'A: ignore list suppresses _backups' $a.out 'no git at all: _backups'
    Assert-HasNot 'A: a container is not called unversioned' $a.out 'no git at all: category'
    Assert-Has 'A: stale snapshot' $a.out 'snapshot is STALE: drifted.md'
    Assert-Has 'A: missing snapshot' $a.out 'no snapshot for nosnapshot.md'
    Assert-HasNot 'A: CRLF-only snapshot difference is NOT reported' $a.out 'STALE: eolonly.md'
    Assert-Has 'A: restore drill FAIL line' $a.out 'logged FAIL line'
    Assert-Has 'A: restore drill stale' $a.out 'restore drill is'
    Assert-Has 'A: fence log absent is REPORTED as no trips yet' $a.out 'fence log: no trips yet'
    Assert-Has 'A: dead config key reported' $a.out 'dead config key: gitTimeoutSeconds'
    Assert-Has 'A: soft_deny counted against frozenPaths' $a.out 'soft_deny: 2 rule(s), 1 naming a frozen path'
    Assert-Has 'A: registered-but-missing hook' $a.out 'hook REGISTERED BUT MISSING'
    Assert-Has 'A: deny/ask rules read from root settings' $a.out 'root settings: 1 deny, 1 ask'
    Assert-Has 'A: every true claim holds' $a.out 'CLAIMS  16 pass  0 fail  0 could not look'
    Assert-HasNot 'A: no COULD-NOT-LOOK band' $a.out 'COULD-NOT-LOOK'

    # ================================================================ run B: same disk, surveyStrict true -> exit 1
    Write-Host '  Run B: true claims, surveyStrict true' -ForegroundColor Cyan
    $b = Invoke-Doctor -DoctorArgs @('-ConfigPath', (Join-Path $brain 'doctor.config.strict.json')) -Profile $fakeHome
    Assert-Exit 'B: surveyStrict turns survey fails RED' $b.code 1
    Assert-Has 'B: verdict RED' $b.out 'VERDICT: RED'
    Assert-Has 'B: reason names surveyStrict' $b.out 'surveyStrict is true'

    # ================================================================ run C: one false claim per type -> exit 1
    Write-Host '  Run C: false claims' -ForegroundColor Cyan
    $c = Invoke-Doctor -DoctorArgs @('-ClaimsPath', (Join-Path $brain 'claims-false.json')) -Profile $fakeHome
    Assert-Exit 'C: a false claim is RED' $c.code 1
    foreach ($id in @($falseClaims | ForEach-Object { $_.id })) { Assert-Has "C: $id caught" $c.out ("FAIL  {0}  " -f $id) }
    Assert-Has 'C: config_schema mismatch says MIGRATE' $c.out 'MIGRATE:'
    Assert-Has 'C: span rule - slug outside the allow table trips' $c.out ('other.md:1 "{0}"' -f $slug)
    Assert-Has 'C: bare name trips' $c.out ('notes.md:1 "{0}"' -f $first)
    Assert-Has 'C: generated_matches names the first differing byte' $c.out 'first difference at byte'
    Assert-Has 'C: json_keyed_match names the differing key and field' $c.out "F-KEYED  key 'id' = '2' differs: `$.out.legs[0] is '4' vs '5'"
    Assert-Has 'C: json_keyed_match requireAll names the missing key' $c.out 'F-KEYED-ALL  requireAll: 1 key(s) in'
    Assert-Has 'C: tree_equals names the edited file' $c.out 'differs: notes.md'
    Assert-Has 'C: tree_equals names the extra file' $c.out 'only in other: extra.md'
    Assert-Has 'C: tree_equals sees an excluded file when it is not excluded' $c.out 'F-TREEEQ-SKIP  1 difference(s)'
    Assert-Has 'C: SessionStart silent hook is a fail' $c.out 'printed nothing'
    Assert-Has 'C: PreToolUse non-JSON is a fail' $c.out 'stdout is not JSON'
    Assert-HasNot 'C: no COULD-NOT-LOOK from false claims' $c.out 'COULD-NOT-LOOK'

    # ================================================================ run D: unevaluatable claims -> exit 2, never GREEN
    Write-Host '  Run D: unknown claims' -ForegroundColor Cyan
    $d = Invoke-Doctor -DoctorArgs @('-ClaimsPath', (Join-Path $brain 'claims-unknown.json')) -Profile $fakeHome
    Assert-Exit 'D: could-not-look is exit 2' $d.code 2
    Assert-Has 'D: band printed' $d.out 'COULD-NOT-LOOK'
    Assert-Has 'D: generator exit 1 is could-not-look, not RED' $d.out 'U-GEN  generator exited 1'
    Assert-Has 'D: missing file for file_contains is unknown' $d.out '????  U-CONTAINS'
    Assert-Has 'D: json_keyed_match with a missing collection path is unknown' $d.out "????  U-KEYED  collection 'vectors.nope' not found in"
    Assert-Has 'D: unregistered hook is unknown' $d.out '????  U-SMOKE'
    Assert-Has 'D: tree_equals with a missing folder is unknown' $d.out '????  U-TREEEQ  folder missing'
    Assert-Has 'D: unknown type is unknown' $d.out "unknown claim type 'bogus_type'"
    Assert-HasNot 'D: never GREEN' $d.out 'GREEN'

    # ================================================================ run E: -Kit -Json against the sandbox kit, bad pointer
    Write-Host '  Run E: -Kit -Json with a pointer naming a missing brain' -ForegroundColor Cyan
    $saveUp = $env:USERPROFILE; $savePtr = $env:DF_POINTER_PATH
    try {
        $env:USERPROFILE = $fakeHome; $env:DF_POINTER_PATH = $badPointer
        $eOut = & pwsh -NoProfile -File (Join-Path $kitDoctor 'doctor.ps1') -Kit -Json 2>&1 | Out-String
        $eCode = $LASTEXITCODE
    } finally { $env:USERPROFILE = $saveUp; if ($null -ne $savePtr) { $env:DF_POINTER_PATH = $savePtr } else { Remove-Item Env:DF_POINTER_PATH -ErrorAction SilentlyContinue } }
    Assert-Exit 'E: pointer_valid false is RED under -Kit' $eCode 1
    try {
        $ej = $eOut | ConvertFrom-Json
        Ok 'E: -Json output parses'
        if ($ej.mode -eq 'kit' -and $ej.where.kit -eq $kit) { Ok 'E: kit mode resolves ${KIT} to the checkout holding doctor.ps1' } else { Bad 'E: kit resolution' ("mode={0} kit={1}" -f $ej.mode, $ej.where.kit) }
        $kp = @($ej.bands.claims | Where-Object { $_.id -eq 'K-POINTER' })[0]
        if ($kp.status -eq 'FAIL' -and $kp.detail -like '*do not exist*') { Ok 'E: pointer_valid names the missing folder' } else { Bad 'E: pointer_valid' ("{0}: {1}" -f $kp.status, $kp.detail) }
        $kt = @($ej.bands.claims | Where-Object { $_.id -eq 'K-TREE' })[0]
        if ($kt.status -eq 'PASS') { Ok 'E: kit tree_free_of passes with the span allow' } else { Bad 'E: kit tree_free_of' $kt.detail }
        if (Test-Path -LiteralPath (Join-Path $kit 'state\last-run.json')) { Ok 'E: -Kit writes state under the kit' } else { Bad 'E: kit state' 'kit\state\last-run.json missing' }
    } catch { Bad 'E: -Json output parses' $_.Exception.Message }

    # ================================================================ run F: no pointer at all -> exit 2
    Write-Host '  Run F: no pointer' -ForegroundColor Cyan
    $emptyHome = NewDir (Join-Path $T 'home-empty')
    $f = Invoke-Doctor -DoctorArgs @() -Profile $emptyHome
    Assert-Exit 'F: no pointer is could-not-look' $f.code 2
    Assert-Has 'F: says where it looked' $f.out 'pointer not found at'

    # ================================================================ run G: the Doctor.bat shim resolves pluginRoot from the pointer
    Write-Host '  Run G: Doctor.bat shim' -ForegroundColor Cyan
    $bat = Join-Path $brain 'Doctor.bat'
    Copy-Item -LiteralPath (Join-Path $templates 'Doctor.bat') -Destination $bat
    $saveUp = $env:USERPROFILE
    try {
        $env:USERPROFILE = $fakeHome
        $gOut = & cmd.exe /c "`"$bat`" -Quiet" 2>&1 | Out-String
        $gCode = $LASTEXITCODE
    } finally { $env:USERPROFILE = $saveUp }
    Assert-Exit 'G: shim passes the Doctor exit code through' $gCode 0
    Assert-HasNot 'G: no pause with an argument' $gOut 'Press any key'
    if (Test-Path -LiteralPath (Join-Path $brain 'state\last-run.json')) { Ok 'G: shim ran the kit Doctor (brain state written)' } else { Bad 'G: shim' 'brain\state\last-run.json missing' }

    # ================================================================ determinism: repos.generated.md is byte-identical across runs
    $g1 = [IO.File]::ReadAllBytes((Join-Path $brain 'state\repos.generated.md'))
    $h = Invoke-Doctor -DoctorArgs @('-Quiet') -Profile $fakeHome
    $g2 = [IO.File]::ReadAllBytes((Join-Path $brain 'state\repos.generated.md'))
    if ([Linq.Enumerable]::SequenceEqual($g1, $g2)) { Ok 'H: repos.generated.md is byte-identical on a re-run' } else { Bad 'H: determinism' 'generated table changed with nothing changed' }
    if ($g1.Length -ge 3 -and $g1[0] -eq 0xEF -and $g1[1] -eq 0xBB) { Bad 'H: state files have no BOM' 'BOM found' } else { Ok 'H: state files have no BOM' }
} finally {
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host ("  {0} passed, {1} failed" -f $pass, $fail) -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Write-Host ''
if ($fail -gt 0) { exit 1 }
exit 0
