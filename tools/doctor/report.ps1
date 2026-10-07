# report.ps1 - the verdict, the three bands on screen, -Json, and state\.
# The only files written anywhere by the Doctor are <stateDir>\*, which are GENERATED.
# Determinism: repos.generated.md is sorted and carries no timestamp, so a re-run with nothing
# changed produces a byte-identical file. The timestamp lives in last-run.json alone.
#
# Config read here: surveyStrict (SPEC 5.3).

function Get-Verdict {
    # Bands -> exit code. COULD-NOT-LOOK wins: a run that could not look is never a pass, whatever
    # else it found. Then CLAIMS: any false claim is RED. Then SURVEY: fail-severity findings turn
    # RED only when surveyStrict is true; otherwise they are REPORTED and the exit is 0.
    param($Claims, $Survey, $CouldNotLook, [bool] $SurveyStrict)
    $claimFails = @($Claims | Where-Object { $_.status -eq 'FAIL' }).Count
    $surveyFails = @($Survey | Where-Object { $_.severity -eq 'fail' }).Count
    # anchor: could-not-look  mode: gate  verbs: report-green,look
    if (@($CouldNotLook).Count -gt 0) { return [PSCustomObject]@{ verdict = 'COULD-NOT-LOOK'; code = 2; reason = 'something could not be checked' } }
    if ($claimFails -gt 0) { return [PSCustomObject]@{ verdict = 'RED'; code = 1; reason = "$claimFails false claim(s)" } }
    if ($SurveyStrict -and $surveyFails -gt 0) { return [PSCustomObject]@{ verdict = 'RED'; code = 1; reason = "$surveyFails survey finding(s), surveyStrict is true" } }
    $note = if ($surveyFails -gt 0) { "$surveyFails survey finding(s) REPORTED, not counted (surveyStrict false)" } else { 'nothing needs action' }
    return [PSCustomObject]@{ verdict = 'GREEN'; code = 0; reason = $note }
}

