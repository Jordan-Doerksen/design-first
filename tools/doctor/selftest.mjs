// selftest.mjs - plant every failure and require the Doctor to CATCH it; plant every truth and
// require it to pass. A health check that cannot fail is worse than no health check, so every
// claim type gets one true and one false case here, and the three exit codes are each proven.
//
// Builds a throwaway pointer, brain, root and kit-like tree under the system temp folder, points
// the home folder (HOME and USERPROFILE) at a fake one (so %USERPROFILE% expansion, the default
// pointer location and the fence-log-absent case are all exercised without touching the real
// machine), runs the Doctor several ways, deletes it all.
//   node tools/doctor/selftest.mjs [-KeepTemp]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snapshotFixture, snapTrue, snapFalse, snapUnknown, assertSnapshotRuns } from './selftest-snapshot.mjs';
import { configCases } from './selftest-config.mjs';
import { truthRuns } from './selftest-truth.mjs';
import { lawRuns } from './selftest-law.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..', '..');           // the real kit
const doctor = path.join(here, 'doctor.mjs');
const templates = path.join(kitRoot, 'templates');
const IS_WIN = process.platform === 'win32';
const keepTemp = process.argv.slice(2).some((a) => /^--?keeptemp$/i.test(a));
let pass = 0; let fail = 0;

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const say = (s = '', code) => process.stdout.write((COLOR && code ? `\x1b[${code}m${s}\x1b[0m` : s) + '\n');
const ok = (name) => { say(`  PASS  ${name}`, 32); pass++; };
const bad = (name, why) => { say(`  FAIL  ${name}`, 31); say(`        ${why}`, 90); fail++; };
const has = (name, out, needle) => (out.includes(needle) ? ok(name) : bad(name, `expected the output to contain: ${needle}`));
const hasNot = (name, out, needle) => (out.includes(needle) ? bad(name, `output must NOT contain: ${needle}`) : ok(name));
const exitIs = (name, actual, expected) => (actual === expected ? ok(`${name} (exit ${actual})`) : bad(name, `exit was ${actual}, expected ${expected}`));
const countIs = (name, out, needle, expected) => { const n = out.split(needle).length - 1; if (n === expected) ok(`${name} (${n}x)`); else bad(name, `expected '${needle}' ${expected} time(s), found ${n}`); };
const W = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); };
const WJ = (p, obj) => W(p, JSON.stringify(obj, null, 2) + '\n');
const newDir = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
const jp = (base, ...rels) => path.join(base, ...rels.flatMap((r) => String(r).split(/[\\/]/)));
const sameBytes = (a, b) => Buffer.compare(a, b) === 0;

let T = path.join(os.tmpdir(), 'design-first-selftest-' + crypto.randomBytes(4).toString('hex'));
fs.mkdirSync(T, { recursive: true });
T = fs.realpathSync.native(T);
const root = newDir(path.join(T, 'root')); const brain = newDir(path.join(T, 'brain')); const kit = newDir(path.join(T, 'kit'));
const fakeHome = path.dirname(newDir(jp(T, 'home', '.claude')));
say(); say(`  Planting in ${T}`, 36); say();

function git(dir, args, env) {
    return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true, env: env ? { ...process.env, ...env } : process.env });
}
function newTestRepo(parent, name, { noCommit = false, date = '' } = {}) {
    const p = newDir(path.join(parent, name));
    git(p, ['init', '-q']);
    git(p, ['config', 'user.email', 'selftest@local']);
    git(p, ['config', 'user.name', 'selftest']);
    git(p, ['config', 'commit.gpgsign', 'false']);
    if (!noCommit) {
        W(path.join(p, 'README.md'), 'test\n'); git(p, ['add', '-A']);
        // A dated first commit makes the tree_each ratchet testable: born before `since` = grandfathered.
        git(p, ['commit', '-q', '-m', 'seed'], date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : null);
    }
    return p;
}

// The child sees only the sandbox: a fake home (HOME for Linux and macOS, USERPROFILE for Windows),
// no DF_* seam from the shell that started this test, and a pointer only when one is given.
function childEnv(home, pointer) {
    const env = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' };
    for (const k of Object.keys(env)) if (/^DF_/.test(k) || k === 'CLAUDE_PLUGIN_ROOT') delete env[k];
    if (pointer) env.DF_POINTER_PATH = pointer;
    return env;
}
function run(cmd, args, env, extra = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, env, maxBuffer: 64 * 1024 * 1024, ...extra });
    return { out: (r.stdout || '') + (r.stderr || ''), code: r.status == null ? -1 : r.status };
}
const invokeDoctor = (args, home, pointer = '') => run(process.execPath, [doctor, ...args], childEnv(home, pointer));

// The Doctor's own files and the kit files it imports, copied into a folder laid out like a kit, so
// -Kit resolves the kit to that folder and nothing planted there can reach the real Doctor.
function copyDoctorInto(kitDir) {
    const d = newDir(jp(kitDir, 'tools', 'doctor'));
    for (const f of fs.readdirSync(here)) if (/\.mjs$/.test(f) && !/^selftest/.test(f)) fs.copyFileSync(path.join(here, f), path.join(d, f));
    for (const rel of ['tools/lib/args.mjs', 'hooks/lib/common.mjs', 'hooks/lib/stdin.mjs', 'hooks/lib/json.mjs']) {
        const to = jp(kitDir, rel); newDir(path.dirname(to)); fs.copyFileSync(jp(kitRoot, rel), to);
    }
    return d;
}

const t = { T, root, brain, kit, fakeHome, here, kitRoot, IS_WIN, ok, bad, has, hasNot, exitIs, countIs, W, WJ, newDir, jp, run, childEnv, invokeDoctor, copyDoctorInto, newTestRepo, git, say };

