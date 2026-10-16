# stop.ps1 - design-first Stop hook: a code turn does not end without its card (DES-07, GATE-01, GATE-05/06/07, GAME-12).
#
# When the turn changed source and the model tries to stop, this hook refuses ONCE and hands back
# the card: the documents touched or not (DES-07), the Change Log row when DECISIONS.md changed
# (GATE-06), the Change Request question on every card (GATE-06), the verify gate's command and its
# output (GAME-12), the cross-check (GATE-05) and the Definition of Done (GATE-07). The card's first
# line names every clause it carries, GATE-01 only when its interview line is on the card. The model
# answers the card in its reply; the next stop attempt (stop_hook_active) passes. A turn that
# changed no source, or only documents, is not stopped, except in a repository whose git status
# listed more entries than the cap (its count is a floor, below). A document is a name on the
# stopDocs list, or a file in a docs folder inside the repository whose extension is not a source
# extension, so a generator script such as docs\build.ps1 is source. Owner decision 2026-10-08:
# block once, then yield.
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
# A count that may be short says so (CR-2026-10-15-GAPS D5). A repository whose git status listed
# more entries than the cap is carded with its count called a floor. Repositories not read before
# the time budget ran out (stopBudgetSeconds in the brain config, under the host's timeout) are
# named. Calls the guard failed on (<markers>/<session>.guard-error) are counted. With no source
# change to card, an unread repository or a guard failure goes to the owner as a systemMessage;
# none of the three is a silent pass.
#
# Honest limit: the hook can require the card, not grade the answer. A model's claim that the
# cross-check passed is a claim (AUTO-06); no kit check grades the answer, and the Doctor proves
# only that the hook starts (KIT-SMOKE-07). The Stop event is the main session's: the kit registers
# no SubagentStop hook, so a subagent's own stop gets no card; its changes count on the card of
# the session turn it ran in, when its calls pointed at that repository.
# What the disk reading cannot see is written at the top of lib\turn-changes.ps1.
#
# Mode advise, not deny (CR-2026-10-15-GAPS D4): the hook blocks the first stop once, yields on the
# second whatever the answer says, and grades nothing. So the clauses it carries grade ADVISE; up to
# 0.1.38 they printed HOOK, which says that a machine refuses the breach, and this hook does not.
# anchor: stop-done  mode: advise  verbs: document,cross-check,change,finish,gate-change
#
# interview (GATE-01, 0.1.23): a repository whose .git was created since the prompt is an addition
# this turn. When no question was asked this session (no <session>.asked marker, written by
# ask.ps1), the card carries the interview line for that repository. Same refusal, once; advise
# for the same reason.
#
# anchor: interview  mode: advise  verbs: interview

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$clock = [Diagnostics.Stopwatch]::StartNew()   # the time budget (stopBudgetSeconds) counts from here

$script:DfDefaultStopDocs = @('DECISIONS.md', 'ARCHITECTURE.md', 'HANDOFF.md', 'CHANGELOG.md', 'README.md', 'SPEC.md', 'MANUAL.md')

