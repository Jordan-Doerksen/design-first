# claims-ratchet.ps1 - the ratchet claim type (2026-10-08, PRIN-04). Dot-sourced by doctor.ps1.
#
# A number read from a generated markdown table may not rise above the value recorded in
# <state>\ratchets.json unless an unused `accepted` entry covers it; with no record, any value
# passes and becomes the baseline. The first use is the HONOUR row of
# the generated LAW.md Summary: a new rule that nothing enforces raises the count, and the run goes
# RED until the rule gets a mechanism, a different grade, or a signed raise.
#
# Fields:
#   path      the markdown file
#   row       first-cell text of the table row to read (for example HONOUR)
#   heading   optional; the row is looked for under this heading only. Default: Summary
#   accepted  optional { value, since, reason }: a signed raise (owner decision 2026-10-08). The count
#             may rise to `value` once. Needs `since` and `reason`.
#
# The last recorded value lives in <state>\ratchets.json, keyed by claim id. A claim is read-only:
# the result carries the value to record and doctor.ps1 writes it after the run (Save-DfRatchets).
#
# PASS     no record yet (the baseline is recorded, and the note says so); the count is at or under
#          the record; or the count is over the record and an unused `accepted` entry covers it.
#          The record becomes the count.
# FAIL     the count is over the record and no unused `accepted` entry covers it. The record does
#          NOT move, so a re-run stays RED.
# UNKNOWN  file missing, heading or row not found, cell not an integer, `accepted` incomplete, or
#          the record file unreadable. Absent is not zero.
#
# One shot: an `accepted` entry is spent the first time it lets a rise through (the record keeps
# its since|value key). Without that, a signed raise would stay a standing ceiling: the count
# could fall and climb back to it with nobody signing anything.

function Get-DfRatchetPath([string] $StateDir) { return (Join-Path $StateDir 'ratchets.json') }

function Read-DfRatchets {
    # Returns @{ ok; map; error }. A missing file is an empty map, not an error.
    param([string] $StateDir)
    $p = Get-DfRatchetPath $StateDir
    $r = @{ ok = $true; map = @{}; error = '' }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return $r }
    try {
        $j = Get-Content -LiteralPath $p -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        foreach ($prop in $j.PSObject.Properties) {
            $v = 0
            if (-not [int]::TryParse([string]$prop.Value.value, [ref]$v)) { throw "record '$($prop.Name)' has no integer value" }
            $r.map[$prop.Name] = @{ value = $v; recordedAt = [string]$prop.Value.recordedAt; acceptedUsed = [string]$prop.Value.acceptedUsed }
        }
    } catch { $r.ok = $false; $r.error = "ratchet record unreadable at $p ($($_.Exception.Message))" }
    return $r
}

function Get-DfTableCount {
    # Reads the integer in the second cell of the row whose first cell is $Row, under $Heading.
    # Returns @{ ok; value; error }.
    param([string] $Text, [string] $Heading, [string] $Row)
    $lines = $Text.Replace("`r`n", "`n") -split "`n"
    $in = $false; $sawHeading = $false
    $headRx = '^#{1,6}\s+' + [regex]::Escape($Heading) + '\s*$'
    $rowRx = '^\|\s*' + [regex]::Escape($Row) + '\s*\|\s*([^|]*?)\s*\|'
    foreach ($l in $lines) {
        if ($l -match '^#{1,6}\s') { $in = ($l -match $headRx); if ($in) { $sawHeading = $true }; continue }
        if (-not $in) { continue }
        if ($l -match $rowRx) {
            $v = 0
            if ([int]::TryParse($Matches[1], [ref]$v)) { return @{ ok = $true; value = $v; error = '' } }
            return @{ ok = $false; value = 0; error = "row '$Row' under '$Heading' holds '$($Matches[1])', not an integer" }
        }
    }
    if (-not $sawHeading) { return @{ ok = $false; value = 0; error = "heading '$Heading' not found" } }
    return @{ ok = $false; value = 0; error = "no row '$Row' under heading '$Heading'" }
}

