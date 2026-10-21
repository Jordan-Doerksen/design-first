// stop.mjs - ends a turn that changed source with its card, asked once: documents, the verify gate, the Change Request, the cross-check, the Definition of Done (DES-07, GATE-01, GATE-05/06/07, GAME-12).
//
// When the turn changed source and the model tries to stop, this hook refuses ONCE and hands back
// the card: the documents touched or not (DES-07), the Change Log row when DECISIONS.md changed
// (GATE-06), the Change Request question on every card (GATE-06), the verify gate's command and its
// output (GAME-12), the cross-check (GATE-05) and the Definition of Done (GATE-07). The card's first
// line names every clause it carries, GATE-01 only when its interview line is on the card. The model
// answers the card in its reply; the next stop attempt (stop_hook_active) passes. A turn that
// changed no source, or only documents, is not stopped, except in a repository whose git status
// listed more entries than the cap (its count is a floor, below). A document is a name on the
// stopDocs list, or a file in a docs folder inside the repository whose extension is not a source
// extension, so a generator script such as docs/build.mjs is source. Owner decision 2026-10-08:
// block once, then yield.
//
// What changed is read from the disk, not from the tool calls (lib/turn-changes.mjs). The guard
// nominates every repository this turn's calls pointed at; for each one git says which files are in
// a commit made since the prompt, or are uncommitted and were written since the prompt. So a
// document a script wrote is a document touched, and a source file a command changed counts.
// Before 0.1.15 the card saw only Edit and Write calls, and said "Documents touched: none" over five
// documents a patch script had just written.
//
// Fallbacks, each named on the card when it applies: a session with no prompt time on record, or
// `stopFromGit` false in the brain config, or a repository git cannot read, is counted from the
// edit ledger (<markers>/<session>.edits, the Edit / Write / NotebookEdit calls the guard allowed).
// Scope: only a git repository counts, and only under the root when the pointer names one.
//
// A count that may be short says so (CR-2026-10-15-GAPS D5). A repository whose git status listed
// more entries than the cap is carded with its count called a floor. Repositories not read before
// the time budget ran out (stopBudgetSeconds in the brain config, under the host's timeout) are
// named. Calls the guard failed on (<markers>/<session>.guard-error) are counted. With no source
// change to card, an unread repository or a guard failure goes to the owner as a systemMessage;
// none of the three is a silent pass.
//
// Off per role (0.2.11, CR-2026-10-21-COMMAND STOP-1, the owner's "ship the kit"): the brain config
// key stopCard { owner, writer } turns the card off for a session role; the role is the one the
// router wrote in <session>.role on the first prompt (writer = a brief with a line-start
// "Reports to:", else owner; no file reads as owner). Off means no card and no block: the turn
// ends, one INFO line goes to the hooks log, and the notices about a short count still reach the
// owner as a systemMessage. Both default to on, so an adopter who never set the key sees no change.
//
// Honest limit: the hook can require the card, not grade the answer. A model's claim that the
// cross-check passed is a claim (AUTO-06); no kit check grades the answer, and the Doctor proves
// only that the hook starts (KIT-SMOKE-07). The Stop event is the main session's: the kit registers
// no SubagentStop hook, so a subagent's own stop gets no card; its changes count on the card of
// the session turn it ran in, when its calls pointed at that repository.
// What the disk reading cannot see is written at the top of lib/turn-changes.mjs.
//
// Mode advise, not deny (CR-2026-10-15-GAPS D4): the hook blocks the first stop once, yields on the
// second whatever the answer says, and grades nothing. So the clauses it carries grade ADVISE; up to
// 0.1.38 they printed HOOK, which says that a machine refuses the breach, and this hook does not.
// anchor: stop-done  mode: advise  verbs: document,cross-check,change,finish,gate-change
//
// interview (GATE-01, 0.1.23): a repository whose .git was created since the prompt is an addition
// this turn. When no question was asked this session (no <session>.asked marker, written by
// ask.mjs), the card carries the interview line for that repository. Same refusal, once; advise
// for the same reason.
//
// anchor: interview  mode: advise  verbs: interview

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStdin } from './lib/stdin.mjs';

const started = Date.now();   // the time budget (stopBudgetSeconds) counts from here
const DEFAULT_STOP_DOCS = ['DECISIONS.md', 'ARCHITECTURE.md', 'HANDOFF.md', 'CHANGELOG.md', 'README.md', 'SPEC.md', 'MANUAL.md'];

