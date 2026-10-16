# fence.ps1 - design-first PreToolUse fence (Edit | Write | Bash | PowerShell).
#
# Chesterton's Fence + Goodhart gate. FENCE trips on a deletion it can see (an Edit that empties a
# block or removes three or more lines, a Write that keeps under three quarters of the bytes, a
# destructive shell command from its list) and advises. GOODHART trips when an edit to a measuring
# file (a folder or file name in the path holds, as a word part, a word that starts with test,
# probe, verify or assert, or the word spec or specs; see Test-MeasuringPath) removes or neuters an
# assertion.
#
# Two tiers, because a guard that covers one language is not a guard:
#   PAREN form  - assert(...), self.assertEqual(...), expect(...) (not .expect(), a method call) -> DENIES
#   LOOSE form  - Python bare `assert x == 1`, pytest.raises, Rust assert_eq! -> ADVISES
# The loose pattern is broader and can misread a legitimate refactor, so it advises rather than
# denies. Both tiers fire only on a NET DECREASE inside a measuring path. The '* 0' deny fires with
# no decrease, and it is not reached when the same Edit or Write already got the loose-form advise.
# An Edit is compared on its old and new strings; a Write on the file on disk and the new content.
# A NotebookEdit is not fenced: the matcher in hooks.json does not send it here.
#
# Failure policy: an internal error ALLOWS the call, appends an ERROR line to the hooks log and says
# so on both channels. Never silent.

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$result = $null

function Count-Asserts([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return 0 }
    # Workaround (CR-2026-10-15-GAPS review): a method call '.expect(' counted as an assertion, so a
    # Rust test that swapped .expect("...") for '?' was denied. An expect( right after a '.' is a
    # method call and does not count (chai.expect( is lost with it; see GATE-11's residual).
    return ([regex]::Matches($s, '\bassert\w*\s*\(|(?<!\.)\bexpect\w*\s*\(')).Count
}

# The "* 0" idiom: a term multiplied by zero, '* 0', '* 0.', '* 0.0'. Workaround (CR-2026-10-15-GAPS
# review): the pattern ended in \b, which also fires between '0' and '.5', so '* 0.5' was read as a
# zero term and a test that halves a value was denied. The zero must not run on into a digit, a
# letter or another '.', so '* 0.5' and '* 0x10' do not match. Workaround (CR-2026-10-15-GAPS second
# review): the '*' that opens a C block comment matched too, so an Edit that wrote '/* 0 = off */'
# in a test was denied. A '*' right after '/' (or after '/' and more '*', as in '/** 0') opens a
# comment and is not a multiply.
$ZeroTermRx = '(?<!/\**)\*\s*0(?:\.0*)?(?![.\w])'

# A measuring file: a folder or file name in its path that holds a measuring word as a word part.
# A name is cut into word parts at any character that is not a letter or a digit, at a change from
# lower to upper case, and between letters and digits. A word part counts when it starts with test,
# probe, verify or assert, or is spec or specs, so tests/, testdata/, spec/, test_x.py, x.test.js,
# x_spec.rb, verify-build.ps1 and FooTest.java count. Workaround (CR-2026-10-15-GAPS review): the
# test was a substring match on the whole path, so latest/, inspector/ and special/ were measuring
# folders and a rewrite there that dropped an assertion was denied. 'spec' is matched whole (and
# plural) and not as a start, because special, specific and species start with it.
$MeasuringWordRx = '^(test\w*|specs?|probe\w*|verify\w*|assert\w*)$'
function Test-MeasuringPath([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $false }
    foreach ($seg in ($p -split '[\\/]')) {
        if (-not $seg) { continue }
        $cut = $seg -creplace '(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])', ' '
        foreach ($w in ($cut -split '[^A-Za-z0-9]+')) { if ($w -and $w -match $MeasuringWordRx) { return $true } }
    }
    return $false
}

function Count-AssertsLoose([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return 0 }
    # Python bare assert and pytest.raises; Rust assert!/assert_eq!/assert_ne!/debug_assert*! (the
    # `!` is why the paren regex counts 0 for these).
    return ([regex]::Matches($s,
        '(?m)^\s*assert\s|\bassert_eq\s*!|\bassert_ne\s*!|\bassert\s*!|\bdebug_assert\w*\s*!|\bpytest\.raises\b')).Count
}

