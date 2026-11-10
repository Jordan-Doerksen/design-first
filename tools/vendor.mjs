// vendor.mjs - copies the kit's manifest (tools/vendor.json) into a repository's .claude/kit/ and writes the VERSION that names the bytes (0.3.0, KIT-01).
//
//   node tools/vendor.mjs -Target <repo root> [-Kit <kit root>] [-Manifest <path>] [-Record <installed.json>] [-DryRun]
//   node tools/vendor.mjs -Target <repo root> -Check
//
// Four rules, in this order:
//   1. vendor-copy     every file manifestFiles(kit, manifest) names (hooks/lib/kit-version.mjs) is
//                      copied to <target>/.claude/kit/<rel> byte for byte, folders made on the way;
//                      a file whose bytes already match is left alone, its mtime included. One line
//                      per file written. An include entry that does not exist REFUSES the run before
//                      anything is written: a manifest never vendors less than it says, because a
//                      short copy fails open (hooks/agent.mjs allows every call when it finds no
//                      policy; hooks/lib/law-rows.mjs takes a copy as the kit only with law.json).
//   2. vendor-version  <target>/.claude/kit/VERSION = { version, sha256, files, at }: the kit's
//                      plugin.json version, treeSha over the listed files computed on the TARGET
//                      copy, the sorted relative paths, the time. It is rewritten only when version,
//                      sha256 or files differ from what is there, so a second run writes nothing
//                      and 'at' names the last change.
//   3. vendor-check    -Check reads VERSION (exit 2 'vendor: VERSION missing' when absent or
//                      unparseable, 'vendor: VERSION names no file; nothing to prove' when its files
//                      list is empty), names a listed file that is gone (exit 1), recomputes the sha
//                      (exit 1 on a difference, naming the listed files whose mtime is newer than
//                      VERSION, or 'no file named' when none is or when more than half are, as when
//                      a checkout or a copy wrote them after VERSION), else exit 0 'vendor: ok'.
//   4. vendor-record   -Record <installed.json> merges one row { path: '.claude/kit/<rel>', sha256 }
//                      per vendored file into that file's 'vendored' list, by path, the sha taken the
//                      way adopt records files (over CRLF->LF bytes, tools/lib/df-files.mjs); every
//                      other key of the file is kept as it is; nothing is written when the rows
//                      are already there. The file is read and checked BEFORE the first write: one
//                      that is there and is not a JSON object refuses the run with nothing copied.
//                      A record that still cannot be written after the copy is exit 2, and the
//                      line says the copy and VERSION were written and the record was not.
// Exit 0 done or ok, 1 refused or the tree differs, 2 could not look (no target, no manifest or
// one that is not JSON, no VERSION or one that lists no file, a record not written after the copy,
// an internal error). -DryRun prints every line and writes nothing. Nothing is deleted: a
// file in the copy that the manifest no longer names stays until remove.mjs takes it by its record.
//
// What this tool cannot see: whether the host loads the copied hooks (the arming line and the
// selfcheck prove that, KIT-02), and which of two copies decided a call (the yield rule in
// hooks/lib/common.mjs). A file edited and given an older mtime is still exit 1, but unnamed; so is
// an edit in a copy whose listed files are mostly newer than VERSION (a clone, or a copy).
//
// anchor: vendor-sha  mode: gate  verbs: vendor

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import { fileSha256 } from './lib/df-files.mjs';
import { treeSha, manifestFiles, readManifest, readVersionFile, shortSha, toRel } from '../hooks/lib/kit-version.mjs';

const KIT_FROM_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: node tools/vendor.mjs -Target <repo root> [-Kit <kit root>] [-Manifest <path>] [-Record <installed.json>] [-DryRun] | -Check';
const say = (s = '') => process.stdout.write(s + '\n');

// A stop with its exit code: 1 refused (the kit or the copy is wrong), 2 could not look.
class Stop extends Error { constructor(msg, code) { super(msg); this.code = code; } }
const refuse = (msg) => new Stop(msg, 1);
const couldNotLook = (msg) => new Stop(msg, 2);

function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
const toJsonText = (o) => JSON.stringify(o, null, 2) + '\n';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The version the copy carries: the kit's plugin.json, or the VERSION of a copy used as the source.
function kitVersionString(kit) {
    const pluginJson = path.join(kit, '.claude-plugin', 'plugin.json');
    if (isFile(pluginJson)) {
        let v;
        try { v = JSON.parse(fs.readFileSync(pluginJson, 'utf8')).version; } catch (e) { throw couldNotLook(`plugin.json unreadable: ${pluginJson}: ${e.message}`); }
        if (v != null && String(v) !== '') return String(v);
        throw couldNotLook(`plugin.json names no version: ${pluginJson}`);
    }
    const v = readVersionFile(path.join(kit, 'VERSION'));
    if (v) return v.version;
    throw couldNotLook(`kit version unknown: no .claude-plugin/plugin.json and no VERSION under ${kit}`);
}

