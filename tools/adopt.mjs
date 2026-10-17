// adopt.mjs - writes a design-first root + brain from templates and the answers the adopter gave.
// Called by commands/adopt.md (the command ASKS, this script WRITES: SPEC C2, DECISIONS 3.11).
//
//   node tools/adopt.mjs -Root <dir> [-Brain <dir>] -OwnerName <name>
//        [-GitHubOwners a,b] [-BrainIsRepo] [-FrozenPaths p,q] [-SettingsScope shared|personal]
//        [-PluginRoot <dir>] [-DryRun]
//
// Modes (SPEC 5.6, finding 37):
//   fresh   the brain folder has none of the kit files        -> every file is written
//   attach  the brain folder already has at least one of them -> ONLY missing files are written;
//           for each existing file a unified diff is printed and nothing is changed
// It never overwrites. It never reads any brain but the one it is writing. It never writes the
// user-level settings.json: the soft_deny lines for frozen paths are PRINTED to paste (finding 56).
//
// Everything written is recorded in <brain>/state/installed.json as { path, sha256, generated }
// (sha over CRLF->LF bytes; merged by path with any earlier record) so remove.mjs can reverse
// exactly this and nothing else. Then: pointer, brain LAW.md via the generator, the Doctor, summary.
// The generator reads <brain>/state/law-installed.json: every hook hooks.json registers, root
// settings, pointer. It stays there, so the shipped claim BRAIN-LAW-01 repeats the same build.
// -DryRun prints every step and writes nothing under root, brain or the profile.
//
// Exit 0 = adopt finished (the Doctor's own exit code is printed in the summary, never adopted:
// a SURVEY finding is not an adopt failure). Exit 1 = adopt itself could not finish.
// Test seams: DF_POINTER_PATH (pointer location), DF_MARKER_DIR; nothing else.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import * as F from './lib/df-files.mjs';
import { newPlan, toConfigPath, registeredHooks } from './lib/adopt-plan.mjs';

const KIT_FROM_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (s = '') => process.stdout.write(s + '\n');

try {
    const opts = parseArgs(process.argv.slice(2), {
        values: ['Root', 'Brain', 'OwnerName', 'SettingsScope', 'PluginRoot'],
        switches: ['BrainIsRepo', 'DryRun'],
        lists: ['GitHubOwners', 'FrozenPaths'],
    });
    if (!opts.Root) throw new Error('-Root is required');
    if (opts.OwnerName == null) throw new Error('-OwnerName is required');
    const scope = (opts.SettingsScope || 'shared').toLowerCase();
    if (scope !== 'shared' && scope !== 'personal') throw new Error(`-SettingsScope must be shared or personal, got '${opts.SettingsScope}'`);
    const dryRun = opts.DryRun;
    const verb = dryRun ? 'would write' : 'wrote';

    // ---------------------------------------------------------------- answers -> facts
    const kit = F.fullPath(opts.PluginRoot || KIT_FROM_HERE);
    for (const need of ['templates/root-CLAUDE.md', 'templates/root-settings.json', 'law.json', 'tools/law/build-law.mjs', 'tools/doctor/doctor.mjs', 'hooks/hooks.json']) {
        if (!fs.existsSync(path.join(kit, need))) throw new Error(`not a design-first kit (missing ${need}): ${kit}`);
    }
    if (!fs.existsSync(opts.Root) || !fs.statSync(opts.Root).isDirectory()) throw new Error(`root folder does not exist: ${path.resolve(opts.Root)}`);
    const root = F.fullPath(opts.Root);
    const brain = opts.Brain ? F.fullPath(opts.Brain) : path.join(root, 'brain');
    const ownerName = opts.OwnerName.trim();
    if (!ownerName) throw new Error('owner name is empty');
    const gitHubOwners = opts.GitHubOwners;
    const frozenCfg = opts.FrozenPaths.map((p) => toConfigPath(p, root)).filter((x) => x);

    const rootIsRepo = F.isGitWorkTree(root);
    const kind = F.pluginKind(kit);
    const settingsTarget = path.join(root, '.claude', scope === 'personal' ? 'settings.local.json' : 'settings.json');
    const pointerPath = F.pointerFile();

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
    say(`  settings    ${settingsTarget}  (${scope})`);
    say(`  kit         ${kit}  (${kind})`);
    say(`  pointer     ${pointerPath}`);
    say();

    // ---------------------------------------------------------------- plan -> write missing, diff existing
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const plan = newPlan({ kit, root, brain, ownerName, gitHubOwners, frozenPaths: frozenCfg, settingsTarget, snapshotPairs, brainIsRepo: opts.BrainIsRepo, today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` });
    const written = [];
    const kept = [];
    let settingsWritten = false;

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
        const res = place(item.path, item.bytes, item.generated, item.note);
        if (item.path === settingsTarget && res !== 'kept') settingsWritten = true;
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
    const stateDir = path.join(brain, 'state');
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
    const tmpDir = path.join(os.tmpdir(), 'design-first-adopt');
    fs.mkdirSync(tmpDir, { recursive: true });
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
    let lawStatus = 'not generated';
    if (lr.status !== 0) {
        say(`  ERROR    build-law exited ${lr.status}; LAW.md not written:`);
        for (const l of `${lr.stdout || ''}${lr.stderr || ''}`.split(/\r?\n/).filter((x) => x)) say(`           ${l}`);
    } else {
        const res = place(path.join(brain, 'LAW.md'), fs.readFileSync(tmpLaw), true, 'generated from kit law.json + overlay + installed state');
        lawStatus = res === 'written' ? verb : res === 'same' ? 'already current' : 'exists and differs: kept; regenerate it after migrating it to the overlay (build-law.mjs)';
    }
    try { fs.rmSync(tmpLaw, { force: true }); } catch { /* best effort */ }
    if (dryRun) { try { fs.rmSync(tmpState, { force: true }); } catch { /* best effort */ } }

    // ---------------------------------------------------------------- installed.json
    const installedPath = path.join(stateDir, 'installed.json');
    if (!dryRun) {
        F.writeInstalled(installedPath, F.mergeInstalled(F.readInstalled(installedPath), written));
        say(`  wrote    ${installedPath}  (${written.length} record(s) merged by path)`);
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
    say(`    1. Start a new Claude Code session under ${root}; the entry path prints on turn one.`);
    say(`    2. Fill ${path.join(brain, 'me.md')} and voice.md; regenerate LAW.md after any overlay edit.`);
    if (opts.BrainIsRepo) say(`    3. Commit the brain: git -C "${brain}" add -A; git -C "${brain}" commit -m "adopt design-first"`);
    say();
    process.exitCode = 0;
} catch (e) {
    say();
    say(`adopt: ERROR ${e.message}`);
    const at = (String(e.stack || '').split('\n').find((l) => /\.mjs:\d+/.test(l)) || '').trim();
    if (at) say(`       ${at}`);
    process.exitCode = 1;
}
