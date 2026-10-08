# ask.ps1 - design-first PreToolUse hook for AskUserQuestion (OWN-04).
#
# One question at a time. A call that carries more than one question is refused with the count,
# so the agent re-issues the first question alone and asks the next one after the answer. The
# multiple-choice shape and the recommended-default-first rule are the owner's to judge; this
# hook sees only the count. Non-AskUserQuestion payloads exit silently.
#
# Failure policy: an internal error ALLOWS the call, logs an ERROR line and says so.
#
# anchor: one-question  mode: deny  verbs: ask

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'empty stdin (no tool call payload)' }
    $j = $raw | ConvertFrom-Json
    if ([string]$j.tool_name -ne 'AskUserQuestion') { exit 0 }
    $ti = $j.tool_input
    $n = 0
    if ($null -ne $ti -and $ti.PSObject.Properties['questions']) { $n = @($ti.questions).Count }
    if ($n -le 1) { exit 0 }
    $ptr = Read-DfPointer
    $owner = Get-DfOwnerName $ptr.brain
    $reason = ("This call carries {0} questions. {1} answers one question at a time, as multiple choice, recommended default first (OWN-04). " +
               "Ask the first question alone now; ask the next one after the answer.") -f $n, $owner
    Add-DfTextLine (Get-DfFenceLogPath) ("{0}  BLOCKED[ASK: {1} questions in one call]" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $n)
    Write-DfJson (New-DfDeny 'ask' "$n questions in one call" $reason)
}
catch {
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR ask {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    @{
        systemMessage      = "ASK: internal error, call allowed ($msg)"
        hookSpecificOutput = @{ hookEventName = 'PreToolUse'; additionalContext = "ask hook hit an internal error and ALLOWED this call without inspecting it: $msg. Logged to the design-first hooks log." }
    } | ConvertTo-Json -Depth 5 -Compress
}
exit 0
