# build-law.ps1 - generates LAW.md from law.json (+ optional overlay).
# CLI CONTRACT (fixed in chunk 1; implemented in chunk 2):
#   pwsh -NoProfile -File tools/law/build-law.ps1 -Source <law.json> [-Overlay <law.overlay.json>] [-Installed <state.json>] -Out <LAW.md> [-BrainRoot <dir>]
#   Exit 0 = written. Exit 1 = validation failure (message names the clause id and the rule broken).
#   Output bytes: UTF-8 without BOM, LF, deterministic order (group order as listed in law.json, then id), no timestamp.
#   Idempotent: same inputs -> identical bytes.
#
# -BrainRoot   resolves brain: owners, overlay refs and the brain claims.json. Without it, brain: owners are not checked (warning).
# -Installed   JSON { "hooks": { "guard": true, "fence": true, "entry": true }, "rootSettings": true, "pointer": true }.
#              A clause whose mechanism is not installed prints HONOUR with a "(mechanism not installed)" note.
# Two checks here are law mechanisms (CR-2026-10-13-HONOUR), implemented in validate.ps1:
# anchor: state-once  mode: gate  verbs: state-once
#   a clause's "### ID" heading exists in exactly one law file, and that file is its owner (PRIN-05)
# anchor: no-count  mode: gate  verbs: snapshot-count
#   a rule text carries no count: no number before a plural noun, no number of two or more digits (SKIN-07)
#
# Build-time escape hatches, never for a Doctor run:
#   DF_SKIP_HOOK_FILES=1   a referenced mechanism file (hook script, claims file) that does not exist yet warns instead of failing
#   DF_SKIP_OWNER_FILES=1  an owning file that does not exist yet warns instead of failing
param(
    [Parameter(Mandatory)] [string] $Source,
    [string] $Overlay,
    [string] $Installed,
    [Parameter(Mandatory)] [string] $Out,
    [string] $BrainRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$KitRoot  = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '..'))
$Problems = [Collections.Generic.List[string]]::new()
$Warnings = [Collections.Generic.List[string]]::new()
if ($BrainRoot) { $BrainRoot = [IO.Path]::GetFullPath($BrainRoot) }

. (Join-Path $PSScriptRoot 'validate.ps1')
. (Join-Path $PSScriptRoot 'render.ps1')

function Fail([string] $msg) { [Console]::Error.WriteLine($msg); exit 1 }

function ConvertTo-Clause($raw, [string] $source) {
    $e = Get-Prop $raw 'enforcedBy'
    return [pscustomobject]@{
        id = [string](Get-Prop $raw 'id'); group = [string](Get-Prop $raw 'group'); verb = [string](Get-Prop $raw 'verb')
        rule = [string](Get-Prop $raw 'rule'); owner = [string](Get-Prop $raw 'owner'); grade = [string](Get-Prop $raw 'grade')
        enforcedBy = $(if ($null -ne $e) { [pscustomobject]@{ kind = [string](Get-Prop $e 'kind'); ref = [string](Get-Prop $e 'ref') } } else { $null })
        since = [string](Get-Prop $raw 'since'); source = $source
    }
}

# ---- load ----------------------------------------------------------------------------------------
$Source = [IO.Path]::GetFullPath($Source); $Out = [IO.Path]::GetFullPath($Out)
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { Fail "build-law: source not found: $Source" }
$law = Read-JsonFile $Source
if ((Get-Prop $law 'schema') -ne 1) { Fail "build-law: law.json schema must be 1" }
$groups = Get-Prop $law 'groups'
if ($null -eq $groups) { Fail 'build-law: law.json has no groups' }
$groupNames = @($groups.PSObject.Properties | ForEach-Object { $_.Name })
$rawClauses = @(Get-Prop $law 'clauses')
if ($rawClauses.Count -eq 0) { Fail 'build-law: law.json has no clauses' }

