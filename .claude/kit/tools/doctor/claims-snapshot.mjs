// claims-snapshot.mjs - the snapshot_diff claim type (2026-10-14, CR-2026-10-14-REVIEW). READ-ONLY.
// Imported by claims.mjs and snapshot.mjs; uses treeFileMap, relKey and globRegex from claims-tree.mjs.
//
// The idea, from an outside reader of the kit: before a big refactor, dump the state of a tree to a
// file; make the change; let the Doctor compare. If the only differences are the ones you meant to
// make, the claim passes. The snapshot is written by tools/doctor/snapshot.mjs, so the fact is
// generated, never typed (VCS-15); the expected list is the one typed part, and it is the intent.
//
// Fields:
//   root        the folder compared (expands %VAR%, ${ROOT}, ${BRAIN}, ${KIT})
//   snapshot    the JSON file snapshot.mjs wrote: { schema: 1, root, taken, files: [{ path, size, sha256 }] }
//   exclude[]   optional, root-relative paths (file or folder) left out on both sides; .git is always out
//   expected[]  the changes that are meant: { path, change } or { glob, change }; change is
//               added | removed | modified; path and glob are root-relative, forward slashes, case-insensitive
//   maxDays?    optional: a snapshot taken longer ago than this is UNKNOWN, so a claim nobody removed
//               after the refactor does not stay green for ever
// PASS    the set of differences between the snapshot and the tree now equals the expected set: every
//         expected entry matched at least one difference, and every difference matched an expected entry
// FAIL    a difference nothing expected (an add, a removal or a modification), or an expected entry that
//         matched nothing; the first 12 are named with their kind
// UNKNOWN root missing; snapshot missing, not JSON, or not schema 1; expected absent, not a list, or an
//         entry without a change in the set or without path or glob; maxDays not a positive integer;
//         the snapshot older than maxDays, or its taken date unreadable when maxDays is set
//
// Lifecycle, in tools/MANUAL.md: snapshot, add the claim, make the change, run the Doctor, remove the
// claim (or take a new snapshot) once the change is accepted. The claim never re-baselines itself.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { readText, parseJson, parseIso } from '../../hooks/lib/common.mjs';
import { claimResult, resolveClaimPath, isFile, isDir, positiveInt } from './claims-base.mjs';
import { treeFileMap, relKey, globRegex } from './claims-tree.mjs';
import { DAY, isoDay } from './util.mjs';

