# selftest-snapshot.ps1 - self-test cases for the snapshot_diff claim type and snapshot.ps1
# (CR-2026-10-14-REVIEW). Dot-sourced by selftest.ps1, which owns the fixtures and helpers used here
# ($kit, $here, W, Ok, Bad, Assert-Has, Assert-Exit). Never run directly. Split out by domain because
# selftest.ps1 is past its split line (DES-03).
#
# Fixture: a tree, a snapshot of it written by the real snapshot.ps1, then three changes: notes.md
# edited, extra.md added, old.md removed, gen.txt (excluded) edited. The claims below say which of
# those were meant. Three lists are handed back for the true, false and unknown runs.

function New-SnapshotFixture {
    $snap = Join-Path $kit 'snap'
    W (Join-Path $snap 'notes.md')     "line one`nline two`n"
    W (Join-Path $snap 'old.md')       "to be removed`n"
    W (Join-Path $snap 'sub\x.json')   "{ `"a`": 1 }`n"
    W (Join-Path $snap 'gen.txt')      "generated, excluded`n"
    $writer = Join-Path $here 'snapshot.ps1'
    $out = & pwsh -NoProfile -File $writer -Root $snap -Out (Join-Path $kit 'snap-before.json') -Exclude 'gen.txt' 2>&1 | Out-String
    Assert-Exit 'S: snapshot.ps1 writes the snapshot' $LASTEXITCODE 0
    Assert-Has  'S: snapshot.ps1 says what it wrote' $out '3 file(s) under'
    $j = Get-Content -LiteralPath (Join-Path $kit 'snap-before.json') -Raw | ConvertFrom-Json
    if ($j.schema -eq 1 -and @($j.files).Count -eq 3 -and @($j.files | Where-Object { $_.path -eq 'gen.txt' }).Count -eq 0 -and $j.files[0].sha256 -match '^[0-9a-f]{64}$') { Ok 'S: the snapshot is schema 1, excludes gen.txt, carries SHA-256' } else { Bad 'S: snapshot shape' (($j | ConvertTo-Json -Depth 4)) }
    $bad = & pwsh -NoProfile -File $writer -Root (Join-Path $kit 'no-such-snap') -Out (Join-Path $kit 'snap-none.json') 2>&1 | Out-String
    Assert-Exit 'S: snapshot.ps1 refuses a missing root' $LASTEXITCODE 1
    # a stale snapshot: the same files, taken long ago
    $old = Get-Content -LiteralPath (Join-Path $kit 'snap-before.json') -Raw | ConvertFrom-Json
    $old.taken = '2020-01-01T00:00:00Z'
    W (Join-Path $kit 'snap-stale.json') (($old | ConvertTo-Json -Depth 6) + "`n")
    W (Join-Path $kit 'snap-broken.json') "{ not json`n"
    # the changes
    W (Join-Path $snap 'notes.md')  "line one`nline two (edited)`n"
    W (Join-Path $snap 'extra.md')  "new here`n"
    Remove-Item -LiteralPath (Join-Path $snap 'old.md') -Force
    W (Join-Path $snap 'gen.txt')   "generated again, still excluded`n"
}

