# design-first chunk-1 runtime smoke.
# Proves, from inside a real session, that the plugin root variable expands in a hook command,
# that pwsh is the interpreter, and that stdout from a SessionStart hook reaches the session.
# Replaced by entry.ps1 in chunk 4.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    $dir = Join-Path $env:TEMP 'design-first'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $record = [ordered]@{
        when          = (Get-Date).ToString('o')
        scriptRoot    = $PSScriptRoot
        psVersion     = $PSVersionTable.PSVersion.ToString()
        pluginRootEnv = $env:CLAUDE_PLUGIN_ROOT
        cwd           = (Get-Location).Path
    }
    $record | ConvertTo-Json | Set-Content -Path (Join-Path $dir 'smoke.json') -Encoding utf8NoBOM
    Write-Output "design-first: smoke ok ($PSScriptRoot)"
    exit 0
} catch {
    Write-Output "design-first: smoke ERROR $($_.Exception.Message)"
    exit 0
}
