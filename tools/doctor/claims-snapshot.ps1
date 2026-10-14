# claims-snapshot.ps1 - the snapshot_diff claim type (2026-10-14, CR-2026-10-14-REVIEW). READ-ONLY.
# Loaded by doctor.ps1 after claims.ps1 and claims-tree.ps1; uses New-ClaimResult, Resolve-ClaimPath,
# Get-TreeFileMap, ConvertTo-RelKey and ConvertTo-DfGlobRegex from them.
#
# The idea, from an outside reader of the kit: before a big refactor, dump the state of a tree to a
# file; make the change; let the Doctor compare. If the only differences are the ones you meant to
# make, the claim passes. The snapshot is written by tools/doctor/snapshot.ps1, so the fact is
# generated, never typed (VCS-15); the expected list is the one typed part, and it is the intent.
#
# Fields:
#   root        the folder compared (expands %VAR%, ${ROOT}, ${BRAIN}, ${KIT})
#   snapshot    the JSON file snapshot.ps1 wrote: { schema: 1, root, taken, files: [{ path, size, sha256 }] }
#   exclude[]   optional, root-relative paths (file or folder) left out on both sides; .git is always out
#   expected[]  the changes that are meant: { path, change } or { glob, change }; change is
#               added | removed | modified; path and glob are root-relative, forward slashes, case-insensitive
#   maxDays?    optional: a snapshot taken longer ago than this is UNKNOWN, so a claim nobody removed
#               after the refactor does not stay green for ever
# PASS    the set of differences between the snapshot and the tree now equals the expected set: every
#         expected entry matched at least one difference, and every difference matched an expected entry
# FAIL    a difference nothing expected (an add, a removal or a modification), or an expected entry that
#         matched nothing; the first 12 are named with their kind
# UNKNOWN root missing; snapshot missing, not JSON, or not schema 1; expected absent, not a list, or an
#         entry without a change in the set or without path or glob; maxDays not a positive integer;
#         the snapshot older than maxDays, or its taken date unreadable when maxDays is set
#
# Lifecycle, in tools/MANUAL.md: snapshot, add the claim, make the change, run the Doctor, remove the
# claim (or take a new snapshot) once the change is accepted. The claim never re-baselines itself.

$script:DfSnapshotChanges = @('added', 'removed', 'modified')

function Get-DfSnapshotFiles {
    # The files under $RootFull as the snapshot records them: rel-key, size, SHA-256. Sorted by key.
    param([string] $RootFull, [string[]] $Exclude)
    $map = Get-TreeFileMap $RootFull $Exclude @()
    $out = [Collections.Generic.List[object]]::new()
    foreach ($rel in ($map.Keys | Sort-Object)) {
        $fi = Get-Item -LiteralPath $map[$rel] -Force
        $hash = (Get-FileHash -LiteralPath $map[$rel] -Algorithm SHA256).Hash.ToLowerInvariant()
        $out.Add([PSCustomObject]@{ path = $rel; size = [long]$fi.Length; sha256 = $hash })
    }
    return ,$out
}

