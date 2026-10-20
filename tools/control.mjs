// control.mjs - writes a domain's control card, or the Intake card, from a template; never overwrites.
// Called by commands/control.md (the command ASKS, this script WRITES, as adopt does;
// CR-2026-10-19-CONTROL chunk 1).
//
//   node tools/control.mjs -Domain <word> [-Brain <dir>] [-Session <id>] [-Folders a,b] [-Test "<one sentence>"] [-DryRun]
//   node tools/control.mjs -Intake        [-Brain <dir>] [-Session <id>] [-DryRun]
//
// A domain card goes to <brain>/control/<DOMAIN>-CONTROL.md from templates/CONTROL.md; the Intake
// card to <brain>/control/INTAKE.md from templates/INTAKE.md (-Domain intake is the same card).
// -Brain defaults to the brain the pointer names. The plumbing table is pre-filled with the brain's
// Doctor shim, and with the kit's four checks when the domain is Method, the domain that owns the
// kit. An existing card is kept and the diff between the card this run would write and the one on
// disk is printed, as adopt does: the master's edits are never touched. A fact the call did not
// give (session id, folders, test) is written as not recorded, never invented.
// -DryRun prints the card it would write and writes nothing.
// Nothing is recorded in <brain>/state/installed.json: a card is the master's file from its first
// line, committed by the owner, so /design-first:remove never deletes it.
// Exit 0 = written, same or kept. Exit 1 = the script could not finish.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import * as F from './lib/df-files.mjs';
import { expandTemplate } from './lib/adopt-plan.mjs';

const KIT_FROM_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (s = '') => process.stdout.write(s + '\n');

// The kit's own checks, the ones ARCHITECTURE.md "How to modify a domain" names. They are facts
// about the kit, not an adopter's tunable, so they live here and not in a brain config. Only the
// Method card gets them: Method is the domain that owns the kit.
const KIT_CHECKS = [
    ['Hook self-test', 'node tools/tests/run.mjs', 'n passed, 0 failed'],
    ['Doctor self-test', 'node tools/doctor/selftest.mjs', 'n passed, 0 failed'],
    ['Adopt self-test', 'node tools/tests/adopt-selftest.mjs', 'n passed, 0 failed'],
    ['Kit Doctor', 'node tools/doctor/doctor.mjs -Kit', 'GREEN'],
];
const NOT_RECORDED = {
    session: 'not recorded: the owner reads it from the app and writes it here',
    folders: 'not recorded yet; the master lists the folders here',
    test: 'not recorded yet; the master writes the one sentence here',
};

