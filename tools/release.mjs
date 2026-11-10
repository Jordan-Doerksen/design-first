// release.mjs - the release gate: runs the kit's own Doctor (doctor.mjs -Kit) and the three self-test suites as child processes from the checkout root, proves every mechanism of the tree (registry row, guard rule, claim type, anchor line) is mapped in tools/tests/red-expected.json to a case that ran and passed, refuses on a dirty tree, a stale docs render or a kit Doctor that is not GREEN, and on green with -Bump moves the version in .claude-plugin/plugin.json, rebuilds LAW.md, docs/index.html and README.md and vendors the kit into its own .claude/kit/ (0.3.0, row 40).
//
//   node tools/release.mjs [-DryRun] [-Bump patch|minor|major] [-Root <kit checkout>]
//
// Seven rules, in this order:
//   1. clean-tree     git status --porcelain of the root prints nothing (an untracked file counts),
//                     else the run is refused naming the first entries.
//   2. docs-current   node docs/build.mjs -Check exits 0, else refused with its first line.
//   3. kit-doctor     node tools/doctor/doctor.mjs -Kit, the kit's own claims over the tree, exits 0 and
//                     prints its 'VERDICT: GREEN' line, else refused naming the verdict and the first
//                     claim lines it printed as FAIL or ????: a RED or a COULD-NOT-LOOK kit Doctor never
//                     ships, and an exit 0 with no GREEN line proved nothing (review finding 19: the
//                     suites stayed green while the kit Doctor was RED on its own leak claim).
//   4. suites-ran     tools/tests/run.mjs, tools/doctor/selftest.mjs and tools/tests/adopt-selftest.mjs
//                     are spawned one after another with the root as their folder, never imported
//                     (run.mjs runs on import, and cases-kitroot.mjs moves the pointer). Each must
//                     exit 0, print its 'N passed, M failed' line with M = 0, and print its
//                     'red-expected: N' line with N above 0; a missing line reads as 0 and is refused.
//   5. every-mechanism-mapped  the inventory is read from the tree, never typed: registry:<id> for
//                     every row of hooks/registry.json; guard:<n> for every numbered rule line in the
//                     header comment of hooks/guard.mjs (a line '//   N. name', before the first line
//                     of code); claim:<type> for every case of the dispatcher switch in
//                     tools/doctor/claims.mjs; anchor:<file>#<name> for every anchor line (the law
//                     validator's regex, tools/law/validate.mjs) in a tracked script outside .claude/.
//                     Each id must map in red-expected.json to one or more case names. A mechanism
//                     with no mapping, a mapped name no suite printed, a mapped case that failed, and
//                     a map entry for a mechanism the tree no longer carries are each refused by name.
//                     -DryRun lists every mechanism with its state (mapped, UNMAPPED, UNSEEN, FAILED,
//                     STALE); a plain run lists the problems only.
//   6. bump           on green with -Bump: the version in plugin.json moves by the word (the one
//                     '"version": "..."' line is rewritten, nothing else), LAW.md is rebuilt
//                     (tools/law/build-law.mjs -Source law.json -Out LAW.md), the page and the README
//                     are rebuilt (docs/build.mjs), and the kit is vendored into its own .claude/kit/
//                     (tools/vendor.mjs -Target <root> -Kit <root>), in that order so the vendored
//                     copy holds the rebuilt files and its VERSION names the new version (LAW.md
//                     carries no version, so a bump's rebuild leaves it unchanged). Nothing is
//                     committed: the owner commits the listed files by path. -DryRun reports, prints
//                     the would-be version and writes no release file (the kit Doctor writes its
//                     ignored state/, as on every run); without -Bump the gate runs alone and no
//                     release file changes.
//   7. node-version   the Node version that ran is printed on every run, so the record of a release
//                     names it (the law's floor is Node 18 or later).
// Exit 0 green, 1 refused, 2 could not look (a usage error, a root that is no git work tree, a file of
// the inventory unreadable, the kit Doctor or a suite missing, a suite or a generator that could not
// be started).
//
// How a mapped name is matched to a printed line: run.mjs prints its name column cut at 72 characters,
// so a longer mapped name matches by its first 72; tools/doctor/selftest.mjs appends ' (exit N)' or
// ' (Nx)' to some names, so each printed name is read with and without that suffix; adopt-selftest.mjs
// prints the name whole. A name is seen when any suite printed it, and passed when no line that
// printed it was a FAIL.
//
// What this tool cannot see: whether a mapped case is the right case for its mechanism (a map that
// names a passing case of another mechanism still passes; the map is read by a person at review);
// a mechanism that no registry row, numbered rule line, dispatcher case or anchor line declares;
// two cases whose names share their first 72 characters in run.mjs (both must pass, the safe side);
// a change past the 72nd character of a run.mjs name it maps (the dry run marks each entry matched
// by the cut, so a person checks those against the map);
// and whatever the suites and the kit Doctor themselves cannot see, written in their own headers and in
// tools/MANUAL.md (Known gaps).
//
// anchor: release-gate  mode: gate  verbs: release

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';

