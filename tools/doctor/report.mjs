// report.mjs - the verdict, the three bands on screen, -Json, and state/.
// The only files written anywhere by the Doctor are <stateDir>/*, which are GENERATED.
// Determinism: repos.generated.md is sorted and carries no timestamp, so a re-run with nothing
// changed produces a byte-identical file. The timestamp lives in last-run.json alone.
//
// Config read here: surveyStrict (SPEC 5.3).

import fs from 'node:fs';
import path from 'node:path';
import { getLeaf } from '../../hooks/lib/common.mjs';
import { getPointerPath } from './context.mjs';
import { byName } from './util.mjs';

// Bands -> exit code. COULD-NOT-LOOK wins: a run that could not look is never a pass, whatever else
// it found. Then CLAIMS: any false claim is RED. Then SURVEY: fail-severity findings turn RED only
// when surveyStrict is true; otherwise they are REPORTED and the exit is 0.
export function getVerdict(claims, survey, couldNotLook, surveyStrict) {
    const claimFails = claims.filter((c) => c.status === 'FAIL').length;
    const surveyFails = survey.filter((f) => f.severity === 'fail').length;
    // anchor: could-not-look  mode: gate  verbs: report-green,look
    if (couldNotLook.length > 0) return { verdict: 'COULD-NOT-LOOK', code: 2, reason: 'something could not be checked' };
    if (claimFails > 0) return { verdict: 'RED', code: 1, reason: `${claimFails} false claim(s)` };
    if (surveyStrict && surveyFails > 0) return { verdict: 'RED', code: 1, reason: `${surveyFails} survey finding(s), surveyStrict is true` };
    return { verdict: 'GREEN', code: 0, reason: surveyFails > 0 ? `${surveyFails} survey finding(s) REPORTED, not counted (surveyStrict false)` : 'nothing needs action' };
}

const writeText = (p, text) => fs.writeFileSync(p, text, 'utf8');
const sortRepos = (repos) => [...repos].sort((a, b) => byName(a.path, b.path));

export function writeState({ stateDir, repos, claims, survey, couldNotLook, verdict, stamp, mode }) {
    fs.mkdirSync(stateDir, { recursive: true });
    const sorted = sortRepos(repos);
    writeText(path.join(stateDir, 'repos.json'), JSON.stringify(sorted, null, 2) + '\n');

    const md = [
        '# Repository state (GENERATED - do not edit)',
        '',
        'Written by the design-first Doctor. Run the Doctor to refresh. The run time is in',
        '`last-run.json`, deliberately not here, so a re-run with nothing changed is byte-identical.',
        '',
        '| Repo | Remote | Ahead | Dirty | Flags |',
        '|---|---|---|---|---|',
    ];
    for (const r of sorted) {
        if (r.archived || r.worktree) continue;   // worktrees are folded into their parents
        const rem = r.remote === '' ? 'none' : r.ownsRemote ? 'yours' : 'FOREIGN';
        const flags = [];
        if (r.shallow) flags.push('shallow');
        if (r.frozen) flags.push('frozen');
        if (r.tombstoned) flags.push('tombstone');
        if (!r.hasAttrs) flags.push('no-gitattributes');
        md.push(`| \`${r.path}\` | ${rem} | ${r.ahead != null ? r.ahead : '-'} | ${r.dirty} | ${flags.join(', ')} |`);
    }
    writeText(path.join(stateDir, 'repos.generated.md'), md.join('\n') + '\n');

    const count = (list, f) => list.filter(f).length;
    const last = {
        ranAt: stamp, mode, verdict: verdict.verdict, exitCode: verdict.code,
        repoCount: count(repos, (r) => !r.archived && !r.worktree),
        worktreeCount: count(repos, (r) => !r.archived && r.worktree),
        claimsPass: count(claims, (c) => c.status === 'PASS'),
        claimsFail: count(claims, (c) => c.status === 'FAIL'),
        claimsUnknown: count(claims, (c) => c.status === 'UNKNOWN'),
        surveyFail: count(survey, (f) => f.severity === 'fail'),
        surveyWarn: count(survey, (f) => f.severity === 'warn'),
        surveyInfo: count(survey, (f) => f.severity === 'info'),
        accepted: count(survey, (f) => f.severity === 'accepted'),
        couldNotLook: couldNotLook.length,
    };
    writeText(path.join(stateDir, 'last-run.json'), JSON.stringify(last, null, 2) + '\n');
}

export function jsonReport({ ctx, repos, enforcement, claims, survey, couldNotLook, verdict, stamp, mode }) {
    const e = enforcement || {};
    return JSON.stringify({
        ranAt: stamp, mode, verdict: verdict.verdict, exitCode: verdict.code, reason: verdict.reason,
        where: { root: ctx.root, brain: ctx.brain, kit: ctx.kit, pluginRoot: ctx.pluginRoot, pointer: getPointerPath() },
        bands: {
            claims: claims.map((c) => ({ id: c.id, type: c.type, status: c.status, detail: c.detail })),
            survey: survey.map((f) => ({ severity: f.severity, kind: f.kind, path: f.path, message: f.message })),
            couldNotLook: couldNotLook.map(String),
        },
        enforcement: {
            hooks: (e.hooks || []).map((h) => ({ event: h.event, script: h.script, exists: h.exists })),
            settingsFound: e.settingsFound || [], denyRules: e.denyRules ?? 0, askRules: e.askRules ?? 0,
            softDenyTotal: e.softDenyTotal ?? 0, softDenyFrozen: e.softDenyFrozen ?? 0,
            fenceLogExists: e.fenceLogExists ?? false, fenceTrips: e.fenceTrips ?? 0, fenceLastTrip: e.fenceLastTrip ?? '',
        },
        repos: sortRepos(repos).map((r) => ({ path: r.path, remote: r.remote, ownsRemote: r.ownsRemote, ahead: r.ahead, dirty: r.dirty, shallow: r.shallow, frozen: r.frozen, archived: r.archived, worktree: Boolean(r.worktree), parent: String(r.parent ?? '') })),
    }, null, 2);
}

