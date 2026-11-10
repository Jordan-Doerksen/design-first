// adopt.mjs - writes a design-first root + brain from templates and the answers the adopter gave.
// Called by commands/adopt.md (the command ASKS, this script WRITES: SPEC C2, DECISIONS 3.11).
//
//   node tools/adopt.mjs -Root <dir> [-Brain <dir>] -OwnerName <name>
//        [-GitHubOwners a,b] [-BrainIsRepo] [-FrozenPaths p,q] [-SettingsScope shared|personal]
//        [-PluginRoot <dir>] [-Settings pc|cloud-brain|cloud-writer|cloud-checker]
//        [-Vendor false | --no-vendor] [-DryRun]
//
// Modes (SPEC 5.6, finding 37):
//   fresh   the brain folder has none of the kit files        -> every file is written
//   attach  the brain folder already has at least one of them -> ONLY missing files are written;
//           for each existing file a unified diff is printed and nothing is changed
// It never overwrites. It never reads any brain but the one it is writing. It never writes the
// user-level settings.json: the soft_deny lines for frozen paths are PRINTED to paste (finding 56).
//
// The vendored kit (0.3.0, KIT-01, KIT-03). With -Vendor on, the default, a fresh adopt copies the
// kit's manifest (tools/vendor.json) into <root>/.claude/kit/ and, when the brain is a separate
// folder, <brain>/.claude/kit/ through tools/vendor.mjs, which writes the VERSION that names the
// bytes; and it renders the root settings file through tools/settings.mjs -Vendored -Host pc
// -Set <set> (-Settings, default pc): a missing settings file is written and recorded; one the
// repository already has, with no hooks key or with one that already is the render, gets the hooks
// block merged in with every row and key of its own kept (printed as merged, never recorded:
// remove.mjs leaves it); one with a hooks key of its own is kept byte for byte, with its diff and the
// merge command printed and named in the next steps, because the merge replaces the whole hooks key
// (review finding 3). Every printed command that renders the block into a file there with a hooks key of
// its own says so before the command, so those hooks move to another settings file first (M27): the kept
// lines of both modes, the next step of a kept file, the -Vendor false fix-up, the vendor-failure step and
// the personal note, in the words of one function, ownHooksWords. When the brain is a separate folder it
// is a separate clone, so <brain>/.claude/settings.json is rendered too (the same set, no host
// filter) under the same rule, and a cloud session on the brain clone loads the hooks from it.
// Attach mode writes only what is missing: a copy with its VERSION is kept as it is, an existing
// settings file is compared and kept, with the command that merges the block printed. -Vendor false
// (or --no-vendor) writes the settings as the
// pc template alone, with no hooks block, and the shipped claims then keep the first Doctor run off
// green, on purpose (SETTINGS-BLOCK-01 RED; KIT-VENDOR-01 and KIT-VENDOR-02 COULD-NOT-LOOK, so the run is
// COULD-NOT-LOOK): a root with no vendored kit is never a quiet pass. The off line names each claim with
// that band, and every command that turns them green, in the order they run:
// tools/vendor.mjs for each copy a claim reads, then tools/settings.mjs into the settings file
// SETTINGS-BLOCK-01 reads (vendoring alone renders no hooks block) and, for a separate brain, into
// the brain's own settings file, as a vendored adopt writes it.
//
// Everything written is recorded in <brain>/state/installed.json: { path, sha256, generated } rows
// under files (sha over CRLF->LF bytes; merged by path with any earlier record) and, under vendored,
// the { path, sha256 } rows tools/vendor.mjs -Record writes for the copied files (relative to the
// folder they were copied into), so remove.mjs can reverse exactly this and nothing else. Then:
// pointer, brain LAW.md via the generator, the Doctor, summary.
// The generator reads <brain>/state/law-installed.json: every hook hooks.json registers, root
// settings, pointer. It stays there, so the shipped claim BRAIN-LAW-01 repeats the same build; a repo
// brain's .gitignore lets that one file of state/ through, so a clone of the brain carries it too.
// -DryRun prints every step and writes nothing under root, brain or the profile.
//
// Exit 0 = adopt finished (the Doctor's own exit code is printed in the summary, never adopted:
// a SURVEY finding is not an adopt failure). Exit 1 = adopt itself could not finish; a vendor step
// that exits non-zero for a target is one (review finding 8): under the pc set that target's settings
// file then gets the pc permission set alone, with no hooks block; under another set no settings file
// is written for it (one that is there is left as it is), because that set needs the vendored hooks
// and the pc template's ask rows must never reach a cloud file. One line says why, the next steps
// start with the fix-up commands, and the run goes on to the Doctor before it exits 1. Its ERROR line
// is the vendor tool's own last line (review finding 9). The law build and a kept file's diff each
// use a temp folder of their own (fs.mkdtempSync), removed after, so two runs at once never share one.
// Exit 2 = could not look: the OS temp folder (TMPDIR, TMP, TEMP) cannot be used. It is checked before
// the first write, a folder made and removed there, so nothing is written, and a dry run says the same;
// adopt never makes the temp folder itself.
// Test seams: DF_POINTER_PATH (pointer location), DF_MARKER_DIR; nothing else (DF_KIT_ROOT, the hook
// suite's seam, is dropped from the settings render's environment).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import * as F from './lib/df-files.mjs';
import { newPlan, toConfigPath, registeredHooks } from './lib/adopt-plan.mjs';
import { pathEq } from '../hooks/lib/common.mjs';
import { parseJson } from '../hooks/lib/json.mjs';

