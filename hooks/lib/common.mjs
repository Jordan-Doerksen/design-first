// common.mjs - shared helpers for the design-first hooks. Imported by every hook; never run directly.
//
// Fixed locations (SPEC 5.4) and the test seams that override them. The self-tests set the DF_*
// variables so a test run never reads the real pointer and never writes the real logs.
//   pointer     ~/.claude/design-first.json         DF_POINTER_PATH
//   hooks log   ~/.claude/design-first-hooks.log    DF_LOG_PATH
//   fence log   ~/.claude/fence-log.txt             DF_FENCE_LOG_PATH
//   markers     <os temp>/design-first/             DF_MARKER_DIR
// "~" is the profile folder: %USERPROFILE% on Windows, $HOME on Linux and macOS (os.homedir()).
//
// Paths. Every path a rule compares goes through toFullPath, which resolves it against the call's
// folder and then resolves the symbolic links of the nearest folder that exists (the leaf keeps its
// own name). Workaround: on macOS the temp folder is /var/folders/... while git reports
// /private/var/folders/..., so a cwd and git's top level named one folder two ways and every
// under-the-root test failed. Resolved on both sides, one folder has one spelling. Paths compare
// without case on Windows and macOS (their default file systems fold case) and exactly on Linux.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { readStdin, isoNow } from './stdin.mjs';
import { parseJson } from './json.mjs';

export { readStdin, isoNow, parseJson };

// child_process and crypto are loaded when a rule first needs them, not at start: child_process
// alone pulls in streams, net and dgram, about 16 ms of every hook's start, and most calls never
// spawn a process.
const requireBuiltin = createRequire(import.meta.url);
export function builtin(name) {
    return typeof process.getBuiltinModule === 'function' ? process.getBuiltinModule(name) : requireBuiltin(name);
}

export const IS_WIN = process.platform === 'win32';
export const FOLD_CASE = IS_WIN || process.platform === 'darwin';

export function homeDir() { return os.homedir(); }
export function getPointerPath() { return process.env.DF_POINTER_PATH || path.join(homeDir(), '.claude', 'design-first.json'); }
export function getLogPath() { return process.env.DF_LOG_PATH || path.join(homeDir(), '.claude', 'design-first-hooks.log'); }
export function getFenceLogPath() { return process.env.DF_FENCE_LOG_PATH || path.join(homeDir(), '.claude', 'fence-log.txt'); }
export function getMarkerDir() { return process.env.DF_MARKER_DIR || path.join(os.tmpdir(), 'design-first'); }

// ---------------------------------------------------------------- small helpers

export const isBlank = (s) => s == null || String(s).trim() === '';
export const str = (v) => (v == null ? '' : String(v));
// PowerShell's -eq, -in and -like fold case; these say so where a rule depends on it.
export const ieq = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();
export const iin = (x, list) => (list || []).some((v) => ieq(x, v));
export function has(obj, key) { return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key); }

// 'yyyy-MM-dd HH:mm:ss', local time: the fence log's stamp.
export function stampNow(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
// An ISO date or timestamp, as milliseconds since the epoch, or null. A stamp with no offset is read
// as UTC when assumeUtc is true, else as local time.
export function parseIso(s, assumeUtc = false) {
    const t = str(s).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(t);
    if (!m) return null;
    const [, y, mo, d, h = '0', mi = '0', se = '0', frac = '0', zone] = m;
    const ms = Math.round(Number('0.' + frac) * 1000);
    let utc;
    if (zone) {
        utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, ms);
        if (zone.toUpperCase() !== 'Z') {
            const z = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
            const offMin = (+z[2] * 60 + +z[3]) * (z[1] === '+' ? 1 : -1);
            utc -= offMin * 60000;
        }
    } else if (assumeUtc) {
        utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, ms);
    } else {
        utc = new Date(+y, +mo - 1, +d, +h, +mi, +se, ms).getTime();
    }
    return Number.isNaN(utc) ? null : utc;
}

