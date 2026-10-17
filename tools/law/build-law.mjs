// build-law.mjs - generates LAW.md from law.json (+ optional overlay).
// CLI CONTRACT:
//   node tools/law/build-law.mjs -Source <law.json> [-Overlay <law.overlay.json>] [-Installed <state.json>] -Out <LAW.md> [-BrainRoot <dir>]
//   Exit 0 = written. Exit 1 = validation failure (message names the clause id and the rule broken).
//   Output bytes: UTF-8 without BOM, LF, deterministic order (group order as listed in law.json, then id), no timestamp.
//   Idempotent: same inputs -> identical bytes.
//
// -BrainRoot   resolves brain: owners, overlay refs and the brain claims.json. Without it, brain: owners are not checked (warning).
// -Installed   JSON { "hooks": { "guard": true, "fence": true, "entry": true }, "rootSettings": true, "pointer": true }.
//              A clause whose mechanism the file records as false prints HONOUR with a "(mechanism not installed)"
//              note, and so does one on rootSettings or pointer when that key is absent. A hook the file does not
//              name keeps its kit grade (render.mjs, CR-2026-10-15-GAPS D6).
// Two checks here are law mechanisms (CR-2026-10-13-HONOUR), implemented in validate.mjs:
// anchor: state-once  mode: gate  verbs: state-once
//   a clause's "### ID" heading exists in exactly one law file, and that file is its owner (PRIN-05)
// anchor: no-count  mode: gate  verbs: snapshot-count
//   a rule text carries no count: no number before a plural noun, no number of two or more digits (SKIN-07)
//
// Build-time escape hatches, never for a Doctor run:
//   DF_SKIP_HOOK_FILES=1   a referenced mechanism file (hook script, claims file) that does not exist yet warns instead of failing
//   DF_SKIP_OWNER_FILES=1  an owning file that does not exist yet warns instead of failing

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../lib/args.mjs';
import { newValidator, getProp, readJsonFile } from './validate.mjs';
import { formatLaw } from './render.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(msg) { process.stderr.write(msg + '\n'); process.exit(1); }
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function toClause(raw, source) {
    const e = getProp(raw, 'enforcedBy');
    const s = (k) => { const v = getProp(raw, k); return v == null ? '' : String(v); };
    return {
        id: s('id'), group: s('group'), verb: s('verb'), rule: s('rule'), owner: s('owner'), grade: s('grade'),
        enforcedBy: e != null ? { kind: String(getProp(e, 'kind') ?? ''), ref: String(getProp(e, 'ref') ?? '') } : null,
        since: s('since'), source,
    };
}

let opts;
try { opts = parseArgs(process.argv.slice(2), { values: ['Source', 'Overlay', 'Installed', 'Out', 'BrainRoot'] }); }
catch (e) { fail(`build-law: ${e.message}`); }
if (!opts.Source || !opts.Out) fail('build-law: -Source <law.json> and -Out <LAW.md> are required');
const brainRoot = opts.BrainRoot ? path.resolve(opts.BrainRoot) : null;
const V = newValidator({ kitRoot: KIT_ROOT, brainRoot });

// ---- load ----------------------------------------------------------------------------------------
const source = path.resolve(opts.Source); const out = path.resolve(opts.Out);
if (!isFile(source)) fail(`build-law: source not found: ${source}`);
const law = readJsonFile(source);
if (getProp(law, 'schema') !== 1) fail('build-law: law.json schema must be 1');
const groups = getProp(law, 'groups');
if (groups == null) fail('build-law: law.json has no groups');
const groupNames = Object.keys(groups);
const rawClauses = getProp(law, 'clauses') || [];
if (rawClauses.length === 0) fail('build-law: law.json has no clauses');

const byId = new Map();
for (const raw of rawClauses) {
    const c = toClause(raw, 'kit');
    if (byId.has(c.id)) { V.addProblem(c.id, 'duplicate id in law.json'); continue; }
    byId.set(c.id, c);
}

// ---- overlay --------------------------------------------------------------------------------------
if (opts.Overlay) {
    const overlay = path.resolve(opts.Overlay);
    if (!isFile(overlay)) fail(`build-law: overlay not found: ${overlay}`);
    const ov = readJsonFile(overlay);
    for (const raw of getProp(ov, 'clauses') || []) {
        const c = toClause(raw, 'overlay');
        if (byId.has(c.id)) { V.addProblem(c.id, 'overlay clause duplicates an existing id (use overrides to change a kit clause)'); continue; }
        byId.set(c.id, c);
    }
    const overrides = getProp(ov, 'overrides');
    if (overrides != null) {
        for (const [id, value] of Object.entries(overrides)) {
            if (!byId.has(id) || byId.get(id).source !== 'kit') { V.addProblem(id, 'override names an id that is not a kit clause'); continue; }
            const target = byId.get(id);
            const kitGrade = target.grade; let setEnforced = false;
            for (const [k, v] of Object.entries(value || {})) {
                switch (k.toLowerCase()) {
                    case 'grade': target.grade = String(v); break;
                    case 'owner': target.owner = String(v); break;
                    case 'enforcedby': setEnforced = true; target.enforcedBy = v != null ? { kind: String(getProp(v, 'kind') ?? ''), ref: String(getProp(v, 'ref') ?? '') } : null; break;
                    default: V.addProblem(id, `override key '${k}' is not one of grade, owner, enforcedBy`);
                }
            }
            // Grades are mechanical (DECISIONS 2.2). An override that lowers a clause to OWNER or
            // HONOUR while the kit's mechanism still stands would print a grade below the truth;
            // the mechanism wins and the override is reported. Seen 2026-10-13: five overrides
            // written when those clauses were HONOUR, after the kit gave them an ADVISE anchor.
            if (['OWNER', 'HONOUR'].includes(target.grade.toUpperCase()) && target.enforcedBy != null && !setEnforced) {
                V.addWarning(id, `override grade ${target.grade} ignored: the kit enforces this clause at ${kitGrade} (${target.enforcedBy.kind}: ${target.enforcedBy.ref}); remove the override, or set enforcedBy to null in it to drop the mechanism on purpose`);
                target.grade = kitGrade;
            }
            target.source = 'overlay';
        }
    }
}

// ---- installed state --------------------------------------------------------------------------------
let installedState = null;
if (opts.Installed) {
    const installed = path.resolve(opts.Installed);
    if (!isFile(installed)) fail(`build-law: installed state not found: ${installed}`);
    installedState = readJsonFile(installed);
}

// ---- validate --------------------------------------------------------------------------------------
const clauses = [...byId.values()];
for (const c of clauses) V.check(c, groupNames);

for (const w of V.warnings) process.stdout.write(w + '\n');
if (V.problems.length > 0) {
    for (const p of V.problems) process.stdout.write(p + '\n');
    fail(`build-law: ${V.problems.length} validation failure(s); nothing written`);
}

// ---- render + write -------------------------------------------------------------------------------
const text = formatLaw(groups, clauses, installedState);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text, 'utf8');
process.stdout.write(`build-law: wrote ${out} (${clauses.length} clauses, ${V.warnings.length} warning(s))\n`);
