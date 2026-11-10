// claims-exec.mjs - the two claim types that run a process: generated_matches and hook_smoke.
// READ-ONLY with respect to the workspace: the generator writes into a temp file that is deleted.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { readText, parseJson, internalErrorReply } from '../../hooks/lib/common.mjs';
import { getPointerPath, derivedPaths, registrationSource, expandHookCommand } from './context.mjs';
import { claimResult, resolveClaimPath, isFile } from './claims-base.mjs';
import { runProcess, scriptCommand, which, splitCommandLine, SCRIPT_EXT_RX } from './util.mjs';

const lfBytes = (p) => {
    const raw = fs.readFileSync(p);
    const out = Buffer.alloc(raw.length);
    let n = 0;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === 13 && i + 1 < raw.length && raw[i + 1] === 10) continue;
        out[n++] = raw[i];
    }
    return out.subarray(0, n);
};

// A script named with the kit's old .ps1 extension that is gone, beside a .mjs of the same name,
// is the same script ported: a brain's claims written before the port still name the .ps1 form.
function portedScript(p) {
    if (/\.ps1$/i.test(p) && !isFile(p)) {
        const twin = p.replace(/\.ps1$/i, '.mjs');
        if (isFile(twin)) return twin;
    }
    return p;
}

// ---------------------------------------------------------------- generated_matches (C5)

// Fields: generator, args?, source, overlay?, installed?, output. Runs the generator from the kit root into
// a temp file and compares bytes after mapping CRLF -> LF on both sides (nothing else). A generator
// that exits non-zero is the Doctor not being able to look, not a false claim. `args` (0.3.0,
// KIT-SETTINGS-01) is a list of strings passed to the generator as typed, before -Source, so a claim
// on a file one generator renders in more than one form names its form (-Vendored -Set cloud-brain).
// A value that is not a list of non-empty strings is UNKNOWN, never dropped: dropped, the generator
// renders another form and the claim compares the wrong bytes.
export function generatedMatchesClaim(c, ctx) {
    const kit = ctx.kit;
    if (!kit) return claimResult(c, 'UNKNOWN', 'no kit root (pointer.pluginRoot) to run the generator from');
    const kitCtx = { root: ctx.root, brain: ctx.brain, kit, base: kit };
    const g = resolveClaimPath(c.generator, kitCtx, 'generator');
    if (!g.path) return claimResult(c, 'UNKNOWN', g.detail);
    const s = resolveClaimPath(c.source, ctx, 'source');
    if (!s.path) return claimResult(c, 'UNKNOWN', s.detail);
    const o = resolveClaimPath(c.output, ctx, 'output');
    if (!o.path) return claimResult(c, 'UNKNOWN', o.detail);
    const gen = portedScript(g.path);
    for (const [name, p] of [['generator', gen], ['source', s.path]]) if (!isFile(p)) return claimResult(c, 'UNKNOWN', `${name} missing: ${p}`);
    if (c.args != null && (!Array.isArray(c.args) || c.args.some((x) => typeof x !== 'string' || x.trim() === ''))) {
        return claimResult(c, 'UNKNOWN', `'args' must be a list of strings, passed to the generator before -Source (got ${JSON.stringify(c.args)})`);
    }
    const genArgs = [...(c.args || []), '-Source', s.path];
    for (const [field, flag] of [['overlay', '-Overlay'], ['installed', '-Installed']]) {
        if (c[field] == null || !String(c[field]).trim()) continue;
        const p = resolveClaimPath(c[field], ctx, field);
        if (!p.path) return claimResult(c, 'UNKNOWN', p.detail);
        if (!isFile(p.path)) return claimResult(c, 'UNKNOWN', `${field} missing: ${p.path}`);
        genArgs.push(flag, p.path);
    }
    // In brain mode the overlay's refs (brain: owners, brain claim ids) resolve only with -BrainRoot;
    // without it the generator fails validation and this claim reads COULD-NOT-LOOK forever.
    if (ctx.brain) genArgs.push('-BrainRoot', ctx.brain);
    const sc = scriptCommand(gen);
    if (!sc.cmd) return claimResult(c, 'UNKNOWN', `${sc.error}: ${gen}`);
    const tmp = path.join(os.tmpdir(), `design-first-gen-${crypto.randomBytes(8).toString('hex')}.md`);
    genArgs.push('-Out', tmp);
    try {
        const run = runProcess(sc.cmd[0], [...sc.cmd.slice(1), ...genArgs], { stdin: '', timeoutSeconds: 60, cwd: kit });
        if (!run.started) return claimResult(c, 'UNKNOWN', run.error);
        if (run.timedOut) return claimResult(c, 'UNKNOWN', `generator timed out after 60 s: ${gen}`);
        if (run.exit !== 0) {
            let msg = `${run.stderr} ${run.stdout}`.replace(/\s+/g, ' ').trim();
            if (msg.length > 200) msg = msg.slice(0, 200) + '...';
            return claimResult(c, 'UNKNOWN', `generator exited ${run.exit}: ${msg}`);
        }
        if (!isFile(tmp)) return claimResult(c, 'UNKNOWN', 'generator exited 0 but wrote no output file');
        if (!isFile(o.path)) return claimResult(c, 'FAIL', `generated output is missing on disk: ${o.path} (the generator produced one)`);
        const a = lfBytes(tmp); const b = lfBytes(o.path);
        if (a.equals(b)) return claimResult(c, 'PASS', `${o.path} equals the generator's output (${b.length} bytes after CRLF->LF)`);
        let first = 0; const n = Math.min(a.length, b.length);
        while (first < n && a[first] === b[first]) first++;
        return claimResult(c, 'FAIL', `${o.path} differs from the generator's output (first difference at byte ${first}; sizes ${b.length} vs ${a.length}). Regenerate it; never hand-edit.`);
    } finally {
        try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    }
}