function Write-FenceLog([string]$line) {
    Add-DfTextLine (Get-DfFenceLogPath) ("{0}  {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $line)
}

$GoodhartQuestions = @"
1. What sabotage does this assertion catch? Name the concrete defect.
2. After your edit, can the probe still go RED? Prove it: put the bug back, run it, name the
   assertion that fires (sed + run + restore is enough).
3. Are you weakening the check to make something pass? If the honest answer is yes, fix the CODE,
   not the measure.

If the assertion is genuinely obsolete, say what replaced its coverage. An assertion with no
replacement is a Preserve.
"@

# anchor: goodhart-paren  mode: deny  verbs: weaken-assertion
function New-Goodhart([string]$what, [string]$file) {
    $body = "GOODHART TRIPPED - $what in $file`n`n" +
            "You are editing the thing that MEASURES, not the thing being measured. When the measure " +
            "becomes the target, it stops measuring. Before this edit lands, state in your reply:`n`n$GoodhartQuestions"
    Write-FenceLog "[goodhart-paren deny] GOODHART: $what in $file"
    $r = New-DfDeny 'fence' "GOODHART: assertion weakened ($what in $file)" `
        ("GOODHART: this edit removes or neuters an assertion in $file ($what). Fix the CODE, not the measure. " +
         "If the assertion is genuinely obsolete, say what replaced its coverage and ask the owner.`n`n$body")
    return $r
}

# anchor: goodhart-loose  mode: advise  verbs: weaken-assertion
function New-GoodhartSoft([string]$what, [string]$file) {
    $body = "GOODHART (advisory) - $what in $file`n`n" +
            "This looks like an assertion being removed from a measuring file. It is not blocked, because " +
            "detection for this language is broader and can misread a legitimate refactor. Answer it anyway:`n`n$GoodhartQuestions"
    Write-FenceLog "[goodhart-loose advise] GOODHART: $what in $file"
    return (New-DfAdvisory 'fence' @(@{ title = "GOODHART (advisory): $what in $file"; body = $body }))
}

# anchor: fence-net-deletion  mode: advise  verbs: delete,simplify
function New-Fence([string]$what) {
    $body = @"
FENCE TRIPPED - $what

You are removing something you did not put there. Before this edit lands, state in your reply:
1. What does it prevent? Name the failure mode, not the syntax.
2. What breaks if it is gone? Name the call sites you actually checked.
3. Evidence you used: git log -S '<thing>' | git blame | the Change Log in DECISIONS.md |
   the probe that covers it | the comment above it.
   If ZERO of those exist, that is the finding. Preserve it and say so.

Verdict, one of: Preserve | Modify | Replace | Remove. If uncertain, Preserve.

Does NOT apply when the owner named this thing for removal - an explicit ask is the approval.
Applies DOUBLE if the word in your head was "consolidate", "tidy", "clean up", or "simplify".
"@
    Write-FenceLog "[fence-net-deletion advise] FENCE: $what"
    return (New-DfAdvisory 'fence' @(@{ title = "net deletion detected ($what)"; body = $body }))
}

try {
    . (Join-Path $PSScriptRoot 'lib\common.ps1')

    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'empty stdin (no tool call payload)' }
    $j = $raw | ConvertFrom-Json
    $tool = [string]$j.tool_name
    $ti = $j.tool_input
    if ($null -eq $ti) { throw "payload has no tool_input (tool_name='$tool')" }

    switch -Regex ($tool) {
        '^Edit$' {
            $old = [string]$ti.old_string
            $new = [string]$ti.new_string
            $fp  = [string]$ti.file_path
            if ([string]::IsNullOrEmpty($old)) { break }
            if (Test-MeasuringPath $fp) {
                $oldA = Count-Asserts $old; $newA = Count-Asserts $new
                if ($newA -lt $oldA) { $result = New-Goodhart "$($oldA - $newA) assertion(s) removed" $fp; break }
                $oldL = Count-AssertsLoose $old; $newL = Count-AssertsLoose $new
                if ($newL -lt $oldL) { $result = New-GoodhartSoft "$($oldL - $newL) assertion(s) removed (Python/Rust form)" $fp; break }
                # The "* 0.0" idiom: an assertion survives textually but its term is erased.
                if ($new -match $ZeroTermRx -and $old -notmatch $ZeroTermRx) {
                    $result = New-Goodhart "a '* 0' term introduced (an assertion may be erasing itself)" $fp; break
                }
            }
            if ([string]::IsNullOrEmpty($new)) { $result = New-Fence "an entire block is being deleted from $fp"; break }
            $lost = ($old -split "`n").Count - ($new -split "`n").Count
            if ($lost -ge 3) { $result = New-Fence "$lost lines removed from $fp" }
        }
        '^Write$' {
            $p = [string]$ti.file_path
            if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { break }
            $oldLen = (Get-Item -LiteralPath $p).Length
            if ($oldLen -le 0) { break }
            # A Write to a measuring file is compared assertion by assertion, like an Edit: the file
            # on disk is the old text and the content is the new. Workaround (CR-2026-10-15-GAPS D1):
            # this branch compared bytes only, so a full rewrite that dropped assertions got at most
            # a size advise, and none when it kept three quarters of the bytes.
            if (Test-MeasuringPath $p) {
                $old = [IO.File]::ReadAllText($p); $new = [string]$ti.content
                $oldA = Count-Asserts $old; $newA = Count-Asserts $new
                if ($newA -lt $oldA) { $result = New-Goodhart "$($oldA - $newA) assertion(s) removed by a Write" $p; break }
                $oldL = Count-AssertsLoose $old; $newL = Count-AssertsLoose $new
                if ($newL -lt $oldL) { $result = New-GoodhartSoft "$($oldL - $newL) assertion(s) removed by a Write (Python/Rust form)" $p; break }
                if ($new -match $ZeroTermRx -and $old -notmatch $ZeroTermRx) {
                    $result = New-Goodhart "a '* 0' term introduced by a Write (an assertion may be erasing itself)" $p; break
                }
            }
            $newLen = [Text.Encoding]::UTF8.GetByteCount([string]$ti.content)
            if ($newLen -lt ($oldLen * 0.75)) {
                $pct = [int](100 - (($newLen / $oldLen) * 100))
                $result = New-Fence "overwriting $p and losing ~$pct% of it"
            }
        }
        '^(Bash|PowerShell)$' {
            $cmd = [string]$ti.command
            if ([string]::IsNullOrWhiteSpace($cmd)) { break }
            $patterns = @(
                'rm\s+(-\w*[rf]\w*\s+)', 'Remove-Item[^|;]*-(Recurse|Force)', 'git\s+reset\s+--hard',
                'git\s+clean\s+-\w*[fdx]', 'git\s+checkout\s+--\s', 'git\s+restore\s+', 'git\s+stash\s+drop',
                'git\s+branch\s+-D', 'Move-Item[^|;]*-Force', 'Clear-Content'
            )
            foreach ($pat in $patterns) {
                if ($cmd -match $pat) { $result = New-Fence "destructive command: $($Matches[0].Trim())"; break }
            }
        }
    }
    if ($result) { Write-DfJson $result }
}
catch {
    # Internal error: allow, log, surface. Written inline so it works even when lib/ failed to load.
    $msg = $_.Exception.Message
    try {
        $log = if ($env:DF_LOG_PATH) { $env:DF_LOG_PATH } else { Join-Path $env:USERPROFILE '.claude\design-first-hooks.log' }
        $dir = Split-Path -Parent $log
        if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Add-Content -LiteralPath $log -Value ("{0} ERROR fence {1}" -f (Get-Date).ToString('o'), ($msg -replace '\s+', ' ')) -Encoding utf8
    } catch { }
    $body = "fence hook hit an internal error and ALLOWED this call without inspecting it: $msg. Logged to the design-first hooks log."
    @{
        systemMessage      = "FENCE: internal error, call allowed ($msg)"
        hookSpecificOutput = @{ hookEventName = 'PreToolUse'; additionalContext = $body }
    } | ConvertTo-Json -Depth 5 -Compress
}
exit 0
