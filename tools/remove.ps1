# remove.ps1 - reverses what adopt.ps1 wrote, and nothing else. Called by commands/remove.md.
#
#   pwsh -NoProfile -File tools/remove.ps1 [-DryRun]
#
# Reads the pointer, then <brain>\state\installed.json (SPEC 5.6, findings 58, 77):
#   - a recorded file whose sha256 (over CRLF->LF bytes) still matches  -> deleted (kit-authored, unedited)
#   - a recorded file with generated: true                            -> deleted regardless (regenerable)
#   - a recorded file whose hash no longer matches                    -> KEPT and listed (the owner edited it)
#   - a file that is not in the record                                -> never looked at
# Then deletes the pointer, %TEMP%\design-first (the once-per-session markers) and <brain>\state,
# and prints the `claude plugin uninstall` line. It never touches the user-level settings.json.
# -DryRun prints every decision and deletes nothing.
# Test seams: DF_POINTER_PATH, DF_MARKER_DIR.

[CmdletBinding()]
param([switch] $DryRun)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
. (Join-Path $PSScriptRoot 'lib\df-files.ps1')

$verb = if ($DryRun) { 'would delete' } else { 'deleted' }
function Say([string] $s) { Write-Output $s }
function Remove-DfItem([string] $path) { if (-not $DryRun) { Remove-Item -LiteralPath $path -Recurse -Force } }

try {
    $pointerPath = Get-DfPointerFile
    $markerDir = Get-DfMarkerFolder
    Say ''
    Say "design-first remove$(if ($DryRun) { '  [DRY RUN: nothing is deleted]' })"
    Say "  pointer   $pointerPath"

    $brain = $null
    if (Test-Path -LiteralPath $pointerPath -PathType Leaf) {
        try { $p = Read-DfJson $pointerPath; if ($p.brain) { $brain = Get-DfFullPath ([string]$p.brain) } }
        catch { Say "  WARNING   pointer could not be parsed ($($_.Exception.Message)); no record to read" }
    } else { Say '  (no pointer: nothing was adopted on this profile, or it was removed already)' }

    $deleted = 0; $keptList = [Collections.Generic.List[string]]::new(); $gone = 0
    if ($brain) {
        Say "  brain     $brain"
        $installedPath = Join-Path $brain 'state\installed.json'
        if (-not (Test-Path -LiteralPath $installedPath -PathType Leaf)) {
            Say "  (no ${installedPath}: nothing recorded, so no file is deleted)"
        } else {
            Say ''
            Say 'recorded files'
            foreach ($rec in (Read-DfInstalled $installedPath)) {
                $path = $rec.path
                if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Say "  gone      $path"; $gone++; continue }
                if ($rec.generated) { Say "  $verb   $path  (generated: regenerable)"; Remove-DfItem $path; $deleted++; continue }
                if ((Get-DfFileSha256 $path) -eq $rec.sha256) { Say "  $verb   $path  (unchanged since adopt)"; Remove-DfItem $path; $deleted++; continue }
                Say "  KEPT      $path  (edited since adopt; yours)"
                $keptList.Add($path)
            }
            # Folders adopt created that are now empty. Only these two; anything else is not ours to judge.
            foreach ($d in 'entry-point', 'instructions') {
                $dir = Join-Path $brain $d
                if ((Test-Path -LiteralPath $dir -PathType Container) -and -not $DryRun -and @(Get-ChildItem -LiteralPath $dir -Force).Count -eq 0) {
                    Remove-Item -LiteralPath $dir -Force; Say "  removed   $dir  (empty folder)"
                }
            }
        }
        $stateDir = Join-Path $brain 'state'
        if (Test-Path -LiteralPath $stateDir -PathType Container) { Say "  $verb   $stateDir\  (generated state)"; Remove-DfItem $stateDir }
    }

    if (Test-Path -LiteralPath $markerDir -PathType Container) { Say "  $verb   $markerDir\  (session markers)"; Remove-DfItem $markerDir }
    if (Test-Path -LiteralPath $pointerPath -PathType Leaf) { Say "  $verb   $pointerPath  (pointer)"; Remove-DfItem $pointerPath }

    Say ''
    Say 'summary'
    Say "  deleted   $deleted recorded file(s); $gone already gone"
    if ($keptList.Count -gt 0) {
        Say "  kept      $($keptList.Count) file(s) you edited since adopt - delete them yourself if you want them gone:"
        foreach ($k in $keptList) { Say "              $k" }
    } else { Say '  kept      nothing: no recorded file had been edited' }
    Say '  untouched user-level settings.json (this script never writes or deletes it; remove any soft_deny lines you pasted by hand)'
    Say ''
    Say '  Finish with:'
    Say '    claude plugin uninstall design-first'
    Say ''
    exit 0
}
catch {
    Write-Output ''
    Write-Output "remove: ERROR $($_.Exception.Message)"
    Write-Output "        at $($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)"
    exit 1
}
