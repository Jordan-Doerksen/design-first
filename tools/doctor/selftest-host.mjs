// selftest-host.mjs - the Doctor on another host: -Host pc|cloud, the SKIPPED status and -Scope brain (0.3.0).
// Imported by selftest.mjs and run with its helpers and fixtures. Its own file by subject (DES-03):
// where the Doctor runs is a different question from what each claim type proves.
//
// What it proves, each case red first on the 0.2.15 Doctor (no -Host, no -Scope, no SKIPPED):
//   1. -Host is explicit, never guessed: without it nothing is skipped by host, and a host that is
//      not pc or cloud is could-not-look; a claim typed with a host that is not pc, cloud or any is
//      could-not-look even without -Host (a typo must not skip a claim in silence).
//   2. Under -Host cloud a claim whose path carries ${ROOT}, %USERPROFILE% or ${LOCALAPPDATA} is
//      SKIPPED (the PC's tree and home are not here; a %NAME% token in any letter case, as the
//      expander reads it; a ${name} token only as typed), and a claim typed host: pc is SKIPPED; under
//      -Host pc a claim typed host: cloud is SKIPPED. SKIPPED has its own band and its own -Json
//      count, is never counted as PASS, never printed under "every claim holds", and the verdict
//      ignores it: a false claim beside skipped ones is still RED (SAFE-04, no pass not proved).
//   3. -Scope brain (also --scope brain) builds the context from CLAUDE_PROJECT_DIR, or -Root, with no
//      pointer: root and brain are that folder; the kit is its .claude/kit when that holds the Doctor,
//      else the running copy; state goes under the folder; with neither CLAUDE_PROJECT_DIR nor -Root,
//      a folder that does not exist, a scope that is not brain, or -Kit beside it, could-not-look; and
//      -Root without -Scope brain is could-not-look (review finding 24).
//   4. (0.3.0, registry-readers) A brain carrying the vendored kit and a rendered .claude/settings.json
//      under -Scope brain: the law build proves its hook clauses from hooks/registry.json, the survey
//      and the hook_smoke runner read the settings file with ${CLAUDE_PROJECT_DIR} as the brain, and
//      the run exits 0 with BRAIN-LAW-01 PASS; with no settings file both files looked for are named,
//      and a settings file that carries no hooks block is a fail finding naming it, never silence.
//      A brain with no .claude at all, whose kit is the running copy, lists none of that copy's
//      hooks.json registrations as its own: the settings file is the record under -Scope brain,
//      there or not, so the survey names the missing file and the smoke is could-not-look.
//   5. (0.3.0, review findings 4 and 27) A vendored hook that throws after it parsed stdin starts,
//      exits 0 and answers with the kit's internal-error shape: the smoke is FAIL naming the hook,
//      the event and the reply, for each of the three forms the one recognizer reads (a systemMessage:
//      guard and entry; plain context text: route; additionalContext alone: subagent). The smokes of
//      one run share one fresh marker folder, removed when the run ends, also on a throw: a run leaves
//      no doctor-smoke marker in <os temp>/design-first and no smoke folder of its own; when no such
//      folder can be made, each smoke is could-not-look, never run in another folder.
// What this file cannot see: the shim that passes -Host and -Scope (tools/settings.mjs writes it), and
// whether a real cloud container sets CLAUDE_PROJECT_DIR (the host does; a case only plants it).

import fs from 'node:fs';
import path from 'node:path';

