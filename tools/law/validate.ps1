# validate.ps1 - clause and mechanism validation for build-law.ps1. Dot-sourced; not a CLI.
# Expects $KitRoot, $BrainRoot, $Problems (List[string]) and $Warnings (List[string]) in the caller's scope.

$script:GradeOrder  = @('DENY', 'HOOK', 'ADVISE', 'GATE', 'BUILDABLE', 'OWNER', 'HONOUR')
$script:MechKinds   = @('permission-rule', 'hook', 'doctor-claim', 'tool', 'planned')
$script:AnchorRx    = '^\s*#\s*anchor:\s*(?<name>\S+)\s+mode:\s*(?<mode>deny|advise|gate)\s+verbs:\s*(?<verbs>\S+)'
$script:ClaimIdRx   = '^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$'
$script:SkipHooks   = $env:DF_SKIP_HOOK_FILES -eq '1'
$script:SkipOwners  = $env:DF_SKIP_OWNER_FILES -eq '1'
$script:ClaimCache  = $null

function Get-Prop($obj, [string] $name) {
    if ($null -ne $obj -and $null -ne $obj.PSObject.Properties[$name]) { return $obj.$name }
    return $null
}

function Read-JsonFile([string] $Path) {
    $raw = [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
    return ($raw | ConvertFrom-Json -Depth 32)
}

function Add-Problem([string] $Id, [string] $Text) { [void] $Problems.Add("FAIL $Id`: $Text") }
function Add-Warning([string] $Id, [string] $Text) { [void] $Warnings.Add("WARN $Id`: $Text") }

# A referenced file is required to exist. Mechanism files from a chunk that has not landed may be
# downgraded to a warning with DF_SKIP_HOOK_FILES=1; owning files with DF_SKIP_OWNER_FILES=1.
function Test-RequiredFile([string] $Id, [string] $Path, [string] $What, [bool] $Skippable) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return $true }
    if ($Skippable) { Add-Warning $Id "$What not found yet, skipped: $Path"; return $false }
    Add-Problem $Id "$What does not exist: $Path"
    return $false
}

function Test-ClauseShape($c, $groupNames) {
    $id = $c.id
    if ($id -notmatch '^[A-Z]{3,5}-\d{2}$') { Add-Problem $id 'id must match ^[A-Z]{3,5}-\d{2}$' }
    if ($groupNames -notcontains $c.group) { Add-Problem $id "group '$($c.group)' is not in groups" }
    if ($id -notmatch "^$([regex]::Escape([string]$c.group))-") { Add-Problem $id "id prefix does not match group '$($c.group)'" }
    if ([string]$c.verb -notmatch '^[a-z]+(-[a-z]+)*$') { Add-Problem $id 'verb must be one lowercase word or a hyphenated phrase' }
    if ([string]::IsNullOrWhiteSpace($c.rule)) { Add-Problem $id 'rule is empty' }
    if ([string]$c.owner -notmatch '^(kit|brain):[^\s\\]+\.md$') { Add-Problem $id "owner must be kit:<path>.md or brain:<path>.md, got '$($c.owner)'" }
    if ($script:GradeOrder -notcontains $c.grade) { Add-Problem $id "grade '$($c.grade)' is not a defined grade" }
    if ([string]$c.since -notmatch '^\d{4}-\d{2}-\d{2}$') { Add-Problem $id 'since must be an ISO date' }
}

# A clause never carries a value. Hard fails are unambiguous; bare digits and number words warn.
function Test-RuleValues($c) {
    $id = $c.id; $r = [string]$c.rule
    if ($r -match '#[0-9A-Fa-f]{3,8}\b') { Add-Problem $id 'rule carries a hex value' }
    if ($r -match '\b\d+(\.\d+)?\s?(px|em|rem|pt|ms|s|%|days?|hours?|minutes?|seconds?|lines?|files?|repos?|commits?)\b') { Add-Problem $id 'rule carries a number with a unit' }
    if ($r -match '\bline \d+') { Add-Problem $id 'rule carries a line number' }
    if ($r -match '\d{4}-\d{2}-\d{2}') { Add-Problem $id 'rule carries a date' }
    if ($r -match '[A-Za-z]:[\\/]|\\\\|\b[\w.-]+[\\/][\w.-]+[\\/]|[\w-]+/[\w-]+\.\w+') { Add-Problem $id 'rule carries a path' }
    if ($r -match '\d') { Add-Warning $id 'rule carries a bare digit; confirm it is not a value' }
    if ($r -match '\b(two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\b') { Add-Warning $id 'rule carries a number in words; confirm it is not a threshold' }
    if (($r -split '(?<=[.!?])\s+(?=[A-Z])').Count -gt 1) { Add-Warning $id 'rule looks like more than one sentence' }
}

