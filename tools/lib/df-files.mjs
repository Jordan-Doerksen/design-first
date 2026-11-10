// df-files.mjs - file helpers shared by tools/adopt.mjs, tools/remove.mjs and tools/tests/adopt-selftest.mjs.
// Imported; never run directly.
//
// Bytes rule (SPEC 5.1, 5.6, F9): everything written is UTF-8 without BOM. Text is LF, except
// .bat / .cmd which are CRLF. The sha256 recorded in installed.json is taken over the bytes AFTER
// mapping CRLF to LF, so a checkout whose autocrlf rewrote line endings does not make a kit-written
// file look hand-edited (finding 77).
//
// Test seams (env vars only, SPEC 5.4 style):
//   DF_POINTER_PATH   where the pointer lives     (default ~/.claude/design-first.json)
//   DF_MARKER_DIR     once-per-session markers    (default <os temp>/design-first)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getPointerPath, getMarkerDir, toFullPath } from '../../hooks/lib/common.mjs';
import { parseJson } from '../../hooks/lib/json.mjs';

export { getPointerPath as pointerFile, getMarkerDir as markerFolder };

export function fullPath(p) { return toFullPath(path.resolve(p)) || path.resolve(p); }

// Same test as hooks/entry.mjs: under a plugins/cache folder = cache, anything else = checkout.
export function pluginKind(root) { return /[\\/]plugins[\\/]cache([\\/]|$)/i.test(root) ? 'cache' : 'checkout'; }

// ---------------------------------------------------------------- text, line endings, bytes

const crlfExtension = (p) => ['.ps1', '.bat', '.cmd'].includes(path.extname(p).toLowerCase());
export function toEol(text, p) {
    const t = String(text).replace(/\r\n/g, '\n');
    return crlfExtension(p) ? t.replace(/\n/g, '\r\n') : t;
}
export function textBytes(text, p) { return Buffer.from(toEol(text, p), 'utf8'); }
export function readText(p) { let t = fs.readFileSync(p, 'utf8'); if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); return t; }
export function readJson(p) { return parseJson(readText(p)); }
export function writeBytes(p, bytes) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, bytes);
    // A shell shim must run as a program on Linux and macOS.
    if (/\.sh$/i.test(p) && process.platform !== 'win32') { try { fs.chmodSync(p, 0o755); } catch { /* best effort */ } }
}

// Drop every CR that is immediately followed by LF, then SHA-256, lowercase hex.
export function normalisedSha256(bytes) {
    const out = Buffer.alloc(bytes.length);
    let n = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 13 && i + 1 < bytes.length && bytes[i + 1] === 10) continue;
        out[n++] = bytes[i];
    }
    return crypto.createHash('sha256').update(out.subarray(0, n)).digest('hex');
}
export function fileSha256(p) { return normalisedSha256(fs.readFileSync(p)); }

// ---------------------------------------------------------------- installed.json (SPEC 5.6, finding 77)

export function installedRecord(p, bytes, generated) { return { path: p, sha256: normalisedSha256(bytes), generated: Boolean(generated) }; }

export function readInstalled(p) {
    if (!fs.existsSync(p)) return [];
    const j = readJson(p);
    if (j == null || !Array.isArray(j.files)) return [];
    return j.files.map((f) => ({ path: String(f.path), sha256: String(f.sha256), generated: Boolean(f.generated) }));
}

// The vendored kit (0.3.0): tools/vendor.mjs -Record writes { path: '.claude/kit/<rel>', sha256 } rows,
// relative to the folder it vendored into, under the same file's `vendored` key. remove.mjs resolves
// them against the pointer's root and brain.
export function readVendored(p) {
    if (!fs.existsSync(p)) return [];
    const j = readJson(p);
    if (j == null || !Array.isArray(j.vendored)) return [];
    return j.vendored.filter((r) => r != null && r.path != null).map((r) => ({ path: String(r.path), sha256: String(r.sha256 ?? '') }));
}

