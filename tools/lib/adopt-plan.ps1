# adopt-plan.ps1 - turns templates + the adopter's answers into the list of files adopt.ps1 writes.
# Dot-sourced by tools/adopt.ps1 after df-files.ps1; never run directly. Pure: nothing here
# touches the disk except to READ templates and law.json.
#
# A planned item is @{ path; bytes; generated; note }. adopt.ps1 decides, per item, whether the
# path is missing (write it) or present (print a diff, leave it).

function Expand-DfTemplate([string] $text, [hashtable] $tokens) {
    $t = $text
    foreach ($k in $tokens.Keys) { $t = $t.Replace('{{' + $k + '}}', [string]$tokens[$k]) }
    $left = [regex]::Matches($t, '\{\{[A-Z_]+\}\}') | ForEach-Object { $_.Value } | Select-Object -Unique
    if ($left) { throw "template token(s) not filled: $($left -join ', ')" }
    return $t
}

# The prohibitions block for the root CLAUDE.md: every SAFE clause in the kit's law.json, in full,
# in id order. Pulled from the source of truth so the entry file cannot drift from the law.
function Get-DfProhibitionsBlock([string] $lawPath) {
    $law = Read-DfJson $lawPath
    $safe = @($law.clauses | Where-Object { [string]$_.group -eq 'SAFE' } | Sort-Object -Property id -Culture '')
    if ($safe.Count -eq 0) { throw "law.json has no SAFE clauses: $lawPath" }
    return (@($safe | ForEach-Object { "- **$($_.id)** $($_.rule) *(grade $($_.grade))*" }) -join "`n")
}

# "<owner>/<name>" for the `claude plugin marketplace add` line, read from the kit's own
# marketplace manifest. Falls back to the first GitHub owner the adopter typed, then the owner name.
function Get-DfMarketplaceSource([string] $pluginRoot, [string[]] $gitHubOwners, [string] $ownerName) {
    $mp = Join-Path $pluginRoot '.claude-plugin\marketplace.json'
    if (Test-Path -LiteralPath $mp -PathType Leaf) {
        try {
            $m = Read-DfJson $mp
            $o = [string]$m.owner.name; $n = [string]$m.name
            if ($o -and $n) { return "$o/$n" }
        } catch { }
    }
    $fallback = if ($gitHubOwners.Count -gt 0) { $gitHubOwners[0] } else { ($ownerName -replace '\s+', '-') }
    return "$fallback/design-first"
}

