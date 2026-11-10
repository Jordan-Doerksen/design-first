// kit-version.mjs - the kit's version and tree sha, computed one way everywhere (0.3.0, KIT-01).
// tools/vendor.mjs writes .claude/kit/VERSION with it, hooks/entry.mjs prints it as the arming
// line, tools/selfcheck.mjs names it in the deny reason, and the Doctor's tree_sha claim checks
// it. Never run directly.
//
//   treeSha(root, files)   sha256 over the listed files in sorted order: for each file, the
//                          forward-slash relative path, a newline, the bytes with CRLF mapped to
//                          LF, then a NUL. A missing file throws; nothing is skipped in silence.
//   manifestFiles(root, manifest)  the sorted relative paths a manifest names: 'include' entries
//                          are files or folders (a folder is walked); 'optional' entries are taken
//                          when present; 'exclude' entries are exact paths, folder prefixes ending
//                          in '/', or '*.<ext>' suffixes. An 'include' entry that does not exist
//                          throws, so a manifest never vendors less than it says.
//   kitVersion(root)       { version, sha, source, files }: source 'VERSION' when <root>/VERSION
//                          exists (a vendored copy), 'tree' when <root>/.claude-plugin/plugin.json
//                          and <root>/tools/vendor.json exist (a checkout or a plugin install),
//                          'none' when the root has neither, with why naming what it lacks (no kit
//                          root, no VERSION and no plugin.json, or a plugin.json with no manifest
//                          beside it). A VERSION that exists and is not the
//                          { version, sha256, files } shape throws, naming it: a broken copy is never
//                          read as no copy. The sha is VERSION's as written (a reader that must
//                          know the bytes still match recomputes treeSha over files); the arming
//                          line shows shortSha(sha), its first 12 characters.
//   readVersionFile(p)     parses a VERSION file: { version, sha256, files, at } or null.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SEP = /[\\/]+/g;

export function toRel(p) { return String(p).replace(SEP, '/').replace(/^\/+/, ''); }

export function shortSha(sha) { return String(sha || '').slice(0, 12); }

function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function walk(root, rel, out) {
    const full = path.join(root, rel);
    const names = fs.readdirSync(full).sort();
    for (const name of names) {
        const r = rel ? `${rel}/${name}` : name;
        const f = path.join(root, r);
        if (isDir(f)) walk(root, r, out);
        else if (isFile(f)) out.push(r);
    }
}

function excluded(rel, excludes) {
    for (const e of excludes) {
        const x = toRel(e);
        if (x.startsWith('*.')) { if (rel.endsWith(x.slice(1))) return true; continue; }
        if (x.endsWith('/')) { if (rel.startsWith(x)) return true; continue; }
        if (rel === x) return true;
    }
    return false;
}

// Code-point order, the same on every host (localeCompare is not).
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export function manifestFiles(root, manifest) {
    const include = Array.isArray(manifest && manifest.include) ? manifest.include : [];
    const optional = Array.isArray(manifest && manifest.optional) ? manifest.optional : [];
    const exclude = Array.isArray(manifest && manifest.exclude) ? manifest.exclude : [];
    const found = new Set();
    const take = (entry, mustExist) => {
        const rel = toRel(entry).replace(/\/+$/, '');
        const full = path.join(root, rel);
        if (isDir(full)) { const out = []; walk(root, rel, out); for (const r of out) found.add(r); return; }
        if (isFile(full)) { found.add(rel); return; }
        if (mustExist) throw new Error(`manifest entry not found: ${rel}`);
    };
    for (const e of include) take(e, true);
    for (const e of optional) take(e, false);
    return [...found].filter((r) => !excluded(r, exclude)).sort(cmp);
}

export function treeSha(root, files) {
    const h = crypto.createHash('sha256');
    for (const rel of [...files].map(toRel).sort(cmp)) {
        const full = path.join(root, rel);
        if (!isFile(full)) throw new Error(`tree file missing: ${rel}`);
        const text = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
        h.update(rel, 'utf8');
        h.update('\n', 'utf8');
        h.update(text, 'utf8');
        h.update('\0', 'utf8');
    }
    return h.digest('hex');
}

export function readVersionFile(p) {
    if (!isFile(p)) return null;
    let j;
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
    if (!j || typeof j !== 'object') return null;
    const files = Array.isArray(j.files) ? j.files.map(String) : null;
    const version = j.version == null ? '' : String(j.version);
    const sha256 = j.sha256 == null ? '' : String(j.sha256);
    if (!files || !version || !/^[0-9a-f]{64}$/.test(sha256)) return null;
    return { version, sha256, files, at: j.at == null ? '' : String(j.at) };
}

export function readManifest(root) {
    const p = path.join(root, 'tools', 'vendor.json');
    if (!isFile(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function kitVersion(root) {
    const none = (why) => ({ version: '', sha: '', source: 'none', files: [], why });
    if (!root) return none('no kit root');
    const versionPath = path.join(root, 'VERSION');
    const v = readVersionFile(versionPath);
    if (v) return { version: v.version, sha: v.sha256, source: 'VERSION', files: v.files };
    if (isFile(versionPath)) throw new Error(`${versionPath} is not the {version, sha256, files} shape`);
    const pluginJson = path.join(root, '.claude-plugin', 'plugin.json');
    const manifest = readManifest(root);
    if (isFile(pluginJson) && manifest) {
        let version = '';
        try { version = String(JSON.parse(fs.readFileSync(pluginJson, 'utf8')).version || ''); } catch { version = ''; }
        const files = manifestFiles(root, manifest);
        return { version, sha: treeSha(root, files), source: 'tree', files };
    }
    return none(isFile(pluginJson) ? 'no VERSION and no tools/vendor.json beside .claude-plugin/plugin.json' : 'no VERSION and no .claude-plugin/plugin.json');
}
