// claims-exec.mjs - the two claim types that run a process: generated_matches and hook_smoke.
// READ-ONLY with respect to the workspace: the generator writes into a temp file that is deleted.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { readText, parseJson } from '../../hooks/lib/common.mjs';
import { getPointerPath } from './context.mjs';
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

// Fields: generator, source, overlay?, installed?, output. Runs the generator from the kit root into
// a temp file and compares bytes after mapping CRLF -> LF on both sides (nothing else). A generator
// that exits non-zero is the Doctor not being able to look, not a false claim.
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
    const genArgs = ['-Source', s.path];
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

// Fields: hook (e.g. "guard"), event. Reads hooks/hooks.json under pluginRoot, substitutes
// ${CLAUDE_PLUGIN_ROOT}, runs the registered command with synthetic stdin and a 10 s timeout. Pass
// per event: SessionStart = exit 0 + non-empty stdout; UserPromptSubmit = exit 0; the others = exit 0
// + (empty stdout or parseable JSON).
export function hookSmokeClaim(c, ctx) {
    const hook = String(c.hook ?? ''); const event = String(c.event ?? '');
    if (!hook.trim()) return claimResult(c, 'UNKNOWN', "claim has no 'hook'");
    if (!EVENTS.includes(event)) return claimResult(c, 'UNKNOWN', `'event' must be SessionStart, PreToolUse, UserPromptSubmit, SubagentStart or Stop (got '${event}')`);
    const pluginRoot = ctx.pluginRoot;
    if (!pluginRoot) return claimResult(c, 'UNKNOWN', 'no pluginRoot to read hooks.json from');
    const hooksPath = path.join(pluginRoot, 'hooks', 'hooks.json');
    if (!isFile(hooksPath)) return claimResult(c, 'UNKNOWN', `hooks.json missing: ${hooksPath}`);
    let doc;
    try { doc = parseJson(readText(hooksPath)); } catch (e) { return claimResult(c, 'UNKNOWN', `hooks.json could not be parsed: ${e.message}`); }
    const reg = findRegisteredHook(doc, event, hook);
    if (reg == null) return claimResult(c, 'UNKNOWN', `hook '${hook}' is not registered for ${event} in ${hooksPath} (not built yet, or the registration moved)`);

    // Two registration shapes: exec form (`args[]`, optionally with the executable in `command`) and
    // the plain `command` string, which is split quote-aware.
    let tokens;
    if (Array.isArray(reg.args) && reg.args.length) {
        tokens = reg.args.map(String);
        if (reg.command && String(reg.command).trim() && tokens[0] !== String(reg.command)) tokens = [String(reg.command), ...tokens];
    } else tokens = splitCommandLine(String(reg.command ?? ''));
    tokens = tokens.map((t) => t.split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot).split('$CLAUDE_PLUGIN_ROOT').join(pluginRoot));
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
    const run = runProcess(resolved, tokens.slice(1), { stdin: JSON.stringify(stdin), timeoutSeconds: 10, cwd, env: { CLAUDE_PLUGIN_ROOT: pluginRoot, DF_POINTER_PATH: getPointerPath() } });
    if (!run.started) return claimResult(c, 'FAIL', run.error);
    if (run.timedOut) return claimResult(c, 'FAIL', `${hook} (${event}) did not exit within 10 s`);
    let err = run.stderr.replace(/\s+/g, ' ').trim(); if (err.length > 200) err = err.slice(0, 200) + '...';
    if (run.exit !== 0) return claimResult(c, 'FAIL', `${hook} (${event}) exited ${run.exit} before/inside its body. stderr: ${err}`);
    const out = run.stdout.trim();
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
