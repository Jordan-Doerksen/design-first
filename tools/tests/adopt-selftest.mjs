// adopt-selftest.mjs - proves adopt.mjs and remove.mjs against SPEC 5.6 on throwaway folders.
//   node tools/tests/adopt-selftest.mjs [-KeepTemp]
//
// Cases: fresh adopt (root not a repo) -> every file exists, pointer valid, installed.json carries
// sha256 + generated flags, LAW.md generated, Doctor ran and exited 0; the brain LAW.md grades
// every hook hooks.json registers, and the shipped BRAIN-LAW-01 passes, then goes RED on a hand
// edit; the law build keeps the kit grade for a hook the installed state does not name; second adopt (attach) ->
// nothing overwritten, diff printed for a file edited between runs; remove -> edited file kept and
// listed, unedited + generated deleted, pointer gone; -DryRun writes nothing; root-is-repo ->
// no snapshot pairs and settings.local.json when scope=personal.
//
// The pointer and the marker folder go through DF_POINTER_PATH / DF_MARKER_DIR, so the real
// pointer and the real markers are never touched. The Doctor is the real one, run by adopt.mjs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as F from '../lib/df-files.mjs';

const keepTemp = process.argv.slice(2).some((a) => /^--?keeptemp$/i.test(a));
const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(here, '..', '..');
const adopt = path.join(kit, 'tools', 'adopt.mjs');
const remove = path.join(kit, 'tools', 'remove.mjs');
const IS_WIN = process.platform === 'win32';