// The manifest: -Manifest <path> when given, else <kit>/tools/vendor.json through readManifest. One that
// is missing or is not JSON could not be read (exit 2); one that reads but names a wrong entry is refused.
function loadManifest(kit, manifestPath) {
    const p = manifestPath ? path.resolve(manifestPath) : path.join(kit, 'tools', 'vendor.json');
    let m;
    if (manifestPath) {
        if (!isFile(p)) throw couldNotLook(`manifest missing: ${p}`);
        try { m = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw couldNotLook(`manifest unreadable: ${p}: ${e.message}`); }
    } else {
        try { m = readManifest(kit); } catch (e) { throw couldNotLook(`manifest unreadable: ${p}: ${e.message}`); }
        if (m == null) throw couldNotLook(`manifest missing: ${p} (-Kit must name a checkout of the kit, or pass -Manifest)`);
    }
    if (!m || typeof m !== 'object' || !Array.isArray(m.include) || m.include.length === 0) throw refuse(`manifest has no include list: ${p}`);
    return { manifest: m, path: p };
}

// ---------------------------------------------------------------- -Check

function check(target) {
    if (!isDir(target)) { say(`vendor: VERSION missing: target is not a folder: ${target}`); return 2; }
    const kitDir = path.join(target, '.claude', 'kit');
    const versionPath = path.join(kitDir, 'VERSION');
    if (!isFile(versionPath)) { say(`vendor: VERSION missing: ${versionPath}`); return 2; }
    const v = readVersionFile(versionPath);
    if (!v) { say(`vendor: VERSION missing (unparseable, or without version, sha256 and files): ${versionPath}`); return 2; }
    // An empty list hashes to the sha of nothing and would always match: nothing to compare is not a pass.
    if (v.files.length === 0) { say(`vendor: VERSION names no file; nothing to prove: ${versionPath}`); return 2; }
    const label = `${v.version} ${shortSha(v.sha256)}`;
    const files = v.files.map(toRel);
    const gone = files.filter((f) => !isFile(path.join(kitDir, f)));
    if (gone.length > 0) { say(`vendor: tree differs from VERSION ${label}: missing ${gone.join(', ')}`); return 1; }
    const sha = treeSha(kitDir, files);
    if (sha === v.sha256) { say(`vendor: ok ${label}`); return 0; }
    // No per-file sha is kept, so the file is named by its mtime: a listed file written after VERSION.
    // A git checkout writes most listed files after VERSION (a copy may too), and then their times single
    // out nothing: when more than half are newer, no file is named and the line says how many (SAFE-04).
    const vTime = fs.statSync(versionPath).mtimeMs;
    const newer = files.filter((f) => fs.statSync(path.join(kitDir, f)).mtimeMs > vTime);
    if (newer.length * 2 > files.length) say(`vendor: tree differs from VERSION ${label} (no file named: ${newer.length} of ${files.length} listed files are newer than VERSION, as after a checkout or a copy; git diff, or vendor -DryRun from the kit, can find the change)`);
    else if (newer.length > 0) say(`vendor: tree differs from VERSION ${label}: newer than VERSION: ${newer.join(', ')}`);
    else say(`vendor: tree differs from VERSION ${label} (no file named: no listed file is newer than VERSION)`);
    return 1;
}

// ---------------------------------------------------------------- -Record

// The record file, read and checked before anything is written (review finding 9): absent is a new
// record; there, it must be a file holding a JSON object, or the run is refused with nothing copied,
// so a copy is never left on disk that no record names (remove.mjs takes a copy only by its record).
function readRecord(recordPath) {
    if (!fs.existsSync(recordPath)) return null;
    if (!isFile(recordPath)) throw refuse(`record file is not a file: ${recordPath}; nothing written`);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(recordPath, 'utf8')); } catch (e) { throw refuse(`record file unreadable: ${recordPath}: ${e.message}; nothing written`); }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw refuse(`record file is not a JSON object: ${recordPath}; nothing written`);
    return doc;
}

function recordVendored(recordPath, existing, kitDir, files) {
    const doc = existing || { schema: 1, _comment: 'Every file tools/vendor.mjs copied into .claude/kit/, as vendored rows { path, sha256 } with sha256 over CRLF->LF-mapped bytes, the way adopt.mjs records what it wrote under files. remove.mjs deletes a vendored file only when its hash still matches. Merged by path on every run.' };
    const rows = new Map();
    for (const r of Array.isArray(doc.vendored) ? doc.vendored : []) {
        if (r && r.path != null) rows.set(String(r.path).toLowerCase(), { path: String(r.path), sha256: r.sha256 == null ? '' : String(r.sha256) });
    }
    for (const rel of files) {
        const p = `.claude/kit/${rel}`;
        rows.set(p.toLowerCase(), { path: p, sha256: fileSha256(path.join(kitDir, rel)) });
    }
    doc.vendored = [...rows.values()].sort((a, b) => cmp(a.path, b.path));
    const text = toJsonText(doc);
    if (isFile(recordPath) && fs.readFileSync(recordPath, 'utf8') === text) { say(`  recorded  ${doc.vendored.length} vendored row(s) already in ${recordPath}`); return; }
    fs.mkdirSync(path.dirname(recordPath), { recursive: true });
    fs.writeFileSync(recordPath, text);
    say(`  recorded  ${doc.vendored.length} vendored row(s) in ${recordPath}`);
}

