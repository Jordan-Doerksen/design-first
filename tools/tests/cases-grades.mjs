// cases-grades.mjs - hook self-test cases for grades that must match what their mechanism does
// (CR-2026-10-15-GAPS D4 and D7). Imported by run.mjs, which owns the fixtures and helpers used
// here. Never run directly.
//
// A grade says whether a machine will stop you. Each case ties a grade to the mechanism on this
// tree. The Stop card blocks the first stop once and yields on the second, so a clause it carries
// grades ADVISE and the card names it and asks about it (GATE-06 included, on every card). A survey
// finding turns the Doctor RED only when it is a fail and surveyStrict is on, and the template ships
// it off, so no kit clause is GATE on a survey anchor; an anchor above a warn declares mode advise,
// so the law build refuses GATE on it in a brain too. Adopt does not install the commit-msg shim
// (read from adopt's plan, not its text), so no kit clause is GATE on the shim. Guard rule 11
// refuses a push and writes no hand-back, so the hand-back is its own BUILDABLE clause.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export default async function gradesCases(t) {
    const { T, kit, hooks, root, repoClean, record, section, like, blank, jp, put, readText, sleepMs, newRepo, parseOut, route, stop, ledger } = t;

    section('-- grades: each grade matches what its mechanism does');
    const law = JSON.parse(readText(path.join(kit, 'law.json')));
    const refOf = (c) => (c.enforcedBy && c.enforcedBy.ref != null ? String(c.enforcedBy.ref) : '');
    // The clause ids in the card's first line: "... then stop (DES-07, GATE-05, ...; the hook asks once per turn)."
    const headIds = (r) => {
        const j = parseOut(r.out);
        const head = j && j.reason ? String(j.reason).split('\n')[0] : '';
        const m = /\(([^;)]*);/.exec(head);
        return m ? m[1].split(',').map((s) => s.trim()).filter((s) => s) : [];
    };
    const refIds = (pattern, grade) => law.clauses.filter((c) => c.enforcedBy && like(refOf(c), pattern) && (!grade || c.grade === grade)).map((c) => String(c.id));

    // ---- D4: the Stop card names every clause it carries, and each one grades ADVISE
    // An old repository: no interview line, so the first line names the five that ride on every card.
    put(ledger('gr-card'), jp(repoClean, 'src', 'main.py') + '\t\n');
    const card = stop('gr-card', false);
    const ids = headIds(card);
    const five = ['DES-07', 'GATE-05', 'GATE-06', 'GATE-07', 'GAME-12'];
    const missing = five.filter((x) => !ids.includes(x));
    record('grades: the card names GAME-12 with the other clauses it carries', 'named', missing.length === 0 ? 'named' : 'missing: ' + missing.join(', '), card.out);
    record('grades: the card asks for the verify gate command and its pasted output (GAME-12)', 'asked', like(card.out, '*Inner gate (GAME-12)*verify gate command and its output, pasted*') ? 'asked' : 'missing', card.out);
    // GATE-06 is named on every card, so every card asks about it: a turn that changes behaviour and
    // leaves DECISIONS.md alone is the common case of a missing Change Request (second review).
    record('grades: the card asks whether the turn needs a Change Request (GATE-06), with no DECISIONS.md change', 'asked', like(card.out, '*Change Request (GATE-06): did this turn change design, behaviour, config, risk, execution, data flow or dependencies?*name its Change Request*') ? 'asked' : 'missing', card.out);
    record('grades: no interview line on the card -> GATE-01 not named on it', 'unnamed', ids.length > 0 && !ids.includes('GATE-01') ? 'unnamed' : 'named: ' + ids.join(', '), card.out);

    // A repository born this turn, with no question asked: the interview line, so GATE-01 is named too.
    route('start the new tool', 'gr-born', root);
    sleepMs(50);
    const born = newRepo('repo-born-grades');
    put(jp(born, 'src', 'tool.py'), 'print(8)');
    put(ledger('gr-born'), jp(born, 'src', 'tool.py') + '\t\n');
    const bornCard = stop('gr-born', false);
    const bornIds = headIds(bornCard);
    record('grades: the interview line on the card -> GATE-01 named on its first line', 'named', like(bornCard.out, '*GATE-01: every addition*') && bornIds.includes('GATE-01') ? 'named' : 'missing: ' + bornIds.join(', '), bornCard.out);

    // Every clause law.json puts on a Stop hook anchor is named on the card that carries all of them.
    const onStop = refIds('hooks/stop.mjs#*', '');
    const unnamed = onStop.filter((x) => !bornIds.includes(x));
    record('grades: every clause law.json grades on the Stop hook is named on the card', 'all', onStop.length > 0 && unnamed.length === 0 ? 'all' : 'unnamed: ' + unnamed.join(', '), onStop.join(', '));

    // The hook yields on the second stop whatever the answer says, so HOOK ("refuses") overstates it.
    const again = stop('gr-card', true);
    const yields = again.code === 0 && blank(again.out);
    const notAdvise = law.clauses.filter((c) => onStop.includes(c.id) && c.grade !== 'ADVISE').map((c) => `${c.id}=${c.grade}`);
    record('grades: the Stop card yields on the second stop, so each clause on it grades ADVISE', 'advise', !yields ? 'blocks-again' : notAdvise.length === 0 ? 'advise' : 'overstated: ' + notAdvise.join(', '), again.out);
    const modes = [...readText(path.join(hooks, 'stop.mjs')).matchAll(/^\/\/\s*anchor:\s*(\S+)\s+mode:\s*(\S+)/gm)].map((m) => `${m[1]}=${m[2]}`);
    record('grades: the Stop hook anchors declare mode advise', 'advise', modes.length >= 2 && modes.every((x) => like(x, '*=advise')) ? 'advise' : modes.join(', '));

    // ---- D7: a grade never rests on a mechanism the kit does not turn on
    // The survey: a finding changes the verdict only when it is a fail and surveyStrict is on. Each
    // survey anchor is the comment line right above the finding it marks.
    const strict = Boolean(JSON.parse(readText(path.join(kit, 'templates', 'doctor.config.json'))).surveyStrict);
    const surveyLines = readText(path.join(kit, 'tools', 'doctor', 'survey.mjs')).split(/\r?\n/);
    const sev = {}; const mode = {};
    for (let i = 0; i < surveyLines.length - 1; i++) {
        const a = /^\s*\/\/\s*anchor:\s*(\S+)\s+mode:\s*(\S+)/.exec(surveyLines[i]);
        if (!a) continue;
        mode[a[1]] = a[2];
        const s = /finding\(\s*'(\w+)'/.exec(surveyLines[i + 1]);
        if (s) sev[a[1]] = s[1];
    }
    const sevKeys = Object.keys(sev).sort();
    // The declared mode says what the finding does, so the law build (validate.mjs, a tool ref needs
    // mode gate) refuses a GATE grade on a finding that never changes the verdict: gate above a fail,
    // advise above a warn. Workaround (CR-2026-10-15-GAPS second review): survey-unpushed and
    // survey-no-gitattributes declared gate above a warn, so an overlay could grade VCS-04 or DES-09
    // GATE on them and the build accepted it.
    const modeBad = sevKeys.filter((k) => mode[k] !== (sev[k] === 'fail' ? 'gate' : 'advise')).map((k) => `${k}=${mode[k]} above ${sev[k]}`);
    record('grades: each survey anchor declares gate above a fail finding and advise above a warn', 'matched', sevKeys.length >= 5 && modeBad.length === 0 ? 'matched' : sevKeys.length < 5 ? `anchors read: ${sevKeys.length}` : 'mismatched: ' + modeBad.join(', '));
    // The same, through the real law build: an overlay that grades VCS-04 GATE on the warn finding is
    // refused, and one that grades VCS-01 GATE on a fail finding (what a strict brain does) builds.
    const build = (name, overrides) => {
        const ov = path.join(T, `${name}.overlay.json`);
        put(ov, JSON.stringify({ schema: 1, clauses: [], overrides }, null, 2));
        const r = spawnSync(process.execPath, [path.join(kit, 'tools', 'law', 'build-law.mjs'), '-Source', path.join(kit, 'law.json'), '-Overlay', ov, '-Out', path.join(T, `${name}.LAW.md`)], { encoding: 'utf8', windowsHide: true });
        return { code: r.status == null ? -1 : r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, '') };
    };
    const warnGate = build('gr-warn-gate', { 'VCS-04': { grade: 'GATE', enforcedBy: { kind: 'tool', ref: 'tools/doctor/survey.mjs#survey-unpushed' } } });
    const failGate = build('gr-fail-gate', { 'VCS-01': { grade: 'GATE', enforcedBy: { kind: 'tool', ref: 'tools/doctor/survey.mjs#survey-no-remote' } } });
    record('grades: the law build refuses GATE on a survey warn and builds GATE on a survey fail', 'refused-built', warnGate.code === 1 && like(warnGate.out, "*survey-unpushed' declares mode advise*") && failGate.code === 0 ? 'refused-built' : `warn-gate exit ${warnGate.code}, fail-gate exit ${failGate.code}`, warnGate.out + ' | ' + failGate.out);
    const overSurvey = law.clauses.filter((c) => c.grade === 'GATE' && c.enforcedBy && like(refOf(c), 'tools/doctor/survey.mjs#*'))
        .filter((c) => { const a = refOf(c).split('#')[1]; return !(strict && sev[a] === 'fail'); }).map((c) => String(c.id));
    record('grades: no kit clause is GATE on a survey finding the shipped config never makes RED', 'honest', sevKeys.length >= 5 && overSurvey.length === 0 ? 'honest' : sevKeys.length < 5 ? `anchors read: ${sevKeys.length}` : 'overstated: ' + overSurvey.join(', '), `surveyStrict in the template: ${strict}`);
    const surveyIds = ['VCS-01', 'VCS-02', 'VCS-04', 'VCS-22', 'DES-09'];
    const notHonour = law.clauses.filter((c) => surveyIds.includes(c.id) && c.grade !== 'HONOUR').map((c) => `${c.id}=${c.grade}`);
    record('grades: the survey clauses grade HONOUR in the kit (a strict brain re-grades by overlay)', 'honour', notHonour.length === 0 ? 'honour' : notHonour.join(', '));

    // The commit-msg shim: adopt does not install it, so the kit cannot say an adopter has it. Read from
    // adopt's copy step itself: newPlan returns every file adopt writes from the templates (LAW.md,
    // the snapshots and the pointer are written apart, and none of them is the shim), so a planned file
    // that carries the shim's bytes, or lands at hooks/commit-msg, is the install. The plan is built with
    // a brain that is a repository, so the git branch of the plan is read too.
    // Workaround (CR-2026-10-15-GAPS second review): the case searched adopt's text for the word
    // 'commit-msg', so a comment that named the shim counted as installing it.
    let planErr = ''; let plan = [];
    try {
        const F = await import(pathToFileURL(path.join(kit, 'tools', 'lib', 'df-files.mjs')).href);
        const P = await import(pathToFileURL(path.join(kit, 'tools', 'lib', 'adopt-plan.mjs')).href);
        const sbx = path.join(T, 'gr-adopt-plan');
        const shimSha = F.normalisedSha256(fs.readFileSync(path.join(kit, 'templates', 'commit-msg')));
        const items = P.newPlan({ kit, root: sbx, brain: path.join(sbx, 'brain'), ownerName: 'Plan Owner', gitHubOwners: ['plan-owner'],
            frozenPaths: [], settingsTarget: jp(sbx, '.claude', 'settings.json'), snapshotPairs: [], brainIsRepo: true, today: '2026-10-15' });
        plan = items.map((it) => ({ path: String(it.path), shim: F.normalisedSha256(it.bytes) === shimSha }));
    } catch (e) { planErr = e && e.message ? e.message : String(e); }
    const shimFiles = plan.filter((p) => p.shim || /[\\/]hooks[\\/]commit-msg$/i.test(p.path)).map((p) => p.path);
    const onShim = refIds('tools/vcs/law-claim.mjs#*', 'GATE');
    record("grades: no kit clause is GATE on the commit-msg shim while adopt's plan does not copy it", 'honest', planErr || plan.length < 10 ? `plan not read: ${planErr} (${plan.length} file(s))` : shimFiles.length > 0 || onShim.length === 0 ? 'honest' : 'overstated: ' + onShim.join(', '), `planned files: ${plan.length}; shim copies: ` + shimFiles.join(', '));
    const v5 = law.clauses.find((c) => c.id === 'VOICE-05');
    record('grades: VOICE-05 is BUILDABLE on DECISIONS.md 2.7, as VCS-23 is', 'buildable', v5 && v5.grade === 'BUILDABLE' && v5.enforcedBy.kind === 'planned' && v5.enforcedBy.ref === 'DECISIONS.md#2.7' ? 'buildable' : `${v5 && v5.grade} ${v5 && refOf(v5)}`);

    // The loop's hand-back: guard rule 11 refuses a push or a merge and writes no card and no command,
    // so the clause graded on that anchor carries the refusal only. The state card and the push command
    // are loop-runner work and print BUILDABLE on DECISIONS.md 2.8 (AUTO-13), as the other runner rules do.
    const onPush = law.clauses.filter((c) => c.enforcedBy && refOf(c) === 'hooks/guard.mjs#loop-no-push');
    const pushOver = onPush.filter((c) => /state card|push command/i.test(String(c.rule))).map((c) => String(c.id));
    const back = law.clauses.filter((c) => /state card/i.test(String(c.rule)) && /push command/i.test(String(c.rule)));
    const backBad = back.filter((c) => c.grade !== 'BUILDABLE' || !c.enforcedBy || String(c.enforcedBy.kind) !== 'planned' || refOf(c) !== 'DECISIONS.md#2.8').map((c) => `${c.id}=${c.grade}`);
    record('grades: the loop-no-push clause carries no hand-back; the hand-back is BUILDABLE on 2.8', 'split', onPush.length > 0 && pushOver.length === 0 && back.length === 1 && backBad.length === 0 ? 'split' : `on loop-no-push: ${pushOver.join(', ')}; hand-back: ${back.map((c) => c.id).join(', ')} ${backBad.join(', ')}`);
}
