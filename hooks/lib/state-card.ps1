# state-card.ps1 - the state card a session gets when it starts inside a game repository (GAME-13).
# Dot-sourced by entry.ps1 after common.ps1 and law-rows.ps1. Never run directly.
#
# GAME-13: a session on a game repository opens with a state card built from the repository's
# documents, never from memory, and a disagreement with the real state is raised before any work.
# This file builds the half a machine can build: what the manifest and the hand-off say, read from
# the files, beside what git says, read from git. The agent posts it, adds the hats in play, and
# names any disagreement before it starts.
#
# Which repositories get a card is config, not logic. route-policy.json maps a top-level folder
# under root to law groups (`folders`); `stateCard.groups` (default: GAME) names the groups whose
# folders get a card. A session that starts at the root, or in a folder mapped to no such group,
# gets none. Tunables under `stateCard`: groups, staleCommits, lineChars, maxChars, closedWords (the
# status words that mean a timeline row or a question is closed).
#
# Measured on the first instance before this was written (27 game repositories): a manifest in 26,
# 12 of them under docs\; a hand-off in 17, all under docs\; "Core Goal", "Build Timeline" and
# "Open Questions" headings in 16; a "next" heading in only 6 hand-offs. So every part is optional,
# both locations are read, and a part that is not there is named as missing, never guessed.
#
# Honest limits: the card fires only when the session STARTS in the repository (most sessions start
# at the root); it reads the documents' shape, not their truth; "N commits behind HEAD" says a
# document is old, not that it is wrong.
#
# anchor: state-card  mode: advise  verbs: open-session

function Get-DfStateCardConfig($policy) {
    $c = @{ groups = @('GAME'); staleCommits = 10; lineChars = 220; maxChars = 2400
            closedWords = @('done', 'shipped', 'built', 'complete', 'completed', 'closed', 'resolved', 'answered', 'live', 'merged', 'released', 'published', 'verified', 'skipped', 'cut', 'dropped', 'retired') }
    $sc = if ($policy -and $policy.PSObject.Properties['stateCard']) { $policy.stateCard } else { $null }
    if ($null -eq $sc) { return $c }
    if ($sc.PSObject.Properties['groups']) { $c.groups = @($sc.groups | Where-Object { $_ } | ForEach-Object { [string]$_ }) }
    if ($sc.PSObject.Properties['closedWords'] -and @($sc.closedWords).Count -gt 0) { $c.closedWords = @($sc.closedWords | Where-Object { $_ } | ForEach-Object { [string]$_ }) }
    foreach ($k in 'staleCommits', 'lineChars', 'maxChars') {
        if ($sc.PSObject.Properties[$k]) { $v = 0; if ([int]::TryParse([string]$sc.$k, [ref]$v) -and $v -gt 0) { $c[$k] = $v } }
    }
    return $c
}

