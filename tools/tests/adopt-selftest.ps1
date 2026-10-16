# adopt-selftest.ps1 - proves adopt.ps1 and remove.ps1 against SPEC 5.6 on throwaway folders.
# Run under pwsh:  pwsh -NoProfile -File tools/tests/adopt-selftest.ps1 [-KeepTemp]
#
# Cases: fresh adopt (root not a repo) -> every file exists, pointer valid, installed.json carries
# sha256 + generated flags, LAW.md generated, Doctor ran and exited 0; the brain LAW.md grades
# every hook hooks.json registers, and the shipped BRAIN-LAW-01 passes, then goes RED on a hand
# edit; the law build keeps the kit grade for a hook the installed state does not name; second adopt (attach) ->
# nothing overwritten, diff printed for a file edited between runs; remove -> edited file kept and
# listed, unedited + generated deleted, pointer gone; -DryRun writes nothing; root-is-repo ->
# no snapshot pairs and settings.local.json when scope=personal.
#
# The pointer and the marker folder go through DF_POINTER_PATH / DF_MARKER_DIR, so the real
# pointer and the real markers are never touched. The Doctor is the real one, run by adopt.ps1.

param([switch] $KeepTemp)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$kit = [IO.Path]::GetFullPath((Join-Path $here '..\..')).TrimEnd('\')
. (Join-Path $kit 'tools\lib\df-files.ps1')
$adopt = Join-Path $kit 'tools\adopt.ps1'
$remove = Join-Path $kit 'tools\remove.ps1'

# Workaround: no folder name in this path may hold a measuring word as a word part (a part that starts
# with test, probe, verify or assert, or is spec or specs), or the live fence hook reads every fixture
# written here as a measuring file when an agent drives this script (Test-MeasuringPath in
# hooks\fence.ps1). 'df-adopt-st-' and a hex id hold none.
$T = Join-Path $env:TEMP ('df-adopt-st-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $T | Out-Null
$T = (Resolve-Path $T).Path.TrimEnd('\')

$results = [Collections.Generic.List[object]]::new()
function Check([string] $name, [bool] $ok, [string] $detail = '') {
    $results.Add([pscustomobject]@{ pass = $ok; name = $name })
    $tag = if ($ok) { 'PASS' } else { 'FAIL' }
    Write-Host ('  {0}  {1}' -f $tag, $name) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
    if (-not $ok -and $detail) { Write-Host ('        ' + ($detail -replace "`r?`n", ' | ').Substring(0, [Math]::Min(400, $detail.Length))) -ForegroundColor DarkGray }
}
function Run([string] $script, [string[]] $scriptArgs, [string] $pointer, [string] $markers) {
    $env:DF_POINTER_PATH = $pointer; $env:DF_MARKER_DIR = $markers
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $out = @(& pwsh -NoProfile -File $script @scriptArgs 2>&1 | ForEach-Object { [string]$_ }) -join "`n"; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $prev }
    return @{ out = $out; code = $code }
}
function Put([string] $path, [string] $text) {
    $d = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))
}
function Hashes([string] $dir) {
    $h = @{}
    foreach ($f in Get-ChildItem -LiteralPath $dir -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.FullName -notmatch '\\state\\' }) { $h[$f.FullName] = Get-DfFileSha256 $f.FullName }
    return $h
}

Write-Host ''; Write-Host "adopt/remove self-test  (temp: $T)"; Write-Host ''

