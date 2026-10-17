// claims-tree.mjs - the claims that read a tree of files: tree_free_of, tree_equals, tree_each and
// tree_rules (SPEC 5.2, findings 36, 60, 74). Imported by claims.mjs. READ-ONLY.

import fs from 'node:fs';
import path from 'node:path';
import { readText, toRegex, parseIso, pathEq, relUnder } from '../../hooks/lib/common.mjs';
import { claimResult, resolveClaimPath, isDir } from './claims-base.mjs';
import { listDir, walkFiles, firstCommitDate, isoDay, byName } from './util.mjs';

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Forward slashes, lower case, no leading slash: the one spelling used for exclude/allow lookups.
export function relKey(p) { return String(p).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase(); }
const excluded = (rel, exclude) => exclude.some((x) => rel === x || rel.startsWith(x.replace(/\/+$/, '') + '/'));
const extOf = (p) => { const b = path.basename(p); const i = b.lastIndexOf('.'); return i <= 0 && !b.startsWith('.') ? '' : i < 0 ? '' : b.slice(i).toLowerCase(); };

// ---------------------------------------------------------------- tree_free_of
// Fields: root, words[], extensions[], exclude[] (paths relative to root), allow[] ({ path, words[] }).
// Case-insensitive whole-word match. `exclude` skips a file or a folder. `allow` is SPAN-BASED: a
// permitted word's match span suppresses every sub-word hit inside that span, so allowing
// "Alpha-Beta" in README.md covers "Alpha" and "Beta" inside "Alpha-Beta" there, and nowhere else.

// Longest word first so "Alpha-Beta" wins over "Alpha" at the same position. \b on both ends. Words
// that start or end with a non-word character would get no boundary from \b, so those ends use
// lookarounds against word characters instead.
function wordRegex(words) {
    const parts = [];
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
        if (!w) continue;
        const lead = /\w/.test(w[0]) ? '\\b' : '(?<!\\w)';
        const trail = /\w/.test(w[w.length - 1]) ? '\\b' : '(?!\\w)';
        parts.push(lead + escRx(w) + trail);
    }
    if (parts.length === 0) return null;
    return new RegExp('(?:' + parts.join('|') + ')', 'gi');
}

export function treeFreeOfClaim(c, ctx) {
    const r = resolveClaimPath(c.root, ctx, 'root');
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    const root = r.path;
    if (!isDir(root)) return claimResult(c, 'UNKNOWN', `root folder missing: ${root}`);
    const words = asList(c.words).filter((w) => w != null && String(w) !== '').map(String);
    if (words.length === 0) return claimResult(c, 'UNKNOWN', "claim has no 'words'");
    const exts = asList(c.extensions).map((e) => String(e).toLowerCase()).map((e) => (e.startsWith('.') ? e : `.${e}`));
    if (exts.length === 0) return claimResult(c, 'UNKNOWN', "claim has no 'extensions'");
    const exclude = asList(c.exclude).map((x) => relKey(String(x)));
    const allow = new Map();
    for (const a of asList(c.allow)) {
        if (a == null || !a.path || !String(a.path).trim()) continue;
        allow.set(relKey(String(a.path)), wordRegex(asList(a.words).map(String)));
    }
    const wordRx = wordRegex(words);
    const hits = []; let scanned = 0;
    for (const full of walkFiles(root)) {
        if (!exts.includes(extOf(full))) continue;
        const rel = relKey(full.slice(root.length));
        if (excluded(rel, exclude)) continue;
        scanned++;
        let text;
        try { text = readText(full); } catch { continue; }
        const found = [...text.matchAll(wordRx)];
        if (found.length === 0) continue;
        const spans = [];
        const arx = allow.get(rel);
        if (arx) for (const m of text.matchAll(arx)) spans.push([m.index, m.index + m[0].length]);
        for (const m of found) {
            if (spans.some(([s, e]) => m.index >= s && m.index + m[0].length <= e)) continue;
            const line = text.slice(0, m.index).split('\n').length;
            hits.push(`${rel}:${line} "${m[0]}"`);
        }
    }
    if (hits.length === 0) return claimResult(c, 'PASS', `no forbidden word in ${scanned} file(s) under ${root}`);
    const more = hits.length > 12 ? ` (+${hits.length - 12} more)` : '';
    return claimResult(c, 'FAIL', `${hits.length} hit(s) in ${root}: ${hits.slice(0, 12).join('; ')}${more}`);
}

