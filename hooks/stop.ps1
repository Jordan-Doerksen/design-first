# stop.ps1 - design-first Stop hook: a code turn does not end without its card (DES-07, GATE-05/06/07).
#
# When the turn changed source and the model tries to stop, this hook refuses ONCE and hands back
# the card: the documents touched or not (DES-07), the Change Log row when DECISIONS.md changed
# (GATE-06), the cross-check (GATE-05) and the Definition of Done (GATE-07). The model answers the
# card in its reply; the next stop attempt (stop_hook_active) passes. A turn that changed no source,
# or only documents, is never stopped. Owner decision 2026-10-08: block once, then yield.
#
# What changed is read from the disk, not from the tool calls (lib\turn-changes.ps1). The guard
# nominates every repository this turn's calls pointed at; for each one git says which files are in
# a commit made since the prompt, or are uncommitted and were written since the prompt. So a
# document a script wrote is a document touched, and a source file a command changed counts.
# Before 0.1.15 the card saw only Edit and Write calls, and said "Documents touched: none" over five
# documents a patch script had just written.
#
# Fallbacks, each named on the card when it applies: a session with no prompt time on record, or
# `stopFromGit` false in the brain config, or a repository git cannot read, is counted from the
# edit ledger (<markers>/<session>.edits, the Edit / Write / NotebookEdit calls the guard allowed).
# Scope: only a git repository counts, and only under the root when the pointer names one.
#
# Honest limit: the hook can require the card, not grade the answer. A model's claim that the
# cross-check passed is a claim (AUTO-06); the deterministic checks are the Doctor and the gate.
# What the disk reading cannot see is written at the top of lib\turn-changes.ps1.
#
# anchor: stop-done  mode: deny  verbs: document,cross-check,change,finish,gate-change
#
# interview (GATE-01, 0.1.23): a repository whose .git was created since the prompt is an addition
# this turn. When no question was asked this session (no <session>.asked marker, written by
# ask.ps1), the card carries the interview line for that repository. Same refusal, once.
#
# anchor: interview  mode: deny  verbs: interview

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

