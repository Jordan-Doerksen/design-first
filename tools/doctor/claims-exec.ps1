# claims-exec.ps1 - the two claim types that run a process: generated_matches and hook_smoke.
# READ-ONLY with respect to the workspace: the generator writes into a temp file that is deleted.

function Invoke-Process {
    # Runs an executable with arguments, optional stdin text, a timeout in seconds and a working
    # directory. Returns @{ exit; stdout; stderr; timedOut; started; error }. Never throws.
    # Output is read asynchronously: a synchronous ReadToEnd on both streams can deadlock when the
    # child fills one pipe while the parent waits on the other.
    param([string] $Exe, [string[]] $Arguments, [string] $StdIn, [int] $TimeoutSeconds, [string] $WorkDir, [hashtable] $Env)
    $r = [ordered]@{ exit = -1; stdout = ''; stderr = ''; timedOut = $false; started = $false; error = '' }
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $Exe
    foreach ($a in $Arguments) { $psi.ArgumentList.Add($a) }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $psi.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    if ($WorkDir -and (Test-Path -LiteralPath $WorkDir)) { $psi.WorkingDirectory = $WorkDir }
    if ($Env) { foreach ($k in $Env.Keys) { $psi.Environment[$k] = [string]$Env[$k] } }
    $proc = [Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    try {
        [void]$proc.Start()
    } catch {
        $r.error = "could not start '$Exe': $($_.Exception.Message)"
        return [PSCustomObject]$r
    }
    $r.started = $true
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()
    try {
        if ($null -ne $StdIn) { $proc.StandardInput.Write($StdIn) }
        $proc.StandardInput.Close()
    } catch { }
    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        $r.timedOut = $true
        try { $proc.Kill($true) } catch { }
        try { $proc.WaitForExit(2000) | Out-Null } catch { }
    }
    try { $r.stdout = $outTask.GetAwaiter().GetResult() } catch { }
    try { $r.stderr = $errTask.GetAwaiter().GetResult() } catch { }
    if (-not $r.timedOut) { $r.exit = $proc.ExitCode }
    $proc.Dispose()
    return [PSCustomObject]$r
}