const CHANGES = ['added', 'removed', 'modified'];
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The files under rootFull as the snapshot records them: rel-key, size, SHA-256. Sorted by key.
export function snapshotFiles(rootFull, exclude) {
    const map = treeFileMap(rootFull, exclude, []);
    return [...map.keys()].sort().map((rel) => {
        const buf = fs.readFileSync(map.get(rel));
        return { path: rel, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
    });
}

export function snapshotDiffClaim(c, ctx) {
    const rr = resolveClaimPath(c.root, ctx, 'root');
    if (!rr.path) return claimResult(c, 'UNKNOWN', rr.detail);
    const sp = resolveClaimPath(c.snapshot, ctx, 'snapshot');
    if (!sp.path) return claimResult(c, 'UNKNOWN', sp.detail);
    const root = rr.path; const snapPath = sp.path;
    if (!isDir(root)) return claimResult(c, 'UNKNOWN', `root folder missing: ${root}`);
    if (!isFile(snapPath)) return claimResult(c, 'UNKNOWN', `snapshot missing: ${snapPath} (write it with tools/doctor/snapshot.mjs)`);
    let snap;
    try { snap = parseJson(readText(snapPath)); } catch (e) { return claimResult(c, 'UNKNOWN', `snapshot is not JSON: ${snapPath} (${e.message})`); }
    if (snap == null || String(snap.schema) !== '1' || !Object.prototype.hasOwnProperty.call(snap, 'files')) return claimResult(c, 'UNKNOWN', `snapshot is not schema 1 with a files list: ${snapPath}`);

    // expected: present, a list, every entry well-formed
    if (!Array.isArray(c.expected)) return claimResult(c, 'UNKNOWN', "claim has no 'expected' list (an empty list means: nothing may change)");
    const expected = [];
    let i = 0;
    for (const e of c.expected) {
        i++;
        if (e == null) return claimResult(c, 'UNKNOWN', `expected[${i}] is empty`);
        const ch = String(e.change ?? '').toLowerCase();
        if (!CHANGES.includes(ch)) return claimResult(c, 'UNKNOWN', `expected[${i}] has no change in (added, removed, modified): '${e.change ?? ''}'`);
        const hasPath = e.path != null && String(e.path).trim() !== ''; const hasGlob = e.glob != null && String(e.glob).trim() !== '';
        if (!hasPath && !hasGlob) return claimResult(c, 'UNKNOWN', `expected[${i}] has neither path nor glob`);
        const rx = hasPath ? new RegExp('^' + escRx(relKey(String(e.path))) + '$', 'i') : globRegex(String(e.glob));
        expected.push({ label: hasPath ? String(e.path) : String(e.glob), change: ch, rx, hits: 0 });
    }

    const takenIso = snap.taken == null ? '' : String(snap.taken).trim();
    // maxDays: the snapshot's age
    if (c.maxDays != null) {
        const md = positiveInt(c.maxDays);
        if (md == null) return claimResult(c, 'UNKNOWN', "'maxDays' must be a positive integer");
        const taken = takenIso ? parseIso(takenIso, true) : null;
        if (taken == null) return claimResult(c, 'UNKNOWN', "snapshot has no readable 'taken' date and maxDays is set");
        const age = Math.floor((Date.now() - taken) / DAY);
        if (age > md) return claimResult(c, 'UNKNOWN', `snapshot taken ${isoDay(taken)} is ${age} day(s) old, over maxDays ${md}; take a new one or remove the claim`);
    }

    // the diff: snapshot vs the tree now
    const exclude = (Array.isArray(c.exclude) ? c.exclude : c.exclude == null ? [] : [c.exclude]).filter((x) => x != null && String(x).trim()).map((x) => relKey(String(x)));
    const before = new Map();
    for (const f of Array.isArray(snap.files) ? snap.files : []) if (f != null && f.path != null && String(f.path).trim()) before.set(relKey(String(f.path)), String(f.sha256 ?? '').toLowerCase());
    const now = new Map(snapshotFiles(root, exclude).map((f) => [f.path, f.sha256]));
    const diffs = [];
    for (const k of [...now.keys()].sort()) {
        if (!before.has(k)) diffs.push({ path: k, change: 'added' });
        else if (before.get(k) !== now.get(k)) diffs.push({ path: k, change: 'modified' });
    }
    for (const k of [...before.keys()].sort()) if (!now.has(k)) diffs.push({ path: k, change: 'removed' });

    // match: every difference needs an expected entry; every expected entry needs a difference
    const unexpected = [];
    for (const d of diffs) {
        let hit = false;
        for (const e of expected) if (e.change === d.change && e.rx.test(d.path)) { e.hits++; hit = true; }
        if (!hit) unexpected.push(`${d.change}: ${d.path}`);
    }
    const missing = expected.filter((e) => e.hits === 0).map((e) => `expected ${e.change} of ${e.label}, did not happen`);
    const takenText = takenIso ? `taken ${takenIso}` : 'taken (undated)';
    if (unexpected.length === 0 && missing.length === 0) {
        return claimResult(c, 'PASS', `${diffs.length} difference(s), all expected, against snapshot ${takenText} of ${before.size} file(s) under ${root}`);
    }
    const problems = [...unexpected, ...missing];
    const more = problems.length > 12 ? ` (+${problems.length - 12} more)` : '';
    return claimResult(c, 'FAIL', `${unexpected.length} unexpected, ${missing.length} expected-but-absent against snapshot ${takenText} under ${root}: ${problems.slice(0, 12).join('; ')}${more}`);
}