// ---------------------------------------------------------------- tree_equals
// Fields: path, other, exclude[] (paths relative to each root), extensions[] (optional filter).
// PASS when every file under `path` exists under `other` with the same bytes, or the same text
// after CRLF -> LF, and nothing exists under `other` that is missing from `path`. The .git folder
// is always skipped. Written 2026-10-08 for the one fact the kit could not see about itself: the
// plugin copy Claude Code runs (the cache) had fallen seven commits behind the checkout, and every
// session since the migration had started without its entry path. A claim that compares the two
// trees turns that into a RED run instead of a quiet one.

// rel-key -> full path for every file under rootFull that survives exclude and extensions.
export function treeFileMap(rootFull, exclude, exts) {
    const map = new Map();
    for (const full of walkFiles(rootFull)) {
        if (exts.length > 0 && !exts.includes(extOf(full))) continue;
        const rel = relKey(full.slice(rootFull.length));
        if (excluded(rel, exclude)) continue;
        map.set(rel, full);
    }
    return map;
}

// Bytes first; then text with CRLF -> LF on both sides, so a checkout and a copy that differ only by
// line endings still count as the same file (the generated_matches rule).
function filesSame(a, b) {
    const ba = fs.readFileSync(a); const bb = fs.readFileSync(b);
    if (ba.equals(bb)) return true;
    return ba.toString('utf8').replace(/\r\n/g, '\n') === bb.toString('utf8').replace(/\r\n/g, '\n');
}

export function treeEqualsClaim(c, ctx) {
    const a = resolveClaimPath(c.path, ctx);
    if (!a.path) return claimResult(c, 'UNKNOWN', a.detail);
    const b = resolveClaimPath(c.other, ctx, 'other');
    if (!b.path) return claimResult(c, 'UNKNOWN', b.detail);
    for (const p of [a.path, b.path]) if (!isDir(p)) return claimResult(c, 'UNKNOWN', `folder missing: ${p}`);
    if (pathEq(a.path, b.path)) return claimResult(c, 'PASS', `same folder: ${a.path}`);
    const exclude = asList(c.exclude).filter((x) => x != null && String(x).trim()).map((x) => relKey(String(x)));
    const exts = asList(c.extensions).filter((x) => x != null && String(x).trim()).map((e) => String(e).toLowerCase()).map((e) => (e.startsWith('.') ? e : `.${e}`));
    const ma = treeFileMap(a.path, exclude, exts);
    const mb = treeFileMap(b.path, exclude, exts);
    if (ma.size === 0 && mb.size === 0) return claimResult(c, 'UNKNOWN', 'nothing to compare: no files under either folder after exclude and extensions');
    const diffs = [];
    for (const rel of [...ma.keys()].sort()) {
        if (!mb.has(rel)) { diffs.push(`only in path: ${rel}`); continue; }
        if (!filesSame(ma.get(rel), mb.get(rel))) diffs.push(`differs: ${rel}`);
    }
    for (const rel of [...mb.keys()].sort()) if (!ma.has(rel)) diffs.push(`only in other: ${rel}`);
    if (diffs.length === 0) return claimResult(c, 'PASS', `${ma.size} file(s) identical (CRLF->LF) between ${a.path} and ${b.path}`);
    const more = diffs.length > 12 ? ` (+${diffs.length - 12} more)` : '';
    return claimResult(c, 'FAIL', `${diffs.length} difference(s) between ${a.path} and ${b.path}: ${diffs.slice(0, 12).join('; ')}${more}`);
}

// ---------------------------------------------------------------- tree_each
// The repo scan (2026-10-08, the HONOUR triage). Fields:
//   root        folder whose git repositories (direct children, or deeper per `depth`, default 2) are scanned
//   where       optional: { anyOf: [ "file-or-glob", ... ] } - a repository is selected only when one matches
//   require     [ { "file": "DECISIONS.md" } | { "glob": "**/MANUAL.md" } | { "glob": "**/*.py", "pattern": "<regex>" } ]
//               file: the path exists under the repo root; glob: at least one file matches (case-insensitive,
//               * within a segment, ** across segments); pattern: at least one matched file contains the regex.
//   since       optional ISO date. A repository whose FIRST commit predates it is grandfathered: a gap there is
//               reported in the detail, never a FAIL. The date comes from git, so the ratchet is generated, not typed.
//   accepted    optional [ { path, reason, since } ], ${ROOT}-relative: reported, never failed. Each needs a reason.
//   emptyOk     optional true: nothing selected is a PASS that says so, instead of UNKNOWN (for a template claim).
// PASS: every selected, non-grandfathered, non-accepted repository meets every requirement. FAIL: one does not
// (first 12 named with the missing requirement). UNKNOWN: root missing, nothing selected, or no `require`.
// Skipped folders: .git, node_modules, target, .venv, __pycache__, dist, build, .godot, .tools.

