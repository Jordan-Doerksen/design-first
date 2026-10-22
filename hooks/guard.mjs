// guard.mjs - refuses the call that would stage a secret, rewrite git history, touch a frozen path, write source behind an open design gate, leave or push the loop branch, pipe a heredoc into Python, or kill a process by name in a writer session; advises on a write with no manifest or past one Read.
//
// This one refuses. The deny rules, in this order, every one of them a cost already paid somewhere:
//   1. stage-secret  - git add / git commit -a of a file that looks like a credential.
//   2. git-history   - gc --prune, reflog expire, force push, remote branch deletion.
//   3. env-write     - writing a .env that git does not ignore, or that git already tracks.
//   4. frozen-path   - an edit or destructive command inside a frozen or tombstoned path.
//   7. dirty-tree    - reset --hard/--merge/--keep, checkout -- <path>, restore, clean -f,
//                      switch --discard-changes, stash on a dirty tree; stash drop and stash clear
//                      always (SAFE-06).
//   8. no-schedule   - a scheduled task, cron, Run key, service or Startup-folder entry (SAFE-08).
//   9. content-rule  - an edit that adds text a brain content rule bans in its scope (SAFE-02).
//  10. design-gate   - a source Edit, Write or NotebookEdit in a repository whose DECISIONS.md (root
//                      or docs/) declares a design gate that is not cleared, and an Edit or Write
//                      that removes that line while it is not cleared (GATE-08, GATE-09).
//  11. loop-no-push  - git push (or send-pack), merge or pull on a loop branch, or naming a loop
//                      branch from any branch; push --all, --mirror or a glob that covers one; on a
//                      loop branch, a checkout, switch, worktree add, rebase with a branch, bisect
//                      or fetch into a local branch that leaves it or moves another branch onto its
//                      work; a branch rename, copy or forced move, or a ref written by hand, on a
//                      loop branch or naming one; a fetch that writes a loop branch (AUTO-11). A
//                      rebase or bisect of a loop branch stopped at a detached HEAD counts as that
//                      branch.
//                      The git commands that move HEAD or a branch are open-ended: the list in
//                      lib/guard-loop-rules.mjs is what is covered, and any other is a residual.
//  12. ledger        - an Edit, Write or NotebookEdit to the story ledger on a loop branch (AUTO-04).
//  13. no-python-heredoc - a Bash or PowerShell command where a heredoc is Python's code: python,
//                      python3 or py (py -3) with no script file, -m or -c, then '<<'; or a
//                      heredoc piped into such an interpreter (owner ruling 2026-10-20).
//  14. no-blanket-kill - in a writer session only, a kill by image name: taskkill /IM, Stop-Process
//                      or spps -Name (any prefix, or -ProcessName), pkill, killall; a kill by PID
//                      passes (owner ruling 2026-10-22). The residual is in lib/guard-owner-rules.mjs.
// Rules 1-3, 7 and 10-14 run with or without a brain. Rule 4 needs the brain's doctor.config.json;
// without one it is skipped and says so once per session. Rules 8 and 9 run only when the brain
// turns them on (forbidScheduling, contentRules); rule 14 runs unless the brain sets blanketKill false. Rules 5 and 6 advise and never deny. Rules 7-9,
// 13 and 14 live in lib/guard-owner-rules.mjs, rule 10 in lib/guard-gate-rules.mjs, rules 11 and 12 in
// lib/guard-loop-rules.mjs.
//
// What this hook cannot see (the written residual, self-tested as NOT denied so nobody believes
// otherwise): command strings nested in another shell (cmd /c "...", pwsh -c "...", bash -c "..."),
// xargs, $(...) and backtick substitutions, user git aliases, and scripts the agent writes to disk
// and then runs. A git call is read after the prefixes env (its options, short groups such as
// env -iC, long options by any unambiguous prefix such as env --c, and env -C), command, time and
// NAME=value, with -c told from -C, and after every global option git 2.56 lists, --attr-source
// among them (lib/tokenise.mjs). --git-dir and --work-tree, and the GIT_DIR= and GIT_WORK_TREE=
// prefix words: rules 1 and 7 probe in the call's folder with the same options, so they read the
// work tree git uses (with --git-dir alone, the call's folder); rule 11 reads the folder above a
// --git-dir that names <folder>/.git, else the call's folder, where git finds the repository. Of the
// call's config, rules 1 and 7 carry core.excludesFile, from -c and from GIT_CONFIG_COUNT with its
// GIT_CONFIG_KEY_<n> and GIT_CONFIG_VALUE_<n> words. Not read: any other wrapper before git (exec,
// nohup, nice, timeout, sudo, stdbuf); env -S; a GIT_ word set by export, $env: or the session
// environment rather than as a prefix word; a config value given by --config-env or
// GIT_CONFIG_PARAMETERS, or any -c value but core.excludesFile (rules 1 and 7 probe with the
// repository's own config plus that one value, so another value that changes what git ignores is
// not seen); a global option a later git adds; and, for rule 11, a --git-dir that does not end in
// .git (it reads the call's folder). Rules 4 and 8 read the first word only, so a prefix before rm,
// Remove-Item or schtasks hides the command from them. Secret files created by cp or echo > are not
// seen here either; they are caught at staging by rule 1's wildcard probe. Rules 3, 10 and 12 read
// file-tool calls only: a plain shell write (a redirect, Set-Content, cp) of a .env, of source
// behind an open design gate, or of the story ledger is not inspected. Rule 4 compares paths after toFullPath, which resolves the symbolic
// links of the nearest existing folder and, on Windows, maps a \\?\ or \\.\ prefix, \\?\UNC\, this
// machine's admin share (\\localhost\C$, \\127.0.0.1\C$) and a PowerShell provider path
// (FileSystem::C:\...) to the drive path. Another spelling of a frozen folder (an 8.3 short name, a
// hard link, a \\?\Volume{...} path, this machine by its own name or another address) is not seen as
// that folder. Rule 4's shell form skips every token that starts with '-', so a PowerShell parameter
// with its value joined by a colon (Remove-Item -LiteralPath:C:\...) is not read either.
//
// Failure policy: the body is wrapped. An internal error ALLOWS the call, appends an ERROR line to
// the hooks log and says so on both channels. Deliberately not fail-closed, never silent. It also
// appends a line to <markers>/<session>.guard-error, so the Stop card says its count may be short.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStdin } from './lib/stdin.mjs';

