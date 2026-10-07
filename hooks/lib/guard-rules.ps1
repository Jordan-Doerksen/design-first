# guard-rules.ps1 - the four guard rules, in SPEC 5.4 order. Dot-sourced by guard.ps1.
# Each rule returns $null (no opinion) or a deny object from New-DfDeny. Advisories are added to
# the $script:DfAdvisories list and emitted once by guard.ps1.

$script:DfSecretGlobs = @('*.env', '*.env.*', '*.key', '*.pem', '*.p12', '*.pfx')
$script:DfEnvGlobs    = @('*.env', '*.env.*')

function Test-DfSecretName([string]$leaf, [string[]]$globs) {
    if ([string]::IsNullOrWhiteSpace($leaf)) { return $false }
    if ($leaf -like '*.env.example') { return $false }
    foreach ($g in $globs) { if ($leaf -like $g) { return $true } }
    return $false
}

function Test-DfException([string]$full, [string[]]$exceptions) {
    if (-not $full) { return $false }
    foreach ($e in $exceptions) { if ($full.Equals($e, [StringComparison]::OrdinalIgnoreCase)) { return $true } }
    return $false
}

function Add-DfAdvisory([string]$title, [string]$body) {
    $script:DfAdvisories += @{ title = $title; body = $body }
}

# Short-option group scan: returns @{ flags = letters seen before a value-taking letter;
# consumesNext = $true when the last letter takes a value and nothing followed it }.
function Read-DfShortGroup([string]$tok, [string]$valueLetters) {
    $r = @{ flags = @(); consumesNext = $false }
    $letters = $tok.Substring(1)
    for ($k = 0; $k -lt $letters.Length; $k++) {
        $ch = $letters[$k]
        if ($valueLetters.Contains($ch)) {
            if ($k -eq $letters.Length - 1) { $r.consumesNext = $true }
            break
        }
        $r.flags += [string]$ch
    }
    return $r
}

