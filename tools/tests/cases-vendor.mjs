// cases-vendor.mjs - the vendored kit (0.3.0 chunk 1, rows 6, 7 and 11; KIT-01): tools/vendor.mjs
// copies the manifest tools/vendor.json into a repository's .claude/kit/ and writes the VERSION that
// names the bytes; -Check proves the copy against it. Imported by run.mjs, which owns the fixtures
// and helpers used here. Never run directly.
//
// Red first: a one-byte flip in a vendored hooks/guard.mjs must make -Check exit 1 naming the file;
// an edit in a copy whose listed files are mostly newer than VERSION (a clone) must exit 1 naming
// no file, while exactly half of an even list newer still names them; a deleted VERSION must exit 2
// and never 0; a manifest include entry that does not exist
// must refuse the run before anything is written; and a copy made from a manifest without
// templates/agent-policy.json must show the fail-open the manifest exists to stop (the vendored
// agent.mjs logs ERROR and allows). Green: the restored copy passes, a second run writes nothing
// (same VERSION bytes, same mtimes), -Record writes rows in adopt's installed.json shape, -Kit takes
// another kit as the source with a CRLF file hashed as its LF text, and the full manifest's agent.mjs
// denies a brief without Done when:.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { treeSha, readVersionFile, readManifest, manifestFiles } from '../../hooks/lib/kit-version.mjs';
import { fileSha256 } from '../lib/df-files.mjs';

