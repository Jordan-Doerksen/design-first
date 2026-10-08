# claims-tree.ps1 - the tree_free_of claim (SPEC 5.2, findings 36, 60, 74). READ-ONLY.
#
# Fields: root, words[], extensions[], exclude[] (paths relative to root), allow[] ({ path, words[] }).
# Case-insensitive whole-word match. `exclude` skips a file or a folder. `allow` is SPAN-BASED: a
# permitted word's match span suppresses every sub-word hit inside that span, so allowing
# "Alpha-Beta" in README.md covers "Alpha" and "Beta" inside "Alpha-Beta" there, and nowhere else.

function ConvertTo-RelKey {
    # Forward slashes, lower case, no leading slash: the one spelling used for exclude/allow lookups.
    param([string] $Path)
    return $Path.Replace('\', '/').TrimStart('/').ToLowerInvariant()
}

function New-WordRegex {
    # Longest word first so "Alpha-Beta" wins over "Alpha" at the same position. \b on both ends.
    # Words that start or end with a non-word character would get no boundary from \b, so those
    # ends use lookarounds against word characters instead.
    param([string[]] $Words)
    $parts = @()
    foreach ($w in ($Words | Sort-Object { $_.Length } -Descending)) {
        if ([string]::IsNullOrEmpty($w)) { continue }
        $e = [regex]::Escape($w)
        $lead  = if ($w[0] -match '\w') { '\b' } else { '(?<!\w)' }
        $trail = if ($w[-1] -match '\w') { '\b' } else { '(?!\w)' }
        $parts += ($lead + $e + $trail)
    }
    if ($parts.Count -eq 0) { return $null }
    return [regex]::new(('(?:' + ($parts -join '|') + ')'), [Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Test-TreeFreeOfClaim {
    param($c, $Context)
    $d = ''
    $root = Resolve-ClaimPath -Raw ([string]$c.root) -Context $Context -Detail ([ref]$d)
    if ($null -eq $root) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'root'") }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { return New-ClaimResult $c 'UNKNOWN' "root folder missing: $root" }
    $words = @($c.words | Where-Object { -not [string]::IsNullOrEmpty($_) } | ForEach-Object { [string]$_ })
    if ($words.Count -eq 0) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'words'" }
    $exts = @($c.extensions | ForEach-Object { ([string]$_).ToLowerInvariant() } | ForEach-Object { if ($_.StartsWith('.')) { $_ } else { ".$_" } })
    if ($exts.Count -eq 0) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'extensions'" }
    $exclude = @($c.exclude | ForEach-Object { ConvertTo-RelKey ([string]$_) })
    $allow = @{}
    foreach ($a in @($c.allow)) {
        if ($null -eq $a -or [string]::IsNullOrWhiteSpace($a.path)) { continue }
        $allow[(ConvertTo-RelKey ([string]$a.path))] = New-WordRegex -Words @($a.words | ForEach-Object { [string]$_ })
    }
    $wordRx = New-WordRegex -Words $words

    $rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\')
    $files = Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '[\\/]\.git([\\/]|$)' }

    $hits = @()
    $scanned = 0
    foreach ($f in $files) {
        if ($exts -notcontains $f.Extension.ToLowerInvariant()) { continue }
        $rel = ConvertTo-RelKey ($f.FullName.Substring($rootFull.Length))
        $skip = $false
        foreach ($x in $exclude) { if ($rel -eq $x -or $rel.StartsWith($x.TrimEnd('/') + '/')) { $skip = $true; break } }
        if ($skip) { continue }
        $scanned++
        $text = [IO.File]::ReadAllText($f.FullName)
        $matches = $wordRx.Matches($text)
        if ($matches.Count -eq 0) { continue }
        $spans = @()
        if ($allow.ContainsKey($rel) -and $null -ne $allow[$rel]) {
            foreach ($m in $allow[$rel].Matches($text)) { $spans += ,@($m.Index, ($m.Index + $m.Length)) }
        }
        foreach ($m in $matches) {
            $inside = $false
            foreach ($s in $spans) { if ($m.Index -ge $s[0] -and ($m.Index + $m.Length) -le $s[1]) { $inside = $true; break } }
            if ($inside) { continue }
            $line = ($text.Substring(0, $m.Index) -split "`n").Count
            $hits += ('{0}:{1} "{2}"' -f $rel, $line, $m.Value)
        }
    }
    if ($hits.Count -eq 0) { return New-ClaimResult $c 'PASS' "no forbidden word in $scanned file(s) under $root" }
    $shown = @($hits | Select-Object -First 12)
    $more = if ($hits.Count -gt $shown.Count) { " (+{0} more)" -f ($hits.Count - $shown.Count) } else { '' }
    return New-ClaimResult $c 'FAIL' ("{0} hit(s) in {1}: {2}{3}" -f $hits.Count, $root, ($shown -join '; '), $more)
}

# ---------------------------------------------------------------- tree_equals
# Fields: path, other, exclude[] (paths relative to each root), extensions[] (optional filter).
# PASS when every file under `path` exists under `other` with the same bytes, or the same text
# after CRLF -> LF, and nothing exists under `other` that is missing from `path`. The .git folder
# is always skipped. Written 2026-10-08 for the one fact the kit could not see about itself: the
# plugin copy Claude Code runs (the cache) had fallen seven commits behind the checkout, and every
# session since the migration had started without its entry path. A claim that compares the two
# trees turns that into a RED run instead of a quiet one.

function Get-TreeFileMap {
    # rel-key -> full path for every file under $RootFull that survives exclude and extensions.
    param([string] $RootFull, [string[]] $Exclude, [string[]] $Exts)
    $map = @{}
    $files = Get-ChildItem -LiteralPath $RootFull -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '[\\/]\.git([\\/]|$)' }
    foreach ($f in $files) {
        if ($Exts.Count -gt 0 -and $Exts -notcontains $f.Extension.ToLowerInvariant()) { continue }
        $rel = ConvertTo-RelKey ($f.FullName.Substring($RootFull.Length))
        $skip = $false
        foreach ($x in $Exclude) { if ($rel -eq $x -or $rel.StartsWith($x.TrimEnd('/') + '/')) { $skip = $true; break } }
        if ($skip) { continue }
        $map[$rel] = $f.FullName
    }
    return $map
}

function Test-FilesSame {
    # Bytes first; then text with CRLF -> LF on both sides, so a checkout and a copy that differ
    # only by line endings still count as the same file (the generated_matches rule).
    param([string] $A, [string] $B)
    $ba = [IO.File]::ReadAllBytes($A); $bb = [IO.File]::ReadAllBytes($B)
    if ([Linq.Enumerable]::SequenceEqual($ba, $bb)) { return $true }
    $ta = [Text.Encoding]::UTF8.GetString($ba).Replace("`r`n", "`n")
    $tb = [Text.Encoding]::UTF8.GetString($bb).Replace("`r`n", "`n")
    return ($ta -ceq $tb)
}

function Test-TreeEqualsClaim {
    param($c, $Context)
    $d = ''
    $a = Resolve-ClaimPath -Raw ([string]$c.path) -Context $Context -Detail ([ref]$d)
    if ($null -eq $a) { return New-ClaimResult $c 'UNKNOWN' $d }
    $b = Resolve-ClaimPath -Raw ([string]$c.other) -Context $Context -Detail ([ref]$d)
    if ($null -eq $b) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'other'") }
    foreach ($p in @($a, $b)) {
        if (-not (Test-Path -LiteralPath $p -PathType Container)) { return New-ClaimResult $c 'UNKNOWN' "folder missing: $p" }
    }
    $aFull = [IO.Path]::GetFullPath($a).TrimEnd('\'); $bFull = [IO.Path]::GetFullPath($b).TrimEnd('\')
    if ($aFull -ieq $bFull) { return New-ClaimResult $c 'PASS' "same folder: $aFull" }
    # An absent field is $null, and $null piped into ForEach-Object still runs the block once, which
    # would turn "no extensions" into one extension "." that matches nothing. Drop empties first.
    $exclude = @($c.exclude | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { ConvertTo-RelKey ([string]$_) })
    $exts = @($c.extensions | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { ([string]$_).ToLowerInvariant() } | ForEach-Object { if ($_.StartsWith('.')) { $_ } else { ".$_" } })
    $ma = Get-TreeFileMap $aFull $exclude $exts
    $mb = Get-TreeFileMap $bFull $exclude $exts
    if ($ma.Count -eq 0 -and $mb.Count -eq 0) { return New-ClaimResult $c 'UNKNOWN' "nothing to compare: no files under either folder after exclude and extensions" }
    $diffs = @()
    foreach ($rel in ($ma.Keys | Sort-Object)) {
        if (-not $mb.ContainsKey($rel)) { $diffs += "only in path: $rel"; continue }
        if (-not (Test-FilesSame $ma[$rel] $mb[$rel])) { $diffs += "differs: $rel" }
    }
    foreach ($rel in ($mb.Keys | Sort-Object)) { if (-not $ma.ContainsKey($rel)) { $diffs += "only in other: $rel" } }
    if ($diffs.Count -eq 0) { return New-ClaimResult $c 'PASS' ("{0} file(s) identical (CRLF->LF) between {1} and {2}" -f $ma.Count, $aFull, $bFull) }
    $shown = @($diffs | Select-Object -First 12)
    $more = if ($diffs.Count -gt $shown.Count) { " (+{0} more)" -f ($diffs.Count - $shown.Count) } else { '' }
    return New-ClaimResult $c 'FAIL' ("{0} difference(s) between {1} and {2}: {3}{4}" -f $diffs.Count, $aFull, $bFull, ($shown -join '; '), $more)
}
