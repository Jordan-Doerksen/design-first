# subagent.ps1 - design-first SubagentStart hook: a subagent inherits the session's law (DES-13),
# and the clauses only a model can judge arrive with the role that judges them (advise-by-role).
#
# A subagent gets its brief and nothing else: no root CLAUDE.md, no entry path, no routed law.
# This hook reads the session's route file (written by route.ps1) and injects, before the
# subagent's first prompt, the rows of every group active in the session plus the groups the
# policy marks alwaysForSubagents (the prohibitions by default). Same cap as the router. The host
# re-injects after the subagent's own compaction.
#
# advise-by-role (CR-2026-10-13-HONOUR): every clause whose enforcedBy ref names this anchor is
# read from the kit's law.json (and the brain's overlay when there is one) and injected with one
# instruction per role. The Reviewer names each clause in its report as holding or as a finding
# with a place; a Builder is told the Reviewer will. That is the per-action half of ADVISE; the
# route hook's group rows are the per-session half. A clause that nothing reads at the moment it
# matters is HONOUR; a clause a named role must answer for is not.
#
# Failure policy: an internal error injects nothing law-shaped, logs an ERROR line and says so.
#
# anchor: subagent-law  mode: advise  verbs: route-law
# anchor: advise-by-role  mode: advise  verbs: decide,deliver,expose-action,configure,slice,scope-edit,annotate,confirm,diagnose,decide-scope,size-work,evidence,shape-log,log-negative,aggregate,locate-log,wear-hat,cite,taste,frontier

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

function Write-SubagentContext([string]$text) {
    @{ hookSpecificOutput = @{ hookEventName = 'SubagentStart'; additionalContext = $text } } | ConvertTo-Json -Depth 4 -Compress | Write-Output
}

# The clauses this anchor carries: from the kit's law.json, plus the brain's overlay clauses that
# name the same ref. Read from the source files, not from LAW.md, so a clause is injected exactly
# when its record says this hook enforces it.
function Read-DfAdviseClauses([string]$kitRoot, [string]$brain) {
    $ref = 'hooks/subagent.ps1#advise-by-role'
    $files = @((Join-Path $kitRoot 'law.json'))
    if ($brain) { $o = Join-Path $brain 'law.overlay.json'; if (Test-Path -LiteralPath $o -PathType Leaf) { $files += $o } }
    $out = [Collections.Generic.List[object]]::new()
    foreach ($f in $files) {
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
        $j = Get-Content -LiteralPath $f -Raw -Encoding utf8 | ConvertFrom-Json
        foreach ($c in @($j.clauses)) {
            $e = $c.PSObject.Properties['enforcedBy']
            if ($null -eq $e -or $null -eq $e.Value) { continue }
            if ([string]$e.Value.ref -ne $ref) { continue }
            $out.Add([pscustomobject]@{ id = [string]$c.id; verb = [string]$c.verb; rule = [string]$c.rule })
        }
    }
    return $out
}

function Format-DfAdvise($clauses, [bool]$isReviewer) {
    if ($clauses.Count -eq 0) { return '' }
    $sb = [Text.StringBuilder]::new()
    if ($isReviewer) {
        [void]$sb.AppendLine(("ADVISE clauses, {0} rules only a reader can judge. You are the Reviewer: your report carries an ADVISE section that names every id below as 'holds' or as a finding with file:line. An id you did not look at is BLOCKED, never PASS." -f $clauses.Count))
    } else {
        [void]$sb.AppendLine(("ADVISE clauses, {0} rules only a reader can judge. They bind this work; the Reviewer names each one in its report as holding or as a finding." -f $clauses.Count))
    }
    foreach ($c in $clauses) { [void]$sb.AppendLine(("- {0} ({1}): {2}" -f $c.id, $c.verb, $c.rule)) }
    return $sb.ToString().TrimEnd()
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
    $isReviewer = $agentType -match '(?i)reviewer'

    $ptr = Read-DfPointer
    if ($null -eq $ptr.pointer) { exit 0 }
    $kitRoot = Get-DfKitRoot $ptr
    $pol = Read-DfRoutePolicy $ptr $kitRoot
    $policy = $pol.policy
    $maxChars = 9500
    if ($policy.maxChars) { [void][int]::TryParse([string]$policy.maxChars, [ref]$maxChars); if ($maxChars -le 0 -or $maxChars -gt 9800) { $maxChars = 9500 } }

    $wanted = [Collections.Generic.List[string]]::new()
    foreach ($g in @($policy.alwaysForSubagents)) { if ($g -and -not $wanted.Contains([string]$g)) { $wanted.Add([string]$g) } }
    # A group the policy sends to every session (alwaysForSessions, OWN in the template) is about the
    # session's talk with the owner, and a subagent does not talk to the owner; the advise-by-role
    # block below already carries the clauses of that group a subagent answers for. Measured
    # 2026-10-14 with Format-DfLawGroup on the kit LAW.md: SAFE, DES, VCS and OBS rows plus the
    # advise block came to about 8,850 characters, under the 9,500 cap; the OWN rows add 1,209 and put
    # it near 10,050, over the cap, and the run.ps1 Reviewer case got the clause ids without their
    # text. List the group in alwaysForSubagents to send it anyway.
    $sessionOnly = @(@($policy.alwaysForSessions) | Where-Object { $_ } | ForEach-Object { [string]$_ })
    foreach ($g in (Read-DfActiveRoutes $sessionId)) {
        if ($sessionOnly -contains $g -and -not $wanted.Contains($g)) { continue }
        if (-not $wanted.Contains($g)) { $wanted.Add($g) }
    }

    $out = [Text.StringBuilder]::new()
    [void]$out.AppendLine(("You are a design-first subagent ({0}). The brief is your spec; these are the law groups active in the session that spawned you. Cite ids; open the owning file for the full text." -f $agentType))
    [void]$out.AppendLine()
    $injected = @(); $deferred = @()
    if ($wanted.Count -gt 0) {
        $law = Get-DfLawPath $ptr $kitRoot
        $groups = Read-DfLawGroups $law
        foreach ($g in $wanted) {
            if (-not $groups.Contains($g)) { continue }
            $text = Format-DfLawGroup $g $groups[$g] $ptr $kitRoot
            if (($out.Length + $text.Length + 2) -gt $maxChars) { $deferred += $g; continue }
            [void]$out.AppendLine($text); [void]$out.AppendLine(); $injected += $g
        }
        if ($deferred.Count -gt 0) { [void]$out.AppendLine(("Over the size cap, not injected: {0}; index at {1}." -f ($deferred -join ', '), $law)); [void]$out.AppendLine() }
    }

    # advise-by-role: after the groups, inside the same cap. Over the cap, the ids are named so
    # the Reviewer still knows what it must answer for.
    $advise = Read-DfAdviseClauses $kitRoot $ptr.brain
    $adviseInjected = $false
    if ($advise.Count -gt 0) {
        $text = Format-DfAdvise $advise $isReviewer
        if (($out.Length + $text.Length + 2) -le $maxChars) { [void]$out.AppendLine($text); $adviseInjected = $true }
        else { [void]$out.AppendLine(("ADVISE clauses over the size cap, not injected; the ids a Reviewer must answer for: {0}. Full text in {1}." -f (($advise | ForEach-Object { $_.id }) -join ', '), (Join-Path $kitRoot 'law.json'))); $adviseInjected = $true }
    }

    if ($injected.Count -eq 0 -and -not $adviseInjected) { exit 0 }
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
