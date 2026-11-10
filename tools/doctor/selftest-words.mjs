// selftest-words.mjs - a tree_free_of word written in letter codes (the owner's ruling of 2026-11-01).
// Imported by selftest.mjs and run at the end of its run, with its helpers. It is its own file because
// its subject is the leak claim as the kit ships it, not the claim type: the word is planted against
// that claim, so a dropped entry or a wrong code fails here.
//
// The word is built from codes at run time. Neither this file nor its output spells it, so the checks
// below use ok and bad, because has and hasNot print their needle.

import fs from 'node:fs';
import path from 'node:path';

export function codedWordRuns(t) {
    const { T, here, ok, bad, W, WJ, run, childEnv, copyDoctorInto, fakeHome, say } = t;

    say('  Run W: a word in letter codes, against the shipped leak claim', 36);
    const word = Buffer.from('6b6f7572746e6579', 'hex').toString('ascii');
    const codes = [...word].map((ch) => `\\x${ch.charCodeAt(0).toString(16)}`).join('');
    const check = (name, good, why) => (good ? ok(name) : bad(name, why));

    const shipped = fs.readFileSync(path.join(here, 'claims.json'), 'utf8');
    check('W: the shipped claims file does not spell the word', !shipped.toLowerCase().includes(word), 'tools/doctor/claims.json spells it');
    check('W: the shipped claims file holds the codes', JSON.parse(shipped).claims.some((c) => (c.words || []).includes(codes)), 'no claim lists the codes');

    // The shipped claim's exclude (review finding 19): .claude/kit, the kit's own vendored copy, repeats this claims file
    // and its word list, and .claude/worktrees holds other checkouts of the tree. Without both names the kit Doctor is RED
    // the moment its vendored copy is committed, while every suite stays green. Read from the shipped file, never typed.
    const EXCLUDED = ['.claude/kit', '.claude/worktrees'];
    const norm = (x) => String(x).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
    const leakOf = (doc) => (doc.claims || []).find((c) => c.id === 'KIT-LEAK-01');
    const lacks = (claim) => { const ex = (claim && Array.isArray(claim.exclude) ? claim.exclude : []).map(norm); return EXCLUDED.filter((x) => !ex.includes(x)); };
    const shippedLacks = lacks(leakOf(JSON.parse(shipped)));
    check('W: the shipped KIT-LEAK-01 excludes .claude/kit and .claude/worktrees (each is this tree again, not a leak)', shippedLacks.length === 0, `the shipped exclude lacks: ${shippedLacks.join(', ')}`);

    // A scratch copy of the Doctor, so -Kit resolves ${KIT} to the copy. The claim is the shipped one;
    // only its root moves, to the folder the word is planted in.
    const kit = path.join(T, 'coded');
    const d = copyDoctorInto(kit);
    const leak = leakOf(JSON.parse(shipped));
    WJ(path.join(d, 'claims.json'), { schema: 1, claims: [{ ...leak, root: '${KIT}/planted' }] });
    const scan = () => {
        const r = run(process.execPath, [path.join(d, 'doctor.mjs'), '-Kit', '-Json'], childEnv(fakeHome, path.join(T, 'no-pointer-here.json')));
        return (JSON.parse(r.out).bands.claims || []).find((x) => x.id === 'KIT-LEAK-01') || { status: 'NO RESULT', detail: '' };
    };

    // Both excluded folders carry the word: the shipped claim skips them (the clean-tree pass and the three hits below
    // count no file under them), and a copy of it with .claude/kit dropped from its exclude is RED on the vendored copy.
    W(path.join(kit, 'planted', '.claude', 'kit', 'tools', 'doctor', 'claims.json'), `{ "words": ["${word}"] }\n`);
    W(path.join(kit, 'planted', '.claude', 'worktrees', 'wt1', 'notes.md'), `written by ${word}\n`);
    W(path.join(kit, 'planted', 'clean.md'), 'nothing to find here\n');
    let c = scan();
    check('W: a clean tree passes the shipped claim (the word under .claude/kit and .claude/worktrees is not read)', c.status === 'PASS', `${c.status}: ${c.detail}`);
    WJ(path.join(d, 'claims.json'), { schema: 1, claims: [{ ...leak, root: '${KIT}/planted', exclude: ((leak && leak.exclude) || []).filter((x) => norm(x) !== '.claude/kit') }] });
    c = scan();
    check('W: red: with .claude/kit dropped from a copy of the shipped exclude, the vendored copy of the word list is a hit', c.status === 'FAIL' && c.detail.includes('.claude/kit/tools/doctor/claims.json'), `${c.status}: ${c.detail.toLowerCase().replaceAll(word, '<the word>')}`);
    WJ(path.join(d, 'claims.json'), { schema: 1, claims: [{ ...leak, root: '${KIT}/planted' }] });

    W(path.join(kit, 'planted', 'lower.md'), `written by ${word}\n`);
    W(path.join(kit, 'planted', 'title.md'), `written by ${word[0].toUpperCase()}${word.slice(1)}\n`);
    W(path.join(kit, 'planted', 'upper.md'), `written by ${word.toUpperCase()}\n`);
    c = scan();
    const safe = c.detail.toLowerCase().replaceAll(word, '<the word>');
    check('W: the word planted in three cases fails the shipped claim', c.status === 'FAIL' && c.detail.includes('3 hit(s)'), `${c.status}: ${safe}`);
    check('W: the report gives the codes', c.detail.includes(codes), safe);
    check('W: the report does not spell the word', !c.detail.toLowerCase().includes(word), safe);
}
