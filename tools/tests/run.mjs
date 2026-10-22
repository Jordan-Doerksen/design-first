// run.mjs - design-first hook self-tests.  node tools/tests/run.mjs [-KeepTemp] [-Filter <substring>]
//
// Exit 0 only when every case passes. Prints one table row per case: case, expected, got.
//
// Every fixture is created here, in a fresh temp folder: a fake brain, a fake pointer, small git
// repos, a folder outside any repo. The hooks read the pointer, the logs and the marker folder
// through the DF_* seams (see hooks/lib/common.mjs), so this run never touches the real pointer,
// the real hooks log or the real fence log. It runs on Windows, macOS and Linux; the few cases that
// test a spelling only one system has (a drive letter, an admin share, a Git Bash /c/ path) run only
// there.
//
// The cases live in guard-cases.json, deliberately. A PreToolUse hook on the machine running this
// test inspects the test's own command string; a case embedded inline would be blocked by the very
// guard it is testing. Reading cases from disk keeps the test's own command clean.
//
// The hook cases in cases-*.mjs are split by domain (DES-03). Each exports one function that takes
// the context built here (fixtures and helpers) and records into the same result list.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from '../lib/args.mjs';

const opts = parseArgs(process.argv.slice(2), { switches: ['KeepTemp'], values: ['Filter'] });
const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(here, '..', '..');
const hooks = path.join(kit, 'hooks');
const casesFile = path.join(here, 'guard-cases.json');
const IS_WIN = process.platform === 'win32';

// Workaround: no folder name in this path may hold a measuring word as a word part (a part that starts
// with test, probe, verify or assert, or is spec or specs), or the fence reads every fixture as a
// measuring file (isMeasuringPath in hooks/fence.mjs). 'df-run-' and a hex id hold none.
let T = path.join(os.tmpdir(), 'df-run-' + crypto.randomBytes(4).toString('hex'));
fs.mkdirSync(T, { recursive: true });
T = fs.realpathSync.native(T);   // macOS: /var/folders/... is /private/var/folders/...
const TFWD = T.replace(/\\/g, '/');
const msys = /^([A-Za-z]):\\(.*)$/.exec(T);
const TMSYS = msys ? '/' + msys[1].toLowerCase() + '/' + msys[2].replace(/\\/g, '/') : TFWD;

// ------------------------------------------------------------------ output
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (s = '', code) => process.stdout.write((code ? paint(code, s) : s) + '\n');
const results = [];
function record(name, expected, got, detail = '') {
    const ok = String(expected) === String(got);
    results.push({ pass: ok, name, expected, got, detail });
    say(`  ${ok ? 'PASS' : 'FAIL'}  ${name.slice(0, 72).padEnd(72)} ${String(expected).padEnd(8)} ${got}`, ok ? 32 : 31);
    // The cut is taken AFTER the newline fold, so a detail that holds a CRLF cannot overrun it.
    if (!ok && detail) { const flat = String(detail).replace(/\r?\n/g, ' '); say('        ' + flat.slice(0, 300), 90); }
}
const section = (s) => say(s);

// ------------------------------------------------------------------ text helpers
// PowerShell -like, which the cases were written against: * and ? are wildcards, [..] a class, a
// backtick escapes the next character, and the match ignores case unless cs is set.
function likeRegex(pattern, cs) {
    let rx = '';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '`' && i + 1 < pattern.length) { rx += pattern[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); continue; }
        if (ch === '*') { rx += '[\\s\\S]*'; continue; }
        if (ch === '?') { rx += '[\\s\\S]'; continue; }
        if (ch === '[') {
            const end = pattern.indexOf(']', i + 1);
            if (end > i + 1) { rx += '[' + pattern.slice(i + 1, end).replace(/\\/g, '\\\\') + ']'; i = end; continue; }
        }
        rx += ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }
    return new RegExp('^' + rx + '$', cs ? '' : 'i');
}
const like = (s, pattern) => likeRegex(pattern, false).test(String(s ?? ''));
const clike = (s, pattern) => likeRegex(pattern, true).test(String(s ?? ''));
const blank = (s) => s == null || String(s).trim() === '';
const rxEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// A path written the way the PowerShell cases wrote it ('src\main.py') joined for this system.
const jp = (base, ...rels) => path.join(base, ...rels.flatMap((r) => String(r).split(/[\\/]/)));
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const exists = (p) => fs.existsSync(p);
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function setOld(p, days = 2) { const t = new Date(Date.now() - days * 86400000); fs.utimesSync(p, t, t); }

// ------------------------------------------------------------------ fixtures
const GIT_ID = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
function gitTry(dir, args) {
    const r = spawnSync('git', ['-C', dir, ...GIT_ID, ...args], { encoding: 'utf8', windowsHide: true });
    return { code: r.status == null ? -1 : r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, '') };
}
function runGit(dir, args) { gitTry(dir, args); }
function gitOut(dir, args) {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return (r.stdout || '').replace(/\r?\n$/, '');
}
function put(p, content) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, String(content), 'utf8');
}
function newRepo(name) {
    const d = jp(T, 'root', name);
    fs.mkdirSync(d, { recursive: true });
    runGit(d, ['init', '-q', '-b', 'main']);
    return d;
}
const toJson = (o) => JSON.stringify(o, null, 2);

say();
say(`design-first self-tests  (temp: ${T})`);
say();

const brain = path.join(T, 'brain');
const root = path.join(T, 'root');
for (const d of [brain, root, path.join(T, 'outside'), path.join(T, 'markers'), jp(T, 'plugins', 'cache', 'design-first')]) fs.mkdirSync(d, { recursive: true });
put(path.join(brain, 'doctor.config.json'), toJson({
    schema: 1,
    frozenPaths: ['${ROOT}/frozen'],
    tombstonedPaths: [path.join(root, 'tomb')],
    secretExceptions: ['repo-plain/allowed/.env'],
    // Guard rules 8 and 9 (0.1.17). No earlier case runs a scheduling command or edits under trading.
    forbidScheduling: true,
    contentRules: [{
        id: 'SAFE-02', under: ['${ROOT}/trading'], except: ['${ROOT}/trading/action'], exceptParts: ['tests'],
        extensions: ['.py'], pattern: '(?i)(?<![A-Za-z0-9])place_?orders?\\s*\\(', shell: true, why: 'SAFE-02 fixture: nothing under trading places an order.',
    }],
}));
put(path.join(brain, 'me.md'), '---\nowner:\n  name: "Test Owner"\n---\n# About the owner\n');
// Entries 4-6 use the kit:/brain: prefixes the shipped templates/entry.json uses. 6 is a file that
// exists under the kit but not the brain, so a brain: entry resolved against the kit would be caught.
put(path.join(brain, 'entry.json'), toJson({ schema: 1, entries: [{ path: 'me.md', note: 'who you are talking to' }, { path: 'not-here.md', note: 'deliberately absent' }, '${BRAIN}/doctor.config.json', 'kit:hooks/entry.mjs', 'brain:me.md', 'brain:hooks/entry.mjs'] }));
put(jp(root, 'frozen', 'x.py'), 'x = 1');
put(jp(root, 'tomb', 'x.md'), 'retired');
put(jp(root, 'ordinary', 'x.gd'), 'var a = 1');
put(jp(root, 'ordinary', 'big.txt'), 'x'.repeat(1000));
put(jp(root, 'tests', 'probe_x.js'), 'assert(a);');

