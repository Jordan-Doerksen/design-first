# snapshot.ps1 - write the before-state a snapshot_diff claim compares against (CR-2026-10-14-REVIEW).
#
#   pwsh -NoProfile -File tools/doctor/snapshot.ps1 -Root <folder> -Out <file.json> [-Exclude a,b/c]
#
# Walks Root (skipping .git and every Exclude path, the same rule the claim applies), and writes
# { schema: 1, root, taken, files: [{ path, size, sha256 }] } to Out: UTF-8 without BOM, LF, paths
# sorted, forward slashes, lower case. Prints one line saying what it wrote. The file is a generated
# fact about the disk (VCS-15); nothing in it is typed.
#
# Exit 0 = written. Exit 1 = Root is not a folder, or Out could not be written. Nothing else is touched.

param(
    [Parameter(Mandatory = $true)] [string] $Root,
    [Parameter(Mandatory = $true)] [string] $Out,
    [string[]] $Exclude = @()
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'claims-tree.ps1')       # Get-TreeFileMap, ConvertTo-RelKey
. (Join-Path $here 'claims-snapshot.ps1')   # Get-DfSnapshotFiles

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    Write-Host "snapshot: root is not a folder: $Root"
    exit 1
}
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$ex = @($Exclude | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { ConvertTo-RelKey ([string]$_) })
$files = Get-DfSnapshotFiles $rootFull $ex
$doc = [ordered]@{
    schema  = 1
    root    = $rootFull
    taken   = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    exclude = @($ex)
    files   = @($files)
}
try {
    $outFull = [IO.Path]::GetFullPath($Out)
    $dir = Split-Path -Parent $outFull
    if ($dir -and -not (Test-Path -LiteralPath $dir -PathType Container)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $json = (($doc | ConvertTo-Json -Depth 6) -replace "`r`n", "`n") + "`n"
    [IO.File]::WriteAllText($outFull, $json, [Text.UTF8Encoding]::new($false))
} catch {
    Write-Host "snapshot: could not write $Out ($($_.Exception.Message))"
    exit 1
}
Write-Host ("snapshot: {0} file(s) under {1} written to {2}" -f $files.Count, $rootFull, $outFull)
exit 0
