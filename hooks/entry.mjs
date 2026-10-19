// entry.mjs - prints the brain's entry path on session start, refreshes the pointer, clears the session's routes on a compaction, and opens a repository that carries a hand-off with its state card.
//
// Puts the brain's entry path in front of the agent on turn one. Plain stdout becomes session
// context. Read-mostly: it writes only the heartbeat, the pointer's pluginRoot, and housekeeping
// of its own markers and log.
//   1. Refresh pointer.pluginRoot from CLAUDE_PLUGIN_ROOT when the running plugin's kind matches
//      pointer.pluginKind (checkout = not under a plugins/cache folder; cache = under one).
//      A mismatch is a dual install: warn once per session, leave the pointer alone.
//   2. Heartbeat <brain>/state/last-session.json.
//   3. On a compaction or a clear, delete this session's route file. Delete the marker files of
//      every other session none of whose files was written for a day; truncate the hooks log to 90 days.
//   4. cwd under root: print <brain>/entry.json in order, MISSING: for absent files, never skip.
//      "kit:" entries resolve under the running plugin root (the copy whose hooks run; the
//      pointer's pluginRoot only when that copy has no law.json), "brain:" under the brain.
//      Outside root: one line. No pointer: the /design-first:adopt line.
//   5. cwd inside a repository whose top-level folder the route policy maps to a state-card group
//      (a game repository), or, with stateCard.anyRepoWithHandoff on, inside any repository under
//      root that holds HANDOFF.md or docs/HANDOFF.md: print the state card built from its documents
//      and git (GAME-13, DES-14, lib/state-card.mjs).
// Output is buffered and printed once, so an internal error can still answer as JSON on both
// channels with the ERROR logged.
//
// anchor: entry-path  mode: advise  verbs: load-context

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readStdin } from './lib/stdin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const lines = [];

function pluginKind(p) { return /[\\/]plugins[\\/]cache([\\/]|$)/i.test(p) ? 'cache' : 'checkout'; }

// Entry forms (templates/entry.json): "kit:<rel>" is under the kit root, "brain:<rel>" is under
// the brain. The older forms still work: ${ROOT}, ${BRAIN}, %USERPROFILE%, and a bare relative
// path, which is brain-relative. Only those two words are prefixes; "C:\x" has a colon too and
// must stay a rooted path. Returns null when an entry cannot be resolved at all.
// 2026-10-07: before this, both prefixes fell through to a join against the brain and every
// prefixed entry printed as MISSING: C:\...\AI-Brain\kit:instructions\... The self-test fixture
// only used the older forms, so it never caught it.
function expandEntryPath(C, p, ptr, kit) {
    const s = String(p).trim();
    const m = /^(kit|brain):(.*)$/i.exec(s);
    if (m) {
        const base = m[1].toLowerCase() === 'kit' ? kit : C.str(ptr.brain);
        const rel = m[2].replace(/^[\\/]+/, '');
        if (C.isBlank(base) || C.isBlank(rel)) return null;
        return C.toFullPath(path.join(base, rel));
    }
    let t = s.split('${ROOT}').join(C.str(ptr.root)).split('${BRAIN}').join(C.str(ptr.brain));
    t = C.expandEnvVars(t);
    if (!path.isAbsolute(t)) t = path.join(C.str(ptr.brain), t);
    return C.toFullPath(t);
}