try {
    // ---------------------------------------------------------------- the span fixture
    // The permitted form is the slug; the bare first name is DERIVED from it so this file carries the
    // slug only (the kit's own leak claim allows exactly that here, and nothing else).
    const slug = 'Jordan-Doerksen';
    const first = slug.split('-')[0];

    // ---------------------------------------------------------------- root: repos and files
    newTestRepo(root, 'unbacked');
    const foreign = newTestRepo(root, 'foreign'); git(foreign, ['remote', 'add', 'origin', 'https://github.com/someone-else/thing.git']);
    const owned = newTestRepo(root, 'ownedrepo'); git(owned, ['remote', 'add', 'origin', 'https://github.com/test-owner/ownedrepo.git']);
    const shallow = newTestRepo(root, 'shallowrepo'); W(jp(shallow, '.git', 'shallow'), '0000000000000000000000000000000000000000\n');
    const frozen = newTestRepo(root, 'frozenref'); W(path.join(frozen, 'drift.txt'), 'someone edited a frozen thing\n');
    const leaky = newTestRepo(root, 'leaky'); W(path.join(leaky, '.env'), 'TOKEN=abc123\n'); git(leaky, ['add', '-A', '-f']); git(leaky, ['commit', '-q', '-m', 'oops']);
    // Linked worktrees: one parent with a tracked .env (no exception registered) and two worktrees.
    // The secret must be reported ONCE, the worktrees folded into one INFO line, and the second
    // worktree, which sits under frozenPaths and is dirty, must still trip frozenDirty.
    const wtMain = newTestRepo(root, 'wtmain'); W(path.join(wtMain, '.env'), 'TOKEN=shared\n'); git(wtMain, ['add', '-A', '-f']); git(wtMain, ['commit', '-q', '-m', 'env']);
    git(wtMain, ['worktree', 'add', '-q', path.join(root, 'wtmain-wt1'), '-b', 'wt1']);
    git(wtMain, ['worktree', 'add', '-q', path.join(root, 'wtmain-wt2'), '-b', 'wt2']);
    W(jp(root, 'wtmain-wt2', 'moved.txt'), 'edited inside a frozen worktree\n');
    W(jp(root, 'unversioned', 'work.txt'), 'real work, no history\n');
    W(jp(root, '_backups', 'old-snapshot', 'dump.txt'), 'deliberately not in git\n');
    newTestRepo(newDir(path.join(root, 'category')), 'nested-repo');
    // outsideCategory fixtures: with `category` and `scan` named as category folders, every repo at
    // the root level is a stray. These two were born in 2019, before categories.since: the backlog.
    newTestRepo(root, 'oldstray', { date: '2019-06-01T12:00:00+00:00' });
    newTestRepo(root, 'oldstray2', { date: '2019-06-02T12:00:00+00:00' });
    W(path.join(root, 'CLAUDE.md'), '# entry\n\nThe prohibitions, in full.\n');
    WJ(jp(root, '.claude', 'settings.json'), {
        permissions: { deny: ['Read(**/.env)'], ask: ['Bash(npm install *)'] },
        autoMode: { soft_deny: ['Bash(rm *)', 'Edit(**/frozenref/**)'] },
    });

    // ---------------------------------------------------------------- tree_each scan fixture
    // Four repositories under root/scan: good (manifest + map + a logger line), bad (nothing, born today),
    // old (nothing, born 2019: grandfathered by `since`), acc (nothing, listed as accepted). The marker
    // file tool.marker is in all but bad, so a `where` on it leaves bad out.
    const scan = newDir(path.join(root, 'scan'));
    const sGood = newTestRepo(scan, 'good'); W(path.join(sGood, 'DECISIONS.md'), 'd\n'); W(path.join(sGood, 'ARCHITECTURE.md'), 'a\n'); W(path.join(sGood, 'tool.marker'), 'm\n'); W(jp(sGood, 'src', 'app.py'), 'import logging\nprint(1)\n');
    const sBad = newTestRepo(scan, 'bad'); W(jp(sBad, 'src', 'app.py'), 'print(2)\ntry:\n    x()\nexcept: pass\n');
    // tree_rules fixtures: good is compliant (vars only, a reduced-motion block, a commented exception);
    // bad has a raw colour, an animation with no reduced-motion block, and a bare except.
    W(jp(sGood, 'styles', 'tokens.css'), ':root { --ink: #0F1720; }\n');
    // The comment on the next line quotes two hex values in prose (a contrast note). A forbid rule
    // must not count them (0.1.19): a comment is not code. Before 0.1.19 this line made good fall short.
    // The last line is a raw colour excused by an allowOnLine word that sits INSIDE a comment: the
    // blanking must not erase the excuse (0.1.19). Before the raw-line check this line made good fall short.
    W(jp(sGood, 'styles', 'app.css'), '/* contrast note: --ink #0F1720 on paper #F6F1E7 reads 14:1 */\nh1 { color: var(--ink); animation: in 1s; }\n@media (prefers-reduced-motion: reduce) { h1 { animation: none; } }\n@media print { h1 { color: #000; } } /* deliberate: print has no tokens */\n');
    W(jp(sGood, 'src', 'git.py'), 'try:\n    x()\nexcept: pass  # deliberate: the exit code is read below\n');
    W(jp(sBad, 'styles', 'app.css'), 'h1 { color: #fff; animation: in 1s; }\n');
    const sOld = newTestRepo(scan, 'old', { date: '2019-06-01T12:00:00+00:00' }); W(path.join(sOld, 'tool.marker'), 'm\n');
    const sAcc = newTestRepo(scan, 'acc'); W(path.join(sAcc, 'tool.marker'), 'm\n');

    // ---------------------------------------------------------------- brain
    git(brain, ['init', '-q']);
    W(path.join(brain, 'me.md'), '---\nowner: test\n---\n');
    W(jp(brain, 'records', 'restore-drill.log'), '2019-01-01 09:00  PASS   games\\ok  (tree deadbeef)\n2019-01-01 09:01  FAIL   games\\broken  (local aaaa vs restored bbbb)\n');
    const ep = newDir(path.join(brain, 'entry-point'));
    W(path.join(ep, 'drifted.md'), 'rule one\nrule two\nrule three\n'); W(path.join(ep, 'drifted.md.snapshot'), 'rule one\nrule two\n');
    W(path.join(ep, 'nosnapshot.md'), 'governs everything, backed up nowhere\n');
    W(path.join(ep, 'eolonly.md'), 'same content\r\nsecond line\r\n'); W(path.join(ep, 'eolonly.md.snapshot'), 'same content\nsecond line\n');
    WJ(path.join(brain, 'config-old.json'), { schema: 0 });
    // ratchet fixtures: a generated-looking table whose HONOUR row reads 26 (and a decoy 99 under
    // another heading), and planted records: FALL was 30, SIGNED / ROSE / SHORT were 20, SPENT was 20
    // with its accepted entry already used. NEW has no record.
    W(path.join(brain, 'law-count.md'), '# LAW\n\n## Other\n\n| HONOUR | 99 |\n\n## Summary\n\n| grade | count |\n|---|---|\n| HONOUR | 26 |\n| total | 135 |\n');
    const rk = (v, used) => ({ value: v, recordedAt: '2026-01-01 00:00:00', acceptedUsed: used });
    WJ(jp(brain, 'state', 'ratchets.json'), {
        'T-RATCHET-FALL': rk(30, ''), 'T-RATCHET-SIGNED': rk(20, ''), 'F-RATCHET-ROSE': rk(20, ''),
        'F-RATCHET-SHORT': rk(20, ''), 'F-RATCHET-SPENT': rk(20, '2026-10-01|26'),
    });
    const signed = { value: 26, since: '2026-10-01', reason: 'planted raise' };
    // json_keyed_match fixtures: a nested collection (dotted path), keyed by `id`. A and B share
    // ids 1 and 2 (equal, with B's property order shuffled) and each holds a key the other lacks.
    // C repeats A but changes one nested field of the shared id 2.
    const vecA = { meta: { v: 1 }, vectors: { cases: [
        { id: 1, name: 'one', out: { pnl: 12, legs: [1, 2] } },
        { id: 2, name: 'two', out: { pnl: -3, legs: [4] } },
        { id: 3, name: 'only in A', out: { pnl: 0, legs: [] } }] } };
    const vecB = { vectors: { cases: [
        { out: { legs: [4], pnl: -3 }, name: 'two', id: 2 },
        { id: 1, name: 'one', out: { pnl: 12, legs: [1, 2] } },
        { id: 4, name: 'only in B', out: { pnl: 9, legs: [7] } }] } };
    const vecC = { vectors: { cases: [
        { id: 1, name: 'one', out: { pnl: 12, legs: [1, 2] } },
        { id: 2, name: 'two', out: { pnl: -3, legs: [5] } }] } };
    WJ(path.join(brain, 'vectors-a.json'), vecA); WJ(path.join(brain, 'vectors-b.json'), vecB); WJ(path.join(brain, 'vectors-c.json'), vecC);
    const isoZ = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const old = isoZ(new Date(Date.now() - 20 * 86400000)); const now = isoZ(new Date());
    W(jp(fakeHome, '.claude', 'hooks-old.log'), `${old} ERROR guard old failure\nbanner line without a date\n`);
    W(jp(fakeHome, '.claude', 'hooks-new.log'), `${old} ERROR guard old failure\n${now} ERROR guard fresh failure\n`);
    // file_fresh fixtures (VCS-06): a drill logged today, one logged 20 days ago, one log with no dated line
    W(jp(brain, 'records', 'restore-fresh.log'), `banner\n${old} restore-drill PASS old\n${now} restore-drill PASS fresh\n`);
    W(jp(brain, 'records', 'restore-stale.log'), `${old} restore-drill PASS old\n`);
    W(jp(brain, 'records', 'restore-undated.log'), 'no date here\n');
    W(jp(brain, 'state', 'installed.json'), '{ "schema": 1, "files": [] }\n');   // adopt date for graceFromInstall
    // config_paths_each fixtures (VCS-12): a tombstoned folder with a full tombstone, one with a thin one, one with none
    W(jp(root, 'tomb-ok', 'TOMBSTONE.md'), 'status: retired\nconsumers: the desk reads it\nremove: the owner, after the desk moves\n');
    W(jp(root, 'tomb-thin', 'TOMBSTONE.md'), 'status: retired\n');
    newDir(path.join(root, 'tomb-none'));
    // config_paths_each with base and no file (CTRL-03): two cards that name their master, one that names nobody
    W(jp(brain, 'control', 'GOOD-CONTROL.md'), '# GOOD-CONTROL: Good Master Control\n\nid planted.\n');
    W(jp(brain, 'control', 'INTAKE.md'), '# INTAKE: Intake\n\nthe layer above the masters.\n');
    W(jp(brain, 'control', 'THIN-CONTROL.md'), '# a card that names nobody\n');

    const cfg = {
        schema: 1, surveyStrict: false, maxDepth: 3,
        excludePathParts: ['/_none_/'], archivedPathParts: ['/_archive/'],
        ownerRemotePatterns: ['github.com/test-owner/'],
        frozenPaths: ['${ROOT}/frozenref', '${ROOT}/wtmain-wt2'], tombstonedPaths: [], controlCards: ['GOOD-CONTROL.md', 'INTAKE.md'],
        unversionedMaxDepth: 3, unversionedIgnorePathParts: ['/_backups/'],
        secretExceptions: [],
        acceptedExceptions: [
            { path: 'foreign', kinds: ['foreignRemote'], since: '2026-01-01', reason: 'vendored, planted' },
            { path: 'leaky', kinds: ['outsideCategory'], since: '2026-01-01', reason: 'planted stray' }],
        categories: { folders: ['category', 'scan'], since: '2026-01-01' },
        entryPointSnapshots: [
            { live: 'entry-point/drifted.md', snapshot: 'entry-point/drifted.md.snapshot' },
            { live: 'entry-point/nosnapshot.md', snapshot: 'entry-point/nosnapshot.md.snapshot' },
            { live: 'entry-point/eolonly.md', snapshot: 'entry-point/eolonly.md.snapshot' }],
        enforcement: { fenceLogStaleDays: 30 },
        gitTimeoutSeconds: 20,   // dead key: must be reported
        splitLines: 500,         // removed in 0.1.35 (DES-03 has no line count): must be reported
        // read by the hooks: must NOT be reported
        readCeilingBytes: 49152, readCeilingExempt: ['**/vendor/**'], sourceExtensions: ['.py'], stopDocs: ['DECISIONS.md'], stopFromGit: true, forbidScheduling: false, contentRules: [],
        lawClaim: { extraFiles: [], trailer: 'No-Claim', minReason: 10 },   // read by the commit check: must NOT be reported
    };
    WJ(path.join(brain, 'doctor.config.json'), cfg);
    // Strict also sets parallelGit 1: run B is the plain loop, run A the parallel sweep; same repos.json.
    const strict = { ...cfg, surveyStrict: true, parallelGit: 1 }; delete strict.gitTimeoutSeconds;
    WJ(path.join(brain, 'doctor.config.strict.json'), strict);

    // ---------------------------------------------------------------- kit-like tree
    const hooks = newDir(path.join(kit, 'hooks'));
    W(path.join(hooks, 'good-guard.mjs'), 'process.exitCode = 0;\n');
    W(path.join(hooks, 'bad-guard.mjs'), "console.log('this is not json');\n");
    W(path.join(hooks, 'crash-guard.mjs'), "console.error('planted crash');\nprocess.exitCode = 1;\n");
    W(path.join(hooks, 'good-entry.mjs'), "console.log('entry path line one');\n");
    W(path.join(hooks, 'bad-entry.mjs'), 'process.exitCode = 0;\n');
    W(path.join(hooks, 'hooks.json'), `{ "hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/good-guard.mjs\\"" } ] },
    { "matcher": "Bash", "hooks": [ { "type": "command", "args": ["node", "\${CLAUDE_PLUGIN_ROOT}/hooks/bad-guard.mjs"] } ] },
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/crash-guard.mjs\\"" } ] },
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/gone-guard.mjs\\"" } ] }
  ],
  "SessionStart": [
    { "matcher": "startup", "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/good-entry.mjs\\"" } ] },
    { "matcher": "startup", "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/bad-entry.mjs\\"" } ] }
  ] } }
`);
    // A stand-in generator honouring the law build's command line: LF output, exit 1 on a planted flag.
    W(jp(kit, 'tools', 'law', 'build-law.mjs'), `import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2); const opt = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('-')) opt[a[i].replace(/^-+/, '').toLowerCase()] = a[++i];
const j = JSON.parse(fs.readFileSync(opt.source, 'utf8'));
if (j.fail) { console.error('planted generator failure'); process.exit(1); }
const lines = ['# LAW (test)', ...(j.clauses || []).map((c) => '- ' + c.id)];
if (opt.overlay) lines.push('- overlay: ' + path.basename(opt.overlay));
fs.writeFileSync(opt.out, lines.join('\\n') + '\\n');
`);
    WJ(path.join(kit, 'law.json'), { schema: 1, clauses: [{ id: 'A-01' }, { id: 'A-02' }] });
    WJ(path.join(kit, 'law-fail.json'), { fail: true });
    W(path.join(kit, 'LAW.md'), '# LAW (test)\r\n- A-01\r\n- A-02\r\n');       // CRLF copy of the LF output: must PASS
    W(path.join(kit, 'LAW-drift.md'), '# LAW (test)\r\n- A-01\r\n- A-02 (edited)\r\n');
    // Leak trees. ok: slug in the allowed file, a longer word that merely contains the name, the
    // name in an excluded file and in an unscanned extension. bad: the bare name in a scanned file.
    // span: the slug in a file the allow table does not cover.
    W(jp(kit, 'leak-ok', 'README.md'), `Author: ${slug}. See the ${first}ian border (not a whole word).\n`);
    W(jp(kit, 'leak-ok', 'LICENSE'), `Copyright ${first}\n`);
    W(jp(kit, 'leak-ok', 'notes.png'), `${first}\n`);
    W(jp(kit, 'leak-ok', 'clean.json'), '{ "a": 1 }\n');
    W(jp(kit, 'leak-bad', 'README.md'), `Author: ${slug}\n`);
    W(jp(kit, 'leak-bad', 'notes.md'), `written by ${first} alone\n`);
    W(jp(kit, 'leak-span', 'README.md'), `Author: ${slug}\n`);
    W(jp(kit, 'leak-span', 'other.md'), `also ${slug} here\n`);
    // Equal trees. a and b: same files, one differing only by CRLF, one excluded file that differs.
    // c: one edited file and one extra file. d: a folder that does not exist.
    W(jp(kit, 'eq-a', 'notes.md'), 'line one\nline two\n');
    W(jp(kit, 'eq-a', 'sub', 'x.json'), '{ "a": 1 }\n');
    W(jp(kit, 'eq-a', 'skip.txt'), 'generated here\n');
    W(jp(kit, 'eq-b', 'notes.md'), 'line one\r\nline two\r\n');
    W(jp(kit, 'eq-b', 'sub', 'x.json'), '{ "a": 1 }\n');
    W(jp(kit, 'eq-b', 'skip.txt'), 'generated there\n');
    W(jp(kit, 'eq-c', 'notes.md'), 'line one\nline two (edited)\n');
    W(jp(kit, 'eq-c', 'sub', 'x.json'), '{ "a": 1 }\n');
    W(jp(kit, 'eq-c', 'extra.md'), 'only here\n');
    snapshotFixture(t);   // selftest-snapshot.mjs: the snap tree, its snapshot by the real writer, then the changes
    // The Doctor itself, copied in, so -Kit resolves ${KIT} to this sandbox and reads its claims.
    const kitDoctor = copyDoctorInto(kit);
    const leakWords = [first, slug, 'Zeta']; const leakExt = ['.md', '.json']; const leakAllow = [{ path: 'README.md', words: [slug] }];
    WJ(path.join(kitDoctor, 'claims.json'), { schema: 1, claims: [
        { id: 'K-POINTER', type: 'pointer_valid', why: 'kit' },
        { id: 'K-TREE', type: 'tree_free_of', root: '${KIT}/leak-ok', words: leakWords, extensions: leakExt, exclude: ['LICENSE'], allow: leakAllow, why: 'kit' }] });

    // ---------------------------------------------------------------- pointer (default location under the fake home)
    WJ(jp(fakeHome, '.claude', 'design-first.json'), { schema: 1, root, brain, pluginRoot: kit, pluginKind: 'checkout' });
    const badPointer = path.join(T, 'bad-pointer.json');
    WJ(badPointer, { schema: 1, root, brain: path.join(T, 'no-such-brain'), pluginRoot: kit, pluginKind: 'checkout' });

    // ---------------------------------------------------------------- claim sets
    const subsetOk = { autoMode: { soft_deny: ['Edit(**/frozenref/**)', 'Bash(rm *)'] } };   // order swapped on purpose
    const subsetBad = { autoMode: { soft_deny: ['Edit(**/frozenref/**)', 'Bash(wrong *)'] } };
    const rules3 = () => [
        { id: 'raw-colour', files: '**/*.css', forbid: '#[0-9a-f]{3,8}\\b' },
        { id: 'reduced-motion', files: '**/*.css', when: 'animation|transition|@keyframes', require: 'prefers-reduced-motion' },
        { id: 'bare-except', files: '**/*.py', forbid: 'except\\s*:\\s*pass' }];
    const trueClaims = [
        { id: 'T-PATH', type: 'path_exists', path: 'me.md', why: 't' },
        { id: 'T-ABSENT', type: 'path_absent', path: '${BRAIN}/nope.md', why: 't' },
        { id: 'T-CONTAINS', type: 'file_contains', path: '${ROOT}/CLAUDE.md', needle: 'prohibitions', why: 't' },
        { id: 'T-NOTCONTAINS', type: 'file_not_contains', path: '${ROOT}/CLAUDE.md', needle: 'forbidden thing', why: 't' },
        { id: 'T-LOG', type: 'log_window_free_of', path: '%USERPROFILE%\\.claude\\hooks-old.log', needle: 'ERROR', days: 7, why: 't' },
        { id: 'T-FRESH', type: 'file_fresh', path: '${BRAIN}/records/restore-fresh.log', maxDays: 7, why: 't' },
        { id: 'T-FRESH-GRACE', type: 'file_fresh', path: '${BRAIN}/records/none-yet.log', maxDays: 7, graceFromInstall: true, why: 't' },
        { id: 'T-TOMB-NONE', type: 'config_paths_each', configKey: 'tombstonedPaths', file: 'TOMBSTONE.md', contains: ['status:', 'consumers:', 'remove:'], why: 't' },
        { id: 'T-TOMB-OK', type: 'config_paths_each', paths: ['${ROOT}/tomb-ok'], file: 'TOMBSTONE.md', contains: ['status:', 'consumers:', 'remove:'], why: 't' },
        { id: 'T-CARDS', type: 'config_paths_each', configKey: 'controlCards', base: '${BRAIN}/control', contains: ['Master Control|Intake'], why: 't' },
        { id: 'T-REMOTE', type: 'remote_is', path: '${ROOT}/ownedrepo', remote: 'origin', pattern: 'github\\.com/test-owner/', why: 't' },
        { id: 'T-JSON', type: 'json_subset_equal', path: '${ROOT}/.claude/settings.json', subset: subsetOk, why: 't' },
        { id: 'T-KEYED', type: 'json_keyed_match', path: 'vectors-a.json', other: '${BRAIN}/vectors-b.json', collection: 'vectors.cases', key: 'id', why: 't' },
        { id: 'T-GEN', type: 'generated_matches', generator: 'tools/law/build-law.mjs', source: '${KIT}/law.json', output: '${KIT}/LAW.md', why: 't' },
        { id: 'T-TREE', type: 'tree_free_of', root: '${KIT}/leak-ok', words: leakWords, extensions: leakExt, exclude: ['LICENSE'], allow: leakAllow, why: 't' },
        { id: 'T-TREEEQ', type: 'tree_equals', path: '${KIT}/eq-a', other: '${KIT}/eq-b', exclude: ['skip.txt'], why: 't' },
        { id: 'T-TREEEQ-SAME', type: 'tree_equals', path: '${KIT}/eq-a', other: '${KIT}/eq-a', why: 't' },
        { id: 'T-SCAN', type: 'tree_each', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['tool.marker'] }, require: [{ file: 'DECISIONS.md' }, { file: 'ARCHITECTURE.md' }], since: '2026-01-01', accepted: [{ path: 'scan/acc', reason: 'planted', since: '2026-01-01' }], why: 't' },
        { id: 'T-RULES', type: 'tree_rules', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['tool.marker'] }, except: ['**/tokens.css'], allowOnLine: 'deliberate', rules: rules3(), why: 't' },
        { id: 'T-RULES-SINCE', type: 'tree_rules', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['styles/app.css'] }, since: '2099-01-01', except: ['**/tokens.css'], allowOnLine: 'deliberate', rules: rules3(), why: 't' },
        { id: 'T-SCAN-GLOB', type: 'tree_each', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['DECISIONS.md'] }, require: [{ glob: '**/*.py|**/*.js', pattern: 'logging' }], why: 't' },
        { id: 'T-SCAN-EMPTYOK', type: 'tree_each', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['nothing.has.this'] }, require: [{ file: 'x' }], emptyOk: true, why: 't' },
        { id: 'T-RATCHET-NEW', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', why: 't' },
        { id: 'T-RATCHET-FALL', type: 'ratchet', path: '${BRAIN}/law-count.md', row: 'HONOUR', heading: 'Summary', why: 't' },
        { id: 'T-RATCHET-SIGNED', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', accepted: signed, why: 't' },
        { id: 'T-SMOKE-PRE', type: 'hook_smoke', hook: 'good-guard', event: 'PreToolUse', why: 't' },
        { id: 'T-SMOKE-START', type: 'hook_smoke', hook: 'good-entry', event: 'SessionStart', why: 't' },
        { id: 'T-POINTER', type: 'pointer_valid', why: 't' },
        { id: 'T-SCHEMA', type: 'config_schema', path: 'doctor.config.json', expected: 1, why: 't' },
        ...snapTrue];
    const falseClaims = [
        { id: 'F-PATH', type: 'path_exists', path: '${BRAIN}/nope.md', why: 'f' },
        { id: 'F-ABSENT', type: 'path_absent', path: 'me.md', why: 'f' },
        { id: 'F-CONTAINS', type: 'file_contains', path: '${ROOT}/CLAUDE.md', needle: 'unicorns', why: 'f' },
        { id: 'F-NOTCONTAINS', type: 'file_not_contains', path: '${ROOT}/CLAUDE.md', needle: 'prohibitions', why: 'f' },
        { id: 'F-LOG', type: 'log_window_free_of', path: '%USERPROFILE%\\.claude\\hooks-new.log', needle: 'ERROR', days: 7, why: 'f' },
        { id: 'F-FRESH-STALE', type: 'file_fresh', path: '${BRAIN}/records/restore-stale.log', maxDays: 7, why: 'f' },
        { id: 'F-FRESH-NONE', type: 'file_fresh', path: '${BRAIN}/records/restore-never.log', maxDays: 7, why: 'f' },
        { id: 'F-FRESH-UNDATED', type: 'file_fresh', path: '${BRAIN}/records/restore-undated.log', maxDays: 7, why: 'f' },
        { id: 'F-TOMB-THIN', type: 'config_paths_each', paths: ['${ROOT}/tomb-ok', '${ROOT}/tomb-thin'], file: 'TOMBSTONE.md', contains: ['status:', 'consumers:', 'remove:'], why: 'f' },
        { id: 'F-TOMB-NONE', type: 'config_paths_each', paths: ['${ROOT}/tomb-none'], file: 'TOMBSTONE.md', contains: ['status:'], why: 'f' },
        { id: 'F-CARDS-THIN', type: 'config_paths_each', paths: ['GOOD-CONTROL.md', 'THIN-CONTROL.md'], base: '${BRAIN}/control', contains: ['Master Control|Intake'], why: 'f' },
        { id: 'F-CARDS-GONE', type: 'config_paths_each', paths: ['NONE-CONTROL.md'], base: '${BRAIN}/control', contains: ['Master Control|Intake'], why: 'f' },
        { id: 'F-REMOTE', type: 'remote_is', path: '${ROOT}/foreign', remote: 'origin', pattern: 'github\\.com/test-owner/', why: 'f' },
        { id: 'F-JSON', type: 'json_subset_equal', path: '${ROOT}/.claude/settings.json', subset: subsetBad, why: 'f' },
        { id: 'F-KEYED', type: 'json_keyed_match', path: 'vectors-a.json', other: 'vectors-c.json', collection: 'vectors.cases', key: 'id', why: 'f' },
        { id: 'F-KEYED-ALL', type: 'json_keyed_match', path: 'vectors-a.json', other: 'vectors-b.json', collection: 'vectors.cases', key: 'id', requireAll: true, why: 'f' },
        { id: 'F-GEN', type: 'generated_matches', generator: 'tools/law/build-law.mjs', source: '${KIT}/law.json', output: '${KIT}/LAW-drift.md', why: 'f' },
        { id: 'F-TREE', type: 'tree_free_of', root: '${KIT}/leak-bad', words: leakWords, extensions: leakExt, exclude: ['LICENSE'], allow: leakAllow, why: 'f' },
        { id: 'F-TREE-SPAN', type: 'tree_free_of', root: '${KIT}/leak-span', words: leakWords, extensions: leakExt, exclude: ['LICENSE'], allow: leakAllow, why: 'f' },
        { id: 'F-TREEEQ', type: 'tree_equals', path: '${KIT}/eq-a', other: '${KIT}/eq-c', exclude: ['skip.txt'], why: 'f' },
        { id: 'F-TREEEQ-SKIP', type: 'tree_equals', path: '${KIT}/eq-a', other: '${KIT}/eq-b', why: 'f' },
        { id: 'F-SCAN', type: 'tree_each', root: '${ROOT}/scan', depth: 1, require: [{ file: 'DECISIONS.md' }, { file: 'ARCHITECTURE.md' }], since: '2026-01-01', accepted: [{ path: 'scan/acc', reason: 'planted', since: '2026-01-01' }], why: 'f' },
        { id: 'F-RULES', type: 'tree_rules', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['styles/app.css'] }, except: ['**/tokens.css'], allowOnLine: 'deliberate', rules: rules3(), why: 'f' },
        { id: 'F-RULES-NOALLOW', type: 'tree_rules', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['src/git.py'] }, rules: [{ id: 'bare-except', files: '**/*.py', forbid: 'except\\s*:\\s*pass' }], why: 'f' },
        { id: 'F-SCAN-GLOB', type: 'tree_each', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['src/app.py'] }, require: [{ glob: '**/*.py', pattern: 'excepthook' }], why: 'f' },
        { id: 'F-RATCHET-ROSE', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', why: 'f' },
        { id: 'F-RATCHET-SHORT', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', accepted: { value: 25, since: '2026-10-01', reason: 'planted, one short' }, why: 'f' },
        { id: 'F-RATCHET-SPENT', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', accepted: signed, why: 'f' },
        { id: 'F-SMOKE-PRE', type: 'hook_smoke', hook: 'bad-guard', event: 'PreToolUse', why: 'f' },
        { id: 'F-SMOKE-CRASH', type: 'hook_smoke', hook: 'crash-guard', event: 'PreToolUse', why: 'f' },
        { id: 'F-SMOKE-GONE', type: 'hook_smoke', hook: 'gone-guard', event: 'PreToolUse', why: 'f' },
        { id: 'F-SMOKE-START', type: 'hook_smoke', hook: 'bad-entry', event: 'SessionStart', why: 'f' },
        { id: 'F-SCHEMA', type: 'config_schema', path: 'config-old.json', expected: 1, why: 'f' },
        ...snapFalse];
    const unknownClaims = [
        { id: 'U-GEN', type: 'generated_matches', generator: 'tools/law/build-law.mjs', source: '${KIT}/law-fail.json', output: '${KIT}/LAW.md', why: 'u' },
        { id: 'U-CONTAINS', type: 'file_contains', path: '${BRAIN}/missing.md', needle: 'x', why: 'u' },
        { id: 'U-FRESH', type: 'file_fresh', path: '${BRAIN}/records/restore-fresh.log', maxDays: 0, why: 'u' },
        { id: 'U-TOMB', type: 'config_paths_each', configKey: 'noSuchKey', file: 'TOMBSTONE.md', contains: ['status:'], why: 'u' },
        { id: 'U-CARDS', type: 'config_paths_each', paths: ['GOOD-CONTROL.md'], base: '${BRAIN}/control', why: 'u' },
        { id: 'U-KEYED', type: 'json_keyed_match', path: 'vectors-a.json', other: 'vectors-b.json', collection: 'vectors.nope', key: 'id', why: 'u' },
        { id: 'U-SMOKE', type: 'hook_smoke', hook: 'unregistered', event: 'PreToolUse', why: 'u' },
        { id: 'U-TREEEQ', type: 'tree_equals', path: '${KIT}/eq-a', other: '${KIT}/eq-d', why: 'u' },
        { id: 'U-SCAN', type: 'tree_each', root: '${ROOT}/no-such', require: [{ file: 'x' }], why: 'u' },
        { id: 'U-RULES', type: 'tree_rules', root: '${ROOT}/scan', depth: 1, rules: [], why: 'u' },
        { id: 'U-SCAN-NONE', type: 'tree_each', root: '${ROOT}/scan', depth: 1, where: { anyOf: ['nothing.has.this'] }, require: [{ file: 'x' }], why: 'u' },
        { id: 'U-RATCHET-ROW', type: 'ratchet', path: 'law-count.md', row: 'NOPE', why: 'u' },
        { id: 'U-RATCHET-HEAD', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', heading: 'Missing', why: 'u' },
        { id: 'U-RATCHET-REASON', type: 'ratchet', path: 'law-count.md', row: 'HONOUR', accepted: { value: 26, since: '2026-10-01' }, why: 'u' },
        { id: 'U-TYPE', type: 'bogus_type', why: 'u' },
        ...snapUnknown];
    WJ(path.join(brain, 'claims.json'), { schema: 1, claims: trueClaims });
    WJ(path.join(brain, 'claims-false.json'), { schema: 1, claims: falseClaims });
    WJ(path.join(brain, 'claims-unknown.json'), { schema: 1, claims: unknownClaims });

    // ================================================================ run A: everything true, survey REPORTED -> exit 0
    say('  Run A: true claims, surveyStrict false', 36);
    const a = invokeDoctor([], fakeHome);
    exitIs('A: survey findings alone leave exit 0', a.code, 0);
    has('A: verdict GREEN with findings reported', a.out, 'VERDICT: GREEN');
    has('A: no remote', a.out, 'no remote: unbacked');
    has('A: foreign remote accepted, still shown', a.out, 'FOREIGN remote: foreign');
    has('A: accepted marker', a.out, '[accepted 2026-01-01: vendored, planted]');
    has('A: shallow clone', a.out, 'SHALLOW clone: shallowrepo');
    has('A: frozen reference moved (${ROOT}-relative frozenPaths)', a.out, 'frozen reference has MOVED: frozenref');
    has('A: tracked .env', a.out, 'tracked .env: leaky');
    countIs('A: worktree parent secret reported ONCE, not once per worktree', a.out, 'tracked .env: wtmain/.env', 1);
    has('A: worktrees folded into one INFO line per parent', a.out, '2 linked worktree(s) of wtmain: wtmain-wt1, wtmain-wt2');
    hasNot('A: a worktree is not surveyed as its own repo (no remote)', a.out, 'no remote: wtmain-wt');
    hasNot('A: a worktree is not surveyed as its own repo (gitattributes)', a.out, 'no .gitattributes: wtmain-wt');
    has('A: a dirty frozen worktree still trips frozenDirty', a.out, 'frozen reference has MOVED: wtmain-wt2');
    has('A: repo count line folds worktrees', a.out, '14 repositories under root (0 archived, not counted; 2 worktree(s) folded into their parents)');
    has('A: a new repo outside a category folder is named, with the categories', a.out, `outside a category folder: unbacked - a project lives at ${path.join('<category>', '<name>')} (categories: category, scan)`);
    has('A: repos born before categories.since fold into one backlog line', a.out, '2 repositories sit outside a category folder and predate the ratchet (reported, not failed; the move backlog): oldstray, oldstray2');
    hasNot('A: a repo inside a category folder is not reported', a.out, `outside a category folder: ${path.join('category', 'nested-repo')}`);
    hasNot('A: a repo inside a second category folder is not reported', a.out, `outside a category folder: scan${path.sep}`);
    hasNot('A: a worktree is not reported as outside a category', a.out, 'outside a category folder: wtmain-wt');
    has('A: an accepted stray is shown as accepted', a.out, '[accepted 2026-01-01: planted stray]');
    has('A: no git at all (enumerated)', a.out, 'no git at all: unversioned');
    hasNot('A: ignore list suppresses _backups', a.out, 'no git at all: _backups');
    hasNot('A: a container is not called unversioned', a.out, 'no git at all: category');
    has('A: stale snapshot', a.out, 'snapshot is STALE: drifted.md');
    has('A: missing snapshot', a.out, 'no snapshot for nosnapshot.md');
    hasNot('A: CRLF-only snapshot difference is NOT reported', a.out, 'STALE: eolonly.md');
    has('A: restore drill FAIL line', a.out, 'logged FAIL line');
    has('A: restore drill stale', a.out, 'restore drill is');
    has('A: fence log absent is REPORTED as no trips yet', a.out, 'fence log: no trips yet');
    await configCases(t, a);   // the config contract cases: dead and live keys, readers against defaults
    has('A: soft_deny counted against frozenPaths', a.out, 'soft_deny: 2 rule(s), 1 naming a frozen path');
    has('A: registered-but-missing hook', a.out, 'hook REGISTERED BUT MISSING');
    has('A: deny/ask rules read from root settings', a.out, 'root settings: 1 deny, 1 ask');
    has('A: every true claim holds (emptyOk: nothing selected is a pass that says so)', a.out, 'CLAIMS  31 pass  0 fail  0 could not look');
    hasNot('A: no COULD-NOT-LOOK band', a.out, 'COULD-NOT-LOOK');
    has('A: ratchet with no record says the baseline was recorded', a.out, 'ratchet T-RATCHET-NEW: baseline recorded, HONOUR = 26');
    has('A: ratchet reads the row under its heading, and reports a fall', a.out, 'ratchet T-RATCHET-FALL: HONOUR fell from 30 to 26');
    has('A: ratchet lets a signed raise through and prints the reason', a.out, 'HONOUR rose from 20 to 26, signed 2026-10-01: planted raise');
    let rj = JSON.parse(fs.readFileSync(jp(brain, 'state', 'ratchets.json'), 'utf8'));
    if (rj['T-RATCHET-NEW']?.value === 26 && rj['T-RATCHET-FALL']?.value === 26 && rj['T-RATCHET-SIGNED']?.value === 26) ok('A: ratchet records are written after the run'); else bad('A: ratchet records', JSON.stringify(rj));
    if (rj['T-RATCHET-SIGNED']?.acceptedUsed === '2026-10-01|26') ok('A: a signed raise is marked spent in the record'); else bad('A: spent mark', String(rj['T-RATCHET-SIGNED']?.acceptedUsed));
    const rBytes = fs.readFileSync(jp(brain, 'state', 'ratchets.json'));
    const reposParallel = fs.readFileSync(jp(brain, 'state', 'repos.json'));

    // ================================================================ run B: same disk, surveyStrict true -> exit 1
    say('  Run B: true claims, surveyStrict true', 36);
    const b = invokeDoctor(['-ConfigPath', path.join(brain, 'doctor.config.strict.json')], fakeHome);
    exitIs('B: surveyStrict turns survey fails RED', b.code, 1);
    has('B: verdict RED', b.out, 'VERDICT: RED');
    has('B: reason names surveyStrict', b.out, 'surveyStrict is true');
    if (sameBytes(reposParallel, fs.readFileSync(jp(brain, 'state', 'repos.json')))) ok('B: the sweep one repository at a time (parallelGit 1) writes the same repos.json as the parallel sweep');
    else bad('B: parallel and sequential sweeps differ', 'repos.json changed between run A (parallel) and run B (parallelGit 1)');
    hasNot('B: parallelGit is a known config key', b.out, 'dead config key: parallelGit');
    hasNot('B: a ratchet at its record prints no note on the second run', b.out, 'ratchet T-RATCHET');
    if (sameBytes(rBytes, fs.readFileSync(jp(brain, 'state', 'ratchets.json')))) ok('B: ratchets.json is byte-identical when nothing moved'); else bad('B: ratchet determinism', 'ratchets.json changed with nothing changed');

    // ================================================================ run C: one false claim per type -> exit 1
    say('  Run C: false claims', 36);
    const c = invokeDoctor(['-ClaimsPath', path.join(brain, 'claims-false.json')], fakeHome);
    exitIs('C: a false claim is RED', c.code, 1);
    for (const id of falseClaims.map((x) => x.id)) has(`C: ${id} caught`, c.out, `FAIL  ${id}  `);
    has('C: config_schema mismatch says MIGRATE', c.out, 'MIGRATE:');
    has('C: span rule - slug outside the allow table trips', c.out, `other.md:1 "${slug}"`);
    has('C: bare name trips', c.out, `notes.md:1 "${first}"`);
    has('C: generated_matches names the first differing byte', c.out, 'first difference at byte');
    has('C: json_keyed_match names the differing key and field', c.out, "F-KEYED  key 'id' = '2' differs: $.out.legs[0] is '4' vs '5'");
    has('C: json_keyed_match requireAll names the missing key', c.out, 'F-KEYED-ALL  requireAll: 1 key(s) in');
    has('C: tree_equals names the edited file', c.out, 'differs: notes.md');
    has('C: tree_equals names the extra file', c.out, 'only in other: extra.md');
    has('C: tree_equals sees an excluded file when it is not excluded', c.out, 'F-TREEEQ-SKIP  1 difference(s)');
    has('C: tree_each names the repo born after since and what it lacks', c.out, 'bad: missing DECISIONS.md, missing ARCHITECTURE.md');
    has('C: tree_each reports the grandfathered repo, not failed', c.out, `predate 2026-01-01 and are reported, not failed: ${path.join('scan', 'old')}`);
    has('C: tree_each reports the accepted repo', c.out, `1 accepted: ${path.join('scan', 'acc')}`);
    has('C: tree_each glob+pattern names the pattern', c.out, 'no **/*.py file contains /excepthook/');
    has('C: tree_rules names the rule, file and line', c.out, 'raw-colour: styles/app.css:1');
    has('C: tree_rules when+require names the file', c.out, 'reduced-motion: styles/app.css');
    has('C: tree_rules counts a bare except', c.out, 'bare-except: src/app.py:4');
    has('C: tree_rules without allowOnLine counts the commented exception', c.out, 'F-RULES-NOALLOW  1 of 1');
    hasNot('C: tree_rules does not touch the token file', c.out, 'tokens.css');
    has('C: file_fresh names a stale drill with its age', c.out, 'F-FRESH-STALE  last dated line');
    has('C: file_fresh with no log is a fail, not unknown (nothing proved)', c.out, 'F-FRESH-NONE  no file at');
    has('C: file_fresh with no dated line is a fail', c.out, 'F-FRESH-UNDATED  no dated line');
    has('C: config_paths_each names the thin tombstone and the missing line', c.out, "F-TOMB-THIN  tomb-thin: TOMBSTONE.md lacks 'consumers:'");
    has('C: config_paths_each names the folder with no tombstone', c.out, 'F-TOMB-NONE  tomb-none: missing TOMBSTONE.md');
    has('C: config_paths_each with base and no file names the card that names no master (CTRL-03)', c.out, "F-CARDS-THIN  THIN-CONTROL.md: lacks 'Master Control|Intake'");
    has('C: config_paths_each with base names the missing card under the base folder', c.out, `F-CARDS-GONE  NONE-CONTROL.md: file missing (${jp(brain, 'control', 'NONE-CONTROL.md')})`);
    has('C: SessionStart silent hook is a fail', c.out, 'printed nothing');
    has('C: PreToolUse non-JSON is a fail', c.out, 'stdout is not JSON');
    hasNot('C: no COULD-NOT-LOOK from false claims', c.out, 'COULD-NOT-LOOK');
    has('C: ratchet names the rise and that nothing signs it', c.out, 'F-RATCHET-ROSE  HONOUR rose from 20 to 26');
    has('C: ratchet says the accepted raise is one short', c.out, 'the accepted raise covers 25, not 26');
    has('C: ratchet refuses a spent raise', c.out, 'was already spent');
    rj = JSON.parse(fs.readFileSync(jp(brain, 'state', 'ratchets.json'), 'utf8'));
    if (rj['F-RATCHET-ROSE']?.value === 20) ok('C: a failing ratchet does not move its record (a re-run stays RED)'); else bad('C: ratchet record moved on FAIL', String(rj['F-RATCHET-ROSE']?.value));

    // ================================================================ run D: unevaluatable claims -> exit 2, never GREEN
    say('  Run D: unknown claims', 36);
    const d = invokeDoctor(['-ClaimsPath', path.join(brain, 'claims-unknown.json')], fakeHome);
    exitIs('D: could-not-look is exit 2', d.code, 2);
    has('D: band printed', d.out, 'COULD-NOT-LOOK');
    has('D: generator exit 1 is could-not-look, not RED', d.out, 'U-GEN  generator exited 1');
    has('D: missing file for file_contains is unknown', d.out, '????  U-CONTAINS');
    has('D: file_fresh with maxDays 0 is unknown', d.out, "????  U-FRESH  'maxDays' must be a positive integer");
    has('D: config_paths_each with an absent config key is unknown', d.out, "????  U-TOMB  config key 'noSuchKey'");
    has('D: config_paths_each with no file and no contains is unknown', d.out, "????  U-CARDS  claim has no 'file' and no 'contains'");
    has('D: json_keyed_match with a missing collection path is unknown', d.out, "????  U-KEYED  collection 'vectors.nope' not found in");
    has('D: unregistered hook is unknown', d.out, '????  U-SMOKE');
    has('D: tree_equals with a missing folder is unknown', d.out, '????  U-TREEEQ  folder missing');
    has('D: tree_each with a missing root is unknown', d.out, '????  U-SCAN  root folder missing');
    has('D: tree_each that selects nothing is unknown, not green', d.out, '????  U-SCAN-NONE  nothing selected');
    has('D: tree_rules with no rules is unknown', d.out, "????  U-RULES  claim has no 'rules'");
    has('D: ratchet with no such row is unknown, not zero', d.out, "????  U-RATCHET-ROW  no row 'NOPE' under heading 'Summary'");
    has('D: ratchet with no such heading is unknown', d.out, "????  U-RATCHET-HEAD  heading 'Missing' not found");
    has('D: ratchet with an unsigned accepted entry is unknown', d.out, '????  U-RATCHET-REASON  accepted has no reason');
    has('D: unknown type is unknown', d.out, "unknown claim type 'bogus_type'");
    hasNot('D: never GREEN', d.out, 'GREEN');
    assertSnapshotRuns(t, a, c, d);   // selftest-snapshot.mjs

    // ================================================================ run E: -Kit -Json against the sandbox kit, bad pointer
    say('  Run E: -Kit -Json with a pointer naming a missing brain', 36);
    const e = run(process.execPath, [path.join(kitDoctor, 'doctor.mjs'), '-Kit', '-Json'], childEnv(fakeHome, badPointer));
    exitIs('E: pointer_valid false is RED under -Kit', e.code, 1);
    let ej = null;
    try { ej = JSON.parse(e.out); ok('E: -Json output parses'); } catch (err) { bad('E: -Json output parses', err.message); }
    if (ej) {
        if (ej.mode === 'kit' && ej.where && ej.where.kit === kit) ok('E: kit mode resolves ${KIT} to the checkout holding doctor.mjs'); else bad('E: kit resolution', `mode=${ej.mode} kit=${ej.where && ej.where.kit}`);
        const kp = (ej.bands.claims || []).find((x) => x.id === 'K-POINTER');
        if (kp && kp.status === 'FAIL' && /do not exist/.test(kp.detail)) ok('E: pointer_valid names the missing folder'); else bad('E: pointer_valid', kp ? `${kp.status}: ${kp.detail}` : 'no K-POINTER entry');
        const kt = (ej.bands.claims || []).find((x) => x.id === 'K-TREE');
        if (kt && kt.status === 'PASS') ok('E: kit tree_free_of passes with the span allow'); else bad('E: kit tree_free_of', kt ? kt.detail : 'no K-TREE entry');
        if (fs.existsSync(jp(kit, 'state', 'last-run.json'))) ok('E: -Kit writes state under the kit'); else bad('E: kit state', 'kit/state/last-run.json missing');
    }

    // ================================================================ run F: no pointer at all -> exit 2
    say('  Run F: no pointer', 36);
    const emptyHome = newDir(path.join(T, 'home-empty'));
    const f = invokeDoctor([], emptyHome);
    exitIs('F: no pointer is could-not-look', f.code, 2);
    has('F: says where it looked', f.out, 'pointer not found at');

    // ================================================================ run G: the shim resolves pluginRoot from the pointer
    // Doctor.bat on Windows, doctor.sh elsewhere: the shim this system's adopter double-clicks or runs.
    fs.rmSync(jp(brain, 'state', 'last-run.json'), { force: true });
    let g;
    if (IS_WIN) {
        say('  Run G: Doctor.bat shim', 36);
        const bat = path.join(brain, 'Doctor.bat');
        fs.copyFileSync(path.join(templates, 'Doctor.bat'), bat);
        // Workaround: without windowsVerbatimArguments Node escapes each " in the argument as \" before
        // cmd sees it, cmd does not unescape, so it looked for a program literally named with those
        // quotes, exited 1 and never ran the shim (both G cases failed on Windows with no state written).
        g = run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${bat}" -Quiet"`], childEnv(fakeHome, ''), { windowsVerbatimArguments: true });
    } else {
        say('  Run G: doctor.sh shim', 36);
        const sh = path.join(brain, 'doctor.sh');
        fs.copyFileSync(path.join(templates, 'doctor.sh'), sh);
        g = run('sh', [sh, '-Quiet'], childEnv(fakeHome, ''));
    }
    exitIs('G: shim passes the Doctor exit code through', g.code, 0);
    hasNot('G: no pause and no verdict line of its own with an argument', g.out, 'GREEN - nothing to do');
    if (fs.existsSync(jp(brain, 'state', 'last-run.json'))) ok('G: shim ran the kit Doctor (brain state written)'); else bad('G: shim', 'brain/state/last-run.json missing');

    // ================================================================ determinism: repos.generated.md is byte-identical across runs
    const g1 = fs.readFileSync(jp(brain, 'state', 'repos.generated.md'));
    invokeDoctor(['-Quiet'], fakeHome);
    const g2 = fs.readFileSync(jp(brain, 'state', 'repos.generated.md'));
    if (sameBytes(g1, g2)) ok('H: repos.generated.md is byte-identical on a re-run'); else bad('H: determinism', 'generated table changed with nothing changed');
    if (g1.length >= 3 && g1[0] === 0xef && g1[1] === 0xbb) bad('H: state files have no BOM', 'BOM found'); else ok('H: state files have no BOM');

    // ================================================================ run I: a brain under the root, and the root's own .claude as a repo
    // Neither is a project, so neither is "outside a category folder". With no categories.since
    // there is no backlog: every stray is a fail, the 2019 ones included.
    say('  Run I: outsideCategory with the brain and .claude under the root', 36);
    const brain2 = newTestRepo(root, 'brain2');
    git(path.join(root, '.claude'), ['init', '-q']);
    WJ(path.join(brain2, 'doctor.config.json'), { schema: 1, ownerRemotePatterns: ['github.com/test-owner/'], categories: { folders: ['category', 'scan'] } });
    WJ(path.join(brain2, 'claims.json'), { schema: 1, claims: [] });
    const ptr2 = path.join(T, 'pointer-brain2.json');
    WJ(ptr2, { schema: 1, root, brain: brain2, pluginRoot: kit, pluginKind: 'checkout' });
    const i = invokeDoctor([], fakeHome, ptr2);
    hasNot('I: the brain is never outside a category', i.out, 'outside a category folder: brain2');
    hasNot('I: the root .claude folder is never outside a category', i.out, 'outside a category folder: .claude');
    has('I: with no since, a 2019 stray is a fail like any other', i.out, 'outside a category folder: oldstray - a project lives at');
    hasNot('I: with no since there is no backlog line', i.out, 'predate the ratchet');

    truthRuns(t);   // run X (a crash is could-not-look) and run K (every registered hook is smoked), CR-2026-10-15-GAPS D6
    lawRuns(t);     // run L (the law build: the ADVISE legend, an unregistered hook) and run M (the docs build accepts DENY)
} catch (err) {
    bad('selftest ran to the end', err && err.stack ? err.stack : String(err));
} finally {
    if (!keepTemp) { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* best effort */ } }
    else say(`  fixtures kept at ${T}`);
}

say();
say(`  ${pass} passed, ${fail} failed`, fail === 0 ? 32 : 31);
say();
process.exitCode = fail > 0 ? 1 : 0;