function Write-Utf8NoBom {
    param([string] $Path, [string] $Text)
    [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}

function Write-State {
    param(
        [Parameter(Mandatory = $true)] [string] $StateDir,
        [Parameter(Mandatory = $true)] $Repos,
        [Parameter(Mandatory = $true)] $Claims,
        [Parameter(Mandatory = $true)] $Survey,
        [Parameter(Mandatory = $true)] $CouldNotLook,
        [Parameter(Mandatory = $true)] $Verdict,
        [Parameter(Mandatory = $true)] [string] $Stamp,
        [Parameter(Mandatory = $true)] [string] $Mode
    )
    if (-not (Test-Path -LiteralPath $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
    $sorted = @($Repos | Sort-Object -Property path)
    Write-Utf8NoBom (Join-Path $StateDir 'repos.json') (($sorted | ConvertTo-Json -Depth 6 -AsArray) + "`n")

    $md = [Collections.Generic.List[string]]::new()
    $md.Add('# Repository state (GENERATED - do not edit)')
    $md.Add('')
    $md.Add('Written by the design-first Doctor. Run Doctor.bat to refresh. The run time is in')
    $md.Add('`last-run.json`, deliberately not here, so a re-run with nothing changed is byte-identical.')
    $md.Add('')
    $md.Add('| Repo | Remote | Ahead | Dirty | Flags |')
    $md.Add('|---|---|---|---|---|')
    foreach ($r in $sorted) {
        if ($r.archived -or [bool]$r.worktree) { continue }   # worktrees are folded into their parents
        $rem = 'none'
        if ($r.remote -ne '') { $rem = if ($r.ownsRemote) { 'yours' } else { 'FOREIGN' } }
        $ah = if ($null -ne $r.ahead) { [string]$r.ahead } else { '-' }
        $flags = @()
        if ($r.shallow)    { $flags += 'shallow' }
        if ($r.frozen)     { $flags += 'frozen' }
        if ($r.tombstoned) { $flags += 'tombstone' }
        if (-not $r.hasAttrs) { $flags += 'no-gitattributes' }
        $md.Add(('| `{0}` | {1} | {2} | {3} | {4} |' -f $r.path, $rem, $ah, $r.dirty, ($flags -join ', ')))
    }
    Write-Utf8NoBom (Join-Path $StateDir 'repos.generated.md') (($md -join "`n") + "`n")

    $last = [ordered]@{
        ranAt         = $Stamp
        mode          = $Mode
        verdict       = $Verdict.verdict
        exitCode      = $Verdict.code
        repoCount     = @($Repos | Where-Object { -not $_.archived -and -not [bool]$_.worktree }).Count
        worktreeCount = @($Repos | Where-Object { -not $_.archived -and [bool]$_.worktree }).Count
        claimsPass    = @($Claims | Where-Object { $_.status -eq 'PASS' }).Count
        claimsFail    = @($Claims | Where-Object { $_.status -eq 'FAIL' }).Count
        claimsUnknown = @($Claims | Where-Object { $_.status -eq 'UNKNOWN' }).Count
        surveyFail    = @($Survey | Where-Object { $_.severity -eq 'fail' }).Count
        surveyWarn    = @($Survey | Where-Object { $_.severity -eq 'warn' }).Count
        surveyInfo    = @($Survey | Where-Object { $_.severity -eq 'info' }).Count
        accepted      = @($Survey | Where-Object { $_.severity -eq 'accepted' }).Count
        couldNotLook  = @($CouldNotLook).Count
    }
    Write-Utf8NoBom (Join-Path $StateDir 'last-run.json') (($last | ConvertTo-Json -Depth 4) + "`n")
}

function Get-JsonReport {
    param($Context, $Repos, $Enforcement, $Claims, $Survey, $CouldNotLook, $Verdict, [string] $Stamp, [string] $Mode)
    $doc = [ordered]@{
        ranAt   = $Stamp
        mode    = $Mode
        verdict = $Verdict.verdict
        exitCode = $Verdict.code
        reason  = $Verdict.reason
        where   = [ordered]@{ root = $Context.root; brain = $Context.brain; kit = $Context.kit; pluginRoot = $Context.pluginRoot; pointer = (Get-PointerPath) }
        bands   = [ordered]@{
            claims       = @($Claims | ForEach-Object { [ordered]@{ id = $_.id; type = $_.type; status = $_.status; detail = $_.detail } })
            survey       = @($Survey | ForEach-Object { [ordered]@{ severity = $_.severity; kind = $_.kind; path = $_.path; message = $_.message } })
            couldNotLook = @($CouldNotLook | ForEach-Object { [string]$_ })
        }
        enforcement = [ordered]@{
            hooks = @($Enforcement.hooks | ForEach-Object { [ordered]@{ event = $_.event; script = $_.script; exists = $_.exists } })
            settingsFound = @($Enforcement.settingsFound); denyRules = $Enforcement.denyRules; askRules = $Enforcement.askRules
            softDenyTotal = $Enforcement.softDenyTotal; softDenyFrozen = $Enforcement.softDenyFrozen
            fenceLogExists = $Enforcement.fenceLogExists; fenceTrips = $Enforcement.fenceTrips; fenceLastTrip = $Enforcement.fenceLastTrip
        }
        repos = @($Repos | Sort-Object -Property path | ForEach-Object { [ordered]@{ path = $_.path; remote = $_.remote; ownsRemote = $_.ownsRemote; ahead = $_.ahead; dirty = $_.dirty; shallow = $_.shallow; frozen = $_.frozen; archived = $_.archived; worktree = [bool]$_.worktree; parent = [string]$_.parent } })
    }
    return ($doc | ConvertTo-Json -Depth 8)
}

function Show-Report {
    param($Context, $Repos, $Enforcement, $Claims, $Survey, $CouldNotLook, $Verdict, [string] $Mode, [bool] $SurveyStrict, [string] $StateDir)
    # Linked worktrees are folded into their parents (repos.ps1): counted apart, never as repos.
    $live = @($Repos | Where-Object { -not $_.archived -and -not [bool]$_.worktree })
    $wtCount = @($Repos | Where-Object { -not $_.archived -and [bool]$_.worktree }).Count
    $wtNote = if ($wtCount -gt 0) { "; {0} worktree(s) folded into their parents" -f $wtCount } else { '' }
    Write-Host ''
    Write-Host '  DOCTOR' -ForegroundColor Cyan
    Write-Host '  ------' -ForegroundColor Cyan
    Write-Host ("  mode {0}   root {1}" -f $Mode, $Context.root)
    Write-Host ("  brain {0}" -f $(if ($Context.brain) { $Context.brain } else { '(none)' }))
    Write-Host ("  kit {0}" -f $Context.kit)
    Write-Host ("  {0} repositories under root ({1} archived, not counted{2})" -f $live.Count, (@($Repos).Count - $live.Count - $wtCount), $wtNote)
    Write-Host ''

    # --- band 1: CLAIMS
    $cp = @($Claims | Where-Object { $_.status -eq 'PASS' }); $cf = @($Claims | Where-Object { $_.status -eq 'FAIL' }); $cu = @($Claims | Where-Object { $_.status -eq 'UNKNOWN' })
    Write-Host ("  CLAIMS  {0} pass  {1} fail  {2} could not look" -f $cp.Count, $cf.Count, $cu.Count) -ForegroundColor Yellow
    foreach ($c in $cf) {
        Write-Host ("    FAIL  {0}  {1}" -f $c.id, $c.detail) -ForegroundColor Red
        if ($c.why) { Write-Host ("          why: {0}" -f $c.why) -ForegroundColor DarkGray }
    }
    foreach ($c in $cu) { Write-Host ("    ????  {0}  {1}" -f $c.id, $c.detail) -ForegroundColor Magenta }
    if ($cf.Count -eq 0 -and $cu.Count -eq 0 -and $cp.Count -gt 0) { Write-Host '    every claim holds' -ForegroundColor Green }
    if ($Claims.Count -eq 0) { Write-Host '    no claims to check' -ForegroundColor DarkGray }
    Write-Host ''

    # --- band 2: SURVEY (enforcement facts first, then findings)
    $acted = @($Survey | Where-Object { $_.severity -in @('fail', 'warn') })
    $info = @($Survey | Where-Object { $_.severity -eq 'info' })
    $accepted = @($Survey | Where-Object { $_.severity -eq 'accepted' })
    $strictNote = if ($SurveyStrict) { 'surveyStrict: fail findings turn RED' } else { 'REPORTED, not counted (surveyStrict false)' }
    Write-Host ("  SURVEY  {0} finding(s)  [{1}]" -f $acted.Count, $strictNote) -ForegroundColor Yellow
    if ($null -ne $Enforcement) {
        # One row per (event, script); a hook registered for several matchers lists them once.
        foreach ($grp in ($Enforcement.hooks | Group-Object -Property event, script)) {
            $h = $grp.Group[0]
            $mark = if ($h.exists) { ' ok ' } else { 'GONE' }
            $col = if ($h.exists) { 'DarkGray' } else { 'Red' }
            $matchers = (@($grp.Group | ForEach-Object { $_.matcher } | Where-Object { $_ } | Sort-Object -Unique) -join ',')
            Write-Host ("    [{0}] hook {1,-12} {2}  {3}" -f $mark, $h.event, (Split-Path -Leaf $h.script), $matchers) -ForegroundColor $col
        }
        if ($Enforcement.settingsFound.Count -gt 0) {
            Write-Host ("    root settings: {0} deny, {1} ask rule(s) in {2} file(s)" -f $Enforcement.denyRules, $Enforcement.askRules, $Enforcement.settingsFound.Count) -ForegroundColor DarkGray
        }
        if ($Enforcement.softDenyTotal -gt 0) {
            Write-Host ("    soft_deny: {0} rule(s), {1} naming a frozen path" -f $Enforcement.softDenyTotal, $Enforcement.softDenyFrozen) -ForegroundColor DarkGray
        }
        if ($Enforcement.fenceLogExists) {
            Write-Host ("    fence log: {0} trips, last {1}" -f $Enforcement.fenceTrips, $Enforcement.fenceLastTrip) -ForegroundColor DarkGray
        }
    }
    foreach ($f in $acted) {
        $col = if ($f.severity -eq 'fail') { 'Red' } else { 'Yellow' }
        Write-Host ("    [{0}] {1}" -f $f.severity.ToUpper(), $f.message) -ForegroundColor $col
    }
    foreach ($f in $info) { Write-Host ("    [INFO] {0}" -f $f.message) -ForegroundColor DarkGray }
    if ($acted.Count -eq 0) { Write-Host '    nothing needs action' -ForegroundColor Green }
    Write-Host ''
    # Accepted findings are shown, never hidden. An exception you cannot see has become a habit.
    if ($accepted.Count -gt 0) {
        Write-Host ("  ACCEPTED  {0} (recorded exceptions - reported, not counted)" -f $accepted.Count) -ForegroundColor DarkGray
        foreach ($f in $accepted) { Write-Host ("    - {0}" -f $f.message) -ForegroundColor DarkGray }
        Write-Host ''
    }

    # --- band 3: COULD-NOT-LOOK. Never printed as a pass.
    if (@($CouldNotLook).Count -gt 0) {
        Write-Host ("  COULD-NOT-LOOK  {0}  (this is NOT a pass)" -f @($CouldNotLook).Count) -ForegroundColor Magenta
        foreach ($c in $CouldNotLook) { Write-Host ("    {0}" -f $c) -ForegroundColor Magenta }
        Write-Host ''
    }

    $vcol = switch ($Verdict.verdict) { 'RED' { 'Red' } 'COULD-NOT-LOOK' { 'Magenta' } default { 'Green' } }
    Write-Host ("  VERDICT: {0}  (exit {1}: {2})" -f $Verdict.verdict, $Verdict.code, $Verdict.reason) -ForegroundColor $vcol
    Write-Host ''
    Write-Host ("  State written to {0}. Every finding is explained in the kit's tools\MANUAL.md." -f $StateDir) -ForegroundColor DarkGray
    Write-Host ''
}
