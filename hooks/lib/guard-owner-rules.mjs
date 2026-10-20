// guard-owner-rules.mjs - guard rules 7-9 and 13: the owner's standing prohibitions, as refusals.
// Imported by guard.mjs after guard-rules.mjs. Split from guard-rules.mjs by domain (DES-03): rules
// 1-6 guard secrets, history, frozen paths and the build method; rules 7-9 and 13 guard the owner's
// uncommitted work, their machine's start-up, the content bans their brain configures, and their
// machine's processor (no Python heredoc).
// Each rule returns null (no opinion) or a deny object from newDeny.

import { newDeny, toFullPath, isUnder, getLeaf, getExt, git, gitFirst, exists, isFile, iin, countMatches, ieq } from './common.mjs';
import { readFileText, callPin, callConfig } from './guard-rules.mjs';

// ============================================================================ (7) dirty tree
// anchor: dirty-tree  mode: deny  verbs: tidy
// SAFE-06. A git command that overwrites, deletes or hides uncommitted work is refused while the
// work tree it runs in has uncommitted or untracked changes: some trees are dirty on purpose, to
// protect something that works. stash drop and stash clear are refused always, because stashed
// work is in no commit. The command list follows the git-safety-guard pattern (terraphim
// opencode-skills): checkout -- <path>, restore without --staged, reset --hard / --merge / --keep,
// clean -f, switch --discard-changes, stash. Allowed by this rule: checkout -b / -B / --orphan, a
// checkout of a branch, restore --staged, clean -n, and every one of these on a clean tree. On a
// loop branch, rule 11 (guard-loop-rules.mjs) refuses a checkout or switch that leaves it (AUTO-11).
// restore reads -S and -W with their case: -s is --source, which overwrites the work tree.
// Cannot see: the same residual as the other shell rules (nested shells, scripts on disk, aliases),
// and a cd into another repository by any route other than cd / Set-Location / pushd / chdir.
export function dirtyTreeRule(call, owner) {
    const a = call.args;
    let what = null;
    let always = false;
    switch (call.sub) {
        case 'reset': {
            const m = a.find((t) => iin(t, ['--hard', '--merge', '--keep']));
            if (m) what = `git reset ${m} overwrites uncommitted changes`;
            break;
        }
        case 'checkout': {
            if (a.some((t) => iin(t, ['-b', '-B', '--orphan']))) break;
            if (a.includes('--')) what = 'git checkout -- <path> overwrites uncommitted changes in those files';
            else if (a.some((t) => iin(t, ['-f', '--force']))) what = 'git checkout --force throws away uncommitted changes';
            else if (a.some((t) => iin(t, ['.', './', '.\\', ':/']))) what = 'git checkout . overwrites every uncommitted change';
            else {
                for (const t of a) {
                    if (t.startsWith('-')) continue;
                    const f = toFullPath(t, call.cwd);
                    if (f && exists(f)) { what = `git checkout ${t} overwrites uncommitted changes in that path`; break; }
                }
            }
            break;
        }
        case 'restore': {
            const staged = a.some((t) => t === '--staged' || t === '-S');
            const wt = a.some((t) => t === '--worktree' || t === '-W');
            if (!staged || wt) what = 'git restore overwrites uncommitted changes in the work tree';
            break;
        }
        case 'clean': {
            const dry = a.some((t) => ieq(t, '--dry-run') || (/^-[A-Za-z]+$/.test(t) && t.includes('n')));
            const force = a.some((t) => ieq(t, '--force') || (/^-[A-Za-z]+$/.test(t) && t.includes('f')));
            if (force && !dry) what = 'git clean -f deletes untracked files, and git cannot bring them back';
            break;
        }
        case 'switch':
            if (a.some((t) => iin(t, ['--discard-changes', '-f', '--force']))) what = 'git switch --discard-changes throws away uncommitted changes';
            break;
        case 'stash': {
            const verb = a.length > 0 && !String(a[0]).startsWith('-') ? String(a[0]).toLowerCase() : 'push';
            if (verb === 'drop' || verb === 'clear') { what = `git stash ${verb} deletes stashed work`; always = true; }
            else if (verb === 'push' || verb === 'save') what = 'git stash moves uncommitted work out of sight';
            break;
        }
        default: break;
    }
    if (!what) return null;
    let state;
    if (always) state = 'stashed work is in no commit';
    else {
        // The status git reports for the call itself: a call that names its git dir or its work tree
        // (--git-dir, --work-tree, GIT_DIR=, GIT_WORK_TREE=) is read in the folder it starts in with
        // the same options and its core.excludesFile (callPin and callConfig in guard-rules.mjs), so
        // git reads the work tree it would change. Workaround (CR-2026-10-16-ONEWRITER chunk 0
        // review, round 2): the status was read in the folder above the git dir, so 'GIT_DIR=<clean
        // repo>/.git git clean -fdx' run from a folder holding files read a clean tree and was
        // allowed, and git would delete those files.
        const pin = callPin(call);
        const cfgArgs = callConfig(call);
        let where = call.cwd;
        let st;
        if (pin.length > 0) {
            st = git(call.runDir, [...cfgArgs, ...pin, 'status', '--porcelain']);
            const tl = git(call.runDir, [...pin, 'rev-parse', '--show-toplevel']);
            if (tl.code === 0 && gitFirst(tl)) {
                const top = toFullPath(gitFirst(tl));
                if (top) where = top;
            }
        } else {
            st = git(call.cwd, [...cfgArgs, 'status', '--porcelain']);
        }
        // Not a repository, or git failed: git itself refuses or reports it. No opinion here.
        if (st.code !== 0) return null;
        const n = st.out.filter((l) => l).length;
        if (n === 0) return null;
        state = `the work tree at ${where} has ${n} uncommitted or untracked change(s)`;
    }
    const reason = `BLOCKED - ${what}, and ${state}.\n\n` +
        'SAFE-06: never tidy, reset or consolidate a dirty tree on your own initiative; some trees are ' +
        `dirty on purpose, to protect something that works. Leave the tree as it is. Tell ${owner} what you ` +
        'wanted to do and why; if they want it, they run it by hand. To look without changing anything: ' +
        'git status, git diff, git stash list.';
    return newDeny('guard', `dirty tree (${what})`, reason);
}