# SKIN-07 (build-law.ps1#no-count): a count in a rule goes stale silently. A number before a
# plural noun, or any number of two or more digits, fails; a bare single digit keeps its warning.
function Test-RuleCount($c) {
    $id = $c.id; $r = [string]$c.rule
    if ($r -match '\b\d+\s+[A-Za-z]+(s|es)\b') { Add-Problem $id "rule carries a count ('$($Matches[0])'); read the catalogue for the current number instead (SKIN-07)" }
    elseif ($r -match '\b\d{2,}\b') { Add-Problem $id "rule carries a number of two or more digits ('$($Matches[0])'); a count in a law goes stale silently (SKIN-07)" }
}

# PRIN-05 (build-law.ps1#state-once): one subject, one file. The "### ID" headings of every law
# file are indexed once; a clause must have its heading in exactly one file, and that file must be
# its owner. Kit law files: instructions/, workflows/, lessons/. Brain law files, when -BrainRoot is
# given: the brain's instructions/ and its top-level .md files.
$script:HeadingIndex = $null
function Get-HeadingIndex() {
    if ($null -ne $script:HeadingIndex) { return $script:HeadingIndex }
    $idx = @{}
    $dirs = @('instructions', 'workflows', 'lessons' | ForEach-Object { @{ base = $KitRoot; ns = 'kit'; dir = $_ } })
    if ($BrainRoot) { $dirs += @{ base = $BrainRoot; ns = 'brain'; dir = 'instructions' }; $dirs += @{ base = $BrainRoot; ns = 'brain'; dir = '.' } }
    foreach ($d in $dirs) {
        $full = Join-Path $d.base $d.dir
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
        foreach ($f in (Get-ChildItem -LiteralPath $full -Filter *.md -File | Sort-Object Name)) {
            $rel = if ($d.dir -eq '.') { $f.Name } else { "$($d.dir)/$($f.Name)" }
            $key = "$($d.ns):$rel"
            foreach ($line in [IO.File]::ReadAllLines($f.FullName)) {
                if ($line -match '^###\s+([A-Z]{3,5}-\d{2})\b') {
                    $hid = $Matches[1]
                    if (-not $idx.ContainsKey($hid)) { $idx[$hid] = [Collections.Generic.List[string]]::new() }
                    if (-not $idx[$hid].Contains($key)) { $idx[$hid].Add($key) }
                }
            }
        }
    }
    $script:HeadingIndex = $idx
    return $idx
}
function Test-HeadingOnce($c) {
    $id = $c.id; $owner = [string]$c.owner
    if ($owner -match '^brain:' -and -not $BrainRoot) { return }   # already warned by Test-OwnerFile
    $idx = Get-HeadingIndex
    # Workaround: an empty @() emitted from an if-expression collapses to $null, and strict mode
    # then refuses .Count on it. Start from an array and fill it.
    $where = @()
    if ($idx.ContainsKey($id)) { $where = @($idx[$id]) }
    # A brain file is the owner's: a heading missing or misplaced there warns, a duplicate fails
    # everywhere. The kit's own files are held to the full rule.
    $soft = ($owner -match '^brain:') -or $script:SkipOwners
    if ($where.Count -eq 0) {
        $m = "no '### $id' heading in any law file; the owning file $owner must carry it (PRIN-05)"
        if ($soft) { Add-Warning $id $m } else { Add-Problem $id $m }
        return
    }
    if ($where.Count -gt 1) { Add-Problem $id "'### $id' heading is in more than one law file: $($where -join ', ') (PRIN-05: one subject, one file)"; return }
    if ($where[0] -ne ($owner -replace '\\', '/')) {
        $m = "'### $id' heading is in $($where[0]) but the owner is $owner (PRIN-05)"
        if ($soft) { Add-Warning $id $m } else { Add-Problem $id $m }
    }
}

