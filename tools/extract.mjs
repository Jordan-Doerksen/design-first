// extract.mjs - writes a repository's .claude/kit/extract.json: the brain's values a vendored hook may
// read where no brain is, by class, never the brain's text (0.3.0 chunk 1, design section 2 "Extract").
//
//   node tools/extract.mjs -Brain <brain root> -Class full|private|shared|public -Out <path>
//                          [-Repo <name>] [-Kit <kit root>] [-Overlay <path>]
//
// Exit 0 written, 1 refused (a leak; nothing is written), 2 could-not-look (a missing or unreadable
// input, a bad option). Every line it prints starts with "extract:"; refusals and drops go to stderr.
// Rules:
//   1. The class allowlist. public and shared: the hook-read keys of doctor.config.json (frozenPaths,
//      tombstonedPaths, secretExceptions, readCeilingBytes, readCeilingExempt, sourceExtensions, stopDocs,
//      stopFromGit, stopBudgetSeconds, stopCard, forbidScheduling, blanketKill, loopBranchPrefix,
//      loopLedgerGlobs, ask, boundedFiles), agentPolicy (brief and cap of agent-policy.json) and lawIds
//      (id and grade of every row of the brain's LAW.md, no rule text, no overlay clause). private adds
//      contentRules, agentPolicy.routes, routePolicy (route-policy.json whole) and overlay (clause ids,
//      grades and rule text; override ids and grades). full adds every other key of doctor.config.json
//      except _readers and _comment, the overlay, agent-policy.json and route-policy.json whole, and
//      cloud-policy.json whole when present. A key the brain did not type is not written.
//   2. Path rows. A row that starts with ${ROOT}/, or a bare relative row (root-relative, SPEC 5.3),
//      becomes { repo, path }: the longest repository path the brain's control/domains.json types (a
//      repos key, a domain's paths entry) names the repo by its last segment; else, when the first
//      segment is a category folder (a domain's folders, doctor.config.json categories.folders), the
//      repo is the second segment; else the repo is the first segment. path is the rest, or "." at the
//      repo root. ${BRAIN}/... names the brain folder. A row naming the whole root (${ROOT} alone, or
//      ${ROOT}/) is every repository's row, { repo: "*", path: "." }, in every class and under -Repo: the
//      reader resolves "*" to the clone it runs in (lead decision M25, 2026-11-10). Any other
//      absolute path, or a row with an environment token, is a host path: dropped from a non-full class
//      with the stderr line "dropped (host path): <row>", kept verbatim by full. A readCeilingExempt or
//      boundedFiles glob is a row only when it starts with ${ROOT}/ or ${BRAIN}/; a bare glob is kept.
//      contentRules under and except rows follow the same rule. -Repo <name> keeps only that
//      repository's rows and the "*" rows (the name compares without case) and writes the name into
//      the header.
//   3. Never opened: profile/ and memory/ under the brain, and the four profile files by name anywhere
//      (me, voice, prohibitions and the profile card, each a .md), wherever -Overlay, the overlay the
//      brain's claims.json names, or -Out points. The refusal names the path, never its text.
//   4. Secrets. The serialized output is scanned with hooks/lib/secrets.mjs in every class; a hit
//      refuses, naming the pattern and the count, never the match.
//   5. Leak words. A non-full output drops why, note, _comment and every _* key before serialization,
//      then is refused when it holds a word of doctor.config.json leakWords (named by position, never
//      spelled) or, in public and shared, an overlay clause id.
//   6. The header: generated_by, kit_version (the running kit's, or -Kit's, from
//      hooks/lib/kit-version.mjs; a version that cannot be read is could-not-look and nothing is
//      written, never an empty kit_version), brain_commit (git HEAD of the brain, "" when the brain is
//      no repository), class, repo (with -Repo), at. 2-space JSON, trailing LF.
// What this tool cannot see: a value that is itself private text (a sentence typed as a stopDocs name
// is a value to it); a secret in a shape the nine patterns do not name; a note name the brain did not
// list in leakWords; a repository the domain map and the category list both miss (its first segment is
// then taken as the repo); a category-level row (under: ${ROOT}/trading) names the category as if it
// were a repository, and a lone clone never matches it.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import { parseJson } from '../hooks/lib/json.mjs';
import { kitVersion } from '../hooks/lib/kit-version.mjs';
import { readLawGroups } from '../hooks/lib/law-rows.mjs';
import { findSecrets } from '../hooks/lib/secrets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLASSES = ['full', 'private', 'shared', 'public'];
const USAGE = 'usage: node tools/extract.mjs -Brain <brain root> -Class full|private|shared|public -Out <path> [-Repo <name>] [-Kit <kit root>] [-Overlay <path>]';
const PUBLIC_KEYS = ['frozenPaths', 'tombstonedPaths', 'secretExceptions', 'readCeilingBytes', 'readCeilingExempt', 'sourceExtensions', 'stopDocs',
    'stopFromGit', 'stopBudgetSeconds', 'stopCard', 'forbidScheduling', 'blanketKill', 'loopBranchPrefix', 'loopLedgerGlobs', 'ask', 'boundedFiles'];
