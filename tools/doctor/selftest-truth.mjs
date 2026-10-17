// selftest-truth.mjs - the Doctor reports what it could not look at (CR-2026-10-15-GAPS D6).
// Imported by selftest.mjs and run at the end of its run, with its helpers. It is its own file
// because its subject is the Doctor's honesty about itself, not a claim type.
//
// Two silent or false results, each with a case that fails when its fix is reverted:
//   1. A crash. Before D6 an exception outside every try in the Doctor exited 1, and the shim
//      prints exit 1 as "RED - findings above" with no finding above it. The handler makes it exit 2.
//   2. A registered hook the kit's claims never start. Before D6 the ask hook (OWN-04, GATE-01) had
//      no hook_smoke claim, so a question hook that could not start left `-Kit` GREEN. The case reads
//      both files, so a hook registered later with no claim fails here too.

import fs from 'node:fs';
import path from 'node:path';

export function truthRuns(t) {
    const { T, here, kitRoot, ok, bad, has, hasNot, exitIs, W, WJ, run, childEnv, copyDoctorInto, fakeHome, say } = t;

    // A scratch copy of the Doctor under <T>/<name>/tools/doctor, so -Kit resolves the kit to the
    // copy and nothing planted here can reach the real Doctor or the sandbox kit.
    const crashDoctor = (name) => {
        const d = copyDoctorInto(path.join(T, name));
        WJ(path.join(d, 'claims.json'), { schema: 1, claims: [] });
        return d;
    };
    const invoke = (dir, args) => run(process.execPath, [path.join(dir, 'doctor.mjs'), ...args], childEnv(fakeHome, path.join(T, 'no-pointer-here.json')));

    // ================================================================ run X: the Doctor crashes
    say('  Run X: a Doctor that crashes is could-not-look, never RED', 36);

    // X1: a file the Doctor imports throws while it loads. Its exports stay, so the import links and
    // the throw happens as the module runs, on line 1.
    const x1 = crashDoctor('crash-load');
    const snapPath = path.join(x1, 'claims-snapshot.mjs');
    W(snapPath, "throw new Error('planted: an imported file throws');\n" + fs.readFileSync(snapPath, 'utf8'));
    let r = invoke(x1, ['-Kit']);
    exitIs('X: a crash while the Doctor loads its own files is could-not-look', r.code, 2);
    has('X: the crash line names the reason, the file and the line', r.out, 'COULD-NOT-LOOK: the Doctor stopped: planted: an imported file throws at claims-snapshot.mjs:1');
    has('X: the crash says it is not a pass', r.out, 'This is not a pass. Exit 2.');
    hasNot('X: a crash prints no verdict line', r.out, 'VERDICT:');

    // X2: a step outside every try throws in the middle of the run, under -Json.
    const x2 = crashDoctor('crash-verdict');
    const reportPath = path.join(x2, 'report.mjs');
    const report = fs.readFileSync(reportPath, 'utf8');
    if (!/export function getVerdict\(/.test(report)) bad('X: the verdict step can be planted', 'report.mjs has no getVerdict export');
    W(reportPath, report.replace(/export function getVerdict\(/, "export function getVerdict() { throw new Error('planted: the verdict step throws'); }\nfunction getVerdictReplaced("));
    r = invoke(x2, ['-Kit', '-Json']);
    exitIs('X: a crash in the verdict step is could-not-look, not RED', r.code, 2);
    try {
        const xj = JSON.parse(r.out);
        if (xj.verdict === 'COULD-NOT-LOOK' && xj.exitCode === 2 && xj.mode === 'kit') ok('X: under -Json a crash is one JSON document with verdict COULD-NOT-LOOK'); else bad('X: -Json crash document', JSON.stringify(xj));
        if (/^the Doctor stopped: planted: the verdict step throws at report\.mjs:\d+/.test(String(xj.reason))) ok('X: the -Json reason names the step and the file'); else bad('X: -Json crash reason', String(xj.reason));
    } catch { bad('X: under -Json a crash is one JSON document', 'not JSON: ' + r.out); }

    // ================================================================ run K: every registered hook is smoked by the kit's claims
    say("  Run K: the kit smokes every hook it registers", 36);
    const hj = JSON.parse(fs.readFileSync(path.join(kitRoot, 'hooks', 'hooks.json'), 'utf8'));
    const registered = [];
    for (const [ev, entries] of Object.entries(hj.hooks)) {
        for (const entry of [].concat(entries)) {
            for (const h of [].concat(entry.hooks || [])) {
                const text = Array.isArray(h.args) && h.args.length ? h.args.join(' ') : String(h.command ?? '');
                for (const m of text.matchAll(/hooks[\\/]+([A-Za-z0-9_-]+)\.mjs/g)) {
                    const pair = `${m[1]}/${ev}`;
                    if (!registered.includes(pair)) registered.push(pair);
                }
            }
        }
    }
    const kc = JSON.parse(fs.readFileSync(path.join(here, 'claims.json'), 'utf8'));
    const smoked = kc.claims.filter((c) => c.type === 'hook_smoke').map((c) => `${c.hook}/${c.event}`);
    const unsmoked = registered.filter((p) => !smoked.includes(p));
    if (registered.length > 0 && unsmoked.length === 0) ok(`K: every hook hooks.json registers has a hook_smoke claim in the kit's claims (${registered.length} hook/event pairs)`);
    else bad("K: every hook hooks.json registers has a hook_smoke claim in the kit's claims", `registered with no hook_smoke claim: ${registered.length === 0 ? 'no registration read from hooks.json' : unsmoked.join(', ')}`);
}
