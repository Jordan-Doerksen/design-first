# repos.ps1 - the repository sweep (SURVEY band). READ-ONLY: only git read commands, never a mutation.
# Returns arrays of PSCustomObject. Emits no output of its own. Every path comes from the context
# and the config; nothing here names a real folder.

# git writes ordinary notices to stderr ("not a git repository", "no upstream"). Under
# $ErrorActionPreference = 'Stop' those can become terminating errors, so every git call goes
# through here: stderr is merged, ErrorRecord objects are dropped, only real stdout lines return.
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & git @GitArgs 2>&1
        return @($raw | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { [string]$_ })
    } catch {
        return @()
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Test-PathUnder {
    # Case-insensitive "is $Path equal to or beneath $Parent" on full paths (SPEC 5.4 comparison rule).
    param([string] $Path, [string] $Parent)
    if ([string]::IsNullOrWhiteSpace($Parent)) { return $false }
    $a = $Path.TrimEnd('\'); $b = $Parent.TrimEnd('\')
    if ($a.Equals($b, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $a.StartsWith($b + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Resolve-WorktreeParent {
    # A .git FILE reads `gitdir: <path>`. A LINKED WORKTREE's gitdir holds a `commondir` file naming
    # the parent's .git folder; a submodule's gitdir has none (its common dir IS its git dir), so a
    # submodule stays an ordinary repo. Returns the parent repository's working folder, or $null
    # when the folder is not a linked worktree. Falls back to asking git when the marker is absent.
    param([string] $GitFile, [string] $Repo)
    try { $text = ([IO.File]::ReadAllText($GitFile)).Trim() } catch { return $null }
    if ($text -notmatch '^gitdir:\s*(.+?)\s*$') { return $null }
    $gitDir = $Matches[1].Replace('/', '\')
    if (-not [IO.Path]::IsPathRooted($gitDir)) { $gitDir = Join-Path $Repo $gitDir }
    try { $gitDir = [IO.Path]::GetFullPath($gitDir).TrimEnd('\') } catch { return $null }
    $common = $null
    $commonFile = Join-Path $gitDir 'commondir'
    if (Test-Path -LiteralPath $commonFile -PathType Leaf) {
        $cd = ([IO.File]::ReadAllText($commonFile)).Trim().Replace('/', '\')
        if ($cd -ne '') {
            if (-not [IO.Path]::IsPathRooted($cd)) { $cd = Join-Path $gitDir $cd }
            try { $common = [IO.Path]::GetFullPath($cd).TrimEnd('\') } catch { $common = $null }
        }
    }
    if ($null -eq $common) {
        $cd = (Invoke-Git -C $Repo rev-parse --path-format=absolute --git-common-dir | Select-Object -First 1)
        if ([string]::IsNullOrWhiteSpace($cd)) { return $null }
        try { $common = [IO.Path]::GetFullPath($cd.Trim().Replace('/', '\')).TrimEnd('\') } catch { return $null }
    }
    if ($common.Equals($gitDir, [StringComparison]::OrdinalIgnoreCase)) { return $null }
    # The common dir is the parent's .git folder, so its parent is the parent repository. A bare
    # parent has no working folder; name the common dir itself in that case.
    if ((Split-Path -Leaf $common) -eq '.git') { return (Split-Path -Parent $common) }
    return $common
}

function Get-RepoFacts {
    param(
        [Parameter(Mandatory = $true)] [string] $Root,
        [Parameter(Mandatory = $true)] $Config,
        [string] $StateDir = ''
    )
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "root '$Root' does not exist" }

    # -Force so the hidden .git is included. A .git FILE is a submodule (surveyed as a repo) or a
    # LINKED WORKTREE: that one shares its parent's objects, remotes and tracked tree, so it is
    # FOLDED into the parent (worktree = $true, parent = <parent path>) and only its own
    # uncommitted state is recorded. Surveying it as a repo would repeat every tracked-secret,
    # remote and shallow finding once per worktree.
    $gitEntries = @(Get-ChildItem -LiteralPath $Root -Recurse -Depth $Config.maxDepth -Force -Filter '.git' -ErrorAction SilentlyContinue)
    $rows = @()
    foreach ($g in $gitEntries) {
        $repo = Split-Path -Parent $g.FullName
        $skip = $false
        foreach ($part in $Config.excludePathParts) { if ($repo -like ('*' + $part + '*')) { $skip = $true; break } }
        if ($skip) { continue }
        $archived = $false
        foreach ($part in $Config.archivedPathParts) { if ($repo -like ('*' + $part + '*')) { $archived = $true; break } }

        $rel = $repo
        if ($repo.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $rel = $repo.Substring($Root.Length).TrimStart('\') }
        # The root itself being a repo (the kit under -Kit) reads better by name than as ".".
        if ($rel -eq '') { $rel = (Split-Path -Leaf $Root) + ' (root)' }

        $frozen = $false
        foreach ($p in $Config.frozenPaths) { if (Test-PathUnder -Path $repo -Parent $p) { $frozen = $true; break } }
        $tomb = $false
        foreach ($p in $Config.tombstonedPaths) { if ($repo.TrimEnd('\').Equals($p.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { $tomb = $true; break } }

        $wtParent = $null
        if (-not $g.PSIsContainer) { $wtParent = Resolve-WorktreeParent -GitFile $g.FullName -Repo $repo }
        if ($null -ne $wtParent) {
            $parentRel = $wtParent
            if ($wtParent.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $parentRel = $wtParent.Substring($Root.Length).TrimStart('\') }
            if ($parentRel -eq '') { $parentRel = (Split-Path -Leaf $Root) + ' (root)' }
            # Only the worktree's own uncommitted state is its own; a frozen worktree that moved is
            # still a frozen reference that moved.
            $dirty = @(Invoke-Git -C $repo status --porcelain).Count
            $rows += [PSCustomObject]@{
                path = $rel; fullPath = $repo; hasAttrs = $true; archived = $archived
                remote = ''; ownsRemote = $false; ahead = $null; dirty = $dirty
                shallow = $false; commits = 0; lastCommit = ''; frozen = $frozen; tombstoned = $tomb
                worktree = $true; parent = $parentRel
            }
            continue
        }

        $remote = (Invoke-Git -C $repo remote get-url origin | Select-Object -First 1)
        if ($null -eq $remote) { $remote = '' }
        $remote = $remote.Trim()
        $ownsRemote = $false
        if ($remote -ne '') {
            foreach ($pat in $Config.ownerRemotePatterns) { if ($remote -like ('*' + $pat + '*')) { $ownsRemote = $true; break } }
        }

        $ahead = (Invoke-Git -C $repo rev-list --count '@{u}..HEAD' | Select-Object -First 1)
        if ([string]::IsNullOrWhiteSpace($ahead)) { $ahead = $null } else { $ahead = [int]$ahead }

        # Exclude the Doctor's OWN generated state from the dirty count. Writing state/ dirties the
        # repo the brain lives in, so the next run would report a dirty count the previous run caused.
        $porcelain = @(Invoke-Git -C $repo status --porcelain)
        if ($StateDir -and (Test-PathUnder -Path $StateDir -Parent $repo)) {
            $stateRel = $StateDir.Substring($repo.Length).TrimStart('\').Replace('\', '/')
            if ($stateRel) { $porcelain = @($porcelain | Where-Object { $_ -notmatch ([regex]::Escape($stateRel) + '/') }) }
        }
        $dirty = $porcelain.Count

        # Shallow: git fsck CANNOT see this; only the marker file can.
        $gitDir = (Invoke-Git -C $repo rev-parse --git-dir | Select-Object -First 1)
        if ([string]::IsNullOrWhiteSpace($gitDir)) { $gitDir = $g.FullName }
        elseif (-not [IO.Path]::IsPathRooted($gitDir)) { $gitDir = Join-Path $repo $gitDir }
        $shallow = Test-Path -LiteralPath (Join-Path $gitDir 'shallow')
        $commits = (Invoke-Git -C $repo rev-list --count HEAD | Select-Object -First 1)
        if ([string]::IsNullOrWhiteSpace($commits)) { $commits = 0 } else { $commits = [int]$commits }
        $last = (Invoke-Git -C $repo log -1 --format=%cs | Select-Object -First 1)
        if ($null -eq $last) { $last = '' }

        # Without .gitattributes, core.autocrlf decides the bytes on disk instead of the repo.
        $hasAttrs = Test-Path -LiteralPath (Join-Path $repo '.gitattributes')

        $rows += [PSCustomObject]@{
            path = $rel; fullPath = $repo; hasAttrs = $hasAttrs; archived = $archived
            remote = $remote; ownsRemote = $ownsRemote; ahead = $ahead; dirty = $dirty
            shallow = $shallow; commits = $commits; lastCommit = $last; frozen = $frozen; tombstoned = $tomb
            worktree = $false; parent = ''
        }
    }
    return ,$rows
}

function Get-UnversionedFolders {
    # ENUMERATES the tree for folders that hold files but sit in no repo. It does not read a list
    # of folders to look at: a list of what to CHECK misses by default; a list of what to SKIP
    # reports by default. A folder with repos beneath it is a container: descend, do not report it.
    param(
        [Parameter(Mandatory = $true)] [string] $Root,
        [Parameter(Mandatory = $true)] $Config
    )
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "root '$Root' does not exist" }
    # A root that is itself a repository (the kit under -Kit) has no unversioned sub-folders: every
    # folder in it is covered by that repository. Without this, each top-level folder would be reported.
    if (Test-Path -LiteralPath (Join-Path $Root '.git')) { return ,@() }
    $maxDepth = [int]$Config.unversionedMaxDepth
    $ignore = @($Config.unversionedIgnorePathParts)
    $out = New-Object System.Collections.ArrayList

    function Test-HasRepoBeneath {
        param([string] $Dir)
        $hit = Get-ChildItem -LiteralPath $Dir -Recurse -Depth 4 -Force -Filter '.git' -ErrorAction SilentlyContinue | Select-Object -First 1
        return ($null -ne $hit)
    }
    function Walk-Dir {
        param([string] $Dir, [int] $Depth)
        if ($Depth -gt $maxDepth) { return }
        # Compare with a trailing separator so a part written "\_backups\" also matches at the end.
        $probe = $Dir.TrimEnd('\') + '\'
        foreach ($part in $ignore) { if ($probe -like ('*' + $part + '*')) { return } }
        if (Test-Path -LiteralPath (Join-Path $Dir '.git')) { return }
        if (Test-HasRepoBeneath -Dir $Dir) {
            foreach ($child in (Get-ChildItem -LiteralPath $Dir -Directory -Force -ErrorAction SilentlyContinue)) { Walk-Dir -Dir $child.FullName -Depth ($Depth + 1) }
            return
        }
        # Counting is capped: the exact count does not change the verdict, and an uncapped recurse
        # into an asset tree makes the Doctor slow enough to stop being run.
        $files = @(Get-ChildItem -LiteralPath $Dir -Recurse -File -Force -ErrorAction SilentlyContinue | Select-Object -First 501)
        if ($files.Count -eq 0) { return }
        $rel = $Dir
        if ($Dir.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $rel = $Dir.Substring($Root.Length).TrimStart('\') }
        [void]$out.Add([PSCustomObject]@{ path = $rel; fullPath = $Dir; files = $files.Count; capped = ($files.Count -gt 500) })
    }
    foreach ($top in (Get-ChildItem -LiteralPath $Root -Directory -Force -ErrorAction SilentlyContinue)) { Walk-Dir -Dir $top.FullName -Depth 1 }
    return ,@($out)
}

function Get-TrackedSecrets {
    # A tracked file named .env (or .env.<x>, not .env.example) in a live repo. `secretExceptions`
    # are full paths (already expanded by the config reader). A linked worktree lists the same
    # tracked files as its parent, so it is skipped: the parent's scan already covers them.
    param([Parameter(Mandatory = $true)] $Config, [Parameter(Mandatory = $true)] $Repos)
    $hits = @()
    foreach ($r in $Repos) {
        if ($r.archived -or [bool]$r.worktree) { continue }
        $tracked = @(Invoke-Git -C $r.fullPath ls-files | Where-Object { $_ -match '(^|/)\.env(\.(?!example$)[^/]+)?$' })
        foreach ($t in $tracked) {
            $full = [IO.Path]::GetFullPath((Join-Path $r.fullPath ($t.Replace('/', '\'))))
            $excepted = $false
            foreach ($e in $Config.secretExceptions) { if ($full.Equals($e, [StringComparison]::OrdinalIgnoreCase)) { $excepted = $true; break } }
            $hits += [PSCustomObject]@{ repo = $r.path; file = $t; fullPath = $full; excepted = $excepted }
        }
    }
    return ,$hits
}
