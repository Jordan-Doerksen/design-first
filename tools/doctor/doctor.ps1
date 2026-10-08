# doctor.ps1 - the design-first Doctor. Press Doctor.bat (or run this); nothing presses it for you.
#
# WHY. Every false sentence that survives in a rule set is a FACT stored as LAW: a claim about the
# disk, typed by hand, with nothing able to detect it as wrong. The cure is not a better document.
# It is a command that re-derives the facts.
#
# READ-ONLY with respect to the workspace. The only files written are <brain>\state\* (or the kit's
# state\ under -Kit). NO TIMER, NO LOGIN TASK, ever.
#
# Three bands (SPEC 1.1):
#   CLAIMS          a false claim in claims.json      -> RED, exit 1
#   SURVEY          repo and wiring findings           -> REPORTED, exit 0, unless surveyStrict
#   COULD-NOT-LOOK  something could not be checked     -> exit 2, never a pass
#
# Where it looks comes from the pointer %USERPROFILE%\.claude\design-first.json (DF_POINTER_PATH
# overrides it, for tests): root, brain, pluginRoot. Nothing in this folder names a real path.
#   -Kit    check the KIT itself: its own claims (tools\doctor\claims.json), ${KIT} = this checkout,
#           state under <kit>\state. Needs no brain.
#   -Json   print one JSON document instead of the screen report.

