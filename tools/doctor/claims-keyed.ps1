# claims-keyed.ps1 - json_keyed_match: two JSON files, one collection each, compared record by
# record on a shared key. Dot-sourced by claims.ps1. READ-ONLY.
#
# WHY a keyed compare and not a subset. Two files that each keep their own copy of a case table
# (golden vectors, fixtures, a rule list) may legitimately hold cases the other lacks. What must
# not happen is a case BOTH hold quietly disagreeing: that is two copies of the same math drifting.
# So: index both collections by `key`, and for every key present on BOTH sides require the two
# records to be deep-equal. Extra keys on either side are allowed unless `requireAll` is true, in
# which case every key in `path` must also exist in `other`.
#
# Fields: path, other, collection (dotted path allowed), key, requireAll (bool, default false).
# PASS    every shared key deep-equal (and, with requireAll, nothing in `path` is missing from `other`)
# FAIL    a shared key differs (detail: the key and the first differing field), or requireAll misses
# UNKNOWN a file missing or not JSON, the collection path missing or not an array, no shared keys

function Get-JsonPathValue {
    # Walks a dotted path ("a.b.c") through parsed JSON. A top-level property whose name itself
    # contains a dot is tried first, whole. Returns $null when any step is missing.
    param($Node, [string] $DottedPath)
    if ($null -eq $Node) { return $null }
    if ($Node -is [PSCustomObject]) {
        $whole = $Node.PSObject.Properties[$DottedPath]
        if ($null -ne $whole) { return $whole.Value }
    }
    $cur = $Node
    foreach ($seg in $DottedPath.Split('.')) {
        if ($seg -eq '') { return $null }
        if ($cur -isnot [PSCustomObject]) { return $null }
        $prop = $cur.PSObject.Properties[$seg]
        if ($null -eq $prop) { return $null }
        $cur = $prop.Value
    }
    return $cur
}

function Test-JsonIsList {
    param($Value)
    return ($null -ne $Value -and ($Value -is [Array] -or $Value -is [Collections.IList]))
}

function Test-JsonDeepEqual {
    # FULL deep equality, unlike Test-JsonValueEqual (one-sided subset). Objects must carry the same
    # property names (order ignored) with equal values; arrays the same length with equal items IN
    # ORDER; scalars equal as case-sensitive strings (so 1 and "1" are equal, as elsewhere here).
    # A key present with null on one side and absent on the other is a difference.
    # $Diff receives the first difference as "<where> ...".
    param($A, $B, [string] $Where, [ref] $Diff)
    $aNull = ($null -eq $A); $bNull = ($null -eq $B)
    if ($aNull -or $bNull) {
        if ($aNull -and $bNull) { return $true }
        $sa = if ($aNull) { 'null' } else { "'$A'" }; $sb = if ($bNull) { 'null' } else { "'$B'" }
        $Diff.Value = "$Where is $sa vs $sb"; return $false
    }
    $aList = Test-JsonIsList $A; $bList = Test-JsonIsList $B
    if ($aList -or $bList) {
        if (-not ($aList -and $bList)) { $Diff.Value = "$Where is an array on one side only"; return $false }
        $a = @($A); $b = @($B)
        if ($a.Count -ne $b.Count) { $Diff.Value = "$Where has $($a.Count) vs $($b.Count) item(s)"; return $false }
        for ($i = 0; $i -lt $a.Count; $i++) {
            if (-not (Test-JsonDeepEqual -A $a[$i] -B $b[$i] -Where "$Where[$i]" -Diff $Diff)) { return $false }
        }
        return $true
    }
    $aObj = ($A -is [PSCustomObject]); $bObj = ($B -is [PSCustomObject])
    if ($aObj -or $bObj) {
        if (-not ($aObj -and $bObj)) { $Diff.Value = "$Where is an object on one side only"; return $false }
        $names = @(@($A.PSObject.Properties.Name) + @($B.PSObject.Properties.Name) | Sort-Object -Unique)
        foreach ($n in $names) {
            $pa = $A.PSObject.Properties[$n]; $pb = $B.PSObject.Properties[$n]
            if ($null -eq $pa) { $Diff.Value = "$Where.$n is absent in the first file"; return $false }
            if ($null -eq $pb) { $Diff.Value = "$Where.$n is absent in the second file"; return $false }
            if (-not (Test-JsonDeepEqual -A $pa.Value -B $pb.Value -Where "$Where.$n" -Diff $Diff)) { return $false }
        }
        return $true
    }
    if ([string]$A -ceq [string]$B) { return $true }
    $Diff.Value = "$Where is '$A' vs '$B'"
    return $false
}

