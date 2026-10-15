# cases-own.ps1 - hook self-test cases for OWN-04 (the shape of a question, hooks/ask.ps1) and OWN-10
# (the always route, hooks/route.ps1 alwaysForSessions; hooks/subagent.ps1 leaves those groups out).
# Dot-sourced by run.ps1, which owns the fixtures and helpers used here ($brain, $root, $kit, $repoClean,
# Put, Record, Classify, Invoke-Hook, Route, Sub, Entry). Never run directly. Split out of run.ps1 by domain
# (CR-2026-10-14-OPTIONS) when that file passed the split line.

Write-Host '-- OWN-04 and OWN-10: the ask config and the always route'
$alwaysFile = Join-Path $brain 'route-policy.json'
$alwaysKept = if (Test-Path -LiteralPath $alwaysFile) { Get-Content -LiteralPath $alwaysFile -Raw -Encoding utf8 } else { $null }
if ($null -ne $alwaysKept) { Remove-Item -LiteralPath $alwaysFile -Force }   # the template policy (alwaysForSessions: OWN) applies
# always-route (OWN-10, CR-2026-10-14-OPTIONS): the template's alwaysForSessions group reaches every session
$r = Route 'yes please' 'r-own' $repoClean
Record 'route: a fresh session whose prompt names nothing gets OWN, with OWN-04 and OWN-10' 'own' $(if ($r.code -eq 0 -and $r.out -match 'group OWN' -and $r.out -match 'OWN-04 \[HOOK\]' -and $r.out -match 'OWN-10 \[ADVISE\]') { 'own' } else { 'missing' }) $r.out
$r = Route 'ok' 'r-own' $repoClean
Record 'route: the always group is not injected twice in a session' 'silent' $(if ($r.out -notmatch 'group OWN') { 'silent' } else { 'again' }) $r.out
$r = Route 'please build the new feature and commit it' 'r-own2' $root
Record 'route: the always group comes before the matched groups' 'first' $(if ($r.out.IndexOf('group OWN') -ge 0 -and $r.out.IndexOf('group OWN') -lt $r.out.IndexOf('group DES')) { 'first' } else { 'later' }) $r.out
$null = Entry $root 'r-own' 'compact'
$r = Route 'ok' 'r-own' $repoClean
Record 'route: after compaction the always group is injected again' 'own-again' $(if ($r.out -match 'group OWN') { 'own-again' } else { 'silent' }) $r.out
$r = Sub 'r-own' 'general-purpose'
Record 'subagent: a session-only group (alwaysForSessions) is not sent to a subagent' 'no-own' $(if ($r.code -eq 0 -and $r.out -match 'group SAFE' -and $r.out -notmatch 'group OWN' -and $r.out -match 'OWN-06 \(deliver\)') { 'no-own' } else { 'wrong' }) $r.out
# A brain policy without the key behaves as before 0.1.34: nothing routes on a prompt that names nothing.
$tplPolicy = Get-Content -LiteralPath (Join-Path $kit 'templates\route-policy.json') -Raw -Encoding utf8 | ConvertFrom-Json
$tplPolicy.PSObject.Properties.Remove('alwaysForSessions')
$policyFile = Join-Path $brain 'route-policy.json'
$policyKept = if (Test-Path -LiteralPath $policyFile) { Get-Content -LiteralPath $policyFile -Raw -Encoding utf8 } else { $null }
Put $policyFile ($tplPolicy | ConvertTo-Json -Depth 6)
$r = Route 'yes please' 'r-nokey' $root
Record 'route: a brain policy without alwaysForSessions routes nothing on a bare prompt (as 0.1.33)' 'silent' $(if ($r.code -eq 0 -and [string]::IsNullOrWhiteSpace($r.out)) { 'silent' } else { 'noisy' }) $r.out
$null = Route 'please build it' 'r-nokey' $root
$r = Sub 'r-nokey' 'general-purpose'
Record 'subagent: without the key, a subagent gets SAFE and the session groups (as 0.1.33)' 'safe+des' $(if ($r.out -match 'group SAFE' -and $r.out -match 'group DES' -and $r.out -notmatch 'group OWN') { 'safe+des' } else { 'wrong' }) $r.out
if ($null -ne $policyKept) { Put $policyFile $policyKept } else { Remove-Item -LiteralPath $policyFile -Force }
if ($null -ne $alwaysKept) { Put $alwaysFile $alwaysKept }

# ask config (OWN-04): the brain's `ask` key turns checks off, and an unreadable config keeps the defaults
function AskBare([string]$session) {
    $stdin = @{ session_id = $session; cwd = $root; hook_event_name = 'PreToolUse'; tool_name = 'AskUserQuestion'; tool_input = @{ questions = @(@{ question = 'q'; header = 'h'; multiSelect = $false; options = @(@{ label = 'a'; description = 'a' }, @{ label = 'b'; description = 'b' }) }) } } | ConvertTo-Json -Compress -Depth 8
    return (Invoke-Hook 'ask.ps1' $stdin)
}
$cfgPath = Join-Path $brain 'doctor.config.json'
$cfgOrig = Get-Content -LiteralPath $cfgPath -Raw -Encoding utf8
$cfgOff = $cfgOrig | ConvertFrom-Json
$cfgOff | Add-Member -NotePropertyName ask -NotePropertyValue ([pscustomobject]@{ minReason = 0; recommendedMarker = '' }) -Force
Put $cfgPath ($cfgOff | ConvertTo-Json -Depth 8)
$r = AskBare 'st-ask-off'
Record 'ask: minReason 0 and an empty marker turn those checks off' 'allow' $(if ($r.code -eq 0) { Classify $r.out } else { "exit$($r.code)" }) $r.out
Put $cfgPath '{ this is not json'
$r = AskBare 'st-ask-broken'
Record 'ask: an unreadable brain config keeps the default checks (no fail-open)' 'deny' $(if ($r.code -eq 0) { Classify $r.out } else { "exit$($r.code)" }) $r.out
$null = Invoke-Hook 'ask.ps1' (@{ session_id = 'st-ask-broken-ok'; cwd = $root; hook_event_name = 'PreToolUse'; tool_name = 'AskUserQuestion'; tool_input = @{ questions = @(@{ question = 'q'; header = 'h'; multiSelect = $false; options = @(@{ label = 'a (Recommended)'; description = 'Gives the thing the case needs; costs nothing worth a word.' }, @{ label = 'b'; description = 'Gives a second path for a different owner; costs one more step.' }) }) } } | ConvertTo-Json -Compress -Depth 8)
Record 'ask: with an unreadable config, an allowed question still writes the marker' 'written' $(if (Test-Path -LiteralPath (Join-Path $env:DF_MARKER_DIR 'st-ask-broken-ok.asked')) { 'written' } else { 'missing' }) ''
Put $cfgPath $cfgOrig
