# cases-law-claim.ps1 - hook self-test cases for the commit check (VCS-23). Dot-sourced by run.ps1,
# which owns the fixtures and helpers used here ($T, $root, $kit, NewRepo, Put, RunGit, Record,
# $repoClean). Never run directly. Split out of run.ps1 by domain when that file passed the split line.

# ------------------------------------------------------------------ 6. the commit-msg check (VCS-23): tools/vcs/law-claim.ps1 behind templates/commit-msg
# Real commits in a small brain-shaped repository with the shim installed, so the path git takes is
# the path tested: sh shim -> pointer -> kit script -> exit code -> git refuses or proceeds.
Write-Host '-- commit-msg: law-claim (VCS-23)'
function GitTry([string]$dir, [string[]]$a) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $out = @(& git.exe -C $dir -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c core.autocrlf=false @a 2>&1 | ForEach-Object { [string]$_ }) -join "`n"
        return @{ code = $LASTEXITCODE; out = $out }
    } finally { $ErrorActionPreference = $prev }
}
function Verdict($r) { if ($r.code -eq 0) { return 'committed' } elseif ($r.out -like '*VCS-23*') { return 'refused' } else { return "exit$($r.code)" } }
$lawRepo = NewRepo 'repo-brain'
Put (Join-Path $lawRepo 'LAW.md') "| OWN-01 | OWNER | a rule | ``brain:instructions/me.md`` |`n"
Put (Join-Path $lawRepo 'instructions\me.md') 'v1'
Put (Join-Path $lawRepo 'law.overlay.json') '{}'
Put (Join-Path $lawRepo 'claims.json') '{ "claims": [] }'
Put (Join-Path $lawRepo 'notes.md') 'n1'
RunGit $lawRepo @('add', '-A'); RunGit $lawRepo @('commit', '-q', '-m', 'init')
$shim = Join-Path $kit 'templates\commit-msg'
Copy-Item -LiteralPath $shim -Destination (Join-Path $lawRepo '.git\hooks\commit-msg')
Record 'law-claim: the shim is LF (sh cannot run a CRLF script)' 'lf' $(if ([IO.File]::ReadAllText($shim).Contains("`r")) { 'crlf' } else { 'lf' }) ''