[CmdletBinding()]
param(
    [switch] $Kit,
    [switch] $Json,
    [switch] $Quiet,
    [string] $ConfigPath,
    [string] $ClaimsPath
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
$here = $PSScriptRoot
foreach ($f in 'context', 'repos', 'enforcement', 'survey', 'claims', 'claims-tree', 'claims-exec', 'claims-ratchet', 'report') {
    . (Join-Path $here "$f.ps1")
}

$mode = if ($Kit) { 'kit' } else { 'brain' }
$couldNotLook = @()
$survey = @()
$claims = @()
$repos = @()
$enf = $null
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

function Stop-CouldNotLook {
    # Used before a context exists: print the one reason and exit 2. Never silent, never 0.
    param([string] $Reason)
    if ($Json) {
        Write-Output (([ordered]@{ verdict = 'COULD-NOT-LOOK'; exitCode = 2; reason = $Reason; mode = $mode } | ConvertTo-Json))
    } else {
        Write-Host ''
        Write-Host ("  COULD-NOT-LOOK: {0}" -f $Reason) -ForegroundColor Magenta
        Write-Host '  This is not a pass. Exit 2.' -ForegroundColor Magenta
        Write-Host ''
    }
    exit 2
}

# ---------------------------------------------------------------- where (pointer -> context)
$kitFromScript = Split-Path -Parent (Split-Path -Parent $here)   # tools\doctor -> tools -> kit
$ptr = Read-Pointer
if ($Kit) {
    # The kit checks itself. Its root for the survey is the checkout; the pointer is only consulted
    # by the pointer_valid claim, so a fresh clone can run this with no adoption at all.
    $ctx = [PSCustomObject]@{ root = $kitFromScript; brain = $null; kit = $kitFromScript; pluginRoot = $kitFromScript; base = $kitFromScript; mode = $mode }
} else {
    if (-not $ptr.ok) { Stop-CouldNotLook ("{0}. Run /design-first:adopt in a session, or pass -Kit to check the kit itself." -f $ptr.error) }
    foreach ($k in 'root', 'brain', 'pluginRoot') {
        if (-not (Test-Path -LiteralPath ([string]$ptr.data.$k) -PathType Container)) { Stop-CouldNotLook ("pointer '{0}' names a folder that does not exist: {1}" -f $k, $ptr.data.$k) }
    }
    $ctx = [PSCustomObject]@{
        root = [IO.Path]::GetFullPath([string]$ptr.data.root).TrimEnd('\')
        brain = [IO.Path]::GetFullPath([string]$ptr.data.brain).TrimEnd('\')
        kit = [IO.Path]::GetFullPath([string]$ptr.data.pluginRoot).TrimEnd('\')
        pluginRoot = [IO.Path]::GetFullPath([string]$ptr.data.pluginRoot).TrimEnd('\')
        base = [IO.Path]::GetFullPath([string]$ptr.data.brain).TrimEnd('\')
        mode = $mode
    }
}
$derived = Get-DerivedPaths -Context $ctx

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-CouldNotLook 'git is not on PATH' }

# ---------------------------------------------------------------- config (SPEC 5.3)
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = if ($ctx.brain) { Join-Path $ctx.brain 'doctor.config.json' } else { Join-Path $ctx.kit 'templates\doctor.config.json' }
}
$cr = Read-DoctorConfig -Path $ConfigPath -Context $ctx
if (-not $cr.ok) {
    if ($ctx.brain) { Stop-CouldNotLook ("doctor.config.json: {0}" -f $cr.error) }
    # Under -Kit the template is optional; defaults are enough to survey one checkout.
    $survey += New-Finding 'info' 'configDefaults' $ConfigPath ("config not read ({0}); kit mode runs on defaults" -f $cr.error)
}
$cfg = $cr.cfg
# Kit mode has no adopter and therefore no ownerRemotePatterns, so every remote surveyed as
# FOREIGN, including the kit's own origin. The kit does know its owner: marketplace.json names it.
# Derive the pattern from there when the config gives none (or only the template placeholder).
if (-not $ctx.brain) {
    $own = @($cfg.ownerRemotePatterns | Where-Object { $_ -and $_ -notmatch '<OWNER>' })
    if ($own.Count -eq 0) {
        $mp = Join-Path $ctx.kit '.claude-plugin\marketplace.json'
        if (Test-Path -LiteralPath $mp) {
            try {
                $mpOwner = (Get-Content -LiteralPath $mp -Raw | ConvertFrom-Json).owner.name
                if ($mpOwner) { $cfg.ownerRemotePatterns = @("github.com/$mpOwner/") }
            } catch { $survey += New-Finding 'warn' 'configDefaults' $mp ("marketplace.json unreadable ({0}); remotes survey as FOREIGN" -f $_.Exception.Message) }
        }
    }
}
foreach ($dk in $cr.deadKeys) {
    $survey += New-Finding 'warn' 'deadConfigKey' $ConfigPath ("dead config key: {0} - nothing reads it (derived from the pointer or removed in schema 1). Delete it from {1}." -f $dk, $ConfigPath)
}
# Built-in config_schema (reader: doctor.ps1). A mismatch is a CLAIMS-band fact: this Doctor and
# that config disagree about the contract, so every other reading is suspect.
if ($cr.ok) {
    $actualSchema = $cr.raw.schema
    $schemaDetail = $null
    if ($null -eq $actualSchema) { $schemaDetail = "MIGRATE: $ConfigPath has no 'schema' field; this Doctor expects schema 1" }
    elseif ([int]$actualSchema -ne 1) { $schemaDetail = "MIGRATE: $ConfigPath is schema $actualSchema; this Doctor expects schema 1. Follow the migration note in the kit README." }
    if ($schemaDetail) {
        $claims += [PSCustomObject]@{ id = 'CONFIG-SCHEMA'; type = 'config_schema'; status = 'FAIL'; detail = $schemaDetail
                                      why = 'Plugin updated, brain config older (SPEC 7). Every key reader below assumes schema 1.' }
    }
}

# ---------------------------------------------------------------- SURVEY band
try {
    $repos = Get-RepoFacts -Root $ctx.root -Config $cfg -StateDir $derived.stateDir
    $survey += Get-RepoFindings -Repos $repos
} catch { $couldNotLook += "repository sweep failed: $($_.Exception.Message)" }

try { $survey += Get-UnversionedFindings -Folders (Get-UnversionedFolders -Root $ctx.root -Config $cfg) }
catch { $couldNotLook += "unversioned-folder sweep failed: $($_.Exception.Message)" }

try { $survey += Get-SecretFindings -Secrets (Get-TrackedSecrets -Config $cfg -Repos $repos) }
catch { $couldNotLook += "tracked-secret scan failed: $($_.Exception.Message)" }

try { $survey += Get-RestoreDrillFindings -RecordsDir $derived.recordsDir }
catch { $couldNotLook += "restore-drill log check failed: $($_.Exception.Message)" }

# entryPointSnapshots (reader: doctor.ps1 via survey.ps1's comparer)
try { if (@($cfg.entryPointSnapshots).Count -gt 0) { $survey += Get-SnapshotFindings -Pairs $cfg.entryPointSnapshots -Context $ctx } }
catch { $couldNotLook += "entry-point snapshot check failed: $($_.Exception.Message)" }

try {
    $enf = Get-EnforcementFacts -Config $cfg -Derived $derived -Context $ctx
    $couldNotLook += $enf.couldNotLook
    $survey += $enf.findings
} catch {
    $couldNotLook += "enforcement check failed: $($_.Exception.Message)"
}

# acceptedExceptions (reader: doctor.ps1). A finding whose (path, kind) is registered is still
# REPORTED, but it does not count: a rule and a deliberate exception must not be the same sentence,
# and a check that cries wolf every run is a check that gets ignored.
function Test-Accepted {
    param([string] $Path, [string] $Kind)
    foreach ($e in $cfg.acceptedExceptions) {
        if ($null -eq $e -or [string]::IsNullOrWhiteSpace($e.path)) { continue }
        $ep = (Expand-DfPath -Path ([string]$e.path) -Context ([PSCustomObject]@{ root = $ctx.root; brain = $ctx.brain; kit = $ctx.kit; base = $ctx.root }))
        $same = ($e.path -eq $Path) -or ($ep -ne '' -and $Path -ne '' -and $ep.Equals((Expand-DfPath -Path $Path -Context ([PSCustomObject]@{ root = $ctx.root; brain = $ctx.brain; kit = $ctx.kit; base = $ctx.root })), [StringComparison]::OrdinalIgnoreCase))
        if (-not $same) { continue }
        foreach ($k in @($e.kinds)) { if ($k -eq $Kind) { return $e } }
    }
    return $null
}
$survey = @($survey | ForEach-Object {
    $acc = $null
    if ($_.severity -in @('fail', 'warn') -and $_.path -ne '' -and $_.kind -ne '') { $acc = Test-Accepted -Path $_.path -Kind $_.kind }
    if ($null -ne $acc) {
        [PSCustomObject]@{ severity = 'accepted'; kind = $_.kind; path = $_.path; message = ("{0}  [accepted {1}: {2}]" -f $_.message, $acc.since, $acc.reason) }
    } else { $_ }
})

# ---------------------------------------------------------------- CLAIMS band
if ([string]::IsNullOrWhiteSpace($ClaimsPath)) {
    $ClaimsPath = if ($Kit) { Join-Path $ctx.kit 'tools\doctor\claims.json' } else { Join-Path $ctx.brain 'claims.json' }
}
try { $claims += Invoke-Claims -ClaimsPath $ClaimsPath -Context $ctx }
catch { $couldNotLook += "claims run failed: $($_.Exception.Message)" }
foreach ($c in $claims) {
    if ($c.status -eq 'UNKNOWN') { $couldNotLook += ("claim {0} could not be evaluated: {1}" -f $c.id, $c.detail) }
    # A passing claim may carry a note worth one INFO line: a ratchet that moved, or its first record.
    if ($null -ne $c.PSObject.Properties['note'] -and $c.note) { $survey += New-Finding 'info' 'claimNote' '' ([string]$c.note) }
}

# ---------------------------------------------------------------- verdict, state, report
$verdict = Get-Verdict -Claims $claims -Survey $survey -CouldNotLook $couldNotLook -SurveyStrict $cfg.surveyStrict
try {
    Write-State -StateDir $derived.stateDir -Repos $repos -Claims $claims -Survey $survey -CouldNotLook $couldNotLook -Verdict $verdict -Stamp $stamp -Mode $mode
    Save-DfRatchets -StateDir $derived.stateDir -Claims $claims -Stamp $stamp   # ratchet records (claims-ratchet.ps1)
} catch {
    if (-not $Json) { Write-Host ("  WARNING: state could not be written to {0}: {1}" -f $derived.stateDir, $_.Exception.Message) -ForegroundColor Yellow }
}
if ($Json) {
    Write-Output (Get-JsonReport -Context $ctx -Repos $repos -Enforcement $enf -Claims $claims -Survey $survey -CouldNotLook $couldNotLook -Verdict $verdict -Stamp $stamp -Mode $mode)
} elseif (-not $Quiet) {
    Show-Report -Context $ctx -Repos $repos -Enforcement $enf -Claims $claims -Survey $survey -CouldNotLook $couldNotLook -Verdict $verdict -Mode $mode -SurveyStrict $cfg.surveyStrict -StateDir $derived.stateDir
}
exit $verdict.code
