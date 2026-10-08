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

# ---------------------------------------------------------------- tree_each
# The repo scan (2026-10-08, the HONOUR triage). Fields:
#   root        folder whose git repositories (direct children, or deeper per `depth`, default 2) are scanned
#   where       optional: { anyOf: [ "file-or-glob", ... ] } - a repository is selected only when one matches
#   require     [ { "file": "DECISIONS.md" } | { "glob": "**/MANUAL.md" } | { "glob": "**/*.py", "pattern": "<regex>" } ]
#               file: the path exists under the repo root; glob: at least one file matches (case-insensitive,
#               * within a segment, ** across segments); pattern: at least one matched file contains the regex.
#   since       optional ISO date. A repository whose FIRST commit predates it is grandfathered: a gap there is
#               reported in the detail, never a FAIL. The date comes from git, so the ratchet is generated, not typed.
#   accepted    optional [ { path, reason, since } ], ${ROOT}-relative: reported, never failed. Each needs a reason.
# PASS: every selected, non-grandfathered, non-accepted repository meets every requirement. FAIL: one does not
# (first 12 named with the missing requirement). UNKNOWN: root missing, nothing selected, or no `require`.
# Skipped folders: .git, node_modules, target, .venv, __pycache__, dist, build, .godot, .tools.

$script:DfScanSkipDirs = @('.git', 'node_modules', 'target', '.venv', '__pycache__', 'dist', 'build', '.godot', '.tools')

function Get-DfScanRepos([string]$rootFull, [int]$depth) {
    $found = [Collections.Generic.List[string]]::new()
    $queue = [Collections.Generic.Queue[object]]::new()
    foreach ($d in (Get-ChildItem -LiteralPath $rootFull -Directory -Force -ErrorAction SilentlyContinue)) { $queue.Enqueue(@{ dir = $d.FullName; level = 1 }) }
    while ($queue.Count -gt 0) {
        $it = $queue.Dequeue()
        $leaf = Split-Path -Leaf $it.dir
        if ($script:DfScanSkipDirs -contains $leaf) { continue }
        if (Test-Path -LiteralPath (Join-Path $it.dir '.git')) { $found.Add($it.dir); continue }   # a repo; do not descend
        if ($it.level -lt $depth) {
            foreach ($d in (Get-ChildItem -LiteralPath $it.dir -Directory -Force -ErrorAction SilentlyContinue)) { $queue.Enqueue(@{ dir = $d.FullName; level = $it.level + 1 }) }
        }
    }
    return @($found | Sort-Object)
}

