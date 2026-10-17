// survey.mjs - turn repository facts into SURVEY-band findings. READ-ONLY.
// Everything here is REPORTED: it changes the exit code only when surveyStrict is true, and then
// only the 'fail' severity counts. 'warn' and 'info' never do. Each finding carries (path, kind) so
// acceptedExceptions can match it.

import fs from 'node:fs';
import path from 'node:path';
import { pathEq, toFullPath, getLeaf, parseIso, readText } from '../../hooks/lib/common.mjs';
import { expandDfPath, isUnexpanded } from './context.mjs';
import { firstCommitDate, isoDay, roundEven, DAY, byName } from './util.mjs';

export function finding(severity, kind, p, message) { return { severity, kind, path: p, message }; }

export function repoFindings(repos) {
    const f = [];
    for (const r of repos.filter((x) => !x.archived)) {
        if (r.worktree) {
            // A linked worktree shares its parent's objects, remotes and tracked tree: the remote,
            // unpushed, shallow, .gitattributes and tracked-secret checks ran on the parent. Only the
            // folder's own uncommitted state is its own, so a frozen worktree that moved still counts.
            if (r.frozen && r.dirty > 0) f.push(finding('fail', 'frozenDirty', r.path, `frozen reference has MOVED: ${r.path} (${r.dirty} uncommitted entries)`));
            continue;
        }
        if (r.remote === '') {
            // A repo with no commits has nothing to lose. Reporting it as data loss is a false alarm.
            if (r.commits === 0) f.push(finding('warn', 'emptyRepo', r.path, `empty repo, no remote: ${r.path} (0 commits - nothing to back up yet)`));
            else {
                // anchor: survey-no-remote  mode: gate  verbs: remote
                f.push(finding('fail', 'noRemote', r.path, `no remote: ${r.path} (${r.commits} commits exist on this disk only)`));
            }
        } else if (!r.ownsRemote) {
            // anchor: survey-foreign-remote  mode: gate  verbs: report-remote
            f.push(finding('fail', 'foreignRemote', r.path, `FOREIGN remote: ${r.path} -> ${r.remote}. Looks backed up; cannot be pushed.`));
        }
        if (r.ahead != null && r.ahead > 0) {
            // A 'warn' never changes the verdict, so this anchor is advise and the law build refuses a
            // GATE grade on it (CR-2026-10-15-GAPS second review: it declared gate, so an overlay could
            // print VCS-04 as GATE on a finding that stops nothing).
            // anchor: survey-unpushed  mode: advise  verbs: back-up
            f.push(finding('warn', 'unpushed', r.path, `${r.ahead} commits unpushed: ${r.path}`));
        }
        // git fsck CANNOT see a shallow clone - it honours the boundary. Only the marker file shows it.
        if (r.shallow) {
            // anchor: survey-shallow  mode: gate  verbs: unshallow
            f.push(finding('fail', 'shallow', r.path, `SHALLOW clone: ${r.path} (${r.commits} commits visible). It cannot be pushed to a new remote. Fix: git -C <repo> fetch --unshallow <remote>`));
        }
        if (r.frozen && r.dirty > 0) f.push(finding('fail', 'frozenDirty', r.path, `frozen reference has MOVED: ${r.path} (${r.dirty} uncommitted entries)`));
        // Silent and cumulative rather than immediate, so a warn; a frozen tree is not edited to add one.
        // A warn never changes the verdict, so the anchor is advise, as survey-unpushed's is (DES-09).
        if (r.commits > 0 && !r.hasAttrs && !r.frozen) {
            // anchor: survey-no-gitattributes  mode: advise  verbs: pin-bytes
            f.push(finding('warn', 'noGitattributes', r.path, `no .gitattributes: ${r.path} - core.autocrlf decides its bytes, not the repo`));
        }
    }
    // One INFO per parent, never one per worktree: the fold is the point. Sorted so the output is
    // byte-stable across runs.
    const byParent = new Map();
    for (const r of repos.filter((x) => !x.archived && x.worktree)) {
        if (!byParent.has(r.parent)) byParent.set(r.parent, []);
        byParent.get(r.parent).push(r.path);
    }
    for (const parent of [...byParent.keys()].sort(byName)) {
        const names = byParent.get(parent).sort(byName);
        f.push(finding('info', 'worktrees', parent, `${names.length} linked worktree(s) of ${parent}: ${names.join(', ')}`));
    }
    return f;
}

// outsideCategory (2026-10-08): a live repository under the root whose first path segment is not
// one of categories.folders. Off when the config names no folders. Never a project, so never
// reported: the root itself, the brain, and the root's own .claude folder. The ratchet is git's
// first-commit date, the one tree_each uses: a repository born before categories.since is the
// move backlog (warn, folded into one line by mergeCategoryBacklog); one born on or after it,
// or with no commit yet, is a fail, because that is when a move costs nothing.
export function categoryFindings(repos, cfg, ctx) {
    const f = [];
    const cat = cfg.categories;
    if (cat == null || typeof cat !== 'object') return f;
    const folders = (Array.isArray(cat.folders) ? cat.folders : cat.folders == null ? [] : [cat.folders]).filter((x) => x).map((x) => String(x).replace(/^[\\/]+|[\\/]+$/g, ''));
    if (folders.length === 0) return f;
    let since = null;
    if (cat.since) {
        since = parseIso(String(cat.since), true);
        if (since == null) f.push(finding('warn', 'categoriesBadSince', '', `categories.since is not a date: '${cat.since}' - every repository outside a category is treated as new`));
    }
    const never = [ctx.root, ctx.brain, ctx.root ? path.join(ctx.root, '.claude') : null].filter((x) => x).map((x) => toFullPath(x) || x);
    for (const r of repos.filter((x) => !x.archived && !x.worktree)) {
        const full = toFullPath(r.fullPath) || r.fullPath;
        if (never.some((n) => pathEq(n, full))) continue;
        const first = String(r.path).split(/[\\/]/)[0];
        if (folders.some((x) => x.toLowerCase() === first.toLowerCase())) continue;
        const born = firstCommitDate(full);
        if (since != null && born != null && born < since) {
            f.push(finding('warn', 'outsideCategory', r.path, `outside a category folder: ${r.path} (born ${isoDay(born)}, before ${isoDay(since)}: reported, not failed)`));
        } else {
            // anchor: survey-outside-category  mode: gate  verbs: place-project
            f.push(finding('fail', 'outsideCategory', r.path, `outside a category folder: ${r.path} - a project lives at ${path.join('<category>', '<name>')} (categories: ${folders.join(', ')}). Move it now, while a move costs nothing, or accept it with a reason.`));
        }
    }
    return f;
}