# ============================================================================ (1) staging
# anchor: stage-secret  mode: deny  verbs: stage,track
function Test-DfStagingRule($call, [string[]]$exceptions, [string]$owner) {
    if ($call.sub -ne 'add' -and $call.sub -ne 'commit') { return $null }
    $a = @($call.args)
    $cwd = $call.cwd

    # Option-value stripping (finding 75): a message or a file argument is prose, not a pathspec.
    $valueLetters = if ($call.sub -eq 'commit') { 'mFCct' } else { '' }
    $longValued = @('--message', '--file', '--reuse-message', '--reedit-message', '--author', '--date',
                    '--template', '--fixup', '--squash', '--trailer', '--pathspec-from-file', '--chmod', '--gpg-sign', '--cleanup')
    $paths = @(); $hasAll = $false; $afterDashDash = $false
    for ($i = 0; $i -lt $a.Count; $i++) {
        $t = $a[$i]
        if ($afterDashDash) { $paths += $t; continue }
        if ($t -eq '--') { $afterDashDash = $true; continue }
        if ($t -match '^--[A-Za-z-]+=') { continue }
        if ($t -in $longValued) { $i++; continue }
        if ($t -eq '--all') { $hasAll = $true; continue }
        if ($t -match '^-[A-Za-z]+$') {
            $g = Read-DfShortGroup $t $valueLetters
            if ('a' -in $g.flags) { $hasAll = $true }
            if ('A' -in $g.flags -or 'u' -in $g.flags) { $paths += '-A' }
            if ($g.consumesNext) { $i++ }
            continue
        }
        if ($t.StartsWith('-')) { continue }
        $paths += $t
    }
    if ($call.sub -eq 'commit' -and -not $hasAll) { return $null }

    $probes = @()
    foreach ($p in $paths) {
        if ($p -in @('-A', '-u', '-Au', '-uA', '.', './', '.\')) { $probes += $p; continue }
        $leaf = Get-DfLeaf $p
        if (Test-DfSecretName $leaf $script:DfSecretGlobs) {
            $full = ConvertTo-DfFullPath $p $cwd
            if (Test-DfException $full $exceptions) { continue }
            return (New-DfStageDeny $p $owner)
        }
        $full = ConvertTo-DfFullPath $p $cwd
        if ($p -match '[*?\[]' -or ($full -and (Test-Path -LiteralPath $full -PathType Container))) { $probes += $p }
    }
    if ($hasAll -and $call.sub -eq 'add') { $probes += '-A' }

    # Wildcard probe (finding 71): ask git which untracked, un-ignored files the pathspec covers.
    foreach ($p in $probes) {
        $runDir = $cwd
        $spec = @('--', $p)
        if ($p -match '^-') {
            # -A / -u / --all cover the whole work tree, so probe from the top level.
            $top = Invoke-DfGit $cwd @('rev-parse', '--show-toplevel')
            if ($top.code -ne 0) { continue }
            $runDir = ConvertTo-DfFullPath ([string]$top.out)
            $spec = @()
        }
        $ls = Invoke-DfGit $runDir (@('ls-files', '--others', '--exclude-standard', '-z') + $spec)
        if ($ls.code -ne 0 -or -not $ls.out) { continue }
        $joined = ($ls.out -join '')
        foreach ($f in ($joined -split "`0")) {
            if ([string]::IsNullOrWhiteSpace($f)) { continue }
            if (-not (Test-DfSecretName (Get-DfLeaf $f) $script:DfSecretGlobs)) { continue }
            $full = ConvertTo-DfFullPath $f $runDir
            if (Test-DfException $full $exceptions) { continue }
            return (New-DfStageDeny "$f (via '$p')" $owner)
        }
    }
    return $null
}

function New-DfStageDeny([string]$what, [string]$owner) {
    $reason = "BLOCKED - this command stages a file that looks like a credential: $what`n`n" +
              "Secrets live in a gitignored .env, always; a token is never committed. If this one " +
              "has leaked, rotate it first and assume it is already public. If this file is a " +
              "deliberate exception, $owner registers it in secretExceptions in the brain's " +
              "doctor.config.json before it is staged; an exception is recorded, never assumed."
    return (New-DfDeny 'guard' "staging a secret ($what)" $reason)
}

# ============================================================================ (2) history
# anchor: git-history  mode: deny  verbs: destroy-history
function Test-DfHistoryRule($call, [string]$owner) {
    $a = @($call.args)
    $hit = $null
    switch ($call.sub) {
        'gc'     { if ($a | Where-Object { $_ -match '^--prune(=.*)?$' }) { $hit = 'git gc --prune removes unreachable objects, the recovery net for anything never committed' } }
        'reflog' { if ('expire' -in $a) { $hit = 'git reflog expire removes the reflog, the first recovery tool after a bad reset' } }
        'push'   {
            $valued = @('-o', '--push-option', '--receive-pack', '--exec', '--repo')
            for ($i = 0; $i -lt $a.Count; $i++) {
                $t = $a[$i]
                if ($t -in $valued) { $i++; continue }
                if ($t -match '^--(force|force-with-lease)(=.*)?$') { $hit = "$t rewrites published history"; break }
                if ($t -eq '--delete' -or $t -eq '-d') { $hit = "$t deletes a remote branch"; break }
                if ($t -match '^-[A-Za-z]+$' -and $t.Contains('f')) { $hit = "$t (force) rewrites published history"; break }
                if ($t -match '^-[A-Za-z]+$' -and $t.Contains('d')) { $hit = "$t (delete) deletes a remote branch"; break }
                if ($t.StartsWith('-')) { continue }
                if ($t.StartsWith('+')) { $hit = "refspec $t forces the update"; break }
                if ($t -match '^:.+') { $hit = "refspec $t deletes the remote branch"; break }
            }
        }
    }
    if (-not $hit) { return $null }
    $reason = "BLOCKED - that command destroys git history: $hit.`n`n" +
              "Git's recovery order is reflog, fsck --lost-found, stash, bundle; these commands remove " +
              "exactly what that order depends on, on every branch. If this rewrite is genuinely wanted, " +
              "$owner runs it by hand."
    return (New-DfDeny 'guard' "history destruction ($hit)" $reason)
}

# ============================================================================ (3) env write
# anchor: env-write  mode: deny  verbs: write-secret
function Test-DfEnvWriteRule([string]$full, [string[]]$exceptions, [string]$owner) {
    if (-not $full) { return $null }
    if (-not (Test-DfSecretName (Get-DfLeaf $full) $script:DfEnvGlobs)) { return $null }
    if (Test-DfException $full $exceptions) { return $null }
    $dir = Get-DfNearestExistingDir $full
    if (-not $dir) { return $null }
    $tracked = Invoke-DfGit $dir @('ls-files', '--error-unmatch', '--', $full)
    if ($tracked.code -eq 0) {
        $reason = "BLOCKED - $full is a secret file that is already tracked by git.`n`n" +
                  "Untrack it first: git rm --cached `"$full`", then add it to .gitignore, then write it. " +
                  "If tracking it is deliberate, $owner registers it in secretExceptions in the brain's doctor.config.json."
        return (New-DfDeny 'guard' "writing a tracked secret file ($full)" $reason)
    }
    $ign = Invoke-DfGit $dir @('check-ignore', '-q', '--', $full)
    switch ($ign.code) {
        0 { return $null }
        1 {
            $reason = "BLOCKED - $full is a secret file and is not ignored by git.`n`n" +
                      "Add it to .gitignore first (that edit and 'git add .gitignore' are allowed), then write it. " +
                      "If committing it is deliberate, $owner registers it in secretExceptions in the brain's doctor.config.json."
            return (New-DfDeny 'guard' "writing a secret file that is not ignored ($full)" $reason)
        }
        default {
            Add-DfAdvisory "secret file outside any git repo ($full)" `
                ("$full looks like a secret file and is outside any git repository, so git cannot say whether it is ignored. " +
                 "Allowed. If a repo is created around it later, ignore it before the first 'git add'.")
            return $null
        }
    }
}

# ============================================================================ (4) path rules
# anchor: frozen-path  mode: deny  verbs: edit-frozen
$script:DfDestructiveHeads = @('rm', 'rmdir', 'del', 'erase', 'rd', 'ri', 'mv', 'move', 'remove-item', 'move-item', 'rename-item', 'clear-content')

function Test-DfProtected([string]$full, [string[]]$protected) {
    foreach ($r in $protected) { if (Test-DfUnder $full $r) { return $r } }
    return $null
}

function New-DfFrozenDeny([string]$what, [string]$root, [string]$owner) {
    $reason = "BLOCKED - $what is inside $root, which the brain lists as FROZEN or TOMBSTONED.`n`n" +
              "Frozen means read, never edit. Tombstoned means retired but still read by a live consumer; " +
              "moving or deleting it breaks that consumer silently. Changing this is $owner's decision: the " +
              "path comes out of frozenPaths / tombstonedPaths in the brain's doctor.config.json first, as a recorded change."
    return (New-DfDeny 'guard' "protected path ($what)" $reason)
}

function Test-DfPathRuleFile([string]$full, [string[]]$protected, [string]$owner) {
    if (-not $full -or $protected.Count -eq 0) { return $null }
    $hit = Test-DfProtected $full $protected
    if ($hit) { return (New-DfFrozenDeny $full $hit $owner) }
    return $null
}

function Test-DfPathRuleShell([string[]]$tokens, $gitCall, [string]$cwd, [string[]]$protected, [string]$owner) {
    if ($protected.Count -eq 0 -or -not $tokens) { return $null }
    $destructive = $false
    $head = $tokens[0].ToLowerInvariant()
    if ($head -in $script:DfDestructiveHeads) { $destructive = $true }
    if ($gitCall -and $gitCall.sub -in @('clean', 'restore', 'rm', 'checkout')) { $destructive = $true }
    if (-not $destructive) { return $null }
    foreach ($t in $tokens) {
        if ($t.StartsWith('-')) { continue }
        $full = ConvertTo-DfFullPath $t $cwd
        $hit = Test-DfProtected $full $protected
        if ($hit) { return (New-DfFrozenDeny $t $hit $owner) }
    }
    return $null
}
