# turn-changes.ps1 - what changed on the disk during this turn, read from git. Dot-sourced by
# guard.ps1, route.ps1 and stop.ps1 after common.ps1. Never run directly.
#
# Why. The Stop card was built from the edit ledger alone: the Edit / Write / NotebookEdit calls the
# guard allowed. A file changed by a command (a patch script, sed, a formatter, a generator) was
# never in it. On 2026-10-08 the card said "Documents touched: none" over five documents a script
# had just written, and a turn that changed source only through commands got no card at all. A
# ledger of tool calls is a record of intentions. What changed is a fact about the disk (PRIN-03),
# so it is read from the disk: the tool calls only NOMINATE repositories, and git says what changed
# in each of them since the prompt.
#
#   <markers>/<session>.turn    when the owner's last prompt arrived (route.ps1 writes it)
#   <markers>/<session>.repos   one line per repository this turn's tool calls pointed at, with
#                               the commit HEAD was on at the first such call (guard.ps1 appends;
#                               "none" when the repository had no commit). A wrong nomination
#                               costs a few git calls and changes nothing, because git is the judge.
#   <markers>/<session>.guard-error  one line per call the guard failed on inside this turn, so it
#                               recorded nothing for that call (guard.ps1's catch block appends;
#                               route.ps1 clears it with the others). The card says the count may be short.
#
# A file counts as changed this turn when it is in a commit made since that first call (the
# commits between the recorded HEAD and HEAD now, less any older than the prompt, which a pull
# brought in), or it is uncommitted now and was written since the prompt, or it is gone and its
# folder was written since the prompt.
#
# Honest limits. A repository no tool call pointed at is not looked at: a script run from folder A
# that writes into repository B, with B named nowhere on the command line, is not seen. A write
# that keeps the old last-write time (a copy that preserves times) is not seen. A commit made this
# turn counts every file in it, also one that was edited before the prompt. A file git ignores is
# seen only when an Edit or Write call named it. The times are this machine's clock.

function Get-DfSessionFile([string]$sessionId, [string]$ext) {
    if ([string]::IsNullOrWhiteSpace($sessionId)) { $sessionId = 'unknown' }
    return (Join-Path (Get-DfMarkerDir) (($sessionId -replace '[^A-Za-z0-9_.-]', '_') + $ext))
}

# The nearest folder at or above $full that holds a .git entry, found on the file system, with no
# git process. $stopAt (the root, when a pointer names one) bounds the climb.
function Find-DfRepoDir([string]$full, [string]$stopAt) {
    if (-not $full) { return $null }
    $d = Get-DfNearestExistingDir $full
    while ($d) {
        if ($stopAt -and -not (Test-DfUnder $d $stopAt)) { return $null }
        if (Test-Path -LiteralPath (Join-Path $d '.git')) { return $d.TrimEnd('\') }
        $parent = Split-Path -Parent $d
        if (-not $parent -or $parent -eq $d) { return $null }
        $d = $parent
    }
    return $null
}

# The repositories a shell call points at: the one holding its working folder, and the one holding
# any word of the command that is a path under the root (cd <dir>, git -C <dir>, a file argument).
# Words that are not paths resolve to nothing or to the working folder's own repository.
function Get-DfShellRepos($subs, [string]$cwd, [string]$root) {
    $set = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $r = Find-DfRepoDir $cwd $root
    if ($r) { [void]$set.Add($r) }
    $n = 0
    foreach ($tokens in @($subs)) {
        foreach ($t in @($tokens)) {
            $w = [string]$t
            if ($w.Length -lt 2 -or $w.Length -gt 400 -or $w.StartsWith('-') -or $w -match '[*?<>|"=;]') { continue }
            if (++$n -gt 200) { break }
            $full = ConvertTo-DfFullPath $w $cwd
            if (-not $full) { continue }
            if ($root -and -not (Test-DfUnder $full $root)) { continue }
            $r = Find-DfRepoDir $full $root
            if ($r) { [void]$set.Add($r) }
        }
    }
    return @($set)
}

# Records each repository once per turn, with the commit HEAD is on now. The guard calls this
# BEFORE the tool call runs, so that commit is the one the turn started from in this repository,
# and "the commits made this turn" is an exact range, not a comparison of clock times (git keeps
# commit times by the second; the first version compared times and lost a commit made in the
# prompt's own second).
function Add-DfNominations([string]$sessionId, [string[]]$repos) {
    if (-not $repos -or $repos.Count -eq 0) { return }
    $file = Get-DfSessionFile $sessionId '.repos'
    $have = @(Read-DfNominations $sessionId | ForEach-Object { $_.repo })
    foreach ($r in $repos) {
        if (-not $r -or @($have | Where-Object { $_ -ieq $r }).Count -gt 0) { continue }
        $h = Invoke-DfGit $r @('rev-parse', '-q', '--verify', 'HEAD')
        $base = if ($h.code -eq 0 -and $h.out) { ([string](@($h.out)[0])).Trim() } else { 'none' }
        Add-DfTextLine $file ("{0}`t{1}" -f $r, $base)
        $have += $r
    }
}

# The nominated repositories of this turn: @{ repo; base } each, first line per repository wins.
function Read-DfNominations([string]$sessionId) {
    $file = Get-DfSessionFile $sessionId '.repos'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return @() }
    $out = @(); $seen = @()
    foreach ($l in @(Get-Content -LiteralPath $file -Encoding utf8)) {
        if (-not $l.Trim()) { continue }
        $parts = $l -split "`t"
        $repo = $parts[0].Trim()
        if (-not $repo -or @($seen | Where-Object { $_ -ieq $repo }).Count -gt 0) { continue }
        $seen += $repo
        $out += @{ repo = $repo; base = $(if ($parts.Count -gt 1) { $parts[1].Trim() } else { '' }) }
    }
    return $out
}

# The time of the owner's last prompt, or $null when this session has none on record (a session
# that started before this file existed): the caller then falls back to the edit ledger.
function Get-DfTurnStart([string]$sessionId) {
    $file = Get-DfSessionFile $sessionId '.turn'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $null }
    try {
        $raw = ([IO.File]::ReadAllText($file)).Trim()
        $d = [DateTimeOffset]::MinValue
        if ([DateTimeOffset]::TryParse($raw, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$d)) { return $d }
    } catch { }
    return $null
}

