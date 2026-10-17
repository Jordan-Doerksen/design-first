// util.mjs - what the Doctor's parts share: git, a process runner, a PATH lookup, directory walks.
// Imported by the Doctor's files. Never run directly. READ-ONLY.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { IS_WIN } from '../../hooks/lib/common.mjs';

// git's stdout as lines; stderr dropped ("not a git repository", "no upstream" are answers). A git
// that cannot start returns no lines, as the PowerShell kit's reader did.
export function gitLines(dir, args) {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
    if (r.error || r.stdout == null) return [];
    return r.stdout === '' ? [] : r.stdout.replace(/\r?\n$/, '').split(/\r?\n/);
}
export function gitRun(dir, args) {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
    const out = r.stdout ? r.stdout.replace(/\r?\n$/, '').split(/\r?\n/) : [];
    return { code: r.error ? -1 : r.status, out: r.stdout === '' ? [] : out };
}
// The same, without waiting: the repository sweep reads several repositories at once.
export function gitLinesAsync(dir, args) {
    return new Promise((resolve) => {
        let out = '';
        let p;
        try { p = spawn('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); } catch { resolve([]); return; }
        p.stdout.setEncoding('utf8');
        p.stdout.on('data', (d) => { out += d; });
        p.on('error', () => resolve([]));
        p.on('close', () => resolve(out === '' ? [] : out.replace(/\r?\n$/, '').split(/\r?\n/)));
    });
}

// An executable on PATH, as the shell finds it (PATHEXT on Windows), or null.
export function which(exe) {
    if (!exe) return null;
    const exts = IS_WIN ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter((x) => x)] : [''];
    const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
    if (/[\\/]/.test(exe)) {
        for (const e of exts) if (isFile(exe + e)) return exe + e;
        return null;
    }
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        if (!dir) continue;
        for (const e of exts) { const p = path.join(dir, exe + e); if (isFile(p)) return p; }
    }
    return null;
}

// Runs a program with arguments, stdin text, a timeout in seconds and a working folder. Returns
// { exit, stdout, stderr, timedOut, started, error }. Never throws.
export function runProcess(exe, args, { stdin = '', timeoutSeconds = 60, cwd, env } = {}) {
    const r = { exit: -1, stdout: '', stderr: '', timedOut: false, started: false, error: '' };
    // A .cmd or .bat shim on Windows runs through the command interpreter.
    const viaShell = IS_WIN && /\.(cmd|bat)$/i.test(exe);
    const res = spawnSync(exe, args, {
        input: stdin, encoding: 'utf8', timeout: timeoutSeconds * 1000, killSignal: 'SIGKILL', windowsHide: true,
        cwd: cwd && fs.existsSync(cwd) ? cwd : undefined, env: { ...process.env, ...(env || {}) }, shell: viaShell, maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error && res.error.code === 'ETIMEDOUT') { r.started = true; r.timedOut = true; r.stdout = res.stdout || ''; r.stderr = res.stderr || ''; return r; }
    if (res.error) { r.error = `could not start '${exe}': ${res.error.message}`; return r; }
    r.started = true;
    r.stdout = res.stdout || ''; r.stderr = res.stderr || '';
    r.exit = res.status == null ? -1 : res.status;
    return r;
}

// A script run the way its kind runs: a .mjs, .cjs or .js file with this Node, a .ps1 with pwsh,
// anything else as an executable. Returns [exe, ...args] or null with a reason.
export function scriptCommand(script) {
    if (/\.(mjs|cjs|js)$/i.test(script)) return { cmd: [process.execPath, script] };
    if (/\.ps1$/i.test(script)) {
        const pwsh = which('pwsh');
        if (!pwsh) return { error: 'pwsh (PowerShell 7) is not on PATH, so this .ps1 script cannot run' };
        return { cmd: [pwsh, '-NoProfile', '-NonInteractive', '-File', script] };
    }
    return { cmd: [script] };
}

export const byName = (a, b) => {
    const x = a.toLowerCase(); const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
};

// Entries of a folder, sorted by name, without following links to folders. Never throws.
export function listDir(dir) {
    try { return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => byName(a.name, b.name)); } catch { return []; }
}

// Every file under root, skipping .git folders, as full paths in a stable order. Never throws.
export function walkFiles(root, skipDir = (name) => name.toLowerCase() === '.git') {
    const out = [];
    const stack = [root];
    while (stack.length) {
        const d = stack.shift();
        const subdirs = [];
        for (const e of listDir(d)) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (!skipDir(e.name)) subdirs.push(full); }
            else if (e.isFile()) out.push(full);
        }
        stack.unshift(...subdirs);
    }
    return out;
}

// Round half to even, as a cast to an integer does in .NET, so a printed age reads as before.
export function roundEven(x) {
    const f = Math.floor(x); const d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
}

// The date of a repository's first commit in milliseconds, or null, once per run per repository.
const firstCommitCache = new Map();
export function firstCommitDate(repo) {
    if (firstCommitCache.has(repo)) return firstCommitCache.get(repo);
    let v = null;
    const roots = gitLines(repo, ['rev-list', '--max-parents=0', 'HEAD']);
    if (roots.length) {
        const iso = (gitLines(repo, ['show', '-s', '--format=%cI', roots[roots.length - 1].trim()])[0] || '').trim();
        const t = Date.parse(iso);
        v = Number.isNaN(t) ? null : t;
    }
    firstCommitCache.set(repo, v);
    return v;
}

// A hooks.json `command` string as words: double and single quotes group, backslash is NOT an
// escape (Windows paths). Enough for `node "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"`.
export function splitCommandLine(line) {
    const tokens = []; let cur = ''; let q = ''; let has = false;
    for (const ch of String(line)) {
        if (q) { if (ch === q) q = ''; else cur += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
        if (/\s/.test(ch)) { if (has || cur) { tokens.push(cur); cur = ''; has = false; } continue; }
        cur += ch;
    }
    if (has || cur) tokens.push(cur);
    return tokens;
}
export const SCRIPT_EXT_RX = /\.(mjs|cjs|js|ps1|sh|py)$/i;

export const DAY = 86400000;
export function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