const KIT_FROM_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: node tools/release.mjs [-DryRun] [-Bump patch|minor|major] [-Root <kit checkout>]';
const SUITES = ['tools/tests/run.mjs', 'tools/doctor/selftest.mjs', 'tools/tests/adopt-selftest.mjs'];
const RUN_SUITE = SUITES[0];
const DOCTOR_SUITE = SUITES[1];
const KIT_DOCTOR = 'tools/doctor/doctor.mjs';
const MAP = 'tools/tests/red-expected.json';
const NAME_COLUMN = 72;   // run.mjs: name.slice(0, 72).padEnd(72)
// The validator's regex (tools/law/validate.mjs), so the inventory and the law read the same lines.
const ANCHOR_RX = /^\s*(?:\/\/|#)\s*anchor:\s*(?<name>\S+)\s+mode:\s*(?<mode>deny|advise|gate)\s+verbs:\s*(?<verbs>\S+)/i;
const SCRIPT_RX = /\.(mjs|cjs|js|py|sh|ps1|psm1)$/i;
const BUMPS = ['patch', 'minor', 'major'];

const say = (s = '') => process.stdout.write(s + '\n');
class Stop extends Error { constructor(msg, code) { super(msg); this.code = code; } }
const couldNotLook = (msg) => new Stop(msg, 2);
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const rxEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Children see no test seam and no plugin root from this shell: each suite sets its own.
function childEnv() {
    const env = { ...process.env, NO_COLOR: '1' };
    for (const k of Object.keys(env)) if (/^DF_/.test(k) || k === 'CLAUDE_PLUGIN_ROOT' || k === 'CLAUDE_PROJECT_DIR') delete env[k];
    return env;
}
function node(root, rel, args) {
    const r = spawnSync(process.execPath, [path.join(root, rel), ...args], { cwd: root, encoding: 'utf8', windowsHide: true, env: childEnv(), maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw couldNotLook(`${rel} could not be started: ${r.error.message}`);
    return { code: r.status == null ? -1 : r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\r\n/g, '\n') };
}
function git(root, args) {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, env: childEnv(), maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw couldNotLook(`git could not be started: ${r.error.message}`);
    return { code: r.status == null ? -1 : r.status, out: (r.stdout || '').replace(/\r\n/g, '\n'), err: (r.stderr || '').replace(/\r\n/g, '\n') };
}

// ---------------------------------------------------------------- the inventory (rule 5)

function inventory(root) {
    const ids = [];
    const regPath = path.join(root, 'hooks', 'registry.json');
    if (!isFile(regPath)) throw couldNotLook(`hooks/registry.json missing under ${root}`);
    let reg;
    try { reg = JSON.parse(readText(regPath)); } catch (e) { throw couldNotLook(`hooks/registry.json unreadable: ${e.message}`); }
    const rows = reg && Array.isArray(reg.hooks) ? reg.hooks : [];
    for (const h of rows) if (h && h.id != null && String(h.id).trim() !== '') ids.push({ id: `registry:${String(h.id).trim()}`, kind: 'registry rows' });

    // The guard's header: every '//   N. name' line before the first line of code. A number inside a
    // continuation line (indented past the rule column) or after the header is not a rule.
    const guardPath = path.join(root, 'hooks', 'guard.mjs');
    if (!isFile(guardPath)) throw couldNotLook(`hooks/guard.mjs missing under ${root}`);
    let rules = 0;
    for (const l of readText(guardPath).split('\n')) {
        if (!/^\s*\/\//.test(l) && l.trim() !== '') break;
        const m = /^\/\/\s{1,5}(\d+)\.\s+([a-z0-9-]+)/i.exec(l);
        if (m) { ids.push({ id: `guard:${Number(m[1])}`, kind: 'guard rules', note: m[2] }); rules++; }
    }
    if (rules === 0) throw couldNotLook('hooks/guard.mjs: no numbered rule line in its header comment');

    // The dispatcher: every case of the switch on the claim type, up to its default.
    const claimsPath = path.join(root, 'tools', 'doctor', 'claims.mjs');
    if (!isFile(claimsPath)) throw couldNotLook(`tools/doctor/claims.mjs missing under ${root}`);
    const sw = /switch \(String\(c\.type\)\) \{([\s\S]*?)default:/.exec(readText(claimsPath));
    if (!sw) throw couldNotLook('tools/doctor/claims.mjs: no dispatcher switch on the claim type');
    for (const m of sw[1].matchAll(/case '([A-Za-z0-9_]+)'/g)) ids.push({ id: `claim:${m[1]}`, kind: 'claim types' });

    // Every anchor line in a script of the tree outside .claude/ (a vendored copy repeats the tree):
    // the tracked files and the untracked ones git does not ignore, so a dry run on a dirty tree
    // reads a new script's anchor too (a clean tree, which the bump needs, has only tracked files).
    const ls = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
    if (ls.code !== 0) throw couldNotLook(`git ls-files failed under ${root}: ${ls.err.trim()}`);
    for (const f of [...new Set(ls.out.split('\0').filter((x) => x !== ''))].sort()) {
        if (/^\.claude\//.test(f) || !SCRIPT_RX.test(f)) continue;
        const full = path.join(root, f);
        if (!isFile(full)) continue;
        for (const l of readText(full).split('\n')) {
            const m = ANCHOR_RX.exec(l);
            if (m) ids.push({ id: `anchor:${f}#${m.groups.name}`, kind: 'anchors' });
        }
    }
    return ids;
}

// ---------------------------------------------------------------- the map

function readMap(root) {
    const p = path.join(root, MAP);
    const map = new Map();
    if (!isFile(p)) return { map, problem: `${MAP} is missing` };
    let doc;
    try { doc = JSON.parse(readText(p)); } catch (e) { return { map, problem: `${MAP} unreadable: ${e.message}` }; }
    const m = doc && doc.mechanisms && typeof doc.mechanisms === 'object' && !Array.isArray(doc.mechanisms) ? doc.mechanisms : null;
    if (!m) return { map, problem: `${MAP} has no 'mechanisms' object` };
    for (const [id, v] of Object.entries(m)) {
        const names = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? '')).filter((x) => x.trim() !== '');
        map.set(id, names);
    }
    return { map, problem: null };
}

// ---------------------------------------------------------------- the kit Doctor (rule 3)

// Reads a doctor.mjs -Kit run: the word of its 'VERDICT: <word>' line (null when it printed none, as a
// crash does), and the lines that name what is wrong: each FAIL or ???? claim line, and the
// 'COULD-NOT-LOOK: ...' line a Doctor that stopped prints, each cut to 160 characters.
function readDoctor(out) {
    const m = /^\s*VERDICT:\s*(GREEN|RED|COULD-NOT-LOOK)\b/m.exec(out);
    const problems = out.split('\n')
        .filter((l) => /^\s+(FAIL|\?\?\?\?)\s{2}\S/.test(l) || /^\s*COULD-NOT-LOOK:/.test(l))
        .map((l) => { const s = l.trim().replace(/\s{2,}/g, ' '); return s.length > 160 ? s.slice(0, 160) + '...' : s; });
    return { verdict: m ? m[1] : null, problems };
}

// ---------------------------------------------------------------- the suites (rule 4)

// Reads one suite's output: every '  PASS  ' or '  FAIL  ' line gives a printed name (run.mjs: the
// 72-character column, trimmed; the Doctor: with and without its ' (exit N)' or ' (Nx)' suffix),
// the last 'N passed, M failed' line gives the counts, the last 'red-expected: N' line the count.
function parseSuite(rel, out) {
    const seen = new Map();
    const note = (name, pass) => { const prev = seen.get(name); seen.set(name, (prev === undefined ? true : prev) && pass); };
    for (const line of out.split('\n')) {
        const m = /^ {2}(PASS|FAIL) {2}(.*)$/.exec(line);
        if (!m) continue;
        const pass = m[1] === 'PASS';
        let name = rel === RUN_SUITE ? m[2].slice(0, NAME_COLUMN).trimEnd() : m[2].trimEnd();
        if (name === '') continue;
        note(name, pass);
        if (rel === DOCTOR_SUITE) {
            const stripped = name.replace(/ \((?:exit -?\d+|\d+x)\)$/, '');
            if (stripped !== name) note(stripped, pass);
        }
    }
    let counts = null;
    for (const m of out.matchAll(/^\s*(\d+) passed, (\d+) failed(?:, (\d+) total)?\s*$/gm)) counts = { passed: Number(m[1]), failed: Number(m[2]) };
    let red = null;
    for (const m of out.matchAll(/^\s*red-expected: (\d+)\s*$/gm)) red = Number(m[1]);
    return { seen, counts, red };
}

// A mapped name against the suites: seen when any suite printed it (run.mjs by its first 72
// characters when it is longer), passed when no printing line was a FAIL.
function lookup(name, suites) {
    const cut = name.length > NAME_COLUMN ? name.slice(0, NAME_COLUMN).trimEnd() : name;
    let found = false; let pass = true; let byCut = false;
    for (const s of suites) {
        const key = s.rel === RUN_SUITE ? cut : name;
        if (s.seen.has(key)) { found = true; if (!s.seen.get(key)) pass = false; if (key !== name) byCut = true; }
    }
    return { found, pass, byCut };
}

// ---------------------------------------------------------------- the version (rule 6)

function readVersion(root) {
    const p = path.join(root, '.claude-plugin', 'plugin.json');
    if (!isFile(p)) throw couldNotLook(`.claude-plugin/plugin.json missing under ${root}`);
    const text = readText(p);
    let v;
    try { v = JSON.parse(text).version; } catch (e) { throw couldNotLook(`.claude-plugin/plugin.json unreadable: ${e.message}`); }
    if (v == null || !/^\d+\.\d+\.\d+$/.test(String(v))) throw couldNotLook(`.claude-plugin/plugin.json version '${v}' is not major.minor.patch`);
    return { path: p, text, version: String(v) };
}
function bumped(version, word) {
    const [a, b, c] = version.split('.').map(Number);
    if (word === 'major') return `${a + 1}.0.0`;
    if (word === 'minor') return `${a}.${b + 1}.0`;
    return `${a}.${b}.${c + 1}`;
}
function writeVersion(plugin, next) {
    const line = new RegExp(`"version":\\s*"${rxEscape(plugin.version)}"`, 'g');
    const hits = plugin.text.match(line) || [];
    if (hits.length !== 1) throw couldNotLook(`.claude-plugin/plugin.json: expected one "version": "${plugin.version}" line, found ${hits.length}`);
    fs.writeFileSync(plugin.path, plugin.text.replace(line, `"version": "${next}"`), 'utf8');
}

// ---------------------------------------------------------------- main

function main() {
    let opts;
    try { opts = parseArgs(process.argv.slice(2), { values: ['Bump', 'Root'], switches: ['DryRun'] }); }
    catch (e) { throw couldNotLook(`${e.message}. ${USAGE}`); }
    if (opts._.length > 0) throw couldNotLook(`unexpected argument ${opts._[0]}. ${USAGE}`);
    const bump = opts.Bump ? String(opts.Bump).toLowerCase() : '';
    if (bump && !BUMPS.includes(bump)) throw couldNotLook(`-Bump must be patch, minor or major (got '${opts.Bump}'). ${USAGE}`);
    const dry = Boolean(opts.DryRun);
    const root = path.resolve(opts.Root || KIT_FROM_HERE);
    if (!isDir(root)) throw couldNotLook(`root is not a folder: ${root}`);
    const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
    if (inside.code !== 0 || inside.out.trim() !== 'true') throw couldNotLook(`root is not a git work tree: ${root}`);
    const plugin = readVersion(root);
    const refusals = [];

    say(`release: ${root} (${plugin.version})${dry ? '  [DRY RUN: no release file is written]' : ''}`);
    say(`  node      ${process.version}`);

    // 1. the tree
    const status = git(root, ['status', '--porcelain']);
    if (status.code !== 0) throw couldNotLook(`git status failed under ${root}: ${status.err.trim()}`);
    const dirty = status.out.split('\n').filter((l) => l.trim() !== '');
    if (dirty.length === 0) say('  tree      clean');
    else {
        say(`  tree      DIRTY: ${dirty.length} entr${dirty.length === 1 ? 'y' : 'ies'}`);
        refusals.push(`the tree is dirty (${dirty.length} entr${dirty.length === 1 ? 'y' : 'ies'}): ${dirty.slice(0, 5).map((l) => l.trim()).join(', ')}${dirty.length > 5 ? ', ...' : ''}; commit or discard first`);
    }

    // 2. the docs render
    const docs = node(root, 'docs/build.mjs', ['-Check']);
    const docsLine = docs.out.split('\n').find((l) => l.trim() !== '') || '(no output)';
    if (docs.code === 0) say(`  docs      ok (docs/build.mjs -Check: ${docsLine.trim()})`);
    else { say(`  docs      STALE (docs/build.mjs -Check exit ${docs.code}: ${docsLine.trim()})`); refusals.push(`docs/build.mjs -Check exited ${docs.code}: ${docsLine.trim()}`); }

    // 3. the kit's own Doctor: GREEN means exit 0 AND its VERDICT: GREEN line, never one without the other
    if (!isFile(path.join(root, KIT_DOCTOR))) throw couldNotLook(`kit Doctor missing: ${KIT_DOCTOR} under ${root}`);
    const kd = node(root, KIT_DOCTOR, ['-Kit']);
    const kv = readDoctor(kd.out);
    say(`  doctor    ${kv.verdict || 'no VERDICT line'} (${KIT_DOCTOR} -Kit exit ${kd.code})`);
    if (kd.code === 0 && kv.verdict !== 'GREEN') refusals.push(`the kit Doctor (${KIT_DOCTOR} -Kit) exited 0 and printed ${kv.verdict ? `VERDICT: ${kv.verdict}` : 'no VERDICT: GREEN line'}: nothing proved the kit's own claims hold`);
    else if (kd.code !== 0) refusals.push(`the kit Doctor (${KIT_DOCTOR} -Kit) is ${kv.verdict || 'not GREEN (no VERDICT line)'} (exit ${kd.code})${kv.problems.length ? `: ${kv.problems.slice(0, 3).join(' | ')}${kv.problems.length > 3 ? ' | ...' : ''}` : ''}; a RED or COULD-NOT-LOOK kit Doctor never ships`);

    // 4. the suites
    const suites = [];
    for (const rel of SUITES) {
        if (!isFile(path.join(root, rel))) throw couldNotLook(`suite missing: ${rel} under ${root}`);
        const r = node(root, rel, []);
        const p = parseSuite(rel, r.out);
        suites.push({ rel, ...p, code: r.code });
        const countText = p.counts ? `${p.counts.passed} passed, ${p.counts.failed} failed` : 'no summary line';
        const redText = p.red == null ? 'no red-expected line' : `red-expected ${p.red}`;
        say(`  suite     ${rel}: ${countText}, ${redText} (exit ${r.code})`);
        if (!p.counts) refusals.push(`suite ${rel} printed no 'N passed, M failed' line (exit ${r.code})`);
        else if (p.counts.failed > 0) {
            const failed = [...p.seen.entries()].filter(([, pass]) => !pass).map(([name]) => name);
            refusals.push(`suite ${rel}: ${p.counts.failed} failed: ${failed.slice(0, 5).join(' | ')}${failed.length > 5 ? ' | ...' : ''}`);
        }
        if (r.code !== 0 && (!p.counts || p.counts.failed === 0)) refusals.push(`suite ${rel} exited ${r.code}`);
        if (p.red == null) refusals.push(`suite ${rel} printed no red-expected line (read as 0): the suite does not count its refusal cases`);
        else if (p.red === 0) refusals.push(`suite ${rel} printed red-expected: 0: a suite with no refusal case proves nothing`);
    }

    // 5. every mechanism mapped to a case that ran and passed
    const ids = inventory(root);
    const { map, problem } = readMap(root);
    if (problem) refusals.push(`${problem}: every mechanism is unmapped`);
    const byKind = {};
    for (const x of ids) byKind[x.kind] = (byKind[x.kind] || 0) + 1;
    const states = [];
    const known = new Set(ids.map((x) => x.id));
    for (const x of ids) {
        const names = map.get(x.id);
        if (!names || names.length === 0) { states.push({ id: x.id, state: 'UNMAPPED', detail: '' }); refusals.push(`mechanism ${x.id} has no mapping in ${MAP}`); continue; }
        const unseen = []; const failed = []; let cuts = 0;
        for (const n of names) { const l = lookup(n, suites); if (!l.found) unseen.push(n); else if (!l.pass) failed.push(n); else if (l.byCut) cuts++; }
        if (unseen.length > 0) { states.push({ id: x.id, state: 'UNSEEN', detail: unseen.map((n) => `'${n}'`).join(', ') }); refusals.push(`mechanism ${x.id}: no suite printed the mapped case ${unseen.map((n) => `'${n}'`).join(', ')}`); }
        else if (failed.length > 0) { states.push({ id: x.id, state: 'FAILED', detail: failed.map((n) => `'${n}'`).join(', ') }); refusals.push(`mechanism ${x.id}: the mapped case failed: ${failed.map((n) => `'${n}'`).join(', ')}`); }
        else states.push({ id: x.id, state: 'mapped', detail: `${names.length} case${names.length === 1 ? '' : 's'}${cuts > 0 ? ` (${cuts} matched by the first ${NAME_COLUMN} characters only)` : ''}` });
    }
    for (const id of map.keys()) {
        if (known.has(id)) continue;
        states.push({ id, state: 'STALE', detail: 'no such mechanism in the tree' });
        refusals.push(`${MAP} maps ${id}, which no registry row, guard rule, claim type or anchor line of the tree carries`);
    }
    const tally = (s) => states.filter((x) => x.state === s).length;
    const kinds = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ');
    say(`  map       ${MAP}: ${ids.length} mechanisms (${kinds}): ${tally('mapped')} mapped, ${tally('UNMAPPED')} unmapped, ${tally('UNSEEN')} unseen, ${tally('FAILED')} failed, ${tally('STALE')} stale`);
    for (const s of states) if (dry || s.state !== 'mapped') say(`    ${s.state.padEnd(9)} ${s.id}${s.detail ? `  ${s.detail}` : ''}`);

    // the verdict
    if (refusals.length > 0) {
        say();
        say(`refused: ${refusals.length} reason${refusals.length === 1 ? '' : 's'}; no release file changed`);
        for (const r of refusals) say(`  - ${r}`);
        return 1;
    }
    say();
    const proved = `the kit Doctor GREEN, ${suites.length} suites green, ${ids.length} mechanisms each mapped to a case that ran and passed`;
    if (!bump) {
        say(`green: ${proved}; no -Bump given, no release file changed (would be: patch ${bumped(plugin.version, 'patch')}, minor ${bumped(plugin.version, 'minor')}, major ${bumped(plugin.version, 'major')})`);
        return 0;
    }
    const next = bumped(plugin.version, bump);
    if (dry) { say(`green: ${proved}; would bump ${plugin.version} -> ${next} (${bump}), rebuild LAW.md, docs/index.html and README.md and vendor .claude/kit/; dry run, no release file written`); return 0; }

    // 6. the bump, then the generators in the order the vendored copy needs
    writeVersion(plugin, next);
    say(`bumped ${plugin.version} -> ${next} (${bump}): .claude-plugin/plugin.json`);
    const steps = [
        ['tools/law/build-law.mjs', ['-Source', path.join(root, 'law.json'), '-Out', path.join(root, 'LAW.md')], 'LAW.md'],
        ['docs/build.mjs', [], 'docs/index.html and README.md'],
        ['tools/vendor.mjs', ['-Target', root, '-Kit', root], '.claude/kit/ (the kit vendored into itself)'],
    ];
    for (const [rel, args, what] of steps) {
        const r = node(root, rel, args);
        const last = r.out.split('\n').filter((l) => l.trim() !== '').pop() || '';
        if (r.code !== 0) { say(`  FAILED    ${what}: ${rel} exited ${r.code}: ${last.trim()}`); say(`\nrefused: the version is bumped to ${next} but ${what} did not rebuild; fix and run the generator by hand, or restore plugin.json`); return 1; }
        say(`  rebuilt   ${what}  (${last.trim()})`);
    }
    say(`\nreleased ${next} on node ${process.version}: commit .claude-plugin/plugin.json, LAW.md, docs/index.html, README.md and .claude/kit/ by path`);
    return 0;
}

let code = 0;
try { code = main(); } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (e instanceof Stop) { process.stderr.write(`release: ${msg}\n`); code = e.code; }
    else { process.stderr.write(`release: ERROR ${msg} (could not look; nothing proven)\n`); code = 2; }
}
process.exitCode = code;
