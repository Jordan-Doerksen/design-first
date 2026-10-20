// law-rows.mjs - shared by route.mjs (UserPromptSubmit), subagent.mjs (SubagentStart) and the state
// card. Never run directly.
//
// Reads the generated LAW.md (the brain's when there is a brain, else the kit's) and returns the
// rows of one group as plain text: one clause per line, grade in brackets, then the owning files,
// relative to the kit or brain folder that lawFoldersLine names once per injection, so the agent
// can open the full text. PRIN-03: the rows are read from the
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

// The kit root: the copy that is running first, the pointer's pluginRoot only when the running copy
// has no law.json. This file lives in hooks/lib, so the plugin root is two folders up. Workaround
// (CR-2026-10-16-ONEWRITER chunk 0, ported in 0.2.3): the pointer came first, so after a plugin
// update the owning-file paths in the routed law rows could name another version than the hook
// code until entry.mjs refreshed the pointer (CR-2026-10-19-REVIEW F2).
export function kitRoot(ptr) {
    const running = toFullPath(KIT_FROM_HERE);
    if (running && isFile(path.join(running, 'law.json'))) return running;
    if (ptr.pointer && ptr.pointer.pluginRoot) return toFullPath(String(ptr.pointer.pluginRoot));
    return running;
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

// An owner as { base, rel }: base 'kit' or 'brain' with the path inside that folder, or base null
// with the owner as written (a brain: owner when there is no brain, or a form with no prefix).
function ownerRef(owner, ptr) {
    const o = owner.trim();
    let m;
    const inside = (p) => path.normalize(p.trim()).replace(/^[\\/]+/, '');
    if ((m = /^kit:(.+)$/i.exec(o))) return { base: 'kit', rel: inside(m[1]) };
    if ((m = /^brain:(.+)$/i.exec(o)) && ptr.brain) return { base: 'brain', rel: inside(m[1]) };
    return { base: null, rel: o };
}

// The folders the full-text paths are relative to, named once at the top of each injection (route
// and subagent). Workaround (CR-2026-10-17-PATHS): every group's full-text line named its files by
// full path, so the kit folder was printed once per file. An installed kit sits in the plugin
// cache, about 66 characters deep, and with SAFE, DES, VCS and OBS active a subagent's injection
// passed the 9,500 cap once the kit path passed 58 characters: the Reviewer got the ADVISE clause
// ids without their text.
export function lawFoldersLine(ptr, kit) {
    const parts = [`kit folder ${toFullPath(kit)}`];
    if (ptr.brain) parts.push(`brain folder ${toFullPath(ptr.brain)}`);
    return `Full-text paths are relative to the folder each line names: ${parts.join('; ')}.`;
}

// The injectable text for one group. Markdown emphasis is stripped from the rule so the rows read
// as plain lines; the owner files are listed once each, relative to their folder (lawFoldersLine).
export function formatLawGroup(name, group, ptr, kit) {
    if (group == null) return '';
    const lines = [`design-first law for this task, group ${name} (${group.title}): ${group.rows.length} clause(s). Cite the id.`];
    const owners = { kit: [], brain: [], other: [] };
    for (const r of group.rows) {
        const rule = r.rule.replace(/\*\*/g, '').replace(/`/g, '');
        lines.push(`  ${r.id} [${r.grade}] ${rule}`);
        const o = ownerRef(r.owner, ptr);
        const list = owners[o.base || 'other'];
        if (o.rel && !list.includes(o.rel)) list.push(o.rel);
    }
    if (owners.kit.length > 0) lines.push('  full text (kit folder): ' + owners.kit.join(' ; '));
    if (owners.brain.length > 0) lines.push('  full text (brain folder): ' + owners.brain.join(' ; '));
    if (owners.other.length > 0) lines.push('  full text: ' + owners.other.join(' ; '));
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

// Writer sessions (owner ruling 29, 2026-10-20; kit-next batch entry 1). A work session answers its
// master tersely, so the policy's `writerSkip` names law that is about talking to the owner and must not
// reach it: { groups: [group ids dropped whole], clauses: [clause ids dropped one row at a time] }.
// Read-only here; the router and the subagent hook both apply it. Absent or empty: nothing is dropped,
// which is the behaviour before this key existed.
export function writerSkip(policy) {
    const v = prop(policy, 'writerSkip');
    const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]).filter((s) => !isBlank(s)).map((s) => String(s).trim().toLowerCase());
    return { groups: list(prop(v, 'groups')), clauses: list(prop(v, 'clauses')) };
}
export function skipsGroup(skip, name) { return skip.groups.includes(String(name).toLowerCase()); }
// The group without the rows whose clause id the skip names; the group itself when nothing is named.
export function withoutClauses(group, skip) {
    if (group == null || skip.clauses.length === 0) return group;
    return { ...group, rows: group.rows.filter((r) => !skip.clauses.includes(r.id.toLowerCase())) };
}

// The per-session role mark: a file holding 'writer' or 'owner', written once by the router on a
// session's first prompt. Writer = a brief, "Reports to:" at the start of a line.
export function roleFile(sessionId) {
    const dir = getMarkerDir();
    ensureDir(dir);
    return path.join(dir, safeId(sessionId) + '.role');
}
export function isWriterSession(sessionId) {
    const f = roleFile(sessionId);
    return isFile(f) && readText(f).trim() === 'writer';
}
