// turn-changes.mjs - what changed on the disk during this turn, read from git. Imported by guard.mjs,
// route.mjs and stop.mjs. Never run directly.
//
// Why. The Stop card was built from the edit ledger alone: the Edit / Write / NotebookEdit calls the
// guard allowed. A file changed by a command (a patch script, sed, a formatter, a generator) was
// never in it. On 2026-10-08 the card said "Documents touched: none" over five documents a script
// had just written, and a turn that changed source only through commands got no card at all. A
// ledger of tool calls is a record of intentions. What changed is a fact about the disk (PRIN-03),
// so it is read from the disk: the tool calls only NOMINATE repositories, and git says what changed
// in each of them since the prompt.
//
//   <markers>/<session>.turn    when the owner's last prompt arrived (route.mjs writes it)
//   <markers>/<session>.repos   one line per repository this turn's tool calls pointed at, with
//                               the commit HEAD was on at the first such call (guard.mjs appends;
//                               "none" when the repository had no commit). A wrong nomination
//                               costs a few git calls and changes nothing, because git is the judge.
//   <markers>/<session>.guard-error  one line per call the guard failed on inside this turn, so it
//                               recorded nothing for that call (guard.mjs's catch block appends;
//                               route.mjs clears it with the others). The card says the count may be short.
//
// A file counts as changed this turn when it is in a commit made since that first call (the
// commits between the recorded HEAD and HEAD now, less any older than the prompt, which a pull
// brought in), or it is uncommitted now and was written since the prompt, or it is gone and its
// folder was written since the prompt.
//
// Honest limits. A repository no tool call pointed at is not looked at: a script run from folder A
// that writes into repository B, with B named nowhere on the command line, is not seen. A write
// that keeps the old last-write time (a copy that preserves times) is not seen. A commit made this
// turn counts every file in it, also one that was edited before the prompt. A file git ignores is
// seen only when an Edit or Write call named it. The times are this machine's clock.

import fs from 'node:fs';
import path from 'node:path';
import {
    sessionFile, toFullPath, isUnder, pathEq, nearestExistingDir, exists, isFile, git, addTextLine, readText,
    parseIso, getLeaf, FOLD_CASE,
} from './common.mjs';

export { sessionFile };

// The nearest folder at or above `full` that holds a .git entry, found on the file system, with no
// git process. stopAt (the root, when a pointer names one) bounds the climb.
export function findRepoDir(full, stopAt) {
    if (!full) return null;
    let d = nearestExistingDir(full);
    while (d) {
        if (stopAt && !isUnder(d, stopAt)) return null;
        if (exists(path.join(d, '.git'))) return d;
        const parent = path.dirname(d);
        if (!parent || parent === d) return null;
        d = parent;
    }
    return null;
}

