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