function Get-Pwsh {
    $cmd = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

# ---------------------------------------------------------------- generated_matches (C5)

function Test-GeneratedMatchesClaim {
    # Fields: generator, source, overlay?, installed?, output. Runs the generator from the kit root
    # into a temp file and compares bytes after mapping CRLF -> LF on both sides (nothing else).
    # Generator exit non-zero = the Doctor could not look, not a false claim.
    param($c, $Context)
    $kit = $Context.kit
    if ([string]::IsNullOrWhiteSpace($kit)) { return New-ClaimResult $c 'UNKNOWN' 'no kit root (pointer.pluginRoot) to run the generator from' }
    $kitCtx = [PSCustomObject]@{ root = $Context.root; brain = $Context.brain; kit = $kit; base = $kit }
    $d = ''
    $gen = Resolve-ClaimPath -Raw ([string]$c.generator) -Context $kitCtx -Detail ([ref]$d)
    if ($null -eq $gen) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'generator'") }
    $src = Resolve-ClaimPath -Raw ([string]$c.source) -Context $Context -Detail ([ref]$d)
    if ($null -eq $src) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'source'") }
    $out = Resolve-ClaimPath -Raw ([string]$c.output) -Context $Context -Detail ([ref]$d)
    if ($null -eq $out) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'output'") }
    foreach ($pair in @(@('generator', $gen), @('source', $src))) {
        if (-not (Test-Path -LiteralPath $pair[1] -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "$($pair[0]) missing: $($pair[1])" }
    }
    # Not named $args: that is PowerShell's automatic parameter array and assigning it misbehaves.
    $genArgs = @('-NoProfile', '-NonInteractive', '-File', $gen, '-Source', $src)
    foreach ($opt in @(@('overlay', '-Overlay'), @('installed', '-Installed'))) {
        $raw = [string]$c.($opt[0])
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        $p = Resolve-ClaimPath -Raw $raw -Context $Context -Detail ([ref]$d)
        if ($null -eq $p) { return New-ClaimResult $c 'UNKNOWN' ($d -replace "'path'", "'$($opt[0])'") }
        if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "$($opt[0]) missing: $p" }
        $genArgs += @($opt[1], $p)
    }
    # In brain mode the overlay's refs (brain: owners, brain claim ids) resolve only with -BrainRoot;
    # without it the generator fails validation and this claim reads COULD-NOT-LOOK forever.
    if (-not [string]::IsNullOrWhiteSpace($Context.brain)) { $genArgs += @('-BrainRoot', $Context.brain) }
    $pwsh = Get-Pwsh
    if ($null -eq $pwsh) { return New-ClaimResult $c 'UNKNOWN' 'pwsh (PowerShell 7) is not on PATH, so the generator cannot run' }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('design-first-gen-' + [guid]::NewGuid().ToString('N') + '.md')
    $genArgs += @('-Out', $tmp)
    try {
        $run = Invoke-Process -Exe $pwsh -Arguments $genArgs -StdIn '' -TimeoutSeconds 60 -WorkDir $kit -Env @{}
        if (-not $run.started) { return New-ClaimResult $c 'UNKNOWN' $run.error }
        if ($run.timedOut) { return New-ClaimResult $c 'UNKNOWN' "generator timed out after 60 s: $gen" }
        if ($run.exit -ne 0) {
            $msg = (($run.stderr + ' ' + $run.stdout) -replace '\s+', ' ').Trim()
            if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) + '...' }
            return New-ClaimResult $c 'UNKNOWN' ("generator exited {0}: {1}" -f $run.exit, $msg)
        }
        if (-not (Test-Path -LiteralPath $tmp -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' 'generator exited 0 but wrote no output file' }
        if (-not (Test-Path -LiteralPath $out -PathType Leaf)) { return New-ClaimResult $c 'FAIL' "generated output is missing on disk: $out (the generator produced one)" }
        $a = Get-LfBytes $tmp
        $b = Get-LfBytes $out
        if ([Linq.Enumerable]::SequenceEqual([byte[]]$a, [byte[]]$b)) { return New-ClaimResult $c 'PASS' "$out equals the generator's output ($($b.Length) bytes after CRLF->LF)" }
        $firstDiff = 0
        $n = [Math]::Min($a.Length, $b.Length)
        while ($firstDiff -lt $n -and $a[$firstDiff] -eq $b[$firstDiff]) { $firstDiff++ }
        return New-ClaimResult $c 'FAIL' ("{0} differs from the generator's output (first difference at byte {1}; sizes {2} vs {3}). Regenerate it; never hand-edit." -f $out, $firstDiff, $b.Length, $a.Length)
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Get-LfBytes {
    param([string] $Path)
    $raw = [IO.File]::ReadAllBytes($Path)
    $list = [Collections.Generic.List[byte]]::new($raw.Length)
    for ($i = 0; $i -lt $raw.Length; $i++) {
        if ($raw[$i] -eq 13 -and $i + 1 -lt $raw.Length -and $raw[$i + 1] -eq 10) { continue }
        $list.Add($raw[$i])
    }
    return $list.ToArray()
}

# ---------------------------------------------------------------- hook_smoke (findings 40, 73, 81)

function Split-CommandLine {
    # Minimal quote-aware split for a hooks.json `command` string: double quotes group, single
    # quotes group, backslash is NOT an escape (Windows paths). Enough for `pwsh -NoProfile -File "..."`.
    param([string] $Line)
    $tokens = [Collections.Generic.List[string]]::new()
    $cur = [Text.StringBuilder]::new(); $q = [char]0; $has = $false
    foreach ($ch in $Line.ToCharArray()) {
        if ($q -ne [char]0) { if ($ch -eq $q) { $q = [char]0 } else { [void]$cur.Append($ch) }; continue }
        if ($ch -eq '"' -or $ch -eq "'") { $q = $ch; $has = $true; continue }
        if ([char]::IsWhiteSpace($ch)) { if ($has -or $cur.Length -gt 0) { $tokens.Add($cur.ToString()); [void]$cur.Clear(); $has = $false }; continue }
        [void]$cur.Append($ch)
    }
    if ($has -or $cur.Length -gt 0) { $tokens.Add($cur.ToString()) }
    return ,$tokens.ToArray()
}

function Find-RegisteredHook {
    # Returns the first hook entry under hooks.<event> whose command/args name the hook script.
    param($HooksDoc, [string] $Event, [string] $Hook)
    $events = $HooksDoc.hooks
    if ($null -eq $events) { return $null }
    $list = $events.$Event
    if ($null -eq $list) { return $null }
    $needle = if ($Hook -like '*.ps1') { $Hook } else { "$Hook.ps1" }
    foreach ($entry in @($list)) {
        foreach ($h in @($entry.hooks)) {
            $text = if ($h.args) { ($h.args -join ' ') } else { [string]$h.command }
            if ($text -match ('(^|[\\/"'' ])' + [regex]::Escape($needle) + '(\b|$)')) { return $h }
        }
    }
    return $null
}

function Test-HookSmokeClaim {
    # Fields: hook (e.g. "guard"), event (SessionStart | PreToolUse | UserPromptSubmit | SubagentStart | Stop). Reads hooks/hooks.json under
    # pluginRoot, substitutes ${CLAUDE_PLUGIN_ROOT}, runs the registered command with synthetic stdin
    # and a 10 s timeout. Pass per event: SessionStart = exit 0 + non-empty stdout;
    # PreToolUse = exit 0 + (empty stdout or parseable JSON).
    param($c, $Context)
    $hook = [string]$c.hook; $event = [string]$c.event
    if ([string]::IsNullOrWhiteSpace($hook)) { return New-ClaimResult $c 'UNKNOWN' "claim has no 'hook'" }
    if ($event -notin @('SessionStart', 'PreToolUse', 'UserPromptSubmit', 'SubagentStart', 'Stop')) { return New-ClaimResult $c 'UNKNOWN' "'event' must be SessionStart, PreToolUse, UserPromptSubmit, SubagentStart or Stop (got '$event')" }
    $pluginRoot = $Context.pluginRoot
    if ([string]::IsNullOrWhiteSpace($pluginRoot)) { return New-ClaimResult $c 'UNKNOWN' 'no pluginRoot to read hooks.json from' }
    $hooksPath = Join-Path $pluginRoot 'hooks\hooks.json'
    if (-not (Test-Path -LiteralPath $hooksPath -PathType Leaf)) { return New-ClaimResult $c 'UNKNOWN' "hooks.json missing: $hooksPath" }
    try { $doc = Get-Content -LiteralPath $hooksPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
    catch { return New-ClaimResult $c 'UNKNOWN' "hooks.json could not be parsed: $($_.Exception.Message)" }
    $reg = Find-RegisteredHook -HooksDoc $doc -Event $event -Hook $hook
    if ($null -eq $reg) { return New-ClaimResult $c 'UNKNOWN' "hook '$hook' is not registered for $event in $hooksPath (not built yet, or the registration moved)" }

    # Two registration shapes: exec form (`args[]`, optionally with the executable in `command`) and
    # the plain `command` string, which is split quote-aware.
    if ($reg.args) {
        $tokens = @($reg.args | ForEach-Object { [string]$_ })
        if (-not [string]::IsNullOrWhiteSpace($reg.command) -and $tokens[0] -ne [string]$reg.command) { $tokens = @([string]$reg.command) + $tokens }
    } else {
        $tokens = Split-CommandLine ([string]$reg.command)
    }
    $tokens = @($tokens | ForEach-Object { $_.Replace('${CLAUDE_PLUGIN_ROOT}', $pluginRoot).Replace('$CLAUDE_PLUGIN_ROOT', $pluginRoot) })
    if ($tokens.Count -eq 0) { return New-ClaimResult $c 'UNKNOWN' 'registration has neither command nor args' }
    $exe = $tokens[0]
    $resolved = Get-Command $exe -ErrorAction SilentlyContinue
    if ($null -eq $resolved) { return New-ClaimResult $c 'FAIL' "'$exe' is not on PATH, so the $hook hook can never start (install PowerShell 7)" }
    $script = @($tokens | Where-Object { $_ -like '*.ps1' } | Select-Object -First 1)
    if ($script.Count -gt 0 -and -not (Test-Path -LiteralPath $script[0] -PathType Leaf)) {
        return New-ClaimResult $c 'FAIL' "registered but missing on disk: $($script[0])"
    }
    $cwd = if ($Context.root) { $Context.root } else { $pluginRoot }
    $stdin = switch ($event) {
        'SessionStart' { [ordered]@{ session_id = 'doctor-smoke'; hook_event_name = 'SessionStart'; source = 'startup'; cwd = $cwd; transcript_path = '' } }
        'PreToolUse'   { [ordered]@{ session_id = 'doctor-smoke'; hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = [ordered]@{ command = 'echo doctor-smoke' }; cwd = $cwd; transcript_path = '' } }
        'UserPromptSubmit' { [ordered]@{ session_id = 'doctor-smoke'; hook_event_name = 'UserPromptSubmit'; prompt_id = 'doctor-smoke'; prompt = 'doctor smoke: a build task touching a repo'; cwd = $cwd; transcript_path = '' } }
        'SubagentStart'    { [ordered]@{ session_id = 'doctor-smoke'; hook_event_name = 'SubagentStart'; agent_id = 'doctor-smoke'; agent_type = 'general-purpose'; cwd = $cwd; transcript_path = '' } }
        'Stop'             { [ordered]@{ session_id = 'doctor-smoke'; hook_event_name = 'Stop'; stop_hook_active = $false; last_assistant_message = 'doctor smoke'; cwd = $cwd; transcript_path = '' } }
    }
    $run = Invoke-Process -Exe $resolved.Source -Arguments @($tokens | Select-Object -Skip 1) -StdIn ($stdin | ConvertTo-Json -Compress -Depth 5) `
                          -TimeoutSeconds 10 -WorkDir $cwd -Env @{ CLAUDE_PLUGIN_ROOT = $pluginRoot; DF_POINTER_PATH = (Get-PointerPath) }
    if (-not $run.started) { return New-ClaimResult $c 'FAIL' $run.error }
    if ($run.timedOut) { return New-ClaimResult $c 'FAIL' "$hook ($event) did not exit within 10 s" }
    $err = ($run.stderr -replace '\s+', ' ').Trim(); if ($err.Length -gt 200) { $err = $err.Substring(0, 200) + '...' }
    if ($run.exit -ne 0) { return New-ClaimResult $c 'FAIL' ("{0} ({1}) exited {2} before/inside its body. stderr: {3}" -f $hook, $event, $run.exit, $err) }
    $out = $run.stdout.Trim()
    if ($event -eq 'SessionStart') {
        if ($out.Length -eq 0) { return New-ClaimResult $c 'FAIL' "$hook (SessionStart) exited 0 but printed nothing; the entry path would load silently empty" }
        return New-ClaimResult $c 'PASS' ("{0} (SessionStart) exit 0, {1} char(s) of context" -f $hook, $out.Length)
    }
    if ($event -eq 'UserPromptSubmit') {
        # Plain stdout is the carrier; empty is a legal answer (nothing new to route this prompt).
        return New-ClaimResult $c 'PASS' ("{0} (UserPromptSubmit) exit 0, {1} char(s) of context" -f $hook, $out.Length)
    }
    if ($out.Length -eq 0) { return New-ClaimResult $c 'PASS' "$hook ($event) exit 0, silent allow" }
    try { $null = $out | ConvertFrom-Json -ErrorAction Stop } catch {
        $shown = if ($out.Length -gt 120) { $out.Substring(0, 120) + '...' } else { $out }
        return New-ClaimResult $c 'FAIL' "$hook ($event) exit 0 but stdout is not JSON: $shown"
    }
    return New-ClaimResult $c 'PASS' "$hook ($event) exit 0, JSON reply"
}
