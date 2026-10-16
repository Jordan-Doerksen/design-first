# guard-gate-rules.ps1 - guard rule 10: the design gate (GATE-08, GATE-09). Dot-sourced by
# guard.ps1 after guard-rules.ps1, whose helpers (Get-DfRepoRoot, Get-DfManifestPaths,
# Get-DfSizeChange) it uses. Never run directly.
#
# A repository declares a design gate with one line in its DECISIONS.md, at the root or in docs\:
# `Design gate: on` (or a table row `| Design gate | on |`). While that line stands and the
# repository has no `records/gate-cleared.md`, every source Edit, Write or NotebookEdit is refused
# (a shell write is not inspected); documents, config and data stay writable, because the gate is
# cleared by writing documents. The record is read, not trusted: it carries one `Findings: <n>`
# line with n above zero (a review that finds nothing is a failed review, GATE-09; two Findings
# lines are ambiguous), and every `- ` line in it is a finding line in the form
# `- <id> resolved: <where>` or `- <id> recorded: <where>`, with n distinct ids. A list line in
# another style (`* `, `+ `, `1. `, `1) `) or inside a quote (`> - `) is refused, so no finding
# hides from the count. A
# record that falls short refuses the write and says which line. While the gate
# is not cleared, an Edit or Write that removes the gate line from the manifest is refused too:
# the owner ends a gate, by Change Request, never the agent.
#
# anchor: design-gate  mode: deny  verbs: gap-review,clear-gate

$script:DfGateOnRx = '(?im)^\s*\|?\s*\**\s*design gate\s*\**\s*(\||:)\s*\**\s*on\b'

# A finding line. The id is the finding's label and carries a digit (F1, F12, S1-8), so a word such
# as 'not' or 'never' cannot stand in the id's place. The status word comes right after the id, and
# the place that holds the answer comes after the colon.
$script:DfFindingRx = '(?i)^\s*-\s+(?<id>(?=[^\s:]*\d)[^\s:]+)\s+(?<status>resolved|recorded)\s*:\s*\S'
$script:DfNegatedStatusRx = "(?i)(\bnot|\bnever|\bno longer|n't|\bun)\s*(yet\s+|fully\s+)?(resolved|recorded)\b"
$script:DfFindingForm = "'- <id> resolved: <where>' or '- <id> recorded: <where>'"

# The manifest files of a repository that declare the gate. Both places are read when both exist:
# reading the root first and stopping there would let a new, empty root DECISIONS.md switch off
# a gate declared in docs\DECISIONS.md.
function Get-DfGateManifests([string]$repoRoot) {
    $out = @()
    foreach ($m in @(Get-DfManifestPaths $repoRoot)) {
        if ([IO.File]::ReadAllText($m) -match $script:DfGateOnRx) { $out += $m }
    }
    return $out
}

# Why one '- ' line of the record is not a finding line, in words the agent can act on.
function Get-DfFindingProblem([string]$line) {
    $t = $line.Trim()
    if ($t -match $script:DfNegatedStatusRx) { return ("a finding's status is negated: '{0}'; a finding that is not resolved is recorded in the manifest's Open Questions, then listed as '- <id> recorded: <where>'" -f $t) }
    if ($t -match '(?i)^-\s+(?<id>[^\s:]+)\s+(resolved|recorded)\b') {
        $id = $Matches.id
        if ($id -notmatch '\d') { return ("the finding id '{0}' carries no digit: '{1}'; write {2}" -f $id, $t, $script:DfFindingForm) }
        return ("a finding names no place after its status: '{0}'; write {1}" -f $t, $script:DfFindingForm)
    }
    if ($t -match '(?i)\b(resolved|recorded)\b') { return ("a finding's status is not right after its id: '{0}'; write {1}" -f $t, $script:DfFindingForm) }
    return ("a '- ' line is not a finding line: '{0}'; every '- ' line in the record is a finding, in the form {1}" -f $t, $script:DfFindingForm)
}

