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

import path from 'node:path';
import { toFullPath, getLeaf, ieq, IS_WIN } from './common.mjs';

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

// git's global options as git 2.56 lists them. A global option missing here ends the reading, and
// the call reads as not-git. Workaround (CR-2026-10-16-ONEWRITER chunk 0 review, round 2):
// --attr-source was missing, so 'git --attr-source=HEAD add -A' staged an untracked .env with no
// refusal. --shallow-file is git's internal option, also accepted on the command line.
const VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--exec-path', '--namespace', '--super-prefix', '--config-env',
    '--attr-source', '--shallow-file']);
const VALUED_EQ = /^(--git-dir|--work-tree|--exec-path|--namespace|--super-prefix|--config-env|--attr-source|--shallow-file)=/;
const FLAGS = new Set(['--no-pager', '-p', '--paginate', '-P', '--bare', '--literal-pathspecs', '--glob-pathspecs',
    '--noglob-pathspecs', '--icase-pathspecs', '--no-replace-objects', '--no-optional-locks',
    '--no-lazy-fetch', '--no-advice', '--html-path', '--man-path', '--info-path']);

// GNU env's long options, for the prefix match below.
const ENV_LONG = ['ignore-environment', 'null', 'unset', 'chdir', 'split-string', 'block-signal',
    'default-signal', 'ignore-signal', 'list-signal-handling', 'debug', 'help', 'version'];

// A NAME=value word before git, split as the shell splits it, or null.
const ENV_WORD = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;

// The name a prefix word sets, as the environment reads it: Windows ignores the case of an
// environment name (git_dir=x is GIT_DIR there), Linux and macOS do not.
const envKey = (name) => (IS_WIN ? name.toUpperCase() : name);

// Reads env's options from tokens[i] on, as GNU env reads them, and applies them: -C / --chdir
// moves the folder, -i / - / --ignore-environment drop every NAME=value word set so far, -u /
// --unset drops one. Returns { i, effCwd } at the first word that is not an env option, or
// { notCall: true } when env itself runs nothing (--help, --version) or runs a string this reading
// cannot split (-S, --split-string: the written residual in guard.mjs).
function readEnvOptions(tokens, i, effCwd, envWords) {
    while (i < tokens.length) {
        let o = tokens[i];
        if (o === '--') { i++; break; }
        let m;
        if ((m = /^--([a-z-]+)(=[\s\S]*)?$/.exec(o))) {
            // A long option by any unambiguous prefix, as GNU env's getopt_long reads it: an exact
            // name wins, a unique prefix is expanded, an ambiguous one (--i, --d) is left alone and
            // env refuses it. Workaround (chunk 0 review, round 2): only full names were read, so
            // 'env --c <repo> git add -A' and 'env --u GIT_DIR git add -A' read as not-git and
            // staged an untracked .env.
            const nm = m[1]; const tail = m[2] || '';
            const hits = ENV_LONG.includes(nm) ? [nm] : ENV_LONG.filter((x) => x.startsWith(nm));
            if (hits.length === 1) o = '--' + hits[0] + tail;
            // --help and --version print and run nothing.
            if (o === '--help' || o === '--version') return { notCall: true };
        }
        let dir = null; let unset = null; let clear = false;
        if (o === '--chdir' && i + 1 < tokens.length) { dir = tokens[i + 1]; i++; }
        else if ((m = /^--chdir=(.+)$/.exec(o))) dir = m[1];
        else if (o === '--unset' && i + 1 < tokens.length) { unset = tokens[i + 1]; i++; }
        else if ((m = /^--unset=(.+)$/.exec(o))) unset = m[1];
        else if (/^--split-string/.test(o)) return { notCall: true };
        else if (o === '-' || o === '--ignore-environment') clear = true;
        else if (['--null', '--debug', '--list-signal-handling'].includes(o) || /^--(default|ignore|block)-signal(=.*)?$/.test(o)) { /* no effect on the call */ }
        else if ((m = /^-([i0v]*)([CuS]?)([\s\S]*)$/.exec(o))) {
            // A short-option group, as GNU env reads it: flag letters, then at most one letter that
            // takes a value, from the rest of the word or else the next word. Workaround (chunk 0
            // review): only one option per word was read, so 'env -vC <repo> git add -A' read as
            // not-git and staged an untracked .env.
            const flagPart = m[1]; const letter = m[2]; let val = m[3];
            if (!letter && val) break;
            if (letter === 'S') return { notCall: true };
            if (flagPart.includes('i')) clear = true;
            if (letter) {
                if (!val) {
                    if (i + 1 >= tokens.length) break;
                    i++; val = tokens[i];
                }
                if (letter === 'C') dir = val; else unset = val;
            }
        } else break;
        if (clear) envWords.clear();
        if (dir) { const to = toFullPath(dir, effCwd); if (to) effCwd = to; }
        if (unset) envWords.delete(envKey(unset));
        i++;
    }
    return { i, effCwd };
}