try {
    const raw = readStdin();
    const C = await import('./lib/common.mjs');
    let j = null;
    if (raw.trim()) { try { j = JSON.parse(raw); } catch { j = null; } }
    const sessionId = j && j.session_id ? String(j.session_id) : 'unknown';
    const source = j && j.source ? String(j.source) : 'unknown';
    const cwd = j && j.cwd ? C.toFullPath(String(j.cwd)) : process.cwd();

    // Unexpanded variable: the literal string means the host did not substitute it (C4, finding 81).
    let pluginRootEnv = C.str(process.env.CLAUDE_PLUGIN_ROOT);
    if (pluginRootEnv.includes('${CLAUDE_PLUGIN_ROOT}') || HERE.includes('${CLAUDE_PLUGIN_ROOT}')) {
        C.writeLog('ERROR', 'entry', 'CLAUDE_PLUGIN_ROOT arrived unexpanded (literal ${CLAUDE_PLUGIN_ROOT})');
        lines.push('design-first: ERROR - CLAUDE_PLUGIN_ROOT arrived unexpanded; logged.');
        pluginRootEnv = '';
    }

    const ptr = C.readPointer();
    if (ptr.warning) { C.writeLog('ERROR', 'entry', ptr.warning); lines.push(`design-first: ERROR - ${ptr.warning}`); }

    if (ptr.pointer == null) {
        lines.push(`design-first: no brain is set up on this profile (no pointer at ${ptr.path}). Run /design-first:adopt to create one.`);
    } else {
        // 1. pluginRoot refresh, kind-checked (findings 43, 84, 85).
        if (pluginRootEnv) {
            const runningRoot = C.toFullPath(pluginRootEnv);
            const runningKind = pluginKind(runningRoot);
            let recordedKind = C.str(ptr.pointer.pluginKind);
            if (!recordedKind) recordedKind = runningKind;
            if (runningKind === recordedKind) {
                const recorded = ptr.pointer.pluginRoot ? C.toFullPath(String(ptr.pointer.pluginRoot)) : null;
                if (!C.pathEq(recorded, runningRoot) || C.str(ptr.pointer.pluginKind) !== runningKind) {
                    ptr.pointer.pluginRoot = runningRoot;
                    ptr.pointer.pluginKind = runningKind;
                    fs.writeFileSync(ptr.path, JSON.stringify(ptr.pointer, null, 2) + '\n', 'utf8');
                }
            } else if (C.firstTime(sessionId, 'kindwarned')) {
                C.writeLog('WARN', 'entry', `plugin kind mismatch: pointer says ${recordedKind}, running plugin is ${runningKind} at ${runningRoot}`);
                lines.push(`design-first: WARNING - the pointer records a '${recordedKind}' install but this session runs a '${runningKind}' install (${runningRoot}). Two installs on one profile is unsupported; the pointer was left unchanged.`);
            }
        }

        // 2. heartbeat
        const brainOk = ptr.brain && C.isDir(ptr.brain);
        if (brainOk) {
            const stateDir = path.join(ptr.brain, 'state');
            C.ensureDir(stateDir);
            const beat = { when: C.isoNow(), session_id: sessionId, source, cwd, pluginRoot: C.str(ptr.pointer.pluginRoot) };
            fs.writeFileSync(path.join(stateDir, 'last-session.json'), JSON.stringify(beat, null, 2) + '\n', 'utf8');
        } else lines.push(`design-first: WARNING - brain folder missing: ${ptr.brain}. Heartbeat and entry path skipped.`);

        // 3a. compaction or clear: forget this session's routes so the next prompt re-injects its law
        // (DES-13). A clear empties the context as a compaction does (CR-2026-10-15-GAPS D5; a clear
        // used to keep the routes). The delete is keyed by the session id the host reports; when the
        // host gives a clear a new id, there is no route file under it and nothing to delete. No kit
        // file records which the host does, so a clear logs one INFO line that says what it found.
        if (source === 'compact' || source === 'clear') {
            const routeFile = path.join(C.getMarkerDir(), C.safeId(sessionId) + '.routes');
            const hadRoutes = C.exists(routeFile);
            if (hadRoutes) { try { fs.rmSync(routeFile, { force: true }); } catch { /* gone already */ } }
            if (source === 'clear') {
                C.writeLog('INFO', 'entry', `clear: session ${sessionId} ${hadRoutes ? 'had a route file, so the host kept the session id; routes deleted' : 'had no route file (a new session id, or nothing routed yet)'}`);
            }
        }
        // 3. housekeeping: the marker files of a session none of whose files was written for a day, and
        // never the starting session's own. A file is named "<session>.<kind>"; the session is the part
        // before the first dot. Workaround (CR-2026-10-15-GAPS D5): every marker older than a day was
        // deleted, a live session's too, so a session resumed after a day lost its interview marker and
        // the Stop card said "no question was asked this session" when one was, and its routes came again.
        const markerDir = C.getMarkerDir();
        if (C.isDir(markerDir)) {
            const cut = Date.now() - 86400000;
            const own = (C.safeId(sessionId) + '.').toLowerCase();
            const bySession = new Map();
            for (const e of fs.readdirSync(markerDir, { withFileTypes: true })) {
                if (!e.isFile() || e.name.toLowerCase().startsWith(own)) continue;
                const key = e.name.split('.')[0];
                if (!bySession.has(key)) bySession.set(key, []);
                bySession.get(key).push(path.join(markerDir, e.name));
            }
            for (const files of bySession.values()) {
                const live = files.some((f) => { try { return fs.statSync(f).mtimeMs >= cut; } catch { return false; } });
                if (live) continue;                                   // written within the day: live
                for (const f of files) { try { fs.rmSync(f, { force: true }); } catch { /* best effort */ } }
            }
        }
        const logPath = C.getLogPath();
        if (C.isFile(logPath)) {
            const cut = Date.now() - 90 * 86400000;
            const all = C.readText(logPath).split(/\r?\n/);
            if (all.length && all[all.length - 1] === '') all.pop();
            // Lines without a parseable ISO stamp are kept; only dated lines older than 90 days go.
            const keep = all.filter((l) => {
                const m = /^(\S+)\s/.exec(l);
                const t = m ? C.parseIso(m[1]) : null;
                return t == null || t >= cut;
            });
            if (keep.length < all.length) fs.writeFileSync(logPath, keep.map((l) => l + '\n').join(''), 'utf8');
        }

        // 4. the entry path
        if (brainOk) {
            if (ptr.root && C.isUnder(cwd, ptr.root)) {
                const entryFile = path.join(ptr.brain, 'entry.json');
                lines.push(`design-first: entry path (brain ${ptr.brain}). Read these in order before the first build or edit task; say which you read.`);
                if (!C.isFile(entryFile)) lines.push(`MISSING: ${entryFile}`);
                else {
                    const entry = C.readJson(entryFile);
                    const items = entry && Object.prototype.hasOwnProperty.call(entry, 'entries') ? (Array.isArray(entry.entries) ? entry.entries : [entry.entries]) : [entry];
                    // Kit root for "kit:" entries: the plugin this hook is running from (hooks/ is one
                    // level under the plugin root), the pointer's pluginRoot only when that copy has no
                    // law.json. Workaround (CR-2026-10-16-ONEWRITER chunk 0, ported in 0.2.3): the pointer
                    // came first, so after a plugin update the entry path could name another version than
                    // the hook code.
                    let kit = C.toFullPath(path.dirname(HERE));
                    if (!(kit && C.isFile(path.join(kit, 'law.json'))) && ptr.pointer.pluginRoot) kit = C.toFullPath(String(ptr.pointer.pluginRoot));
                    let n = 0;
                    for (const it of items) {
                        if (it == null) continue;
                        n++;
                        const rel = typeof it === 'string' ? it : C.str(it.path);
                        const note = typeof it === 'string' ? '' : it.note ? String(it.note) : it.why ? String(it.why) : '';
                        const full = expandEntryPath(C, rel, ptr, kit);
                        const suffix = note ? ` - ${note}` : '';
                        if (full && C.isFile(full)) lines.push(` ${n}. ${full}${suffix}`);
                        else if (full) lines.push(` ${n}. MISSING: ${full}${suffix}`);
                        else lines.push(` ${n}. MISSING: ${rel} (could not be resolved)${suffix}`);
                    }
                    if (n === 0) lines.push(' (entry.json lists no files)');
                }
                // 5. the state card (GAME-13, DES-14): which repositories get one is item 5 at the
                //    top of this file. A failure here must not cost the session its entry path, so
                //    it is caught, logged and said.
                try {
                    const { stateCardLines } = await import('./lib/state-card.mjs');
                    for (const cl of stateCardLines(cwd, ptr)) lines.push(String(cl));
                } catch (e) {
                    C.writeLog('ERROR', 'entry', `state card failed: ${e.message}`);
                    lines.push(`design-first: the state card could not be built (${e.message}); logged. Build it by hand from the repository's documents (GAME-13).`);
                }
            } else {
                lines.push(`design-first: session is outside root (${ptr.root}); entry path not loaded.`);
            }
        }
    }
    if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR entry ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    const body = (`entry hook hit an internal error: ${msg}. Logged to the design-first hooks log. Partial output:\n` + lines.join('\n')).trimEnd();
    process.stdout.write(JSON.stringify({
        systemMessage: `ENTRY: internal error (${msg})`,
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: body },
    }) + '\n');
}
process.exitCode = 0;