# Frozen paths are stored absolute or ${ROOT}-relative (SPEC 5.3). A typed path under root becomes
# ${ROOT}-relative so the config survives a root move; anything else is kept as typed.
function ConvertTo-DfConfigPath([string] $p, [string] $root) {
    $s = $p.Trim()
    if (-not $s) { return $null }
    if ($s -like '${ROOT}*') { return $s }
    try { $full = [IO.Path]::GetFullPath($s).TrimEnd('\') } catch { return $s }
    if ($full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { return '${ROOT}\' + $full.Substring($root.Length + 1) }
    return $full
}

function New-DfDoctorConfig([string] $templatePath, [string[]] $gitHubOwners, [string[]] $frozenPaths, [object[]] $snapshotPairs) {
    $cfg = Read-DfJson $templatePath
    $cfg.ownerRemotePatterns = @($gitHubOwners | ForEach-Object { "github.com/$_/" })
    $cfg.frozenPaths = @($frozenPaths)
    $cfg.entryPointSnapshots = @($snapshotPairs)
    return (($cfg | ConvertTo-Json -Depth 12) + "`n")
}

function New-DfPlanItem([string] $path, [byte[]] $bytes, [string] $note, [bool] $generated = $false) {
    return [pscustomobject]@{ path = $path; bytes = $bytes; generated = $generated; note = $note }
}

# Every file adopt writes except LAW.md (generated afterwards), the snapshots (byte copies of live
# files, taken after the writes) and the pointer (outside root and brain).
function New-DfPlan {
    param(
        [string] $Kit, [string] $Root, [string] $Brain, [string] $OwnerName,
        [string[]] $GitHubOwners, [string[]] $FrozenPaths, [string] $SettingsTarget,
        [object[]] $SnapshotPairs, [bool] $BrainIsRepo
    )
    $tpl = Join-Path $Kit 'templates'
    $tokens = @{
        OWNER_NAME         = $OwnerName
        ROOT               = $Root
        BRAIN              = $Brain
        PROHIBITIONS       = (Get-DfProhibitionsBlock (Join-Path $Kit 'law.json'))
        MARKETPLACE_SOURCE = (Get-DfMarketplaceSource $Kit $GitHubOwners $OwnerName)
        DATE               = (Get-Date).ToString('yyyy-MM-dd')
    }
    $plan = [Collections.Generic.List[object]]::new()
    $add = {
        param([string] $target, [string] $text, [string] $note)
        $plan.Add((New-DfPlanItem $target (Get-DfTextBytes $text $target) $note))
    }
    $fill = { param([string] $name) Expand-DfTemplate (Read-DfText (Join-Path $tpl $name)) $tokens }
    $copy = { param([string] $name) Read-DfText (Join-Path $tpl $name) }

    # root
    & $add (Join-Path $Root 'CLAUDE.md') (& $fill 'root-CLAUDE.md') 'entry point; prohibitions in full'
    & $add $SettingsTarget (& $copy 'root-settings.json') 'kit deny/ask rules (SPEC 5.8)'

    # brain, personal layer
    & $add (Join-Path $Brain 'me.md')              (& $fill 'me.md')          'who the owner is; owner.name feeds the guard'
    & $add (Join-Path $Brain 'voice.md')           (& $fill 'voice.md')       'how the owner''s copy reads'
    & $add (Join-Path $Brain 'prohibitions.md')    (& $fill 'prohibitions.md') 'the owner''s own hard rules (overlay owning file)'
    & $add (Join-Path $Brain 'law.overlay.json')   (& $copy 'law.overlay.json') 'overlay: empty clauses, empty overrides'
    & $add (Join-Path $Brain 'lessons.md')         (& $fill 'lessons.md')     'lessons -> clauses'
    & $add (Join-Path $Brain 'canonical.md')       (& $fill 'canonical.md')   'one subject, one file'
    # The brain is a project, and DES-01 applies to it: it carries its own manifest and map, so the
    # Doctor's manifest scan is not RED on the adopter's first run (fix list, chunk 10, row 1).
    & $add (Join-Path $Brain 'DECISIONS.md')       (& $fill 'brain-DECISIONS.md')    'the brain''s own manifest (DES-01)'
    & $add (Join-Path $Brain 'ARCHITECTURE.md')    (& $fill 'brain-ARCHITECTURE.md') 'the brain''s own map (DES-01)'

    # brain, Doctor contract
    & $add (Join-Path $Brain 'claims.json')        (& $copy 'claims.json')    'claims; BRAIN-POINTER-01'
    & $add (Join-Path $Brain 'doctor.config.json') (New-DfDoctorConfig (Join-Path $tpl 'doctor.config.json') $GitHubOwners $FrozenPaths $SnapshotPairs) 'Doctor config; owners, frozen paths, snapshot pairs filled'
    & $add (Join-Path $Brain 'entry.json')         (& $copy 'entry.json')     'the entry path'
    & $add (Join-Path $Brain 'agent-policy.json')  (& $copy 'agent-policy.json') 'subagent brief contract, model routes, spawn cap (DES-11)'
    & $add (Join-Path $Brain 'route-policy.json')  (& $copy 'route-policy.json') 'law routed per prompt: words per group, folders, subagent defaults (DES-13)'
    & $add (Join-Path $Brain 'Doctor.bat')         (& $copy 'Doctor.bat')     'shim; resolves the kit through the pointer'
    & $add (Join-Path $Brain 'instructions\README.md') "# instructions`n`nOwning files for overlay clauses (``brain:instructions/<file>.md``) live here. A kit file that moved into the brain leaves a one-line forwarding stub here, never a deletion, while anything still reads the old path.`n" 'owning files for overlay clauses'

    if ($BrainIsRepo) {
        & $add (Join-Path $Brain '.gitattributes') (& $copy 'gitattributes') 'the repo decides its bytes, not core.autocrlf'
        & $add (Join-Path $Brain '.gitignore') "state/`n" 'state/ is generated (installed.json, heartbeat, Doctor output)'
    }
    return @($plan)
}