export function readText(p) {
    const t = fs.readFileSync(p, 'utf8');
    return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}
export function readJson(p) { return parseJson(readText(p)); }
export function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
export function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
export function exists(p) { try { fs.statSync(p); return true; } catch { return false; } }
export function ensureDir(d) { if (d && !isDir(d)) fs.mkdirSync(d, { recursive: true }); }
export function readLines(p) { return readText(p).split(/\r?\n/); }

// Appends "<ISO> <LEVEL> <hook> <msg>" to the hooks log. Swallows its own failures: a log that
// cannot be written must not stop the hook from answering.
export function writeLog(level, hook, msg) {
    try {
        const p = getLogPath();
        ensureDir(path.dirname(p));
        fs.appendFileSync(p, `${isoNow()} ${level} ${hook} ${str(msg).replace(/\r/g, ' ').replace(/\n/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
}

export function addTextLine(p, line) {
    try {
        ensureDir(path.dirname(p));
        fs.appendFileSync(p, line + '\n', 'utf8');
    } catch { /* never fatal */ }
}

// ---------------------------------------------------------------- stdin, output

export function writeJson(obj) {
    if (obj == null) return;
    process.stdout.write(JSON.stringify(obj) + '\n');
}

// ---------------------------------------------------------------- hook output (one JSON object)

export function newDeny(hook, title, reason) {
    return {
        systemMessage: `${hook.toUpperCase()}: ${title}`,
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    };
}

// Advisory: both channels (SPEC 5.4 channels). items is a list of { title, body, agentOnly? }. An
// item marked agentOnly reaches the agent's context only; when every item is, there is no
// systemMessage at all, so nothing shows on the owner's screen (CR-2026-10-15-SPLIT).
export function newAdvisory(hook, items) {
    const shown = items.filter((i) => !i.agentOnly).map((i) => i.title);
    const out = {};
    if (shown.length > 0) out.systemMessage = `${hook.toUpperCase()}: ${shown.join(' | ')}`;
    out.hookSpecificOutput = { hookEventName: 'PreToolUse', additionalContext: items.map((i) => i.body).join('\n\n') };
    return out;
}

// Internal error, written so it works with nothing else loaded: allow, log, surface on both
// channels (SPEC 5.4 internal errors). Every hook's last catch calls this or its own variant.
export function errorOutput(hook, msg, event = 'PreToolUse') {
    const flat = str(msg).replace(/\s+/g, ' ');
    try {
        const p = getLogPath();
        ensureDir(path.dirname(p));
        fs.appendFileSync(p, `${isoNow()} ERROR ${hook} ${flat}\n`, 'utf8');
    } catch { /* never fatal */ }
    return {
        systemMessage: `${hook.toUpperCase()}: internal error, call allowed (${msg})`,
        hookSpecificOutput: { hookEventName: event, additionalContext: `${hook} hook hit an internal error and ALLOWED this call without inspecting it: ${msg}. Logged to the design-first hooks log.` },
    };
}

// ---------------------------------------------------------------- paths

// The real path of a folder that exists, or the folder as given when it cannot be resolved.
const realCache = new Map();
function realDir(d) {
    if (realCache.has(d)) return realCache.get(d);
    let r = d;
    try { r = fs.realpathSync.native(d); } catch { try { r = fs.realpathSync(d); } catch { r = d; } }
    realCache.set(d, r);
    return r;
}

// Resolves the symbolic links of the nearest existing folder at or above `full` and keeps the rest
// (the leaf and any folders that do not exist yet) as typed.
export function canonical(full) {
    if (!full) return full;
    let head = full;
    const tail = [];
    for (let i = 0; i < 64; i++) {
        let st = null;
        try { st = fs.statSync(head); } catch { st = null; }
        if (st) {
            if (st.isDirectory()) {
                const r = realDir(head);
                return tail.length ? path.join(r, ...tail.reverse()) : r;
            }
            // An existing file: resolve its folder, keep its own name.
            const parent = path.dirname(head);
            if (parent === head) return full;
            tail.push(path.basename(head));
            head = parent;
            continue;
        }
        const parent = path.dirname(head);
        if (parent === head) return full;
        tail.push(path.basename(head));
        head = parent;
    }
    return full;
}

function stripTrailingSep(p) {
    if (!p) return p;
    const root = path.parse(p).root;
    let s = p;
    while (s.length > root.length && /[\\/]$/.test(s)) s = s.slice(0, -1);
    return s;
}

// Full path, trailing separator trimmed. Relative paths resolve against base (the tool call's cwd),
// then the process cwd. Returns null for empty or unresolvable input.
export function toFullPath(p, base) {
    if (isBlank(p)) return null;
    let s = String(p).trim();
    let m;
    // A PowerShell provider-qualified path ('FileSystem::C:\x', 'Microsoft.PowerShell.Core\FileSystem::
    // C:\x') is the same file to Remove-Item and its kin; the provider part is dropped before the rest.
    // Workaround (check of the third review): 'Remove-Item FileSystem::<root>\frozen\x.py' was read
    // as a relative path under the call's folder and passed rule 4.
    if ((m = /^(Microsoft\.PowerShell\.Core[\\/])?FileSystem::(.+)$/i.exec(s))) s = m[2];
    if (IS_WIN) {
        // Workaround: Git Bash on Windows writes drive paths as /c/x/y. Without this mapping a frozen
        // path typed in MSYS form is not recognised as the same folder.
        if ((m = /^\/([A-Za-z])(\/|$)/.exec(s))) s = m[1].toUpperCase() + ':\\' + s.slice(2).replace(/^\/+/, '');
        s = s.replace(/\//g, '\\');
        // Workaround (CR-2026-10-15-GAPS third review): a Win32 namespace prefix (\\?\C:\, \\.\C:\, and
        // \\?\UNC\ before a share) and this machine's admin share (\\localhost\C$\, \\127.0.0.1\C$\) name
        // the same file as the drive path, so they are mapped to the drive path here, for every caller.
        if ((m = /^\\\\[?.]\\UNC\\(.+)$/i.exec(s))) s = '\\\\' + m[1];
        else if ((m = /^\\\\[?.]\\([A-Za-z]):(\\.*)?$/.exec(s))) s = m[1].toUpperCase() + ':\\' + str(m[2]).replace(/^\\+/, '');
        if ((m = /^\\\\(localhost|127\.0\.0\.1)\\([A-Za-z])\$(\\.*)?$/i.exec(s))) s = m[2].toUpperCase() + ':\\' + str(m[3]).replace(/^\\+/, '');
        if (/^~(\\|$)/.test(s)) s = path.join(homeDir(), s.slice(1).replace(/^\\+/, ''));
    } else if (/^~(\/|$)/.test(s)) {
        s = path.join(homeDir(), s.slice(1).replace(/^\/+/, ''));
    }
    try {
        if (s.includes('\0')) return null;
        if (!path.isAbsolute(s)) s = path.join(isBlank(base) ? process.cwd() : base, s);
        return stripTrailingSep(canonical(path.resolve(s)));
    } catch { return null; }
}

function fold(s) { return FOLD_CASE ? s.toLowerCase() : s; }

export function pathEq(a, b) {
    if (!a || !b) return false;
    return fold(stripTrailingSep(a)) === fold(stripTrailingSep(b));
}

// "is full equal to or under root" (SPEC 5.4 path comparison).
export function isUnder(full, root) {
    if (isBlank(full) || isBlank(root)) return false;
    const a = fold(stripTrailingSep(full));
    const r = fold(stripTrailingSep(root));
    if (a === r) return true;
    const pre = /[\\/]$/.test(r) ? r : r + path.sep;
    return a.startsWith(pre);
}

// The part of `full` under `root`, with no leading separator, or null when it is not under it.
export function relUnder(full, root) {
    if (!isUnder(full, root)) return null;
    return stripTrailingSep(full).slice(stripTrailingSep(root).length).replace(/^[\\/]+/, '');
}

export function getLeaf(p) {
    if (isBlank(p)) return '';
    const parts = String(p).replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1];
}

// The extension as .NET's GetExtension gives it: '.env' for '.env', '' for 'a.' and for 'a'.
export function getExt(p) {
    const leaf = getLeaf(p);
    const i = leaf.lastIndexOf('.');
    if (i < 0 || i === leaf.length - 1) return '';
    return leaf.slice(i).toLowerCase();
}

// Nearest existing ancestor folder of a path that may not exist yet (SPEC 7, finding 46).
export function nearestExistingDir(full) {
    if (!full) return null;
    let d = full;
    if (!isDir(d)) d = path.dirname(d);
    for (let i = 0; i < 256 && d; i++) {
        if (isDir(d)) return d;
        const parent = path.dirname(d);
        if (parent === d) return null;
        d = parent;
    }
    return null;
}

// ---------------------------------------------------------------- pointer, brain, config

// Returns { pointer, path, brain, root, warning }. pointer is null when the file is absent or
// unreadable; an unreadable file sets warning so the caller can surface it instead of guessing.
export function readPointer() {
    const p = getPointerPath();
    const r = { pointer: null, path: p, brain: null, root: null, warning: null };
    if (!isFile(p)) return r;
    try {
        const j = readJson(p);
        r.pointer = j;
        if (j && j.brain) r.brain = toFullPath(String(j.brain));
        if (j && j.root) r.root = toFullPath(String(j.root));
    } catch (e) {
        r.warning = `pointer at ${p} could not be parsed: ${e.message}`;
    }
    return r;
}

// %NAME% from the environment; %USERPROFILE% is the profile folder on every system.
export function expandEnvVars(s) {
    return str(s).replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (all, name) => {
        if (name.toUpperCase() === 'USERPROFILE' && !process.env.USERPROFILE) return homeDir();
        const key = Object.keys(process.env).find((k) => (IS_WIN ? k.toUpperCase() === name.toUpperCase() : k === name));
        return key ? process.env[key] : all;
    });
}

// Expands ${ROOT} / ${BRAIN} / %USERPROFILE%; a bare relative path is root-relative (SPEC 5.3).
export function expandConfigPath(p, root, brain) {
    if (isBlank(p)) return null;
    // A token with nothing to stand for leaves no path: '${ROOT}/x' with no root is not '/x'.
    if ((String(p).includes('${ROOT}') && isBlank(root)) || (String(p).includes('${BRAIN}') && isBlank(brain))) return null;
    let s = String(p).split('${ROOT}').join(str(root)).split('${BRAIN}').join(str(brain));
    s = expandEnvVars(s);
    // A config is written by hand on any system, so both separators mean a folder break in it.
    s = IS_WIN ? s.replace(/\//g, '\\') : s.replace(/\\/g, '/');
    const rooted = path.isAbsolute(s) || /^~([\\/]|$)/.test(s);
    if (!rooted) {
        if (isBlank(root)) return null;
        s = path.join(root, s);
    }
    return toFullPath(s);
}

// The ask hook's defaults (OWN-04), used when the brain config has no `ask` key or no brain exists.
// minReason: the shortest option description that counts as a reason. equalPhrases: wording that
// offers options as equally fine, matched whole-word, case-insensitive, any run of spaces. The
// marker is a regex on the first option's label; the host's own convention is "(Recommended)".
export function askDefaults() {
    return {
        minReason: 40,
        equalPhrases: ['both are acceptable', 'both are fine', 'both are good', 'both options work', 'both would work',
            'either is fine', 'either works', 'either one works', 'either would work',
            'equally good', 'equally valid', 'equally fine', 'no wrong answer', 'no wrong choice',
            'whichever you prefer'],
        recommendedMarker: '(?i)\\brecommended\\b',
    };
}

// The read check's default ceiling (DES-03, CR-2026-10-15-SPLIT): one Read, measured at 1.98 bytes per
// token x 25,000 tokens, rounded down to 48 KiB. One constant, so an unreadable config keeps it too.
export const READ_CEILING_DEFAULT = 49152;

// The Stop card's default time budget in seconds: under the host's Stop timeout (20 s in hooks.json),
// with room for the card to print. Past it, stop.mjs reads no more repositories and names the ones
// it did not read, instead of being ended by the host without a word.
export const STOP_BUDGET_DEFAULT = 15;

// A .NET-style pattern as a JavaScript RegExp. A leading inline option group such as (?i) or (?im)
// becomes flags; `extra` adds flags. Anything JavaScript cannot read throws, and the caller reports it.
export function toRegex(pattern, extra = '') {
    let p = str(pattern);
    let flags = extra;
    const m = /^\(\?([imsx]+)\)/.exec(p);
    if (m) {
        p = p.slice(m[0].length);
        for (const ch of m[1]) if (ch !== 'x' && !flags.includes(ch)) flags += ch;
    }
    p = p.replace(/\\A/g, '^').replace(/\\[zZ]/g, '$');
    return new RegExp(p, flags);
}
export function countMatches(rx, s) {
    if (!s) return 0;
    const g = rx.flags.includes('g') ? rx : new RegExp(rx.source, rx.flags + 'g');
    g.lastIndex = 0;
    let n = 0;
    for (const _ of s.matchAll(g)) n++;
    return n;
}

function defaultBrainConfig() {
    return {
        protected: [], tombstoned: [], exceptions: [], present: false, reason: null,
        readCeilingBytes: READ_CEILING_DEFAULT, readCeilingExempt: [], sourceExtensions: [], stopDocs: [],
        stopFromGit: true, stopBudgetSeconds: STOP_BUDGET_DEFAULT, stopCard: { owner: true, writer: true },
        forbidScheduling: false, contentRules: [], contentRuleProblems: [],
        loopBranchPrefix: 'harness/', loopLedgerGlobs: ['docs/specs/*.tasks.json', 'specs/*.tasks.json'],
        ask: askDefaults(), keys: new Set(),
    };
}
export { defaultBrainConfig };

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
function parseIntStrict(v) {
    const s = str(v).trim();
    if (!/^[+-]?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) && Math.abs(n) <= 2147483647 ? n : null;
}
export { parseIntStrict };

// Brain config, with present false when there is no brain (no pointer, no folder, or no config file).
// Throws when the file exists and is not JSON: the caller decides what that costs.
export function readBrainConfig(ptr) {
    const out = defaultBrainConfig();
    if (ptr.pointer == null) { out.reason = `no pointer at ${ptr.path}`; return out; }
    if (!ptr.brain || !isDir(ptr.brain)) { out.reason = `brain folder missing: ${ptr.brain}`; return out; }
    const cfgPath = path.join(ptr.brain, 'doctor.config.json');
    if (!isFile(cfgPath)) { out.reason = `no doctor.config.json in ${ptr.brain}`; return out; }
    const cfg = readJson(cfgPath) || {};
    out.present = true;
    out.keys = new Set(Object.keys(cfg));
    const exp = (p) => expandConfigPath(str(p), ptr.root, ptr.brain);
    for (const k of ['frozenPaths', 'tombstonedPaths']) {
        for (const p of asList(cfg[k])) { const f = exp(p); if (f) out.protected.push(f); }
    }
    // The tombstoned list on its own: the one file the path rule lets through under a tombstoned
    // folder is its TOMBSTONE.md (VCS-12), which is the protection's own record.
    for (const p of asList(cfg.tombstonedPaths)) { const f = exp(p); if (f) out.tombstoned.push(f); }
    for (const e of asList(cfg.secretExceptions)) { const f = exp(e); if (f) out.exceptions.push(f); }
    // Rules 5 and 6 of the guard (DES-02, DES-03): tunables, with built-in defaults when absent.
    // readCeilingBytes 0 (or less) turns the read check off; the old splitLines key is not read (CR-2026-10-15-SPLIT).
    if (has(cfg, 'readCeilingBytes')) { const v = parseIntStrict(cfg.readCeilingBytes); if (v != null) out.readCeilingBytes = Math.max(0, v); }
    if (has(cfg, 'readCeilingExempt')) {
        out.readCeilingExempt = asList(cfg.readCeilingExempt).filter((x) => x).map((x) => expandEnvVars(String(x).split('${ROOT}').join(str(ptr.root)).split('${BRAIN}').join(str(ptr.brain))));
    }
    if (has(cfg, 'sourceExtensions')) out.sourceExtensions = asList(cfg.sourceExtensions).filter((x) => x).map((x) => String(x).toLowerCase());
    if (has(cfg, 'stopDocs')) out.stopDocs = asList(cfg.stopDocs).filter((x) => x).map(String);
    // The Stop card reads the turn's changes from git; false goes back to counting Edit and Write calls only.
    if (has(cfg, 'stopFromGit')) out.stopFromGit = !(cfg.stopFromGit === false || str(cfg.stopFromGit).toLowerCase() === 'false');
    // The Stop card's time budget in seconds (CR-2026-10-15-GAPS D5). A value outside (0, 18] keeps the
    // default: the host ends the Stop hook at 20 s (hooks.json), and a budget past that cannot fire.
    if (has(cfg, 'stopBudgetSeconds')) {
        const v = Number(str(cfg.stopBudgetSeconds).trim());
        if (str(cfg.stopBudgetSeconds).trim() !== '' && Number.isFinite(v) && v > 0 && v <= 18) out.stopBudgetSeconds = v;
    }
    // The Stop card per session role (0.2.11, CR-2026-10-21-COMMAND STOP-1): owner or writer, the
    // role the router wrote in <session>.role. Only an explicit false turns a role's card off; any
    // other value, or a missing key, keeps it on, so every adopter before 0.2.11 sees no change.
    if (has(cfg, 'stopCard') && cfg.stopCard != null && typeof cfg.stopCard === 'object') {
        for (const role of ['owner', 'writer']) {
            if (has(cfg.stopCard, role)) out.stopCard[role] = !(cfg.stopCard[role] === false || str(cfg.stopCard[role]).toLowerCase() === 'false');
        }
    }
    // Guard rules 8 and 9 (guard-owner-rules.mjs). forbidScheduling is opt-in: off unless the brain says true.
    if (has(cfg, 'forbidScheduling')) out.forbidScheduling = cfg.forbidScheduling === true || str(cfg.forbidScheduling).toLowerCase() === 'true';
    // Guard rules 11 and 12 (guard-loop-rules.mjs): the loop branch name and the story ledger paths.
    if (has(cfg, 'loopBranchPrefix') && !isBlank(cfg.loopBranchPrefix)) out.loopBranchPrefix = String(cfg.loopBranchPrefix);
    if (has(cfg, 'loopLedgerGlobs')) { const g = asList(cfg.loopLedgerGlobs).filter((x) => x).map(String); if (g.length) out.loopLedgerGlobs = g; }
    // The ask hook (OWN-04): each sub-key falls back to its default on its own. An empty marker
    // turns the recommended-first check off; minReason 0 turns the reason check off.
    if (has(cfg, 'ask') && cfg.ask != null && typeof cfg.ask === 'object') {
        const a = cfg.ask;
        if (has(a, 'minReason')) { const v = parseIntStrict(a.minReason); if (v != null && v >= 0) out.ask.minReason = v; }
        if (has(a, 'equalPhrases')) out.ask.equalPhrases = asList(a.equalPhrases).filter((x) => x).map(String);
        if (has(a, 'recommendedMarker')) out.ask.recommendedMarker = str(a.recommendedMarker);
    }
    for (const r of asList(cfg.contentRules)) {
        if (r == null) continue;
        try {
            const id = str(r.id);
            if (!id || !r.pattern) throw new Error('a content rule needs an id and a pattern');
            const under = asList(r.under).map(exp).filter((x) => x);
            if (under.length === 0) throw new Error(`content rule ${id} has no 'under' path that resolves`);
            out.contentRules.push({
                id,
                under,
                except: asList(r.except).filter((x) => x).map(exp).filter((x) => x),
                exceptParts: asList(r.exceptParts).filter((x) => x).map(String),
                extensions: asList(r.extensions).filter((x) => x).map((x) => String(x).toLowerCase()),
                regex: toRegex(String(r.pattern)),
                why: str(r.why),
                shell: r.shell === true,
            });
        } catch (e) { out.contentRuleProblems.push(`contentRules: ${e.message}`); }
    }
    return out;
}

// ASCII fold for names the console might mangle (SPEC 5.4: ASCII fallback for non-ASCII names).
export function toAscii(s) {
    if (!s || !/[^\x00-\x7f]/.test(s)) return s;
    return s.normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^\x00-\x7f]/g, '?');
}

// owner.name from <brain>/me.md YAML front-matter; "the owner" when absent.
export function getOwnerName(brain) {
    const fallback = 'the owner';
    if (!brain) return fallback;
    const me = path.join(brain, 'me.md');
    if (!isFile(me)) return fallback;
    try {
        const lines = readLines(me).slice(0, 60);
        if (lines.length < 3 || lines[0].trim() !== '---') return fallback;
        let inOwner = false;
        const unq = (v) => v.trim().replace(/^["']+|["']+$/g, '');
        for (let i = 1; i < lines.length; i++) {
            const l = lines[i];
            let m;
            if (l.trim() === '---') break;
            if ((m = /^owner\.name\s*:\s*(.+)$/i.exec(l))) return toAscii(unq(m[1]));
            if (/^owner\s*:\s*$/i.test(l)) { inOwner = true; continue; }
            if (inOwner && (m = /^\s+name\s*:\s*(.+)$/i.exec(l))) return toAscii(unq(m[1]));
            if (inOwner && /^\S/.test(l)) inOwner = false;
        }
    } catch { /* fall back */ }
    return fallback;
}

export function safeId(sessionId) { return (isBlank(sessionId) ? 'unknown' : String(sessionId)).replace(/[^A-Za-z0-9_.-]/g, '_'); }
export function sessionFile(sessionId, ext) { return path.join(getMarkerDir(), safeId(sessionId) + ext); }

// Once-per-session marker. Returns true the first time it is called for (sessionId, kind).
export function firstTime(sessionId, kind) {
    const dir = getMarkerDir();
    ensureDir(dir);
    const marker = path.join(dir, `${safeId(sessionId)}.${kind}`);
    try {
        fs.writeFileSync(marker, isoNow() + '\n', { encoding: 'utf8', flag: 'wx' });
        return true;
    } catch (e) {
        if (e.code === 'EEXIST') return false;
        throw e;
    }
}

export function sha1Hex(s) { return builtin('node:crypto').createHash('sha1').update(s, 'utf8').digest('hex').toUpperCase(); }

// ---------------------------------------------------------------- git

// Runs git with the given arguments in dir; returns { code, out (lines), raw }. stderr is discarded on
// purpose: exit codes 1 and 128 are answers here, not failures. A hook runs before its tool call, so
// nothing in the repository changes while it runs, and every answer is kept for the rest of the
// process: the rules ask the same question of the same folder several times per call.
const gitCache = new Map();
export function git(dir, args, { cache = true } = {}) {
    const key = cache ? JSON.stringify([dir, args]) : null;
    if (key && gitCache.has(key)) return gitCache.get(key);
    const r = builtin('node:child_process').spawnSync('git', ['-C', str(dir), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (r.error) {
        if (r.error.code === 'ENOENT') throw new Error('git is not on PATH');
        throw r.error;
    }
    const raw = r.stdout || '';
    const out = raw === '' ? [] : raw.replace(/\r?\n$/, '').split(/\r?\n/);
    const res = { code: r.status == null ? -1 : r.status, out, raw };
    if (key) gitCache.set(key, res);
    return res;
}
export function gitFirst(r) { return r.out.length ? r.out[0].trim() : ''; }
