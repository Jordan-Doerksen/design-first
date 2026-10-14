# claims.ps1 - run the assertions in a claims.json (SPEC 5.2). READ-ONLY.
# A claim is a checkable fact the prose depends on. A failing claim is a document announcing
# its own rot. A claim that cannot be evaluated returns UNKNOWN, never PASS. Absent is not zero.
#
# Statuses: PASS | FAIL (CLAIMS band, RED) | UNKNOWN (COULD-NOT-LOOK band, exit 2).
# The dispatcher and the simple types live here; tree_free_of is in claims-tree.ps1, the two
# process-spawning types (generated_matches, hook_smoke) are in claims-exec.ps1, and the two-file
# keyed compare (json_keyed_match) is in claims-keyed.ps1, dot-sourced below. The ratchet type is in
# claims-ratchet.ps1, loaded by doctor.ps1 with the other claim files.

. (Join-Path $PSScriptRoot 'claims-keyed.ps1')
. (Join-Path $PSScriptRoot 'claims-fresh.ps1')   # file_fresh, config_paths_each (CR-2026-10-13-HONOUR)

function New-ClaimResult {
    param($Claim, [string] $Status, [string] $Detail)
    return [PSCustomObject]@{ id = $Claim.id; type = $Claim.type; status = $Status; detail = $Detail; why = [string]$Claim.why }
}

function Resolve-ClaimPath {
    # Expands a claim path; returns $null (and sets Detail) when a variable could not be expanded.
    param([string] $Raw, $Context, [ref] $Detail)
    $p = Expand-DfPath -Path $Raw -Context $Context
    if ($p -eq '') { $Detail.Value = "claim has no 'path'"; return $null }
    if (Test-Unexpanded $p) { $Detail.Value = "path has an unexpanded variable: $p"; return $null }
    return $p
}

function Invoke-Claims {
    param(
        [Parameter(Mandatory = $true)] [string] $ClaimsPath,
        [Parameter(Mandatory = $true)] $Context
    )
    if (-not (Test-Path -LiteralPath $ClaimsPath)) {
        return ,@([PSCustomObject]@{ id = 'CLAIMS-FILE'; type = 'file'; status = 'UNKNOWN'; detail = "claims.json not found at $ClaimsPath"; why = '' })
    }
    try {
        $doc = Get-Content -LiteralPath $ClaimsPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return ,@([PSCustomObject]@{ id = 'CLAIMS-FILE'; type = 'file'; status = 'UNKNOWN'; detail = "claims.json could not be parsed: $($_.Exception.Message)"; why = '' })
    }
    $out = @()
    $seen = @{}
    foreach ($c in @($doc.claims)) {
        if ($null -eq $c) { continue }
        if ([string]::IsNullOrWhiteSpace($c.id)) {
            $out += [PSCustomObject]@{ id = '(no id)'; type = [string]$c.type; status = 'UNKNOWN'; detail = 'claim has no id'; why = '' }
            continue
        }
        if ($seen.ContainsKey($c.id)) {
            $out += New-ClaimResult $c 'UNKNOWN' "duplicate claim id '$($c.id)'"
            continue
        }
        $seen[$c.id] = $true
        try {
            $out += Invoke-OneClaim -Claim $c -Context $Context
        } catch {
            $out += New-ClaimResult $c 'UNKNOWN' "error: $($_.Exception.Message)"
        }
    }
    return ,$out
}

function Invoke-OneClaim {
    param($Claim, $Context)
    $c = $Claim
    switch ([string]$c.type) {
        'path_exists'        { return Test-PathClaim $c $Context $true }
        'path_absent'        { return Test-PathClaim $c $Context $false }
        'file_contains'      { return Test-FileContainsClaim $c $Context $true }
        'file_not_contains'  { return Test-FileContainsClaim $c $Context $false }
        'file_fresh'         { return Test-FileFreshClaim $c $Context }
        'config_paths_each'  { return Test-ConfigPathsEachClaim $c $Context }
        'log_window_free_of' { return Test-LogWindowClaim $c $Context }
        'remote_is'          { return Test-RemoteIsClaim $c $Context }
        'json_subset_equal'  { return Test-JsonSubsetClaim $c $Context }
        'json_keyed_match'   { return Test-JsonKeyedMatchClaim $c $Context }
        'generated_matches'  { return Test-GeneratedMatchesClaim $c $Context }
        'tree_free_of'       { return Test-TreeFreeOfClaim $c $Context }
        'tree_equals'        { return Test-TreeEqualsClaim $c $Context }
        'tree_each'          { return Test-TreeEachClaim $c $Context }
        'tree_rules'         { return Test-TreeRulesClaim $c $Context }
        'ratchet'            { return Test-RatchetClaim $c $Context }
        'hook_smoke'         { return Test-HookSmokeClaim $c $Context }
        'pointer_valid'      { return Test-PointerValidClaim $c $Context }
        'config_schema'      { return Test-ConfigSchemaClaim $c $Context }
        default              { return New-ClaimResult $c 'UNKNOWN' "unknown claim type '$($c.type)'" }
    }
}