const PATH_KEYS = ['frozenPaths', 'tombstonedPaths', 'secretExceptions'];
const GLOB_KEYS = ['readCeilingExempt'];
const NEVER_DIRS = ['profile', 'memory'];
const NEVER_FILE_RX = /^(me|voice|prohibitions|profile)\.md$/i;
const DROP_KEYS = ['why', 'note', '_comment'];

const err = (s) => process.stderr.write(`extract: ${s}\n`);
const say = (s) => process.stdout.write(`extract: ${s}\n`);
class Stop extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const refuse = (msg) => { throw new Stop(1, `refused: ${msg}; nothing written`); };
const couldNotLook = (msg) => { throw new Stop(2, `could not look: ${msg}`); };

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const has = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isStr = (v) => typeof v === 'string';
const norm = (s) => String(s).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
// A parse error's message without the text it quotes: Node 20 and later echo the first characters of
// the input, and a config path may name a file whose text must not reach stderr.
const jsonWhy = (e) => String(e && e.message ? e.message : e).replace(/"(?:[^"\\]|\\.)*"/g, '"..."');

// ---------------------------------------------------------------- the gate (rule 3)
function guard(brain, full, verb) {
    const rel = path.relative(brain, full).replace(/\\/g, '/');
    const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    const segs = (inside ? rel : full.replace(/\\/g, '/')).split('/').filter(Boolean);
    const base = segs.length ? segs[segs.length - 1] : '';
    const dirHit = inside && segs.length >= 1 && NEVER_DIRS.includes(segs[0].toLowerCase());
    if (dirHit || NEVER_FILE_RX.test(base)) {
        throw new Stop(1, `refused to ${verb} ${inside ? rel : full}: profile/, memory/ and the owner's own files never enter an extract; nothing written`);
    }
}

function readBrainJson(brain, rel, required) {
    const p = path.join(brain, rel);
    guard(brain, p, 'open');
    if (!isFile(p)) { if (required) couldNotLook(`no ${rel} in ${brain}`); return null; }
    let j;
    try { j = parseJson(fs.readFileSync(p, 'utf8')); } catch (e) { couldNotLook(`${rel} is not JSON: ${jsonWhy(e)}`); }
    if (!j || typeof j !== 'object' || Array.isArray(j)) couldNotLook(`${rel} is not a JSON object`);
    return j;
}

// The overlay: -Overlay, else the path the brain's claims.json names (the BRAIN-LAW claim's overlay
// field, ${BRAIN} and ${KIT} expanded), else law/overlay.json, else law.overlay.json. Optional.
function readOverlay(brain, kit, explicit) {
    let p = null; let source = '';
    if (explicit) { p = path.resolve(String(explicit)); source = '-Overlay'; }
    else {
        const claims = readBrainJson(brain, 'claims.json', false);
        const claim = claims && Array.isArray(claims.claims) ? claims.claims.find((c) => c && isStr(c.overlay) && c.overlay.trim()) : null;
        if (claim) {
            const s = claim.overlay.trim().split('${BRAIN}').join(brain).split('${KIT}').join(kit);
            if (/\$\{[A-Za-z_]+\}/.test(s)) couldNotLook(`the overlay path in claims.json needs a token this tool cannot expand: ${claim.overlay}`);
            p = path.resolve(s); source = `claims.json (${claim.id || 'a claim'})`;
        } else {
            for (const rel of ['law/overlay.json', 'law.overlay.json']) { const c = path.join(brain, rel); if (isFile(c)) { p = c; source = rel; break; } }
            if (!p) return null;
        }
    }
    guard(brain, p, 'open');
    if (!isFile(p)) couldNotLook(`overlay named by ${source} not found: ${p}`);
    let j;
    try { j = parseJson(fs.readFileSync(p, 'utf8')); } catch (e) { couldNotLook(`overlay ${p} is not JSON: ${jsonWhy(e)}`); }
    return { data: j && typeof j === 'object' && !Array.isArray(j) ? j : {}, source, path: p };
}