$byId = [ordered]@{}
foreach ($raw in $rawClauses) {
    $c = ConvertTo-Clause $raw 'kit'
    if ($byId.Contains($c.id)) { Add-Problem $c.id 'duplicate id in law.json' ; continue }
    $byId[$c.id] = $c
}

# ---- overlay --------------------------------------------------------------------------------------
if ($Overlay) {
    $Overlay = [IO.Path]::GetFullPath($Overlay)
    if (-not (Test-Path -LiteralPath $Overlay -PathType Leaf)) { Fail "build-law: overlay not found: $Overlay" }
    $ov = Read-JsonFile $Overlay
    foreach ($raw in @(Get-Prop $ov 'clauses')) {
        $c = ConvertTo-Clause $raw 'overlay'
        if ($byId.Contains($c.id)) { Add-Problem $c.id 'overlay clause duplicates an existing id (use overrides to change a kit clause)'; continue }
        $byId[$c.id] = $c
    }
    $overrides = Get-Prop $ov 'overrides'
    if ($null -ne $overrides) {
        foreach ($p in $overrides.PSObject.Properties) {
            $id = $p.Name
            if (-not $byId.Contains($id) -or $byId[$id].source -ne 'kit') { Add-Problem $id 'override names an id that is not a kit clause'; continue }
            $target = $byId[$id]
            $kitGrade = $target.grade; $setEnforced = $false
            foreach ($k in $p.Value.PSObject.Properties) {
                switch ($k.Name) {
                    'grade'      { $target.grade = [string]$k.Value }
                    'owner'      { $target.owner = [string]$k.Value }
                    'enforcedBy' { $setEnforced = $true; $target.enforcedBy = $(if ($null -ne $k.Value) { [pscustomobject]@{ kind = [string](Get-Prop $k.Value 'kind'); ref = [string](Get-Prop $k.Value 'ref') } } else { $null }) }
                    default      { Add-Problem $id "override key '$($k.Name)' is not one of grade, owner, enforcedBy" }
                }
            }
            # Grades are mechanical (DECISIONS 2.2). An override that lowers a clause to OWNER or
            # HONOUR while the kit's mechanism still stands would print a grade below the truth;
            # the mechanism wins and the override is reported. Seen 2026-10-13: five overrides
            # written when those clauses were HONOUR, after the kit gave them an ADVISE anchor.
            if ($target.grade -in @('OWNER', 'HONOUR') -and $null -ne $target.enforcedBy -and -not $setEnforced) {
                Add-Warning $id "override grade $($target.grade) ignored: the kit enforces this clause at $kitGrade ($($target.enforcedBy.kind): $($target.enforcedBy.ref)); remove the override, or set enforcedBy to null in it to drop the mechanism on purpose"
                $target.grade = $kitGrade
            }
            $target.source = 'overlay'
        }
    }
}

# ---- installed state --------------------------------------------------------------------------------
$installedState = $null
if ($Installed) {
    $Installed = [IO.Path]::GetFullPath($Installed)
    if (-not (Test-Path -LiteralPath $Installed -PathType Leaf)) { Fail "build-law: installed state not found: $Installed" }
    $installedState = Read-JsonFile $Installed
}

# ---- validate --------------------------------------------------------------------------------------
$clauses = @($byId.Values)
foreach ($c in $clauses) {
    Test-ClauseShape $c $groupNames
    Test-RuleValues $c
    Test-RuleCount $c
    Test-OwnerFile $c
    Test-HeadingOnce $c
    Test-Enforcement $c
}

foreach ($w in $Warnings) { Write-Host $w }
if ($Problems.Count -gt 0) {
    foreach ($p in $Problems) { Write-Host $p }
    Fail "build-law: $($Problems.Count) validation failure(s); nothing written"
}

# ---- render + write -------------------------------------------------------------------------------
$text = Format-Law $groups $clauses $installedState
$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[IO.File]::WriteAllText($Out, $text, [Text.UTF8Encoding]::new($false))
Write-Host "build-law: wrote $Out ($($clauses.Count) clauses, $($Warnings.Count) warning(s))"
exit 0
