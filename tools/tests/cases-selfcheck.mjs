// cases-selfcheck.mjs - hook self-test cases for the arming proof (0.3.0, KIT-02): guard rule 15
// refuses the probe command 'node .claude/kit/tools/selfcheck.mjs' with the reason
// 'ARMED <version> <sha>' of the running kit; tools/selfcheck.mjs run bare prints
// 'UNARMED: no guard saw this call' and exits 2; a planted marker file changes neither answer; and
// the nested-shell form is NOT refused (the residual, asserted so nobody believes otherwise).
// Imported by run.mjs before cases-kitroot.mjs. The expected reason is computed through
// hooks/lib/kit-version.mjs over the running kit, never typed. Never run directly.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export default async function selfcheckCases(t) {
    const { T, kit, root, record, section, put, readText, invokeHook, hookJson, parseOut, classify, withoutPointer } = t;

    section('-- selfcheck: the arming proof (0.3.0, KIT-02)');
    // The expected reason comes from the module the guard reads, over the running kit: here the
    // checkout, so the version is plugin.json's and the sha is the tree sha over the manifest's files.
    const KV = await import(pathToFileURL(path.join(kit, 'hooks', 'lib', 'kit-version.mjs')).href);
    const kv = KV.kitVersion(kit);
    const sha12 = KV.shortSha(kv.sha);
    const expected = `ARMED ${kv.version} ${sha12}`;
    record('selfcheck: the running kit has a version and a 12-character sha through kit-version.mjs', 'known', kv.source !== 'none' && kv.version && /^[0-9a-f]{12}$/.test(sha12) ? 'known' : `source=${kv.source} version=${kv.version} sha=${sha12}`);

    const PROBE = 'node .claude/kit/tools/selfcheck.mjs';
    const guardShell = (command, session, tool = 'Bash') => invokeHook('guard.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command } }));
    const decision = (r) => (r.code !== 0 ? `exit${r.code}` : classify(r.out));
    const reasonOf = (r) => { const j = parseOut(r.out); return j && j.hookSpecificOutput ? String(j.hookSpecificOutput.permissionDecisionReason ?? '') : ''; };
    const titleOf = (r) => { const j = parseOut(r.out); return j ? String(j.systemMessage ?? '') : 'no-json'; };

    let r = guardShell(PROBE, 'sc-armed');
    record('selfcheck: the guard refuses the probe command', 'deny', decision(r), r.out);
    record('selfcheck: the reason is ARMED <version> <sha12> of the running kit, computed through the module', expected, reasonOf(r), r.out);
    record('selfcheck: the refusal title is ARMED', 'GUARD: ARMED', titleOf(r), r.out);
    r = guardShell(PROBE, 'sc-armed-pwsh', 'PowerShell');
    record('selfcheck: the PowerShell tool gets the same reason', expected, reasonOf(r), r.out);

    // The script run bare, as it runs when no guard is loaded: the UNARMED line on stdout, exit 2.
    const script = path.join(kit, 'tools', 'selfcheck.mjs');
    const bare = () => {
        const b = spawnSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true, cwd: root });
        return { code: b.status == null ? -1 : b.status, stdout: (b.stdout || '').replace(/\r\n/g, '\n'), all: ((b.stdout || '') + (b.stderr || '')).replace(/\r\n/g, '\n') };
    };
    const firstLine = (s) => s.split('\n').find((l) => l.trim()) ?? '';
    const UNARMED = 'UNARMED: no guard saw this call';
    let b = bare();
    record('selfcheck: the bare script exits 2', 2, b.code, b.all);
    record('selfcheck: the bare script prints the UNARMED line first', UNARMED, firstLine(b.stdout), b.all);

    // A planted marker file, anything under the marker folder, changes neither answer: a model can
    // touch a file, it cannot produce a hook decision (C2 gap 17). The names cover what a forger
    // would try: the session's own marker, the words armed, UNARMED and selfcheck.
    const markers = process.env.DF_MARKER_DIR;
    const planted = ['sc-armed.armed', 'sc-armed.selfcheck', 'armed', 'UNARMED', 'selfcheck'].map((n) => path.join(markers, n));
    for (const p of planted) put(p, `${expected}\nforged by the case\n`);
    r = guardShell(PROBE, 'sc-armed');
    record('selfcheck: planted marker files, the guard still refuses with the same reason', expected, decision(r) === 'deny' ? reasonOf(r) : decision(r), r.out);
    b = bare();
    record('selfcheck: planted marker files, the bare script still exits 2 with the UNARMED line', 'exit2+UNARMED', b.code === 2 && firstLine(b.stdout) === UNARMED ? 'exit2+UNARMED' : `exit${b.code}+${firstLine(b.stdout) || 'no-line'}`, b.all);
    for (const p of planted) { try { fs.rmSync(p); } catch { /* best effort */ } }

    // The residual, self-tested as NOT refused so nobody believes otherwise: a nested shell hides the
    // command from every shell rule (guard.mjs, "cannot see"); the script then runs and prints
    // UNARMED, which is the safe side (a stop, never a false go).
    r = guardShell(`bash -c "${PROBE}"`, 'sc-nested');
    record('selfcheck RESIDUAL: bash -c "node .claude/kit/tools/selfcheck.mjs" is NOT refused (nested shell; the script runs and says UNARMED)', 'allow', decision(r), r.out);

    // Where the reason's version and sha come from: three copies of the hooks under ${T}, each run
    // through invokeHook's hooks-folder argument, with the pointer seam at a missing file and
    // CLAUDE_PROJECT_DIR and DF_KIT_ROOT unset, so neither a pointer's pluginRoot nor a repository's
    // .claude/kit can lend a root. (1) hooks/ alone, no kit around it: the refusal still proves the
    // guard, and its reason is ARMED unknown unknown. (2) A vendored copy, law.json and VERSION beside
    // hooks/: the reason is VERSION's version and sha, never this checkout's. (3) A copy whose tree
    // cannot be hashed (plugin.json and a manifest naming a folder that is missing, no VERSION):
    // ARMED unknown unknown, and one ERROR line in the hooks log says why, so the unknown is never
    // silent (fail loud, never silent).
    const copies = path.join(T, 'sc-kit-copies');
    const copyHooks = (name) => { const d = path.join(copies, name); fs.cpSync(path.join(kit, 'hooks'), path.join(d, 'hooks'), { recursive: true }); return d; };
    const noKitAround = (fn) => {
        const saved = { project: process.env.CLAUDE_PROJECT_DIR, kitRoot: process.env.DF_KIT_ROOT };
        delete process.env.CLAUDE_PROJECT_DIR; delete process.env.DF_KIT_ROOT;
        try { return withoutPointer(fn); }
        finally {
            if (saved.project !== undefined) process.env.CLAUDE_PROJECT_DIR = saved.project;
            if (saved.kitRoot !== undefined) process.env.DF_KIT_ROOT = saved.kitRoot;
        }
    };
    const copyShell = (dir, session) => noKitAround(() => invokeHook('guard.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: PROBE } }), path.join(dir, 'hooks')));
    const reasonOrDecision = (r) => (decision(r) === 'deny' ? reasonOf(r) : decision(r));

    const bareCopy = copyHooks('bare');
    const bareFrom = readText(process.env.DF_LOG_PATH).length;
    r = copyShell(bareCopy, 'sc-bare');
    record('selfcheck: a hooks copy with no kit around it still refuses, the reason ARMED unknown unknown', 'ARMED unknown unknown', reasonOrDecision(r), r.out);
    // No kit root at all: the reason is unchanged, and one ERROR line in the hooks log names every place looked at (the
    // DF_KIT_ROOT seam, the running copy, the project's .claude/kit, the pointer), so the unknown is never silent in the
    // log. Red first: the refusal alone, nothing logged.
    const bareLines = readText(process.env.DF_LOG_PATH).slice(bareFrom).split(/\r?\n/).filter((l) => / ERROR guard rule 15: /.test(l));
    record('selfcheck: no kit root at all: one ERROR line in the hooks log names the places looked at (the seam, the running copy, the project .claude/kit, the pointer)', 'logged',
        bareLines.length === 1 && /no kit root/.test(bareLines[0]) && ['DF_KIT_ROOT (unset)', `the running copy ${bareCopy} (no law.json)`, 'CLAUDE_PROJECT_DIR/.claude/kit (CLAUDE_PROJECT_DIR unset)', 'the pointer ('].every((x) => bareLines[0].includes(x)) ? 'logged' : `${bareLines.length} line(s): ${bareLines.join(' | ').slice(0, 300)}`, bareLines.join('\n'));

    const vendored = copyHooks('vendored');
    fs.copyFileSync(path.join(kit, 'law.json'), path.join(vendored, 'law.json'));
    const vSha = 'abcdef0123456789'.repeat(4);
    put(path.join(vendored, 'VERSION'), JSON.stringify({ version: '9.9.9', sha256: vSha, files: [], at: '2026-11-10T00:00:00Z' }, null, 2) + '\n');
    r = copyShell(vendored, 'sc-vendored');
    record("selfcheck: a vendored copy (law.json and VERSION beside hooks/) names VERSION's version and sha, not this checkout's", `ARMED 9.9.9 ${vSha.slice(0, 12)}`, reasonOrDecision(r), r.out);

    const damaged = copyHooks('damaged');
    fs.copyFileSync(path.join(kit, 'law.json'), path.join(damaged, 'law.json'));
    put(path.join(damaged, '.claude-plugin', 'plugin.json'), fs.readFileSync(path.join(kit, '.claude-plugin', 'plugin.json'), 'utf8'));
    put(path.join(damaged, 'tools', 'vendor.json'), JSON.stringify({ schema: 1, include: ['hooks/', 'no-such-folder/'] }, null, 2) + '\n');
    const logBefore = readText(process.env.DF_LOG_PATH);
    r = copyShell(damaged, 'sc-damaged');
    record('selfcheck: a copy whose tree cannot be hashed (a manifest include is missing) still refuses with ARMED unknown unknown', 'ARMED unknown unknown', reasonOrDecision(r), r.out);
    const logDelta = readText(process.env.DF_LOG_PATH).slice(logBefore.length);
    record('selfcheck: that unknown is not silent: the hooks log gained an ERROR line naming the missing manifest entry', 'logged', /^\S+ ERROR guard .*no-such-folder/m.test(logDelta) ? 'logged' : `no ERROR line (log delta: ${logDelta.trim().slice(0, 120) || 'empty'})`, logDelta);

    // (4) A vendored copy whose VERSION is not the {version, sha256, files} shape, and (5) one with no VERSION at all
    // and no plugin.json: the refusal still proves the guard with ARMED unknown unknown, and one ERROR line names the
    // kit root and what is wrong with its VERSION. Red before: the reason alone, nothing in the hooks log.
    const rule15Lines = (text) => text.split(/\r?\n/).filter((l) => / ERROR guard rule 15: /.test(l));
    const notShape = copyHooks('version-not-shape');
    fs.copyFileSync(path.join(kit, 'law.json'), path.join(notShape, 'law.json'));
    put(path.join(notShape, 'VERSION'), 'not json\n');
    let from = readText(process.env.DF_LOG_PATH).length;
    r = copyShell(notShape, 'sc-version-shape');
    let lines = rule15Lines(readText(process.env.DF_LOG_PATH).slice(from));
    record('selfcheck: a VERSION that is not the shape still refuses with ARMED unknown unknown, and one ERROR line names that VERSION', 'ARMED unknown unknown+logged',
        `${reasonOrDecision(r)}+${lines.length === 1 && lines[0].includes(path.join(notShape, 'VERSION')) && lines[0].includes('is not the {version, sha256, files} shape') ? 'logged' : `${lines.length} line(s)`}`, `${r.out}\n${lines.join('\n')}`);
    const noVersion = copyHooks('no-version');
    fs.copyFileSync(path.join(kit, 'law.json'), path.join(noVersion, 'law.json'));
    from = readText(process.env.DF_LOG_PATH).length;
    r = copyShell(noVersion, 'sc-no-version');
    lines = rule15Lines(readText(process.env.DF_LOG_PATH).slice(from));
    record('selfcheck: a kit root with no VERSION and no plugin.json still refuses with ARMED unknown unknown, and one ERROR line names the root and the missing VERSION', 'ARMED unknown unknown+logged',
        `${reasonOrDecision(r)}+${lines.length === 1 && lines[0].includes(noVersion) && lines[0].includes('no VERSION') ? 'logged' : `${lines.length} line(s)`}`, `${r.out}\n${lines.join('\n')}`);
}