function Test-RatchetClaim {
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    if ([string]::IsNullOrWhiteSpace([string]$c.row)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'row'" }
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "file missing: $p" }
    $heading = if ([string]::IsNullOrWhiteSpace([string]$c.heading)) { 'Summary' } else { [string]$c.heading }
    $row = [string]$c.row

    $acc = $null
    if ($null -ne $c.accepted) {
        $av = 0
        if (-not [int]::TryParse([string]$c.accepted.value, [ref]$av)) { return New-ClaimResult $c 'UNKNOWN' "accepted needs an integer 'value'" }
        if ([string]::IsNullOrWhiteSpace([string]$c.accepted.reason)) { return New-ClaimResult $c 'UNKNOWN' 'accepted has no reason' }
        if ([string]$c.accepted.since -notmatch '^\d{4}-\d{2}-\d{2}$') { return New-ClaimResult $c 'UNKNOWN' "accepted needs 'since' as an ISO date" }
        $acc = @{ value = $av; key = ("{0}|{1}" -f $c.accepted.since, $av); since = [string]$c.accepted.since; reason = [string]$c.accepted.reason }
    }

    $read = Get-DfTableCount -Text ([IO.File]::ReadAllText($p)) -Heading $heading -Row $row
    if (-not $read.ok) { return New-ClaimResult $c 'UNKNOWN' ("{0} in {1}" -f $read.error, $p) }
    $now = [int]$read.value

    $stateDir = (Get-DerivedPaths -Context $Context).stateDir
    $recs = Read-DfRatchets $stateDir
    if (-not $recs.ok) { return New-ClaimResult $c 'UNKNOWN' $recs.error }
    $rec = $recs.map[[string]$c.id]

    $status = 'PASS'; $detail = ''; $note = ''; $used = if ($rec) { [string]$rec.acceptedUsed } else { '' }
    if ($null -eq $rec) {
        $detail = "$row is $now; no record yet, baseline recorded"
        $note = "ratchet $($c.id): baseline recorded, $row = $now"
    }
    elseif ($now -lt $rec.value) {
        $detail = "$row fell from $($rec.value) to $now"
        $note = "ratchet $($c.id): $row fell from $($rec.value) to $now; the record tightens to $now"
    }
    elseif ($now -eq $rec.value) { $detail = "$row is $now, the recorded value" }
    else {
        if ($acc -and $acc.key -ne $rec.acceptedUsed -and $now -le $acc.value) {
            $used = $acc.key
            $detail = "$row rose from $($rec.value) to $now under the signed raise of $($acc.since)"
            $note = "ratchet $($c.id): $row rose from $($rec.value) to $now, signed $($acc.since): $($acc.reason)"
        }
        else {
            $why = if (-not $acc) { "no 'accepted' entry signs the rise" }
                   elseif ($acc.key -eq $rec.acceptedUsed) { "the accepted raise of $($acc.since) to $($acc.value) was already spent; a new rise needs a new entry" }
                   else { "the accepted raise covers $($acc.value), not $now" }
            return New-ClaimResult $c 'FAIL' ("{0} rose from {1} to {2} in {3}; {4}. Give the new rule a mechanism or another grade, or sign the raise in the claim (accepted: value, since, reason)." -f $row, $rec.value, $now, $p, $why)
        }
    }
    $res = New-ClaimResult $c $status $detail
    $res | Add-Member -NotePropertyName record -NotePropertyValue @{ value = $now; acceptedUsed = $used }
    if ($note) { $res | Add-Member -NotePropertyName note -NotePropertyValue $note }
    return $res
}

function Save-DfRatchets {
    # Merges the records carried by passing ratchet claims into <state>\ratchets.json. The file is
    # rewritten only when a record changed, so a re-run with nothing changed is byte-identical.
    param([string] $StateDir, $Claims, [string] $Stamp)
    $carry = @($Claims | Where-Object { $_.status -eq 'PASS' -and $null -ne $_.PSObject.Properties['record'] })
    if ($carry.Count -eq 0) { return }
    $recs = Read-DfRatchets $StateDir
    if (-not $recs.ok) { return }                     # the claim already reported it as UNKNOWN
    $map = $recs.map; $changed = $false
    foreach ($c in $carry) {
        $old = $map[[string]$c.id]
        if ($null -eq $old -or $old.value -ne $c.record.value -or [string]$old.acceptedUsed -ne [string]$c.record.acceptedUsed) {
            $map[[string]$c.id] = @{ value = [int]$c.record.value; recordedAt = $Stamp; acceptedUsed = [string]$c.record.acceptedUsed }
            $changed = $true
        }
    }
    if (-not $changed) { return }
    $out = [ordered]@{}
    foreach ($k in ($map.Keys | Sort-Object)) { $out[$k] = [ordered]@{ value = $map[$k].value; recordedAt = $map[$k].recordedAt; acceptedUsed = $map[$k].acceptedUsed } }
    if (-not (Test-Path -LiteralPath $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
    Write-Utf8NoBom (Get-DfRatchetPath $StateDir) (($out | ConvertTo-Json -Depth 4) + "`n")
}