function ConvertTo-KeyIndex {
    # Index a collection by the string value of `Key`, in document order. Items without the key
    # (or with a null value) are skipped and counted; a repeated key keeps the LAST item, as the
    # previous Doctor did. Returns @{ index = [ordered]; skipped = n }.
    param($Items, [string] $Key)
    $idx = [ordered]@{}
    $skipped = 0
    foreach ($item in @($Items)) {
        $k = $null
        if ($item -is [PSCustomObject]) { $prop = $item.PSObject.Properties[$Key]; if ($null -ne $prop) { $k = $prop.Value } }
        if ($null -eq $k) { $skipped++; continue }
        $idx[[string]$k] = $item
    }
    return [PSCustomObject]@{ index = $idx; skipped = $skipped }
}

function Read-JsonFileForClaim {
    # Returns @{ ok; data; error }. Never throws.
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return [PSCustomObject]@{ ok = $false; data = $null; error = "file missing: $Path" } }
    try {
        $data = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        return [PSCustomObject]@{ ok = $true; data = $data; error = '' }
    } catch {
        return [PSCustomObject]@{ ok = $false; data = $null; error = "not valid JSON: $Path ($($_.Exception.Message))" }
    }
}

function Test-JsonKeyedMatchClaim {
    param($c, $Context)
    $d = ''
    $p = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' $d }
    if ([string]::IsNullOrWhiteSpace([string]$c.other)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'other'" }
    $o = Resolve-ClaimPath -Raw ([string]$c.other) -Context $Context -Detail ([ref]$d)
    if ($null -eq $o) { return New-ClaimResult $c 'UNKNOWN' "other: $d" }
    $col = [string]$c.collection
    if ([string]::IsNullOrWhiteSpace($col)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'collection'" }
    $key = [string]$c.key
    if ([string]::IsNullOrWhiteSpace($key)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'key'" }
    $requireAll = $false
    if ($null -ne $c.requireAll) {
        if ($c.requireAll -is [bool]) { $requireAll = $c.requireAll }
        else { return New-ClaimResult $c 'UNKNOWN' "'requireAll' must be true or false" }
    }

    $ra = Read-JsonFileForClaim -Path $p
    if (-not $ra.ok) { return New-ClaimResult $c 'UNKNOWN' $ra.error }
    $rb = Read-JsonFileForClaim -Path $o
    if (-not $rb.ok) { return New-ClaimResult $c 'UNKNOWN' $rb.error }

    $ca = Get-JsonPathValue -Node $ra.data -DottedPath $col
    if ($null -eq $ca) { return New-ClaimResult $c 'UNKNOWN' "collection '$col' not found in $p" }
    $cb = Get-JsonPathValue -Node $rb.data -DottedPath $col
    if ($null -eq $cb) { return New-ClaimResult $c 'UNKNOWN' "collection '$col' not found in $o" }
    if (-not (Test-JsonIsList $ca)) { return New-ClaimResult $c 'UNKNOWN' "collection '$col' is not an array in $p" }
    if (-not (Test-JsonIsList $cb)) { return New-ClaimResult $c 'UNKNOWN' "collection '$col' is not an array in $o" }

    $ia = ConvertTo-KeyIndex -Items $ca -Key $key
    $ib = ConvertTo-KeyIndex -Items $cb -Key $key
    $shared = 0; $missing = @()
    foreach ($k in @($ia.index.Keys)) {
        if (-not $ib.index.Contains($k)) { $missing += $k; continue }
        $shared++
        $diff = ''
        if (-not (Test-JsonDeepEqual -A $ia.index[$k] -B $ib.index[$k] -Where '$' -Diff ([ref]$diff))) {
            # First differing key in document order of `path`, and the first differing field inside it.
            return New-ClaimResult $c 'FAIL' ("key '{0}' = '{1}' differs: {2} ({3} vs {4})" -f $key, $k, $diff, $p, $o)
        }
    }
    if ($requireAll -and $missing.Count -gt 0) {
        $shown = @($missing | Select-Object -First 12) -join ', '
        if ($missing.Count -gt 12) { $shown += ', ...' }
        return New-ClaimResult $c 'FAIL' ("requireAll: {0} key(s) in {1} missing from {2}: {3}" -f $missing.Count, $p, $o, $shown)
    }
    $onlyB = @($ib.index.Keys | Where-Object { -not $ia.index.Contains($_) }).Count
    if ($shared -eq 0) {
        return New-ClaimResult $c 'UNKNOWN' ("no shared '{0}' keys to compare ({1} in {2}, {3} in {4})" -f $key, $ia.index.Count, $p, $ib.index.Count, $o)
    }
    $note = ''
    if (($ia.skipped + $ib.skipped) -gt 0) { $note = "; {0} item(s) without '{1}' skipped" -f ($ia.skipped + $ib.skipped), $key }
    return New-ClaimResult $c 'PASS' ("{0} shared key(s) equal ({1} only in path, {2} only in other{3})" -f $shared, $missing.Count, $onlyB, $note)
}