try {
    # ---------------------------------------------------------------- fixtures
    $root = Join-Path $T 'root'; $brain = Join-Path $T 'brain'
    New-Item -ItemType Directory -Force -Path $root, (Join-Path $root 'frozen'), (Join-Path $T 'markers') | Out-Null
    Put (Join-Path $root 'frozen\ref.txt') "kept on purpose`n"
    Put (Join-Path $T 'markers\s1.advised') 'x'
    $ptr1 = Join-Path $T 'pointer1.json'; $markers = Join-Path $T 'markers'
    $common = @('-Root', $root, '-Brain', $brain, '-OwnerName', 'Test Owner', '-GitHubOwners', 'alpha-owner', '-FrozenPaths', (Join-Path $root 'frozen'), '-BrainIsRepo', '-PluginRoot', $kit)

    # ---------------------------------------------------------------- 1. fresh adopt
    Write-Host '-- fresh adopt (root is not a repo)'
    $r = Run $adopt $common $ptr1 $markers
    Check 'fresh: adopt exits 0' ($r.code -eq 0) $r.out
    Check 'fresh: reports fresh mode' ($r.out -like '*[fresh mode]*') $r.out
    Check 'fresh: the brain carries its own DECISIONS.md and ARCHITECTURE.md (DES-01)' ((Test-Path -LiteralPath (Join-Path $brain 'DECISIONS.md')) -and (Test-Path -LiteralPath (Join-Path $brain 'ARCHITECTURE.md')))
    Check 'fresh: the brain manifest is filled, not a template' (((Get-Content -LiteralPath (Join-Path $brain 'DECISIONS.md') -Raw) -notmatch '\{\{') -and ((Get-Content -LiteralPath (Join-Path $brain 'DECISIONS.md') -Raw) -like '*Test Owner*'))
    $expected = @('CLAUDE.md', '.claude\settings.json') | ForEach-Object { Join-Path $root $_ }
    $expected += @('me.md', 'voice.md', 'prohibitions.md', 'law.overlay.json', 'claims.json', 'doctor.config.json', 'entry.json', 'lessons.md', 'canonical.md', 'Doctor.bat', 'LAW.md',
                   'instructions\README.md', 'entry-point\CLAUDE.md.snapshot', 'entry-point\settings.json.snapshot', 'state\installed.json', '.gitattributes', '.gitignore') | ForEach-Object { Join-Path $brain $_ }
    $missing = @($expected | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
    Check "fresh: all $($expected.Count) files exist" ($missing.Count -eq 0) ("missing: " + ($missing -join ', '))
    Check 'fresh: brain is a git repo on main' ((Test-Path -LiteralPath (Join-Path $brain '.git')) -and ((Invoke-DfGit $brain @('branch', '--show-current')).out -join '') -eq 'main')
    Check 'fresh: no commit was made (the owner commits)' ((Invoke-DfGit $brain @('rev-parse', 'HEAD')).code -ne 0)

    $claude = Read-DfText (Join-Path $root 'CLAUDE.md')
    Check 'fresh: root CLAUDE.md carries SAFE-01/04/06/09 in full, brain path, no unfilled token' (($claude -match 'SAFE-01' -and $claude -match 'SAFE-04' -and $claude -match 'SAFE-06' -and $claude -match 'SAFE-09' -and $claude.Contains('rotated first') -and $claude.Contains($brain) -and $claude -notmatch '\{\{')) $claude
    Check 'fresh: root CLAUDE.md under 60 lines' (@($claude -split "`n").Count -le 60)
    $me = Read-DfText (Join-Path $brain 'me.md')
    Check 'fresh: me.md front-matter owner.name' ($me.StartsWith("---`nowner:`n  name: Test Owner`n---`n"))
    $bytes = [IO.File]::ReadAllBytes((Join-Path $brain 'me.md'))
    Check 'fresh: me.md is UTF-8 without BOM, LF only' (($bytes[0] -ne 0xEF) -and ($bytes -notcontains 13))
    $bat = [IO.File]::ReadAllBytes((Join-Path $brain 'Doctor.bat'))
    Check 'fresh: Doctor.bat is CRLF' (($bat -contains 13) -and ([IO.File]::ReadAllText((Join-Path $brain 'Doctor.bat')) -notmatch '(?<!\r)\n'))

    $p = Read-DfJson $ptr1
    Check 'fresh: pointer valid (schema 1, root, brain, pluginRoot = kit, pluginKind = checkout)' ($p.schema -eq 1 -and $p.root -eq $root -and $p.brain -eq $brain -and $p.pluginRoot -eq $kit -and $p.pluginKind -eq 'checkout') ($p | ConvertTo-Json -Compress)

    $inst = Read-DfInstalled (Join-Path $brain 'state\installed.json')
    $bad = @($inst | Where-Object { $_.sha256 -notmatch '^[0-9a-f]{64}$' })
    $lawRec = $inst | Where-Object { $_.path -eq (Join-Path $brain 'LAW.md') }
    $meRec = $inst | Where-Object { $_.path -eq (Join-Path $brain 'me.md') }
    Check "fresh: installed.json has $($inst.Count) records, every sha256 64 hex" ($inst.Count -ge 18 -and $bad.Count -eq 0)
    Check 'fresh: LAW.md generated:true, me.md generated:false' ($lawRec -and $lawRec.generated -eq $true -and $meRec -and $meRec.generated -eq $false)
    Check 'fresh: recorded sha equals the file on disk (me.md)' ($meRec.sha256 -eq (Get-DfFileSha256 (Join-Path $brain 'me.md')))
    $law = Read-DfText (Join-Path $brain 'LAW.md')
    Check 'fresh: LAW.md generated (header, SAFE-01, Summary)' ($law.StartsWith('# LAW') -and $law -match 'SAFE-01' -and $law -match '## Summary')

    $cfg = Read-DfJson (Join-Path $brain 'doctor.config.json')
    Check 'fresh: config ownerRemotePatterns from -GitHubOwners' (@($cfg.ownerRemotePatterns).Count -eq 1 -and $cfg.ownerRemotePatterns[0] -eq 'github.com/alpha-owner/')
    Check 'fresh: config frozenPaths ${ROOT}-relative' (@($cfg.frozenPaths).Count -eq 1 -and $cfg.frozenPaths[0] -eq '${ROOT}\frozen') ($cfg.frozenPaths -join ',')
    Check 'fresh: config has 2 entryPointSnapshots pairs (root not a repo)' (@($cfg.entryPointSnapshots).Count -eq 2)
    $snapOk = [Linq.Enumerable]::SequenceEqual([IO.File]::ReadAllBytes((Join-Path $root 'CLAUDE.md')), [IO.File]::ReadAllBytes((Join-Path $brain 'entry-point\CLAUDE.md.snapshot')))
    Check 'fresh: snapshot is a byte copy of root CLAUDE.md' $snapOk
    Check 'fresh: Doctor ran and exited 0' ($r.out -match '(?m)^\s*Doctor exit\s+0\b') $r.out
    Check 'fresh: soft_deny line printed for the frozen path, never written' (($r.out -like '*Writes, edits, or deletions under*frozen*') -and ($r.out -like '*never writes that file*'))

    # ---------------------------------------------------------------- 1b. the brain LAW.md tells the truth (CR-2026-10-15-GAPS D6)
    # Before D6 adopt typed three hook names, so every clause on the stop, route, ask, agent and
    # subagent hooks printed HONOUR "(mechanism not installed)"; and no shipped claim compared the
    # brain LAW.md with a fresh build, so a plugin update left sessions reading old law rows.
    Write-Host '-- the brain LAW.md: every registered hook graded, BRAIN-LAW-01 shipped'
    $registered = @([regex]::Matches((Read-DfText (Join-Path $kit 'hooks\hooks.json')), 'hooks[\\/]+([A-Za-z0-9_-]+)\.ps1') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $lawStatePath = Join-Path $brain 'state\law-installed.json'
    $ls = if (Test-Path -LiteralPath $lawStatePath -PathType Leaf) { Read-DfJson $lawStatePath } else { $null }
    $recorded = if ($ls -and $ls.hooks) { @($ls.hooks.PSObject.Properties | Where-Object { $_.Value -eq $true } | ForEach-Object { $_.Name }) } else { @() }
    $unrecorded = @($registered | Where-Object { $recorded -notcontains $_ })
    Check "fresh: state\law-installed.json records every hook hooks.json registers as installed ($($registered.Count))" ($registered.Count -ge 1 -and $unrecorded.Count -eq 0) ("not recorded as installed: " + ($unrecorded -join ', '))
    $kitLaw = Read-DfJson (Join-Path $kit 'law.json')
    $lawLines = @($law -split "`n")
    $hookClauses = @($kitLaw.clauses | Where-Object { $_.enforcedBy -and $_.enforcedBy.kind -eq 'hook' })
    $falseRows = @($hookClauses | Where-Object { $id = $_.id; @($lawLines | Where-Object { $_.StartsWith("| $id |") -and $_.Contains('(mechanism not installed)') }).Count -gt 0 } | ForEach-Object { $_.id })
    Check "fresh: LAW.md prints no '(mechanism not installed)' row for a clause on a registered hook ($($hookClauses.Count) clauses)" ($hookClauses.Count -ge 1 -and $falseRows.Count -eq 0) ("rows: " + ($falseRows -join ', '))
    $bl = @((Read-DfJson (Join-Path $brain 'claims.json')).claims | Where-Object { $_.id -eq 'BRAIN-LAW-01' })
    Check 'fresh: the brain claims.json ships BRAIN-LAW-01 over LAW.md, built with the recorded installed state' ($bl.Count -eq 1 -and $bl[0].type -eq 'generated_matches' -and $bl[0].output -eq '${BRAIN}/LAW.md' -and $bl[0].installed -eq '${BRAIN}/state/law-installed.json' -and $bl[0].overlay -eq '${BRAIN}/law.overlay.json')
    $doctorPs1 = Join-Path $kit 'tools\doctor\doctor.ps1'
    $dj = Run $doctorPs1 @('-Json') $ptr1 $markers
    $blStatus = try { [string](@(($dj.out | ConvertFrom-Json).bands.claims | Where-Object { $_.id -eq 'BRAIN-LAW-01' })[0].status) } catch { "unparsed: $($dj.out)" }
    Check 'fresh: BRAIN-LAW-01 holds on the first Doctor run (adopt and the claim build the same LAW.md)' ($blStatus -eq 'PASS') $blStatus
    $lawPath = Join-Path $brain 'LAW.md'
    $lawBytes = [IO.File]::ReadAllBytes($lawPath)
    Add-Content -LiteralPath $lawPath -Value "`n| HAND-01 | HOOK | a row typed by hand | ``me.md`` |`n" -Encoding utf8
    $dj2 = Run $doctorPs1 @('-Json') $ptr1 $markers
    $blStatus2 = try { [string](@(($dj2.out | ConvertFrom-Json).bands.claims | Where-Object { $_.id -eq 'BRAIN-LAW-01' })[0].status) } catch { "unparsed: $($dj2.out)" }
    Check 'fresh: a hand-edited brain LAW.md turns BRAIN-LAW-01 RED (exit 1)' ($blStatus2 -eq 'FAIL' -and $dj2.code -eq 1) ("status $blStatus2, exit $($dj2.code)")
    [IO.File]::WriteAllBytes($lawPath, $lawBytes)   # put it back: the attach case below compares every brain file

    # The law build reads a hook the installed state does not name as no record (the kit grade
    # stands); only a recorded false prints HONOUR. A hook a later plugin version registers is
    # absent from an older state, and before D6 an absent name printed "(mechanism not installed)".
    $partState = Join-Path $T 'law-installed-partial.json'
    Put $partState "{ `"hooks`": { `"guard`": false }, `"rootSettings`": true, `"pointer`": true }`n"
    $partLaw = Join-Path $T 'LAW-partial.md'
    $rb = Run (Join-Path $kit 'tools\law\build-law.ps1') @('-Source', (Join-Path $kit 'law.json'), '-Overlay', (Join-Path $kit 'templates\law.overlay.json'), '-Installed', $partState, '-Out', $partLaw) $ptr1 $markers
    $guardC = @($hookClauses | Where-Object { $_.enforcedBy.ref -like 'hooks/guard.ps1*' })[0]
    $otherC = @($hookClauses | Where-Object { $_.enforcedBy.ref -notlike 'hooks/guard.ps1*' })[0]
    $partLines = if (Test-Path -LiteralPath $partLaw -PathType Leaf) { @((Read-DfText $partLaw) -split "`n") } else { @() }
    $guardRow = @($partLines | Where-Object { $_.StartsWith("| $($guardC.id) |") })[0]
    $otherRow = @($partLines | Where-Object { $_.StartsWith("| $($otherC.id) |") })[0]
    Check 'law build: a hook recorded as not installed prints HONOUR (mechanism not installed)' ($rb.code -eq 0 -and [string]$guardRow -like "| $($guardC.id) | HONOUR (mechanism not installed) |*") ("exit $($rb.code): $guardRow $($rb.out)")
    Check 'law build: a hook the installed state does not name keeps its kit grade' ($rb.code -eq 0 -and [string]$otherRow -like "| $($otherC.id) | $($otherC.grade) |*") ("exit $($rb.code): $otherRow")

    # ---------------------------------------------------------------- 2. attach (second run, one file edited)
    Write-Host '-- attach (second adopt, me.md edited between runs)'
    $before = Hashes $brain
    $rootBefore = Get-DfFileSha256 (Join-Path $root 'CLAUDE.md')
    Add-Content -LiteralPath (Join-Path $brain 'me.md') -Value "`n## Edited by the owner`n" -Encoding utf8
    $editedSha = Get-DfFileSha256 (Join-Path $brain 'me.md')
    $r2 = Run $adopt $common $ptr1 $markers
    Check 'attach: adopt exits 0' ($r2.code -eq 0) $r2.out
    Check 'attach: reports attach mode' ($r2.out -like '*[attach mode]*')
    Check 'attach: me.md kept and a unified diff printed' (($r2.out -match '(?m)^\s*kept\s+.*me\.md') -and ($r2.out -like '*--- diff*me.md*') -and ($r2.out -like '*+## Edited by the owner*')) $r2.out
    Check 'attach: edited me.md not overwritten' ((Get-DfFileSha256 (Join-Path $brain 'me.md')) -eq $editedSha)
    $after = Hashes $brain
    $changed = @($before.Keys | Where-Object { $_ -notlike '*\me.md' -and $after[$_] -ne $before[$_] })
    Check 'attach: every other brain file byte-identical (after CRLF->LF)' ($changed.Count -eq 0) ($changed -join ', ')
    Check 'attach: root CLAUDE.md untouched' ((Get-DfFileSha256 (Join-Path $root 'CLAUDE.md')) -eq $rootBefore)
    $inst2 = Read-DfInstalled (Join-Path $brain 'state\installed.json')
    $meRec2 = $inst2 | Where-Object { $_.path -eq (Join-Path $brain 'me.md') }
    Check 'attach: installed.json merged by path; kept me.md record keeps the ORIGINAL sha' ($inst2.Count -eq $inst.Count -and $meRec2.sha256 -eq $meRec.sha256)

    # ---------------------------------------------------------------- 3. dry run writes nothing
    Write-Host '-- dry run'
    $root2 = Join-Path $T 'root2'; $brain2 = Join-Path $T 'brain2'; $ptr2 = Join-Path $T 'pointer2.json'
    New-Item -ItemType Directory -Force -Path $root2 | Out-Null
    $r3 = Run $adopt @('-Root', $root2, '-Brain', $brain2, '-OwnerName', 'Dry Owner', '-BrainIsRepo', '-PluginRoot', $kit, '-DryRun') $ptr2 $markers
    Check 'dry: exits 0 and says DRY RUN' ($r3.code -eq 0 -and $r3.out -like '*DRY RUN*') $r3.out
    Check 'dry: lists would-write lines incl. LAW.md and the pointer' (($r3.out -match '(?m)^\s*would write\s+.*CLAUDE\.md') -and ($r3.out -match '(?m)^\s*would write\s+.*LAW\.md') -and ($r3.out -match '(?m)^\s*would write\s+.*pointer2\.json'))
    Check 'dry: nothing written (no brain, no root CLAUDE.md, no pointer)' (-not (Test-Path -LiteralPath $brain2) -and -not (Test-Path -LiteralPath (Join-Path $root2 'CLAUDE.md')) -and -not (Test-Path -LiteralPath (Join-Path $root2 '.claude')) -and -not (Test-Path -LiteralPath $ptr2))
    Check 'dry: Doctor not run' ($r3.out -like '*Doctor           not run*')

    # ---------------------------------------------------------------- 4. root is a repo, personal scope
    Write-Host '-- root is a git work tree, scope = personal'
    $root3 = Join-Path $T 'root3'; $brain3 = Join-Path $T 'brain3'; $ptr3 = Join-Path $T 'pointer3.json'
    New-Item -ItemType Directory -Force -Path $root3 | Out-Null
    Invoke-DfGit $root3 @('init', '-q', '-b', 'main') | Out-Null
    $r4 = Run $adopt @('-Root', $root3, '-Brain', $brain3, '-OwnerName', 'Repo Owner', '-SettingsScope', 'personal', '-PluginRoot', $kit) $ptr3 $markers
    Check 'repo: adopt exits 0' ($r4.code -eq 0) $r4.out
    Check 'repo: settings.local.json written, settings.json not' ((Test-Path -LiteralPath (Join-Path $root3 '.claude\settings.local.json')) -and -not (Test-Path -LiteralPath (Join-Path $root3 '.claude\settings.json')))
    $cfg3 = Read-DfJson (Join-Path $brain3 'doctor.config.json')
    Check 'repo: no snapshot pairs and no entry-point folder' (@($cfg3.entryPointSnapshots).Count -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $brain3 'entry-point')))
    Check 'repo: no -BrainIsRepo -> brain3 not a repo, no .gitattributes' (-not (Test-Path -LiteralPath (Join-Path $brain3 '.git')) -and -not (Test-Path -LiteralPath (Join-Path $brain3 '.gitattributes')))
    Check 'repo: Doctor ran and exited 0' ($r4.out -match '(?m)^\s*Doctor exit\s+0\b') $r4.out

    # ---------------------------------------------------------------- 5. the default layout: brain UNDER root, as a repo
    # The adopt command's recommended answer puts the brain at <root>\brain. The manifest scan then
    # selects it as a repository under root; before 0.1.28 it had no DECISIONS.md and the first
    # Doctor run was RED (fix list, chunk 10, row 1). Cases 1 to 4 kept the brain beside root.
    Write-Host '-- default layout: brain under root, brain is a repo'
    $root5 = Join-Path $T 'root5'; $brain5 = Join-Path $root5 'brain'; $ptr5 = Join-Path $T 'pointer5.json'
    New-Item -ItemType Directory -Force -Path $root5 | Out-Null
    $r5 = Run $adopt @('-Root', $root5, '-Brain', $brain5, '-OwnerName', 'Default Owner', '-BrainIsRepo', '-PluginRoot', $kit) $ptr5 $markers
    Check 'default: adopt exits 0' ($r5.code -eq 0) $r5.out
    Check 'default: no SCAN-MANIFEST fail on the first run' ($r5.out -notlike '*FAIL  SCAN-MANIFEST*') $r5.out
    Check 'default: Doctor ran and exited 0 with the brain under root' ($r5.out -match '(?m)^\s*Doctor exit\s+0\b') $r5.out

    # ---------------------------------------------------------------- 5. remove: dry run, then real
    Write-Host '-- remove'
    $r5 = Run $remove @('-DryRun') $ptr3 $markers
    Check 'remove dry: exits 0, deletes nothing' ($r5.code -eq 0 -and (Test-Path -LiteralPath (Join-Path $brain3 'me.md')) -and (Test-Path -LiteralPath $ptr3) -and (Test-Path -LiteralPath (Join-Path $brain3 'state'))) $r5.out

    # Make LAW.md differ from its record: generated files go regardless of hash.
    Add-Content -LiteralPath (Join-Path $brain 'LAW.md') -Value "`nhand edit`n" -Encoding utf8
    $r6 = Run $remove @() $ptr1 $markers
    Check 'remove: exits 0' ($r6.code -eq 0) $r6.out
    Check 'remove: edited me.md KEPT and listed' ((Test-Path -LiteralPath (Join-Path $brain 'me.md')) -and ($r6.out -match '(?m)^\s*KEPT\s+.*me\.md') -and ($r6.out -like '*kept      1 file(s)*')) $r6.out
    $goneFiles = @('voice.md', 'claims.json', 'doctor.config.json', 'Doctor.bat', 'entry-point\CLAUDE.md.snapshot', 'instructions\README.md', '.gitattributes') | ForEach-Object { Join-Path $brain $_ }
    $goneFiles += (Join-Path $root 'CLAUDE.md'), (Join-Path $root '.claude\settings.json')
    $still = @($goneFiles | Where-Object { Test-Path -LiteralPath $_ })
    Check 'remove: unedited recorded files deleted (brain + root)' ($still.Count -eq 0) ($still -join ', ')
    Check 'remove: hand-edited LAW.md deleted anyway (generated:true)' (-not (Test-Path -LiteralPath (Join-Path $brain 'LAW.md')))
    Check 'remove: pointer, state\, markers gone' (-not (Test-Path -LiteralPath $ptr1) -and -not (Test-Path -LiteralPath (Join-Path $brain 'state')) -and -not (Test-Path -LiteralPath $markers))
    Check 'remove: empty entry-point\ and instructions\ removed, brain folder and .git left' (-not (Test-Path -LiteralPath (Join-Path $brain 'entry-point')) -and -not (Test-Path -LiteralPath (Join-Path $brain 'instructions')) -and (Test-Path -LiteralPath (Join-Path $brain '.git')))
    Check 'remove: prints the uninstall line' ($r6.out -like '*claude plugin uninstall design-first*')
    Check 'remove: frozen folder (never recorded) untouched' (Test-Path -LiteralPath (Join-Path $root 'frozen\ref.txt'))
}
catch {
    Check "selftest crashed: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)" $false
}
finally {
    foreach ($v in 'DF_POINTER_PATH', 'DF_MARKER_DIR') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
}

$passed = @($results | Where-Object pass).Count; $failed = @($results | Where-Object { -not $_.pass }).Count
Write-Host ''
Write-Host ("  {0} passed, {1} failed, {2} total" -f $passed, $failed, $results.Count) -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host ''
if ($failed -eq 0 -and -not $KeepTemp) { Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue } else { Write-Host "  fixtures kept at $T" }
if ($failed -gt 0) { exit 1 }
exit 0