# A turn with nothing to card can still have a count that is short: say so to the owner, block nothing.
function Write-DfStopNotice([string[]]$notes) {
    if (@($notes).Count -eq 0) { return }
    Write-DfLog 'WARN' 'stop' ($notes -join '; ')
    @{ systemMessage = ("STOP: no source change was found to card, and the count may be short: " + ($notes -join '; ') + '.') } | ConvertTo-Json -Compress | Write-Output
}

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
    # Calls the guard failed on this turn recorded nothing (guard.ps1's catch block counts them here).
    $guardErrFile = Get-DfSessionFile $sessionId '.guard-error'
    $guardErrors = @(if (Test-Path -LiteralPath $guardErrFile -PathType Leaf) { Get-Content -LiteralPath $guardErrFile -Encoding utf8 | Where-Object { $_.Trim() } }).Count
    $guardNote = "the guard failed on $guardErrors call(s) this turn and recorded none of them"
    if ($lines.Count -eq 0 -and $nominated.Count -eq 0) {
        if ($guardErrors -gt 0) { Write-DfStopNotice @($guardNote) }
        exit 0
    }
    $baseOf = @{}; foreach ($n in $nominated) { $baseOf[$n.repo] = $n.base }

    $ptr = Read-DfPointer
    $cfg = @{ present = $false; sourceExtensions = @(); readCeilingBytes = 0; stopFromGit = $true; stopBudgetSeconds = $script:DfStopBudgetDefault }
    try { $cfg = Read-DfBrainConfig $ptr } catch { }
    $exts = if ($cfg.sourceExtensions -and @($cfg.sourceExtensions).Count -gt 0) { @($cfg.sourceExtensions) } else { $script:DfDefaultSourceExtensions }
    $docs = $script:DfDefaultStopDocs
    if ($cfg.PSObject -and $cfg.ContainsKey('stopDocs') -and @($cfg.stopDocs).Count -gt 0) { $docs = @($cfg.stopDocs) }
    $since = Get-DfTurnStart $sessionId
    $fromGit = ($null -ne $since) -and -not ($cfg.ContainsKey('stopFromGit') -and $cfg.stopFromGit -eq $false)
    $budget = if ($cfg.ContainsKey('stopBudgetSeconds')) { [double]$cfg.stopBudgetSeconds } else { [double]$script:DfStopBudgetDefault }

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
    $unread = [Collections.Generic.List[string]]::new()       # repositories git was not asked about in time
    foreach ($repo in $repos) {
        $g = @{ src = [Collections.Generic.List[string]]::new(); docs = [Collections.Generic.List[string]]::new(); decisions = $false; changelog = $false; how = 'calls'; capped = $false; cap = 0 }
        $paths = [Collections.Generic.List[string]]::new()
        $led = if ($ledger.ContainsKey($repo)) { $ledger[$repo] } else { $null }
        $ch = $null
        # The time budget (CR-2026-10-15-GAPS D5): the host ends this hook at its timeout, and an ended
        # hook says nothing. Git is read one repository at a time; once the budget is spent, the rest
        # are counted from the ledger and named on the card. One git call that outlasts what is left
        # of the budget is still ended by the host.
        $late = $fromGit -and ($clock.Elapsed.TotalSeconds -ge $budget)
        if ($late) { $unread.Add($repo) }
        elseif ($fromGit -and (Test-Path -LiteralPath $repo -PathType Container)) { $ch = Get-DfTurnChanges $repo $since $(if ($baseOf.ContainsKey($repo)) { [string]$baseOf[$repo] } else { '' }) }
        if ($ch -and $ch.ok) {
            $g.how = 'git'
            $g.capped = [bool]$ch.capped; $g.cap = [int]$ch.cap
            if ($g.capped) { Write-DfLog 'WARN' 'stop' ("git status in {0} listed more than {1} entries; the rest were not read, so the card's count there is a floor" -f $repo, $g.cap) }
            foreach ($rel in $ch.paths) { $paths.Add((Join-Path $repo ($rel -replace '/', '\'))) }
            # A file git ignores is in no status list. When an Edit or Write named it and it was
            # written since the prompt, it changed; a call that was allowed and then failed did not.
            if ($led) {
                foreach ($p in $led.paths) {
                    if (@($paths | Where-Object { $_ -ieq $p }).Count -gt 0) { continue }
                    if ((Test-Path -LiteralPath $p -PathType Leaf) -and ([IO.File]::GetLastWriteTimeUtc($p) -ge $since.UtcDateTime)) { $paths.Add($p) }
                }
            }
            # Git's count of added dated rows decides for a DECISIONS.md that git listed. The ledger flag
            # counts only for one git does not list (an ignored file). Workaround (CR-2026-10-15-GAPS D5):
            # the flag was OR-ed in, so a flag from any Write that kept an old row overrode git's answer.
            $gitSawDecisions = @($ch.paths | Where-Object { (Get-DfLeaf $_) -ieq 'DECISIONS.md' }).Count -gt 0
            $g.changelog = [bool]$ch.decisionsRow -or (-not $gitSawDecisions -and $led -and $led.changelog)
        }
        else {
            if ($led) { foreach ($p in $led.paths) { $paths.Add($p) }; $g.changelog = $led.changelog }
            if ($late) { $g.how = 'calls-time-limit' }
            elseif ($fromGit) { $g.how = 'calls-git-failed' }
        }
        foreach ($path in $paths) {
            $leaf = Split-Path -Leaf $path
            $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
            # A document: a name on the stopDocs list, or a file in a docs folder INSIDE the repository
            # whose extension is not a source extension. Workaround (CR-2026-10-15-GAPS D5): the docs
            # test read the full path, so in a repository below any folder named docs every file was a
            # document and the card never came; and a script such as docs\build.ps1 was a document.
            $rel = if (Test-DfUnder $path $repo) { $path.Substring($repo.TrimEnd('\').Length).TrimStart('\', '/') } else { $leaf }
            $isSource = $exts -contains $ext
            $isDoc = @($docs | Where-Object { $_ -ieq $leaf }).Count -gt 0 -or (-not $isSource -and $rel -match '(?i)(^|[\\/])docs[\\/]')
            if ($isDoc) {
                if (-not $g.docs.Contains($leaf)) { $g.docs.Add($leaf) }
                if ($leaf -ieq 'DECISIONS.md') { $g.decisions = $true }
            }
            elseif ($isSource) { if (-not $g.src.Contains($path)) { $g.src.Add($path) } }
        }
        $groups[$repo] = $g
    }
    if ($unread.Count -gt 0) { Write-DfLog 'WARN' 'stop' ("time budget of {0} s spent before git was read in: {1}" -f $budget, ($unread -join ', ')) }

    # A repository past the git status cap is a hit even with no source counted: its count is a floor,
    # and a floor of zero is not a pass (OBS-07; the capped flag used to be set and never read).
    $hits = @($groups.Keys | Where-Object { $groups[$_].src.Count -gt 0 -or $groups[$_].capped } | Sort-Object)
    $unreadQuiet = @($unread | Where-Object { $hits -notcontains $_ } | Sort-Object)
    $budgetNote = ("the time budget (stopBudgetSeconds, {0} s) ran out before git was read in {1}, so a change made there is not in the count" -f $budget, ($unreadQuiet -join ', '))
    if ($hits.Count -eq 0) {
        $notes = @()
        if ($unreadQuiet.Count -gt 0) { $notes += $budgetNote }
        if ($guardErrors -gt 0) { $notes += $guardNote }
        Write-DfStopNotice $notes
        exit 0
    }

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

    # The first line names every clause the card carries (CR-2026-10-15-GAPS D4): GATE-06 and GAME-12
    # ride on every card, GATE-01 when a repository on it carries the interview line. Before, the line
    # named four of the six, so the agent was not told that the card also asked for GAME-12 and
    # GATE-01. GATE-06 has a line of its own on every card, the Change Request question below, so the
    # first line never names a clause the card does not ask about. Workaround (CR-2026-10-15-GAPS
    # second review): a fix round named GATE-06 only with the Change Log line, and the common case of
    # a missing Change Request, a behaviour change that does not touch DECISIONS.md, then got no
    # GATE-06 at all.
    $interview = @($hits | Where-Object { $groups[$_].born -and -not $asked }).Count -gt 0
    $carried = @('DES-07') + $(if ($interview) { @('GATE-01') } else { @() }) + @('GATE-05', 'GATE-06', 'GATE-07', 'GAME-12')
    $sb = [Text.StringBuilder]::new()
    [void]$sb.AppendLine(("design-first: this turn changed source. Answer this card in your reply, then stop ({0}; the hook asks once per turn)." -f ($carried -join ', ')))
    foreach ($root in $hits) {
        $g = $groups[$root]
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine(("Repository {0}: {1} source file(s) changed." -f $root, $g.src.Count))
        if ($g.docs.Count -gt 0) { [void]$sb.AppendLine("  Documents touched: " + ($g.docs -join ', ') + ".") }
        else { [void]$sb.AppendLine("  Documents touched: none. DES-07: documents are co-equal; say which document should carry this change, or why none does.") }
        if ($g.decisions -and -not $g.changelog) { [void]$sb.AppendLine("  DECISIONS.md was edited with no Change Log row. GATE-06: a change to a decision is a Change Request; add the row, or say why this edit is not one.") }
        if ($g.born -and -not $asked) { [void]$sb.AppendLine(("  This repository was created this turn and no question was asked this session. GATE-01: every addition gets the interview, however detailed the request; interview {0} now with one question at a time, or say why this is a toy or a throwaway." -f $owner)) }
        if ($g.how -eq 'calls-git-failed') { [void]$sb.AppendLine("  git could not be read here, so this repository is counted from Edit and Write calls only; a file a command changed is not in the count.") }
        if ($g.how -eq 'calls-time-limit') { [void]$sb.AppendLine(("  The time budget (stopBudgetSeconds, {0} s) ran out before git was read here, so this repository is counted from Edit and Write calls only; a file a command changed is not in the count." -f $budget)) }
        if ($g.capped) { [void]$sb.AppendLine(("  git status listed more than {0} entries here; the entries past that were not read, so this count is a floor." -f $g.cap)) }
    }
    if ($unreadQuiet.Count -gt 0) { [void]$sb.AppendLine(""); [void]$sb.AppendLine("Not read: " + $budgetNote + ".") }
    if ($guardErrors -gt 0) { [void]$sb.AppendLine(""); [void]$sb.AppendLine("Not recorded: " + $guardNote + ", so this count may be short.") }
    [void]$sb.AppendLine("")
    if (@($hits | Where-Object { $groups[$_].how -eq 'git' }).Count -gt 0) {
        [void]$sb.AppendLine("Read from git, for each repository this turn's tool calls pointed at: files in a commit made since the prompt, and uncommitted files written since the prompt.")
    } else {
        [void]$sb.AppendLine("Counted from Edit and Write calls only; a file a command changed is not in the count, and an edit refused after the guard allowed it can still be in the count.")
    }
    [void]$sb.AppendLine("Inner gate (GAME-12): the repository's verify gate command and its output, pasted, for each small change this turn; or say that this was the trivial, reversible, single-file edit the owner asked for, which the inner gate exempts.")
    [void]$sb.AppendLine("Change Request (GATE-06): did this turn change design, behaviour, config, risk, execution, data flow or dependencies? If it did, name its Change Request; if it did not, say so.")
    [void]$sb.AppendLine("Cross-check (GATE-05): does the change still fit DECISIONS.md, ARCHITECTURE.md and the core goal? Name any clash.")
    [void]$sb.AppendLine("Definition of Done (GATE-07): what ran to prove it (command and its output, pasted, AUTO-06); any locked decision contradicted; does the result fit one screen of explanation.")
    [void]$sb.AppendLine("Nothing on this card is checked by a machine: this hook asks once and does not grade the answer, and no Doctor claim reads it (AUTO-06).")

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
