# law-rows.ps1 - shared by route.ps1 (UserPromptSubmit) and subagent.ps1 (SubagentStart).
# Dot-sourced after common.ps1. Never run directly.
#
# Reads the generated LAW.md (the brain's when there is a brain, else the kit's) and returns the
# rows of one group as plain text: one clause per line, grade in brackets, then the owning files
# resolved to real paths so the agent can open the full text. PRIN-03: the rows are read from the
# generated index, never typed here, so a regenerated LAW.md is what gets injected.

function Get-DfLawPath($ptr, [string]$kitRoot) {
    if ($ptr.brain) {
        $p = Join-Path $ptr.brain 'LAW.md'
        if (Test-Path -LiteralPath $p -PathType Leaf) { return $p }
    }
    return (Join-Path $kitRoot 'LAW.md')
}

function Get-DfKitRoot($ptr) {
    if ($ptr.pointer -and $ptr.pointer.pluginRoot) { return (ConvertTo-DfFullPath ([string]$ptr.pointer.pluginRoot)) }
    return (ConvertTo-DfFullPath (Split-Path -Parent $PSScriptRoot))
}

# Returns @{ groups = ordered map GROUP -> @{ title; rows = @(@{ id; grade; rule; owner }) } }.
function Read-DfLawGroups([string]$lawPath) {
    $groups = [ordered]@{}
    if (-not (Test-Path -LiteralPath $lawPath -PathType Leaf)) { return $groups }
    $cur = $null
    foreach ($line in [IO.File]::ReadAllLines($lawPath)) {
        if ($line -match '^## ([A-Z]+) - (.+)$') {
            $cur = $Matches[1]
            $groups[$cur] = @{ title = $Matches[2].Trim(); rows = [Collections.Generic.List[object]]::new() }
            continue
        }
        if ($line -match '^## ') { $cur = $null; continue }
        if ($cur -and $line -match '^\|\s*([A-Z]+-\d+)\s*\|\s*([A-Z]+)\s*\|\s*(.*?)\s*\|\s*`?([^`|]+?)`?\s*\|\s*$') {
            $groups[$cur].rows.Add(@{ id = $Matches[1]; grade = $Matches[2]; rule = $Matches[3]; owner = $Matches[4].Trim() })
        }
    }
    return $groups
}

function Resolve-DfOwnerPath([string]$owner, $ptr, [string]$kitRoot) {
    $o = $owner.Trim()
    if ($o -match '^kit:(.+)$')   { return (ConvertTo-DfFullPath (Join-Path $kitRoot ($Matches[1] -replace '/', '\'))) }
    if ($o -match '^brain:(.+)$') { if ($ptr.brain) { return (ConvertTo-DfFullPath (Join-Path $ptr.brain ($Matches[1] -replace '/', '\'))) } }
    return $o
}

# The injectable text for one group. Markdown emphasis is stripped from the rule so the rows read
# as plain lines; the owner files are listed once each, resolved.
function Format-DfLawGroup([string]$name, $group, $ptr, [string]$kitRoot) {
    if ($null -eq $group) { return '' }
    $sb = [Text.StringBuilder]::new()
    [void]$sb.AppendLine(("design-first law for this task, group {0} ({1}): {2} clause(s). Cite the id." -f $name, $group.title, $group.rows.Count))
    $owners = [Collections.Generic.List[string]]::new()
    foreach ($r in $group.rows) {
        $rule = ($r.rule -replace '\*\*', '') -replace '`', ''
        [void]$sb.AppendLine(("  {0} [{1}] {2}" -f $r.id, $r.grade, $rule))
        $p = Resolve-DfOwnerPath $r.owner $ptr $kitRoot
        if ($p -and -not $owners.Contains($p)) { $owners.Add($p) }
    }
    if ($owners.Count -gt 0) { [void]$sb.AppendLine("  full text: " + ($owners -join ' ; ')) }
    return $sb.ToString().TrimEnd()
}

# Route policy: brain first, kit template second. Returns @{ policy; source; fromBrain }.
function Read-DfRoutePolicy($ptr, [string]$kitRoot) {
    $candidates = @()
    if ($ptr.brain) { $candidates += @{ path = (Join-Path $ptr.brain 'route-policy.json'); fromBrain = $true } }
    $candidates += @{ path = (Join-Path $kitRoot 'templates\route-policy.json'); fromBrain = $false }
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c.path -PathType Leaf) {
            return @{ policy = (Get-Content -LiteralPath $c.path -Raw -Encoding utf8 | ConvertFrom-Json); source = $c.path; fromBrain = $c.fromBrain }
        }
    }
    throw "no route policy: neither <brain>\route-policy.json nor the kit template exists"
}

# The per-session route file: one group name per line, in the order they became active.
function Get-DfRouteFile([string]$sessionId) {
    $dir = Get-DfMarkerDir
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if ([string]::IsNullOrWhiteSpace($sessionId)) { $sessionId = 'unknown' }
    return (Join-Path $dir (($sessionId -replace '[^A-Za-z0-9_.-]', '_') + '.routes'))
}

function Read-DfActiveRoutes([string]$sessionId) {
    $f = Get-DfRouteFile $sessionId
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return @() }
    return @(Get-Content -LiteralPath $f -Encoding utf8 | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
}

# Which groups a prompt and a working folder name, per the policy. Order: policy order.
function Get-DfMatchedGroups($policy, [string]$prompt, [string]$cwd, [string]$root) {
    $hits = [Collections.Generic.List[string]]::new()
    if ($policy.groups) {
        foreach ($p in $policy.groups.PSObject.Properties) {
            $words = @($p.Value | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { [string]$_ })
            if ($words.Count -eq 0) { continue }
            $rx = '(?i)\b(?:' + (($words | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')\b'
            if ($prompt -match $rx -and -not $hits.Contains($p.Name)) { $hits.Add($p.Name) }
        }
    }
    if ($policy.folders -and $cwd -and $root -and (Test-DfUnder $cwd $root)) {
        $rel = $cwd.Substring($root.Length).TrimStart('\')
        $top = ($rel -split '\\')[0]
        if ($top -and $policy.folders.PSObject.Properties[$top]) {
            foreach ($g in @($policy.folders.$top)) { if (-not $hits.Contains([string]$g)) { $hits.Add([string]$g) } }
        }
    }
    return @($hits)
}
