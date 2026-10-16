# guard-loop-rules.ps1 - guard rules 11 and 12: the loop branch (AUTO-04, AUTO-11). Dot-sourced by
# guard.ps1 after guard-rules.ps1. Never run directly.
#
# The harness loop works on a branch named with the loop prefix (config loopBranchPrefix, default
# "harness/"). That name is the one fact both rules read, and git holds it, not a marker file. At a
# detached HEAD, the branch that a stopped rebase or a running bisect goes back to counts as that
# name (rebase-merge/head-name, rebase-apply/head-name, BISECT_START; see Test-DfOnLoopBranch).
#
# Rule 11, loop-no-push (AUTO-11): nothing on the loop branch leaves the machine or lands on another
# branch by an agent's hand. The loop ends with a state card and the push command for the owner
# (AUTO-13, the runner's work, not this rule's). The git commands that move HEAD or a branch are an
# open-ended set: this rule reads the commands and forms listed under Covers, and a command or form
# that is not listed there is a residual, whatever it moves.
# Covers:
#  - On a loop branch: git push, merge and pull, whatever they name. git send-pack, the plumbing
#    under push, is read as a push here and below (check of the third review).
#  - From any branch (CR-2026-10-15-GAPS D1): a push, merge or pull that names a loop-prefixed ref;
#    push --all, --branches, --mirror or a glob refspec that covers a loop branch the repository holds.
#  - On a loop branch: a checkout or switch that leaves it (to another branch, a new branch without
#    the prefix, or a detached HEAD); a new loop-prefixed branch, a local loop-prefixed branch and a
#    checkout of files stay allowed. A target stays on the loop only when refs/heads holds it:
#    'harness/x~0', '^0' and '@{0}' detach HEAD and are refused. With --track and no new name, only
#    the name git makes counts: 'git checkout -t harness/x' makes the branch 'x' and is refused.
#    'git checkout -' stays only when the previous branch is still a local loop branch. A target of
#    HEAD or '@', or of the loop branch HEAD is on, stays.
#  - A rename, copy or forced move of a branch (git branch -m, -M, -c, -C, -f) and a ref written by
#    hand (git update-ref, a git symbolic-ref write or delete): on a loop branch whatever they name,
#    from any branch when they name a loop-prefixed ref (second review: 'git branch -M harness/x
#    main' took HEAD onto main with the loop's work, and the next push passed).
#  - On a loop branch: a git worktree add whose new worktree is not on a loop branch (a detached
#    worktree, another branch, a branch named after the folder): from that folder a push of the
#    loop's work passed (check of the second review).
#  - On a loop branch (third review): a git rebase that names a branch to check out that is not a
#    local loop branch (git rebase <upstream> <branch>, --onto <new> <upstream> <branch>, --root
#    <branch>); git bisect, except log, visualize, terms, help and a reset with no commit while no
#    bisect runs; a git fetch whose refspec writes a local branch, with '.' (this repository) as the
#    repository too, or whose refspecs come on standard input (--stdin). A rebase with no branch
#    argument, and a fetch into a remote-tracking ref, a tag or no destination, stay allowed.
#  - On a stopped rebase of a loop branch (check of the third review): the rules above, as on the
#    branch, and git rebase --quit, which leaves HEAD detached at the rebased loop commits;
#    --continue, --skip and --abort stay allowed. rebase --root, fetch --stdin and fetch --refmap
#    are read in any abbreviation git takes (--ro, --st, --refm).
#  - From any branch (third review): a git fetch whose destination is a loop-prefixed local branch,
#    or a glob that can cover one, or that writes a local branch from a loop ref or from a glob
#    source that can cover one ('refs/heads/*:refs/heads/copy/*').
# Workaround: the rule read only the branch that was checked out, so 'git checkout main'
# and then 'git push origin harness/x' or 'git merge harness/x' in a second call passed. The
# switch part also binds an interactive session that sits on a loop branch: the owner switches off
# it by hand.
# Cannot see:
#  - Any other git command or form that moves HEAD or a branch, for example on a loop branch git
#    stash branch <name>, a git clone of this repository at a commit (--revision), git rebase --exec
#    or an exec line in an interactive rebase (a command string git runs in a shell), and a long
#    option written as an abbreviation git accepts (--det for --detach), except the three named
#    under Covers; and the shell residual (nested shells, scripts on disk, git aliases).
#  - A loop commit named by a sha, a tag, FETCH_HEAD, @{u} or @{-1}; a detached HEAD at a loop
#    commit that is no loop branch here and no stopped rebase or running bisect of one.
#  - Off a loop branch: a checkout, switch, rebase or bisect that puts HEAD at a loop commit (git
#    checkout --detach harness/x, git checkout harness/x~0, git bisect start harness/x main); a
#    cherry-pick, rebase or reset that brings loop commits onto another branch, also from another
#    worktree; a move that names the loop's work only by a sha or on standard input (git branch -f
#    main <sha>, git update-ref --stdin, git fetch --stdin); a new branch, tag or worktree made at a
#    loop ref under another name (git branch <name> harness/x, git checkout -b <name> harness/x, git
#    switch -c, git tag, git worktree add -b or --detach).
#  - On a loop branch: a plain 'git branch <name>' or 'git tag <name>', and a fetch into a tag or a
#    remote-tracking ref, each of which makes a name at the loop's work and moves no branch (a
#    switch to it and a push of it here are refused, but a push of it from another worktree that
#    already exists and is not on a loop branch passes).
#  - A push whose refspec is ':' or comes from config (push.default matching, a remote.<name>.push
#    entry), and a fetch whose refspec comes from config (a remote.<name>.fetch entry).
#
# Rule 12, ledger (AUTO-04): on a loop branch, an Edit, Write or NotebookEdit to the story ledger
# (config loopLedgerGlobs, default docs/specs/*.tasks.json and specs/*.tasks.json) is refused. The
# harness writes the pass mark from the Reviewer's verdict with its own process, never through a
# tool call; a Builder or Reviewer that reaches for the ledger is making its own target easier.
# Cannot see: a Bash or PowerShell write to the ledger (a redirect, Set-Content, Copy-Item, a
# script); guard.ps1 never calls this rule for a shell command, and the case
# 'RESIDUAL ledger' in tools/tests/guard-cases.json asserts it is not denied. For that case the
# harness's hash compare and restore is the only check (instructions/autonomy-law.md, AUTO-04).
#
# anchor: loop-no-push  mode: deny  verbs: push
# anchor: ledger  mode: deny  verbs: write-passes