// ============================================================================ (8) scheduling
// anchor: no-schedule  mode: deny  verbs: schedule
// SAFE-08, opt-in: active only when the brain sets forbidScheduling true. Refuses a command that
// makes something start on a timer, at boot or at login: schtasks /create or /change,
// Register-ScheduledTask and its relatives, crontab (except -l), a Run or RunOnce registry value,
// sc create / sc config, New-Service, systemctl enable, launchctl load / bootstrap / enable, and
// anything that names the Startup folder. An Edit or Write inside the Startup folder is refused too.
// Cannot see: the shell residual, the Task Scheduler window, and session tools (CronCreate, /loop)
// that the owner starts themselves.
const STARTUP_RX = /([\\/])Start Menu[\\/]Programs[\\/]Startup([\\/]|$)|shell:(common )?startup/i;
const RUN_KEY_RX = /\\CurrentVersion\\Run(Once|Services|ServicesOnce)?(\\|$)/i;
const SCHEDULE_HEADS = ['register-scheduledtask', 'set-scheduledtask', 'enable-scheduledtask', 'register-scheduledjob', 'new-service'];

function scheduleDeny(what, owner) {
    const reason = `BLOCKED - ${what}.\n\n` +
        `SAFE-08: nothing runs on a timer, a cron, at boot or at login. ${owner} starts every tool themselves. ` +
        `If something must start by itself, that is ${owner}'s decision: say what and why, and they set it up by hand.`;
    return newDeny('guard', `scheduling (${what})`, reason);
}

