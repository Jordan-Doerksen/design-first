# agent.ps1 - design-first PreToolUse hook for the Agent tool (subagent spawns).
#
# Three rules, in this order. Every one is a cost already paid: 516 subagents in two weeks, 97% on
# the most expensive model, briefs with no done-check, one session spawning 33.
#   1. agent-brief  - DENY a spawn whose brief lacks the contract headings (Goal:, Files: or Area:,
#                     Done when:, Ruled out:). Search-type agents need only Goal: and Done when:.
#   2. agent-route  - when the call names no model, set one from the brain's role table
#                     (updatedInput). A model named on the call always wins.
#   3. agent-cap    - count spawns per turn (session_id + prompt_id); above the cap, ASK the owner,
#                     naming the count and the models so far.
# Tunables live in <brain>/agent-policy.json. With no brain the kit template is the policy, and the
# hook says so once per session. Nested spawns (agent_id present) are checked and counted the same.
#
# What this hook cannot see: whether the host honours updatedInput.model for the Agent tool. That
# is proven by a live probe (a spawn whose first line reports its own model), not by this file.
# Failure policy: an internal error ALLOWS the call, logs an ERROR line and says so on both channels.
#
# anchor: agent-brief  mode: deny  verbs: parallelise,spawn
# anchor: agent-route  mode: advise  verbs: route-model
# anchor: agent-cap  mode: gate  verbs: cap-spawn

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

function Read-AgentPolicy($ptr) {
    # Brain policy first; the kit template as the fallback. Returns @{ policy; source; fromBrain }.
    $kitTemplate = Join-Path (Split-Path -Parent $PSScriptRoot) 'templates\agent-policy.json'
    $candidates = @()
    if ($ptr.brain) { $candidates += @{ path = (Join-Path $ptr.brain 'agent-policy.json'); fromBrain = $true } }
    $candidates += @{ path = $kitTemplate; fromBrain = $false }
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c.path -PathType Leaf) {
            $p = Get-Content -LiteralPath $c.path -Raw -Encoding utf8 | ConvertFrom-Json
            return @{ policy = $p; source = $c.path; fromBrain = $c.fromBrain }
        }
    }
    throw "no agent policy: neither <brain>\agent-policy.json nor $kitTemplate exists"
}

function Test-Heading([string]$prompt, [string]$spec) {
    # $spec is "Goal:" or "Files:|Area:". A heading counts only at the start of a line, after
    # optional list or emphasis markers, so prose that mentions the word does not satisfy it.
    foreach ($alt in ($spec -split '\|')) {
        $word = [regex]::Escape($alt.TrimEnd(':').Trim())
        if ($prompt -match ('(?im)^[\s\-\*#>_]*' + $word + '\s*\**\s*:')) { return $true }
    }
    return $false
}

function Get-RequiredHeadings($policy, [string]$type) {
    $light = @($policy.brief.lightTypes | ForEach-Object { [string]$_ })
    if ($light -contains $type) { return @($policy.brief.lightRequired | ForEach-Object { [string]$_ }) }
    return @($policy.brief.required | ForEach-Object { [string]$_ })
}

function Get-Route($policy, [string]$type) {
    # Returns a model name, or 'inherit'. Explicit per-type route first, then the default.
    if ($policy.routes -and $policy.routes.PSObject.Properties[$type]) { return [string]$policy.routes.$type }
    if ($policy.routes -and $policy.routes.PSObject.Properties['default']) { return [string]$policy.routes.default }
    return 'inherit'
}