function ConvertTo-DfGlobRegex([string]$glob) {
    # ** = any path, * = within a segment, ? = one char; matched against the forward-slash relative
    # path. Several globs may be joined with '|' (any of them matches).
    $parts = @()
    foreach ($one in ($glob -split '\|')) {
        $g = $one.Trim().Replace('\', '/').TrimStart('/')
        if (-not $g) { continue }
        $parts += [regex]::Escape($g).Replace('\*\*/', '(?:.*/)?').Replace('\*\*', '.*').Replace('\*', '[^/]*').Replace('\?', '[^/]')
    }
    return [regex]::new('^(?:' + ($parts -join '|') + ')$', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Get-DfRepoFiles([string]$repo) {
    $out = [Collections.Generic.List[object]]::new()
    $stack = [Collections.Generic.Stack[string]]::new(); $stack.Push($repo)
    $rootLen = $repo.TrimEnd('\').Length
    while ($stack.Count -gt 0) {
        $d = $stack.Pop()
        foreach ($e in (Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue)) {
            if ($e.PSIsContainer) { if ($script:DfScanSkipDirs -notcontains $e.Name) { $stack.Push($e.FullName) }; continue }
            $out.Add(@{ full = $e.FullName; rel = $e.FullName.Substring($rootLen).TrimStart('\').Replace('\', '/') })
            if ($out.Count -ge 20000) { return $out }
        }
    }
    return $out
}

function Test-DfRequirement($req, [string]$repo, $files) {
    # Returns $null when met, else a short description of what is missing.
    if ($req.file) {
        $p = Join-Path $repo (([string]$req.file) -replace '/', '\')
        if (Test-Path -LiteralPath $p) { return $null }
        return "missing $($req.file)"
    }
    if ($req.glob) {
        $rx = ConvertTo-DfGlobRegex ([string]$req.glob)
        $hits = @($files | Where-Object { $rx.IsMatch($_.rel) })
        if ($hits.Count -eq 0) { return "no file matches $($req.glob)" }
        if (-not $req.pattern) { return $null }
        $prx = [regex]::new([string]$req.pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
        foreach ($h in $hits) {
            try { if ($prx.IsMatch([IO.File]::ReadAllText($h.full))) { return $null } } catch { }
        }
        return "no $($req.glob) file contains /$($req.pattern)/"
    }
    return 'requirement has neither file nor glob'
}

function Get-DfFirstCommitDate([string]$repo) {
    try {
        $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        $roots = & git -C $repo rev-list --max-parents=0 HEAD 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $roots) { return $null }
        $first = @($roots)[-1]
        $iso = & git -C $repo show -s --format=%cI $first 2>$null
        $ErrorActionPreference = $prev
        $d = [DateTimeOffset]::MinValue
        if ([DateTimeOffset]::TryParse(([string]$iso).Trim(), [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$d)) { return $d }
    } catch { }
    return $null
}

# ---------------------------------------------------------------- repo scan selection (shared)
# tree_each and tree_rules select the same way: git repositories under `root` (depth), `where.anyOf`
# globs, `exclude` prefixes, the `since` ratchet on git's first-commit date, and `accepted` entries
# with a reason. $Check is a scriptblock (repo, files) -> @() of strings naming what falls short.
function Invoke-DfRepoScan {
    param($c, $Context, [scriptblock] $Check, [string] $Verb)
    $d = ''
    $root = Resolve-ClaimPath -Raw ([string]$c.root) -Context $Context -Detail ([ref]$d)
    if ($null -eq $root) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'root'") }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { return New-ClaimResult $c 'UNKNOWN' "root folder missing: $root" }
    $depth = 2; if ($c.depth) { [void][int]::TryParse([string]$c.depth, [ref]$depth); if ($depth -lt 1) { $depth = 1 } }
    $since = $null
    if ($c.since) {
        $t = [DateTimeOffset]::MinValue
        if ([DateTimeOffset]::TryParse([string]$c.since, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$t)) { $since = $t }
        else { return New-ClaimResult $c 'UNKNOWN' "'since' is not a date: $($c.since)" }
    }
    $rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\')
    $ctxRoot = if ($Context.root) { [IO.Path]::GetFullPath($Context.root).TrimEnd('\') } else { $rootFull }
    $accepted = @{}
    foreach ($a in @($c.accepted)) {
        if ($null -eq $a -or -not $a.path) { continue }
        if ([string]::IsNullOrWhiteSpace([string]$a.reason)) { return New-ClaimResult $c 'UNKNOWN' "accepted entry '$($a.path)' has no reason" }
        $accepted[(ConvertTo-RelKey ([string]$a.path))] = [string]$a.reason
    }
    $exclude = @($c.exclude | Where-Object { $_ } | ForEach-Object { ConvertTo-RelKey ([string]$_) })
    $repos = Get-DfScanRepos $rootFull $depth
    $selected = 0; $fails = @(); $grand = @(); $acc = @(); $met = 0
    foreach ($repo in $repos) {
        $relRaw = if ($repo.StartsWith($ctxRoot, [StringComparison]::OrdinalIgnoreCase)) { $repo.Substring($ctxRoot.Length).TrimStart('\') } else { $repo }
        $relKey = ConvertTo-RelKey $relRaw
        $skip = $false
        foreach ($x in $exclude) { if ($relKey -eq $x -or $relKey.StartsWith($x.TrimEnd('/') + '/')) { $skip = $true; break } }
        if ($skip) { continue }
        $files = Get-DfRepoFiles $repo
        if ($c.where -and $c.where.anyOf) {
            $ok = $false
            foreach ($w in @($c.where.anyOf)) {
                $rx = ConvertTo-DfGlobRegex ([string]$w)
                if (@($files | Where-Object { $rx.IsMatch($_.rel) }).Count -gt 0) { $ok = $true; break }
            }
            if (-not $ok) { continue }
        }
        $selected++
        $missing = @(& $Check $repo $files)
        if ($missing.Count -eq 0) { $met++; continue }
        if ($accepted.ContainsKey($relKey)) { $acc += ("{0} ({1})" -f $relRaw, ($missing -join ', ')); continue }
        if ($since) {
            $born = Get-DfFirstCommitDate $repo
            if ($born -and $born -lt $since) { $grand += ("{0} ({1})" -f $relRaw, ($missing -join ', ')); continue }
        }
        $fails += ("{0}: {1}" -f $relRaw, ($missing -join ', '))
    }
    if ($selected -eq 0) { return New-ClaimResult $c 'UNKNOWN' "nothing selected under $root (no repository matched 'where'); nothing was checked" }
    $tail = ''
    if ($grand.Count -gt 0) { $tail += ("; {0} predate {1} and are reported, not failed: {2}" -f $grand.Count, $since.ToString('yyyy-MM-dd'), (@($grand | Select-Object -First 12) -join ' | ')) }
    if ($acc.Count -gt 0) { $tail += ("; {0} accepted: {1}" -f $acc.Count, (@($acc | Select-Object -First 12) -join ' | ')) }
    if ($fails.Count -eq 0) { return New-ClaimResult $c 'PASS' ("{0} of {1} repositories under {2} {3}{4}" -f $met, $selected, $root, $Verb, $tail) }
    $shown = @($fails | Select-Object -First 12)
    $more = if ($fails.Count -gt $shown.Count) { " (+{0} more)" -f ($fails.Count - $shown.Count) } else { '' }
    return New-ClaimResult $c 'FAIL' ("{0} of {1} repositories under {2} fall short: {3}{4}{5}" -f $fails.Count, $selected, $root, ($shown -join ' | '), $more, $tail)
}

function Test-TreeEachClaim {
    param($c, $Context)
    $reqs = @($c.require | Where-Object { $null -ne $_ })
    if ($reqs.Count -eq 0) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'require'" }
    return Invoke-DfRepoScan $c $Context {
        param($repo, $files)
        $out = @()
        foreach ($r in $reqs) { $m = Test-DfRequirement $r $repo $files; if ($m) { $out += $m } }
        return $out
    } 'meet the requirement'
}

# ---------------------------------------------------------------- tree_rules
# The regex scan (2026-10-08). Same selection as tree_each, then per repository: every file matching
# `files` (a glob, '|'-joined) and not matching an `except` glob is read, and each rule is applied:
#   { id, forbid: <regex> }                  no line may match; a line that also matches `allowOnLine`,
#                                            or whose previous line does, is not counted (a reason written
#                                            next to the exception is the exception)
#   { id, when: <regex>, require: <regex> }  a file that matches `when` anywhere must also match `require`
# A rule may carry its own `files` glob. A repository with any hit falls short; the detail names
# rule, file and line for the first hits. Carries SAFE-05, OBS-04, SKIN-03, SKIN-04, GAME-07.
function Test-TreeRulesClaim {
    param($c, $Context)
    $rules = @($c.rules | Where-Object { $null -ne $_ })
    if ($rules.Count -eq 0) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'rules'" }
    foreach ($r in $rules) {
        if (-not $r.id) { return New-ClaimResult $c 'UNKNOWN' 'a rule has no id' }
        if (-not $r.forbid -and -not ($r.when -and $r.require)) { return New-ClaimResult $c 'UNKNOWN' "rule '$($r.id)' needs forbid, or when + require" }
    }
    $defaultFiles = if ($c.files) { [string]$c.files } else { '**/*' }
    $exceptRx = @($c.except | Where-Object { $_ } | ForEach-Object { ConvertTo-DfGlobRegex ([string]$_) })
    $allowRx = if ($c.allowOnLine) { [regex]::new([string]$c.allowOnLine, [Text.RegularExpressions.RegexOptions]::IgnoreCase) } else { $null }
    $opts = [Text.RegularExpressions.RegexOptions]::IgnoreCase
    return Invoke-DfRepoScan $c $Context {
        param($repo, $files)
        $out = @()
        foreach ($r in $rules) {
            $glob = if ($r.files) { [string]$r.files } else { $defaultFiles }
            $grx = ConvertTo-DfGlobRegex $glob
            $hits = @(); $count = 0
            foreach ($f in $files) {
                if (-not $grx.IsMatch($f.rel)) { continue }
                $skip = $false; foreach ($e in $exceptRx) { if ($e.IsMatch($f.rel)) { $skip = $true; break } }
                if ($skip) { continue }
                $text = ''
                try { $text = [IO.File]::ReadAllText($f.full) } catch { continue }
                if ($r.forbid) {
                    $frx = [regex]::new([string]$r.forbid, $opts)
                    $lines = $text.Replace("`r`n", "`n") -split "`n"
                    for ($i = 0; $i -lt $lines.Count; $i++) {
                        if (-not $frx.IsMatch($lines[$i])) { continue }
                        if ($allowRx -and ($allowRx.IsMatch($lines[$i]) -or ($i -gt 0 -and $allowRx.IsMatch($lines[$i - 1])))) { continue }
                        $count++; if ($hits.Count -lt 3) { $hits += ("{0}:{1}" -f $f.rel, ($i + 1)) }
                    }
                }
                else {
                    if ([regex]::IsMatch($text, [string]$r.when, $opts) -and -not [regex]::IsMatch($text, [string]$r.require, $opts)) {
                        $count++; if ($hits.Count -lt 3) { $hits += $f.rel }
                    }
                }
            }
            if ($count -gt 0) {
                $more = if ($count -gt $hits.Count) { " +{0}" -f ($count - $hits.Count) } else { '' }
                $out += ("{0}: {1}{2}" -f $r.id, ($hits -join ' '), $more)
            }
        }
        return $out
    } 'pass every rule'
}
