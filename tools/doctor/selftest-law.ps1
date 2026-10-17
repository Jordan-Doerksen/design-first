# selftest-law.ps1 - the law build and the docs build, run on planted inputs (CR-2026-10-15-GAPS
# review). Dot-sourced by selftest.ps1 at the end of its run. It shares Ok, Bad, the Assert-*
# helpers, W, WJ, NewDir, $here and $T. Both builds find the kit from their own location, so each
# case runs the kit's real scripts from a scratch copy under $T, next to planted inputs.
#
# Three results that were wrong, each with a case that fails when its fix is reverted:
#   1. The LAW.md legend said ADVISE "injects context and the call proceeds". The Stop hook is ADVISE
#      too, and it holds the first stop of a turn once, with its card (D4). The legend now says a
#      hook adds context or asks once, and the call or the turn proceeds.
#   2. A clause could name a hook script that hooks/hooks.json does not register, and LAW.md printed
#      HOOK or ADVISE over a script that never runs. validate.ps1 now fails that clause. It compares
#      the path under hooks/, not the file name: hooks/lib/reg.ps1 is not hooks/reg.ps1, and a
#      script registered in a subfolder of hooks/ is found.
#   3. docs/build.ps1 threw "unknown grade" on a DENY clause, so KIT-DOCS-01 would have gone
#      COULD-NOT-LOOK on the first one. It now accepts DENY and counts it as stopped (D6), and
#      page.css gives the DENY chip a background; without one the chip is white on the page.

$lawKit = Split-Path -Parent (Split-Path -Parent $here)   # the real kit: two folders above tools\doctor

function Invoke-LawScript {
    param([string] $Script, [string[]] $ScriptArgs)
    $out = & pwsh -NoProfile -File $Script @ScriptArgs 2>&1 | Out-String
    return [PSCustomObject]@{ out = $out; code = $LASTEXITCODE }
}

function New-LawClause {
    param([string] $Id, [string] $Grade, [string] $Ref, [string] $Verb)
    return [ordered]@{ id = $Id; group = 'TST'; verb = $Verb; rule = 'A planted rule for the law self-test.'
        owner = 'kit:instructions/test-law.md'; grade = $Grade; since = '2026-10-15'; enforcedBy = [ordered]@{ kind = 'hook'; ref = $Ref } }
}

# ================================================================ run L: the law build
Write-Host '  Run L: the law build on planted clauses' -ForegroundColor Cyan

# A scratch kit: the three law scripts, five hook scripts with one anchor each, and a hooks.json
# that registers three of them: one in the command form, one in the args form, one in a subfolder.
# hooks\lib\reg.ps1 has the file name of a registered script and is registered nowhere.
$lk = NewDir (Join-Path $T 'lawkit')
$lkLaw = NewDir (Join-Path $lk 'tools\law')
foreach ($f in 'build-law.ps1', 'validate.ps1', 'render.ps1') { Copy-Item -LiteralPath (Join-Path $lawKit "tools\law\$f") -Destination $lkLaw }
W (Join-Path $lk 'hooks\reg.ps1')      "# anchor: t-reg  mode: deny  verbs: test-reg`nexit 0`n"
W (Join-Path $lk 'hooks\argsreg.ps1')  "# anchor: t-args  mode: advise  verbs: test-args`nexit 0`n"
W (Join-Path $lk 'hooks\unreg.ps1')    "# anchor: t-unreg  mode: deny  verbs: test-unreg`nexit 0`n"
W (Join-Path $lk 'hooks\lib\reg.ps1')  "# anchor: t-lib  mode: deny  verbs: test-lib`n"
W (Join-Path $lk 'hooks\sub\deep.ps1') "# anchor: t-deep  mode: deny  verbs: test-deep`nexit 0`n"
W (Join-Path $lk 'hooks\hooks.json') (@'
{ "hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/reg.ps1\"" } ] }
  ],
  "Stop": [
    { "hooks": [ { "type": "command", "args": ["pwsh", "-NoProfile", "-File", "${CLAUDE_PLUGIN_ROOT}/hooks/argsreg.ps1"] } ] }
  ],
  "SessionStart": [
    { "hooks": [ { "type": "command", "command": "pwsh -NoProfile -File \"${CLAUDE_PLUGIN_ROOT}/hooks/sub/deep.ps1\"" } ] }
  ] } }
