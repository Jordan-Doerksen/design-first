# stop.ps1 - design-first Stop hook: a code turn does not end without its card (DES-07, GATE-05/06/07).
#
# The guard records every allowed Edit / Write / NotebookEdit of this session in a ledger
# (<markers>/<session>.edits, one "path<TAB>flags" line); route.ps1 clears it at each prompt, so
# the ledger is this turn's changes. When the turn changed source and the model tries to stop, this
# hook refuses ONCE and hands back the card: the documents touched or not (DES-07), the Change Log
# row when DECISIONS.md changed (GATE-06), the cross-check (GATE-05) and the Definition of Done
# (GATE-07). The model answers the card in its reply; the next stop attempt (stop_hook_active) passes.
# A turn that changed no source, or only documents, is never stopped. Owner decision 2026-10-08:
# block once, then yield. Scope: only edits inside a git repository count, and only under the root
# when the pointer names one; a scratch file outside both never raises the card.
#
# Honest limit: the hook can require the card, not grade the answer. A model's claim that the
# cross-check passed is a claim (AUTO-06); the deterministic checks are the Doctor and the gate.
#
# anchor: stop-done  mode: deny  verbs: document,cross-check,change,finish

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'

$script:DfDefaultStopDocs = @('DECISIONS.md', 'ARCHITECTURE.md', 'HANDOFF.md', 'CHANGELOG.md', 'README.md', 'SPEC.md', 'MANUAL.md')

function Get-DfEditLedgerPath([string]$sessionId) {
    $dir = Get-DfMarkerDir
    if ([string]::IsNullOrWhiteSpace($sessionId)) { $sessionId = 'unknown' }
    return (Join-Path $dir (($sessionId -replace '[^A-Za-z0-9_.-]', '_') + '.edits'))
}

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')
    . (Join-Path $PSScriptRoot 'lib\guard-rules.ps1')   # Get-DfRepoRoot, the default source extensions

    $raw = ''
    try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch { }
    $j = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $j = $raw | ConvertFrom-Json } catch { $j = $null } }
    $sessionId = if ($j -and $j.session_id) { [string]$j.session_id } else { 'unknown' }
    $active = $false
    if ($j -and $j.PSObject.Properties['stop_hook_active']) { $active = [bool]$j.stop_hook_active }
    if ($active) { exit 0 }                                   # the card was handed over already; yield

    $ledger = Get-DfEditLedgerPath $sessionId
    if (-not (Test-Path -LiteralPath $ledger -PathType Leaf)) { exit 0 }
    $lines = @(Get-Content -LiteralPath $ledger -Encoding utf8 | Where-Object { $_.Trim() })
    if ($lines.Count -eq 0) { exit 0 }

    $ptr = Read-DfPointer
    $cfg = @{ present = $false; sourceExtensions = @(); splitLines = 0 }
    try { $cfg = Read-DfBrainConfig $ptr } catch { }
    $exts = if ($cfg.sourceExtensions -and @($cfg.sourceExtensions).Count -gt 0) { @($cfg.sourceExtensions) } else { $script:DfDefaultSourceExtensions }
    $docs = $script:DfDefaultStopDocs
    if ($cfg.PSObject -and $cfg.ContainsKey('stopDocs') -and @($cfg.stopDocs).Count -gt 0) { $docs = @($cfg.stopDocs) }

    # Group this turn's edits by repository root. A path outside the root or in no repository is
    # skipped: the guard no longer records one, and a ledger written before that fix is filtered here.
    $groups = @{}
    foreach ($l in $lines) {
        $parts = $l -split "`t"
        $path = $parts[0]; $flags = if ($parts.Count -gt 1) { $parts[1] } else { '' }
        $root = Get-DfLedgerRepo $path $ptr.root
        if (-not $root) { continue }
        if (-not $groups.ContainsKey($root)) { $groups[$root] = @{ src = [Collections.Generic.List[string]]::new(); docs = [Collections.Generic.List[string]]::new(); decisions = $false; changelog = $false } }
        $g = $groups[$root]
        $leaf = Split-Path -Leaf $path
        $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
        $isDoc = ($docs | Where-Object { $_ -ieq $leaf }).Count -gt 0 -or ($path -match '(?i)[\\/]docs[\\/]')
        if ($isDoc) {
            if (-not $g.docs.Contains($leaf)) { $g.docs.Add($leaf) }
            if ($leaf -ieq 'DECISIONS.md') { $g.decisions = $true; if ($flags -match 'changelog') { $g.changelog = $true } }
        }
        elseif ($exts -contains $ext) { if (-not $g.src.Contains($path)) { $g.src.Add($path) } }
    }

    $hits = @($groups.Keys | Where-Object { $groups[$_].src.Count -gt 0 } | Sort-Object)
    if ($hits.Count -eq 0) { exit 0 }

    $sb = [Text.StringBuilder]::new()
    [void]$sb.AppendLine("design-first: this turn changed source. Answer this card in your reply, then stop (DES-07, GATE-05, GATE-06, GATE-07; the hook asks once per turn).")
    foreach ($root in $hits) {
        $g = $groups[$root]
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine(("Repository {0}: {1} source file(s) changed." -f $root, $g.src.Count))
        if ($g.docs.Count -gt 0) { [void]$sb.AppendLine("  Documents touched: " + ($g.docs -join ', ') + ".") }
        else { [void]$sb.AppendLine("  Documents touched: none. DES-07: documents are co-equal; say which document should carry this change, or why none does.") }
        if ($g.decisions -and -not $g.changelog) { [void]$sb.AppendLine("  DECISIONS.md was edited with no Change Log row. GATE-06: a change to a decision is a Change Request; add the row, or say why this edit is not one.") }
    }
    [void]$sb.AppendLine("")
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
