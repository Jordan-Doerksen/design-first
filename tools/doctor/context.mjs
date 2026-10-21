// context.mjs - resolve WHERE the Doctor looks: pointer -> root, brain, kit; the config contract.
// Imported by doctor.mjs. Emits no output of its own. Nothing here writes a file.
//
// Every path the Doctor touches is derived from the pointer file, never from a fixed string.
// A check wired to a fixed real path cannot be planted against in a self-test, so it can never
// be proven RED, so it is not evidence of anything.

import path from 'node:path';
import fs from 'node:fs';
import {
    getPointerPath, getFenceLogPath, expandEnvVars, toFullPath, isBlank, readText, parseJson, IS_WIN,
} from '../../hooks/lib/common.mjs';

export { getPointerPath };

// ---------------------------------------------------------------- pointer

// Returns { ok, path, data, error }. Never throws: an unreadable pointer is a fact to report.
export function readPointer() {
    const p = getPointerPath();
    const r = { ok: false, path: p, data: null, error: '' };
    if (!fs.existsSync(p)) { r.error = `pointer not found at ${p}`; return r; }
    let d;
    try { d = parseJson(readText(p)); } catch (e) { r.error = `pointer could not be parsed: ${e.message}`; return r; }
    for (const k of ['root', 'brain', 'pluginRoot']) {
        if (d == null || isBlank(d[k])) { r.error = `pointer has no '${k}'`; return r; }
    }
    r.data = d; r.ok = true;
    return r;
}

// ---------------------------------------------------------------- path expansion