$script:DfDefaultStopDocs = @('DECISIONS.md', 'ARCHITECTURE.md', 'HANDOFF.md', 'CHANGELOG.md', 'README.md', 'SPEC.md', 'MANUAL.md')

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-rules.ps1')   # Get-DfLedgerRepo, the default source extensions
    . (Join-Path $PSScriptRoot 'lib\turn-changes.ps1')

    $raw = ''
    try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { }
    $j = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $j = $raw | ConvertFrom-Json } catch { $j = $null } }
    $sessionId = if ($j -and $j.session_id) { [string]$j.session_id } else { 'unknown' }
    $active = $false
    if ($j -and $j.PSObject.Properties['stop_hook_active']) { $active = [bool]$j.stop_hook_active }
    if ($active) { exit 0 }                                   # the card was handed over already; yield

    $ledgerFile = Get-DfSessionFile $sessionId '.edits'
    $lines = @(if (Test-Path -LiteralPath $ledgerFile -PathType Leaf) { Get-Content -LiteralPath $ledgerFile -Encoding utf8 | Where-Object { $_.Trim() } })
    $nominated = @(Read-DfNominations $sessionId)             # @{ repo; base }: HEAD at the turn's first call there
    if ($lines.Count -eq 0 -and $nominated.Count -eq 0) { exit 0 }
    $baseOf = @{}; foreach ($n in $nominated) { $baseOf[$n.repo] = $n.base }

    $ptr = Read-DfPointer
    $cfg = @{ present = $false; sourceExtensions = @(); readCeilingBytes = 0; stopFromGit = $true }
    try { $cfg = Read-DfBrainConfig $ptr } catch { }
    $exts = if ($cfg.sourceExtensions -and @($cfg.sourceExtensions).Count -gt 0) { @($cfg.sourceExtensions) } else { $script:DfDefaultSourceExtensions }
    $docs = $script:DfDefaultStopDocs
    if ($cfg.PSObject -and $cfg.ContainsKey('stopDocs') -and @($cfg.stopDocs).Count -gt 0) { $docs = @($cfg.stopDocs) }
    $since = Get-DfTurnStart $sessionId
    $fromGit = ($null -ne $since) -and -not ($cfg.ContainsKey('stopFromGit') -and $cfg.stopFromGit -eq $false)

    # The edit ledger, by repository: the paths the Edit / Write calls named, and the Change Log flag.
    # A path outside the root or in no repository is skipped (0.1.9).
    $ledger = @{}
    foreach ($l in $lines) {
        $parts = $l -split "`t"
        $path = $parts[0]; $flags = if ($parts.Count -gt 1) { $parts[1] } else { '' }
        $repo = Get-DfLedgerRepo $path $ptr.root
        if (-not $repo) { continue }
        # Same spelling of the folder as the guard's nominations use, so one repository is one group.
        $asNominated = Find-DfRepoDir $path $ptr.root; if ($asNominated) { $repo = $asNominated }
        if (-not $ledger.ContainsKey($repo)) { $ledger[$repo] = @{ paths = [Collections.Generic.List[string]]::new(); changelog = $false } }
        if (-not $ledger[$repo].paths.Contains($path)) { $ledger[$repo].paths.Add($path) }
        if ($flags -match 'changelog') { $ledger[$repo].changelog = $true }
    }

    # Every repository to look at: the ledger's, and the ones the guard nominated from shell calls.
    $repos = [Collections.Generic.List[string]]::new()
    foreach ($r in @($ledger.Keys) + $(if ($fromGit) { @($nominated | ForEach-Object { $_.repo }) } else { @() })) {
        if (-not $r) { continue }
        if ($ptr.root -and -not (Test-DfUnder $r $ptr.root)) { continue }
        if (@($repos | Where-Object { $_ -ieq $r }).Count -eq 0) { $repos.Add($r) }
    }

    $groups = @{}
    foreach ($repo in $repos) {
        $g = @{ src = [Collections.Generic.List[string]]::new(); docs = [Collections.Generic.List[string]]::new(); decisions = $false; changelog = $false; how = 'calls' }
        $paths = [Collections.Generic.List[string]]::new()
        $led = if ($ledger.ContainsKey($repo)) { $ledger[$repo] } else { $null }
        $ch = $null
        if ($fromGit -and (Test-Path -LiteralPath $repo -PathType Container)) { $ch = Get-DfTurnChanges $repo $since $(if ($baseOf.ContainsKey($repo)) { [string]$baseOf[$repo] } else { '' }) }
        if ($ch -and $ch.ok) {
            $g.how = 'git'
            foreach ($rel in $ch.paths) { $paths.Add((Join-Path $repo ($rel -replace '/', '\'))) }
            # A file git ignores is in no status list. When an Edit or Write named it and it was
            # written since the prompt, it changed; a call that was allowed and then failed did not.
            if ($led) {
                foreach ($p in $led.paths) {
                    if (@($paths | Where-Object { $_ -ieq $p }).Count -gt 0) { continue }
                    if ((Test-Path -LiteralPath $p -PathType Leaf) -and ([IO.File]::GetLastWriteTimeUtc($p) -ge $since.UtcDateTime)) { $paths.Add($p) }
                }
            }
            $g.changelog = [bool]$ch.decisionsRow -or ($led -and $led.changelog)
        }
        else {
            if ($led) { foreach ($p in $led.paths) { $paths.Add($p) }; $g.changelog = $led.changelog }
            if ($fromGit) { $g.how = 'calls-git-failed' }
        }
        foreach ($path in $paths) {
            $leaf = Split-Path -Leaf $path
            $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
            $isDoc = ($docs | Where-Object { $_ -ieq $leaf }).Count -gt 0 -or ($path -match '(?i)[\\/]docs[\\/]')
            if ($isDoc) {
                if (-not $g.docs.Contains($leaf)) { $g.docs.Add($leaf) }
                if ($leaf -ieq 'DECISIONS.md') { $g.decisions = $true }
            }
            elseif ($exts -contains $ext) { if (-not $g.src.Contains($path)) { $g.src.Add($path) } }
        }
        $groups[$repo] = $g
    }

    $hits = @($groups.Keys | Where-Object { $groups[$_].src.Count -gt 0 } | Sort-Object)
    if ($hits.Count -eq 0) { exit 0 }

    # GATE-01: a repository born this turn, with no question asked this session.
    $asked = Test-Path -LiteralPath (Get-DfSessionFile $sessionId '.asked') -PathType Leaf
    $owner = Get-DfOwnerName $ptr.brain
    foreach ($repo in $hits) {
        $g = $groups[$repo]; $g.born = $false
        if ($null -eq $since) { continue }
        $gitDir = Join-Path $repo '.git'
        if (Test-Path -LiteralPath $gitDir) {
            try { $g.born = ([IO.Directory]::GetCreationTimeUtc($gitDir) -ge $since.UtcDateTime) } catch { $g.born = $false }
        }
    }

    $sb = [Text.StringBuilder]::new()
    [void]$sb.AppendLine("design-first: this turn changed source. Answer this card in your reply, then stop (DES-07, GATE-05, GATE-06, GATE-07; the hook asks once per turn).")
    foreach ($root in $hits) {
        $g = $groups[$root]
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine(("Repository {0}: {1} source file(s) changed." -f $root, $g.src.Count))
        if ($g.docs.Count -gt 0) { [void]$sb.AppendLine("  Documents touched: " + ($g.docs -join ', ') + ".") }
        else { [void]$sb.AppendLine("  Documents touched: none. DES-07: documents are co-equal; say which document should carry this change, or why none does.") }
        if ($g.decisions -and -not $g.changelog) { [void]$sb.AppendLine("  DECISIONS.md was edited with no Change Log row. GATE-06: a change to a decision is a Change Request; add the row, or say why this edit is not one.") }
        if ($g.born -and -not $asked) { [void]$sb.AppendLine(("  This repository was created this turn and no question was asked this session. GATE-01: every addition gets the interview, however detailed the request; interview {0} now with one question at a time, or say why this is a toy or a throwaway." -f $owner)) }
        if ($g.how -eq 'calls-git-failed') { [void]$sb.AppendLine("  git could not be read here, so this repository is counted from Edit and Write calls only; a file a command changed is not in the count.") }
    }
    [void]$sb.AppendLine("")
    if (@($hits | Where-Object { $groups[$_].how -eq 'git' }).Count -gt 0) {
        [void]$sb.AppendLine("Read from git, for each repository this turn's tool calls pointed at: files in a commit made since the prompt, and uncommitted files written since the prompt.")
    } else {
        [void]$sb.AppendLine("Counted from Edit and Write calls only; a file a command changed is not in the count.")
    }
    [void]$sb.AppendLine("Cross-check (GATE-05): does the change still fit DECISIONS.md, ARCHITECTURE.md and the core goal? Name any clash.")
    [void]$sb.AppendLine("Definition of Done (GATE-07): what ran to prove it (command and its output, pasted, AUTO-06); any locked decision contradicted; does the result fit one screen of explanation.")
    [void]$sb.AppendLine("Nothing here is checked by this hook; it is checked by the Doctor and the repository's gate.")

    Add-DfTextLine (Get-DfFenceLogPath) ("{0}  STOP[card: {1} repository(ies), {2} source file(s)]" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $hits.Count, (($hits | ForEach-Object { $groups[$_].src.Count }) | Measure-Object -Sum).Sum)
    @{ decision = 'block'; reason = $sb.ToString().TrimEnd() } | ConvertTo-Json -Depth 3 -Compress | Write-Output
}
catch {
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR stop {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    # An internal error never traps the session: allow the stop, say so to the user.
    @{ systemMessage = "STOP: internal error, turn allowed to end ($msg)" } | ConvertTo-Json -Compress | Write-Output
}
exit 0
