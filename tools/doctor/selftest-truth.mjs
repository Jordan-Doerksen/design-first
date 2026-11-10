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
    const { T, here, kitRoot, ok, bad, has, hasNot, exitIs, W, WJ, jp, run, childEnv, copyDoctorInto, fakeHome, say } = t;

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

    // The kit's own settings file (0.3.0, KIT-03, review finding 20): the checkout's .claude/settings.json, which a cloud
    // session on this checkout loads its hooks from, is the vendored render of hooks/registry.json with the cloud-brain
    // set, and KIT-SETTINGS-01 renders it again (generated_matches with args). The claim is read from the shipped file
    // and run as shipped against a scratch copy of the renderer, the registry, the template, the registered scripts and
    // the committed settings file: it passes there, and a registration typed by hand (the card hook's timeout 10 -> 11)
    // is FAIL. Red first: with no such claim the kit Doctor was GREEN on that edit.
    const KS = "K: the kit's claims hold .claude/settings.json to the registry render (KIT-SETTINGS-01: settings.mjs -Vendored -Set cloud-brain over hooks/registry.json)";
    const ks = kc.claims.find((c) => c.id === 'KIT-SETTINGS-01');
    if (ks && ks.type === 'generated_matches' && ks.generator === 'tools/settings.mjs' && JSON.stringify(ks.args) === JSON.stringify(['-Vendored', '-Set', 'cloud-brain']) && ks.source === 'hooks/registry.json' && ks.output === '.claude/settings.json') ok(KS);
    else bad(KS, ks ? JSON.stringify(ks).slice(0, 300) : 'no KIT-SETTINGS-01 in tools/doctor/claims.json');
    const reg = JSON.parse(fs.readFileSync(path.join(kitRoot, 'hooks', 'registry.json'), 'utf8'));
    const rels = ['tools/settings.mjs', 'hooks/registry.json', 'templates/settings.cloud-brain.json', 'templates/root-settings.json', '.claude/settings.json', ...new Set((reg.hooks || []).map((h) => String(h.script)))];
    const absent = rels.filter((rel) => !fs.existsSync(jp(kitRoot, rel)));
    if (ks && absent.length > 0) bad('K: KIT-SETTINGS-01 as shipped passes on the committed .claude/settings.json', `the kit lacks what the claim renders from: ${absent.join(', ')}`);
    if (ks && absent.length === 0) {
        const sk = path.join(T, 'kit-settings');
        const sd = copyDoctorInto(sk);
        for (const rel of rels) { const to = jp(sk, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(jp(kitRoot, rel), to); }
        WJ(path.join(sd, 'claims.json'), { schema: 1, claims: [ks] });
        const runKs = () => {
            const rk = invoke(sd, ['-Kit', '-Json']);
            try { return (JSON.parse(rk.out).bands.claims || []).find((x) => x.id === 'KIT-SETTINGS-01') || { status: 'NO RESULT', detail: '' }; }
            catch { return { status: 'NOT JSON', detail: rk.out.slice(0, 200) }; }
        };
        let st = runKs();
        if (st.status === 'PASS') ok('K: KIT-SETTINGS-01 as shipped passes on the committed .claude/settings.json'); else bad('K: KIT-SETTINGS-01 as shipped passes on the committed .claude/settings.json', `${st.status}: ${st.detail}`);
        const sp = jp(sk, '.claude', 'settings.json');
        const text = fs.readFileSync(sp, 'utf8');
        const edited = text.replace(/(hooks\/card\.mjs[^\n]*\n\s*"timeout": )10\b/, (m, head) => `${head}11`);
        W(sp, edited);
        st = runKs();
        const KR = 'K: red: a registration typed by hand in .claude/settings.json (the card timeout 10 -> 11) is FAIL on KIT-SETTINGS-01';
        if (edited !== text && st.status === 'FAIL' && st.detail.includes('first difference at byte')) ok(KR);
        else bad(KR, `${edited === text ? 'the edit was not planted; ' : ''}${st.status}: ${st.detail}`);
    }
}
