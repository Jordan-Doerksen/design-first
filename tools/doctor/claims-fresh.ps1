# claims-fresh.ps1 - two claim types from CR-2026-10-13-HONOUR, dot-sourced by claims.ps1.
#   file_fresh         (VCS-06)  the last dated line of a log is young enough
#   config_paths_each  (VCS-12)  every folder in a list holds a named file with named lines
# Both are read-only. Never run directly.

# ---------------------------------------------------------------- file_fresh
# Fields: path, maxDays. The last line that STARTS with an ISO date or timestamp is the record;
# undated lines (banners, continuations) are skipped. A missing file is a FAIL, not UNKNOWN: the
# claim says a drill was logged, and nothing proved is the failure mode VCS-06 names.
function Test-FileFreshClaim {
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    $maxDays = 0
    if (-not [int]::TryParse([string]$c.maxDays, [ref]$maxDays) -or $maxDays -le 0) { return New-ClaimResult $c 'UNKNOWN' "'maxDays' must be a positive integer" }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
        # graceFromInstall: a fresh brain has no drill yet. The adopt date is a fact on the disk, the
        # write time of <brain>/state/installed.json, so the first drill is due maxDays after it.
        if ($c.PSObject.Properties['graceFromInstall'] -and $c.graceFromInstall -eq $true -and $Context.brain) {
            $inst = Join-Path $Context.brain 'state\installed.json'
            if (Test-Path -LiteralPath $inst -PathType Leaf) {
                $due = [IO.File]::GetLastWriteTimeUtc($inst).AddDays($maxDays)
                if ((Get-Date).ToUniversalTime() -le $due) { return New-ClaimResult $c 'PASS' ("no drill logged yet; the first one is due by {0} ({1} days after adopt)" -f $due.ToString('yyyy-MM-dd'), $maxDays) }
                return New-ClaimResult $c 'FAIL' ("no file at {0}; the first drill was due by {1}, {2} days after adopt" -f $p, $due.ToString('yyyy-MM-dd'), $maxDays)
            }
        }
        return New-ClaimResult $c 'FAIL' "no file at $p (nothing has proved the backup gives anything back)"
    }
    $last = $null; $lastLine = ''
    $styles = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AllowWhiteSpaces
    foreach ($line in [IO.File]::ReadAllLines($p)) {
        if ($line -notmatch '^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)') { continue }
        $dto = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParse($Matches[1], [Globalization.CultureInfo]::InvariantCulture, $styles, [ref]$dto)) { continue }
        $last = $dto; $lastLine = $line
    }
    if ($null -eq $last) { return New-ClaimResult $c 'FAIL' "no dated line in $p (a line that starts with an ISO date is the record)" }
    $age = [int][Math]::Floor(((Get-Date).ToUniversalTime() - $last.UtcDateTime).TotalDays)
    $stamp = $last.UtcDateTime.ToString('yyyy-MM-dd')
    if ($age -gt $maxDays) { return New-ClaimResult $c 'FAIL' ("last dated line {0} is {1} day(s) old; the limit is {2} ({3})" -f $stamp, $age, $maxDays, $p) }
    return New-ClaimResult $c 'PASS' ("last dated line {0}, {1} day(s) old, limit {2}" -f $stamp, $age, $maxDays)
}

# ---------------------------------------------------------------- config_paths_each
# Fields: configKey (a list key in doctor.config.json, already expanded by the config reader) or
# paths[] (claim paths, expanded here); file; contains[]. Every folder must hold `file` with every
# string in `contains`. An empty list is a PASS that says so: nothing listed, nothing to prove.
function Get-ConfigListForClaim {
    param([string] $Key, $Context, [ref] $Detail)
    $cfgPath = if ($Context.brain) { Join-Path $Context.brain 'doctor.config.json' } else { Join-Path $Context.kit 'templates\doctor.config.json' }
    $cr = Read-DoctorConfig -Path $cfgPath -Context $Context
    if (-not $cr.ok) { $Detail.Value = "config unreadable: $($cr.error)"; return $null }
    $prop = $cr.cfg.PSObject.Properties[$Key]
    if ($null -eq $prop) { $Detail.Value = "config key '$Key' is not in $cfgPath (nor a default)"; return $null }
    # Workaround: an empty array returned from a function collapses to $null, which the caller reads
    # as "could not look". The comma keeps it an array, so an empty list is a PASS that says so.
    return ,@($prop.Value | Where-Object { $_ } | ForEach-Object { [string]$_ })
}
function Test-ConfigPathsEachClaim {
    param($c, $Context)
    $d = ''
    $file = [string]$c.file
    if ([string]::IsNullOrWhiteSpace($file)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'file'" }
    $needles = @($c.contains | Where-Object { $_ } | ForEach-Object { [string]$_ })
    $list = $null; $source = ''
    if ($c.PSObject.Properties['configKey'] -and $c.configKey) {
        $list = Get-ConfigListForClaim -Key ([string]$c.configKey) -Context $Context -Detail ([ref]$d)
        if ($null -eq $list) { return New-ClaimResult $c 'UNKNOWN' $d }
        $source = "config '$($c.configKey)'"
    }
    elseif ($c.PSObject.Properties['paths']) {
        $list = @()
        foreach ($raw in @($c.paths)) {
            $p = Resolve-ClaimPath -Raw ([string]$raw) -Context $Context -Detail ([ref]$d)
            if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
            $list += $p
        }
        $source = 'the claim'
    }
    else { return New-ClaimResult $c 'UNKNOWN' "claim needs 'configKey' or 'paths'" }
    if ($list.Count -eq 0) { return New-ClaimResult $c 'PASS' ("nothing listed under {0}; nothing to prove, said out loud" -f $source) }
    $faults = [Collections.Generic.List[string]]::new()
    foreach ($folder in $list) {
        $leaf = Split-Path -Leaf $folder
        if (-not (Test-Path -LiteralPath $folder -PathType Container)) { $faults.Add("${leaf}: folder missing ($folder)"); continue }
        $f = Join-Path $folder $file
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { $faults.Add("${leaf}: missing $file"); continue }
        $body = [IO.File]::ReadAllText($f)
        foreach ($n in $needles) { if (-not $body.Contains($n)) { $faults.Add("${leaf}: $file lacks '$n'"); break } }
    }
    if ($faults.Count -gt 0) { return New-ClaimResult $c 'FAIL' (($faults -join '; ')) }
    return New-ClaimResult $c 'PASS' ("{0} folder(s) from {1} each carry {2} with {3}" -f $list.Count, $source, $file, ($needles -join ', '))
}