const repoPlain = newRepo('repo-plain');
put(path.join(repoPlain, '.gitignore'), 'node_modules/\n');
put(path.join(repoPlain, 'README.md'), 'plain');
runGit(repoPlain, ['add', '-A']); runGit(repoPlain, ['commit', '-q', '-m', 'init']);
put(path.join(repoPlain, '.env'), 'TOKEN=untracked-not-ignored');
put(jp(repoPlain, 'allowed', '.env'), 'TOKEN=the-recorded-exception');
put(jp(repoPlain, 'sub', 'keep.txt'), 'k');

const repoIgnored = newRepo('repo-ignored');
put(path.join(repoIgnored, '.gitignore'), '.env\n.env.*\n!.env.example\n');
put(path.join(repoIgnored, 'README.md'), 'ignored');
runGit(repoIgnored, ['add', '-A']); runGit(repoIgnored, ['commit', '-q', '-m', 'init']);
put(path.join(repoIgnored, '.env'), 'TOKEN=ignored');

const repoClean = newRepo('repo-clean');
put(jp(repoClean, 'src', 'main.py'), 'print(1)');
put(path.join(repoClean, 'DECISIONS.md'), '# decisions');
runGit(repoClean, ['add', '-A']); runGit(repoClean, ['commit', '-q', '-m', 'init']);

// A repo with source and no manifest: guard rule 5 (DES-02) must ask once per session here.
const repoNoManifest = newRepo('repo-nomanifest');
put(jp(repoNoManifest, 'src', 'app.py'), 'print(2)');
put(path.join(repoNoManifest, 'notes.md'), 'not source');
runGit(repoNoManifest, ['add', '-A']); runGit(repoNoManifest, ['commit', '-q', '-m', 'init']);

// Guard rule 10 (GATE-08, GATE-09): a declared design gate with no record, a cleared one, a bad record.
const repoGated = newRepo('repo-gated');
put(jp(repoGated, 'src', 'core.py'), 'print(3)');
put(path.join(repoGated, 'DECISIONS.md'), '# decisions\n\nDesign gate: on\n');
runGit(repoGated, ['add', '-A']); runGit(repoGated, ['commit', '-q', '-m', 'init']);
const repoGatedOk = newRepo('repo-gated-ok');
put(jp(repoGatedOk, 'src', 'core.py'), 'print(4)');
put(path.join(repoGatedOk, 'DECISIONS.md'), '# decisions\n\n| Design gate | on |\n');
put(jp(repoGatedOk, 'records', 'gate-cleared.md'), '# Gate cleared\n\nFindings: 2\n\n- F1 resolved: the spec names the failure mode\n- F2 recorded: open question 3, owner named\n');
runGit(repoGatedOk, ['add', '-A']); runGit(repoGatedOk, ['commit', '-q', '-m', 'init']);
const repoGatedBad = newRepo('repo-gated-bad');
put(jp(repoGatedBad, 'src', 'core.py'), 'print(5)');
put(path.join(repoGatedBad, 'DECISIONS.md'), '# decisions\n\nDesign gate: on\n');
put(jp(repoGatedBad, 'records', 'gate-cleared.md'), '# Gate cleared\n\nFindings: 0\n');
runGit(repoGatedBad, ['add', '-A']); runGit(repoGatedBad, ['commit', '-q', '-m', 'init']);
const repoGatedOpen = newRepo('repo-gated-open');
put(jp(repoGatedOpen, 'src', 'core.py'), 'print(6)');
put(path.join(repoGatedOpen, 'DECISIONS.md'), '# decisions\n\nDesign gate: on\n');
put(jp(repoGatedOpen, 'records', 'gate-cleared.md'), 'Findings: 2\n\n- F1 resolved: yes\n- F2 still thinking about it\n');
runGit(repoGatedOpen, ['add', '-A']); runGit(repoGatedOpen, ['commit', '-q', '-m', 'init']);

// Guard rules 11 and 12 (AUTO-11, AUTO-04): a repository on the loop branch, with a story ledger.
const repoLoop = newRepo('repo-loop');
put(jp(repoLoop, 'src', 'core.py'), 'print(8)');
put(path.join(repoLoop, 'DECISIONS.md'), '# decisions');
put(jp(repoLoop, 'docs', 'specs', 'chunk-1.tasks.json'), '{"stories":[]}');
runGit(repoLoop, ['add', '-A']); runGit(repoLoop, ['commit', '-q', '-m', 'init']);
runGit(repoLoop, ['checkout', '-q', '-b', 'harness/chunk-1']);
put(jp(repoClean, 'docs', 'specs', 'chunk-1.tasks.json'), '{"stories":[]}');
runGit(repoClean, ['add', '-A']); runGit(repoClean, ['commit', '-q', '-m', 'ledger']);

const repoTracked = newRepo('repo-tracked');
put(path.join(repoTracked, '.env'), 'TOKEN=tracked-by-mistake');
runGit(repoTracked, ['add', '-A']); runGit(repoTracked, ['commit', '-q', '-m', 'init']);
// The tracked .env changed after the commit, as a shell write leaves it: the RESIDUAL stage-secret
// cases assert that a wildcard add and git commit -a are not refused here (the probe lists untracked
// files only).
put(path.join(repoTracked, '.env'), 'TOKEN=changed-by-a-shell-write');

const pointerPath = path.join(T, 'pointer.json');
function writePointer(pluginRoot, kind) {
    put(pointerPath, toJson({ schema: 1, root, brain, pluginRoot, pluginKind: kind }));
}
writePointer(kit, 'checkout');

