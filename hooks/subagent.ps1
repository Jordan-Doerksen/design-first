# subagent.ps1 - design-first SubagentStart hook: a subagent inherits the session's law (DES-13).
#
# A subagent gets its brief and nothing else: no root CLAUDE.md, no entry path, no routed law.
# This hook reads the session's route file (written by route.ps1) and injects, before the
# subagent's first prompt, the rows of every group active in the session plus the groups the
# policy marks alwaysForSubagents (the prohibitions by default). Same cap as the router. The host
# re-injects after the subagent's own compaction.
#
# Failure policy: an internal error injects nothing law-shaped, logs an ERROR line and says so.
#
# anchor: subagent-law  mode: advise  verbs: route-law

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

function Write-SubagentContext([string]$text) {
    @{ hookSpecificOutput = @{ hookEventName = 'SubagentStart'; additionalContext = $text } } | ConvertTo-Json -Depth 4 -Compress | Write-Output
}

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\law-rows.ps1')

    $raw = ''
    try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { }
    $j = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $j = $raw | ConvertFrom-Json } catch { $j = $null } }
    $sessionId = if ($j -and $j.session_id) { [string]$j.session_id } else { 'unknown' }
    $agentType = if ($j -and $j.agent_type) { [string]$j.agent_type } else { 'subagent' }

    $ptr = Read-DfPointer
    if ($null -eq $ptr.pointer) { exit 0 }
    $kitRoot = Get-DfKitRoot $ptr
    $pol = Read-DfRoutePolicy $ptr $kitRoot
    $policy = $pol.policy
    $maxChars = 9500
    if ($policy.maxChars) { [void][int]::TryParse([string]$policy.maxChars, [ref]$maxChars); if ($maxChars -le 0 -or $maxChars -gt 9800) { $maxChars = 9500 } }

    $wanted = [Collections.Generic.List[string]]::new()
    foreach ($g in @($policy.alwaysForSubagents)) { if ($g -and -not $wanted.Contains([string]$g)) { $wanted.Add([string]$g) } }
    foreach ($g in (Read-DfActiveRoutes $sessionId)) { if (-not $wanted.Contains($g)) { $wanted.Add($g) } }
    if ($wanted.Count -eq 0) { exit 0 }

    $law = Get-DfLawPath $ptr $kitRoot
    $groups = Read-DfLawGroups $law
    $out = [Text.StringBuilder]::new()
    [void]$out.AppendLine(("You are a design-first subagent ({0}). The brief is your spec; these are the law groups active in the session that spawned you. Cite ids; open the full text only when a clause bears on your task." -f $agentType))
    [void]$out.AppendLine()
    $injected = @(); $deferred = @()
    foreach ($g in $wanted) {
        if (-not $groups.Contains($g)) { continue }
        $text = Format-DfLawGroup $g $groups[$g] $ptr $kitRoot
        if (($out.Length + $text.Length + 2) -gt $maxChars) { $deferred += $g; continue }
        [void]$out.AppendLine($text); [void]$out.AppendLine(); $injected += $g
    }
    if ($injected.Count -eq 0) { exit 0 }
    if ($deferred.Count -gt 0) { [void]$out.AppendLine(("Over the size cap, not injected: {0}; index at {1}." -f ($deferred -join ', '), $law)) }
    Write-SubagentContext $out.ToString().TrimEnd()
}
catch {
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR subagent {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    Write-SubagentContext "design-first subagent hook hit an internal error and injected no law: $msg. Logged to the design-first hooks log."
}
exit 0
