# cases-bypass.ps1 - hook self-test cases for the four bypasses closed by CR-2026-10-15-GAPS D1.
# Dot-sourced by run.ps1. It reads these names from run.ps1's scope: $T, $TFWD, $TMSYS, $root,
# $repoClean, $kit, NewRepo, RunGit, Put, Record, Classify and Invoke-Hook. Never run directly.
#
# Each block names the clause it holds and the everyday form that used to pass:
#   SAFE-01 / VCS-07  rules 1, 2 and 4 read the folder after a cd ('cd <repo> && git add -A').
#   AUTO-11           a push, merge or pull naming a loop ref from any branch; push --all, --mirror
#                     or a glob refspec carrying a loop branch; a switch off a loop branch.
#   GATE-03           the install ask rules cover the common install verbs, as Bash and PowerShell twins.
#   GATE-11           a Write that drops assertions from a measuring file is compared like an Edit.
# Every deny case here was an allow before the fix, so each one fails if its fix is reverted. The
# two 'target unresolved' cases are the exception: they were denied before D1 too, and they fail
# if guard.ps1 follows a cd to a folder that does not exist.
#
# The final review of CR-2026-10-15-GAPS added three more blocks: a revision or tag that starts with
# the loop prefix (AUTO-11), a pathspec with magic (SAFE-01), and the fence's false positives on a
# measuring path, a multiply by 0.5 and a '.expect(' method call (GATE-11). In the GATE-11 block the
# allow cases are the fix; its deny cases were denied before too and hold the other side. The check
# of those fixes added the --track and 'checkout -' cases to the AUTO-11 block: 'git checkout -t
# harness/x' makes the branch 'x' off the loop, and the local-branch test had passed it; 'git
# checkout -' to a loop name that is now a tag detaches HEAD, and a prefix test had passed it.
# The second review added two more: AUTO-11 for a rename, copy or move of a branch (git branch
# -m/-M/-c/-C/-f, update-ref, symbolic-ref) and a checkout of HEAD that stays; GATE-11 for a C block
# comment that starts with a zero, which is not a zero term. The check of those fixes added AUTO-11
# for a git worktree add off the loop branch, and twins in the other shell for forms that had one.
# The third review added AUTO-11 for a rebase that names a branch, git bisect and a fetch into a local
# branch, and rule 4 for a frozen path spelled with a \\?\ prefix or through this machine's admin share.
# The check of those fixes added AUTO-11 for a rebase stopped at a detached HEAD (and a bisect started on
# a loop branch), an abbreviated --root, --stdin or --refmap, a fetch from a glob source that covers a
# loop branch and git send-pack, and rule 4 for a PowerShell provider path (FileSystem::).

function BpRun([string]$hook, [string]$tool, $ti, [string]$cwd) {
    $stdin = @{ session_id = 'bp'; cwd = $cwd; hook_event_name = 'PreToolUse'; tool_name = $tool; tool_input = $ti } | ConvertTo-Json -Compress -Depth 5
    return (Invoke-Hook $hook $stdin)
}
function BpGot($r, [string]$expect, [string]$contains) {
    if ($r.code -ne 0) { return "exit$($r.code)" }
    $g = Classify $r.out
    if ($g -eq $expect -and $contains -and ($r.out -notlike "*$contains*")) { return "missing-text:$contains" }
    return $g
}
function BpShell([string]$name, [string]$tool, [string]$cmd, [string]$cwd, [string]$expect, [string]$contains) {
    $r = BpRun 'guard.ps1' $tool @{ command = $cmd } $cwd
    Record $name $expect (BpGot $r $expect $contains) $r.out
}
function BpWrite([string]$name, [string]$path, [string]$content, [string]$expect, [string]$contains) {
    $r = BpRun 'fence.ps1' 'Write' @{ file_path = $path; content = $content } $root
    Record $name $expect (BpGot $r $expect $contains) $r.out
}

$bpOutside = Join-Path $T 'outside'

# ------------------------------------------------------------------ SAFE-01 / VCS-07: a cd before git
Write-Host '-- bypass D1: SAFE-01 / VCS-07, the folder after a cd'
$bpSecret = NewRepo 'repo-bp-secret'
Put (Join-Path $bpSecret 'README.md') 'bp'
RunGit $bpSecret @('add', '-A'); RunGit $bpSecret @('commit', '-q', '-m', 'init')
Put (Join-Path $bpSecret 'secret.key') 'not-a-real-key'   # untracked and not ignored
$bpSecretFwd = $bpSecret -replace '\\', '/'
$bpSecretMsys = "$TMSYS/root/repo-bp-secret"

BpShell 'bypass SAFE-01: cd <repo> && git add -A stages an untracked secret.key -> denied' 'Bash' "cd $bpSecretFwd && git add -A" $bpOutside 'deny' 'secret.key'
BpShell 'bypass SAFE-01: cd <repo> && git add . -> denied' 'Bash' "cd $bpSecretFwd && git add ." $bpOutside 'deny' 'secret.key'
BpShell 'bypass SAFE-01: cd /c/... (Git Bash form) && git add -A -> denied' 'Bash' "cd $bpSecretMsys && git add -A" $bpOutside 'deny'
BpShell 'bypass SAFE-01: pushd <repo> && git add --all -> denied' 'Bash' "pushd $bpSecretFwd && git add --all" $bpOutside 'deny'
BpShell 'bypass SAFE-01: Set-Location <repo>; git add -A (PowerShell) -> denied' 'PowerShell' "Set-Location $bpSecret; git add -A" $bpOutside 'deny'
BpShell 'bypass SAFE-01: cd <clean repo> && git add -A -> allowed (no secret there)' 'Bash' ("cd " + ($repoClean -replace '\\', '/') + " && git add -A") $bpOutside 'allow'
# A cd target the hook cannot resolve is not followed: the probe stays in the tool call's folder.
# Followed, it named no folder, the probe failed, and these staged the secret (D1 check).
BpShell 'bypass SAFE-01: cd "$(git rev-parse --show-toplevel)" && git add -A (target unresolved) -> denied' 'Bash' 'cd "$(git rev-parse --show-toplevel)" && git add -A' $bpSecret 'deny' 'secret.key'
BpShell 'bypass SAFE-01: Set-Location $env:REPO; git add -A (target unresolved, PowerShell) -> denied' 'PowerShell' 'Set-Location $env:REPO; git add -A' $bpSecret 'deny' 'secret.key'

# A pathspec with magic (final review of CR-2026-10-15-GAPS): ':/' and ':(top)' are neither a
# wildcard nor a folder, so they were never probed and staged the untracked secret.key. git reads the
# magic in the probe, from the call's folder, so a sub-folder reaches the whole tree as git add does.
$bpSecretSub = Join-Path $bpSecret 'sub'
Put (Join-Path $bpSecretSub 'keep.txt') 'k'
BpShell "bypass SAFE-01: git add :/ (pathspec magic, the whole tree) -> denied" 'Bash' 'git add :/' $bpSecret 'deny' 'secret.key'
BpShell "bypass SAFE-01: git add ':(top)' from a sub-folder -> denied" 'Bash' "git add ':(top)'" $bpSecretSub 'deny' 'secret.key'
BpShell "bypass SAFE-01: git add ':/' from a sub-folder (PowerShell) -> denied" 'PowerShell' "git add ':/'" $bpSecretSub 'deny' 'secret.key'
BpShell "bypass SAFE-01: git add ':(glob)sub/*.txt' covers no secret -> allowed" 'Bash' "git add ':(glob)sub/*.txt'" $bpSecret 'allow'
BpShell 'bypass SAFE-01: git add :/ in a repository with no untracked secret -> allowed' 'Bash' 'git add :/' $repoClean 'allow'