$script:DfDefaultLoopBranchPrefix = 'harness/'
$script:DfDefaultLoopLedgerGlobs  = @('docs/specs/*.tasks.json', 'specs/*.tasks.json')

function Get-DfCurrentBranch([string]$dir) {
    $d = Get-DfNearestExistingDir $dir
    if (-not $d) { return $null }
    $r = Invoke-DfGit $d @('rev-parse', '--abbrev-ref', 'HEAD')
    if ($r.code -ne 0 -or -not $r.out) { return $null }
    return ([string]($r.out | Select-Object -First 1)).Trim()
}

# The branch a stopped rebase or a running bisect goes back to, read from the git folder:
# rebase-merge/head-name or rebase-apply/head-name ('refs/heads/<name>'), or BISECT_START (the short
# name, or a sha when the bisect started at a detached HEAD). $null when none of them is there.
function Get-DfStoppedBranch([string]$dir) {
    $d = Get-DfNearestExistingDir $dir
    if (-not $d) { return $null }
    $r = Invoke-DfGit $d @('rev-parse', '--git-path', 'rebase-merge/head-name', '--git-path', 'rebase-apply/head-name', '--git-path', 'BISECT_START')
    if ($r.code -ne 0) { return $null }
    foreach ($p in @($r.out)) {
        $f = ConvertTo-DfFullPath ([string]$p) $d
        if (-not $f -or -not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
        $name = ([string](Get-Content -LiteralPath $f -TotalCount 1 -ErrorAction SilentlyContinue)).Trim() -creplace '^refs/heads/', ''
        if ($name) { return $name }
    }
    return $null
}

# The loop branch the repository is on, or $null. A detached HEAD counts as on a loop branch while a
# rebase or a bisect that started on that loop branch is stopped or running: HEAD then sits at the
# loop's work with no branch name. Workaround (check of the third review of CR-2026-10-15-GAPS): a
# plain 'git rebase main' on a loop branch, which stays allowed, stops at a detached HEAD on a
# conflict or an 'edit' line; the rule read no branch there, and 'git push origin HEAD:main',
# 'git checkout main' and 'git branch -f main HEAD' passed with the rebased loop commits.
function Test-DfOnLoopBranch([string]$dir, [string]$prefix) {
    if ([string]::IsNullOrWhiteSpace($prefix)) { $prefix = $script:DfDefaultLoopBranchPrefix }
    $b = Get-DfCurrentBranch $dir
    if (-not $b) { return $null }
    if ($b -ceq 'HEAD') { $b = Get-DfStoppedBranch $dir; if (-not $b) { return $null } }
    if ($b.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $b }
    return $null
}

function Test-DfLoopPrefixed([string]$name, [string]$prefix) {
    return ($name -and $name.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase))
}

# A checkout or switch target keeps HEAD on a loop branch only when it is the short name of a local
# branch that has the loop prefix. Workaround (CR-2026-10-15-GAPS review): the test was a prefix
# match on the whole revision, so 'git checkout harness/x~0' (also '^0' and '@{0}') detached HEAD
# and passed, and from the detached HEAD 'git push origin HEAD:main' passed too. A revision suffix
# (~ ^ @ :) or a name with no branch under refs/heads (a tag, a remote ref) leaves the branch.
function Test-DfLoopLocalBranch([string]$dir, [string]$name, [string]$prefix) {
    if (-not (Test-DfLoopPrefixed $name $prefix)) { return $false }
    if ($name -match '[~^@:]') { return $false }
    $d = Get-DfNearestExistingDir $dir
    if (-not $d) { return $false }
    return ((Invoke-DfGit $d @('show-ref', '--verify', '--quiet', ('refs/heads/' + $name))).code -eq 0)
}

# The branch names a typed ref can stand for: a leading '+' and each side of 'src:dst' are read,
# 'refs/heads/' or 'heads/' is stripped, 'refs/remotes/<r>/' or 'remotes/<r>/' is stripped, and
# '<r>/' is stripped when <r> is one of the repository's remotes. The typed form is kept as well,
# so a remote that happens to share the prefix's first word cannot hide a loop ref.
function Get-DfRefNames([string]$token, [string[]]$remotes) {
    $names = @()
    foreach ($side in ($token.TrimStart('+') -split ':')) {
        if (-not $side) { continue }
        $names += $side
        if ($side -match '^(refs/)?heads/(.+)$') { $names += $Matches[2] }
        elseif ($side -match '^(refs/)?remotes/[^/]+/(.+)$') { $names += $Matches[2] }
        elseif ($side -match '^([^/]+)/(.+)$' -and @($remotes | Where-Object { $_ -ceq $Matches[1] }).Count -gt 0) { $names += $Matches[2] }
    }
    return $names
}

