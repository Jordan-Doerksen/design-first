# selftest-config.ps1 - the config contract cases of the Doctor self-test (SPEC 5.3).
# Dot-sourced by selftest.ps1 after run A. It shares Ok, Bad, the Assert-* helpers, WJ, NewDir,
# $here, $T, $root, $brain, $kit and $a (run A's result). It is its own file because selftest.ps1
# is at the split line.
#
# Two tables in context.ps1 must agree: $script:ConfigReaders (the keys that are live) and
# Get-DefaultConfig (the object a config file is read onto). 0.1.17 added two keys to the first
# and not to the second. Every brain that set one crashed in config load with exit 1, which reads
# as RED when the truth is could-not-look. The fixture carried both keys, so run A did fail; these
# cases name the cause in one line, and catch a key the fixture does not carry.

# ---- run A: what the report prints for dead and live keys
Assert-HasNot 'A: config load did not crash on a key the fixture sets' $a.out 'cannot be found on this object'
Assert-Has 'A: dead config key reported' $a.out 'dead config key: gitTimeoutSeconds'
Assert-Has 'A: the retired splitLines key is reported, not read (CR-2026-10-15-SPLIT)' $a.out 'dead config key: splitLines'
Assert-Has 'A: the splitLines finding names its successor' $a.out 'the read check is readCeilingBytes'
foreach ($live in 'readCeilingBytes', 'readCeilingExempt', 'sourceExtensions', 'stopDocs', 'stopFromGit', 'forbidScheduling', 'contentRules', 'lawClaim', 'categories') { Assert-HasNot "A: $live has a reader outside the Doctor, not a dead key" $a.out "dead config key: $live" }

# ---- the two tables, read in this process. The child scope keeps context.ps1's functions out of selftest.ps1.
& {
    . (Join-Path $here 'context.ps1')
    $default = Get-DefaultConfig
    $defaultKeys = @($default.PSObject.Properties | ForEach-Object { $_.Name })
    $noDefault = @($script:ConfigReaders.Keys | Where-Object { $defaultKeys -notcontains $_ })
    $noReader = @($defaultKeys | Where-Object { -not $script:ConfigReaders.Contains($_) })
    if ($noDefault.Count -eq 0) { Ok ("config: every reader key has a default ({0} keys)" -f $script:ConfigReaders.Count) } else { Bad 'config: every reader key has a default' ("in ConfigReaders, not in Get-DefaultConfig: {0}" -f ($noDefault -join ', ')) }
    if ($noReader.Count -eq 0) { Ok 'config: every default key has a reader' } else { Bad 'config: every default key has a reader' ("in Get-DefaultConfig, not in ConfigReaders: {0}" -f ($noReader -join ', ')) }

    $dir = NewDir (Join-Path $T 'config-cases')
    $ctxT = [PSCustomObject]@{ root = $root; brain = $brain; kit = $kit; base = $brain }

    # A config that sets every live key, the two hook switches turned on as an adopter would.
    $all = [ordered]@{}
    foreach ($k in $script:ConfigReaders.Keys) { $all[$k] = $default.$k }
    $all.forbidScheduling = $true
    $all.contentRules = @([ordered]@{ id = 'T-RULE'; under = @('${ROOT}/scan'); pattern = 'planted_call\(' })
    $allPath = Join-Path $dir 'all-keys.json'; WJ $allPath $all
    $r = $null; $threw = ''
    try { $r = Read-DoctorConfig -Path $allPath -Context $ctxT } catch { $threw = $_.Exception.Message }
    if (-not $threw -and $r.ok) { Ok 'config: a file that sets every live key loads' } else { Bad 'config: a file that sets every live key loads' ("threw: '{0}' error: '{1}'" -f $threw, $r.error) }
    if ($r -and @($r.deadKeys).Count -eq 0) { Ok 'config: no live key is reported dead' } else { Bad 'config: no live key is reported dead' (@($r.deadKeys) -join ', ') }
    if ($r -and $r.cfg.forbidScheduling -eq $true) { Ok 'config: forbidScheduling true is read as set' } else { Bad 'config: forbidScheduling' ([string]$r.cfg.forbidScheduling) }
    if ($r -and @($r.cfg.contentRules).Count -eq 1 -and @($r.cfg.contentRules)[0].id -eq 'T-RULE') { Ok 'config: contentRules is read as set' } else { Bad 'config: contentRules' ("{0} rule(s)" -f @($r.cfg.contentRules).Count) }

    # A file that sets neither switch reads them as off, never as missing.
    $barePath = Join-Path $dir 'bare.json'; WJ $barePath ([ordered]@{ schema = 1 })
    $b0 = Read-DoctorConfig -Path $barePath -Context $ctxT
    if ($b0.ok -and $b0.cfg.forbidScheduling -eq $false -and @($b0.cfg.contentRules).Count -eq 0) { Ok 'config: both switches default to off' } else { Bad 'config: switch defaults' ("forbidScheduling={0} contentRules={1}" -f $b0.cfg.forbidScheduling, @($b0.cfg.contentRules).Count) }

    # The kit's own template sets only live keys, each with its _readers entry: adopt copies it into
    # every new brain, so a key the hooks read and this Doctor does not know is reported dead there
    # (CR-2026-10-15-GAPS D5 added stopBudgetSeconds to the template, both tables and _readers).
    $tpl = Read-DoctorConfig -Path (Join-Path $here '..\..\templates\doctor.config.json') -Context $ctxT   # the real kit's template; $kit is the fixture kit
    if ($tpl.ok -and @($tpl.deadKeys).Count -eq 0) { Ok 'config: the kit template sets no dead key' } else { Bad 'config: the kit template sets no dead key' ("ok={0} error='{1}' dead: {2}" -f $tpl.ok, $tpl.error, (@($tpl.deadKeys) -join ', ')) }

    # Planted: a live key with no default. The read must not throw (the comment on Read-DoctorConfig says so).
    $script:ConfigReaders['plantedNoDefault'] = 'selftest-config.ps1 (planted: a reader key with no default)'
    try {
        $plantPath = Join-Path $dir 'planted.json'; WJ $plantPath ([ordered]@{ schema = 1; plantedNoDefault = @('x', 'y') })
        $p = $null; $threw = ''
        try { $p = Read-DoctorConfig -Path $plantPath -Context $ctxT } catch { $threw = $_.Exception.Message }
        if (-not $threw -and $p.ok -and @($p.cfg.plantedNoDefault).Count -eq 2) { Ok 'config: a live key with no default loads, it does not throw' } else { Bad 'config: a live key with no default loads' ("threw: '{0}'" -f $threw) }
    } finally { $script:ConfigReaders.Remove('plantedNoDefault') }
}
