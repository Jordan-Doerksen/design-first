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
//      With no hooks.json beside the law (a vendored copy, 0.3.0), hooks/registry.json is the record:
//      a registry row for the script keeps the grade, a missing row fails, neither file names both;
//      beside .claude-plugin/plugin.json (a checkout or plugin install) the registry never stands in.
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
    has('L: with no registry.json either, the failure names hooks/registry.json too (the record a vendored copy carries)', r.out, 'hooks/registry.json does not exist');

    // L4b (0.3.0, registry-readers): a vendored copy carries hooks/registry.json and never
    // hooks/hooks.json (tools/vendor.json leaves the plugin form out), so with no hooks.json beside
    // the law the registry is the record of what is registered: one row per registration, field
    // script, read by path under hooks/ as hooks.json is. The scratch registry lists the same three
    // scripts the deleted hooks.json registered, in the registry's own shape.
    const lkRegistry = jp(lk, 'hooks', 'registry.json');
    const regRow = (id, script) => ({ id, event: 'PreToolUse', matcher: 'Bash', script, timeout: 10, host: ['any'], mode: 'deny', vendor: true });
    const lkRows = [regRow('reg', 'hooks/reg.mjs'), regRow('argsreg', 'hooks/argsreg.mjs'), regRow('deep', 'hooks/sub/deep.mjs')];
    WJ(lkRegistry, { schema: 1, hooks: lkRows });
    const lkRegOut = path.join(T, 'law-registry.md');
    r = node(lkBuild, ['-Source', path.join(lk, 'law-ok.json'), '-Out', lkRegOut]);
    exitIs('L: with no hooks.json, a registry.json that lists the scripts lets the hook clauses build', r.code, 0);
    const lkRegText = fs.existsSync(lkRegOut) ? fs.readFileSync(lkRegOut, 'utf8') : '';
    has('L: a clause on a registry-listed script keeps its HOOK grade', lkRegText, '| TST-01 | HOOK |');
    has('L: a clause on a registry-listed advise hook keeps ADVISE', lkRegText, '| TST-02 | ADVISE |');
    has('L: a registry row naming a script in a subfolder of hooks keeps that grade too', lkRegText, '| TST-05 | HOOK |');
    // A checkout or a plugin install carries .claude-plugin/plugin.json beside the law and registers
    // through hooks.json; there the registry never stands in, or a deleted hooks.json would print HOOK
    // for a kit that registers nothing (the CR-2026-10-15-GAPS silence again, in the plugin form).
    const lkPluginJson = jp(lk, '.claude-plugin', 'plugin.json');
    WJ(lkPluginJson, { name: 'scratch', version: '0.0.0' });
    r = node(lkBuild, ['-Source', path.join(lk, 'law-ok.json'), '-Out', path.join(T, 'law-registry-checkout.md')]);
    exitIs('L: beside .claude-plugin/plugin.json (a checkout) the registry does not stand in for a missing hooks.json', r.code, 1);
    has('L: that failure names the missing hooks.json', r.out, 'FAIL TST-01: hooks/hooks.json does not exist');
    has('L: and says why the registry does not stand in there', r.out, 'beside .claude-plugin/plugin.json the registry does not stand in for it');
    fs.rmSync(lkPluginJson, { force: true });
    // A script the registry does not list is not registered: the failure names the registry and says
    // why it is the record; a row for that script makes the same clause build.
    r = node(lkBuild, ['-Source', path.join(lk, 'law-unreg.json'), '-Out', path.join(T, 'law-registry-unreg.md')]);
    exitIs('L: a clause on a script the registry does not list fails the build', r.code, 1);
    has('L: the failure names the registry as the record', r.out, "FAIL TST-03: hook script 'unreg.mjs' is not registered in hooks/registry.json (hooks/hooks.json is absent, so the registry is the record)");
    WJ(lkRegistry, { schema: 1, hooks: [...lkRows, regRow('unreg', 'hooks/unreg.mjs')] });
    r = node(lkBuild, ['-Source', path.join(lk, 'law-unreg.json'), '-Out', path.join(T, 'law-registry-unreg.md')]);
    exitIs('L: a registry row for that script makes the same HOOK clause build', r.code, 0);
    has('L: the clause on the newly listed script keeps its HOOK grade', fs.existsSync(path.join(T, 'law-registry-unreg.md')) ? fs.readFileSync(path.join(T, 'law-registry-unreg.md'), 'utf8') : '', '| TST-03 | HOOK |');
    r = node(lkBuild, ['-Source', path.join(lk, 'law-lib.json'), '-Out', path.join(T, 'law-registry-lib.md')]);
    exitIs('L: a lib file named like a registry-listed script is still not registered (read by path under hooks)', r.code, 1);
    has('L: the lib failure names the registry', r.out, "FAIL TST-04: hook script 'lib/reg.mjs' is not registered in hooks/registry.json");
    // A hooks.json that exists but cannot be read is a broken kit, not a case for the registry: the
    // failure names hooks.json alone. A registry that cannot be read, with no hooks.json, names both.
    W(jp(lk, 'hooks', 'hooks.json'), '{ not json');
    r = node(lkBuild, ['-Source', path.join(lk, 'law-ok.json'), '-Out', path.join(T, 'law-registry-badhooks.md')]);
    exitIs('L: a hooks.json that is not JSON fails the build even with a registry beside it', r.code, 1);
    has('L: that failure names hooks.json, not the registry', r.out, 'FAIL TST-01: hooks/hooks.json is not JSON');
    hasNot('L: that failure does not fall back to the registry', r.out, 'hooks/registry.json');
    fs.rmSync(jp(lk, 'hooks', 'hooks.json'), { force: true });
    W(lkRegistry, '{ not json');
    r = node(lkBuild, ['-Source', path.join(lk, 'law-ok.json'), '-Out', path.join(T, 'law-registry-badreg.md')]);
    exitIs('L: a registry that is not JSON, with no hooks.json, fails the build', r.code, 1);
    has('L: that failure names the registry', r.out, 'hooks/registry.json is not JSON');
    has('L: and the absent hooks.json beside it', r.out, 'hooks/hooks.json does not exist');
    fs.rmSync(lkRegistry, { force: true });   // back to the L4 state (neither file) for the runs below

    // L5 (0.2.7): kind 'survey' grades ADVISE on a Doctor survey anchor that declares advise, with no
    // hooks.json needed (a survey line is not a hook); GATE on it is refused, and so is an ADVISE on a
    // survey anchor that declares gate.
    W(jp(lk, 'tools', 'doctor', 'survey.mjs'), '// anchor: t-warn  mode: advise  verbs: test-warn\n// anchor: t-fail  mode: gate  verbs: test-fail\n');
    W(jp(lk, 'instructions', 'survey-law.md'), '# Survey law\n\n### TSV-01\n\nWarn.\n\n### TSV-02\n\nGate on warn.\n\n### TSV-03\n\nAdvise on a gate anchor.\n\n### TSV-04\n\nNo anchor.\n');
    const sv = (id, grade, ref, verb) => ({ id, group: 'TSV', verb, rule: 'A planted rule for the survey kind.', owner: 'kit:instructions/survey-law.md', grade, since: '2026-10-20', enforcedBy: { kind: 'survey', ref } });
    const svOk = [sv('TSV-01', 'ADVISE', 'tools/doctor/survey.mjs#t-warn', 'test-warn')];
    WJ(path.join(lk, 'law-survey.json'), { schema: 1, groups: { TSV: 'Survey' }, clauses: svOk });
    r = node(lkBuild, ['-Source', path.join(lk, 'law-survey.json'), '-Out', path.join(T, 'law-survey.md')]);
    exitIs('L: an ADVISE clause of kind survey on an advise anchor builds', r.code, 0);
    has('L: it keeps its ADVISE grade', fs.existsSync(path.join(T, 'law-survey.md')) ? fs.readFileSync(path.join(T, 'law-survey.md'), 'utf8') : '', '| TSV-01 | ADVISE |');
    WJ(path.join(lk, 'law-survey-bad.json'), { schema: 1, groups: { TSV: 'Survey' }, clauses: [...svOk, sv('TSV-02', 'GATE', 'tools/doctor/survey.mjs#t-warn', 'test-warn'), sv('TSV-03', 'ADVISE', 'tools/doctor/survey.mjs#t-fail', 'test-fail'), sv('TSV-04', 'ADVISE', 'tools/doctor/survey.mjs', 'test-warn')] });
    r = node(lkBuild, ['-Source', path.join(lk, 'law-survey-bad.json'), '-Out', path.join(T, 'law-survey-bad.md')]);
    exitIs('L: a GATE, a gate anchor or no anchor on kind survey fails the build', r.code, 1);
    has('L: GATE cannot rest on a survey warn', r.out, "FAIL TSV-02: grade GATE cannot be enforced by kind 'survey'");
    has('L: an ADVISE survey clause needs an advise anchor', r.out, "FAIL TSV-03: anchor 't-fail' declares mode gate but grade ADVISE needs advise");
    has('L: a survey ref names its anchor', r.out, 'FAIL TSV-04: a survey ref needs #<anchor>');
    hasNot('L: the good survey clause is not failed with them', r.out, 'FAIL TSV-01');

    // ================================================================ run L (KIT): the kit's own group (0.3.0, KIT-01 to KIT-03)
    say('  Run L (KIT): the KIT clauses on the real kit, and the refusals on a scratch kit', 36);
    // The three KIT clauses are read from the kit's own law.json and built by the kit's own
    // build-law.mjs, so the anchors resolve against the real scripts (tools/vendor.mjs,
    // tools/settings.mjs, hooks/guard.mjs through its lib/ siblings), the real hooks/hooks.json and
    // the real owning file instructions/kit-law.md. Nothing in the real tree is written: the source
    // is a planted law.json that carries the KIT group alone, the output lands in the sandbox.
    const realLaw = JSON.parse(fs.readFileSync(path.join(kitRoot, 'law.json'), 'utf8'));
    const kitGroup = realLaw.groups && Object.prototype.hasOwnProperty.call(realLaw.groups, 'KIT') ? String(realLaw.groups.KIT) : '';
    const kitClauses = (realLaw.clauses || []).filter((c) => String(c.group) === 'KIT');
    const kitIds = kitClauses.map((c) => String(c.id)).sort();
    if (kitGroup && kitIds.join(',') === 'KIT-01,KIT-02,KIT-03') ok('L: law.json carries the KIT group with KIT-01, KIT-02 and KIT-03');
    else bad('L: law.json carries the KIT group with KIT-01, KIT-02 and KIT-03', `group ${kitGroup ? 'present' : 'missing'}; clauses: ${kitIds.join(', ') || 'none'}`);
    const kitSrc = path.join(T, 'law-kit.json');
    WJ(kitSrc, { schema: 1, groups: { KIT: kitGroup || 'planted' }, clauses: kitClauses });
    const kitOut = path.join(T, 'law-kit.md');
    r = node(path.join(kitRoot, 'tools', 'law', 'build-law.mjs'), ['-Source', kitSrc, '-Out', kitOut]);
    exitIs('L: the three KIT anchors resolve: the real build of the KIT clauses exits 0', r.code, 0);
    if (r.code !== 0) say(`        ${r.out.replace(/\s+/g, ' ').trim().slice(0, 400)}`, 90);
    hasNot('L: the KIT clauses build with no warning (no value, no count, one sentence each)', r.out, 'WARN KIT-');
    const kitText = fs.existsSync(kitOut) ? fs.readFileSync(kitOut, 'utf8') : '';
    has('L: KIT-01 grades GATE from the vendor-sha anchor (mode gate), never typed', kitText, '| KIT-01 | GATE |');
    has("L: KIT-02 grades HOOK from the guard's selfcheck-armed anchor (mode deny, found through lib/)", kitText, '| KIT-02 | HOOK |');
    has('L: KIT-03 grades GATE from the settings-registry anchor (mode gate)', kitText, '| KIT-03 | GATE |');

    // The refusals that keep the group honest, on a scratch kit so the real tree stays as it is: the
    // law scripts, a vendor.mjs holding the real anchor line, a guard whose deny anchor sits in its
    // lib/ as the real one does, a hooks.json that registers the guard, and the owning file.
    const kk = newDir(path.join(T, 'kitlaw'));
    for (const rel of ['tools/law/build-law.mjs', 'tools/law/validate.mjs', 'tools/law/render.mjs', 'tools/lib/args.mjs', 'hooks/lib/json.mjs']) copy(kitRoot, rel, kk);
    W(jp(kk, 'tools', 'vendor.mjs'), '// anchor: vendor-sha  mode: gate  verbs: vendor\n');
    W(jp(kk, 'hooks', 'guard.mjs'), '// guard.mjs - a planted guard; its rules live in lib/.\n');
    W(jp(kk, 'hooks', 'lib', 'guard-owner-rules.mjs'), '// anchor: selfcheck-armed  mode: deny  verbs: prove-armed\n');
    W(jp(kk, 'hooks', 'hooks.json'), '{ "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs\\"" } ] } ] } }\n');
    W(jp(kk, 'instructions', 'kit-law.md'), '# Kit law\n\n### KIT-01\n\nThe vendored tree.\n\n### KIT-02\n\nThe arming proof.\n');
    const kkBuild = jp(kk, 'tools', 'law', 'build-law.mjs');
    const kkClause = (id, grade, kind, ref, verb) => ({ id, group: 'KIT', verb, rule: 'A planted rule for the kit group.', owner: 'kit:instructions/kit-law.md', grade, since: '2026-11-10', enforcedBy: { kind, ref } });
    const kkGroups = { KIT: "The kit's own plumbing" };
    const kkOk = [kkClause('KIT-01', 'GATE', 'tool', 'tools/vendor.mjs#vendor-sha', 'vendor'), kkClause('KIT-02', 'HOOK', 'hook', 'hooks/guard.mjs#selfcheck-armed', 'prove-armed')];
    WJ(path.join(kk, 'law-kit-ok.json'), { schema: 1, groups: kkGroups, clauses: kkOk });
    r = node(kkBuild, ['-Source', path.join(kk, 'law-kit-ok.json'), '-Out', path.join(T, 'law-kit-ok.md')]);
    exitIs('L: the scratch KIT clauses build (one heading each, each anchor mode matching its grade)', r.code, 0);
    // A second law file with '### KIT-01' is one subject stated twice: the build fails, names both
    // files (PRIN-05) and writes nothing.
    W(jp(kk, 'instructions', 'other-law.md'), '# Other law\n\n### KIT-01\n\nThe same clause stated again.\n');
    r = node(kkBuild, ['-Source', path.join(kk, 'law-kit-ok.json'), '-Out', path.join(T, 'law-kit-dup.md')]);
    exitIs('L: a KIT-01 heading in two law files fails the build', r.code, 1);
    has('L: the failure names both files that carry the heading', r.out, "FAIL KIT-01: '### KIT-01' heading is in more than one law file: kit:instructions/kit-law.md, kit:instructions/other-law.md");
    if (!fs.existsSync(path.join(T, 'law-kit-dup.md'))) ok('L: the duplicate-heading build writes no LAW.md'); else bad('L: the duplicate-heading build writes no LAW.md', `found ${path.join(T, 'law-kit-dup.md')}`);
    fs.rmSync(jp(kk, 'instructions', 'other-law.md'), { force: true });
    // The grade comes from the anchor's mode, never from what was typed: HOOK on the vendor tool's
    // gate anchor and GATE on the guard's deny anchor both fail.
    WJ(path.join(kk, 'law-kit-mode.json'), { schema: 1, groups: kkGroups, clauses: [kkClause('KIT-01', 'HOOK', 'hook', 'tools/vendor.mjs#vendor-sha', 'vendor'), kkClause('KIT-02', 'GATE', 'tool', 'hooks/guard.mjs#selfcheck-armed', 'prove-armed')] });
    r = node(kkBuild, ['-Source', path.join(kk, 'law-kit-mode.json'), '-Out', path.join(T, 'law-kit-mode.md')]);
    exitIs('L: a KIT clause whose anchor mode does not match its grade fails the build', r.code, 1);
    has('L: HOOK typed on the vendor gate anchor is refused', r.out, "FAIL KIT-01: anchor 'vendor-sha' declares mode gate but grade HOOK needs deny");
    has('L: GATE typed on the guard deny anchor is refused', r.out, "FAIL KIT-02: anchor 'selfcheck-armed' declares mode deny but grade GATE needs gate");
    // A count in a rule text goes stale in silence (SKIN-07, build-law.mjs#no-count): the build refuses
    // it by the clause and the words, and writes nothing (0.3.0 red-expected map).
    WJ(path.join(kk, 'law-kit-count.json'), { schema: 1, groups: kkGroups, clauses: [{ ...kkOk[0], rule: 'A repository runs the 3 hooks it carries.' }, kkOk[1]] });
    r = node(kkBuild, ['-Source', path.join(kk, 'law-kit-count.json'), '-Out', path.join(T, 'law-kit-count.md')]);
    exitIs('L: a KIT clause whose rule text carries a count fails the build', r.code, 1);
    has('L: the failure names the clause and the counted words', r.out, "FAIL KIT-01: rule carries a count ('3 hooks')");
    if (!fs.existsSync(path.join(T, 'law-kit-count.md'))) ok('L: the counted-rule build writes no LAW.md'); else bad('L: the counted-rule build writes no LAW.md', `found ${path.join(T, 'law-kit-count.md')}`);
    // A KIT clause with no KIT entry in groups fails on the group.
    WJ(path.join(kk, 'law-kit-nogroup.json'), { schema: 1, groups: { CTRL: 'Control' }, clauses: kkOk });
    r = node(kkBuild, ['-Source', path.join(kk, 'law-kit-nogroup.json'), '-Out', path.join(T, 'law-kit-nogroup.md')]);
    exitIs('L: a KIT clause with no KIT entry in groups fails the build', r.code, 1);
    has('L: the failure names the missing group', r.out, "FAIL KIT-01: group 'KIT' is not in groups");
    // A KIT clause whose '### ID' heading is in no law file fails on the owner: the scratch kit-law.md
    // carries KIT-01 and KIT-02 only, so a KIT-03 on a planted settings anchor has its heading nowhere.
    // The build names the owning file that must carry it and writes nothing.
    W(jp(kk, 'tools', 'settings.mjs'), '// anchor: settings-registry  mode: gate  verbs: render-settings\n');
    WJ(path.join(kk, 'law-kit-noheading.json'), { schema: 1, groups: kkGroups, clauses: [...kkOk, kkClause('KIT-03', 'GATE', 'tool', 'tools/settings.mjs#settings-registry', 'render-settings')] });
    r = node(kkBuild, ['-Source', path.join(kk, 'law-kit-noheading.json'), '-Out', path.join(T, 'law-kit-noheading.md')]);
    exitIs('L: a KIT clause whose heading is in no law file fails the build', r.code, 1);
    has('L: the failure names the owning file that must carry the heading', r.out, "FAIL KIT-03: no '### KIT-03' heading in any law file; the owning file kit:instructions/kit-law.md must carry it (PRIN-05)");
    if (!fs.existsSync(path.join(T, 'law-kit-noheading.md'))) ok('L: the missing-heading build writes no LAW.md'); else bad('L: the missing-heading build writes no LAW.md', `found ${path.join(T, 'law-kit-noheading.md')}`);

    // ================================================================ run M: the docs build accepts DENY
    say('  Run M: the docs build with a planted DENY clause', 36);
    // A scratch kit with every input docs/build.mjs reads, and the kit's law.json with one clause that
    // no machine stops (not DENY, HOOK or GATE) re-graded DENY, so a DENY that is not counted as stopped
    // shows as a count one short.
    const dk = newDir(path.join(T, 'docskit'));
    // The adopt plan (the README's adopt block) brings its own imports and the templates it fills.
    for (const rel of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'hooks/hooks.json', 'tools/doctor/claims.json', 'README.md', 'ARCHITECTURE.md', 'LOOPS.md', 'agents/reviewer.md', 'LICENSE', 'docs/build.mjs', 'docs/data.mjs', 'tools/lib/args.mjs', 'tools/lib/adopt-plan.mjs', 'tools/lib/df-files.mjs', 'hooks/lib/json.mjs', 'hooks/lib/common.mjs', 'hooks/lib/stdin.mjs']) copy(kitRoot, rel, dk);
    for (const [dir, rx] of [['hooks', /\.mjs$/], ['commands', /\.md$/], ['docs/src', /./], ['templates', /./]]) {
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

    // ================================================================ run N: the README's generated blocks (CR-2026-10-18-READ, CR-2026-10-19-START)
    // README mode renders the inventory from the Domains table and hooks.json, the adopt questions and
    // files from commands/adopt.md and the adopt plan, and the commands from commands/*.md, and copies
    // the rest as written; a README missing a block's markers fails the build; a stale block fails -Check.
    say('  Run N: the README generated blocks', 36);
    const nOut = path.join(T, 'readme-render.md');
    r = node(jp(dk, 'docs', 'build.mjs'), ['-Source', jp(dk, 'README.md'), '-Out', nOut]);
    exitIs('N: README mode renders (exit 0)', r.code, 0);
    const nMd = fs.existsSync(nOut) ? fs.readFileSync(nOut, 'utf8') : '';
    has('N: the block carries the markers', nMd, '<!-- inventory:start -->');
    has('N: a registered hook is listed from hooks.json with its event', nMd, '| `guard.mjs` | PreToolUse |');
    has('N: a domain is listed from the ARCHITECTURE Domains table', nMd, '| `tools/doctor/` |');
    const nTitle = fs.readFileSync(jp(dk, 'README.md'), 'utf8').split('\n')[0];
    has('N: the text outside the markers is copied as written', nMd, nTitle);
    has('N: the adopt block carries its markers', nMd, '<!-- adopt:start -->');
    // Question 7 quotes "<root>" before its text; the page once listed that quote as the question.
    has('N: question 7 is listed by its text and its condition', nMd, "**Settings scope** (asked only if root is a git work tree): The kit's deny/ask");
    has('N: a question carries its recommended answer from adopt.md', nMd, '| 5 | **Brain as a git repo**: Should the brain be a git repository? | Yes |');
    has('N: a file adopt writes is listed from the plan', nMd, '| `<brain>/me.md` |');
    has('N: a file only a repo brain gets is marked', nMd, '| `<brain>/.gitignore` | state/ is generated');
    has('N: every command is listed from commands/*.md', nMd, '| `/design-first:council` |');
    has('N: the page lists question 7 by its text', dHtml, '<b>Settings scope</b> The kit&#39;s deny/ask');
    const dReadme = fs.readFileSync(jp(dk, 'README.md'), 'utf8');
    fs.writeFileSync(jp(dk, 'README.md'), dReadme.replace('<!-- adopt:start -->', '<!-- no markers -->'));
    r = node(jp(dk, 'docs', 'build.mjs'), ['-Source', jp(dk, 'README.md'), '-Out', nOut]);
    exitIs('N: a README with no adopt markers fails the build (exit 1)', r.code, 1);
    has('N: the failure names the adopt markers', r.out, 'adopt markers not found');
    fs.writeFileSync(jp(dk, 'README.md'), dReadme);
    const dAdopt = fs.readFileSync(jp(dk, 'commands', 'adopt.md'), 'utf8');
    fs.writeFileSync(jp(dk, 'commands', 'adopt.md'), dAdopt.replace('the current working directory (Recommended)', 'the current working directory'));
    r = node(jp(dk, 'docs', 'build.mjs'), ['-Source', jp(dk, 'README.md'), '-Out', nOut]);
    exitIs('N: a question with no recommended option fails the build (exit 1)', r.code, 1);
    has('N: the failure names the question', r.out, 'question 1 (Root) has no Options line');
    fs.writeFileSync(jp(dk, 'commands', 'adopt.md'), dAdopt);
    fs.writeFileSync(jp(dk, 'README.md'), dReadme.replace('<!-- inventory:start -->', '<!-- no markers -->'));
    r = node(jp(dk, 'docs', 'build.mjs'), ['-Source', jp(dk, 'README.md'), '-Out', nOut]);
    exitIs('N: a README with no inventory markers fails the build (exit 1)', r.code, 1);
    has('N: the failure names the markers', r.out, 'inventory markers not found');
    fs.writeFileSync(jp(dk, 'README.md'), dReadme.replace(/\| `guard\.mjs` \| PreToolUse \|[^\n]*\n/, ''));
    fs.writeFileSync(jp(dk, 'docs', 'index.html'), dHtml);
    r = node(jp(dk, 'docs', 'build.mjs'), ['-Check']);
    exitIs('N: a stale inventory block fails -Check (exit 1)', r.code, 1);
    has('N: -Check names the README', r.out, 'README.md generated blocks are stale');
    fs.writeFileSync(jp(dk, 'README.md'), dReadme);
}