process.env.DF_POINTER_PATH = pointerPath;
process.env.DF_LOG_PATH = path.join(T, 'hooks.log');
process.env.DF_FENCE_LOG_PATH = path.join(T, 'fence.log');
process.env.DF_MARKER_DIR = path.join(T, 'markers');
delete process.env.CLAUDE_PLUGIN_ROOT;
const NO_POINTER = path.join(T, 'no-such-pointer.json');
// Runs fn with the pointer seam pointed at a file that does not exist, then puts it back.
function withPointerAt(pointerFile, fn) {
    const saved = process.env.DF_POINTER_PATH;
    process.env.DF_POINTER_PATH = pointerFile;
    try { return fn(); } finally { process.env.DF_POINTER_PATH = saved; }
}
const withoutPointer = (fn) => withPointerAt(NO_POINTER, fn);
// The full-text lines of an injection, read the way an agent reads them: the folders named once
// at the top, then each line's paths joined to the folder it names. Returns { kit, brain, files }.
function fullTextFiles(out) {
    const m = /^.*Full-text paths are relative to the folder each line names: kit folder (.+?)(?:; brain folder (.+))?\.$/m.exec(out);
    const folders = { kit: m ? m[1] : null, brain: m && m[2] ? m[2] : null };
    const files = [];
    for (const l of out.split('\n')) {
        const f = /^ {2}full text \((kit|brain) folder\): (.+)$/.exec(l);
        if (f) for (const rel of f[2].split(' ; ')) files.push({ base: f[1], rel, full: folders[f[1]] ? path.join(folders[f[1]], rel) : null });
    }
    return { ...folders, files };
}

// ------------------------------------------------------------------ invoking a hook
// stdout and stderr together, as one string with LF line ends and no trailing newline.
function invokeHook(script, stdin, hooksDir = hooks) {
    const r = spawnSync(process.execPath, [path.join(hooksDir, script)], { input: stdin, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return { code: r.status == null ? -1 : r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, '') };
}
const hookJson = (o) => JSON.stringify(o);
function parseOut(out) { try { return JSON.parse(out); } catch { return null; } }
function classify(out) {
    if (blank(out)) return 'allow';
    const j = parseOut(out);
    if (j == null || typeof j !== 'object') return 'bad-output';
    const h = j.hookSpecificOutput;
    if (j.decision === 'block') return 'block';
    if (h && h.permissionDecision === 'deny') return 'deny';
    if (h && h.permissionDecision === 'ask') return 'ask';
    if (h && h.updatedInput) return 'rewrite';
    if (h && h.additionalContext) return j.systemMessage ? 'advise' : 'advise-one-channel';
    return 'unknown-json';
}
function expand(s) {
    if (s == null) return s;
    return String(s).split('${T}').join(T).split('${TFWD}').join(TFWD).split('${TMSYS}').join(TMSYS).split('${KIT}').join(kit);
}

// ------------------------------------------------------------------ 1. pre-body smoke (hooks.json as registered)
section('-- pre-body smoke: every hooks.json entry, ${CLAUDE_PLUGIN_ROOT} substituted');
{
    const hj = JSON.parse(readText(path.join(hooks, 'hooks.json')));
    process.env.CLAUDE_PLUGIN_ROOT = kit;
    for (const [event, entries] of Object.entries(hj.hooks)) {
        for (const entry of entries) {
            for (const h of entry.hooks) {
                const command = h.command.split('${CLAUDE_PLUGIN_ROOT}').join(kit);
                let payload;
                if (event === 'SessionStart') payload = { session_id: 'smoke', cwd: root, hook_event_name: 'SessionStart', source: entry.matcher };
                else if (event === 'UserPromptSubmit') payload = { session_id: 'smoke', cwd: root, hook_event_name: 'UserPromptSubmit', prompt_id: 'smoke', prompt: 'smoke prompt' };
                else if (event === 'SubagentStart') payload = { session_id: 'smoke', cwd: root, hook_event_name: 'SubagentStart', agent_id: 'smoke', agent_type: 'general-purpose' };
                else if (event === 'Stop') payload = { session_id: 'smoke', cwd: root, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'smoke' };
                else payload = { session_id: 'smoke', cwd: root, hook_event_name: event, tool_name: 'Edit', tool_input: { file_path: jp(root, 'ordinary', 'x.gd'), old_string: 'a', new_string: 'b' } };
                // The command runs through the system shell, as the host runs it.
                const r = spawnSync(command, { shell: true, input: hookJson(payload), encoding: 'utf8', windowsHide: true });
                const out = ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, '');
                const code = r.status == null ? -1 : r.status;
                const expected = event === 'SessionStart' ? 'exit0+stdout' : event === 'UserPromptSubmit' ? 'exit0+any' : 'exit0+empty-or-json';
                let got;
                if (code !== 0) got = `exit${code}`;
                else if (event === 'UserPromptSubmit') got = 'exit0+any';
                else if (event === 'SessionStart') got = blank(out) ? 'exit0+EMPTY' : 'exit0+stdout';
                else got = blank(out) || parseOut(out) != null ? 'exit0+empty-or-json' : 'exit0+NOT-JSON';
                record(`smoke ${event}/${entry.matcher ?? ''} -> ${path.basename(h.command.replace(/"/g, ''))}`, expected, got, out);
            }
        }
    }
    delete process.env.CLAUDE_PLUGIN_ROOT;
}