const SCAN_SKIP_DIRS = ['.git', 'node_modules', 'target', '.venv', '__pycache__', 'dist', 'build', '.godot', '.tools'];
const skipScanDir = (name) => SCAN_SKIP_DIRS.includes(name.toLowerCase());

// Per-run caches (2026-10-08). A Doctor run is one process, and a brain can hold a dozen scan claims
// over the same repositories. Measured on the first instance before these existed: 237 s per run,
// 197 s of it in tree_each and tree_rules, because every claim listed every repository again and
// asked git for the same first-commit date again. Each of these is now produced once per run and
// reused. Nothing can go stale inside one run: the Doctor writes only its own state folder, and it
// writes it after the claims.
const scanRepoCache = new Map();   // "<root>|<depth>" -> repository folders
const repoFilesCache = new Map();  // repository folder -> its file list
const globRxCache = new Map();     // glob text -> its regex

function scanRepos(rootFull, depth) {
    const key = `${rootFull}|${depth}`;
    if (scanRepoCache.has(key)) return scanRepoCache.get(key);
    const found = [];
    const queue = listDir(rootFull).filter((e) => e.isDirectory()).map((e) => ({ dir: path.join(rootFull, e.name), level: 1 }));
    while (queue.length) {
        const it = queue.shift();
        if (skipScanDir(path.basename(it.dir))) continue;
        if (fs.existsSync(path.join(it.dir, '.git'))) { found.push(it.dir); continue; }   // a repo; do not descend
        if (it.level < depth) for (const e of listDir(it.dir)) if (e.isDirectory()) queue.push({ dir: path.join(it.dir, e.name), level: it.level + 1 });
    }
    found.sort(byName);
    scanRepoCache.set(key, found);
    return found;
}

// ** = any path, * = within a segment, ? = one char; matched against the forward-slash relative path.
// Several globs may be joined with '|' (any of them matches).
export function globRegex(glob) {
    if (globRxCache.has(glob)) return globRxCache.get(glob);
    const parts = [];
    for (const one of String(glob).split('|')) {
        const g = one.trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!g) continue;
        parts.push(escRx(g).replace(/\\\*\\\*\//g, '(?:.*/)?').replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '[^/]'));
    }
    const rx = new RegExp('^(?:' + parts.join('|') + ')$', 'i');
    globRxCache.set(glob, rx);
    return rx;
}

function repoFiles(repo) {
    if (repoFilesCache.has(repo)) return repoFilesCache.get(repo);
    const out = [];
    repoFilesCache.set(repo, out);
    const stack = [repo];
    while (stack.length) {
        const d = stack.pop();
        for (const e of listDir(d)) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (!skipScanDir(e.name)) stack.push(full); continue; }
            if (!e.isFile()) continue;
            out.push({ full, rel: full.slice(repo.length).replace(/^[\\/]+/, '').replace(/\\/g, '/') });
            if (out.length >= 20000) return out;
        }
    }
    return out;
}

// Returns null when met, else a short description of what is missing.
function requirement(req, repo, files) {
    if (req.file) {
        if (fs.existsSync(path.join(repo, String(req.file)))) return null;
        return `missing ${req.file}`;
    }
    if (req.glob) {
        // One pass in file order with an early exit: the first matching file settles a bare glob, and
        // the first matching file that holds the pattern settles a glob with a pattern.
        const rx = globRegex(String(req.glob));
        let prx = null; let any = false;
        for (const h of files) {
            if (!rx.test(h.rel)) continue;
            if (!req.pattern) return null;
            if (!any) { any = true; prx = toRegex(String(req.pattern), 'i'); }
            try { if (prx.test(readText(h.full))) return null; } catch { /* unreadable: not a match */ }
        }
        if (!any) return `no file matches ${req.glob}`;
        return `no ${req.glob} file contains /${req.pattern}/`;
    }
    return 'requirement has neither file nor glob';
}