// The repositories a shell call points at: the one holding its working folder, and the one holding
// any word of the command that is a path under the root (cd <dir>, git -C <dir>, a file argument).
// Words that are not paths resolve to nothing or to the working folder's own repository.
export function shellRepos(subs, cwd, root) {
    const set = new Map();
    const add = (r) => { const k = FOLD_CASE ? r.toLowerCase() : r; if (!set.has(k)) set.set(k, r); };
    const r0 = findRepoDir(cwd, root);
    if (r0) add(r0);
    let n = 0;
    outer:
    for (const tokens of subs || []) {
        for (const w of tokens || []) {
            if (w.length < 2 || w.length > 400 || w.startsWith('-') || /[*?<>|"=;]/.test(w)) continue;
            if (++n > 200) break outer;
            const full = toFullPath(w, cwd);
            if (!full) continue;
            if (root && !isUnder(full, root)) continue;
            const r = findRepoDir(full, root);
            if (r) add(r);
        }
    }
    return [...set.values()];
}

// The nominated repositories of this turn: { repo, base } each, first line per repository wins.
export function readNominations(sessionId) {
    const file = sessionFile(sessionId, '.repos');
    if (!isFile(file)) return [];
    const out = []; const seen = [];
    for (const l of readText(file).split(/\r?\n/)) {
        if (!l.trim()) continue;
        const parts = l.split('\t');
        const repo = parts[0].trim();
        if (!repo || seen.some((s) => pathEq(s, repo))) continue;
        seen.push(repo);
        out.push({ repo, base: parts.length > 1 ? parts[1].trim() : '' });
    }
    return out;
}

// Records each repository once per turn, with the commit HEAD is on now. The guard calls this
// BEFORE the tool call runs, so that commit is the one the turn started from in this repository,
// and "the commits made this turn" is an exact range, not a comparison of clock times (git keeps
// commit times by the second; the first version compared times and lost a commit made in the
// prompt's own second).
export function addNominations(sessionId, repos) {
    if (!repos || repos.length === 0) return;
    const file = sessionFile(sessionId, '.repos');
    const have = readNominations(sessionId).map((x) => x.repo);
    for (const r of repos) {
        if (!r || have.some((h) => pathEq(h, r))) continue;
        const h = git(r, ['rev-parse', '-q', '--verify', 'HEAD']);
        const base = h.code === 0 && h.out.length ? h.out[0].trim() : 'none';
        addTextLine(file, `${r}\t${base}`);
        have.push(r);
    }
}

// The time of the owner's last prompt in milliseconds, or null when this session has none on
// record (a session that started before this file existed): the caller then falls back to the edit ledger.
export function turnStart(sessionId) {
    const file = sessionFile(sessionId, '.turn');
    if (!isFile(file)) return null;
    try { return parseIso(readText(file).trim()); } catch { return null; }
}

export const ROW_RX_SRC = '\\|\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\|';      // a dated table row: a Change Log entry
export function countRows(text, lead = '') {
    return [...String(text).matchAll(new RegExp('^' + lead + ROW_RX_SRC, 'gm'))].length;
}

function isoSeconds(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

// What changed in one repository since `since` (milliseconds). Returns { ok, paths (repository-
// relative, forward slashes), decisionsRow, capped, cap }. ok is false when git could not answer; the
// caller then counts from the tool calls and says so. capped is true when git status listed more
// than `cap` entries and the rest were not read: the caller names the repository and calls its count a floor.
export function turnChanges(repo, since, base = '', cap = 4000) {
    const out = { ok: false, paths: [], decisionsRow: false, capped: false, cap };
    const seen = new Set();
    const key = (p) => (FOLD_CASE ? p.toLowerCase() : p);
    const addPath = (rel) => { const k = key(rel); if (!seen.has(k)) { seen.add(k); out.paths.push(rel); } };
    // Which commits are this turn's. With a recorded HEAD: the range from it to HEAD now, less any
    // commit older than the prompt (a pull or a merge brings those in; nobody wrote them this turn).
    // "none": the repository had no commit, so every commit on HEAD is new. No record (an older
    // marker file): commit times alone, with the prompt's second rounded UP, because git keeps
    // commit times by the second and a commit made just before the prompt must not be taken.
    const whole = Math.floor(since / 1000) * 1000;
    const floorIso = isoSeconds(whole);
    const ceilIso = isoSeconds(since > whole ? whole + 1000 : whole);
    const byTime = [`--since=${ceilIso}`, 'HEAD'];
    let revs = base === 'none' ? ['HEAD'] : base ? [`--since=${floorIso}`, `${base}..HEAD`] : byTime;

    const st = git(repo, ['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all'], { cache: false });
    if (st.code !== 0) return out;
    out.ok = true;

    // 1. commits made since the prompt. A repository with no commit yet answers with an error: no commits.
    const decisionsCommitted = [];
    let log = git(repo, ['-c', 'core.quotepath=false', 'log', '--name-only', '--format=', ...revs], { cache: false });
    if (log.code !== 0 && base && base !== 'none') {
        // The recorded commit is gone (a rewrite pruned it): fall back to commit times.
        revs = byTime;
        log = git(repo, ['-c', 'core.quotepath=false', 'log', '--name-only', '--format=', ...revs], { cache: false });
    }
    if (log.code === 0) {
        for (const l of log.out) {
            const rel = l.trim().replace(/^"+|"+$/g, '');
            if (!rel) continue;
            addPath(rel);
            if (getLeaf(rel).toLowerCase() === 'decisions.md' && !decisionsCommitted.includes(rel)) decisionsCommitted.push(rel);
        }
    }

    // 2. uncommitted now, and written since the prompt
    const decisionsDirty = []; const decisionsNew = []; let n = 0;
    for (const line of st.out) {
        if (line.length < 4) continue;
        if (++n > cap) { out.capped = true; break; }
        const xy = line.slice(0, 2);
        let rel = line.slice(3);
        if (rel.includes(' -> ')) rel = rel.split(' -> ').pop();           // a rename: the new name
        rel = rel.trim().replace(/^"+|"+$/g, '');
        const full = path.join(repo, rel);
        let changed = false;
        let stt = null;
        try { stt = fs.statSync(full); } catch { stt = null; }
        if (stt && stt.isFile()) changed = stt.mtimeMs >= since;
        else if (/d/i.test(xy) && !stt) {
            // A file that is gone has no time of its own; the folder it left was written when it went.
            const dir = nearestExistingDir(path.dirname(full));
            try { changed = Boolean(dir) && fs.statSync(dir).mtimeMs >= since; } catch { changed = false; }
        }
        if (!changed) continue;
        addPath(rel);
        if (getLeaf(rel).toLowerCase() === 'decisions.md') { if (xy === '??') decisionsNew.push(rel); else decisionsDirty.push(rel); }
    }

    // 3. did a DECISIONS.md that changed this turn gain a dated row (a Change Log entry)? Per file, the
    // turn's diffs must add more dated rows than they remove. Workaround (CR-2026-10-15-GAPS D5): any
    // added line that was a dated row counted, so an edit that reworded an old row (one row line out,
    // one in) passed for a new Change Log entry and hid the GATE-06 line. A new file's rows are all added,
    // and so are the rows of a file staged in a repository with no commit yet.
    const net = new Map();
    const bump = (rel, v) => net.set(rel, (net.get(rel) || 0) + v);
    for (const rel of decisionsNew) {
        try { net.set(rel, countRows(readText(path.join(repo, rel)))); } catch { /* unreadable: no count */ }
    }
    for (const rel of decisionsDirty) {
        const d = git(repo, ['diff', 'HEAD', '--', rel], { cache: false });
        if (d.code === 0) bump(rel, rowNet(d.out.join('\n')));
        else if (git(repo, ['rev-parse', '-q', '--verify', 'HEAD'], { cache: false }).code !== 0) {
            // No commit yet: a file staged in a new repository has no HEAD to diff against, so every
            // row in it is added, as for an untracked file. Workaround (CR-2026-10-15-GAPS D5 check):
            // uncounted, it made the card say "no Change Log row" over a manifest that had one, since
            // git, not the ledger flag, decides for a file git lists.
            try { bump(rel, countRows(readText(path.join(repo, rel)))); } catch { /* unreadable */ }
        }
    }
    for (const rel of decisionsCommitted) {
        const d = git(repo, ['log', '-p', '--format=', ...revs, '--', rel], { cache: false });
        if (d.code === 0) bump(rel, rowNet(d.out.join('\n')));
    }
    out.decisionsRow = [...net.values()].some((v) => v > 0);
    return out;
}

// Dated rows a diff adds less the ones it removes. The '+++' and '---' file headers are not rows.
export function rowNet(diff) {
    return countRows(diff, '\\+') - countRows(diff, '-');
}