// Workaround: no folder name in this path may hold a measuring word as a word part (a part that starts
// with test, probe, verify or assert, or is spec or specs), or the live fence hook reads every fixture
// written here as a measuring file when an agent drives this script (isMeasuringPath in
// hooks/fence.mjs). 'df-adopt-st-' and a hex id hold none.
let T = path.join(os.tmpdir(), 'df-adopt-st-' + crypto.randomBytes(4).toString('hex'));
fs.mkdirSync(T, { recursive: true });
T = fs.realpathSync.native(T);

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const say = (s = '', code) => process.stdout.write((COLOR && code ? `\x1b[${code}m${s}\x1b[0m` : s) + '\n');
const results = [];
function check(name, ok, detail = '') {
    results.push({ pass: Boolean(ok), name });
    say(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`, ok ? 32 : 31);
    if (!ok && detail) { const flat = String(detail).replace(/\r?\n/g, ' | '); say('        ' + flat.slice(0, 400), 90); }
}
function run(script, args, pointer, markers) {
    const env = { ...process.env, DF_POINTER_PATH: pointer, DF_MARKER_DIR: markers, NO_COLOR: '1' };
    const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true, env, maxBuffer: 64 * 1024 * 1024 });
    return { out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, ''), code: r.status == null ? -1 : r.status };
}
function put(p, text) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); }
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const exists = (p) => fs.existsSync(p);
const jp = (base, ...rels) => path.join(base, ...rels.flatMap((r) => String(r).split(/[\\/]/)));
function hashes(dir) {
    const h = new Map();
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'state') walk(full); }
            else if (e.isFile()) h.set(full, F.fileSha256(full));
        }
    };
    walk(dir);
    return h;
}
const claimStatus = (res, id) => {
    try { const c = (JSON.parse(res.out).bands.claims || []).find((x) => x.id === id); return c ? String(c.status) : 'absent'; }
    catch { return `unparsed: ${res.out}`; }
};

say(); say(`adopt/remove self-test  (temp: ${T})`); say();

try {
    // ---------------------------------------------------------------- fixtures
    const root = path.join(T, 'root'); const brain = path.join(T, 'brain');
    for (const d of [root, path.join(root, 'frozen'), path.join(T, 'markers')]) fs.mkdirSync(d, { recursive: true });
    put(jp(root, 'frozen', 'ref.txt'), 'kept on purpose\n');
    put(jp(T, 'markers', 's1.advised'), 'x');
    const ptr1 = path.join(T, 'pointer1.json'); const markers = path.join(T, 'markers');
    const common = ['-Root', root, '-Brain', brain, '-OwnerName', 'Test Owner', '-GitHubOwners', 'alpha-owner', '-FrozenPaths', path.join(root, 'frozen'), '-BrainIsRepo', '-PluginRoot', kit];

    // ---------------------------------------------------------------- 1. fresh adopt
    say('-- fresh adopt (root is not a repo)');
    const r = run(adopt, common, ptr1, markers);
    check('fresh: adopt exits 0', r.code === 0, r.out);
    check('fresh: reports fresh mode', r.out.includes('[fresh mode]'), r.out);
    check('fresh: the brain carries its own DECISIONS.md and ARCHITECTURE.md (DES-01)', isFile(path.join(brain, 'DECISIONS.md')) && isFile(path.join(brain, 'ARCHITECTURE.md')));
    const dec = F.readText(path.join(brain, 'DECISIONS.md'));
    check('fresh: the brain manifest is filled, not a template', !/\{\{/.test(dec) && dec.includes('Test Owner'));
    const expected = ['CLAUDE.md', '.claude/settings.json'].map((x) => jp(root, x)).concat(
        ['me.md', 'voice.md', 'prohibitions.md', 'law.overlay.json', 'claims.json', 'doctor.config.json', 'entry.json', 'lessons.md', 'canonical.md', 'Doctor.bat', 'doctor.sh', 'LAW.md',
            'instructions/README.md', 'entry-point/CLAUDE.md.snapshot', 'entry-point/settings.json.snapshot', 'state/installed.json', '.gitattributes', '.gitignore'].map((x) => jp(brain, x)));
    const missing = expected.filter((x) => !isFile(x));
    check(`fresh: all ${expected.length} files exist`, missing.length === 0, 'missing: ' + missing.join(', '));
    check('fresh: brain is a git repo on main', exists(path.join(brain, '.git')) && F.git(brain, ['branch', '--show-current']).out.join('') === 'main');
    check('fresh: no commit was made (the owner commits)', F.git(brain, ['rev-parse', 'HEAD']).code !== 0);

    const claude = F.readText(path.join(root, 'CLAUDE.md'));
    check('fresh: root CLAUDE.md carries SAFE-01/04/06/09 in full, brain path, no unfilled token', /SAFE-01/.test(claude) && /SAFE-04/.test(claude) && /SAFE-06/.test(claude) && /SAFE-09/.test(claude) && claude.includes('rotated first') && claude.includes(brain) && !/\{\{/.test(claude), claude);
    check('fresh: root CLAUDE.md under 60 lines', claude.split('\n').length <= 60);
    const me = F.readText(path.join(brain, 'me.md'));
    check('fresh: me.md front-matter owner.name', me.startsWith('---\nowner:\n  name: Test Owner\n---\n'));
    const meBytes = fs.readFileSync(path.join(brain, 'me.md'));
    check('fresh: me.md is UTF-8 without BOM, LF only', meBytes[0] !== 0xef && !meBytes.includes(13));
    const bat = fs.readFileSync(path.join(brain, 'Doctor.bat'), 'utf8');
    check('fresh: Doctor.bat is CRLF', bat.includes('\r') && !/(?<!\r)\n/.test(bat));
    const shBytes = fs.readFileSync(path.join(brain, 'doctor.sh'));
    check('fresh: doctor.sh is LF only', !shBytes.includes(13));
    if (!IS_WIN) check('fresh: doctor.sh can be run as a program', (fs.statSync(path.join(brain, 'doctor.sh')).mode & 0o111) !== 0);

    const p = F.readJson(ptr1);
    check('fresh: pointer valid (schema 1, root, brain, pluginRoot = kit, pluginKind = checkout)', p.schema === 1 && p.root === root && p.brain === brain && p.pluginRoot === kit && p.pluginKind === 'checkout', JSON.stringify(p));

    const inst = F.readInstalled(jp(brain, 'state', 'installed.json'));
    const badSha = inst.filter((x) => !/^[0-9a-f]{64}$/.test(x.sha256));
    const lawRec = inst.find((x) => x.path === path.join(brain, 'LAW.md'));
    const meRec = inst.find((x) => x.path === path.join(brain, 'me.md'));
    check(`fresh: installed.json has ${inst.length} records, every sha256 64 hex`, inst.length >= 18 && badSha.length === 0);
    check('fresh: LAW.md generated:true, me.md generated:false', lawRec && lawRec.generated === true && meRec && meRec.generated === false);
    check('fresh: recorded sha equals the file on disk (me.md)', meRec && meRec.sha256 === F.fileSha256(path.join(brain, 'me.md')));
    const law = F.readText(path.join(brain, 'LAW.md'));
    check('fresh: LAW.md generated (header, SAFE-01, Summary)', law.startsWith('# LAW') && /SAFE-01/.test(law) && /## Summary/.test(law));

    const cfg = F.readJson(path.join(brain, 'doctor.config.json'));
    check('fresh: config ownerRemotePatterns from -GitHubOwners', cfg.ownerRemotePatterns.length === 1 && cfg.ownerRemotePatterns[0] === 'github.com/alpha-owner/');
    check('fresh: config frozenPaths ${ROOT}-relative, with forward slashes', cfg.frozenPaths.length === 1 && cfg.frozenPaths[0] === '${ROOT}/frozen', cfg.frozenPaths.join(','));
    check('fresh: config has 2 entryPointSnapshots pairs (root not a repo)', cfg.entryPointSnapshots.length === 2);
    check('fresh: snapshot is a byte copy of root CLAUDE.md', Buffer.compare(fs.readFileSync(path.join(root, 'CLAUDE.md')), fs.readFileSync(jp(brain, 'entry-point', 'CLAUDE.md.snapshot'))) === 0);
    check('fresh: Doctor ran and exited 0', /^\s*Doctor exit\s+0\b/m.test(r.out), r.out);
    check('fresh: soft_deny line printed for the frozen path, never written', /Writes, edits, or deletions under[\s\S]*frozen/.test(r.out) && r.out.includes('never writes that file'));

    // ---------------------------------------------------------------- 1b. the brain LAW.md tells the truth (CR-2026-10-15-GAPS D6)
    // Before D6 adopt typed three hook names, so every clause on the stop, route, ask, agent and
    // subagent hooks printed HONOUR "(mechanism not installed)"; and no shipped claim compared the
    // brain LAW.md with a fresh build, so a plugin update left sessions reading old law rows.
    say('-- the brain LAW.md: every registered hook graded, BRAIN-LAW-01 shipped');
    const registered = [...new Set([...F.readText(jp(kit, 'hooks', 'hooks.json')).matchAll(/hooks[\\/]+([A-Za-z0-9_-]+)\.mjs/g)].map((m) => m[1]))].sort();
    const lawStatePath = jp(brain, 'state', 'law-installed.json');
    const ls = isFile(lawStatePath) ? F.readJson(lawStatePath) : null;
    const recorded = ls && ls.hooks ? Object.entries(ls.hooks).filter(([, v]) => v === true).map(([k]) => k) : [];
    const unrecorded = registered.filter((x) => !recorded.includes(x));
    check(`fresh: state/law-installed.json records every hook hooks.json registers as installed (${registered.length})`, registered.length >= 1 && unrecorded.length === 0, 'not recorded as installed: ' + unrecorded.join(', '));
    const kitLaw = F.readJson(path.join(kit, 'law.json'));
    const lawLines = law.split('\n');
    const hookClauses = kitLaw.clauses.filter((c) => c.enforcedBy && c.enforcedBy.kind === 'hook');
    const falseRows = hookClauses.filter((c) => lawLines.some((l) => l.startsWith(`| ${c.id} |`) && l.includes('(mechanism not installed)'))).map((c) => c.id);
    check(`fresh: LAW.md prints no '(mechanism not installed)' row for a clause on a registered hook (${hookClauses.length} clauses)`, hookClauses.length >= 1 && falseRows.length === 0, 'rows: ' + falseRows.join(', '));
    const bl = F.readJson(path.join(brain, 'claims.json')).claims.filter((c) => c.id === 'BRAIN-LAW-01');
    check('fresh: the brain claims.json ships BRAIN-LAW-01 over LAW.md, built with the recorded installed state', bl.length === 1 && bl[0].type === 'generated_matches' && bl[0].output === '${BRAIN}/LAW.md' && bl[0].installed === '${BRAIN}/state/law-installed.json' && bl[0].overlay === '${BRAIN}/law.overlay.json');
    const doctor = jp(kit, 'tools', 'doctor', 'doctor.mjs');
    const dj = run(doctor, ['-Json'], ptr1, markers);
    const blStatus = claimStatus(dj, 'BRAIN-LAW-01');
    check('fresh: BRAIN-LAW-01 holds on the first Doctor run (adopt and the claim build the same LAW.md)', blStatus === 'PASS', blStatus);
    const lawPath = path.join(brain, 'LAW.md');
    const lawBytes = fs.readFileSync(lawPath);
    fs.appendFileSync(lawPath, '\n| HAND-01 | HOOK | a row typed by hand | `me.md` |\n\n');
    const dj2 = run(doctor, ['-Json'], ptr1, markers);
    const blStatus2 = claimStatus(dj2, 'BRAIN-LAW-01');
    check('fresh: a hand-edited brain LAW.md turns BRAIN-LAW-01 RED (exit 1)', blStatus2 === 'FAIL' && dj2.code === 1, `status ${blStatus2}, exit ${dj2.code}`);
    fs.writeFileSync(lawPath, lawBytes);   // put it back: the attach case below compares every brain file

    // The law build reads a hook the installed state does not name as no record (the kit grade
    // stands); only a recorded false prints HONOUR. A hook a later plugin version registers is
    // absent from an older state, and before D6 an absent name printed "(mechanism not installed)".
    const partState = path.join(T, 'law-installed-partial.json');
    put(partState, '{ "hooks": { "guard": false }, "rootSettings": true, "pointer": true }\n');
    const partLaw = path.join(T, 'LAW-partial.md');
    const rb = run(jp(kit, 'tools', 'law', 'build-law.mjs'), ['-Source', path.join(kit, 'law.json'), '-Overlay', jp(kit, 'templates', 'law.overlay.json'), '-Installed', partState, '-Out', partLaw], ptr1, markers);
    const guardC = hookClauses.find((c) => String(c.enforcedBy.ref).startsWith('hooks/guard.mjs'));
    const otherC = hookClauses.find((c) => !String(c.enforcedBy.ref).startsWith('hooks/guard.mjs'));
    const partLines = isFile(partLaw) ? F.readText(partLaw).split('\n') : [];
    const guardRow = partLines.find((l) => l.startsWith(`| ${guardC.id} |`)) || '';
    const otherRow = partLines.find((l) => l.startsWith(`| ${otherC.id} |`)) || '';
    check('law build: a hook recorded as not installed prints HONOUR (mechanism not installed)', rb.code === 0 && guardRow.startsWith(`| ${guardC.id} | HONOUR (mechanism not installed) |`), `exit ${rb.code}: ${guardRow} ${rb.out}`);
    check('law build: a hook the installed state does not name keeps its kit grade', rb.code === 0 && otherRow.startsWith(`| ${otherC.id} | ${otherC.grade} |`), `exit ${rb.code}: ${otherRow}`);

    // ---------------------------------------------------------------- 2. attach (second run, one file edited)
    say('-- attach (second adopt, me.md edited between runs)');
    const before = hashes(brain);
    const rootBefore = F.fileSha256(path.join(root, 'CLAUDE.md'));
    fs.appendFileSync(path.join(brain, 'me.md'), '\n## Edited by the owner\n\n');
    const editedSha = F.fileSha256(path.join(brain, 'me.md'));
    const r2 = run(adopt, common, ptr1, markers);
    check('attach: adopt exits 0', r2.code === 0, r2.out);
    check('attach: reports attach mode', r2.out.includes('[attach mode]'));
    check('attach: me.md kept and a unified diff printed', /^\s*kept\s+.*me\.md/m.test(r2.out) && /--- diff[\s\S]*me\.md/.test(r2.out) && r2.out.includes('+## Edited by the owner'), r2.out);
    check('attach: edited me.md not overwritten', F.fileSha256(path.join(brain, 'me.md')) === editedSha);
    const after = hashes(brain);
    const changed = [...before.keys()].filter((k) => path.basename(k) !== 'me.md' && after.get(k) !== before.get(k));
    check('attach: every other brain file byte-identical (after CRLF->LF)', changed.length === 0, changed.join(', '));
    check('attach: root CLAUDE.md untouched', F.fileSha256(path.join(root, 'CLAUDE.md')) === rootBefore);
    const inst2 = F.readInstalled(jp(brain, 'state', 'installed.json'));
    const meRec2 = inst2.find((x) => x.path === path.join(brain, 'me.md'));
    check('attach: installed.json merged by path; kept me.md record keeps the ORIGINAL sha', inst2.length === inst.length && meRec2 && meRec2.sha256 === meRec.sha256);

    // ---------------------------------------------------------------- 3. dry run writes nothing
    say('-- dry run');
    const root2 = path.join(T, 'root2'); const brain2 = path.join(T, 'brain2'); const ptr2 = path.join(T, 'pointer2.json');
    fs.mkdirSync(root2, { recursive: true });
    const r3 = run(adopt, ['-Root', root2, '-Brain', brain2, '-OwnerName', 'Dry Owner', '-BrainIsRepo', '-PluginRoot', kit, '-DryRun'], ptr2, markers);
    check('dry: exits 0 and says DRY RUN', r3.code === 0 && r3.out.includes('DRY RUN'), r3.out);
    check('dry: lists would-write lines incl. LAW.md and the pointer', /^\s*would write\s+.*CLAUDE\.md/m.test(r3.out) && /^\s*would write\s+.*LAW\.md/m.test(r3.out) && /^\s*would write\s+.*pointer2\.json/m.test(r3.out));
    check('dry: nothing written (no brain, no root CLAUDE.md, no pointer)', !exists(brain2) && !exists(path.join(root2, 'CLAUDE.md')) && !exists(path.join(root2, '.claude')) && !exists(ptr2));
    check('dry: Doctor not run', r3.out.includes('Doctor           not run'));

    // ---------------------------------------------------------------- 4. root is a repo, personal scope
    say('-- root is a git work tree, scope = personal');
    const root3 = path.join(T, 'root3'); const brain3 = path.join(T, 'brain3'); const ptr3 = path.join(T, 'pointer3.json');
    fs.mkdirSync(root3, { recursive: true });
    F.git(root3, ['init', '-q', '-b', 'main']);
    const r4 = run(adopt, ['-Root', root3, '-Brain', brain3, '-OwnerName', 'Repo Owner', '-SettingsScope', 'personal', '-PluginRoot', kit], ptr3, markers);
    check('repo: adopt exits 0', r4.code === 0, r4.out);
    check('repo: settings.local.json written, settings.json not', isFile(jp(root3, '.claude', 'settings.local.json')) && !exists(jp(root3, '.claude', 'settings.json')));
    const cfg3 = F.readJson(path.join(brain3, 'doctor.config.json'));
    check('repo: no snapshot pairs and no entry-point folder', cfg3.entryPointSnapshots.length === 0 && !exists(path.join(brain3, 'entry-point')));
    check('repo: no -BrainIsRepo -> brain3 not a repo, no .gitattributes', !exists(path.join(brain3, '.git')) && !exists(path.join(brain3, '.gitattributes')));
    check('repo: Doctor ran and exited 0', /^\s*Doctor exit\s+0\b/m.test(r4.out), r4.out);

    // ---------------------------------------------------------------- 5. the default layout: brain UNDER root, as a repo
    // The adopt command's recommended answer puts the brain at <root>/brain. The manifest scan then
    // selects it as a repository under root; before 0.1.28 it had no DECISIONS.md and the first
    // Doctor run was RED (fix list, chunk 10, row 1). Cases 1 to 4 kept the brain beside root.
    say('-- default layout: brain under root, brain is a repo');
    const root5 = path.join(T, 'root5'); const brain5 = path.join(root5, 'brain'); const ptr5 = path.join(T, 'pointer5.json');
    fs.mkdirSync(root5, { recursive: true });
    const r5 = run(adopt, ['-Root', root5, '-Brain', brain5, '-OwnerName', 'Default Owner', '-BrainIsRepo', '-PluginRoot', kit], ptr5, markers);
    check('default: adopt exits 0', r5.code === 0, r5.out);
    check('default: no SCAN-MANIFEST fail on the first run', !r5.out.includes('FAIL  SCAN-MANIFEST'), r5.out);
    check('default: Doctor ran and exited 0 with the brain under root', /^\s*Doctor exit\s+0\b/m.test(r5.out), r5.out);

    // ---------------------------------------------------------------- 6. remove: dry run, then real
    say('-- remove');
    const r6 = run(remove, ['-DryRun'], ptr3, markers);
    check('remove dry: exits 0, deletes nothing', r6.code === 0 && exists(path.join(brain3, 'me.md')) && exists(ptr3) && exists(path.join(brain3, 'state')), r6.out);

    // Make LAW.md differ from its record: generated files go regardless of hash.
    fs.appendFileSync(path.join(brain, 'LAW.md'), '\nhand edit\n\n');
    const r7 = run(remove, [], ptr1, markers);
    check('remove: exits 0', r7.code === 0, r7.out);
    check('remove: edited me.md KEPT and listed', exists(path.join(brain, 'me.md')) && /^\s*KEPT\s+.*me\.md/m.test(r7.out) && r7.out.includes('kept      1 file(s)'), r7.out);
    const goneFiles = ['voice.md', 'claims.json', 'doctor.config.json', 'Doctor.bat', 'doctor.sh', 'entry-point/CLAUDE.md.snapshot', 'instructions/README.md', '.gitattributes'].map((x) => jp(brain, x))
        .concat([path.join(root, 'CLAUDE.md'), jp(root, '.claude', 'settings.json')]);
    const still = goneFiles.filter((x) => exists(x));
    check('remove: unedited recorded files deleted (brain + root)', still.length === 0, still.join(', '));
    check('remove: hand-edited LAW.md deleted anyway (generated:true)', !exists(path.join(brain, 'LAW.md')));
    check('remove: pointer, state/, markers gone', !exists(ptr1) && !exists(path.join(brain, 'state')) && !exists(markers));
    check('remove: empty entry-point/ and instructions/ removed, brain folder and .git left', !exists(path.join(brain, 'entry-point')) && !exists(path.join(brain, 'instructions')) && exists(path.join(brain, '.git')));
    check('remove: prints the uninstall line', r7.out.includes('claude plugin uninstall design-first'));
    check('remove: frozen folder (never recorded) untouched', exists(jp(root, 'frozen', 'ref.txt')));
} catch (e) {
    check(`selftest crashed: ${e && e.message ? e.message : e}`, false, e && e.stack ? e.stack : '');
}

const passed = results.filter((x) => x.pass).length; const failed = results.length - passed;
say();
say(`  ${passed} passed, ${failed} failed, ${results.length} total`, failed === 0 ? 32 : 31);
say();
if (failed === 0 && !keepTemp) { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* best effort */ } }
else say(`  fixtures kept at ${T}`);
process.exitCode = failed > 0 ? 1 : 0;