// tree_each and tree_rules select the same way: git repositories under `root` (depth), `where.anyOf`
// globs, `exclude` prefixes, the `since` ratchet on git's first-commit date, and `accepted` entries
// with a reason. check(repo, files) returns the list of what falls short.
function repoScan(c, ctx, check, verb) {
    const r = resolveClaimPath(c.root, ctx, 'root');
    if (!r.path) return claimResult(c, 'UNKNOWN', r.detail);
    const root = r.path;
    if (!isDir(root)) return claimResult(c, 'UNKNOWN', `root folder missing: ${root}`);
    let depth = 2;
    if (c.depth) { const d = Number.parseInt(String(c.depth), 10); if (Number.isFinite(d)) depth = d < 1 ? 1 : d; }
    let since = null;
    if (c.since) {
        since = parseIso(String(c.since), true);
        if (since == null) return claimResult(c, 'UNKNOWN', `'since' is not a date: ${c.since}`);
    }
    const ctxRoot = ctx.root || root;
    const accepted = new Map();
    for (const a of asList(c.accepted)) {
        if (a == null || !a.path) continue;
        if (a.reason == null || !String(a.reason).trim()) return claimResult(c, 'UNKNOWN', `accepted entry '${a.path}' has no reason`);
        accepted.set(relKey(String(a.path)), String(a.reason));
    }
    const exclude = asList(c.exclude).filter((x) => x).map((x) => relKey(String(x)));
    const whereList = c.where && c.where.anyOf ? asList(c.where.anyOf).map((g) => globRegex(String(g))) : null;
    let selected = 0; let met = 0; const fails = []; const grand = []; const acc = [];
    for (const repo of scanRepos(root, depth)) {
        const relRaw = relUnder(repo, ctxRoot) ?? repo;
        const rk = relKey(relRaw);
        if (excluded(rk, exclude)) continue;
        const files = repoFiles(repo);
        // Any file matching any glob selects the repository; stop at the first one.
        if (whereList && !whereList.some((rx) => files.some((f) => rx.test(f.rel)))) continue;
        selected++;
        const missing = check(repo, files);
        if (missing.length === 0) { met++; continue; }
        if (accepted.has(rk)) { acc.push(`${relRaw} (${missing.join(', ')})`); continue; }
        if (since != null) {
            const born = firstCommitDate(repo);
            if (born != null && born < since) { grand.push(`${relRaw} (${missing.join(', ')})`); continue; }
        }
        fails.push(`${relRaw}: ${missing.join(', ')}`);
    }
    if (selected === 0) {
        // emptyOk: a claim that ships to a root which may hold no matching repository yet (a template
        // claim on a fresh adopt) says so, and "every selected repository complies" is then true of
        // none. Without it nothing selected stays UNKNOWN: in a populated root it means the selector
        // is broken.
        if (c.emptyOk === true) return claimResult(c, 'PASS', `nothing selected under ${root} yet (emptyOk); 0 repositories checked`);
        return claimResult(c, 'UNKNOWN', `nothing selected under ${root} (no repository matched 'where'); nothing was checked`);
    }
    let tail = '';
    if (grand.length > 0) tail += `; ${grand.length} predate ${isoDay(since)} and are reported, not failed: ${grand.slice(0, 12).join(' | ')}`;
    if (acc.length > 0) tail += `; ${acc.length} accepted: ${acc.slice(0, 12).join(' | ')}`;
    if (fails.length === 0) return claimResult(c, 'PASS', `${met} of ${selected} repositories under ${root} ${verb}${tail}`);
    const more = fails.length > 12 ? ` (+${fails.length - 12} more)` : '';
    return claimResult(c, 'FAIL', `${fails.length} of ${selected} repositories under ${root} fall short: ${fails.slice(0, 12).join(' | ')}${more}${tail}`);
}

export function treeEachClaim(c, ctx) {
    const reqs = asList(c.require).filter((x) => x != null);
    if (reqs.length === 0) return claimResult(c, 'UNKNOWN', "claim has no 'require'");
    return repoScan(c, ctx, (repo, files) => reqs.map((r) => requirement(r, repo, files)).filter((m) => m), 'meet the requirement');
}

// ---------------------------------------------------------------- tree_rules
// The regex scan (2026-10-08). Same selection as tree_each, then per repository: every file matching
// `files` (a glob, '|'-joined) and not matching an `except` glob is read, and each rule is applied:
//   { id, forbid: <regex> }                  no line may match; a line that also matches `allowOnLine`,
//                                            or whose previous line does, is not counted (a reason written
//                                            next to the exception is the exception)
//   { id, when: <regex>, require: <regex> }  a file that matches `when` anywhere must also match `require`
// A rule may carry its own `files` glob. A repository with any hit falls short; the detail names
// rule, file and line for the first hits. Carries SAFE-05, OBS-04, SKIN-03, SKIN-04, GAME-07.
const BLOCK_COMMENT_EXT = ['.css', '.scss', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];