// ------------------------------------------------------------------ 2. guard + fence cases
section('-- guard and fence cases');
{
    const cases = JSON.parse(readText(casesFile));
    const scripts = { fence: 'fence.mjs', agent: 'agent.mjs', ask: 'ask.mjs' };
    for (const c of cases) {
        if ('_' in c) continue;
        if (opts.Filter && !like(c.name, `*${opts.Filter}*`)) continue;
        // A case that tests a spelling only one system has says so; elsewhere it is not run.
        if (c.platform && c.platform !== (IS_WIN ? 'win32' : 'posix')) continue;
        const script = scripts[c.hook] || 'guard.mjs';
        const cwd = c.cwd ? expand(c.cwd) : repoClean;
        const session = c.session || 's-default';
        let stdin;
        if ('stdin' in c) stdin = String(c.stdin);
        else {
            const ti = {};
            switch (c.tool) {
                case 'Bash': case 'PowerShell': ti.command = expand(c.cmd); break;
                case 'NotebookEdit': ti.notebook_path = expand(c.path); ti.new_source = 'x'; break;
                case 'Write': ti.file_path = expand(c.path); ti.content = c.content != null ? String(c.content) : 'x'; break;
                case 'AskUserQuestion': {
                    // OWN-04: the default options are well formed (recommended first, each with a reason),
                    // so a case changes only the part it tests: options, question, or n.
                    const n = c.n ? Number(c.n) : 1;
                    const options = 'options' in c ? [].concat(c.options) : [
                        { label: 'a (Recommended)', description: 'Gives the thing the case needs; costs nothing worth a word.' },
                        { label: 'b', description: 'Gives a second path for a different owner; costs one more step.' }];
                    const multi = c.multiSelect === true;
                    ti.questions = Array.from({ length: n }, (_, i) => ({ question: c.question ? String(c.question) : `q${i + 1}`, header: 'h', options, multiSelect: multi }));
                    break;
                }
                case 'Agent':
                    ti.description = 'case'; ti.prompt = String(c.prompt ?? '');
                    if (c.type) ti.subagent_type = String(c.type);
                    if (c.model) ti.model = String(c.model);
                    break;
                case 'mcp__ccd_session__start_session':
                    // CTRL-02: the host's session-start tool. A case with no prompt is an offer (a title
                    // alone) or a proposal started by its id, so the prompt is set only when the case has one.
                    ti.title = 'case'; ti.initiation = 'user_asked';
                    if ('prompt' in c) ti.prompt = String(c.prompt);
                    break;
                default:
                    ti.file_path = expand(c.path); ti.old_string = c.old != null ? String(c.old) : 'a'; ti.new_string = c.new != null ? String(c.new) : 'b';
            }
            const payload = { session_id: session, cwd, hook_event_name: 'PreToolUse', tool_name: c.tool, tool_input: ti };
            if (c.prompt_id) payload.prompt_id = String(c.prompt_id);
            if (c.agent_id) payload.agent_id = String(c.agent_id);
            stdin = hookJson(payload);
        }
        // A case may set the session's role marker, as route.mjs writes it on a first prompt ("role":
        // "writer" or "owner"), and may lay keys over the fixture brain's config for itself alone ("brainSet").
        if (c.role) put(path.join(process.env.DF_MARKER_DIR, `${session}.role`), String(c.role));
        const brainCfgPath = path.join(brain, 'doctor.config.json');
        const brainCfgKept = c.brainSet ? readText(brainCfgPath) : null;
        if (c.brainSet) put(brainCfgPath, toJson({ ...JSON.parse(brainCfgKept), ...c.brainSet }));
        const logBefore = readText(process.env.DF_LOG_PATH);
        let r;
        try { r = c.pointer === 'none' ? withoutPointer(() => invokeHook(script, stdin)) : invokeHook(script, stdin); }
        finally { if (brainCfgKept != null) put(brainCfgPath, brainCfgKept); }
        let got = r.code !== 0 ? `exit${r.code}` : classify(r.out);
        if (got === c.expect && c.contains && !like(r.out, `*${c.contains}*`)) got = `missing-text:${c.contains}`;
        if (got === c.expect && c.logContains) {
            const logNow = readText(process.env.DF_LOG_PATH);
            if (!like(logNow.slice(logBefore.length), `*${c.logContains}*`)) got = `log-missing:${c.logContains}`;
        }
        record(c.name, c.expect, got, r.out);
    }
}

// ------------------------------------------------------------------ 3. entry.mjs behaviour
section('-- entry.mjs');
const entry = (cwd, session, source) => invokeHook('entry.mjs', hookJson({ session_id: session, cwd, hook_event_name: 'SessionStart', source }));
{
    // old marker + old log line, to prove housekeeping
    const oldMarker = path.join(process.env.DF_MARKER_DIR, 'old-session.advised');
    put(oldMarker, 'x'); setOld(oldMarker);
    const freshMarker = path.join(process.env.DF_MARKER_DIR, 'fresh-session.advised');
    put(freshMarker, 'x');
    fs.appendFileSync(process.env.DF_LOG_PATH, `${new Date(Date.now() - 100 * 86400000).toISOString()} ERROR guard ancient line to truncate\n`);
    fs.appendFileSync(process.env.DF_LOG_PATH, `${new Date(Date.now() - 5 * 86400000).toISOString()} WARN entry recent line to keep\n`);

    let e = entry(root, 'e1', 'startup');
    record('entry: cwd under root lists entry.json in order', 'listed', e.code === 0 && /^ 1\. .*me\.md - who/mi.test(e.out) && /^ 2\. MISSING: .*not-here\.md/mi.test(e.out) && /^ 3\. .*doctor\.config\.json/mi.test(e.out) ? 'listed' : 'not-listed', e.out);
    const kitHook = rxEscape(path.join(kit, 'hooks', 'entry.mjs'));
    const brainMe = rxEscape(path.join(brain, 'me.md'));
    const brainHook = rxEscape(path.join(brain, 'hooks', 'entry.mjs'));
    record('entry: kit: resolves under the kit, brain: under the brain', 'prefixed',
        new RegExp(`^ 4\\. ${kitHook}$`, 'mi').test(e.out) && new RegExp(`^ 5\\. ${brainMe}$`, 'mi').test(e.out) && new RegExp(`^ 6\\. MISSING: ${brainHook}$`, 'mi').test(e.out) && !/kit:|brain:/i.test(e.out) ? 'prefixed' : 'wrong', e.out);
    record('entry: heartbeat written to <brain>/state/last-session.json', 'present', exists(jp(brain, 'state', 'last-session.json')) ? 'present' : 'absent');
    record('entry: marker older than 1 day deleted, fresh kept', 'old-gone', !exists(oldMarker) && exists(freshMarker) ? 'old-gone' : 'wrong');
    let logText = readText(process.env.DF_LOG_PATH);
    record('entry: hooks log truncated to 90 days', 'truncated', !like(logText, '*ancient line*') && like(logText, '*recent line to keep*') ? 'truncated' : 'not-truncated', logText);

    e = entry(path.join(T, 'outside'), 'e2', 'resume');
    record('entry: cwd outside root prints one line', 'one-line', e.code === 0 && e.out.split('\n').filter((l) => l.trim()).length === 1 && like(e.out, '*outside root*') ? 'one-line' : 'wrong', e.out);

    e = withoutPointer(() => entry(root, 'e3', 'startup'));
    record('entry: no pointer prints the /design-first:adopt line', 'adopt-line', e.code === 0 && like(e.out, '*/design-first:adopt*') ? 'adopt-line' : 'wrong', e.out);

    writePointer(path.join(T, 'stale-plugin-root'), 'checkout');
    process.env.CLAUDE_PLUGIN_ROOT = kit;
    e = entry(root, 'e4', 'startup');
    let p = JSON.parse(readText(pointerPath));
    record('entry: pluginRoot refreshed when kind matches (checkout)', 'refreshed', p.pluginRoot === kit && p.pluginKind === 'checkout' ? 'refreshed' : `still:${p.pluginRoot}`, e.out);

    const cacheRoot = jp(T, 'plugins', 'cache', 'design-first');
    process.env.CLAUDE_PLUGIN_ROOT = cacheRoot;
    e = entry(root, 'e5', 'startup');
    p = JSON.parse(readText(pointerPath));
    record('entry: kind mismatch (cache vs checkout) warns once, pointer unchanged', 'warned+kept', p.pluginRoot === kit && like(e.out, '*WARNING*unsupported*') ? 'warned+kept' : 'wrong', e.out);
    e = entry(root, 'e5', 'compact');
    record('entry: kind mismatch, same session, no second warning', 'quiet', !like(e.out, '*WARNING*') ? 'quiet' : 'warned-again', e.out);

    process.env.CLAUDE_PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}';
    e = entry(root, 'e6', 'startup');
    logText = readText(process.env.DF_LOG_PATH);
    record('entry: literal ${CLAUDE_PLUGIN_ROOT} logs ERROR', 'logged', like(logText, '*ERROR entry*unexpanded*') && like(e.out, '*unexpanded*') ? 'logged' : 'not-logged', e.out);
    delete process.env.CLAUDE_PLUGIN_ROOT;
}
// The personal-word leak scan is NOT here: a word list in this file would itself be the leak. The
// Doctor's tree_free_of claim owns that scan (SPEC 5.2, C6).