// Merged by path, without case: a path written this run replaces its old record; every other
// existing record is kept as it was.
export function mergeInstalled(existing, written) {
    const map = new Map();
    for (const e of existing) if (e) map.set(String(e.path).toLowerCase(), e);
    for (const w of written) if (w) map.set(String(w.path).toLowerCase(), w);
    return [...map.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Rewrites schema, _comment and files. Every other top-level key of the file on disk is kept as it
// is: vendor.mjs -Record keeps its vendored rows here (0.3.0), and a rewrite that dropped them would
// leave remove.mjs blind to the vendored kit on the second adopt.
export function writeInstalled(p, records) {
    let onDisk = {};
    if (fs.existsSync(p)) {
        try { const j = readJson(p); if (j != null && typeof j === 'object' && !Array.isArray(j)) onDisk = j; } catch { /* unreadable: rewritten from the records */ }
    }
    const doc = {
        schema: 1,
        _comment: 'Every file adopt.mjs wrote, with sha256 over CRLF->LF-mapped bytes, under files; every file tools/vendor.mjs copied into .claude/kit/ as { path, sha256 } rows relative to the adopted folder, under vendored. remove.mjs deletes a file only when its hash still matches, or when generated is true (regenerable). Written by adopt.mjs and vendor.mjs; merged by path on every run.',
        files: records,
    };
    for (const [k, v] of Object.entries(onDisk)) if (!(k in doc)) doc[k] = v;
    writeBytes(p, textBytes(JSON.stringify(doc, null, 2) + '\n', p));
}

// ---------------------------------------------------------------- diffs (attach mode, finding 37)

// Unified diff: what the writer would have written -> the existing file, so a `+` line is something
// the owner has that the template lacks (their edit), and a `-` line is template text they removed.
// Nothing is changed. git diff --no-index when git is on PATH; a plain line diff otherwise. Line
// endings are ignored because the hash rule treats CRLF and LF as the same bytes. `who` names the
// writer in the header line: adopt (the default) or control. The proposed text goes into a temp folder
// of this call's own (fs.mkdtempSync), removed after, also on a throw: the fixed
// <os temp>/design-first-adopt it used before let two runs at once read each other's text, and a file
// at that name stopped every run that printed a diff. A folder that cannot be removed is named.
export function showDiff(existing, proposed, label, who = 'adopt') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-first-diff-'));
    const lines = [`  --- diff ${label}  (what ${who} would write -> what is on disk; + is yours; the file was NOT changed)`];
    try {
        const tmp = path.join(tmpDir, 'proposed-' + path.basename(existing));
        fs.writeFileSync(tmp, proposed);
        const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--ignore-cr-at-eol', '--', tmp, existing], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        if (!r.error) {
            // The four git header lines name the temp file; they carry nothing the reader needs.
            for (const l of (r.stdout || '').replace(/\n$/, '').split('\n')) if (l !== '' && !/^(diff --git |index |--- |\+\+\+ )/.test(l)) lines.push('      ' + l);
        } else {
            const a = proposed.toString('utf8').replace(/\r\n/g, '\n').split('\n');
            const b = readText(existing).replace(/\r\n/g, '\n').split('\n');
            for (const l of a) if (!b.includes(l)) lines.push('      -' + l);
            for (const l of b) if (!a.includes(l)) lines.push('      +' + l);
        }
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { lines.push(`      (the temp folder ${tmpDir} could not be removed: ${e.message})`); }
    }
    return lines;
}

// ---------------------------------------------------------------- git

// Returns { code, out }. stderr is dropped: exit codes 1 and 128 are answers here.
export function git(dir, args) {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    if (r.error) return { code: -1, out: [], missing: r.error.code === 'ENOENT' };
    return { code: r.status, out: (r.stdout || '').replace(/\r?\n$/, '').split(/\r?\n/).filter((l) => l !== '') };
}
export function hasGit() { return !spawnSync('git', ['--version'], { stdio: 'ignore', windowsHide: true }).error; }
export function isGitWorkTree(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    const r = git(dir, ['rev-parse', '--is-inside-work-tree']);
    return r.code === 0 && r.out.join('').includes('true');
}
