# context.ps1 - resolve WHERE the Doctor looks: pointer -> root, brain, kit; the config contract.
# Dot-sourced by doctor.ps1. Emits no output of its own. Nothing here writes a file.
#
# Every path the Doctor touches is derived from the pointer file, never from a fixed string.
# A check wired to a fixed real path cannot be planted against in a self-test, so it can never
# be proven RED, so it is not evidence of anything.

# ---------------------------------------------------------------- pointer

function Get-PointerPath {
    # DF_POINTER_PATH exists so the self-test can plant a pointer without touching the real one.
    if (-not [string]::IsNullOrWhiteSpace($env:DF_POINTER_PATH)) { return $env:DF_POINTER_PATH }
    return (Join-Path $env:USERPROFILE '.claude\design-first.json')
}

function Read-Pointer {
    # Returns @{ ok; path; data; error }. Never throws: an unreadable pointer is a fact to report.
    $p = Get-PointerPath
    $r = [ordered]@{ ok = $false; path = $p; data = $null; error = '' }
    if (-not (Test-Path -LiteralPath $p)) { $r.error = "pointer not found at $p"; return [PSCustomObject]$r }
    try {
        $d = Get-Content -LiteralPath $p -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch {
        $r.error = "pointer could not be parsed: $($_.Exception.Message)"; return [PSCustomObject]$r
    }
    foreach ($k in 'root', 'brain', 'pluginRoot') {
        if ([string]::IsNullOrWhiteSpace($d.$k)) { $r.error = "pointer has no '$k'"; return [PSCustomObject]$r }
    }
    $r.data = $d; $r.ok = $true
    return [PSCustomObject]$r
}

# ---------------------------------------------------------------- path expansion

function Expand-DfPath {
    # %VAR% (Windows env vars, so %USERPROFILE%), ${ROOT}, ${BRAIN}, ${KIT}. A relative result is
    # brain-relative, or kit-relative under -Kit (the context's base). Returns "" for empty input.
    # A token that cannot be expanded (no brain under -Kit) is left in place on purpose: the caller
    # sees '${' and reports UNKNOWN instead of testing a wrong path.
    param([string] $Path, [Parameter(Mandatory = $true)] $Context)
    if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
    $s = $Path
    if ($Context.root)  { $s = $s.Replace('${ROOT}',  $Context.root) }
    if ($Context.brain) { $s = $s.Replace('${BRAIN}', $Context.brain) }
    if ($Context.kit)   { $s = $s.Replace('${KIT}',   $Context.kit) }
    $s = [Environment]::ExpandEnvironmentVariables($s)
    if ($s.Contains('${')) { return $s }
    $s = $s.Replace('/', '\')
    if (-not [IO.Path]::IsPathRooted($s)) { $s = Join-Path $Context.base $s }
    try { return [IO.Path]::GetFullPath($s).TrimEnd('\') } catch { return $s }
}

function Test-Unexpanded {
    param([string] $Path)
    return ($Path -like '*${*')
}

# ---------------------------------------------------------------- config contract (SPEC 5.3)

# Every key names its reader. A key with no reader is dead config, and dead config is how a
# "fact typed into config" outlives the code that read it. doctor.ps1 reports unknown keys.
# A key added here needs a default in Get-DefaultConfig too; selftest-config.ps1 fails when one is missing.
$script:ConfigReaders = [ordered]@{
    schema                     = 'doctor.ps1 (config_schema; mismatch -> MIGRATE)'
    surveyStrict               = 'report.ps1 (verdict: SURVEY fail findings turn RED when true)'
    maxDepth                   = 'repos.ps1 (Get-RepoFacts: how deep to look for .git)'
    parallelGit                = 'repos.ps1 (Get-RepoFacts: how many repositories are read at a time; 1 = one after another)'
    excludePathParts           = 'repos.ps1 (Get-RepoFacts: skip repos whose path contains a part)'
    archivedPathParts          = 'repos.ps1 (Get-RepoFacts: archived repos are listed, not judged)'
    ownerRemotePatterns        = 'repos.ps1 (Get-RepoFacts: a remote matching none is FOREIGN)'
    frozenPaths                = 'repos.ps1 (frozenDirty) / enforcement.ps1 (soft_deny count) / hooks/guard.ps1 (path deny)'
    tombstonedPaths            = 'repos.ps1 (flag) / hooks/guard.ps1 (path deny)'
    unversionedMaxDepth        = 'repos.ps1 (Get-UnversionedFolders)'
    unversionedIgnorePathParts = 'repos.ps1 (Get-UnversionedFolders)'
    secretExceptions           = 'repos.ps1 (Get-TrackedSecrets) / hooks/guard.ps1 (staging and write rules)'
    acceptedExceptions         = 'doctor.ps1 (Test-Accepted: (path, kind) pairs reported, not counted)'
    entryPointSnapshots        = 'doctor.ps1 (live vs snapshot, CRLF-insensitive)'
    enforcement                = 'enforcement.ps1 (fenceLogStaleDays only)'
    categories                 = 'survey.ps1 (Get-CategoryFindings: folders, since; a repository outside a category folder)'
    lawClaim                   = 'tools/vcs/law-claim.ps1 (the commit check: extraFiles, trailer, minReason)'
    # Read by the hooks, not by the Doctor. They are listed so the dead-key check knows they are
    # live: before this, every brain that carried them got three "nothing reads it" warnings.
    splitLines                 = 'hooks/guard.ps1 (rule 6, file-size: the line count that asks)'
    sourceExtensions           = 'hooks/guard.ps1 (rules 5 and 6) / hooks/stop.ps1 (what counts as source)'
    stopDocs                   = 'hooks/stop.ps1 (file names that count as documents on the Stop card)'
    stopFromGit                = 'hooks/stop.ps1 (true: the turn''s changes are read from git; false: Edit and Write calls only)'
    forbidScheduling           = 'hooks/guard.ps1 (rule 8, no-schedule: true refuses scheduled tasks, cron, Run keys, services, the Startup folder)'
    contentRules               = 'hooks/guard.ps1 (rule 9, content-rule: an edit in scope that adds a match of the pattern is refused)'
}

# Keys the previous Doctor had that are now derived from the pointer or simply dead (SPEC 5.3).
$script:RemovedConfigKeys = @(
    'root', 'stateDir', 'recordsDir', 'gitTimeoutSeconds', 'staleStateDays', '_retiredUnversionedWatchlist'
)
$script:RemovedEnforcementKeys = @('settingsPath', 'fenceLogPath')

function Get-DefaultConfig {
    return [PSCustomObject]@{
        schema                     = 1
        surveyStrict               = $false
        maxDepth                   = 3
        parallelGit                = 8
        excludePathParts           = @('\node_modules\', '\.claude\worktrees\', '\target\', '\.godot\')
        archivedPathParts          = @('\_archive\', '\_backups\')
        ownerRemotePatterns        = @()
        frozenPaths                = @()
        tombstonedPaths            = @()
        unversionedMaxDepth        = 3
        unversionedIgnorePathParts = @('\_archive\', '\_backups\', '\node_modules\', '\__pycache__\', '\.venv\')
        secretExceptions           = @()
        acceptedExceptions         = @()
        entryPointSnapshots        = @()
        enforcement                = [PSCustomObject]@{ fenceLogStaleDays = 30 }
        categories                 = [PSCustomObject]@{ folders = @(); since = '' }
        lawClaim                   = [PSCustomObject]@{ extraFiles = @(); trailer = 'No-Claim'; minReason = 10 }
        splitLines                 = 500
        sourceExtensions           = @()
        stopDocs                   = @()
        stopFromGit                = $true
        forbidScheduling           = $false
        contentRules               = @()
    }
}

function Read-DoctorConfig {
    # Returns @{ ok; path; raw; cfg; deadKeys; error }. cfg has every known key (defaults filled),
    # with path lists already expanded through the context. Never throws.
    param([string] $Path, [Parameter(Mandatory = $true)] $Context)
    $r = [ordered]@{ ok = $false; path = $Path; raw = $null; cfg = (Get-DefaultConfig); deadKeys = @(); error = '' }
    if (-not (Test-Path -LiteralPath $Path)) { $r.error = "config not found at $Path"; return [PSCustomObject]$r }
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch {
        $r.error = "config could not be parsed: $($_.Exception.Message)"; return [PSCustomObject]$r
    }
    $r.raw = $raw
    $cfg = $r.cfg
    foreach ($prop in $raw.PSObject.Properties) {
        $k = $prop.Name
        if ($k.StartsWith('_')) {
            if ($script:RemovedConfigKeys -contains $k) { $r.deadKeys += $k }
            continue
        }
        if ($script:ConfigReaders.Contains($k)) {
            if ($k -eq 'enforcement') {
                if ($null -ne $prop.Value) {
                    foreach ($ep in $prop.Value.PSObject.Properties) {
                        if ($ep.Name -eq 'fenceLogStaleDays') { $cfg.enforcement.fenceLogStaleDays = [int]$ep.Value }
                        elseif ($script:RemovedEnforcementKeys -contains $ep.Name) { $r.deadKeys += "enforcement.$($ep.Name)" }
                        elseif (-not $ep.Name.StartsWith('_')) { $r.deadKeys += "enforcement.$($ep.Name)" }
                    }
                }
            } elseif ($null -eq $cfg.PSObject.Properties[$k]) {
                # A reader key with no default must still load. Assigning to a property the default
                # object lacks throws, and a crash here exits 1, which reads as RED. 0.1.17 shipped
                # two such keys; the self-test now proves the two tables agree, and this keeps the
                # "never throws" promise if they ever disagree again.
                $cfg | Add-Member -NotePropertyName $k -NotePropertyValue $prop.Value
            } else {
                $cfg.$k = $prop.Value
            }
        } else {
            $r.deadKeys += $k
        }
    }
    # DECISIONS 3.6: every key names its reader. When the file carries a _readers map, a live key
    # missing from it is reported too; the map is documentation that must not rot either.
    $readersProp = $raw.PSObject.Properties['_readers']
    if ($null -ne $readersProp -and $null -ne $readersProp.Value) {
        foreach ($prop in $raw.PSObject.Properties) {
            if ($prop.Name.StartsWith('_')) { continue }
            if ($null -eq $readersProp.Value.PSObject.Properties[$prop.Name]) { $r.deadKeys += ($prop.Name + ' (no _reader entry)') }
        }
    }
    # Normalise list-valued keys so a single string or null never breaks a foreach.
    foreach ($lk in 'excludePathParts', 'archivedPathParts', 'ownerRemotePatterns', 'frozenPaths', 'tombstonedPaths',
                    'unversionedIgnorePathParts', 'secretExceptions', 'acceptedExceptions', 'entryPointSnapshots') {
        if ($null -eq $cfg.$lk) { $cfg.$lk = @() } else { $cfg.$lk = @($cfg.$lk) }
    }
    # Path lists are absolute or ${ROOT}-relative (SPEC 5.3). Expand them once, here, so no reader
    # has to know the rule. A bare relative path means root-relative for these three keys.
    $rootCtx = [PSCustomObject]@{ root = $Context.root; brain = $Context.brain; kit = $Context.kit; base = $Context.root }
    foreach ($pk in 'frozenPaths', 'tombstonedPaths', 'secretExceptions') {
        $cfg.$pk = @($cfg.$pk | ForEach-Object { Expand-DfPath -Path ([string]$_) -Context $rootCtx })
    }
    $cfg.maxDepth = [int]$cfg.maxDepth
    $pg = 0; if (-not [int]::TryParse([string]$cfg.parallelGit, [ref]$pg) -or $pg -lt 1) { $pg = 1 }
    $cfg.parallelGit = $pg
    $cfg.unversionedMaxDepth = [int]$cfg.unversionedMaxDepth
    $cfg.surveyStrict = [bool]$cfg.surveyStrict
    $r.ok = $true
    return [PSCustomObject]$r
}

# ---------------------------------------------------------------- derived values (SPEC 5.3)

function Get-DerivedPaths {
    # No longer config keys: they follow from the pointer. fenceLogPath is fixed by the fence hook.
    param([Parameter(Mandatory = $true)] $Context)
    $brainOrKit = if ($Context.brain) { $Context.brain } else { $Context.kit }
    # Root settings are an adopter's files; under -Kit there is no adopter, so none are expected.
    $settings = @()
    if ($Context.brain) {
        $settings = @((Join-Path $Context.root '.claude\settings.json'), (Join-Path $Context.root '.claude\settings.local.json'))
    }
    return [PSCustomObject]@{
        stateDir      = (Join-Path $brainOrKit 'state')
        recordsDir    = (Join-Path $brainOrKit 'records')
        settingsPaths = $settings
        fenceLogPath  = (Join-Path $env:USERPROFILE '.claude\fence-log.txt')
        hooksJsonPath = (Join-Path $Context.pluginRoot 'hooks\hooks.json')
    }
}