try {
    const raw = readStdin();
    const C = await import('./lib/common.mjs');
    const R = await import('./lib/guard-rules.mjs');   // getLedgerRepo, the default source extensions
    const T = await import('./lib/turn-changes.mjs');
    const L = await import('./lib/law-rows.mjs');      // isWriterSession: the role the router wrote

    // A turn with nothing to card can still have a count that is short: say so to the owner, block nothing.
    const notice = (notes) => {
        if (notes.length === 0) return;
        C.writeLog('WARN', 'stop', notes.join('; '));
        C.writeJson({ systemMessage: 'STOP: no source change was found to card, and the count may be short: ' + notes.join('; ') + '.' });
    };

    let j = null;
    if (raw.trim()) { try { j = JSON.parse(raw); } catch { j = null; } }
    const sessionId = j && j.session_id ? String(j.session_id) : 'unknown';
    const active = Boolean(j && j.stop_hook_active);

    main: {
        if (active) break main;                                   // the card was handed over already; yield

        const ledgerFile = T.sessionFile(sessionId, '.edits');
        const lines = C.isFile(ledgerFile) ? C.readText(ledgerFile).split(/\r?\n/).filter((l) => l.trim()) : [];
        const nominated = T.readNominations(sessionId);           // { repo, base }: HEAD at the turn's first call there
        // Calls the guard failed on this turn recorded nothing (guard.mjs's catch block counts them here).
        const guardErrFile = T.sessionFile(sessionId, '.guard-error');
        const guardErrors = C.isFile(guardErrFile) ? C.readText(guardErrFile).split(/\r?\n/).filter((l) => l.trim()).length : 0;
        const guardNote = `the guard failed on ${guardErrors} call(s) this turn and recorded none of them`;
        if (lines.length === 0 && nominated.length === 0) {
            if (guardErrors > 0) notice([guardNote]);
            break main;
        }
        const baseOf = new Map(nominated.map((n) => [n.repo, n.base]));

        const ptr = C.readPointer();
        let cfg = C.defaultBrainConfig();
        cfg.readCeilingBytes = 0;
        try { cfg = C.readBrainConfig(ptr); } catch { /* defaults */ }
        // stopCard (0.2.11): the card is off for this session's role. Nothing is read from git, so the
        // short-count notices cannot be built either; the guard-error note still goes to the owner.
        const role = L.isWriterSession(sessionId) ? 'writer' : 'owner';
        if (cfg.stopCard && cfg.stopCard[role] === false) {
            C.writeLog('INFO', 'stop', `card off for this ${role} session (stopCard.${role} false in ${ptr.brain ? path.join(ptr.brain, 'doctor.config.json') : 'the brain config'})`);
            if (guardErrors > 0) notice([guardNote]);
            break main;
        }
        const exts = cfg.sourceExtensions.length > 0 ? cfg.sourceExtensions : R.DEFAULT_SOURCE_EXTENSIONS;
        const docs = cfg.stopDocs.length > 0 ? cfg.stopDocs : DEFAULT_STOP_DOCS;
        const since = T.turnStart(sessionId);
        const fromGit = since != null && cfg.stopFromGit !== false;
        const budget = Number(cfg.stopBudgetSeconds) || C.STOP_BUDGET_DEFAULT;

        // The edit ledger, by repository: the paths the Edit / Write calls named, and the Change Log flag.
        // A path outside the root or in no repository is skipped (0.1.9).
        const ledger = new Map();
        const findKey = (map, k) => { for (const key of map.keys()) if (C.pathEq(key, k)) return key; return null; };
        for (const l of lines) {
            const parts = l.split('\t');
            const p = parts[0]; const flags = parts.length > 1 ? parts[1] : '';
            let repo = R.getLedgerRepo(p, ptr.root);
            if (!repo) continue;
            // Same spelling of the folder as the guard's nominations use, so one repository is one group.
            const asNominated = T.findRepoDir(p, ptr.root); if (asNominated) repo = asNominated;
            const key = findKey(ledger, repo) || repo;
            if (!ledger.has(key)) ledger.set(key, { paths: [], changelog: false });
            const led = ledger.get(key);
            if (!led.paths.includes(p)) led.paths.push(p);
            if (/changelog/i.test(flags)) led.changelog = true;
        }

        // Every repository to look at: the ledger's, and the ones the guard nominated from shell calls.
        const repos = [];
        for (const r of [...ledger.keys(), ...(fromGit ? nominated.map((n) => n.repo) : [])]) {
            if (!r) continue;
            if (ptr.root && !C.isUnder(r, ptr.root)) continue;
            if (!repos.some((x) => C.pathEq(x, r))) repos.push(r);
        }

        const groups = new Map();
        const unread = [];                                       // repositories git was not asked about in time
        for (const repo of repos) {
            const g = { src: [], docs: [], decisions: false, changelog: false, how: 'calls', capped: false, cap: 0, born: false };
            const paths = [];
            const lk = findKey(ledger, repo);
            const led = lk ? ledger.get(lk) : null;
            let ch = null;
            // The time budget (CR-2026-10-15-GAPS D5): the host ends this hook at its timeout, and an ended
            // hook says nothing. Git is read one repository at a time; once the budget is spent, the rest
            // are counted from the ledger and named on the card. One git call that outlasts what is left
            // of the budget is still ended by the host.
            const late = fromGit && (Date.now() - started) / 1000 >= budget;
            if (late) unread.push(repo);
            else if (fromGit && C.isDir(repo)) {
                const bk = findKey(baseOf, repo);
                ch = T.turnChanges(repo, since, bk ? baseOf.get(bk) : '');
            }
            if (ch && ch.ok) {
                g.how = 'git';
                g.capped = ch.capped; g.cap = ch.cap;
                if (g.capped) C.writeLog('WARN', 'stop', `git status in ${repo} listed more than ${g.cap} entries; the rest were not read, so the card's count there is a floor`);
                for (const rel of ch.paths) paths.push(path.join(repo, rel));
                // A file git ignores is in no status list. When an Edit or Write named it and it was
                // written since the prompt, it changed; a call that was allowed and then failed did not.
                if (led) {
                    for (const p of led.paths) {
                        if (paths.some((x) => C.pathEq(x, p))) continue;
                        let st = null; try { st = fs.statSync(p); } catch { st = null; }
                        if (st && st.isFile() && st.mtimeMs >= since) paths.push(p);
                    }
                }
                // Git's count of added dated rows decides for a DECISIONS.md that git listed. The ledger flag
                // counts only for one git does not list (an ignored file). Workaround (CR-2026-10-15-GAPS D5):
                // the flag was OR-ed in, so a flag from any Write that kept an old row overrode git's answer.
                const gitSawDecisions = ch.paths.some((p) => C.getLeaf(p).toLowerCase() === 'decisions.md');
                g.changelog = ch.decisionsRow || (!gitSawDecisions && Boolean(led) && led.changelog);
            } else {
                if (led) { paths.push(...led.paths); g.changelog = led.changelog; }
                if (late) g.how = 'calls-time-limit';
                else if (fromGit) g.how = 'calls-git-failed';
            }
            for (const p of paths) {
                const leaf = C.getLeaf(p);
                const ext = C.getExt(p);
                // A document: a name on the stopDocs list, or a file in a docs folder INSIDE the repository
                // whose extension is not a source extension. Workaround (CR-2026-10-15-GAPS D5): the docs
                // test read the full path, so in a repository below any folder named docs every file was a
                // document and the card never came; and a script such as docs/build.mjs was a document.
                const relRaw = C.relUnder(p, repo);
                const rel = relRaw != null ? relRaw : leaf;
                const isSource = exts.includes(ext);
                const isDoc = docs.some((d) => d.toLowerCase() === leaf.toLowerCase()) || (!isSource && /(^|[\\/])docs[\\/]/i.test(rel));
                if (isDoc) {
                    if (!g.docs.includes(leaf)) g.docs.push(leaf);
                    if (leaf.toLowerCase() === 'decisions.md') g.decisions = true;
                } else if (isSource) { if (!g.src.includes(p)) g.src.push(p); }
            }
            groups.set(repo, g);
        }
        if (unread.length > 0) C.writeLog('WARN', 'stop', `time budget of ${budget} s spent before git was read in: ${unread.join(', ')}`);

        // A repository past the git status cap is a hit even with no source counted: its count is a floor,
        // and a floor of zero is not a pass (OBS-07; the capped flag used to be set and never read).
        const byName = (a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
        const hits = [...groups.keys()].filter((k) => groups.get(k).src.length > 0 || groups.get(k).capped).sort(byName);
        const unreadQuiet = unread.filter((u) => !hits.includes(u)).sort(byName);
        const budgetNote = `the time budget (stopBudgetSeconds, ${budget} s) ran out before git was read in ${unreadQuiet.join(', ')}, so a change made there is not in the count`;
        if (hits.length === 0) {
            const notes = [];
            if (unreadQuiet.length > 0) notes.push(budgetNote);
            if (guardErrors > 0) notes.push(guardNote);
            notice(notes);
            break main;
        }

        // GATE-01: a repository born this turn, with no question asked this session.
        const asked = C.isFile(T.sessionFile(sessionId, '.asked'));
        const owner = C.getOwnerName(ptr.brain);
        for (const repo of hits) {
            const g = groups.get(repo);
            if (since == null) continue;
            // When the .git folder was made: its birth time, or, on a file system that keeps none, the
            // write time of .git/description, which git init writes once and nothing rewrites. Not the
            // change time: every git write inside .git moves it, and every repository would look new.
            const gitDir = path.join(repo, '.git');
            try {
                let born = fs.statSync(gitDir).birthtimeMs;
                if (!born) { try { born = fs.statSync(path.join(gitDir, 'description')).mtimeMs; } catch { born = 0; } }
                g.born = born > 0 && born >= since;
            } catch { g.born = false; }
        }

        // The first line names every clause the card carries (CR-2026-10-15-GAPS D4): GATE-06 and GAME-12
        // ride on every card, GATE-01 when a repository on it carries the interview line. Before, the line
        // named four of the six, so the agent was not told that the card also asked for GAME-12 and
        // GATE-01. GATE-06 has a line of its own on every card, the Change Request question below, so the
        // first line never names a clause the card does not ask about. Workaround (CR-2026-10-15-GAPS
        // second review): a fix round named GATE-06 only with the Change Log line, and the common case of
        // a missing Change Request, a behaviour change that does not touch DECISIONS.md, then got no
        // GATE-06 at all.
        const interview = hits.some((h) => groups.get(h).born && !asked);
        const carried = ['DES-07', ...(interview ? ['GATE-01'] : []), 'GATE-05', 'GATE-06', 'GATE-07', 'GAME-12'];
        const out = [`design-first: this turn changed source. Answer this card in your reply, then stop (${carried.join(', ')}; the hook asks once per turn).`];
        for (const root of hits) {
            const g = groups.get(root);
            out.push('');
            out.push(`Repository ${root}: ${g.src.length} source file(s) changed.`);
            if (g.docs.length > 0) out.push('  Documents touched: ' + g.docs.join(', ') + '.');
            else out.push('  Documents touched: none. DES-07: documents are co-equal; say which document should carry this change, or why none does.');
            if (g.decisions && !g.changelog) out.push('  DECISIONS.md was edited with no Change Log row. GATE-06: a change to a decision is a Change Request; add the row, or say why this edit is not one.');
            if (g.born && !asked) out.push(`  This repository was created this turn and no question was asked this session. GATE-01: every addition gets the interview, however detailed the request; interview ${owner} now with one question at a time, or say why this is a toy or a throwaway.`);
            if (g.how === 'calls-git-failed') out.push('  git could not be read here, so this repository is counted from Edit and Write calls only; a file a command changed is not in the count.');
            if (g.how === 'calls-time-limit') out.push(`  The time budget (stopBudgetSeconds, ${budget} s) ran out before git was read here, so this repository is counted from Edit and Write calls only; a file a command changed is not in the count.`);
            if (g.capped) out.push(`  git status listed more than ${g.cap} entries here; the entries past that were not read, so this count is a floor.`);
        }
        if (unreadQuiet.length > 0) { out.push(''); out.push('Not read: ' + budgetNote + '.'); }
        if (guardErrors > 0) { out.push(''); out.push('Not recorded: ' + guardNote + ', so this count may be short.'); }
        out.push('');
        if (hits.some((h) => groups.get(h).how === 'git')) {
            out.push("Read from git, for each repository this turn's tool calls pointed at: files in a commit made since the prompt, and uncommitted files written since the prompt.");
        } else {
            out.push('Counted from Edit and Write calls only; a file a command changed is not in the count, and an edit refused after the guard allowed it can still be in the count.');
        }
        out.push("Inner gate (GAME-12): the repository's verify gate command and its output, pasted, for each small change this turn; or say that this was the trivial, reversible, single-file edit the owner asked for, which the inner gate exempts.");
        out.push('Change Request (GATE-06): did this turn change design, behaviour, config, risk, execution, data flow or dependencies? If it did, name its Change Request; if it did not, say so.');
        out.push('Cross-check (GATE-05): does the change still fit DECISIONS.md, ARCHITECTURE.md and the core goal? Name any clash.');
        out.push('Definition of Done (GATE-07): what ran to prove it (command and its output, pasted, AUTO-06); any locked decision contradicted; does the result fit one screen of explanation.');
        out.push('Nothing on this card is checked by a machine: this hook asks once and does not grade the answer, and no Doctor claim reads it (AUTO-06).');

        const srcTotal = hits.reduce((n, h) => n + groups.get(h).src.length, 0);
        C.addTextLine(C.getFenceLogPath(), `${C.stampNow()}  STOP[card: ${hits.length} repository(ies), ${srcTotal} source file(s)]`);
        C.writeJson({ decision: 'block', reason: out.join('\n').trimEnd() });
    }
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR stop ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    // An internal error never traps the session: allow the stop, say so to the user.
    process.stdout.write(JSON.stringify({ systemMessage: `STOP: internal error, turn allowed to end (${msg})` }) + '\n');
}
process.exitCode = 0;