Put (Join-Path $lawRepo 'instructions\me.md') 'v2'; RunGit $lawRepo @('add', 'instructions/me.md')
$r = GitTry $lawRepo @('commit', '-m', 'edit the law')
Record 'law-claim: a law file with no claim and no waiver -> refused' 'refused' (Verdict $r) $r.out
Record 'law-claim: the refusal names the law file and both ways out' 'named' $(if ($r.out -like '*instructions/me.md*' -and $r.out -like '*claims.json*' -and $r.out -like '*No-Claim: <reason>*') { 'named' } else { 'missing' }) $r.out
Put (Join-Path $lawRepo 'claims.json') '{ "claims": [ 1 ] }'; RunGit $lawRepo @('add', 'claims.json')
$r = GitTry $lawRepo @('commit', '-m', 'edit the law, with its claim')
Record 'law-claim: the same edit with claims.json staged -> committed' 'committed' (Verdict $r) $r.out
Put (Join-Path $lawRepo 'instructions\me.md') 'v3'; RunGit $lawRepo @('add', 'instructions/me.md')
$r = GitTry $lawRepo @('commit', '-m', 'a voice rule', '-m', 'No-Claim: a voice rule, it states no fact about the disk')
Record 'law-claim: a written waiver in the message -> committed' 'committed' (Verdict $r) $r.out
Put (Join-Path $lawRepo 'instructions\me.md') 'v4'; RunGit $lawRepo @('add', 'instructions/me.md')
$r = GitTry $lawRepo @('commit', '-m', 'lazy', '-m', 'No-Claim: none')
Record 'law-claim: a waiver with no real reason -> refused, and says why' 'refused' $(if ((Verdict $r) -eq 'refused' -and $r.out -like '*shorter than*') { 'refused' } else { "wrong:$(Verdict $r)" }) $r.out
RunGit $lawRepo @('reset', '-q', '--hard')
Put (Join-Path $lawRepo 'notes.md') 'n2'; RunGit $lawRepo @('add', 'notes.md')
$r = GitTry $lawRepo @('commit', '-m', 'notes only')
Record 'law-claim: no law file in the commit -> committed, silent' 'committed' $(if ($r.code -eq 0 -and $r.out -notlike '*law-claim*' -and $r.out -notlike '*VCS-23*') { 'committed' } else { 'noisy' }) $r.out
Put (Join-Path $lawRepo 'law.overlay.json') '{ "a": 1 }'; RunGit $lawRepo @('add', 'law.overlay.json')
$r = GitTry $lawRepo @('commit', '-m', 'a new clause')
Record 'law-claim: the overlay is a law file -> refused' 'refused' $(if ((Verdict $r) -eq 'refused' -and $r.out -like '*law.overlay.json*') { 'refused' } else { "wrong:$(Verdict $r)" }) $r.out
RunGit $lawRepo @('reset', '-q', '--hard')
# commit by path: git builds a temporary index for the named path; the hook must read that one
Put (Join-Path $lawRepo 'instructions\me.md') 'v5'
$r = GitTry $lawRepo @('commit', '-m', 'by path', '--', 'instructions/me.md')
Record 'law-claim: commit by path (nothing staged beforehand) -> refused' 'refused' (Verdict $r) $r.out
$r = GitTry $lawRepo @('commit', '-m', 'by path', '-m', 'No-Claim: by path, a wording change only', '--', 'instructions/me.md')
Record 'law-claim: commit by path with a waiver -> committed' 'committed' (Verdict $r) $r.out
# lawClaim.extraFiles in doctor.config.json adds a law file
Put (Join-Path $lawRepo 'doctor.config.json') '{ "schema": 1, "lawClaim": { "extraFiles": [ "notes.md" ] } }'; RunGit $lawRepo @('add', 'doctor.config.json')
$null = GitTry $lawRepo @('commit', '-m', 'config')
Put (Join-Path $lawRepo 'notes.md') 'n3'; RunGit $lawRepo @('add', 'notes.md')
$r = GitTry $lawRepo @('commit', '-m', 'notes again')
Record 'law-claim: lawClaim.extraFiles makes another file a law file -> refused' 'refused' (Verdict $r) $r.out
RunGit $lawRepo @('reset', '-q', '--hard')
# no pointer: the shim cannot find the kit; it says so and lets the commit through
Put (Join-Path $lawRepo 'instructions\me.md') 'v6'; RunGit $lawRepo @('add', 'instructions/me.md')
$saved = $env:DF_POINTER_PATH; $env:DF_POINTER_PATH = Join-Path $T 'no-such-pointer.json'
$r = GitTry $lawRepo @('commit', '-m', 'no pointer')
$env:DF_POINTER_PATH = $saved
Record 'law-claim: no pointer -> committed, and says VCS-23 was not checked' 'said-so' $(if ($r.code -eq 0 -and $r.out -like '*NOT checked*') { 'said-so' } else { "wrong:exit$($r.code)" }) $r.out
# a repository with no LAW.md is not a brain: the hook is silent there
Copy-Item -LiteralPath $shim -Destination (Join-Path $repoClean '.git\hooks\commit-msg')
Put (Join-Path $repoClean 'src\main.py') 'print(3)'; RunGit $repoClean @('add', '-A')
$r = GitTry $repoClean @('commit', '-m', 'code')
Record 'law-claim: a repository with no LAW.md -> committed, silent' 'committed' $(if ($r.code -eq 0 -and $r.out -notlike '*law-claim*' -and $r.out -notlike '*VCS-23*') { 'committed' } else { 'noisy' }) $r.out
