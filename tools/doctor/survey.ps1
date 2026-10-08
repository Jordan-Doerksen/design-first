# survey.ps1 - turn repository facts into SURVEY-band findings. READ-ONLY.
# Everything here is REPORTED: it changes the exit code only when surveyStrict is true, and then
# only the 'fail' severity counts. 'warn' and 'info' never do. Each finding carries (path, kind) so
# acceptedExceptions can match it.

function New-Finding {
    param([string] $Severity, [string] $Kind, [string] $Path, [string] $Message)
    return [PSCustomObject]@{ severity = $Severity; kind = $Kind; path = $Path; message = $Message }
}

function Get-RepoFindings {
    param([Parameter(Mandatory = $true)] $Repos)
    $f = @()
    foreach ($r in @($Repos | Where-Object { -not $_.archived })) {
        if ([bool]$r.worktree) {
            # A linked worktree shares its parent's objects, remotes and tracked tree: the remote,
            # unpushed, shallow, .gitattributes and tracked-secret checks ran on the parent. Only the
            # folder's own uncommitted state is its own, so a frozen worktree that moved still counts.
            if ($r.frozen -and $r.dirty -gt 0) {
                $f += New-Finding 'fail' 'frozenDirty' $r.path ("frozen reference has MOVED: {0} ({1} uncommitted entries)" -f $r.path, $r.dirty)
            }
            continue
        }
        if ($r.remote -eq '') {
            # A repo with no commits has nothing to lose. Reporting it as data loss is a false alarm.
            if ($r.commits -eq 0) {
                $f += New-Finding 'warn' 'emptyRepo' $r.path ("empty repo, no remote: {0} (0 commits - nothing to back up yet)" -f $r.path)
            } else {
                # anchor: survey-no-remote  mode: gate  verbs: remote
            $f += New-Finding 'fail' 'noRemote' $r.path ("no remote: {0} ({1} commits exist on this disk only)" -f $r.path, $r.commits)
            }
        } elseif (-not $r.ownsRemote) {
            # anchor: survey-foreign-remote  mode: gate  verbs: report-remote
            $f += New-Finding 'fail' 'foreignRemote' $r.path ("FOREIGN remote: {0} -> {1}. Looks backed up; cannot be pushed." -f $r.path, $r.remote)
        }
        if ($null -ne $r.ahead -and $r.ahead -gt 0) {
            # anchor: survey-unpushed  mode: gate  verbs: back-up
            $f += New-Finding 'warn' 'unpushed' $r.path ("{0} commits unpushed: {1}" -f $r.ahead, $r.path)
        }
        # git fsck CANNOT see a shallow clone - it honours the boundary. Only the marker file shows it.
        if ($r.shallow) {
            # anchor: survey-shallow  mode: gate  verbs: unshallow
            $f += New-Finding 'fail' 'shallow' $r.path ("SHALLOW clone: {0} ({1} commits visible). It cannot be pushed to a new remote. Fix: git -C <repo> fetch --unshallow <remote>" -f $r.path, $r.commits)
        }
        if ($r.frozen -and $r.dirty -gt 0) {
            $f += New-Finding 'fail' 'frozenDirty' $r.path ("frozen reference has MOVED: {0} ({1} uncommitted entries)" -f $r.path, $r.dirty)
        }
        # Silent and cumulative rather than immediate, so a warn; a frozen tree is not edited to add one.
        if ($r.commits -gt 0 -and -not $r.hasAttrs -and -not $r.frozen) {
            # anchor: survey-no-gitattributes  mode: gate  verbs: pin-bytes
            $f += New-Finding 'warn' 'noGitattributes' $r.path ("no .gitattributes: {0} - core.autocrlf decides its bytes, not the repo" -f $r.path)
        }
    }
    # One INFO per parent, never one per worktree: the fold is the point. Sorted so the output is
    # byte-stable across runs.
    $worktrees = @($Repos | Where-Object { -not $_.archived -and [bool]$_.worktree })
    foreach ($grp in @($worktrees | Group-Object -Property parent | Sort-Object -Property Name)) {
        $names = (@($grp.Group | ForEach-Object { $_.path } | Sort-Object) -join ', ')
        $f += New-Finding 'info' 'worktrees' $grp.Name ("{0} linked worktree(s) of {1}: {2}" -f $grp.Count, $grp.Name, $names)
    }
    return ,$f
}

function Get-UnversionedFindings {
    param([Parameter(Mandatory = $true)] $Folders)
    $f = @()
    foreach ($u in $Folders) {
        # WARN, not fail: several folders are legitimately outside git, and a permanently RED
        # verdict is a verdict that stops being read. Nothing hides; the owner decides.
        $count = if ($u.capped) { '500+' } else { [string]$u.files }
        $f += New-Finding 'warn' 'noGitAtAll' $u.path ("no git at all: {0} ({1} files) - nothing is protecting them" -f $u.path, $count)
    }
    return ,$f
}