export default function vendorCases(t) {
    const { T, kit, root, record, section, like, jp, put, newRepo, exists, readText, sleepMs, invokeHook, hookJson, classify, withoutPointer, toJson } = t;

    section('-- vendor: the vendored kit and its VERSION (0.3.0 rows 6, 7; KIT-01)');
    const script = path.join(kit, 'tools', 'vendor.mjs');
    const vendor = (...args) => {
        const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, NO_COLOR: '1' } });
        return { code: r.status == null ? -1 : r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n').replace(/\n+$/, '') };
    };

    // The kit's own copy (row 39): the checkout carries .claude/kit/ vendored from itself, and
    // KIT-VENDOR-01 holds that copy to its own VERSION only, so a manifest file changed without a
    // re-vendor (node tools/vendor.mjs -Target . -Kit .) would stay GREEN there. This record holds
    // the copy to the checkout: a dry run that would write anything is red, never silent. Seen red
    // first on 2026-11-10, when the copy was one file behind the checkout's claims.json.
    {
        const r = vendor('-Target', kit, '-Kit', kit, '-DryRun');
        const behind = r.out.split('\n').filter((l) => /^\s*would write /.test(l)).map((l) => l.trim());
        record("vendor: the kit's own vendored copy is current (a dry run on the checkout has nothing to write)", 'current',
            r.code === 0 && behind.length === 0 ? 'current' : `behind: ${behind.length ? behind.join(' | ') : `exit ${r.code}`}`, r.out);
    }
    const exitOf = (r) => `exit ${r.code}`;
    const fileLines = (out) => out.split('\n').filter((l) => /^\s+(wrote|updated|would write)\s/.test(l));
    const parse = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
    // A broken tool must leave every case recorded, not throw out of the file: reads that may miss are guarded.
    const bytesOf = (p) => { try { return fs.readFileSync(p); } catch { return Buffer.alloc(0); } };
    const mtimeOf = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return NaN; } };
    const rm = (p) => fs.rmSync(p, { force: true });
    const write = (p, bytes) => { try { fs.writeFileSync(p, bytes); } catch { /* the copy is missing: the cases below record that */ } };

    const repo = newRepo('repo-vendor');
    const kitDir = path.join(repo, '.claude', 'kit');
    const versionPath = path.join(kitDir, 'VERSION');
    const pluginVersion = String(JSON.parse(readText(path.join(kit, '.claude-plugin', 'plugin.json'))).version);
    const manifest = readManifest(kit);
    const expectedFiles = manifestFiles(kit, manifest);

    // ---------------------------------------------------------------- a fresh target
    let r = vendor('-Target', repo);
    record('vendor: a fresh target is vendored (exit 0)', 'exit 0', exitOf(r), r.out);
    record('vendor: the run ends with the count and the short sha', 'named', /^vendored \d+ files, sha [0-9a-f]{12}$/m.test(r.out) ? 'named' : 'missing', r.out);
    record('vendor: the run prints one line per file written', String(expectedFiles.length + 1), String(fileLines(r.out).length), r.out);
    const v1 = readVersionFile(versionPath);
    record('vendor: VERSION is written and parses', 'written', v1 ? 'written' : 'missing', readText(versionPath));
    const vDoc = parse(versionPath);
    record('vendor: VERSION keys are version, sha256, files, at in that order', 'version,sha256,files,at', vDoc ? Object.keys(vDoc).join(',') : 'unparseable');
    record('vendor: VERSION.version is the kit plugin.json version', pluginVersion, v1 ? v1.version : 'none');
    record('vendor: VERSION.files is the manifest list in sorted order', 'same', v1 && v1.files.join('\n') === expectedFiles.join('\n') ? 'same' : 'differs', v1 ? v1.files.join(' ') : '');
    const missingInCopy = expectedFiles.filter((f) => !exists(path.join(kitDir, f)));
    record('vendor: every listed file exists in the copy', 'all', missingInCopy.length === 0 ? 'all' : `missing ${missingInCopy.join(' ')}`);
    let copySha = ''; try { copySha = v1 ? treeSha(kitDir, v1.files) : ''; } catch (e) { copySha = e.message; }
    record('vendor: VERSION.sha256 is treeSha over the copy', 'same', v1 && copySha === v1.sha256 ? 'same' : 'differs', copySha);
    record('vendor: VERSION.at is an ISO time', 'iso', v1 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v1.at) ? 'iso' : String(v1 && v1.at));
    record('vendor: VERSION ends with one LF and is 2-space JSON', 'shaped', /\n$/.test(readText(versionPath)) && /^\{\n  "version"/.test(readText(versionPath)) ? 'shaped' : 'wrong', readText(versionPath).slice(0, 80));
    record('vendor: the copy carries law.json and both policy templates (the fail-open stopper)', 'present', ['law.json', jp('templates', 'agent-policy.json'), jp('templates', 'route-policy.json')].every((f) => exists(path.join(kitDir, f))) ? 'present' : 'missing');
    record('vendor: the copy leaves out hooks.json and the Doctor self-tests (excluded)', 'absent', ![jp(kitDir, 'hooks', 'hooks.json'), jp(kitDir, 'tools', 'doctor', 'selftest.mjs')].some(exists) ? 'absent' : 'present');
    record('vendor: a copied file is byte-identical to the kit file', 'same', bytesOf(path.join(kitDir, 'hooks', 'guard.mjs')).equals(fs.readFileSync(path.join(kit, 'hooks', 'guard.mjs'))) ? 'same' : 'differs');
    // 0.3.0 registry-readers: hooks/registry.json travels, so a vendored tools/law/build-law.mjs can
    // prove a hook is registered (tools/law/validate.mjs reads the registry when hooks/hooks.json is
    // absent beside the law); hooks/hooks.json itself stays out, the plugin form never runs in a
    // vendored copy. And every file the kit's law.json cites travels with it: the owning file of each
    // kit clause and the mechanism file of each hook, tool and permission-rule ref, so the vendored
    // law build resolves the real law and BRAIN-LAW-01 can PASS in a cloud brain. Derived from
    // law.json, never typed: a clause added later that cites a file outside the manifest fails here.
    record('vendor: the copy carries hooks/registry.json (the registration record a vendored law build reads)', 'present', exists(jp(kitDir, 'hooks', 'registry.json')) ? 'present' : 'absent');
    const law = parse(path.join(kit, 'law.json')) || { clauses: [] };
    const cited = new Set();
    for (const c of law.clauses || []) {
        const owner = /^kit:(.+)$/i.exec(String(c.owner || ''));
        if (owner) cited.add(owner[1]);
        const e = c.enforcedBy;
        if (e && ['hook', 'tool', 'permission-rule'].includes(String(e.kind))) cited.add(String(e.ref).split('#')[0]);
    }
    const uncarried = [...cited].filter((rel) => !exists(jp(kitDir, rel))).sort();
    record('vendor: every file the kit law cites travels (owning files; hook, tool and permission-rule mechanism files)', 'all', cited.size > 0 && uncarried.length === 0 ? 'all' : `missing ${uncarried.join(' ')}`, [...cited].sort().join(' '));

    // ---------------------------------------------------------------- -Check: green, then the flip (red), then restored
    r = vendor('-Target', repo, '-Check');
    record('vendor: -Check on a fresh copy exits 0', 'exit 0', exitOf(r), r.out);
    record('vendor: -Check says ok <version> <sha12>', 'ok', v1 && like(r.out, `*vendor: ok ${pluginVersion} ${v1.sha256.slice(0, 12)}*`) ? 'ok' : 'wrong', r.out);
    const guardCopy = path.join(kitDir, 'hooks', 'guard.mjs');
    const original = bytesOf(guardCopy);
    sleepMs(50);   // an edit lands after the copy, so its mtime is newer, as a real edit's is
    const flipped = Buffer.from(original);
    const at = Math.max(0, flipped.indexOf('guard.mjs'));
    if (flipped.length > 0) flipped[at] = flipped[at] ^ 0x20;   // one byte: 'g' -> 'G'
    write(guardCopy, flipped);
    r = vendor('-Target', repo, '-Check');
    record('vendor: a one-byte flip in .claude/kit/hooks/guard.mjs makes -Check exit 1', 'exit 1', exitOf(r), r.out);
    record('vendor: the -Check line names hooks/guard.mjs', 'named', like(r.out, '*hooks/guard.mjs*') ? 'named' : 'unnamed', r.out);
    write(guardCopy, original);
    r = vendor('-Target', repo, '-Check');
    record('vendor: the restored bytes make -Check exit 0 again (the sha decides, not the mtime)', 'exit 0', exitOf(r), r.out);

    // ---------------------------------------------------------------- a clone: most listed files newer than VERSION, so no file named
    // A git checkout writes VERSION and then most listed files after it (a copy may too), so their times single out
    // nothing: in a clone one edited file was reported as 70 changed files while git showed one (a release
    // review finding; SAFE-04, never a list the tree cannot single out). When more than half of the listed
    // files are newer than VERSION, -Check names none and says how many and why; at half or fewer it still
    // names them (the one-byte flip above). Red first: -Check named every listed file newer than VERSION.
    const cloneRepo = newRepo('repo-vendor-clone');
    const cloneKit = path.join(cloneRepo, '.claude', 'kit');
    const cloneVersionPath = path.join(cloneKit, 'VERSION');
    vendor('-Target', cloneRepo);
    const cloneFiles = (readVersionFile(cloneVersionPath) || { files: [] }).files;
    const vSec = mtimeOf(cloneVersionPath) / 1000;
    const touch = (rels, secs) => { for (const f of rels) { try { fs.utimesSync(path.join(cloneKit, f), secs, secs); } catch { /* a missing copy: the records below say so */ } } };
    const edited = 'hooks/stop.mjs';
    touch(cloneFiles, vSec + 60);   // every listed file written after VERSION, as a checkout writes them
    write(path.join(cloneKit, edited), Buffer.concat([bytesOf(path.join(cloneKit, edited)), Buffer.from('// one line\n')]));
    touch([edited], vSec + 60);     // then one file edited
    r = vendor('-Target', cloneRepo, '-Check');
    record('vendor: a copy whose listed files are all newer than VERSION, one of them edited, makes -Check exit 1', 'exit 1', exitOf(r), r.out);
    record('vendor: that -Check line names no file and gives the counts (all listed files newer than VERSION)', 'counted',
        cloneFiles.length > 0 && like(r.out, `*(no file named: ${cloneFiles.length} of ${cloneFiles.length} listed files are newer than VERSION*`) ? 'counted' : r.out.slice(0, 200), r.out);
    const namedFiles = cloneFiles.filter((f) => r.out.includes(f));
    record('vendor: that -Check line names none of the listed files, the edited one included', 'none', cloneFiles.length > 0 && namedFiles.length === 0 ? 'none' : `named ${namedFiles.length}: ${namedFiles.slice(0, 5).join(', ')}`, r.out);
    // The bound is "more than half": half of the listed files (rounded down) newer still names them; one more names none.
    const half = Math.floor(cloneFiles.length / 2);
    const others = cloneFiles.filter((f) => f !== edited);
    touch(cloneFiles, vSec - 60);
    touch([edited, ...others.slice(0, half - 1)], vSec + 60);
    r = vendor('-Target', cloneRepo, '-Check');
    record('vendor: with half of the listed files (rounded down) newer than VERSION, -Check still names them', 'named', like(r.out, `*newer than VERSION: *${edited}*`) ? 'named' : r.out.slice(0, 200), r.out);
    touch(others.slice(half - 1, half), vSec + 60);
    r = vendor('-Target', cloneRepo, '-Check');
    record('vendor: with one more than half of the listed files newer than VERSION, -Check names no file', 'no file named',
        cloneFiles.length > 0 && like(r.out, `*(no file named: ${half + 1} of ${cloneFiles.length} listed files are newer than VERSION*`) && !r.out.includes(edited) ? 'no file named' : r.out.slice(0, 200), r.out);
    // An even list pins the bound itself: the kit's manifest may list an odd number of files, which has no exact
    // half, so a four-file manifest makes one. Exactly half newer still names the files; one more names none. Red
    // first: the bound written as newer.length * 2 >= files.length hid the names at exactly half.
    const evenManifest = jp(T, 'vendor', 'vendor-four.json');
    put(evenManifest, toJson({ schema: 1, include: ['LAW.md', 'law.json', 'hooks/registry.json', 'templates/agent-policy.json'] }) + '\n');
    const evenRepo = newRepo('repo-vendor-even');
    const evenKit = path.join(evenRepo, '.claude', 'kit');
    const evenVersionPath = path.join(evenKit, 'VERSION');
    vendor('-Target', evenRepo, '-Manifest', evenManifest);
    const evenFiles = (readVersionFile(evenVersionPath) || { files: [] }).files;
    const eSec = mtimeOf(evenVersionPath) / 1000;
    const touchEven = (rels, secs) => { for (const f of rels) { try { fs.utimesSync(path.join(evenKit, f), secs, secs); } catch { /* a missing copy: the records below say so */ } } };
    const evenEdited = 'law.json';
    const evenOthers = evenFiles.filter((f) => f !== evenEdited);
    write(path.join(evenKit, evenEdited), Buffer.concat([bytesOf(path.join(evenKit, evenEdited)), Buffer.from('\n')]));
    touchEven(evenFiles, eSec - 60);
    touchEven([evenEdited, ...evenOthers.slice(0, 1)], eSec + 60);
    r = vendor('-Target', evenRepo, '-Check');
    record('vendor: with exactly half of an even list newer than VERSION (2 of 4), -Check still names them', 'named',
        evenFiles.length === 4 && like(r.out, `*newer than VERSION: *${evenEdited}*`) ? 'named' : `${evenFiles.length} listed: ${r.out.slice(0, 200)}`, r.out);
    touchEven(evenOthers.slice(1, 2), eSec + 60);
    r = vendor('-Target', evenRepo, '-Check');
    record('vendor: with one more than half of an even list newer than VERSION (3 of 4), -Check names no file', 'no file named',
        evenFiles.length === 4 && like(r.out, '*(no file named: 3 of 4 listed files are newer than VERSION*') && !r.out.includes(evenEdited) ? 'no file named' : `${evenFiles.length} listed: ${r.out.slice(0, 200)}`, r.out);

    // ---------------------------------------------------------------- VERSION gone or broken: exit 2, never 0
    rm(versionPath);
    r = vendor('-Target', repo, '-Check');
    record('vendor: a deleted VERSION makes -Check exit 2, never 0', 'exit 2', exitOf(r), r.out);
    record('vendor: the exit-2 line says VERSION missing', 'said', like(r.out, '*vendor: VERSION missing*') ? 'said' : 'silent', r.out);
    put(versionPath, '{ not json');
    r = vendor('-Target', repo, '-Check');
    record('vendor: an unparseable VERSION makes -Check exit 2', 'exit 2', exitOf(r), r.out);
    // A VERSION that lists no file (its sha is the sha of nothing) proves nothing: could-not-look, never
    // ok (review finding 14). Red first: -Check printed 'vendor: ok <version> e3b0c44298fc' and exit 0.
    put(versionPath, toJson({ version: pluginVersion, sha256: treeSha(kitDir, []), files: [], at: '2026-01-01T00:00:00Z' }) + '\n');
    r = vendor('-Target', repo, '-Check');
    record('vendor: a VERSION that lists no file makes -Check exit 2, never ok', 'exit 2', exitOf(r), r.out);
    record('vendor: that exit-2 line says VERSION names no file; nothing to prove', 'said', like(r.out, '*vendor: VERSION names no file; nothing to prove*') ? 'said' : 'silent', r.out);
    rm(versionPath);
    r = vendor('-Target', repo);
    record('vendor: a re-run after the deletion writes VERSION again (exit 0)', 'exit 0', exitOf(r), r.out);
    const v2 = readVersionFile(versionPath);
    record('vendor: the rewritten VERSION carries the same sha256', 'same', v1 && v2 && v2.sha256 === v1.sha256 ? 'same' : 'differs');
    record('vendor: the re-run copied no file (the bytes were there)', 'VERSION only', fileLines(r.out).length === 1 && like(fileLines(r.out)[0], '*VERSION*') ? 'VERSION only' : fileLines(r.out).join(' | '), r.out);

    // ---------------------------------------------------------------- a listed file gone: -Check names it; a re-run restores it
    const lawCopy = path.join(kitDir, 'LAW.md');
    rm(lawCopy);
    r = vendor('-Target', repo, '-Check');
    record('vendor: a deleted listed file makes -Check exit 1', 'exit 1', exitOf(r), r.out);
    record('vendor: the -Check line names the missing LAW.md', 'named', like(r.out, '*LAW.md*') ? 'named' : 'unnamed', r.out);
    const versionBytesBeforeRestore = bytesOf(versionPath);
    r = vendor('-Target', repo);
    record('vendor: a re-run restores the deleted file', 'restored', exists(lawCopy) ? 'restored' : 'missing', r.out);
    record('vendor: the re-run prints the restored file\'s line and no other', '.claude/kit/LAW.md', fileLines(r.out).map((l) => l.trim().replace(/^\S+\s+/, '')).join(' | '), r.out);
    record('vendor: the re-run leaves VERSION as it was (same tree, same at)', 'same', bytesOf(versionPath).equals(versionBytesBeforeRestore) ? 'same' : 'rewritten');

    // ---------------------------------------------------------------- a second run writes nothing
    const bytesBefore = bytesOf(versionPath);
    const mtimeBefore = mtimeOf(versionPath);
    const guardMtimeBefore = mtimeOf(guardCopy);
    sleepMs(50);
    r = vendor('-Target', repo);
    record('vendor: a second run exits 0', 'exit 0', exitOf(r), r.out);
    record('vendor: a second run says unchanged', 'unchanged', like(r.out, '*vendored: unchanged*') ? 'unchanged' : 'wrote', r.out);
    record('vendor: a second run prints no per-file line', 'none', fileLines(r.out).length === 0 ? 'none' : fileLines(r.out).join(' | '), r.out);
    record('vendor: a second run leaves VERSION bytes as they were', 'same', bytesOf(versionPath).equals(bytesBefore) ? 'same' : 'rewritten');
    record('vendor: a second run leaves VERSION mtime as it was', 'same', mtimeOf(versionPath) === mtimeBefore ? 'same' : 'touched');
    record('vendor: a second run leaves hooks/guard.mjs mtime as it was', 'same', mtimeOf(guardCopy) === guardMtimeBefore ? 'same' : 'touched');

    // ---------------------------------------------------------------- a VERSION naming another version is rewritten
    const planted = parse(versionPath) || { version: '', sha256: '', files: [], at: '' }; planted.version = '0.0.0';
    put(versionPath, JSON.stringify(planted, null, 2) + '\n');
    r = vendor('-Target', repo);
    record('vendor: a VERSION naming another version of the same bytes is rewritten', pluginVersion, (readVersionFile(versionPath) || { version: 'unparseable' }).version, r.out);
    record('vendor: that run says it wrote VERSION, not unchanged', 'wrote', like(r.out, '*vendored: unchanged*') ? 'unchanged' : fileLines(r.out).some((l) => like(l, '*VERSION*')) ? 'wrote' : 'silent', r.out);

    // ---------------------------------------------------------------- -DryRun
    const dry = newRepo('repo-vendor-dry');
    r = vendor('-Target', dry, '-DryRun');
    record('vendor: -DryRun exits 0', 'exit 0', exitOf(r), r.out);
    record('vendor: -DryRun writes nothing', 'nothing', !exists(path.join(dry, '.claude')) ? 'nothing' : 'wrote', r.out);
    record('vendor: -DryRun names what it would write', 'named', like(r.out, '*hooks/guard.mjs*') && like(r.out, '*VERSION*') ? 'named' : 'silent', r.out);

    // ---------------------------------------------------------------- -Record: rows in adopt's installed.json shape
    const recordPath = jp(T, 'vendor', 'installed.json');
    put(recordPath, toJson({ schema: 1, _comment: 'planted', files: [{ path: path.join(root, 'CLAUDE.md'), sha256: 'x', generated: false }] }) + '\n');
    r = vendor('-Target', repo, '-Record', recordPath);
    record('vendor: -Record exits 0', 'exit 0', exitOf(r), r.out);
    let rec = parse(recordPath);
    let rows = rec && Array.isArray(rec.vendored) ? rec.vendored : [];
    record('vendor: -Record writes one vendored row per file', String(expectedFiles.length), String(rows.length), readText(recordPath).slice(0, 300));
    record('vendor: every vendored row is { path, sha256 } with a .claude/kit/ path', 'shaped', rows.length > 0 && rows.every((x) => Object.keys(x).join(',') === 'path,sha256' && /^\.claude\/kit\/[^/]/.test(x.path) && /^[0-9a-f]{64}$/.test(x.sha256)) ? 'shaped' : 'wrong', toJson(rows.slice(0, 2)));
    const guardRow = rows.find((x) => x.path === '.claude/kit/hooks/guard.mjs');
    record('vendor: a vendored row sha256 is the sha adopt records (over CRLF->LF bytes)', 'same', guardRow && guardRow.sha256 === fileSha256(guardCopy) ? 'same' : 'differs', toJson(guardRow));
    record('vendor: the rows are sorted by path', 'sorted', rows.map((x) => x.path).join('\n') === [...rows.map((x) => x.path)].sort().join('\n') ? 'sorted' : 'unsorted');
    record('vendor: -Record keeps the file\'s other keys (schema, _comment, files)', 'kept', rec && rec.schema === 1 && rec._comment === 'planted' && Array.isArray(rec.files) && rec.files.length === 1 ? 'kept' : 'lost', readText(recordPath).slice(0, 300));
    record('vendor: -Record keeps the key order schema, _comment, files, vendored', 'schema,_comment,files,vendored', rec ? Object.keys(rec).join(',') : 'unparseable');
    const recordBytes = bytesOf(recordPath);
    r = vendor('-Target', repo, '-Record', recordPath);
    rec = parse(recordPath);
    record('vendor: a second -Record leaves one row per file (merged by path)', String(expectedFiles.length), String(rec && Array.isArray(rec.vendored) ? rec.vendored.length : -1));
    record('vendor: a second -Record leaves the record bytes as they were', 'same', bytesOf(recordPath).equals(recordBytes) ? 'same' : 'rewritten', r.out);
    const freshRecord = jp(T, 'vendor', 'installed-new.json');
    r = vendor('-Target', repo, '-Record', freshRecord);
    rec = parse(freshRecord);
    record('vendor: -Record creates the file when absent, with schema and vendored', 'created', rec && rec.schema === 1 && Array.isArray(rec.vendored) && rec.vendored.length === expectedFiles.length ? 'created' : 'missing', r.out);
    const dryRecord = jp(T, 'vendor', 'installed-dry.json');
    r = vendor('-Target', dry, '-Record', dryRecord, '-DryRun');
    record('vendor: -DryRun with -Record writes no record', 'nothing', !exists(dryRecord) ? 'nothing' : 'wrote', r.out);
    // The record file is read and checked before the first write (review finding 9): present, it must be
    // a JSON object, else the run is refused with nothing copied. Red first: the whole copy and VERSION
    // were written, then the run refused at the record, so remove.mjs could never take that copy away.
    const recRepo = newRepo('repo-vendor-badrecord');
    const badRecord = jp(T, 'vendor', 'installed-bad.json');
    put(badRecord, 'not json\n');
    r = vendor('-Target', recRepo, '-Record', badRecord);
    record('vendor: a -Record file that is not JSON refuses the run (exit 1)', 'exit 1', exitOf(r), r.out);
    record('vendor: that refusal names the record file and copies nothing (no .claude under the target)', 'nothing', like(r.out, '*record file*installed-bad.json*') && !exists(path.join(recRepo, '.claude')) ? 'nothing' : exists(path.join(recRepo, '.claude')) ? 'copied' : 'unnamed', r.out);
    record('vendor: the refused record file is left as it was', 'untouched', readText(badRecord) === 'not json\n' ? 'untouched' : 'written');
    put(badRecord, '[ "a list, not an object" ]\n');
    r = vendor('-Target', recRepo, '-Record', badRecord);
    record('vendor: a -Record file holding a JSON list, not an object, is refused before any copy', 'exit 1, nothing copied', `exit ${r.code}, ${exists(path.join(recRepo, '.claude')) ? 'copied' : 'nothing copied'}`, r.out);
    // A record that cannot be written after the copy anyway (its folder is a file here): exit 2, and the
    // line says the copy and VERSION were written and the record was not. Red first: 'vendor: ERROR ...
    // (could not look; nothing proven)', which hid that the copy was on disk with no record.
    const blocker = jp(T, 'vendor', 'record-blocker');
    put(blocker, 'a file where the record folder would be\n');
    const lateRepo = newRepo('repo-vendor-laterecord');
    r = vendor('-Target', lateRepo, '-Record', path.join(blocker, 'installed.json'));
    record('vendor: a record that cannot be written after the copy exits 2, never 0', 'exit 2', exitOf(r), r.out);
    record('vendor: that exit-2 line says the copy and VERSION were written and the record was not', 'said', like(r.out, '*vendor: the copy and VERSION were written; the record was not:*record-blocker*') ? 'said' : 'silent', r.out);
    record('vendor: that copy and its VERSION are on disk, as the line says', 'present', exists(path.join(lateRepo, '.claude', 'kit', 'VERSION')) ? 'present' : 'absent');

    // ---------------------------------------------------------------- -Kit: another kit as the source; CRLF bytes hash as LF text
    // A mini kit in the fixtures: its plugin.json version must land in VERSION (so -Kit is honoured, not the
    // running checkout), its CRLF file must be recorded with the sha of its LF text (the rule adopt records
    // by; the real kit has no CRLF file, so the guard.mjs row above cannot tell the two apart), and a copy
    // whose line endings a checkout rewrote to LF must still pass -Check (treeSha maps CRLF to LF).
    const miniKit = jp(T, 'vendor', 'mini-kit');
    put(jp(miniKit, '.claude-plugin', 'plugin.json'), '{ "name": "mini", "version": "9.9.9" }\n');
    put(jp(miniKit, 'tools', 'vendor.json'), toJson({ schema: 1, include: ['hooks/', 'law.json'] }) + '\n');
    const crlfText = '// crlf.mjs - two lines, CRLF.\r\nexport const n = 1;\r\n';
    put(jp(miniKit, 'hooks', 'crlf.mjs'), crlfText);
    put(jp(miniKit, 'law.json'), '{ "clauses": [] }\n');
    const miniRepo = newRepo('repo-vendor-mini');
    const miniRecord = jp(T, 'vendor', 'installed-mini.json');
    r = vendor('-Target', miniRepo, '-Kit', miniKit, '-Record', miniRecord);
    record('vendor: -Kit vendors another kit (exit 0)', 'exit 0', exitOf(r), r.out);
    const miniVersion = readVersionFile(jp(miniRepo, '.claude', 'kit', 'VERSION'));
    record('vendor: -Kit: VERSION.version is that kit\'s plugin.json version, not the checkout\'s', '9.9.9', miniVersion ? miniVersion.version : 'none', r.out);
    record('vendor: -Kit: VERSION.files is that kit\'s manifest list', 'hooks/crlf.mjs,law.json', miniVersion ? miniVersion.files.join(',') : 'none');
    record('vendor: -Kit: the CRLF file is copied byte for byte (CRLF kept)', 'crlf', bytesOf(jp(miniRepo, '.claude', 'kit', 'hooks', 'crlf.mjs')).equals(Buffer.from(crlfText, 'utf8')) ? 'crlf' : 'changed');
    const crlfRow = ((parse(miniRecord) || {}).vendored || []).find((x) => x.path === '.claude/kit/hooks/crlf.mjs');
    const lfSha = crypto.createHash('sha256').update(crlfText.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
    record('vendor: a CRLF file is recorded with the sha of its LF text (CRLF->LF, as adopt records)', 'lf-sha', crlfRow && crlfRow.sha256 === lfSha ? 'lf-sha' : crlfRow ? 'raw-sha' : 'no row', toJson(crlfRow));
    put(jp(miniRepo, '.claude', 'kit', 'hooks', 'crlf.mjs'), crlfText.replace(/\r\n/g, '\n'));
    r = vendor('-Target', miniRepo, '-Check');
    record('vendor: -Check passes a copy whose CRLF a checkout rewrote to LF (the sha is over LF text)', 'exit 0', exitOf(r), r.out);

    // ---------------------------------------------------------------- a manifest include entry that does not exist refuses the run
    const badManifest = jp(T, 'vendor', 'vendor-missing.json');
    put(badManifest, toJson({ ...manifest, include: [...manifest.include, 'templates/no-such-file.json'] }) + '\n');
    const refusedRepo = newRepo('repo-vendor-refused');
    r = vendor('-Target', refusedRepo, '-Manifest', badManifest);
    record('vendor: a manifest include entry that does not exist refuses the run', 'exit 1', exitOf(r), r.out);
    record('vendor: the refusal names the entry', 'named', like(r.out, '*templates/no-such-file.json*') ? 'named' : 'unnamed', r.out);
    record('vendor: a refused run writes nothing', 'nothing', !exists(path.join(refusedRepo, '.claude')) ? 'nothing' : 'wrote');
    r = vendor('-Target', refusedRepo, '-Manifest', jp(T, 'vendor', 'no-such-manifest.json'));
    record('vendor: a -Manifest path that does not exist is could-not-look (exit 2)', 'exit 2', exitOf(r), r.out);
    // A manifest that exists but is not JSON cannot be read: could-not-look, as a missing one is, never
    // the refusal a wrong entry earns (review finding 12). Red first: both exited 1 'refused'.
    const notJsonManifest = jp(T, 'vendor', 'vendor-not-json.json');
    put(notJsonManifest, 'not json\n');
    r = vendor('-Target', refusedRepo, '-Manifest', notJsonManifest);
    record('vendor: a -Manifest that is not JSON is could-not-look (exit 2), never refused', 'exit 2', exitOf(r), r.out);
    record('vendor: that run says the manifest is unreadable and writes nothing', 'nothing', like(r.out, '*manifest unreadable*vendor-not-json.json*') && !exists(path.join(refusedRepo, '.claude')) ? 'nothing' : exists(path.join(refusedRepo, '.claude')) ? 'wrote' : 'unsaid', r.out);
    const badKit = jp(T, 'vendor', 'kit-not-json');
    put(jp(badKit, '.claude-plugin', 'plugin.json'), '{ "name": "bad", "version": "1.0.0" }\n');
    put(jp(badKit, 'tools', 'vendor.json'), 'not json\n');
    r = vendor('-Target', refusedRepo, '-Kit', badKit);
    record("vendor: a kit whose own tools/vendor.json is not JSON is could-not-look (exit 2)", 'exit 2', exitOf(r), r.out);
    r = vendor('-Target', jp(T, 'vendor', 'no-such-target'));
    record('vendor: a -Target that is not a folder is could-not-look (exit 2)', 'exit 2', exitOf(r), r.out);
    r = vendor('-Target', repo, '-NoSuchOption');
    record('vendor: an unknown option is could-not-look (exit 2)', 'exit 2', exitOf(r), r.out);

    // ---------------------------------------------------------------- row 7: the manifest exists to stop a fail-open
    // A copy made without templates/agent-policy.json leaves the vendored agent.mjs with no policy: it
    // logs ERROR and allows a brief with no Done when:. The full manifest's copy denies it. Both run
    // with no pointer, so the copy's own template is the only policy there is (as in a cloud clone).
    const thinManifest = jp(T, 'vendor', 'vendor-thin.json');
    put(thinManifest, toJson({ ...manifest, include: manifest.include.filter((e) => e !== 'templates/agent-policy.json') }) + '\n');
    const thin = newRepo('repo-vendor-thin');
    r = vendor('-Target', thin, '-Manifest', thinManifest);
    record('vendor: a manifest without templates/agent-policy.json still vendors (the hole is downstream)', 'exit 0', exitOf(r), r.out);
    const brief = { session_id: 'vd-brief', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'Goal: build it\nFiles: src/x.py\nRuled out: nothing\nReports to: the lead' } };
    const logPath = process.env.DF_LOG_PATH;
    const logBefore = readText(logPath);
    let h = withoutPointer(() => invokeHook('agent.mjs', hookJson(brief), jp(thin, '.claude', 'kit', 'hooks')));
    const logged = readText(logPath).slice(logBefore.length);
    const thinVerdict = classify(h.out) === 'deny' ? 'deny' : /ERROR agent/.test(logged) ? 'fail-open' : `allowed, no ERROR line (${classify(h.out)})`;
    record('vendor: a copy without templates/agent-policy.json fails open (ERROR logged, call allowed)', 'fail-open', thinVerdict, h.out + ' | log: ' + logged);
    h = withoutPointer(() => invokeHook('agent.mjs', hookJson(brief), jp(repo, '.claude', 'kit', 'hooks')));
    record('vendor: the full manifest\'s agent.mjs denies a brief without Done when:', 'deny', classify(h.out) === 'deny' && like(h.out, '*Done when:*') ? 'deny' : classify(h.out), h.out);
}