// ---------------------------------------------------------------- hook_smoke (findings 40, 73, 81)

// The first hook entry under hooks.<event> whose command or args name the hook script.
function findRegisteredHook(doc, event, hook) {
    const list = doc && doc.hooks ? doc.hooks[event] : null;
    if (list == null) return null;
    const name = SCRIPT_EXT_RX.test(hook) ? hook.replace(SCRIPT_EXT_RX, '') : hook;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('(^|[\\\\/"\' ])' + escaped + '\\.(mjs|cjs|js|ps1|sh|py)(\\b|$)', 'i');
    for (const entry of Array.isArray(list) ? list : [list]) {
        for (const h of Array.isArray(entry && entry.hooks) ? entry.hooks : []) {
            const text = Array.isArray(h.args) && h.args.length ? h.args.join(' ') : String(h.command ?? '');
            if (rx.test(text)) return h;
        }
    }
    return null;
}

const EVENTS = ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'SubagentStart', 'Stop'];

// One marker folder for every hook smoke of one Doctor run: made with fs.mkdtempSync under the OS temp
// folder on the first smoke and handed to each smoke as DF_MARKER_DIR, so a smoke never reads or leaves
// a doctor-smoke marker in the machine's shared folder (<os temp>/design-first, where the live sessions'
// hooks keep theirs), while what one smoke leaves the next can read inside the run (the route smoke's
// turn marker and routes, which the stop and subagent smokes read). Removed when the run ends, also on
// a throw: the process exit event removes it on a normal end and on process.exit (doctor.mjs's crash
// handler ends a throw that way). What it cannot clean: a run stopped by a signal (Ctrl+C, SIGTERM,
// SIGKILL), on which Node emits no exit event, leaves one design-first-smoke-* folder under the OS temp
// folder.
let smokeDir = null;
function smokeMarkerDir() {
    if (smokeDir == null) {
        smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-first-smoke-'));
        process.once('exit', removeSmokeMarkerDir);
    }
    return smokeDir;
}
function removeSmokeMarkerDir() {
    if (smokeDir == null) return;
    try { fs.rmSync(smokeDir, { recursive: true, force: true }); } catch { /* best effort: a folder under the OS temp folder */ }
    smokeDir = null;
}