$script:DfRowRx = '\|\s*\d{4}-\d{2}-\d{2}\s*\|'      # a dated table row: a Change Log entry

# What changed in one repository since $since. Returns @{ ok; paths (repository-relative, forward
# slashes); decisionsRow; capped; cap }. ok is $false when git could not answer; the caller then counts
# from the tool calls and says so. capped is $true when git status listed more than $cap entries and
# the rest were not read: the caller names the repository and calls its count a floor.
function Get-DfTurnChanges([string]$repo, [DateTimeOffset]$since, [string]$base = '', [int]$cap = 4000) {
    $out = @{ ok = $false; paths = [Collections.Generic.List[string]]::new(); decisionsRow = $false; capped = $false; cap = $cap }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $sinceUtc = $since.UtcDateTime
    # Which commits are this turn's. With a recorded HEAD: the range from it to HEAD now, less any
    # commit older than the prompt (a pull or a merge brings those in; nobody wrote them this turn).
    # "none": the repository had no commit, so every commit on HEAD is new. No record (an older
    # marker file): commit times alone, with the prompt's second rounded UP, because git keeps
    # commit times by the second and a commit made just before the prompt must not be taken.
    $whole = [DateTimeOffset]::new($since.Year, $since.Month, $since.Day, $since.Hour, $since.Minute, $since.Second, $since.Offset)
    $floorIso = $whole.ToString('yyyy-MM-ddTHH:mm:sszzz')
    if ($since -gt $whole) { $whole = $whole.AddSeconds(1) }
    $ceilIso = $whole.ToString('yyyy-MM-ddTHH:mm:sszzz')
    $byTime = @("--since=$ceilIso", 'HEAD')
    $revs = if ($base -eq 'none') { @('HEAD') } elseif ($base) { @("--since=$floorIso", "$base..HEAD") } else { $byTime }

    $st = Invoke-DfGit $repo @('-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all')
    if ($st.code -ne 0) { return $out }
    $out.ok = $true

    # 1. commits made since the prompt. A repository with no commit yet answers with an error: no commits.
    $decisionsCommitted = @()
    $log = Invoke-DfGit $repo (@('-c', 'core.quotepath=false', 'log', '--name-only', '--format=') + $revs)
    if ($log.code -ne 0 -and $base -and $base -ne 'none') {
        # The recorded commit is gone (a rewrite pruned it): fall back to commit times.
        $revs = $byTime
        $log = Invoke-DfGit $repo (@('-c', 'core.quotepath=false', 'log', '--name-only', '--format=') + $revs)
    }
    if ($log.code -eq 0) {
        foreach ($l in @($log.out)) {
            $rel = ([string]$l).Trim().Trim('"')
            if (-not $rel) { continue }
            if ($seen.Add($rel)) { $out.paths.Add($rel) }
            if ((Get-DfLeaf $rel) -ieq 'DECISIONS.md' -and $decisionsCommitted -notcontains $rel) { $decisionsCommitted += $rel }
        }
    }

    # 2. uncommitted now, and written since the prompt
    $decisionsDirty = @(); $decisionsNew = @(); $n = 0
    foreach ($l in @($st.out)) {
        $line = [string]$l
        if ($line.Length -lt 4) { continue }
        if (++$n -gt $cap) { $out.capped = $true; break }
        $xy = $line.Substring(0, 2); $rel = $line.Substring(3)
        if ($rel -match ' -> ') { $rel = ($rel -split ' -> ')[-1] }           # a rename: the new name
        $rel = $rel.Trim().Trim('"')
        $full = Join-Path $repo ($rel -replace '/', '\')
        $changed = $false
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            $changed = ([IO.File]::GetLastWriteTimeUtc($full) -ge $sinceUtc)
        }
        elseif ($xy -match 'D' -and -not (Test-Path -LiteralPath $full)) {
            # A file that is gone has no time of its own; the folder it left was written when it went.
            $dir = Get-DfNearestExistingDir (Split-Path -Parent $full)
            $changed = ($dir -and ([IO.Directory]::GetLastWriteTimeUtc($dir) -ge $sinceUtc))
        }
        if (-not $changed) { continue }
        if ($seen.Add($rel)) { $out.paths.Add($rel) }
        if ((Get-DfLeaf $rel) -ieq 'DECISIONS.md') { if ($xy -eq '??') { $decisionsNew += $rel } else { $decisionsDirty += $rel } }
    }

    # 3. did a DECISIONS.md that changed this turn gain a dated row (a Change Log entry)? Per file, the
    # turn's diffs must add more dated rows than they remove. Workaround (CR-2026-10-15-GAPS D5): any
    # added line that was a dated row counted, so an edit that reworded an old row (one row line out,
    # one in) passed for a new Change Log entry and hid the GATE-06 line. A new file's rows are all added,
    # and so are the rows of a file staged in a repository with no commit yet.
    $net = @{}
    foreach ($rel in $decisionsNew) {
        try { $net[$rel] = [regex]::Matches([IO.File]::ReadAllText((Join-Path $repo ($rel -replace '/', '\'))), ('(?m)^' + $script:DfRowRx)).Count } catch { }
    }
    foreach ($rel in $decisionsDirty) {
        $d = Invoke-DfGit $repo @('diff', 'HEAD', '--', $rel)
        if ($d.code -eq 0) { $net[$rel] = [int]$net[$rel] + (Get-DfRowNet (@($d.out) -join "`n")) }
        elseif ((Invoke-DfGit $repo @('rev-parse', '-q', '--verify', 'HEAD')).code -ne 0) {
            # No commit yet: a file staged in a new repository has no HEAD to diff against, so every
            # row in it is added, as for an untracked file. Workaround (CR-2026-10-15-GAPS D5 check):
            # uncounted, it made the card say "no Change Log row" over a manifest that had one, since
            # git, not the ledger flag, decides for a file git lists.
            try { $net[$rel] = [int]$net[$rel] + [regex]::Matches([IO.File]::ReadAllText((Join-Path $repo ($rel -replace '/', '\'))), ('(?m)^' + $script:DfRowRx)).Count } catch { }
        }
    }
    foreach ($rel in $decisionsCommitted) {
        $d = Invoke-DfGit $repo (@('log', '-p', '--format=') + $revs + @('--', $rel))
        if ($d.code -eq 0) { $net[$rel] = [int]$net[$rel] + (Get-DfRowNet (@($d.out) -join "`n")) }
    }
    $out.decisionsRow = @($net.Values | Where-Object { $_ -gt 0 }).Count -gt 0
    return $out
}

# Dated rows a diff adds less the ones it removes. The '+++' and '---' file headers are not rows.
function Get-DfRowNet([string]$diff) {
    return ([regex]::Matches($diff, ('(?m)^\+' + $script:DfRowRx)).Count - [regex]::Matches($diff, ('(?m)^-' + $script:DfRowRx)).Count)
}