// ---------------------------------------------------------------- the copy and VERSION

function vendor(opts) {
    const kit = path.resolve(opts.Kit || KIT_FROM_HERE);
    const target = path.resolve(opts.Target);
    if (!isDir(target)) throw couldNotLook(`target is not a folder: ${target}`);
    const { manifest, path: manifestPath } = loadManifest(kit, opts.Manifest);
    let files;
    try { files = manifestFiles(kit, manifest); } catch (e) { throw refuse(`${e.message} (manifest ${manifestPath}, kit ${kit})`); }
    if (files.length === 0) throw refuse(`manifest names no file: ${manifestPath}`);
    const version = kitVersionString(kit);
    const recordPath = opts.Record ? path.resolve(opts.Record) : '';
    const recordDoc = recordPath ? readRecord(recordPath) : null;   // checked before the first write, on a dry run too
    const kitDir = path.join(target, '.claude', 'kit');
    const versionPath = path.join(kitDir, 'VERSION');
    const dry = Boolean(opts.DryRun);
    const verb = (had) => (dry ? 'would write' : had ? 'updated    ' : 'wrote      ');
    say(`vendor: ${kit} (${version}) -> ${kitDir}${dry ? '  [DRY RUN: nothing is written]' : ''}`);

    // 1. the files, byte for byte; an identical file is not touched
    let changed = 0;
    for (const rel of files) {
        const src = path.join(kit, rel);
        const dst = path.join(kitDir, rel);
        const bytes = fs.readFileSync(src);
        const had = isFile(dst);
        if (had && fs.readFileSync(dst).equals(bytes)) continue;
        changed++;
        say(`  ${verb(had)} .claude/kit/${rel}`);
        if (!dry) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, bytes); }
    }

    // 2. VERSION, over the target copy (over the kit on a dry run: the same bytes would land)
    const sha = treeSha(dry ? kit : kitDir, files);
    const existing = readVersionFile(versionPath);
    const same = existing !== null && existing.version === version && existing.sha256 === sha && existing.files.join('\n') === files.join('\n');
    let wroteVersion = false;
    if (!same) {
        wroteVersion = true;
        say(`  ${verb(existing !== null || isFile(versionPath))} .claude/kit/VERSION`);
        if (!dry) fs.writeFileSync(versionPath, toJsonText({ version, sha256: sha, files, at: new Date().toISOString() }));
    }
    if (changed === 0 && !wroteVersion) say('vendored: unchanged');
    else if (dry) say(`vendor: dry run, ${changed} file(s)${wroteVersion ? ' and VERSION' : ''} would be written; nothing written`);
    else say(`vendored ${files.length} files, sha ${shortSha(sha)}`);

    // 4. the record, after a real run only. It was read and checked above; a write that still fails
    // leaves the copy on disk with no record, which is said, never folded into a generic error.
    if (recordPath && !dry) {
        try { recordVendored(recordPath, recordDoc, kitDir, files); }
        catch (e) {
            const placed = wroteVersion ? 'the copy and VERSION were written' : changed > 0 ? 'the copy was written and VERSION already named it' : 'the copy and VERSION were already in place';
            throw couldNotLook(`${placed}; the record was not: ${recordPath}: ${e && e.message ? e.message : e}`);
        }
    }
    return 0;
}

// ---------------------------------------------------------------- main

let code = 0;
try {
    let opts;
    try { opts = parseArgs(process.argv.slice(2), { values: ['Target', 'Kit', 'Manifest', 'Record'], switches: ['DryRun', 'Check'] }); }
    catch (e) { throw couldNotLook(`${e.message}. ${USAGE}`); }
    if (!opts.Target) throw couldNotLook(`-Target is required. ${USAGE}`);
    if (opts._.length > 0) throw couldNotLook(`unexpected argument ${opts._[0]}. ${USAGE}`);
    code = opts.Check ? check(path.resolve(opts.Target)) : vendor(opts);
} catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\s*[\r\n]+\s*/g, ' ');   // one line: a JSON error quotes text with its newline
    if (e instanceof Stop) { process.stderr.write(`vendor: ${e.code === 1 ? 'refused: ' : ''}${msg}\n`); code = e.code; }
    else { process.stderr.write(`vendor: ERROR ${msg} (could not look; nothing proven)\n`); code = 2; }
}
process.exitCode = code;