// True when a match of `pattern` inside one line guarantees a match somewhere in the whole text under
// the multiline flag. That holds for a pattern built from literals, classes, quantifiers, groups,
// alternation, ^, $, \b and \B. It does not hold when the pattern can look outside its line or refuse
// to backtrack, so any group construct other than (?:...) and the anchors \A \z \Z \G switch the
// whole-text check off for that rule, and the rule is read line by line.
function lineLocalPattern(p) { return !/\(\?(?!:)/i.test(p) && !/\\[AzZG]/.test(p); }

// Blanks every /* ... */ block comment: each character inside becomes a space and every newline
// stays, so the text keeps its line count and a hit still reports the right line. Used by forbid
// rules only; a when/require rule still reads the raw text.
function blankBlockComments(text) { return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')); }

export function treeRulesClaim(c, ctx) {
    const rules = asList(c.rules).filter((x) => x != null);
    if (rules.length === 0) return claimResult(c, 'UNKNOWN', "claim has no 'rules'");
    for (const r of rules) {
        if (!r.id) return claimResult(c, 'UNKNOWN', 'a rule has no id');
        if (!r.forbid && !(r.when && r.require)) return claimResult(c, 'UNKNOWN', `rule '${r.id}' needs forbid, or when + require`);
    }
    const defaultFiles = c.files ? String(c.files) : '**/*';
    const exceptRx = asList(c.except).filter((x) => x).map((g) => globRegex(String(g)));
    const allowRx = c.allowOnLine ? toRegex(String(c.allowOnLine), 'i') : null;
    // One entry per rule, built once per claim: the rule and its file glob. A forbid regex is built at
    // the first file the rule reads, so a bad pattern fails the claim in the same way.
    const plan = rules.map((r) => ({ rule: r, glob: globRegex(r.files ? String(r.files) : defaultFiles), frx: null, mrx: null, lineLocal: false }));
    return repoScan(c, ctx, (repo, files) => {
        // Files outside, rules inside: a file is read once however many rules cover it, and each rule
        // still sees the files in the same order, so its count and its first hits are the same.
        const tally = plan.map(() => ({ hits: [], n: 0 }));
        for (const f of files) {
            const apply = plan.map((p, k) => (p.glob.test(f.rel) ? k : -1)).filter((k) => k >= 0);
            if (apply.length === 0) continue;
            if (exceptRx.some((e) => e.test(f.rel))) continue;
            let text;
            try { text = readText(f.full); } catch { continue; }
            let norm = null; let lines = null; let rawLines = null;
            for (const k of apply) {
                const p = plan[k]; const r = p.rule; const st = tally[k];
                if (r.forbid) {
                    if (p.frx == null) {
                        p.frx = toRegex(String(r.forbid), 'i');
                        p.lineLocal = lineLocalPattern(String(r.forbid));
                        if (p.lineLocal) p.mrx = toRegex(String(r.forbid), 'im');
                    }
                    // A comment is not code (0.1.19). Block comments are blanked before a forbid rule
                    // reads the file, newlines kept so line numbers still point at the right line.
                    // Line comments (`//`, `#`) are NOT blanked: `//` lives inside url(...) in CSS.
                    if (norm == null) {
                        norm = text.replace(/\r\n/g, '\n');
                        if (BLOCK_COMMENT_EXT.includes(path.extname(f.rel).toLowerCase())) norm = blankBlockComments(norm);
                    }
                    // The whole-text check: no match in the text means no line can match, so the line
                    // loop is skipped.
                    if (p.lineLocal && !p.mrx.test(norm)) continue;
                    if (lines == null) lines = norm.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (!p.frx.test(lines[i])) continue;
                        // allowOnLine reads the RAW line: the reason beside an exception usually IS a
                        // comment, and the blanking above must not erase the very words that excuse it.
                        if (allowRx) {
                            if (rawLines == null) rawLines = text.replace(/\r\n/g, '\n').split('\n');
                            if (allowRx.test(rawLines[i]) || (i > 0 && allowRx.test(rawLines[i - 1]))) continue;
                        }
                        st.n++; if (st.hits.length < 3) st.hits.push(`${f.rel}:${i + 1}`);
                    }
                } else if (toRegex(String(r.when), 'i').test(text) && !toRegex(String(r.require), 'i').test(text)) {
                    st.n++; if (st.hits.length < 3) st.hits.push(f.rel);
                }
            }
        }
        const out = [];
        plan.forEach((p, k) => {
            const st = tally[k];
            if (st.n > 0) out.push(`${p.rule.id}: ${st.hits.join(' ')}${st.n > st.hits.length ? ` +${st.n - st.hits.length}` : ''}`);
        });
        return out;
    }, 'pass every rule');
}