# ---------------------------------------------------------------- path_exists / path_absent

function Test-PathClaim {
    param($c, $Context, [bool] $WantPresent)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    $present = Test-Path -LiteralPath $p
    if ($WantPresent) {
        if ($present) { return New-ClaimResult $c 'PASS' "present: $p" }
        return New-ClaimResult $c 'FAIL' "missing: $p"
    }
    if ($present) { return New-ClaimResult $c 'FAIL' "present but should not be: $p" }
    return New-ClaimResult $c 'PASS' "absent: $p"
}

# ---------------------------------------------------------------- file_contains / file_not_contains

function Test-FileContainsClaim {
    param($c, $Context, [bool] $WantContains)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    if ([string]::IsNullOrEmpty([string]$c.needle)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'needle'" }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "file missing: $p" }
    $body = [IO.File]::ReadAllText($p)
    $has = $body.Contains([string]$c.needle)
    if ($WantContains) {
        if ($has) { return New-ClaimResult $c 'PASS' 'found' }
        return New-ClaimResult $c 'FAIL' "string absent: '$($c.needle)' in $p"
    }
    if ($has) { return New-ClaimResult $c 'FAIL' "forbidden string present: '$($c.needle)' in $p" }
    return New-ClaimResult $c 'PASS' 'absent, as required'
}

# ---------------------------------------------------------------- log_window_free_of

function Test-LogWindowClaim {
    # Lines that START with an ISO date or timestamp are dated; a dated line within `days` of now
    # that contains `needle` fails the claim. Undated lines are ignored (continuations, banners).
    # No log file = nothing has been logged, which is a PASS the detail says out loud.
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    if ([string]::IsNullOrEmpty([string]$c.needle)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'needle'" }
    $days = 0
    if (-not [int]::TryParse([string]$c.days, [ref]$days) -or $days -le 0) { return New-ClaimResult $c 'UNKNOWN' "'days' must be a positive integer" }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-ClaimResult $c 'PASS' "no log file at $p (nothing has been logged)" }
    $cutoff = (Get-Date).ToUniversalTime().AddDays(-$days)
    $hits = 0; $dated = 0; $first = ''
    foreach ($line in [IO.File]::ReadAllLines($p)) {
        if ($line -notmatch '^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)') { continue }
        $stamp = $Matches[1]
        $dto = [DateTimeOffset]::MinValue
        $styles = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AllowWhiteSpaces
        if (-not [DateTimeOffset]::TryParse($stamp, [Globalization.CultureInfo]::InvariantCulture, $styles, [ref]$dto)) { continue }
        $dated++
        if ($dto.UtcDateTime -lt $cutoff) { continue }
        if ($line.Contains([string]$c.needle)) { $hits++; if ($first -eq '') { $first = $line } }
    }
    if ($hits -gt 0) {
        $shown = if ($first.Length -gt 160) { $first.Substring(0, 160) + '...' } else { $first }
        return New-ClaimResult $c 'FAIL' ("{0} line(s) with '{1}' in the last {2} day(s) of {3}; first: {4}" -f $hits, $c.needle, $days, $p, $shown)
    }
    return New-ClaimResult $c 'PASS' ("no '{0}' in the last {1} day(s) ({2} dated line(s) read)" -f $c.needle, $days, $dated)
}

# ---------------------------------------------------------------- remote_is

function Test-RemoteIsClaim {
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    $remote = if ([string]::IsNullOrWhiteSpace($c.remote)) { 'origin' } else { [string]$c.remote }
    if ([string]::IsNullOrEmpty([string]$c.pattern)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'pattern'" }
    if (-not (Test-Path -LiteralPath $p -PathType Container)) { return New-ClaimResult $c 'UNKNOWN' "folder missing: $p" }
    $inside = (Invoke-Git -C $p rev-parse --is-inside-work-tree | Select-Object -First 1)
    if ([string]$inside -ne 'true') { return New-ClaimResult $c 'UNKNOWN' "not a git work tree: $p" }
    $u = (Invoke-Git -C $p remote get-url $remote | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($u)) { return New-ClaimResult $c 'FAIL' "no remote '$remote' in $p" }
    $u = $u.Trim()
    if ($u -match [string]$c.pattern) { return New-ClaimResult $c 'PASS' "$remote = $u" }
    return New-ClaimResult $c 'FAIL' "$remote is $u (does not match /$($c.pattern)/)"
}

# ---------------------------------------------------------------- json_subset_equal

function Test-JsonValueEqual {
    # Deep equality of `subset` against `actual`: objects compare the subset's keys only; arrays
    # compare as order-insensitive multisets of equal length; scalars compare as strings.
    param($Subset, $Actual, [string] $Where, [ref] $Diff)
    if ($null -eq $Subset) { if ($null -eq $Actual) { return $true }; $Diff.Value = "$Where expected null"; return $false }
    if ($null -eq $Actual) { $Diff.Value = "$Where is missing"; return $false }
    if ($Subset -is [Array] -or $Subset -is [Collections.IList]) {
        $a = @($Actual); $s = @($Subset)
        if ($a.Count -ne $s.Count) { $Diff.Value = "$Where has $($a.Count) item(s), expected $($s.Count)"; return $false }
        $used = New-Object bool[] $a.Count
        for ($i = 0; $i -lt $s.Count; $i++) {
            $found = $false
            for ($j = 0; $j -lt $a.Count; $j++) {
                if ($used[$j]) { continue }
                $scratch = ''
                if (Test-JsonValueEqual -Subset $s[$i] -Actual $a[$j] -Where "$Where[$i]" -Diff ([ref]$scratch)) { $used[$j] = $true; $found = $true; break }
            }
            if (-not $found) { $Diff.Value = "$Where[$i] has no equal item in the file"; return $false }
        }
        return $true
    }
    if ($Subset -is [PSCustomObject]) {
        if ($Actual -isnot [PSCustomObject]) { $Diff.Value = "$Where is not an object"; return $false }
        foreach ($prop in $Subset.PSObject.Properties) {
            $ap = $Actual.PSObject.Properties[$prop.Name]
            $val = if ($null -ne $ap) { $ap.Value } else { $null }
            if (-not (Test-JsonValueEqual -Subset $prop.Value -Actual $val -Where "$Where.$($prop.Name)" -Diff $Diff)) { return $false }
        }
        return $true
    }
    if ([string]$Subset -ceq [string]$Actual) { return $true }
    $Diff.Value = "$Where is '$Actual', expected '$Subset'"
    return $false
}

function Test-JsonSubsetClaim {
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    if ($null -eq $c.subset) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'subset'" }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "file missing: $p" }
    try { $actual = Get-Content -LiteralPath $p -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
    catch { return New-ClaimResult $c 'UNKNOWN' "not valid JSON: $p ($($_.Exception.Message))" }
    $diff = ''
    if (Test-JsonValueEqual -Subset $c.subset -Actual $actual -Where '$' -Diff ([ref]$diff)) { return New-ClaimResult $c 'PASS' 'subset equal' }
    return New-ClaimResult $c 'FAIL' "$diff ($p)"
}

# ---------------------------------------------------------------- pointer_valid

function Test-PointerValidClaim {
    param($c, $Context)
    $ptr = Read-Pointer
    if (-not $ptr.ok) { return New-ClaimResult $c 'FAIL' $ptr.error }
    $missing = @()
    foreach ($k in 'root', 'brain', 'pluginRoot') {
        if (-not (Test-Path -LiteralPath ([string]$ptr.data.$k) -PathType Container)) { $missing += "$k=$($ptr.data.$k)" }
    }
    if ($missing.Count -gt 0) { return New-ClaimResult $c 'FAIL' ("pointer names folder(s) that do not exist: {0}" -f ($missing -join ', ')) }
    return New-ClaimResult $c 'PASS' "pointer at $($ptr.path): root, brain, pluginRoot all exist"
}

# ---------------------------------------------------------------- config_schema

function Test-ConfigSchemaClaim {
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    $expected = 0
    if (-not [int]::TryParse([string]$c.expected, [ref]$expected)) { return New-ClaimResult $c 'UNKNOWN' "'expected' must be an integer" }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "file missing: $p" }
    try { $j = Get-Content -LiteralPath $p -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
    catch { return New-ClaimResult $c 'UNKNOWN' "not valid JSON: $p" }
    $actual = $j.schema
    if ($null -eq $actual) { return New-ClaimResult $c 'FAIL' "MIGRATE: $p has no 'schema' field; this Doctor expects schema $expected" }
    if ([int]$actual -eq $expected) { return New-ClaimResult $c 'PASS' "schema $expected" }
    return New-ClaimResult $c 'FAIL' "MIGRATE: $p is schema $actual; this Doctor expects schema $expected. Follow the migration note in the kit README."
}