export function scheduleRuleShell(tokens, owner) {
    if (!tokens || tokens.length === 0) return null;
    const i = tokens[0] === '&' && tokens.length > 1 ? 1 : 0;
    const head = getLeaf(tokens[i]).replace(/\.exe$/i, '').toLowerCase();
    const rest = tokens.slice(i + 1);
    for (const t of tokens) if (STARTUP_RX.test(t)) return scheduleDeny(`this command names the Startup folder (${t})`, owner);
    switch (head) {
        case 'schtasks': if (rest.some((t) => /^[/-](create|change)$/i.test(t))) return scheduleDeny('schtasks creates or changes a scheduled task', owner); break;
        case 'crontab': if (!iin('-l', rest)) return scheduleDeny('crontab installs or edits a cron table', owner); break;
        case 'reg': if (rest.length > 0 && ieq(rest[0], 'add') && rest.some((t) => RUN_KEY_RX.test(t))) return scheduleDeny('reg add writes a Run key, which starts a program at login', owner); break;
        case 'sc': if (rest.length > 0 && iin(rest[0], ['create', 'config'])) return scheduleDeny(`sc ${rest[0]} installs or changes a service`, owner); break;
        case 'systemctl': if (iin('enable', rest)) return scheduleDeny('systemctl enable starts a unit at boot', owner); break;
        case 'launchctl': if (rest.some((t) => iin(t, ['load', 'bootstrap', 'enable']))) return scheduleDeny('launchctl loads an agent that starts by itself', owner); break;
        default: break;
    }
    if (SCHEDULE_HEADS.includes(head)) return scheduleDeny(`${tokens[i]} registers something that starts by itself`, owner);
    if (['new-itemproperty', 'set-itemproperty', 'new-item'].includes(head) && rest.some((t) => RUN_KEY_RX.test(t))) {
        return scheduleDeny(`${tokens[i]} writes a Run key, which starts a program at login`, owner);
    }
    return null;
}

export function scheduleRuleFile(full, owner) {
    if (full && STARTUP_RX.test(full)) return scheduleDeny(`this writes into the Startup folder (${full})`, owner);
    return null;
}

// ============================================================================ (9) content rules
// anchor: content-rule  mode: deny  verbs: place-order
// Brain-configured (contentRules in doctor.config.json). A rule names a scope (under, except,
// exceptParts, extensions), a pattern and the clause it serves. An Edit, Write or NotebookEdit in
// scope is refused when its new text holds MORE matches of the pattern than the text it replaces,
// so a rewrite of a file that already holds a match is not blocked; only an addition is. With
// shell true, a command run from a folder in scope is refused when its text matches.
// Cannot see: code written outside the scope, a script on disk that is then run, the shell
// residual, and an addition that also removes an equal number of matches in the same edit.
function contentScope(full, rule) {
    if (!full) return false;
    if (!rule.under.some((u) => isUnder(full, u))) return false;
    if (rule.except.some((x) => isUnder(full, x))) return false;
    if (rule.exceptParts.length > 0) {
        for (const part of full.split(/[\\/]/)) if (rule.exceptParts.some((e) => ieq(e, part))) return false;
    }
    return true;
}

function firstMatch(rx, s) {
    const one = new RegExp(rx.source, rx.flags.replace('g', ''));
    const m = one.exec(s);
    return m ? m[0] : null;
}

export function contentRuleFile(tool, ti, full, rules, owner) {
    if (!full) return null;
    const ext = getExt(full);
    for (const rule of rules) {
        if (rule.extensions.length > 0 && !rule.extensions.includes(ext)) continue;
        if (!contentScope(full, rule)) continue;
        let old = '', nw = '';
        if (tool === 'Write') { nw = String(ti.content ?? ''); if (isFile(full)) { try { old = readFileText(full); } catch { old = ''; } } }
        else if (tool === 'Edit') { nw = String(ti.new_string ?? ''); old = String(ti.old_string ?? ''); }
        else if (tool === 'NotebookEdit') { nw = String(ti.new_source ?? ''); }
        const nNew = countMatches(rule.regex, nw);
        if (nNew === 0) continue;
        const nOld = old ? countMatches(rule.regex, old) : 0;
        if (nNew <= nOld) continue;
        const hit = firstMatch(rule.regex, nw);
        const reason = `BLOCKED - ${rule.id}: this adds '${hit}' to ${full}.\n\n${rule.why}\n\n` +
            `If this file is a deliberate exception, ${owner} adds its folder to this rule's except list in ` +
            "contentRules in the brain's doctor.config.json first, as a recorded change.";
        return newDeny('guard', `${rule.id} (${hit})`, reason);
    }
    return null;
}

