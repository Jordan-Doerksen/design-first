// cases-parity.mjs - the arming line, the kit root, the marker dir, the yield rule and the extract
// candidate of kit 0.3.0 (FIRST-CHUNK.md rows 8, 9, 12 and 21). Imported by run.mjs, which owns the
// fixtures and helpers used here; it runs before cases-kitroot.mjs, which moves the pointer. Never
// run directly.
//
// What is proved here, each mechanism first seen red with the mechanism absent:
//   1. The arming line (hooks/entry.mjs, KIT-02): `kit: armed <version> <sha12>` is the first plain
//      line of stdout in the plugin form, in a vendored copy (a planted .claude/kit/VERSION whose sha
//      is the module's treeSha over the copied files) and with no pointer; a session with no
//      .claude/kit, no plugin and no pointer prints the unarmed line, never silence. A vendored copy
//      whose VERSION is not the shape, or is gone, prints unarmed ERROR and logs it, never the MISSING
//      line; a VERSION that names other bytes than its tree prints armed with DIFFERS and a WARN line.
//   2. The kit root (hooks/lib/common.mjs getKitRoot): DF_KIT_ROOT wins; the running copy comes before
//      CLAUDE_PROJECT_DIR/.claude/kit (case 50); a .claude/kit without templates/agent-policy.json is
//      not chosen; with law.json and both templates it is; the pointer's pluginRoot is last.
//   3. The marker dir (setMarkerDir): a scratchpad_dir in the hook input moves the markers, the hooks
//      log and the fence log under it, nothing prunes there, and DF_MARKER_DIR and DF_LOG_PATH still win.
//      Every hook is held to it by one case on what it writes or reads there (review finding 22): route
//      its turn markers, guard and fence a fence-log line, entry a hooks-log line, agent the .started
//      marker, card its BLOCKED line, ask the .asked marker, stop its ledger read and its card line,
//      subagent the session's routes. Red first: with setMarkerDir taken out of agent, card, stop, ask,
//      subagent and fence (a scratch copy), the suite was green.
//   4. The yield rule (yieldToPlugin): with a pointer whose pluginRoot holds law.json every vendored
//      hook, the card hook among them, prints nothing, exits 0 and logs one yield line while the plugin
//      form still decides; without the pointer the vendored guard decides. The card's payload is an Edit
//      on a bounded file that the plugin form denies, so its silence is the yield (review finding 21:
//      red first with the card's yield taken out, when the suite was green).
//   5. Parity: the same stdin through the plugin path and the vendored path gives byte-identical
//      decision JSON for every row of guard-cases.json that names a tool, each sent to the hook its row
//      names (guard, fence, agent or ask; both paths with no pointer, so both see no brain), stdout and
//      stderr compared apart, eight named rows also held to their expected decision. One recorded
//      deviation: in the agent hook's replies each copy's kit folder is one token, since agent.mjs names
//      the running copy's policy file by design.
//      The kit's internal-error reply is 'error' here and in verdict() below, never an allow (review
//      finding 26: a throw planted after the guard's stdin parse passed the two allow rows and two
//      extract cases on that reply).
//   6. The extract (readBrainConfig): .claude/kit/extract.json under CLAUDE_PROJECT_DIR feeds guard
//      rule 4 with no pointer at all; a {repo, path} row whose repo is another name is dropped; the
//      repo name matches without case; a tombstoned {repo, path: "."} row of the clone holds the whole
//      clone but its TOMBSTONE.md; DF_EXTRACT_PATH is read first; the vendored copy reads it too;
//      a readCeilingExempt {repo, path} row is an exempt glob under the clone and a ${ROOT} glob with
//      no root is dropped; the repo name matches CLAUDE_PROJECT_DIR as typed when it is a link. An
//      extract whose values is not a plain object, and a brain doctor.config.json that is JSON and not
//      an object, are unreadable configs: the guard advises and logs, ask and stop allow and log.
//   7. Never silence: a kit root whose version module is missing prints the unarmed ERROR line and logs
//      it; a pointer naming the vendored copy itself does not make that copy yield.
//
// Every hook here runs in its own process with env patches. A case that unsets a DF_* seam points
// HOME, USERPROFILE, TMPDIR, TMP and TEMP into the temp folder first: an unfixed hook would write the
// real ~/.claude log or the real temp marker folder, and a case never touches those.
// What this file cannot see: a real host handing scratchpad_dir to a hook, and the plugin and the
// vendored copy running side by side on one PC; the yield cases model that with one pointer and two
// copies of the hooks.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export default async function parityCases(t) {
    const { T, kit, root, brain, NO_POINTER, repoClean, record, section, say, like, jp, put, readText, exists, toJson, invokeHook, hookJson, classify, internalErrorReply, caseToolInput, caseScript, writePointer, setOld, ledger } = t;

    const P = path.join(T, 'parity');
    const home = path.join(P, 'home');
    const tmp = path.join(P, 'tmp');
    for (const d of [P, home, tmp]) fs.mkdirSync(d, { recursive: true });
    const kitHooks = path.join(kit, 'hooks');
    const KV = await import(pathToFileURL(path.join(kit, 'hooks', 'lib', 'kit-version.mjs')).href);
    const commonUrl = pathToFileURL(path.join(kit, 'hooks', 'lib', 'common.mjs')).href;
    const pluginJson = JSON.parse(readText(path.join(kit, '.claude-plugin', 'plugin.json')));

    const envWith = (patch) => {
        const env = { ...process.env };
        for (const [k, v] of Object.entries(patch || {})) { if (v == null) delete env[k]; else env[k] = String(v); }
        return env;
    };
    // Runs a hook from hooksDir with the payload on stdin; a null patch value unsets that variable.
    const runHook = (hooksDir, script, payload, patch = {}) => {
        const r = spawnSync(process.execPath, [path.join(hooksDir, script)], { input: typeof payload === 'string' ? payload : hookJson(payload), encoding: 'utf8', windowsHide: true, env: envWith(patch), maxBuffer: 64 * 1024 * 1024 });
        const stdout = (r.stdout || '').replace(/\r\n/g, '\n');
        return { code: r.status == null ? -1 : r.status, stdout, out: (stdout + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, '') };
    };
    // runHook without waiting on the process (child_process.spawn), so the parity rows can run a few at a time;
    // it settles once, with the same fields and each stream as written (rawStdout, rawStderr) for the byte compare
    // of section 5. A process that cannot start settles with code -1 and the error text.
    const runHookAsync = (hooksDir, script, payload, patch = {}) => new Promise((resolve) => {
        let stdout = ''; let stderr = ''; let settled = false;
        const settle = (code) => {
            if (settled) return;
            settled = true;
            const so = stdout.replace(/\r\n/g, '\n');
            resolve({ code, stdout: so, out: (so + stderr).replace(/\r\n/g, '\n').replace(/\n+$/, ''), rawStdout: stdout, rawStderr: stderr });
        };
        const child = spawn(process.execPath, [path.join(hooksDir, script)], { windowsHide: true, env: envWith(patch) });
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('error', (e) => { stderr += String(e && e.message ? e.message : e); settle(-1); });
        child.on('close', (code) => settle(code == null ? -1 : code));
        child.stdin.on('error', () => { /* a hook that exits before it reads stdin: its exit says what happened */ });
        child.stdin.end(typeof payload === 'string' ? payload : hookJson(payload));
    });
    // Runs the jobs (functions that return a promise) at most `limit` at a time; the results keep the jobs' order.
    const inPool = async (jobs, limit) => {
        const out = new Array(jobs.length);
        let next = 0;
        const worker = async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } };
        await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
        return out;
    };
    const firstLine = (r) => r.stdout.split('\n')[0];
    // A question to hooks/lib/common.mjs, asked in a fresh process so the env patch is what it sees.
    const ask = (body, patch = {}) => {
        const code = `import * as C from ${JSON.stringify(commonUrl)};\n${body}`;
        const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', windowsHide: true, env: envWith(patch) });
        return ((r.stdout || '') + (r.stderr || '')).trim();
    };
    const askKitRoot = (hereDir, patch) => ask(`process.stdout.write(String(C.getKitRoot(${JSON.stringify(hereDir)})));`, patch);
    const noSeams = { DF_MARKER_DIR: null, DF_LOG_PATH: null, DF_FENCE_LOG_PATH: null, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    const armed = (s) => /^kit: armed (\S+) ([0-9a-f]{12})$/.exec(String(s));
    const UNARMED = 'kit: unarmed MISSING: kit (no .claude/kit, no plugin, no pointer)';
    const copyInto = (dir, rels) => { for (const rel of rels) { const dst = jp(dir, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(jp(kit, rel), dst); } };

    writePointer(kit, 'checkout');
    const files = KV.manifestFiles(kit, KV.readManifest(kit));
    const kitSha = KV.shortSha(KV.treeSha(kit, files));

    // A lone clone carrying the vendored kit: the manifest's files under .claude/kit/ and a VERSION
    // written here with the module's treeSha over the copy, the way tools/vendor.mjs writes it.
    const clone = jp(P, 'lone-clone');
    const vk = jp(clone, '.claude', 'kit');
    copyInto(vk, files);
    const vSha = KV.treeSha(vk, files);
    put(path.join(vk, 'VERSION'), toJson({ version: '0.3.0-planted', sha256: vSha, files, at: '2026-11-10T00:00:00Z' }) + '\n');
    const vHooks = path.join(vk, 'hooks');
    // The hooks alone, in a folder that is no kit (no law.json), so the running copy resolves nothing.
    const bare = jp(P, 'bare', 'hooks');
    fs.cpSync(kitHooks, bare, { recursive: true });
    const emptyClone = jp(P, 'empty-clone');
    fs.mkdirSync(emptyClone, { recursive: true });
    const start = (sid, source, extra = {}) => ({ session_id: sid, cwd: root, hook_event_name: 'SessionStart', source, ...extra });
    // A bounded file for the card hook (hooks/card.mjs): a boundedFiles row is laid over the fixture brain's
    // config for one call and put back after it, as cases-card.mjs does, so an Edit that adds an id to it is
    // a deny whenever the card hook decides.
    const brainCfg = path.join(brain, 'doctor.config.json');
    const boundedCard = jp(brain, 'parity-cards', 'DESK.md');
    put(boundedCard, 'desk row\n');
    const withBounded = (fn) => {
        const kept = readText(brainCfg);
        put(brainCfg, toJson({ ...JSON.parse(kept), boundedFiles: [{ glob: '${BRAIN}/parity-cards/*.md', idPatterns: ['local_[0-9a-f]{8}'] }] }));
        try { return fn(); } finally { put(brainCfg, kept); }
    };
    // The kit's internal-error reply is 'error', never an allow (internalErrorReply, the recognizer the Doctor's
    // hook_smoke reads); else the decision as classify reads it.
    const kindOf = (res) => (internalErrorReply(res.out) ? 'error' : classify(res.out));

    // ------------------------------------------------------------------ 1. the arming line
    section('-- parity: the arming line (hooks/entry.mjs, row 9)');
    let r = runHook(kitHooks, 'entry.mjs', start('par-arm1', 'startup'));
    let m = armed(firstLine(r));
    record('parity: plugin form, line one is the arming line with the plugin.json version and the tree sha', 'armed', r.code === 0 && m && m[1] === pluginJson.version && m[2] === kitSha ? 'armed' : `line1: ${firstLine(r)}`, r.out);
    record('parity: plugin form, the entry path still follows the arming line', 'both', r.code === 0 && m && /^design-first: entry path/m.test(r.stdout) ? 'both' : 'wrong', r.out);
    for (const source of ['resume', 'clear', 'compact']) {
        r = runHook(kitHooks, 'entry.mjs', start('par-arm-' + source, source));
        record(`parity: plugin form, source ${source} prints the arming line first`, 'armed', r.code === 0 && armed(firstLine(r)) ? 'armed' : `line1: ${firstLine(r)}`, r.out);
    }
    r = runHook(vHooks, 'entry.mjs', start('par-arm2', 'startup'), { CLAUDE_PROJECT_DIR: clone, DF_POINTER_PATH: NO_POINTER });
    m = armed(firstLine(r));
    record('parity: vendored copy, no pointer: line one carries the planted VERSION and its sha', 'armed', r.code === 0 && m && m[1] === '0.3.0-planted' && m[2] === KV.shortSha(vSha) ? 'armed' : `line1: ${firstLine(r)}`, r.out);
    r = runHook(kitHooks, 'entry.mjs', start('par-arm3', 'startup'), { DF_POINTER_PATH: NO_POINTER });
    record('parity: plugin form, no pointer: the arming line comes before the adopt line', 'armed-then-adopt', r.code === 0 && armed(firstLine(r)) && like(r.stdout.split('\n')[1], '*/design-first:adopt*') ? 'armed-then-adopt' : `line1: ${firstLine(r)}`, r.out);
    const hooksLog = () => (exists(process.env.DF_LOG_PATH) ? readText(process.env.DF_LOG_PATH) : '');
    const missingFrom = hooksLog().length;
    r = runHook(bare, 'entry.mjs', start('par-arm4', 'startup'), { DF_POINTER_PATH: NO_POINTER, CLAUDE_PROJECT_DIR: emptyClone, DF_KIT_ROOT: null });
    record('parity: no .claude/kit, no plugin, no pointer: the unarmed line, never silence', 'unarmed', r.code === 0 && firstLine(r) === UNARMED ? 'unarmed' : r.stdout.trim() === '' ? 'silent' : `line1: ${firstLine(r)}`, r.out);
    // The MISSING line is unchanged, and one ERROR line in the hooks log names every place looked at, in the order looked:
    // the DF_KIT_ROOT seam, the running copy, the project's .claude/kit, the pointer. Red first: the line alone, nothing in
    // the log, so the unknown was silent there.
    const missingErrors = hooksLog().slice(missingFrom).split(/\r?\n/).filter((l) => / ERROR entry no kit root/.test(l));
    const lookedAt = ['DF_KIT_ROOT (unset)', `the running copy ${path.dirname(bare)} (no law.json)`, `${jp(emptyClone, '.claude', 'kit')} (`, `the pointer (none at ${NO_POINTER})`];
    record('parity: no kit root: one ERROR line in the hooks log names the places looked at (the seam, the running copy, the project .claude/kit, the pointer)', 'logged',
        missingErrors.length === 1 && lookedAt.every((x) => missingErrors[0].includes(x)) ? 'logged' : `${missingErrors.length} line(s): ${missingErrors.join(' | ').slice(0, 300)}`, hooksLog().slice(missingFrom));

    // ------------------------------------------------------------------ 2. the kit root
    section('-- parity: the kit root (hooks/lib/common.mjs getKitRoot, row 8)');
    const other = jp(P, 'other-kit');
    copyInto(other, ['law.json']);
    // Its VERSION names the bytes beside it (the sha over law.json), so the line is the plain armed form: the arming
    // line recomputes the sha of a VERSION kit and says DIFFERS on a mismatch (case below).
    const otherSha = KV.treeSha(other, ['law.json']);
    put(path.join(other, 'VERSION'), toJson({ version: '9.9.9', sha256: otherSha, files: ['law.json'], at: '' }) + '\n');
    let got = askKitRoot(kitHooks, { DF_KIT_ROOT: other });
    record('parity: DF_KIT_ROOT wins over the running copy', 'seam', got === other ? 'seam' : got === kit ? 'running' : 'wrong', got);
    r = runHook(kitHooks, 'entry.mjs', start('par-root1', 'startup'), { DF_KIT_ROOT: other });
    record('parity: the arming line reports the kit DF_KIT_ROOT names', 'armed-9.9.9', firstLine(r) === `kit: armed 9.9.9 ${KV.shortSha(otherSha)}` ? 'armed-9.9.9' : `line1: ${firstLine(r)}`, r.out);
    // A kit root whose version cannot be computed because the copy lacks lib/kit-version.mjs still prints a
    // kit line, the unarmed ERROR form, and logs the failure: an internal error on the way to the arming
    // line is loud, never silence (contract 5).
    const noKv = jp(P, 'no-kit-version', 'hooks');
    fs.cpSync(kitHooks, noKv, { recursive: true });
    fs.rmSync(path.join(noKv, 'lib', 'kit-version.mjs'), { force: true });
    const logAt = () => (exists(process.env.DF_LOG_PATH) ? readText(process.env.DF_LOG_PATH) : '');
    const lb = logAt();
    r = runHook(noKv, 'entry.mjs', start('par-arm5', 'startup'), { DF_KIT_ROOT: other });
    record('parity: a kit root whose version module is missing still prints a kit line (unarmed ERROR), never silence', 'unarmed-error', r.code === 0 && /^kit: unarmed ERROR: kit version unreadable at /.test(firstLine(r)) ? 'unarmed-error' : `line1: ${firstLine(r).slice(0, 60)}`, r.out);
    record('parity: that failure is one ERROR line in the hooks log', 'logged', like(logAt().slice(lb.length), '*ERROR entry kit version unreadable at*') ? 'logged' : 'not-logged', logAt().slice(lb.length));
    // A vendored copy whose VERSION is not the {version, sha256, files} shape, or is gone, is a broken kit, never "no
    // kit": the line says unarmed ERROR and names the root, and one ERROR line is in the hooks log. Red before
    // kitVersion told a broken VERSION from none: the MISSING line, as for a session with no kit at all, no log line.
    const errorLines = (text) => text.split(/\r?\n/).filter((l) => / ERROR entry /.test(l));
    const broken = jp(P, 'broken-version-clone');
    const bk = jp(broken, '.claude', 'kit');
    copyInto(bk, files);
    put(path.join(bk, 'VERSION'), 'not json\n');
    let lbv = logAt();
    r = runHook(path.join(bk, 'hooks'), 'entry.mjs', start('par-arm6', 'startup'), { CLAUDE_PROJECT_DIR: broken, DF_POINTER_PATH: NO_POINTER });
    record('parity: a vendored VERSION that is not the shape prints unarmed ERROR naming it, never the MISSING line', 'unarmed-error',
        r.code === 0 && firstLine(r) === `kit: unarmed ERROR: kit version unreadable at ${bk} (${path.join(bk, 'VERSION')} is not the {version, sha256, files} shape)` ? 'unarmed-error' : firstLine(r) === UNARMED ? 'missing-line' : `line1: ${firstLine(r)}`, r.out);
    record('parity: that broken VERSION is one ERROR line in the hooks log', 'logged', errorLines(logAt().slice(lbv.length)).length === 1 ? 'logged' : `${errorLines(logAt().slice(lbv.length)).length} ERROR line(s)`, logAt().slice(lbv.length));
    fs.rmSync(path.join(bk, 'VERSION'), { force: true });
    lbv = logAt();
    r = runHook(path.join(bk, 'hooks'), 'entry.mjs', start('par-arm7', 'startup'), { CLAUDE_PROJECT_DIR: broken, DF_POINTER_PATH: NO_POINTER });
    record('parity: a vendored copy with no VERSION and no plugin.json prints unarmed ERROR naming the root, never the MISSING line', 'unarmed-error',
        r.code === 0 && firstLine(r) === `kit: unarmed ERROR: no VERSION and no .claude-plugin/plugin.json at ${bk}` ? 'unarmed-error' : firstLine(r) === UNARMED ? 'missing-line' : `line1: ${firstLine(r)}`, r.out);
    record('parity: that missing VERSION is one ERROR line in the hooks log', 'logged', errorLines(logAt().slice(lbv.length)).length === 1 ? 'logged' : `${errorLines(logAt().slice(lbv.length)).length} ERROR line(s)`, logAt().slice(lbv.length));
    // A kit root that has plugin.json and no manifest (a plugin older than tools/vendor.json, found through the
    // pointer) is no VERSION kit and no tree kit either: the line names what it lacks, never a plugin.json it has.
    const oldPlugin = jp(P, 'old-plugin-kit');
    copyInto(oldPlugin, ['law.json', jp('.claude-plugin', 'plugin.json')]);
    r = runHook(kitHooks, 'entry.mjs', start('par-arm7b', 'startup'), { DF_KIT_ROOT: oldPlugin });
    record('parity: a kit root with plugin.json and no tools/vendor.json prints unarmed ERROR naming the missing manifest', 'unarmed-error',
        r.code === 0 && firstLine(r) === `kit: unarmed ERROR: no VERSION and no tools/vendor.json beside .claude-plugin/plugin.json at ${oldPlugin}` ? 'unarmed-error' : `line1: ${firstLine(r)}`, r.out);
    // A VERSION that names other bytes than the tree beside it (a vendored file changed after it was written, a listed
    // file gone) still reads armed, since the hooks loaded, and says DIFFERS on the same first line with the check to
    // run; one WARN line goes to the hooks log. A VERSION that holds stays the plain line (the vendored case above).
    // Red before entry.mjs recomputed the sha: armed with VERSION's own words, nothing else.
    const drift = jp(P, 'drift-clone');
    const dk = jp(drift, '.claude', 'kit');
    copyInto(dk, files);
    const dSha = KV.treeSha(dk, files);
    put(path.join(dk, 'VERSION'), toJson({ version: '0.3.0-planted', sha256: dSha, files, at: '2026-11-10T00:00:00Z' }) + '\n');
    fs.appendFileSync(path.join(dk, 'LAW.md'), 'one line added after the VERSION was written\n');
    const differs = `kit: armed 0.3.0-planted ${KV.shortSha(dSha)} DIFFERS: the tree is not the bytes VERSION names (check: node .claude/kit/tools/vendor.mjs -Target ${drift} -Check)`;
    const warnLines = (text) => text.split(/\r?\n/).filter((l) => / WARN entry /.test(l));
    lbv = logAt();
    r = runHook(path.join(dk, 'hooks'), 'entry.mjs', start('par-arm8', 'startup'), { CLAUDE_PROJECT_DIR: drift, DF_POINTER_PATH: NO_POINTER });
    record("parity: a vendored file changed after VERSION was written: line one is armed with VERSION's words and DIFFERS, naming the check", 'armed-differs', r.code === 0 && firstLine(r) === differs ? 'armed-differs' : `line1: ${firstLine(r)}`, r.out);
    record('parity: that drift is one WARN line in the hooks log', 'logged', warnLines(logAt().slice(lbv.length)).length === 1 ? 'logged' : `${warnLines(logAt().slice(lbv.length)).length} WARN line(s)`, logAt().slice(lbv.length));
    fs.copyFileSync(path.join(kit, 'LAW.md'), path.join(dk, 'LAW.md'));   // the drift undone: the gone file is the one fault
    fs.rmSync(path.join(dk, 'tools', 'settings.mjs'), { force: true });
    lbv = logAt();
    r = runHook(path.join(dk, 'hooks'), 'entry.mjs', start('par-arm9', 'startup'), { CLAUDE_PROJECT_DIR: drift, DF_POINTER_PATH: NO_POINTER });
    record('parity: a file VERSION lists that is gone: line one is armed and DIFFERS, and the WARN line names the file', 'armed-differs+named',
        r.code === 0 && firstLine(r) === differs ? (warnLines(logAt().slice(lbv.length)).some((l) => l.includes('tools/settings.mjs')) ? 'armed-differs+named' : 'armed-differs+unnamed') : `line1: ${firstLine(r)}`, `${r.out}\n${logAt().slice(lbv.length)}`);
    // A VERSION that lists no file proves nothing: its sha is the sha of nothing, which any tree matches, so line one is the
    // DIFFERS form whatever the files hold, and the WARN line says why (the rule vendor -Check and the tree_sha claim
    // follow, review finding 14). Red first: the bare 'kit: armed 0.3.0-planted e3b0c44298fc' with a vendored hook edited,
    // and nothing in the log.
    const hollow = jp(P, 'hollow-clone');
    const hollowKit = jp(hollow, '.claude', 'kit');
    copyInto(hollowKit, files);
    const nothing = KV.treeSha(hollowKit, []);
    put(path.join(hollowKit, 'VERSION'), toJson({ version: '0.3.0-planted', sha256: nothing, files: [], at: '2026-11-10T00:00:00Z' }) + '\n');
    fs.appendFileSync(path.join(hollowKit, 'hooks', 'guard.mjs'), '\n// edited after VERSION was written\n');
    lbv = logAt();
    r = runHook(path.join(hollowKit, 'hooks'), 'entry.mjs', start('par-arm10', 'startup'), { CLAUDE_PROJECT_DIR: hollow, DF_POINTER_PATH: NO_POINTER });
    const hollowLine = `kit: armed 0.3.0-planted ${KV.shortSha(nothing)} DIFFERS: VERSION names no file; nothing to prove (check: node .claude/kit/tools/vendor.mjs -Target ${hollow} -Check)`;
    record('parity: a VERSION that lists no file: line one is the DIFFERS form, never the bare armed line', 'armed-differs', r.code === 0 && firstLine(r) === hollowLine ? 'armed-differs' : `line1: ${firstLine(r)}`, r.out);
    const hollowWarn = warnLines(logAt().slice(lbv.length));
    record("parity: that VERSION is one WARN line in the hooks log naming 'VERSION names no file; nothing to prove'", 'logged', hollowWarn.length === 1 && hollowWarn[0].includes('VERSION names no file; nothing to prove') ? 'logged' : `${hollowWarn.length} WARN line(s)`, logAt().slice(lbv.length));
    // A kit root that is no <repo>/.claude/kit (the DF_KIT_ROOT seam; a pointer's pluginRoot that carries a VERSION): vendor
    // -Check reads <target>/.claude/kit/VERSION only, so a check named for this root would read another file. The DIFFERS line
    // names the root and its VERSION instead. Red first: 'check: node .claude/kit/tools/vendor.mjs -Target <root> -Check'.
    const loose = jp(P, 'loose-kit');
    copyInto(loose, ['law.json']);
    const looseSha = KV.treeSha(loose, ['law.json']);
    put(path.join(loose, 'VERSION'), toJson({ version: '9.9.9', sha256: looseSha, files: ['law.json'], at: '' }) + '\n');
    fs.appendFileSync(path.join(loose, 'law.json'), '\n');
    const looseLine = `kit: armed 9.9.9 ${KV.shortSha(looseSha)} DIFFERS: the tree is not the bytes VERSION names (kit root ${loose}, its VERSION ${path.join(loose, 'VERSION')})`;
    r = runHook(kitHooks, 'entry.mjs', start('par-arm11', 'startup'), { DF_KIT_ROOT: loose });
    record('parity: a DF_KIT_ROOT kit outside <repo>/.claude/kit: the DIFFERS line names the root and its VERSION, never a vendor -Check of another file', 'named', r.code === 0 && firstLine(r) === looseLine ? 'named' : `line1: ${firstLine(r)}`, r.out);
    const loosePtr = path.join(P, 'loose-pointer.json');
    put(loosePtr, toJson({ schema: 1, root, brain, pluginRoot: loose, pluginKind: 'checkout' }));
    r = runHook(bare, 'entry.mjs', start('par-arm12', 'startup'), { DF_KIT_ROOT: null, CLAUDE_PROJECT_DIR: emptyClone, DF_POINTER_PATH: loosePtr });
    record("parity: a pointer's pluginRoot that carries a VERSION: the DIFFERS line names that root and its VERSION too", 'named', r.code === 0 && firstLine(r) === looseLine ? 'named' : `line1: ${firstLine(r)}`, r.out);
    const half = jp(P, 'half-clone');
    const hk = jp(half, '.claude', 'kit');
    copyInto(hk, ['law.json', jp('templates', 'route-policy.json')]);
    const noKit = { DF_POINTER_PATH: NO_POINTER, DF_KIT_ROOT: null };
    got = askKitRoot(bare, { ...noKit, CLAUDE_PROJECT_DIR: half });
    record('parity: a .claude/kit without templates/agent-policy.json is not the kit root', 'null', got === 'null' ? 'null' : got === hk ? 'chosen' : 'wrong', got);
    copyInto(hk, [jp('templates', 'agent-policy.json')]);
    got = askKitRoot(bare, { ...noKit, CLAUDE_PROJECT_DIR: half });
    record('parity: with law.json and both templates, CLAUDE_PROJECT_DIR/.claude/kit is the kit root', 'project', got === hk ? 'project' : got === 'null' ? 'null' : 'wrong', got);
    got = askKitRoot(kitHooks, { ...noKit, CLAUDE_PROJECT_DIR: half });
    record('parity: the running copy comes before CLAUDE_PROJECT_DIR/.claude/kit (case 50 kept)', 'running', got === kit ? 'running' : got === hk ? 'project' : 'wrong', got);
    got = askKitRoot(bare, { DF_KIT_ROOT: null, CLAUDE_PROJECT_DIR: emptyClone });
    record("parity: with nothing else, the pointer's pluginRoot is the kit root", 'pointer', got === kit ? 'pointer' : got, got);

    // ------------------------------------------------------------------ 3. the marker dir
    section('-- parity: the marker dir and the logs follow scratchpad_dir (setMarkerDir, row 8)');
    const scratch = jp(P, 'scratch');
    const oldMarker = jp(scratch, 'design-first', 'old-session.advised');
    put(oldMarker, 'x'); setOld(oldMarker);
    const prompt = (sid, extra = {}) => ({ session_id: sid, cwd: root, hook_event_name: 'UserPromptSubmit', prompt_id: 'p', prompt: 'yes', ...extra });
    r = runHook(kitHooks, 'route.mjs', prompt('par-scratch', { scratchpad_dir: scratch }), noSeams);
    const inScratch = (name) => exists(jp(scratch, 'design-first', name));
    record('parity: scratchpad_dir in the input moves the role and turn markers under <scratchpad_dir>/design-first', 'moved', r.code === 0 && inScratch('par-scratch.role') && inScratch('par-scratch.turn') ? 'moved' : exists(jp(tmp, 'design-first', 'par-scratch.role')) ? 'temp-folder' : `missing (exit ${r.code})`, r.out);
    r = runHook(kitHooks, 'guard.mjs', { session_id: 'par-scratch', cwd: repoClean, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git add secrets/.env' }, scratchpad_dir: scratch }, noSeams);
    record('parity: the fence log lands under scratchpad_dir (fence-log.txt)', 'fence-log', classify(r.out) === 'deny' && like(readText(path.join(scratch, 'fence-log.txt')), '*BLOCKED[GUARD: staging a secret*') ? 'fence-log' : `elsewhere (${classify(r.out)})`, r.out);
    r = runHook(kitHooks, 'entry.mjs', start('par-scratch', 'clear', { scratchpad_dir: scratch }), noSeams);
    record('parity: the hooks log lands beside the markers (<scratchpad_dir>/design-first-hooks.log)', 'logged', like(readText(path.join(scratch, 'design-first-hooks.log')), '*INFO entry clear: session par-scratch*') ? 'logged' : 'elsewhere', r.out);
    record('parity: nothing prunes under scratchpad_dir (an old marker of another session stays)', 'kept', exists(oldMarker) ? 'kept' : 'pruned', r.out);
    // One case for each hook the three above do not hold (review finding 22): a planted input with
    // scratchpad_dir, and the file the hook writes, or the marker it reads, must be under it, never in the
    // fixed places, which noSeams points into this sandbox so a miss is seen (temp-folder, home-fence-log).
    // Red first: with setMarkerDir taken out of these hooks in a scratch copy, the suite was green.
    const tmpMarkers = jp(tmp, 'design-first');
    const homeFence = jp(home, '.claude', 'fence-log.txt');
    const scratchFence = () => readText(path.join(scratch, 'fence-log.txt'));
    const fenceWhere = (needle) => (scratchFence().includes(needle) ? 'fence-log' : readText(homeFence).includes(needle) ? 'home-fence-log' : 'missing');
    const markerWhere = (name) => (inScratch(name) ? 'moved' : exists(jp(tmpMarkers, name)) ? 'temp-folder' : 'missing');
    const BRIEF = 'Goal: count the files under tools.\nFiles: tools/\nDone when: the count is pasted with the command that produced it.\nRuled out: editing anything.\nReports to: the lead, the count pasted.';
    r = runHook(kitHooks, 'agent.mjs', { session_id: 'par-scr-agent', cwd: root, hook_event_name: 'PreToolUse', prompt_id: 'p', tool_name: 'mcp__claude-code-remote__create_session', tool_input: { title: 'Parity Scratch', prompt: BRIEF }, scratchpad_dir: scratch }, noSeams);
    record('parity: agent writes the .started marker of an allowed create_session under <scratchpad_dir>/design-first', 'moved', r.code !== 0 ? `exit${r.code}` : markerWhere('par-scr-agent.started'), r.out);
    r = withBounded(() => runHook(kitHooks, 'card.mjs', { session_id: 'par-scr-card', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: boundedCard, old_string: 'desk row', new_string: 'desk row local_0a1b2c3d' }, scratchpad_dir: scratch }, noSeams));
    record('parity: card writes its BLOCKED line under scratchpad_dir (fence-log.txt)', 'fence-log', r.code !== 0 ? `exit${r.code}` : classify(r.out) !== 'deny' ? `not denied (${classify(r.out)})` : fenceWhere('BLOCKED[CARD: adds id'), r.out);
    r = runHook(kitHooks, 'fence.mjs', { session_id: 'par-scr-fence', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(root, 'tests', 'probe_x.js'), old_string: 'assert(a);\nassert(b);', new_string: 'assert(a);' }, scratchpad_dir: scratch }, noSeams);
    record('parity: fence writes its GOODHART line under scratchpad_dir (fence-log.txt)', 'fence-log', r.code !== 0 ? `exit${r.code}` : classify(r.out) !== 'deny' ? `not denied (${classify(r.out)})` : fenceWhere('[goodhart-paren deny] GOODHART:'), r.out);
    r = runHook(kitHooks, 'ask.mjs', { session_id: 'par-scr-ask', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'q', header: 'h', options: [{ label: 'a (Recommended)', description: 'Gives the thing the case needs; costs nothing worth a word.' }, { label: 'b', description: 'Gives a second path for a different owner; costs one more step.' }], multiSelect: false }] }, scratchpad_dir: scratch }, noSeams);
    record('parity: ask writes the .asked marker of an allowed question under <scratchpad_dir>/design-first', 'moved', r.code !== 0 ? `exit${r.code}` : markerWhere('par-scr-ask.asked'), r.out);
    // stop and subagent write nothing of their own on a quiet turn: what they do with the marker folder is read
    // it. The stop hook cards the ledger planted under scratchpad_dir (and writes its card line beside it); the
    // subagent hook injects the group of the routes file planted there.
    put(jp(scratch, 'design-first', 'par-scr-stop.edits'), jp(repoClean, 'src', 'main.py') + '\t\n');
    r = runHook(kitHooks, 'stop.mjs', { session_id: 'par-scr-stop', cwd: root, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'x', scratchpad_dir: scratch }, noSeams);
    record('parity: stop reads its ledger under <scratchpad_dir>/design-first and writes its card line to <scratchpad_dir>/fence-log.txt', 'fence-log', r.code !== 0 ? `exit${r.code}` : classify(r.out) !== 'block' ? `no card (${classify(r.out)})` : fenceWhere('STOP[card: 1 repository(ies)'), r.out);
    put(jp(scratch, 'design-first', 'par-scr-sub.routes'), 'DES\n');
    r = runHook(kitHooks, 'subagent.mjs', { session_id: 'par-scr-sub', cwd: root, hook_event_name: 'SubagentStart', agent_id: 'a', agent_type: 'general-purpose', scratchpad_dir: scratch }, noSeams);
    record("parity: subagent reads the session's routes under <scratchpad_dir>/design-first (their group is injected)", 'routed', r.code !== 0 ? `exit${r.code}` : /group DES/.test(r.out) ? 'routed' : /group SAFE/.test(r.out) ? 'safe-only' : 'wrong', r.out);
    const envMarkers = jp(P, 'markers-env');
    r = runHook(kitHooks, 'route.mjs', prompt('par-envwins', { scratchpad_dir: scratch }), { ...noSeams, DF_MARKER_DIR: envMarkers });
    record('parity: DF_MARKER_DIR still wins over scratchpad_dir', 'env-wins', exists(path.join(envMarkers, 'par-envwins.role')) && !inScratch('par-envwins.role') ? 'env-wins' : 'wrong', r.out);
    const envLog = path.join(P, 'env-hooks.log');
    r = runHook(kitHooks, 'entry.mjs', start('par-envwins', 'clear', { scratchpad_dir: scratch }), { ...noSeams, DF_LOG_PATH: envLog });
    record('parity: DF_LOG_PATH still wins over scratchpad_dir', 'env-wins', like(readText(envLog), '*INFO entry clear: session par-envwins*') && !like(readText(path.join(scratch, 'design-first-hooks.log')), '*session par-envwins*') ? 'env-wins' : 'wrong', r.out);

    // ------------------------------------------------------------------ 4. the yield rule
    section('-- parity: the yield rule (yieldToPlugin, row 21)');
    const stage = { session_id: 'par-yield', cwd: repoClean, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git add secrets/.env' } };
    let logBefore = readText(process.env.DF_LOG_PATH);
    r = runHook(vHooks, 'guard.mjs', stage, { CLAUDE_PROJECT_DIR: clone });
    let logNew = readText(process.env.DF_LOG_PATH).slice(logBefore.length);
    const yieldLines = (text, hook) => text.split(/\r?\n/).filter((l) => like(l, `*INFO ${hook} yield: plugin present at*`)).length;
    record('parity: vendored guard with the pointer (pluginRoot holds law.json) prints nothing and exits 0', 'silent', r.code === 0 && r.out === '' ? 'silent' : r.code !== 0 ? `exit${r.code}` : `decided (${classify(r.out)})`, r.out);
    record('parity: the yield is one INFO line in the hooks log naming the plugin root', 'one-line', yieldLines(logNew, 'guard') === 1 && like(logNew, `*yield: plugin present at ${kit}*`) ? 'one-line' : `${yieldLines(logNew, 'guard')} line(s)`, logNew);
    r = invokeHook('guard.mjs', hookJson(stage));
    record('parity: the plugin-form guard still decides the same call', 'deny', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
    r = runHook(vHooks, 'guard.mjs', stage, { CLAUDE_PROJECT_DIR: clone, DF_POINTER_PATH: NO_POINTER });
    record('parity: without the pointer the vendored guard decides', 'deny', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
    // A pointer whose pluginRoot is this very vendored copy names no second copy: yielding to it would leave
    // nobody to decide, so this copy decides.
    const selfPtr = path.join(P, 'self-pointer.json');
    put(selfPtr, toJson({ schema: 1, root, brain, pluginRoot: vk, pluginKind: 'checkout' }));
    r = runHook(vHooks, 'guard.mjs', stage, { CLAUDE_PROJECT_DIR: clone, DF_POINTER_PATH: selfPtr });
    record('parity: a pointer whose pluginRoot is the vendored copy itself does not make it yield: it decides', 'deny', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
    // Every hook yields, not only the guard: each payload below would make the hook print something if
    // it decided (a deny, a block, law text, the arming line), so silence here is the yield. The card's
    // Edit adds an id to a bounded file while the brain's config names it (withBounded), and the plugin
    // form is seen to deny it first, so the payload is a decision, never a silence of its own.
    put(ledger('par-yield-stop'), jp(repoClean, 'src', 'main.py') + '\t\n');
    const yieldPayloads = {
        guard: { session_id: 'par-yield-guard', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(root, 'frozen', 'x.py'), old_string: 'a', new_string: 'b' } },
        fence: { session_id: 'par-yield-fence', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(root, 'tests', 'probe_x.js'), old_string: 'assert(a);\nassert(b);\nassert(c);\n', new_string: '' } },
        ask: { session_id: 'par-yield-ask', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'q', header: 'h', options: [{ label: 'a', description: 'short' }, { label: 'b', description: 'short' }], multiSelect: false }] } },
        agent: { session_id: 'par-yield-agent', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'x', prompt: 'no headings at all' } },
        card: { session_id: 'par-yield-card', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: boundedCard, old_string: 'desk row', new_string: 'desk row local_0a1b2c3d' } },
        route: prompt('par-yield-route', { prompt: 'please build the new feature and commit it' }),
        stop: { session_id: 'par-yield-stop', cwd: root, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'x' },
        subagent: { session_id: 'par-yield-subagent', cwd: root, hook_event_name: 'SubagentStart', agent_id: 'a', agent_type: 'general-purpose' },
        entry: start('par-yield-entry', 'startup'),
    };
    withBounded(() => {
        r = invokeHook('card.mjs', hookJson(yieldPayloads.card));
        record("parity: the plugin-form card.mjs denies the card's yield payload (an Edit that adds an id to a bounded file)", 'deny', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
        for (const [hook, payload] of Object.entries(yieldPayloads)) {
            logBefore = readText(process.env.DF_LOG_PATH);
            r = runHook(vHooks, `${hook}.mjs`, payload, { CLAUDE_PROJECT_DIR: clone });
            logNew = readText(process.env.DF_LOG_PATH).slice(logBefore.length);
            const n = yieldLines(logNew, hook);
            record(`parity: vendored ${hook}.mjs yields under the pointer: nothing printed, exit 0, one log line`, 'yield', r.code !== 0 ? `exit${r.code}` : r.out !== '' ? 'decided' : n === 1 ? 'yield' : `silent, ${n} log line(s)`, r.out || logNew);
        }
    });

    // ------------------------------------------------------------------ 5. parity rows
    section('-- parity: the same stdin through the plugin path and the vendored path (row 21)');
    // Every row of guard-cases.json that names a tool goes to the hook its own row names (its hook field, read by
    // caseScript, the one reader run.mjs's guard and fence cases use too: guard, fence, agent or ask), through both
    // copies of that hook, with this section's payload (cwd repo-clean, a session per row and path, no pointer on
    // either path) and the row's tool_input as run.mjs builds it (caseToolInput). The two replies must be the same
    // bytes, stdout and stderr each compared apart (sameBytes, below), and neither the kit's internal-error reply.
    // DEVIATION (the lead's ruling), one normalisation and no other: in the agent hook's replies, the kit folder of the
    // copy that ran is replaced by one token, <KIT>, before the compare. agent.mjs names the policy file it read, by
    // design, and with no brain that is the running copy's own templates/agent-policy.json, so the two paths print two
    // kit folders there; the folder is matched as the reply prints it, inside a JSON string. No other hook's reply is
    // touched. Before this, every row went to the guard, so a fence, agent or ask row proved only the guard's no-brain
    // advisory. Rule 15's reply names the running kit's version, so from here on the clone's VERSION names the
    // plugin.json version, as tools/vendor.mjs writes it, not the version planted for the arming line above. The eight
    // named rows are also held to their expected decision. The spawns run four at a time. Red first: with rule 13 (no
    // row named here hits it) turned off in the clone's copy of the guard, in a scratch copy, the summary record named
    // the py-heredoc rows and the eight named rows stayed green. And in a scratch copy, one fault at a time in the
    // clone's hooks alone (its fence hook denying the row 'FENCE ordinary command -> allowed', one word that is not the
    // path changed in its agent hook's reply to the session-start row with no Goal, its ask hook without the quoted
    // mention rule): with every row sent to the guard the summary record stayed 'same' under all three; sent to its
    // own hook, each made the record name that row.
    put(path.join(vk, 'VERSION'), toJson({ version: pluginJson.version, sha256: vSha, files, at: '2026-11-10T00:00:00Z' }) + '\n');
    const rows = JSON.parse(readText(path.join(kit, 'tools', 'tests', 'guard-cases.json')));
    const toolRows = rows.filter((c) => c && !('_' in c) && c.tool);
    const rowPayload = (c, sid) => ({ session_id: sid, cwd: repoClean, hook_event_name: 'PreToolUse', tool_name: c.tool, tool_input: caseToolInput(c) });
    // The kit folder of the copy that ran is the folder above its hooks/ (agent.mjs's KIT); an agent reply prints it
    // inside a JSON string, so it is matched JSON-escaped (on Windows its backslashes come doubled).
    const KIT_TOKEN = '<KIT>';
    const asPrinted = (dir) => JSON.stringify(dir).slice(1, -1);
    // A row whose hook names no hook (caseScript gives null) runs nothing on either path and differs, named in the record.
    const runRow = async (hooksDir, c, sid, patch) => {
        const script = caseScript(c);
        if (!script) return { code: -2, stdout: '', out: '', rawStdout: '', rawStderr: '' };
        const res = await runHookAsync(hooksDir, script, rowPayload(c, sid), patch);
        if (script !== 'agent.mjs') return res;
        const tok = (s) => s.split(asPrinted(path.dirname(hooksDir))).join(KIT_TOKEN);
        return { ...res, stdout: tok(res.stdout), out: tok(res.out), rawStdout: tok(res.rawStdout), rawStderr: tok(res.rawStderr) };
    };
    // The same bytes: both copies exit 0 and print the same stdout and the same stderr, each stream as written and
    // compared apart. The host reads a decision from stdout alone, so a reply one copy writes to stderr is no decision
    // there; joined, the two streams read alike (red first, in a scratch copy: the clone's ask hook writing its deny
    // for the two-question row to stderr kept the summary record 'same' while the streams were compared joined).
    const sameBytes = (pl, vd) => pl.code === 0 && vd.code === 0 && pl.rawStdout === vd.rawStdout && pl.rawStderr === vd.rawStderr;
    const pairs = await inPool(toolRows.map((c, i) => async () => ({
        c,
        pl: await runRow(kitHooks, c, `par-pl-${i}`, { DF_POINTER_PATH: NO_POINTER }),
        vd: await runRow(vHooks, c, `par-vd-${i}`, { DF_POINTER_PATH: NO_POINTER, CLAUDE_PROJECT_DIR: clone }),
    })), 4);
    const wanted = ['git add of an actual .env', 'git add of a .env.local', 'git add of a .pem', 'history destruction: prune', 'history destruction: reflog expire', 'force push', 'ordinary gc', 'ordinary push'];
    for (const name of wanted) {
        const p = pairs.find((x) => x.c.name === name);
        if (!p) { record(`parity row: ${name}`, 'identical', 'row missing from guard-cases.json'); continue; }
        const { c, pl, vd } = p;
        // Two guards that both crash print the same bytes; the error reply is no allow of either (kindOf).
        const kind = kindOf(pl);
        const asExpected = c.expect === 'deny' ? kind === 'deny' : kind === 'allow' || kind === 'advise';
        record(`parity row: ${name} (${c.expect}) decides the same bytes on both paths`, 'identical', sameBytes(pl, vd) ? (asExpected ? 'identical' : `identical but ${kind}`) : `plugin ${kind} / vendored ${kindOf(vd)}`, `plugin: ${pl.out}\nvendored: ${vd.out}`);
    }
    const unlike = pairs.filter(({ pl, vd }) => !(sameBytes(pl, vd) && kindOf(pl) !== 'error'));
    const how = ({ c, pl, vd }) => !caseScript(c) ? `${c.name} [no hook named ${JSON.stringify(c.hook ?? null)}]` : `${c.name} [${caseScript(c)}: ${pl.code !== 0 || vd.code !== 0 ? `exit ${pl.code}/${vd.code}` : sameBytes(pl, vd) ? 'internal-error reply on both' : pl.out === vd.out ? 'the same text, not the same stdout and stderr' : `plugin ${kindOf(pl)} / vendored ${kindOf(vd)}`}]`;
    record("parity: every guard-cases.json row with a tool, sent to its own hook, decides the same bytes on both paths (agent replies with each copy's kit folder as one token)", 'same',
        toolRows.length === 0 ? 'no row with a tool read' : unlike.length === 0 ? 'same' : `${unlike.length} of ${toolRows.length} differ: ${unlike.slice(0, 5).map(how).join('; ')}`,
        unlike.length ? `first: plugin: ${unlike[0].pl.out}\nvendored: ${unlike[0].vd.out}` : '');

    // ------------------------------------------------------------------ 6. the extract candidate
    section('-- parity: the extract candidate (readBrainConfig, row 21)');
    const xclone = jp(P, 'extract-clone');
    for (const f of [jp('src', 'frozen', 'x.py'), jp('src', 'open', 'y.py'), jp('src', 'frozen2', 'z.py')]) put(path.join(xclone, f), 'a = 1\n');
    const extract = (values) => toJson({ generated_by: 'tools/extract.mjs', kit_version: '0.3.0', brain_commit: '', class: 'public', at: '2026-11-10T00:00:00Z', values }) + '\n';
    put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ frozenPaths: [{ repo: 'extract-clone', path: 'src/frozen' }, { repo: 'another-repo', path: 'src/open' }, { repo: 'EXTRACT-CLONE', path: 'src/frozen2' }] }));
    const xenv = { DF_POINTER_PATH: NO_POINTER, CLAUDE_PROJECT_DIR: xclone, DF_EXTRACT_PATH: null };
    const xedit = (sid, p, patch = {}) => runHook(kitHooks, 'guard.mjs', { session_id: sid, cwd: xclone, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: p, old_string: 'a', new_string: 'b' } }, { ...xenv, ...patch });
    const verdict = (res) => (res.code !== 0 ? `exit${res.code}` : kindOf(res) === 'error' ? 'error' : classify(res.out) === 'deny' ? 'deny' : 'allowed');
    r = xedit('par-x1', jp(xclone, 'src', 'frozen', 'x.py'));
    record('parity: an extract.json frozenPaths {repo, path} row denies an Edit under <repo>/src/frozen with no pointer', 'deny', verdict(r), r.out);
    record('parity: the deny is rule 4, the protected path', 'rule-4', like(r.out, '*protected path*') ? 'rule-4' : 'wrong', r.out);
    // The deny says where the row came from: with an extract it names .claude/kit/extract.json, not the
    // brain's doctor.config.json, which no clone has. Red before guard-rules.mjs read cfg.source: brain-named.
    record('parity: the rule-4 deny names the extract (.claude/kit/extract.json) the row came from, not the brain config', 'extract-named', r.out.includes('.claude/kit/extract.json') && !r.out.includes("in the brain's doctor.config.json") ? 'extract-named' : 'brain-named', r.out);
    r = xedit('par-x2', jp(xclone, 'src', 'open', 'y.py'));
    record('parity: a row whose repo is another name is dropped: the Edit under its path is not denied', 'allowed', verdict(r), r.out);
    record('parity: the extract counts as a present config (no "no brain" advisory)', 'present', verdict(r) !== 'allowed' ? verdict(r) : !like(r.out, '*no brain*') ? 'present' : 'absent', r.out);
    r = xedit('par-x3', jp(xclone, 'src', 'frozen2', 'z.py'));
    record('parity: the repo name of a row matches the clone folder without case', 'deny', verdict(r), r.out);
    // A row whose repo is "*" is every repository's (tools/extract.mjs writes a ${ROOT} row that way, lead
    // decision M25): it resolves under the clone whatever the folder is named. Red before the reader knew
    // "*": the row was dropped as another repository's and the Edit passed.
    put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ frozenPaths: [{ repo: '*', path: 'src/frozen' }] }));
    r = xedit('par-x3b', jp(xclone, 'src', 'frozen', 'x.py'));
    record('parity: a frozenPaths row whose repo is "*" (the whole root) denies an Edit under <clone>/src/frozen whatever the clone folder is named', 'deny', verdict(r), r.out);
    // A tombstoned row that names the clone itself, {repo: <the clone's folder name>, path: "."} (tools/extract.mjs
    // writes a retired repository's ${ROOT} row that way): rule 4 refuses an Edit anywhere in the clone, the clone's
    // own TOMBSTONE.md passes (VCS-12), and the same row naming another repository resolves nowhere. Red first: with
    // the "." branch of resolveRepoRow (hooks/lib/common.mjs) made to resolve nowhere in a scratch copy, the Edit passed.
    put(jp(xclone, 'x.py'), 'a = 1\n');
    put(jp(xclone, 'TOMBSTONE.md'), 'retired: read by a live consumer\n');
    put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ tombstonedPaths: [{ repo: path.basename(xclone), path: '.' }] }));
    r = xedit('par-x3c', jp(xclone, 'x.py'));
    record('parity: a tombstoned {repo, path: "."} row of the clone denies an Edit at <clone>/x.py (rule 4)', 'deny', verdict(r) === 'deny' && !like(r.out, '*protected path*') ? 'deny, not rule 4' : verdict(r), r.out);
    r = xedit('par-x3d', jp(xclone, 'TOMBSTONE.md'));
    record("parity: under that row the clone's own TOMBSTONE.md is allowed (VCS-12)", 'allowed', verdict(r), r.out);
    put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ tombstonedPaths: [{ repo: 'another-repo', path: '.' }] }));
    r = xedit('par-x3e', jp(xclone, 'x.py'));
    record('parity: a tombstoned {repo, path: "."} row naming another repository allows that Edit', 'allowed', verdict(r), r.out);
    const seamExtract = path.join(P, 'seam-extract.json');
    put(seamExtract, extract({ frozenPaths: [{ repo: 'extract-clone', path: 'src/open' }] }));
    r = xedit('par-x4', jp(xclone, 'src', 'open', 'y.py'), { DF_EXTRACT_PATH: seamExtract });
    record("parity: DF_EXTRACT_PATH is read before the clone's extract.json", 'deny', verdict(r), r.out);
    // A malformed extract (no values object) is advised as the extract, by its path, never as the brain's
    // doctor.config.json; the inline rules still ran. Red before guard.mjs told the two sources apart:
    // 'doctor.config.json unreadable: extract at <p> has no values object'.
    const badExtract = path.join(P, 'bad-extract.json');
    put(badExtract, toJson({ generated_by: 'tools/extract.mjs', class: 'public' }) + '\n');
    r = xedit('par-x4b', jp(xclone, 'src', 'open', 'y.py'), { DF_EXTRACT_PATH: badExtract });
    record('parity: an extract with no values object is advised as "extract unreadable: <path> has no values object", never as doctor.config.json', 'extract-unreadable', r.code !== 0 ? `exit${r.code}` : r.out.includes('extract unreadable: ') && r.out.includes('has no values object') && !r.out.includes('doctor.config.json unreadable') ? 'extract-unreadable' : classify(r.out) === 'allow' ? 'silent' : 'other wording', r.out);
    // A values that is a list is no values object either, for the guard as for the card hook (cases-card.mjs). Red
    // before both readers asked for a plain object: a list passed typeof 'object' and was read as no values, in silence.
    put(badExtract, toJson({ generated_by: 'tools/extract.mjs', class: 'public', values: [] }) + '\n');
    r = xedit('par-x4c', jp(xclone, 'src', 'open', 'y.py'), { DF_EXTRACT_PATH: badExtract });
    record('parity: an extract whose values is a list is advised as "extract unreadable: <path> has no values object" too', 'extract-unreadable', r.code !== 0 ? `exit${r.code}` : r.out.includes('extract unreadable: ') && r.out.includes('has no values object') ? 'extract-unreadable' : classify(r.out) === 'allow' ? 'silent' : 'other wording', r.out);
    // A brain doctor.config.json that is JSON and not an object (a number, a list) is an unreadable config, as one that
    // is not JSON: the guard allows, advises "doctor.config.json unreadable: ... is not a JSON object" and logs an ERROR
    // line; ask and stop allow and log it; none refuses on it. Red before readBrainConfig checked the shape: a present,
    // empty config, the path rules off in silence.
    const odd = jp(P, 'brain-not-object');
    const oddPtr = path.join(P, 'pointer-not-object.json');
    put(oddPtr, toJson({ schema: 1, root, brain: odd, pluginRoot: kit, pluginKind: 'checkout' }));
    for (const [label, text] of [['a number', '42'], ['a list', '[]']]) {
        put(path.join(odd, 'doctor.config.json'), text);
        const oddFrom = logAt().length;
        r = runHook(kitHooks, 'guard.mjs', { session_id: `par-odd-${label.replace(/\s+/g, '-')}`, cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(root, 'frozen', 'x.py'), old_string: 'a', new_string: 'b' } }, { DF_POINTER_PATH: oddPtr });
        const said = r.code !== 0 ? `exit${r.code}` : classify(r.out) === 'advise' && r.out.includes('doctor.config.json unreadable: ') && r.out.includes('is not a JSON object') ? 'advised' : classify(r.out) === 'allow' ? 'silent' : classify(r.out);
        record(`parity: a brain doctor.config.json that is ${label} is advised as unreadable (not a JSON object), never read as an empty config`, 'advised', said, r.out);
        record(`parity: that brain config (${label}) is one ERROR guard line in the hooks log`, 'logged', logAt().slice(oddFrom).split(/\r?\n/).filter((l) => / ERROR guard doctor\.config\.json unreadable: .*is not a JSON object/.test(l)).length === 1 ? 'logged' : 'not-logged', logAt().slice(oddFrom));
    }
    put(path.join(odd, 'doctor.config.json'), '42');
    let at0 = logAt().length;
    r = runHook(kitHooks, 'ask.mjs', { session_id: 'par-odd-ask', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'q', header: 'h', options: [{ label: 'a (Recommended)', description: 'Gives the thing the case needs; costs nothing worth a word.' }, { label: 'b', description: 'Gives a second path for a different owner; costs one more step.' }], multiSelect: false }] } }, { DF_POINTER_PATH: oddPtr });
    record('parity: ask on a brain config that is not an object allows a well-formed question with the defaults and logs why', 'allowed+logged',
        `${r.code !== 0 ? `exit${r.code}` : classify(r.out) === 'allow' ? 'allowed' : classify(r.out)}+${/ WARN ask brain config unreadable, the ask defaults apply: .*is not a JSON object/.test(logAt().slice(at0)) ? 'logged' : 'silent'}`, `${r.out}\n${logAt().slice(at0)}`);
    put(ledger('par-odd-stop'), jp(repoClean, 'src', 'main.py') + '\t\n');
    at0 = logAt().length;
    r = runHook(kitHooks, 'stop.mjs', { session_id: 'par-odd-stop', cwd: root, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'x' }, { DF_POINTER_PATH: oddPtr });
    record('parity: stop on a brain config that is not an object hands over its card with the defaults and logs why', 'card+logged',
        `${r.code !== 0 ? `exit${r.code}` : classify(r.out) === 'block' ? 'card' : classify(r.out)}+${/ WARN stop brain config unreadable, the defaults apply: .*is not a JSON object/.test(logAt().slice(at0)) ? 'logged' : 'silent'}`, `${r.out}\n${logAt().slice(at0)}`);
    got = ask('const c = C.readBrainConfig(C.readPointer()); process.stdout.write(`${c.source} ${c.present}`);', xenv);
    record("parity: readBrainConfig says where its values came from (source 'extract')", 'extract true', got);
    got = ask('const c = C.readBrainConfig(C.readPointer()); process.stdout.write(`${c.source} ${c.present}`);');
    record("parity: through the pointer the source is the brain (source 'brain')", 'brain true', got);
    // The cloud path end to end: the vendored copy reads the extract beside it, with no pointer at all.
    put(jp(clone, 'src', 'frozen', 'x.py'), 'a = 1\n');
    put(path.join(vk, 'extract.json'), extract({ frozenPaths: [{ repo: 'lone-clone', path: 'src/frozen' }] }));
    r = runHook(vHooks, 'guard.mjs', { session_id: 'par-x5', cwd: clone, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(clone, 'src', 'frozen', 'x.py'), old_string: 'a', new_string: 'b' } }, { CLAUDE_PROJECT_DIR: clone, DF_POINTER_PATH: NO_POINTER, DF_EXTRACT_PATH: null });
    record('parity: the vendored guard reads the extract beside it with no pointer (the cloud path)', 'deny', verdict(r), r.out);
    // The read check's exempt globs travel as {repo, path} rows too (tools/extract.mjs writes a `${ROOT}/x/**`
    // row that way): such a row is an exempt glob under the clone. A string row that still carries ${ROOT}
    // with no root names nothing and is dropped, never read as '/**', which would exempt every file.
    const big = 'x = 1\n'.repeat(40);   // 240 bytes, past a ceiling of 100
    const xwrite = (sid, p) => runHook(kitHooks, 'guard.mjs', { session_id: sid, cwd: xclone, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: p, content: big } }, xenv);
    const noted = (res) => (res.code !== 0 ? `exit${res.code}` : classify(res.out) === 'advise-one-channel' && like(res.out, '*past one Read (readCeilingBytes 100)*') ? 'noted' : classify(res.out));
    put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ readCeilingBytes: 100, readCeilingExempt: [{ repo: 'extract-clone', path: 'src/big/**' }, { repo: 'another-repo', path: 'src/open/**' }] }));
    record("parity: the extract's readCeilingBytes is live: a Write past it gets the read-check note", 'noted', noted(xwrite('par-x6', jp(xclone, 'src', 'open', 'big.py'))));
    r = xwrite('par-x7', jp(xclone, 'src', 'big', 'big.py'));
    record('parity: an extract readCeilingExempt {repo, path} row exempts the path under the clone', 'exempt', r.code !== 0 ? `exit${r.code}` : classify(r.out) === 'allow' ? 'exempt' : classify(r.out), r.out);
    record("parity: an exempt row of another repository is dropped: the note still fires under its path", 'noted', noted(xwrite('par-x8', jp(xclone, 'src', 'open', 'big2.py'))));
    put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ readCeilingBytes: 100, readCeilingExempt: ['${ROOT}/**'] }));
    record("parity: a ${ROOT} glob row with no root is dropped, never read as /** (every file exempt)", 'noted', noted(xwrite('par-x9', jp(xclone, 'src', 'open', 'big3.py'))));
    // CLAUDE_PROJECT_DIR as the host types it can be a link (a junction on Windows) to a folder of another
    // name: a row's repo matches the typed folder name as well as the resolved one. A host that cannot make
    // the link says so and skips this one case; it records no pass it did not prove.
    const linkClone = jp(P, 'linked-clone');
    let linked = false;
    try { fs.symlinkSync(xclone, linkClone, 'junction'); linked = true; } catch (e) { say(`  parity: no link could be made here (${e.message}); the typed-name case is not run`); }
    if (linked) {
        put(jp(xclone, '.claude', 'kit', 'extract.json'), extract({ frozenPaths: [{ repo: 'linked-clone', path: 'src/frozen' }] }));
        r = runHook(kitHooks, 'guard.mjs', { session_id: 'par-x10', cwd: linkClone, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(linkClone, 'src', 'frozen', 'x.py'), old_string: 'a', new_string: 'b' } }, { ...xenv, CLAUDE_PROJECT_DIR: linkClone });
        record("parity: a row's repo matches the typed folder name of CLAUDE_PROJECT_DIR when it is a link to a folder of another name", 'deny', verdict(r), r.out);
    }
}
