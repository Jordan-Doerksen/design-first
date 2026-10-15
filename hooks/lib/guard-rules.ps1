# guard-rules.ps1 - guard rules 1-6, in SPEC 5.4 order. Dot-sourced by guard.ps1. Rules 7-9 are in guard-owner-rules.ps1.
# Each rule returns $null (no opinion) or a deny object from New-DfDeny. Advisories are added to
# the $script:DfAdvisories list and emitted once by guard.ps1.

$script:DfSecretGlobs = @('*.env', '*.env.*', '*.key', '*.pem', '*.p12', '*.pfx')
$script:DfEnvGlobs    = @('*.env', '*.env.*')

function Test-DfSecretName([string]$leaf, [string[]]$globs) {
    if ([string]::IsNullOrWhiteSpace($leaf)) { return $false }
    if ($leaf -like '*.env.example') { return $false }
    foreach ($g in $globs) { if ($leaf -like $g) { return $true } }
    return $false
}

function Test-DfException([string]$full, [string[]]$exceptions) {
    if (-not $full) { return $false }
    foreach ($e in $exceptions) { if ($full.Equals($e, [StringComparison]::OrdinalIgnoreCase)) { return $true } }
    return $false
}

# -AgentOnly: the advisory goes to the agent's context and never to the owner's screen (no
# systemMessage title). Rule 6 uses it: a note about a file's size is the agent's to act on.
function Add-DfAdvisory([string]$title, [string]$body, [switch]$AgentOnly) {
    $script:DfAdvisories += @{ title = $title; body = $body; agentOnly = [bool]$AgentOnly }
}

# Short-option group scan: returns @{ flags = letters seen before a value-taking letter;
# consumesNext = $true when the last letter takes a value and nothing followed it }.
function Read-DfShortGroup([string]$tok, [string]$valueLetters) {
    $r = @{ flags = @(); consumesNext = $false }
    $letters = $tok.Substring(1)
    for ($k = 0; $k -lt $letters.Length; $k++) {
        $ch = $letters[$k]
        if ($valueLetters.Contains($ch)) {
            if ($k -eq $letters.Length - 1) { $r.consumesNext = $true }
            break
        }
        $r.flags += [string]$ch
    }
    return $r
}

