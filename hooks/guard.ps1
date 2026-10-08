# guard.ps1 - design-first PreToolUse guard (Edit | Write | NotebookEdit | Bash | PowerShell).
#
# This one refuses. Four rules, in this order, every one of them a cost already paid somewhere:
#   1. stage-secret  - git add / git commit -a of a file that looks like a credential.
#   2. git-history   - gc --prune, reflog expire, force push, remote branch deletion.
#   3. env-write     - writing a .env that git does not ignore, or that git already tracks.
#   4. frozen-path   - an edit or destructive command inside a frozen or tombstoned path.
# Rules 1-3 run with or without a brain. Rule 4 needs the brain's doctor.config.json; without
# one it is skipped and says so once per session.
#
# What this hook cannot see (the written residual, self-tested as NOT denied so nobody believes
# otherwise): command strings nested in another shell (cmd /c "...", pwsh -c "...", bash -c "..."),
# xargs, $(...) and backtick substitutions, user git aliases, and scripts the agent writes to disk
# and then runs. Secret files created by cp or echo > are not seen here either; they are caught at
# staging by rule 1's wildcard probe.
#
# Failure policy: the body is wrapped. An internal error ALLOWS the call, appends an ERROR line to
# the hooks log and says so on both channels. Deliberately not fail-closed, never silent.

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$script:DfAdvisories = @()
$result = $null

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\tokenise.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-rules.ps1')

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
        $cfg = @{ present = $false; protected = @(); exceptions = @(); reason = "doctor.config.json unreadable: $($_.Exception.Message)" }
        Write-DfLog 'ERROR' 'guard' $cfg.reason
        Add-DfAdvisory 'brain config unreadable, path rules skipped' "$($cfg.reason). Inline rules still ran."
    }
    $owner = Get-DfOwnerName $ptr.brain

    if ($tool -in @('Edit', 'Write', 'NotebookEdit')) {
        $fp = if ($tool -eq 'NotebookEdit') { [string]$ti.notebook_path } else { [string]$ti.file_path }
        $full = ConvertTo-DfFullPath $fp $cwd
        if (-not $result) { $result = Test-DfEnvWriteRule $full $cfg.exceptions $owner }
        if (-not $result -and $cfg.present) { $result = Test-DfPathRuleFile $full $cfg.protected $owner }
        if (-not $result) {
            # Rules 5 and 6 advise; they never deny. Brain tunables when present, built-in defaults otherwise.
            $exts  = if ($cfg.sourceExtensions -and @($cfg.sourceExtensions).Count -gt 0) { @($cfg.sourceExtensions) } else { $script:DfDefaultSourceExtensions }
            $split = if ($cfg.splitLines) { [int]$cfg.splitLines } else { 500 }
            $skip  = @($ptr.brain) + @(if ($ptr.pointer -and $ptr.pointer.pluginRoot) { [string]$ptr.pointer.pluginRoot })
            Test-DfManifestRule $full $exts $sessionId $owner $skip
            Test-DfSizeRule $tool $ti $full $exts $split
        }
    }
    elseif ($tool -in @('Bash', 'PowerShell')) {
        $cmd = [string]$ti.command
        if (-not [string]::IsNullOrWhiteSpace($cmd)) {
            $subs = Split-DfCommand $cmd $tool
            foreach ($tokens in $subs) {
                $call = Get-DfGitCall $tokens $cwd
                if ($call) {
                    if (-not $result) { $result = Test-DfStagingRule $call $cfg.exceptions $owner }
                    if (-not $result) { $result = Test-DfHistoryRule $call $owner }
                }
                if (-not $result -and $cfg.present) { $result = Test-DfPathRuleShell $tokens $call $cwd $cfg.protected $owner }
                if ($result) { break }
            }
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
    # "path<TAB>flags". route.ps1 clears it at each prompt. A DECISIONS.md write whose new text carries
    # a Change Log row ("| 2026-10-08 | ...") is flagged, so the Stop card can tell a Change Request
    # from a drift edit without diffing the file.
    if (-not $result -and $tool -in @('Edit', 'Write', 'NotebookEdit') -and $full) {
        $flags = ''
        if ((Split-Path -Leaf $full) -ieq 'DECISIONS.md') {
            $newText = if ($tool -eq 'Write') { [string]$ti.content } else { [string]$ti.new_string }
            if ($newText -match '(?m)^\|\s*\d{4}-\d{2}-\d{2}\s*\|') { $flags = 'changelog' }
        }
        $ledger = Join-Path (Get-DfMarkerDir) ((($sessionId -replace '[^A-Za-z0-9_.-]', '_')) + '.edits')
        Add-DfTextLine $ledger ("{0}`t{1}" -f $full, $flags)
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
    $body = "guard hook hit an internal error and ALLOWED this call without inspecting it: $msg. Logged to the design-first hooks log."
    @{
        systemMessage      = "GUARD: internal error, call allowed ($msg)"
        hookSpecificOutput = @{ hookEventName = 'PreToolUse'; additionalContext = $body }
    } | ConvertTo-Json -Depth 5 -Compress
}
exit 0
