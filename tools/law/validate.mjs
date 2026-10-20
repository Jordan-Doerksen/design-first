// validate.mjs - clause and mechanism validation for build-law.mjs. Imported; not a CLI.
// newValidator({ kitRoot, brainRoot }) returns { problems, warnings, check(clause, groupNames) }.

import fs from 'node:fs';
import path from 'node:path';
import { parseJson } from '../../hooks/lib/json.mjs';

export const GRADE_ORDER = ['DENY', 'HOOK', 'ADVISE', 'GATE', 'BUILDABLE', 'OWNER', 'HONOUR'];
// 'survey' (0.2.7): a Doctor survey finding at warn severity, cited by its anchor in
// tools/doctor/survey.mjs. A warn never changes the verdict, so it grades ADVISE and nothing above;
// until 0.2.7 such a clause had to name kind 'hook' on a script that is not a hook (DES-09 and
// VCS-04 in a brain overlay did), which LAW.md then printed as a hook.
const MECH_KINDS = ['permission-rule', 'hook', 'doctor-claim', 'tool', 'survey', 'planned'];
// A declaration in a comment line: '// anchor: <name>  mode: <deny|advise|gate>  verbs: <a,b>' ('#'
// starts the comment in a JSON-free text file or a shell script).
const ANCHOR_RX = /^\s*(?:\/\/|#)\s*anchor:\s*(?<name>\S+)\s+mode:\s*(?<mode>deny|advise|gate)\s+verbs:\s*(?<verbs>\S+)/i;
const CLAIM_ID_RX = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/i;
// The script files a mechanism can live in, and the ones hooks.json can register.
const SCRIPT_EXT_RX = /\.(mjs|cjs|js)$/i;

const ieq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const iin = (x, list) => list.some((v) => ieq(x, v));
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

export function getProp(obj, name) {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
    const k = Object.keys(obj).find((x) => ieq(x, name));
    return k === undefined ? null : obj[k];
}

export function readJsonFile(p) { return parseJson(fs.readFileSync(p, 'utf8')); }

const readLines = (p) => {
    let t = fs.readFileSync(p, 'utf8');
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    return t.split(/\r?\n/);
};
const byName = (a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : a < b ? -1 : a > b ? 1 : 0);

export function newValidator({ kitRoot, brainRoot }) {
    const problems = [];
    const warnings = [];
    const skipHooks = process.env.DF_SKIP_HOOK_FILES === '1';
    const skipOwners = process.env.DF_SKIP_OWNER_FILES === '1';
    const addProblem = (id, text) => problems.push(`FAIL ${id}: ${text}`);
    const addWarning = (id, text) => warnings.push(`WARN ${id}: ${text}`);

    // A referenced file is required to exist. Mechanism files from a chunk that has not landed may be
    // downgraded to a warning with DF_SKIP_HOOK_FILES=1; owning files with DF_SKIP_OWNER_FILES=1.
    function requiredFile(id, p, what, skippable) {
        if (isFile(p)) return true;
        if (skippable) { addWarning(id, `${what} not found yet, skipped: ${p}`); return false; }
        addProblem(id, `${what} does not exist: ${p}`);
        return false;
    }

    function clauseShape(c, groupNames) {
        const id = c.id;
        if (!/^[A-Z]{3,5}-\d{2}$/i.test(id)) addProblem(id, 'id must match ^[A-Z]{3,5}-\\d{2}$');
        if (!iin(c.group, groupNames)) addProblem(id, `group '${c.group}' is not in groups`);
        if (!new RegExp('^' + String(c.group).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-', 'i').test(id)) addProblem(id, `id prefix does not match group '${c.group}'`);
        if (!/^[a-z]+(-[a-z]+)*$/i.test(String(c.verb))) addProblem(id, 'verb must be one lowercase word or a hyphenated phrase');
        if (!String(c.rule).trim()) addProblem(id, 'rule is empty');
        if (!/^(kit|brain):[^\s\\]+\.md$/i.test(String(c.owner))) addProblem(id, `owner must be kit:<path>.md or brain:<path>.md, got '${c.owner}'`);
        if (!iin(c.grade, GRADE_ORDER)) addProblem(id, `grade '${c.grade}' is not a defined grade`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.since))) addProblem(id, 'since must be an ISO date');
    }

    // A clause never carries a value. Hard fails are unambiguous; bare digits and number words warn.
    function ruleValues(c) {
        const id = c.id; const r = String(c.rule);
        if (/#[0-9A-Fa-f]{3,8}\b/i.test(r)) addProblem(id, 'rule carries a hex value');
        if (/\b\d+(\.\d+)?\s?(px|em|rem|pt|ms|s|%|days?|hours?|minutes?|seconds?|lines?|files?|repos?|commits?)\b/i.test(r)) addProblem(id, 'rule carries a number with a unit');
        if (/\bline \d+/i.test(r)) addProblem(id, 'rule carries a line number');
        if (/\d{4}-\d{2}-\d{2}/.test(r)) addProblem(id, 'rule carries a date');
        if (/[A-Za-z]:[\\/]|\\\\|\b[\w.-]+[\\/][\w.-]+[\\/]|[\w-]+\/[\w-]+\.\w+/i.test(r)) addProblem(id, 'rule carries a path');
        if (/\d/.test(r)) addWarning(id, 'rule carries a bare digit; confirm it is not a value');
        if (/\b(two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\b/i.test(r)) addWarning(id, 'rule carries a number in words; confirm it is not a threshold');
        if (r.split(/(?<=[.!?])\s+(?=[A-Z])/i).length > 1) addWarning(id, 'rule looks like more than one sentence');
    }

    // SKIN-07 (build-law.mjs#no-count): a count in a rule goes stale silently. A number before a
    // plural noun, or any number of two or more digits, fails; a bare single digit keeps its warning.
    function ruleCount(c) {
        const id = c.id; const r = String(c.rule);
        // The digits of a clause id (OWN-04, VOICE-09) are not a count: the lookbehind skips a number
        // that follows a group letter and a hyphen. Seen 2026-10-14 on the first instance's overlay.
        let m;
        if ((m = /(?<![A-Z]-)\b\d+\s+[A-Za-z]+(s|es)\b/i.exec(r))) addProblem(id, `rule carries a count ('${m[0]}'); read the catalogue for the current number instead (SKIN-07)`);
        else if ((m = /(?<![A-Z]-)\b\d{2,}\b/i.exec(r))) addProblem(id, `rule carries a number of two or more digits ('${m[0]}'); a count in a law goes stale silently (SKIN-07)`);
    }

    // PRIN-05 (build-law.mjs#state-once): one subject, one file. The "### ID" headings of every law
    // file are indexed once; a clause must have its heading in exactly one file, and that file must be
    // its owner. Kit law files: instructions/, workflows/, lessons/. Brain law files, when a brain root
    // is given: the brain's instructions/, workflows/, projects/ and its top-level .md files.
    let headingIndex = null;
    function getHeadingIndex() {
        if (headingIndex) return headingIndex;
        const idx = new Map();
        const dirs = ['instructions', 'workflows', 'lessons'].map((d) => ({ base: kitRoot, ns: 'kit', dir: d }));
        if (brainRoot) for (const d of ['instructions', 'workflows', 'projects', '.']) dirs.push({ base: brainRoot, ns: 'brain', dir: d });
        for (const d of dirs) {
            const full = path.join(d.base, d.dir);
            if (!isDir(full)) continue;
            const files = fs.readdirSync(full, { withFileTypes: true }).filter((e) => e.isFile() && /\.md$/i.test(e.name)).map((e) => e.name).sort(byName);
            for (const f of files) {
                const rel = d.dir === '.' ? f : `${d.dir}/${f}`;
                const key = `${d.ns}:${rel}`;
                for (const line of readLines(path.join(full, f))) {
                    const m = /^###\s+([A-Z]{3,5}-\d{2})\b/i.exec(line);
                    if (!m) continue;
                    const hid = m[1];
                    if (!idx.has(hid)) idx.set(hid, []);
                    if (!idx.get(hid).includes(key)) idx.get(hid).push(key);
                }
            }
        }
        headingIndex = idx;
        return idx;
    }
    function headingOnce(c) {
        const id = c.id; const owner = String(c.owner);
        if (/^brain:/i.test(owner) && !brainRoot) return;   // already warned by ownerFile
        const idx = getHeadingIndex();
        const where = idx.get(id) || [];
        // A brain file is the owner's: a heading missing or misplaced there warns, a duplicate fails
        // everywhere. The kit's own files are held to the full rule.
        const soft = /^brain:/i.test(owner) || skipOwners;
        if (where.length === 0) {
            const m = `no '### ${id}' heading in any law file; the owning file ${owner} must carry it (PRIN-05)`;
            if (soft) addWarning(id, m); else addProblem(id, m);
            return;
        }
        if (where.length > 1) { addProblem(id, `'### ${id}' heading is in more than one law file: ${where.join(', ')} (PRIN-05: one subject, one file)`); return; }
        if (!ieq(where[0], owner.replace(/\\/g, '/'))) {
            const m = `'### ${id}' heading is in ${where[0]} but the owner is ${owner} (PRIN-05)`;
            if (soft) addWarning(id, m); else addProblem(id, m);
        }
    }

    function ownerFile(c) {
        const id = c.id;
        const m = /^(?<ns>kit|brain):(?<path>.+)$/i.exec(String(c.owner));
        if (!m) return;
        const ns = m.groups.ns.toLowerCase(); const rel = m.groups.path;
        if (ns === 'kit') { requiredFile(id, path.join(kitRoot, rel), 'owning file', skipOwners); return; }
        if (brainRoot) requiredFile(id, path.join(brainRoot, rel), 'owning file (brain)', skipOwners);
        else addWarning(id, `owner '${c.owner}' not checked: no -BrainRoot given`);
    }

    function resolveRefFile(rel, fromOverlay) {
        const p = path.join(kitRoot, rel);
        if (isFile(p)) return p;
        if (fromOverlay && brainRoot) {
            const b = path.join(brainRoot, rel);
            if (isFile(b)) return b;
        }
        return p;
    }

    let claimCache = null; let claimFilesSeen = 0;
    function claimIds() {
        if (claimCache) return claimCache;
        const ids = new Set();
        const files = [path.join(kitRoot, 'tools', 'doctor', 'claims.json')];
        if (brainRoot) files.push(path.join(brainRoot, 'claims.json'));
        claimFilesSeen = 0;
        for (const f of files) {
            if (!isFile(f)) continue;
            claimFilesSeen++;
            const claims = getProp(readJsonFile(f), 'claims');
            for (const cl of Array.isArray(claims) ? claims : []) { const cid = getProp(cl, 'id'); if (cid) ids.add(String(cid)); }
        }
        claimCache = ids;
        return ids;
    }

    // The anchor is looked for in the referenced script first, then in its lib/ siblings (a script
    // split by domain keeps its public ref). Exactly one declaration must exist. Mode <-> grade is
    // mechanical: a hook anchor declares deny (HOOK) or advise (ADVISE); a tool anchor declares gate
    // (GATE). A tool ref without an anchor, or whose anchor does not name the clause verb, fails
    // generation, so a GATE grade cannot be claimed on a fictitious refusal.
    function anchor(c, file, name, kind) {
        const id = c.id;
        const want = kind === 'tool' ? 'gate' : kind === 'survey' ? 'advise' : ieq(c.grade, 'HOOK') ? 'deny' : 'advise';
        const files = [file];
        const lib = path.join(path.dirname(file), 'lib');
        if (isDir(lib)) {
            for (const f of fs.readdirSync(lib).filter((x) => SCRIPT_EXT_RX.test(x)).sort(byName)) files.push(path.join(lib, f));
        }
        const hits = [];
        for (const f of files) {
            for (const line of readLines(f)) {
                const m = ANCHOR_RX.exec(line);
                if (m && ieq(m.groups.name, name)) hits.push({ file: f, mode: m.groups.mode, verbs: m.groups.verbs });
            }
        }
        if (hits.length > 1) { addProblem(id, `anchor '${name}' is declared more than once: ${hits.map((h) => h.file).join(', ')}`); return; }
        if (hits.length === 1) {
            const h = hits[0];
            if (!iin(c.verb, h.verbs.split(','))) addProblem(id, `anchor '${name}' verbs (${h.verbs}) do not include clause verb '${c.verb}'`);
            if (!ieq(h.mode, want)) addProblem(id, `anchor '${name}' declares mode ${h.mode} but grade ${c.grade} needs ${want}`);
            return;
        }
        const msg = `anchor '${name}' not found in ${file} or its lib/ (expected a line '// anchor: ${name}  mode: ${want}  verbs: <a,b>')`;
        if (skipHooks) addWarning(id, `${msg}, skipped`); else addProblem(id, msg);
    }

    function jsonPath(c, file, jp) {
        const id = c.id;
        let node = readJsonFile(file);
        for (const seg of jp.split('.')) {
            node = getProp(node, seg);
            if (node == null) { addProblem(id, `json path '${jp}' not found in ${file}`); return null; }
        }
        const leaf = jp.split('.').pop();
        if (ieq(c.grade, 'DENY') && !ieq(leaf, 'deny')) addProblem(id, `DENY needs a permission rule under 'deny', got '${leaf}'`);
        if (ieq(c.grade, 'GATE') && !ieq(leaf, 'ask')) addProblem(id, `GATE via permission rule needs a rule under 'ask', got '${leaf}'`);
        // Coverage rule: a shell rule ships as Bash(...) and PowerShell(...) twins.
        const rules = (Array.isArray(node) ? node : [node]).map(String);
        for (const rule of rules) {
            const m = /^(?<tool>Bash|PowerShell)\((?<body>.*)\)$/i.exec(rule);
            if (m) {
                const twin = ieq(m.groups.tool, 'Bash') ? `PowerShell(${m.groups.body})` : `Bash(${m.groups.body})`;
                if (!iin(twin, rules)) addProblem(id, `coverage: '${rule}' has no twin '${twin}' in ${jp}`);
            }
        }
        return node;
    }

    // A hook acts only when hooks/hooks.json registers its script. An anchor in a script that nothing
    // registers is a real line that never runs, and a clause graded on it printed HOOK or ADVISE in every
    // LAW.md with no warning (render.mjs keeps the kit grade for a hook the installed state does not
    // name). Found by the CR-2026-10-15-GAPS review. The registry is the script paths under hooks/ in
    // each entry's command or args, read once per build. Workaround: a path, not a file name. Compared
    // by file name alone, a clause on hooks/lib/guard.mjs passed because hooks/guard.mjs is registered,
    // and a script registered in a subfolder of hooks/ was never found.
    let registry = null;
    function hookRegistry() {
        if (registry) return registry;
        const p = path.join(kitRoot, 'hooks', 'hooks.json');
        const reg = { path: p, why: '', names: new Set() };
        if (!isFile(p)) reg.why = 'does not exist';
        else {
            let hj = null;
            try { hj = readJsonFile(p); } catch { reg.why = 'is not JSON'; }
            const events = getProp(hj, 'hooks');
            if (!reg.why && events == null) reg.why = "has no 'hooks' object";
            if (!reg.why) {
                for (const entries of Object.values(events)) {
                    for (const entry of Array.isArray(entries) ? entries : [entries]) {
                        for (const h of Array.isArray(getProp(entry, 'hooks')) ? getProp(entry, 'hooks') : []) {
                            const cmd = getProp(h, 'command'); const args = getProp(h, 'args');
                            const text = [cmd, ...(Array.isArray(args) ? args : args != null ? [args] : [])].filter((x) => x != null).join(' ');
                            for (const m of text.matchAll(/(?<![\w.-])hooks[\\/]+((?:[\w.-]+[\\/]+)*[\w.-]+\.(?:mjs|cjs|js))/g)) reg.names.add(m[1].replace(/[\\/]+/g, '/').toLowerCase());
                        }
                    }
                }
            }
        }
        registry = reg;
        return reg;
    }
    // Kit hook scripts only: a ref that resolved into the brain (an overlay clause) is not the kit's to
    // register, and the kit's hooks.json says nothing about it.
    function hookRegistered(c, p) {
        const id = c.id;
        const kitHooks = path.resolve(kitRoot, 'hooks') + path.sep;
        const full = path.resolve(p);
        if (!full.toLowerCase().startsWith(kitHooks.toLowerCase())) return;
        const rel = full.slice(kitHooks.length).replace(/[\\/]+/g, '/');   // 'guard.mjs', 'lib/guard-rules.mjs'
        const reg = hookRegistry();
        if (reg.why) {
            const msg = `hooks/hooks.json ${reg.why} (${reg.path}), so nothing shows that ${rel} is registered`;
            if (skipHooks) addWarning(id, `${msg}, skipped`); else addProblem(id, msg);
            return;
        }
        if (!reg.names.has(rel.toLowerCase())) addProblem(id, `hook script '${rel}' is not registered in hooks/hooks.json, so it never runs; register it, or grade the clause by what does run (a lib/ file runs through the script that loads it: name that script in the ref)`);
    }

    function enforcement(c) {
        const id = c.id; const g = String(c.grade).toUpperCase(); const e = c.enforcedBy;
        if (g === 'OWNER' || g === 'HONOUR') {
            if (e != null) addProblem(id, `grade ${c.grade} carries no enforcedBy`);
            return;
        }
        if (e == null) { addProblem(id, `grade ${c.grade} needs an enforcedBy`); return; }
        const kind = String(e.kind ?? ''); const ref = String(e.ref ?? '');
        if (!iin(kind, MECH_KINDS)) { addProblem(id, `enforcedBy.kind '${kind}' is not one of ${MECH_KINDS.join(', ')}`); return; }
        if (!ref.trim()) { addProblem(id, 'enforcedBy.ref is empty'); return; }
        const need = { DENY: ['permission-rule'], HOOK: ['hook'], ADVISE: ['hook', 'survey'], GATE: ['permission-rule', 'doctor-claim', 'tool'], BUILDABLE: ['planned'] }[g] || [];
        if (!iin(kind, need)) { addProblem(id, `grade ${c.grade} cannot be enforced by kind '${kind}' (allowed: ${need.join(', ')})`); return; }
        const k = kind.toLowerCase();
        if (k === 'planned') return;   // a CR reference; not resolved against the disk
        if (k === 'doctor-claim') {
            if (!CLAIM_ID_RX.test(ref)) { addProblem(id, `'${ref}' is not a claim id`); return; }
            const ids = claimIds();
            if (claimFilesSeen === 0) {
                const msg = `no claims file found (tools/doctor/claims.json${brainRoot ? ' or brain claims.json' : ''}) to resolve '${ref}'`;
                if (skipHooks) addWarning(id, `${msg}, skipped`); else addProblem(id, msg);
                return;
            }
            if (!ids.has(ref)) addProblem(id, `claim id '${ref}' is not defined in any claims file`);
            return;
        }
        const cut = ref.indexOf('#');
        const file = cut >= 0 ? ref.slice(0, cut) : ref;
        const frag = cut >= 0 ? ref.slice(cut + 1) : '';
        const p = resolveRefFile(file, c.source === 'overlay');
        if (!requiredFile(id, p, `mechanism file for ${kind}`, skipHooks)) return;
        if (k === 'hook') { if (!frag) addProblem(id, 'a hook ref needs #<anchor>'); else { anchor(c, p, frag, k); hookRegistered(c, p); } }
        else if (k === 'permission-rule') { if (!frag) addProblem(id, 'a permission-rule ref needs #<json.path>'); else jsonPath(c, p, frag); }
        else if (k === 'survey') { if (!frag) addProblem(id, 'a survey ref needs #<anchor> (the line that files the warn finding)'); else anchor(c, p, frag, k); }
        else if (k === 'tool') { if (!frag) addProblem(id, 'a tool ref needs #<anchor> (a tool refusal is a real line in the script, not a file name)'); else anchor(c, p, frag, k); }
    }

    function check(c, groupNames) {
        clauseShape(c, groupNames);
        ruleValues(c);
        ruleCount(c);
        ownerFile(c);
        headingOnce(c);
        enforcement(c);
    }

    return { problems, warnings, addProblem, addWarning, check };
}
