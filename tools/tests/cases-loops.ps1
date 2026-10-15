# cases-loops.ps1 - the lint check for LOOPS.md, the kit's loops-and-gates charts (CR-2026-10-15-CHART).
# Dot-sourced by run.ps1. It reads these names from run.ps1's scope: $kit and Record. Never run
# directly. The charts are drawn by hand; this check catches the drift a machine can see: a clause id
# that no longer exists, a chart line too wide to show without sideways scrolling, a character that
# renders badly in a terminal or a screen reader, and a chart with no words after it.

Write-Host '-- LOOPS.md: the loops-and-gates charts'
$loopsPath = Join-Path $kit 'LOOPS.md'
$maxCols = 64   # the narrowest GitHub code block that shows a chart without scrolling, measured 2026-10-15
if (-not (Test-Path -LiteralPath $loopsPath -PathType Leaf)) {
    Record 'loops: LOOPS.md exists' 'present' 'absent' $loopsPath
} else {
    $lines = @(Get-Content -LiteralPath $loopsPath -Encoding utf8)
    $lawIds = @((Get-Content -LiteralPath (Join-Path $kit 'law.json') -Raw -Encoding utf8 | ConvertFrom-Json).clauses | ForEach-Object { [string]$_.id })
    $cited = @([regex]::Matches(($lines -join "`n"), '\b(SAFE|PRIN|OWN|DES|GATE|AUTO|VCS|OBS|WEB|GAME|DISP|SKIN|VOICE|MAP)-\d{2}\b') | ForEach-Object { $_.Value } | Select-Object -Unique)
    $unknown = @($cited | Where-Object { $lawIds -notcontains $_ })
    Record 'loops: every clause id cited is in law.json' 'known' $(if ($cited.Count -gt 0 -and $unknown.Count -eq 0) { 'known' } elseif ($cited.Count -eq 0) { 'none-cited' } else { 'unknown: ' + ($unknown -join ', ') }) ''

    # Walk the fenced chart blocks (```text ... ```): width, characters, and words after each one.
    $wide = @(); $bad = @(); $noList = @(); $charts = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -notmatch '^```text\s*$') { continue }
        $charts++; $start = $i + 1; $j = $start
        while ($j -lt $lines.Count -and $lines[$j] -notmatch '^```\s*$') {
            $l = $lines[$j]
            if ($l.Length -gt $maxCols) { $wide += ("line {0}: {1} columns" -f ($j + 1), $l.Length) }
            if ($l -match "`t" -or $l -match '[^\x20-\x7E]') { $bad += ("line {0}" -f ($j + 1)) }
            $j++
        }
        # The words after the chart: a numbered list must start within a few lines of the fence.
        $k = $j + 1; $found = $false
        while ($k -lt $lines.Count -and $k -le $j + 4) { if ($lines[$k] -match '^\s*1\.\s') { $found = $true; break }; $k++ }
        if (-not $found) { $noList += ("chart at line {0}" -f $start) }
        $i = $j
    }
    Record 'loops: LOOPS.md holds charts' 'charts' $(if ($charts -gt 0) { 'charts' } else { 'none' }) ''
    Record "loops: no chart line is wider than $maxCols columns" 'fits' $(if ($wide.Count -eq 0) { 'fits' } else { 'wide: ' + ($wide -join '; ') }) ''
    Record 'loops: charts hold plain ASCII and no tab' 'ascii' $(if ($bad.Count -eq 0) { 'ascii' } else { 'bad: ' + ($bad -join ', ') }) ''
    Record 'loops: every chart is followed by a numbered list' 'listed' $(if ($noList.Count -eq 0) { 'listed' } else { 'missing: ' + ($noList -join '; ') }) ''
}
