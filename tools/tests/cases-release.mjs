// cases-release.mjs - the release gate cases of 0.3.0 rows 40 to 43: tools/release.mjs run against a
// scratch kit under T (a git repository holding a registry, a guard header, a claims dispatcher, three
// anchor lines, stub suites that print the three suites' line shapes, a map and stub generators), so a
// planted fault in the map, in a suite, in the tree or in the docs check is refused by name, and a green
// run with -Bump bumps the scratch plugin.json once and reruns the generators. Imported by run.mjs,
// which owns the fixtures and helpers used here. Never run directly.
//
// The real suites are never spawned from here (they take minutes, and run.mjs is the one running):
// the stub suites print exactly the line shapes tools/tests/run.mjs, tools/doctor/selftest.mjs and
// tools/tests/adopt-selftest.mjs print, driven by a knob file OUTSIDE the scratch repository, so a
// fault is planted while the tree stays clean. A map variant is committed into the scratch repository
// before its run, for the same reason. The real gate over the real tree is run by hand before a
// release (node tools/release.mjs -DryRun), and that run is what proves the shipped map.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export default function releaseCases(t) {
    const { T, kit, record, section, like, jp, put, readText, exists, toJson, runGit } = t;

    section('-- release: tools/release.mjs on a scratch kit (0.3.0 rows 40 to 43)');
    const release = path.join(kit, 'tools', 'release.mjs');
    const R = jp(T, 'release-kit');
    const knobPath = jp(T, 'release-knobs.json');
    const knobs = (o) => put(knobPath, toJson(o) + '\n');
    const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
    const version = () => { const j = readJson(jp(R, '.claude-plugin', 'plugin.json')); return j ? String(j.version) : 'unreadable'; };
    const kitDir = jp(R, '.claude', 'kit');

    // ---------------------------------------------------------------- the scratch kit
    // Every file is committed: the gate reads the inventory from the tracked tree (git ls-files).
    put(jp(R, '.claude-plugin', 'plugin.json'), toJson({ name: 'release-fixture', version: '1.2.3' }) + '\n');
    put(jp(R, 'hooks', 'registry.json'), toJson({ schema: 1, hooks: [
        { id: 'guard', event: 'PreToolUse', matcher: 'Bash', script: 'hooks/guard.mjs', timeout: 10, host: ['any'], mode: 'deny', vendor: true },
        { id: 'entry-startup', event: 'SessionStart', matcher: 'startup', script: 'hooks/entry.mjs', timeout: 10, host: ['any'], mode: 'advise', vendor: true }] }) + '\n');
    put(jp(R, 'hooks', 'guard.mjs'), [
        '// guard.mjs - a planted guard header for the release gate cases.',
        '//',
        '// The deny rules, in this order:',
        '//   1. stage-secret  - a planted rule.',
        '//   2. git-history   - a planted rule, continued on the next line',
        '//                      3. with a number that is not a rule.',
        '//',
        '// anchor: stage-secret  mode: deny  verbs: stage',
        'process.exitCode = 0;',
        '// 4. a numbered line after the header is not a rule either.', ''].join('\n'));
    put(jp(R, 'hooks', 'entry.mjs'), '// entry.mjs - a planted entry hook.\n// anchor: entry-path  mode: advise  verbs: load-context\nprocess.exitCode = 0;\n');
    put(jp(R, 'tools', 'doctor', 'claims.mjs'), [
        '// claims.mjs - a planted dispatcher.',
        'function invokeOneClaim(c) {',
        '    switch (String(c.type)) {',
        "        case 'path_exists': return 1;",
        "        case 'tree_sha': return 2;",
        "        default: return 0;",
        '    }',
        '}',
        "// case 'not_a_type': a case outside the dispatcher switch is not a claim type.",
        'export { invokeOneClaim };', ''].join('\n'));
    put(jp(R, 'law.json'), '{ "schema": 1 }\n');
    put(jp(R, 'LAW.md'), '# LAW (planted) 1.2.3\n');
    put(jp(R, 'README.md'), '# planted 1.2.3\n');
    put(jp(R, 'docs', 'index.html'), '<p>1.2.3</p>\n');
    // The generators the bump reruns: each reads the scratch plugin.json so the rebuilt files carry
    // the version the bump wrote. vendor.mjs holds the real anchor line, as the kit's does.
    const argAfter = "const a = process.argv.slice(2); const arg = (f) => a[a.indexOf(f) + 1];";
    put(jp(R, 'tools', 'vendor.mjs'), [
        '// vendor.mjs - a planted vendor: writes <target>/.claude/kit/VERSION with the plugin.json version.',
        '// anchor: vendor-sha  mode: gate  verbs: vendor',
        "import fs from 'node:fs'; import path from 'node:path';", argAfter,
        "const t = arg('-Target'); const v = JSON.parse(fs.readFileSync(path.join(t, '.claude-plugin', 'plugin.json'), 'utf8')).version;",
        "fs.mkdirSync(path.join(t, '.claude', 'kit'), { recursive: true });",
        "fs.writeFileSync(path.join(t, '.claude', 'kit', 'VERSION'), JSON.stringify({ version: v, sha256: 'planted', files: [], at: 'planted' }) + '\\n');",
        "console.log('vendored 0 files, sha planted');", ''].join('\n'));
    put(jp(R, 'tools', 'law', 'build-law.mjs'), [
        '// build-law.mjs - a planted law build: writes -Out with the plugin.json version.',
        "import fs from 'node:fs'; import path from 'node:path';", argAfter,
        "const root = path.dirname(path.resolve(arg('-Source')));",
        "const v = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;",
        "fs.writeFileSync(path.resolve(arg('-Out')), '# LAW (planted) ' + v + '\\n'); console.log('build-law: wrote ' + arg('-Out'));", ''].join('\n'));
    put(jp(R, 'docs', 'build.mjs'), [
        '// build.mjs - a planted docs build: -Check exits 1 when the knob says the page is stale; a build writes the version.',
        "import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';",
        `const k = JSON.parse(fs.readFileSync(${JSON.stringify(knobPath)}, 'utf8'));`,
        "const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
        "const v = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;",
        "if (process.argv.includes('-Check')) { if (k.docsStale === true) { console.log('docs/index.html is stale: run node docs/build.mjs'); process.exit(1); } console.log('docs/index.html matches a fresh render'); process.exit(0); }",
        "fs.writeFileSync(path.join(root, 'docs', 'index.html'), '<p>' + v + '</p>\\n'); fs.writeFileSync(path.join(root, 'README.md'), '# planted ' + v + '\\n'); console.log('wrote the page and the README');", ''].join('\n'));
    // The three stub suites, each in its suite's line shape. The run.mjs shape cuts the name column at
    // 72 characters, as the real one does, so a long mapped name is proved through that cut.
    const stubHead = ["import fs from 'node:fs';", `const k = JSON.parse(fs.readFileSync(${JSON.stringify(knobPath)}, 'utf8'));`, "const say = (s) => process.stdout.write(s + '\\n');"];
    put(jp(R, 'tools', 'tests', 'run.mjs'), ['// run.mjs - a planted suite in the run.mjs line shape.', ...stubHead,
        "const row = (ok, name, expected, got) => say('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name.slice(0, 72).padEnd(72) + ' ' + String(expected).padEnd(8) + ' ' + got);",
        'const fail = k.fail === true;',
        "row(!fail, 'planted: stage .env -> denied', 'deny', fail ? 'allow' : 'deny');",
        "if (fail) say('        the planted fault: the call was allowed');",
        "row(true, 'planted: a long name that runs past the seventy-two character cut of the run.mjs name column, kept whole in the map', 'deny', 'deny');",
        "row(true, 'smoke PreToolUse/Bash -> guard.mjs', 'exit0+empty-or-json', 'exit0+empty-or-json');",
        "say(''); say('  ' + (fail ? '2 passed, 1 failed, 3 total' : '3 passed, 0 failed, 3 total'));",
        "if (k.noRedLine !== true) say('  red-expected: ' + (k.redZero === true ? 0 : 2));",
        "say(''); process.exitCode = fail ? 1 : (k.exitNonZero === true ? 3 : 0);", ''].join('\n'));
    put(jp(R, 'tools', 'doctor', 'selftest.mjs'), ['// selftest.mjs - a planted suite in the Doctor self-test line shape.', ...stubHead,
        "say('  PASS  C: F-PATH caught'); say('  PASS  D: could-not-look is exit 2 (exit 2)');",
        "say(''); say('  2 passed, 0 failed'); say('  red-expected: 1'); say('');", ''].join('\n'));
    put(jp(R, 'tools', 'tests', 'adopt-selftest.mjs'), ['// adopt-selftest.mjs - a planted suite in the adopt self-test line shape.', ...stubHead,
        "say('  PASS  red: a planted adopt refusal (exit 1)');",
        "say(''); say('  1 passed, 0 failed, 1 total'); say('  red-expected: 1'); say('');", ''].join('\n'));
    // The kit's own Doctor, stubbed in the doctor.mjs -Kit line shape and driven by the same knob file (review finding
    // 19): knob doctor 'RED' plants a false claim (exit 1), 'COULD-NOT-LOOK' a claim it could not evaluate (exit 2),
    // 'SILENT' exits 0 with no VERDICT line; anything else is GREEN, exit 0.
    const stubDoctorPath = jp(R, 'tools', 'doctor', 'doctor.mjs');
    const stubDoctor = ['// doctor.mjs - a planted kit Doctor in the doctor.mjs -Kit line shape.', ...stubHead,
        "const d = String(k.doctor || 'GREEN');",
        "if (!process.argv.includes('-Kit')) { say('planted doctor: run without -Kit'); process.exit(2); }",
        "if (d === 'RED') { say('  CLAIMS  1 pass  1 fail  0 could not look  0 skipped'); say('    FAIL  KIT-PLANTED-01  a planted false claim'); say(''); say('  VERDICT: RED  (exit 1: 1 false claim(s))'); process.exit(1); }",
        "if (d === 'COULD-NOT-LOOK') { say('  CLAIMS  1 pass  0 fail  1 could not look  0 skipped'); say('    ????  KIT-PLANTED-02  a planted unknown'); say(''); say('  VERDICT: COULD-NOT-LOOK  (exit 2: 1 claim(s) could not be evaluated)'); process.exit(2); }",
        "if (d === 'SILENT') process.exit(0);",
        "say('  CLAIMS  2 pass  0 fail  0 could not look  0 skipped'); say('    every claim holds'); say(''); say('  VERDICT: GREEN  (exit 0: nothing needs action)');", ''].join('\n');
    put(stubDoctorPath, stubDoctor);
    // The green map: every mechanism of the scratch kit, each to a name a stub suite prints. A string
    // value and a list value are both accepted; the long name proves the 72-character cut; the Doctor
    // name is mapped without its ' (exit 2)' suffix.
    const LONG = 'planted: a long name that runs past the seventy-two character cut of the run.mjs name column, kept whole in the map';
    const greenMap = {
        'registry:guard': ['planted: stage .env -> denied', 'smoke PreToolUse/Bash -> guard.mjs'],
        'registry:entry-startup': [LONG],
        'guard:1': 'planted: stage .env -> denied',
        'guard:2': ['planted: stage .env -> denied'],
        'claim:path_exists': ['C: F-PATH caught'],
        'claim:tree_sha': ['D: could-not-look is exit 2'],
        'anchor:hooks/entry.mjs#entry-path': ['red: a planted adopt refusal (exit 1)'],
        'anchor:hooks/guard.mjs#stage-secret': ['planted: stage .env -> denied'],
        'anchor:tools/vendor.mjs#vendor-sha': ['red: a planted adopt refusal (exit 1)'],
    };
    const mapPath = jp(R, 'tools', 'tests', 'red-expected.json');
    const commitMap = (mechanisms, label) => {
        put(mapPath, toJson({ schema: 1, _comment: 'a planted map', mechanisms }) + '\n');
        runGit(R, ['add', 'tools/tests/red-expected.json']);
        runGit(R, ['commit', '-q', '-m', label]);
    };
    const without = (id) => { const m = { ...greenMap }; delete m[id]; return m; };
    knobs({});
    put(mapPath, toJson({ schema: 1, _comment: 'a planted map', mechanisms: greenMap }) + '\n');
    runGit(R, ['init', '-q', '-b', 'main']);
    runGit(R, ['add', '-A']);
    runGit(R, ['commit', '-q', '-m', 'scratch kit']);

    // The gate under test is the real tools/release.mjs, pointed at the scratch kit through -Root.
    const gate = (args) => {
        const env = { ...process.env, NO_COLOR: '1' };
        const r = spawnSync(process.execPath, [release, '-Root', R, ...args], { cwd: kit, encoding: 'utf8', windowsHide: true, env, maxBuffer: 16 * 1024 * 1024 });
        return { code: r.status == null ? -1 : r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n') };
    };
    const why = (r) => `exit ${r.code}: ${r.out.trim().slice(0, 300)}`;
    const refusals = (r) => r.out.split('\n').filter((l) => /^\s+- /.test(l)).join(' | ');
    const unchanged = () => version() === '1.2.3' && readText(jp(R, 'LAW.md')) === '# LAW (planted) 1.2.3\n' && readText(jp(R, 'docs', 'index.html')) === '<p>1.2.3</p>\n' && !exists(path.join(kitDir, 'VERSION'));

    // ---------------------------------------------------------------- green: the dry run
    let r = gate(['-DryRun']);
    record('release: all green with -DryRun exits 0 and changes nothing (plugin.json, LAW.md, the page, no .claude/kit)', 'unchanged', r.code === 0 && unchanged() ? 'unchanged' : why(r), r.out);
    // The gate's words say what it proved (a release review finding): the kit Doctor it runs writes its ignored
    // state/ on every run, so a dry run writes no release file, not nothing. Red first: the banner said
    // '[DRY RUN: nothing is written]', and the verdict lines 'nothing changed' and 'dry run, nothing written'.
    const banner = r.out.split('\n')[0] || '';
    record('release: the -DryRun banner says no release file is written, never that nothing is', 'said', banner.endsWith('[DRY RUN: no release file is written]') && !like(r.out, '*nothing is written*') ? 'said' : banner, r.out);
    record('release: -DryRun prints the would-be versions from the scratch plugin.json (patch 1.2.4, minor 1.3.0, major 2.0.0)', 'printed', like(r.out, '*1.2.4*') && like(r.out, '*1.3.0*') && like(r.out, '*2.0.0*') ? 'printed' : 'silent', r.out);
    record('release: -DryRun prints the Node version that ran', 'printed', r.code === 0 && like(r.out, `*  node *${process.version}*`) ? 'printed' : 'silent', r.out);
    record("release: the green dry run prints a doctor line with the kit Doctor's GREEN verdict", 'printed', r.code === 0 && /^\s*doctor\s+GREEN\b/m.test(r.out) ? 'printed' : 'silent', r.out);
    record('release: the inventory is read from the tree: 2 registry rows, 2 guard rules, 2 claim types, 3 anchors, 9 mechanisms', 'counted', like(r.out, '*9 mechanisms*2 registry rows*2 guard rules*2 claim types*3 anchors*') ? 'counted' : 'other', r.out);
    const ids = Object.keys(greenMap);
    const listed = ids.filter((id) => new RegExp(`^\\s*mapped\\s+${id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(\\s|$)`, 'm').test(r.out));
    record('release: -DryRun lists every mechanism of the scratch kit as mapped, by id', 'all', listed.length === ids.length ? 'all' : `${listed.length} of ${ids.length}: ${listed.join(', ')}`, r.out);
    record('release: a numbered line in a continuation or after the header is not a guard rule (guard:3 and guard:4 are not in the inventory)', 'absent', r.code === 0 && like(r.out, '*guard:2*') && !like(r.out, '*guard:3*') && !like(r.out, '*guard:4*') ? 'absent' : 'present', r.out);
    record("release: a case line outside the dispatcher switch is not a claim type (claim:not_a_type is not in the inventory)", 'absent', r.code === 0 && like(r.out, '*claim:tree_sha*') && !like(r.out, '*not_a_type*') ? 'absent' : 'present', r.out);
    record('release: a mapped name longer than 72 characters is seen through the run.mjs name column cut (registry:entry-startup mapped)', 'seen', /^\s*mapped\s+registry:entry-startup/m.test(r.out) ? 'seen' : 'unseen', r.out);
    record('release: the dry run says when a mapped name was matched by its first 72 characters only (registry:entry-startup)', 'said', /^\s*mapped\s+registry:entry-startup\s+1 case \(1 matched by the first 72 characters only\)/m.test(r.out) ? 'said' : 'silent', r.out);
    record('release: a Doctor name mapped without its (exit N) suffix is seen (claim:tree_sha mapped)', 'seen', /^\s*mapped\s+claim:tree_sha/m.test(r.out) ? 'seen' : 'unseen', r.out);
    record('release: the suite summary lines are parsed (run.mjs stub: 3 passed, 0 failed, red-expected 2)', 'parsed', like(r.out, '*tools/tests/run.mjs*3 passed, 0 failed*red-expected 2*') ? 'parsed' : 'unparsed', r.out);
    const dm = gate(['-DryRun', '-Bump', 'minor']);
    record('release: -DryRun -Bump minor prints the would-be version 1.3.0 and leaves 1.2.3 in place', 'would-be', dm.code === 0 && like(dm.out, '*1.2.3 -> 1.3.0*') && unchanged() ? 'would-be' : why(dm), '');
    record('release: -DryRun -Bump says no release file was written, never that nothing was', 'said', like(dm.out, '*; dry run, no release file written*') && !like(dm.out, '*nothing written*') ? 'said' : why(dm), dm.out);
    r = gate([]);
    record('release: without -Bump the green gate exits 0 and bumps nothing', 'gate-only', r.code === 0 && unchanged() && !like(r.out, '*bumped*') ? 'gate-only' : why(r), r.out);
    record('release: the green gate without -Bump says no release file changed, never that nothing did', 'said', like(r.out, '*; no -Bump given, no release file changed (would be: *') && !like(r.out, '*nothing changed*') ? 'said' : why(r), r.out);

    // ---------------------------------------------------------------- red: a failing case in a suite
    knobs({ fail: true });
    r = gate(['-Bump', 'patch']);
    record('release: a fixture suite with one failing case: refused, exit 1, the version unchanged', 'refused', r.code === 1 && unchanged() && like(r.out, '*refused: *') ? 'refused' : why(r), r.out);
    record('release: a refusal says no release file changed, never that nothing did', 'said', /^refused: \d+ reasons?; no release file changed$/m.test(r.out) && !like(r.out, '*nothing changed*') ? 'said' : why(r), r.out);
    record('release: the refusal names the suite and the failed case', 'named', like(refusals(r), '*tools/tests/run.mjs*1 failed*') && like(r.out, '*planted: stage .env -> denied*') ? 'named' : refusals(r) || 'silent', r.out);
    record('release: the mechanisms mapped to the failed case are listed as failed, not seen as proved', 'failed', /^\s*FAILED\s+guard:1\s/m.test(r.out) && /^\s*FAILED\s+anchor:hooks\/guard\.mjs#stage-secret/m.test(r.out) ? 'failed' : 'other', r.out);
    knobs({ noRedLine: true });
    r = gate(['-DryRun']);
    record('release: a suite that prints no red-expected line is refused naming the suite', 'refused', r.code === 1 && like(refusals(r), '*tools/tests/run.mjs*red-expected*') ? 'refused' : why(r), r.out);
    knobs({ redZero: true });
    r = gate(['-DryRun']);
    record('release: a suite that prints red-expected: 0 is refused naming the suite (no refusal case proves nothing)', 'refused', r.code === 1 && like(refusals(r), '*tools/tests/run.mjs*red-expected: 0*') ? 'refused' : why(r), r.out);
    knobs({ exitNonZero: true });
    r = gate(['-DryRun']);
    record('release: a suite that exits non-zero under a green summary is refused naming the exit code', 'refused', r.code === 1 && like(refusals(r), '*tools/tests/run.mjs*exited 3*') ? 'refused' : why(r), r.out);
    knobs({ docsStale: true });
    r = gate(['-Bump', 'patch']);
    record('release: a failing docs/build.mjs -Check is refused, the version unchanged', 'refused', r.code === 1 && unchanged() && like(refusals(r), '*docs/build.mjs -Check*') ? 'refused' : why(r), r.out);
    // The kit's own Doctor (review finding 19): the gate runs doctor.mjs -Kit and refuses unless it exits 0 with its
    // VERDICT: GREEN line, so a RED or a COULD-NOT-LOOK kit Doctor never ships. Red first: the gate never ran it, and a
    // kit Doctor RED on its own claims (KIT-LEAK-01 with .claude/kit dropped from its exclude) shipped under green suites.
    knobs({ doctor: 'RED' });
    r = gate(['-Bump', 'patch']);
    record('release: a RED kit Doctor (doctor.mjs -Kit exit 1) is refused naming the verdict and the false claim, the version unchanged', 'refused', r.code === 1 && unchanged() && like(refusals(r), '*kit Doctor*RED*KIT-PLANTED-01*') ? 'refused' : why(r), r.out);
    record('release: the doctor report line carries the RED verdict', 'printed', /^\s*doctor\s+RED\b/m.test(r.out) ? 'printed' : 'silent', r.out);
    knobs({ doctor: 'COULD-NOT-LOOK' });
    r = gate(['-DryRun']);
    record('release: a COULD-NOT-LOOK kit Doctor (exit 2) is refused too, naming the claim it could not look at', 'refused', r.code === 1 && like(refusals(r), '*kit Doctor*COULD-NOT-LOOK*KIT-PLANTED-02*') ? 'refused' : why(r), r.out);
    knobs({ doctor: 'SILENT' });
    r = gate(['-DryRun']);
    record('release: a kit Doctor that exits 0 with no VERDICT: GREEN line is refused (nothing proved)', 'refused', r.code === 1 && like(refusals(r), '*kit Doctor*no VERDICT: GREEN line*') ? 'refused' : why(r), r.out);
    // No kit Doctor in the checkout at all: could-not-look (exit 2) naming it, as tools/MANUAL.md says, never a pass and
    // never a plain refusal, since nothing ran. The stub is put back byte for byte, so the tree is clean for the cases below.
    fs.rmSync(stubDoctorPath, { force: true });
    r = gate(['-DryRun']);
    record('release: a checkout with no tools/doctor/doctor.mjs is could-not-look (exit 2) naming the missing kit Doctor', 2, r.code === 2 && like(r.out, '*kit Doctor missing*') ? 2 : why(r), r.out);
    put(stubDoctorPath, stubDoctor);
    knobs({});

    // ---------------------------------------------------------------- red: the map
    commitMap(without('registry:entry-startup'), 'no entry row');
    r = gate(['-Bump', 'patch']);
    record('release: a registry row missing from the map is refused naming it (registry:entry-startup)', 'refused', r.code === 1 && unchanged() && like(refusals(r), '*registry:entry-startup*no mapping*') ? 'refused' : why(r), r.out);
    r = gate(['-DryRun']);
    record('release: -DryRun lists the missing row as unmapped', 'listed', /^\s*UNMAPPED\s+registry:entry-startup/m.test(r.out) ? 'listed' : 'silent', r.out);
    commitMap(without('guard:2'), 'no guard rule');
    r = gate(['-DryRun']);
    record('release: a guard rule with no entry is refused naming the rule (guard:2)', 'refused', r.code === 1 && like(refusals(r), '*guard:2*no mapping*') ? 'refused' : why(r), r.out);
    commitMap(without('claim:tree_sha'), 'no claim type');
    r = gate(['-DryRun']);
    record('release: a claim type with no entry is refused naming it (claim:tree_sha)', 'refused', r.code === 1 && like(refusals(r), '*claim:tree_sha*no mapping*') ? 'refused' : why(r), r.out);
    commitMap(without('anchor:tools/vendor.mjs#vendor-sha'), 'no anchor');
    r = gate(['-DryRun']);
    record('release: an anchor with no entry is refused naming it (anchor:tools/vendor.mjs#vendor-sha)', 'refused', r.code === 1 && like(refusals(r), '*anchor:tools/vendor.mjs#vendor-sha*no mapping*') ? 'refused' : why(r), r.out);
    commitMap({ ...greenMap, 'guard:1': ['planted: a case nobody prints'] }, 'unseen name');
    r = gate(['-Bump', 'patch']);
    record('release: a mapped case name that no suite printed is refused naming the case, the version unchanged', 'refused', r.code === 1 && unchanged() && like(refusals(r), '*guard:1*planted: a case nobody prints*') ? 'refused' : why(r), r.out);
    record('release: -DryRun lists that mechanism as unseen', 'listed', /^\s*UNSEEN\s+guard:1/m.test(gate(['-DryRun']).out) ? 'listed' : 'silent');
    commitMap({ ...greenMap, 'guard:9': ['planted: stage .env -> denied'] }, 'stale entry');
    r = gate(['-DryRun']);
    record('release: a map entry for a mechanism the tree does not carry is refused naming it (guard:9)', 'refused', r.code === 1 && like(refusals(r), '*guard:9*') && /^\s*STALE\s+guard:9/m.test(r.out) ? 'refused' : why(r), r.out);
    fs.rmSync(mapPath, { force: true });
    runGit(R, ['add', '-A']);
    runGit(R, ['commit', '-q', '-m', 'no map']);
    r = gate(['-DryRun']);
    record('release: no red-expected.json at all: every mechanism is unmapped and the run is refused', 'refused', r.code === 1 && like(refusals(r), '*red-expected.json*') && like(r.out, '*9 unmapped*') ? 'refused' : why(r), r.out);
    commitMap(greenMap, 'the green map again');

    // ---------------------------------------------------------------- the inventory's edges
    // A committed vendored copy repeats the tree's anchor lines under .claude/kit/ (the kit commits
    // its own copy at a release): those lines are not mechanisms of the tree, or every one of them
    // would be UNMAPPED and the gate would refuse its own release.
    put(jp(R, '.claude', 'kit', 'hooks', 'guard.mjs'), readText(jp(R, 'hooks', 'guard.mjs')));
    runGit(R, ['add', '.claude/kit/hooks/guard.mjs']);
    runGit(R, ['commit', '-q', '-m', 'a vendored copy']);
    r = gate(['-DryRun']);
    record('release: a committed copy under .claude/kit/ that repeats an anchor line adds no mechanism (still 9, exit 0)', 'excluded', r.code === 0 && like(r.out, '*9 mechanisms*') && !like(r.out, '*anchor:.claude/*') ? 'excluded' : why(r), r.out);
    // An untracked script is read too (the tree is dirty, so the run is refused anyway), so a new
    // anchor line is listed UNMAPPED on a dry run before its first commit.
    put(jp(R, 'tools', 'new-tool.mjs'), '// new-tool.mjs - a planted new tool.\n// anchor: new-gate  mode: gate  verbs: new\nprocess.exitCode = 0;\n');
    r = gate(['-DryRun']);
    record('release: an untracked script with an anchor line is read on a dry run and listed UNMAPPED by its id', 'listed', /^\s*UNMAPPED\s+anchor:tools\/new-tool\.mjs#new-gate/m.test(r.out) && like(refusals(r), '*anchor:tools/new-tool.mjs#new-gate*no mapping*') ? 'listed' : why(r), r.out);
    fs.rmSync(jp(R, 'tools', 'new-tool.mjs'), { force: true });

    // ---------------------------------------------------------------- red: the tree, the flags
    put(jp(R, 'stray.txt'), 'an uncommitted file\n');
    r = gate(['-Bump', 'patch']);
    record('release: a dirty tree is refused naming the entry, the version unchanged', 'refused', r.code === 1 && unchanged() && like(refusals(r), '*dirty*stray.txt*') ? 'refused' : why(r), r.out);
    fs.rmSync(jp(R, 'stray.txt'), { force: true });
    r = gate(['-Bump', 'huge']);
    record('release: -Bump with a word other than patch, minor or major is could-not-look (exit 2), nothing run', 2, r.code, r.out);
    r = gate(['-Nope']);
    record('release: an unknown option is could-not-look (exit 2)', 2, r.code, r.out);
    // GIT_CEILING_DIRECTORIES keeps git from finding a repository above T, so a plain folder under T
    // is no work tree whatever folder the host's temp lives in.
    const gateAt = (root) => { const env = { ...process.env, NO_COLOR: '1', GIT_CEILING_DIRECTORIES: T }; const x = spawnSync(process.execPath, [release, '-Root', root], { cwd: kit, encoding: 'utf8', windowsHide: true, env }); return { code: x.status == null ? -1 : x.status, out: (x.stdout || '') + (x.stderr || '') }; };
    r = gateAt(jp(T, 'release-no-such-kit'));
    record('release: a -Root that does not exist is could-not-look (exit 2)', 2, r.code, r.out);
    fs.mkdirSync(jp(T, 'release-plain-folder'), { recursive: true });
    r = gateAt(jp(T, 'release-plain-folder'));
    record('release: a -Root that is a folder but no git work tree is could-not-look (exit 2) and says so', 2, r.code === 2 && like(r.out, '*not a git work tree*') ? 2 : why(r), r.out);

    // ---------------------------------------------------------------- green: the bump
    r = gate(['-Bump', 'patch']);
    record('release: all green with -Bump patch exits 0 and bumps the scratch plugin.json once (1.2.3 -> 1.2.4)', '1.2.4', r.code === 0 ? version() : why(r), r.out);
    record('release: the bump rebuilds LAW.md and the page and the README with the new version', 'rebuilt', readText(jp(R, 'LAW.md')) === '# LAW (planted) 1.2.4\n' && readText(jp(R, 'docs', 'index.html')) === '<p>1.2.4</p>\n' && readText(jp(R, 'README.md')) === '# planted 1.2.4\n' ? 'rebuilt' : 'stale', r.out);
    const vj = readJson(path.join(kitDir, 'VERSION'));
    record('release: the bump vendors the kit into its own .claude/kit after the rebuild (VERSION names 1.2.4)', '1.2.4', vj ? String(vj.version) : 'no VERSION', r.out);
    record('release: the bump report names the old and new version, the files to commit, and the Node version', 'named', like(r.out, '*bumped 1.2.3 -> 1.2.4*') && like(r.out, '*.claude-plugin/plugin.json*') && like(r.out, '*.claude/kit*') && like(r.out, `*${process.version}*`) ? 'named' : 'short', r.out);
    record('release: the other keys of plugin.json survive the bump byte for byte', 'kept', readText(jp(R, '.claude-plugin', 'plugin.json')) === toJson({ name: 'release-fixture', version: '1.2.4' }) + '\n' ? 'kept' : readText(jp(R, '.claude-plugin', 'plugin.json')), '');
    r = gate(['-Bump', 'patch']);
    record('release: a second -Bump on the now-dirty tree is refused: the bump happens once, the owner commits', 'refused', r.code === 1 && version() === '1.2.4' && like(refusals(r), '*dirty*') ? 'refused' : why(r), r.out);
}
