# build.ps1 - renders docs/index.html from docs/src/template.html and the kit's own files.
# Nothing on the page is typed (DECISIONS 3.3): counts, clauses, hooks, claim types, commands,
# the README's grade table, limits and install block, the adopt questions, and the recorded
# transcripts all come from the files named below. Deterministic: same inputs, same bytes (LF).
#
#   pwsh -NoProfile -File docs/build.ps1          # writes docs/index.html
#   pwsh -NoProfile -File docs/build.ps1 -Check   # exit 1 if docs/index.html differs from a fresh render
#
# The Doctor's generated_matches claim (KIT-DOCS-01) runs it as
#   build.ps1 -Source <template> -Out <temp file> [-BrainRoot <ignored>]
# and compares the temp file with docs/index.html byte for byte after CRLF->LF.
#
# Not a hook, not a timer. Run it after a change to any input, then commit the output.

[CmdletBinding()]
param(
    [string] $Source,
    [string] $Out,
    [string] $BrainRoot,   # accepted for the Doctor's generator contract; the page has no brain input
    [switch] $Check
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
$kit  = Split-Path -Parent $PSScriptRoot
$docs = $PSScriptRoot
$src  = Join-Path $docs 'src'

function ReadText([string] $p) { [IO.File]::ReadAllText($p, [Text.UTF8Encoding]::new($false)) -replace "`r`n", "`n" }
function Esc([string] $s) { [Net.WebUtility]::HtmlEncode($s) }
function Attr([string] $s) { (Esc $s) -replace '"', '&quot;' }

# ------------------------------------------------------------------ inputs
$plugin  = ReadText (Join-Path $kit '.claude-plugin\plugin.json') | ConvertFrom-Json
$law     = ReadText (Join-Path $kit 'law.json') | ConvertFrom-Json
$hooks   = ReadText (Join-Path $kit 'hooks\hooks.json') | ConvertFrom-Json
$claims  = ReadText (Join-Path $kit 'tools\doctor\claims.json') | ConvertFrom-Json
$readme  = ReadText (Join-Path $kit 'README.md')
$arch    = ReadText (Join-Path $kit 'ARCHITECTURE.md')
$adoptMd = ReadText (Join-Path $kit 'commands\adopt.md')
$license = (ReadText (Join-Path $kit 'LICENSE')) -split "`n" | Select-Object -First 1
$templatePath = if ($Source) { $Source } else { Join-Path $src 'template.html' }
$template = ReadText $templatePath

$version = [string] $plugin.version
$repoUrl = 'https://github.com/Jordan-Doerksen/design-first'

# ------------------------------------------------------------------ clauses and grades
$clauses = @($law.clauses | Sort-Object { $_.group }, { $_.id })
$gradeOrder = @('HOOK', 'GATE', 'ADVISE', 'OWNER', 'BUILDABLE', 'HONOUR')
$gradeCount = [ordered] @{}
foreach ($g in $gradeOrder) { $gradeCount[$g] = @($clauses | Where-Object { $_.grade -eq $g }).Count }
foreach ($c in $clauses) { if (-not $gradeCount.Contains($c.grade)) { throw "unknown grade $($c.grade) on $($c.id)" } }
$total = $clauses.Count
$stopped = $gradeCount['HOOK'] + $gradeCount['GATE']
$honour  = $gradeCount['HONOUR']

$groupNames = $law.groups
$groupRows = foreach ($gid in ($law.groups.PSObject.Properties.Name)) {
    $in = @($clauses | Where-Object { $_.group -eq $gid })
    if ($in.Count -eq 0) { continue }
    $parts = foreach ($g in $gradeOrder) { $n = @($in | Where-Object { $_.grade -eq $g }).Count; if ($n) { "<span class=""g g-$($g.ToLower())"">$n $g</span>" } }
    "<li><span class=""ix-id"">$(Esc $gid)</span><span class=""ix-name"">$(Esc $groupNames.$gid)</span><span class=""ix-n"">$($in.Count)</span><span class=""ix-grades"">$($parts -join ' ')</span></li>"
}

$clauseRows = foreach ($c in $clauses) {
    $mech = if ($c.enforcedBy) { "$($c.enforcedBy.kind): $($c.enforcedBy.ref)" } else { 'nothing on the disk; the reader' }
    "<tr id=""$(Attr $c.id)""><th scope=""row""><a href=""#$(Attr $c.id)"">$(Esc $c.id)</a></th><td><span class=""g g-$($c.grade.ToLower())"">$(Esc $c.grade)</span></td><td>$(Esc $c.rule)</td><td class=""mech"">$(Esc $mech)</td></tr>"
}

$clauseJson = @($clauses | ForEach-Object {
    [ordered] @{ id = $_.id; group = $_.group; grade = $_.grade; rule = $_.rule; verb = $_.verb
                 mech = $(if ($_.enforcedBy) { "$($_.enforcedBy.kind): $($_.enforcedBy.ref)" } else { '' }) }
}) | ConvertTo-Json -Compress -Depth 3
$clauseOptions = foreach ($c in $clauses) { "<option value=""$(Attr $c.id)"">$(Esc $c.id) - $(Esc $c.grade)</option>" }

# ------------------------------------------------------------------ hooks
$hookRows = foreach ($ev in $hooks.hooks.PSObject.Properties) {
    foreach ($entry in $ev.Value) {
        foreach ($h in $entry.hooks) {
            if ($h.command -notmatch 'hooks/([a-z-]+\.ps1)') { continue }
            $script = $Matches[1]
            $first = ((ReadText (Join-Path $kit "hooks\$script")) -split "`n" | Where-Object { $_ -match '^#' } | Select-Object -First 1) -replace '^#\s*[a-z-]+\.ps1\s*-\s*', '' -replace '^#\s*', ''
            $m = if ($entry.matcher) { [string] $entry.matcher } else { 'every' }
            "<li><span class=""ix-id"">$(Esc $ev.Name)</span><span class=""ix-name""><code>$(Esc $script)</code></span><span class=""ix-n"">$(Esc $m)</span><span class=""ix-grades"">$(Esc $first)</span></li>"
        }
    }
}

# ------------------------------------------------------------------ Doctor claim types
$typeCount = [ordered] @{}
foreach ($cl in $claims.claims) { $t = [string] $cl.type; if ($typeCount.Contains($t)) { $typeCount[$t]++ } else { $typeCount[$t] = 1 } }
$claimRows = foreach ($t in ($typeCount.Keys | Sort-Object)) { "<li><span class=""ix-id""><code>$(Esc $t)</code></span><span class=""ix-n"">$($typeCount[$t]) in the kit's own claims</span></li>" }

# ------------------------------------------------------------------ commands and the agent
$cmdRows = foreach ($f in (Get-ChildItem (Join-Path $kit 'commands') -Filter *.md | Sort-Object Name)) {
    $d = ((ReadText $f.FullName) -split "`n" | Where-Object { $_ -match '^description:\s*' } | Select-Object -First 1) -replace '^description:\s*', ''
    "<li><span class=""ix-id""><code>/design-first:$(Esc $f.BaseName)</code></span><span class=""ix-grades"">$(Esc $d)</span></li>"
}
$agentDesc = ((ReadText (Join-Path $kit 'agents\reviewer.md')) -split "`n" | Where-Object { $_ -match '^description:\s*' } | Select-Object -First 1) -replace '^description:\s*', ''

# ------------------------------------------------------------------ README sections
function Section([string] $md, [string] $heading) {
    $lines = $md -split "`n"; $out = @(); $in = $false
    foreach ($l in $lines) {
        if ($l -match '^## ') { if ($in) { break }; if ($l -eq "## $heading") { $in = $true; continue } }
        elseif ($in) { $out += $l }
    }
    if (-not $in) { throw "README section not found: $heading" }
    ($out -join "`n").Trim()
}
function MdTable([string] $block) {
    $rows = @($block -split "`n" | Where-Object { $_ -match '^\|' })
    $cells = foreach ($r in $rows) { ,@(($r.Trim('|') -split '\|') | ForEach-Object { $_.Trim() }) }
    $cells = @($cells | Where-Object { -not ($_[0] -match '^-+$') })
    $head = $cells[0]; $body = $cells[1..($cells.Count - 1)]
    $h = "<tr>" + (($head | ForEach-Object { "<th scope=""col"">$(Esc $_)</th>" }) -join '') + "</tr>"
    $b = foreach ($row in $body) { "<tr>" + (($row | ForEach-Object { "<td>$((Esc $_) -replace '`([^`]+)`', '<code>$1</code>')</td>" }) -join '') + "</tr>" }
    "<table><thead>$h</thead><tbody>$($b -join '')</tbody></table>"
}
function MdList([string] $block) {
    $items = foreach ($l in ($block -split "`n")) { if ($l -match '^- ') { $l.Substring(2) } elseif ($l -match '^\s{2,}\S' -and $items) { $null } }
    # join continuation lines
    $acc = @(); foreach ($l in ($block -split "`n")) { if ($l -match '^- ') { $acc += $l.Substring(2) } elseif ($l -match '^\s+\S' -and $acc.Count) { $acc[-1] += ' ' + $l.Trim() } }
    "<ul>" + (($acc | ForEach-Object { "<li>$((Esc $_) -replace '`([^`]+)`', '<code>$1</code>')</li>" }) -join '') + "</ul>"
}
function MdCode([string] $block) {
    if ($block -notmatch '(?s)```[a-z]*\n(.*?)```') { throw 'no code block' }
    "<pre><code>$(Esc $Matches[1].TrimEnd())</code></pre>"
}
$gradeTable = MdTable (Section $readme 'What a grade means')
$limits     = MdList  (Section $readme 'Limits, stated up front')
$install    = MdCode  (Section $readme 'Install')

# ARCHITECTURE core flow block
if ($arch -notmatch '(?s)## Core flow\s*```\n(.*?)```') { throw 'ARCHITECTURE core flow block not found' }
$coreFlow = Esc $Matches[1].TrimEnd()

# adopt.md questions: "N. **Name** - "text""
$questions = foreach ($l in ($adoptMd -split "`n")) {
    if ($l -match '^(\d)\. \*\*([^*]+)\*\*.*?"(.*?)"') { "<li><b>$(Esc $Matches[2])</b> $((Esc $Matches[3]) -replace '`([^`]+)`', '<code>$1</code>')</li>" }
}

# ------------------------------------------------------------------ transcripts
function Transcript([string] $name) {
    $t = ReadText (Join-Path $src "transcript-$name.txt")
    $lines = $t -split "`n"
    $hdr = $lines[0]; if ($hdr -notmatch '^# recorded (\S+) - design-first (\S+)') { throw "transcript-$name.txt has no header" }
    $script:recorded = $Matches[1]; $script:recordedKit = $Matches[2]
    $out = foreach ($l in $lines[1..($lines.Count - 1)]) {
        if ($l.Trim() -eq '') { '<span class="ln"> </span>'; continue }
        $cls = 'ln'
        if ($l -match '^\s*(wrote|git|law)\s|\[ ok \]') { $cls += ' ok' }
        if ($l -match 'FAIL\s|\[WARN\]|RED') { $cls += ' bad' }
        if ($l -match 'VERDICT: GREEN|every claim holds|nothing needs action') { $cls += ' good' }
        if ($l -match '^\S' -and $l -match '^[a-z]+$') { $cls += ' hd' }
        "<span class=""$cls"">$(Esc $l)</span>"
    }
    , @($hdr.TrimStart('# '), ($out -join "`n"))
}
$tAdopt  = Transcript 'adopt'
$tDoctor = Transcript 'doctor'
$tKit    = Transcript 'doctor-kit'
$tGuard  = Transcript 'guard'
$recorded = $script:recorded

# ------------------------------------------------------------------ render
$fill = [ordered] @{
    VERSION        = Esc $version
    RECORDED       = Esc $recorded
    RECORDED_KIT   = Esc $script:recordedKit
    REPO           = $repoUrl
    TOTAL          = $total
    STOPPED        = $stopped
    HONOUR         = $honour
    HOOKS_N        = $gradeCount['HOOK']
    GATES_N        = $gradeCount['GATE']
    GRADE_COUNTS   = (($gradeOrder | ForEach-Object { "<li><span class=""g g-$($_.ToLower())"">$_</span><b>$($gradeCount[$_])</b></li>" }) -join '')
    GRADE_TABLE    = $gradeTable
    GROUP_ROWS     = ($groupRows -join "`n")
    CLAUSE_ROWS    = ($clauseRows -join "`n")
    CLAUSE_OPTIONS = ($clauseOptions -join "`n")
    CLAUSE_JSON    = $clauseJson
    HOOK_ROWS      = ($hookRows -join "`n")
    CLAIM_ROWS     = ($claimRows -join "`n")
    CMD_ROWS       = ($cmdRows -join "`n")
    AGENT_DESC     = Esc $agentDesc
    QUESTIONS      = ($questions -join "`n")
    CORE_FLOW      = $coreFlow
    LIMITS         = $limits
    INSTALL        = $install
    LICENSE        = Esc $license
    T_ADOPT        = $tAdopt[1];  T_ADOPT_H  = Esc $tAdopt[0]
    T_DOCTOR       = $tDoctor[1]; T_DOCTOR_H = Esc $tDoctor[0]
    T_KIT          = $tKit[1];    T_KIT_H    = Esc $tKit[0]
    T_GUARD        = $tGuard[1];  T_GUARD_H  = Esc $tGuard[0]
}
$html = $template
foreach ($k in $fill.Keys) { $html = $html.Replace("{{$k}}", [string] $fill[$k]) }
if ($html -match '\{\{[A-Z_]+\}\}') { throw "unfilled placeholder: $($Matches[0])" }
$html = $html -replace "`r`n", "`n"
if (-not $html.EndsWith("`n")) { $html += "`n" }

$outPath = if ($Out) { $Out } else { Join-Path $docs 'index.html' }
if ($Check) {
    $cur = if (Test-Path $outPath) { ReadText $outPath } else { '' }
    if ($cur -ne $html) { Write-Output "docs/index.html is stale: run docs/build.ps1"; exit 1 }
    Write-Output 'docs/index.html matches a fresh render'; exit 0
}
[IO.File]::WriteAllText($outPath, $html, [Text.UTF8Encoding]::new($false))
Write-Output "wrote $outPath  ($total clauses, $stopped stopped by a machine, $honour on honour; transcripts recorded $recorded)"