# Options of push, merge and pull that take the next token as their value, so a value such as a
# merge message is never read as a ref.
$script:DfLoopValuedOptions = @('-o', '--push-option', '--server-option', '--receive-pack', '--exec', '--repo', '--upload-pack',
    '-m', '--message', '-F', '--file', '-s', '--strategy', '-X', '--strategy-option', '--into-name', '--cleanup',
    '--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '--negotiation-tip', '--refmap')

function New-DfLoopDeny([string]$what, [string]$title, [string]$owner) {
    $reason = ("BLOCKED - {0}. AUTO-11: the loop works on its own branch and never pushes and never merges; " +
               "it ends with a state card in HANDOFF.md and the exact push command (AUTO-13), and {1} runs that command after reading the branch. " +
               "A merge into or out of a loop branch is a push in another direction and is refused for the same reason, from any branch. " +
               "If this session is not a loop and the command is wanted, {1} runs it by hand.") -f $what, $owner
    return (New-DfDeny 'guard' $title $reason)
}

function Get-DfRemotes([string]$dir) {
    $d = Get-DfNearestExistingDir $dir
    if (-not $d) { return @() }
    $rr = Invoke-DfGit $d @('remote')
    if ($rr.code -ne 0) { return @() }
    return @($rr.out | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
}

# push (and send-pack), merge, pull: refused on a loop branch. From any branch, refused when they
# name a loop ref, or push every branch (--all, --branches, --mirror, a glob refspec) while a loop
# branch exists. For push, pull and send-pack the first positional is the repository.
function Test-DfLoopTransferRule($call, [string]$prefix, [string]$owner) {
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if ($branch) { return (New-DfLoopDeny ("git {0} on the loop branch {1}" -f $call.sub, $branch) ("loop branch: git {0} refused" -f $call.sub) $owner) }
    $a = @($call.args)
    # Positional arguments, values of options skipped. For push and pull the first one is the
    # repository, not a ref.
    $pos = @()
    for ($i = 0; $i -lt $a.Count; $i++) {
        $t = [string]$a[$i]
        if ($t -eq '--') { continue }
        if ($t -in $script:DfLoopValuedOptions) { $i++; continue }
        if ($t.StartsWith('-')) { continue }
        $pos += $t
    }
    if ($call.sub -in @('push', 'pull', 'send-pack') -and $pos.Count -gt 0) { $pos = @($pos | Select-Object -Skip 1) }
    if ($call.sub -in @('push', 'send-pack')) {
        $every = @($a | Where-Object { $_ -in @('--all', '--branches', '--mirror') }) | Select-Object -First 1
        $globs = @($pos | Where-Object { $_.Contains('*') })
        $d = Get-DfNearestExistingDir $call.cwd
        if (($every -or $globs.Count -gt 0) -and $d) {
            $refs = Invoke-DfGit $d @('for-each-ref', '--format=%(refname:short)', 'refs/heads/')
            if ($refs.code -eq 0) {
                foreach ($lb in @($refs.out | ForEach-Object { ([string]$_).Trim() } | Where-Object { Test-DfLoopPrefixed $_ $prefix })) {
                    if ($every) { return (New-DfLoopDeny ("git {0} {1} would push the loop branch {2} with the rest" -f $call.sub, $every, $lb) ("loop branch: git {0} {1} refused" -f $call.sub, $every) $owner) }
                    foreach ($g in $globs) {
                        $src = (($g.TrimStart('+') -split ':')[0]) -replace '^(refs/)?heads/', ''
                        if ($src -and $lb -like $src) { return (New-DfLoopDeny ("the refspec {0} would push the loop branch {1}" -f $g, $lb) 'loop branch: git push of a glob refspec refused' $owner) }
                    }
                }
            }
        }
    }
    if ($pos.Count -eq 0) { return $null }
    $remotes = if (@($pos | Where-Object { $_.Contains('/') }).Count -gt 0) { Get-DfRemotes $call.cwd } else { @() }
    foreach ($t in $pos) {
        foreach ($n in (Get-DfRefNames $t $remotes)) {
            if (Test-DfLoopPrefixed $n $prefix) {
                return (New-DfLoopDeny ("git {0} names the loop ref {1}" -f $call.sub, $t) ("loop branch: git {0} of {1} refused" -f $call.sub, $t) $owner)
            }
        }
    }
    return $null
}

# checkout, switch: on a loop branch, a call that leaves it is refused. A checkout of files (paths
# after a '--', a path that is not a ref, or a tree-ish followed by paths) is rule 7's business.
function Test-DfLoopSwitchRule($call, [string]$prefix, [string]$owner) {
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if (-not $branch) { return $null }
    $a = @($call.args)
    # Workaround (D1 check): any '--' used to end the rule, but 'git checkout main --' and
    # 'git checkout -b feature --' switch branches (the '--' only says the word before it is a
    # branch), and git switch takes no paths, so 'git switch -- main' switches too. Only a checkout
    # with paths after its '--' is a checkout of files.
    $after = @()
    $dd = -1
    for ($k = 0; $k -lt $a.Count; $k++) { if ([string]$a[$k] -eq '--') { $dd = $k; break } }
    if ($dd -ge 0) {
        if ($dd + 1 -lt $a.Count) { $after = @($a[($dd + 1)..($a.Count - 1)]) }
        if ($call.sub -eq 'checkout' -and $after.Count -gt 0) { return $null }
        $a = if ($dd -gt 0) { @($a[0..($dd - 1)]) } else { @() }
    }
    $createOpts = if ($call.sub -eq 'switch') { @('-c', '-C', '--create', '--force-create', '--orphan') } else { @('-b', '-B', '--orphan') }
    # The short letters that take a new branch name, case-sensitive, and the flag letters that may
    # come before one in a group ('-qb name'). Workaround (D1 check): git also reads the name stuck
    # to the letter ('-bfeature', '-cfeature'); that form was skipped as an option and left the
    # loop branch unseen.
    $createLetters = if ($call.sub -eq 'switch') { @('c', 'C') } else { @('b', 'B') }
    $flagLetters = @('q', 'f', 'm', 'l', 'p', 't', 'd')
    $new = $null; $detach = $false; $track = $false; $pos = @()
    for ($i = 0; $i -lt $a.Count; $i++) {
        $t = [string]$a[$i]
        if ($t -in $createOpts) { if ($i + 1 -lt $a.Count) { $new = [string]$a[$i + 1] }; $i++; continue }
        if ($t -match '^(--create|--force-create|--orphan)=(.+)$') { $new = $Matches[2]; continue }
        if ($t -eq '--detach' -or ($call.sub -eq 'switch' -and $t -ceq '-d')) { $detach = $true; continue }
        if ($t -in @('-t', '--track') -or $t -like '--track=*') { $track = $true; continue }
        if ($t.Length -gt 2 -and $t[0] -eq '-' -and $t[1] -ne '-') {
            # A short-option group: flags, then at most one create letter with its name stuck to it
            # or in the next token.
            for ($q = 1; $q -lt $t.Length; $q++) {
                $ch = [string]$t[$q]
                if ($ch -cin $createLetters) {
                    $rest = $t.Substring($q + 1)
                    if ($rest) { $new = $rest } elseif ($i + 1 -lt $a.Count) { $new = [string]$a[$i + 1]; $i++ }
                    break
                }
                if ($ch -cnotin $flagLetters) { break }
                if ($ch -ceq 't') { $track = $true }
                if ($ch -ceq 'd' -and $call.sub -eq 'switch') { $detach = $true }
            }
            continue
        }
        if ($t.StartsWith('-') -and $t -ne '-') { continue }
        $pos += $t
    }
    if ($call.sub -eq 'switch') { $pos += @($after | ForEach-Object { [string]$_ }) }
    $leave = $null
    if ($new) {
        if (-not (Test-DfLoopPrefixed $new $prefix)) { $leave = "git $($call.sub) makes the branch $new from the loop branch $branch, under a name this rule does not watch" }
    }
    elseif ($detach) { $leave = "git $($call.sub) --detach leaves the loop branch $branch for a detached HEAD" }
    elseif ($pos.Count -eq 1) {
        $target = $pos[0]
        if (-not $track -and ($target -ceq 'HEAD' -or $target -ceq '@' -or $target -ceq $branch)) {
            # HEAD (or '@', git's short name for it), or the loop branch HEAD is on, keeps HEAD where
            # it is: git special-cases HEAD and does not detach it. Workaround (CR-2026-10-15-GAPS
            # second review): 'HEAD' is not a loop-prefixed name, so 'git checkout HEAD', a no-op, was
            # refused as a switch off the loop. 'HEAD~0' and any other revision still detach and are
            # refused below.
        }
        elseif ($target -eq '-') {
            $prev = Invoke-DfGit $call.cwd @('rev-parse', '--abbrev-ref', '@{-1}')
            $name = if ($prev.code -eq 0 -and $prev.out) { ([string]($prev.out | Select-Object -First 1)).Trim() } else { '' }
            # The previous branch stays on the loop only as a local loop branch, as any other target.
            # Workaround (CR-2026-10-15-GAPS hooks check): a prefix test passed 'git checkout -' when
            # that branch was gone and a loop-prefixed tag of its name stood in its place; git then
            # checks out the tag and detaches HEAD.
            if (-not (Test-DfLoopLocalBranch $call.cwd $name $prefix)) { $leave = "git $($call.sub) - leaves the loop branch $branch for the previous branch $(if ($name) { $name } else { '(unknown)' })" }
        }
        else {
            if ($call.sub -eq 'checkout' -and (Invoke-DfGit $call.cwd @('rev-parse', '--verify', '--quiet', ($target + '^{commit}'))).code -ne 0) {
                $f = ConvertTo-DfFullPath $target $call.cwd
                if ($f -and (Test-Path -LiteralPath $f)) { return $null }   # a path that is not a ref: a checkout of files
            }
            # Only the short name of a local loop-prefixed branch keeps HEAD on a loop branch. A full
            # refname, a remote-tracking ref, a tag, a sha and a revision such as harness/x~0 detach
            # HEAD; a loop-prefixed name with no local branch is refused too.
            # With --track and no new name, git makes a new branch and names it itself: it drops a
            # leading 'refs/', then 'remotes/', then everything up to the first '/'. Only that name
            # counts. Workaround (CR-2026-10-15-GAPS hooks check): the local-branch test ran first
            # and the typed form was read as a name, so 'git checkout -t harness/x' passed, and git
            # made the branch 'x' at the loop commit, off the loop, with no remote needed.
            $made = $null
            if ($track) {
                $made = ($target -creplace '^refs/', '') -creplace '^remotes/', ''
                $cut = $made.IndexOf('/')
                $made = if ($cut -ge 0) { $made.Substring($cut + 1) } else { '' }
                $stays = [bool]($made -and $target -notmatch '[~^@:]' -and (Test-DfLoopPrefixed $made $prefix))
            }
            else { $stays = Test-DfLoopLocalBranch $call.cwd $target $prefix }
            if (-not $stays) {
                $leave = if ($track -and $made) { "git $($call.sub) --track $target makes the branch $made and leaves the loop branch $branch" } else { "git $($call.sub) $target leaves the loop branch $branch" }
            }
        }
    }
    if (-not $leave) { return $null }
    $reason = ("BLOCKED - {0}. AUTO-11: the loop stays on its own branch until {1} has read it. A switch off the loop branch is how a push " +
               "or a merge of the loop's work gets past this rule, so it is refused while the repository is on a loop branch. A new branch " +
               "that starts with the loop prefix, and a checkout of files, are allowed. If this session is not a loop, {1} switches by hand.") -f $leave, $owner
    return (New-DfDeny 'guard' ("loop branch: git {0} off the loop branch refused" -f $call.sub) $reason)
}

# branch -m/-M/-c/-C/-f, update-ref, symbolic-ref: each one renames, copies or moves a branch, or
# writes a ref by hand, with no checkout and no push for the rest of this rule to see. On a loop
# branch they are refused whatever they name; from any branch, when they name a loop-prefixed ref.
# Workaround (CR-2026-10-15-GAPS second review): 'git branch -M harness/x main' renamed the loop
# branch, HEAD went with it onto main, and 'git push origin main' passed in the next call; from main,
# 'git branch -f main harness/x' moved main to the loop's work. symbolic-ref is the same move:
# 'git symbolic-ref HEAD refs/heads/main' takes HEAD off the loop branch with no checkout.
# Long options of git branch that take the next token as their value (-u is read in its group).
$script:DfBranchValuedOptions = @('--set-upstream-to', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort')
function Test-DfLoopRefMoveRule($call, [string]$prefix, [string]$owner) {
    $a = @($call.args)
    $what = $null; $pos = @()
    switch ($call.sub) {
        'branch' {
            # The operation: -m/-M/--move, -c/-C/--copy, -f/--force; a delete (-d, -D, --delete)
            # moves nothing, also with --force. Short letters may be grouped ('-fm'); -u takes a value.
            $op = $null; $delete = $false
            for ($i = 0; $i -lt $a.Count; $i++) {
                $t = [string]$a[$i]
                if ($t -eq '--') { if ($i + 1 -lt $a.Count) { $pos += @($a[($i + 1)..($a.Count - 1)] | ForEach-Object { [string]$_ }) }; break }
                if ($t -in $script:DfBranchValuedOptions) { $i++; continue }
                if ($t -eq '--move') { $op = $t; continue }
                if ($t -eq '--copy') { $op = $t; continue }
                if ($t -eq '--force') { if (-not $op) { $op = $t }; continue }
                if ($t -eq '--delete') { $delete = $true; continue }
                if ($t.StartsWith('--')) { continue }
                if ($t.Length -ge 2 -and $t[0] -eq '-') {
                    for ($q = 1; $q -lt $t.Length; $q++) {
                        $ch = [string]$t[$q]
                        if ($ch -cin @('m', 'M', 'c', 'C')) { $op = '-' + $ch }
                        elseif ($ch -ceq 'f') { if (-not $op) { $op = '-f' } }
                        elseif ($ch -cin @('d', 'D')) { $delete = $true }
                        elseif ($ch -ceq 'u') { if ($q -eq $t.Length - 1) { $i++ }; break }   # -u <upstream> or -u<upstream>
                    }
                    continue
                }
                $pos += $t
            }
            if ($op -and -not $delete) { $what = "git branch $op" }
        }
        'update-ref' {
            # Every form writes or deletes a ref. The refs of --stdin come on standard input, which
            # this rule does not read: off a loop branch that form passes (the residual below).
            for ($i = 0; $i -lt $a.Count; $i++) {
                $t = [string]$a[$i]
                if ($t -eq '-m') { $i++; continue }
                if ($t.StartsWith('-')) { continue }
                $pos += $t
            }
            $what = 'git update-ref'
        }
        'symbolic-ref' {
            # A read ('git symbolic-ref HEAD', '--short HEAD') passes; a write (a name and a target)
            # or a delete (-d, --delete) is the move.
            $delete = $false
            for ($i = 0; $i -lt $a.Count; $i++) {
                $t = [string]$a[$i]
                if ($t -eq '-m') { $i++; continue }
                if ($t -in @('-d', '--delete')) { $delete = $true; continue }
                if ($t.StartsWith('-')) { continue }
                $pos += $t
            }
            if ($delete -or $pos.Count -ge 2) { $what = 'git symbolic-ref' + $(if ($delete) { ' --delete' } else { '' }) }
        }
    }
    if (-not $what) { return $null }
    $leave = $null
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if ($branch) { $leave = "$what on the loop branch $branch renames, copies or moves a branch, or writes a ref, with no checkout" }
    else {
        $remotes = if (@($pos | Where-Object { $_.Contains('/') }).Count -gt 0) { Get-DfRemotes $call.cwd } else { @() }
        foreach ($t in $pos) {
            if (@(Get-DfRefNames $t $remotes | Where-Object { Test-DfLoopPrefixed $_ $prefix }).Count -gt 0) { $leave = "$what names the loop ref $t"; break }
        }
    }
    if (-not $leave) { return $null }
    $reason = ("BLOCKED - {0}. AUTO-11: the loop's work stays on its own branch until {1} has read it. A branch rename, copy or forced " +
               "move, or a ref written by hand, carries that work under a name this rule does not watch, and a push of that name then passes; " +
               "so it is refused on a loop branch, and from any branch when it names a loop branch. If this session is not a loop, {1} runs it by hand.") -f $leave, $owner
    return (New-DfDeny 'guard' ("loop branch: {0} refused" -f $what) $reason)
}

# worktree add: on a loop branch, a new worktree is a checkout in another folder, and a worktree off
# the loop is where a push of the loop's work then passes, because that folder is on no loop branch.
# So it is refused unless the new worktree is on a loop branch: a new branch with the loop prefix
# (-b, -B), or a local loop branch named as its start. A detached worktree (--detach, HEAD, a sha, a
# tag), another branch, and the branch git names after the folder when no start is given are refused.
# Workaround (CR-2026-10-15-GAPS check of the second review): 'git worktree add --detach ../wt HEAD'
# and then 'git -C ../wt push origin HEAD:main' passed, two commands off the loop, the same shape as
# the rename the second review closed. Off a loop branch this part does not fire (the residual above).
function Test-DfLoopWorktreeRule($call, [string]$prefix, [string]$owner) {
    $a = @($call.args)
    if ($a.Count -eq 0 -or [string]$a[0] -ne 'add') { return $null }
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if (-not $branch) { return $null }
    $new = $null; $detach = $false; $pos = @()
    for ($i = 1; $i -lt $a.Count; $i++) {
        $t = [string]$a[$i]
        if ($t -eq '--') { if ($i + 1 -lt $a.Count) { $pos += @($a[($i + 1)..($a.Count - 1)] | ForEach-Object { [string]$_ }) }; break }
        if ($t -eq '--reason') { $i++; continue }                  # --lock --reason <string>
        if ($t -eq '--detach') { $detach = $true; continue }
        if ($t.StartsWith('--')) { continue }
        if ($t.Length -ge 2 -and $t[0] -eq '-') {
            # A short-option group: flags (-f, -q, -d), then at most one -b or -B with its name stuck
            # to it or in the next token.
            for ($q = 1; $q -lt $t.Length; $q++) {
                $ch = [string]$t[$q]
                if ($ch -cin @('b', 'B')) {
                    $rest = $t.Substring($q + 1)
                    if ($rest) { $new = $rest } elseif ($i + 1 -lt $a.Count) { $new = [string]$a[$i + 1]; $i++ }
                    break
                }
                if ($ch -ceq 'd') { $detach = $true }
            }
            continue
        }
        $pos += $t
    }
    if ($pos.Count -eq 0) { return $null }                        # no path: git refuses it
    $leave = $null
    if ($new) {
        if (-not (Test-DfLoopPrefixed $new $prefix)) { $leave = "git worktree add makes the branch $new from the loop branch $branch, in another folder, under a name this rule does not watch" }
    }
    elseif ($detach) { $leave = "git worktree add --detach checks out the loop branch $branch's work in another folder at a detached HEAD" }
    elseif ($pos.Count -ge 2) {
        if (-not (Test-DfLoopLocalBranch $call.cwd $pos[1] $prefix)) { $leave = "git worktree add $($pos[1]) checks out something other than a local loop branch in another folder" }
    }
    else {
        # No start: git names the branch after the folder and makes it at HEAD when it does not exist.
        $leaf = Split-Path -Leaf ($pos[0].TrimEnd('\', '/'))
        if (-not (Test-DfLoopPrefixed $leaf $prefix)) { $leave = "git worktree add $($pos[0]) makes or checks out the branch $leaf, in another folder, off the loop branch $branch" }
    }
    if (-not $leave) { return $null }
    $reason = ("BLOCKED - {0}. AUTO-11: the loop stays on its own branch until {1} has read it. A worktree off the loop branch is a switch " +
               "made in another folder, and a push of the loop's work from there passes, so it is refused while the repository is on a loop " +
               "branch. A worktree on a new branch that starts with the loop prefix, or on a local loop branch, is allowed. If this session is " +
               "not a loop, {1} adds the worktree by hand.") -f $leave, $owner
    return (New-DfDeny 'guard' 'loop branch: git worktree add off the loop branch refused' $reason)
}

# A long option as git reads it: its full name, or an abbreviation of at least $min letters, since
# git takes any unique prefix of a long option. $min is the shortest prefix that names only this
# option in git 2.56 (git rebase -h, git fetch -h); a shorter one is ambiguous, and git then refuses
# the command itself. Used only where a missed option turns a refusal into a pass: rebase --root,
# fetch --stdin and fetch --refmap. Workaround (check of the third review of CR-2026-10-15-GAPS):
# 'git rebase --ro main' checked out main, and 'echo HEAD:main | git fetch --st .' moved main onto
# the loop's work, because the rule matched the full names only.
function Test-DfLongOpt([string]$t, [string]$name, [int]$min) {
    $w = ($t -split '=', 2)[0]
    if (-not $w.StartsWith('--') -or $w.Length -lt 2 + $min) { return $false }
    return $name.StartsWith($w.Substring(2), [StringComparison]::Ordinal)
}

# The refusal for a command that takes HEAD off the loop branch with no checkout or switch of its own
# name (rebase with a branch, bisect).
function New-DfLoopLeaveDeny([string]$leave, [string]$title, [string]$owner) {
    $reason = ("BLOCKED - {0}. AUTO-11: the loop stays on its own branch until {1} has read it. A command that takes HEAD off the loop " +
               "branch is how a push or a merge of the loop's work gets past this rule (from a detached HEAD, 'git push origin HEAD:main' " +
               "names no loop branch), so it is refused while the repository is on a loop branch. If this session is not a loop, {1} runs it by hand.") -f $leave, $owner
    return (New-DfDeny 'guard' $title $reason)
}

# rebase: with a branch argument, git checks that branch out first and rebases it. On a loop branch,
# a rebase whose branch is not a local loop branch is refused; 'HEAD' and a sha are no branch to git,
# which then rebases at a detached HEAD. A rebase with no branch argument rebases the loop branch
# itself and stays allowed, whatever its upstream or --onto. Workaround (CR-2026-10-15-GAPS third
# review): 'git rebase HEAD main' put HEAD on main with the loop's work, and 'git push origin main'
# then passed. Every positional after the upstream is checked (all of them with --root), so a valued
# option this parser does not know shifts the words to a refusal, never to a pass. --root is read in
# any abbreviation git takes (--ro, --roo). On a stopped rebase of a loop branch (Test-DfOnLoopBranch),
# --quit is refused: it ends the rebase and leaves HEAD detached at the rebased loop commits, where
# the rule then reads no loop branch; --continue, --skip and --abort go on or go back to the branch.
# Options of git rebase that take the next token as their value.
$script:DfRebaseValuedOptions = @('--onto', '-x', '--exec', '-s', '--strategy', '-X', '--strategy-option', '-C', '--whitespace', '--empty', '--trailer')
function Test-DfLoopRebaseRule($call, [string]$prefix, [string]$owner) {
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if (-not $branch) { return $null }
    $a = @($call.args)
    if (@($a | Where-Object { [string]$_ -eq '--quit' }).Count -gt 0) {
        return (New-DfLoopLeaveDeny ("git rebase --quit ends the rebase of the loop branch {0} and leaves HEAD detached at its work" -f $branch) 'loop branch: git rebase --quit refused' $owner)
    }
    $root = $false; $pos = @()
    for ($i = 0; $i -lt $a.Count; $i++) {
        $t = [string]$a[$i]
        if ($t -eq '--') { if ($i + 1 -lt $a.Count) { $pos += @($a[($i + 1)..($a.Count - 1)] | ForEach-Object { [string]$_ }) }; break }
        if ($t -in $script:DfRebaseValuedOptions) { $i++; continue }
        if (Test-DfLongOpt $t 'root' 2) { $root = $true; continue }
        if ($t.StartsWith('--')) { continue }
        if ($t.Length -ge 2 -and $t[0] -eq '-') {
            # A short-option group: flags, then at most one valued letter. s, X, x and C take the rest
            # of the token or the next one; S and r take only a value stuck to them.
            for ($q = 1; $q -lt $t.Length; $q++) {
                $ch = [string]$t[$q]
                if ($ch -cin @('s', 'X', 'x', 'C')) { if ($q -eq $t.Length - 1) { $i++ }; break }
                if ($ch -cin @('S', 'r')) { break }
            }
            continue
        }
        $pos += $t
    }
    $named = if ($root) { @($pos) } elseif ($pos.Count -gt 1) { @($pos[1..($pos.Count - 1)]) } else { @() }
    foreach ($n in $named) {
        if (-not (Test-DfLoopLocalBranch $call.cwd $n $prefix)) {
            return (New-DfLoopLeaveDeny ("git rebase checks out {0} first and leaves the loop branch {1}" -f $n, $branch) 'loop branch: git rebase of another branch refused' $owner)
        }
    }
    return $null
}

# bisect: every subcommand that can check out a commit detaches HEAD. On a loop branch only the ones
# that move nothing pass: log, visualize (view), terms and help, and a reset with no commit while no
# bisect is running. Start, good, bad, new, old, skip, run, replay, a custom term and a reset that
# names a commit or ends a running bisect are refused. Workaround (CR-2026-10-15-GAPS third review):
# 'git bisect start HEAD main' detached HEAD at a loop commit, and 'git push origin HEAD:main' passed.
function Test-DfLoopBisectRule($call, [string]$prefix, [string]$owner) {
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if (-not $branch) { return $null }
    $a = @($call.args)
    if ($a.Count -eq 0) { return $null }                               # prints the usage
    $verb = [string]$a[0]
    if ($verb -in @('log', 'visualize', 'view', 'terms', 'help', '-h', '--help')) { return $null }
    if ($verb -eq 'reset' -and @($a | Select-Object -Skip 1 | Where-Object { -not ([string]$_).StartsWith('-') }).Count -eq 0) {
        $d = Get-DfNearestExistingDir $call.cwd
        $gp = Invoke-DfGit $d @('rev-parse', '--git-path', 'BISECT_START')
        $f = if ($gp.code -eq 0 -and $gp.out) { ConvertTo-DfFullPath ([string]($gp.out | Select-Object -First 1)) $d } else { $null }
        if ($f -and -not (Test-Path -LiteralPath $f)) { return $null }  # no bisect running: nothing to move
    }
    return (New-DfLoopLeaveDeny ("git bisect {0} on the loop branch {1} can move HEAD off it (to a commit at a detached HEAD, or to the branch a running bisect started on)" -f $verb, $branch) ("loop branch: git bisect {0} refused" -f $verb) $owner)
}

# fetch: a refspec with a destination writes that ref with no checkout, the same move as git branch -f.
# The rule reads a destination as git's get_local_ref does: 'refs/...' as it is; 'heads/x', 'tags/x'
# and 'remotes/x' under 'refs/'; any other name under 'refs/heads/', so 'main' is the local branch main.
# On a loop branch, a fetch whose destination is a local branch is refused, whatever the repository
# ('.' is this one). From any branch, a fetch whose destination is a loop-prefixed local branch (or a
# glob that can cover one), or that writes a local branch from a loop ref, is refused. A fetch into a
# remote-tracking ref or a tag, and a fetch with no destination, pass. Workaround (CR-2026-10-15-GAPS
# third review): 'git fetch . HEAD:main' moved main onto the loop's work, HEAD stayed on the loop
# branch, and a push of main from anywhere that is not on a loop branch then passed.
# Options of git fetch that take the next token as their value (--refmap is read separately).
$script:DfFetchValuedOptions = @('-o', '--server-option', '--upload-pack', '--depth', '--deepen', '--shallow-since', '--shallow-exclude',
    '-j', '--jobs', '--negotiation-tip', '--filter', '--submodule-prefix', '--recurse-submodules-default')
# A glob source refspec can cover a loop branch when its literal part (before the '*') is a start of
# 'refs/heads/', 'heads/', 'refs/remotes/' or 'remotes/' (it covers every branch), or, with that
# prefix or a remote's name stripped, starts with the loop prefix or is a start of it ('h*',
# 'refs/heads/*'). Workaround (check of the third review of CR-2026-10-15-GAPS): from main,
# 'git fetch . "refs/heads/*:refs/heads/copy/*"' made copy/harness/x at the loop's work, and
# 'git push origin copy/harness/x:main' then passed; only a source that named the loop ref was read.
function Test-DfGlobCoversLoop([string]$src, [string]$prefix, [string[]]$remotes) {
    if (-not $src -or -not $src.Contains('*')) { return $false }
    $lit = ($src -split '\*', 2)[0]
    foreach ($w in @('refs/heads/', 'heads/', 'refs/remotes/', 'remotes/')) { if ($w.StartsWith($lit, [StringComparison]::Ordinal)) { return $true } }
    $cands = @($lit)
    if ($lit -cmatch '^(refs/)?heads/(.*)$') { $cands += $Matches[2] }
    elseif ($lit -cmatch '^(refs/)?remotes/[^/]*$') { return $true }      # part of a remote's name: every remote branch
    elseif ($lit -cmatch '^(refs/)?remotes/[^/]+/(.*)$') { $cands += $Matches[2] }
    elseif ($lit -cmatch '^([^/]+)/(.*)$' -and @($remotes | Where-Object { $_ -ceq $Matches[1] }).Count -gt 0) { $cands += $Matches[2] }
    foreach ($c in $cands) {
        if ($c.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or $prefix.StartsWith($c, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}
function Get-DfFetchLocalBranch([string]$dst) {
    if (-not $dst) { return $null }
    if ($dst -cmatch '^refs/heads/(.+)$') { return $Matches[1] }
    if ($dst -cmatch '^refs/') { return $null }
    if ($dst -cmatch '^heads/(.+)$') { return $Matches[1] }
    if ($dst -cmatch '^(tags|remotes)/') { return $null }
    return $dst
}
function Test-DfLoopFetchRule($call, [string]$prefix, [string]$owner) {
    $a = @($call.args)
    $pos = @(); $maps = @(); $multiple = $false; $stdin = $false
    for ($i = 0; $i -lt $a.Count; $i++) {
        $t = [string]$a[$i]
        if ($t -eq '--') { if ($i + 1 -lt $a.Count) { $pos += @($a[($i + 1)..($a.Count - 1)] | ForEach-Object { [string]$_ }) }; break }
        # --refmap and --stdin in any abbreviation git takes (--refm, --st): see Test-DfLongOpt.
        if (Test-DfLongOpt $t 'refmap' 4) {
            if ($t.Contains('=')) { $maps += ($t -split '=', 2)[1] } elseif ($i + 1 -lt $a.Count) { $maps += [string]$a[$i + 1]; $i++ }
            continue
        }
        if ($t -in $script:DfFetchValuedOptions) { $i++; continue }
        if ($t -eq '--multiple') { $multiple = $true; continue }
        if (Test-DfLongOpt $t 'stdin' 2) { $stdin = $true; continue }
        if ($t.StartsWith('--')) { continue }
        if ($t.Length -ge 2 -and $t[0] -eq '-') {
            # A short-option group: flags (m is --multiple), then at most one j or o with its value.
            for ($q = 1; $q -lt $t.Length; $q++) {
                $ch = [string]$t[$q]
                if ($ch -cin @('j', 'o')) { if ($q -eq $t.Length - 1) { $i++ }; break }
                if ($ch -ceq 'm') { $multiple = $true }
            }
            continue
        }
        $pos += $t
    }
    # The first positional is the repository; with --multiple every positional is one.
    $specs = @()
    if (-not $multiple -and $pos.Count -gt 1) { $specs += @($pos[1..($pos.Count - 1)]) }
    $specs += $maps
    if (-not $stdin -and @($specs | Where-Object { ([string]$_).Contains(':') }).Count -eq 0) { return $null }   # no destination: no git call
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    $leave = $null
    if ($branch -and $stdin) { $leave = "git fetch --stdin on the loop branch $branch reads refspecs from standard input, which this rule does not see" }
    $remotes = $null
    foreach ($rs in $specs) {
        if ($leave) { break }
        $s = ([string]$rs).TrimStart('+')
        if ($s.StartsWith('^')) { continue }                            # a negative refspec writes nothing
        $cut = $s.IndexOf(':')
        if ($cut -lt 0) { continue }                                   # no destination: FETCH_HEAD only
        $src = $s.Substring(0, $cut)
        $local = Get-DfFetchLocalBranch $s.Substring($cut + 1)
        if (-not $local) { continue }
        if ($branch) { $leave = "git fetch $rs writes the local branch $local on the loop branch $branch, with no checkout"; break }
        $lit = ($local -split '\*', 2)[0]
        $covers = $local.Contains('*') -and ($lit.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or $prefix.StartsWith($lit, [StringComparison]::OrdinalIgnoreCase))
        if ((Test-DfLoopPrefixed $local $prefix) -or $covers) { $leave = "git fetch $rs writes the loop branch $local"; break }
        if ($src.Contains('/') -and $null -eq $remotes) { $remotes = Get-DfRemotes $call.cwd }
        if (@(Get-DfRefNames $src @($remotes) | Where-Object { Test-DfLoopPrefixed $_ $prefix }).Count -gt 0) { $leave = "git fetch $rs writes the local branch $local from the loop ref $src"; break }
        if (Test-DfGlobCoversLoop $src $prefix @($remotes)) { $leave = "git fetch $rs writes local branches from the glob $src, which can cover a loop branch"; break }
    }
    if (-not $leave) { return $null }
    $reason = ("BLOCKED - {0}. AUTO-11: the loop's work stays on its own branch until {1} has read it. A fetch into a local branch moves " +
               "that branch with no checkout, so on a loop branch it carries the loop's work under a name this rule does not watch, and a push " +
               "of that name then passes; from any branch, a fetch that writes a loop branch, or writes a local branch from a loop ref, is " +
               "refused for the same reason. A fetch into a remote-tracking ref (refs/remotes/...) and a fetch with no destination are allowed. " +
               "If this session is not a loop, {1} runs it by hand.") -f $leave, $owner
    return (New-DfDeny 'guard' 'loop branch: git fetch into a local branch refused' $reason)
}

function Test-DfLoopPushRule($call, [string]$prefix, [string]$owner) {
    if ($null -eq $call) { return $null }
    if ([string]::IsNullOrWhiteSpace($prefix)) { $prefix = $script:DfDefaultLoopBranchPrefix }
    # send-pack is the plumbing under push: 'git send-pack <repository> HEAD:refs/heads/main' pushes
    # with no push in the command. Workaround (check of the third review of CR-2026-10-15-GAPS): on a
    # loop branch it sent the loop's work to the remote in one call, and the rule did not read it.
    if ($call.sub -in @('push', 'merge', 'pull', 'send-pack')) { return (Test-DfLoopTransferRule $call $prefix $owner) }
    if ($call.sub -in @('checkout', 'switch')) { return (Test-DfLoopSwitchRule $call $prefix $owner) }
    if ($call.sub -in @('branch', 'update-ref', 'symbolic-ref')) { return (Test-DfLoopRefMoveRule $call $prefix $owner) }
    if ($call.sub -eq 'worktree') { return (Test-DfLoopWorktreeRule $call $prefix $owner) }
    if ($call.sub -eq 'rebase') { return (Test-DfLoopRebaseRule $call $prefix $owner) }
    if ($call.sub -eq 'bisect') { return (Test-DfLoopBisectRule $call $prefix $owner) }
    if ($call.sub -eq 'fetch') { return (Test-DfLoopFetchRule $call $prefix $owner) }
    return $null
}

function ConvertTo-DfGlobRegex([string]$glob) {
    $g = $glob -replace '\\', '/'
    $rx = [regex]::Escape($g) -replace '\\\*\\\*/', '(?:.*/)?' -replace '\\\*\\\*', '.*' -replace '\\\*', '[^/]*' -replace '\\\?', '[^/]'
    return ('^' + $rx + '$')
}

function Test-DfLedgerRule([string]$full, [string[]]$globs, [string]$prefix, [string]$owner) {
    if (-not $full) { return $null }
    if (-not $globs -or $globs.Count -eq 0) { $globs = $script:DfDefaultLoopLedgerGlobs }
    $root = Get-DfRepoRoot $full
    if (-not $root) { return $null }
    $rel = ($full.Substring($root.Length).TrimStart('\', '/')) -replace '\\', '/'
    $hit = $null
    foreach ($g in $globs) { if ($rel -match (ConvertTo-DfGlobRegex $g)) { $hit = $g; break } }
    if (-not $hit) { return $null }
    $branch = Test-DfOnLoopBranch $root $prefix
    if (-not $branch) { return $null }
    $reason = ("BLOCKED - {0} is the story ledger ({1}) and this repository is on the loop branch {2}. AUTO-04: only the Reviewer's verdict writes the pass mark, " +
               "and the harness writes it from that verdict with its own process; a Builder that edits the ledger voids its own attempt. " +
               "Change a story's acceptance criteria with {3}, off the loop branch, as a Change Request.") -f $rel, $hit, $branch, $owner
    return (New-DfDeny 'guard' 'loop branch: ledger edit refused' $reason)
}