export function hostRuns(t) {
    const { T, here, kitRoot, brain, fakeHome, ok, bad, has, hasNot, exitIs, W, WJ, newDir, jp, run, childEnv, invokeDoctor, newTestRepo, say } = t;
    const doctor = path.join(here, 'doctor.mjs');
    const parse = (name, out) => { try { return JSON.parse(out); } catch (e) { bad(`${name}: -Json output parses`, `${e.message}: ${out.slice(0, 200)}`); return null; } };
    const claimOf = (j, id) => (j && j.bands && (j.bands.claims || []).find((x) => x.id === id)) || null;
    const status = (j, id) => { const c = claimOf(j, id); return c ? c.status : '(absent)'; };
    const detail = (j, id) => { const c = claimOf(j, id); return c ? String(c.detail) : '(absent)'; };

    // ================================================================ run S: -Host and the SKIPPED status
    say('  Run S: -Host pc|cloud and the SKIPPED status', 36);
    const me = { type: 'path_exists', path: 'me.md' };
    const hostClaims = [
        { id: 'S-ROOT', type: 'path_exists', path: '${ROOT}/CLAUDE.md', why: 'a claim about the PC root tree' },
        { id: 'S-HOME', type: 'log_window_free_of', path: '%USERPROFILE%\\.claude\\hooks-old.log', needle: 'ERROR', days: 7, why: 'a claim about the PC home' },
        { id: 'S-PC', ...me, host: 'pc', why: 'typed pc' },
        { id: 'S-CLOUD', ...me, host: 'cloud', why: 'typed cloud' },
        { id: 'S-ANY', ...me, host: ['any'], why: 'typed any' },
        { id: 'S-BRAIN', type: 'path_exists', path: '${BRAIN}/me.md', why: 'no token, no host' }];
    const hostPath = path.join(brain, 'claims-host.json');
    WJ(hostPath, { schema: 1, claims: hostClaims });

    // S1: no -Host. Nothing is skipped: the host is never guessed from the machine.
    const s1 = invokeDoctor(['-ClaimsPath', hostPath, '-Json'], fakeHome);
    exitIs('S: without -Host nothing is skipped by host', s1.code, 0);
    const j1 = parse('S1', s1.out);
    if (j1) {
        if (j1.claimsPass === 6 && j1.claimsSkipped === 0) ok('S: without -Host every host claim runs: 6 pass, 0 skipped'); else bad('S: without -Host every host claim runs', `pass ${j1.claimsPass}, skipped ${j1.claimsSkipped}`);
        if (j1.host === '') ok('S: -Json names no host when none was given (never guessed)'); else bad('S: -Json host when none was given', String(j1.host));
    }

    // S2: -Host cloud. The PC-path claims and the host: pc claim are SKIPPED; the verdict is unchanged.
    const s2 = invokeDoctor(['-Host', 'cloud', '-ClaimsPath', hostPath, '-Json'], fakeHome);
    exitIs('S: under -Host cloud the skipped claims leave the verdict unchanged', s2.code, 0);
    const j2 = parse('S2', s2.out);
    if (j2) {
        if (j2.verdict === 'GREEN') ok('S: verdict GREEN with three claims skipped'); else bad('S: verdict with skipped claims', `${j2.verdict}: ${j2.reason}`);
        if (status(j2, 'S-ROOT') === 'SKIPPED') ok('S: a ${ROOT} claim under -Host cloud is SKIPPED'); else bad('S: a ${ROOT} claim under -Host cloud', `${status(j2, 'S-ROOT')}: ${detail(j2, 'S-ROOT')}`);
        if (detail(j2, 'S-ROOT') === 'path needs ${ROOT}; no pointer here') ok('S: the ${ROOT} skip says why'); else bad('S: the ${ROOT} skip detail', detail(j2, 'S-ROOT'));
        if (status(j2, 'S-HOME') === 'SKIPPED' && detail(j2, 'S-HOME') === 'path needs %USERPROFILE%; no pointer here') ok('S: a %USERPROFILE% claim under -Host cloud is SKIPPED'); else bad('S: a %USERPROFILE% claim under -Host cloud', `${status(j2, 'S-HOME')}: ${detail(j2, 'S-HOME')}`);
        if (status(j2, 'S-PC') === 'SKIPPED' && detail(j2, 'S-PC') === 'host pc claim, run with -Host cloud') ok('S: a host: pc claim under -Host cloud is SKIPPED'); else bad('S: a host: pc claim under -Host cloud', `${status(j2, 'S-PC')}: ${detail(j2, 'S-PC')}`);
        for (const id of ['S-CLOUD', 'S-ANY', 'S-BRAIN']) { if (status(j2, id) === 'PASS') ok(`S: ${id} still runs under -Host cloud`); else bad(`S: ${id} under -Host cloud`, `${status(j2, id)}: ${detail(j2, id)}`); }
        if (j2.claimsSkipped === 3) ok('S: -Json counts claimsSkipped 3'); else bad('S: claimsSkipped', String(j2.claimsSkipped));
        if (j2.claimsPass === 3) ok('S: a SKIPPED claim is never counted in claimsPass (3, not 6)'); else bad('S: claimsPass with skipped claims', String(j2.claimsPass));
        if (j2.claimsUnknown === 0) ok('S: a SKIPPED claim is not could-not-look'); else bad('S: claimsUnknown with skipped claims', String(j2.claimsUnknown));
        if (j2.host === 'cloud') ok('S: -Json names the host it was given'); else bad('S: -Json host', String(j2.host));
    }

    // S3: the same run on screen: its own band, its own count, never under "every claim holds".
    const s3 = invokeDoctor(['-Host', 'cloud', '-ClaimsPath', hostPath], fakeHome);
    has('S: the CLAIMS line counts skipped claims apart', s3.out, 'CLAIMS  3 pass  0 fail  0 could not look  3 skipped');
    has('S: SKIPPED is its own band and says it is not a pass', s3.out, 'SKIPPED  3  (not run on this host');
    has('S: a skipped claim prints under SKIP with its reason', s3.out, 'SKIP  S-ROOT  path needs ${ROOT}; no pointer here');
    hasNot('S: a skipped claim is never printed as every claim holds', s3.out, 'every claim holds');
    has('S: the claims that ran are reported as holding, with the skipped count', s3.out, 'every claim that ran holds (3 skipped, not counted)');
    has('S: the screen names the host', s3.out, 'host cloud');
    has('S: the verdict line is GREEN', s3.out, 'VERDICT: GREEN');
    let lr = null;
    try { lr = JSON.parse(fs.readFileSync(jp(brain, 'state', 'last-run.json'), 'utf8')); } catch (e) { bad('S: last-run.json after a -Host run', e.message); }
    if (lr && lr.claimsSkipped === 3 && lr.claimsPass === 3 && lr.host === 'cloud') ok('S: last-run.json records claimsSkipped apart from claimsPass, and the host'); else if (lr) bad('S: last-run.json counts', JSON.stringify({ claimsPass: lr.claimsPass, claimsSkipped: lr.claimsSkipped, host: lr.host }));

    // S4: -Host pc. The typed cloud claim is SKIPPED; the PC-path claims run.
    const s4 = invokeDoctor(['-Host', 'pc', '-ClaimsPath', hostPath, '-Json'], fakeHome);
    exitIs('S: under -Host pc the run is GREEN', s4.code, 0);
    const j4 = parse('S4', s4.out);
    if (j4) {
        if (status(j4, 'S-CLOUD') === 'SKIPPED' && detail(j4, 'S-CLOUD') === 'host cloud claim, run with -Host pc') ok('S: a host: cloud claim under -Host pc is SKIPPED'); else bad('S: a host: cloud claim under -Host pc', `${status(j4, 'S-CLOUD')}: ${detail(j4, 'S-CLOUD')}`);
        if (status(j4, 'S-ROOT') === 'PASS' && status(j4, 'S-HOME') === 'PASS' && status(j4, 'S-PC') === 'PASS') ok('S: under -Host pc the ${ROOT}, %USERPROFILE% and host: pc claims run'); else bad('S: the PC claims under -Host pc', [status(j4, 'S-ROOT'), status(j4, 'S-HOME'), status(j4, 'S-PC')].join(','));
        if (j4.claimsSkipped === 1 && j4.claimsPass === 5) ok('S: -Host pc counts 5 pass, 1 skipped'); else bad('S: -Host pc counts', `pass ${j4.claimsPass}, skipped ${j4.claimsSkipped}`);
    }

    // S5 and S6: a false claim beside skipped ones. Without -Host the ${LOCALAPPDATA} claim is could-not-look
    // (an unexpanded variable, as before); under -Host cloud it is SKIPPED and the false claim alone decides.
    const redPath = path.join(brain, 'claims-host-red.json');
    WJ(redPath, { schema: 1, claims: [
        { id: 'S-ROOT', type: 'path_exists', path: '${ROOT}/CLAUDE.md', why: 'r' },
        { id: 'S-LOCAL', type: 'path_absent', path: '${LOCALAPPDATA}/design-first/nope', why: 'r' },
        { id: 'S-FALSE', type: 'path_exists', path: '${BRAIN}/nope.md', why: 'r' }] });
    const s5 = invokeDoctor(['-ClaimsPath', redPath, '-Json'], fakeHome);
    exitIs('S: without -Host a ${LOCALAPPDATA} path is could-not-look, as before', s5.code, 2);
    const j5 = parse('S5', s5.out);
    if (j5) { if (status(j5, 'S-ROOT') === 'PASS' && status(j5, 'S-LOCAL') === 'UNKNOWN' && status(j5, 'S-FALSE') === 'FAIL') ok('S: without -Host the red file reads PASS, UNKNOWN, FAIL'); else bad('S: the red file without -Host', [status(j5, 'S-ROOT'), status(j5, 'S-LOCAL'), status(j5, 'S-FALSE')].join(',')); }
    const s6 = invokeDoctor(['-Host', 'cloud', '-ClaimsPath', redPath, '-Json'], fakeHome);
    exitIs('S: under -Host cloud a false claim that is not skipped is still RED', s6.code, 1);
    const j6 = parse('S6', s6.out);
    if (j6) {
        if (status(j6, 'S-LOCAL') === 'SKIPPED' && detail(j6, 'S-LOCAL') === 'path needs ${LOCALAPPDATA}; no pointer here') ok('S: a ${LOCALAPPDATA} claim under -Host cloud is SKIPPED, not could-not-look'); else bad('S: a ${LOCALAPPDATA} claim under -Host cloud', `${status(j6, 'S-LOCAL')}: ${detail(j6, 'S-LOCAL')}`);
        if (j6.verdict === 'RED' && j6.claimsFail === 1 && j6.claimsSkipped === 2 && j6.claimsUnknown === 0) ok('S: the verdict ignores SKIPPED: RED from the one false claim, nothing could-not-look'); else bad('S: the verdict with a false and two skipped claims', `${j6.verdict}: fail ${j6.claimsFail}, skipped ${j6.claimsSkipped}, unknown ${j6.claimsUnknown}`);
        if (/2 claim\(s\) skipped on this host/.test(String(j6.reason))) ok('S: the verdict reason names the skipped count'); else bad('S: the verdict reason', String(j6.reason));
    }

    // S7 and S8: a host nothing knows. On the switch it is could-not-look; typed on a claim it is UNKNOWN
    // even without -Host, so a typo never skips a claim in silence.
    const s7 = invokeDoctor(['-Host', 'mars', '-ClaimsPath', hostPath], fakeHome);
    exitIs('S: a host that is not pc or cloud is could-not-look', s7.code, 2);
    has('S: the bad host is named', s7.out, "-Host must be pc or cloud (got 'mars')");
    const typedPath = path.join(brain, 'claims-host-typed.json');
    WJ(typedPath, { schema: 1, claims: [{ id: 'S-BADHOST', ...me, host: 'mars', why: 'r' }] });
    const s8 = invokeDoctor(['-ClaimsPath', typedPath], fakeHome);
    exitIs('S: a claim typed with a host that is not pc, cloud or any is could-not-look, even without -Host', s8.code, 2);
    has('S: the bad typed host is named', s8.out, "????  S-BADHOST  'host' must be pc, cloud or any (got 'mars')");

    // S9 and S10: the Windows home token in lowercase. The expander reads %userprofile% as %USERPROFILE% (a
    // home folder on every host), so the skip must read it the same way or the claim runs in the cloud
    // against a Linux home; ${root} is not ${ROOT} to the expander and stays could-not-look, as before.
    const lowerPath = path.join(brain, 'claims-host-lower.json');
    WJ(lowerPath, { schema: 1, claims: [
        { id: 'S-HOME-LOWER', type: 'path_absent', path: '%userprofile%\\.claude\\nope-lower', why: 'r' },
        { id: 'S-ROOT-LOWER', type: 'path_exists', path: '${root}/CLAUDE.md', why: 'r' }] });
    const s9 = invokeDoctor(['-Host', 'cloud', '-ClaimsPath', lowerPath, '-Json'], fakeHome);
    const j9 = parse('S9', s9.out);
    if (j9) {
        if (status(j9, 'S-HOME-LOWER') === 'SKIPPED' && detail(j9, 'S-HOME-LOWER') === 'path needs %USERPROFILE%; no pointer here') ok('S: a %userprofile% claim typed in lowercase is SKIPPED under -Host cloud, as the expander reads it'); else bad('S: a lowercase %userprofile% claim under -Host cloud', `${status(j9, 'S-HOME-LOWER')}: ${detail(j9, 'S-HOME-LOWER')}`);
        if (status(j9, 'S-ROOT-LOWER') === 'UNKNOWN') ok('S: a ${root} claim is could-not-look under -Host cloud, not skipped: the expander does not read it'); else bad('S: a ${root} claim under -Host cloud', `${status(j9, 'S-ROOT-LOWER')}: ${detail(j9, 'S-ROOT-LOWER')}`);
    }
    const s10 = invokeDoctor(['-ClaimsPath', lowerPath, '-Json'], fakeHome);
    const j10 = parse('S10', s10.out);
    if (j10) { if (status(j10, 'S-HOME-LOWER') === 'PASS') ok('S: without -Host the lowercase %userprofile% claim runs'); else bad('S: the lowercase claim without -Host', `${status(j10, 'S-HOME-LOWER')}: ${detail(j10, 'S-HOME-LOWER')}`); }

    // ================================================================ run V: -Scope brain with no pointer
    say('  Run V: -Scope brain with no pointer', 36);
    const emptyHome = newDir(path.join(T, 'home-empty-host'));
    const noPointer = (extra) => { const env = childEnv(emptyHome, ''); delete env.CLAUDE_PROJECT_DIR; return { ...env, ...extra }; };
    const plantBrain = (name, withKit) => {
        const b = newTestRepo(T, name);
        W(path.join(b, 'me.md'), '---\nowner: test\n---\n');
        W(path.join(b, 'CLAUDE.md'), '# brain entry\n\nthree lines\n');
        WJ(path.join(b, 'doctor.config.json'), { schema: 1 });
        if (withKit) W(jp(b, '.claude', 'kit', 'tools', 'doctor', 'doctor.mjs'), '// a vendored Doctor stands here; nothing runs it\n');
        WJ(path.join(b, 'claims.json'), { schema: 1, claims: [
            { id: 'V-ME', type: 'path_exists', path: 'me.md', why: 'brain-relative' },
            { id: 'V-LINES', type: 'line_count', path: '${BRAIN}/CLAUDE.md', max: 60, why: 'the brain entry stays short' },
            { id: 'V-KIT', type: 'path_exists', path: '${KIT}/tools/doctor/doctor.mjs', why: 'the kit the context resolved' },
            { id: 'V-ROOT', type: 'path_exists', path: '${ROOT}/CLAUDE.md', why: 'a PC root claim' }] });
        return b;
    };
    const cb = plantBrain('cloud-brain', true);
    const cbNoKit = plantBrain('cloud-brain-nokit', false);

    const v1 = run(process.execPath, [doctor, '-Scope', 'brain'], noPointer({ CLAUDE_PROJECT_DIR: cb }));
    exitIs('V: -Scope brain on a planted brain with no pointer exits 0', v1.code, 0);
    has('V: the verdict is GREEN', v1.out, 'VERDICT: GREEN');
    has('V: root is the brain checkout', v1.out, `root ${cb}`);
    has('V: brain is the brain checkout', v1.out, `brain ${cb}`);
    has('V: the kit is the vendored copy when it holds the Doctor', v1.out, `kit ${jp(cb, '.claude', 'kit')}`);
    hasNot('V: no pointer is read', v1.out, 'pointer not found');
    has('V: the screen names the scope', v1.out, 'scope brain');
    if (fs.existsSync(jp(cb, 'state', 'last-run.json'))) ok('V: state is written under the brain checkout'); else bad('V: state under the brain', 'cloud-brain/state/last-run.json missing');

    const v2 = run(process.execPath, [doctor, '--scope', 'brain', '-Json'], noPointer({ CLAUDE_PROJECT_DIR: cb }));
    exitIs('V: --scope brain (the long form) is the same switch', v2.code, 0);
    const jv2 = parse('V2', v2.out);
    if (jv2) {
        const w2 = jv2.where || {};
        if (jv2.scope === 'brain' && w2.root === cb && w2.brain === cb && w2.kit === jp(cb, '.claude', 'kit')) ok('V: -Json where: root and brain from CLAUDE_PROJECT_DIR, kit from .claude/kit'); else bad('V: -Json where', JSON.stringify({ scope: jv2.scope, where: jv2.where }));
        for (const id of ['V-ME', 'V-LINES', 'V-KIT', 'V-ROOT']) { if (status(jv2, id) === 'PASS') ok(`V: ${id} passes under -Scope brain`); else bad(`V: ${id} under -Scope brain`, `${status(jv2, id)}: ${detail(jv2, id)}`); }
    }

    const v3 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', cbNoKit, '-Json'], noPointer({}));
    exitIs('V: -Root names the brain when CLAUDE_PROJECT_DIR is unset', v3.code, 0);
    const jv3 = parse('V3', v3.out);
    if (jv3) {
        const w3 = jv3.where || {};
        if (w3.brain === cbNoKit && w3.root === cbNoKit) ok('V: -Root is root and brain'); else bad('V: -Root where', JSON.stringify(jv3.where || jv3));
        if (w3.kit === kitRoot) ok('V: with no vendored Doctor the kit is the running copy'); else bad('V: the kit fallback', `${w3.kit} (expected ${kitRoot})`);
    }

    const v4 = run(process.execPath, [doctor, '-Scope', 'brain'], noPointer({}));
    exitIs('V: -Scope brain with neither CLAUDE_PROJECT_DIR nor -Root is could-not-look', v4.code, 2);
    has('V: the missing name is said', v4.out, 'COULD-NOT-LOOK: -Scope brain needs CLAUDE_PROJECT_DIR or -Root');
    const v5 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', path.join(T, 'no-such-brain')], noPointer({}));
    exitIs('V: -Scope brain on a folder that does not exist is could-not-look', v5.code, 2);
    has('V: the missing folder is named', v5.out, 'names a folder that does not exist');
    const v6 = run(process.execPath, [doctor, '-Scope', 'pc'], noPointer({ CLAUDE_PROJECT_DIR: cb }));
    exitIs('V: a scope that is not brain is could-not-look', v6.code, 2);
    has('V: the bad scope is named', v6.out, '-Scope must be brain');
    const v7 = run(process.execPath, [doctor, '-Scope', 'brain', '-Kit'], noPointer({ CLAUDE_PROJECT_DIR: cb }));
    exitIs('V: -Scope brain beside -Kit is could-not-look', v7.code, 2);
    // -Root names the brain of -Scope brain only: given without it (here beside -Kit) it is could-not-look,
    // never ignored in silence (review finding 24). Red first in a scratch copy of the Doctor with the
    // refusal disabled: -Kit -Root ran the kit's own claims and printed VERDICT: GREEN, exit 0.
    const v7b = run(process.execPath, [doctor, '-Kit', '-Root', T], noPointer({}));
    exitIs('V: -Root without -Scope brain (here beside -Kit) is could-not-look', v7b.code, 2);
    has('V: the -Root refusal says it is read only with -Scope brain', v7b.out, '-Root is read only with -Scope brain');

    // The cloud shim's own form: the brain scope with the cloud host. The ${ROOT} claim is skipped, the rest run.
    const v8 = run(process.execPath, [doctor, '-Scope', 'brain', '-Host', 'cloud', '-Json'], noPointer({ CLAUDE_PROJECT_DIR: cb }));
    exitIs('V: -Scope brain -Host cloud (the cloud shim) exits 0', v8.code, 0);
    const jv8 = parse('V8', v8.out);
    if (jv8) {
        if (status(jv8, 'V-ROOT') === 'SKIPPED' && status(jv8, 'V-ME') === 'PASS' && status(jv8, 'V-LINES') === 'PASS' && status(jv8, 'V-KIT') === 'PASS') ok('V: under the cloud shim the ${ROOT} claim is SKIPPED and the brain claims run'); else bad('V: the cloud shim statuses', ['V-ROOT', 'V-ME', 'V-LINES', 'V-KIT'].map((id) => `${id}=${status(jv8, id)}`).join(' '));
        if (jv8.claimsSkipped === 1 && jv8.claimsPass === 3 && jv8.verdict === 'GREEN') ok('V: the cloud shim counts 3 pass, 1 skipped, GREEN'); else bad('V: the cloud shim counts', `${jv8.verdict}: pass ${jv8.claimsPass}, skipped ${jv8.claimsSkipped}`);
    }

    // ================================================================ run V (vendored): a brain carrying the vendored kit (0.3.0, registry-readers)
    // A cloud brain holds the kit under .claude/kit/ (tools/vendor.mjs) and its hook registrations in
    // .claude/settings.json (tools/settings.mjs -Vendored), never hooks/hooks.json: the manifest leaves
    // the plugin form out. Three readers then take the registrations from what travels: the law build
    // reads hooks/registry.json (BRAIN-LAW-01's generator); the enforcement survey and the hook_smoke
    // runner read the settings file with ${CLAUDE_PROJECT_DIR} as the brain (context.mjs
    // registrationSource). Before this slice all three read hooks/hooks.json: the law build failed
    // every hook clause, the survey printed "no hooks.json", the smoke was could-not-look, exit 2.
    say('  Run V (vendored): -Scope brain on a brain carrying the vendored kit and a rendered settings file', 36);
    const vb = newTestRepo(T, 'cloud-brain-vendored');
    W(path.join(vb, 'me.md'), '---\nowner: test\n---\n');
    W(path.join(vb, 'CLAUDE.md'), '# brain entry\n');
    WJ(path.join(vb, 'doctor.config.json'), { schema: 1 });
    W(path.join(vb, 'canonical.md'), '# canonical\n\nOne subject, one file.\n');   // MAP-01's owning file (brain:canonical.md), which adopt writes into every brain
    const vbKit = jp(vb, '.claude', 'kit');
    const vbSettings = jp(vb, '.claude', 'settings.json');
    const vendored = run(process.execPath, [jp(kitRoot, 'tools', 'vendor.mjs'), '-Target', vb, '-Kit', kitRoot], noPointer({}));
    exitIs('V: tools/vendor.mjs vendors the running kit into the brain', vendored.code, 0);
    const rendered = run(process.execPath, [jp(kitRoot, 'tools', 'settings.mjs'), '-Vendored', '-Set', 'cloud-brain', '-Out', vbSettings], noPointer({}));
    exitIs('V: tools/settings.mjs -Vendored -Set cloud-brain renders the brain settings file', rendered.code, 0);
    if (fs.existsSync(jp(vbKit, 'hooks', 'registry.json')) && !fs.existsSync(jp(vbKit, 'hooks', 'hooks.json'))) ok('V: the copy carries hooks/registry.json and no hooks/hooks.json'); else bad('V: the copy carries hooks/registry.json and no hooks/hooks.json', `registry ${fs.existsSync(jp(vbKit, 'hooks', 'registry.json'))}, hooks.json ${fs.existsSync(jp(vbKit, 'hooks', 'hooks.json'))}`);
    // The brain's law inputs as adopt writes them: the kit's template overlay, an installed state that
    // names every registered hook (read from the registry, never typed), and LAW.md built by the
    // VENDORED generator from them, the way BRAIN-LAW-01 builds it again on every run.
    fs.copyFileSync(jp(kitRoot, 'templates', 'law.overlay.json'), path.join(vb, 'law.overlay.json'));
    const regRows = JSON.parse(fs.readFileSync(jp(kitRoot, 'hooks', 'registry.json'), 'utf8')).hooks;
    const hookNames = [...new Set(regRows.map((h) => path.basename(String(h.script)).replace(/\.mjs$/, '')))].sort();
    WJ(jp(vb, 'state', 'law-installed.json'), { hooks: Object.fromEntries(hookNames.map((n) => [n, true])), rootSettings: true, pointer: false });
    const vbLawArgs = ['-Source', jp(vbKit, 'law.json'), '-Overlay', path.join(vb, 'law.overlay.json'), '-Installed', jp(vb, 'state', 'law-installed.json'), '-BrainRoot', vb, '-Out', path.join(vb, 'LAW.md')];
    const vbBuild = run(process.execPath, [jp(vbKit, 'tools', 'law', 'build-law.mjs'), ...vbLawArgs], noPointer({}));
    exitIs('V: the vendored law build proves every hook clause from hooks/registry.json (exit 0)', vbBuild.code, 0);
    if (vbBuild.code !== 0) say(`        ${vbBuild.out.replace(/\s+/g, ' ').trim().slice(0, 300)}`, 90);
    hasNot('V: no clause fails for a missing hooks.json in the vendored copy', vbBuild.out, 'hooks/hooks.json does not exist');
    const vbLaw = fs.existsSync(path.join(vb, 'LAW.md')) ? fs.readFileSync(path.join(vb, 'LAW.md'), 'utf8') : '';
    has('V: the vendored LAW.md grades the guard clause HOOK', vbLaw, '| SAFE-01 | HOOK |');
    WJ(path.join(vb, 'claims.json'), { schema: 1, claims: [
        { id: 'BRAIN-LAW-01', type: 'generated_matches', generator: '${KIT}/tools/law/build-law.mjs', source: '${KIT}/law.json', overlay: '${BRAIN}/law.overlay.json', installed: '${BRAIN}/state/law-installed.json', output: '${BRAIN}/LAW.md', why: 'the brain LAW.md is the vendored build' },
        { id: 'V-SMOKE-GUARD', type: 'hook_smoke', hook: 'guard', event: 'PreToolUse', why: 'the vendored guard starts and answers' },
        { id: 'V-SMOKE-ENTRY', type: 'hook_smoke', hook: 'entry', event: 'SessionStart', why: 'the vendored entry prints the arming line' }] });
    const v9 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-Json'], noPointer({}));
    exitIs('V: -Scope brain -Host cloud on the vendored brain exits 0', v9.code, 0);
    const jv9 = parse('V9', v9.out);
    if (jv9) {
        if (status(jv9, 'BRAIN-LAW-01') === 'PASS') ok('V: BRAIN-LAW-01 PASSES: the vendored generator builds the same LAW.md'); else bad('V: BRAIN-LAW-01 on the vendored brain', `${status(jv9, 'BRAIN-LAW-01')}: ${detail(jv9, 'BRAIN-LAW-01')}`);
        if (status(jv9, 'V-SMOKE-GUARD') === 'PASS') ok('V: a hook_smoke claim on the vendored guard PASSES, read from .claude/settings.json'); else bad('V: hook_smoke on the vendored guard', `${status(jv9, 'V-SMOKE-GUARD')}: ${detail(jv9, 'V-SMOKE-GUARD')}`);
        if (status(jv9, 'V-SMOKE-ENTRY') === 'PASS') ok('V: a hook_smoke claim on the vendored entry PASSES (it prints the arming line)'); else bad('V: hook_smoke on the vendored entry', `${status(jv9, 'V-SMOKE-ENTRY')}: ${detail(jv9, 'V-SMOKE-ENTRY')}`);
        const sv9 = (jv9.bands && jv9.bands.survey) || [];
        const noHooks = sv9.filter((f) => f.kind === 'hooksJsonMissing');
        if (noHooks.length === 0) ok('V: the survey prints no "no hooks.json" finding: the settings file is the registration source'); else bad('V: the survey on the vendored brain', noHooks.map((f) => f.message).join(' | '));
        const hooks9 = (jv9.enforcement && jv9.enforcement.hooks) || [];
        const underKit = hooks9.filter((h) => path.resolve(String(h.script)).startsWith(vbKit + path.sep) && h.exists);
        if (hooks9.length === regRows.length && underKit.length === hooks9.length) ok(`V: the survey lists every registration of the settings file, resolved under the brain's .claude/kit (${hooks9.length})`); else bad('V: the survey registrations', `${hooks9.length} listed, ${underKit.length} under the kit and present (registry rows ${regRows.length}): ${JSON.stringify(hooks9.slice(0, 2))}`);
        if (!sv9.some((f) => f.kind === 'hookMissing')) ok('V: no registration is reported GONE: ${CLAUDE_PROJECT_DIR} is read as the brain'); else bad('V: registrations reported GONE', sv9.filter((f) => f.kind === 'hookMissing').map((f) => f.message).join(' | '));
        if (jv9.where && jv9.where.kit === vbKit) ok('V: the kit is the vendored copy'); else bad('V: the kit under the vendored brain', JSON.stringify(jv9.where));
    }
    // A hook that starts, exits 0 and answers with the kit's internal-error shape decided nothing (it
    // allowed the call, or let the session start, without inspecting it): the smoke is FAIL, naming the
    // hook, the event and the reply, never a pass (review findings 4 and 27). Planted in the brain's own
    // vendored copies, each throws right after it parsed stdin, so its own catch answers in its own form
    // and exits 0: a JSON systemMessage (guard 'GUARD: internal error, call allowed (...)', entry
    // 'ENTRY: internal error (...)'), plain context text (route) or additionalContext alone (subagent),
    // the three forms hooks/lib/common.mjs internalErrorReply reads. Red first: guard and entry read PASS
    // ('exit 0, JSON reply' and '<n> char(s) of context'); route and subagent read PASS while the
    // recognizer read a systemMessage alone. The copies are put back before the next run.
    const crashHooks = [
        ['guard', 'PreToolUse', 'GUARD: internal error, call allowed (planted: guard threw after it parsed stdin)'],
        ['entry', 'SessionStart', 'ENTRY: internal error (planted: entry threw after it parsed stdin)'],
        ['route', 'UserPromptSubmit', 'design-first route hook hit an internal error and injected no law this prompt: planted: route threw after it parsed stdin'],
        ['subagent', 'SubagentStart', 'design-first subagent hook hit an internal error and injected no law: planted: subagent threw after it parsed stdin']];
    const savedHooks = [];
    const plantedIn = [];
    for (const [hook] of crashHooks) {
        const p = jp(vbKit, 'hooks', `${hook}.mjs`);
        const text = fs.readFileSync(p, 'utf8');
        savedHooks.push([p, text]);
        const lines = text.split('\n');
        const at = lines.findIndex((l) => l.includes(`C.yieldToPlugin('${hook}'`));   // the line right after the stdin parse
        if (at < 0) continue;
        lines.splice(at + 1, 0, `    throw new Error('planted: ${hook} threw after it parsed stdin');`);
        fs.writeFileSync(p, lines.join('\n'));
        plantedIn.push(hook);
    }
    WJ(path.join(vb, 'claims-crash.json'), { schema: 1, claims: crashHooks.map(([hook, event]) => ({ id: `V-SMOKE-${hook.toUpperCase()}-CRASH`, type: 'hook_smoke', hook, event, why: 'r' })) });
    const vCrash = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-ClaimsPath', path.join(vb, 'claims-crash.json'), '-Json'], noPointer({}));
    for (const [p, text] of savedHooks) fs.writeFileSync(p, text);
    if (plantedIn.length === crashHooks.length) ok('V: a throw is planted right after the stdin parse in the vendored guard, entry, route and subagent'); else bad('V: a throw is planted right after the stdin parse in the vendored guard, entry, route and subagent', `no yieldToPlugin line found in: ${crashHooks.map(([h]) => h).filter((h) => !plantedIn.includes(h)).join(', ')}`);
    exitIs('V: hook_smoke on a hook that answers with its internal-error reply is RED, never GREEN', vCrash.code, 1);
    const jvCrash = parse('VCRASH', vCrash.out);
    if (jvCrash) {
        for (const [hook, event, want] of crashHooks) {
            const id = `V-SMOKE-${hook.toUpperCase()}-CRASH`;
            if (status(jvCrash, id) === 'FAIL' && detail(jvCrash, id).includes(`${hook} (${event})`) && detail(jvCrash, id).includes(want)) ok(`V: a ${event} hook that throws after parsing stdin is a FAIL smoke naming the hook, the event and its reply (${hook})`);
            else bad(`V: a ${event} hook that throws after parsing stdin is a FAIL smoke naming the hook, the event and its reply (${hook})`, `${status(jvCrash, id)}: ${detail(jvCrash, id)}`);
        }
    }
    // The smokes of one Doctor run share one fresh marker folder (DF_MARKER_DIR: a folder made with
    // fs.mkdtempSync under the OS temp folder, removed when the run ends, also on a throw), so a run leaves no
    // doctor-smoke marker in the machine's shared folder (<os temp>/design-first, where the live sessions'
    // hooks keep theirs) and no smoke folder of its own. TMPDIR, TMP and TEMP name a scratch folder for the run,
    // so the OS temp folder of the Doctor and of the hooks it starts is that folder. Red first: the smokes
    // left doctor-smoke.advised, .role and .turn in <TMPDIR>/design-first; with the folder made and never
    // removed, a design-first-smoke-* folder stayed after each run.
    const smokeHooks = [['guard', 'PreToolUse'], ['route', 'UserPromptSubmit'], ['stop', 'Stop'], ['subagent', 'SubagentStart'], ['entry', 'SessionStart']];
    WJ(path.join(vb, 'claims-smokes.json'), { schema: 1, claims: smokeHooks.map(([hook, event]) => ({ id: `V-SMOKE-${hook.toUpperCase()}`, type: 'hook_smoke', hook, event, why: 'r' })) });
    const tempLeft = (tmp) => {
        const shared = jp(tmp, 'design-first');
        const markers = fs.existsSync(shared) ? fs.readdirSync(shared).filter((f) => f.startsWith('doctor-smoke')) : [];
        const folders = fs.readdirSync(tmp).filter((f) => f.startsWith('design-first-smoke-'));
        return { markers, folders };
    };
    const smokeTmp = newDir(path.join(T, 'smoke-tmp'));
    const vSmokes = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-ClaimsPath', path.join(vb, 'claims-smokes.json'), '-Json'], noPointer({ TMPDIR: smokeTmp, TMP: smokeTmp, TEMP: smokeTmp }));
    exitIs('V: five hook smokes on the vendored brain with the OS temp folder a scratch folder exit 0', vSmokes.code, 0);
    const jvSmokes = parse('VSMOKES', vSmokes.out);
    if (jvSmokes) { const notPass = smokeHooks.map(([h]) => `V-SMOKE-${h.toUpperCase()}`).filter((id) => status(jvSmokes, id) !== 'PASS'); if (notPass.length === 0) ok('V: every one of the five smokes PASSES in its run marker folder'); else bad('V: every one of the five smokes PASSES in its run marker folder', notPass.map((id) => `${id} ${status(jvSmokes, id)}: ${detail(jvSmokes, id)}`).join(' | ')); }
    let left = tempLeft(smokeTmp);
    if (left.markers.length === 0) ok('V: a Doctor run leaves no doctor-smoke marker in <os temp>/design-first'); else bad('V: a Doctor run leaves no doctor-smoke marker in <os temp>/design-first', `left there: ${left.markers.join(', ')}`);
    if (left.folders.length === 0) ok('V: the run removes its own smoke marker folder when it ends'); else bad('V: the run removes its own smoke marker folder when it ends', `left in the OS temp folder: ${left.folders.join(', ')}`);
    // The same smokes, then a throw in the verdict step of the brain's vendored Doctor (a copy of the running
    // one, put back after): the crash handler ends the run through process.exit, and the folder still goes.
    const vbReport = jp(vbKit, 'tools', 'doctor', 'report.mjs');
    const vbReportText = fs.readFileSync(vbReport, 'utf8');
    if (!/export function getVerdict\(/.test(vbReportText)) bad('V: the vendored verdict step can be planted', 'report.mjs has no getVerdict export');
    fs.writeFileSync(vbReport, vbReportText.replace(/export function getVerdict\(/, "export function getVerdict() { throw new Error('planted: the verdict step throws'); }\nfunction getVerdictReplaced("));
    const throwTmp = newDir(path.join(T, 'smoke-tmp-throw'));
    const vThrow = run(process.execPath, [jp(vbKit, 'tools', 'doctor', 'doctor.mjs'), '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-ClaimsPath', path.join(vb, 'claims-smokes.json')], noPointer({ TMPDIR: throwTmp, TMP: throwTmp, TEMP: throwTmp }));
    fs.writeFileSync(vbReport, vbReportText);
    exitIs('V: the smokes ran, then the verdict step threw: could-not-look', vThrow.code, 2);
    has('V: the crash line names the planted throw', vThrow.out, 'the Doctor stopped: planted: the verdict step throws');
    left = tempLeft(throwTmp);
    if (left.markers.length === 0 && left.folders.length === 0) ok('V: a Doctor run that throws after its smokes leaves no smoke marker and no smoke folder in the OS temp folder'); else bad('V: a Doctor run that throws after its smokes leaves no smoke marker and no smoke folder in the OS temp folder', `markers: ${left.markers.join(', ') || 'none'}; folders: ${left.folders.join(', ') || 'none'}`);
    // No marker folder can be made (the OS temp folder is a file, so fs.mkdtempSync fails): each smoke is
    // could-not-look with that reason, never run in another folder and never a pass. Red first: with the
    // failure left to the claim runner's catch, each detail read 'error: ENOTDIR ...'.
    const tmpFile = jp(T, 'smoke-tmp-file');
    fs.writeFileSync(tmpFile, 'a file where the OS temp folder should be\n');
    const vNoDir = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-ClaimsPath', path.join(vb, 'claims-smokes.json'), '-Json'], noPointer({ TMPDIR: tmpFile, TMP: tmpFile, TEMP: tmpFile }));
    exitIs('V: no smoke marker folder can be made (the OS temp folder is a file): could-not-look', vNoDir.code, 2);
    const jvNoDir = parse('VNODIR', vNoDir.out);
    if (jvNoDir) {
        const off = smokeHooks.map(([h]) => `V-SMOKE-${h.toUpperCase()}`).filter((id) => !(status(jvNoDir, id) === 'UNKNOWN' && detail(jvNoDir, id).includes('no marker folder for the smoke could be made')));
        if (off.length === 0) ok('V: a smoke with no marker folder is UNKNOWN and says so, never run elsewhere, never a pass');
        else bad('V: a smoke with no marker folder is UNKNOWN and says so, never run elsewhere, never a pass', off.map((id) => `${id} ${status(jvNoDir, id)}: ${detail(jvNoDir, id)}`).join(' | '));
    }
    // A hook the settings file does not register is could-not-look naming that file, never a pass.
    WJ(path.join(vb, 'claims-unreg.json'), { schema: 1, claims: [{ id: 'V-SMOKE-NONE', type: 'hook_smoke', hook: 'nonesuch', event: 'PreToolUse', why: 'r' }] });
    const v10 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-ClaimsPath', path.join(vb, 'claims-unreg.json'), '-Json'], noPointer({}));
    exitIs('V: a hook_smoke claim on a hook the settings file does not register is could-not-look', v10.code, 2);
    const jv10 = parse('V10', v10.out);
    if (jv10) { if (status(jv10, 'V-SMOKE-NONE') === 'UNKNOWN' && detail(jv10, 'V-SMOKE-NONE').includes(`not registered for PreToolUse in ${vbSettings}`)) ok('V: the could-not-look names the settings file as the record'); else bad('V: the unregistered smoke detail', `${status(jv10, 'V-SMOKE-NONE')}: ${detail(jv10, 'V-SMOKE-NONE')}`); }
    // With the settings file gone the brain registers nothing: the survey says so naming both files it
    // looked for, the smoke is could-not-look naming them, and the law build still passes: its record
    // is the registry, which travels.
    fs.renameSync(vbSettings, `${vbSettings}.away`);
    const v11 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-Json'], noPointer({}));
    exitIs('V: with no settings file the vendored brain is could-not-look (the smoke has no record)', v11.code, 2);
    const jv11 = parse('V11', v11.out);
    if (jv11) {
        const f11 = ((jv11.bands && jv11.bands.survey) || []).find((x) => x.kind === 'hooksJsonMissing');
        if (f11 && f11.message.includes(`no hooks.json at ${jp(vbKit, 'hooks', 'hooks.json')}`) && f11.message.includes(`no settings file at ${vbSettings}`)) ok('V: with no settings file the survey names both files it looked for'); else bad('V: the survey with no settings file', f11 ? f11.message : 'no hooksJsonMissing finding');
        if (status(jv11, 'V-SMOKE-GUARD') === 'UNKNOWN' && detail(jv11, 'V-SMOKE-GUARD').includes(vbSettings)) ok('V: with no settings file the smoke is could-not-look naming it'); else bad('V: the smoke with no settings file', `${status(jv11, 'V-SMOKE-GUARD')}: ${detail(jv11, 'V-SMOKE-GUARD')}`);
        if (status(jv11, 'BRAIN-LAW-01') === 'PASS') ok('V: the law build needs no settings file: the registry is its record'); else bad('V: BRAIN-LAW-01 with no settings file', `${status(jv11, 'BRAIN-LAW-01')}: ${detail(jv11, 'BRAIN-LAW-01')}`);
    }
    fs.renameSync(`${vbSettings}.away`, vbSettings);
    // A settings file that is there but carries no hooks block (adopt -Vendor false writes
    // templates/root-settings.json as it is; an attach keeps a 0.2.x file; a hand-written one)
    // registers nothing, the same silence as no file at all: the survey says so as a fail finding
    // naming the file, the smoke is could-not-look saying the same, and nothing reads as a pass.
    // Red first: the survey printed no registration finding when the record parsed and had no
    // hooks key, so a brain with no hook loaded looked clean.
    const vbSettingsBytes = fs.readFileSync(vbSettings);
    fs.copyFileSync(jp(kitRoot, 'templates', 'root-settings.json'), vbSettings);
    const v11b = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', vb, '-Host', 'cloud', '-Json'], noPointer({}));
    exitIs('V: a settings file with no hooks block registers nothing: the smoke is could-not-look', v11b.code, 2);
    const jv11b = parse('V11b', v11b.out);
    if (jv11b) {
        const f11b = ((jv11b.bands && jv11b.bands.survey) || []).find((x) => x.kind === 'hooksJsonMissing');
        if (f11b && f11b.severity === 'fail' && f11b.message.includes(`no hooks block in ${vbSettings}`)) ok('V: a settings file with no hooks block is a fail finding naming the file, never silence'); else bad('V: the survey on a settings file with no hooks block', f11b ? `${f11b.severity}: ${f11b.message}` : 'no hooksJsonMissing finding: the survey is silent');
        if (((jv11b.enforcement && jv11b.enforcement.hooks) || []).length === 0) ok('V: no registration is listed from a settings file with no hooks block'); else bad('V: registrations from a settings file with no hooks block', JSON.stringify(((jv11b.enforcement && jv11b.enforcement.hooks) || []).slice(0, 2)));
        if (status(jv11b, 'V-SMOKE-GUARD') === 'UNKNOWN' && detail(jv11b, 'V-SMOKE-GUARD').includes(`no hooks block in ${vbSettings}`)) ok('V: the smoke on a settings file with no hooks block says so, naming the file'); else bad('V: the smoke on a settings file with no hooks block', `${status(jv11b, 'V-SMOKE-GUARD')}: ${detail(jv11b, 'V-SMOKE-GUARD')}`);
    }
    fs.writeFileSync(vbSettings, vbSettingsBytes);
    // Under -Scope brain the settings file is the record even beside a running copy that has a
    // hooks.json (a brain with no vendored Doctor): its registrations resolve under the brain, and
    // one naming a script the brain does not carry is reported GONE there, not read as the plugin's.
    fs.mkdirSync(jp(cbNoKit, '.claude'), { recursive: true });
    fs.copyFileSync(vbSettings, jp(cbNoKit, '.claude', 'settings.json'));
    const v12 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', cbNoKit, '-Host', 'cloud', '-Json'], noPointer({}));
    const jv12 = parse('V12', v12.out);
    if (jv12) {
        const gone = ((jv12.bands && jv12.bands.survey) || []).filter((f) => f.kind === 'hookMissing');
        if (gone.length === regRows.length && gone.every((f) => path.resolve(String(f.path)).startsWith(jp(cbNoKit, '.claude', 'kit') + path.sep))) ok('V: under -Scope brain the settings file is the record beside a running copy with hooks.json: its registrations resolve under the brain and are reported GONE there'); else bad('V: the settings record beside a running copy', `${gone.length} GONE of ${regRows.length}: ${gone.slice(0, 2).map((f) => f.message).join(' | ')}`);
    }
    // A brain with no .claude at all (no vendored kit, no settings file) under -Scope brain: the kit is
    // the running copy, which carries hooks/hooks.json, and before this fix the registrations were read
    // from THAT file, so the survey listed the checkout's hooks as registered and a hook_smoke claim
    // PASSED for a brain that loads no hook. Under -Scope brain the settings file is the only record:
    // nothing is listed as registered, the survey names the missing settings file as a fail finding,
    // and the smoke is could-not-look naming it, never a pass.
    const bare = plantBrain('cloud-brain-bare', false);
    const bareSettings = jp(bare, '.claude', 'settings.json');
    WJ(path.join(bare, 'claims-smoke.json'), { schema: 1, claims: [{ id: 'V-SMOKE-BARE', type: 'hook_smoke', hook: 'guard', event: 'PreToolUse', why: 'r' }] });
    const v14 = run(process.execPath, [doctor, '-Scope', 'brain', '-Root', bare, '-Host', 'cloud', '-ClaimsPath', path.join(bare, 'claims-smoke.json'), '-Json'], noPointer({}));
    exitIs("V: a brain with no .claude at all is could-not-look on a hook_smoke claim (no record; the running copy's hooks.json is not one)", v14.code, 2);
    const jv14 = parse('V14', v14.out);
    if (jv14) {
        const hooks14 = (jv14.enforcement && jv14.enforcement.hooks) || [];
        if (hooks14.length === 0) ok('V: with no settings file no registration is listed as ok for that brain'); else bad('V: registrations listed for a brain with no .claude', `${hooks14.length} listed, the first ${JSON.stringify(hooks14[0])}`);
        const f14 = ((jv14.bands && jv14.bands.survey) || []).find((x) => x.kind === 'hooksJsonMissing');
        if (f14 && f14.severity === 'fail' && f14.message.includes(`no settings file at ${bareSettings}`)) ok('V: the survey prints the fail finding naming the missing settings file of that brain'); else bad('V: the survey on a brain with no .claude', f14 ? `${f14.severity}: ${f14.message}` : 'no hooksJsonMissing finding: the survey is silent');
        if (status(jv14, 'V-SMOKE-BARE') === 'UNKNOWN' && detail(jv14, 'V-SMOKE-BARE').includes(bareSettings)) ok('V: the smoke on a brain with no .claude is could-not-look naming its settings file'); else bad('V: the smoke on a brain with no .claude', `${status(jv14, 'V-SMOKE-BARE')}: ${detail(jv14, 'V-SMOKE-BARE')}`);
        if (jv14.where && jv14.where.kit === kitRoot) ok('V: the kit under that brain is the running copy (no vendored Doctor)'); else bad('V: the kit under a brain with no .claude', JSON.stringify(jv14.where));
    }
    // The pointer scope, with a pluginRoot that carries no hooks.json (the vendored copy named as the
    // plugin) and a root settings file: the registrations come from the settings file there too.
    const vbPointer = path.join(T, 'pointer-vendored.json');
    WJ(vbPointer, { schema: 1, root: vb, brain: vb, pluginRoot: vbKit, pluginKind: 'checkout' });
    const v13 = run(process.execPath, [doctor, '-Json'], { ...noPointer({}), DF_POINTER_PATH: vbPointer });
    exitIs('V: the pointer scope on a pluginRoot with no hooks.json and a root settings file exits 0', v13.code, 0);
    const jv13 = parse('V13', v13.out);
    if (jv13) {
        const sv13 = (jv13.bands && jv13.bands.survey) || [];
        if (!sv13.some((f) => f.kind === 'hooksJsonMissing') && !sv13.some((f) => f.kind === 'hookMissing')) ok('V: under the pointer scope the settings file stands in for a missing hooks.json'); else bad('V: the pointer scope registrations', sv13.filter((f) => f.kind === 'hooksJsonMissing' || f.kind === 'hookMissing').map((f) => f.message).join(' | '));
        if (status(jv13, 'V-SMOKE-GUARD') === 'PASS') ok('V: the smoke under the pointer scope PASSES from the settings file'); else bad('V: the smoke under the pointer scope', `${status(jv13, 'V-SMOKE-GUARD')}: ${detail(jv13, 'V-SMOKE-GUARD')}`);
    }
}
