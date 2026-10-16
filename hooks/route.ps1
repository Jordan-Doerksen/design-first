# route.ps1 - design-first UserPromptSubmit hook: the law arrives by route (DES-13).
#
# Instead of demanding the whole rule set at session start, each prompt is matched against the
# brain's route policy (keywords per law group, plus the working folder). A group that becomes
# active is injected ONCE per session as its rows from the generated LAW.md, with the owning files
# named for the full text; later prompts in the same session add only groups not yet active.
# Routes stick: a session about a game stays a game session when the next prompt is "yes please".
# entry.ps1 clears the session's route file on a compaction or a clear, so the next prompt re-injects.
#
# Output is plain stdout (the host adds it as context), capped under the host's 10,000-character
# limit by the policy's maxChars. A group that does not fit is not recorded. When another group
# printed, the printed line names it and says to mention the topic again; when no group fits, no
# group is named. Nothing stores it: an always or folder group comes again on the next prompt, a
# word group only when a later prompt holds its words. Measured on the first
# instance before this hook existed: the eight-file entry path was ~35k tokens if read; a group's
# rows are 150-900 tokens; routes that stick covered 91% of 1,985 prompts.
#
# Failure policy: an internal error prints nothing law-shaped, logs an ERROR line and says so. The
# turn reset runs before the libraries load, so a failure after it cannot leave the last turn's
# record and time for the Stop card.
#
# anchor: route-law  mode: advise  verbs: route-law
#
# always-route (OWN-10, CR-2026-10-14-OPTIONS): the groups the policy lists in alwaysForSessions
# join the matches of every prompt, whatever its words and folder. They go first, so the size cap
# defers a topic group before one of them (a policy that lists several large always groups can still
# defer the later ones); the route file keeps them to once per session, and a compaction or a clear
# clears it, so they arrive again after one. A rule about how every decision is asked and researched has no
# topic word to route on: before this key, no OWN row reached any session by route.
#
# anchor: always-route  mode: advise  verbs: rank
#
# skills (DES-12, CR-2026-10-13-HONOUR): the same prompt is matched against the installed skills,
# read from the skills directories themselves (root\.claude\skills and the profile's), never from
# a list in a law file. A skill whose name or description shares a whole word with the typed text
# is named once per session, with its path, so the task meets the skill before a build from nothing.
# It counts as named only when its line printed: a block that does not fit under the cap is named
# by a later prompt that matches it, and when no new group prints, the skills print alone.
#
# anchor: skills  mode: advise  verbs: match-skill

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

function Get-DfSkillMatches([string]$prompt, [string]$root, [string]$sessionId) {
    $stop = @('about','after','again','build','change','check','could','every','first','their','there','these','thing','think','those','under','where','which','while','would','should','please','start','write','update','maybe','really','right','something')
    $words = @([regex]::Matches($prompt.ToLowerInvariant(), '[a-z][a-z-]{4,}') | ForEach-Object { $_.Value } | Where-Object { $stop -notcontains $_ } | Select-Object -Unique)
    if ($words.Count -eq 0) { return @() }
    $dirs = @()
    if ($root) { $dirs += (Join-Path $root '.claude\skills') }
    if ($env:USERPROFILE) { $dirs += (Join-Path $env:USERPROFILE '.claude\skills') }
    $seenFile = Get-DfSessionFile $sessionId '.skills'
    $seen = @(); if (Test-Path -LiteralPath $seenFile -PathType Leaf) { $seen = @(Get-Content -LiteralPath $seenFile -Encoding utf8) }
    $hits = [Collections.Generic.List[object]]::new()
    foreach ($d in $dirs) {
        if (-not (Test-Path -LiteralPath $d -PathType Container)) { continue }
        foreach ($skill in (Get-ChildItem -LiteralPath $d -Directory | Sort-Object Name)) {
            $md = Join-Path $skill.FullName 'SKILL.md'
            if (-not (Test-Path -LiteralPath $md -PathType Leaf)) { continue }
            if ($seen -contains $skill.Name) { continue }
            $head = @(Get-Content -LiteralPath $md -TotalCount 40 -Encoding utf8)
            $name = $skill.Name; $desc = ''
            foreach ($l in $head) {
                if ($l -match '^name:\s*(.+)$') { $name = $Matches[1].Trim() }
                elseif ($l -match '^description:\s*(.+)$') { $desc = $Matches[1].Trim() }
            }
            $hay = (($name -replace '[-_]', ' ') + ' ' + $desc).ToLowerInvariant()
            $matched = @($words | Where-Object { $hay -match ('(?<![a-z])' + [regex]::Escape($_) + '(?![a-z])') })
            if ($matched.Count -eq 0) { continue }
            $short = if ($desc.Length -gt 140) { $desc.Substring(0, 140).TrimEnd() + '...' } else { $desc }
            $hits.Add([pscustomobject]@{ name = $skill.Name; desc = $short; path = $md; words = $matched })
            if ($hits.Count -ge 5) { break }
        }
        if ($hits.Count -ge 5) { break }
    }
    return @($hits)
}

