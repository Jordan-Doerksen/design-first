// selftest-law.mjs - the law build and the docs build, run on planted inputs (CR-2026-10-15-GAPS
// review). Imported by selftest.mjs and run at the end of its run, with its helpers. Both builds find
// the kit from their own location, so each case runs the kit's real scripts from a scratch copy under
// the sandbox, next to planted inputs.
//
// Three results that were wrong, each with a case that fails when its fix is reverted:
//   1. The LAW.md legend said ADVISE "injects context and the call proceeds". The Stop hook is ADVISE
//      too, and it holds the first stop of a turn once, with its card (D4). The legend now says a
//      hook adds context or asks once, and the call or the turn proceeds.
//   2. A clause could name a hook script that hooks/hooks.json does not register, and LAW.md printed
//      HOOK or ADVISE over a script that never runs. validate.mjs now fails that clause. It compares
//      the path under hooks/, not the file name: hooks/lib/reg.mjs is not hooks/reg.mjs, and a
//      script registered in a subfolder of hooks/ is found.
//   3. The docs build threw "unknown grade" on a DENY clause, so KIT-DOCS-01 would have gone
//      COULD-NOT-LOOK on the first one. It now accepts DENY and counts it as stopped (D6), and
//      page.css gives the DENY chip a background; without one the chip is white on the page.

import fs from 'node:fs';
import path from 'node:path';

