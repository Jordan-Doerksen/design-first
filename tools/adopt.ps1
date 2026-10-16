# adopt.ps1 - writes a design-first root + brain from templates and the answers the adopter gave.
# Called by commands/adopt.md (the command ASKS, this script WRITES: SPEC C2, DECISIONS 3.11).
#
#   pwsh -NoProfile -File tools/adopt.ps1 -Root <dir> [-Brain <dir>] -OwnerName <name>
#        [-GitHubOwners a,b] [-BrainIsRepo] [-FrozenPaths p,q] [-SettingsScope shared|personal]
#        [-PluginRoot <dir>] [-DryRun]
#
# Modes (SPEC 5.6, finding 37):
#   fresh   the brain folder has none of the kit files        -> every file is written
#   attach  the brain folder already has at least one of them -> ONLY missing files are written;
#           for each existing file a unified diff is printed and nothing is changed
# It never overwrites. It never reads any brain but the one it is writing. It never writes the
# user-level settings.json: the soft_deny lines for frozen paths are PRINTED to paste (finding 56).
#
# Everything written is recorded in <brain>\state\installed.json as { path, sha256, generated }
# (sha over CRLF->LF bytes; merged by path with any earlier record) so remove.ps1 can reverse
# exactly this and nothing else. Then: pointer, brain LAW.md via the generator, the Doctor, summary.
# The generator reads <brain>\state\law-installed.json: every hook hooks.json registers, root
# settings, pointer. It stays there, so the shipped claim BRAIN-LAW-01 repeats the same build.
# -DryRun prints every step and writes nothing under root, brain or the profile.
#
# Exit 0 = adopt finished (the Doctor's own exit code is printed in the summary, never adopted:
# a SURVEY finding is not an adopt failure). Exit 1 = adopt itself could not finish.
# Test seams: DF_POINTER_PATH (pointer location), DF_MARKER_DIR; nothing else.

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Root,
    [string] $Brain,
    [Parameter(Mandatory)] [string] $OwnerName,
    [string[]] $GitHubOwners = @(),
    [switch] $BrainIsRepo,
    [string[]] $FrozenPaths = @(),
    [ValidateSet('shared', 'personal')] [string] $SettingsScope = 'shared',
    [string] $PluginRoot,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
. (Join-Path $PSScriptRoot 'lib\df-files.ps1')
. (Join-Path $PSScriptRoot 'lib\adopt-plan.ps1')

$verb = if ($DryRun) { 'would write' } else { 'wrote' }
function Say([string] $s) { Write-Output $s }

