# law-claim.ps1 - the commit-msg check behind VCS-23: a law file in the commit needs a claim in
# the same commit, or a written reason why it needs none.
#
# Run by the shim templates/commit-msg, installed as <brain>\.git\hooks\commit-msg. Git calls the
# shim with the path of the message file; the shim finds this script through the pointer.
#   pwsh -NoProfile -File tools/vcs/law-claim.ps1 -MessageFile <path> [-RepoRoot <dir>]
# Exit 0 = the commit proceeds. Exit 1 = refused, with the reason on stderr.
#
# What counts as a law file is generated, not typed: every owning file the repository's LAW.md
# names as `brain:<path>`, plus law.overlay.json, plus lawClaim.extraFiles from doctor.config.json.
# A repository with no LAW.md at its root is not a brain, and nothing is checked.
#
# The commit passes when no law file is staged, when claims.json is staged, when the message carries
# a line "No-Claim: <reason>" (owner decision 2026-10-08: a written waiver; measured on the first
# instance, 18 of 30 law commits stated no fact about the disk), or when it is a merge.
#
# Honest limits. The check sees that claims.json changed, not that the new claim covers the new
# fact. A waiver's reason is read by a person, not graded. `git commit --no-verify` skips every
# commit hook, this one included. An internal error lets the commit through, says so on stderr and
# writes an ERROR line to the design-first hooks log; it never refuses a commit it could not inspect.
#
# anchor: law-claim  mode: gate  verbs: claim

param(
    [Parameter(Mandatory = $true)] [string] $MessageFile,
    [string] $RepoRoot
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }

function Write-Err([string] $line) { [Console]::Error.WriteLine($line) }

try {
    if ($RepoRoot) { Set-Location -LiteralPath $RepoRoot }
    # Workaround: the output is captured whole and the first line taken afterwards. Piping git into
    # Select-Object -First 1 stops the pipeline early and leaves $LASTEXITCODE unset, which read as
    # "not zero" here and let every commit through unchecked.
    $top = @(& git rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or $top.Count -eq 0 -or -not $top[0]) { exit 0 }   # not a repository: nothing to check
    $root = ([string]$top[0]).Trim() -replace '/', '\'
    $lawPath = Join-Path $root 'LAW.md'
    if (-not (Test-Path -LiteralPath $lawPath -PathType Leaf)) { exit 0 }  # not a brain

    # Tunables (doctor.config.json, key lawClaim); built-in defaults when the key is absent.
    $trailer = 'No-Claim'; $minReason = 10; $extra = @()
    $cfgPath = Join-Path $root 'doctor.config.json'
    if (Test-Path -LiteralPath $cfgPath -PathType Leaf) {
        $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding utf8 | ConvertFrom-Json
        $lc = if ($cfg.PSObject.Properties['lawClaim']) { $cfg.lawClaim } else { $null }
        if ($lc) {
            if ($lc.PSObject.Properties['trailer'] -and $lc.trailer) { $trailer = [string]$lc.trailer }
            if ($lc.PSObject.Properties['minReason']) { $v = 0; if ([int]::TryParse([string]$lc.minReason, [ref]$v) -and $v -ge 1) { $minReason = $v } }
            if ($lc.PSObject.Properties['extraFiles']) { $extra = @($lc.extraFiles | Where-Object { $_ } | ForEach-Object { [string]$_ }) }
        }
    }

    $norm = { param($p) (([string]$p).Trim() -replace '\\', '/').TrimStart('/').ToLowerInvariant() }
    $lawFiles = [Collections.Generic.HashSet[string]]::new()
    foreach ($m in [regex]::Matches([IO.File]::ReadAllText($lawPath), '`brain:([^`]+)`')) { [void]$lawFiles.Add((& $norm $m.Groups[1].Value)) }
    [void]$lawFiles.Add('law.overlay.json')
    foreach ($e in $extra) { [void]$lawFiles.Add((& $norm $e)) }

    # A merge brings in commits that were each checked when they were made.
    & git rev-parse -q --verify MERGE_HEAD 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { exit 0 }

    $staged = @(& git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMRD 2>$null | Where-Object { $_ })
    if ($LASTEXITCODE -ne 0) { throw 'git diff --cached failed' }
    $hits = @($staged | Where-Object { $lawFiles.Contains((& $norm $_)) } | Sort-Object)
    if ($hits.Count -eq 0) { exit 0 }
    if (@($staged | Where-Object { (& $norm $_) -eq 'claims.json' }).Count -gt 0) { exit 0 }

    $msg = if (Test-Path -LiteralPath $MessageFile -PathType Leaf) { [IO.File]::ReadAllText($MessageFile) } else { '' }
    $rx = '(?im)^[ \t]*' + [regex]::Escape($trailer) + '[ \t]*:[ \t]*(.+?)[ \t]*$'
    $given = ''
    foreach ($m in [regex]::Matches($msg, $rx)) { if ($m.Groups[1].Value.Trim().Length -gt $given.Length) { $given = $m.Groups[1].Value.Trim() } }
    if ($given.Length -ge $minReason) { exit 0 }

    Write-Err ''
    Write-Err 'design-first VCS-23: this commit changes a law file and carries no claim.'
    Write-Err ('  law file(s): ' + ($hits -join ', '))
    Write-Err '  When a law file states a fact about the disk, it gets a claim in the same commit.'
    Write-Err '    1. add or change the claim in claims.json and stage it, or'
    Write-Err ("    2. if this change states no fact about the disk, add a line to the commit message:  {0}: <reason>" -f $trailer)
    if ($given) { Write-Err ("  The reason given ('{0}') is shorter than {1} characters; say why no claim is needed." -f $given, $minReason) }
    Write-Err ''
    exit 1
}
catch {
    $text = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR law-claim {1}" -f (Get-Date).ToString('o'), ($text -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    Write-Err "design-first law-claim: internal error, VCS-23 was NOT checked for this commit ($text). Logged to the design-first hooks log."
    exit 0
}