'@)
W (Join-Path $lk 'instructions\test-law.md') "# Test law`n`n### TST-01`n`nRegistered, command form.`n`n### TST-02`n`nRegistered, args form.`n`n### TST-03`n`nNot registered.`n`n### TST-04`n`nA lib file with a registered file name.`n`n### TST-05`n`nRegistered in a subfolder.`n"
$lkOk = @((New-LawClause 'TST-01' 'HOOK' 'hooks/reg.ps1#t-reg' 'test-reg'), (New-LawClause 'TST-02' 'ADVISE' 'hooks/argsreg.ps1#t-args' 'test-args'), (New-LawClause 'TST-05' 'HOOK' 'hooks/sub/deep.ps1#t-deep' 'test-deep'))
WJ (Join-Path $lk 'law-ok.json')    ([ordered]@{ schema = 1; groups = [ordered]@{ TST = 'Test' }; clauses = $lkOk })
WJ (Join-Path $lk 'law-unreg.json') ([ordered]@{ schema = 1; groups = [ordered]@{ TST = 'Test' }; clauses = ($lkOk + @(New-LawClause 'TST-03' 'HOOK' 'hooks/unreg.ps1#t-unreg' 'test-unreg')) })
WJ (Join-Path $lk 'law-lib.json')   ([ordered]@{ schema = 1; groups = [ordered]@{ TST = 'Test' }; clauses = ($lkOk + @(New-LawClause 'TST-04' 'HOOK' 'hooks/lib/reg.ps1#t-lib' 'test-lib')) })
$lkBuild = Join-Path $lkLaw 'build-law.ps1'

# L1 and L2: every clause on a registered script builds, and the legend says what ADVISE does.
$lkOut = Join-Path $T 'law-ok.md'
$r = Invoke-LawScript $lkBuild @('-Source', (Join-Path $lk 'law-ok.json'), '-Out', $lkOut)
Assert-Exit 'L: clauses on registered hook scripts (command and args forms, a subfolder) build' $r.code 0
$lkText = if (Test-Path -LiteralPath $lkOut) { [IO.File]::ReadAllText($lkOut) } else { '' }
Assert-Has 'L: a clause on a registered hook keeps its grade' $lkText '| TST-02 | ADVISE |'
Assert-Has 'L: a clause on a script registered in a subfolder of hooks keeps its grade' $lkText '| TST-05 | HOOK |'
Assert-Has 'L: the ADVISE legend covers the Stop card: a hook adds context or asks once, the call or the turn proceeds' $lkText '- **ADVISE** a hook adds context or asks once; the call or the turn proceeds'
Assert-HasNot 'L: the legend no longer says only that the call proceeds' $lkText 'injects context and the call proceeds'

# L3: a clause on a script hooks.json does not register fails the build, and nothing is written.
$lkBad = Join-Path $T 'law-unreg.md'
$r = Invoke-LawScript $lkBuild @('-Source', (Join-Path $lk 'law-unreg.json'), '-Out', $lkBad)
Assert-Exit 'L: a clause on an unregistered hook script fails the build' $r.code 1
Assert-Has 'L: the failure names the clause and the script' $r.out "FAIL TST-03: hook script 'unreg.ps1' is not registered in hooks/hooks.json"
Assert-HasNot 'L: the registered clauses are not failed with it' $r.out 'FAIL TST-01'
if (-not (Test-Path -LiteralPath $lkBad)) { Ok 'L: a failed build writes no LAW.md' } else { Bad 'L: a failed build writes no LAW.md' "found $lkBad" }

# L3b: the registry is read by path under hooks, not by file name: a lib file named like a
# registered script is not registered.
$r = Invoke-LawScript $lkBuild @('-Source', (Join-Path $lk 'law-lib.json'), '-Out', (Join-Path $T 'law-lib.md'))
Assert-Exit 'L: a clause on a lib file with a registered file name fails the build' $r.code 1
Assert-Has 'L: the failure names the lib path' $r.out "FAIL TST-04: hook script 'lib/reg.ps1' is not registered in hooks/hooks.json"