try {
    # ---------------------------------------------------------------- answers -> facts
    $kit = if ($PluginRoot) { Get-DfFullPath $PluginRoot } else { Get-DfFullPath (Split-Path -Parent $PSScriptRoot) }
    foreach ($need in 'templates\root-CLAUDE.md', 'templates\root-settings.json', 'law.json', 'tools\law\build-law.ps1', 'tools\doctor\doctor.ps1', 'hooks\hooks.json') {
        if (-not (Test-Path -LiteralPath (Join-Path $kit $need) -PathType Leaf)) { throw "not a design-first kit (missing $need): $kit" }
    }
    $Root = Get-DfFullPath $Root
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "root folder does not exist: $Root" }
    $Brain = if ($Brain) { Get-DfFullPath $Brain } else { Join-Path $Root 'brain' }
    $OwnerName = $OwnerName.Trim()
    if (-not $OwnerName) { throw 'owner name is empty' }
    # -File passes "a,b" as one string; split so both forms work.
    $GitHubOwners = @($GitHubOwners | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $frozenCfg = @($FrozenPaths | ForEach-Object { $_ -split ',' } | ForEach-Object { ConvertTo-DfConfigPath $_ $Root } | Where-Object { $_ })

    $rootIsRepo = Test-DfGitWorkTree $Root
    $pluginKind = Get-DfPluginKind $kit
    $settingsTarget = Join-Path $Root $(if ($SettingsScope -eq 'personal') { '.claude\settings.local.json' } else { '.claude\settings.json' })
    $pointerPath = Get-DfPointerFile

    # Snapshot pairs only when root is NOT a repo: git is the snapshot otherwise (SPEC 7, finding 67).
    $snapshotPairs = @()
    if (-not $rootIsRepo) {
        $snapshotPairs = @(
            [ordered]@{ live = '${ROOT}/CLAUDE.md'; snapshot = 'entry-point/CLAUDE.md.snapshot' },
            [ordered]@{ live = ('${ROOT}/.claude/' + (Split-Path -Leaf $settingsTarget)); snapshot = ('entry-point/' + (Split-Path -Leaf $settingsTarget) + '.snapshot') }
        )
    }

    $kitFiles = 'me.md', 'voice.md', 'prohibitions.md', 'law.overlay.json', 'claims.json', 'doctor.config.json', 'entry.json', 'lessons.md', 'canonical.md', 'Doctor.bat', 'LAW.md'
    $mode = 'fresh'
    if (Test-Path -LiteralPath $Brain -PathType Container) {
        foreach ($f in $kitFiles) { if (Test-Path -LiteralPath (Join-Path $Brain $f)) { $mode = 'attach'; break } }
    }

    Say ''
    Say "design-first adopt  [$mode mode$(if ($DryRun) { ', DRY RUN: nothing is written' })]"
    Say "  root        $Root  (git work tree: $(if ($rootIsRepo) { 'yes' } else { 'no' }))"
    Say "  brain       $Brain$(if ($BrainIsRepo) { '  (git repo)' })"
    Say "  owner       $OwnerName"
    Say "  github      $(if ($GitHubOwners.Count) { $GitHubOwners -join ', ' } else { '(none: every remote will survey as FOREIGN until ownerRemotePatterns is filled)' })"
    Say "  frozen      $(if ($frozenCfg.Count) { $frozenCfg -join ', ' } else { '(none)' })"
    Say "  settings    $settingsTarget  ($SettingsScope)"
    Say "  kit         $kit  ($pluginKind)"
    Say "  pointer     $pointerPath"
    Say ''

    # ---------------------------------------------------------------- plan -> write missing, diff existing
    $plan = New-DfPlan -Kit $kit -Root $Root -Brain $Brain -OwnerName $OwnerName -GitHubOwners $GitHubOwners `
        -FrozenPaths $frozenCfg -SettingsTarget $settingsTarget -SnapshotPairs $snapshotPairs -BrainIsRepo ([bool]$BrainIsRepo)
    $written = [Collections.Generic.List[object]]::new()
    $kept = [Collections.Generic.List[string]]::new()
    $settingsWritten = $false

    $script:placeResult = ''
    function Place([string] $path, [byte[]] $bytes, [bool] $generated, [string] $note) {
        # One rule for every file: absent -> write and record; present and identical -> record;
        # present and different -> diff, keep, do not record. The outcome goes to $script:placeResult,
        # not the pipeline, so the printed lines reach the caller's stdout instead of a variable.
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            if ((Get-DfFileSha256 $path) -eq (Get-DfNormalisedSha256 $bytes)) {
                Say "  same     $path"
                $script:written.Add((New-DfInstalledRecord $path $bytes $generated)); $script:placeResult = 'same'; return
            }
            Say "  kept     $path  (exists and differs; not touched)"
            foreach ($l in (Show-DfDiff $path $bytes $path)) { Say $l }
            $script:kept.Add($path); $script:placeResult = 'kept'; return
        }
        Say "  $verb    $path  - $note"
        if (-not $DryRun) { Write-DfBytes $path $bytes }
        $script:written.Add((New-DfInstalledRecord $path $bytes $generated)); $script:placeResult = 'written'
    }

    Say 'files'
    foreach ($item in $plan) {
        Place $item.path $item.bytes $item.generated $item.note
        if ($item.path -eq $settingsTarget -and $script:placeResult -ne 'kept') { $settingsWritten = $true }
    }

    # Byte snapshots of the live root files (root not a repo). Taken AFTER the writes so the snapshot
    # equals whatever is live now, including a pre-existing CLAUDE.md that was kept.
    foreach ($pair in $snapshotPairs) {
        $live = [string]$pair.live -replace '\$\{ROOT\}', $Root -replace '/', '\'
        $snap = Join-Path $Brain (([string]$pair.snapshot) -replace '/', '\')
        if (-not (Test-Path -LiteralPath $live -PathType Leaf)) { Say "  skip     $snap  (live file absent: $live)"; continue }
        Place $snap ([IO.File]::ReadAllBytes($live)) $false "byte snapshot of $live"
    }

    # ---------------------------------------------------------------- brain as a git repo
    if ($BrainIsRepo) {
        if (Test-Path -LiteralPath (Join-Path $Brain '.git')) { Say "  git      $Brain is already a repository" }
        elseif (-not (Get-Command git -ErrorAction SilentlyContinue)) { Say '  git      NOT on PATH; the brain was not initialised. Run: git init -b main' }
        elseif ($DryRun) { Say "  git      would run: git -C `"$Brain`" init -b main  (nothing committed; the owner commits)" }
        else {
            $g = Invoke-DfGit $Brain @('init', '-q', '-b', 'main')
            if ($g.code -ne 0) { Say "  git      init failed (exit $($g.code)); initialise the brain by hand: git init -b main" }
            else { Say "  git      initialised $Brain on branch main (nothing committed; the owner commits)" }
        }
    }

    # ---------------------------------------------------------------- state, pointer
    $stateDir = Join-Path $Brain 'state'
    if (-not $DryRun -and -not (Test-Path -LiteralPath $stateDir)) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }
    $pointer = [ordered]@{ schema = 1; root = $Root; brain = $Brain; pluginRoot = $kit; pluginKind = $pluginKind }
    Say "  $verb    $pointerPath  - pointer (schema 1, $pluginKind)"
    if (-not $DryRun) { Write-DfBytes $pointerPath (Get-DfTextBytes (($pointer | ConvertTo-Json) + "`n") $pointerPath) }

    # ---------------------------------------------------------------- brain LAW.md (generated)
    Say ''
    Say 'law'
    # Every hook hooks.json registers, read from the file (adopt-plan.ps1), never a typed list.
    $installedState = [ordered]@{
        hooks = (Get-DfRegisteredHooks $kit)
        rootSettings = $settingsWritten
        pointer = $true
    }
    if (-not $installedState.rootSettings) {
        foreach ($sp in @((Join-Path $Root '.claude\settings.json'), (Join-Path $Root '.claude\settings.local.json'))) {
            if (-not (Test-Path -LiteralPath $sp -PathType Leaf)) { continue }
            try { $s = Read-DfJson $sp; if ($s.permissions -and @($s.permissions.deny).Count -gt 0) { $installedState.rootSettings = $true } } catch { }
        }
    }
    $tmpDir = Join-Path ([IO.Path]::GetTempPath()) 'design-first-adopt'
    if (-not (Test-Path -LiteralPath $tmpDir)) { New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null }
    # The installed state is kept in the brain, not a temp file, because the shipped claim
    # BRAIN-LAW-01 (templates/claims.json) builds LAW.md again from the same inputs on every Doctor
    # run. Built from a temp file that was then deleted, the claim could not repeat this build.
    # A dry run writes nothing in the brain, so it builds from a temp copy.
    $lawState = Join-Path $stateDir 'law-installed.json'
    $tmpState = if ($DryRun) { Join-Path $tmpDir 'installed-state.json' } else { $lawState }
    $tmpLaw = Join-Path $tmpDir 'LAW.md'
    $hookCount = @($installedState.hooks.Keys).Count
    Say "  $verb    $lawState  - installed mechanisms the LAW.md grades read: $hookCount registered hook(s), root settings, pointer"
    Write-DfBytes $tmpState (Get-DfTextBytes (($installedState | ConvertTo-Json -Depth 4) + "`n") $tmpState)
    $overlay = Join-Path $Brain 'law.overlay.json'
    $lawArgs = @('-Source', (Join-Path $kit 'law.json'), '-Installed', $tmpState, '-Out', $tmpLaw)
    if (Test-Path -LiteralPath $overlay -PathType Leaf) { $lawArgs += @('-Overlay', $overlay, '-BrainRoot', $Brain) }
    else { $lawArgs += @('-Overlay', (Join-Path $kit 'templates\law.overlay.json')) }   # dry run: the brain overlay does not exist yet
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $lawOut = @(& pwsh -NoProfile -File (Join-Path $kit 'tools\law\build-law.ps1') @lawArgs 2>&1 | ForEach-Object { [string]$_ }); $lawCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $prev }
    $lawStatus = 'not generated'
    if ($lawCode -ne 0) {
        Say "  ERROR    build-law exited $lawCode; LAW.md not written:"
        foreach ($l in $lawOut) { Say "           $l" }
    } else {
        Place (Join-Path $Brain 'LAW.md') ([IO.File]::ReadAllBytes($tmpLaw)) $true 'generated from kit law.json + overlay + installed state'
        $lawStatus = switch ($script:placeResult) { 'written' { "$verb" } 'same' { 'already current' } 'kept' { 'exists and differs: kept; regenerate it after migrating it to the overlay (build-law.ps1)' } }
    }
    Remove-Item -LiteralPath $tmpLaw -Force -ErrorAction SilentlyContinue
    if ($DryRun) { Remove-Item -LiteralPath $tmpState -Force -ErrorAction SilentlyContinue }

    # ---------------------------------------------------------------- installed.json
    $installedPath = Join-Path $stateDir 'installed.json'
    if (-not $DryRun) {
        Write-DfInstalled $installedPath (Merge-DfInstalled (Read-DfInstalled $installedPath) @($written))
        Say "  wrote    $installedPath  ($($written.Count) record(s) merged by path)"
    } else { Say "  would write $installedPath  ($($written.Count) record(s))" }

    # ---------------------------------------------------------------- the Doctor (directly, never the .bat)
    Say ''
    Say 'doctor'
    $doctorCode = $null
    if ($DryRun) { Say "  would run: pwsh -NoProfile -File `"$kit\tools\doctor\doctor.ps1`"" }
    else {
        $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { & pwsh -NoProfile -File (Join-Path $kit 'tools\doctor\doctor.ps1') 2>&1 | ForEach-Object { Say ('  ' + [string]$_) }; $doctorCode = $LASTEXITCODE }
        finally { $ErrorActionPreference = $prev }
    }

    # ---------------------------------------------------------------- summary
    Say ''
    Say 'summary'
    Say "  mode             $mode"
    Say "  $(if ($DryRun) { 'files to write ' } else { 'files written  ' })  $($written.Count)$(if ($kept.Count) { "; kept unchanged (diffs above): $($kept.Count)" })"
    foreach ($k in $kept) { Say "                   kept: $k" }
    Say "  pointer          $pointerPath"
    Say "  brain LAW.md     $lawStatus"
    if ($null -ne $doctorCode) {
        $band = switch ($doctorCode) { 0 { 'GREEN - every claim holds; SURVEY findings above, if any, are reported and not counted' } 1 { 'RED - a claim is false; read the FAIL lines above' } 2 { 'COULD-NOT-LOOK - something could not be checked; that is NOT a pass' } default { "exit $doctorCode" } }
        Say "  Doctor exit      $doctorCode  $band"
    } else { Say '  Doctor           not run (dry run)' }
    if ($frozenCfg.Count -gt 0) {
        Say ''
        Say "  Paste by hand into %USERPROFILE%\.claude\settings.json under autoMode.soft_deny (this script never writes that file):"
        foreach ($fp in $frozenCfg) {
            $shown = $fp -replace '\$\{ROOT\}', $Root
            Say ('    "Writes, edits, or deletions under ' + $shown + ' - a frozen reference copy; confirm with ' + $OwnerName + ' before modifying it",')
        }
    }
    Say ''
    Say '  next'
    Say "    1. Start a new Claude Code session under $Root; the entry path prints on turn one."
    Say "    2. Fill $Brain\me.md and voice.md; regenerate LAW.md after any overlay edit."
    if ($BrainIsRepo) { Say "    3. Commit the brain: git -C `"$Brain`" add -A; git -C `"$Brain`" commit -m `"adopt design-first`"" }
    Say ''
    exit 0
}
catch {
    Write-Output ''
    Write-Output "adopt: ERROR $($_.Exception.Message)"
    Write-Output "       at $($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)"
    exit 1
}