function Test-OwnerFile($c) {
    $id = $c.id
    if ([string]$c.owner -notmatch '^(?<ns>kit|brain):(?<path>.+)$') { return }
    $ns = $Matches.ns; $rel = $Matches.path
    if ($ns -eq 'kit') { [void](Test-RequiredFile $id (Join-Path $KitRoot $rel) 'owning file' $script:SkipOwners); return }
    if ($BrainRoot) { [void](Test-RequiredFile $id (Join-Path $BrainRoot $rel) 'owning file (brain)' $script:SkipOwners) }
    else { Add-Warning $id "owner '$($c.owner)' not checked: no -BrainRoot given" }
}

function Resolve-RefFile([string] $rel, [bool] $fromOverlay) {
    $p = Join-Path $KitRoot $rel
    if (Test-Path -LiteralPath $p -PathType Leaf) { return $p }
    if ($fromOverlay -and $BrainRoot) {
        $b = Join-Path $BrainRoot $rel
        if (Test-Path -LiteralPath $b -PathType Leaf) { return $b }
    }
    return $p
}

function Get-ClaimIds() {
    if ($null -ne $script:ClaimCache) { return $script:ClaimCache }
    $ids = [Collections.Generic.HashSet[string]]::new()
    $files = @((Join-Path $KitRoot 'tools/doctor/claims.json'))
    if ($BrainRoot) { $files += (Join-Path $BrainRoot 'claims.json') }
    $script:ClaimFilesSeen = 0
    foreach ($f in $files) {
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
        $script:ClaimFilesSeen++
        foreach ($cl in @(Get-Prop (Read-JsonFile $f) 'claims')) { $cid = Get-Prop $cl 'id'; if ($cid) { [void] $ids.Add([string]$cid) } }
    }
    $script:ClaimCache = $ids
    return $ids
}

# The anchor is looked for in the referenced script first, then in its dot-sourced lib/*.ps1
# siblings (a script split by domain keeps its public ref). Exactly one declaration must exist.
# Mode <-> grade is mechanical: a hook anchor declares deny (HOOK) or advise (ADVISE); a tool
# anchor declares gate (GATE). A tool ref without an anchor, or whose anchor does not name the
# clause verb, fails generation, so a GATE grade cannot be claimed on a fictitious refusal.
function Test-Anchor($c, [string] $file, [string] $anchor, [string] $kind) {
    $id = $c.id
    $want = switch ($kind) { 'tool' { 'gate' } default { if ($c.grade -eq 'HOOK') { 'deny' } else { 'advise' } } }
    $files = @($file)
    $lib = Join-Path (Split-Path -Parent $file) 'lib'
    if (Test-Path -LiteralPath $lib -PathType Container) { $files += @(Get-ChildItem -LiteralPath $lib -Filter *.ps1 | Sort-Object Name | ForEach-Object { $_.FullName }) }
    $hits = @()
    foreach ($f in $files) {
        foreach ($line in [IO.File]::ReadAllLines($f)) {
            if ($line -match $script:AnchorRx -and $Matches.name -eq $anchor) { $hits += [pscustomobject]@{ file = $f; mode = $Matches.mode; verbs = $Matches.verbs } }
        }
    }
    if ($hits.Count -gt 1) { Add-Problem $id "anchor '$anchor' is declared more than once: $(($hits | ForEach-Object { $_.file }) -join ', ')"; return }
    if ($hits.Count -eq 1) {
        $h = $hits[0]
        if (($h.verbs -split ',') -notcontains $c.verb) { Add-Problem $id "anchor '$anchor' verbs ($($h.verbs)) do not include clause verb '$($c.verb)'" }
        if ($h.mode -ne $want) { Add-Problem $id "anchor '$anchor' declares mode $($h.mode) but grade $($c.grade) needs $want" }
        return
    }
    $msg = "anchor '$anchor' not found in $file or its lib/ (expected a line '# anchor: $anchor  mode: $want  verbs: <a,b>')"
    if ($script:SkipHooks) { Add-Warning $id "$msg, skipped" } else { Add-Problem $id $msg }
}