// Folds the grandfathered outsideCategory findings into one line. Run after acceptedExceptions are
// applied, so an accepted repository has already left the list. The move backlog is one fact; nine
// lines of it on every run is a check that stops being read.
export function mergeCategoryBacklog(survey) {
    const old = survey.filter((x) => x.kind === 'outsideCategory' && x.severity === 'warn');
    if (old.length < 2) return survey;
    const rest = survey.filter((x) => !(x.kind === 'outsideCategory' && x.severity === 'warn'));
    const names = old.map((x) => x.path).sort(byName).join(', ');
    rest.push(finding('warn', 'outsideCategory', '', `${old.length} repositories sit outside a category folder and predate the ratchet (reported, not failed; the move backlog): ${names}`));
    return rest;
}

export function unversionedFindings(folders) {
    // WARN, not fail: several folders are legitimately outside git, and a permanently RED verdict is a
    // verdict that stops being read. Nothing hides; the owner decides.
    return folders.map((u) => finding('warn', 'noGitAtAll', u.path, `no git at all: ${u.path} (${u.capped ? '500+' : u.files} files) - nothing is protecting them`));
}

export function secretFindings(secrets) {
    return secrets.map((s) => (s.excepted
        ? finding('info', 'trackedSecretExcepted', s.repo, `tracked secret file, registered exception: ${s.repo}/${s.file}`)
        : finding('fail', 'trackedSecret', s.repo, `tracked .env: ${s.repo}/${s.file} - a secret file is in git. Rotate first, then git rm --cached, then ignore it.`)));
}

// A backup is not a backup until a restore has been executed and logged. The drill is the adopter's
// own tool; the Doctor only reads its log, when there is one.
export function restoreDrillFindings(recordsDir) {
    const f = [];
    const log = path.join(recordsDir, 'restore-drill.log');
    if (!fs.existsSync(log)) {
        f.push(finding('info', 'restoreDrillMissing', '', `no restore drill has been logged (${log} absent) - nothing has yet proved a backup gives anything back`));
        return f;
    }
    const lines = readText(log).split(/\r?\n/).filter((l) => /\S/.test(l));
    let newest = null;
    for (const l of lines) {
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(l);
        if (m) { const d = parseIso(m[1]); if (d != null && (newest == null || d > newest)) newest = d; }
    }
    if (newest == null) { f.push(finding('warn', 'restoreDrillMissing', '', 'restore-drill.log has no dated entry')); return f; }
    const age = roundEven((Date.now() - newest) / DAY);
    if (age > 90) f.push(finding('warn', 'restoreDrillStale', '', `restore drill is ${age} days old (last ${m10(newest)}) - quarterly is the ask`));
    const failed = lines.filter((l) => /\sFAIL\s/.test(l));
    if (failed.length > 0) f.push(finding('fail', 'restoreDrillFailed', '', `restore drill has ${failed.length} logged FAIL line(s) - a restore did not reproduce the local tree`));
    return f;
}
function m10(ms) { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

// entryPointSnapshots: files that govern every session and live outside git have no revert, so the
// brain keeps a byte snapshot. Compared after CRLF -> LF mapping: a line-ending difference is not a
// content change, and a check that cries wolf on it gets switched off.
export function snapshotFindings(pairs, ctx) {
    const f = [];
    for (const pair of pairs) {
        if (pair == null) continue;
        const live = expandDfPath(String(pair.live ?? ''), ctx);
        const snap = expandDfPath(String(pair.snapshot ?? ''), ctx);
        if (live === '' || snap === '' || isUnexpanded(live) || isUnexpanded(snap)) {
            f.push(finding('warn', 'entryPointBadPair', '', `entryPointSnapshots entry could not be expanded: live='${pair.live}' snapshot='${pair.snapshot}'`));
            continue;
        }
        const name = getLeaf(live);
        if (!fs.existsSync(live) || !fs.statSync(live).isFile()) { f.push(finding('fail', 'entryPointLiveMissing', live, `entry-point file is GONE: ${live} - the snapshot is now the only copy`)); continue; }
        if (!fs.existsSync(snap) || !fs.statSync(snap).isFile()) { f.push(finding('fail', 'entryPointSnapshotMissing', live, `no snapshot for ${name} - it governs every session and lives outside git, so it has no revert`)); continue; }
        const a = readText(live).replace(/\r\n/g, '\n');
        const b = readText(snap).replace(/\r\n/g, '\n');
        if (a !== b) f.push(finding('fail', 'entryPointDrift', live, `entry-point snapshot is STALE: ${name} changed and the snapshot was not updated in the same change. The LIVE file is authoritative - copy it over the snapshot.`));
    }
    return f;
}
