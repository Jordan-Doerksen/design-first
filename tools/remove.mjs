// remove.mjs - reverses what adopt.mjs wrote, and nothing else. Called by commands/remove.md.
//
//   node tools/remove.mjs [-DryRun]
//
// Reads the pointer, then <brain>/state/installed.json (SPEC 5.6, findings 58, 77):
//   - a recorded file whose sha256 (over CRLF->LF bytes) still matches  -> deleted (kit-authored, unedited)
//   - a recorded file with generated: true                            -> deleted regardless (regenerable)
//   - a recorded file whose hash no longer matches                    -> KEPT and listed (the owner edited it)
//   - a file that is not in the record                                -> never looked at
// Then deletes the pointer, the once-per-session markers (<os temp>/design-first) and <brain>/state,
// and prints the `claude plugin uninstall` line. It never touches the user-level settings.json.
// -DryRun prints every decision and deletes nothing.
// Test seams: DF_POINTER_PATH, DF_MARKER_DIR.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib/args.mjs';
import * as F from './lib/df-files.mjs';

const say = (s = '') => process.stdout.write(s + '\n');

try {
    const opts = parseArgs(process.argv.slice(2), { switches: ['DryRun'] });
    const dryRun = opts.DryRun;
    const verb = dryRun ? 'would delete' : 'deleted';
    const rm = (p) => { if (!dryRun) fs.rmSync(p, { recursive: true, force: true }); };
    const pointerPath = F.pointerFile();
    const markerDir = F.markerFolder();
    say();
    say(`design-first remove${dryRun ? '  [DRY RUN: nothing is deleted]' : ''}`);
    say(`  pointer   ${pointerPath}`);

    let brain = null;
    if (fs.existsSync(pointerPath)) {
        try { const p = F.readJson(pointerPath); if (p.brain) brain = F.fullPath(String(p.brain)); }
        catch (e) { say(`  WARNING   pointer could not be parsed (${e.message}); no record to read`); }
    } else say('  (no pointer: nothing was adopted on this profile, or it was removed already)');

    let deleted = 0; let gone = 0; const keptList = [];
    if (brain) {
        say(`  brain     ${brain}`);
        const installedPath = path.join(brain, 'state', 'installed.json');
        if (!fs.existsSync(installedPath)) say(`  (no ${installedPath}: nothing recorded, so no file is deleted)`);
        else {
            say();
            say('recorded files');
            for (const rec of F.readInstalled(installedPath)) {
                const p = rec.path;
                if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { say(`  gone      ${p}`); gone++; continue; }
                if (rec.generated) { say(`  ${verb}   ${p}  (generated: regenerable)`); rm(p); deleted++; continue; }
                if (F.fileSha256(p) === rec.sha256) { say(`  ${verb}   ${p}  (unchanged since adopt)`); rm(p); deleted++; continue; }
                say(`  KEPT      ${p}  (edited since adopt; yours)`);
                keptList.push(p);
            }
            // Folders adopt created that are now empty. Only these two; anything else is not ours to judge.
            for (const d of ['entry-point', 'instructions']) {
                const dir = path.join(brain, d);
                if (fs.existsSync(dir) && fs.statSync(dir).isDirectory() && !dryRun && fs.readdirSync(dir).length === 0) {
                    fs.rmdirSync(dir); say(`  removed   ${dir}  (empty folder)`);
                }
            }
        }
        const stateDir = path.join(brain, 'state');
        if (fs.existsSync(stateDir)) { say(`  ${verb}   ${stateDir}${path.sep}  (generated state)`); rm(stateDir); }
    }

    if (fs.existsSync(markerDir)) { say(`  ${verb}   ${markerDir}${path.sep}  (session markers)`); rm(markerDir); }
    if (fs.existsSync(pointerPath)) { say(`  ${verb}   ${pointerPath}  (pointer)`); rm(pointerPath); }

    say();
    say('summary');
    say(`  deleted   ${deleted} recorded file(s); ${gone} already gone`);
    if (keptList.length > 0) {
        say(`  kept      ${keptList.length} file(s) you edited since adopt - delete them yourself if you want them gone:`);
        for (const k of keptList) say(`              ${k}`);
    } else say('  kept      nothing: no recorded file had been edited');
    say('  untouched user-level settings.json (this script never writes or deletes it; remove any soft_deny lines you pasted by hand)');
    say();
    say('  Finish with:');
    say('    claude plugin uninstall design-first');
    say();
    process.exitCode = 0;
} catch (e) {
    say();
    say(`remove: ERROR ${e.message}`);
    process.exitCode = 1;
}
