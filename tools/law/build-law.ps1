# build-law.ps1 - generates LAW.md from law.json (+ optional overlay).
# CLI CONTRACT (fixed in chunk 1; implementation lands in chunk 2):
#   pwsh -NoProfile -File tools/law/build-law.ps1 -Source <law.json> [-Overlay <law.overlay.json>] [-Installed <state.json>] -Out <LAW.md>
#   Exit 0 = written. Exit 1 = validation failure (message names the clause id and the rule broken).
#   Output bytes: UTF-8 without BOM, LF, deterministic order (group order as listed in law.json, then id), no timestamp.
#   Idempotent: same inputs -> identical bytes.
param(
    [Parameter(Mandatory)] [string] $Source,
    [string] $Overlay,
    [string] $Installed,
    [Parameter(Mandatory)] [string] $Out
)
Write-Error "build-law.ps1: not implemented (chunk 2). Contract only."
exit 1