export function contentRuleShell(cmd, cwd, rules, owner) {
    if (!cmd || !cmd.trim()) return null;
    for (const rule of rules) {
        if (!rule.shell) continue;
        if (!contentScope(cwd, rule)) continue;
        const m = firstMatch(rule.regex, cmd);
        if (m == null) continue;
        const reason = `BLOCKED - ${rule.id}: this command, run from ${cwd}, holds '${m}'.\n\n${rule.why}`;
        return newDeny('guard', `${rule.id} (${m})`, reason);
    }
    return null;
}

// ============================================================================ (13) python heredoc
// anchor: no-python-heredoc  mode: deny  verbs: pipe-heredoc
// Owner ruling 2026-10-20 (Intake item 31a, kit-next batch entry 3): "a hook that refuses any shell
// command containing "python - <<" or "python3 - <<" before it runs, for every session". Approved
// variants: "py - <<" and "py -3 - <<". Follow-up the same day (the owner's pick): also refuse the
// three gaps the first cut recorded, so the rule refuses every command where a heredoc IS the
// Python code. Why: seven runaway Python processes from broken heredoc one-liners burned about 40
// hours of CPU on 2026-10-20. It serves SAFE-08's spirit (nothing runs that the owner did not start)
// operationally; it is not a law clause. Always on, with or without a brain, like rules 1-3: there
// is no config key.
//
// The logic lives here and nowhere else: PY_INTERP_RX names the interpreter, pyCodeSource reads its
// words. One sub-command from splitCommand is read at a time. Before the command word these are
// skipped: the PowerShell call operator '&', NAME=value words, and the wrappers env, command, exec,
// nohup and time when they carry no option of their own. The command word is reduced to its file
// name, so a path and an .exe suffix are allowed: python, python3, python3.12 (any version suffix),
// py. Its words are then read in order:
//   - '-c' or '-m' (alone or inside a short-option group such as -uc), or a word that is not an
//     option or a redirect (a script file): the code comes from there, so a heredoc is input DATA
//     to that program. Allowed. This is the boundary: 'python script.py <<EOF', 'python -m mod
//     <<EOF' and 'python -c "..." <<EOF' are allowed.
//   - '-' (the script is stdin) and any other option are read past. -X, -W and
//     --check-hash-based-pycs take the next word as their value. py's version flag (-3, -3.12,
//     -3.12-64, -V:3.12) is an option like any other. A word after '-' is an argument to stdin's
//     script, not a script file.
//   - a word that starts with '<<' (a heredoc, '<<-EOF', '<< EOF', or a here-string '<<<'), or
//     '-<<EOF' (the '-' joined to it): the heredoc IS the code. Refused.
//   - a redirect ('<', '>', '2>&1', '>>out') is read past with its target; one '<' is a file
//     redirect, so 'python - < file.py' is allowed.
// When the words end with no code source, the interpreter reads its code from stdin. If this
// sub-command is on the right of a pipe ('|', recorded by splitCommand as pipedIn) and any command
// earlier in the same pipeline carries a heredoc word, the heredoc is the code: 'cat <<EOF |
// python', 'cat <<EOF | python -', 'cat <<EOF | sed s/a/b/ | py -3'. Refused. 'cat <<EOF | grep x'
// and 'cat <<EOF > run.py' are not an interpreter and are allowed.
// Quoted text: the tokeniser keeps a quoted string as one word with its quotes removed, and this rule
// reads a command from its command word, so 'echo "python - <<"', 'grep "python - <<" f' and 'git
// commit -m "python - <<"' are data and allowed. This is the Startup rule's token reading (rule 8
// above), but not its every-token scan: rule 8 refuses a Startup path in any word, quoted or not,
// because naming that folder is the risk; here only running Python is. A command word that holds a
// space after its path is cut is a quoted string, not a program, and is not read.
// Cannot see: the shell residual (bash -c "...", pwsh -c "...", a script on disk); a wrapper with its
// own options (env -i, time -p, sudo, nice, timeout, uv run, poetry run); stdin fed from something
// that is not a heredoc word (echo "code" | python, a here-string in PowerShell's @'...'@ form);
// and a heredoc word given in quotes upstream of a pipe ('echo "<<EOF" | python' is read as a
// heredoc, a false refusal). A line inside another command's heredoc body is split as its own
// sub-command, so a body line that itself starts 'python - <<' is refused (a false refusal).
const PY_INTERP_RX = /^(?:python(?:\d+(?:\.\d+)*)?|py)(?:\.exe)?$/i;
const PY_WRAPPERS = ['env', 'command', 'exec', 'nohup', 'time'];
const PY_VALUED = ['-X', '-W', '--check-hash-based-pycs'];
const HEREDOC_RX = /^-?<</;
const REDIRECT_RX = /^(?:\d*|&)(?:>>?|<(?!<))/;
const REDIRECT_ALONE_RX = /^(?:\d*|&)(?:>>?|<)$/;

