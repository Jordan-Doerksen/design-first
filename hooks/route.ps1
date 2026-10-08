# route.ps1 - design-first UserPromptSubmit hook: the law arrives by route (DES-13).
#
# Instead of demanding the whole rule set at session start, each prompt is matched against the
# brain's route policy (keywords per law group, plus the working folder). A group that becomes
# active is injected ONCE per session as its rows from the generated LAW.md, with the owning files
# named for the full text; later prompts in the same session add only groups not yet active.
# Routes stick: a session about a game stays a game session when the next prompt is "yes please".
# entry.ps1 clears the session's route file on compaction, so the next prompt re-injects.
#
# Output is plain stdout (the host adds it as context), capped under the host's 10,000-character
# limit: groups that do not fit are named and left for the next prompt. Measured on the first
# instance before this hook existed: the eight-file entry path was ~35k tokens if read; a group's
# rows are 150-900 tokens; routes that stick covered 91% of 1,985 prompts.
#
# Failure policy: an internal error prints nothing law-shaped, logs an ERROR line and says so.
#
# anchor: route-law  mode: advise  verbs: route-law

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\law-rows.ps1')

    $raw = ''
    try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { }
    $j = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $j = $raw | ConvertFrom-Json } catch { $j = $null } }
    $prompt    = if ($j -and $j.PSObject.Properties['prompt']) { [string]$j.prompt } else { '' }
    $sessionId = if ($j -and $j.session_id) { [string]$j.session_id } else { 'unknown' }
    $cwd       = if ($j -and $j.cwd) { ConvertTo-DfFullPath ([string]$j.cwd) } else { (Get-Location).Path }

    # A new prompt is a turn boundary: the guard's edit ledger (read by stop.ps1) starts over.
    $ledger = Join-Path (Get-DfMarkerDir) ((($sessionId -replace '[^A-Za-z0-9_.-]', '_')) + '.edits')
    if (Test-Path -LiteralPath $ledger -PathType Leaf) { Remove-Item -LiteralPath $ledger -Force -ErrorAction SilentlyContinue }

    if ([string]::IsNullOrWhiteSpace($prompt)) { exit 0 }
    # The host can attach reminder blocks (skills lists, instructions) to the prompt it hands over.
    # Those carry words like page, review, log and gate that are not the owner's; match the typed
    # text only. Seen 2026-10-08: the first prompt after a restart routed four groups it never named.
    $prompt = [regex]::Replace($prompt, '(?is)<system-reminder>.*?</system-reminder>', ' ')

    $ptr = Read-DfPointer
    if ($null -eq $ptr.pointer) { exit 0 }           # no brain: the entry hook already said so
    $kitRoot = Get-DfKitRoot $ptr
    $pol = Read-DfRoutePolicy $ptr $kitRoot
    $policy = $pol.policy
    $maxChars = 9500
    if ($policy.maxChars) { [void][int]::TryParse([string]$policy.maxChars, [ref]$maxChars); if ($maxChars -le 0 -or $maxChars -gt 9800) { $maxChars = 9500 } }

    $matched = Get-DfMatchedGroups $policy $prompt $cwd $ptr.root
    $active  = Read-DfActiveRoutes $sessionId
    $new = @($matched | Where-Object { $active -notcontains $_ })
    if ($new.Count -eq 0) { exit 0 }

    $law = Get-DfLawPath $ptr $kitRoot
    $groups = Read-DfLawGroups $law
    $out = [Text.StringBuilder]::new()
    $injected = [Collections.Generic.List[string]]::new()
    $deferred = [Collections.Generic.List[string]]::new()
    foreach ($g in $new) {
        if (-not $groups.Contains($g)) { Write-DfLog 'WARN' 'route' "policy names group '$g' which $law does not have"; continue }
        $text = Format-DfLawGroup $g $groups[$g] $ptr $kitRoot
        if (($out.Length + $text.Length + 2) -gt $maxChars) { $deferred.Add($g); continue }
        [void]$out.AppendLine($text); [void]$out.AppendLine()
        $injected.Add($g)
    }
    if ($injected.Count -gt 0) {
        Add-DfTextLine (Get-DfRouteFile $sessionId) ($injected -join "`n")
        $src = if ($pol.fromBrain) { $pol.source } else { "$($pol.source) (kit template; no brain route-policy.json)" }
        [void]$out.AppendLine(("design-first route: {0} now active this session (policy {1}); index {2}." -f ($injected -join ', '), $src, $law))
        if ($deferred.Count -gt 0) { [void]$out.AppendLine(("Not injected yet, over the size cap: {0}. Mention the topic again, or open the index." -f ($deferred -join ', '))) }
        Write-Output $out.ToString().TrimEnd()
    }
}
catch {
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR route {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    Write-Output "design-first route hook hit an internal error and injected no law this prompt: $msg. Logged to the design-first hooks log."
}
exit 0