function Test-JsonPath($c, [string] $file, [string] $jsonPath) {
    $id = $c.id; $node = Read-JsonFile $file
    foreach ($seg in ($jsonPath -split '\.')) {
        $node = Get-Prop $node $seg
        if ($null -eq $node) { Add-Problem $id "json path '$jsonPath' not found in $file"; return $null }
    }
    $leaf = ($jsonPath -split '\.')[-1]
    if ($c.grade -eq 'DENY' -and $leaf -ne 'deny') { Add-Problem $id "DENY needs a permission rule under 'deny', got '$leaf'" }
    if ($c.grade -eq 'GATE' -and $leaf -ne 'ask') { Add-Problem $id "GATE via permission rule needs a rule under 'ask', got '$leaf'" }
    # Coverage rule: a shell rule ships as Bash(...) and PowerShell(...) twins.
    $rules = @($node | ForEach-Object { [string]$_ })
    foreach ($rule in $rules) {
        if ($rule -match '^(?<tool>Bash|PowerShell)\((?<body>.*)\)$') {
            $twin = if ($Matches.tool -eq 'Bash') { "PowerShell($($Matches.body))" } else { "Bash($($Matches.body))" }
            if ($rules -notcontains $twin) { Add-Problem $id "coverage: '$rule' has no twin '$twin' in $jsonPath" }
        }
    }
    return $node
}

function Test-Enforcement($c) {
    $id = $c.id; $g = $c.grade; $e = $c.enforcedBy
    if ($g -in @('OWNER', 'HONOUR')) {
        if ($null -ne $e) { Add-Problem $id "grade $g carries no enforcedBy" }
        return
    }
    if ($null -eq $e) { Add-Problem $id "grade $g needs an enforcedBy"; return }
    $kind = [string](Get-Prop $e 'kind'); $ref = [string](Get-Prop $e 'ref')
    if ($script:MechKinds -notcontains $kind) { Add-Problem $id "enforcedBy.kind '$kind' is not one of $($script:MechKinds -join ', ')"; return }
    if ([string]::IsNullOrWhiteSpace($ref)) { Add-Problem $id 'enforcedBy.ref is empty'; return }
    $needKind = switch ($g) { 'DENY' { @('permission-rule') } 'HOOK' { @('hook') } 'ADVISE' { @('hook') }
        'GATE' { @('permission-rule', 'doctor-claim', 'tool') } 'BUILDABLE' { @('planned') } }
    if ($needKind -notcontains $kind) { Add-Problem $id "grade $g cannot be enforced by kind '$kind' (allowed: $($needKind -join ', '))"; return }
    if ($kind -eq 'planned') { return }   # a CR reference; not resolved against the disk
    if ($kind -eq 'doctor-claim') {
        if ($ref -notmatch $script:ClaimIdRx) { Add-Problem $id "'$ref' is not a claim id"; return }
        $ids = Get-ClaimIds
        if ($script:ClaimFilesSeen -eq 0) {
            $msg = "no claims file found (tools/doctor/claims.json$(if ($BrainRoot) { ' or brain claims.json' })) to resolve '$ref'"
            if ($script:SkipHooks) { Add-Warning $id "$msg, skipped" } else { Add-Problem $id $msg }
            return
        }
        if (-not $ids.Contains($ref)) { Add-Problem $id "claim id '$ref' is not defined in any claims file" }
        return
    }
    $file, $frag = $ref -split '#', 2
    $path = Resolve-RefFile $file ($c.source -eq 'overlay')
    if (-not (Test-RequiredFile $id $path "mechanism file for $kind" $script:SkipHooks)) { return }
    switch ($kind) {
        'hook'            { if (-not $frag) { Add-Problem $id 'a hook ref needs #<anchor>' } else { Test-Anchor $c $path $frag $kind } }
        'permission-rule' { if (-not $frag) { Add-Problem $id 'a permission-rule ref needs #<json.path>' } else { [void](Test-JsonPath $c $path $frag) } }
        'tool'            { if (-not $frag) { Add-Problem $id 'a tool ref needs #<anchor> (a tool refusal is a real line in the script, not a file name)' } else { Test-Anchor $c $path $frag $kind } }
    }
}