let raw = '';
let sessionId = '';
let result = null;

try {
    raw = readStdin();
    const C = await import('./lib/common.mjs');
    const { splitCommand, getGitCall } = await import('./lib/tokenise.mjs');
    const R = await import('./lib/guard-rules.mjs');
    const O = await import('./lib/guard-owner-rules.mjs');
    const { isWriterSession } = await import('./lib/law-rows.mjs');
    const { designGateRule } = await import('./lib/guard-gate-rules.mjs');
    const { loopPushRule, ledgerRule } = await import('./lib/guard-loop-rules.mjs');
    const T = await import('./lib/turn-changes.mjs');

    if (C.isBlank(raw)) throw new Error('empty stdin (no tool call payload)');
    const j = JSON.parse(raw);
    const tool = C.str(j.tool_name);
    const ti = j.tool_input;
    sessionId = C.str(j.session_id);
    const cwd = j.cwd ? C.toFullPath(String(j.cwd)) : process.cwd();
    if (ti == null) throw new Error(`payload has no tool_input (tool_name='${tool}')`);

    const ptr = C.readPointer();
    if (ptr.warning) R.addAdvisory('pointer unreadable', `${ptr.warning}. Inline rules still ran; path rules skipped.`);
    // A broken brain config must not stop rules 1-3 (F1: the live guard exited before the inline
    // checks when its config was missing). Read it defensively; a parse error becomes an advisory.
    let cfg;
    try { cfg = C.readBrainConfig(ptr); }
    catch (e) {
        cfg = C.defaultBrainConfig();
        cfg.reason = `doctor.config.json unreadable: ${e.message}`;
        C.writeLog('ERROR', 'guard', cfg.reason);
        R.addAdvisory('brain config unreadable, path rules skipped', `${cfg.reason}. Inline rules still ran.`);
    }
    const owner = C.getOwnerName(ptr.brain);
    for (const p of cfg.contentRuleProblems) { if (p) { C.writeLog('ERROR', 'guard', p); R.addAdvisory('content rule unreadable, skipped', `${p}. The other rules still ran.`); } }

    let full = null;
    let subs = [];
    const isFileTool = ['Edit', 'Write', 'NotebookEdit'].includes(tool);
    const isShell = tool === 'Bash' || tool === 'PowerShell';
    if (isFileTool) {
        const fp = tool === 'NotebookEdit' ? C.str(ti.notebook_path) : C.str(ti.file_path);
        full = C.toFullPath(fp, cwd);
        if (!result) result = R.envWriteRule(full, cfg.exceptions, owner);
        if (!result && cfg.present) result = R.pathRuleFile(full, cfg.protected, owner, cfg.tombstoned);
        if (!result && cfg.forbidScheduling) result = O.scheduleRuleFile(full, owner);
        if (!result && cfg.contentRules.length > 0) result = O.contentRuleFile(tool, ti, full, cfg.contentRules, owner);
        // Brain tunables when present, built-in defaults otherwise (rules 5, 6 and 10 share them).
        const exts = cfg.sourceExtensions.length > 0 ? cfg.sourceExtensions : R.DEFAULT_SOURCE_EXTENSIONS;
        const ceiling = Number(cfg.readCeilingBytes);   // 0 turns the read check off (DES-03); the default lives in readBrainConfig
        const skip = [ptr.brain, ptr.pointer && ptr.pointer.pluginRoot ? C.toFullPath(String(ptr.pointer.pluginRoot)) : null].filter((x) => x);
        // Rule 10 denies: a source write in a repository whose design gate is declared and not cleared,
        // and an Edit or Write that removes the gate line from DECISIONS.md while it is not cleared.
        if (!result) result = designGateRule(full, exts, owner, skip, tool, ti);
        // Rule 12 denies: the story ledger on the loop branch.
        if (!result) result = ledgerRule(full, cfg.loopLedgerGlobs, cfg.loopBranchPrefix, owner);
        if (!result) {
            // Rules 5 and 6 advise; they never deny.
            R.manifestRule(full, exts, sessionId, owner, skip);
            R.sizeRule(tool, ti, full, exts, ceiling, cfg.readCeilingExempt, sessionId);
        }
    } else if (isShell) {
        const cmd = C.str(ti.command);
        if (!C.isBlank(cmd)) {
            subs = splitCommand(cmd, tool);
            // The folder a sub-command runs in, after any cd before it in the same command line. Every
            // shell rule reads it: rules 1, 2, 4, 7, 11 and the shell content rule (rule 3 has no shell
            // form). Workaround (CR-2026-10-15-GAPS D1): rules 1-4 used to keep the tool call's cwd, so
            // 'cd <repo> && git add -A' probed the wrong folder, or no repository, and staged a secret.
            // A cd is followed only to a folder that exists. A target the hook cannot resolve (a
            // variable, a substitution such as "$(git rev-parse --show-toplevel)", a folder the same
            // command makes first) keeps the folder the rules had: followed, it named no repository,
            // every probe failed, and 'cd "$(git rev-parse --show-toplevel)" && git add -A' staged a
            // secret that the tool call's own folder would have shown.
            let runCwd = cwd;
            for (const [k, tokens] of subs.entries()) {
                if (tokens.length >= 2 && C.iin(tokens[0], ['cd', 'Set-Location', 'sl', 'pushd', 'Push-Location', 'chdir'])) {
                    const to = C.toFullPath(tokens[tokens.length - 1], runCwd);
                    if (to && C.isDir(to)) runCwd = to;
                }
                const call = getGitCall(tokens, runCwd);
                if (call) {
                    if (!result) result = R.stagingRule(call, cfg.exceptions, owner);
                    if (!result) result = R.historyRule(call, owner);
                    if (!result) result = O.dirtyTreeRule(call, owner);
                    // Rule 11 denies: push (or send-pack), merge or pull on a loop branch or naming one from any branch,
                    // push --all or --mirror while a loop branch exists, and the commands that leave a
                    // loop branch or move a branch onto its work: checkout, switch, worktree add, rebase
                    // with a branch, bisect, fetch into a local branch, branch -m/-c/-f, update-ref and
                    // symbolic-ref (the full list, and its residual, in lib/guard-loop-rules.mjs).
                    if (!result) result = loopPushRule(call, cfg.loopBranchPrefix, owner);
                }
                if (!result && cfg.present) result = R.pathRuleShell(tokens, call, runCwd, cfg.protected, owner);
                if (!result && cfg.forbidScheduling) result = O.scheduleRuleShell(tokens, owner);
                // Rule 13 denies a heredoc that is Python's code ('python3 - <<EOF', 'python <<EOF',
                // 'cat <<EOF | python'), always, brain or no brain. It reads the whole pipeline.
                if (!result) result = O.pythonHeredocRule(subs, k);
                // Rule 14 denies a kill by image name, in a writer session only (the role route.mjs wrote).
                if (!result && cfg.blanketKill && isWriterSession(sessionId)) result = O.blanketKillRule(tokens, tool);
                if (result) break;
            }
            if (!result && cfg.contentRules.length > 0) result = O.contentRuleShell(cmd, runCwd, cfg.contentRules, owner);
        }
    }

    // No brain: rules 1-3 ran above; rule 4 was skipped. Say so once per session (finding 63).
    if (!result && !cfg.present && C.firstTime(sessionId, 'advised')) {
        R.addAdvisory('no brain, path rules skipped this session',
            `design-first found no brain (${cfg.reason}). The staging, history and .env rules still run; ` +
            'frozen and tombstoned path rules are skipped until a brain exists. Run /design-first:adopt to create one. ' +
            'This notice appears once per session.');
    }

    // The edit ledger for stop.mjs: every ALLOWED Edit / Write / NotebookEdit of this turn, one line
    // "path<TAB>flags". route.mjs clears it at each prompt. A DECISIONS.md write that ADDS a Change Log
    // row ("| 2026-10-08 | ...") is flagged, so the Stop card can tell a Change Request from a drift
    // edit when git cannot say (stop.mjs prefers git's count). Only an edit inside a git repository, and
    // under the root when the pointer names one, is recorded (getLedgerRepo): a scratch file is not a change.
    if (!result && isFileTool && full && R.getLedgerRepo(full, ptr.root)) {
        let flags = '';
        if (C.getLeaf(full).toLowerCase() === 'decisions.md') {
            // Workaround (CR-2026-10-15-GAPS D5): any dated row in the new text set the flag, and a Write
            // sends the whole file, so every Write that kept an old row, and every Edit that reworded one,
            // passed for a new Change Log entry and hid the GATE-06 line. Now the new text must hold more
            // dated rows than what it replaces: an Edit's old_string, or for a Write the file on disk
            // (none when the file is new). A file that cannot be read sets no flag: the card then asks.
            let newText; let before = 0;
            if (tool === 'Write') {
                newText = C.str(ti.content);
                if (C.isFile(full)) { try { before = T.countRows(C.readText(full)); } catch { before = Number.MAX_SAFE_INTEGER; } }
            } else {
                newText = C.str(ti.new_string);
                before = T.countRows(C.str(ti.old_string));
            }
            if (T.countRows(newText) > before) flags = 'changelog';
        }
        C.addTextLine(C.sessionFile(sessionId, '.edits'), `${full}\t${flags}`);
    }

    // Nominate the repositories this call points at (lib/turn-changes.mjs). The ledger above only
    // holds Edit and Write calls; a file a command changes is never in it. stop.mjs asks git what
    // changed since the prompt in every nominated repository, so a script's edits are seen too.
    if (!result) {
        let noms = [];
        if (isFileTool) { if (full) noms = [T.findRepoDir(full, ptr.root)]; }
        else if (isShell && !C.isBlank(ti.command)) noms = T.shellRepos(subs, cwd, ptr.root);
        T.addNominations(sessionId, noms.filter((x) => x));
    }

    if (result) {
        C.addTextLine(C.getFenceLogPath(), `${C.stampNow()}  BLOCKED[${result.systemMessage}]`);
        C.writeJson(result);
    } else if (R.advisories.length > 0) {
        C.writeJson(C.newAdvisory('guard', R.advisories));
    }
} catch (e) {
    // Internal error: allow, log, surface. Written inline so it works even when lib/ failed to load.
    const msg = e && e.message ? e.message : String(e);
    const flat = msg.replace(/\s+/g, ' ');
    const iso = new Date().toISOString();
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${iso} ERROR guard ${flat}\n`, 'utf8');
    } catch { /* never fatal */ }
    // This call wrote no ledger line and no nomination, so the Stop card's count can be short. Say so
    // to the card: one line per failed call in <markers>/<session>.guard-error, which stop.mjs counts
    // and route.mjs clears at the next prompt (CR-2026-10-15-GAPS D5; a failure here used to drop the
    // call from the card without a word). Inline paths, as above, the same names as sessionFile.
    try {
        // The payload is read before any library loads, so a library that fails to load still
        // leaves the session id here; without it the call would count under 'unknown', a session no
        // Stop card reads.
        let sid = sessionId && sessionId.trim() ? sessionId : null;
        if (!sid) { const m = /"session_id"\s*:\s*"([^"]+)"/.exec(raw || ''); sid = m ? m[1] : 'unknown'; }
        const markerDir = process.env.DF_MARKER_DIR || path.join(os.tmpdir(), 'design-first');
        fs.mkdirSync(markerDir, { recursive: true });
        fs.appendFileSync(path.join(markerDir, sid.replace(/[^A-Za-z0-9_.-]/g, '_') + '.guard-error'), `${iso}\t${flat}\n`, 'utf8');
    } catch { /* never fatal */ }
    process.stdout.write(JSON.stringify({
        systemMessage: `GUARD: internal error, call allowed (${msg})`,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `guard hook hit an internal error and ALLOWED this call without inspecting it: ${msg}. Logged to the design-first hooks log.` },
    }) + '\n');
}
process.exitCode = 0;
