// doctor.mjs - the design-first Doctor. Run it (or the Doctor shim in the brain); nothing runs it for you.
//
// WHY. Every false sentence that survives in a rule set is a FACT stored as LAW: a claim about the
// disk, typed by hand, with nothing able to detect it as wrong. The cure is not a better document.
// It is a command that re-derives the facts.
//
// READ-ONLY with respect to the workspace. The only files written are <brain>/state/* (or the kit's
// state/ under -Kit). NO TIMER, NO LOGIN TASK, ever.
//
// Three bands (SPEC 1.1):
//   CLAIMS          a false claim in claims.json      -> RED, exit 1
//   SURVEY          repo and wiring findings           -> REPORTED, exit 0, unless surveyStrict
//   COULD-NOT-LOOK  something could not be checked     -> exit 2, never a pass
//                   (a crash of the Doctor itself included: the handler below)
//
// Where it looks comes from the pointer ~/.claude/design-first.json (DF_POINTER_PATH overrides it,
// for tests): root, brain, pluginRoot. Nothing in this folder names a real path.
//   -Kit    check the KIT itself: its own claims (tools/doctor/claims.json), ${KIT} = this checkout,
//           state under <kit>/state. Needs no brain.
//   -Json   print one JSON document instead of the screen report.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let json = false;
let mode = 'brain';

// Used before a context exists, and by the crash handler below: print the one reason and exit 2.
// Never silent, never 0.
function stopCouldNotLook(reason) {
    // Written synchronously: the process exits on the next line, and a pipe on Windows is asynchronous.
    let text;
    if (json) text = JSON.stringify({ verdict: 'COULD-NOT-LOOK', exitCode: 2, reason, mode }, null, 2) + '\n';
    else {
        const tty = process.stdout.isTTY && !process.env.NO_COLOR;
        const m = (s) => (tty ? `\x1b[35m${s}\x1b[0m` : s);
        text = `\n${m(`  COULD-NOT-LOOK: ${reason}`)}\n${m('  This is not a pass. Exit 2.')}\n\n`;
    }
    try { fs.writeSync(1, text); } catch { /* nothing more can be said */ }
    process.exit(2);
}

// A crash is COULD-NOT-LOOK, never RED (CR-2026-10-15-GAPS D6; SAFE-04, OBS-07). An exception that
// no step catches (a file that throws as it loads, a helper with a defect, the verdict itself) would
// end the run with a non-zero code that reads as "RED - findings above" with no finding above it.
// So every uncaught error gives one reason, the file and line, and exit 2.
function crashed(e) {
    const msg = e && e.message ? e.message : String(e);
    let at = 'an unknown line';
    const stack = e && e.stack ? String(e.stack) : '';
    for (const line of stack.split('\n')) {
        const m = /(?:file:\/\/)?([^\s()]+\.(?:mjs|js)):(\d+)(?::\d+)?\)?\s*$/.exec(line.trim());
        if (m) { at = `${path.basename(m[1])}:${m[2]}`; break; }
    }
    stopCouldNotLook(`the Doctor stopped: ${msg} at ${at}. No verdict was reached.`);
}
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);

