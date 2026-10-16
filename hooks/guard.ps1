# guard.ps1 - design-first PreToolUse guard (Edit | Write | NotebookEdit | Bash | PowerShell).
#
# This one refuses. The deny rules, in this order, every one of them a cost already paid somewhere:
#   1. stage-secret  - git add / git commit -a of a file that looks like a credential.
#   2. git-history   - gc --prune, reflog expire, force push, remote branch deletion.
#   3. env-write     - writing a .env that git does not ignore, or that git already tracks.
#   4. frozen-path   - an edit or destructive command inside a frozen or tombstoned path.
#   7. dirty-tree    - reset --hard/--merge/--keep, checkout -- <path>, restore, clean -f,
#                      switch --discard-changes, stash on a dirty tree; stash drop and stash clear
#                      always (SAFE-06).
#   8. no-schedule   - a scheduled task, cron, Run key, service or Startup-folder entry (SAFE-08).
#   9. content-rule  - an edit that adds text a brain content rule bans in its scope (SAFE-02).
#  10. design-gate   - a source Edit, Write or NotebookEdit in a repository whose DECISIONS.md (root
#                      or docs\) declares a design gate that is not cleared, and an Edit or Write
#                      that removes that line while it is not cleared (GATE-08, GATE-09).
#  11. loop-no-push  - git push (or send-pack), merge or pull on a loop branch, or naming a loop
#                      branch from any branch; push --all, --mirror or a glob that covers one; on a
#                      loop branch, a checkout, switch, worktree add, rebase with a branch, bisect
#                      or fetch into a local branch that leaves it or moves another branch onto its
#                      work; a branch rename, copy or forced move, or a ref written by hand, on a
#                      loop branch or naming one; a fetch that writes a loop branch (AUTO-11). A
#                      rebase or bisect of a loop branch stopped at a detached HEAD counts as that
#                      branch.
#                      The git commands that move HEAD or a branch are open-ended: the list in
#                      lib\guard-loop-rules.ps1 is what is covered, and any other is a residual.
#  12. ledger        - an Edit, Write or NotebookEdit to the story ledger on a loop branch (AUTO-04).
# Rules 1-3, 7 and 10-12 run with or without a brain. Rule 4 needs the brain's doctor.config.json;
# without one it is skipped and says so once per session. Rules 8 and 9 run only when the brain
# turns them on (forbidScheduling, contentRules). Rules 5 and 6 advise and never deny. Rules 7-9
# live in lib\guard-owner-rules.ps1, rule 10 in lib\guard-gate-rules.ps1, rules 11 and 12 in
# lib\guard-loop-rules.ps1.
#
# What this hook cannot see (the written residual, self-tested as NOT denied so nobody believes
# otherwise): command strings nested in another shell (cmd /c "...", pwsh -c "...", bash -c "..."),
# xargs, $(...) and backtick substitutions, user git aliases, and scripts the agent writes to disk
# and then runs. Secret files created by cp or echo > are not seen here either; they are caught at
# staging by rule 1's wildcard probe. Rules 3, 10 and 12 read file-tool calls only: a plain shell
# write (a redirect, Set-Content, cp) of a .env, of source behind an open design gate, or of the
# story ledger is not inspected. Rule 4 compares path strings after ConvertTo-DfFullPath, which maps
# a \\?\ or \\.\ prefix, \\?\UNC\, this machine's admin share (\\localhost\C$, \\127.0.0.1\C$) and
# a PowerShell provider path (FileSystem::C:\...) to the drive path. Another spelling of a frozen
# folder (an 8.3 short name, a junction or symbolic link, a subst or mapped drive, a \\?\Volume{...}
# path, this machine by its own name or another address) is not seen as that folder. Rule 4's shell
# form skips every token that starts with '-', so a PowerShell parameter with its value joined by a
# colon (Remove-Item -LiteralPath:C:\...) is not read either.
#
# Failure policy: the body is wrapped. An internal error ALLOWS the call, appends an ERROR line to
# the hooks log and says so on both channels. Deliberately not fail-closed, never silent. It also
# appends a line to <markers>/<session>.guard-error, so the Stop card says its count may be short.

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$script:DfAdvisories = @()
$result = $null

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\tokenise.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-rules.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-owner-rules.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-gate-rules.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-loop-rules.ps1')
    . (Join-Path $PSScriptRoot 'lib\turn-changes.ps1')

    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'empty stdin (no tool call payload)' }
    $j = $raw | ConvertFrom-Json
    $tool = [string]$j.tool_name
    $ti = $j.tool_input
    $sessionId = [string]$j.session_id
    $cwd = if ($j.cwd) { ConvertTo-DfFullPath ([string]$j.cwd) } else { (Get-Location).Path }
    if ($null -eq $ti) { throw "payload has no tool_input (tool_name='$tool')" }

    $ptr = Read-DfPointer
    if ($ptr.warning) { Add-DfAdvisory 'pointer unreadable' "$($ptr.warning). Inline rules still ran; path rules skipped." }
    # A broken brain config must not stop rules 1-3 (F1: the live guard exited before the inline
    # checks when its config was missing). Read it defensively; a parse error becomes an advisory.
    try { $cfg = Read-DfBrainConfig $ptr }
    catch {
        $cfg = @{ present = $false; protected = @(); exceptions = @(); readCeilingBytes = $script:DfReadCeilingDefault; readCeilingExempt = @(); reason = "doctor.config.json unreadable: $($_.Exception.Message)" }
        Write-DfLog 'ERROR' 'guard' $cfg.reason
        Add-DfAdvisory 'brain config unreadable, path rules skipped' "$($cfg.reason). Inline rules still ran."
    }
    $owner = Get-DfOwnerName $ptr.brain
    foreach ($p in @($cfg.contentRuleProblems)) { if ($p) { Write-DfLog 'ERROR' 'guard' $p; Add-DfAdvisory 'content rule unreadable, skipped' "$p. The other rules still ran." } }

    if ($tool -in @('Edit', 'Write', 'NotebookEdit')) {
        $fp = if ($tool -eq 'NotebookEdit') { [string]$ti.notebook_path } else { [string]$ti.file_path }
        $full = ConvertTo-DfFullPath $fp $cwd
        if (-not $result) { $result = Test-DfEnvWriteRule $full $cfg.exceptions $owner }
        if (-not $result -and $cfg.present) { $result = Test-DfPathRuleFile $full $cfg.protected $owner $cfg.tombstoned }
        if (-not $result -and $cfg.forbidScheduling) { $result = Test-DfScheduleRuleFile $full $owner }
        if (-not $result -and @($cfg.contentRules).Count -gt 0) { $result = Test-DfContentRuleFile $tool $ti $full $cfg.contentRules $owner }
        # Brain tunables when present, built-in defaults otherwise (rules 5, 6 and 10 share them).
        $exts  = if ($cfg.sourceExtensions -and @($cfg.sourceExtensions).Count -gt 0) { @($cfg.sourceExtensions) } else { $script:DfDefaultSourceExtensions }
        $ceiling = [int]$cfg.readCeilingBytes   # 0 turns the read check off (DES-03); the default lives in Read-DfBrainConfig
        $skip  = @($ptr.brain) + @(if ($ptr.pointer -and $ptr.pointer.pluginRoot) { [string]$ptr.pointer.pluginRoot })
        # Rule 10 denies: a source write in a repository whose design gate is declared and not cleared,
        # and an Edit or Write that removes the gate line from DECISIONS.md while it is not cleared.
        if (-not $result) { $result = Test-DfDesignGateRule $full $exts $owner $skip $tool $ti }
        # Rule 12 denies: the story ledger on the loop branch.
        if (-not $result) { $result = Test-DfLedgerRule $full $cfg.loopLedgerGlobs $cfg.loopBranchPrefix $owner }
        if (-not $result) {
            # Rules 5 and 6 advise; they never deny.
            Test-DfManifestRule $full $exts $sessionId $owner $skip
            Test-DfSizeRule $tool $ti $full $exts $ceiling @($cfg.readCeilingExempt) $sessionId
        }
    }
    elseif ($tool -in @('Bash', 'PowerShell')) {
        $cmd = [string]$ti.command
        if (-not [string]::IsNullOrWhiteSpace($cmd)) {
            $subs = Split-DfCommand $cmd $tool
            # The folder a sub-command runs in, after any cd before it in the same command line. Every
            # shell rule reads it: rules 1, 2, 4, 7, 11 and the shell content rule (rule 3 has no shell
            # form). Workaround (CR-2026-10-15-GAPS D1): rules 1-4 used to keep the tool call's cwd, so
            # 'cd <repo> && git add -A' probed the wrong folder, or no repository, and staged a secret.
            # A cd is followed only to a folder that exists. A target the hook cannot resolve (a
            # variable, a substitution such as "$(git rev-parse --show-toplevel)", a folder the same
            # command makes first) keeps the folder the rules had: followed, it named no repository,
            # every probe failed, and 'cd "$(git rev-parse --show-toplevel)" && git add -A' staged a
            # secret that the tool call's own folder would have shown.
            $runCwd = $cwd
            foreach ($tokens in $subs) {
                if ($tokens.Count -ge 2 -and $tokens[0] -in @('cd', 'Set-Location', 'sl', 'pushd', 'Push-Location', 'chdir')) {
                    $to = ConvertTo-DfFullPath ([string]$tokens[$tokens.Count - 1]) $runCwd
                    if ($to -and (Test-Path -LiteralPath $to -PathType Container)) { $runCwd = $to }
                }
                $call = Get-DfGitCall $tokens $runCwd
                if ($call) {
                    if (-not $result) { $result = Test-DfStagingRule $call $cfg.exceptions $owner }
                    if (-not $result) { $result = Test-DfHistoryRule $call $owner }
                    if (-not $result) { $result = Test-DfDirtyTreeRule $call $owner }
                    # Rule 11 denies: push (or send-pack), merge or pull on a loop branch or naming one from any branch,
                    # push --all or --mirror while a loop branch exists, and the commands that leave a
                    # loop branch or move a branch onto its work: checkout, switch, worktree add, rebase
                    # with a branch, bisect, fetch into a local branch, branch -m/-c/-f, update-ref and
                    # symbolic-ref (the full list, and its residual, in lib\guard-loop-rules.ps1).
                    if (-not $result) { $result = Test-DfLoopPushRule $call $cfg.loopBranchPrefix $owner }
                }
                if (-not $result -and $cfg.present) { $result = Test-DfPathRuleShell $tokens $call $runCwd $cfg.protected $owner }
                if (-not $result -and $cfg.forbidScheduling) { $result = Test-DfScheduleRuleShell $tokens $owner }
                if ($result) { break }
            }
            if (-not $result -and @($cfg.contentRules).Count -gt 0) { $result = Test-DfContentRuleShell $cmd $runCwd $cfg.contentRules $owner }
        }
    }

    # No brain: rules 1-3 ran above; rule 4 was skipped. Say so once per session (finding 63).
    if (-not $result -and -not $cfg.present -and (Test-DfFirstTime $sessionId 'advised')) {
        Add-DfAdvisory 'no brain, path rules skipped this session' `
            ("design-first found no brain ($($cfg.reason)). The staging, history and .env rules still run; " +
             "frozen and tombstoned path rules are skipped until a brain exists. Run /design-first:adopt to create one. " +
             "This notice appears once per session.")
    }

    # The edit ledger for stop.ps1: every ALLOWED Edit / Write / NotebookEdit of this turn, one line
    # "path<TAB>flags". route.ps1 clears it at each prompt. A DECISIONS.md write that ADDS a Change Log
    # row ("| 2026-10-08 | ...") is flagged, so the Stop card can tell a Change Request from a drift
    # edit when git cannot say (stop.ps1 prefers git's count). Only an edit inside a git repository, and
    # under the root when the pointer names one, is recorded (Get-DfLedgerRepo): a scratch file is not a change.
    if (-not $result -and $tool -in @('Edit', 'Write', 'NotebookEdit') -and $full -and (Get-DfLedgerRepo $full $ptr.root)) {
        $flags = ''
        if ((Split-Path -Leaf $full) -ieq 'DECISIONS.md') {
            # Workaround (CR-2026-10-15-GAPS D5): any dated row in the new text set the flag, and a Write
            # sends the whole file, so every Write that kept an old row, and every Edit that reworded one,
            # passed for a new Change Log entry and hid the GATE-06 line. Now the new text must hold more
            # dated rows than what it replaces: an Edit's old_string, or for a Write the file on disk
            # (none when the file is new). A file that cannot be read sets no flag: the card then asks.
            $rowRx = '(?m)^' + $script:DfRowRx
            if ($tool -eq 'Write') {
                $newText = [string]$ti.content
                $before = 0
                if (Test-Path -LiteralPath $full -PathType Leaf) { try { $before = [regex]::Matches([IO.File]::ReadAllText($full), $rowRx).Count } catch { $before = [int]::MaxValue } }
            } else {
                $newText = [string]$ti.new_string
                $before = [regex]::Matches([string]$ti.old_string, $rowRx).Count
            }
            if ([regex]::Matches($newText, $rowRx).Count -gt $before) { $flags = 'changelog' }
        }
        $ledger = Join-Path (Get-DfMarkerDir) ((($sessionId -replace '[^A-Za-z0-9_.-]', '_')) + '.edits')
        Add-DfTextLine $ledger ("{0}`t{1}" -f $full, $flags)
    }

    # Nominate the repositories this call points at (lib\turn-changes.ps1). The ledger above only
    # holds Edit and Write calls; a file a command changes is never in it. stop.ps1 asks git what
    # changed since the prompt in every nominated repository, so a script's edits are seen too.
    if (-not $result) {
        $noms = @()
        if ($tool -in @('Edit', 'Write', 'NotebookEdit')) { if ($full) { $noms = @(Find-DfRepoDir $full $ptr.root) } }
        elseif ($tool -in @('Bash', 'PowerShell') -and -not [string]::IsNullOrWhiteSpace([string]$ti.command)) { $noms = @(Get-DfShellRepos $subs $cwd $ptr.root) }
        Add-DfNominations $sessionId @($noms | Where-Object { $_ })
    }

    if ($result) {
        Add-DfTextLine (Get-DfFenceLogPath) ("{0}  BLOCKED[{1}]" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $result.systemMessage)
        Write-DfJson $result
    }
    elseif ($script:DfAdvisories.Count -gt 0) {
        Write-DfJson (New-DfAdvisory 'guard' $script:DfAdvisories)
    }
}
catch {
    # Internal error: allow, log, surface. Written inline so it works even when lib/ failed to load.
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR guard {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    # This call wrote no ledger line and no nomination, so the Stop card's count can be short. Say so
    # to the card: one line per failed call in <markers>/<session>.guard-error, which stop.ps1 counts
    # and route.ps1 clears at the next prompt (CR-2026-10-15-GAPS D5; a failure here used to drop the
    # call from the card without a word). Inline paths, as above, the same names as Get-DfSessionFile.
    try {
        # A library that fails to load throws before the payload is read; read it here, or the call
        # would count under 'unknown', a session no Stop card reads.
        if (-not $raw) { try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { } }
        $sid = if (-not [string]::IsNullOrWhiteSpace($sessionId)) { [string]$sessionId } elseif ($raw -and $raw -match '"session_id"\s*:\s*"([^"]+)"') { $Matches[1] } else { 'unknown' }
        $markerDir = if ($env:DF_MARKER_DIR) { $env:DF_MARKER_DIR } else { Join-Path $env:TEMP 'design-first' }
        if (-not (Test-Path -LiteralPath $markerDir)) { New-Item -ItemType Directory -Force -Path $markerDir | Out-Null }
        Add-Content -LiteralPath (Join-Path $markerDir (($sid -replace '[^A-Za-z0-9_.-]', '_') + '.guard-error')) -Value ("{0}`t{1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    $body = "guard hook hit an internal error and ALLOWED this call without inspecting it: $msg. Logged to the design-first hooks log."
    @{
        systemMessage      = "GUARD: internal error, call allowed ($msg)"
        hookSpecificOutput = @{ hookEventName = 'PreToolUse'; additionalContext = $body }
    } | ConvertTo-Json -Depth 5 -Compress
}
exit 0
