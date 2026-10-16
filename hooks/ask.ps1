# ask.ps1 - design-first PreToolUse hook for AskUserQuestion (OWN-04).
#
# The shape of a question to the owner. A call is refused, with the reason the model sees, when:
#   - it carries more than one question (one at a time; ask the next after the answer);
#   - an option's description is shorter than the minimum (a label is not a reason: each option
#     says what it gives, what it costs and who would pick it);
#   - the question, a label or a description offers the options as equally fine (a negated or
#     quoted phrase, or one in a sentence that holds a contrast word, is not a tie);
#   - the first option's label does not hold the recommended marker (a word match, so a label
#     that says "not recommended" also passes).
# A multi-select question is held to the same rules: each option carries its reason, and the
# first option's label carries the recommended marker; the order of the other options is not
# checked.
# The minimum, the phrases and the marker are the brain's `ask` config (defaults in
# lib\common.ps1, Get-DfAskDefaults). What this hook cannot see is written in the owning file:
# reasons given in plain text or above a host's next-step box, and whether a reason is a good one.
# Non-AskUserQuestion payloads exit silently.
#
# An allowed question also writes the session's interview marker (<markers>/<session>.asked), which
# the Stop hook reads for GATE-01: a repository created this turn with no question asked this
# session gets the interview line on the card. A call with no question is let through and writes
# no marker.
#
# Failure policy: an internal error ALLOWS the call, logs an ERROR line and says so.
#
# anchor: ask-shape  mode: deny  verbs: ask

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

# The problems with one question, as short lines; none means the shape is right.
function Get-DfAskProblems($q, $askCfg) {
    $problems = [Collections.Generic.List[string]]::new()
    $opts = @(); if ($q.PSObject.Properties['options']) { $opts = @($q.options | Where-Object { $null -ne $_ }) }

    $min = [int]$askCfg.minReason
    if ($min -gt 0) {
        $bare = @($opts | Where-Object { ([string]$_.description).Trim().Length -lt $min } | ForEach-Object { "'" + [string]$_.label + "'" })
        if ($bare.Count -gt 0) {
            $problems.Add(("The description of {0} is under {1} characters, too short to carry a reason. Each option's description says what it gives, what it costs and who would pick it." -f ($bare -join ', '), $min))
        }
    }

    $text = @([string]$q.question) + @($opts | ForEach-Object { [string]$_.label; [string]$_.description })
    $hay = ($text -join "`n")
    $hit = $null
    foreach ($p in @($askCfg.equalPhrases)) {
        $words = @(([string]$p).Trim() -split '\s+' | Where-Object { $_ } | ForEach-Object { [regex]::Escape($_) })
        if ($words.Count -eq 0) { continue }
        $rx = '(?i)(?<![a-z])' + ($words -join '\s+') + '(?![a-z])'
        foreach ($m in [regex]::Matches($hay, $rx)) {
            # Three uses of a phrase are not a tie (CR-2026-10-14-OPTIONS review): a negation ("not
            # equally good"), a quoted mention ('"either is fine" is not an answer'), and a sentence
            # that goes on to say what tips it ("both are fine, but this one costs less"), which is
            # exactly what OWN-04 asks for when two options are close.
            $lead = $hay.Substring(0, $m.Index).TrimEnd(' ', "`t")
            if ($lead -match "(?i)(?:(?<![a-z])not|(?<![a-z])never|n't)$") { continue }
            $quoteMarks = '"''`' + [char]0x201C + [char]0x2018
            if ($lead.Length -gt 0 -and $quoteMarks.Contains([string]$lead[-1])) { continue }
            $start = $hay.LastIndexOfAny([char[]]".!?`n", [Math]::Max(0, $m.Index - 1)) + 1
            $end = $hay.IndexOfAny([char[]]".!?`n", $m.Index + $m.Length); if ($end -lt 0) { $end = $hay.Length }
            $sentence = $hay.Substring($start, $end - $start)
            if ($sentence -match '(?i)(?<![a-z])(but|though|although|however|except|unless|whereas|yet)(?![a-z])') { continue }
            $hit = $m.Value; break
        }
        if ($hit) { break }
    }
    if ($hit) { $problems.Add(("'{0}' offers the options as equally fine. Say what tips it and recommend one." -f $hit)) }

    $marker = [string]$askCfg.recommendedMarker
    if ($marker -and $opts.Count -gt 0 -and ([string]$opts[0].label) -notmatch $marker) {
        $problems.Add("The first option is not marked recommended. Put the recommended option first, mark its label (for example 'Name (Recommended)') and say in its description why it wins.")
    }
    return $problems
}

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\turn-changes.ps1')   # Get-DfSessionFile
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'empty stdin (no tool call payload)' }
    $j = $raw | ConvertFrom-Json
    if ([string]$j.tool_name -ne 'AskUserQuestion') { exit 0 }
    $ti = $j.tool_input
    $qs = @(); if ($null -ne $ti -and $ti.PSObject.Properties['questions']) { $qs = @($ti.questions | Where-Object { $null -ne $_ }) }
    $n = $qs.Count
    $ptr = Read-DfPointer

    $title = $null; $lines = @()
    if ($n -gt 1) {
        $title = "$n questions in one call"
        $lines = @("This call carries $n questions. Ask the first question alone now; ask the next one after the answer.")
    } elseif ($n -eq 1) {
        # An unreadable brain config must not switch the checks off or lose the interview marker
        # (failing open here would skip both): the defaults apply and the log says why.
        try { $askCfg = (Read-DfBrainConfig $ptr).ask }
        catch { Write-DfLog 'WARN' 'ask' "brain config unreadable, the ask defaults apply: $($_.Exception.Message)"; $askCfg = Get-DfAskDefaults }
        if ($null -eq $askCfg) { $askCfg = Get-DfAskDefaults }
        $lines = @(Get-DfAskProblems $qs[0] $askCfg)
        if ($lines.Count -gt 0) { $title = "question shape: $($lines.Count) problem(s)" }
    }

    if (-not $title) {
        # Only a call that carries one question writes the interview marker. Workaround
        # (CR-2026-10-15-GAPS D5): a call with no question was let through and wrote it too, so a call
        # that asked nothing cleared the GATE-01 line on the Stop card. It is still let through.
        if ($n -eq 1) {
            $sessionId = if ($j.session_id) { [string]$j.session_id } else { 'unknown' }
            Add-DfTextLine (Get-DfSessionFile $sessionId '.asked') (Get-DfIso)
        }
        exit 0
    }
    $owner = if ($ptr.brain) { Get-DfOwnerName $ptr.brain } else { 'The owner' }
    $reason = ("{0} answers one question at a time, as multiple choice, with the recommended option first, and every option carries a reason to pick it (OWN-04). Fix this and ask again:`n- {1}" -f $owner, ($lines -join "`n- "))
    Add-DfTextLine (Get-DfFenceLogPath) ("{0}  BLOCKED[ASK: {1}]" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $title)
    Write-DfJson (New-DfDeny 'ask' $title $reason)
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
