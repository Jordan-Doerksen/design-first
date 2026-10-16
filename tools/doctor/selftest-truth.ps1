# selftest-truth.ps1 - the Doctor reports what it could not look at (CR-2026-10-15-GAPS D6).
# Dot-sourced by selftest.ps1 at the end of its run. It shares Ok, Bad, the Assert-* helpers, W, WJ,
# NewDir, $here, $T and $fakeHome. It is its own file because its subject is the Doctor's honesty
# about itself, not a claim type.
#
# Two silent or false results, each with a case that fails when its fix is reverted:
#   1. A crash. Before D6 an exception outside every try in doctor.ps1 exited 1, and Doctor.bat
#      prints exit 1 as "RED - findings above" with no finding above it. The trap makes it exit 2.
#   2. A registered hook the kit's claims never start. Before D6 the ask hook (OWN-04, GATE-01) had
#      no hook_smoke claim, so a question hook that could not start left `-Kit` GREEN. The case reads
#      both files, so a hook registered later with no claim fails here too.

function New-CrashDoctor {
    # A scratch copy of the Doctor under <T>\<name>\tools\doctor, so -Kit resolves the kit to the
    # copy and nothing planted here can reach the real Doctor or the sandbox kit.
    param([string] $Name)
    $d = NewDir (Join-Path $T "$Name\tools\doctor")
    Get-ChildItem -LiteralPath $here -Filter '*.ps1' | Where-Object { $_.Name -notlike 'selftest*.ps1' } | Copy-Item -Destination $d
    WJ (Join-Path $d 'claims.json') ([ordered]@{ schema = 1; claims = @() })
    return $d
}

function Invoke-CrashDoctor {
    param([string] $Dir, [string[]] $DoctorArgs)
    $saveUp = $env:USERPROFILE; $savePtr = $env:DF_POINTER_PATH
    try {
        $env:USERPROFILE = $fakeHome; $env:DF_POINTER_PATH = (Join-Path $T 'no-pointer-here.json')
        $out = & pwsh -NoProfile -File (Join-Path $Dir 'doctor.ps1') @DoctorArgs 2>&1 | Out-String
        return [PSCustomObject]@{ out = $out; code = $LASTEXITCODE }
    } finally {
        $env:USERPROFILE = $saveUp
        if ($null -ne $savePtr) { $env:DF_POINTER_PATH = $savePtr } else { Remove-Item Env:DF_POINTER_PATH -ErrorAction SilentlyContinue }
    }
}

# ================================================================ run X: the Doctor crashes
Write-Host '  Run X: a Doctor that crashes is could-not-look, never RED' -ForegroundColor Cyan

# X1: a file the Doctor dot-sources throws while it loads.
$x1 = New-CrashDoctor 'crash-load'
W (Join-Path $x1 'claims-snapshot.ps1') "throw 'planted: a dot-sourced file throws'`n"
$r = Invoke-CrashDoctor $x1 @('-Kit')
Assert-Exit 'X: a crash while the Doctor loads its own files is could-not-look' $r.code 2
Assert-Has 'X: the crash line names the reason, the file and the line' $r.out 'COULD-NOT-LOOK: the Doctor stopped: planted: a dot-sourced file throws at claims-snapshot.ps1:1'
Assert-Has 'X: the crash says it is not a pass' $r.out 'This is not a pass. Exit 2.'
Assert-HasNot 'X: a crash prints no verdict line' $r.out 'VERDICT:'

# X2: a step outside every try throws in the middle of the run, under -Json.
$x2 = New-CrashDoctor 'crash-verdict'
Add-Content -LiteralPath (Join-Path $x2 'report.ps1') -Value "`nfunction Get-Verdict { throw 'planted: the verdict step throws' }" -Encoding utf8
$r = Invoke-CrashDoctor $x2 @('-Kit', '-Json')
Assert-Exit 'X: a crash in the verdict step is could-not-look, not RED' $r.code 2
try {
    $xj = $r.out | ConvertFrom-Json
    if ($xj.verdict -eq 'COULD-NOT-LOOK' -and $xj.exitCode -eq 2 -and $xj.mode -eq 'kit') { Ok 'X: under -Json a crash is one JSON document with verdict COULD-NOT-LOOK' } else { Bad 'X: -Json crash document' ($xj | ConvertTo-Json -Compress) }
    if ([string]$xj.reason -like 'the Doctor stopped: planted: the verdict step throws at report.ps1:*') { Ok 'X: the -Json reason names the step and the file' } else { Bad 'X: -Json crash reason' ([string]$xj.reason) }
} catch { Bad 'X: under -Json a crash is one JSON document' ("not JSON: " + $r.out) }

# ================================================================ run K: every registered hook is smoked by the kit's claims
Write-Host '  Run K: the kit smokes every hook it registers' -ForegroundColor Cyan
$kitRoot = Split-Path -Parent (Split-Path -Parent $here)
$hj = Get-Content -LiteralPath (Join-Path $kitRoot 'hooks\hooks.json') -Raw | ConvertFrom-Json
$registered = [Collections.Generic.List[string]]::new()
foreach ($ev in $hj.hooks.PSObject.Properties) {
    foreach ($entry in @($ev.Value)) {
        foreach ($h in @($entry.hooks)) {
            $text = if ($h.args) { ($h.args -join ' ') } else { [string]$h.command }
            foreach ($m in [regex]::Matches($text, 'hooks[\\/]+([A-Za-z0-9_-]+)\.ps1')) {
                $pair = '{0}/{1}' -f $m.Groups[1].Value, $ev.Name
                if (-not $registered.Contains($pair)) { $registered.Add($pair) }
            }
        }
    }
}
$kc = Get-Content -LiteralPath (Join-Path $here 'claims.json') -Raw | ConvertFrom-Json
$smoked = @($kc.claims | Where-Object { $_.type -eq 'hook_smoke' } | ForEach-Object { '{0}/{1}' -f $_.hook, $_.event })
$unsmoked = @($registered | Where-Object { $smoked -notcontains $_ })
if ($registered.Count -gt 0 -and $unsmoked.Count -eq 0) { Ok ("K: every hook hooks.json registers has a hook_smoke claim in the kit's claims ({0} hook/event pairs)" -f $registered.Count) }
else { Bad "K: every hook hooks.json registers has a hook_smoke claim in the kit's claims" ("registered with no hook_smoke claim: {0}" -f ($(if ($registered.Count -eq 0) { 'no registration read from hooks.json' } else { $unsmoked -join ', ' }))) }
