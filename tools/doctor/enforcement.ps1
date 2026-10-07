# enforcement.ps1 - re-derive what is ACTUALLY wired, from the machine (SURVEY band). READ-ONLY.
# Reads the kit's hooks/hooks.json (where the hooks are registered), the root settings files
# (where the deny/ask rules live) and the fence log. It overrides whatever any document claims.
#
# Config read here: enforcement.fenceLogStaleDays (SPEC 5.3). Everything else is derived.

function Read-JsonFile {
    # The out-parameter is not called $Error: that is PowerShell's automatic error list.
    param([string] $Path, [ref] $Problem)
    try { return (Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop) }
    catch { $Problem.Value = $_.Exception.Message; return $null }
}

function Get-EnforcementFacts {
    param(
        [Parameter(Mandatory = $true)] $Config,
        [Parameter(Mandatory = $true)] $Derived,
        [Parameter(Mandatory = $true)] $Context
    )
    $result = [PSCustomObject]@{
        hooksJsonPath   = $Derived.hooksJsonPath
        hooksJsonExists = (Test-Path -LiteralPath $Derived.hooksJsonPath -PathType Leaf)
        hooks           = @()
        settingsPaths   = @($Derived.settingsPaths)
        settingsFound   = @()
        denyRules       = 0
        askRules        = 0
        softDenyTotal   = 0
        softDenyFrozen  = 0
        fenceLogPath    = $Derived.fenceLogPath
        fenceLogExists  = $false
        fenceTrips      = 0
        fenceLastTrip   = ''
        fenceStaleDays  = $null
        couldNotLook    = @()
        findings        = @()
    }

    # --- hooks, as registered by the plugin
    if ($result.hooksJsonExists) {
        $err = ''
        $doc = Read-JsonFile -Path $Derived.hooksJsonPath -Problem ([ref]$err)
        if ($null -eq $doc) {
            $result.couldNotLook += "hooks.json could not be parsed: $err"
        } elseif ($doc.hooks) {
            foreach ($ev in $doc.hooks.PSObject.Properties) {
                foreach ($entry in @($ev.Value)) {
                    foreach ($h in @($entry.hooks)) {
                        $text = if ($h.args) { ($h.args -join ' ') } else { [string]$h.command }
                        $text = $text.Replace('${CLAUDE_PLUGIN_ROOT}', $Context.pluginRoot)
                        $script = ''
                        if ($text -match '((?:[A-Za-z]:)?[^"'' ]+\.ps1)') { $script = $Matches[1].Replace('/', '\') }
                        $exists = ($script -ne '' -and (Test-Path -LiteralPath $script -PathType Leaf))
                        $result.hooks += [PSCustomObject]@{
                            event = $ev.Name; matcher = [string]$entry.matcher; script = $script; exists = $exists
                            shell = [string]$h.shell; form = $(if ($h.args) { 'args' } else { 'command' })
                        }
                        if ($script -ne '' -and -not $exists) {
                            $result.findings += [PSCustomObject]@{ severity = 'fail'; kind = 'hookMissing'; path = $script
                                message = ("hook REGISTERED BUT MISSING: {0} ({1}) - hooks.json calls a file that is not there" -f $script, $ev.Name) }
                        }
                    }
                }
            }
        }
    } else {
        $result.findings += [PSCustomObject]@{ severity = 'fail'; kind = 'hooksJsonMissing'; path = $Derived.hooksJsonPath
            message = ("no hooks.json at {0} - no hook is registered; the plugin root in the pointer may be wrong" -f $Derived.hooksJsonPath) }
    }

    # --- root settings: deny / ask rules (SPEC 5.8) and soft_deny vs frozenPaths
    foreach ($sp in $result.settingsPaths) {
        if (-not (Test-Path -LiteralPath $sp -PathType Leaf)) { continue }
        $err = ''
        $s = Read-JsonFile -Path $sp -Problem ([ref]$err)
        if ($null -eq $s) { $result.couldNotLook += "settings could not be parsed: $sp ($err)"; continue }
        $result.settingsFound += $sp
        if ($s.permissions) {
            $result.denyRules += @($s.permissions.deny).Count
            $result.askRules  += @($s.permissions.ask).Count
        }
        if ($s.autoMode -and $s.autoMode.soft_deny) {
            foreach ($d in @($s.autoMode.soft_deny)) {
                if ($d -isnot [string]) { continue }
                $result.softDenyTotal++
                # Counted against the brain's frozenPaths, never against a fixed folder name.
                foreach ($fp in $Config.frozenPaths) {
                    $leaf = Split-Path -Leaf $fp
                    if ($leaf -and $d -like ('*' + $leaf + '*')) { $result.softDenyFrozen++; break }
                }
            }
        }
    }
    if ($result.settingsPaths.Count -gt 0 -and $result.settingsFound.Count -eq 0) {
        $result.findings += [PSCustomObject]@{ severity = 'fail'; kind = 'rootSettingsMissing'; path = $result.settingsPaths[0]
            message = ("no root settings: neither {0} nor settings.local.json exists - the deny/ask rules are not installed (run /design-first:adopt)" -f $result.settingsPaths[0]) }
    } elseif ($result.settingsFound.Count -gt 0 -and $result.denyRules -eq 0) {
        $result.findings += [PSCustomObject]@{ severity = 'warn'; kind = 'noDenyRules'; path = $result.settingsFound[0]
            message = ("root settings carry 0 deny rules - the Read(**/.env) hygiene rules are absent ({0})" -f $result.settingsFound[0]) }
    }

    # --- fence log: absent = "no trips yet", REPORTED, never RED (SPEC 7)
    $result.fenceLogExists = Test-Path -LiteralPath $result.fenceLogPath -PathType Leaf
    if ($result.fenceLogExists) {
        try {
            $lines = @(Get-Content -LiteralPath $result.fenceLogPath -ErrorAction Stop | Where-Object { $_ -match '\S' })
            $result.fenceTrips = $lines.Count
            $stamped = @($lines | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}' })
            if ($stamped.Count -gt 0) {
                $result.fenceLastTrip = ($stamped[-1] -split '\s\s')[0].Trim()
                $dt = [datetime]::MinValue
                if ([datetime]::TryParse($result.fenceLastTrip, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeLocal, [ref]$dt)) {
                    $result.fenceStaleDays = [int]((Get-Date) - $dt).TotalDays
                    if ($result.fenceStaleDays -gt [int]$Config.enforcement.fenceLogStaleDays) {
                        $result.findings += [PSCustomObject]@{ severity = 'warn'; kind = 'fenceStale'; path = $result.fenceLogPath
                            message = ("fence hook has not fired in {0} days - it may be wired but dead" -f $result.fenceStaleDays) }
                    }
                }
            }
        } catch {
            $result.couldNotLook += "fence log could not be read: $($result.fenceLogPath)"
        }
    } else {
        $result.findings += [PSCustomObject]@{ severity = 'info'; kind = 'fenceNoTrips'; path = $result.fenceLogPath
            message = ("fence log: no trips yet ({0} does not exist)" -f $result.fenceLogPath) }
    }
    return $result
}