# The repository a card is built for, or $null: cwd is under root, its top-level folder is mapped
# to a state-card group, and cwd is inside a git repository that sits under that folder.
function Get-DfCardRepo([string]$cwd, $ptr, $policy, $cfg) {
    if (-not $cwd -or -not $ptr.root -or -not (Test-DfUnder $cwd $ptr.root)) { return $null }
    if ($cfg.groups.Count -eq 0 -or -not $policy -or -not $policy.folders) { return $null }
    $rel = $cwd.Substring($ptr.root.Length).TrimStart('\')
    $top = ($rel -split '\\')[0]
    if (-not $top -or -not $policy.folders.PSObject.Properties[$top]) { return $null }
    $mapped = @($policy.folders.$top | ForEach-Object { [string]$_ })
    if (@($mapped | Where-Object { $cfg.groups -contains $_ }).Count -eq 0) { return $null }
    $r = Invoke-DfGit $cwd @('rev-parse', '--show-toplevel')
    if ($r.code -ne 0 -or -not $r.out) { return $null }
    $repo = ConvertTo-DfFullPath ([string](@($r.out)[0]))
    if (-not (Test-DfUnder $repo (Join-Path $ptr.root $top)) -or $repo.Equals((Join-Path $ptr.root $top), [StringComparison]::OrdinalIgnoreCase)) { return $null }
    return $repo
}

function Find-DfCardDoc([string]$repo, [string]$name) {
    foreach ($rel in @($name, "docs\$name")) {
        $dir = Split-Path -Parent (Join-Path $repo $rel)
        if (-not (Test-Path -LiteralPath $dir -PathType Container)) { continue }
        $hit = Get-ChildItem -LiteralPath $dir -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
        if ($hit) { return $hit.FullName.Substring($repo.Length).TrimStart('\') }
    }
    return $null
}

function Format-DfCut([string]$s, [int]$n) {
    $t = (($s -replace '\*\*|__|`', '') -replace '\s+', ' ').Trim()
    if ($t.Length -le $n) { return $t }
    return ($t.Substring(0, [Math]::Max(1, $n - 3)).TrimEnd() + '...')
}

# Lines under the first heading whose text matches one of $patterns (tried in order), up to the next heading.
function Get-DfMdSection([string[]]$lines, [string[]]$patterns) {
    foreach ($p in $patterns) {
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -notmatch '^#{1,6}\s+(.+?)\s*#*\s*$') { continue }
            $title = ($Matches[1] -replace '[*_`]', '') -replace '^[\d.\s-]+', ''   # "## 3. Build Timeline" reads as "Build Timeline"
            if ($title -notmatch $p) { continue }
            $body = [Collections.Generic.List[string]]::new()
            for ($k = $i + 1; $k -lt $lines.Count -and $lines[$k] -notmatch '^#{1,6}\s'; $k++) { $body.Add($lines[$k]) }
            return @{ title = $title.Trim(); body = @($body) }
        }
    }
    return $null
}

# The first pipe table in a block: @{ header = cells; rows = list of cells }, or $null.
function Get-DfMdTable([string[]]$body) {
    $rows = [Collections.Generic.List[object]]::new()
    foreach ($l in $body) {
        $t = $l.Trim()
        if (-not $t.StartsWith('|')) { if ($rows.Count -gt 0) { break }; continue }
        if ($t -match '^\|[\s:|-]+\|?$') { continue }                     # the |---|---| separator
        $rows.Add(@($t.Trim('|') -split '\|' | ForEach-Object { $_.Trim() }))
    }
    if ($rows.Count -lt 1) { return $null }
    return @{ header = @($rows[0]); rows = @($rows | Select-Object -Skip 1) }
}

function Get-DfProse([string[]]$body, [int]$n) {
    $keep = @($body | Where-Object { $_.Trim() -and $_.Trim() -notmatch '^\|' -and $_.Trim() -notmatch '^(---+|```)' } | ForEach-Object { ($_.Trim() -replace '^([-*+]|\d+\.)\s+', '') -replace '^>\s*', '' })
    if ($keep.Count -eq 0) { return '' }
    return (Format-DfCut (($keep | Select-Object -First 4) -join ' ') $n)
}

# "last changed <date>, N commits behind HEAD" for a tracked document; says so when git has no record.
function Get-DfDocAge([string]$repo, [string]$rel) {
    $r = Invoke-DfGit $repo @('log', '-1', '--format=%H %cs', '--', ($rel -replace '\\', '/'))
    $first = if ($r.out) { [string](@($r.out)[0]) } else { '' }
    if ($r.code -ne 0 -or $first -notmatch '^([0-9a-f]{7,40}) (\d{4}-\d{2}-\d{2})') { return @{ text = 'never committed'; behind = -1 } }
    $hash = $Matches[1]; $date = $Matches[2]
    $c = Invoke-DfGit $repo @('rev-list', '--count', "$hash..HEAD")
    $n = -1; if ($c.code -eq 0 -and $c.out) { [void][int]::TryParse(([string](@($c.out)[0])).Trim(), [ref]$n) }
    $tail = if ($n -eq 0) { 'changed in the last commit' } elseif ($n -gt 0) { "$n commit(s) behind HEAD" } else { 'age unknown' }
    return @{ text = "last changed $date, $tail"; behind = $n }
}

# The card for one repository, as lines. Every part is optional; a missing part is named.
function Get-DfStateCard([string]$repo, $ptr, $cfg) {
    $n = [int]$cfg.lineChars
    # A status cell is closed when it carries one of the closed words as a whole word, or a tick
    # mark (U+2705, U+2714; built from code points so this file stays ASCII).
    $closedRx = '(?i)\b(' + ((@($cfg.closedWords) | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')\b|' + [char]0x2705 + '|' + [char]0x2714
    $out = [Collections.Generic.List[string]]::new()
    $name = if ($ptr.root -and (Test-DfUnder $repo $ptr.root)) { $repo.Substring($ptr.root.Length).TrimStart('\') } else { $repo }
    $out.Add("design-first: state card for $name (GAME-13). Built from the repository's documents and from git, not from memory. Post it before any work; where it disagrees with what you find, say so first.")

    # git: what is true on the disk
    $b = Invoke-DfGit $repo @('rev-parse', '--abbrev-ref', 'HEAD')
    $branch = if ($b.code -eq 0 -and $b.out) { ([string](@($b.out)[0])).Trim() } else { 'no commit yet' }
    $s = Invoke-DfGit $repo @('status', '--porcelain')
    $dirty = if ($s.code -eq 0) { @($s.out | Where-Object { $_ }).Count } else { -1 }
    $a = Invoke-DfGit $repo @('rev-list', '--count', '@{u}..HEAD')
    $ahead = if ($a.code -eq 0 -and $a.out) { ([string](@($a.out)[0])).Trim() + ' unpushed' } else { 'no upstream branch' }
    $l = Invoke-DfGit $repo @('log', '-1', '--format=%cs')
    $last = if ($l.code -eq 0 -and $l.out) { 'last commit ' + ([string](@($l.out)[0])).Trim() } else { 'no commit yet' }
    $out.Add(("  git          branch {0}; {1} uncommitted; {2}; {3}" -f $branch, $(if ($dirty -ge 0) { $dirty } else { '?' }), $ahead, $last))

    # the manifest: what is locked
    $dec = Find-DfCardDoc $repo 'DECISIONS.md'
    if (-not $dec) { $out.Add('  manifest     none found (DECISIONS.md, docs\DECISIONS.md). No manifest means no locked decisions; say so.') }
    else {
        $age = Get-DfDocAge $repo $dec
        $out.Add("  manifest     $dec; $($age.text)")
        $lines = [IO.File]::ReadAllLines((Join-Path $repo $dec))
        $goal = Get-DfMdSection $lines @('(?i)^core goal')
        if ($goal) { $g = Get-DfProse $goal.body $n; if ($g) { $out.Add("    goal         $g") } }
        $tl = Get-DfMdSection $lines @('(?i)^build timeline', '(?i)\btimeline\b|\broadmap\b|\bmilestones?\b')
        $tbl = if ($tl) { Get-DfMdTable $tl.body } else { $null }
        if ($tbl -and $tbl.rows.Count -gt 0) {
            $si = -1
            for ($i = 0; $i -lt $tbl.header.Count; $i++) { if ($tbl.header[$i] -match '(?i)status') { $si = $i; break } }
            if ($si -lt 0) { $out.Add("    timeline     $($tbl.rows.Count) row(s), no status column; read the table") }
            else {
                $closed = 0; $next = $null
                foreach ($row in $tbl.rows) {
                    $st = if ($si -lt $row.Count) { [string]$row[$si] } else { '' }
                    if ($st -match $closedRx) { $closed++ } elseif ($null -eq $next) { $next = $row }
                }
                $what = if ($next) {
                    $cells = @(for ($i = 0; $i -lt $next.Count; $i++) { if ($i -ne $si -and $next[$i]) { $next[$i] } })
                    $stText = if ($si -lt $next.Count -and $next[$si]) { " [$($next[$si])]" } else { '' }
                    'next open row: ' + (Format-DfCut ((@($cells | Select-Object -First 2) -join ' - ') + $stText) $n)
                } else { 'every row is closed' }
                $out.Add(("    timeline     {0} of {1} row(s) closed; {2}" -f $closed, $tbl.rows.Count, $what))
            }
        }
        $cl = Get-DfMdSection $lines @('(?i)^change log', '(?i)^change requests?')
        $ct = if ($cl) { Get-DfMdTable $cl.body } else { $null }
        if ($ct -and $ct.rows.Count -gt 0) {
            $lastRow = $ct.rows[$ct.rows.Count - 1]
            $out.Add("    last change  " + (Format-DfCut ((@($lastRow | Where-Object { $_ } | Select-Object -First 2)) -join ': ') $n))
        }
        $oq = Get-DfMdSection $lines @('(?i)^open questions')
        $ot = if ($oq) { Get-DfMdTable $oq.body } else { $null }
        if ($ot -and $ot.rows.Count -gt 0) {
            $open = @($ot.rows | Where-Object { (($_ -join ' ') -notmatch $closedRx) }).Count
            $out.Add(("    questions    {0} open of {1} row(s)" -f $open, $ot.rows.Count))
        }
    }

    # the hand-off: what the last session said
    $ho = Find-DfCardDoc $repo 'HANDOFF.md'
    if (-not $ho) { $out.Add('  hand-off     none found (HANDOFF.md, docs\HANDOFF.md). The git log is the only hand-off; say so.') }
    else {
        $age = Get-DfDocAge $repo $ho
        $stale = if ($age.behind -gt [int]$cfg.staleCommits) { "  << STALE: more than $($cfg.staleCommits) commits behind HEAD; read the git log before you trust it" } else { '' }
        $out.Add("  hand-off     $ho; $($age.text)$stale")
        $lines = [IO.File]::ReadAllLines((Join-Path $repo $ho))
        $st = Get-DfMdSection $lines @('(?i)^(current\s+)?(state|status)\b', '(?i)^where\b')
        $nx = Get-DfMdSection $lines @('(?i)^(what(\s+is|.s)\s+)?next\b', '(?i)\bnext\b')
        if ($st) { $t = Get-DfProse $st.body $n; if ($t) { $out.Add("    state        $t") } }
        if ($nx) { $t = Get-DfProse $nx.body $n; if ($t) { $out.Add("    next         $t") } }
        if (-not $st -and -not $nx) {
            $t = Get-DfProse @($lines | Where-Object { $_ -notmatch '^#{1,6}\s' }) $n
            $out.Add("    opens with   " + $(if ($t) { $t } else { '(empty)' }) + '  (no state or next heading)')
        }
    }
    $out.Add('  add          the hats in play. Check the lines above against git status and git log; a stale hand-off is a defect.')

    $text = $out -join "`n"
    if ($text.Length -gt [int]$cfg.maxChars) { $text = $text.Substring(0, [int]$cfg.maxChars).TrimEnd() + "`n  (card cut at $($cfg.maxChars) characters)" }
    return @($text -split "`n")
}

# What entry.ps1 calls: the card's lines for this session start, or nothing.
function Get-DfStateCardLines([string]$cwd, $ptr) {
    $kitRoot = Get-DfKitRoot $ptr
    $pol = Read-DfRoutePolicy $ptr $kitRoot
    $cfg = Get-DfStateCardConfig $pol.policy
    $repo = Get-DfCardRepo $cwd $ptr $pol.policy $cfg
    if (-not $repo) { return @() }
    return (Get-DfStateCard $repo $ptr $cfg)
}
