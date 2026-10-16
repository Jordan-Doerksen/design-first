# cases-grades.ps1 - hook self-test cases for grades that must match what their mechanism does
# (CR-2026-10-15-GAPS D4 and D7). Dot-sourced by run.ps1, which owns the fixtures and helpers used
# here ($kit, $hooks, $root, $repoClean, NewRepo, Put, Record, Route, Stop, Ledger). Never run
# directly.
#
# A grade says whether a machine will stop you. Each case ties a grade to the mechanism on this
# tree. The Stop card blocks the first stop once and yields on the second, so a clause it carries
# grades ADVISE and the card names it and asks about it (GATE-06 included, on every card). A survey
# finding turns the Doctor RED only when it is a fail and surveyStrict is on, and the template ships
# it off, so no kit clause is GATE on a survey anchor; an anchor above a warn declares mode advise,
# so the law build refuses GATE on it in a brain too. Adopt does not install the commit-msg shim
# (read from adopt's plan, not its text), so no kit clause is GATE on the shim. Guard rule 11
# refuses a push and writes no hand-back, so the hand-back is its own BUILDABLE clause.

Write-Host '-- grades: each grade matches what its mechanism does'
$grLaw = Get-Content -LiteralPath (Join-Path $kit 'law.json') -Raw -Encoding utf8 | ConvertFrom-Json
function Get-GrHeadIds($r) {
    # The clause ids in the card's first line: "... then stop (DES-07, GATE-05, ...; the hook asks once per turn)."
    $head = try { [string]@((($r.out | ConvertFrom-Json).reason) -split "`n")[0] } catch { '' }
    if ($head -notmatch '\(([^;)]*);') { return @() }
    return @($Matches[1] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
function Get-GrRefIds([string]$like, [string]$grade) {
    return @($grLaw.clauses | Where-Object { $_.enforcedBy -and [string]$_.enforcedBy.ref -like $like -and (-not $grade -or $_.grade -eq $grade) } | ForEach-Object { [string]$_.id })
}

# ---- D4: the Stop card names every clause it carries, and each one grades ADVISE
# An old repository: no interview line, so the first line names the five that ride on every card.
Put (Ledger 'gr-card') ((Join-Path $repoClean 'src\main.py') + "`t`n")
$grCard = Stop 'gr-card' $false
$grIds = Get-GrHeadIds $grCard
$grFive = @('DES-07', 'GATE-05', 'GATE-06', 'GATE-07', 'GAME-12')
Record 'grades: the card names GAME-12 with the other clauses it carries' 'named' $(if (@($grFive | Where-Object { $grIds -notcontains $_ }).Count -eq 0) { 'named' } else { 'missing: ' + (@($grFive | Where-Object { $grIds -notcontains $_ }) -join ', ') }) $grCard.out
Record 'grades: the card asks for the verify gate command and its pasted output (GAME-12)' 'asked' $(if ($grCard.out -like '*Inner gate (GAME-12)*verify gate command and its output, pasted*') { 'asked' } else { 'missing' }) $grCard.out
# GATE-06 is named on every card, so every card asks about it: a turn that changes behaviour and
# leaves DECISIONS.md alone is the common case of a missing Change Request (second review).
Record 'grades: the card asks whether the turn needs a Change Request (GATE-06), with no DECISIONS.md change' 'asked' $(if ($grCard.out -like '*Change Request (GATE-06): did this turn change design, behaviour, config, risk, execution, data flow or dependencies?*name its Change Request*') { 'asked' } else { 'missing' }) $grCard.out
Record 'grades: no interview line on the card -> GATE-01 not named on it' 'unnamed' $(if ($grIds.Count -gt 0 -and $grIds -notcontains 'GATE-01') { 'unnamed' } else { 'named: ' + ($grIds -join ', ') }) $grCard.out

# A repository born this turn, with no question asked: the interview line, so GATE-01 is named too.
$null = Route 'start the new tool' 'gr-born' $root
Start-Sleep -Milliseconds 50
$grBorn = NewRepo 'repo-born-grades'
Put (Join-Path $grBorn 'src\tool.py') 'print(8)'
Put (Ledger 'gr-born') ((Join-Path $grBorn 'src\tool.py') + "`t`n")
$grBornCard = Stop 'gr-born' $false
$grBornIds = Get-GrHeadIds $grBornCard
Record 'grades: the interview line on the card -> GATE-01 named on its first line' 'named' $(if ($grBornCard.out -like '*GATE-01: every addition*' -and $grBornIds -contains 'GATE-01') { 'named' } else { 'missing: ' + ($grBornIds -join ', ') }) $grBornCard.out

# Every clause law.json puts on a Stop hook anchor is named on the card that carries all of them.
$grOnStop = Get-GrRefIds 'hooks/stop.ps1#*' ''
$grUnnamed = @($grOnStop | Where-Object { $grBornIds -notcontains $_ })
Record 'grades: every clause law.json grades on the Stop hook is named on the card' 'all' $(if ($grOnStop.Count -gt 0 -and $grUnnamed.Count -eq 0) { 'all' } else { 'unnamed: ' + ($grUnnamed -join ', ') }) ($grOnStop -join ', ')

# The hook yields on the second stop whatever the answer says, so HOOK ("refuses") overstates it.
$grAgain = Stop 'gr-card' $true
$grYields = ($grAgain.code -eq 0 -and [string]::IsNullOrWhiteSpace($grAgain.out))
$grNotAdvise = @($grLaw.clauses | Where-Object { $grOnStop -contains $_.id -and $_.grade -ne 'ADVISE' } | ForEach-Object { "$($_.id)=$($_.grade)" })
Record 'grades: the Stop card yields on the second stop, so each clause on it grades ADVISE' 'advise' $(if (-not $grYields) { 'blocks-again' } elseif ($grNotAdvise.Count -eq 0) { 'advise' } else { 'overstated: ' + ($grNotAdvise -join ', ') }) $grAgain.out
$grModes = @([regex]::Matches((Get-Content -LiteralPath (Join-Path $hooks 'stop.ps1') -Raw -Encoding utf8), '(?m)^#\s*anchor:\s*(\S+)\s+mode:\s*(\S+)') | ForEach-Object { "$($_.Groups[1].Value)=$($_.Groups[2].Value)" })
Record 'grades: the Stop hook anchors declare mode advise' 'advise' $(if ($grModes.Count -ge 2 -and @($grModes | Where-Object { $_ -notlike '*=advise' }).Count -eq 0) { 'advise' } else { $grModes -join ', ' }) ''

# ---- D7: a grade never rests on a mechanism the kit does not turn on
# The survey: a finding changes the verdict only when it is a fail and surveyStrict is on. Each
# survey anchor is the comment line right above the finding it marks.
$grStrict = [bool]((Get-Content -LiteralPath (Join-Path $kit 'templates\doctor.config.json') -Raw -Encoding utf8 | ConvertFrom-Json).surveyStrict)
$grSurvey = @(Get-Content -LiteralPath (Join-Path $kit 'tools\doctor\survey.ps1') -Encoding utf8)
$grSev = @{}; $grMode = @{}
for ($i = 0; $i -lt $grSurvey.Count - 1; $i++) {
    if ($grSurvey[$i] -match '^\s*#\s*anchor:\s*(?<a>\S+)\s+mode:\s*(?<m>\S+)') {
        $anchor = $Matches.a; $grMode[$anchor] = $Matches.m
        if ($grSurvey[$i + 1] -match "New-Finding\s+'(?<s>\w+)'") { $grSev[$anchor] = $Matches.s }
    }
}
# The declared mode says what the finding does, so the law build (validate.ps1, a tool ref needs
# mode gate) refuses a GATE grade on a finding that never changes the verdict: gate above a fail,
# advise above a warn. Workaround (CR-2026-10-15-GAPS second review): survey-unpushed and
# survey-no-gitattributes declared gate above a warn, so an overlay could grade VCS-04 or DES-09
# GATE on them and the build accepted it.
$grModeBad = @($grSev.Keys | Sort-Object | Where-Object { $grMode[$_] -ne $(if ($grSev[$_] -eq 'fail') { 'gate' } else { 'advise' }) } | ForEach-Object { "$_=$($grMode[$_]) above $($grSev[$_])" })
Record 'grades: each survey anchor declares gate above a fail finding and advise above a warn' 'matched' $(if ($grSev.Count -ge 5 -and $grModeBad.Count -eq 0) { 'matched' } elseif ($grSev.Count -lt 5) { "anchors read: $($grSev.Count)" } else { 'mismatched: ' + ($grModeBad -join ', ') }) ''
# The same, through the real law build: an overlay that grades VCS-04 GATE on the warn finding is
# refused, and one that grades VCS-01 GATE on a fail finding (what a strict brain does) builds.
function Invoke-GrBuild([string]$name, $overrides) {
    $ov = Join-Path $T "$name.overlay.json"
    Put $ov ([ordered]@{ schema = 1; clauses = @(); overrides = $overrides } | ConvertTo-Json -Depth 6)
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # build-law writes its refusal on stderr
    try {
        $out = (@(& pwsh -NoProfile -File (Join-Path $kit 'tools\law\build-law.ps1') -Source (Join-Path $kit 'law.json') -Overlay $ov -Out (Join-Path $T "$name.LAW.md") 2>&1 | ForEach-Object { [string]$_ }) -join "`n")
        return [pscustomobject]@{ code = $LASTEXITCODE; out = $out }
    } finally { $ErrorActionPreference = $prev }
}
$grWarnGate = Invoke-GrBuild 'gr-warn-gate' @{ 'VCS-04' = @{ grade = 'GATE'; enforcedBy = @{ kind = 'tool'; ref = 'tools/doctor/survey.ps1#survey-unpushed' } } }
$grFailGate = Invoke-GrBuild 'gr-fail-gate' @{ 'VCS-01' = @{ grade = 'GATE'; enforcedBy = @{ kind = 'tool'; ref = 'tools/doctor/survey.ps1#survey-no-remote' } } }
Record 'grades: the law build refuses GATE on a survey warn and builds GATE on a survey fail' 'refused-built' $(if ($grWarnGate.code -eq 1 -and $grWarnGate.out -like "*survey-unpushed' declares mode advise*" -and $grFailGate.code -eq 0) { 'refused-built' } else { "warn-gate exit $($grWarnGate.code), fail-gate exit $($grFailGate.code)" }) ($grWarnGate.out + ' | ' + $grFailGate.out)
$grOverSurvey = @($grLaw.clauses | Where-Object { $_.grade -eq 'GATE' -and $_.enforcedBy -and [string]$_.enforcedBy.ref -like 'tools/doctor/survey.ps1#*' } | Where-Object {
    $a = ([string]$_.enforcedBy.ref -split '#', 2)[1]
    -not ($grStrict -and $grSev[$a] -eq 'fail') } | ForEach-Object { [string]$_.id })
Record 'grades: no kit clause is GATE on a survey finding the shipped config never makes RED' 'honest' $(if ($grSev.Count -ge 5 -and $grOverSurvey.Count -eq 0) { 'honest' } elseif ($grSev.Count -lt 5) { "anchors read: $($grSev.Count)" } else { 'overstated: ' + ($grOverSurvey -join ', ') }) ("surveyStrict in the template: $grStrict")
$grSurveyIds = @('VCS-01', 'VCS-02', 'VCS-04', 'VCS-22', 'DES-09')
$grNotHonour = @($grLaw.clauses | Where-Object { $grSurveyIds -contains $_.id -and $_.grade -ne 'HONOUR' } | ForEach-Object { "$($_.id)=$($_.grade)" })
Record 'grades: the survey clauses grade HONOUR in the kit (a strict brain re-grades by overlay)' 'honour' $(if ($grNotHonour.Count -eq 0) { 'honour' } else { $grNotHonour -join ', ' }) ''

# The commit-msg shim: adopt does not install it, so the kit cannot say an adopter has it. Read from
# adopt's copy step itself: New-DfPlan returns every file adopt writes from the templates (LAW.md,
# the snapshots and the pointer are written apart, and none of them is the shim), so a planned file
# that carries the shim's bytes, or lands at hooks\commit-msg, is the install. The plan is built in a
# child scope with a brain that is a repository, so the git branch of the plan is read too.
# Workaround (CR-2026-10-15-GAPS second review): the case searched adopt's text for the word
# 'commit-msg', so a comment that named the shim counted as installing it.
$grPlanErr = ''
$grPlan = @(try {
    & {
        . (Join-Path $kit 'tools\lib\df-files.ps1')
        . (Join-Path $kit 'tools\lib\adopt-plan.ps1')
        $sbx = Join-Path $T 'gr-adopt-plan'
        $shimSha = Get-DfNormalisedSha256 ([IO.File]::ReadAllBytes((Join-Path $kit 'templates\commit-msg')))
        $items = New-DfPlan -Kit $kit -Root $sbx -Brain (Join-Path $sbx 'brain') -OwnerName 'Plan Owner' -GitHubOwners @('plan-owner') `
            -FrozenPaths @() -SettingsTarget (Join-Path $sbx '.claude\settings.json') -SnapshotPairs @() -BrainIsRepo $true
        foreach ($it in @($items)) { [pscustomobject]@{ path = [string]$it.path; shim = ((Get-DfNormalisedSha256 $it.bytes) -eq $shimSha) } }
    }
} catch { $grPlanErr = $_.Exception.Message })
$grShimFiles = @($grPlan | Where-Object { $_.shim -or $_.path -match '(?i)[\\/]hooks[\\/]commit-msg$' } | ForEach-Object { $_.path })
$grInstalls = $grShimFiles.Count -gt 0
$grOnShim = Get-GrRefIds 'tools/vcs/law-claim.ps1#*' 'GATE'
Record 'grades: no kit clause is GATE on the commit-msg shim while adopt''s plan does not copy it' 'honest' $(if ($grPlanErr -or $grPlan.Count -lt 10) { "plan not read: $grPlanErr ($($grPlan.Count) file(s))" } elseif ($grInstalls -or $grOnShim.Count -eq 0) { 'honest' } else { 'overstated: ' + ($grOnShim -join ', ') }) ("planned files: $($grPlan.Count); shim copies: " + ($grShimFiles -join ', '))
$grV5 = @($grLaw.clauses | Where-Object { $_.id -eq 'VOICE-05' })[0]
Record 'grades: VOICE-05 is BUILDABLE on DECISIONS.md 2.7, as VCS-23 is' 'buildable' $(if ($grV5 -and $grV5.grade -eq 'BUILDABLE' -and $grV5.enforcedBy.kind -eq 'planned' -and $grV5.enforcedBy.ref -eq 'DECISIONS.md#2.7') { 'buildable' } else { "$($grV5.grade) $($grV5.enforcedBy.ref)" }) ''

# The loop's hand-back: guard rule 11 refuses a push or a merge and writes no card and no command,
# so the clause graded on that anchor carries the refusal only. The state card and the push command
# are loop-runner work and print BUILDABLE on DECISIONS.md 2.8 (AUTO-13), as the other runner rules do.
$grOnPush = @($grLaw.clauses | Where-Object { $_.enforcedBy -and [string]$_.enforcedBy.ref -eq 'hooks/guard.ps1#loop-no-push' })
$grPushOver = @($grOnPush | Where-Object { [string]$_.rule -match '(?i)state card|push command' } | ForEach-Object { [string]$_.id })
$grBack = @($grLaw.clauses | Where-Object { [string]$_.rule -match '(?i)state card' -and [string]$_.rule -match '(?i)push command' })
$grBackBad = @($grBack | Where-Object { $_.grade -ne 'BUILDABLE' -or -not $_.enforcedBy -or [string]$_.enforcedBy.kind -ne 'planned' -or [string]$_.enforcedBy.ref -ne 'DECISIONS.md#2.8' } | ForEach-Object { "$($_.id)=$($_.grade)" })
Record 'grades: the loop-no-push clause carries no hand-back; the hand-back is BUILDABLE on 2.8' 'split' $(if ($grOnPush.Count -gt 0 -and $grPushOver.Count -eq 0 -and $grBack.Count -eq 1 -and $grBackBad.Count -eq 0) { 'split' } else { ('on loop-no-push: {0}; hand-back: {1} {2}' -f ($grPushOver -join ', '), (@($grBack | ForEach-Object { $_.id }) -join ', '), ($grBackBad -join ', ')) }) ''
