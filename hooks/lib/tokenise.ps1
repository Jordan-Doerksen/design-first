# tokenise.ps1 - quote-aware command tokeniser for guard.ps1 (SPEC 5.4 step 0, finding 75).
#
# Split-DfCommand returns a list of sub-commands; each sub-command is a list of tokens with the
# surrounding quotes removed. Sub-command separators, recognised only OUTSIDE quotes:
#   &&  ||  ;  |  &  newline
# Quotes: '...' is literal to the closing quote. "..." honours the shell's escape character.
# Escape character: Bash uses backslash, PowerShell uses backtick. Outside quotes a Bash backslash
# escapes only shell-significant characters (quote, space, $, &, |, ;, <, >, (, ), backslash,
# newline) so that a Windows path typed with backslashes still reads as that path.
#
# Not parsed, by design (the written residual): $(...), backticks as substitution, nested shell
# strings (cmd /c "...", pwsh -c "..."), xargs, user git aliases, scripts the agent writes.

function Split-DfCommand([string]$cmd, [string]$shell) {
    $isPwsh = ($shell -eq 'PowerShell')
    $esc = if ($isPwsh) { '`' } else { '\' }
    $bashEscapable = [char[]]@('"', "'", ' ', '$', '&', '|', ';', '<', '>', '(', ')', '\', "`n", "`t", '`')

    $subs = [Collections.Generic.List[object]]::new()
    $tokens = [Collections.Generic.List[string]]::new()
    $cur = [Text.StringBuilder]::new()
    $haveToken = $false
    $inSingle = $false; $inDouble = $false
    $n = $cmd.Length

    $i = 0
    while ($i -lt $n) {
        $c = $cmd[$i]
        $next = if ($i + 1 -lt $n) { $cmd[$i + 1] } else { [char]0 }

        if ($inSingle) {
            if ($c -eq "'") { $inSingle = $false } else { [void]$cur.Append($c) }
            $i++; continue
        }
        if ($inDouble) {
            if ($c -eq $esc -and $next -ne [char]0) {
                # Escaped character inside double quotes stays literal (so \" and `" do not close).
                if ($isPwsh -or $next -in @('"', '\', '$', '`', "`n")) { [void]$cur.Append($next); $i += 2; continue }
                [void]$cur.Append($c); $i++; continue
            }
            if ($c -eq '"') { $inDouble = $false } else { [void]$cur.Append($c) }
            $i++; continue
        }

        # ---- outside quotes
        if ($c -eq $esc -and $next -ne [char]0 -and ($isPwsh -or $next -in $bashEscapable)) {
            if ($next -eq "`n" -or $next -eq "`r") {
                # Escaped newline = line continuation = whitespace. Without this, "git add \<nl> .env"
                # would split into two sub-commands and the pathspec would escape the staging rule.
                if ($haveToken) { $tokens.Add($cur.ToString()); [void]$cur.Clear(); $haveToken = $false }
                $i += 2; continue
            }
            [void]$cur.Append($next); $haveToken = $true; $i += 2; continue
        }
        if ($c -eq "'") { $inSingle = $true; $haveToken = $true; $i++; continue }
        if ($c -eq '"') { $inDouble = $true; $haveToken = $true; $i++; continue }

        # separators
        $sepLen = 0
        if (($c -eq '&' -and $next -eq '&') -or ($c -eq '|' -and $next -eq '|')) { $sepLen = 2 }
        elseif ($c -eq ';' -or $c -eq '|' -or $c -eq "`n" -or $c -eq "`r") { $sepLen = 1 }
        elseif ($c -eq '&') {
            # Workaround: "2>&1" and ">&2" are redirections, not a background operator. A bare &
            # elsewhere (including the PowerShell call operator) ends the sub-command.
            $prev = if ($i -gt 0) { $cmd[$i - 1] } else { [char]0 }
            if ($prev -ne '>' -and $prev -ne '<') { $sepLen = 1 }
        }
        if ($sepLen -gt 0) {
            if ($haveToken) { $tokens.Add($cur.ToString()); [void]$cur.Clear(); $haveToken = $false }
            if ($tokens.Count -gt 0) { $subs.Add(@($tokens.ToArray())); $tokens.Clear() }
            $i += $sepLen; continue
        }
        if ([char]::IsWhiteSpace($c)) {
            if ($haveToken) { $tokens.Add($cur.ToString()); [void]$cur.Clear(); $haveToken = $false }
            $i++; continue
        }
        [void]$cur.Append($c); $haveToken = $true; $i++
    }
    if ($haveToken) { $tokens.Add($cur.ToString()) }
    if ($tokens.Count -gt 0) { $subs.Add(@($tokens.ToArray())) }
    return ,$subs.ToArray()
}

# Head normalisation (SPEC 5.4 step 0, finding 72). Returns $null when the sub-command is not
# git, else @{ sub = 'add'|'commit'|...; args = tokens after the sub-command; cwd = effective
# directory after -C options }.
function Get-DfGitCall([string[]]$tokens, [string]$cwd) {
    if (-not $tokens -or $tokens.Count -eq 0) { return $null }
    $i = 0
    # Leading PowerShell call operator, if the tokeniser left it attached (it normally splits it).
    if ($tokens[$i] -eq '&') { $i++ }
    if ($i -ge $tokens.Count) { return $null }
    # git, git.exe, or any path whose leaf is git / git.exe
    if ($tokens[$i] -notmatch '(?i)^(.*[\\/])?git(\.exe)?$') { return $null }
    $i++
    $effCwd = $cwd
    $valued = @('-C', '-c', '--git-dir', '--work-tree', '--exec-path', '--namespace', '--super-prefix', '--config-env')
    $flags  = @('--no-pager', '-p', '--paginate', '-P', '--bare', '--literal-pathspecs', '--glob-pathspecs',
                '--noglob-pathspecs', '--icase-pathspecs', '--no-replace-objects', '--no-optional-locks',
                '--no-lazy-fetch', '--no-advice', '--html-path', '--man-path', '--info-path')
    while ($i -lt $tokens.Count) {
        $t = $tokens[$i]
        if ($t -eq '-C' -and $i + 1 -lt $tokens.Count) {
            $effCwd = ConvertTo-DfFullPath $tokens[$i + 1] $effCwd
            if (-not $effCwd) { $effCwd = $cwd }
            $i += 2; continue
        }
        if ($t -in $valued -and $i + 1 -lt $tokens.Count) { $i += 2; continue }
        if ($t -match '^(--git-dir|--work-tree|--exec-path|--namespace|--super-prefix|--config-env|-c)=') { $i++; continue }
        if ($t -match '^-C.+') { $effCwd = ConvertTo-DfFullPath $t.Substring(2) $effCwd; if (-not $effCwd) { $effCwd = $cwd }; $i++; continue }
        if ($t -in $flags) { $i++; continue }
        break
    }
    if ($i -ge $tokens.Count) { return $null }
    $sub = $tokens[$i].ToLowerInvariant()
    if ($sub -eq 'stage') { $sub = 'add' }
    $rest = if ($i + 1 -lt $tokens.Count) { @($tokens[($i + 1)..($tokens.Count - 1)]) } else { @() }
    return @{ sub = $sub; args = $rest; cwd = $effCwd }
}