# L4: with no hooks.json, nothing shows that any hook is registered: a fail, not a pass.
Remove-Item -LiteralPath (Join-Path $lk 'hooks\hooks.json') -Force
$r = Invoke-LawScript $lkBuild @('-Source', (Join-Path $lk 'law-ok.json'), '-Out', (Join-Path $T 'law-nohooks.md'))
Assert-Exit 'L: no hooks.json fails a hook clause instead of passing it' $r.code 1
Assert-Has 'L: the failure says hooks.json is missing' $r.out 'hooks/hooks.json does not exist'

# ================================================================ run M: the docs build accepts DENY
Write-Host '  Run M: the docs build with a planted DENY clause' -ForegroundColor Cyan
# A scratch kit with every input docs/build.ps1 reads, and the kit's law.json with one clause that
# no machine stops (not DENY, HOOK or GATE) re-graded DENY, so a DENY that is not counted as stopped
# shows as a count one short.
$dk = NewDir (Join-Path $T 'docskit')
foreach ($rel in '.claude-plugin\plugin.json', 'hooks\hooks.json', 'tools\doctor\claims.json', 'README.md', 'ARCHITECTURE.md', 'LOOPS.md', 'agents\reviewer.md', 'LICENSE', 'docs\build.ps1') {
    $to = Join-Path $dk $rel; $null = NewDir (Split-Path -Parent $to)
    Copy-Item -LiteralPath (Join-Path $lawKit $rel) -Destination $to
}
foreach ($pair in @(@('hooks', '*.ps1'), @('commands', '*.md'), @('docs\src', '*'))) {
    $to = NewDir (Join-Path $dk $pair[0])
    Get-ChildItem -LiteralPath (Join-Path $lawKit $pair[0]) -Filter $pair[1] -File | Copy-Item -Destination $to
}
$dLaw = Get-Content -LiteralPath (Join-Path $lawKit 'law.json') -Raw -Encoding utf8 | ConvertFrom-Json
$dPick = @($dLaw.clauses | Where-Object { $_.grade -notin @('DENY', 'HOOK', 'GATE') })[0]
$dPick.grade = 'DENY'
$dPick | Add-Member -NotePropertyName enforcedBy -NotePropertyValue ([pscustomobject]@{ kind = 'permission-rule'; ref = 'templates/root-settings.json#permissions.deny' }) -Force
WJ (Join-Path $dk 'law.json') $dLaw
$dDeny = @($dLaw.clauses | Where-Object { $_.grade -eq 'DENY' }).Count
$dStopped = @($dLaw.clauses | Where-Object { $_.grade -in @('DENY', 'HOOK', 'GATE') }).Count
$dOut = Join-Path $T 'docs-deny.html'
$r = Invoke-LawScript (Join-Path $dk 'docs\build.ps1') @('-Out', $dOut)
Assert-Exit ("M: the docs build accepts a DENY clause ({0} planted on {1})" -f $dDeny, $dPick.id) $r.code 0
Assert-Has 'M: a DENY clause counts as stopped by a machine' $r.out ("({0} clauses, {1} stopped by a machine" -f @($dLaw.clauses).Count, $dStopped)
$dHtml = if (Test-Path -LiteralPath $dOut) { [IO.File]::ReadAllText($dOut) } else { '' }
Assert-Has 'M: the page counts DENY with the other grades' $dHtml ('<span class="g g-deny">DENY</span><b>{0}</b>' -f $dDeny)
# A grade chip is white text on its grade's background. With no rule in page.css for its class, a
# chip is white on the page and cannot be read: g-deny had none.
$dCss = [IO.File]::ReadAllText((Join-Path $lawKit 'docs\page.css'))
$dChips = @([regex]::Matches($dHtml, 'class="g (g-[a-z]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$dBare = @($dChips | Where-Object { $dCss -notmatch ('\.' + [regex]::Escape($_) + '\s*\{[^}]*background') })
if ($dChips -contains 'g-deny' -and $dBare.Count -eq 0) { Ok ("M: every grade chip on the page has a background in page.css ({0})" -f ($dChips -join ', ')) }
else { Bad 'M: every grade chip on the page has a background in page.css' ("no background rule for: {0} (chips: {1})" -f ($dBare -join ', '), ($dChips -join ', ')) }