try {
    $raw = ''
    try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { }
    $j = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $j = $raw | ConvertFrom-Json } catch { $j = $null } }
    $prompt    = if ($j -and $j.PSObject.Properties['prompt']) { [string]$j.prompt } else { '' }
    $sessionId = if ($j -and $j.session_id) { [string]$j.session_id } else { 'unknown' }

    # A prompt from the owner is a turn boundary: the guard's edit ledger, its list of nominated
    # repositories and its failure count start over, and the time is written down, so stop.ps1 can ask
    # git what changed since (lib\turn-changes.ps1). A background-task notice is NOT a boundary. The
    # host hands it to this hook as a prompt in the middle of a turn; taking it for one made the card
    # forget every edit before it. Seen 2026-10-08: two notices in one turn, each one routed as if typed.
    # Workaround (CR-2026-10-15-GAPS D5): the reset ran after the libraries loaded, so a library that
    # failed to load left the last turn's record and time in place, and the card judged this turn by
    # them. It runs first now, on inline paths with the names Get-DfSessionFile gives.
    $isNotice = $prompt -match '(?is)<task-notification>.*?</task-notification>'
    if (-not $isNotice) {
        $markerDir = if ($env:DF_MARKER_DIR) { $env:DF_MARKER_DIR } else { Join-Path $env:TEMP 'design-first' }
        $safeId = $sessionId -replace '[^A-Za-z0-9_.-]', '_'
        foreach ($ext in '.edits', '.repos', '.guard-error') {
            $f = Join-Path $markerDir ($safeId + $ext)
            if (Test-Path -LiteralPath $f -PathType Leaf) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
        }
        if (-not (Test-Path -LiteralPath $markerDir)) { New-Item -ItemType Directory -Force -Path $markerDir | Out-Null }
        Set-Content -LiteralPath (Join-Path $markerDir ($safeId + '.turn')) -Value ([DateTimeOffset]::Now.ToString('o')) -Encoding utf8
    }

    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\law-rows.ps1')
    . (Join-Path $PSScriptRoot 'lib\turn-changes.ps1')
    $cwd = if ($j -and $j.cwd) { ConvertTo-DfFullPath ([string]$j.cwd) } else { (Get-Location).Path }

    if ([string]::IsNullOrWhiteSpace($prompt)) { exit 0 }
    # The host can attach reminder blocks (skills lists, instructions) to the prompt it hands over.
    # Those carry words like page, review, log and gate that are not the owner's; match the typed
    # text only. Seen 2026-10-08: the first prompt after a restart routed four groups it never named.
    # A task notice carries the words of a command description; they are not the owner's either.
    $prompt = [regex]::Replace($prompt, '(?is)<system-reminder>.*?</system-reminder>', ' ')
    $prompt = [regex]::Replace($prompt, '(?is)<task-notification>.*?</task-notification>', ' ')

    $ptr = Read-DfPointer
    if ($null -eq $ptr.pointer) { exit 0 }           # no brain: the entry hook already said so
    $kitRoot = Get-DfKitRoot $ptr
    $pol = Read-DfRoutePolicy $ptr $kitRoot
    $policy = $pol.policy
    $maxChars = 9500
    if ($policy.maxChars) { [void][int]::TryParse([string]$policy.maxChars, [ref]$maxChars); if ($maxChars -le 0 -or $maxChars -gt 9800) { $maxChars = 9500 } }

    $matched = Get-DfMatchedGroups $policy $prompt $cwd $ptr.root
    $always  = @(@($policy.alwaysForSessions) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { [string]$_ })
    $matched = @($always + @($matched | Where-Object { $always -notcontains $_ }))
    $active  = Read-DfActiveRoutes $sessionId
    $new = @($matched | Where-Object { $active -notcontains $_ })

    # skills (DES-12): named once per session each, after the law rows when there are any. A skill is
    # marked as named (<session>.skills) only after its line printed. Workaround (CR-2026-10-15-GAPS
    # D5): the match marked every hit before anything printed, so a skill block that did not fit
    # under the cap, or a prompt whose new groups all failed to print, lost the skill for the session.
    $skillHits = @(Get-DfSkillMatches $prompt $ptr.root $sessionId)
    $skillText = ''
    if ($skillHits.Count -gt 0) {
        $skillText = "design-first skills (DES-12): the task may match an installed skill; read it before building from nothing.`n" +
                     (($skillHits | ForEach-Object { "  - {0}: {1}  ({2})" -f $_.name, $_.desc, $_.path }) -join "`n")
    }
    $skillFile = Get-DfSessionFile $sessionId '.skills'
    if ($new.Count -eq 0) {
        if ($skillText) { Write-Output $skillText; foreach ($h in $skillHits) { Add-DfTextLine $skillFile $h.name } }
        exit 0
    }

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
        $skillsFit = $skillText -and (($out.Length + $skillText.Length + 2) -le $maxChars)
        if ($skillsFit) { [void]$out.AppendLine(); [void]$out.AppendLine($skillText) }
        Write-Output $out.ToString().TrimEnd()
        # A skill block that did not fit is not marked, so a later prompt that matches it names it.
        if ($skillsFit) { foreach ($h in $skillHits) { Add-DfTextLine $skillFile $h.name } }
    }
    elseif ($skillText) {
        # No new group printed (each was over the cap or missing from LAW.md): the skills print alone.
        Write-Output $skillText
        foreach ($h in $skillHits) { Add-DfTextLine $skillFile $h.name }
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