// git HEAD of the brain, only when the brain folder is itself a repository's top level.
function brainCommit(brain) {
    try {
        const top = spawnSync('git', ['-C', brain, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        if (top.status !== 0) return '';
        const a = fs.realpathSync.native(String(top.stdout || '').trim());
        const b = fs.realpathSync.native(brain);
        if (a.toLowerCase() !== b.toLowerCase()) return '';
        const head = spawnSync('git', ['-C', brain, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        const s = String(head.stdout || '').trim();
        return head.status === 0 && /^[0-9a-f]{40}$/.test(s) ? s : '';
    } catch { return ''; }
}

// ---------------------------------------------------------------- path rows (rule 2)
function rowContext(cfg, domains, brainName, keepHost, repoOnly) {
    const prefixes = new Set(); const categories = new Set();
    for (const f of asList(cfg && cfg.categories && cfg.categories.folders)) if (isStr(f) && norm(f)) categories.add(norm(f).toLowerCase());
    if (domains && typeof domains === 'object') {
        const repos = domains.repos;
        if (Array.isArray(repos)) { for (const r of repos) if (r && isStr(r.path)) prefixes.add(norm(r.path)); }
        else if (repos && typeof repos === 'object') for (const k of Object.keys(repos)) prefixes.add(norm(k));
        for (const d of asList(domains.domains)) {
            if (!d || typeof d !== 'object') continue;
            for (const p of asList(d.paths)) if (isStr(p)) prefixes.add(norm(p));
            for (const f of asList(d.folders)) if (isStr(f) && norm(f)) categories.add(norm(f).toLowerCase());
        }
    }
    prefixes.delete('');
    return { brainName, prefixes: [...prefixes], categories, keepHost, repoOnly };
}

function isHostPath(fwd) {
    return /^[A-Za-z]:\//.test(fwd) || fwd.startsWith('/') || /^~(\/|$)/.test(fwd)
        || /%[A-Za-z_][A-Za-z0-9_]*%/.test(fwd) || /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(fwd) || /\$[A-Za-z_]/.test(fwd);
}

function rootRow(rel, R) {
    if (!rel) return { kind: 'root' };
    const segs = rel.split('/').filter(Boolean);
    const lower = rel.toLowerCase();
    let best = '';
    for (const p of R.prefixes) { const pl = p.toLowerCase(); if ((lower === pl || lower.startsWith(pl + '/')) && p.length > best.length) best = p; }
    if (best) { const n = best.split('/').filter(Boolean).length; return { kind: 'row', row: { repo: segs[n - 1], path: segs.length > n ? segs.slice(n).join('/') : '.' } }; }
    if (segs.length >= 2 && R.categories.has(segs[0].toLowerCase())) return { kind: 'row', row: { repo: segs[1], path: segs.length > 2 ? segs.slice(2).join('/') : '.' } };
    return { kind: 'row', row: { repo: segs[0], path: segs.length > 1 ? segs.slice(1).join('/') : '.' } };
}

function rowOf(typed, R) {
    const s = String(typed).trim();
    if (!s) return { kind: 'empty' };
    const fwd = s.replace(/\\/g, '/');
    if (/^\$\{BRAIN\}(\/|$)/i.test(fwd)) { const rest = norm(fwd.replace(/^\$\{BRAIN\}/i, '')); return { kind: 'row', row: { repo: R.brainName, path: rest || '.' } }; }
    if (/^\$\{ROOT\}(\/|$)/i.test(fwd)) return rootRow(norm(fwd.replace(/^\$\{ROOT\}/i, '')), R);
    if (isHostPath(fwd)) return { kind: 'host' };
    return rootRow(norm(fwd), R);
}

const otherRepo = (R, repo) => R.repoOnly && String(repo) !== '*' && String(repo).toLowerCase() !== R.repoOnly.toLowerCase();

function rowsOf(list, R, { globs = false } = {}) {
    const out = [];
    for (const typed of asList(list)) {
        if (typed == null) continue;
        if (!isStr(typed)) {
            // A row already shaped { repo, path } passes through; anything else is kept as typed.
            if (typed && typeof typed === 'object' && isStr(typed.repo) && otherRepo(R, typed.repo)) { err(`dropped (not ${R.repoOnly}): ${JSON.stringify(typed)}`); continue; }
            out.push(typed); continue;
        }
        const s = typed.trim();
        if (globs && !/^\$\{(ROOT|BRAIN)\}/i.test(s) && !isHostPath(s.replace(/\\/g, '/'))) { out.push(typed); continue; }
        const r = rowOf(s, R);
        if (r.kind === 'row') { if (otherRepo(R, r.row.repo)) { err(`dropped (not ${R.repoOnly}): ${s}`); continue; } out.push(r.row); continue; }
        if (r.kind === 'host') { if (R.keepHost) out.push(typed); else err(`dropped (host path): ${s}`); continue; }
        if (r.kind === 'root') { err(`kept (every repository): ${s}`); out.push({ repo: '*', path: '.' }); continue; }
    }
    return out;
}

function boundedRows(list, R) {
    const out = [];
    for (const row of asList(list)) {
        if (!row || typeof row !== 'object' || !isStr(row.glob)) { if (row != null) out.push(row); continue; }
        const globs = rowsOf([row.glob], R, { globs: true });
        if (globs.length === 0) { err(`dropped (no glob left): boundedFiles ${row.glob.trim()}`); continue; }
        out.push({ ...row, glob: globs[0] });
    }
    return out;
}

function contentRows(list, R) {
    const out = [];
    for (const rule of asList(list)) {
        if (!rule || typeof rule !== 'object') continue;
        const copy = { ...rule };
        if (has(rule, 'under')) copy.under = rowsOf(rule.under, R);
        if (has(rule, 'except')) copy.except = rowsOf(rule.except, R);
        if (has(rule, 'under') && copy.under.length === 0) { err(`dropped (no under row left): contentRules ${rule.id == null ? '' : String(rule.id)}`.trimEnd()); continue; }
        out.push(copy);
    }
    return out;
}

// ---------------------------------------------------------------- the law rows and the overlay (rule 1)
function lawIdRows(groups, exclude) {
    const rows = [];
    for (const [, g] of groups) for (const r of g.rows) { if (exclude && exclude.has(r.id.toUpperCase())) continue; rows.push({ id: r.id, grade: r.grade }); }
    return rows;
}

function overlayIds(overlay) {
    const ids = new Set();
    for (const c of asList(overlay && overlay.data && overlay.data.clauses)) if (c && isStr(c.id) && c.id.trim()) ids.add(c.id.trim().toUpperCase());
    return ids;
}

function overlaySlim(data) {
    const clauses = [];
    for (const c of asList(data && data.clauses)) {
        if (!c || typeof c !== 'object') continue;
        const row = {};
        for (const k of ['id', 'grade', 'rule']) if (has(c, k)) row[k] = c[k];
        clauses.push(row);
    }
    const overrides = {};
    if (data && data.overrides && typeof data.overrides === 'object') {
        for (const [id, v] of Object.entries(data.overrides)) { const o = {}; if (v && typeof v === 'object' && has(v, 'grade')) o.grade = v.grade; overrides[id] = o; }
    }
    return { clauses, overrides };
}

// ---------------------------------------------------------------- leak words (rule 5)
function dropKeys(v) {
    if (Array.isArray(v)) return v.map(dropKeys);
    if (v && typeof v === 'object') {
        const o = {};
        for (const [k, x] of Object.entries(v)) { if (DROP_KEYS.includes(k) || k.startsWith('_')) continue; o[k] = dropKeys(x); }
        return o;
    }
    return v;
}

// ---------------------------------------------------------------- main
function main(opts) {
    if (!opts.Brain || !opts.Class || !opts.Out) couldNotLook(`-Brain, -Class and -Out are required. ${USAGE}`);
    const cls = String(opts.Class).trim().toLowerCase();
    if (!CLASSES.includes(cls)) couldNotLook(`class ${opts.Class} is not one of ${CLASSES.join(', ')}`);
    const brain = path.resolve(String(opts.Brain));
    if (!isDir(brain)) couldNotLook(`brain folder missing: ${brain}`);
    const kit = opts.Kit ? path.resolve(String(opts.Kit)) : path.resolve(HERE, '..');
    const out = path.resolve(String(opts.Out));
    const repoOnly = opts.Repo ? String(opts.Repo).trim() : '';
    const full = cls === 'full';
    guard(brain, out, 'write');
    const brainName = path.basename(brain);

    const cfg = readBrainJson(brain, 'doctor.config.json', true);
    const overlay = readOverlay(brain, kit, opts.Overlay);
    const agentPolicy = readBrainJson(brain, 'agent-policy.json', false);
    const routePolicy = readBrainJson(brain, 'route-policy.json', false);
    const cloudPolicy = readBrainJson(brain, 'cloud-policy.json', false);
    const domains = readBrainJson(brain, path.join('control', 'domains.json'), false);
    const lawFile = path.join(brain, 'LAW.md');
    guard(brain, lawFile, 'open');
    if (!isFile(lawFile)) err(`no LAW.md in ${brain}: lawIds empty`);
    const lawGroups = readLawGroups(lawFile);

    // The kit's version is a fact the header carries for a later freshness check: one that cannot be read
    // is could-not-look, nothing written, never an empty kit_version (review finding 13).
    let kv;
    try { kv = kitVersion(kit); } catch (e) { couldNotLook(`kit version unreadable: ${jsonWhy(e).replace(/\s+/g, ' ')}`); }
    // kitVersion names what the root lacks (why), the same words the entry hook's unarmed line prints.
    if (kv.source === 'none') couldNotLook(`kit version unreadable: ${kv.why || 'no VERSION and no .claude-plugin/plugin.json'} at ${kit}`);
    if (!kv.version) {
        // kitVersion reads a plugin.json it cannot parse as one with no version: the line says which it is.
        let why = 'names none';
        try { JSON.parse(fs.readFileSync(path.join(kit, '.claude-plugin', 'plugin.json'), 'utf8')); }
        catch (e) { why = `${e instanceof SyntaxError ? 'is not JSON' : 'could not be read'}: ${jsonWhy(e).replace(/\s+/g, ' ')}`; }
        couldNotLook(`kit version unreadable: ${kit} names no version (.claude-plugin/plugin.json ${why})`);
    }
    const version = kv.version;

    const R = rowContext(cfg, domains, brainName, full, repoOnly);
    const ovIds = overlayIds(overlay);
    const values = {};
    const place = (k, v) => {
        if (PATH_KEYS.includes(k)) return rowsOf(v, R);
        if (GLOB_KEYS.includes(k)) return rowsOf(v, R, { globs: true });
        if (k === 'boundedFiles') return boundedRows(v, R);
        if (k === 'contentRules') return contentRows(v, R);
        return v;
    };
    if (!full) {
        for (const k of PUBLIC_KEYS) if (has(cfg, k)) values[k] = place(k, cfg[k]);
        if (agentPolicy) {
            const ap = {};
            if (has(agentPolicy, 'brief')) ap.brief = agentPolicy.brief;
            if (has(agentPolicy, 'cap')) ap.cap = agentPolicy.cap;
            if (cls === 'private' && has(agentPolicy, 'routes')) ap.routes = agentPolicy.routes;
            values.agentPolicy = ap;
        }
        values.lawIds = lawIdRows(lawGroups, cls === 'private' ? null : ovIds);
        if (cls === 'private') {
            if (has(cfg, 'contentRules')) values.contentRules = place('contentRules', cfg.contentRules);
            if (routePolicy) values.routePolicy = routePolicy;
            if (overlay) values.overlay = overlaySlim(overlay.data);
        }
    } else {
        for (const k of Object.keys(cfg)) { if (k === '_readers' || k === '_comment') continue; values[k] = place(k, cfg[k]); }
        if (agentPolicy) values.agentPolicy = agentPolicy;
        if (routePolicy) values.routePolicy = routePolicy;
        if (cloudPolicy) values.cloudPolicy = cloudPolicy;
        values.lawIds = lawIdRows(lawGroups, null);
        if (overlay) values.overlay = overlay.data;
    }

    const doc = { generated_by: 'tools/extract.mjs', kit_version: version, brain_commit: brainCommit(brain), class: cls };
    if (repoOnly) doc.repo = repoOnly;
    doc.at = new Date().toISOString();
    doc.values = full ? values : dropKeys(values);
    const text = JSON.stringify(doc, null, 2) + '\n';

    const hits = findSecrets(text);
    if (hits.length) refuse(`${hits[0].name} pattern found in the ${cls} output (${hits.length} hit${hits.length === 1 ? '' : 's'})`);
    if (!full) {
        const lower = text.toLowerCase();
        const words = asList(cfg.leakWords).filter(isStr).map((w) => w.trim()).filter(Boolean);
        words.forEach((w, i) => { if (lower.includes(w.toLowerCase())) refuse(`leak word leakWords[${i}] found in the ${cls} output`); });
        if (cls !== 'private') for (const id of ovIds) if (lower.includes(id.toLowerCase())) refuse(`overlay clause id ${id} found in the ${cls} output`);
    }

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text, 'utf8');
    say(`wrote ${out} (${cls}, ${Object.keys(doc.values).length} value keys)`);
}

let opts;
try { opts = parseArgs(process.argv.slice(2), { values: ['Brain', 'Class', 'Out', 'Repo', 'Kit', 'Overlay'] }); }
catch (e) { err(`could not look: ${e.message}`); err(USAGE); process.exit(2); }
try { main(opts); }
catch (e) {
    if (e instanceof Stop) { err(e.message); process.exitCode = e.code; }
    else { err(`could not look: internal error: ${e && e.stack ? e.stack : e}`); process.exitCode = 2; }
}
