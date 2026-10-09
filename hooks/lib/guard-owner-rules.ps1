# guard-owner-rules.ps1 - guard rules 7-9: the owner's standing prohibitions, as refusals.
# Dot-sourced by guard.ps1 after guard-rules.ps1, whose helpers (Add-DfAdvisory, Get-DfLeaf via
# common.ps1) these use. Split from guard-rules.ps1 by domain (DES-03): rules 1-6 guard secrets,
# history, frozen paths and the build method; rules 7-9 guard the owner's uncommitted work, his
# machine's start-up, and the content bans his brain configures.
# Each rule returns $null (no opinion) or a deny object from New-DfDeny.

# ============================================================================ (7) dirty tree
# anchor: dirty-tree  mode: deny  verbs: tidy
# SAFE-06. A git command that overwrites, deletes or hides uncommitted work is refused while the
# work tree it runs in has uncommitted or untracked changes: some trees are dirty on purpose, to
# protect something that works. stash drop and stash clear are refused always, because stashed
# work is in no commit. The command list follows the git-safety-guard pattern (terraphim
# opencode-skills): checkout -- <path>, restore without --staged, reset --hard / --merge / --keep,
# clean -f, switch --discard-changes, stash. Allowed: checkout -b / -B / --orphan, a checkout of a
# branch, restore --staged, clean -n, and every one of these on a clean tree.
# Cannot see: the same residual as the other shell rules (nested shells, scripts on disk, aliases),
# and a cd into another repository by any route other than cd / Set-Location / pushd / chdir.
function Test-DfDirtyTreeRule($call, [string]$owner) {
    $a = @($call.args)
    $what = $null
    $always = $false
    switch ($call.sub) {
        'reset' {
            $m = @($a | Where-Object { $_ -in @('--hard', '--merge', '--keep') }) | Select-Object -First 1
            if ($m) { $what = "git reset $m overwrites uncommitted changes" }
        }
        'checkout' {
            if (@($a | Where-Object { $_ -in @('-b', '-B', '--orphan') }).Count -gt 0) { break }
            if ('--' -in $a) { $what = 'git checkout -- <path> overwrites uncommitted changes in those files' }
            elseif (@($a | Where-Object { $_ -in @('-f', '--force') }).Count -gt 0) { $what = 'git checkout --force throws away uncommitted changes' }
            elseif (@($a | Where-Object { $_ -in @('.', './', '.\', ':/') }).Count -gt 0) { $what = 'git checkout . overwrites every uncommitted change' }
            else {
                foreach ($t in $a) {
                    if ($t.StartsWith('-')) { continue }
                    $f = ConvertTo-DfFullPath $t $call.cwd
                    if ($f -and (Test-Path -LiteralPath $f)) { $what = "git checkout $t overwrites uncommitted changes in that path"; break }
                }
            }
        }
        'restore' {
            $staged = @($a | Where-Object { $_ -in @('--staged', '-S') }).Count -gt 0
            $wt     = @($a | Where-Object { $_ -in @('--worktree', '-W') }).Count -gt 0
            if (-not $staged -or $wt) { $what = 'git restore overwrites uncommitted changes in the work tree' }
        }
        'clean' {
            $dry   = @($a | Where-Object { $_ -eq '--dry-run' -or ($_ -cmatch '^-[A-Za-z]+$' -and $_.Contains('n')) }).Count -gt 0
            $force = @($a | Where-Object { $_ -eq '--force' -or ($_ -cmatch '^-[A-Za-z]+$' -and $_.Contains('f')) }).Count -gt 0
            if ($force -and -not $dry) { $what = 'git clean -f deletes untracked files, and git cannot bring them back' }
        }
        'switch' {
            if (@($a | Where-Object { $_ -in @('--discard-changes', '-f', '--force') }).Count -gt 0) { $what = 'git switch --discard-changes throws away uncommitted changes' }
        }
        'stash' {
            $verb = if ($a.Count -gt 0 -and -not ([string]$a[0]).StartsWith('-')) { ([string]$a[0]).ToLowerInvariant() } else { 'push' }
            if ($verb -in @('drop', 'clear')) { $what = "git stash $verb deletes stashed work"; $always = $true }
            elseif ($verb -in @('push', 'save')) { $what = 'git stash moves uncommitted work out of sight' }
        }
    }
    if (-not $what) { return $null }
    if ($always) { $state = 'stashed work is in no commit' }
    else {
        $st = Invoke-DfGit $call.cwd @('status', '--porcelain')
        # Not a repository, or git failed: git itself refuses or reports it. No opinion here.
        if ($st.code -ne 0) { return $null }
        $n = @($st.out | Where-Object { $_ }).Count
        if ($n -eq 0) { return $null }
        $state = "the work tree at $($call.cwd) has $n uncommitted or untracked change(s)"
    }
    $reason = "BLOCKED - $what, and $state.`n`n" +
              "SAFE-06: never tidy, reset or consolidate a dirty tree on your own initiative; some trees are " +
              "dirty on purpose, to protect something that works. Leave the tree as it is. Tell $owner what you " +
              "wanted to do and why; if he wants it, he runs it by hand. To look without changing anything: " +
              "git status, git diff, git stash list."
    return (New-DfDeny 'guard' "dirty tree ($what)" $reason)
}

# ============================================================================ (8) scheduling
# anchor: no-schedule  mode: deny  verbs: schedule
# SAFE-08, opt-in: active only when the brain sets forbidScheduling true. Refuses a command that
# makes something start on a timer, at boot or at login: schtasks /create or /change,
# Register-ScheduledTask and its relatives, crontab (except -l), a Run or RunOnce registry value,
# sc create / sc config, New-Service, systemctl enable, launchctl load / bootstrap / enable, and
# anything that names the Startup folder. An Edit or Write inside the Startup folder is refused too.
# Cannot see: the shell residual, the Task Scheduler window, and session tools (CronCreate, /loop)
# that the owner starts himself.
$script:DfStartupRx = '(?i)([\\/])Start Menu[\\/]Programs[\\/]Startup([\\/]|$)|shell:(common )?startup'
$script:DfRunKeyRx  = '(?i)\\CurrentVersion\\Run(Once|Services|ServicesOnce)?(\\|$)'
$script:DfScheduleHeads = @('register-scheduledtask', 'set-scheduledtask', 'enable-scheduledtask', 'register-scheduledjob', 'new-service')

function New-DfScheduleDeny([string]$what, [string]$owner) {
    $reason = "BLOCKED - $what.`n`n" +
              "SAFE-08: nothing runs on a timer, a cron, at boot or at login. $owner starts every tool himself. " +
              "If something must start by itself, that is $owner's decision: say what and why, and he sets it up by hand."
    return (New-DfDeny 'guard' "scheduling ($what)" $reason)
}

function Test-DfScheduleRuleShell([string[]]$tokens, [string]$owner) {
    if (-not $tokens -or $tokens.Count -eq 0) { return $null }
    $i = 0
    if ($tokens[0] -eq '&' -and $tokens.Count -gt 1) { $i = 1 }
    $head = ((Get-DfLeaf $tokens[$i]) -replace '(?i)\.exe$', '').ToLowerInvariant()
    $rest = if ($i + 1 -lt $tokens.Count) { @($tokens[($i + 1)..($tokens.Count - 1)]) } else { @() }
    foreach ($t in $tokens) { if ($t -match $script:DfStartupRx) { return (New-DfScheduleDeny "this command names the Startup folder ($t)" $owner) } }
    switch ($head) {
        'schtasks' { if (@($rest | Where-Object { $_ -match '(?i)^[/-](create|change)$' }).Count -gt 0) { return (New-DfScheduleDeny 'schtasks creates or changes a scheduled task' $owner) } }
        'crontab'  { if ('-l' -notin $rest) { return (New-DfScheduleDeny 'crontab installs or edits a cron table' $owner) } }
        'reg'      { if ($rest.Count -gt 0 -and $rest[0] -ieq 'add' -and @($rest | Where-Object { $_ -match $script:DfRunKeyRx }).Count -gt 0) { return (New-DfScheduleDeny 'reg add writes a Run key, which starts a program at login' $owner) } }
        'sc'       { if ($rest.Count -gt 0 -and $rest[0] -in @('create', 'config')) { return (New-DfScheduleDeny "sc $($rest[0]) installs or changes a service" $owner) } }
        'systemctl' { if ('enable' -in $rest) { return (New-DfScheduleDeny 'systemctl enable starts a unit at boot' $owner) } }
        'launchctl' { if (@($rest | Where-Object { $_ -in @('load', 'bootstrap', 'enable') }).Count -gt 0) { return (New-DfScheduleDeny 'launchctl loads an agent that starts by itself' $owner) } }
    }
    if ($head -in $script:DfScheduleHeads) { return (New-DfScheduleDeny "$($tokens[$i]) registers something that starts by itself" $owner) }
    if ($head -in @('new-itemproperty', 'set-itemproperty', 'new-item') -and @($rest | Where-Object { $_ -match $script:DfRunKeyRx }).Count -gt 0) {
        return (New-DfScheduleDeny "$($tokens[$i]) writes a Run key, which starts a program at login" $owner)
    }
    return $null
}

function Test-DfScheduleRuleFile([string]$full, [string]$owner) {
    if ($full -and $full -match $script:DfStartupRx) { return (New-DfScheduleDeny "this writes into the Startup folder ($full)" $owner) }
    return $null
}

# ============================================================================ (9) content rules
# anchor: content-rule  mode: deny  verbs: place-order
# Brain-configured (contentRules in doctor.config.json). A rule names a scope (under, except,
# exceptParts, extensions), a pattern and the clause it serves. An Edit, Write or NotebookEdit in
# scope is refused when its new text holds MORE matches of the pattern than the text it replaces,
# so a rewrite of a file that already holds a match is not blocked; only an addition is. With
# shell true, a command run from a folder in scope is refused when its text matches.
# Cannot see: code written outside the scope, a script on disk that is then run, the shell
# residual, and an addition that also removes an equal number of matches in the same edit.
function Test-DfContentScope([string]$full, $rule) {
    if (-not $full) { return $false }
    $in = $false
    foreach ($u in @($rule.under)) { if (Test-DfUnder $full $u) { $in = $true; break } }
    if (-not $in) { return $false }
    foreach ($x in @($rule.except)) { if (Test-DfUnder $full $x) { return $false } }
    if (@($rule.exceptParts).Count -gt 0) {
        foreach ($part in ($full -split '[\\/]')) { if (@($rule.exceptParts | Where-Object { $_ -ieq $part }).Count -gt 0) { return $false } }
    }
    return $true
}

function Test-DfContentRuleFile([string]$tool, $ti, [string]$full, $rules, [string]$owner) {
    if (-not $full) { return $null }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    foreach ($rule in @($rules)) {
        if (@($rule.extensions).Count -gt 0 -and $rule.extensions -notcontains $ext) { continue }
        if (-not (Test-DfContentScope $full $rule)) { continue }
        $old = ''; $new = ''
        switch ($tool) {
            'Write' { $new = [string]$ti.content; if (Test-Path -LiteralPath $full -PathType Leaf) { try { $old = [IO.File]::ReadAllText($full) } catch { $old = '' } } }
            'Edit' { $new = [string]$ti.new_string; $old = [string]$ti.old_string }
            'NotebookEdit' { $new = [string]$ti.new_source }
        }
        $nNew = $rule.regex.Matches($new).Count
        if ($nNew -eq 0) { continue }
        $nOld = if ($old) { $rule.regex.Matches($old).Count } else { 0 }
        if ($nNew -le $nOld) { continue }
        $hit = $rule.regex.Match($new).Value
        $reason = "BLOCKED - $($rule.id): this adds '$hit' to $full.`n`n$($rule.why)`n`n" +
                  "If this file is a deliberate exception, $owner adds its folder to this rule's except list in " +
                  "contentRules in the brain's doctor.config.json first, as a recorded change."
        return (New-DfDeny 'guard' "$($rule.id) ($hit)" $reason)
    }
    return $null
}

function Test-DfContentRuleShell([string]$cmd, [string]$cwd, $rules, [string]$owner) {
    if ([string]::IsNullOrWhiteSpace($cmd)) { return $null }
    foreach ($rule in @($rules)) {
        if (-not $rule.shell) { continue }
        if (-not (Test-DfContentScope $cwd $rule)) { continue }
        $m = $rule.regex.Match($cmd)
        if (-not $m.Success) { continue }
        $reason = "BLOCKED - $($rule.id): this command, run from $cwd, holds '$($m.Value)'.`n`n$($rule.why)"
        return (New-DfDeny 'guard' "$($rule.id) ($($m.Value))" $reason)
    }
    return $null
}