# ============================================================================ (1) staging
# anchor: stage-secret  mode: deny  verbs: stage,track
function Test-DfStagingRule($call, [string[]]$exceptions, [string]$owner) {
    if ($call.sub -ne 'add' -and $call.sub -ne 'commit') { return $null }
    $a = @($call.args)
    $cwd = $call.cwd

    # Option-value stripping (finding 75): a message or a file argument is prose, not a pathspec.
    $valueLetters = if ($call.sub -eq 'commit') { 'mFCct' } else { '' }
    $longValued = @('--message', '--file', '--reuse-message', '--reedit-message', '--author', '--date',
                    '--template', '--fixup', '--squash', '--trailer', '--pathspec-from-file', '--chmod', '--gpg-sign', '--cleanup')
    $paths = @(); $hasAll = $false; $afterDashDash = $false
    for ($i = 0; $i -lt $a.Count; $i++) {
        $t = $a[$i]
        if ($afterDashDash) { $paths += $t; continue }
        if ($t -eq '--') { $afterDashDash = $true; continue }
        if ($t -match '^--[A-Za-z-]+=') { continue }
        if ($t -in $longValued) { $i++; continue }
        if ($t -eq '--all') { $hasAll = $true; continue }
        if ($t -match '^-[A-Za-z]+$') {
            $g = Read-DfShortGroup $t $valueLetters
            if ('a' -in $g.flags) { $hasAll = $true }
            if ('A' -in $g.flags -or 'u' -in $g.flags) { $paths += '-A' }
            if ($g.consumesNext) { $i++ }
            continue
        }
        if ($t.StartsWith('-')) { continue }
        $paths += $t
    }
    if ($call.sub -eq 'commit' -and -not $hasAll) { return $null }

    $probes = @()
    foreach ($p in $paths) {
        if ($p -in @('-A', '-u', '-Au', '-uA', '.', './', '.\')) { $probes += $p; continue }
        $leaf = Get-DfLeaf $p
        if (Test-DfSecretName $leaf $script:DfSecretGlobs) {
            $full = ConvertTo-DfFullPath $p $cwd
            if (Test-DfException $full $exceptions) { continue }
            return (New-DfStageDeny $p $owner)
        }
        $full = ConvertTo-DfFullPath $p $cwd
        if ($p -match '[*?\[]' -or ($full -and (Test-Path -LiteralPath $full -PathType Container))) { $probes += $p }
    }
    if ($hasAll -and $call.sub -eq 'add') { $probes += '-A' }

    # Wildcard probe (finding 71): ask git which untracked, un-ignored files the pathspec covers.
    foreach ($p in $probes) {
        $runDir = $cwd
        $spec = @('--', $p)
        if ($p -match '^-') {
            # -A / -u / --all cover the whole work tree, so probe from the top level.
            $top = Invoke-DfGit $cwd @('rev-parse', '--show-toplevel')
            if ($top.code -ne 0) { continue }
            $runDir = ConvertTo-DfFullPath ([string]$top.out)
            $spec = @()
        }
        $ls = Invoke-DfGit $runDir (@('ls-files', '--others', '--exclude-standard', '-z') + $spec)
        if ($ls.code -ne 0 -or -not $ls.out) { continue }
        $joined = ($ls.out -join '')
        foreach ($f in ($joined -split "`0")) {
            if ([string]::IsNullOrWhiteSpace($f)) { continue }
            if (-not (Test-DfSecretName (Get-DfLeaf $f) $script:DfSecretGlobs)) { continue }
            $full = ConvertTo-DfFullPath $f $runDir
            if (Test-DfException $full $exceptions) { continue }
            return (New-DfStageDeny "$f (via '$p')" $owner)
        }
    }
    return $null
}

function New-DfStageDeny([string]$what, [string]$owner) {
    $reason = "BLOCKED - this command stages a file that looks like a credential: $what`n`n" +
              "Secrets live in a gitignored .env, always; a token is never committed. If this one " +
              "has leaked, rotate it first and assume it is already public. If this file is a " +
              "deliberate exception, $owner registers it in secretExceptions in the brain's " +
              "doctor.config.json before it is staged; an exception is recorded, never assumed."
    return (New-DfDeny 'guard' "staging a secret ($what)" $reason)
}

# ============================================================================ (2) history
# anchor: git-history  mode: deny  verbs: destroy-history
function Test-DfHistoryRule($call, [string]$owner) {
    $a = @($call.args)
    $hit = $null
    switch ($call.sub) {
        'gc'     { if ($a | Where-Object { $_ -match '^--prune(=.*)?$' }) { $hit = 'git gc --prune removes unreachable objects, the recovery net for anything never committed' } }
        'reflog' { if ('expire' -in $a) { $hit = 'git reflog expire removes the reflog, the first recovery tool after a bad reset' } }
        'push'   {
            $valued = @('-o', '--push-option', '--receive-pack', '--exec', '--repo')
            for ($i = 0; $i -lt $a.Count; $i++) {
                $t = $a[$i]
                if ($t -in $valued) { $i++; continue }
                if ($t -match '^--(force|force-with-lease)(=.*)?$') { $hit = "$t rewrites published history"; break }
                if ($t -eq '--delete' -or $t -eq '-d') { $hit = "$t deletes a remote branch"; break }
                if ($t -match '^-[A-Za-z]+$' -and $t.Contains('f')) { $hit = "$t (force) rewrites published history"; break }
                if ($t -match '^-[A-Za-z]+$' -and $t.Contains('d')) { $hit = "$t (delete) deletes a remote branch"; break }
                if ($t.StartsWith('-')) { continue }
                if ($t.StartsWith('+')) { $hit = "refspec $t forces the update"; break }
                if ($t -match '^:.+') { $hit = "refspec $t deletes the remote branch"; break }
            }
        }
    }
    if (-not $hit) { return $null }
    $reason = "BLOCKED - that command destroys git history: $hit.`n`n" +
              "Git's recovery order is reflog, fsck --lost-found, stash, bundle; these commands remove " +
              "exactly what that order depends on, on every branch. If this rewrite is genuinely wanted, " +
              "$owner runs it by hand."
    return (New-DfDeny 'guard' "history destruction ($hit)" $reason)
}

# ============================================================================ (3) env write
# anchor: env-write  mode: deny  verbs: write-secret
function Test-DfEnvWriteRule([string]$full, [string[]]$exceptions, [string]$owner) {
    if (-not $full) { return $null }
    if (-not (Test-DfSecretName (Get-DfLeaf $full) $script:DfEnvGlobs)) { return $null }
    if (Test-DfException $full $exceptions) { return $null }
    $dir = Get-DfNearestExistingDir $full
    if (-not $dir) { return $null }
    $tracked = Invoke-DfGit $dir @('ls-files', '--error-unmatch', '--', $full)
    if ($tracked.code -eq 0) {
        $reason = "BLOCKED - $full is a secret file that is already tracked by git.`n`n" +
                  "Untrack it first: git rm --cached `"$full`", then add it to .gitignore, then write it. " +
                  "If tracking it is deliberate, $owner registers it in secretExceptions in the brain's doctor.config.json."
        return (New-DfDeny 'guard' "writing a tracked secret file ($full)" $reason)
    }
    $ign = Invoke-DfGit $dir @('check-ignore', '-q', '--', $full)
    switch ($ign.code) {
        0 { return $null }
        1 {
            $reason = "BLOCKED - $full is a secret file and is not ignored by git.`n`n" +
                      "Add it to .gitignore first (that edit and 'git add .gitignore' are allowed), then write it. " +
                      "If committing it is deliberate, $owner registers it in secretExceptions in the brain's doctor.config.json."
            return (New-DfDeny 'guard' "writing a secret file that is not ignored ($full)" $reason)
        }
        default {
            Add-DfAdvisory "secret file outside any git repo ($full)" `
                ("$full looks like a secret file and is outside any git repository, so git cannot say whether it is ignored. " +
                 "Allowed. If a repo is created around it later, ignore it before the first 'git add'.")
            return $null
        }
    }
}

# ============================================================================ (4) path rules
# anchor: frozen-path  mode: deny  verbs: edit-frozen,confirm-canonical
# MAP-01 rides here (owner decision 2026-10-13): a copy that is not canonical and must not be
# edited is a frozen path; the brain's frozenPaths list is the machine-readable column of its
# canonical.md, and this rule refuses the edit.
$script:DfDestructiveHeads = @('rm', 'rmdir', 'del', 'erase', 'rd', 'ri', 'mv', 'move', 'remove-item', 'move-item', 'rename-item', 'clear-content')

function Test-DfProtected([string]$full, [string[]]$protected) {
    foreach ($r in $protected) { if (Test-DfUnder $full $r) { return $r } }
    return $null
}

function New-DfFrozenDeny([string]$what, [string]$root, [string]$owner) {
    $reason = "BLOCKED - $what is inside $root, which the brain lists as FROZEN or TOMBSTONED.`n`n" +
              "Frozen means read, never edit. Tombstoned means retired but still read by a live consumer; " +
              "moving or deleting it breaks that consumer silently. Changing this is $owner's decision: the " +
              "path comes out of frozenPaths / tombstonedPaths in the brain's doctor.config.json first, as a recorded change."
    return (New-DfDeny 'guard' "protected path ($what)" $reason)
}

function Test-DfPathRuleFile([string]$full, [string[]]$protected, [string]$owner, [string[]]$tombstoned = @()) {
    if (-not $full -or $protected.Count -eq 0) { return $null }
    $hit = Test-DfProtected $full $protected
    if (-not $hit) { return $null }
    # VCS-12: TOMBSTONE.md directly inside a tombstoned folder is the record the tombstone claim
    # reads; it is the one write the rule allows there. A frozen folder gets no such file.
    if ((Split-Path -Leaf $full) -ieq 'TOMBSTONE.md') {
        $parent = (Split-Path -Parent $full).TrimEnd('\')
        foreach ($t in $tombstoned) { if ($t -and $parent -ieq $t.TrimEnd('\')) { return $null } }
    }
    return (New-DfFrozenDeny $full $hit $owner)
}

# ============================================================================ (5) manifest before code
# anchor: no-manifest  mode: advise  verbs: lock,unlock
# A source write inside a git repository whose root has no DECISIONS.md asks, once per repository
# per session (DES-02, GATE-04). Docs, config and data files are not source; the brain's
# sourceExtensions list decides, with a built-in default when there is no brain.
$script:DfDefaultSourceExtensions = @('.py', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.rs', '.go', '.cs', '.gd', '.ps1', '.sh', '.html', '.css', '.scss', '.vue', '.svelte', '.lua', '.c', '.h', '.cpp', '.java', '.kt', '.swift')

function Get-DfRepoRoot([string]$full) {
    $dir = Get-DfNearestExistingDir $full
    if (-not $dir) { return $null }
    $r = Invoke-DfGit $dir @('rev-parse', '--show-toplevel')
    if ($r.code -ne 0 -or -not $r.out) { return $null }
    return (ConvertTo-DfFullPath ([string]($r.out | Select-Object -First 1)))
}

# The repository an edit counts against in the edit ledger and on the Stop card, or $null when the
# edit is not a code change: a path outside the root (when a pointer names one), or in no git
# repository. Workaround: the first live Stop card (2026-10-08) named the session scratchpad as a
# repository, because a path with no repository was grouped under its own folder. A scratch file
# has no manifest to cross-check and no documents to update, so it must not raise the card.
function Get-DfLedgerRepo([string]$full, [string]$root) {
    if (-not $full) { return $null }
    if ($root -and -not (Test-DfUnder $full $root)) { return $null }
    return (Get-DfRepoRoot $full)
}

function Test-DfManifestRule([string]$full, [string[]]$sourceExts, [string]$sessionId, [string]$owner, [string[]]$skipUnder) {
    if (-not $full) { return }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    if ($sourceExts -notcontains $ext) { return }
    foreach ($s in $skipUnder) { if ($s -and (Test-DfUnder $full $s)) { return } }
    $root = Get-DfRepoRoot $full
    if (-not $root) { return }
    $manifest = Get-ChildItem -LiteralPath $root -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq 'DECISIONS.md' } | Select-Object -First 1
    if ($manifest) { return }
    $key = 'manifest-' + ([BitConverter]::ToString([Security.Cryptography.SHA1]::HashData([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))) -replace '-', '').Substring(0, 12)
    if (-not (Test-DfFirstTime $sessionId $key)) { return }
    Add-DfAdvisory "no DECISIONS.md in $root" `
        ("DES-02 / GATE-04: a subsystem is not coded until its decisions are locked in DECISIONS.md, and this repository has none at its root ($root). " +
         "Interview $owner, write the manifest, then build; or, if this is a toy or a throwaway, say so and carry on. This notice appears once per repository per session.")
}

# ============================================================================ (6) the read check
# anchor: file-size  mode: advise  verbs: split
# DES-03 (CR-2026-10-15-SPLIT): split by subject, never by size; there is no line count. The one
# real limit is a single Read, so a write that GROWS a source file past the brain's
# readCeilingBytes tells the agent, once per file per session and on the agent's channel only, to
# list the file's subjects from its top-level definitions and to split only if a subject falls out.
# A file whose first lines say it is generated, and readCeilingExempt globs, are skipped. Each
# firing is one INFO line in the hooks log. The 300/500 line rule this replaces fired on every
# write over 500 lines, shrinking ones included, and showed on the owner's screen.

# Before and after sizes of a Write or Edit, in UTF-8 bytes of LF-normalised text, or $null when the
# result cannot be known. Line endings are normalised on both sides because the host's Edit matches
# an LF old_string against a CRLF file and writes CRLF back: matching the raw text missed every
# multi-line Edit of a CRLF file, so the check never fired there (CR-2026-10-15-SPLIT review).
function Get-DfSizeChange([string]$tool, $ti, [string]$full) {
    $lf = { param([string]$s) if ($null -eq $s) { '' } else { $s.Replace("`r`n", "`n") } }
    $utf8 = [Text.Encoding]::UTF8
    $exists = [IO.File]::Exists($full)
    $base = if ($exists) { & $lf ([IO.File]::ReadAllText($full)) } else { '' }
    if ($tool -eq 'Write') { $text = & $lf ([string]$ti.content) }
    elseif ($tool -eq 'Edit') {
        $old = & $lf ([string]$ti.old_string); $new = & $lf ([string]$ti.new_string)
        if (-not $old) {
            if ($base.Length -gt 0) { return $null }   # an empty old_string on a non-empty file: the host refuses it
            $text = $new                                 # an Edit that creates or fills a file
        } else {
            $all = $false; if ($ti.PSObject.Properties['replace_all']) { $all = [bool]$ti.replace_all }
            $i = $base.IndexOf($old, [StringComparison]::Ordinal)
            if ($i -lt 0) { return $null }               # the host will refuse an Edit that does not match
            $text = if ($all) { $base.Replace($old, $new) } else { $base.Substring(0, $i) + $new + $base.Substring($i + $old.Length) }
        }
    }
    else { return $null }
    return @{ before = $utf8.GetByteCount($base); after = $utf8.GetByteCount($text); text = $text }
}

# Glob match on the full path. Only * is a wildcard (** is the same), so a folder named with
# brackets matches literally and a malformed entry cannot throw; / and \ are equal. ${ROOT},
# ${BRAIN} and %USERPROFILE% are expanded by Read-DfBrainConfig. A glob that still fails is logged
# and skipped, never fatal: one bad entry once made every source write throw.
function Test-DfPathGlob([string]$full, [string[]]$globs) {
    $p = $full -replace '\\', '/'
    foreach ($g in @($globs)) {
        if ([string]::IsNullOrWhiteSpace([string]$g)) { continue }
        try {
            $raw = (([string]$g) -replace '\\', '/') -replace '\*\*', '*'
            $pat = [Management.Automation.WildcardPattern]::Escape($raw).Replace('`*', '*')
            if ($p -like $pat -or $p -like "*/$pat") { return $true }
        } catch { Write-DfLog 'ERROR' 'guard' ("readCeilingExempt entry '{0}' skipped: {1}" -f $g, $_.Exception.Message) }
    }
    return $false
}

# A generated file says so in its first lines: '@generated', or a line that carries both
# 'generated' and 'do not edit'. Prose that only mentions generation is not a marker.
$script:DfGeneratedMarker = '(?im)^.{0,12}(@generated\b|.*\bgenerated\b.*\bdo not edit\b|.*\bdo not edit\b.*\bgenerated\b)'

function Test-DfSizeRule([string]$tool, $ti, [string]$full, [string[]]$sourceExts, [int]$ceiling, [string[]]$exempt, [string]$sessionId) {
    # An ADVISE rule must never cost a deny-free call its ledger entry or the Stop card: any error
    # here is logged and the rule is skipped.
    try {
        if (-not $full -or $ceiling -le 0) { return }
        $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
        if ($sourceExts -notcontains $ext) { return }
        if (Test-DfPathGlob $full $exempt) { return }
        $size = Get-DfSizeChange $tool $ti $full
        if ($null -eq $size) { return }
        if ($size.after -le $ceiling) { return }
        if ($size.after -le $size.before) { return }   # a write that does not grow the file is not the moment
        $head = (($size.text -split "`n", 6) | Select-Object -First 5) -join "`n"
        if ($head -match $script:DfGeneratedMarker) { return }
        $key = 'readcheck-' + ([BitConverter]::ToString([Security.Cryptography.SHA1]::HashData([Text.Encoding]::UTF8.GetBytes($full.ToLowerInvariant()))) -replace '-', '').Substring(0, 12)
        if (-not (Test-DfFirstTime $sessionId $key)) { return }
        $kb = [Math]::Round($size.after / 1024)
        Write-DfLog 'INFO' 'guard' ("DES-03 read check: {0} grows to {1} bytes (ceiling {2})" -f $full, $size.after, $ceiling)
        Add-DfAdvisory "read check: $full is past one Read" `
            ("DES-03: this write grows $full to about $kb KB, past one Read (readCeilingBytes $ceiling). There is no size rule and this is not a request to split. " +
             "Before you go on, list the file's subjects from a search of its top-level definitions (do not read it whole for this), and split a part out only if it is a subject of its own: independent and separately tunable. A split-off file names what it uses. This note appears once per file per session.") -AgentOnly
    } catch { Write-DfLog 'ERROR' 'guard' ("rule 6 (read check) skipped for {0}: {1}" -f $full, $_.Exception.Message) }
}

function Test-DfPathRuleShell([string[]]$tokens, $gitCall, [string]$cwd, [string[]]$protected, [string]$owner) {
    if ($protected.Count -eq 0 -or -not $tokens) { return $null }
    $destructive = $false
    $head = $tokens[0].ToLowerInvariant()
    if ($head -in $script:DfDestructiveHeads) { $destructive = $true }
    if ($gitCall -and $gitCall.sub -in @('clean', 'restore', 'rm', 'checkout')) { $destructive = $true }
    if (-not $destructive) { return $null }
    foreach ($t in $tokens) {
        if ($t.StartsWith('-')) { continue }
        $full = ConvertTo-DfFullPath $t $cwd
        $hit = Test-DfProtected $full $protected
        if ($hit) { return (New-DfFrozenDeny $t $hit $owner) }
    }
    return $null
}