# Rule 4 after a cd: a relative path is read in the folder the cd leads to.
BpShell 'bypass rule 4: cd <root> && rm frozen/x.py -> denied (frozen path)' 'Bash' ("cd " + ($root -replace '\\', '/') + " && rm frozen/x.py") $bpOutside 'deny' 'FROZEN'
BpShell 'bypass rule 4: Set-Location <root>; Remove-Item frozen\x.py -> denied' 'PowerShell' "Set-Location $root; Remove-Item frozen\x.py" $bpOutside 'deny'

# Rule 4 by another spelling of the same folder (third review of CR-2026-10-15-GAPS): GetFullPath keeps
# a \\?\ or \\.\ prefix and an admin share of this machine as they are, so the string compare saw
# another folder and these writes passed. Each deny case was an allow before. The TOMBSTONE.md and
# ordinary-folder allow cases hold the other side: the mapping keeps the tombstone record writable
# and finds no frozen folder where there is none.
Write-Host '-- bypass review: rule 4, a frozen path by another spelling'
function BpGuardFile([string]$name, [string]$tool, $ti, [string]$expect, [string]$contains) {
    $r = BpRun 'guard.ps1' $tool $ti $root
    Record $name $expect (BpGot $r $expect $contains) $r.out
}
$bpDrive = $root.Substring(0, 1)
$bpRest = $root.Substring(3)                                   # the root after 'C:\'
$bpLong = '\\?\' + $root
$bpShare = '\\localhost\' + $bpDrive + '$\' + $bpRest
BpGuardFile 'bypass rule 4: Write \\?\<root>\frozen\x.py -> denied' 'Write' @{ file_path = "$bpLong\frozen\x.py"; content = 'x = 2' } 'deny' 'FROZEN'
BpGuardFile 'bypass rule 4: Edit \\.\<root>\frozen\x.py -> denied' 'Edit' @{ file_path = ('\\.\' + $root + '\frozen\x.py'); old_string = 'x = 1'; new_string = 'x = 2' } 'deny' 'FROZEN'
BpGuardFile 'bypass rule 4: Write \\?\UNC\localhost\C$\...\frozen\x.py -> denied' 'Write' @{ file_path = ('\\?\UNC\localhost\' + $bpDrive + '$\' + $bpRest + '\frozen\x.py'); content = 'x = 2' } 'deny' 'FROZEN'
BpGuardFile 'bypass rule 4: Write \\localhost\C$\...\tomb\new.md -> denied (tombstoned)' 'Write' @{ file_path = "$bpShare\tomb\new.md"; content = 'n' } 'deny' 'FROZEN'
BpGuardFile 'bypass rule 4: Edit \\127.0.0.1\C$\...\frozen\x.py -> denied' 'Edit' @{ file_path = ('\\127.0.0.1\' + $bpDrive + '$\' + $bpRest + '\frozen\x.py'); old_string = 'x = 1'; new_string = 'x = 2' } 'deny' 'FROZEN'
BpGuardFile 'bypass rule 4: Write //?/C:/.../frozen/x.py (forward slashes) -> denied' 'Write' @{ file_path = ("$bpLong\frozen\x.py" -replace '\\', '/'); content = 'x = 2' } 'deny' 'FROZEN'
BpShell 'bypass rule 4: Remove-Item ''\\?\<root>\frozen\x.py'' (PowerShell) -> denied' 'PowerShell' "Remove-Item '$bpLong\frozen\x.py'" $bpOutside 'deny' 'FROZEN'
BpShell 'bypass rule 4: rm ''//localhost/C$/.../frozen/x.py'' (Bash) -> denied' 'Bash' ("rm '" + ("$bpShare\frozen\x.py" -replace '\\', '/') + "'") $bpOutside 'deny' 'FROZEN'
BpGuardFile 'bypass rule 4: Write \\?\<root>\tomb\TOMBSTONE.md -> allowed (the tombstone record)' 'Write' @{ file_path = "$bpLong\tomb\TOMBSTONE.md"; content = '# Tombstone' } 'allow'
BpGuardFile 'bypass rule 4: Write \\localhost\C$\...\ordinary\bp_share.txt -> allowed (not frozen)' 'Write' @{ file_path = "$bpShare\ordinary\bp_share.txt"; content = 'ok' } 'allow'
# A PowerShell provider path names the same file to Remove-Item (check of the third review): it was read
# as a relative path under the call's folder and passed. The ordinary-folder case holds the other side.
BpShell 'bypass rule 4: Remove-Item ''FileSystem::<root>\frozen\x.py'' (PowerShell) -> denied' 'PowerShell' "Remove-Item 'FileSystem::$root\frozen\x.py'" $bpOutside 'deny' 'FROZEN'
BpShell 'bypass rule 4: Remove-Item -LiteralPath ''Microsoft.PowerShell.Core\FileSystem::<root>\tomb\x.md'' -> denied' 'PowerShell' "Remove-Item -LiteralPath 'Microsoft.PowerShell.Core\FileSystem::$root\tomb\x.md'" $bpOutside 'deny' 'FROZEN'
BpShell 'bypass rule 4: Remove-Item ''FileSystem::<root>\ordinary\bp_fs.txt'' -> allowed (not frozen)' 'PowerShell' "Remove-Item 'FileSystem::$root\ordinary\bp_fs.txt'" $bpOutside 'allow'
# The written residual (hooks/guard.ps1 header): the shell form skips a token that starts with '-', so a
# value joined to its parameter by a colon is not read. Asserted as NOT denied, so nobody believes otherwise.
BpShell 'RESIDUAL rule 4: Remove-Item -LiteralPath:<root>\frozen\x.py (value joined by a colon) -> not denied' 'PowerShell' "Remove-Item -LiteralPath:$root\frozen\x.py" $bpOutside 'allow'

# ------------------------------------------------------------------ AUTO-11: loop refs from any branch
Write-Host '-- bypass D1: AUTO-11, a loop ref named from any branch'
$bpMain = NewRepo 'repo-bp-main'
Put (Join-Path $bpMain 'src\app.py') 'print(9)'
Put (Join-Path $bpMain 'DECISIONS.md') '# decisions'
RunGit $bpMain @('add', '-A'); RunGit $bpMain @('commit', '-q', '-m', 'init')
RunGit $bpMain @('branch', 'harness/x')
RunGit $bpMain @('branch', 'feature')
RunGit $bpMain @('remote', 'add', 'origin', (Join-Path $T 'bp-remote.git'))

BpShell 'bypass AUTO-11: on main, git push origin harness/x -> denied' 'Bash' 'git push origin harness/x' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git push origin harness/x (PowerShell) -> denied' 'PowerShell' 'git push origin harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git push -u origin HEAD:harness/x -> denied' 'Bash' 'git push -u origin HEAD:harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: git push origin refs/heads/harness/x:refs/heads/main -> denied' 'Bash' 'git push origin refs/heads/harness/x:refs/heads/main' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git merge harness/x -> denied' 'Bash' 'git merge harness/x' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: git merge --no-ff -m msg origin/harness/x (remote ref) -> denied' 'Bash' 'git merge --no-ff -m "take it" origin/harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git pull origin harness/x -> denied' 'Bash' 'git pull --rebase origin harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: cd <repo> && git merge harness/x -> denied' 'Bash' ("cd " + ($bpMain -replace '\\', '/') + " && git merge harness/x") $bpOutside 'deny'
BpShell 'bypass AUTO-11: git push --all origin with a loop branch present -> denied' 'Bash' 'git push --all origin' $bpMain 'deny' 'harness/x'
BpShell 'bypass AUTO-11: git push --mirror origin with a loop branch present -> denied' 'Bash' 'git push --mirror origin' $bpMain 'deny'
BpShell 'bypass AUTO-11: git push origin "refs/heads/*:refs/heads/*" (glob) -> denied' 'Bash' 'git push origin "refs/heads/*:refs/heads/*"' $bpMain 'deny'
BpShell 'bypass AUTO-11: git push origin main -> allowed' 'Bash' 'git push origin main' $bpMain 'allow'
BpShell 'bypass AUTO-11: git merge feature -> allowed' 'Bash' 'git merge feature' $bpMain 'allow'
BpShell 'bypass AUTO-11: a merge message that names the prefix is not a ref -> allowed' 'Bash' 'git merge -m harness/x feature' $bpMain 'allow'
BpShell 'bypass AUTO-11: git push origin feature/harness/x (prefix inside) -> allowed' 'Bash' 'git push origin feature/harness/x' $bpMain 'allow'
BpShell 'bypass AUTO-11: git push "refs/heads/feature*" glob misses the loop branch -> allowed' 'Bash' 'git push origin "refs/heads/feature*"' $bpMain 'allow'
BpShell 'bypass AUTO-11: git push --all origin with no loop branch -> allowed' 'Bash' 'git push --all origin' $repoClean 'allow'

# ------------------------------------------------------------------ AUTO-11: a switch off the loop branch
Write-Host '-- bypass D1: AUTO-11, a switch off the loop branch'
$bpLoop = NewRepo 'repo-bp-loop'
Put (Join-Path $bpLoop 'src\core.py') 'print(10)'
Put (Join-Path $bpLoop 'DECISIONS.md') '# decisions'
RunGit $bpLoop @('add', '-A'); RunGit $bpLoop @('commit', '-q', '-m', 'init')
RunGit $bpLoop @('checkout', '-q', '-b', 'harness/chunk-1')

BpShell 'bypass AUTO-11: on a loop branch, git checkout main -> denied' 'Bash' 'git checkout main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git switch main -> denied' 'Bash' 'git switch main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git switch main (PowerShell) -> denied' 'PowerShell' 'git switch main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout - (back to main) -> denied' 'Bash' 'git checkout -' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -b feature -> denied' 'Bash' 'git checkout -b feature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git switch -c feature -> denied' 'Bash' 'git switch -c feature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout --detach -> denied' 'Bash' 'git checkout --detach' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -b harness/chunk-2 -> allowed' 'Bash' 'git checkout -b harness/chunk-2' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git switch harness/chunk-1 -> allowed' 'Bash' 'git switch harness/chunk-1' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git checkout src/core.py (files, clean tree) -> allowed' 'Bash' 'git checkout src/core.py' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git checkout main -- src/core.py (files) -> allowed' 'Bash' 'git checkout main -- src/core.py' $bpLoop 'allow'
BpShell 'bypass AUTO-11: off a loop branch, git checkout feature -> allowed' 'Bash' 'git checkout feature' $bpMain 'allow'
# A '--' with no paths after it, and a new name stuck to its option, still switch (D1 check).
BpShell 'bypass AUTO-11: on a loop branch, git checkout main -- (no paths) -> denied' 'Bash' 'git checkout main --' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git switch -- main -> denied' 'Bash' 'git switch -- main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -b feature -- -> denied' 'Bash' 'git checkout -b feature --' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -bfeature (stuck name) -> denied' 'Bash' 'git checkout -bfeature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git switch -cfeature (stuck name) -> denied' 'Bash' 'git switch -cfeature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -qbharness/chunk-3 (stuck loop name) -> allowed' 'Bash' 'git checkout -qbharness/chunk-3' $bpLoop 'allow'
# A revision that starts with the loop prefix is not a loop branch (final review of CR-2026-10-15-GAPS):
# the test was a prefix match on the whole revision, so these detached HEAD and were allowed, and
# from the detached HEAD 'git push origin HEAD:main' passed. A target stays only when refs/heads holds it.
RunGit $bpLoop @('branch', 'harness/chunk-0')
RunGit $bpLoop @('tag', 'harness/tag-1')
BpShell 'bypass AUTO-11: on a loop branch, git checkout harness/chunk-1~0 (detaches) -> denied' 'Bash' 'git checkout harness/chunk-1~0' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git checkout harness/chunk-1^0 (detaches) -> denied' 'Bash' 'git checkout harness/chunk-1^0' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git checkout harness/chunk-1@{0} (detaches) -> denied' 'Bash' 'git checkout harness/chunk-1@{0}' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git checkout harness/chunk-1~0 (PowerShell) -> denied' 'PowerShell' 'git checkout harness/chunk-1~0' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout of a loop-prefixed tag (detaches) -> denied' 'Bash' 'git checkout harness/tag-1' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git switch harness/ghost (no local branch) -> denied' 'Bash' 'git switch harness/ghost' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout harness/chunk-0 (another local loop branch) -> allowed' 'Bash' 'git checkout harness/chunk-0' $bpLoop 'allow'
# With --track and no new name, git names the new branch itself: it drops 'refs/', 'remotes/' and
# everything up to the first '/', so '-t harness/chunk-0' makes 'chunk-0' at the loop commit, off the
# loop, with no remote needed. The local-branch test passed it (hooks check of the review fixes).
BpShell 'bypass AUTO-11: on a loop branch, git checkout -t harness/chunk-0 (makes chunk-0) -> denied' 'Bash' 'git checkout -t harness/chunk-0' $bpLoop 'deny' 'makes the branch chunk-0'
BpShell 'bypass AUTO-11: on a loop branch, git switch --track harness/chunk-1 (makes chunk-1) -> denied' 'Bash' 'git switch --track harness/chunk-1' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -qt harness/chunk-0 (PowerShell) -> denied' 'PowerShell' 'git checkout -qt harness/chunk-0' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git checkout -t origin/harness/chunk-9 (makes harness/chunk-9) -> allowed' 'Bash' 'git checkout -t origin/harness/chunk-9' $bpLoop 'allow'
# 'git checkout -' goes to the previous branch by name. When that loop branch is gone and a tag has
# its name, git checks out the tag and detaches HEAD; a prefix test on the name passed it.
RunGit $bpLoop @('checkout', '-q', '-b', 'harness/tmp-1'); RunGit $bpLoop @('checkout', '-q', 'harness/chunk-1')
RunGit $bpLoop @('branch', '-q', '-D', 'harness/tmp-1'); RunGit $bpLoop @('tag', 'harness/tmp-1')
BpShell 'bypass AUTO-11: on a loop branch, git checkout - to a loop name that is now a tag -> denied' 'Bash' 'git checkout -' $bpLoop 'deny' 'harness/tmp-1'
RunGit $bpLoop @('checkout', '-q', 'harness/chunk-0'); RunGit $bpLoop @('checkout', '-q', 'harness/chunk-1')
BpShell 'bypass AUTO-11: on a loop branch, git checkout - to a local loop branch -> allowed' 'Bash' 'git checkout -' $bpLoop 'allow'

# ------------------------------------------------------------------ AUTO-11: a rename, copy or move of a branch
# Second review of CR-2026-10-15-GAPS: 'git branch -M harness/x main' renamed the loop branch, HEAD
# went with it onto main, and 'git push origin main' passed in the next call; from main, 'git branch
# -f main harness/x' moved main to the loop's work. On a loop branch git branch -m/-M/-c/-C/-f,
# update-ref and a symbolic-ref write are refused whatever they name; from any branch, when they name
# a loop ref. Each deny case was an allow before, except 'git checkout HEAD~0', which holds the
# other side of the next fix. The allow cases hold the other side too: a list, a read, a delete and a
# move that names no loop ref. The 'git checkout HEAD' and 'git checkout @' cases are a fix of their
# own: HEAD stays where it is, and the rule refused it as a switch off the loop.
Write-Host '-- bypass review: AUTO-11, a rename, copy or move of a branch'
BpShell 'bypass AUTO-11: on a loop branch, git branch -M harness/chunk-1 main (rename) -> denied' 'Bash' 'git branch -M harness/chunk-1 main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git branch -M harness/chunk-1 main (PowerShell) -> denied' 'PowerShell' 'git branch -M harness/chunk-1 main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git branch -m main (rename the current branch) -> denied' 'Bash' 'git branch -m main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch --move main -> denied' 'Bash' 'git branch --move main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -m main (PowerShell) -> denied' 'PowerShell' 'git branch -m main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -c feature (copy) -> denied' 'Bash' 'git branch -c feature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -C harness/chunk-1 feature (PowerShell) -> denied' 'PowerShell' 'git branch -C harness/chunk-1 feature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -f main HEAD (forced move) -> denied' 'Bash' 'git branch -f main HEAD' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git branch -f main HEAD (PowerShell) -> denied' 'PowerShell' 'git branch -f main HEAD' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -fm main (grouped letters) -> denied' 'Bash' 'git branch -fm main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git update-ref refs/heads/main HEAD -> denied' 'Bash' 'git update-ref refs/heads/main HEAD' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git update-ref refs/heads/main HEAD (PowerShell) -> denied' 'PowerShell' 'git update-ref refs/heads/main HEAD' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git symbolic-ref HEAD refs/heads/main -> denied' 'Bash' 'git symbolic-ref HEAD refs/heads/main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git symbolic-ref HEAD refs/heads/main (PowerShell) -> denied' 'PowerShell' 'git symbolic-ref HEAD refs/heads/main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch (a list) -> allowed' 'Bash' 'git branch' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git branch --show-current (PowerShell) -> allowed' 'PowerShell' 'git branch --show-current' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git symbolic-ref --short HEAD (a read) -> allowed' 'Bash' 'git symbolic-ref --short HEAD' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git branch -d main (a delete moves nothing) -> allowed' 'Bash' 'git branch -d main' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git checkout HEAD (stays) -> allowed' 'Bash' 'git checkout HEAD' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git checkout HEAD (stays, PowerShell) -> allowed' 'PowerShell' 'git checkout HEAD' $bpLoop 'allow'
BpShell "bypass AUTO-11: on a loop branch, git checkout @ (git's short name for HEAD, stays) -> allowed" 'Bash' 'git checkout @' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git checkout harness/chunk-1 (the branch HEAD is on, PowerShell) -> allowed' 'PowerShell' 'git checkout harness/chunk-1' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git checkout HEAD~0 (detaches) -> denied' 'Bash' 'git checkout HEAD~0' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git branch -M harness/x main -> denied' 'Bash' 'git branch -M harness/x main' $bpMain 'deny' 'harness/x'
BpShell 'bypass AUTO-11: on main, git branch -M harness/x main (PowerShell) -> denied' 'PowerShell' 'git branch -M harness/x main' $bpMain 'deny' 'harness/x'
BpShell 'bypass AUTO-11: on main, git branch -f main harness/x -> denied' 'Bash' 'git branch -f main harness/x' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git branch -f main harness/x (PowerShell) -> denied' 'PowerShell' 'git branch -f main harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git branch -f main origin/harness/x (remote ref) -> denied' 'Bash' 'git branch -f main origin/harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git branch -c harness/x copy -> denied' 'Bash' 'git branch -c harness/x copy' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git update-ref refs/heads/main refs/heads/harness/x -> denied' 'Bash' 'git update-ref refs/heads/main refs/heads/harness/x' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git update-ref refs/heads/main harness/x (PowerShell) -> denied' 'PowerShell' 'git update-ref refs/heads/main harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git symbolic-ref refs/heads/main refs/heads/harness/x -> denied' 'Bash' 'git symbolic-ref refs/heads/main refs/heads/harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git symbolic-ref refs/heads/main refs/heads/harness/x (PowerShell) -> denied' 'PowerShell' 'git symbolic-ref refs/heads/main refs/heads/harness/x' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git branch -m feature feature2 (no loop ref) -> allowed' 'Bash' 'git branch -m feature feature2' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git branch -f feature main (no loop ref, PowerShell) -> allowed' 'PowerShell' 'git branch -f feature main' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git update-ref -m with a reason that names the prefix -> allowed' 'Bash' 'git update-ref -m "harness/x note" refs/heads/feature HEAD' $bpMain 'allow'
# Twins in the other shell for forms above that had one shell only (check of the second review).
BpShell 'bypass AUTO-11: on a loop branch, git branch --move main (PowerShell) -> denied' 'PowerShell' 'git branch --move main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -c feature (copy, PowerShell) -> denied' 'PowerShell' 'git branch -c feature' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git branch -C harness/chunk-1 feature -> denied' 'Bash' 'git branch -C harness/chunk-1 feature' $bpLoop 'deny'
BpShell "bypass AUTO-11: on a loop branch, git checkout '@' (stays, PowerShell) -> allowed" 'PowerShell' "git checkout '@'" $bpLoop 'allow'
BpShell 'bypass AUTO-11: on main, git branch -c harness/x copy (PowerShell) -> denied' 'PowerShell' 'git branch -c harness/x copy' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git update-ref refs/heads/main harness/x -> denied' 'Bash' 'git update-ref refs/heads/main harness/x' $bpMain 'deny'

# ------------------------------------------------------------------ AUTO-11: a worktree off the loop branch
# Check of the second review of CR-2026-10-15-GAPS: on a loop branch, 'git worktree add --detach
# ../wt HEAD' and then 'git -C ../wt push origin HEAD:main' passed, because the new folder is on no
# loop branch. A worktree on a new loop-prefixed branch or a local loop branch stays allowed. Each
# deny case was an allow before; the allow cases hold the other side (a loop branch, a list, and the
# same command off the loop, which is a written residual).
Write-Host '-- bypass review: AUTO-11, a worktree off the loop branch'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add --detach ../wt HEAD -> denied' 'Bash' 'git worktree add --detach ../bp-wt HEAD' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add --detach ../wt HEAD (PowerShell) -> denied' 'PowerShell' 'git worktree add --detach ../bp-wt HEAD' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add -b copy ../wt -> denied' 'Bash' 'git worktree add -b copy ../bp-wt' $bpLoop 'deny' 'makes the branch copy'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add -b copy ../wt (PowerShell) -> denied' 'PowerShell' 'git worktree add -b copy ../bp-wt' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add -fB main ../wt (grouped, resets main) -> denied' 'Bash' 'git worktree add -fB main ../bp-wt' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add ../wt main (another branch) -> denied' 'Bash' 'git worktree add ../bp-wt main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add ../wt (a branch named after the folder) -> denied' 'Bash' 'git worktree add ../bp-wt' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add ../wt (PowerShell) -> denied' 'PowerShell' 'git worktree add ..\bp-wt' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add -b harness/chunk-5 ../wt -> allowed' 'Bash' 'git worktree add -b harness/chunk-5 ../bp-wt' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git worktree add ../wt harness/chunk-0 (PowerShell) -> allowed' 'PowerShell' 'git worktree add ../bp-wt harness/chunk-0' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git worktree list -> allowed' 'Bash' 'git worktree list' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on main, git worktree add -b copy ../wt (off the loop) -> allowed' 'Bash' 'git worktree add -b copy ../bp-wt' $bpMain 'allow'

# ------------------------------------------------------------------ AUTO-11: rebase, bisect, fetch
# Third review of CR-2026-10-15-GAPS: on a loop branch, 'git rebase HEAD main' put HEAD on main with the
# loop's work, 'git bisect start HEAD main' detached HEAD at a loop commit, and 'git fetch . HEAD:main'
# moved main onto the loop's work; the push that followed passed. Each deny case was an allow before.
# The allow cases hold the other side: a rebase of the loop branch itself (no branch argument, or the
# loop branch named), a bisect that moves nothing, a fetch into a remote-tracking ref or with no
# destination, and, off the loop, the residual forms the rule does not read.
Write-Host '-- bypass review: AUTO-11, rebase with a branch, bisect, fetch into a local branch'
BpShell 'bypass AUTO-11: on a loop branch, git rebase HEAD main (checks out main) -> denied' 'Bash' 'git rebase HEAD main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git rebase HEAD main (PowerShell) -> denied' 'PowerShell' 'git rebase HEAD main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --onto main harness/chunk-0 main -> denied' 'Bash' 'git rebase --onto main harness/chunk-0 main' $bpLoop 'deny' 'checks out main'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --onto main harness/chunk-0 main (PowerShell) -> denied' 'PowerShell' 'git rebase --onto main harness/chunk-0 main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git rebase main HEAD (rebases at a detached HEAD) -> denied' 'Bash' 'git rebase main HEAD' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --root main -> denied' 'Bash' 'git rebase --root main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git rebase -s ort HEAD main (valued option) -> denied' 'PowerShell' 'git rebase -s ort HEAD main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git rebase main (no branch argument) -> allowed' 'Bash' 'git rebase main' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git rebase main (no branch argument, PowerShell) -> allowed' 'PowerShell' 'git rebase main' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --onto main main harness/chunk-1 (the loop branch HEAD is on) -> allowed' 'Bash' 'git rebase --onto main main harness/chunk-1' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git rebase main harness/chunk-0 (another local loop branch) -> allowed' 'PowerShell' 'git rebase main harness/chunk-0' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --continue -> allowed' 'Bash' 'git rebase --continue' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git bisect start HEAD main -> denied' 'Bash' 'git bisect start HEAD main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git bisect start HEAD main (PowerShell) -> denied' 'PowerShell' 'git bisect start HEAD main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git bisect start (no commits yet) -> denied' 'Bash' 'git bisect start' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git bisect good -> denied' 'PowerShell' 'git bisect good' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git bisect run py -3 check.py -> denied' 'Bash' 'git bisect run py -3 check.py' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git bisect reset main (names a commit) -> denied' 'Bash' 'git bisect reset main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git bisect reset main (PowerShell) -> denied' 'PowerShell' 'git bisect reset main' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git bisect log -> allowed' 'Bash' 'git bisect log' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git bisect log (PowerShell) -> allowed' 'PowerShell' 'git bisect log' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git bisect reset with no bisect running -> allowed' 'Bash' 'git bisect reset' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git bisect reset with no bisect running (PowerShell) -> allowed' 'PowerShell' 'git bisect reset' $bpLoop 'allow'
# A running bisect: reset with no commit checks out the branch the bisect started on.
Put (Join-Path $bpLoop '.git\BISECT_START') 'main'
BpShell 'bypass AUTO-11: on a loop branch, git bisect reset while a bisect runs -> denied' 'Bash' 'git bisect reset' $bpLoop 'deny' 'AUTO-11'
Remove-Item -LiteralPath (Join-Path $bpLoop '.git\BISECT_START') -Force
BpShell 'bypass AUTO-11: on a loop branch, git fetch . HEAD:main -> denied' 'Bash' 'git fetch . HEAD:main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git fetch . HEAD:main (PowerShell) -> denied' 'PowerShell' 'git fetch . HEAD:main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git fetch origin +refs/heads/main:refs/heads/main -> denied' 'Bash' 'git fetch origin +refs/heads/main:refs/heads/main' $bpLoop 'deny' 'writes the local branch main'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --depth 1 . HEAD:heads/copy (valued option) -> denied' 'PowerShell' 'git fetch --depth 1 . HEAD:heads/copy' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --stdin . (refspecs unseen) -> denied' 'Bash' 'git fetch --stdin .' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --refmap with a local destination -> denied' 'Bash' 'git fetch --refmap "+refs/heads/*:refs/heads/copy/*" . harness/chunk-1' $bpLoop 'deny'
BpShell 'bypass AUTO-11: on a loop branch, git fetch origin -> allowed' 'Bash' 'git fetch origin' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git fetch origin main (no destination, PowerShell) -> allowed' 'PowerShell' 'git fetch origin main' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git fetch . HEAD:refs/remotes/origin/main (remote-tracking) -> allowed' 'Bash' 'git fetch . HEAD:refs/remotes/origin/main' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git fetch origin +refs/heads/*:refs/remotes/origin/* (PowerShell) -> allowed' 'PowerShell' 'git fetch origin +refs/heads/*:refs/remotes/origin/*' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --multiple origin upstream (repositories only) -> allowed' 'Bash' 'git fetch --multiple origin upstream' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on main, git fetch . main:harness/x (writes a loop branch) -> denied' 'Bash' 'git fetch . main:harness/x' $bpMain 'deny' 'writes the loop branch harness/x'
BpShell 'bypass AUTO-11: on main, git fetch . main:harness/x (PowerShell) -> denied' 'PowerShell' 'git fetch . main:harness/x' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git fetch origin main:refs/heads/harness/y -> denied' 'Bash' 'git fetch origin main:refs/heads/harness/y' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git fetch origin "refs/heads/*:refs/heads/*" (glob covers a loop branch) -> denied' 'Bash' 'git fetch origin "refs/heads/*:refs/heads/*"' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git fetch . harness/x:feature (from a loop ref) -> denied' 'Bash' 'git fetch . harness/x:feature' $bpMain 'deny' 'from the loop ref harness/x'
BpShell 'bypass AUTO-11: on main, git fetch origin harness/x:feature (PowerShell) -> denied' 'PowerShell' 'git fetch origin harness/x:feature' $bpMain 'deny'
BpShell 'bypass AUTO-11: on main, git fetch . main:feature (no loop ref) -> allowed' 'Bash' 'git fetch . main:feature' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git fetch origin harness/x:refs/remotes/origin/harness/x (remote-tracking) -> allowed' 'Bash' 'git fetch origin harness/x:refs/remotes/origin/harness/x' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git fetch origin "refs/heads/feature*:refs/heads/feature*" (glob misses the prefix) -> allowed' 'PowerShell' 'git fetch origin "refs/heads/feature*:refs/heads/feature*"' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git rebase main feature (off the loop, residual) -> allowed' 'Bash' 'git rebase main feature' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git bisect start harness/x main (off the loop, residual) -> allowed' 'Bash' 'git bisect start harness/x main' $bpMain 'allow'

# ------------------------------------------------------------------ AUTO-11: a stopped rebase, abbreviations, a glob source
# Check of the third review of CR-2026-10-15-GAPS. A plain 'git rebase main' on a loop branch stays
# allowed; when it stops on a conflict, HEAD is detached at the rebased loop commits, the rule read no
# branch there, and 'git push origin HEAD:main', 'git checkout main' and 'git branch -f main HEAD'
# passed. The branch a stopped rebase goes back to now counts, and so does the branch a running bisect
# started on; 'git rebase --quit', which ends the rebase and keeps the detached HEAD, is refused there.
# git takes any unique prefix of a long option, and 'git rebase --ro main' checked out main, and
# 'git fetch --st .' read refspecs from standard input unseen. From main, a fetch from a glob source
# that covers the loop branch made a copy of it under another name. Each deny case was an allow before.
# The allow cases hold the other side: the steps that finish or undo the rebase, a detached HEAD with
# no rebase or bisect of a loop branch (a written residual), options that only start alike, and a glob
# source that misses the prefix or writes remote-tracking refs.
Write-Host '-- bypass review check: AUTO-11, a stopped rebase, abbreviations, a glob source'
$bpStop = NewRepo 'repo-bp-stop'
Put (Join-Path $bpStop 'a.txt') 'a'
RunGit $bpStop @('add', '-A'); RunGit $bpStop @('commit', '-q', '-m', 'init')
RunGit $bpStop @('checkout', '-q', '-b', 'harness/stop')
Put (Join-Path $bpStop 'f1.txt') 'one'; RunGit $bpStop @('add', '-A'); RunGit $bpStop @('commit', '-q', '-m', 'loop1')
Put (Join-Path $bpStop 'f2.txt') 'loop side'; RunGit $bpStop @('add', '-A'); RunGit $bpStop @('commit', '-q', '-m', 'loop2')
RunGit $bpStop @('checkout', '-q', 'main')
Put (Join-Path $bpStop 'f2.txt') 'main side'; RunGit $bpStop @('add', '-A'); RunGit $bpStop @('commit', '-q', '-m', 'mainside')
RunGit $bpStop @('checkout', '-q', 'harness/stop')
RunGit $bpStop @('rebase', 'main')        # loop1 replays; loop2 stops on f2.txt, HEAD detached at the new loop1
$bpStopHead = (& git.exe -C $bpStop rev-parse --abbrev-ref HEAD 2>$null) + ' ' + (& git.exe -C $bpStop log -1 --format=%s HEAD 2>$null)
Record 'bypass AUTO-11 fixture: the rebase of harness/stop stopped at a detached HEAD on loop1' 'HEAD loop1' $bpStopHead ''
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git push origin HEAD:main -> denied' 'Bash' 'git push origin HEAD:main' $bpStop 'deny' 'harness/stop'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git push origin HEAD:main (PowerShell) -> denied' 'PowerShell' 'git push origin HEAD:main' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git checkout main -> denied' 'Bash' 'git checkout main' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git branch -f main HEAD (PowerShell) -> denied' 'PowerShell' 'git branch -f main HEAD' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git rebase --quit -> denied' 'Bash' 'git rebase --quit' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git rebase --quit (PowerShell) -> denied' 'PowerShell' 'git rebase --quit' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git rebase --continue -> allowed' 'Bash' 'git rebase --continue' $bpStop 'allow'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git rebase --abort (PowerShell) -> allowed' 'PowerShell' 'git rebase --abort' $bpStop 'allow'
BpShell 'bypass AUTO-11: a stopped rebase of a loop branch, git add f2.txt -> allowed' 'Bash' 'git add f2.txt' $bpStop 'allow'
RunGit $bpStop @('rebase', '--abort')
# A running bisect that started on the loop branch: HEAD is detached at a loop commit, and
# BISECT_START names the branch it goes back to. The fixture writes that file at a detached HEAD.
RunGit $bpStop @('checkout', '-q', '--detach', 'harness/stop')
Put (Join-Path $bpStop '.git\BISECT_START') 'harness/stop'
BpShell 'bypass AUTO-11: a bisect started on a loop branch, git push origin HEAD:main -> denied' 'Bash' 'git push origin HEAD:main' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a bisect started on a loop branch, git bisect reset (goes back) -> denied' 'PowerShell' 'git bisect reset' $bpStop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: a bisect started on a loop branch, git bisect log -> allowed' 'Bash' 'git bisect log' $bpStop 'allow'
Put (Join-Path $bpStop '.git\BISECT_START') 'main'
BpShell 'bypass AUTO-11: a bisect started on main, git push origin HEAD:main (residual) -> allowed' 'Bash' 'git push origin HEAD:main' $bpStop 'allow'
Remove-Item -LiteralPath (Join-Path $bpStop '.git\BISECT_START') -Force
BpShell 'bypass AUTO-11: a detached HEAD with no rebase or bisect, git push origin HEAD:main (residual) -> allowed' 'Bash' 'git push origin HEAD:main' $bpStop 'allow'
RunGit $bpStop @('checkout', '-q', 'harness/stop')
# An abbreviated long option (git rebase -h, git fetch -h list the full names).
BpShell 'bypass AUTO-11: on a loop branch, git rebase --ro main (abbreviated --root) -> denied' 'Bash' 'git rebase --ro main' $bpLoop 'deny' 'checks out main'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --roo main (PowerShell) -> denied' 'PowerShell' 'git rebase --roo main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git rebase --rerere-autoupdate main (not --root) -> allowed' 'Bash' 'git rebase --rerere-autoupdate main' $bpLoop 'allow'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --st . (abbreviated --stdin) -> denied' 'Bash' 'git fetch --st .' $bpLoop 'deny' 'standard input'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --stdi . (PowerShell) -> denied' 'PowerShell' 'git fetch --stdi .' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --refm with a local destination (abbreviated --refmap) -> denied' 'Bash' 'git fetch --refm "+refs/heads/*:refs/heads/copy/*" . harness/chunk-1' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --refma=<local destination> (PowerShell) -> denied' 'PowerShell' 'git fetch "--refma=+refs/heads/*:refs/heads/copy/*" . harness/chunk-1' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on a loop branch, git fetch --refetch origin (not --refmap) -> allowed' 'Bash' 'git fetch --refetch origin' $bpLoop 'allow'
# A glob source that covers the loop branch, into local branches, from main.
BpShell 'bypass AUTO-11: on main, git fetch . "refs/heads/*:refs/heads/copy/*" (glob source) -> denied' 'Bash' 'git fetch . "refs/heads/*:refs/heads/copy/*"' $bpMain 'deny' 'can cover a loop branch'
BpShell 'bypass AUTO-11: on main, git fetch . "refs/heads/*:refs/heads/copy/*" (PowerShell) -> denied' 'PowerShell' 'git fetch . "refs/heads/*:refs/heads/copy/*"' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git fetch origin "+refs/heads/h*:refs/heads/mirror/h*" -> denied' 'Bash' 'git fetch origin "+refs/heads/h*:refs/heads/mirror/h*"' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git fetch . "refs/heads/feature*:refs/heads/copy/feature*" (misses the prefix) -> allowed' 'Bash' 'git fetch . "refs/heads/feature*:refs/heads/copy/feature*"' $bpMain 'allow'
BpShell 'bypass AUTO-11: on main, git fetch origin "+refs/heads/*:refs/remotes/origin/*" (remote-tracking) -> allowed' 'PowerShell' 'git fetch origin "+refs/heads/*:refs/remotes/origin/*"' $bpMain 'allow'
# git send-pack is the plumbing under push: on a loop branch it sent the loop's work in one call.
BpShell 'bypass AUTO-11: on a loop branch, git send-pack ../remote.git HEAD:refs/heads/main -> denied' 'Bash' 'git send-pack ../bp-remote.git HEAD:refs/heads/main' $bpLoop 'deny' 'git send-pack on the loop branch'
BpShell 'bypass AUTO-11: on a loop branch, git send-pack ../remote.git HEAD:refs/heads/main (PowerShell) -> denied' 'PowerShell' 'git send-pack ../bp-remote.git HEAD:refs/heads/main' $bpLoop 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git send-pack ../remote.git harness/x:refs/heads/main -> denied' 'Bash' 'git send-pack ../bp-remote.git harness/x:refs/heads/main' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git send-pack --all ../remote.git with a loop branch present -> denied' 'PowerShell' 'git send-pack --all ../bp-remote.git' $bpMain 'deny' 'AUTO-11'
BpShell 'bypass AUTO-11: on main, git send-pack ../remote.git main -> allowed' 'Bash' 'git send-pack ../bp-remote.git main' $bpMain 'allow'

# ------------------------------------------------------------------ GATE-03: the install ask rules
Write-Host '-- bypass D1: GATE-03, the install verbs in the ask rules'
$bpInstallVerbs = @('npm install *', 'npm i *', 'npm add *', 'pnpm add *', 'yarn add *', 'bun add *',
                    'pip install *', 'pip3 install *', 'python -m pip install *', 'python3 -m pip install *', 'py -m pip install *',
                    'uv add *', 'poetry add *', 'cargo add *', 'go get *', 'dotnet add package *')
$bpSettings = Get-Content -LiteralPath (Join-Path $kit 'templates\root-settings.json') -Raw -Encoding utf8 | ConvertFrom-Json
$bpAsk = @($bpSettings.permissions.ask)
$bpMissing = @()
foreach ($v in $bpInstallVerbs) { foreach ($sh in 'Bash', 'PowerShell') { if ($bpAsk -notcontains "$sh($v)") { $bpMissing += "$sh($v)" } } }
Record 'bypass GATE-03: every install verb is an ask rule, as Bash and PowerShell twins' 'twins' $(if ($bpMissing.Count -eq 0) { 'twins' } else { 'missing: ' + ($bpMissing -join ', ') }) ''
$bpLaw = Get-Content -LiteralPath (Join-Path $kit 'instructions\interview-every-add-law.md') -Raw -Encoding utf8
# Word-bounded, so 'pnpm add' does not count as naming 'npm add'.
$bpUnnamed = @($bpInstallVerbs | ForEach-Object { $_ -replace '\s\*$', '' } | Where-Object { $bpLaw -notmatch ('(?<![\w.-])' + [regex]::Escape($_) + '(?![\w-])') })
Record 'bypass GATE-03: the owning law text names every install verb in the ask rules' 'named' $(if ($bpUnnamed.Count -eq 0) { 'named' } else { 'unnamed: ' + ($bpUnnamed -join ', ') }) ''

# ------------------------------------------------------------------ GATE-11: a Write to a measuring file
Write-Host '-- bypass D1: GATE-11, a Write to a measuring file'
$bpTests = Join-Path $root 'tests'
Put (Join-Path $bpTests 'bp_paren.test.js') "assert(a);`nassert(b);`nconst c = 1;`n"
Put (Join-Path $bpTests 'test_bp_loose.py') "assert x == 1`nassert y == 2`n"
Put (Join-Path $bpTests 'test_bp_zero.py') "assert total == expected`n"
Put (Join-Path $root 'ordinary\bp_plain.js') "assert(a);`nassert(b);`n"
[IO.File]::WriteAllText((Join-Path $bpTests 'bp_crlf.test.js'), "assert(a);`r`nassert(b);`r`n", [Text.UTF8Encoding]::new($false))

# The content keeps the file's size, so before the fix none of these reached the size advise either.
BpWrite 'bypass GATE-11: a Write that drops a paren assertion from a test file -> denies' (Join-Path $bpTests 'bp_paren.test.js') "assert(a);`nconst c = 1;`n// b is covered elsewhere`n" 'deny' 'GOODHART'
BpWrite 'bypass GATE-11: a Write that drops a bare Python assert -> advises' (Join-Path $bpTests 'test_bp_loose.py') "assert x == 1`ny_checked = 2  # moved`n" 'advise' 'GOODHART (advisory)'
BpWrite "bypass GATE-11: a Write that adds a '* 0' term to a test -> denies" (Join-Path $bpTests 'test_bp_zero.py') "assert total * 0 == expected * 0`n" 'deny' 'GOODHART'
BpWrite 'bypass GATE-11: a Write that keeps and adds assertions -> allowed' (Join-Path $bpTests 'bp_paren.test.js') "assert(a);`nassert(b);`nassert(c);`nconst c = 1;`n" 'allow'
BpWrite 'bypass GATE-11: an LF Write over a CRLF test file, same assertions -> allowed' (Join-Path $bpTests 'bp_crlf.test.js') "assert(a);`nassert(b);`n" 'allow'
BpWrite 'bypass GATE-11: a Write that creates a new test file -> allowed' (Join-Path $bpTests 'bp_new.test.js') 'assert(z);' 'allow'
BpWrite 'bypass GATE-11: dropping an assertion outside a measuring path -> no GOODHART' (Join-Path $root 'ordinary\bp_plain.js') "assert(a);`nconst kept = 2;`n" 'allow'

# ------------------------------------------------------------------ GATE-11: false positives the Write branch widened
# Found by the final review of CR-2026-10-15-GAPS. A measuring path is read by folder and file name
# (a name that is a measuring word or holds one as a word part), no longer by any substring; the
# zero-term pattern no longer matches a multiply by 0.5; a method call '.expect(' is not an
# assertion. Each allow case below was denied before its fix. The deny cases and the 0x10 case hold
# the other side: they give the same answer before and after, and fail if the narrowing goes too far.
Write-Host '-- bypass review: GATE-11, the measuring path, the zero term and .expect('
function BpEdit([string]$name, [string]$path, [string]$old, [string]$new, [string]$expect, [string]$contains) {
    $r = BpRun 'fence.ps1' 'Edit' @{ file_path = $path; old_string = $old; new_string = $new } $root
    Record $name $expect (BpGot $r $expect $contains) $r.out
}
# Workaround: the multiply sign is joined in at run time. Typed next to a zero in this file, it is
# a zero term to the live fence, which then refuses the edit that adds these cases to this file.
$bpX = '*'
$bpTwo = "assert(a);`nassert(b);`nconst c = 1;`n"
$bpOne = "assert(a);`nconst c = 1;`n// b is covered elsewhere`n"   # one assertion fewer, no fewer bytes
foreach ($f in 'latest\bp_latest.js', 'inspector\bp_inspector.js', 'special\bp_special.js', 'tests\bp_helpers.js', 'ordinary\bp_widget.test.js', 'testutils\bp_util.js') { Put (Join-Path $root $f) $bpTwo }
Put (Join-Path $bpTests 'test_bp_half.py') "assert total == expected`n"
Put (Join-Path $bpTests 'bp_rust.rs') "let v = parse(`"1`").expect(`"parses`");`nlet w = parse(`"2`").expect(`"parses`");`nassert_eq!(v + w, 3);`n"

BpWrite "bypass review GATE-11: a Write that drops assert( under latest\ -> no GOODHART" (Join-Path $root 'latest\bp_latest.js') $bpOne 'allow'
BpWrite "bypass review GATE-11: a Write that drops assert( under inspector\ -> no GOODHART" (Join-Path $root 'inspector\bp_inspector.js') $bpOne 'allow'
BpWrite "bypass review GATE-11: a Write that drops assert( under special\ -> no GOODHART" (Join-Path $root 'special\bp_special.js') $bpOne 'allow'
BpEdit "bypass review GATE-11: an Edit that drops assert( under special\ -> no GOODHART" (Join-Path $root 'special\bp_special.js') "assert(a);`nassert(b);" 'assert(a);' 'allow'
BpWrite "bypass review GATE-11: a Write that drops assert( in tests\, a plain file name -> denies" (Join-Path $root 'tests\bp_helpers.js') $bpOne 'deny' 'GOODHART'
BpWrite "bypass review GATE-11: a Write that drops assert( from x.test.js outside a test folder -> denies" (Join-Path $root 'ordinary\bp_widget.test.js') $bpOne 'deny' 'GOODHART'
# A word part that starts with test counts, as the brief for this fix said: testutils\ holds
# assertion helpers. The first word-part rule matched whole words only and let this one through.
BpWrite "bypass review GATE-11: a Write that drops assert( under testutils\ -> denies" (Join-Path $root 'testutils\bp_util.js') $bpOne 'deny' 'GOODHART'
BpEdit "bypass review GATE-11: an Edit that drops assertEquals( from WidgetTest.java -> denies" (Join-Path $root 'ordinary\BpWidgetTest.java') "assertEquals(1, a);`nassertEquals(2, b);" 'assertEquals(1, a);' 'deny' 'GOODHART'
BpWrite "bypass review GATE-11: a Write that multiplies by 0.5 in a test -> allowed" (Join-Path $bpTests 'test_bp_half.py') "assert total $bpX 0.5 == expected $bpX 0.5`n" 'allow'
BpWrite "bypass review GATE-11: a Write that multiplies by 0x10 in a test -> allowed" (Join-Path $bpTests 'test_bp_half.py') "assert total $bpX 0x10 == expected $bpX 0x10`n" 'allow'
BpWrite "bypass review GATE-11: a Write that multiplies by '0.' in a test -> denies" (Join-Path $bpTests 'test_bp_half.py') "assert total $bpX 0. == expected $bpX 0.`n" 'deny' 'GOODHART'
BpWrite "bypass review GATE-11: a Write that swaps Rust .expect( for '?' -> allowed (a method call)" (Join-Path $bpTests 'bp_rust.rs') "let v = parse(`"1`")?;`nlet w = parse(`"2`")?;`nassert_eq!(v + w, 3);`n// a parse error now returns to the caller`nOk(())`n" 'allow'
# The multiply sign that opens a C block comment is not a multiply (second review of
# CR-2026-10-15-GAPS): the pattern read a comment that starts with a zero, slash-star-zero, as a zero
# term and denied the edit. The allow cases are the fix and fail with the old pattern; the deny cases
# hold the other side in the same file: a real multiply by zero still denies. $bpX joins the sign in.
Put (Join-Path $bpTests 'bp_flags.c') "int x = 1; /$bpX one $bpX/`nassert(x == 1);`n"
BpEdit "bypass review GATE-11: an Edit that writes '/$bpX 0 = off $bpX/' in a C test -> allowed (a comment)" (Join-Path $bpTests 'bp_flags.c') "int x = 1; /$bpX one $bpX/" "int x = 1; /$bpX 0 = off $bpX/" 'allow'
BpWrite "bypass review GATE-11: a Write that adds a '/$bpX$bpX 0' doc comment to a C test -> allowed (a comment)" (Join-Path $bpTests 'bp_flags.c') "/$bpX$bpX 0 means off $bpX/`nint x = 1; /$bpX one $bpX/`nassert(x == 1);`n" 'allow'
BpEdit "bypass review GATE-11: an Edit that multiplies by '$bpX 0' beside a comment in a C test -> denies" (Join-Path $bpTests 'bp_flags.c') "int x = 1; /$bpX one $bpX/" "int x = 1 $bpX 0; /$bpX one $bpX/" 'deny' 'GOODHART'
BpWrite "bypass review GATE-11: a Write that multiplies by '$bpX 0' in a C test -> denies" (Join-Path $bpTests 'bp_flags.c') "int x = 1 $bpX 0; /$bpX one $bpX/`nassert(x == 1);`n" 'deny' 'GOODHART'