const KIT_FROM_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (s = '') => process.stdout.write(s + '\n');
const firstLine = (s) => String(s || '').trim().split(/\r?\n/)[0] || '';
const outLines = (r) => `${r.stdout || ''}${r.stderr || ''}`.replace(/\n$/, '').split(/\r?\n/).filter((x) => x);
// Deep equality of two JSON values: arrays item by item in order, objects by their keys in any order.
const sameJson = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
    if (a != null && b != null && typeof a === 'object' && typeof b === 'object') {
        const ka = Object.keys(a);
        return ka.length === Object.keys(b).length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson(a[k], b[k]));
    }
    return a === b;
};

// -Vendor is on unless the adopter turns it off: -Vendor false (or off, no, 0), -Vendor=false,
// --vendor=false or --no-vendor. tools/lib/args.mjs reads a switch as on whenever it is present,
// so the forms that carry a separate value are folded into the =value form first, and the default
// stands when the switch is not given at all.
const VENDOR_FLAG = /^--?vendor(?:=.*)?$/i;
function foldArgv(argv) {
    const out = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (/^--?no-?vendor$/i.test(a)) { out.push('-Vendor=false'); continue; }
        if (/^--?vendor$/i.test(a) && i + 1 < argv.length && /^(true|false|yes|no|on|off|1|0)$/i.test(argv[i + 1])) { out.push(`-Vendor=${/^(false|no|off|0)$/i.test(argv[++i]) ? 'false' : 'true'}`); continue; }
        out.push(a);
    }
    return out;
}

