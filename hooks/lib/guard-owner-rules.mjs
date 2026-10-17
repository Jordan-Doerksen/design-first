// guard-owner-rules.mjs - guard rules 7-9: the owner's standing prohibitions, as refusals.
// Imported by guard.mjs after guard-rules.mjs. Split from guard-rules.mjs by domain (DES-03): rules
// 1-6 guard secrets, history, frozen paths and the build method; rules 7-9 guard the owner's
// uncommitted work, their machine's start-up, and the content bans their brain configures.
// Each rule returns null (no opinion) or a deny object from newDeny.

import { newDeny, toFullPath, isUnder, getLeaf, getExt, git, exists, isFile, iin, countMatches, ieq } from './common.mjs';
import { readFileText } from './guard-rules.mjs';

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
        const st = git(call.cwd, ['status', '--porcelain']);
        // Not a repository, or git failed: git itself refuses or reports it. No opinion here.
        if (st.code !== 0) return null;
        const n = st.out.filter((l) => l).length;
        if (n === 0) return null;
        state = `the work tree at ${call.cwd} has ${n} uncommitted or untracked change(s)`;
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