# 'off' (no gate declared or no manifest), 'open' (declared, no record), 'cleared', or
# 'bad: <reason>' (a record that does not clear the gate).
# Workaround (CR-2026-10-15-GAPS D2): the record used to count every '- ' line in the file, check
# only that the count was not short, and find 'resolved' anywhere in a line, so an honest
# '- F1 not resolved yet' cleared the gate. A line now counts only in the finding form, any other
# '- ' line refuses, and the distinct ids must equal Findings.
function Get-DfGateState([string]$repoRoot) {
    if (@(Get-DfGateManifests $repoRoot).Count -eq 0) { return 'off' }
    $record = Join-Path $repoRoot 'records\gate-cleared.md'
    if (-not (Test-Path -LiteralPath $record -PathType Leaf)) { return 'open' }
    $r = [IO.File]::ReadAllText($record)
    # Workaround (CR-2026-10-15-GAPS review): only the first Findings line was read, so a record
    # with 'Findings: 1' above 'Findings: 3' was read as one finding. Two Findings lines are two
    # answers to one question, and the record is refused as ambiguous.
    $counts = @([regex]::Matches($r, '(?im)^[ \t]*findings[ \t]*:.*$') | ForEach-Object { $_.Value.Trim() })
    if ($counts.Count -gt 1) { return ("bad: {0} ""Findings:"" lines in records\gate-cleared.md ({1}); the record states one count, on one line" -f $counts.Count, ("'" + ($counts -join "', '") + "'")) }
    if ($r -notmatch '(?im)^findings:\s*(\d+)\s*$') { return 'bad: no "Findings: <n>" line in records\gate-cleared.md' }
    # Workaround (CR-2026-10-15-GAPS D2 check): a cast threw on a count past the Int32 range
    # ('Findings: 99999999999'), and the guard's internal-error path allowed the source write, so a
    # record could open the gate by crashing the parser. A count that does not parse is a bad record.
    $n = 0
    if (-not [int]::TryParse($Matches[1], [ref]$n)) { return ('bad: "Findings: {0}" is not a count of findings' -f $Matches[1]) }
    if ($n -lt 1) { return 'bad: "Findings: 0"; a review that finds nothing is a failed review (GATE-09)' }
    $ids = [Collections.Generic.List[string]]::new()
    foreach ($line in ($r -split "`r?`n")) {
        # Workaround (CR-2026-10-15-GAPS review): only '- ' lines were read, so '* F2 open' or
        # '1. F2 open' sat beside a clean '- F1 resolved: x' and the gate cleared on 'Findings: 1'.
        # A list line in another style is refused by name: every list line in the record is a '- '
        # finding line.
        if ($line -match '^\s*([*+]|\d+[.)])\s+\S') { return ("bad: a list line in another style: '{0}'; every list line in the record is a '- ' line, in the form {1}" -f $line.Trim(), $script:DfFindingForm) }
        # Workaround (CR-2026-10-15-GAPS hooks check): a list inside a quote ('> - F2 open',
        # '> * F2 open') was read as neither, so a finding hid there as it did in another style.
        if ($line -match '^\s*(>\s*)+([-*+]|\d+[.)])\s+\S') { return ("bad: a list line inside a quote: '{0}'; every list line in the record is a '- ' line outside any quote, in the form {1}" -f $line.Trim(), $script:DfFindingForm) }
        if ($line -notmatch '^\s*-\s+\S') { continue }
        if ($line -match $script:DfFindingRx) {
            # One id however it is marked up: '**F1**', '`F1`', '[F1]' and 'F1.' are the id F1, so
            # the same finding written two ways is not counted as two.
            $id = ([string]$Matches.id).Trim([char[]]'*_`[]().,;')
            if (-not ($ids | Where-Object { $_ -ieq $id })) { $ids.Add($id) }
            continue
        }
        return ('bad: ' + (Get-DfFindingProblem $line))
    }
    if ($ids.Count -ne $n) {
        $listed = if ($ids.Count -gt 0) { ' (' + ($ids -join ', ') + ')' } else { '' }
        return ("bad: Findings: {0} declared, {1} distinct finding id(s) listed{2}; one finding line per finding, in the form {3}" -f $n, $ids.Count, $listed, $script:DfFindingForm)
    }
    return 'cleared'
}

