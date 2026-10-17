// selftest-snapshot.mjs - self-test cases for the snapshot_diff claim type and snapshot.mjs
// (CR-2026-10-14-REVIEW). Imported by selftest.mjs, which owns the fixtures and helpers used here.
// Never run directly. Split out by domain because selftest.mjs is past its split line (DES-03).
//
// Fixture: a tree, a snapshot of it written by the real snapshot.mjs, then three changes: notes.md
// edited, extra.md added, old.md removed, gen.txt (excluded) edited. The claims below say which of
// those were meant. Three lists are handed back for the true, false and unknown runs.

import fs from 'node:fs';
import path from 'node:path';

export function snapshotFixture(t) {
    const { kit, here, W, jp, run, ok, bad, has, exitIs } = t;
    const snap = path.join(kit, 'snap');
    W(path.join(snap, 'notes.md'), 'line one\nline two\n');
    W(path.join(snap, 'old.md'), 'to be removed\n');
    W(jp(snap, 'sub', 'x.json'), '{ "a": 1 }\n');
    W(path.join(snap, 'gen.txt'), 'generated, excluded\n');
    const writer = path.join(here, 'snapshot.mjs');
    let r = run(process.execPath, [writer, '-Root', snap, '-Out', path.join(kit, 'snap-before.json'), '-Exclude', 'gen.txt'], process.env);
    exitIs('S: snapshot.mjs writes the snapshot', r.code, 0);
    has('S: snapshot.mjs says what it wrote', r.out, '3 file(s) under');
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(kit, 'snap-before.json'), 'utf8')); } catch { /* reported below */ }
    if (j && j.schema === 1 && j.files.length === 3 && !j.files.some((f) => f.path === 'gen.txt') && /^[0-9a-f]{64}$/.test(j.files[0].sha256)) ok('S: the snapshot is schema 1, excludes gen.txt, carries SHA-256');
    else bad('S: snapshot shape', JSON.stringify(j));
    r = run(process.execPath, [writer, '-Root', path.join(kit, 'no-such-snap'), '-Out', path.join(kit, 'snap-none.json')], process.env);
    exitIs('S: snapshot.mjs refuses a missing root', r.code, 1);
    // a stale snapshot: the same files, taken long ago
    if (j) { j.taken = '2020-01-01T00:00:00Z'; W(path.join(kit, 'snap-stale.json'), JSON.stringify(j, null, 2) + '\n'); }
    W(path.join(kit, 'snap-broken.json'), '{ not json\n');
    // the changes
    W(path.join(snap, 'notes.md'), 'line one\nline two (edited)\n');
    W(path.join(snap, 'extra.md'), 'new here\n');
    fs.rmSync(path.join(snap, 'old.md'), { force: true });
    W(path.join(snap, 'gen.txt'), 'generated again, still excluded\n');
}

const three = () => [{ path: 'notes.md', change: 'modified' }, { path: 'extra.md', change: 'added' }, { path: 'old.md', change: 'removed' }];
export const snapTrue = [
    { id: 'T-SNAP', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', exclude: ['gen.txt'], expected: three(), why: 't' },
    { id: 'T-SNAP-GLOB', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', exclude: ['gen.txt'], expected: [{ glob: '*.md', change: 'modified' }, { glob: 'extra.*', change: 'added' }, { glob: '**/*.md', change: 'removed' }], maxDays: 30, why: 't' },
];
export const snapFalse = [
    { id: 'F-SNAP-STRAY', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', exclude: ['gen.txt'], expected: [{ path: 'notes.md', change: 'modified' }], why: 'f' },
    { id: 'F-SNAP-MISSING', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', exclude: ['gen.txt'], expected: [...three(), { path: 'ghost.md', change: 'added' }], why: 'f' },
    { id: 'F-SNAP-NOEXCL', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', expected: three(), why: 'f' },
];
export const snapUnknown = [
    { id: 'U-SNAP-NOFILE', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-nowhere.json', expected: [], why: 'u' },
    { id: 'U-SNAP-BROKEN', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-broken.json', expected: [], why: 'u' },
    { id: 'U-SNAP-STALE', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-stale.json', exclude: ['gen.txt'], expected: three(), maxDays: 30, why: 'u' },
    { id: 'U-SNAP-NOEXP', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', why: 'u' },
    { id: 'U-SNAP-BADCH', type: 'snapshot_diff', root: '${KIT}/snap', snapshot: '${KIT}/snap-before.json', expected: [{ path: 'notes.md', change: 'renamed' }], why: 'u' },
    { id: 'U-SNAP-NOROOT', type: 'snapshot_diff', root: '${KIT}/no-such-snap', snapshot: '${KIT}/snap-before.json', expected: [], why: 'u' },
];

export function assertSnapshotRuns(t, a, c, d) {
    const { has, hasNot } = t;
    // The report prints no line for a passing claim; the pass count line in selftest.mjs (30 pass) carries
    // the two true claims, and this says neither fell to FAIL or could-not-look.
    hasNot('A: no snapshot_diff claim failed or could not look (T-SNAP, T-SNAP-GLOB pass by the count)', a.out, 'SNAP');
    has('C: snapshot_diff names an unexpected add and removal', c.out, 'F-SNAP-STRAY  2 unexpected, 0 expected-but-absent');
    has('C: snapshot_diff names the kind and path of a stray', c.out, 'added: extra.md; removed: old.md');
    has('C: snapshot_diff names an expected change that did not happen', c.out, 'expected added of ghost.md, did not happen');
    has('C: snapshot_diff without the exclude sees the excluded file as a stray', c.out, 'F-SNAP-NOEXCL  1 unexpected');
    has('D: snapshot missing is unknown, with the writer named', d.out, '????  U-SNAP-NOFILE  snapshot missing');
    has('D: snapshot not JSON is unknown', d.out, '????  U-SNAP-BROKEN  snapshot is not JSON');
    has('D: a snapshot older than maxDays is unknown, never green', d.out, '????  U-SNAP-STALE  snapshot taken 2020-01-01 is');
    has('D: no expected list is unknown', d.out, "????  U-SNAP-NOEXP  claim has no 'expected' list");
    has('D: a change outside the set is unknown', d.out, '????  U-SNAP-BADCH  expected[1] has no change in');
    has('D: a missing root is unknown', d.out, '????  U-SNAP-NOROOT  root folder missing');
}