// The index of the command word in a sub-command, past the prefixes this rule reads; -1 for none.
function commandWordAt(tokens) {
    let i = 0;
    while (i < tokens.length && (tokens[i] === '&' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || iin(tokens[i], PY_WRAPPERS))) i++;
    return i < tokens.length ? i : -1;
}

// Reads a Python interpreter's words. Returns 'heredoc' (a heredoc word is the code), 'data' (a script
// file, -m or -c is the code), 'stdin' (no code source in the words), or null (not an interpreter).
// words: the interpreter's own words up to the one that decided, for the refusal text.
function pyCodeSource(tokens) {
    const i = commandWordAt(tokens);
    if (i < 0) return null;
    const head = getLeaf(tokens[i]);
    if (!head || /\s/.test(head) || !PY_INTERP_RX.test(head)) return null;
    let stdinScript = false;
    for (let k = i + 1; k < tokens.length; k++) {
        const t = tokens[k];
        const words = [head, ...tokens.slice(i + 1, k + 1)];
        if (HEREDOC_RX.test(t)) return { kind: 'heredoc', words };
        if (REDIRECT_RX.test(t)) { if (REDIRECT_ALONE_RX.test(t)) k++; continue; }   // an operator alone: its target is the next word
        if (t === '-') { stdinScript = true; continue; }
        if (stdinScript) continue;                                    // an argument to stdin's script
        if (PY_VALUED.includes(t)) { k++; continue; }
        if (/^-[A-Za-z]/.test(t)) {
            // A short-option group (-u, -uc, -Xutf8, -V:3.12): c or m ends the options with the code
            // source; X or W takes the rest of the word, or the next word, as its value.
            let valued = false;
            for (const ch of t.slice(1)) {
                if (ch === 'c' || ch === 'm') return { kind: 'data', words };
                if (ch === 'X' || ch === 'W') { valued = true; break; }
                if (!/[A-Za-z]/.test(ch)) break;
            }
            if (valued && /^-[A-Za-z]*[XW]$/.test(t)) k++;
            continue;
        }
        if (t.startsWith('-')) continue;                             // a long option, --, or py's -3.12
        return { kind: 'data', words };                              // a script file
    }
    return { kind: 'stdin', words: [head, ...tokens.slice(i + 1)] };
}

function pyHeredocDeny(hit) {
    const reason = `BLOCKED - no-python-heredoc: this command pipes a heredoc into Python (${hit}).\n\n` +
        'A Python heredoc is refused because broken heredoc one-liners left runaway Python processes behind. ' +
        'Write the code into a script file with the Write or Edit tool, then run that file (python <file>.py).';
    return newDeny('guard', `no-python-heredoc (${hit})`, reason);
}

// subs: every sub-command of the call, from splitCommand; k: the one to read.
export function pythonHeredocRule(subs, k) {
    const tokens = subs && subs[k];
    if (!tokens || tokens.length === 0) return null;
    const src = pyCodeSource(tokens);
    if (!src || src.kind === 'data') return null;
    if (src.kind === 'heredoc') return pyHeredocDeny(src.words.join(' '));
    // No code source in the words: the code is stdin. A heredoc earlier in the same pipeline is it.
    for (let j = k; j > 0 && subs[j].pipedIn; j--) {
        const up = subs[j - 1];
        const h = up.find((t) => HEREDOC_RX.test(t));
        if (h) {
            const w = commandWordAt(up);
            return pyHeredocDeny(`${w >= 0 ? up[w] : ''} ${h} | ${src.words.join(' ')}`.trim());
        }
    }
    return null;
}