// %VAR% (so %USERPROFILE%), ${ROOT}, ${BRAIN}, ${KIT}. A relative result is brain-relative, or
// kit-relative under -Kit (the context's base). Returns '' for empty input. A token that cannot be
// expanded (no brain under -Kit) is left in place on purpose: the caller sees '${' and reports
// UNKNOWN instead of testing a wrong path. Both separators mean a folder break in a claim or config.
export function expandDfPath(p, ctx) {
    if (isBlank(p)) return '';
    let s = String(p);
    if (ctx.root) s = s.split('${ROOT}').join(ctx.root);
    if (ctx.brain) s = s.split('${BRAIN}').join(ctx.brain);
    if (ctx.kit) s = s.split('${KIT}').join(ctx.kit);
    s = expandEnvVars(s);
    if (s.includes('${')) return s;
    s = IS_WIN ? s.replace(/\//g, '\\') : s.replace(/\\/g, '/');
    if (!path.isAbsolute(s)) s = path.join(ctx.base, s);
    return toFullPath(s) || s;
}

export function isUnexpanded(p) { return String(p).includes('${'); }

// ---------------------------------------------------------------- config contract (SPEC 5.3)

// Every key names its reader. A key with no reader is dead config, and dead config is how a
// "fact typed into config" outlives the code that read it. doctor.mjs reports unknown keys.
// A key added here needs a default in defaultConfig too; the self-test fails when one is missing.
export const CONFIG_READERS = {
    schema: 'doctor.mjs (config_schema; mismatch -> MIGRATE)',
    surveyStrict: 'report.mjs (verdict: SURVEY fail findings turn RED when true)',
    maxDepth: 'repos.mjs (repoFacts: how deep to look for .git)',
    parallelGit: 'repos.mjs (repoFacts: how many repositories are read at a time; 1 = one after another)',
    excludePathParts: 'repos.mjs (repoFacts: skip repos whose path contains a part)',
    archivedPathParts: 'repos.mjs (repoFacts: archived repos are listed, not judged)',
    ownerRemotePatterns: 'repos.mjs (repoFacts: a remote matching none is FOREIGN)',
    frozenPaths: 'repos.mjs (frozenDirty) / enforcement.mjs (soft_deny count) / hooks/guard.mjs (path deny)',
    tombstonedPaths: 'repos.mjs (flag) / hooks/guard.mjs (path deny)',
    controlCards: 'claims-fresh.mjs (config_paths_each, CTRL-CARD-01 / KIT-CONTROL-01: the control cards, relative to <brain>/control/)',
    unversionedMaxDepth: 'repos.mjs (unversionedFolders)',
    unversionedIgnorePathParts: 'repos.mjs (unversionedFolders)',
    secretExceptions: 'repos.mjs (trackedSecrets) / hooks/guard.mjs (staging and write rules)',
    acceptedExceptions: 'doctor.mjs (accepted: (path, kind) pairs reported, not counted)',
    entryPointSnapshots: 'doctor.mjs (live vs snapshot, CRLF-insensitive)',
    enforcement: 'enforcement.mjs (fenceLogStaleDays only)',
    categories: 'survey.mjs (categoryFindings: folders, since; a repository outside a category folder)',
    lawClaim: 'tools/vcs/law-claim.mjs (the commit check: extraFiles, trailer, minReason)',
    // Read by the hooks, not by the Doctor. They are listed so the dead-key check knows they are
    // live: before this, every brain that carried them got three "nothing reads it" warnings.
    readCeilingBytes: 'hooks/guard.mjs (rule 6, the read check: a write that grows a source file past this many bytes tells the agent once; 0 turns it off)',
    readCeilingExempt: 'hooks/guard.mjs (rule 6: path globs the read check skips)',
    sourceExtensions: 'hooks/guard.mjs (rules 5 and 6) / hooks/stop.mjs (what counts as source)',
    stopDocs: 'hooks/stop.mjs (file names that count as documents on the Stop card)',
    stopFromGit: "hooks/stop.mjs (true: the turn's changes are read from git; false: Edit and Write calls only)",
    stopBudgetSeconds: "hooks/stop.mjs (time budget in seconds, under the host's Stop timeout: past it no more repositories are read from git and the card names them)",
    stopCard: 'hooks/stop.mjs ({ owner, writer }: false turns the Stop card off for sessions of that role, the role the router wrote in <session>.role; both default to true)',
    forbidScheduling: 'hooks/guard.mjs (rule 8, no-schedule: true refuses scheduled tasks, cron, Run keys, services, the Startup folder)',
    contentRules: 'hooks/guard.mjs (rule 9, content-rule: an edit in scope that adds a match of the pattern is refused)',
    loopBranchPrefix: 'hooks/guard.mjs (rules 11 and 12: a branch with this prefix is the loop branch; default harness/)',
    loopLedgerGlobs: 'hooks/guard.mjs (rule 12, ledger: repository-relative globs of the story ledger refused on the loop branch)',
    ask: 'hooks/ask.mjs (OWN-04, the shape of a question: minReason, equalPhrases, recommendedMarker)',
    commitMessage: 'tools/vcs/law-claim.mjs (the message check: maxSubject, pastTenseWords, placeholders)',
};

// Keys the previous Doctor had that are now derived from the pointer or simply dead (SPEC 5.3).
const REMOVED_CONFIG_KEYS = ['root', 'stateDir', 'recordsDir', 'gitTimeoutSeconds', 'staleStateDays', '_retiredUnversionedWatchlist', 'splitLines'];
const REMOVED_ENFORCEMENT_KEYS = ['settingsPath', 'fenceLogPath'];
// What to do instead, for a removed key that has a successor (printed with the dead-key finding).
export const REMOVED_KEY_NOTES = {
    splitLines: 'removed in 0.1.35: DES-03 has no line count (CR-2026-10-15-SPLIT); the read check is readCeilingBytes (0 turns it off), so rename both the key and its _readers entry, or delete them to keep the default',
};

export function defaultConfig() {
    return {
        schema: 1,
        surveyStrict: false,
        maxDepth: 3,
        parallelGit: 8,
        excludePathParts: ['/node_modules/', '/.claude/worktrees/', '/target/', '/.godot/'],
        archivedPathParts: ['/_archive/', '/_backups/'],
        ownerRemotePatterns: [],
        frozenPaths: [],
        tombstonedPaths: [],
        controlCards: [],
        unversionedMaxDepth: 3,
        unversionedIgnorePathParts: ['/_archive/', '/_backups/', '/node_modules/', '/__pycache__/', '/.venv/'],
        secretExceptions: [],
        acceptedExceptions: [],
        entryPointSnapshots: [],
        enforcement: { fenceLogStaleDays: 30 },
        categories: { folders: [], since: '' },
        lawClaim: { extraFiles: [], trailer: 'No-Claim', minReason: 10 },
        readCeilingBytes: 49152,
        readCeilingExempt: [],
        sourceExtensions: [],
        stopDocs: [],
        stopFromGit: true,
        stopBudgetSeconds: 15,   // the hook's own default lives in hooks/lib/common.mjs (STOP_BUDGET_DEFAULT), its only reader
        stopCard: { owner: true, writer: true },
        forbidScheduling: false,
        contentRules: [],
        loopBranchPrefix: 'harness/',
        loopLedgerGlobs: ['docs/specs/*.tasks.json', 'specs/*.tasks.json'],
        ask: { minReason: 40, equalPhrases: [], recommendedMarker: '(?i)\\brecommended\\b' },   // the phrase list's default lives in hooks/lib/common.mjs (askDefaults), its only reader
        commitMessage: { maxSubject: 72, pastTenseWords: [], placeholders: [] },
    };
}

const findKey = (obj, k) => Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const toBool = (v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : Boolean(v));

// Returns { ok, path, raw, cfg, deadKeys, error }. cfg has every known key (defaults filled), with
// path lists already expanded through the context. Never throws.
export function readDoctorConfig(p, ctx, readers = CONFIG_READERS) {
    const r = { ok: false, path: p, raw: null, cfg: defaultConfig(), deadKeys: [], error: '' };
    if (!fs.existsSync(p)) { r.error = `config not found at ${p}`; return r; }
    let raw;
    try { raw = parseJson(readText(p)); } catch (e) { r.error = `config could not be parsed: ${e.message}`; return r; }
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) { r.error = 'config could not be parsed: not a JSON object'; return r; }
    r.raw = raw;
    const cfg = r.cfg;
    for (const [k, value] of Object.entries(raw)) {
        if (k.startsWith('_')) { if (REMOVED_CONFIG_KEYS.includes(k)) r.deadKeys.push(k); continue; }
        const live = findKey(readers, k);
        if (!live) { r.deadKeys.push(k); continue; }
        if (live === 'enforcement') {
            if (value != null && typeof value === 'object') {
                for (const [ek, ev] of Object.entries(value)) {
                    if (ek === 'fenceLogStaleDays') cfg.enforcement.fenceLogStaleDays = Number.parseInt(String(ev), 10);
                    else if (REMOVED_ENFORCEMENT_KEYS.includes(ek)) r.deadKeys.push(`enforcement.${ek}`);
                    else if (!ek.startsWith('_')) r.deadKeys.push(`enforcement.${ek}`);
                }
            }
        } else {
            // A reader key with no default still loads: it is set as it stands.
            cfg[findKey(cfg, live) || live] = value;
        }
    }
    // DECISIONS 3.6: every key names its reader. When the file carries a _readers map, a live key
    // missing from it is reported too; the map is documentation that must not rot either.
    const readersMap = raw._readers;
    if (readersMap != null && typeof readersMap === 'object') {
        for (const k of Object.keys(raw)) {
            if (k.startsWith('_')) continue;
            if (!findKey(readersMap, k)) r.deadKeys.push(`${k} (no _reader entry)`);
        }
    }
    // Normalise list-valued keys so a single string or null never breaks a loop.
    for (const lk of ['excludePathParts', 'archivedPathParts', 'ownerRemotePatterns', 'frozenPaths', 'tombstonedPaths', 'controlCards',
        'unversionedIgnorePathParts', 'secretExceptions', 'acceptedExceptions', 'entryPointSnapshots']) cfg[lk] = asList(cfg[lk]);
    // Path lists are absolute or ${ROOT}-relative (SPEC 5.3). Expand them once, here, so no reader
    // has to know the rule. A bare relative path means root-relative for these three keys.
    const rootCtx = { root: ctx.root, brain: ctx.brain, kit: ctx.kit, base: ctx.root };
    for (const pk of ['frozenPaths', 'tombstonedPaths', 'secretExceptions']) cfg[pk] = cfg[pk].map((x) => expandDfPath(String(x), rootCtx));
    cfg.maxDepth = Number.parseInt(String(cfg.maxDepth), 10) || 0;
    const pg = Number.parseInt(String(cfg.parallelGit), 10);
    cfg.parallelGit = Number.isFinite(pg) && pg >= 1 ? pg : 1;
    cfg.unversionedMaxDepth = Number.parseInt(String(cfg.unversionedMaxDepth), 10) || 0;
    cfg.surveyStrict = toBool(cfg.surveyStrict);
    cfg.forbidScheduling = toBool(cfg.forbidScheduling);
    if (cfg.enforcement == null || typeof cfg.enforcement !== 'object') cfg.enforcement = { fenceLogStaleDays: 30 };
    r.ok = true;
    return r;
}

// ---------------------------------------------------------------- derived values (SPEC 5.3)

// No longer config keys: they follow from the pointer. The fence log path is fixed by the fence hook.
export function derivedPaths(ctx) {
    const brainOrKit = ctx.brain || ctx.kit;
    // Root settings are an adopter's files; under -Kit there is no adopter, so none are expected.
    const settings = ctx.brain ? [path.join(ctx.root, '.claude', 'settings.json'), path.join(ctx.root, '.claude', 'settings.local.json')] : [];
    return {
        stateDir: path.join(brainOrKit, 'state'),
        recordsDir: path.join(brainOrKit, 'records'),
        settingsPaths: settings,
        fenceLogPath: getFenceLogPath(),
        hooksJsonPath: path.join(ctx.pluginRoot, 'hooks', 'hooks.json'),
    };
}
