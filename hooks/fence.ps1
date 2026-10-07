# fence.ps1 - design-first PreToolUse fence (Edit | Write | Bash | PowerShell).
#
# Chesterton's Fence + Goodhart gate. FENCE trips on NET DELETION and asks. GOODHART trips when an
# edit to a measuring file (test | probe | spec | verify | assert in the path) removes or neuters an
# assertion.
#
# Two tiers, because a guard that covers one language is not a guard:
#   PAREN form  - assert(...), self.assertEqual(...), expect(...)         -> DENIES
#   LOOSE form  - Python bare `assert x == 1`, pytest.raises, Rust assert_eq! -> ADVISES
# The loose pattern is broader and can misread a legitimate refactor, so it asks rather than denies.
# Both fire only on a NET DECREASE inside a measuring path.
#
# Failure policy: an internal error ALLOWS the call, appends an ERROR line to the hooks log and says
# so on both channels. Never silent.

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$result = $null

function Count-Asserts([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return 0 }
    return ([regex]::Matches($s, '\bassert\w*\s*\(|\bexpect\w*\s*\(')).Count
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

# anchor: fence-net-deletion  mode: advise  verbs: delete
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
            if ($fp -match '(?i)(test|probe|spec|verify|assert)') {
                $oldA = Count-Asserts $old; $newA = Count-Asserts $new
                if ($newA -lt $oldA) { $result = New-Goodhart "$($oldA - $newA) assertion(s) removed" $fp; break }
                $oldL = Count-AssertsLoose $old; $newL = Count-AssertsLoose $new
                if ($newL -lt $oldL) { $result = New-GoodhartSoft "$($oldL - $newL) assertion(s) removed (Python/Rust form)" $fp; break }
                # The "* 0.0" idiom: an assertion survives textually but its term is erased.
                if ($new -match '\*\s*0(\.0+)?\b' -and $old -notmatch '\*\s*0(\.0+)?\b') {
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