$snapTrue = @(
    [ordered]@{ id = 'T-SNAP';      type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; exclude = @('gen.txt'); expected = @([ordered]@{ path = 'notes.md'; change = 'modified' }, [ordered]@{ path = 'extra.md'; change = 'added' }, [ordered]@{ path = 'old.md'; change = 'removed' }); why = 't' },
    [ordered]@{ id = 'T-SNAP-GLOB'; type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; exclude = @('gen.txt'); expected = @([ordered]@{ glob = '*.md'; change = 'modified' }, [ordered]@{ glob = 'extra.*'; change = 'added' }, [ordered]@{ glob = '**/*.md'; change = 'removed' }); maxDays = 30; why = 't' }
)
$snapFalse = @(
    [ordered]@{ id = 'F-SNAP-STRAY';   type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; exclude = @('gen.txt'); expected = @([ordered]@{ path = 'notes.md'; change = 'modified' }); why = 'f' },
    [ordered]@{ id = 'F-SNAP-MISSING'; type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; exclude = @('gen.txt'); expected = @([ordered]@{ path = 'notes.md'; change = 'modified' }, [ordered]@{ path = 'extra.md'; change = 'added' }, [ordered]@{ path = 'old.md'; change = 'removed' }, [ordered]@{ path = 'ghost.md'; change = 'added' }); why = 'f' },
    [ordered]@{ id = 'F-SNAP-NOEXCL';  type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; expected = @([ordered]@{ path = 'notes.md'; change = 'modified' }, [ordered]@{ path = 'extra.md'; change = 'added' }, [ordered]@{ path = 'old.md'; change = 'removed' }); why = 'f' }
)
$snapUnknown = @(
    [ordered]@{ id = 'U-SNAP-NOFILE';  type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-nowhere.json'; expected = @(); why = 'u' },
    [ordered]@{ id = 'U-SNAP-BROKEN';  type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-broken.json'; expected = @(); why = 'u' },
    [ordered]@{ id = 'U-SNAP-STALE';   type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-stale.json'; exclude = @('gen.txt'); expected = @([ordered]@{ path = 'notes.md'; change = 'modified' }, [ordered]@{ path = 'extra.md'; change = 'added' }, [ordered]@{ path = 'old.md'; change = 'removed' }); maxDays = 30; why = 'u' },
    [ordered]@{ id = 'U-SNAP-NOEXP';   type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; why = 'u' },
    [ordered]@{ id = 'U-SNAP-BADCH';   type = 'snapshot_diff'; root = '${KIT}/snap'; snapshot = '${KIT}/snap-before.json'; expected = @([ordered]@{ path = 'notes.md'; change = 'renamed' }); why = 'u' },
    [ordered]@{ id = 'U-SNAP-NOROOT';  type = 'snapshot_diff'; root = '${KIT}/no-such-snap'; snapshot = '${KIT}/snap-before.json'; expected = @(); why = 'u' }
)

function Assert-SnapshotRuns {
    param($a, $c, $d)
    # The report prints no line for a passing claim; the pass count line in selftest.ps1 (30 pass) carries
    # the two true claims, and this says neither fell to FAIL or could-not-look.
    Assert-HasNot 'A: no snapshot_diff claim failed or could not look (T-SNAP, T-SNAP-GLOB pass by the count)' $a.out 'SNAP'
    Assert-Has 'C: snapshot_diff names an unexpected add and removal' $c.out 'F-SNAP-STRAY  2 unexpected, 0 expected-but-absent'
    Assert-Has 'C: snapshot_diff names the kind and path of a stray' $c.out 'added: extra.md; removed: old.md'
    Assert-Has 'C: snapshot_diff names an expected change that did not happen' $c.out 'expected added of ghost.md, did not happen'
    Assert-Has 'C: snapshot_diff without the exclude sees the excluded file as a stray' $c.out 'F-SNAP-NOEXCL  1 unexpected'
    Assert-Has 'D: snapshot missing is unknown, with the writer named' $d.out '????  U-SNAP-NOFILE  snapshot missing'
    Assert-Has 'D: snapshot not JSON is unknown' $d.out '????  U-SNAP-BROKEN  snapshot is not JSON'
    Assert-Has 'D: a snapshot older than maxDays is unknown, never green' $d.out '????  U-SNAP-STALE  snapshot taken 2020-01-01 is'
    Assert-Has 'D: no expected list is unknown' $d.out "????  U-SNAP-NOEXP  claim has no 'expected' list"
    Assert-Has 'D: a change outside the set is unknown' $d.out '????  U-SNAP-BADCH  expected[1] has no change in'
    Assert-Has 'D: a missing root is unknown' $d.out '????  U-SNAP-NOROOT  root folder missing'
}