async function main() {
    const { parseArgs } = await import('../lib/args.mjs');
    let opts;
    try { opts = parseArgs(process.argv.slice(2), { switches: ['Kit', 'Json', 'Quiet'], values: ['ConfigPath', 'ClaimsPath'] }); }
    catch (e) { stopCouldNotLook(e.message); }
    json = opts.Json; mode = opts.Kit ? 'kit' : 'brain';

    const C = await import('../../hooks/lib/common.mjs');
    const X = await import('./context.mjs');
    const U = await import('./util.mjs');
    const repos = await import('./repos.mjs');
    const { enforcementFacts } = await import('./enforcement.mjs');
    const S = await import('./survey.mjs');
    const { invokeClaims } = await import('./claims.mjs');
    const { saveRatchets } = await import('./claims-ratchet.mjs');
    const R = await import('./report.mjs');

    const couldNotLook = [];
    let survey = [];
    let claims = [];
    let repoRows = [];
    let enf = null;
    const stamp = C.stampNow();

    // ---------------------------------------------------------------- where (pointer -> context)
    const kitFromScript = C.toFullPath(path.resolve(HERE, '..', '..'));   // tools/doctor -> tools -> kit
    let ctx;
    if (opts.Kit) {
        // The kit checks itself. Its root for the survey is the checkout; the pointer is only consulted
        // by the pointer_valid claim, so a fresh clone can run this with no adoption at all.
        ctx = { root: kitFromScript, brain: null, kit: kitFromScript, pluginRoot: kitFromScript, base: kitFromScript, mode };
    } else {
        const ptr = X.readPointer();
        if (!ptr.ok) stopCouldNotLook(`${ptr.error}. Run /design-first:adopt in a session, or pass -Kit to check the kit itself.`);
        for (const k of ['root', 'brain', 'pluginRoot']) {
            if (!fs.existsSync(String(ptr.data[k])) || !fs.statSync(String(ptr.data[k])).isDirectory()) stopCouldNotLook(`pointer '${k}' names a folder that does not exist: ${ptr.data[k]}`);
        }
        const full = (k) => C.toFullPath(String(ptr.data[k]));
        ctx = { root: full('root'), brain: full('brain'), kit: full('pluginRoot'), pluginRoot: full('pluginRoot'), base: full('brain'), mode };
    }
    const derived = X.derivedPaths(ctx);

    if (!U.which('git')) stopCouldNotLook('git is not on PATH');

    // ---------------------------------------------------------------- config (SPEC 5.3)
    const configPath = opts.ConfigPath ? path.resolve(opts.ConfigPath) : ctx.brain ? path.join(ctx.brain, 'doctor.config.json') : path.join(ctx.kit, 'templates', 'doctor.config.json');
    const cr = X.readDoctorConfig(configPath, ctx);
    if (!cr.ok) {
        if (ctx.brain) stopCouldNotLook(`doctor.config.json: ${cr.error}`);
        // Under -Kit the template is optional; defaults are enough to survey one checkout.
        survey.push(S.finding('info', 'configDefaults', configPath, `config not read (${cr.error}); kit mode runs on defaults`));
    }
    const cfg = cr.cfg;
    // Kit mode has no adopter and therefore no ownerRemotePatterns, so every remote surveyed as
    // FOREIGN, including the kit's own origin. The kit does know its owner: marketplace.json names it.
    // Derive the pattern from there when the config gives none (or only the template placeholder).
    if (!ctx.brain) {
        const own = cfg.ownerRemotePatterns.filter((p) => p && !String(p).includes('<OWNER>'));
        if (own.length === 0) {
            const mp = path.join(ctx.kit, '.claude-plugin', 'marketplace.json');
            if (fs.existsSync(mp)) {
                try {
                    const mpOwner = C.parseJson(C.readText(mp)).owner.name;
                    if (mpOwner) cfg.ownerRemotePatterns = [`github.com/${mpOwner}/`];
                } catch (e) { survey.push(S.finding('warn', 'configDefaults', mp, `marketplace.json unreadable (${e.message}); remotes survey as FOREIGN`)); }
            }
        }
    }
    for (const dk of cr.deadKeys) {
        // Three cases, three messages: a live key with no _readers line is NOT dead and must not be
        // deleted; a removed key with a successor says what replaced it; anything else is plain dead.
        const name = dk.split(' ')[0];
        if (dk.endsWith(' (no _reader entry)')) survey.push(S.finding('warn', 'deadConfigKey', configPath, `config key ${name} has no _readers line - the key is live; add a _readers entry naming what reads it (DECISIONS 3.6) in ${configPath}.`));
        else if (X.REMOVED_KEY_NOTES[name]) survey.push(S.finding('warn', 'deadConfigKey', configPath, `dead config key: ${name} - ${X.REMOVED_KEY_NOTES[name]}. Edit ${configPath}.`));
        else survey.push(S.finding('warn', 'deadConfigKey', configPath, `dead config key: ${dk} - nothing reads it (derived from the pointer or removed in schema 1). Delete it from ${configPath}.`));
    }
    // Built-in config_schema (reader: doctor.mjs). A mismatch is a CLAIMS-band fact: this Doctor and
    // that config disagree about the contract, so every other reading is suspect.
    if (cr.ok) {
        const actual = cr.raw.schema;
        let detail = null;
        if (actual == null) detail = `MIGRATE: ${configPath} has no 'schema' field; this Doctor expects schema 1`;
        else if (Number(actual) !== 1) detail = `MIGRATE: ${configPath} is schema ${actual}; this Doctor expects schema 1. Follow the migration note in the kit README.`;
        if (detail) claims.push({ id: 'CONFIG-SCHEMA', type: 'config_schema', status: 'FAIL', detail, why: 'Plugin updated, brain config older (SPEC 7). Every key reader below assumes schema 1.' });
    }

    // ---------------------------------------------------------------- SURVEY band
    try {
        repoRows = await repos.repoFacts(ctx.root, cfg, derived.stateDir);
        survey.push(...S.repoFindings(repoRows));
    } catch (e) { couldNotLook.push(`repository sweep failed: ${e.message}`); }
    // categories (reader: survey.mjs): a repository outside a category folder. Off with no folders named.
    try { survey.push(...S.categoryFindings(repoRows, cfg, ctx)); } catch (e) { couldNotLook.push(`category check failed: ${e.message}`); }
    try { survey.push(...S.unversionedFindings(repos.unversionedFolders(ctx.root, cfg))); } catch (e) { couldNotLook.push(`unversioned-folder sweep failed: ${e.message}`); }
    try { survey.push(...S.secretFindings(repos.trackedSecrets(cfg, repoRows))); } catch (e) { couldNotLook.push(`tracked-secret scan failed: ${e.message}`); }
    try { survey.push(...S.restoreDrillFindings(derived.recordsDir)); } catch (e) { couldNotLook.push(`restore-drill log check failed: ${e.message}`); }
    // entryPointSnapshots (reader: doctor.mjs via survey.mjs's comparer)
    try { if (cfg.entryPointSnapshots.length > 0) survey.push(...S.snapshotFindings(cfg.entryPointSnapshots, ctx)); } catch (e) { couldNotLook.push(`entry-point snapshot check failed: ${e.message}`); }
    try {
        enf = enforcementFacts(cfg, derived, ctx);
        couldNotLook.push(...enf.couldNotLook);
        survey.push(...enf.findings);
    } catch (e) { couldNotLook.push(`enforcement check failed: ${e.message}`); }

    // acceptedExceptions (reader: doctor.mjs). A finding whose (path, kind) is registered is still
    // REPORTED, but it does not count: a rule and a deliberate exception must not be the same sentence,
    // and a check that cries wolf every run is a check that gets ignored.
    const rootCtx = { root: ctx.root, brain: ctx.brain, kit: ctx.kit, base: ctx.root };
    const accepted = (p, kind) => {
        for (const e of cfg.acceptedExceptions) {
            if (e == null || !e.path || !String(e.path).trim()) continue;
            const ep = X.expandDfPath(String(e.path), rootCtx);
            const same = e.path === p || (ep !== '' && p !== '' && C.pathEq(ep, X.expandDfPath(p, rootCtx)));
            if (!same) continue;
            if ((Array.isArray(e.kinds) ? e.kinds : [e.kinds]).includes(kind)) return e;
        }
        return null;
    };
    survey = survey.map((f) => {
        const acc = (f.severity === 'fail' || f.severity === 'warn') && f.path !== '' && f.kind !== '' ? accepted(f.path, f.kind) : null;
        return acc ? { severity: 'accepted', kind: f.kind, path: f.path, message: `${f.message}  [accepted ${acc.since}: ${acc.reason}]` } : f;
    });
    survey = S.mergeCategoryBacklog(survey);   // the grandfathered outsideCategory findings, one line

    // ---------------------------------------------------------------- CLAIMS band
    const claimsPath = opts.ClaimsPath ? path.resolve(opts.ClaimsPath) : opts.Kit ? path.join(ctx.kit, 'tools', 'doctor', 'claims.json') : path.join(ctx.brain, 'claims.json');
    try { claims.push(...invokeClaims(claimsPath, ctx)); } catch (e) { couldNotLook.push(`claims run failed: ${e.message}`); }
    for (const c of claims) {
        if (c.status === 'UNKNOWN') couldNotLook.push(`claim ${c.id} could not be evaluated: ${c.detail}`);
        // A passing claim may carry a note worth one INFO line: a ratchet that moved, or its first record.
        if (c.note) survey.push(S.finding('info', 'claimNote', '', String(c.note)));
    }

    // ---------------------------------------------------------------- verdict, state, report
    const verdict = R.getVerdict(claims, survey, couldNotLook, cfg.surveyStrict);
    try {
        R.writeState({ stateDir: derived.stateDir, repos: repoRows, claims, survey, couldNotLook, verdict, stamp, mode });
        saveRatchets(derived.stateDir, claims, stamp);   // ratchet records (claims-ratchet.mjs)
    } catch (e) {
        if (!json) R.say(`  WARNING: state could not be written to ${derived.stateDir}: ${e.message}`, 'Yellow');
    }
    if (json) process.stdout.write(R.jsonReport({ ctx, repos: repoRows, enforcement: enf, claims, survey, couldNotLook, verdict, stamp, mode }) + '\n');
    else if (!opts.Quiet) R.showReport({ ctx, repos: repoRows, enforcement: enf, claims, survey, couldNotLook, verdict, mode, surveyStrict: cfg.surveyStrict, stateDir: derived.stateDir });
    process.exitCode = verdict.code;
}

main().catch(crashed);