try {
    const opts = parseArgs(process.argv.slice(2), {
        values: ['Domain', 'Brain', 'Session', 'Test', 'PluginRoot'],
        switches: ['Intake', 'DryRun'],
        lists: ['Folders'],
    });
    const dryRun = opts.DryRun;
    const verb = dryRun ? 'would write' : 'wrote';

    // ---------------------------------------------------------------- the kit and the templates
    const kit = F.fullPath(opts.PluginRoot || KIT_FROM_HERE);
    for (const need of ['templates/CONTROL.md', 'templates/INTAKE.md']) {
        if (!fs.existsSync(path.join(kit, need))) throw new Error(`not a design-first kit (missing ${need}): ${kit}`);
    }

    // ---------------------------------------------------------------- which card
    const intake = opts.Intake || /^intake$/i.test(String(opts.Domain || '').trim());
    if (!intake && !opts.Domain) throw new Error('-Domain <word> or -Intake is required');
    let domain = null;
    if (!intake) {
        const word = String(opts.Domain).trim();
        // One word, one meaning: the same word goes on the section, the title and the card.
        if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(word)) throw new Error(`-Domain is one word (letters, digits, hyphens), got '${opts.Domain}'`);
        domain = word[0].toUpperCase() + word.slice(1);
    }

    // ---------------------------------------------------------------- the brain
    let brain = opts.Brain;
    if (!brain) {
        const ptr = F.pointerFile();
        if (!fs.existsSync(ptr)) throw new Error(`-Brain is required: no pointer at ${ptr}`);
        const j = F.readJson(ptr);
        if (!j || !j.brain) throw new Error(`-Brain is required: the pointer at ${ptr} names no brain`);
        brain = String(j.brain);
    }
    if (!fs.existsSync(brain) || !fs.statSync(brain).isDirectory()) throw new Error(`brain folder does not exist: ${path.resolve(brain)}`);
    brain = F.fullPath(brain);
    const controlDir = path.join(brain, 'control');
    const fileName = intake ? 'INTAKE.md' : `${domain.toUpperCase()}-CONTROL.md`;
    const cardPath = path.join(controlDir, fileName);
    const templatePath = path.join(kit, 'templates', intake ? 'INTAKE.md' : 'CONTROL.md');

    // ---------------------------------------------------------------- answers -> tokens
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const sessionId = String(opts.Session || '').trim() || NOT_RECORDED.session;
    const folders = opts.Folders.length ? opts.Folders.map((f) => `\`${f}\``).join(', ') : NOT_RECORDED.folders;
    // The template ends the sentence; a period typed at the end of the test is dropped so the card
    // never reads "rule..".
    const test = String(opts.Test || '').trim().replace(/\.+$/, '') || NOT_RECORDED.test;
    const shim = path.join(brain, process.platform === 'win32' ? 'Doctor.bat' : 'doctor.sh');
    const plumbing = [`| Disk law | \`${shim}\` | exit 0; 2 is not a pass | |`];
    if (!intake && domain.toLowerCase() === 'method') {
        for (const [check, cmd, pass] of KIT_CHECKS) plumbing.push(`| ${check} | \`${cmd}\` in the kit checkout | ${pass} | |`);
    }
    const tokens = {
        DOMAIN: domain || 'Intake', DOMAIN_UPPER: (domain || 'Intake').toUpperCase(),
        SESSION_ID: sessionId, FOLDERS: folders, TEST: test,
        CARD_PATH: cardPath, CONTROL_DIR: controlDir, INTAKE_CARD: path.join(controlDir, 'INTAKE.md'),
        PLUMBING_ROWS: plumbing.join('\n'), DATE: today,
    };
    const text = expandTemplate(F.readText(templatePath), tokens);
    const bytes = F.textBytes(text, cardPath);

    say();
    say(`design-first control  [${intake ? 'the Intake card' : `the ${domain} card`}${dryRun ? ', DRY RUN: nothing is written' : ''}]`);
    say(`  brain     ${brain}`);
    say(`  card      ${cardPath}`);
    say(`  session   ${sessionId}`);
    if (!intake) {
        say(`  folders   ${folders}`);
        say(`  test      ${test}`);
    }
    say(`  template  ${templatePath}`);
    say();

    // ---------------------------------------------------------------- write missing, diff existing
    // The same rule as adopt: absent -> write; present and identical -> same; present and different
    // -> diff, keep, change nothing.
    say('files');
    let result;
    if (fs.existsSync(cardPath) && fs.statSync(cardPath).isFile()) {
        if (F.fileSha256(cardPath) === F.normalisedSha256(bytes)) { say(`  same     ${cardPath}`); result = 'same'; }
        else {
            say(`  kept     ${cardPath}  (exists and differs; not touched)`);
            for (const l of F.showDiff(cardPath, bytes, cardPath, 'control')) say(l);
            result = 'kept';
        }
    } else {
        say(`  ${verb}    ${cardPath}  - ${intake ? 'the Intake card from templates/INTAKE.md' : `the ${domain} control card from templates/CONTROL.md`}`);
        if (!dryRun) F.writeBytes(cardPath, bytes);
        result = 'written';
    }

    // ---------------------------------------------------------------- the card, printed
    say();
    // A real run prints the card that stands on disk, since the command relays it; a dry run prints
    // the card it would write, which is what a dry run is for, and names the kept one.
    const showDisk = result === 'kept' && !dryRun;
    say(showDisk ? 'card  (on disk, unchanged; the diff above is what this run would have changed)'
        : result === 'kept' ? 'card  (what this run would write; the card on disk differs, see the diff above, and stays as it is)'
            : dryRun ? 'card  (what this run would write)' : 'card');
    const shown = showDisk ? F.readText(cardPath) : text;
    for (const l of shown.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) say('  ' + l);

    // ---------------------------------------------------------------- summary
    say();
    say('summary');
    say(`  card    ${cardPath}  ${result === 'written' ? verb : result}`);
    say();
    say('  next');
    if (dryRun) say('    (dry run: nothing was written, nothing to commit)');
    else {
        const isRepo = fs.existsSync(path.join(brain, '.git'));
        if (result === 'kept') say('    1. The card on disk stands; the master edits it, the owner commits it.');
        else if (isRepo) say(`    1. The owner commits the card by path (a session never commits): git -C "${brain}" add -- "control/${fileName}" && git -C "${brain}" commit -m "Add the ${intake ? 'Intake' : domain} control card"`);
        else say(`    1. The owner commits the card when the brain is a repository; today the brain at ${brain} is not one, so the card has no history yet.`);
        if (intake) say('    2. Intake fills the decisions table and one routing row per domain.');
        else say(`    2. The master fills the roster, one row per ${domain} session, and adds the domain's own plumbing rows.`);
    }
    say();
    process.exitCode = 0;
} catch (e) {
    say();
    say(`control: ERROR ${e.message}`);
    const at = (String(e.stack || '').split('\n').find((l) => /\.mjs:\d+/.test(l)) || '').trim();
    if (at) say(`         ${at}`);
    process.exitCode = 1;
}