function Get-SecretFindings {
    param([Parameter(Mandatory = $true)] $Secrets)
    $f = @()
    foreach ($s in $Secrets) {
        if ($s.excepted) {
            $f += New-Finding 'info' 'trackedSecretExcepted' $s.repo ("tracked secret file, registered exception: {0}/{1}" -f $s.repo, $s.file)
        } else {
            $f += New-Finding 'fail' 'trackedSecret' $s.repo ("tracked .env: {0}/{1} - a secret file is in git. Rotate first, then git rm --cached, then ignore it." -f $s.repo, $s.file)
        }
    }
    return ,$f
}

function Get-RestoreDrillFindings {
    # A backup is not a backup until a restore has been executed and logged. The drill is the
    # adopter's own tool; the Doctor only reads its log, when there is one.
    param([Parameter(Mandatory = $true)] [string] $RecordsDir)
    $f = @()
    $log = Join-Path $RecordsDir 'restore-drill.log'
    if (-not (Test-Path -LiteralPath $log -PathType Leaf)) {
        $f += New-Finding 'info' 'restoreDrillMissing' '' ("no restore drill has been logged ({0} absent) - nothing has yet proved a backup gives anything back" -f $log)
        return ,$f
    }
    $lines = @([IO.File]::ReadAllLines($log) | Where-Object { $_ -match '\S' })
    $newest = $null
    foreach ($l in $lines) {
        if ($l -match '^(\d{4}-\d{2}-\d{2})') {
            $d = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
            if ($null -eq $newest -or $d -gt $newest) { $newest = $d }
        }
    }
    if ($null -eq $newest) {
        $f += New-Finding 'warn' 'restoreDrillMissing' '' 'restore-drill.log has no dated entry'
        return ,$f
    }
    $age = [int]((Get-Date) - $newest).TotalDays
    if ($age -gt 90) {
        $f += New-Finding 'warn' 'restoreDrillStale' '' ("restore drill is {0} days old (last {1}) - quarterly is the ask" -f $age, $newest.ToString('yyyy-MM-dd'))
    }
    $failed = @($lines | Where-Object { $_ -match '\sFAIL\s' })
    if ($failed.Count -gt 0) {
        $f += New-Finding 'fail' 'restoreDrillFailed' '' ("restore drill has {0} logged FAIL line(s) - a restore did not reproduce the local tree" -f $failed.Count)
    }
    return ,$f
}

function Get-SnapshotFindings {
    # entryPointSnapshots: files that govern every session and live outside git have no revert, so
    # the brain keeps a byte snapshot. Compared after CRLF -> LF mapping: a line-ending difference
    # is not a content change, and a check that cries wolf on it gets switched off.
    param([Parameter(Mandatory = $true)] $Pairs, [Parameter(Mandatory = $true)] $Context)
    $f = @()
    foreach ($pair in $Pairs) {
        if ($null -eq $pair) { continue }
        $live = Expand-DfPath -Path ([string]$pair.live) -Context $Context
        $snap = Expand-DfPath -Path ([string]$pair.snapshot) -Context $Context
        if ($live -eq '' -or $snap -eq '' -or (Test-Unexpanded $live) -or (Test-Unexpanded $snap)) {
            $f += New-Finding 'warn' 'entryPointBadPair' '' ("entryPointSnapshots entry could not be expanded: live='{0}' snapshot='{1}'" -f $pair.live, $pair.snapshot)
            continue
        }
        $name = Split-Path -Leaf $live
        if (-not (Test-Path -LiteralPath $live -PathType Leaf)) {
            $f += New-Finding 'fail' 'entryPointLiveMissing' $live ("entry-point file is GONE: {0} - the snapshot is now the only copy" -f $live)
            continue
        }
        if (-not (Test-Path -LiteralPath $snap -PathType Leaf)) {
            $f += New-Finding 'fail' 'entryPointSnapshotMissing' $live ("no snapshot for {0} - it governs every session and lives outside git, so it has no revert" -f $name)
            continue
        }
        $a = [IO.File]::ReadAllText($live).Replace("`r`n", "`n")
        $b = [IO.File]::ReadAllText($snap).Replace("`r`n", "`n")
        if ($a -ne $b) {
            $f += New-Finding 'fail' 'entryPointDrift' $live ("entry-point snapshot is STALE: {0} changed and the snapshot was not updated in the same change. The LIVE file is authoritative - copy it over the snapshot." -f $name)
        }
    }
    return ,$f
}