function Get-TurnCounterPath([string]$sessionId, [string]$promptId) {
    $dir = Get-DfMarkerDir
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if ([string]::IsNullOrWhiteSpace($promptId)) { $promptId = 'hour-' + (Get-Date).ToString('yyyyMMddHH') }
    $safe = (($sessionId + '.' + $promptId) -replace '[^A-Za-z0-9_.-]', '_')
    return (Join-Path $dir "$safe.spawns")
}

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')

    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'empty stdin (no tool call payload)' }
    $j = $raw | ConvertFrom-Json
    if ([string]$j.tool_name -ne 'Agent') { exit 0 }
    $ti = $j.tool_input
    if ($null -eq $ti) { throw "payload has no tool_input (tool_name='Agent')" }
    $sessionId = [string]$j.session_id
    $promptId  = [string]$j.prompt_id
    $nested    = -not [string]::IsNullOrWhiteSpace([string]$j.agent_id)

    $type   = if ($ti.PSObject.Properties['subagent_type'] -and $ti.subagent_type) { [string]$ti.subagent_type } else { 'general-purpose' }
    $prompt = if ($ti.PSObject.Properties['prompt']) { [string]$ti.prompt } else { '' }
    $named  = if ($ti.PSObject.Properties['model'] -and $ti.model) { [string]$ti.model } else { '' }

    $ptr = Read-DfPointer
    $pol = Read-AgentPolicy $ptr
    $policy = $pol.policy
    $owner = Get-DfOwnerName $ptr.brain

    # ---------------------------------------------------------------- 1. brief contract (deny)
    $required = Get-RequiredHeadings $policy $type
    $missing = @($required | Where-Object { -not (Test-Heading $prompt $_) })
    if ($missing.Count -gt 0) {
        $reason = ("A subagent brief must carry these headings at line start: {0}. Missing for agent type '{1}': {2}. " +
                   "Write the brief with every heading on its own line (for example 'Done when: the self-test passes and the output is pasted'), then spawn again. " +
                   "This is $owner's rule DES-11; the policy is {3}.") -f ($required -join ', '), $type, ($missing -join ', '), $pol.source
        $deny = New-DfDeny 'agent' ("brief rejected ({0} missing)" -f ($missing -join ', ')) $reason
        Add-DfTextLine (Get-DfFenceLogPath) ("{0}  BLOCKED[AGENT: brief rejected, {1}, type {2}]" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), ($missing -join ', '), $type)
        Write-DfJson $deny
        exit 0
    }

    # The kit-defaults notice is claimed here, after the brief check, so a denied first call (whose
    # reason already names the policy source) does not use up the once-per-session marker.
    $advisories = @()
    if (-not $pol.fromBrain -and (Test-DfFirstTime $sessionId 'agentpolicy')) {
        $advisories += @{ title = 'no brain policy, kit defaults in use'
                          body  = "No brain policy, kit defaults in use: design-first found no <brain>\agent-policy.json, so the kit template at $($pol.source) is the policy for this session. Run /design-first:adopt, or copy the template into the brain, to tune routes and the cap." }
    }

    # ---------------------------------------------------------------- 3. cap (counted before routing so the ask can list models)
    $cap = 0
    if ($policy.cap -and $policy.cap.PSObject.Properties['perTurn']) { [void][int]::TryParse([string]$policy.cap.perTurn, [ref]$cap) }
    $route = Get-Route $policy $type
    $effective = if ($named) { $named } elseif ($route -ne 'inherit') { $route } else { 'inherit' }
    $counter = Get-TurnCounterPath $sessionId $promptId
    $prior = @()
    if (Test-Path -LiteralPath $counter -PathType Leaf) { $prior = @(Get-Content -LiteralPath $counter -Encoding utf8 | Where-Object { $_.Trim() }) }
    $n = $prior.Count + 1
    $nestedTag = if ($nested) { ' nested' } else { '' }
    if ($cap -gt 0 -and $n -gt $cap) {
        $models = @($prior | ForEach-Object { ($_ -split '\t')[0] })
        $summary = ($models | Group-Object | ForEach-Object { "{0} x{1}" -f $_.Name, $_.Count }) -join ', '
        $reason = ("Spawn {0} of this turn, cap {1} (policy {2}). So far: {3}. Type now: {4}, model {5}{6}. " +
                   "Say yes to allow it, or reshape the work: one agent per independent decision, not per file; a script for anything deterministic.") -f $n, $cap, $pol.source, $summary, $type, $effective, $nestedTag
        Add-DfTextLine $counter ("{0}`t{1}`tASKED" -f $effective, $type)
        Add-DfTextLine (Get-DfFenceLogPath) ("{0}  ASK[AGENT: spawn {1} over cap {2}]" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $n, $cap)
        Write-DfJson ([ordered]@{
            systemMessage      = "AGENT: spawn $n over the cap of $cap this turn"
            hookSpecificOutput = [ordered]@{ hookEventName = 'PreToolUse'; permissionDecision = 'ask'; permissionDecisionReason = $reason }
        })
        exit 0
    }
    Add-DfTextLine $counter ("{0}`t{1}" -f $effective, $type)
    $capText = if ($cap -gt 0) { "spawn $n of $cap this turn" } else { "spawn $n this turn, no cap" }

    # ---------------------------------------------------------------- 2. routing (rewrite when the call names no model)
    if (-not $named -and $route -ne 'inherit') {
        $updated = [ordered]@{}
        foreach ($p in $ti.PSObject.Properties) { $updated[$p.Name] = $p.Value }
        $updated['model'] = $route
        $body = "design-first routed agent type '$type' to model '$route' (brain role table: $($pol.source)); $capText$nestedTag. Name a model on the call to override."
        if ($advisories.Count -gt 0) { $body = (@($advisories | ForEach-Object { $_.body }) -join "`n`n") + "`n`n" + $body }
        Write-DfJson ([ordered]@{
            systemMessage      = "AGENT: $type -> $route, $capText"
            hookSpecificOutput = [ordered]@{ hookEventName = 'PreToolUse'; permissionDecision = 'allow'; permissionDecisionReason = "routed by design-first agent policy"; updatedInput = $updated; additionalContext = $body }
        })
        exit 0
    }

    # Inherit, or a model named on the call: pass through with the count on both channels.
    $why = if ($named) { "model '$named' named on the call" } else { "type '$type' inherits the session model by policy" }
    $items = @($advisories) + @(@{ title = "$capText, $why"; body = "design-first: $capText; $why$nestedTag." })
    Write-DfJson (New-DfAdvisory 'agent' $items)
}
catch {
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR agent {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    $body = "agent hook hit an internal error and ALLOWED this call without inspecting it: $msg. Logged to the design-first hooks log."
    @{
        systemMessage      = "AGENT: internal error, call allowed ($msg)"
        hookSpecificOutput = @{ hookEventName = 'PreToolUse'; additionalContext = $body }
    } | ConvertTo-Json -Depth 5 -Compress
}
exit 0
