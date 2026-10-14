# guard-gate-rules.ps1 - guard rule 10: the design gate (GATE-08, GATE-09). Dot-sourced by
# guard.ps1 after guard-rules.ps1. Never run directly.
#
# A repository declares a design gate with one line in its DECISIONS.md: `Design gate: on`
# (or a table row `| Design gate | on |`). While that line stands and the repository has no
# `records/gate-cleared.md`, every source write is refused; documents, config and data stay
# writable, because the gate is cleared by writing documents. The record is read, not trusted:
# it carries `Findings: <n>` with n above zero (a review that finds nothing is a failed review,
# GATE-09) and one `- ` line per finding, each marked `resolved` or `recorded`. A record that
# falls short refuses the write and says which line.
#
# anchor: design-gate  mode: deny  verbs: gap-review,clear-gate

$script:DfGateOnRx = '(?im)^\s*\|?\s*\**\s*design gate\s*\**\s*(\||:)\s*\**\s*on\b'

# 'off' (no gate declared or no manifest), 'open' (declared, no record), 'cleared', or
# 'bad: <reason>' (a record that does not clear the gate).
function Get-DfGateState([string]$repoRoot) {
    $manifest = Join-Path $repoRoot 'DECISIONS.md'
    if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { return 'off' }
    $text = [IO.File]::ReadAllText($manifest)
    if ($text -notmatch $script:DfGateOnRx) { return 'off' }
    $record = Join-Path $repoRoot 'records\gate-cleared.md'
    if (-not (Test-Path -LiteralPath $record -PathType Leaf)) { return 'open' }
    $r = [IO.File]::ReadAllText($record)
    if ($r -notmatch '(?im)^findings:\s*(\d+)\s*$') { return 'bad: no "Findings: <n>" line in records\gate-cleared.md' }
    $n = [int]$Matches[1]
    if ($n -lt 1) { return 'bad: "Findings: 0"; a review that finds nothing is a failed review (GATE-09)' }
    $items = @(($r -split "`r?`n") | Where-Object { $_ -match '^\s*-\s+\S' })
    if ($items.Count -lt $n) { return ("bad: Findings: {0} declared, {1} listed as `"- `" lines" -f $n, $items.Count) }
    foreach ($it in $items) {
        if ($it -notmatch '(?i)\b(resolved|recorded)\b') { return ("bad: a finding is neither resolved nor recorded: {0}" -f $it.Trim()) }
    }
    return 'cleared'
}

function Test-DfDesignGateRule([string]$full, [string[]]$sourceExts, [string]$owner, [string[]]$skipUnder) {
    if (-not $full) { return $null }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    if ($sourceExts -notcontains $ext) { return $null }
    foreach ($s in $skipUnder) { if ($s -and (Test-DfUnder $full $s)) { return $null } }
    $root = Get-DfRepoRoot $full
    if (-not $root) { return $null }
    $state = Get-DfGateState $root
    if ($state -eq 'off' -or $state -eq 'cleared') { return $null }
    $record = Join-Path $root 'records\gate-cleared.md'
    if ($state -eq 'open') {
        $reason = ("BLOCKED - this repository's DECISIONS.md declares `"Design gate: on`" and {0} does not exist. " +
                   "GATE-08: work where a wrong output costs money, safety or a person's trust gets an adversarial gap review of the spec and the manifest before the code. " +
                   "Run the review, resolve or record every finding, then write the record: a `"Findings: <n>`" line with n above zero and one `"- `" line per finding marked resolved or recorded. " +
                   "Documents stay writable. If this repository is not gated after all, {1} removes the line from DECISIONS.md.") -f $record, $owner
        return (New-DfDeny 'guard' 'design gate open (no gate-cleared record)' $reason)
    }
    $why = $state.Substring(5)
    $reason = ("BLOCKED - {0} does not clear the design gate: {1}. " +
               "GATE-09: the gate is cleared when every finding is resolved or recorded, never because the review returned nothing. Fix the record, then build.") -f $record, $why
    return (New-DfDeny 'guard' 'design gate not cleared' $reason)
}