// Fields: hook (e.g. "guard"), event. Reads the registrations where they are (context.mjs
// registrationSource: hooks/hooks.json under the kit in the plugin form; <root>/.claude/settings.json
// in the vendored form, under -Scope brain or when the kit carries no hooks.json), expands
// ${CLAUDE_PLUGIN_ROOT} as the kit and ${CLAUDE_PROJECT_DIR} as the root, runs the registered command
// with synthetic stdin, a 10 s timeout and the run's own marker folder (smokeMarkerDir above). Pass per
// event: SessionStart = exit 0 + non-empty stdout; UserPromptSubmit = exit 0; the others = exit 0 +
// (empty stdout or parseable JSON). On every event the kit's internal-error reply is FAIL, never a
// pass: the hook ran and inspected nothing (review findings 4 and 27). The reply is recognised by
// hooks/lib/common.mjs internalErrorReply, the one recognizer the hook suite's smoke cases use too: a
// JSON systemMessage that says 'internal error', an additionalContext that says 'hook hit an internal
// error' (subagent.mjs), or plain text that says it (route.mjs).
export function hookSmokeClaim(c, ctx) {
    const hook = String(c.hook ?? ''); const event = String(c.event ?? '');
    if (!hook.trim()) return claimResult(c, 'UNKNOWN', "claim has no 'hook'");
    if (!EVENTS.includes(event)) return claimResult(c, 'UNKNOWN', `'event' must be SessionStart, PreToolUse, UserPromptSubmit, SubagentStart or Stop (got '${event}')`);
    const pluginRoot = ctx.pluginRoot;
    if (!pluginRoot) return claimResult(c, 'UNKNOWN', 'no pluginRoot to read hooks.json from');
    const derived = derivedPaths(ctx);
    const source = registrationSource(ctx, derived);
    // No record at all: the detail is the source's own why (which files it looked for), never a guess
    // from a kit's hooks.json that is not this root's record.
    if (!source.exists) return claimResult(c, 'UNKNOWN', `${source.why}; nothing shows that '${hook}' is registered${source.form === 'vendored' ? ` (render the registrations into it: node <kit>/tools/settings.mjs -Vendored -Out ${source.path})` : ''}`);
    const record = source.form === 'plugin' ? 'hooks.json' : 'the settings file';
    let doc;
    try { doc = parseJson(readText(source.path)); } catch (e) { return claimResult(c, 'UNKNOWN', `${record} could not be parsed: ${e.message}`); }
    // A record with no hooks block registers nothing (a settings file written with no vendored kit): say
    // that, not "the registration moved", so the fix is the render, and the survey finding says the same.
    if (!doc || typeof doc !== 'object' || !doc.hooks || typeof doc.hooks !== 'object') return claimResult(c, 'UNKNOWN', `no hooks block in ${source.path}, so nothing is registered; render the registrations into it (node <kit>/tools/settings.mjs ${source.form === 'vendored' ? '-Vendored' : '-Plugin'} -Out ${source.path})`);
    const reg = findRegisteredHook(doc, event, hook);
    if (reg == null) return claimResult(c, 'UNKNOWN', `hook '${hook}' is not registered for ${event} in ${source.path} (not built yet, or the registration moved)`);

    // Two registration shapes: exec form (`args[]`, optionally with the executable in `command`) and
    // the plain `command` string, which is split quote-aware. The root variable of the form is
    // expanded: ${CLAUDE_PLUGIN_ROOT} as the kit, ${CLAUDE_PROJECT_DIR} as the root.
    let tokens;
    if (Array.isArray(reg.args) && reg.args.length) {
        tokens = reg.args.map(String);
        if (reg.command && String(reg.command).trim() && tokens[0] !== String(reg.command)) tokens = [String(reg.command), ...tokens];
    } else tokens = splitCommandLine(String(reg.command ?? ''));
    tokens = tokens.map((t) => expandHookCommand(t, ctx));
    if (tokens.length === 0) return claimResult(c, 'UNKNOWN', 'registration has neither command nor args');
    const exe = tokens[0];
    const resolved = which(exe);
    if (resolved == null) return claimResult(c, 'FAIL', `'${exe}' is not on PATH, so the ${hook} hook can never start${exe === 'node' ? ' (install Node.js 18 or later)' : ''}`);
    const script = tokens.slice(1).find((t) => SCRIPT_EXT_RX.test(t));
    if (script && !isFile(script)) return claimResult(c, 'FAIL', `registered but missing on disk: ${script}`);
    const cwd = ctx.root || pluginRoot;
    const base = { session_id: 'doctor-smoke', hook_event_name: event, cwd, transcript_path: '' };
    const stdin = {
        SessionStart: { ...base, source: 'startup' },
        PreToolUse: { ...base, tool_name: 'Bash', tool_input: { command: 'echo doctor-smoke' } },
        UserPromptSubmit: { ...base, prompt_id: 'doctor-smoke', prompt: 'doctor smoke: a build task touching a repo' },
        SubagentStart: { ...base, agent_id: 'doctor-smoke', agent_type: 'general-purpose' },
        Stop: { ...base, stop_hook_active: false, last_assistant_message: 'doctor smoke' },
    }[event];
    // The hook sees the variable its form reads: CLAUDE_PLUGIN_ROOT in the plugin form, CLAUDE_PROJECT_DIR
    // (the root, as a cloud container sets it) in the vendored form; and the run's own marker folder.
    let markers;
    try { markers = smokeMarkerDir(); } catch (e) { return claimResult(c, 'UNKNOWN', `no marker folder for the smoke could be made under ${os.tmpdir()}: ${e.message}`); }
    const env = source.form === 'vendored' ? { CLAUDE_PROJECT_DIR: ctx.root, DF_POINTER_PATH: getPointerPath(), DF_MARKER_DIR: markers } : { CLAUDE_PLUGIN_ROOT: pluginRoot, DF_POINTER_PATH: getPointerPath(), DF_MARKER_DIR: markers };
    const run = runProcess(resolved, tokens.slice(1), { stdin: JSON.stringify(stdin), timeoutSeconds: 10, cwd, env });
    if (!run.started) return claimResult(c, 'FAIL', run.error);
    if (run.timedOut) return claimResult(c, 'FAIL', `${hook} (${event}) did not exit within 10 s`);
    let err = run.stderr.replace(/\s+/g, ' ').trim(); if (err.length > 200) err = err.slice(0, 200) + '...';
    if (run.exit !== 0) return claimResult(c, 'FAIL', `${hook} (${event}) exited ${run.exit} before/inside its body. stderr: ${err}`);
    const out = run.stdout.trim();
    const failed = internalErrorReply(out);
    if (failed) {
        const shown = failed.length > 500 ? failed.slice(0, 500) + '...' : failed;
        return claimResult(c, 'FAIL', `${hook} (${event}) exited 0 with the kit's internal-error reply, so it inspected nothing: ${shown}`);
    }
    if (event === 'SessionStart') {
        if (out.length === 0) return claimResult(c, 'FAIL', `${hook} (SessionStart) exited 0 but printed nothing; the entry path would load silently empty`);
        return claimResult(c, 'PASS', `${hook} (SessionStart) exit 0, ${out.length} char(s) of context`);
    }
    // Plain stdout is the carrier; empty is a legal answer (nothing new to route this prompt).
    if (event === 'UserPromptSubmit') return claimResult(c, 'PASS', `${hook} (UserPromptSubmit) exit 0, ${out.length} char(s) of context`);
    if (out.length === 0) return claimResult(c, 'PASS', `${hook} (${event}) exit 0, silent allow`);
    try { JSON.parse(out); } catch {
        const shown = out.length > 120 ? out.slice(0, 120) + '...' : out;
        return claimResult(c, 'FAIL', `${hook} (${event}) exit 0 but stdout is not JSON: ${shown}`);
    }
    return claimResult(c, 'PASS', `${hook} (${event}) exit 0, JSON reply`);
}