# An Edit or Write of a manifest file that removes its gate line while the gate is not cleared.
# Workaround (CR-2026-10-15-GAPS D2): every DECISIONS.md write passed, because it is not source,
# so the agent could end an open gate by deleting one line, and nothing answered.
function Test-DfGateLineRemoval([string]$full, [string]$tool, $ti, [string]$owner) {
    if ($tool -notin @('Edit', 'Write')) { return $null }
    if ((Split-Path -Leaf $full) -ine 'DECISIONS.md') { return $null }
    if (-not [IO.File]::Exists($full)) { return $null }   # a new file removes no line
    $root = Get-DfRepoRoot $full
    if (-not $root) { return $null }
    if (-not (@(Get-DfManifestPaths $root) | Where-Object { $_ -ieq $full })) { return $null }   # not this repository's manifest
    if ([IO.File]::ReadAllText($full) -notmatch $script:DfGateOnRx) { return $null }
    $state = Get-DfGateState $root
    if ($state -eq 'off' -or $state -eq 'cleared') { return $null }
    $change = Get-DfSizeChange $tool $ti $full
    if ($null -eq $change -and $tool -eq 'Edit') {
        # Workaround (CR-2026-10-15-GAPS D2 check): the host's Edit finds old_string after folding
        # curly quotes to straight ones; the exact matcher above does not. An old_string with a
        # straight quote where the file has a curly one went unplaced, the check allowed, and the
        # host removed the gate line. Fold both sides the same way and look again.
        $fold = { param([string]$s) if ($null -eq $s) { '' } else { $s.Replace("`r`n", "`n").Replace([string][char]0x2018, "'").Replace([string][char]0x2019, "'").Replace([string][char]0x201C, '"').Replace([string][char]0x201D, '"') } }
        $base = & $fold ([IO.File]::ReadAllText($full)); $old = & $fold ([string]$ti.old_string); $new = & $fold ([string]$ti.new_string)
        $i = if ($old) { $base.IndexOf($old, [StringComparison]::Ordinal) } else { -1 }
        if ($i -ge 0) {
            $all = [bool]($ti.PSObject.Properties['replace_all'] -and $ti.replace_all)
            $change = @{ text = $(if ($all) { $base.Replace($old, $new) } else { $base.Substring(0, $i) + $new + $base.Substring($i + $old.Length) }) }
        }
    }
    if ($null -eq $change) { return $null }               # the host refuses an Edit that matches nowhere
    if ($change.text -match $script:DfGateOnRx) { return $null }
    $record = Join-Path $root 'records\gate-cleared.md'
    $why = if ($state -eq 'open') { "$record does not exist" } else { "$record does not clear it: $($state.Substring(5))" }
    $reason = ("BLOCKED - this edit removes the `"Design gate: on`" line from {0} while the design gate is open ({1}). " +
               "GATE-08: work where a wrong output costs money, safety or a person's trust gets an adversarial gap review before the code, and only {2} ends a gate, by Change Request (GATE-06). " +
               "Clear the gate with the record, or ask {2} to remove the line.") -f $full, $why, $owner
    return (New-DfDeny 'guard' 'design gate line removed while the gate is open' $reason)
}

function Test-DfDesignGateRule([string]$full, [string[]]$sourceExts, [string]$owner, [string[]]$skipUnder, [string]$tool = '', $ti = $null) {
    if (-not $full) { return $null }
    foreach ($s in $skipUnder) { if ($s -and (Test-DfUnder $full $s)) { return $null } }
    $removal = Test-DfGateLineRemoval $full $tool $ti $owner
    if ($removal) { return $removal }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    if ($sourceExts -notcontains $ext) { return $null }
    $root = Get-DfRepoRoot $full
    if (-not $root) { return $null }
    $state = Get-DfGateState $root
    if ($state -eq 'off' -or $state -eq 'cleared') { return $null }
    $record = Join-Path $root 'records\gate-cleared.md'
    if ($state -eq 'open') {
        $manifest = @(Get-DfGateManifests $root)[0]
        $reason = ("BLOCKED - {0} declares `"Design gate: on`" and {1} does not exist. " +
                   "GATE-08: work where a wrong output costs money, safety or a person's trust gets an adversarial gap review of the spec and the manifest before the code. " +
                   "Run the review, resolve or record every finding, then write the record: a `"Findings: <n>`" line with n above zero and one line per finding in the form {2}, n distinct ids. " +
                   "Documents stay writable. If this repository is not gated after all, {3} removes the line from DECISIONS.md by Change Request; the guard refuses that edit from the agent while the gate is open.") -f $manifest, $record, $script:DfFindingForm, $owner
        return (New-DfDeny 'guard' 'design gate open (no gate-cleared record)' $reason)
    }
    $why = $state.Substring(5)
    $reason = ("BLOCKED - {0} does not clear the design gate: {1}. " +
               "GATE-09: the gate is cleared when every finding is resolved or recorded, never because the review returned nothing. Fix the record, then build.") -f $record, $why
    return (New-DfDeny 'guard' 'design gate not cleared' $reason)
}