function Test-SnapshotDiffClaim {
    param($c, $Context)
    $d = ''
    $root = Resolve-ClaimPath -Raw ([string]$c.root) -Context $Context -Detail ([ref]$d)
    if ($null -eq $root) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'root'") }
    $snapPath = Resolve-ClaimPath -Raw ([string]$c.snapshot) -Context $Context -Detail ([ref]$d)
    if ($null -eq $snapPath) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'snapshot'") }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { return New-ClaimResult $c 'UNKNOWN' "root folder missing: $root" }
    if (-not (Test-Path -LiteralPath $snapPath -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "snapshot missing: $snapPath (write it with tools/doctor/snapshot.ps1)" }
    try { $snap = Get-Content -LiteralPath $snapPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
    catch { return New-ClaimResult $c 'UNKNOWN' "snapshot is not JSON: $snapPath ($($_.Exception.Message))" }
    if ($null -eq $snap -or [string]$snap.schema -ne '1' -or $null -eq $snap.PSObject.Properties['files']) { return New-ClaimResult $c 'UNKNOWN' "snapshot is not schema 1 with a files list: $snapPath" }

    # expected: present, a list, every entry well-formed
    $expProp = $c.PSObject.Properties['expected']
    if ($null -eq $expProp -or $null -eq $expProp.Value -or $expProp.Value -isnot [array]) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'expected' list (an empty list means: nothing may change)" }
    $expected = @()
    $i = 0
    foreach ($e in @($expProp.Value)) {
        $i++
        if ($null -eq $e) { return New-ClaimResult $c 'UNKNOWN' "expected[$i] is empty" }
        $ch = ([string]$e.change).ToLowerInvariant()
        if ($script:DfSnapshotChanges -notcontains $ch) { return New-ClaimResult $c 'UNKNOWN' "expected[$i] has no change in (added, removed, modified): '$($e.change)'" }
        $hasPath = -not [string]::IsNullOrWhiteSpace([string]$e.path); $hasGlob = -not [string]::IsNullOrWhiteSpace([string]$e.glob)
        if (-not $hasPath -and -not $hasGlob) { return New-ClaimResult $c 'UNKNOWN' "expected[$i] has neither path nor glob" }
        $rx = if ($hasPath) { [regex]::new('^' + [regex]::Escape((ConvertTo-RelKey ([string]$e.path))) + '$', [Text.RegularExpressions.RegexOptions]::IgnoreCase) } else { ConvertTo-DfGlobRegex ([string]$e.glob) }
        $expected += [PSCustomObject]@{ label = $(if ($hasPath) { [string]$e.path } else { [string]$e.glob }); change = $ch; rx = $rx; hits = 0 }
    }

    # The snapshot's taken date. ConvertFrom-Json turns an ISO string into a DateTime, and [string] on
    # that prints it in the machine's locale, so it is put back into ISO form here before any use.
    $takenRaw = $snap.taken
    $takenIso = if ($takenRaw -is [DateTime]) { ([DateTime]$takenRaw).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } elseif ($null -ne $takenRaw) { ([string]$takenRaw).Trim() } else { '' }

    # maxDays: the snapshot's age
    if ($null -ne $c.PSObject.Properties['maxDays'] -and $null -ne $c.maxDays) {
        $md = 0
        if (-not [int]::TryParse([string]$c.maxDays, [ref]$md) -or $md -le 0) { return New-ClaimResult $c 'UNKNOWN' "'maxDays' must be a positive integer" }
        $taken = [DateTimeOffset]::MinValue
        if (-not $takenIso -or -not [DateTimeOffset]::TryParse($takenIso, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$taken)) { return New-ClaimResult $c 'UNKNOWN' "snapshot has no readable 'taken' date and maxDays is set" }
        $age = [int][Math]::Floor(([DateTimeOffset]::UtcNow - $taken).TotalDays)
        if ($age -gt $md) { return New-ClaimResult $c 'UNKNOWN' "snapshot taken $($taken.ToString('yyyy-MM-dd')) is $age day(s) old, over maxDays $md; take a new one or remove the claim" }
    }

    # the diff: snapshot vs the tree now
    $exclude = @($c.exclude | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { ConvertTo-RelKey ([string]$_) })
    $rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\')
    $before = @{}
    foreach ($f in @($snap.files)) { if ($null -ne $f -and -not [string]::IsNullOrWhiteSpace([string]$f.path)) { $before[(ConvertTo-RelKey ([string]$f.path))] = ([string]$f.sha256).ToLowerInvariant() } }
    $now = @{}
    foreach ($f in (Get-DfSnapshotFiles $rootFull $exclude)) { $now[$f.path] = $f.sha256 }
    $diffs = @()
    foreach ($k in ($now.Keys | Sort-Object)) {
        if (-not $before.ContainsKey($k)) { $diffs += [PSCustomObject]@{ path = $k; change = 'added' } }
        elseif ($before[$k] -ne $now[$k]) { $diffs += [PSCustomObject]@{ path = $k; change = 'modified' } }
    }
    foreach ($k in ($before.Keys | Sort-Object)) { if (-not $now.ContainsKey($k)) { $diffs += [PSCustomObject]@{ path = $k; change = 'removed' } } }

    # match: every difference needs an expected entry; every expected entry needs a difference
    $unexpected = @()
    foreach ($df in $diffs) {
        $hit = $false
        foreach ($e in $expected) { if ($e.change -eq $df.change -and $e.rx.IsMatch($df.path)) { $e.hits++; $hit = $true } }
        if (-not $hit) { $unexpected += ("{0}: {1}" -f $df.change, $df.path) }
    }
    $missing = @($expected | Where-Object { $_.hits -eq 0 } | ForEach-Object { "expected {0} of {1}, did not happen" -f $_.change, $_.label })
    $takenText = if ($takenIso) { "taken $takenIso" } else { 'taken (undated)' }
    if ($unexpected.Count -eq 0 -and $missing.Count -eq 0) {
        return New-ClaimResult $c 'PASS' ("{0} difference(s), all expected, against snapshot {1} of {2} file(s) under {3}" -f $diffs.Count, $takenText, $before.Count, $rootFull)
    }
    $problems = @($unexpected) + @($missing)
    $shown = @($problems | Select-Object -First 12)
    $more = if ($problems.Count -gt $shown.Count) { " (+{0} more)" -f ($problems.Count - $shown.Count) } else { '' }
    return New-ClaimResult $c 'FAIL' ("{0} unexpected, {1} expected-but-absent against snapshot {2} under {3}: {4}{5}" -f $unexpected.Count, $missing.Count, $takenText, $rootFull, ($shown -join '; '), $more)
}
