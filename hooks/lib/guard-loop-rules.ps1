# guard-loop-rules.ps1 - guard rules 11 and 12: the loop branch (AUTO-04, AUTO-11). Dot-sourced by
# guard.ps1 after guard-rules.ps1. Never run directly.
#
# The harness loop works on a branch named with the loop prefix (config loopBranchPrefix, default
# "harness/"). That name is the one fact both rules read, and git holds it, not a marker file.
#
# Rule 11, loop-no-push (AUTO-11): on a loop branch, git push, merge and pull are refused. The
# loop ends with a state card and the push command for the owner; nothing on that branch leaves
# the machine or lands on another branch by an agent's hand.
#
# Rule 12, ledger (AUTO-04): on a loop branch, an Edit or Write to the story ledger (config
# loopLedgerGlobs, default docs/specs/*.tasks.json and specs/*.tasks.json) is refused. The harness
# writes the pass mark from the Reviewer's verdict with its own process, never through a tool
# call; a Builder or Reviewer that reaches for the ledger is making its own target easier.
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

function Test-DfOnLoopBranch([string]$dir, [string]$prefix) {
    if ([string]::IsNullOrWhiteSpace($prefix)) { $prefix = $script:DfDefaultLoopBranchPrefix }
    $b = Get-DfCurrentBranch $dir
    if (-not $b) { return $null }
    if ($b.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $b }
    return $null
}

function Test-DfLoopPushRule($call, [string]$prefix, [string]$owner) {
    if ($null -eq $call) { return $null }
    if ($call.sub -notin @('push', 'merge', 'pull')) { return $null }
    $branch = Test-DfOnLoopBranch $call.cwd $prefix
    if (-not $branch) { return $null }
    $reason = ("BLOCKED - git {0} on the loop branch {1}. AUTO-11: the loop works on its own branch and never pushes and never merges; " +
               "it ends with a state card in HANDOFF.md and the exact push command, and {2} runs that command after reading the branch. " +
               "A merge into this branch is a push in the other direction and is refused for the same reason.") -f $call.sub, $branch, $owner
    return (New-DfDeny 'guard' ("loop branch: git {0} refused" -f $call.sub) $reason)
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