try {
    const argv = foldArgv(process.argv.slice(2));
    const opts = parseArgs(argv, {
        values: ['Root', 'Brain', 'OwnerName', 'SettingsScope', 'PluginRoot', 'Settings'],
        switches: ['BrainIsRepo', 'DryRun', 'Vendor'],
        lists: ['GitHubOwners', 'FrozenPaths'],
    });
    if (opts._.length) throw new Error(`unexpected argument ${opts._[0]}: every word belongs to a flag (quote a value that has spaces)`);
    if (!opts.Root) throw new Error('-Root is required');
    if (opts.OwnerName == null) throw new Error('-OwnerName is required');
    const scope = (opts.SettingsScope || 'shared').toLowerCase();
    if (scope !== 'shared' && scope !== 'personal') throw new Error(`-SettingsScope must be shared or personal, got '${opts.SettingsScope}'`);
    const dryRun = opts.DryRun;
    const verb = dryRun ? 'would write' : 'wrote';
    const vendorOn = argv.some((a) => VENDOR_FLAG.test(a)) ? opts.Vendor : true;
    const set = String(opts.Settings == null || opts.Settings === '' ? 'pc' : opts.Settings).toLowerCase();
    if (!vendorOn && set !== 'pc') throw new Error(`-Settings ${set} needs vendoring on: a permissions set other than pc is rendered by tools/settings.mjs together with the hooks block of the vendored kit`);

    // ---------------------------------------------------------------- answers -> facts
    const kit = F.fullPath(opts.PluginRoot || KIT_FROM_HERE);
    for (const need of ['templates/root-CLAUDE.md', 'templates/root-settings.json', 'law.json', 'tools/law/build-law.mjs', 'tools/doctor/doctor.mjs', 'hooks/hooks.json', 'hooks/registry.json', 'tools/settings.mjs', 'tools/vendor.mjs', 'tools/vendor.json']) {
        if (!fs.existsSync(path.join(kit, need))) throw new Error(`not a design-first kit (missing ${need}): ${kit}`);
    }
    if (!fs.existsSync(opts.Root) || !fs.statSync(opts.Root).isDirectory()) throw new Error(`root folder does not exist: ${path.resolve(opts.Root)}`);
    const root = F.fullPath(opts.Root);
    const brain = opts.Brain ? F.fullPath(opts.Brain) : path.join(root, 'brain');
    const ownerName = opts.OwnerName.trim();
    if (!ownerName) throw new Error('owner name is empty');
    // The temp folder, checked before the first write: the law build and a kept file's diff each make a folder
    // of their own there, later. A fresh folder is made and removed at once; when that fails adopt could not
    // look, writes nothing and exits 2, in a dry run too. It never makes the OS temp folder itself. Before this,
    // a temp folder that did not exist let adopt write the files, both vendored copies, the settings files and
    // the pointer, then stop at the law build with exit 1. A temp folder taken away during the run still stops
    // the law build later, with its ERROR.
    const tmpBase = os.tmpdir();
    let tmpProbe = null;
    try { tmpProbe = fs.mkdtempSync(path.join(tmpBase, 'design-first-adopt-')); fs.rmSync(tmpProbe, { recursive: true, force: true }); } catch (e) {
        const left = tmpProbe ? `; the folder ${tmpProbe} made there to check it could not be removed` : '';
        throw Object.assign(new Error(`the temp folder ${tmpBase} cannot be used (${e.message})${left}; nothing was written. Point TMPDIR (TEMP on Windows) at a folder that exists and can be written, then run adopt again.`), { couldNotLook: true });
    }
    const gitHubOwners = opts.GitHubOwners;
    const frozenCfg = opts.FrozenPaths.map((p) => toConfigPath(p, root)).filter((x) => x);

    const rootIsRepo = F.isGitWorkTree(root);
    const kind = F.pluginKind(kit);
    const settingsTarget = path.join(root, '.claude', scope === 'personal' ? 'settings.local.json' : 'settings.json');
    const pointerPath = F.pointerFile();
    const stateDir = path.join(brain, 'state');
    const installedPath = path.join(stateDir, 'installed.json');
    const brainSeparate = !pathEq(brain, root);

    // The settings render, before anything is written: the hooks block in the vendored form for the
    // PC host, with the permissions set, as tools/settings.mjs writes a new file. The same hooks
    // object becomes the subset of SETTINGS-BLOCK-01 in the brain claims.json, so the file and the
    // claim come from one render. A set the renderer refuses stops adopt here, with nothing written.
    const settingsTool = path.join(kit, 'tools', 'settings.mjs');
    const settingsArgs = ['-Vendored', '-Host', 'pc', '-Set', set];
    const toolEnv = { ...process.env };
    delete toolEnv.DF_KIT_ROOT;   // the hook suite's seam: the kit rendered here is the one adopt was given, never another
    const settingsRun = (args) => spawnSync(process.execPath, [settingsTool, ...args], { encoding: 'utf8', windowsHide: true, env: toolEnv });
    const sr = settingsRun(settingsArgs);
    if (sr.status !== 0) throw new Error(`tools/settings.mjs could not render the ${set} set (exit ${sr.status}): ${firstLine(sr.stderr || sr.stdout)}`);
    const settingsText = sr.stdout;
    let settingsHooks;
    try { settingsHooks = parseJson(settingsText).hooks; } catch (e) { throw new Error(`the settings render is not JSON: ${e.message}`); }
    if (settingsHooks == null || typeof settingsHooks !== 'object') throw new Error('the settings render carries no hooks block');
    // The brain's own settings file when the brain is a separate folder (a separate clone): the same
    // set in the vendored form, with no host filter (the brain clone runs on either host), rendered
    // here for the same reason. Its hooks block runs the brain's own .claude/kit/ through
    // ${CLAUDE_PROJECT_DIR}, so -Scope brain -Host cloud reads it as the registration record. With
    // -Vendor false it is rendered too, and nothing is written from it: the off line prints the command
    // that renders it, and that line's words (M27) compare the file there with this render.
    const brainSettingsTarget = path.join(brain, '.claude', 'settings.json');
    const brainSettingsArgs = ['-Vendored', '-Set', set];
    let brainSettingsText = '';
    if (brainSeparate) {
        const br = settingsRun(brainSettingsArgs);
        if (br.status !== 0) throw new Error(`tools/settings.mjs could not render the ${set} set for the brain (exit ${br.status}): ${firstLine(br.stderr || br.stdout)}`);
        brainSettingsText = br.stdout;
    }

    // Snapshot pairs only when root is NOT a repo: git is the snapshot otherwise (SPEC 7, finding 67).
    const snapshotPairs = rootIsRepo ? [] : [
        { live: '${ROOT}/CLAUDE.md', snapshot: 'entry-point/CLAUDE.md.snapshot' },
        { live: `\${ROOT}/.claude/${path.basename(settingsTarget)}`, snapshot: `entry-point/${path.basename(settingsTarget)}.snapshot` },
    ];

    const kitFiles = ['me.md', 'voice.md', 'prohibitions.md', 'law.overlay.json', 'claims.json', 'doctor.config.json', 'entry.json', 'lessons.md', 'canonical.md', 'Doctor.bat', 'doctor.sh', 'LAW.md'];
    const mode = fs.existsSync(brain) && kitFiles.some((f) => fs.existsSync(path.join(brain, f))) ? 'attach' : 'fresh';

    say();
    say(`design-first adopt  [${mode} mode${dryRun ? ', DRY RUN: nothing is written' : ''}]`);
    say(`  root        ${root}  (git work tree: ${rootIsRepo ? 'yes' : 'no'})`);
    say(`  brain       ${brain}${opts.BrainIsRepo ? '  (git repo)' : ''}`);
    say(`  owner       ${ownerName}`);
    say(`  github      ${gitHubOwners.length ? gitHubOwners.join(', ') : '(none: every remote will survey as FOREIGN until ownerRemotePatterns is filled)'}`);
    say(`  frozen      ${frozenCfg.length ? frozenCfg.join(', ') : '(none)'}`);
    say(`  settings    ${settingsTarget}  (${scope}; set ${set}${vendorOn ? ', with the vendored hooks block' : ', no hooks block'})`);
    if (vendorOn && brainSeparate) say(`  brain       ${brainSettingsTarget}  (set ${set}, with the vendored hooks block: the brain is a separate folder, so its clone loads the hooks from its own file)`);
    say(`  vendor      ${vendorOn ? `on: .claude/kit/ in the root${brainSeparate ? ' and in the brain' : ''}` : 'off (-Vendor false): no .claude/kit/ is written'}`);
    say(`  kit         ${kit}  (${kind})`);
    say(`  pointer     ${pointerPath}`);
    say();

    // ---------------------------------------------------------------- plan -> write missing, diff existing
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const plan = newPlan({ kit, root, brain, ownerName, gitHubOwners, frozenPaths: frozenCfg, settingsTarget, snapshotPairs, brainIsRepo: opts.BrainIsRepo, today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, settingsText: vendorOn ? settingsText : undefined, settingsHooks });
    const written = [];
    const kept = [];
    let settingsWritten = false;
    // A settings file kept without the kit's block: what the summary says of it, by path, and (review finding 3)
    // those kept for a hooks key of their own, whose merge command the next steps name.
    const settingsKept = new Map();
    const keptOwnHooks = [];

    // One rule for every file: absent -> write and record; present and identical -> record; present
    // and different -> diff, keep, do not record.
    function place(p, bytes, generated, note) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            if (F.fileSha256(p) === F.normalisedSha256(bytes)) {
                say(`  same     ${p}`);
                written.push(F.installedRecord(p, bytes, generated)); return 'same';
            }
            say(`  kept     ${p}  (exists and differs; not touched)`);
            for (const l of F.showDiff(p, bytes, p)) say(l);
            kept.push(p); return 'kept';
        }
        say(`  ${verb}    ${p}  - ${note}`);
        if (!dryRun) F.writeBytes(p, bytes);
        written.push(F.installedRecord(p, bytes, generated)); return 'written';
    }

    say('files');
    for (const item of plan) {
        if (vendorOn && item.path === settingsTarget) continue;   // rendered below, after the vendor step
        const res = place(item.path, item.bytes, item.generated, item.note);
        if (item.path === settingsTarget && res !== 'kept') settingsWritten = true;
    }

    // ---------------------------------------------------------------- the vendored kit (0.3.0, KIT-01)
    // tools/vendor.mjs copies the manifest and writes VERSION; -Record puts the copied files into
    // installed.json's vendored list (vendor.mjs keeps every other key of that file, and writeInstalled
    // below keeps the vendored key). A copy that already has its VERSION is not touched in either
    // mode: adopt never overwrites, and vendor.mjs alone would restore an edited file to the kit's bytes.
    const vendorTool = path.join(kit, 'tools', 'vendor.mjs');
    const vendored = [];
    // A target whose vendor step did not finish (review finding 8): its settings file gets no hooks
    // block below, and adopt exits 1 at the end. Keyed by the target folder; the value is the exit code.
    const vendorFailed = new Map();
    say();
    say('vendored kit');
    if (!vendorOn) {
        // Every command that turns the three claims green, in the order they run, one per line: the vendor tool for
        // each copy a claim reads (the root's, KIT-VENDOR-01; a separate brain's, KIT-VENDOR-02), then the hooks-block
        // render into the settings file SETTINGS-BLOCK-01 reads, in the form the vendor-failure next step prints, and,
        // for a separate brain, the render into the brain's own settings file, which a vendored adopt writes so a cloud
        // session on the brain clone loads the hooks (no claim reads it; -Scope brain names it when it is missing).
        // Vendoring alone renders no hooks block, so a line that named the vendor commands only left that claim RED.
        // A render command into a file that is there with a hooks key of its own says first, on its line, that the
        // kit's block replaces that whole key (M27); every other command line is the command alone.
        const renderLine = (target, args, text) => {
            const cmd = `node "${settingsTool}" ${args.join(' ')} -Out "${target}"`;
            const words = ownHooksNote(target, text, target);
            return words ? `${words}, then run: ${cmd}` : cmd;
        };
        const fixUp = (brainSeparate ? [root, brain] : [root]).map((t) => `node "${vendorTool}" -Target "${t}"`)
            .concat(renderLine(settingsTarget, settingsArgs, settingsText))
            .concat(brainSeparate ? [renderLine(brainSettingsTarget, brainSettingsArgs, brainSettingsText)] : []);
        // Each claim is named with the band the Doctor gives it until then (review finding 8): no hooks block is a FAIL,
        // a VERSION that is not there could not be looked at, and COULD-NOT-LOOK wins over RED in the verdict.
        say(`  off      -Vendor false: no .claude/kit/ is written, and the shipped claims are not green (SETTINGS-BLOCK-01 RED; KIT-VENDOR-01 and KIT-VENDOR-02 COULD-NOT-LOOK, which makes the run COULD-NOT-LOOK) until these commands are run, in this order:`);
        for (const c of fixUp) say(`             ${c}`);
    } else {
        for (const target of brainSeparate ? [root, brain] : [root]) {
            const kitDir = path.join(target, '.claude', 'kit');
            const versionFile = path.join(kitDir, 'VERSION');
            if (fs.existsSync(versionFile)) {
                say(`  kept     ${kitDir}${path.sep}  (VERSION present: only missing files are written; refresh the copy with: node "${vendorTool}" -Target "${target}")`);
                vendored.push({ dir: kitDir, status: 'kept as it was' });
                continue;
            }
            if (!fs.existsSync(target)) {   // a dry run makes no brain folder, so there is nothing to copy into yet
                say(`  ${verb}    ${versionFile}  - and the kit's manifest (tools/vendor.json) beside it, through tools/vendor.mjs`);
                vendored.push({ dir: kitDir, status: 'would be written' });
                continue;
            }
            const args = ['-Target', target, '-Kit', kit, ...(dryRun ? ['-DryRun'] : ['-Record', installedPath])];
            const vr = spawnSync(process.execPath, [vendorTool, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
            const lines = outLines(vr);
            if (vr.status !== 0) {
                // The ERROR line is the tool's own last line, its refusal or could-not-look reason, never
                // a guess (review finding 9): a record that failed after the copy leaves the copy and its
                // VERSION on disk, and vendor.mjs says so.
                const code = vr.status == null ? `on signal ${vr.signal || 'unknown'}` : vr.status;
                const why = lines.length ? lines[lines.length - 1] : `no output${vr.error ? ` (${vr.error.message})` : ''}`;
                say(`  ERROR    tools/vendor.mjs exited ${code} for ${target}: ${why}`);
                for (const l of lines.slice(0, -1)) say(`           ${l}`);
                vendored.push({ dir: kitDir, status: `FAILED (vendor.mjs exit ${code})` });
                vendorFailed.set(target, code);
                continue;
            }
            const summary = lines.find((l) => /^vendored |^vendor: dry run/.test(l)) || lines[lines.length - 1] || 'done';
            say(`  ${verb}    ${versionFile}  - ${summary}`);
            vendored.push({ dir: kitDir, status: dryRun ? 'would be written' : summary });
        }
    }

    // ---------------------------------------------------------------- the settings files (0.3.0, KIT-03)
    // One rule for a settings file, the root's and, when the brain is a separate folder, the brain's
    // (a separate clone, so a cloud session on it loads the hooks only from its own file): absent ->
    // rendered by tools/settings.mjs -Out and recorded; present and the render byte for byte -> same,
    // recorded; present with the block beside the owner's rows (-Check exits 0, not the render byte
    // for byte) -> kept, not recorded, remove.mjs leaves it; present and different -> in fresh mode
    // merged when it has no hooks key or one that already is the render (the owner's rows and keys
    // kept, not recorded) and kept byte for byte with the merge command printed when it has a hooks
    // key of its own, which the merge would replace whole (review finding 3); kept in attach mode
    // with the merge command printed. -Check writes nothing: exit 0 when the merge would change
    // nothing, the first differing lines and exit 1 when it would, a 'settings:' refusal when it
    // cannot be rendered into. Returns true when the file carries the block after this run.
    function placeSettings(target, args, text) {
        const what = `the ${set} permissions and the hooks block, rendered by tools/settings.mjs (${args.join(' ')})`;
        if (!(fs.existsSync(target) && fs.statSync(target).isFile())) {
            say(`  ${verb}    ${target}  - ${what}`);
            if (dryRun) written.push(F.installedRecord(target, F.textBytes(text, target), false));
            else {
                const w = settingsRun([...args, '-Out', target]);
                if (w.status !== 0) throw new Error(`tools/settings.mjs could not write ${target} (exit ${w.status}): ${firstLine(w.stderr || w.stdout)}`);
                written.push(F.installedRecord(target, fs.readFileSync(target), false));
            }
            return true;
        }
        const c = settingsRun([...args, '-Check', '-Out', target]);
        const differs = /differs from the registry render/.test(c.stderr || '');
        const diffLines = outLines(c).filter((l) => !/^settings:/.test(l));
        if (c.status === 0) {
            // Recorded only when the file IS the render, byte for byte: a file that also carries the
            // owner's own rows keeps its earlier record, or none, as every edited file does.
            if (F.fileSha256(target) === F.normalisedSha256(F.textBytes(text, target))) {
                say(`  same     ${target}  (already the render)`);
                written.push(F.installedRecord(target, fs.readFileSync(target), false));
            } else {
                say(`  kept     ${target}  (the hooks block is in it beside your own rows: nothing to merge; not touched, not recorded, remove.mjs leaves it as yours)`);
                kept.push(target);
            }
            return true;
        }
        if (!differs) {
            say(`  kept     ${target}  (tools/settings.mjs cannot render into it: ${firstLine(c.stderr || c.stdout)})`);
            kept.push(target);
            settingsKept.set(target, `set ${set} not merged in: tools/settings.mjs cannot render into it, kept as it was (the line above says why)`);
            return false;
        }
        const mergeCommand = `node "${settingsTool}" ${args.join(' ')} -Out "${target}"`;
        if (mode === 'fresh') {
            // A hooks key of the file's own (review finding 3): tools/settings.mjs replaces the whole hooks key
            // of the file it merges into, and the merged file is not recorded, so a merge would drop the owner's
            // hooks for good. The file is kept byte for byte, as attach mode keeps one, with its diff and the
            // merge command: the merge is the owner's to run.
            const own = ownHooksKey(target, text);
            if (own) {
                say(`  kept     ${target}  (${own === true ? ownHooksWords('it') : own}; not touched, not recorded. Merge the hooks block in with: ${mergeCommand})`);
                for (const l of diffLines) say(`      ${l}`);
                kept.push(target);
                if (own === true) keptOwnHooks.push({ target, command: mergeCommand });
                settingsKept.set(target, own === true ? `set ${set} not merged in: it has its own hooks key, kept as it was; the merge command is under next` : `set ${set} not merged in: ${own}, kept as it was`);
                return false;
            }
            // The repository's own file with no hooks key: the hooks block is merged in and every row and key
            // of its own is kept. Not recorded: it was the repository's before adopt, so remove.mjs must leave it.
            say(`  ${dryRun ? 'would merge' : 'merged  '} ${target}  - ${what}; your own rows and keys are kept, the hooks key is the kit's (not recorded: remove.mjs leaves this file)`);
            for (const l of diffLines) say(`      ${l}`);
            if (dryRun) return true;
            const w = settingsRun([...args, '-Out', target]);
            if (w.status !== 0) { say(`  ERROR    tools/settings.mjs exited ${w.status}: ${firstLine(w.stderr || w.stdout)}; the file is kept as it was`); kept.push(target); settingsKept.set(target, `set ${set} not merged in: the merge failed, kept as it was (the ERROR line above)`); return false; }
            return true;
        }
        // A hooks key of the file's own (M27): the merge command replaces it whole, so the line says so before the command.
        const words = ownHooksNote(target, text, 'It');
        say(`  kept     ${target}  (exists and differs; attach mode writes only missing files. ${words ? `${words}, then merge` : 'Merge'} the hooks block in with: ${mergeCommand})`);
        for (const l of diffLines) say(`      ${l}`);
        kept.push(target);
        settingsKept.set(target, `set ${set} not merged in: attach mode kept it as it was (not the render; the merge command is printed above)`);
        return false;
    }
    // Whether the settings file at target has a hooks key of its own (review finding 3): true when it has a hooks
    // key that is not the hooks block of the render (text), false when it has none or that very block, so a merge
    // keeps every hook it registers; a string when the file cannot be read as a JSON object (tools/settings.mjs
    // -Check has just parsed it, so only a change between the two reads gets here), which keeps the file too.
    function ownHooksKey(target, text) {
        let doc;
        try { doc = parseJson(fs.readFileSync(target, 'utf8')); } catch (e) { return `it could not be read again (${e.message})`; }
        if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) return 'it is not a JSON object';
        if (!Object.prototype.hasOwnProperty.call(doc, 'hooks')) return false;
        let render;
        try { render = parseJson(text).hooks; } catch (e) { return `it has a hooks key and the render to compare it with could not be read (${e.message})`; }
        return !sameJson(doc.hooks, render);
    }
    // The words every printed render command carries before the command when the settings file it writes is there with a
    // hooks key of its own (M27, review finding 3): tools/settings.mjs replaces the whole hooks key of the file it renders
    // into, so the owner's own hooks move to another settings file first. One wording function for every such line: the
    // kept lines of a fresh adopt and of attach mode, the next step of a kept file, the -Vendor false fix-up, the
    // vendor-failure step and the personal note; subject names the file in the line's own words.
    function ownHooksWords(subject) {
        return `${subject} has its own hooks key, and the kit's block replaces the whole key, so the merge is yours: move those hooks to another settings file first`;
    }
    // Those words when the file at target is there with a hooks key of its own (ownHooksKey true), else '' and the line
    // stays as it is: a file with no hooks key, or with the render's own block, keeps every hook it registers through the
    // merge, and one that cannot be read as a JSON object is refused by tools/settings.mjs, which merges into nothing.
    function ownHooksNote(target, text, subject = 'it') {
        const own = fs.existsSync(target) && fs.statSync(target).isFile() && ownHooksKey(target, text) === true;
        return own ? ownHooksWords(subject) : '';
    }
    // A target whose vendor step did not finish gets no hooks block (review finding 8): the block would
    // register hooks under a .claude/kit/ that is not complete. Under the pc set its settings file is the
    // pc permission set alone, as -Vendor false writes it, through the same never-overwrite rule as every
    // file. Under another set (cloud-brain, cloud-writer, cloud-checker) no settings file is written for
    // it, and one that is there is left as it is: that set is rendered with the vendored hooks block, and
    // the pc template's ask rows must never reach a cloud file (an ask with nobody to click is a hang, and
    // the printed fix-up would merge into them and keep them). One line says why, and adopt exits 1 at
    // the end. Returns true when the file is written or already the pc set.
    function placeWithoutHooks(target, vendorTarget) {
        const kitDir = path.join(vendorTarget, '.claude', 'kit');
        const code = vendorFailed.get(vendorTarget);
        const why = fs.existsSync(path.join(kitDir, 'VERSION'))
            ? `the vendor step for ${vendorTarget} did not finish (tools/vendor.mjs exit ${code}): its copy and VERSION are on disk and no record names them`
            : `the vendored copy in ${kitDir}${path.sep} is not complete (tools/vendor.mjs exit ${code})`;
        if (set !== 'pc') {
            say(`  no settings ${target}  - the ${set} set needs the vendored hooks; nothing written${fs.existsSync(target) ? ' (the file there is left as it was)' : ''}: ${why}`);
            return false;
        }
        say(`  no hooks ${target}  - the hooks block is not written: ${why}; the pc permission set alone is, as -Vendor false writes it`);
        const pcSet = F.textBytes(F.readText(path.join(kit, 'templates', 'root-settings.json')), target);
        return place(target, pcSet, false, 'the pc permission set alone (templates/root-settings.json), no hooks block') !== 'kept';
    }
    say();
    say('settings');
    if (!vendorOn) say(`  (written above from templates/root-settings.json: no hooks block without a vendored kit)`);
    else {
        settingsWritten = vendorFailed.has(root) ? placeWithoutHooks(settingsTarget, root) : placeSettings(settingsTarget, settingsArgs, settingsText);
        if (brainSeparate) {
            if (vendorFailed.has(brain)) placeWithoutHooks(brainSettingsTarget, brain);
            else placeSettings(brainSettingsTarget, brainSettingsArgs, brainSettingsText);
        }
    }

    // Byte snapshots of the live root files (root not a repo). Taken AFTER the writes so the snapshot
    // equals whatever is live now, including a pre-existing CLAUDE.md that was kept.
    for (const pair of snapshotPairs) {
        const live = path.join(root, pair.live.replace('${ROOT}/', ''));
        const snap = path.join(brain, pair.snapshot);
        if (!fs.existsSync(live)) { say(`  skip     ${snap}  (live file absent: ${live})`); continue; }
        place(snap, fs.readFileSync(live), false, `byte snapshot of ${live}`);
    }

    // ---------------------------------------------------------------- brain as a git repo
    if (opts.BrainIsRepo) {
        if (fs.existsSync(path.join(brain, '.git'))) say(`  git      ${brain} is already a repository`);
        else if (!F.hasGit()) say('  git      NOT on PATH; the brain was not initialised. Run: git init -b main');
        else if (dryRun) say(`  git      would run: git -C "${brain}" init -b main  (nothing committed; the owner commits)`);
        else {
            const g = F.git(brain, ['init', '-q', '-b', 'main']);
            if (g.code !== 0) say(`  git      init failed (exit ${g.code}); initialise the brain by hand: git init -b main`);
            else say(`  git      initialised ${brain} on branch main (nothing committed; the owner commits)`);
        }
    }

    // ---------------------------------------------------------------- state, pointer
    if (!dryRun) fs.mkdirSync(stateDir, { recursive: true });
    const pointer = { schema: 1, root, brain, pluginRoot: kit, pluginKind: kind };
    say(`  ${verb}    ${pointerPath}  - pointer (schema 1, ${kind})`);
    if (!dryRun) F.writeBytes(pointerPath, F.textBytes(JSON.stringify(pointer, null, 2) + '\n', pointerPath));

    // ---------------------------------------------------------------- brain LAW.md (generated)
    say();
    say('law');
    // Every hook hooks.json registers, read from the file (adopt-plan.mjs), never a typed list.
    const installedState = { hooks: registeredHooks(kit), rootSettings: settingsWritten, pointer: true };
    if (!installedState.rootSettings) {
        for (const sp of [path.join(root, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.local.json')]) {
            if (!fs.existsSync(sp)) continue;
            try { const s = F.readJson(sp); if (s.permissions && [].concat(s.permissions.deny || []).length > 0) installedState.rootSettings = true; } catch { /* unreadable: not counted */ }
        }
    }
    // The law is built in a temp folder of this run's own (fs.mkdtempSync), removed when the build ends,
    // also on a throw: the fixed <os temp>/design-first-adopt it used before let two adopt runs at once
    // write, read and delete each other's LAW.md, and a file at that name stopped every run. A folder
    // that cannot be removed is named, never left in silence.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-first-adopt-'));
    let lawStatus = 'not generated';
    try {
        // The installed state is kept in the brain, not a temp file, because the shipped claim
        // BRAIN-LAW-01 (templates/claims.json) builds LAW.md again from the same inputs on every Doctor
        // run. A dry run writes nothing in the brain, so it builds from a temp copy.
        const lawState = path.join(stateDir, 'law-installed.json');
        const tmpState = dryRun ? path.join(tmpDir, 'installed-state.json') : lawState;
        const tmpLaw = path.join(tmpDir, 'LAW.md');
        say(`  ${verb}    ${lawState}  - installed mechanisms the LAW.md grades read: ${Object.keys(installedState.hooks).length} registered hook(s), root settings, pointer`);
        F.writeBytes(tmpState, F.textBytes(JSON.stringify(installedState, null, 2) + '\n', tmpState));
        const overlay = path.join(brain, 'law.overlay.json');
        const lawArgs = ['-Source', path.join(kit, 'law.json'), '-Installed', tmpState, '-Out', tmpLaw];
        if (fs.existsSync(overlay)) lawArgs.push('-Overlay', overlay, '-BrainRoot', brain);
        else lawArgs.push('-Overlay', path.join(kit, 'templates', 'law.overlay.json'));   // dry run: the brain overlay does not exist yet
        const lr = spawnSync(process.execPath, [path.join(kit, 'tools', 'law', 'build-law.mjs'), ...lawArgs], { encoding: 'utf8' });
        if (lr.status !== 0) {
            say(`  ERROR    build-law exited ${lr.status}; LAW.md not written:`);
            for (const l of `${lr.stdout || ''}${lr.stderr || ''}`.split(/\r?\n/).filter((x) => x)) say(`           ${l}`);
        } else {
            const res = place(path.join(brain, 'LAW.md'), fs.readFileSync(tmpLaw), true, 'generated from kit law.json + overlay + installed state');
            lawStatus = res === 'written' ? verb : res === 'same' ? 'already current' : 'exists and differs: kept; regenerate it after migrating it to the overlay (build-law.mjs)';
        }
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { say(`  WARN     the temp folder ${tmpDir} could not be removed: ${e.message}`); }
    }

    // ---------------------------------------------------------------- installed.json
    if (!dryRun) {
        F.writeInstalled(installedPath, F.mergeInstalled(F.readInstalled(installedPath), written));
        const vendoredRows = F.readVendored(installedPath).length;
        say(`  wrote    ${installedPath}  (${written.length} record(s) merged by path${vendoredRows ? `; ${vendoredRows} vendored row(s) kept` : ''})`);
    } else say(`  would write ${installedPath}  (${written.length} record(s))`);

    // ---------------------------------------------------------------- the Doctor (directly, never the shim)
    say();
    say('doctor');
    const doctor = path.join(kit, 'tools', 'doctor', 'doctor.mjs');
    let doctorCode = null;
    if (dryRun) say(`  would run: node "${doctor}"`);
    else {
        const dr = spawnSync(process.execPath, [doctor], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
        for (const l of `${dr.stdout || ''}${dr.stderr || ''}`.replace(/\n$/, '').split('\n')) say('  ' + l);
        doctorCode = dr.status;
    }

    // ---------------------------------------------------------------- summary
    say();
    say('summary');
    say(`  mode             ${mode}`);
    say(`  ${dryRun ? 'files to write ' : 'files written  '}  ${written.length}${kept.length ? `; kept unchanged (diffs above): ${kept.length}` : ''}`);
    for (const k of kept) say(`                   kept: ${k}`);
    say(`  vendored kit     ${vendorOn ? vendored.map((v) => `${v.dir}${path.sep} (${v.status})`).join('; ') : 'off (-Vendor false)'}`);
    const noHooks = set === 'pc' ? 'the pc permission set alone, no hooks block: the vendor step did not finish' : `no settings written: the ${set} set needs the vendored hooks and the vendor step did not finish`;
    // What is there, never what the render would have been: a file kept without the kit's block says so.
    const rendered = (target) => settingsKept.get(target) || `set ${set}; hooks block from tools/settings.mjs`;
    say(`  settings         ${settingsTarget}  (${scope}; ${!vendorOn ? `set ${set}; no hooks block: vendoring off` : vendorFailed.has(root) ? noHooks : rendered(settingsTarget)})`);
    if (vendorOn && brainSeparate) say(`  brain settings   ${brainSettingsTarget}  (${vendorFailed.has(brain) ? noHooks : rendered(brainSettingsTarget)}; the brain is a separate folder)`);
    say(`  pointer          ${pointerPath}`);
    say(`  brain LAW.md     ${lawStatus}`);
    if (doctorCode != null) {
        const band = { 0: 'GREEN - every claim holds; SURVEY findings above, if any, are reported and not counted', 1: 'RED - a claim is false; read the FAIL lines above', 2: 'COULD-NOT-LOOK - something could not be checked; that is NOT a pass' }[doctorCode] || `exit ${doctorCode}`;
        say(`  Doctor exit      ${doctorCode}  ${band}`);
    } else say('  Doctor           not run (dry run)');
    if (frozenCfg.length > 0) {
        say();
        say(`  Paste by hand into ${path.join(os.homedir(), '.claude', 'settings.json')} under autoMode.soft_deny (this script never writes that file):`);
        for (const fp of frozenCfg) say(`    "Writes, edits, or deletions under ${fp.replace('${ROOT}', root)} - a frozen reference copy; confirm with ${ownerName} before modifying it",`);
    }
    say();
    say('  next');
    let step = 0;
    // A vendor step that did not finish: its fix-up comes first, and no step promises that the entry path
    // prints, since until the fix-up is done that target's settings file registers no hook of the kit.
    // A file kept there with a hooks key of its own (M27): the step says, before its commands, that the render replaces it.
    for (const [t] of vendorFailed) {
        const out = t === root ? settingsTarget : brainSettingsTarget;
        const words = ownHooksNote(out, t === root ? settingsText : brainSettingsText, out);
        say(`    ${++step}. Fix the vendor ERROR above for ${t}, then vendor it and render its hooks block by hand${words ? ` (${words})` : ''}: node "${vendorTool}" -Target "${t}" -Kit "${kit}" -Record "${installedPath}"; then node "${settingsTool}" ${(t === root ? settingsArgs : brainSettingsArgs).join(' ')} -Out "${out}"`);
    }
    // A settings file kept for a hooks key of its own (review finding 3): its merge command, which replaces that
    // key, so the owner's own hooks go to another settings file first. Until it is run the kit's block is not
    // merged into that file, so for the root's file no step promises that the entry path prints.
    for (const k of keptOwnHooks) say(`    ${++step}. Merge the kit's hooks block into ${k.target}: ${ownHooksWords('it')}, then run: ${k.command}`);
    if (vendorFailed.size > 0 || keptOwnHooks.some((k) => k.target === settingsTarget)) say(`    ${++step}. Then start a new Claude Code session under ${root}.`);
    else say(`    ${++step}. Start a new Claude Code session under ${root}; the entry path prints on turn one.`);
    say(`    ${++step}. Fill ${path.join(brain, 'me.md')} and voice.md; regenerate LAW.md after any overlay edit.`);
    if (rootIsRepo && vendorOn && !vendorFailed.has(root)) {
        // The personal scope (review finding 5): .claude/settings.local.json stays personal, so the step names the
        // vendored kit alone, and the line under it says what that means for a clone of the root.
        if (scope === 'personal') {
            say(`    ${++step}. Commit the vendored kit in the root by path (the owner commits): git -C "${root}" add .claude/kit`);
            // A shared file already there with a hooks key of its own (the review of finding 5): the render replaces that
            // whole key, so the line says so before the command, in the words every printed render command uses (M27).
            const shared = path.join(root, '.claude', 'settings.json');
            const sharedOwn = ownHooksNote(shared, settingsText, 'the one there');
            const renderIt = sharedOwn ? `${sharedOwn}, then render the block into it and commit it` : 'render it, then commit it';
            say(`       The settings stay personal and uncommitted (.claude/${path.basename(settingsTarget)}), so a clone of the root registers no hook of the kit until a shared .claude/settings.json carries the block; ${renderIt}: node "${settingsTool}" ${settingsArgs.join(' ')} -Out "${shared}"`);
        } else say(`    ${++step}. Commit the vendored kit and the settings in the root by path (the owner commits): git -C "${root}" add .claude/kit .claude/${path.basename(settingsTarget)}`);
    }
    if (opts.BrainIsRepo) say(`    ${++step}. Commit the brain: git -C "${brain}" add -A; git -C "${brain}" commit -m "adopt design-first"`);
    say();
    // A vendor step that did not finish is adopt not finishing (exit 1); the Doctor's own code stays in
    // the summary above, never adopted as this exit code.
    if (vendorFailed.size > 0) {
        say(`adopt: ERROR the vendor step did not finish for ${[...vendorFailed.keys()].join(' and ')}: no hooks block was written there, so adopt did not finish (exit 1). The Doctor's own exit code is in the summary.`);
        say();
        process.exitCode = 1;
    } else process.exitCode = 0;
} catch (e) {
    say();
    if (e && e.couldNotLook) {
        // Could not look (exit 2): an input adopt needs cannot be used, and nothing was written.
        say(`adopt: could not look: ${e.message}`);
        process.exitCode = 2;
    } else {
        say(`adopt: ERROR ${e.message}`);
        const at = (String(e.stack || '').split('\n').find((l) => /\.mjs:\d+/.test(l)) || '').trim();
        if (at) say(`       ${at}`);
        process.exitCode = 1;
    }
}