export function lawRuns(t) {
    const { T, kitRoot, ok, bad, has, hasNot, exitIs, W, WJ, newDir, jp, run, say } = t;
    const node = (script, args) => run(process.execPath, [script, ...args], process.env);
    const copy = (fromRoot, rel, toRoot) => { const to = jp(toRoot, rel); newDir(path.dirname(to)); fs.copyFileSync(jp(fromRoot, rel), to); };
    const clause = (id, grade, ref, verb) => ({ id, group: 'TST', verb, rule: 'A planted rule for the law self-test.',
        owner: 'kit:instructions/test-law.md', grade, since: '2026-10-15', enforcedBy: { kind: 'hook', ref } });

    // ================================================================ run L: the law build
    say('  Run L: the law build on planted clauses', 36);

    // A scratch kit: the three law scripts (and the two kit files they import), five hook scripts with
    // one anchor each, and a hooks.json that registers three of them: one in the command form, one in
    // the args form, one in a subfolder. hooks/lib/reg.mjs has the file name of a registered script and
    // is registered nowhere.
    const lk = newDir(path.join(T, 'lawkit'));
    for (const rel of ['tools/law/build-law.mjs', 'tools/law/validate.mjs', 'tools/law/render.mjs', 'tools/lib/args.mjs', 'hooks/lib/json.mjs']) copy(kitRoot, rel, lk);
    W(jp(lk, 'hooks', 'reg.mjs'), '// anchor: t-reg  mode: deny  verbs: test-reg\n');
    W(jp(lk, 'hooks', 'argsreg.mjs'), '// anchor: t-args  mode: advise  verbs: test-args\n');
    W(jp(lk, 'hooks', 'unreg.mjs'), '// anchor: t-unreg  mode: deny  verbs: test-unreg\n');
    W(jp(lk, 'hooks', 'lib', 'reg.mjs'), '// anchor: t-lib  mode: deny  verbs: test-lib\n');
    W(jp(lk, 'hooks', 'sub', 'deep.mjs'), '// anchor: t-deep  mode: deny  verbs: test-deep\n');
    W(jp(lk, 'hooks', 'hooks.json'), `{ "hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/reg.mjs\\"" } ] }
  ],
  "Stop": [
    { "hooks": [ { "type": "command", "args": ["node", "\${CLAUDE_PLUGIN_ROOT}/hooks/argsreg.mjs"] } ] }
  ],
  "SessionStart": [
    { "hooks": [ { "type": "command", "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/sub/deep.mjs\\"" } ] }
  ] } }
`);
    W(jp(lk, 'instructions', 'test-law.md'), '# Test law\n\n### TST-01\n\nRegistered, command form.\n\n### TST-02\n\nRegistered, args form.\n\n### TST-03\n\nNot registered.\n\n### TST-04\n\nA lib file with a registered file name.\n\n### TST-05\n\nRegistered in a subfolder.\n');
    const lkOk = [clause('TST-01', 'HOOK', 'hooks/reg.mjs#t-reg', 'test-reg'), clause('TST-02', 'ADVISE', 'hooks/argsreg.mjs#t-args', 'test-args'), clause('TST-05', 'HOOK', 'hooks/sub/deep.mjs#t-deep', 'test-deep')];
    WJ(path.join(lk, 'law-ok.json'), { schema: 1, groups: { TST: 'Test' }, clauses: lkOk });
    WJ(path.join(lk, 'law-unreg.json'), { schema: 1, groups: { TST: 'Test' }, clauses: [...lkOk, clause('TST-03', 'HOOK', 'hooks/unreg.mjs#t-unreg', 'test-unreg')] });
    WJ(path.join(lk, 'law-lib.json'), { schema: 1, groups: { TST: 'Test' }, clauses: [...lkOk, clause('TST-04', 'HOOK', 'hooks/lib/reg.mjs#t-lib', 'test-lib')] });
    const lkBuild = jp(lk, 'tools', 'law', 'build-law.mjs');

    // L1 and L2: every clause on a registered script builds, and the legend says what ADVISE does.
    const lkOut = path.join(T, 'law-ok.md');
    let r = node(lkBuild, ['-Source', path.join(lk, 'law-ok.json'), '-Out', lkOut]);
    exitIs('L: clauses on registered hook scripts (command and args forms, a subfolder) build', r.code, 0);
    const lkText = fs.existsSync(lkOut) ? fs.readFileSync(lkOut, 'utf8') : '';
    has('L: a clause on a registered hook keeps its grade', lkText, '| TST-02 | ADVISE |');
    has('L: a clause on a script registered in a subfolder of hooks keeps its grade', lkText, '| TST-05 | HOOK |');
    has('L: the ADVISE legend covers the Stop card: a hook adds context or asks once, the call or the turn proceeds', lkText, '- **ADVISE** a hook adds context or asks once; the call or the turn proceeds');
    hasNot('L: the legend no longer says only that the call proceeds', lkText, 'injects context and the call proceeds');

    // L3: a clause on a script hooks.json does not register fails the build, and nothing is written.
    const lkBad = path.join(T, 'law-unreg.md');
    r = node(lkBuild, ['-Source', path.join(lk, 'law-unreg.json'), '-Out', lkBad]);
    exitIs('L: a clause on an unregistered hook script fails the build', r.code, 1);
    has('L: the failure names the clause and the script', r.out, "FAIL TST-03: hook script 'unreg.mjs' is not registered in hooks/hooks.json");
    hasNot('L: the registered clauses are not failed with it', r.out, 'FAIL TST-01');
    if (!fs.existsSync(lkBad)) ok('L: a failed build writes no LAW.md'); else bad('L: a failed build writes no LAW.md', `found ${lkBad}`);

    // L3b: the registry is read by path under hooks, not by file name: a lib file named like a
    // registered script is not registered.
    r = node(lkBuild, ['-Source', path.join(lk, 'law-lib.json'), '-Out', path.join(T, 'law-lib.md')]);
    exitIs('L: a clause on a lib file with a registered file name fails the build', r.code, 1);
    has('L: the failure names the lib path', r.out, "FAIL TST-04: hook script 'lib/reg.mjs' is not registered in hooks/hooks.json");

    // L4: with no hooks.json, nothing shows that any hook is registered: a fail, not a pass.
    fs.rmSync(jp(lk, 'hooks', 'hooks.json'), { force: true });
    r = node(lkBuild, ['-Source', path.join(lk, 'law-ok.json'), '-Out', path.join(T, 'law-nohooks.md')]);
    exitIs('L: no hooks.json fails a hook clause instead of passing it', r.code, 1);
    has('L: the failure says hooks.json is missing', r.out, 'hooks/hooks.json does not exist');

    // ================================================================ run M: the docs build accepts DENY
    say('  Run M: the docs build with a planted DENY clause', 36);
    // A scratch kit with every input docs/build.mjs reads, and the kit's law.json with one clause that
    // no machine stops (not DENY, HOOK or GATE) re-graded DENY, so a DENY that is not counted as stopped
    // shows as a count one short.
    const dk = newDir(path.join(T, 'docskit'));
    for (const rel of ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'tools/doctor/claims.json', 'README.md', 'ARCHITECTURE.md', 'LOOPS.md', 'agents/reviewer.md', 'LICENSE', 'docs/build.mjs', 'tools/lib/args.mjs', 'hooks/lib/json.mjs']) copy(kitRoot, rel, dk);
    for (const [dir, rx] of [['hooks', /\.mjs$/], ['commands', /\.md$/], ['docs/src', /./]]) {
        const from = jp(kitRoot, dir); const to = newDir(jp(dk, dir));
        for (const f of fs.readdirSync(from, { withFileTypes: true })) if (f.isFile() && rx.test(f.name)) fs.copyFileSync(path.join(from, f.name), path.join(to, f.name));
    }
    const dLaw = JSON.parse(fs.readFileSync(path.join(kitRoot, 'law.json'), 'utf8'));
    const stops = ['DENY', 'HOOK', 'GATE'];
    const dPick = dLaw.clauses.find((c) => !stops.includes(c.grade));
    dPick.grade = 'DENY';
    dPick.enforcedBy = { kind: 'permission-rule', ref: 'templates/root-settings.json#permissions.deny' };
    WJ(path.join(dk, 'law.json'), dLaw);
    const dDeny = dLaw.clauses.filter((c) => c.grade === 'DENY').length;
    const dStopped = dLaw.clauses.filter((c) => stops.includes(c.grade)).length;
    const dOut = path.join(T, 'docs-deny.html');
    r = node(jp(dk, 'docs', 'build.mjs'), ['-Out', dOut]);
    exitIs(`M: the docs build accepts a DENY clause (${dDeny} planted on ${dPick.id})`, r.code, 0);
    has('M: a DENY clause counts as stopped by a machine', r.out, `(${dLaw.clauses.length} clauses, ${dStopped} stopped by a machine`);
    const dHtml = fs.existsSync(dOut) ? fs.readFileSync(dOut, 'utf8') : '';
    has('M: the page counts DENY with the other grades', dHtml, `<span class="g g-deny">DENY</span><b>${dDeny}</b>`);
    // A grade chip is white text on its grade's background. With no rule in page.css for its class, a
    // chip is white on the page and cannot be read: g-deny had none.
    const dCss = fs.readFileSync(jp(kitRoot, 'docs', 'page.css'), 'utf8');
    const dChips = [...new Set([...dHtml.matchAll(/class="g (g-[a-z]+)"/g)].map((m) => m[1]))].sort();
    const dBare = dChips.filter((cl) => !new RegExp('\\.' + cl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*background', 'i').test(dCss));
    if (dChips.includes('g-deny') && dBare.length === 0) ok(`M: every grade chip on the page has a background in page.css (${dChips.join(', ')})`);
    else bad('M: every grade chip on the page has a background in page.css', `no background rule for: ${dBare.join(', ')} (chips: ${dChips.join(', ')})`);
}
