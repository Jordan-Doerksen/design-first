// tokenise.mjs - quote-aware command tokeniser for guard.mjs (SPEC 5.4 step 0, finding 75).
//
// splitCommand returns a list of sub-commands; each sub-command is a list of tokens with the
// surrounding quotes removed. Sub-command separators, recognised only OUTSIDE quotes:
//   &&  ||  ;  |  &  newline
// Quotes: '...' is literal to the closing quote. "..." honours the shell's escape character.
// Escape character: Bash uses backslash, PowerShell uses backtick. Outside quotes a Bash backslash
// escapes only shell-significant characters (quote, space, $, &, |, ;, <, >, (, ), backslash,
// newline) so that a Windows path typed with backslashes still reads as that path.
//
// Not parsed, by design (the written residual): $(...), backticks as substitution, nested shell
// strings (cmd /c "...", pwsh -c "..."), xargs, user git aliases, scripts the agent writes.

import { toFullPath } from './common.mjs';

const BASH_ESCAPABLE = new Set(['"', "'", ' ', '$', '&', '|', ';', '<', '>', '(', ')', '\\', '\n', '\t', '`']);
const isWs = (c) => /\s/.test(c);

export function splitCommand(cmd, shell) {
    const isPwsh = shell === 'PowerShell';
    const esc = isPwsh ? '`' : '\\';
    const subs = [];
    let tokens = [];
    let cur = '';
    let haveToken = false;
    let inSingle = false, inDouble = false;
    const n = cmd.length;
    const endToken = () => { if (haveToken) { tokens.push(cur); cur = ''; haveToken = false; } };

    let i = 0;
    while (i < n) {
        const c = cmd[i];
        const next = i + 1 < n ? cmd[i + 1] : '\0';
        if (inSingle) {
            if (c === "'") inSingle = false; else cur += c;
            i++; continue;
        }
        if (inDouble) {
            if (c === esc && next !== '\0') {
                // Escaped character inside double quotes stays literal (so \" and `" do not close).
                if (isPwsh || ['"', '\\', '$', '`', '\n'].includes(next)) { cur += next; i += 2; continue; }
                cur += c; i++; continue;
            }
            if (c === '"') inDouble = false; else cur += c;
            i++; continue;
        }

        // ---- outside quotes
        if (c === esc && next !== '\0' && (isPwsh || BASH_ESCAPABLE.has(next))) {
            if (next === '\n' || next === '\r') {
                // Escaped newline = line continuation = whitespace. Without this, "git add \<nl> .env"
                // would split into two sub-commands and the pathspec would escape the staging rule.
                endToken();
                i += 2; continue;
            }
            cur += next; haveToken = true; i += 2; continue;
        }
        if (c === "'") { inSingle = true; haveToken = true; i++; continue; }
        if (c === '"') { inDouble = true; haveToken = true; i++; continue; }

        // separators
        let sepLen = 0;
        if ((c === '&' && next === '&') || (c === '|' && next === '|')) sepLen = 2;
        else if (c === ';' || c === '|' || c === '\n' || c === '\r') sepLen = 1;
        else if (c === '&') {
            // Workaround: "2>&1" and ">&2" are redirections, not a background operator. A bare &
            // elsewhere (including the PowerShell call operator) ends the sub-command.
            const prev = i > 0 ? cmd[i - 1] : '\0';
            if (prev !== '>' && prev !== '<') sepLen = 1;
        }
        if (sepLen > 0) {
            endToken();
            if (tokens.length > 0) { subs.push(tokens); tokens = []; }
            i += sepLen; continue;
        }
        if (isWs(c)) { endToken(); i++; continue; }
        cur += c; haveToken = true; i++;
    }
    if (haveToken) tokens.push(cur);
    if (tokens.length > 0) subs.push(tokens);
    return subs;
}

const VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--exec-path', '--namespace', '--super-prefix', '--config-env']);
const FLAGS = new Set(['--no-pager', '-p', '--paginate', '-P', '--bare', '--literal-pathspecs', '--glob-pathspecs',
    '--noglob-pathspecs', '--icase-pathspecs', '--no-replace-objects', '--no-optional-locks',
    '--no-lazy-fetch', '--no-advice', '--html-path', '--man-path', '--info-path']);

// Head normalisation (SPEC 5.4 step 0, finding 72). Returns null when the sub-command is not git,
// else { sub: 'add'|'commit'|...; args: tokens after the sub-command; cwd: effective directory after
// -C options }. -C is matched with its case: '-c name=value' sets a config value and moves nothing.
export function getGitCall(tokens, cwd) {
    if (!tokens || tokens.length === 0) return null;
    let i = 0;
    // Leading PowerShell call operator, if the tokeniser left it attached (it normally splits it).
    if (tokens[i] === '&') i++;
    if (i >= tokens.length) return null;
    // git, git.exe, or any path whose leaf is git / git.exe
    if (!/^(.*[\\/])?git(\.exe)?$/i.test(tokens[i])) return null;
    i++;
    let effCwd = cwd;
    while (i < tokens.length) {
        const t = tokens[i];
        if (t === '-C' && i + 1 < tokens.length) {
            effCwd = toFullPath(tokens[i + 1], effCwd) || cwd;
            i += 2; continue;
        }
        if (VALUED.has(t) && i + 1 < tokens.length) { i += 2; continue; }
        if (/^(--git-dir|--work-tree|--exec-path|--namespace|--super-prefix|--config-env|-c)=/.test(t)) { i++; continue; }
        if (/^-C.+/.test(t)) { effCwd = toFullPath(t.slice(2), effCwd) || cwd; i++; continue; }
        if (FLAGS.has(t)) { i++; continue; }
        break;
    }
    if (i >= tokens.length) return null;
    let sub = tokens[i].toLowerCase();
    if (sub === 'stage') sub = 'add';
    return { sub, args: tokens.slice(i + 1), cwd: effCwd };
}
