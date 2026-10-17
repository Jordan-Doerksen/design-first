// law-rows.mjs - shared by route.mjs (UserPromptSubmit), subagent.mjs (SubagentStart) and the state
// card. Never run directly.
//
// Reads the generated LAW.md (the brain's when there is a brain, else the kit's) and returns the
// rows of one group as plain text: one clause per line, grade in brackets, then the owning files
// resolved to real paths so the agent can open the full text. PRIN-03: the rows are read from the
// generated index, never typed here, so a regenerated LAW.md is what gets injected.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toFullPath, isFile, readText, readJson, ensureDir, getMarkerDir, safeId, relUnder, isBlank } from './common.mjs';

const KIT_FROM_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function lawPath(ptr, kitRoot) {
    if (ptr.brain) {
        const p = path.join(ptr.brain, 'LAW.md');
        if (isFile(p)) return p;
    }
    return path.join(kitRoot, 'LAW.md');
}

// The kit of record: the pointer's pluginRoot, else the plugin these hooks run from.
export function kitRoot(ptr) {
    if (ptr.pointer && ptr.pointer.pluginRoot) return toFullPath(String(ptr.pointer.pluginRoot));
    return toFullPath(KIT_FROM_HERE);
}

// A key of a parsed JSON object, found without case, as PowerShell's property lookup does.
export function prop(obj, name) {
    if (obj == null || typeof obj !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
    const k = Object.keys(obj).find((x) => x.toLowerCase() === String(name).toLowerCase());
    return k === undefined ? undefined : obj[k];
}

const GROUP_RX = /^## ([A-Z]+) - (.+)$/i;
const ROW_RX = /^\|\s*([A-Z]+-\d+)\s*\|\s*([A-Z]+)\s*\|\s*(.*?)\s*\|\s*`?([^`|]+?)`?\s*\|\s*$/i;

// Returns a Map GROUP -> { title, rows: [{ id, grade, rule, owner }] }, in file order.
export function readLawGroups(file) {
    const groups = new Map();
    if (!isFile(file)) return groups;
    let cur = null;
    for (const line of readText(file).split(/\r?\n/)) {
        let m;
        if ((m = GROUP_RX.exec(line))) {
            cur = m[1];
            groups.set(cur, { title: m[2].trim(), rows: [] });
            continue;
        }
        if (/^## /.test(line)) { cur = null; continue; }
        if (cur && (m = ROW_RX.exec(line))) groups.get(cur).rows.push({ id: m[1], grade: m[2], rule: m[3], owner: m[4].trim() });
    }
    return groups;
}
export function findGroup(groups, name) {
    if (groups.has(name)) return groups.get(name);
    for (const [k, v] of groups) if (k.toLowerCase() === String(name).toLowerCase()) return v;
    return null;
}

function resolveOwnerPath(owner, ptr, kit) {
    const o = owner.trim();
    let m;
    if ((m = /^kit:(.+)$/i.exec(o))) return toFullPath(path.join(kit, m[1]));
    if ((m = /^brain:(.+)$/i.exec(o))) { if (ptr.brain) return toFullPath(path.join(ptr.brain, m[1])); }
    return o;
}

// The injectable text for one group. Markdown emphasis is stripped from the rule so the rows read
// as plain lines; the owner files are listed once each, resolved.
export function formatLawGroup(name, group, ptr, kit) {
    if (group == null) return '';
    const lines = [`design-first law for this task, group ${name} (${group.title}): ${group.rows.length} clause(s). Cite the id.`];
    const owners = [];
    for (const r of group.rows) {
        const rule = r.rule.replace(/\*\*/g, '').replace(/`/g, '');
        lines.push(`  ${r.id} [${r.grade}] ${rule}`);
        const p = resolveOwnerPath(r.owner, ptr, kit);
        if (p && !owners.includes(p)) owners.push(p);
    }
    if (owners.length > 0) lines.push('  full text: ' + owners.join(' ; '));
    return lines.join('\n');
}

// Route policy: brain first, kit template second. Returns { policy, source, fromBrain }.
export function readRoutePolicy(ptr, kit) {
    const candidates = [];
    if (ptr.brain) candidates.push({ path: path.join(ptr.brain, 'route-policy.json'), fromBrain: true });
    candidates.push({ path: path.join(kit, 'templates', 'route-policy.json'), fromBrain: false });
    for (const c of candidates) {
        if (isFile(c.path)) return { policy: readJson(c.path), source: c.path, fromBrain: c.fromBrain };
    }
    throw new Error('no route policy: neither <brain>/route-policy.json nor the kit template exists');
}

// The per-session route file: one group name per line, in the order they became active.
export function routeFile(sessionId) {
    const dir = getMarkerDir();
    ensureDir(dir);
    return path.join(dir, safeId(sessionId) + '.routes');
}

export function readActiveRoutes(sessionId) {
    const f = routeFile(sessionId);
    if (!isFile(f)) return [];
    return readText(f).split(/\r?\n/).map((s) => s.trim()).filter((s) => s);
}

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Which groups a prompt and a working folder name, per the policy. Order: policy order.
export function matchedGroups(policy, prompt, cwd, root) {
    const hits = [];
    const groups = prop(policy, 'groups');
    if (groups && typeof groups === 'object') {
        for (const [name, value] of Object.entries(groups)) {
            const words = (Array.isArray(value) ? value : [value]).filter((w) => !isBlank(w)).map(String);
            if (words.length === 0) continue;
            const rx = new RegExp('\\b(?:' + words.map(escRx).join('|') + ')\\b', 'i');
            if (rx.test(prompt) && !hits.includes(name)) hits.push(name);
        }
    }
    const folders = prop(policy, 'folders');
    if (folders && cwd && root) {
        const rel = relUnder(cwd, root);
        if (rel != null) {
            const top = rel.split(/[\\/]/)[0];
            const mapped = top ? prop(folders, top) : undefined;
            if (mapped != null) {
                for (const g of Array.isArray(mapped) ? mapped : [mapped]) if (!hits.includes(String(g))) hits.push(String(g));
            }
        }
    }
    return hits;
}

// The maxChars cap of a policy, under the host's 10,000-character limit.
export function policyMaxChars(policy) {
    let max = 9500;
    const v = prop(policy, 'maxChars');
    if (v) {
        const n = Number.parseInt(String(v), 10);
        max = Number.isFinite(n) && String(n) === String(v).trim() ? n : 9500;
        if (max <= 0 || max > 9800) max = 9500;
    }
    return max;
}