// ------------------------------------------------------------------ 4. route.mjs + subagent.mjs (DES-13)
section('-- route.mjs and subagent.mjs');
// The sandbox brain has no LAW.md and no route-policy.json, so the kit's LAW.md and template policy
// are the index and the policy: the no-brain-files path.
const route = (prompt, session, cwd) => invokeHook('route.mjs', hookJson({ session_id: session, cwd, hook_event_name: 'UserPromptSubmit', prompt_id: 'p', prompt }));
const sub = (session, type) => invokeHook('subagent.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'SubagentStart', agent_id: 'a', agent_type: type }));
{
    let r = route('please build the new feature and commit it', 'r1', root);
    record('route: a build+commit prompt injects DES and VCS rows', 'des+vcs', r.code === 0 && /group DES/i.test(r.out) && /group VCS/i.test(r.out) && /DES-01 \[/i.test(r.out) ? 'des+vcs' : 'wrong', r.out);
    r = route('interview me on this addition', 'r1g', root);
    record('route: an interview prompt injects the GATE group with GATE-14 (CR-2026-10-14-REVIEW)', 'gate-14', r.code === 0 && /group GATE/i.test(r.out) && /GATE-14 \[ADVISE\]/i.test(r.out) ? 'gate-14' : 'wrong', r.out);
    record('route: the GATE group carries GATE-15 frontier (CR-2026-10-15-FRONTIER)', 'gate-15', r.code === 0 && /GATE-15 \[ADVISE\]/i.test(r.out) ? 'gate-15' : 'wrong', r.out);
    // Each owning file is named relative to a folder the block names once (CR-2026-10-17-PATHS), and
    // joined to that folder it is a file on the disk; no full-text line repeats the kit folder.
    const ft = fullTextFiles(r.out);
    const unopened = ft.files.filter((f) => !f.full || !exists(f.full)).map((f) => `${f.base}:${f.rel}`);
    record('route: rows name each owning file relative to a folder named once, and each one opens', 'resolved',
        ft.kit === kit && ft.files.length > 0 && unopened.length === 0 && !/kit:instructions/i.test(r.out) ? 'resolved' : `kit=${ft.kit} files=${ft.files.length} unopened: ${unopened.join(', ')}`, r.out);
    record('route: no full-text line repeats the kit folder', 'once', r.out.split('\n').filter((l) => l.startsWith('  full text') && l.includes(kit)).length === 0 ? 'once' : 'repeated', r.out);
    const r1Routes = path.join(process.env.DF_MARKER_DIR, 'r1.routes');
    record('route: the active set is recorded for the session', 'recorded', exists(r1Routes) && readText(r1Routes).split(/\r?\n/).some((l) => l.toLowerCase() === 'des') ? 'recorded' : 'missing');
    r = route('yes please', 'r1', root);
    record('route: a follow-up that names nothing injects nothing', 'silent', r.code === 0 && blank(r.out) ? 'silent' : 'noisy', r.out);
    r = route('now commit and push the repo', 'r1', root);
    record('route: an already-active group is not injected twice', 'silent', r.code === 0 && blank(r.out) ? 'silent' : 'again', r.out);
    r = route('start the server and check the log', 'r1', root);
    record('route: a new group later in the session is added', 'obs', /group OBS/i.test(r.out) && !/group DES/i.test(r.out) ? 'obs' : 'wrong', r.out);
    r = route('The goal is to design a loop', 'r2', root);
    record('route: whole words (design and loop match)', 'des+auto', /group DES/i.test(r.out) && /group AUTO/i.test(r.out) ? 'des+auto' : 'wrong', r.out);
    route('ok', 'r3', root);   // the session's first prompt takes the always group (OWN), so the next check can demand silence
    r = route('the designer looped', 'r3', root);
    record('route: substrings do not match (designer, looped)', 'silent', blank(r.out) ? 'silent' : 'matched', r.out);
    // CR-2026-10-19-STACK: the STACK group routes on the stack words of the template policy, and the
    // kit's LAW.md carries its three rows with the kit's grades.
    r = route('which runtime does this repo pin, and where is its lockfile', 'r-stack', root);
    record('route: a stack word injects the STACK group, STACK-01 at GATE and STACK-03 at ADVISE (CR-2026-10-19-STACK)', 'stack', r.code === 0 && /group STACK/i.test(r.out) && /STACK-01 \[GATE\]/i.test(r.out) && /STACK-03 \[ADVISE\]/i.test(r.out) ? 'stack' : 'wrong', r.out);
    // CR-2026-10-19-CONTROL: the CTRL group routes on the control words of the template policy, and
    // the kit's LAW.md carries its three rows with the kit's grades (OWNER, HOOK, GATE).
    r = route('open the master control card and list the sessions', 'r-ctrl', root);
    record('route: a control word injects the CTRL group, CTRL-01 at OWNER, CTRL-02 at HOOK and CTRL-03 at GATE (CR-2026-10-19-CONTROL)', 'ctrl', r.code === 0 && /group CTRL/i.test(r.out) && /CTRL-01 \[OWNER\]/i.test(r.out) && /CTRL-02 \[HOOK\]/i.test(r.out) && /CTRL-03 \[GATE\]/i.test(r.out) ? 'ctrl' : 'wrong', r.out);
    r = sub('r1', 'general-purpose');
    record('subagent: gets SAFE plus the session active groups as JSON context', 'safe+active', r.code === 0 && /group SAFE/i.test(r.out) && /group DES/i.test(r.out) && /group OBS/i.test(r.out) && /"hookEventName":"SubagentStart"/i.test(r.out) ? 'safe+active' : 'wrong', r.out);
    r = sub('r-fresh', 'Explore');
    record('subagent: with no routes yet, SAFE alone', 'safe-only', /group SAFE/i.test(r.out) && !/group DES/i.test(r.out) ? 'safe-only' : 'wrong', r.out);
    // advise-by-role (CR-2026-10-13-HONOUR): the ADVISE clauses ride with the role that judges them
    r = sub('r1', 'design-first:reviewer');
    record('subagent: the Reviewer gets the ADVISE clauses with the report instruction', 'advised', /ADVISE clauses/i.test(r.out) && /OWN-06 \(deliver\)/i.test(r.out) && /You are the Reviewer/i.test(r.out) ? 'advised' : 'wrong', r.out);
    // CR-2026-10-19-STACK: STACK-03 rides the advise-by-role block, so the Reviewer answers for it.
    record('subagent: the ADVISE block carries STACK-03 (pick-stack) (CR-2026-10-19-STACK)', 'advised', /ADVISE clauses/i.test(r.out) && /STACK-03 \(pick-stack\)/.test(r.out) ? 'advised' : 'missing', r.out);
    r = sub('r1', 'general-purpose');
    record('subagent: a Builder gets the same clauses, told the Reviewer names them', 'advised', /ADVISE clauses/i.test(r.out) && /GAME-14 \(cite\)/i.test(r.out) && /the Reviewer names each one/i.test(r.out) && !/You are the Reviewer/i.test(r.out) ? 'advised' : 'wrong', r.out);
    // CR-2026-10-17-PATHS: an installed kit sits in the plugin cache, about 66 characters deep. Each
    // full-text line named the kit by full path, so with SAFE, DES, VCS and OBS active the injection
    // passed the cap once the kit path passed 58 characters, and the Reviewer got the ADVISE ids
    // without their text. The same session, the same rows, from a kit copied to a 120-character path.
    const longKit = path.join(T, 'k'.repeat(Math.max(1, 120 - T.length - 1)));
    for (const d of ['hooks', 'templates']) fs.cpSync(path.join(kit, d), path.join(longKit, d), { recursive: true });
    for (const f of ['LAW.md', 'law.json']) fs.copyFileSync(path.join(kit, f), path.join(longKit, f));
    const longPtr = path.join(T, 'pointer-long-kit.json');
    put(longPtr, toJson({ schema: 1, root, brain, pluginRoot: longKit, pluginKind: 'cache' }));
    // The subagent's text arrives inside a JSON reply (newlines escaped, Windows backslashes doubled),
    // so these cases read the parsed text.
    const subText = (res) => { const j = parseOut(res.out); return j && j.hookSpecificOutput ? String(j.hookSpecificOutput.additionalContext || '') : ''; };
    r = withPointerAt(longPtr, () => invokeHook('subagent.mjs', hookJson({ session_id: 'r1', cwd: root, hook_event_name: 'SubagentStart', agent_id: 'a', agent_type: 'design-first:reviewer' }), path.join(longKit, 'hooks')));
    let ctxText = subText(r);
    record(`subagent: a kit at a ${longKit.length}-character path still sends the Reviewer the ADVISE text`, 'advised', /ADVISE clauses, \d+ rules/.test(ctxText) && /You are the Reviewer/.test(ctxText) && /group DES/.test(ctxText) ? 'advised' : 'dropped', r.out);
    record('subagent: the long kit folder is named once in the whole injection', 'once', ctxText.split(longKit).length - 1 === 1 ? 'once' : `${ctxText.split(longKit).length - 1} times`, r.out);
    // CR-2026-10-17-ADVISE-FIRST: the four-group measure above left about 226 characters under the
    // cap, and a usual session routes five (VOICE) or more. The groups were admitted first and the
    // ADVISE block last, so one more group dropped the Reviewer's text. Six active groups here: the
    // block is reserved first, the groups that do not fit beside it are deferred by name, and the
    // Reviewer keeps the text. On the previous hook all six groups went in and the block was dropped.
    put(path.join(process.env.DF_MARKER_DIR, 'r6.routes'), ['SAFE', 'DES', 'VCS', 'OBS', 'VOICE', 'GATE'].join('\n') + '\n');
    r = sub('r6', 'design-first:reviewer');
    ctxText = subText(r);
    record('subagent: six active groups, the Reviewer still gets the ADVISE text', 'advised', /ADVISE clauses, \d+ rules/.test(ctxText) && /You are the Reviewer/.test(ctxText) && /group SAFE/.test(ctxText) && /group DES/.test(ctxText) ? 'advised' : 'dropped', r.out);
    record('subagent: the group that does not fit beside the ADVISE block is deferred by name', 'deferred', /Over the size cap, not injected: [^\n]*GATE/.test(ctxText) && !/group GATE/.test(ctxText) ? 'deferred' : 'not-deferred', r.out);
    record('subagent: the six-group injection stays under the cap', 'under', ctxText.length <= 9500 ? 'under' : `${ctxText.length} chars`, r.out);
    // A brain-owned clause: its file is named under the brain folder, and it opens there.
    const ownBrain = path.join(T, 'brain-owned');
    const lawText = readText(path.join(kit, 'LAW.md')).replace('| `kit:instructions/integrity-law.md` |', '| `brain:prohibitions.md` |');
    put(path.join(ownBrain, 'LAW.md'), lawText);
    put(path.join(ownBrain, 'prohibitions.md'), '# Prohibitions\n');
    const ownPtr = path.join(T, 'pointer-brain-owned.json');
    put(ownPtr, toJson({ schema: 1, root, brain: ownBrain, pluginRoot: kit, pluginKind: 'checkout' }));
    r = withPointerAt(ownPtr, () => sub('r-brain-owned', 'general-purpose'));
    const bt = fullTextFiles(subText(r));
    const bFile = bt.files.find((f) => f.base === 'brain');
    record('subagent: a brain-owned clause names its file under the brain folder, and it opens', 'brain', bt.brain === ownBrain && bFile && bFile.rel === 'prohibitions.md' && exists(bFile.full) && bt.files.some((f) => f.base === 'kit' && exists(f.full)) ? 'brain' : `brain=${bt.brain} files=${JSON.stringify(bt.files)}`, r.out);
    // skills (DES-12): a prompt that shares a word with an installed skill names the skill, once
    const skillDir = jp(root, '.claude', 'skills', 'sandbox-skill');
    put(path.join(skillDir, 'SKILL.md'), '---\nname: sandbox-skill\ndescription: Build a pitchsite for a local business the house way.\n---\nbody\n');
    r = route('make a pitchsite for the cafe', 'r4', root);
    record('route: a prompt sharing a word with a skill names it, with its path', 'named', /design-first skills \(DES-12\)/i.test(r.out) && /sandbox-skill: Build a pitchsite/i.test(r.out) && /SKILL\.md/i.test(r.out) ? 'named' : 'silent', r.out);
    r = route('another pitchsite please', 'r4', root);
    record('route: the same skill is not named twice in a session', 'silent', !/sandbox-skill/i.test(r.out) ? 'silent' : 'again', r.out);
    r = route('the pitches', 'r5', root);
    record('route: a substring (pitches) does not match the skill', 'silent', !/sandbox-skill/i.test(r.out) ? 'silent' : 'matched', r.out);
    const e = entry(root, 'r1', 'compact');
    record('entry: compaction clears the session routes', 'cleared', !exists(r1Routes) ? 'cleared' : 'kept', e.out);
    r = route('commit it', 'r1', root);
    record('route: after compaction the group is injected again', 'vcs-again', /group VCS/i.test(r.out) ? 'vcs-again' : 'silent', r.out);
}

// ------------------------------------------------------------------ 5. stop.mjs + the edit ledger (DES-07, GATE-05/06/07)
section('-- stop.mjs and the edit ledger');
const stop = (session, active) => invokeHook('stop.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'Stop', stop_hook_active: active, last_assistant_message: 'x' }));
const ledger = (session) => path.join(process.env.DF_MARKER_DIR, session + '.edits');
const guardEdit = (session, p) => invokeHook('guard.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: p, content: 'x = 1' } }));
const ledgerText = (session) => readText(ledger(session));
{
    // the guard writes the ledger for an allowed source edit, with the changelog flag on a DECISIONS.md write that carries a row
    const guardEditCall = (p, oldS, newS) => invokeHook('guard.mjs', hookJson({ session_id: 'st-ledger', cwd: repoClean, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: p, old_string: oldS, new_string: newS } }));
    guardEditCall(jp(repoClean, 'src', 'main.py'), 'a', 'b');
    guardEditCall(path.join(repoClean, 'DECISIONS.md'), 'a', '| 2026-10-08 | a row | r |\n');
    guardEditCall(jp(root, 'frozen', 'x.py'), 'a', 'b');
    let led = ledgerText('st-ledger');
    record('ledger: an allowed source edit is recorded', 'recorded', like(led, `*${jp('src', 'main.py')}*`) ? 'recorded' : 'missing', led);
    record('ledger: a DECISIONS.md edit with a Change Log row is flagged', 'flagged', /DECISIONS\.md\tchangelog/i.test(led) ? 'flagged' : 'unflagged', led);
    record('ledger: a denied edit (frozen path) is not recorded', 'absent', !like(led, '*frozen*') ? 'absent' : 'present', led);
    // stop: source changed, docs touched with a changelog row -> block, card names the docs and no GATE-06 line
    let r = stop('st-ledger', false);
    record('stop: source changed this turn -> block with the card', 'block', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
    record('stop: the card names the documents touched', 'named', like(r.out, '*Documents touched: DECISIONS.md*') ? 'named' : 'missing', r.out);
    record('stop: a Change Log row present -> no GATE-06 line', 'quiet', !like(r.out, '*no Change Log row*') ? 'quiet' : 'nagged', r.out);
    r = stop('st-ledger', true);
    record('stop: second attempt (stop_hook_active) -> yields', 'allow', r.code === 0 && blank(r.out) ? 'allow' : 'blocked-again', r.out);
    // stop: source changed, no doc touched -> DES-07 line; DECISIONS edited with no row -> GATE-06 line
    put(ledger('st-nodoc'), jp(repoClean, 'src', 'main.py') + '\t\n');
    r = stop('st-nodoc', false);
    record('stop: no document touched -> DES-07 line', 'des07', classify(r.out) === 'block' && like(r.out, '*Documents touched: none*') ? 'des07' : 'wrong', r.out);
    put(ledger('st-norow'), jp(repoClean, 'src', 'main.py') + '\t\n' + path.join(repoClean, 'DECISIONS.md') + '\t\n');
    r = stop('st-norow', false);
    record('stop: DECISIONS.md edited with no Change Log row -> GATE-06 line', 'gate06', like(r.out, '*no Change Log row*') ? 'gate06' : 'quiet', r.out);
    // stop: GATE-01, a repository born this turn with no question asked this session -> the interview line
    route('yes please', 'st-born', root);          // writes the turn marker, injects nothing
    route('yes please', 'st-born-asked', root);
    sleepMs(50);
    const repoBorn = newRepo('repo-born');
    put(jp(repoBorn, 'src', 'new.py'), 'print(7)');
    put(path.join(repoBorn, 'DECISIONS.md'), '# decisions');
    put(ledger('st-born'), jp(repoBorn, 'src', 'new.py') + '\t\n');
    r = stop('st-born', false);
    record('stop: a repo created this turn, no question asked -> GATE-01 line', 'gate01', classify(r.out) === 'block' && like(r.out, '*GATE-01*') ? 'gate01' : 'quiet', r.out);
    put(path.join(process.env.DF_MARKER_DIR, 'st-born-asked.asked'), '2026-10-13T00:00:00Z');
    put(ledger('st-born-asked'), jp(repoBorn, 'src', 'new.py') + '\t\n');
    r = stop('st-born-asked', false);
    record('stop: the same repo with a question asked this session -> no GATE-01 line', 'quiet', classify(r.out) === 'block' && !like(r.out, '*GATE-01*') ? 'quiet' : 'nagged', r.out);
    record('stop: an old repo (repo-clean) never gets the GATE-01 line', 'quiet', !like(stop('st-nodoc', false).out, '*GATE-01*') ? 'quiet' : 'nagged');
    // ask: an allowed question writes the session's interview marker
    invokeHook('ask.mjs', hookJson({ session_id: 'st-ask-marker', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'q', header: 'h', options: [{ label: 'a (Recommended)', description: 'Gives the thing the case needs; costs nothing worth a word.' }, { label: 'b', description: 'Gives a second path for a different owner; costs one more step.' }], multiSelect: false }] } }));
    record('ask: an allowed question writes the .asked marker', 'written', exists(path.join(process.env.DF_MARKER_DIR, 'st-ask-marker.asked')) ? 'written' : 'missing');
    // stop: docs only, or nothing -> silent
    put(ledger('st-docs'), path.join(repoClean, 'README.md') + '\t\n');
    r = stop('st-docs', false);
    record('stop: only documents changed -> silent', 'allow', blank(r.out) ? 'allow' : 'blocked', r.out);
    r = stop('st-empty', false);
    record('stop: no ledger -> silent', 'allow', blank(r.out) ? 'allow' : 'blocked', r.out);
    // ledger scope: only a path in a git repository, and under the root when the pointer names one, is a
    // code change. The first live card counted the session scratchpad as a repository.
    const repoOut = jp(T, 'outside', 'repo-out');
    fs.mkdirSync(repoOut, { recursive: true });
    runGit(repoOut, ['init', '-q', '-b', 'main']);
    put(path.join(repoOut, 'DECISIONS.md'), '# decisions');
    const scratch = jp(T, 'outside', 'scratch.py');
    guardEdit('sc-norepo', jp(root, 'ordinary', 'new.py'));
    record('ledger scope: under the root, in no repository -> not recorded', 'absent', blank(ledgerText('sc-norepo')) ? 'absent' : 'present', ledgerText('sc-norepo'));
    guardEdit('sc-scratch', scratch);
    record('ledger scope: outside the root, in no repository -> not recorded', 'absent', blank(ledgerText('sc-scratch')) ? 'absent' : 'present', ledgerText('sc-scratch'));
    guardEdit('sc-repoout', path.join(repoOut, 'a.py'));
    record('ledger scope: a repository outside the root -> not recorded', 'absent', blank(ledgerText('sc-repoout')) ? 'absent' : 'present', ledgerText('sc-repoout'));
    withoutPointer(() => { guardEdit('sc-noptr', path.join(repoOut, 'a.py')); guardEdit('sc-noptr', scratch); });
    led = ledgerText('sc-noptr');
    record('ledger scope: no pointer, a repository edit is recorded, a loose file is not', 'repo-only', like(led, `*${jp('repo-out', 'a.py')}*`) && !like(led, '*scratch.py*') ? 'repo-only' : 'wrong', led);
    // a ledger written before the fix (or by hand) is filtered by the Stop hook as well
    put(ledger('sc-old'), scratch + '\t\n');
    r = stop('sc-old', false);
    record('stop: only an out-of-scope path in the ledger -> silent', 'allow', r.code === 0 && blank(r.out) ? 'allow' : 'blocked', r.out);
    put(ledger('sc-mixed'), scratch + '\t\n' + path.join(repoOut, 'a.py') + '\t\n' + jp(repoClean, 'src', 'main.py') + '\t\n');
    r = stop('sc-mixed', false);
    record('stop: in-scope and out-of-scope source -> the card counts the repository only', 'one-repo', classify(r.out) === 'block' && like(r.out, '*repo-clean: 1 source file*') && !like(r.out, '*outside*') ? 'one-repo' : 'wrong', r.out);
    // a new prompt clears the ledger
    route('yes', 'st-ledger', root);
    record('route: a new prompt clears the edit ledger', 'cleared', !exists(ledger('st-ledger')) ? 'cleared' : 'kept');
}

// ------------------------------------------------------------------ 6 onwards: cases split by domain (DES-03)
// 6: the commit-msg check (VCS-23). 7: the state card (GAME-13). 8: the Stop card reading the turn's
// changes from git. Then OWN, the read check, LOOPS.md, the bypasses, the gate, the truth cases, the
// grades, the card's wording, the head of a git call (case 49) and the running kit root (case 50,
// which moves the pointer and puts it back, so it runs last). Each file uses the fixtures and
// helpers above.
const ctx = {
    T, TFWD, TMSYS, kit, hooks, root, brain, IS_WIN, NO_POINTER,
    repoPlain, repoIgnored, repoClean, repoNoManifest, repoGated, repoGatedOk, repoGatedBad, repoGatedOpen, repoLoop, repoTracked,
    record, section, say, like, clike, blank, rxEscape, jp, readText, exists, sleepMs, setOld, toJson,
    gitTry, runGit, gitOut, put, newRepo, invokeHook, hookJson, parseOut, classify, expand, withoutPointer, writePointer, fullTextFiles,
    entry, route, sub, stop, ledger, guardEdit, ledgerText,
};
for (const f of ['cases-law-claim.mjs', 'cases-state-card.mjs', 'cases-stop-git.mjs', 'cases-own.mjs', 'cases-writer.mjs', 'cases-size.mjs', 'cases-loops.mjs',
    'cases-bypass.mjs', 'cases-gate.mjs', 'cases-truth.mjs', 'cases-grades.mjs', 'cases-wording.mjs', 'cases-gitcall.mjs', 'cases-publish.mjs', 'cases-kitroot.mjs']) {
    const mod = await import(pathToFileURL(path.join(here, f)).href);
    try { await mod.default(ctx); }
    catch (e) { record(`${f}: ran to the end`, 'ran', `threw: ${e && e.message ? e.message : e}`, e && e.stack ? e.stack : ''); }
}

// ------------------------------------------------------------------ summary
const passed = results.filter((x) => x.pass).length;
const failed = results.length - passed;
say();
say(`  ${passed} passed, ${failed} failed, ${results.length} total`, failed === 0 ? 32 : 31);
say();
if (failed === 0 && !opts.KeepTemp) { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* best effort */ } }
else say(`  fixtures kept at ${T}`);
process.exitCode = failed > 0 ? 1 : 0;