// Head normalisation (SPEC 5.4 step 0, finding 72). Returns null when the sub-command is not git,
// else { sub: 'add'|'commit'|...; args: tokens after the sub-command;
//   runDir   = the folder git starts in: the call's folder after env -C and git -C;
//   gitDir   = the full path --git-dir (or GIT_DIR=) names, else null;
//   workTree = the full path --work-tree (or GIT_WORK_TREE=) names, else null;
//   cwd      = the folder the rules read the repository from: the folder above a gitDir that names
//              <folder>/.git, else runDir;
//   excludesFile = the core.excludesFile value the call sets by -c or by GIT_CONFIG_* words, else
//              null (an empty string is a value: it turns the excludes file off) }.
// Rule 1's probe and rule 7's status run in runDir with the same --git-dir and --work-tree as the
// call, so git picks the work tree as it does for the call (with --git-dir alone, runDir, or
// core.worktree). Rule 11 reads cwd (rule 2 reads the words only): a work tree holds no branch,
// and git finds the repository from runDir when no git dir is given. Workaround
// (CR-2026-10-16-ONEWRITER chunk 0 review): cwd moved to the work tree, so on a loop branch
// 'git --work-tree=<outside> checkout main' read no repository and was allowed, and git moved HEAD.
//
// Prefixes read before git (CR-2026-10-16-ONEWRITER chunk 0, ported in 0.2.3): env with its own
// options (readEnvOptions above), command (command -v and -V run nothing, so that is not a call),
// time with its options, and bare NAME=value words. The words GIT_DIR= and GIT_WORK_TREE= count as
// --git-dir and --work-tree; the options win over them, as in git.
// Workaround: each prefix made the sub-command read as not-git, so 'env git add -A', 'VAR=x git
// add -A' and 'command git add -A' staged an untracked .env with no refusal (CR-2026-10-19-REVIEW
// F1). Not read (the written residual in guard.mjs): env -S, every other wrapper (exec, nohup,
// nice, timeout, sudo, stdbuf, xargs), and a GIT_ word set by export, $env: or the session
// environment rather than as a prefix word.
//
// Option case. git's options are case-sensitive, and so is this reading: -C is matched with its
// case, and '-c name=value' sets a config value and moves nothing.
//
// Config values (chunk 0 review, round 2). One is carried: core.excludesFile, from 'git -c' and from
// GIT_CONFIG_COUNT with its GIT_CONFIG_KEY_<n> and GIT_CONFIG_VALUE_<n> words (-c wins, as in git).
// Rules 1 and 7 probe with it, so 'git -c core.excludesFile= add -A', which un-ignores a .env that
// only an excludes file ignored, is seen. Workaround: rule 1 probed with the repository's own
// config, so that call staged the .env with no refusal. No other value is carried: a probe that
// repeated '-c core.fsmonitor=<command>' would run that command inside the hook. Not read (the
// residual): a value given by --config-env or GIT_CONFIG_PARAMETERS, and any other -c value.
export function getGitCall(tokens, cwd) {
    if (!tokens || tokens.length === 0) return null;
    let i = 0;
    let effCwd = cwd;
    // The NAME=value words before git, last one wins; the key folds case where the system does.
    const envWords = new Map();
    // Leading PowerShell call operator, if the tokeniser left it attached (it normally splits it).
    if (tokens[i] === '&') i++;
    while (i < tokens.length) {
        const t = tokens[i];
        let m;
        if ((m = ENV_WORD.exec(t))) {
            envWords.set(envKey(m[1]), m[2]);
            i++; continue;
        }
        if (ieq(t, 'command')) {
            i++;
            while (i < tokens.length && /^-[pvV]+$/.test(tokens[i])) {
                if (/[vV]/.test(tokens[i])) return null;
                i++;
            }
            if (i < tokens.length && tokens[i] === '--') i++;
            continue;
        }
        if (/^(.*[\\/])?time(\.exe)?$/i.test(t)) {
            i++;
            while (i < tokens.length) {
                const o = tokens[i];
                if (o === '--') { i++; break; }
                if (['-f', '-o', '--format', '--output'].includes(o) && i + 1 < tokens.length) { i += 2; continue; }
                if (/^-[apqv]+$/.test(o) || /^--(format|output)=/.test(o) || ['--portability', '--append', '--verbose', '--quiet'].includes(o)) { i++; continue; }
                break;
            }
            continue;
        }
        if (/^(.*[\\/])?env(\.exe)?$/i.test(t)) {
            const r = readEnvOptions(tokens, i + 1, effCwd, envWords);
            if (r.notCall) return null;
            i = r.i; effCwd = r.effCwd;
            continue;
        }
        break;
    }
    if (i >= tokens.length) return null;
    // git, git.exe, or any path whose leaf is git / git.exe
    if (!/^(.*[\\/])?git(\.exe)?$/i.test(tokens[i])) return null;
    i++;
    let gitDir = null; let workTree = null; let cliExcludes = null;
    while (i < tokens.length) {
        const t = tokens[i];
        let m;
        // An empty or unresolvable -C keeps the folder so far, as git keeps it for -C "". Workaround
        // (chunk 0 review): it fell back to the tool call's folder and dropped an earlier env -C, so
        // 'env -C <repo> git -C "" add -A' run from outside staged the repository's untracked .env.
        if (t === '-C' && i + 1 < tokens.length) {
            const to = toFullPath(tokens[i + 1], effCwd);
            if (to) effCwd = to;
            i += 2; continue;
        }
        // -c <name>=<value>: the last core.excludesFile is carried (git reads the name without case).
        if (t === '-c' && i + 1 < tokens.length) {
            if ((m = /^core\.excludesfile=([\s\S]*)$/i.exec(tokens[i + 1]))) cliExcludes = m[1];
            i += 2; continue;
        }
        if (t === '--git-dir' && i + 1 < tokens.length) { gitDir = tokens[i + 1]; i += 2; continue; }
        if (t === '--work-tree' && i + 1 < tokens.length) { workTree = tokens[i + 1]; i += 2; continue; }
        if ((m = /^--git-dir=(.+)$/.exec(t))) { gitDir = m[1]; i++; continue; }
        if ((m = /^--work-tree=(.+)$/.exec(t))) { workTree = m[1]; i++; continue; }
        if (VALUED.has(t) && i + 1 < tokens.length) { i += 2; continue; }
        if (VALUED_EQ.test(t)) { i++; continue; }
        if (/^-C.+/.test(t)) { const to = toFullPath(t.slice(2), effCwd); if (to) effCwd = to; i++; continue; }
        if (FLAGS.has(t)) { i++; continue; }
        break;
    }
    // The repository the call works on (chunk 0). git reads --git-dir and --work-tree after every -C,
    // so a relative value is read from the folder the -C options lead to. Workaround: both options
    // were skipped and the rules probed the call's own folder, so 'git --git-dir=R/.git
    // --work-tree=R add -A' run from a folder outside R staged R's untracked .env with no refusal.
    if (!gitDir) gitDir = envWords.get(envKey('GIT_DIR')) || null;
    if (!workTree) workTree = envWords.get(envKey('GIT_WORK_TREE')) || null;
    const gd = gitDir ? toFullPath(gitDir, effCwd) : null;
    const wt = workTree ? toFullPath(workTree, effCwd) : null;
    let repoDir = effCwd;
    if (gd && ieq(getLeaf(gd), '.git')) repoDir = path.dirname(gd);
    // core.excludesFile from GIT_CONFIG_COUNT and its numbered words: git reads key <n> only below the
    // count, the last one wins, and a -c value wins over all of them.
    let excludes = null;
    const countWord = envWords.get(envKey('GIT_CONFIG_COUNT'));
    if (countWord != null && /^\s*[+-]?\d+\s*$/.test(countWord)) {
        const count = Number.parseInt(countWord, 10);
        const nums = [];
        for (const k of envWords.keys()) {
            const km = /^GIT_CONFIG_KEY_(0|[1-9][0-9]{0,8})$/.exec(k);
            if (km && Number(km[1]) < count) nums.push(Number(km[1]));
        }
        nums.sort((a, b) => a - b);
        for (const n of nums) {
            const valueKey = envKey(`GIT_CONFIG_VALUE_${n}`);
            if (ieq(envWords.get(envKey(`GIT_CONFIG_KEY_${n}`)), 'core.excludesFile') && envWords.has(valueKey)) excludes = envWords.get(valueKey);
        }
    }
    if (cliExcludes != null) excludes = cliExcludes;
    if (i >= tokens.length) return null;
    let sub = tokens[i].toLowerCase();
    if (sub === 'stage') sub = 'add';
    return { sub, args: tokens.slice(i + 1), cwd: repoDir, runDir: effCwd, gitDir: gd, workTree: wt, excludesFile: excludes };
}
