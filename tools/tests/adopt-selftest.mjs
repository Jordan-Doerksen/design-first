// adopt-selftest.mjs - proves adopt.mjs, remove.mjs and control.mjs against SPEC 5.6 on throwaway folders.
//   node tools/tests/adopt-selftest.mjs [-KeepTemp]
//
// Cases: fresh adopt (root not a repo) -> every file exists, pointer valid, installed.json carries
// sha256 + generated flags, LAW.md generated, Doctor ran and exited 0; the brain LAW.md grades
// every hook hooks.json registers, and the shipped BRAIN-LAW-01 passes, then goes RED on a hand
// edit; the law build keeps the kit grade for a hook the installed state does not name; second adopt (attach) ->
// nothing overwritten, diff printed for a file edited between runs; remove -> edited file kept and
// listed, unedited + generated deleted, pointer gone; -DryRun writes nothing; root-is-repo ->
// no snapshot pairs and settings.local.json when scope=personal; control (CR-2026-10-19-CONTROL
// chunk 1) -> a domain card written from the template, the Method card with the kit's four checks,
// an existing card kept with its diff printed, the Intake card written, -DryRun writes nothing,
// a missing or two-word domain refused. 0.3.0: a separate brain folder gets its own
// .claude/settings.json beside its vendored copy (written when missing, same on attach, deleted by
// remove with the root's), so a cloud session on the brain clone loads the hooks. A vendor step that
// refuses (a kit copy whose manifest names an include entry that does not exist) leaves each settings
// file with the pc permission set alone and no hooks block, and adopt exits 1; adopt's ERROR line is
// the vendor tool's own (review findings 8 and 9). Under a set other than pc (cloud-writer) the same
// refusal writes no settings file where there was none and leaves one that is there as it was, so no
// ask row reaches a cloud file; after any vendor failure the next steps start with the fix-up. A file
// at the old fixed temp name (<temp>/design-first-adopt) stops nothing: the law build and a kept
// file's diff each take a fresh temp folder and leave nothing behind. KIT-VENDOR-02, a ${BRAIN} tree_sha,
// holds the brain's own vendored copy in every layout and scope, the -Scope brain -Host cloud run
// included, where the ${ROOT} claims are skipped (review finding 17). A temp folder that does not exist
// stops adopt before its first write (exit 2, could not look; a dry run says the same). The -Vendor false
// line names every command that turns its three claims green; run as printed they do, with a separate
// brain and with the brain under the root; it names each claim with the band the run's Doctor gives it. A
// settings file with a hooks key of its own is kept byte for byte by a fresh adopt (shared and personal
// scope), its diff and the merge command printed; the command, run as printed, gives the kit's hooks key;
// a file with no hooks key, or with the render's, is merged; SETTINGS-BLOCK-01's why says the merge replaces the
// whole hooks key. Under the personal scope the root's commit step names .claude/kit alone, and the line under it
// says, before its render command, when the shared settings file there has a hooks key of its own; so do the attach
// kept line, the -Vendor false fix-up and the vendor-failure step, in the same words (M27), which the fresh kept line
// and its next step give too, and over a file with no hooks key each gives the command alone. A git clone of
// an adopted brain carries state/law-installed.json, and the
// cloud brain Doctor there is RED on RESTORE-01 alone until a drill is logged and committed, then GREEN.
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
function run(script, args, pointer, markers, extraEnv = {}) {
    const env = { ...process.env, DF_POINTER_PATH: pointer, DF_MARKER_DIR: markers, NO_COLOR: '1', ...extraEnv };
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
const rxEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The line adopt printed for one file, by its verb (kept, merged, wrote, same) and its full path.
const lineFor = (out, verb, file) => out.split('\n').find((l) => new RegExp(`^\\s*${verb}\\s+${rxEscape(file)}\\s`).test(l)) || '';
// A fixture commit made by the self-test itself: an identity given on the command line, no signing.
const GIT_ID = ['-c', 'user.name=Adopt Selftest', '-c', 'user.email=selftest@example.invalid', '-c', 'commit.gpgsign=false'];
// A git step adopt printed, run as printed: its words as typed (a quoted word kept whole), its commands split at
// '; ', each run with git. Only the environment adds an identity, so the step's own words are never changed.
function runPrinted(step) {
    const env = { ...process.env, GIT_AUTHOR_NAME: 'Adopt Selftest', GIT_AUTHOR_EMAIL: 'selftest@example.invalid', GIT_COMMITTER_NAME: 'Adopt Selftest', GIT_COMMITTER_EMAIL: 'selftest@example.invalid', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false' };
    const commands = [[]];
    for (const m of String(step).matchAll(/"([^"]*)"|(;)|([^\s;"]+)/g)) {
        if (m[2]) commands.push([]);
        else commands[commands.length - 1].push(m[1] != null ? m[1] : m[3]);
    }
    const ran = [];
    for (const words of commands.filter((w) => w.length)) {
        if (words[0] !== 'git') return { code: -1, out: `not a git command: ${words.join(' ')}` };
        const r = spawnSync('git', words.slice(1), { encoding: 'utf8', windowsHide: true, env });
        ran.push(`${words.join(' ')} -> exit ${r.status}${r.stderr ? `: ${r.stderr.trim()}` : ''}`);
        if (r.status !== 0) return { code: r.status == null ? -1 : r.status, out: ran.join(' | ') };
    }
    return { code: ran.length ? 0 : -1, out: ran.join(' | ') || 'no command in the step' };
}
// A printed node command (node "<script>" and its words), run as printed on this suite's node.
function runPrintedNode(command, pointer, markers) {
    const words = [...String(command).matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] != null ? m[1] : m[2]));
    return words[0] === 'node' && words.length > 1 ? run(words[1], words.slice(2), pointer, markers) : { code: -1, out: `not a node command: ${command}` };
}
const nextSteps = (out) => { const ls = out.split('\n'); const at = ls.findIndex((l) => /^\s*next\s*$/.test(l)); return at < 0 ? [] : ls.slice(at + 1).filter((l) => /^\s+\d+\.\s/.test(l)); };

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

    // ---------------------------------------------------------------- 1a. the vendored kit and the rendered settings (0.3.0, KIT-01, KIT-03)
    // A fresh adopt copies the manifest into <root>/.claude/kit/ and <brain>/.claude/kit/ (the brain is
    // a separate folder here), writes the VERSION that names the bytes, renders the root settings
    // through tools/settings.mjs (-Vendored -Host pc -Set pc) and records every vendored file under
    // installed.json's vendored list, so remove.mjs can take the copies away by their sha.
    say('-- fresh adopt: the vendored kit, the rendered settings, the record');
    const rootKit = jp(root, '.claude', 'kit');
    const brainKit = jp(brain, '.claude', 'kit');
    check('fresh: the root carries .claude/kit/VERSION and so does the brain (a separate folder)', isFile(path.join(rootKit, 'VERSION')) && isFile(path.join(brainKit, 'VERSION')), r.out);
    const vendorTool = jp(kit, 'tools', 'vendor.mjs');
    const vc = run(vendorTool, ['-Target', root, '-Check'], ptr1, markers);
    check('fresh: vendor.mjs -Check accepts the root copy (exit 0, vendor: ok)', vc.code === 0 && /^vendor: ok /m.test(vc.out), vc.out);
    const settingsTool = jp(kit, 'tools', 'settings.mjs');
    const sc = run(settingsTool, ['-Vendored', '-Host', 'pc', '-Set', 'pc', '-Check', '-Out', jp(root, '.claude', 'settings.json')], ptr1, markers);
    check('fresh: settings.mjs -Vendored -Host pc -Set pc -Check accepts the root settings file (exit 0)', sc.code === 0 && /^settings: ok /m.test(sc.out), sc.out);
    const rootSettings = F.readJson(jp(root, '.claude', 'settings.json'));
    check('fresh: the settings file carries the pc deny rows and a hooks block that runs .claude/kit/hooks/guard.mjs', Array.isArray(rootSettings.permissions && rootSettings.permissions.deny) && rootSettings.permissions.deny.includes('Read(**/.env)') && JSON.stringify(rootSettings.hooks || {}).includes('${CLAUDE_PROJECT_DIR}/.claude/kit/hooks/guard.mjs') && !JSON.stringify(rootSettings).includes('CLAUDE_PLUGIN_ROOT'), JSON.stringify(rootSettings).slice(0, 300));
    // 0.3.0 (fix pass): the brain is a separate folder here, so it gets its own .claude/settings.json
    // (vendored form, the same set) beside its vendored copy: a cloud session on the brain clone loads
    // the hooks, and -Scope brain -Host cloud on it reads that file as its registration record.
    const brainSettings = jp(brain, '.claude', 'settings.json');
    check('fresh: the brain (a separate folder) carries its own .claude/settings.json beside its vendored copy', isFile(brainSettings), r.out);
    const scb = run(settingsTool, ['-Vendored', '-Set', 'pc', '-Out', brainSettings, '-Check'], ptr1, markers);
    check('fresh: settings.mjs -Vendored -Set pc -Check accepts the brain settings file (exit 0)', scb.code === 0 && /^settings: ok /m.test(scb.out), scb.out);
    const instDoc = F.readJson(jp(brain, 'state', 'installed.json'));
    const vRows = Array.isArray(instDoc.vendored) ? instDoc.vendored : [];
    check('fresh: installed.json records the vendored files as { path, sha256 } rows under vendored, beside files', Array.isArray(instDoc.files) && vRows.length >= 10 && vRows.every((x) => /^\.claude\/kit\//.test(x.path) && /^[0-9a-f]{64}$/.test(x.sha256)), JSON.stringify(vRows.slice(0, 2)));
    const guardVendoredRow = vRows.find((x) => x.path === '.claude/kit/hooks/guard.mjs');
    check('fresh: the recorded vendored sha equals the file on disk in both copies (hooks/guard.mjs)', guardVendoredRow && guardVendoredRow.sha256 === F.fileSha256(path.join(rootKit, 'hooks', 'guard.mjs')) && guardVendoredRow.sha256 === F.fileSha256(path.join(brainKit, 'hooks', 'guard.mjs')), JSON.stringify(guardVendoredRow));
    check('fresh: the adopt output names the vendored copies and the settings render', /vendored \d+ files, sha [0-9a-f]{12}/.test(r.out) && /settings\.mjs/.test(r.out), r.out);

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
    // 0.3.0: the two template claims on what adopt vendored and rendered hold on the first run.
    const kvStatus = claimStatus(dj, 'KIT-VENDOR-01');
    check('fresh: KIT-VENDOR-01 (tree_sha on the root .claude/kit/VERSION) PASSES on the first Doctor run', kvStatus === 'PASS', kvStatus);
    const kv2Status = claimStatus(dj, 'KIT-VENDOR-02');
    check('fresh: KIT-VENDOR-02 (tree_sha on the brain .claude/kit/VERSION) PASSES on the first Doctor run', kv2Status === 'PASS', kv2Status);
    const sbStatus = claimStatus(dj, 'SETTINGS-BLOCK-01');
    check('fresh: SETTINGS-BLOCK-01 (the rendered hooks block in .claude/settings.json) PASSES on the first Doctor run', sbStatus === 'PASS', sbStatus);
    const brainClaims = F.readJson(path.join(brain, 'claims.json')).claims;
    const sb = brainClaims.find((c) => c.id === 'SETTINGS-BLOCK-01');
    check('fresh: the brain SETTINGS-BLOCK-01 names ${ROOT}/.claude/settings.json and carries the rendered hooks block as its subset', sb && sb.type === 'json_subset_equal' && sb.path === '${ROOT}/.claude/settings.json' && sb.subset && sb.subset.hooks && JSON.stringify(sb.subset.hooks) === JSON.stringify(rootSettings.hooks), JSON.stringify(sb || null).slice(0, 300));
    // The host typing on the template (INTEGRATION-NOTES): the brain in place, run as a cloud brain (doctor.mjs
    // -Scope brain -Root <brain> -Host cloud, no pointer read), SKIPS BRAIN-POINTER-01 and TOMBSTONE-01 (host pc)
    // and the ${ROOT} claims, and nothing FAILs. The run exits 0 and BRAIN-LAW-01 PASSES there (0.3.0
    // registry-readers): the vendored copy carries hooks/registry.json, which the vendored build-law.mjs reads for
    // its registration check (hooks/hooks.json never travels), so the cloud brain builds the LAW.md adopt wrote.
    // This is the brain in place, with all of its state/: state/installed.json gives RESTORE-01 its grace period.
    // A git clone of the brain carries state/law-installed.json alone of state/ and gets no grace: the clone case
    // below (section 5f) proves what the same command says there.
    const djc = run(doctor, ['-Scope', 'brain', '-Root', brain, '-Host', 'cloud', '-Json'], ptr1, markers);
    const cloudIds = ['BRAIN-POINTER-01', 'TOMBSTONE-01', 'KIT-VENDOR-01', 'SETTINGS-BLOCK-01'];
    const cloudFails = (() => { try { return (JSON.parse(djc.out).bands.claims || []).filter((c) => c.status === 'FAIL').map((c) => c.id); } catch { return ['unparsed']; } })();
    check('fresh: under -Scope brain -Host cloud the host pc claims (BRAIN-POINTER-01, TOMBSTONE-01) and the two ${ROOT} claims are SKIPPED, nothing FAILs', cloudIds.every((id) => claimStatus(djc, id) === 'SKIPPED') && cloudFails.length === 0, `${cloudIds.map((id) => `${id} ${claimStatus(djc, id)}`).join(', ')}; FAIL: ${cloudFails.join(',')}`);
    check('fresh: under -Scope brain -Host cloud the run exits 0 and BRAIN-LAW-01 PASSES (the vendored law build reads hooks/registry.json)', djc.code === 0 && claimStatus(djc, 'BRAIN-LAW-01') === 'PASS', `exit ${djc.code}; BRAIN-LAW-01 ${claimStatus(djc, 'BRAIN-LAW-01')}; ${djc.out.slice(0, 300)}`);
    const cloudSurvey = (() => { try { return JSON.parse(djc.out).bands.survey || []; } catch { return [{ kind: 'unparsed', message: djc.out.slice(0, 200) }]; } })();
    check('fresh: under -Scope brain -Host cloud the brain settings file is the registration record: no hooksJsonMissing finding, exit 0', djc.code === 0 && !cloudSurvey.some((f) => f.kind === 'hooksJsonMissing' || f.kind === 'unparsed'), cloudSurvey.filter((f) => f.kind === 'hooksJsonMissing' || f.kind === 'unparsed').map((f) => f.message).join(' | '));
    // A cloud brain run recomputes the brain's own vendored copy: KIT-VENDOR-02's ${BRAIN} path is not skipped under
    // -Host cloud, where KIT-VENDOR-01's ${ROOT} path is (review finding 17). Red first: no such claim, so the cloud run
    // proved no copy and a flipped byte in it left the run at exit 0. The byte is put back before the next case.
    check('fresh: under -Scope brain -Host cloud KIT-VENDOR-02 (the brain copy) PASSES, never SKIPPED', claimStatus(djc, 'KIT-VENDOR-02') === 'PASS', claimStatus(djc, 'KIT-VENDOR-02'));
    const brainLawVendored = path.join(brainKit, 'law.json');
    const brainLawBytes = isFile(brainLawVendored) ? fs.readFileSync(brainLawVendored) : null;
    if (brainLawBytes) fs.appendFileSync(brainLawVendored, '\n');
    const djcFlip = run(doctor, ['-Scope', 'brain', '-Root', brain, '-Host', 'cloud', '-Json'], ptr1, markers);
    const kv2Flip = claimStatus(djcFlip, 'KIT-VENDOR-02');
    check('fresh: a one-byte change in the brain copy turns KIT-VENDOR-02 FAIL under -Scope brain -Host cloud (exit 1)', brainLawBytes && kv2Flip === 'FAIL' && djcFlip.code === 1, `status ${kv2Flip}, exit ${djcFlip.code}`);
    if (brainLawBytes) fs.writeFileSync(brainLawVendored, brainLawBytes);
    // A flipped byte in the root copy turns KIT-VENDOR-01 RED; put back before the attach case.
    const lawVendored = path.join(rootKit, 'law.json');
    const lawVendoredBytes = isFile(lawVendored) ? fs.readFileSync(lawVendored) : null;
    if (lawVendoredBytes) fs.appendFileSync(lawVendored, '\n');
    const djFlip = run(doctor, ['-Json'], ptr1, markers);
    const kvFlip = claimStatus(djFlip, 'KIT-VENDOR-01');
    check('fresh: a one-byte change in the vendored law.json turns KIT-VENDOR-01 FAIL (exit 1)', lawVendoredBytes && kvFlip === 'FAIL' && djFlip.code === 1, `status ${kvFlip}, exit ${djFlip.code}`);
    if (lawVendoredBytes) fs.writeFileSync(lawVendored, lawVendoredBytes);
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
    // 0.3.0: a vendored file edited after adopt stays edited: attach writes only missing files, and a
    // vendored copy with its VERSION is not missing (vendor.mjs alone would restore the kit's bytes).
    const vendoredGuard = path.join(rootKit, 'hooks', 'guard.mjs');
    if (isFile(vendoredGuard)) fs.appendFileSync(vendoredGuard, '\n// edited by the owner after adopt\n');
    const rootKitBefore = exists(rootKit) ? hashes(rootKit) : new Map();
    const settingsBefore = F.fileSha256(jp(root, '.claude', 'settings.json'));
    const brainSettingsBefore = isFile(brainSettings) ? F.fileSha256(brainSettings) : null;
    const before = hashes(brain);
    const rootBefore = F.fileSha256(path.join(root, 'CLAUDE.md'));
    fs.appendFileSync(path.join(brain, 'me.md'), '\n## Edited by the owner\n\n');
    const editedSha = F.fileSha256(path.join(brain, 'me.md'));
    const r2 = run(adopt, common, ptr1, markers);
    check('attach: adopt exits 0', r2.code === 0, r2.out);
    check('attach: reports attach mode', r2.out.includes('[attach mode]'));
    const rootKitAfter = exists(rootKit) ? hashes(rootKit) : new Map();
    const kitChanged = [...rootKitBefore.keys()].filter((k) => rootKitAfter.get(k) !== rootKitBefore.get(k)).concat([...rootKitAfter.keys()].filter((k) => !rootKitBefore.has(k)));
    check('attach: no vendored byte changes under <root>/.claude/kit (the edited guard.mjs included) and the copy is reported kept', kitChanged.length === 0 && /^\s*kept\s+.*[\\/]\.claude[\\/]kit/m.test(r2.out), kitChanged.join(', ') + ' | ' + r2.out);
    check('attach: the settings file is reported same and not rewritten', F.fileSha256(jp(root, '.claude', 'settings.json')) === settingsBefore && /^\s*same\s+.*[\\/]\.claude[\\/]settings\.json\s/m.test(r2.out), r2.out);
    check('attach: the Doctor is RED on KIT-VENDOR-01 after the edit (the tree is not what its VERSION says)', /FAIL\s+KIT-VENDOR-01/.test(r2.out) && !/^\s*Doctor exit\s+0\b/m.test(r2.out), r2.out);
    check('attach: me.md kept and a unified diff printed', /^\s*kept\s+.*me\.md/m.test(r2.out) && /--- diff[\s\S]*me\.md/.test(r2.out) && r2.out.includes('+## Edited by the owner'), r2.out);
    check('attach: edited me.md not overwritten', F.fileSha256(path.join(brain, 'me.md')) === editedSha);
    const after = hashes(brain);
    const changed = [...before.keys()].filter((k) => path.basename(k) !== 'me.md' && after.get(k) !== before.get(k));
    check('attach: every other brain file byte-identical (after CRLF->LF)', changed.length === 0, changed.join(', '));
    check('attach: root CLAUDE.md untouched', F.fileSha256(path.join(root, 'CLAUDE.md')) === rootBefore);
    const inst2 = F.readInstalled(jp(brain, 'state', 'installed.json'));
    const meRec2 = inst2.find((x) => x.path === path.join(brain, 'me.md'));
    check('attach: installed.json merged by path; kept me.md record keeps the ORIGINAL sha', inst2.length === inst.length && meRec2 && meRec2.sha256 === meRec.sha256);
    const instDoc2 = F.readJson(jp(brain, 'state', 'installed.json'));
    check('attach: installed.json keeps the vendored rows of the first run (the files list is rewritten, the vendored list kept)', Array.isArray(instDoc2.vendored) && instDoc2.vendored.length === vRows.length, JSON.stringify(Object.keys(instDoc2)));

    const brainSettingsRx = brainSettings.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    check('attach: the brain settings file is reported same and not rewritten', brainSettingsBefore != null && F.fileSha256(brainSettings) === brainSettingsBefore && new RegExp(`^\\s*same\\s+${brainSettingsRx}\\s`, 'm').test(r2.out), r2.out);
    // Attach writes only what is missing: with the brain settings file gone, a third run writes it
    // again (the root's stays same), as the root's file would be written again.
    if (isFile(brainSettings)) fs.rmSync(brainSettings);
    const r2b = run(adopt, common, ptr1, markers);
    check('attach: a missing brain settings file is written again by the next attach run, the root\'s reported same', r2b.code === 0 && r2b.out.includes('[attach mode]') && isFile(brainSettings) && new RegExp(`^\\s*wrote\\s+${brainSettingsRx}\\s`, 'm').test(r2b.out) && /^\s*same\s+.*root[\\/]\.claude[\\/]settings\.json\s/m.test(r2b.out), r2b.out);
    check('attach: the brain settings file written again is the render (settings.mjs -Check exit 0)', brainSettingsBefore != null && F.fileSha256(brainSettings) === brainSettingsBefore, `${brainSettingsBefore} vs ${isFile(brainSettings) ? F.fileSha256(brainSettings) : 'absent'}`);

    // ---------------------------------------------------------------- 3. dry run writes nothing
    say('-- dry run');
    const root2 = path.join(T, 'root2'); const brain2 = path.join(T, 'brain2'); const ptr2 = path.join(T, 'pointer2.json');
    fs.mkdirSync(root2, { recursive: true });
    const r3 = run(adopt, ['-Root', root2, '-Brain', brain2, '-OwnerName', 'Dry Owner', '-BrainIsRepo', '-PluginRoot', kit, '-DryRun'], ptr2, markers);
    check('dry: exits 0 and says DRY RUN', r3.code === 0 && r3.out.includes('DRY RUN'), r3.out);
    check('dry: lists would-write lines incl. LAW.md and the pointer', /^\s*would write\s+.*CLAUDE\.md/m.test(r3.out) && /^\s*would write\s+.*LAW\.md/m.test(r3.out) && /^\s*would write\s+.*pointer2\.json/m.test(r3.out));
    check('dry: nothing written (no brain, no root CLAUDE.md, no pointer)', !exists(brain2) && !exists(path.join(root2, 'CLAUDE.md')) && !exists(path.join(root2, '.claude')) && !exists(ptr2));
    check('dry: Doctor not run', r3.out.includes('Doctor           not run'));
    check('dry: the vendored kit and the settings render are listed as would-write, and no .claude/kit exists', /\.claude[\\/]kit[\\/]VERSION/.test(r3.out) && /^\s*would write\s+.*settings\.json/m.test(r3.out) && !exists(jp(root2, '.claude', 'kit')) && !exists(jp(brain2, '.claude', 'kit')), r3.out);

    check('dry: the brain settings file (a separate brain) is listed as would-write and not written', /^\s*would write\s+.*brain2[\\/]\.claude[\\/]settings\.json\s/m.test(r3.out) && !exists(jp(brain2, '.claude')), r3.out);

    // ---------------------------------------------------------------- 3b. the temp folder is the run's own
    // adopt builds the brain LAW.md in a temp folder, and a kept file's diff needs a temp file too. Both were
    // the fixed <os temp>/design-first-adopt, so two adopt runs at once wrote, read and deleted each other's
    // files there (two self-test clones run side by side failed four cases). Each now takes a fresh folder
    // (fs.mkdtempSync) and removes it after, also on a throw. Red first, deterministic: with a FILE planted at
    // that fixed name, adopt exited 1 (EEXIST at the mkdir), the second run at the diff's mkdir.
    say('-- the temp folder: a fresh one per run, removed after (a file at the old fixed name stops nothing)');
    const tmpPlanted = path.join(T, 'tmp-planted');
    put(path.join(tmpPlanted, 'design-first-adopt'), 'a file where the fixed temp folder used to be\n');
    const tmpEnv = { TMPDIR: tmpPlanted, TMP: tmpPlanted, TEMP: tmpPlanted };
    const leftInTmp = () => fs.readdirSync(tmpPlanted).filter((n) => n !== 'design-first-adopt');
    const rootT = path.join(T, 'root-tmp'); const brainT = path.join(T, 'brain-tmp'); const ptrT = path.join(T, 'pointer-tmp.json');
    fs.mkdirSync(rootT, { recursive: true });
    const rt = run(adopt, ['-Root', rootT, '-Brain', brainT, '-OwnerName', 'Temp Owner', '-PluginRoot', kit], ptrT, markers, tmpEnv);
    check('tmp: with a file at <temp>/design-first-adopt, adopt exits 0 and writes the brain LAW.md (its own temp folder)', rt.code === 0 && isFile(path.join(brainT, 'LAW.md')) && /^\s*brain LAW\.md\s+wrote\s*$/m.test(rt.out), rt.out);
    check('tmp: that adopt leaves nothing behind in the temp folder (the planted file alone is there)', leftInTmp().length === 0 && isFile(path.join(tmpPlanted, 'design-first-adopt')), leftInTmp().join(', '));
    // A root CLAUDE.md that exists and differs is kept and its diff printed, through a temp file of its own.
    const rootT2 = path.join(T, 'root-tmp2'); const brainT2 = path.join(T, 'brain-tmp2'); const ptrT2 = path.join(T, 'pointer-tmp2.json');
    put(jp(rootT2, 'CLAUDE.md'), '# The entry file this root had before adopt\n');
    const rt2 = run(adopt, ['-Root', rootT2, '-Brain', brainT2, '-OwnerName', 'Temp Owner', '-PluginRoot', kit], ptrT2, markers, tmpEnv);
    check('tmp: with a file at <temp>/design-first-adopt, a kept root CLAUDE.md still gets its diff printed and adopt exits 0', rt2.code === 0 && /^\s*kept\s+.*root-tmp2[\\/]CLAUDE\.md/m.test(rt2.out) && /--- diff [^\n]*CLAUDE\.md[\s\S]*\+# The entry file this root had before adopt/.test(rt2.out), rt2.out);
    check('tmp: the diff leaves nothing behind in the temp folder either', leftInTmp().length === 0, leftInTmp().join(', '));
    // Removed also on a throw: a folder at <brain>/LAW.md makes the law step's write throw inside its try, adopt
    // exits 1 with that ERROR, and the run's temp folder is gone all the same. Red first: with the removal after
    // the try instead of in its finally, design-first-adopt-<suffix> was left behind.
    const rootT3 = path.join(T, 'root-tmp3'); const brainT3 = path.join(T, 'brain-tmp3'); const ptrT3 = path.join(T, 'pointer-tmp3.json');
    fs.mkdirSync(rootT3, { recursive: true }); fs.mkdirSync(path.join(brainT3, 'LAW.md'), { recursive: true });
    const rt3 = run(adopt, ['-Root', rootT3, '-Brain', brainT3, '-OwnerName', 'Temp Owner', '-PluginRoot', kit], ptrT3, markers, tmpEnv);
    check('tmp: a law step that throws (a folder at <brain>/LAW.md) stops adopt with its ERROR and still leaves nothing behind in the temp folder', rt3.code === 1 && /^adopt: ERROR .*LAW\.md/m.test(rt3.out) && leftInTmp().length === 0, `exit ${rt3.code}; left: ${leftInTmp().join(', ')} | ${rt3.out.slice(-400)}`);
    // A temp folder that does not exist: adopt checks its temp folder before its first write, and when it cannot
    // use it, writes nothing and exits 2 (could not look) with one line naming the folder and the error; a dry run
    // says the same. It never makes the OS temp folder. Red first: adopt wrote the root and brain files, both
    // vendored copies, the settings files and the pointer, then stopped at the law build's fs.mkdtempSync with
    // exit 1, no brain LAW.md and an installed.json with no files rows.
    const tmpGone = path.join(T, 'tmp-gone');   // never made
    const goneEnv = { TMPDIR: tmpGone, TMP: tmpGone, TEMP: tmpGone };
    const rootG = path.join(T, 'root-tmpgone'); const brainG = path.join(T, 'brain-tmpgone'); const ptrG = path.join(T, 'pointer-tmpgone.json');
    fs.mkdirSync(rootG, { recursive: true });
    const rg = run(adopt, ['-Root', rootG, '-Brain', brainG, '-OwnerName', 'Temp Owner', '-PluginRoot', kit], ptrG, markers, goneEnv);
    const goneLines = (out) => out.split('\n').filter((l) => /^adopt: could not look:/.test(l));
    const wroteG = () => `root: ${fs.readdirSync(rootG).join(',') || '(empty)'}; brain ${exists(brainG) ? 'made' : 'absent'}; pointer ${exists(ptrG) ? 'written' : 'absent'}; temp folder ${exists(tmpGone) ? 'MADE' : 'absent'}`;
    check('tmp: with TMPDIR, TMP and TEMP naming a folder that does not exist, adopt stops before its first write (exit 2, could not look): the root stays empty, no brain, no pointer', rg.code === 2 && fs.readdirSync(rootG).length === 0 && !exists(brainG) && !exists(ptrG), `exit ${rg.code}; ${wroteG()} | ${rg.out.slice(-300)}`);
    check('tmp: one could-not-look line names the temp folder and the error, and the OS temp folder is not made', goneLines(rg.out).length === 1 && goneLines(rg.out)[0].includes(tmpGone) && /ENOENT/.test(goneLines(rg.out)[0]) && !exists(tmpGone), `${wroteG()} | ${rg.out.slice(-400)}`);
    const rgd = run(adopt, ['-Root', rootG, '-Brain', brainG, '-OwnerName', 'Temp Owner', '-PluginRoot', kit, '-DryRun'], ptrG, markers, goneEnv);
    check('tmp: -DryRun reports the same (exit 2, the same could-not-look line) and writes nothing', rgd.code === 2 && goneLines(rgd.out).length === 1 && goneLines(rgd.out)[0] === goneLines(rg.out)[0] && fs.readdirSync(rootG).length === 0 && !exists(brainG) && !exists(ptrG) && !exists(tmpGone), `exit ${rgd.code}; ${wroteG()} | ${rgd.out.slice(-400)}`);

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
    const sc3 = run(settingsTool, ['-Vendored', '-Host', 'pc', '-Set', 'pc', '-Check', '-Out', jp(root3, '.claude', 'settings.local.json')], ptr3, markers);
    check('repo: settings.local.json is the vendored render (settings.mjs -Check exit 0)', sc3.code === 0, sc3.out);
    const dj3 = run(doctor, ['-Json'], ptr3, markers);
    const sb3 = F.readJson(path.join(brain3, 'claims.json')).claims.find((c) => c.id === 'SETTINGS-BLOCK-01');
    check('repo: SETTINGS-BLOCK-01 follows the personal scope (path ${ROOT}/.claude/settings.local.json) and PASSES; KIT-VENDOR-01 PASSES', sb3 && sb3.path === '${ROOT}/.claude/settings.local.json' && claimStatus(dj3, 'SETTINGS-BLOCK-01') === 'PASS' && claimStatus(dj3, 'KIT-VENDOR-01') === 'PASS', `${sb3 && sb3.path}; ${claimStatus(dj3, 'SETTINGS-BLOCK-01')}; ${claimStatus(dj3, 'KIT-VENDOR-01')}`);
    check('repo: KIT-VENDOR-02 (the brain copy) PASSES under the personal scope', claimStatus(dj3, 'KIT-VENDOR-02') === 'PASS', claimStatus(dj3, 'KIT-VENDOR-02'));

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
    check('default: both the root and the brain under it carry a vendored copy', isFile(jp(root5, '.claude', 'kit', 'VERSION')) && isFile(jp(brain5, '.claude', 'kit', 'VERSION')));
    check('default: the brain under the root carries its own .claude/settings.json (a separate folder is a separate clone)', isFile(jp(brain5, '.claude', 'settings.json')), r5.out);
    const dj5 = run(doctor, ['-Json'], ptr5, markers);
    check('default: KIT-VENDOR-02 (the brain copy under the root) PASSES beside KIT-VENDOR-01', claimStatus(dj5, 'KIT-VENDOR-02') === 'PASS' && claimStatus(dj5, 'KIT-VENDOR-01') === 'PASS', `${claimStatus(dj5, 'KIT-VENDOR-02')}; ${claimStatus(dj5, 'KIT-VENDOR-01')}`);

    // ---------------------------------------------------------------- 5b. a repository with its own settings file: the render is merged in
    say('-- a root with its own .claude/settings.json: merged, the repository rows kept');
    const root6 = path.join(T, 'root6'); const brain6 = path.join(T, 'brain6'); const ptr6 = path.join(T, 'pointer6.json');
    put(jp(root6, '.claude', 'settings.json'), '{\n  "permissions": {\n    "allow": [\n      "Bash(npm test)"\n    ]\n  },\n  "model": "opus"\n}\n');
    const r6a = run(adopt, ['-Root', root6, '-Brain', brain6, '-OwnerName', 'Merge Owner', '-PluginRoot', kit], ptr6, markers);
    const settings6 = jp(root6, '.claude', 'settings.json');
    const merged = isFile(settings6) ? F.readJson(settings6) : {};
    check('merge: adopt exits 0 and reports the settings file merged, not kept', r6a.code === 0 && /^\s*merged\s+.*settings\.json/m.test(r6a.out), r6a.out);
    check("merge: the repository's own allow row and model key survive; the hooks block and the pc deny rows are in", merged.model === 'opus' && merged.permissions && merged.permissions.allow && merged.permissions.allow.includes('Bash(npm test)') && merged.permissions.deny && merged.permissions.deny.includes('Read(**/.env)') && JSON.stringify(merged.hooks || {}).includes('.claude/kit/hooks/guard.mjs'), JSON.stringify(merged).slice(0, 400));
    check('merge: the merged file is not recorded in installed.json (it was the repository\'s; remove must not delete it)', !F.readInstalled(jp(brain6, 'state', 'installed.json')).some((x) => x.path === settings6), r6a.out);
    check('merge: the first Doctor run exits 0 (SETTINGS-BLOCK-01 reads the merged block)', /^\s*Doctor exit\s+0\b/m.test(r6a.out), r6a.out);
    // Attach on that root: the merge is a no-op (settings.mjs -Check exits 0 on a file that carries the
    // block beside the repository's own rows), and the file is not the render byte for byte, so it is
    // kept and not recorded (an edited file keeps its earlier record, or none), and remove leaves it.
    const r6b = run(adopt, ['-Root', root6, '-Brain', brain6, '-OwnerName', 'Merge Owner', '-PluginRoot', kit], ptr6, markers);
    const settings6Rx = settings6.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    check("attach: a settings file carrying the repository's own rows beside the block is kept (nothing to merge), not re-recorded", r6b.code === 0 && r6b.out.includes('[attach mode]') && new RegExp(`^\\s*kept\\s+${settings6Rx}\\s`, 'm').test(r6b.out) && !new RegExp(`^\\s*same\\s+${settings6Rx}\\s`, 'm').test(r6b.out) && !F.readInstalled(jp(brain6, 'state', 'installed.json')).some((x) => x.path === settings6), r6b.out);
    const markers6 = path.join(T, 'markers6'); fs.mkdirSync(markers6, { recursive: true });
    const r6r = run(remove, [], ptr6, markers6);
    const merged6 = isFile(settings6) ? F.readJson(settings6) : null;
    check("remove: the repository's own settings file (never recorded) survives with its rows and the block; the brain's recorded files go", r6r.code === 0 && merged6 != null && merged6.model === 'opus' && merged6.permissions.allow.includes('Bash(npm test)') && JSON.stringify(merged6.hooks || {}).includes('.claude/kit/hooks/guard.mjs') && !exists(path.join(brain6, 'me.md')) && !exists(ptr6), r6r.out);

    // ---------------------------------------------------------------- 5b2. a settings file with a hooks key of its own: kept (review finding 3)
    // tools/settings.mjs replaces the whole hooks key of a file it merges into (the kit owns registrations), and the
    // merged file is not recorded, so remove never gives it back. A fresh adopt merges only into a settings file with
    // no hooks key, or one whose hooks key already is the render; one with a hooks key of its own is kept byte for
    // byte, as attach mode keeps a file: the kept line says why, the diff and the exact merge command are printed,
    // the next steps name the command, and the Doctor reads the file as it is (SETTINGS-BLOCK-01 FAIL). Red first:
    // adopt printed 'merged' over a committed settings.json and its PostToolUse hook was gone, and over a gitignored
    // settings.local.json, where git holds no copy, its Stop hook was gone.
    say('-- a settings file with a hooks key of its own: kept byte for byte, the merge command printed (shared and personal)');
    const withHooks = (hooks, keys = {}) => JSON.stringify({ ...keys, hooks }, null, 2) + '\n';
    const ownReason = /it has its own hooks key, and the kit's block replaces the whole key, so the merge is yours/;
    // The words every printed render command carries before the command when the file it writes has a hooks key of its
    // own (M27): one wording function in adopt.mjs serves every such line, so one pattern reads them all.
    const ownWords = /has its own hooks key, and the kit's block replaces the whole key, so the merge is yours: move those hooks to another settings file first/;
    // True when the line carries those words before the command that starts with cmd (node "<script>").
    const wordsBefore = (line, cmd) => { const at = String(line).search(ownWords); return at >= 0 && line.indexOf(cmd) > at; };
    const rootH = path.join(T, 'root-hk'); const brainH = path.join(T, 'brain-hk'); const ptrH = path.join(T, 'pointer-hk.json');
    fs.mkdirSync(rootH, { recursive: true });
    F.git(rootH, ['init', '-q', '-b', 'main']);
    const settingsH = jp(rootH, '.claude', 'settings.json');
    const ownH = withHooks({ PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write .' }] }] }, { permissions: { allow: ['Bash(npm test)'] }, env: { EXAMPLE_FLAG: '1' } });
    put(settingsH, ownH);
    F.git(rootH, ['add', '.claude/settings.json']);
    F.git(rootH, [...GIT_ID, 'commit', '-q', '-m', 'the repository settings']);
    const rH = run(adopt, ['-Root', rootH, '-Brain', brainH, '-OwnerName', 'Hooks Owner', '-SettingsScope', 'shared', '-PluginRoot', kit], ptrH, markers);
    check('own hooks: a fresh adopt keeps a committed .claude/settings.json with permissions, env and its own PostToolUse hook byte for byte (exit 0), never merged', rH.code === 0 && rH.out.includes('[fresh mode]') && isFile(settingsH) && fs.readFileSync(settingsH, 'utf8') === ownH && lineFor(rH.out, 'merged', settingsH) === '', `${isFile(settingsH) ? F.readText(settingsH).slice(0, 300) : 'absent'} | ${rH.out}`);
    const keptH = lineFor(rH.out, 'kept', settingsH);
    const mergeH = `node "${settingsTool}" -Vendored -Host pc -Set pc -Out "${settingsH}"`;
    check("own hooks: the kept line names the file and why (its own hooks key, which the kit's block replaces whole, so the merge is yours), then the exact merge command and the diff", ownReason.test(keptH) && keptH.includes(mergeH) && rH.out.includes(`--- ${settingsH} (on disk)`), keptH || rH.out);
    const outH = rH.out.split('\n');
    const summaryH = outH.indexOf('summary') < 0 ? [] : outH.slice(outH.indexOf('summary') + 1).filter((l) => /^\s*settings\s{2,}/.test(l) || new RegExp(`^\\s+kept: ${rxEscape(settingsH)}$`).test(l));
    check('own hooks: the summary lists the file as kept and says the kit\'s hooks block was not merged into it', summaryH.length === 2 && summaryH.some((l) => /\(shared; set pc not merged in: it has its own hooks key, kept as it was; the merge command is under next\)$/.test(l)) && !summaryH.some((l) => /hooks block from tools\/settings\.mjs/.test(l)), summaryH.join(' | ') || rH.out);
    check('own hooks: the Doctor reads the file as it is (SETTINGS-BLOCK-01 FAIL, the first run RED, exit 1), never softened', /FAIL\s+SETTINGS-BLOCK-01/.test(rH.out) && /^\s*Doctor exit\s+1\b/m.test(rH.out), rH.out);
    // The FAIL's why is what every later Doctor run gives the owner of this file: it says the merge replaces the file's
    // whole hooks key, so hooks of the owner's own move first, and never that adopt wrote the file it kept. Red first
    // (the review of finding 3): it said 'the settings file it wrote' and that the merge keeps your own permission rows,
    // and nothing of the hooks key.
    const whyH = outH.find((l) => /^\s*why: KIT-03:/.test(l)) || '';
    check("own hooks: the FAIL's why says the merge replaces the file's whole hooks key, so your own hooks move to another settings file first, and never that adopt wrote the file", /replaces the file's whole hooks key with the kit's/.test(whyH) && /move any hooks of your own to another settings file first/.test(whyH) && !/the settings file it wrote/.test(whyH), whyH || rH.out);
    const stepsH = nextSteps(rH.out);
    check('own hooks: the next steps start with the merge command, and none says the entry path prints on turn one', stepsH.length >= 2 && /^\s+1\. /.test(stepsH[0]) && stepsH[0].includes(mergeH) && !/the entry path prints on turn one/.test(rH.out), stepsH.join(' | '));
    const ranH = runPrintedNode((/node "[^"]+"[^"]*-Out "[^"]+"/.exec(keptH) || [''])[0], ptrH, markers);
    const afterH = isFile(settingsH) ? F.readJson(settingsH) : {};
    const djH = run(doctor, ['-Json'], ptrH, markers);
    check("own hooks: the printed merge command, run as printed, gives a file whose hooks key is the kit's (its allow row and env kept) and SETTINGS-BLOCK-01 PASSES", ranH.code === 0 && JSON.stringify(afterH.hooks) === JSON.stringify(rootSettings.hooks) && afterH.env && afterH.env.EXAMPLE_FLAG === '1' && afterH.permissions && afterH.permissions.allow.includes('Bash(npm test)') && claimStatus(djH, 'SETTINGS-BLOCK-01') === 'PASS', `exit ${ranH.code}: ${ranH.out.slice(0, 200)}; SETTINGS-BLOCK-01 ${claimStatus(djH, 'SETTINGS-BLOCK-01')}; ${JSON.stringify(afterH).slice(0, 300)}`);
    // Attach mode (an adopter running adopt again) over a settings file whose hooks key is its own again: the file is
    // kept byte for byte, and the kept line's merge command would replace that whole key, so the line says so before the
    // command, in the words every printed render command uses (M27). Red first: the attach kept line gave 'Merge the hooks
    // block in with: <cmd>' alone, and the command, run as printed, replaced the file's own PostToolUse hook.
    put(settingsH, ownH);
    const rHA = run(adopt, ['-Root', rootH, '-Brain', brainH, '-OwnerName', 'Hooks Owner', '-SettingsScope', 'shared', '-PluginRoot', kit], ptrH, markers);
    const keptHA = lineFor(rHA.out, 'kept', settingsH);
    check("own hooks (attach): a second adopt keeps a settings file with its own PostToolUse hook byte for byte, and its kept line says, before the merge command, that the kit's block replaces the whole key, so those hooks move to another settings file first", rHA.code === 0 && rHA.out.includes('[attach mode]') && fs.readFileSync(settingsH, 'utf8') === ownH && keptHA.includes(mergeH) && wordsBefore(keptHA, mergeH), keptHA || rHA.out);
    // The personal scope over a gitignored settings.local.json with its own Stop hook: git holds no copy of it.
    const rootHL = path.join(T, 'root-hl'); const brainHL = path.join(T, 'brain-hl'); const ptrHL = path.join(T, 'pointer-hl.json');
    fs.mkdirSync(rootHL, { recursive: true });
    F.git(rootHL, ['init', '-q', '-b', 'main']);
    put(jp(rootHL, '.gitignore'), '.claude/settings.local.json\n');
    F.git(rootHL, ['add', '.gitignore']);
    F.git(rootHL, [...GIT_ID, 'commit', '-q', '-m', 'the personal settings stay out']);
    const localHL = jp(rootHL, '.claude', 'settings.local.json');
    const ownHL = withHooks({ Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] });
    put(localHL, ownHL);
    const rHL = run(adopt, ['-Root', rootHL, '-Brain', brainHL, '-OwnerName', 'Hooks Owner', '-SettingsScope', 'personal', '-PluginRoot', kit], ptrHL, markers);
    check('own hooks (personal): a gitignored .claude/settings.local.json with its own Stop hook is kept byte for byte by a fresh adopt (exit 0), the kept line saying why', rHL.code === 0 && isFile(localHL) && fs.readFileSync(localHL, 'utf8') === ownHL && ownReason.test(lineFor(rHL.out, 'kept', localHL)), `${isFile(localHL) ? F.readText(localHL).slice(0, 300) : 'absent'} | ${rHL.out}`);
    // A file whose hooks key already is the render (a repository that committed the kit's block before this adopt)
    // is merged: the hooks key stays as it is, the pc rows are added, its own keys are kept. Red first, as a planted
    // fault: with the rule written as 'no hooks key' alone, this file was kept and its pc rows never came.
    const rootHE = path.join(T, 'root-he'); const brainHE = path.join(T, 'brain-he'); const ptrHE = path.join(T, 'pointer-he.json');
    const settingsHE = jp(rootHE, '.claude', 'settings.json');
    put(settingsHE, withHooks(rootSettings.hooks, { model: 'opus' }));
    const rHE = run(adopt, ['-Root', rootHE, '-Brain', brainHE, '-OwnerName', 'Merge Owner', '-PluginRoot', kit], ptrHE, markers);
    const mergedHE = isFile(settingsHE) ? F.readJson(settingsHE) : {};
    check("own hooks: a settings file whose hooks key already is the kit's render is merged: the hooks key unchanged, the pc deny rows added, its own model key kept", rHE.code === 0 && lineFor(rHE.out, 'merged', settingsHE) !== '' && JSON.stringify(mergedHE.hooks) === JSON.stringify(rootSettings.hooks) && mergedHE.model === 'opus' && mergedHE.permissions && Array.isArray(mergedHE.permissions.deny) && mergedHE.permissions.deny.includes('Read(**/.env)'), `${JSON.stringify(mergedHE).slice(0, 300)} | ${rHE.out}`);
    // Attach mode over a settings file with no hooks key: the merge keeps every key of the file, so the kept line stays
    // as it was, the merge command with no word of a hooks key (M27 adds the words only where a hooks key of its own is).
    const plainHE = '{\n  "model": "opus"\n}\n';
    put(settingsHE, plainHE);
    const rHEA = run(adopt, ['-Root', rootHE, '-Brain', brainHE, '-OwnerName', 'Merge Owner', '-PluginRoot', kit], ptrHE, markers);
    const keptHEA = lineFor(rHEA.out, 'kept', settingsHE);
    check('own hooks (attach): over a settings file with no hooks key, a second adopt keeps it byte for byte and its kept line gives the merge command with no word of a hooks key', rHEA.code === 0 && rHEA.out.includes('[attach mode]') && fs.readFileSync(settingsHE, 'utf8') === plainHE && keptHEA.includes(`node "${settingsTool}" -Vendored -Host pc -Set pc -Out "${settingsHE}"`) && !/hooks key/.test(keptHEA), keptHEA || rHEA.out);

    // ---------------------------------------------------------------- 5b3. the personal scope in a git root: the commit step (review finding 5)
    // Under -SettingsScope personal the settings file is .claude/settings.local.json, which question 7 keeps
    // personal. The root's commit step names .claude/kit alone, and the line under it says the settings stay
    // personal and uncommitted, so a clone of the root registers no hook of the kit until a shared
    // .claude/settings.json carries the block, with the command that renders it. Red first: the step was
    // 'git -C <root> add .claude/kit .claude/settings.local.json', which exits 1 where .gitignore lists that file
    // (the kit already staged) and stages the personal file where it does not.
    say('-- the personal scope in a git root: the commit step names the kit alone, the settings stay personal');
    const rootPL = path.join(T, 'root-pl'); const brainPL = path.join(T, 'brain-pl'); const ptrPL = path.join(T, 'pointer-pl.json');
    fs.mkdirSync(rootPL, { recursive: true });
    F.git(rootPL, ['init', '-q', '-b', 'main']);
    put(jp(rootPL, '.gitignore'), '.claude/settings.local.json\n');
    F.git(rootPL, ['add', '.gitignore']);
    F.git(rootPL, [...GIT_ID, 'commit', '-q', '-m', 'the personal settings stay out']);
    const rPL = run(adopt, ['-Root', rootPL, '-Brain', brainPL, '-OwnerName', 'Personal Owner', '-SettingsScope', 'personal', '-PluginRoot', kit], ptrPL, markers);
    const outPL = rPL.out.split('\n');
    const atPL = outPL.findIndex((l) => /^\s+\d+\. Commit the vendored kit/.test(l));
    const stepPL = atPL < 0 ? '' : ((/: (git -C .*)$/.exec(outPL[atPL]) || [])[1] || '');
    check('personal: the root commit step names .claude/kit alone, never the personal .claude/settings.local.json', rPL.code === 0 && stepPL === `git -C "${rootPL}" add .claude/kit`, atPL < 0 ? rPL.out : outPL[atPL]);
    const ranPL = runPrinted(stepPL);
    const stagedPL = F.git(rootPL, ['diff', '--cached', '--name-only']).out;
    check('personal: that step, run as printed where .gitignore lists .claude/settings.local.json, exits 0 and stages the vendored kit and no settings.local.json', ranPL.code === 0 && stagedPL.includes('.claude/kit/VERSION') && !stagedPL.some((f) => /settings\.local\.json$/.test(f)), `${ranPL.out} | staged ${stagedPL.length}: ${stagedPL.filter((f) => !f.startsWith('.claude/kit/')).join(', ')}`);
    const notePL = atPL < 0 ? '' : (outPL[atPL + 1] || '');
    const sharedPL = jp(rootPL, '.claude', 'settings.json');
    const renderPL = `node "${settingsTool}" -Vendored -Host pc -Set pc -Out "${sharedPL}"`;
    check('personal: the line under it says the settings stay personal and uncommitted, so a clone of the root registers no hook of the kit until a shared .claude/settings.json carries the block, and gives the command that renders it', /stay personal and uncommitted/.test(notePL) && /a clone of the root registers no hook of the kit until a shared \.claude\/settings\.json carries the block/.test(notePL) && notePL.includes(renderPL), notePL || rPL.out);
    const ranRenderPL = runPrintedNode((/node "[^"]+"[^"]*-Out "[^"]+"/.exec(notePL) || [''])[0], ptrPL, markers);
    const sharedDoc = isFile(sharedPL) ? F.readJson(sharedPL) : {};
    check('personal: the command that line prints, run as printed, renders a shared .claude/settings.json whose hooks block runs the vendored kit', ranRenderPL.code === 0 && JSON.stringify(sharedDoc.hooks || {}).includes('${CLAUDE_PROJECT_DIR}/.claude/kit/hooks/guard.mjs'), `exit ${ranRenderPL.code}: ${ranRenderPL.out.slice(0, 300)}`);
    check('personal: with no shared settings file there, the line under the commit step gives the command alone, with no word of a hooks key', notePL !== '' && !/hooks key/.test(notePL), notePL || rPL.out);
    // A shared .claude/settings.json that is there with a hooks key of its own (a file the repository committed): adopt
    // under the personal scope never touches it, and the line under the commit step says, before the command it gives,
    // that the kit's block replaces that whole key, so the merge is the owner's, as the kept line of a fresh adopt says.
    // Red first (the review of finding 5): the line gave the command alone, and run as printed it replaced the file's
    // hooks key, its PostToolUse hook gone.
    const rootPS = path.join(T, 'root-ps'); const brainPS = path.join(T, 'brain-ps'); const ptrPS = path.join(T, 'pointer-ps.json');
    fs.mkdirSync(rootPS, { recursive: true });
    F.git(rootPS, ['init', '-q', '-b', 'main']);
    put(jp(rootPS, '.gitignore'), '.claude/settings.local.json\n');
    const sharedPS = jp(rootPS, '.claude', 'settings.json');
    const ownPS = withHooks({ PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write .' }] }] }, { permissions: { allow: ['Bash(npm test)'] } });
    put(sharedPS, ownPS);
    F.git(rootPS, ['add', '.gitignore', '.claude/settings.json']);
    F.git(rootPS, [...GIT_ID, 'commit', '-q', '-m', 'the shared settings in, the personal ones out']);
    const rPS = run(adopt, ['-Root', rootPS, '-Brain', brainPS, '-OwnerName', 'Personal Owner', '-SettingsScope', 'personal', '-PluginRoot', kit], ptrPS, markers);
    const outPS = rPS.out.split('\n');
    const atPS = outPS.findIndex((l) => /^\s+\d+\. Commit the vendored kit/.test(l));
    const notePS = atPS < 0 ? '' : (outPS[atPS + 1] || '');
    const reasonPS = notePS.search(/has its own hooks key, and the kit's block replaces the whole key, so the merge is yours/);
    check("personal: where the shared .claude/settings.json has its own hooks key, adopt leaves it byte for byte and the line under the commit step says, before the command, that the kit's block replaces that whole key, so the merge is yours", rPS.code === 0 && isFile(sharedPS) && fs.readFileSync(sharedPS, 'utf8') === ownPS && reasonPS > 0 && reasonPS < notePS.indexOf('node "') && notePS.includes(`node "${settingsTool}" -Vendored -Host pc -Set pc -Out "${sharedPS}"`), notePS || rPS.out);
    // One wording function (M27): the fresh kept line and the next step that names the kept file (rH, above) and the
    // personal note (rPS) give, before their commands, the very words the attach kept line, the off line and the
    // vendor-failure step give, so no line words the replaced hooks key its own way. Red first: the fresh kept line ended
    // 'so the merge is yours: not touched' and the next step read 'once your own hooks are moved to another settings file'.
    check("own hooks: the fresh kept line, the next step that names the kept file and the personal note give, before their commands, the words every printed render command gives (one wording function, M27)", wordsBefore(keptH, mergeH) && wordsBefore(stepsH[0] || '', mergeH) && wordsBefore(notePS, `node "${settingsTool}"`), [keptH, stepsH[0] || '(no step)', notePS].join(' | '));

    // ---------------------------------------------------------------- 5c. the planted fault: vendoring off
    // The design's red case (FIRST-CHUNK row 35): with the claims shipped and nothing vendored, the first
    // Doctor run after a fresh adopt is not green (SETTINGS-BLOCK-01 finds no hooks block: RED; KIT-VENDOR-01
    // and KIT-VENDOR-02 have no VERSION to read: COULD-NOT-LOOK, which wins), never a quiet 0. The switch is
    // kept so the fault can be planted on purpose.
    say('-- planted fault: a fresh adopt with vendoring off (-Vendor false) is not green on the first Doctor run');
    const rootN = path.join(T, 'root-nv'); const brainN = path.join(T, 'brain-nv'); const ptrN = path.join(T, 'pointer-nv.json');
    fs.mkdirSync(rootN, { recursive: true });
    const rn = run(adopt, ['-Root', rootN, '-Brain', brainN, '-OwnerName', 'No Vendor', '-BrainIsRepo', '-PluginRoot', kit, '-Vendor', 'false'], ptrN, markers);
    check('red: adopt accepts -Vendor false, exits 0, says vendoring is off, writes no .claude/kit', rn.code === 0 && /vendor\s+off/i.test(rn.out) && !exists(jp(rootN, '.claude', 'kit')) && !exists(jp(brainN, '.claude', 'kit')) && !exists(jp(brainN, '.claude', 'settings.json')) && isFile(jp(rootN, '.claude', 'settings.json')), rn.out);
    const claimsN = isFile(path.join(brainN, 'claims.json')) ? F.readJson(path.join(brainN, 'claims.json')).claims : [];
    check('red: KIT-VENDOR-01 and SETTINGS-BLOCK-01 ship in the brain claims.json even when vendoring is off', claimsN.some((c) => c.id === 'KIT-VENDOR-01' && c.type === 'tree_sha' && c.path === '${ROOT}/.claude/kit/VERSION') && claimsN.some((c) => c.id === 'SETTINGS-BLOCK-01' && c.type === 'json_subset_equal'), claimsN.map((c) => c.id).join(','));
    const djN = run(doctor, ['-Json'], ptrN, markers);
    const kvN = claimStatus(djN, 'KIT-VENDOR-01');
    check('red: KIT-VENDOR-01 is UNKNOWN or FAIL, never PASS, and the first Doctor run is not 0', (kvN === 'UNKNOWN' || kvN === 'FAIL') && djN.code !== 0 && /^\s*Doctor exit\s+[12]\b/m.test(rn.out), `status ${kvN}, exit ${djN.code}`);
    const sbN = claimStatus(djN, 'SETTINGS-BLOCK-01');
    check('red: SETTINGS-BLOCK-01 is FAIL (a settings file written without vendoring carries no hooks block)', sbN === 'FAIL', sbN);
    const kv2N = claimStatus(djN, 'KIT-VENDOR-02');
    check('red: KIT-VENDOR-02 (the brain copy) is UNKNOWN or FAIL too with vendoring off, never PASS', kv2N === 'UNKNOWN' || kv2N === 'FAIL', kv2N);
    // The off line names each claim with the band the same run's Doctor gives it until the commands are run: a FAIL
    // line is RED, a ???? line is COULD-NOT-LOOK. Red first (review finding 8): the line said the three 'are RED'
    // while the Doctor printed SETTINGS-BLOCK-01 FAIL, KIT-VENDOR-01 and KIT-VENDOR-02 ???? and COULD-NOT-LOOK, exit 2.
    const bandOf = (out, id) => (new RegExp(`^\\s*FAIL\\s+${id}\\s`, 'm').test(out) ? 'RED' : new RegExp(`^\\s*\\?\\?\\?\\?\\s+${id}\\s`, 'm').test(out) ? 'COULD-NOT-LOOK' : 'neither');
    const offLineN = rn.out.split('\n').find((l) => /^\s*off\s+-Vendor false:/.test(l)) || '';
    const bandsN = Object.fromEntries(['SETTINGS-BLOCK-01', 'KIT-VENDOR-01', 'KIT-VENDOR-02'].map((id) => [id, bandOf(rn.out, id)]));
    check("vendor off: the off line names each claim's band as the same run's Doctor prints it (SETTINGS-BLOCK-01 RED; KIT-VENDOR-01 and KIT-VENDOR-02 COULD-NOT-LOOK), never 'are RED' for all three", bandsN['SETTINGS-BLOCK-01'] === 'RED' && bandsN['KIT-VENDOR-01'] === 'COULD-NOT-LOOK' && bandsN['KIT-VENDOR-02'] === 'COULD-NOT-LOOK' && /^\s*Doctor exit\s+2\s+COULD-NOT-LOOK/m.test(rn.out) && offLineN.includes('SETTINGS-BLOCK-01 RED') && offLineN.includes('KIT-VENDOR-01 and KIT-VENDOR-02 COULD-NOT-LOOK') && !/\bare RED\b/.test(offLineN), `${JSON.stringify(bandsN)} | ${offLineN}`);
    // The off line names the vendor command for each copy a shipped claim reads: the root's (KIT-VENDOR-01) and, for a
    // brain that is a folder of its own, the brain's (KIT-VENDOR-02), so the command it gives clears both. Red first: it
    // named KIT-VENDOR-02 and gave the root's command alone, which leaves the brain's claim RED.
    // The off block: the off line and the command lines under it, the claims the line names and every full command
    // the block prints (node "<script>" and its words, up to a comma, a semicolon or the line's end).
    const offBlock = (out) => {
        const ls = out.split(/\r?\n/);
        const at = ls.findIndex((l) => /^\s*off\s+-Vendor false:/.test(l));
        if (at < 0) return { text: '', claims: [], commands: [] };
        const block = [ls[at]];
        for (let i = at + 1; i < ls.length && /^\s+node\s/.test(ls[i]); i++) block.push(ls[i]);
        const text = block.join('\n');
        return { text, claims: [...new Set(ls[at].match(/\b(?:KIT-VENDOR|SETTINGS-BLOCK)-\d+\b/g) || [])], commands: text.match(/node "[^"]+"(?: (?:-[A-Za-z]+|"[^"]*"|[A-Za-z0-9_.:\\/-]+))*/g) || [] };
    };
    const offN = offBlock(rn.out);
    check("vendor: the -Vendor false line gives the vendor command for the root's copy and the separate brain's copy", offN.text.includes(`-Target "${rootN}"`) && offN.text.includes(`-Target "${brainN}"`), offN.text || rn.out);
    // Every line under the off line up to the blank line after it: the command lines, with any words a line carries
    // before its command (M27).
    const offCommandLines = (out) => {
        const ls = out.split(/\r?\n/);
        const at = ls.findIndex((l) => /^\s*off\s+-Vendor false:/.test(l));
        const lines = [];
        for (let i = at + 1; at >= 0 && i < ls.length && ls[i].trim() !== ''; i++) lines.push(ls[i]);
        return lines;
    };
    const offLinesN = offCommandLines(rn.out);
    check('vendor off: over a root settings file with no hooks key and a brain with none, the two render commands the off line prints carry no word of a hooks key', offLinesN.filter((l) => l.includes(`node "${settingsTool}"`)).length === 2 && !offLinesN.some((l) => /hooks key/.test(l)), offLinesN.join(' | ') || rn.out);
    const rn2 = run(adopt, ['-Root', rootN, '-Brain', brainN, '-OwnerName', 'No Vendor', '-BrainIsRepo', '-PluginRoot', kit, '--no-vendor', '-DryRun'], ptrN, markers);
    check('red: --no-vendor is the same switch (dry run, exit 0, vendor off)', rn2.code === 0 && /vendor\s+off/i.test(rn2.out) && !/would write\s+.*\.claude[\\/]kit/.test(rn2.out), rn2.out);
    const rn3 = run(adopt, ['-Root', rootN, '-Brain', brainN, '-OwnerName', 'No Vendor', '-PluginRoot', kit, '-Settings', 'cloud-writer', '-Vendor', 'false', '-DryRun'], ptrN, markers);
    check('red: a -Settings set other than pc without vendoring is refused (exit 1): the set is rendered with the hooks block', rn3.code === 1 && /adopt: ERROR/.test(rn3.out), rn3.out);
    const rn4 = run(adopt, ['-Root', rootN, '-Brain', brainN, '-OwnerName', 'No Vendor', '-PluginRoot', kit, '-Vendor', 'off', '-DryRun'], ptrN, markers);
    check('vendor: -Vendor off is read as off, never as a stray word that leaves vendoring on', rn4.code === 0 && /vendor\s+off/i.test(rn4.out) && !/would write\s+.*\.claude[\\/]kit/.test(rn4.out), rn4.out);
    const rn5 = run(adopt, ['-Root', rootN, '-Brain', brainN, '-OwnerName', 'No Vendor', 'Stray', '-PluginRoot', kit, '-DryRun'], ptrN, markers);
    check('adopt: a word that belongs to no flag is refused (exit 1), never dropped in silence', rn5.code === 1 && /adopt: ERROR unexpected argument Stray/.test(rn5.out), rn5.out);
    // The off line names every command that turns its claims green, in the order they run: the vendor command for
    // each copy a claim reads, then the hooks-block render into the settings file SETTINGS-BLOCK-01 reads. Run
    // exactly as printed (on this suite's node), they turn each claim the line names PASS wherever a vendored adopt
    // of the same layout shows it PASS: a separate brain (case 1) and a brain under the root (case 5). Red first:
    // the line named the vendor command alone (the brain's as 'again with -Target'), and following it by hand left
    // SETTINGS-BLOCK-01 RED ($.hooks is missing).
    const followOff = (block, ptr, vendoredRun) => {
        const ran = block.commands.map((c) => {
            const words = [...c.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] != null ? m[1] : m[2]));
            return `exit ${words[0] === 'node' ? run(words[1], words.slice(2), ptr, markers).code : 'not a node command'}: ${c}`;
        });
        const after = run(doctor, ['-Json'], ptr, markers);
        const vendored = Object.fromEntries(block.claims.map((id) => [id, claimStatus(vendoredRun, id)]));
        const followed = Object.fromEntries(block.claims.map((id) => [id, claimStatus(after, id)]));
        const ok = block.claims.length === 3 && block.claims.some((id) => vendored[id] === 'PASS') && block.claims.every((id) => vendored[id] !== 'PASS' || followed[id] === 'PASS');
        return { ok, detail: `ran: ${ran.join(' | ') || '(no command printed)'}; vendored adopt: ${JSON.stringify(vendored)}; after the commands: ${JSON.stringify(followed)}` };
    };
    const offSep = followOff(offN, ptrN, dj);
    check('vendor off: the commands the off line prints, run as printed, turn each claim it names PASS where a vendored adopt with a separate brain shows it PASS', offSep.ok, offSep.detail);
    // A separate brain is a clone of its own: a vendored adopt renders its .claude/settings.json beside its copy, so a
    // cloud session on the brain clone loads the hooks; the off line's commands render it too. Red first: they rendered
    // the root's settings file alone, and the brain clone loaded no hooks after them.
    const brainNSettings = jp(brainN, '.claude', 'settings.json');
    const scN = isFile(brainNSettings) ? run(settingsTool, ['-Vendored', '-Set', 'pc', '-Out', brainNSettings, '-Check'], ptrN, markers) : { code: -1, out: `no file at ${brainNSettings}` };
    check("vendor off: the commands the off line prints also render the separate brain's own .claude/settings.json, as a vendored adopt writes it", scN.code === 0, `${String(scN.out).trim()}; ${offSep.detail}`);
    const rootNU = path.join(T, 'root-nvu'); const brainNU = path.join(rootNU, 'brain'); const ptrNU = path.join(T, 'pointer-nvu.json');
    fs.mkdirSync(rootNU, { recursive: true });
    const rnu = run(adopt, ['-Root', rootNU, '-Brain', brainNU, '-OwnerName', 'No Vendor', '-BrainIsRepo', '-PluginRoot', kit, '-Vendor', 'false'], ptrNU, markers);
    const offUnder = followOff(offBlock(rnu.out), ptrNU, dj5);
    check('vendor off: with the brain under the root, the commands the off line prints turn each claim it names PASS where the vendored adopt of that layout shows it PASS', rnu.code === 0 && offUnder.ok, `adopt exit ${rnu.code}; ${offUnder.detail}`);
    // The off line over settings files with hooks keys of their own, the root's and a separate brain's (M27): each render
    // command it prints replaces the whole hooks key of the file it writes, so its line says so before the command, and
    // adopt leaves both files byte for byte. Red first: the off line gave the two render commands alone, and run as
    // printed they replaced the root's PostToolUse hook and the brain's Stop hook.
    const rootNH = path.join(T, 'root-nvh'); const brainNH = path.join(T, 'brain-nvh'); const ptrNH = path.join(T, 'pointer-nvh.json');
    const settingsNH = jp(rootNH, '.claude', 'settings.json'); const brainSettingsNH = jp(brainNH, '.claude', 'settings.json');
    const ownNH = withHooks({ PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write .' }] }] }, { permissions: { allow: ['Bash(npm test)'] } });
    const ownBrainNH = withHooks({ Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] });
    put(settingsNH, ownNH); put(brainSettingsNH, ownBrainNH);
    const rnh = run(adopt, ['-Root', rootNH, '-Brain', brainNH, '-OwnerName', 'No Vendor', '-PluginRoot', kit, '-Vendor', 'false'], ptrNH, markers);
    const offLinesNH = offCommandLines(rnh.out);
    const renderNH = (target, args) => offLinesNH.find((l) => l.includes(`node "${settingsTool}" ${args} -Out "${target}"`)) || '';
    const lineNH = renderNH(settingsNH, '-Vendored -Host pc -Set pc'); const brainLineNH = renderNH(brainSettingsNH, '-Vendored -Set pc');
    check("vendor off (own hooks): over a root and a separate brain whose settings files have hooks keys of their own, adopt leaves both byte for byte and each render command the off line prints says, before the command, that the kit's block replaces the whole key", rnh.code === 0 && rnh.out.includes('[fresh mode]') && fs.readFileSync(settingsNH, 'utf8') === ownNH && fs.readFileSync(brainSettingsNH, 'utf8') === ownBrainNH && wordsBefore(lineNH, `node "${settingsTool}"`) && wordsBefore(brainLineNH, `node "${settingsTool}"`), `root: ${lineNH || '(no line)'} | brain: ${brainLineNH || '(no line)'} | ${offLinesNH.join(' | ') || rnh.out}`);

    // ---------------------------------------------------------------- 5d. the planted fault: the vendor step refuses (review finding 8)
    // A kit copy whose manifest names an include entry that does not exist: tools/vendor.mjs refuses for
    // both targets before it writes anything. adopt must not render the vendored hooks block into a
    // settings file whose .claude/kit/ is not there (every command would name a script that does not
    // exist): each target's settings file is the pc permission set alone, as -Vendor false writes it,
    // one line per target says why, and adopt exits 1 (adopt itself did not finish) with the Doctor's
    // own code kept in the summary. Red first: adopt exited 0 with the hooks block in both files.
    say('-- planted fault: the vendor step refuses (a manifest include entry that does not exist)');
    const shortKit = path.join(T, 'kit-short');
    fs.cpSync(kit, shortKit, { recursive: true, filter: (src) => !['.git', '.claude', 'state', 'node_modules'].includes(path.relative(kit, src).split(path.sep)[0]) });
    const shortManifest = jp(shortKit, 'tools', 'vendor.json');
    const sm = F.readJson(shortManifest);
    sm.include = [...sm.include, 'tools/no-such-tool.mjs'];
    put(shortManifest, JSON.stringify(sm, null, 2) + '\n');
    const rootV = path.join(T, 'root-vf'); const brainV = path.join(T, 'brain-vf'); const ptrV = path.join(T, 'pointer-vf.json');
    fs.mkdirSync(rootV, { recursive: true });
    const rv = run(adopt, ['-Root', rootV, '-Brain', brainV, '-OwnerName', 'Vendor Fault', '-PluginRoot', shortKit], ptrV, markers);
    check('red: a vendor step that refuses makes adopt exit 1 (adopt did not finish), never 0', rv.code === 1, rv.out);
    check("vendor fault: the ERROR line is the vendor tool's refusal, naming the missing entry", /ERROR\s+tools\/vendor\.mjs exited 1 for .*root-vf: vendor: refused: manifest entry not found: tools\/no-such-tool\.mjs/.test(rv.out), rv.out);
    const pcTemplateSha = F.normalisedSha256(fs.readFileSync(jp(kit, 'templates', 'root-settings.json')));
    const settingsV = jp(rootV, '.claude', 'settings.json'); const brainSettingsV = jp(brainV, '.claude', 'settings.json');
    check('vendor fault: the root settings file is the pc permission set alone, with no hooks block', isFile(settingsV) && F.fileSha256(settingsV) === pcTemplateSha && !('hooks' in F.readJson(settingsV)), isFile(settingsV) ? F.readText(settingsV).slice(0, 300) : 'absent');
    check('vendor fault: the brain settings file (a separate folder) is the pc permission set alone, with no hooks block', isFile(brainSettingsV) && F.fileSha256(brainSettingsV) === pcTemplateSha, isFile(brainSettingsV) ? F.readText(brainSettingsV).slice(0, 300) : 'absent');
    const noHooksLines = rv.out.split('\n').filter((l) => /the hooks block is not written: the vendored copy in .* is not complete/.test(l));
    check('vendor fault: one line per target says the hooks block was not written because the vendored copy is not complete', noHooksLines.length === 2 && noHooksLines.some((l) => l.includes(settingsV)) && noHooksLines.some((l) => l.includes(brainSettingsV)), rv.out);
    check("vendor fault: the summary keeps the Doctor's own exit code", /^\s*Doctor exit\s+\d+\s/m.test(rv.out), rv.out);
    check('vendor fault: no .claude/kit was written in either target', !exists(jp(rootV, '.claude', 'kit')) && !exists(jp(brainV, '.claude', 'kit')), rv.out);
    // The next steps after a vendor step that did not finish start with its fix-up, and none promises that the
    // entry path prints: until the fix-up is done no hook of the kit is registered in that target's file.
    // Red first: step 1 read 'Start a new Claude Code session ...; the entry path prints on turn one.'
    const stepsV = nextSteps(rv.out);
    check('vendor fault: the next steps start with the fix-up commands, one per target, and never say the entry path prints on turn one', stepsV.length >= 3 && /^\s+1\. Fix the vendor ERROR above for .*root-vf/.test(stepsV[0]) && /^\s+2\. Fix the vendor ERROR above for .*brain-vf/.test(stepsV[1]) && !/the entry path prints on turn one/.test(rv.out), stepsV.join(' | '));
    const shortSettingsTool = `node "${jp(shortKit, 'tools', 'settings.mjs')}"`;
    check('vendor fault: over settings files with no hooks key (the pc set alone, written above), the two fix-up steps give their render commands with no word of a hooks key', stepsV.length >= 2 && stepsV.slice(0, 2).every((l) => l.includes(shortSettingsTool) && !/hooks key/.test(l)), stepsV.join(' | '));
    // The fix-up step over a root settings file with a hooks key of its own (M27): the pc set alone is not written over
    // it (adopt never overwrites), and the step's render command would replace that whole key, so the step says so
    // before the command. Red first: the step gave the render command alone.
    const rootVH = path.join(T, 'root-vfh'); const brainVH = path.join(T, 'brain-vfh'); const ptrVH = path.join(T, 'pointer-vfh.json');
    const settingsVH = jp(rootVH, '.claude', 'settings.json');
    const ownVH = withHooks({ PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write .' }] }] }, { permissions: { allow: ['Bash(npm test)'] } });
    put(settingsVH, ownVH);
    const rvh = run(adopt, ['-Root', rootVH, '-Brain', brainVH, '-OwnerName', 'Vendor Fault', '-PluginRoot', shortKit], ptrVH, markers);
    const stepVH = nextSteps(rvh.out).find((l) => l.includes(`-Out "${settingsVH}"`)) || '';
    check("vendor fault (own hooks): over a root settings file with its own PostToolUse hook, adopt keeps the file byte for byte and the fix-up step says, before its render command, that the kit's block replaces the whole key", rvh.code === 1 && fs.readFileSync(settingsVH, 'utf8') === ownVH && wordsBefore(stepVH, shortSettingsTool), stepVH || rvh.out);

    // The vendor tool's own words reach the ERROR line (review finding 9): with <brain>/state a file, the
    // record cannot be written after the copy, so vendor.mjs exits 2 saying the copy and VERSION were
    // written and the record was not; adopt says that, never 'the copy is not complete' over a copy that
    // is on disk. Red first: the line read '...; the copy is not complete:'.
    const rootR = path.join(T, 'root-vr'); const brainR = path.join(T, 'brain-vr'); const ptrR = path.join(T, 'pointer-vr.json');
    fs.mkdirSync(rootR, { recursive: true });
    put(jp(brainR, 'state'), 'a file where the state folder would be\n');
    const rr = run(adopt, ['-Root', rootR, '-Brain', brainR, '-OwnerName', 'Record Fault', '-PluginRoot', kit], ptrR, markers);
    const recordErr = rr.out.split('\n').filter((l) => /ERROR\s+tools\/vendor\.mjs exited/.test(l));
    check("vendor record fault: adopt's ERROR line is the vendor tool's own (the copy and VERSION were written; the record was not), never 'the copy is not complete'", rr.code === 1 && recordErr.length > 0 && recordErr.every((l) => l.includes('the copy and VERSION were written; the record was not') && !l.includes('the copy is not complete')) && isFile(jp(rootR, '.claude', 'kit', 'VERSION')), rr.out);

    // ---------------------------------------------------------------- 5e. the planted fault under a cloud set
    // The same refusing kit under -Settings cloud-writer. The pc template carries ask rows and a cloud set has
    // none on purpose (an ask with nobody to click is a hang). Writing the pc set into a cloud target, which the
    // printed fix-up then merges into (tools/settings.mjs unions the ask rows), left the cloud file with an ask
    // key. Under a set other than pc no settings file is written for that target (one that is there is left as
    // it is), one line per target says so, adopt exits 1 as before, and the next steps start with the fix-up.
    // Red first: both targets got the pc set, 40 ask rows included, and the fix-up kept them.
    say('-- planted fault: the vendor step refuses under -Settings cloud-writer');
    const rootW = path.join(T, 'root-vw'); const brainW = path.join(T, 'brain-vw'); const ptrW = path.join(T, 'pointer-vw.json');
    const settingsW = jp(rootW, '.claude', 'settings.json'); const brainSettingsW = jp(brainW, '.claude', 'settings.json');
    const ownSettingsW = '{\n  "model": "opus"\n}\n';
    put(settingsW, ownSettingsW);   // the root's own settings file, there before adopt: left as it is
    const rw = run(adopt, ['-Root', rootW, '-Brain', brainW, '-OwnerName', 'Cloud Fault', '-PluginRoot', shortKit, '-Settings', 'cloud-writer'], ptrW, markers);
    check('red: a vendor step that refuses under -Settings cloud-writer makes adopt exit 1, never 0', rw.code === 1 && /^adopt: ERROR the vendor step did not finish/m.test(rw.out), rw.out);
    check('vendor fault (cloud-writer): no settings file is written where there was none (the brain), never the pc set with its ask rows', !exists(brainSettingsW), isFile(brainSettingsW) ? F.readText(brainSettingsW).slice(0, 300) : 'absent');
    check("vendor fault (cloud-writer): the root's own settings file is left byte for byte as it was", isFile(settingsW) && fs.readFileSync(settingsW, 'utf8') === ownSettingsW, isFile(settingsW) ? F.readText(settingsW).slice(0, 300) : 'absent');
    const noSettingsW = rw.out.split('\n').filter((l) => /^\s*no settings\s/.test(l) && l.includes('the cloud-writer set needs the vendored hooks; nothing written'));
    check('vendor fault (cloud-writer): one line per target says no settings, the set needs the vendored hooks, nothing written', noSettingsW.length === 2 && noSettingsW.some((l) => l.includes(settingsW)) && noSettingsW.some((l) => l.includes(brainSettingsW)), rw.out);
    const sumAt = rw.out.split('\n').indexOf('summary');
    const sumW = sumAt < 0 ? [] : rw.out.split('\n').slice(sumAt + 1).filter((l) => /^\s*(settings|brain settings)\s{2,}/.test(l));
    check('vendor fault (cloud-writer): the summary names no settings file written for either target, never the pc set', sumW.length === 2 && sumW.every((l) => /no settings written: the cloud-writer set needs the vendored hooks/.test(l) && !/pc permission set/.test(l)), sumW.join(' | '));
    const stepsW = nextSteps(rw.out);
    check('vendor fault (cloud-writer): the next steps start with the fix-up commands and never say the entry path prints on turn one', stepsW.length >= 3 && /^\s+1\. Fix the vendor ERROR above for .*root-vw.*-Set cloud-writer -Out /.test(stepsW[0]) && /^\s+2\. Fix the vendor ERROR above for .*brain-vw.*-Set cloud-writer -Out /.test(stepsW[1]) && !/the entry path prints on turn one/.test(rw.out), stepsW.join(' | '));
    // The printed settings fix-up for the brain, run as printed once the kit is whole: a cloud-writer file with
    // no ask key (the render of a missing file), never a merge into the pc set's ask rows.
    const fixW = run(settingsTool, ['-Vendored', '-Set', 'cloud-writer', '-Out', brainSettingsW], ptrW, markers);
    const fixedW = isFile(brainSettingsW) ? F.readJson(brainSettingsW) : {};
    check('vendor fault (cloud-writer): the printed fix-up then renders the brain file with no ask key', fixW.code === 0 && fixedW.permissions && !('ask' in fixedW.permissions) && fixedW.hooks != null, JSON.stringify(fixedW.permissions || {}).slice(0, 300));

    // ---------------------------------------------------------------- 5f. a git clone of the adopted brain (review finding 4)
    // A cloud session holds a clone of the brain: what the brain's commit carries, nothing else of the PC. The brain's
    // .gitignore keeps state/ out except state/law-installed.json, the law build's installed input (hook names and two
    // flags, no path), so in the clone BRAIN-LAW-01 builds the LAW.md adopt wrote. RESTORE-01 keeps its honest FAIL
    // there: its grace period is the write time of state/installed.json, which a clone does not carry, so it FAILs
    // until a dated drill line is logged in records/restore-drill.log and committed. The command is the one the
    // documents give, run from the clone, with no pointer (DF_POINTER_PATH at a missing file) and the log and marker
    // seams in this run's folder. Red first: the .gitignore was 'state/', the clone had no state/, and the run printed
    // '????  BRAIN-LAW-01  installed missing' and COULD-NOT-LOOK (exit 2), before and after a committed drill.
    say('-- a git clone of the adopted brain: the cloud brain Doctor gives an honest verdict');
    const rootK = path.join(T, 'root-cl'); const brainK = path.join(T, 'brain-cl'); const ptrK = path.join(T, 'pointer-cl.json');
    fs.mkdirSync(rootK, { recursive: true });
    const rK = run(adopt, ['-Root', rootK, '-Brain', brainK, '-OwnerName', 'Clone Owner', '-BrainIsRepo', '-PluginRoot', kit], ptrK, markers);
    const brainStepK = (rK.out.split('\n').map((l) => /^\s+\d+\. Commit the brain: (.+)$/.exec(l)).find((m) => m) || [])[1] || '';
    const commitK = runPrinted(brainStepK);
    const stateTracked = F.git(brainK, ['ls-files', 'state']).out;
    check('clone: the printed brain commit step, run as printed, commits the brain (exit 0) with state/law-installed.json and no other file of state/', rK.code === 0 && commitK.code === 0 && stateTracked.length === 1 && stateTracked[0] === 'state/law-installed.json', `adopt exit ${rK.code}; step: ${brainStepK || '(none printed)'}; ${commitK.out}; state/ tracked: ${stateTracked.join(', ') || '(none)'}`);
    const cloneDoctor = (clone) => {
        const r = spawnSync(process.execPath, ['.claude/kit/tools/doctor/doctor.mjs', '-Scope', 'brain', '-Host', 'cloud', '-Root', clone], { cwd: clone, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, DF_POINTER_PATH: path.join(T, 'pointer-cl-missing.json'), DF_LOG_PATH: path.join(T, 'clone-hooks.log'), DF_MARKER_DIR: path.join(T, 'markers-cl'), NO_COLOR: '1' } });
        return { out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n'), code: r.status == null ? -1 : r.status };
    };
    // A claim's status read from the text report: FAIL, ???? (could not look) and SKIP lines name a claim; a claim the
    // clone's claims.json carries that no such line names passed.
    const textStatus = (out, id) => (new RegExp(`^\\s*FAIL\\s+${id}\\s`, 'm').test(out) ? 'FAIL' : new RegExp(`^\\s*\\?\\?\\?\\?\\s+${id}\\s`, 'm').test(out) ? 'UNKNOWN' : new RegExp(`^\\s*SKIP\\s+${id}\\s`, 'm').test(out) ? 'SKIPPED' : 'PASS');
    const cloneOf = (n) => { const c = path.join(T, `clone-cl${n}`); const g = spawnSync('git', ['clone', '-q', brainK, c], { encoding: 'utf8', windowsHide: true }); return { dir: c, code: g.status, err: (g.stderr || '').trim() }; };
    const clone1 = cloneOf(1);
    const shipsLaw = (dir) => { try { return F.readJson(path.join(dir, 'claims.json')).claims.some((c) => c.id === 'BRAIN-LAW-01'); } catch { return false; } };
    const dc1 = clone1.code === 0 ? cloneDoctor(clone1.dir) : { out: `git clone exit ${clone1.code}: ${clone1.err}`, code: -1 };
    check('clone: in a fresh clone the cloud brain Doctor passes BRAIN-LAW-01 and FAILs RESTORE-01 naming records/restore-drill.log (no grace in a clone): RED, exit 1', dc1.code === 1 && shipsLaw(clone1.dir) && textStatus(dc1.out, 'BRAIN-LAW-01') === 'PASS' && /^\s*FAIL\s+RESTORE-01\s+.*records[\\/]restore-drill\.log/m.test(dc1.out) && /CLAIMS\s+\d+ pass\s+1 fail\s+0 could not look/.test(dc1.out) && /VERDICT: RED/.test(dc1.out), `exit ${dc1.code}; BRAIN-LAW-01 ${textStatus(dc1.out, 'BRAIN-LAW-01')}; RESTORE-01 ${textStatus(dc1.out, 'RESTORE-01')} | ${dc1.out.slice(0, 900)}`);
    put(jp(brainK, 'records', 'restore-drill.log'), `${new Date().toISOString().slice(0, 10)} restore drill: cloned the remote into a fresh folder; HEAD and the file count matched the working copy\n`);
    F.git(brainK, ['add', 'records/restore-drill.log']);
    const drillK = F.git(brainK, [...GIT_ID, 'commit', '-q', '-m', 'restore drill']);
    const clone2 = cloneOf(2);
    const dc2 = clone2.code === 0 ? cloneDoctor(clone2.dir) : { out: `git clone exit ${clone2.code}: ${clone2.err}`, code: -1 };
    check('clone: with one dated drill line logged and committed in the brain, the same command in a new clone is GREEN (exit 0)', drillK.code === 0 && dc2.code === 0 && /VERDICT: GREEN/.test(dc2.out) && !/^\s*(FAIL|\?\?\?\?)\s/m.test(dc2.out), `drill commit exit ${drillK.code}; exit ${dc2.code} | ${dc2.out.slice(0, 900)}`);

    // ---------------------------------------------------------------- 6. remove: dry run, then real
    say('-- remove');
    const r6 = run(remove, ['-DryRun'], ptr3, markers);
    check('remove dry: exits 0, deletes nothing', r6.code === 0 && exists(path.join(brain3, 'me.md')) && exists(ptr3) && exists(path.join(brain3, 'state')), r6.out);
    check('remove dry: lists the vendored copy as would-delete and leaves it', /^\s*would delete\s+.*[\\/]\.claude[\\/]kit[\\/]hooks[\\/]guard\.mjs/m.test(r6.out) && isFile(jp(root3, '.claude', 'kit', 'VERSION')) && isFile(jp(brain3, '.claude', 'kit', 'VERSION')), r6.out);

    // Make LAW.md differ from its record: generated files go regardless of hash.
    fs.appendFileSync(path.join(brain, 'LAW.md'), '\nhand edit\n\n');
    // The owner's own line in the brain .gitignore: the file is kept, and the state/ lines adopt wrote stay.
    fs.appendFileSync(path.join(brain, '.gitignore'), 'notes/\n');
    const vendoredRootFiles = vRows.map((x) => jp(root, x.path));
    const vendoredBrainFiles = vRows.map((x) => jp(brain, x.path));
    const r7 = run(remove, [], ptr1, markers);
    check('remove: exits 0', r7.code === 0, r7.out);
    check('remove: edited me.md KEPT and listed', exists(path.join(brain, 'me.md')) && /^\s*KEPT\s+.*me\.md/m.test(r7.out) && r7.out.includes('kept      3 file(s)'), r7.out);
    const vendoredLeft = vendoredRootFiles.concat(vendoredBrainFiles).filter((x) => exists(x) && x !== vendoredGuard);
    check('remove: the recorded vendored files whose sha still matches are deleted in the root and the brain', vendoredLeft.length === 0 && vendoredRootFiles.length >= 10, vendoredLeft.slice(0, 5).join(', '));
    check('remove: the edited vendored hooks/guard.mjs is KEPT and listed (yours)', exists(vendoredGuard) && /^\s*KEPT\s+.*[\\/]\.claude[\\/]kit[\\/]hooks[\\/]guard\.mjs/m.test(r7.out), r7.out);
    check('remove: VERSION goes with the copy, empty kit folders are pruned, the kept file keeps its folder', !exists(path.join(rootKit, 'VERSION')) && !exists(brainKit) && exists(path.join(rootKit, 'hooks')) && !exists(path.join(rootKit, 'tools')), r7.out);
    check('remove: the message names the .gitignore lines that stay (a line is not a file) and the edited .gitignore is kept', /\.gitignore/.test(r7.out) && /a line is not a file/.test(r7.out) && /the state\/ lines adopt wrote in it stay/.test(r7.out) && exists(path.join(brain, '.gitignore')), r7.out);
    const goneFiles = ['voice.md', 'claims.json', 'doctor.config.json', 'Doctor.bat', 'doctor.sh', 'entry-point/CLAUDE.md.snapshot', 'instructions/README.md', '.gitattributes'].map((x) => jp(brain, x))
        .concat([path.join(root, 'CLAUDE.md'), jp(root, '.claude', 'settings.json'), brainSettings]);
    const still = goneFiles.filter((x) => exists(x));
    check('remove: unedited recorded files deleted (brain + root)', still.length === 0, still.join(', '));
    check('remove: the brain settings file goes as the root\'s does (recorded, unchanged since adopt)', !exists(brainSettings) && new RegExp(`^\\s*deleted\\s+${brainSettingsRx}\\s`, 'm').test(r7.out), r7.out);
    check('remove: hand-edited LAW.md deleted anyway (generated:true)', !exists(path.join(brain, 'LAW.md')));
    check('remove: pointer, state/, markers gone', !exists(ptr1) && !exists(path.join(brain, 'state')) && !exists(markers));
    check('remove: empty entry-point/ and instructions/ removed, brain folder and .git left', !exists(path.join(brain, 'entry-point')) && !exists(path.join(brain, 'instructions')) && exists(path.join(brain, '.git')));
    check('remove: prints the uninstall line', r7.out.includes('claude plugin uninstall design-first'));
    check('remove: frozen folder (never recorded) untouched', exists(jp(root, 'frozen', 'ref.txt')));

    // ---------------------------------------------------------------- 7. control cards (CR-2026-10-19-CONTROL chunk 1)
    // tools/control.mjs writes a domain's card or the Intake card from the templates, never
    // overwrites, and records nothing in installed.json. Proven on a throwaway brain folder; the
    // pointer passed is brain3's, so the one default-brain case reads a throwaway pointer.
    say('-- control: a domain card written from the template');
    const control = path.join(kit, 'tools', 'control.mjs');
    const brainC = path.join(T, 'brain-c');
    fs.mkdirSync(brainC, { recursive: true });
    const rc1 = run(control, ['-Domain', 'Rail', '-Brain', brainC, '-Session', 'local_rail_0001', '-Folders', 'rail,map-reading-trainer', '-Test', 'it teaches or checks a rule.', '-PluginRoot', kit], ptr3, markers);
    const railCard = jp(brainC, 'control', 'RAIL-CONTROL.md');
    check('control: a domain card is written (exit 0, wrote line, file exists)', rc1.code === 0 && /^\s*wrote\s+.*RAIL-CONTROL\.md/m.test(rc1.out) && isFile(railCard), rc1.out);
    const rail = isFile(railCard) ? F.readText(railCard) : '';
    check('control: the card is filled, not a template (no {{ token left)', rail.length > 0 && !/\{\{/.test(rail), rail);
    check('control: the name line carries the title, the session id and the sidebar section', rail.startsWith('# RAIL-CONTROL: Rail Master Control\n') && rail.includes('"Rail Master Control"') && rail.includes('`local_rail_0001`') && rail.includes('sidebar section Rail'), rail);
    check('control: the folders and the test are on the card; the typed period is not doubled', rail.includes('`rail`, `map-reading-trainer`') && rail.includes('The test: it teaches or checks a rule.') && !rail.includes('rule..'), rail);
    const railHeads = rail.split('\n').filter((l) => /^## /.test(l));
    check('control: the five sections, in order', railHeads.length === 5 && /^## How it works$/.test(railHeads[0]) && /^## Plumbing checks/.test(railHeads[1]) && /^## Roster, \d{4}-\d{2}-\d{2}$/.test(railHeads[2]) && railHeads[3] === '## Ladder' && railHeads[4] === '## Open for the owner', railHeads.join(' | '));
    check('control: the card says how a decision reaches the owner by rank (0.2.7)', rail.includes('A decision reaches the owner by its rank (OWN-10).') && rail.includes('a fresh Fable planning session') && rail.includes("the owner opens the planning session\n  by Intake's link"), rail);
    check('control: the card says which model does which work (0.2.7)', rail.includes('- Fable plans, and only plans. This master and Intake run on Opus. Builds run on Sonnet.') && rail.includes('so every brief names Opus or Sonnet unless the owner did.'), rail);
    check('control: the four-line report and the sidebar rule are on the card', rail.includes('Report format, four lines: repo and branch; files changed or posts made; needs from the owner;') && rail.includes('A nested session moves with its parent'), rail);
    check('control: the Doctor shim row is pre-filled and the kit rows are not (the domain is not Method)', rail.includes(`| Disk law | \`${path.join(brainC, IS_WIN ? 'Doctor.bat' : 'doctor.sh')}\` | exit 0; 2 is not a pass | |`) && !rail.includes('run.mjs'), rail);
    check("control: the roster holds the master's own row and no other", rail.includes('| Rail Master Control (this) | | controls | |') && rail.split('(this)').length === 2, rail);
    check('control: the card line (a brain file with a history, committed by the owner, a pointer at an old path)', rail.includes('a brain file with a history') && rail.includes('committed\nby the owner') && rail.includes('one-line pointer at its old path') && rail.includes(railCard), rail);
    const railBytes = fs.readFileSync(railCard);
    check('control: the card is UTF-8 without BOM, LF only', railBytes[0] !== 0xef && !railBytes.includes(13));
    check('control: nothing recorded in installed.json (no state folder made)', !exists(path.join(brainC, 'state')));
    check('control: the card is printed and the next step says the owner commits', rc1.out.includes('# RAIL-CONTROL: Rail Master Control') && /owner commits/i.test(rc1.out), rc1.out);

    say('-- control: the Method card carries the kit checks');
    const rc2 = run(control, ['-Domain', 'method', '-Brain', brainC, '-PluginRoot', kit], ptr3, markers);
    const methodCard = jp(brainC, 'control', 'METHOD-CONTROL.md');
    const method = isFile(methodCard) ? F.readText(methodCard) : '';
    const kitRows = ['node tools/tests/run.mjs', 'node tools/doctor/selftest.mjs', 'node tools/tests/adopt-selftest.mjs', 'node tools/doctor/doctor.mjs -Kit'];
    check("control: the Method card carries the kit's four checks after the Doctor shim row; the word is capitalised", rc2.code === 0 && method.startsWith('# METHOD-CONTROL: Method Master Control\n') && kitRows.every((c) => method.includes(`| \`${c}\``)) && method.indexOf('| Disk law |') < method.indexOf('| Hook self-test |'), rc2.out);
    check('control: a session id, folders or test not given are written as not recorded, never invented', method.includes('`not recorded: the owner reads it from the app and writes it here`') && method.includes('not recorded yet; the master lists the folders here') && method.includes('not recorded yet; the master writes the one sentence here'), method);

    say('-- control: an existing card is kept, its diff printed');
    fs.appendFileSync(railCard, '- Decide the first item (edited by the master).\n');
    const railEdited = F.fileSha256(railCard);
    const rc3 = run(control, ['-Domain', 'Rail', '-Brain', brainC, '-Session', 'local_rail_0001', '-Folders', 'rail,map-reading-trainer', '-Test', 'it teaches or checks a rule', '-PluginRoot', kit], ptr3, markers);
    check('control: an existing card is kept (exit 0, kept line, no wrote line)', rc3.code === 0 && /^\s*kept\s+.*RAIL-CONTROL\.md/m.test(rc3.out) && !/^\s*wrote\s/m.test(rc3.out), rc3.out);
    check("control: the diff is printed, names control as the writer and marks the master's line as theirs (+)", /--- diff[\s\S]*RAIL-CONTROL\.md[\s\S]*what control would write/.test(rc3.out) && rc3.out.includes('+- Decide the first item (edited by the master).'), rc3.out);
    check('control: the edited card is not overwritten', F.fileSha256(railCard) === railEdited);
    check('control: the kept run prints the card on disk, with the edit', /card\s+\(on disk, unchanged/.test(rc3.out) && rc3.out.includes('  - Decide the first item (edited by the master).'), rc3.out);

    say('-- control: the Intake card');
    const rc4 = run(control, ['-Intake', '-Brain', brainC, '-Session', 'local_intake_0001', '-PluginRoot', kit], ptr3, markers);
    const intakeCard = jp(brainC, 'control', 'INTAKE.md');
    const intake = isFile(intakeCard) ? F.readText(intakeCard) : '';
    check('control: the Intake card is written (exit 0), filled, not a template', rc4.code === 0 && isFile(intakeCard) && intake.startsWith('# INTAKE: ') && !/\{\{/.test(intake), rc4.out);
    const iLines = intake.split('\n');
    const routeHdr = iLines.indexOf('| Domain | Owns | Test | Master | Card | Sidebar |');
    check('control: the routing table has its six columns and no rows', routeHdr > 0 && iLines[routeHdr + 1] === '|---|---|---|---|---|---|' && iLines[routeHdr + 2] === '', iLines.slice(routeHdr, routeHdr + 3).join(' | '));
    const decisionRows = iLines.filter((l) => /^\| [1-6] \| [^|]+\? \| \| \|$/.test(l));
    check('control: the decisions table has six questions with the decision and the why blank', decisionRows.length === 6, iLines.filter((l) => /^\| [1-6] \|/.test(l)).join(' | '));
    const queueHdr = iLines.indexOf('| # | Item | Domain | State | Sent to | Report |');
    check('control: the queue is empty and the spend note is there', queueHdr > 0 && iLines[queueHdr + 2] === '' && intake.includes('## Spend') && intake.includes('not its total spend'), intake);
    check('control: the item flow and the prompt shape ending with the report-back line', intake.includes('1. **Dumped.**') && intake.includes('6. **Reported.**') && intake.includes('Reports to: Intake (local_intake_0001); when this item is done or blocked, message it one line:') && !intake.includes('\nReport: ') && intake.includes('"item <n> done: <proof>" or "item <n> blocked: <why>".'), intake);
    check('control: the Intake card line (a brain file with a history, committed by the owner)', intake.includes('a brain file with a history') && intake.includes('committed by the\nowner') && intake.includes('`local_intake_0001`'), intake);
    // 0.2.7: how a decision reaches the owner, by rank: low and medium by question through Intake,
    // high and a new project by an interview in the master's chat opened by Intake's link.
    check('control: the Intake card says how a decision reaches the owner by rank', intake.includes('- **Low or medium.** The master decides what it can defend (OWN-05)') && intake.includes('- **High, or a new project.** The item gets a real design-first interview in a fresh planning') && intake.includes('Intake gives the owner the link\n  to the planning session.'), intake);
    // Which model does which work: Fable plans only; Opus for Intake, masters and safety-critical
    // writes; Sonnet for builds; a Fable write only when the owner names it.
    check('control: the Intake card says which model does which work', intake.includes('- **Fable plans, and only plans.**') && intake.includes('- **Opus** runs Intake and the masters') && intake.includes('- **Sonnet** runs the builds.') && intake.includes('only when the owner names Fable for that item'), intake);
    const rc4b = run(control, ['-Domain', 'intake', '-Brain', brainC, '-Session', 'local_intake_0001', '-PluginRoot', kit], ptr3, markers);
    check('control: -Domain intake is the same Intake card (same line, nothing written)', rc4b.code === 0 && /^\s*same\s+.*INTAKE\.md/m.test(rc4b.out) && !exists(jp(brainC, 'control', 'INTAKE-CONTROL.md')), rc4b.out);

    say('-- control: dry run, default brain, refusals');
    const rc5 = run(control, ['-Domain', 'Site', '-Brain', brainC, '-DryRun', '-PluginRoot', kit], ptr3, markers);
    check('control dry: exits 0, says DRY RUN, prints a would-write line and the card', rc5.code === 0 && rc5.out.includes('DRY RUN') && /^\s*would write\s+.*SITE-CONTROL\.md/m.test(rc5.out) && rc5.out.includes('# SITE-CONTROL: Site Master Control'), rc5.out);
    check('control dry: nothing written', !exists(jp(brainC, 'control', 'SITE-CONTROL.md')));
    const rc5b = run(control, ['-Domain', 'Tools', '-DryRun', '-PluginRoot', kit], ptr3, markers);
    check("control: -Brain defaults to the pointer's brain", rc5b.code === 0 && rc5b.out.includes(jp(brain3, 'control', 'TOOLS-CONTROL.md')) && !exists(jp(brain3, 'control', 'TOOLS-CONTROL.md')), rc5b.out);
    const rc6 = run(control, ['-Brain', brainC, '-PluginRoot', kit], ptr3, markers);
    check('control: no -Domain and no -Intake is refused (exit 1, ERROR line)', rc6.code === 1 && /control: ERROR/.test(rc6.out), rc6.out);
    const rc7 = run(control, ['-Domain', 'Trade Desk', '-Brain', brainC, '-PluginRoot', kit], ptr3, markers);
    check('control: a domain of two words is refused (exit 1, nothing written); one word, one meaning', rc7.code === 1 && /control: ERROR/.test(rc7.out) && !exists(jp(brainC, 'control', 'TRADE DESK-CONTROL.md')), rc7.out);
} catch (e) {
    check(`selftest crashed: ${e && e.message ? e.message : e}`, false, e && e.stack ? e.stack : '');
}

const passed = results.filter((x) => x.pass).length; const failed = results.length - passed;
// The red-expected count (0.3.0, tools/release.mjs reads it). A check here records a name and a
// verdict, no expected value, so the name is read: one that carries 'red:' or states its refusal
// (deny, denied, refused, block, blocked, red, missing, unarmed, exit 1, exit 2). A count, not a gate.
const redExpected = results.filter((x) => /(^|[^a-z])(red:|deny|denied|refused|blocked?|red|missing|unarmed|exit ?[12])([^a-z]|$)/i.test(String(x.name))).length;
say();
say(`  ${passed} passed, ${failed} failed, ${results.length} total`, failed === 0 ? 32 : 31);
say(`  red-expected: ${redExpected}`);
say();
if (failed === 0 && !keepTemp) { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* best effort */ } }
else say(`  fixtures kept at ${T}`);
process.exitCode = failed > 0 ? 1 : 0;