// Colour only on a terminal that wants it; a pipe, a file and NO_COLOR get plain text.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const COLORS = { Cyan: 36, Yellow: 33, Red: 31, Green: 32, Magenta: 35, DarkGray: 90 };
function say(text = '', color = null) {
    process.stdout.write((useColor && color ? `\x1b[${COLORS[color]}m${text}\x1b[0m` : text) + '\n');
}
export { say };

export function showReport({ ctx, repos, enforcement, claims, survey, couldNotLook, verdict, mode, surveyStrict, stateDir }) {
    // Linked worktrees are folded into their parents (repos.mjs): counted apart, never as repos.
    const live = repos.filter((r) => !r.archived && !r.worktree);
    const wtCount = repos.filter((r) => !r.archived && r.worktree).length;
    const wtNote = wtCount > 0 ? `; ${wtCount} worktree(s) folded into their parents` : '';
    say();
    say('  DOCTOR', 'Cyan');
    say('  ------', 'Cyan');
    say(`  mode ${mode}   root ${ctx.root}`);
    say(`  brain ${ctx.brain || '(none)'}`);
    say(`  kit ${ctx.kit}`);
    say(`  ${live.length} repositories under root (${repos.length - live.length - wtCount} archived, not counted${wtNote})`);
    say();

    // --- band 1: CLAIMS
    const cp = claims.filter((c) => c.status === 'PASS'); const cf = claims.filter((c) => c.status === 'FAIL'); const cu = claims.filter((c) => c.status === 'UNKNOWN');
    say(`  CLAIMS  ${cp.length} pass  ${cf.length} fail  ${cu.length} could not look`, 'Yellow');
    for (const c of cf) {
        say(`    FAIL  ${c.id}  ${c.detail}`, 'Red');
        if (c.why) say(`          why: ${c.why}`, 'DarkGray');
    }
    for (const c of cu) say(`    ????  ${c.id}  ${c.detail}`, 'Magenta');
    if (cf.length === 0 && cu.length === 0 && cp.length > 0) say('    every claim holds', 'Green');
    if (claims.length === 0) say('    no claims to check', 'DarkGray');
    say();

    // --- band 2: SURVEY (enforcement facts first, then findings)
    const acted = survey.filter((f) => f.severity === 'fail' || f.severity === 'warn');
    const info = survey.filter((f) => f.severity === 'info');
    const accepted = survey.filter((f) => f.severity === 'accepted');
    say(`  SURVEY  ${acted.length} finding(s)  [${surveyStrict ? 'surveyStrict: fail findings turn RED' : 'REPORTED, not counted (surveyStrict false)'}]`, 'Yellow');
    if (enforcement) {
        // One row per (event, script); a hook registered for several matchers lists them once.
        const groups = new Map();
        for (const h of enforcement.hooks) {
            const k = `${h.event}\u0000${h.script}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(h);
        }
        for (const list of groups.values()) {
            const h = list[0];
            const matchers = [...new Set(list.map((x) => x.matcher).filter((x) => x))].sort(byName).join(',');
            say(`    [${h.exists ? ' ok ' : 'GONE'}] hook ${h.event.padEnd(12)} ${getLeaf(h.script)}  ${matchers}`, h.exists ? 'DarkGray' : 'Red');
        }
        if (enforcement.settingsFound.length > 0) say(`    root settings: ${enforcement.denyRules} deny, ${enforcement.askRules} ask rule(s) in ${enforcement.settingsFound.length} file(s)`, 'DarkGray');
        if (enforcement.softDenyTotal > 0) say(`    soft_deny: ${enforcement.softDenyTotal} rule(s), ${enforcement.softDenyFrozen} naming a frozen path`, 'DarkGray');
        if (enforcement.fenceLogExists) say(`    fence log: ${enforcement.fenceTrips} trips, last ${enforcement.fenceLastTrip}`, 'DarkGray');
    }
    for (const f of acted) say(`    [${f.severity.toUpperCase()}] ${f.message}`, f.severity === 'fail' ? 'Red' : 'Yellow');
    for (const f of info) say(`    [INFO] ${f.message}`, 'DarkGray');
    if (acted.length === 0) say('    nothing needs action', 'Green');
    say();
    // Accepted findings are shown, never hidden. An exception you cannot see has become a habit.
    if (accepted.length > 0) {
        say(`  ACCEPTED  ${accepted.length} (recorded exceptions - reported, not counted)`, 'DarkGray');
        for (const f of accepted) say(`    - ${f.message}`, 'DarkGray');
        say();
    }

    // --- band 3: COULD-NOT-LOOK. Never printed as a pass.
    if (couldNotLook.length > 0) {
        say(`  COULD-NOT-LOOK  ${couldNotLook.length}  (this is NOT a pass)`, 'Magenta');
        for (const c of couldNotLook) say(`    ${c}`, 'Magenta');
        say();
    }

    say(`  VERDICT: ${verdict.verdict}  (exit ${verdict.code}: ${verdict.reason})`, verdict.verdict === 'RED' ? 'Red' : verdict.verdict === 'COULD-NOT-LOOK' ? 'Magenta' : 'Green');
    say();
    say(`  State written to ${stateDir}. Every finding is explained in the kit's tools/MANUAL.md.`, 'DarkGray');
    say();
}
