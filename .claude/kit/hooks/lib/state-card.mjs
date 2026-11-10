// state-card.mjs - the state card a session gets when it starts inside a game repository (GAME-13),
// or, with stateCard.anyRepoWithHandoff on, inside any repository that carries a hand-off (DES-14).
// Imported by entry.mjs. Never run directly.
//
// GAME-13: a session on a game repository opens with a state card built from the repository's
// documents, never from memory, and a disagreement with the real state is raised before any work.
// This file builds the half a machine can build: what the manifest and the hand-off say, read from
// the files, beside what git says, read from git. The agent posts it, adds the hats in play, and
// names any disagreement before it starts.
//
// Which repositories get a card is config, not logic. route-policy.json maps a top-level folder
// under root to law groups (`folders`); `stateCard.groups` (default: GAME) names the groups whose
// folders get a card. A session that starts at the root, or in a folder mapped to no such group,
// gets none. Tunables under `stateCard`: groups, staleCommits, lineChars, maxChars, closedWords (the
// status words that mean a timeline row or a question is closed), anyRepoWithHandoff (DES-14,
// CR-2026-10-14-REVIEW: a repository in a folder mapped to no card group still gets a card when it
// holds HANDOFF.md or docs/HANDOFF.md; default false so an update changes nothing for an adopter).
//
// The hand-off's `## Next session` section is the opening prompt for the next session (DES-14). The
// card prints its first paragraph or first fenced block, cut to lineChars; a hand-off without the
// section gets one line saying so. It is never invented.
//
// Measured on the first instance before this was written (27 game repositories): a manifest in 26,
// 12 of them under docs/; a hand-off in 17, all under docs/; "Core Goal", "Build Timeline" and
// "Open Questions" headings in 16; a "next" heading in only 6 hand-offs. So every part is optional,
// both locations are read, and a part that is not there is named as missing, never guessed.
//
// Honest limits: the card fires only when the session STARTS in the repository (most sessions start
// at the root); it reads the documents' shape, not their truth; "N commits behind HEAD" says a
// document is old, not that it is wrong.
//
// anchor: state-card  mode: advise  verbs: open-session

import path from 'node:path';
import { toFullPath, isUnder, pathEq, relUnder, git, readText } from './common.mjs';
import { findNamedFile } from './guard-rules.mjs';
import { kitRoot, readRoutePolicy, prop } from './law-rows.mjs';

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stateCardConfig(policy) {
    const c = {
        groups: ['GAME'], staleCommits: 10, lineChars: 220, maxChars: 2400, anyRepoWithHandoff: false,
        closedWords: ['done', 'shipped', 'built', 'complete', 'completed', 'closed', 'resolved', 'answered', 'live', 'merged', 'released', 'published', 'verified', 'skipped', 'cut', 'dropped', 'retired'],
    };
    const sc = prop(policy, 'stateCard');
    if (sc == null || typeof sc !== 'object') return c;
    if (prop(sc, 'groups') !== undefined) c.groups = asList(prop(sc, 'groups')).filter((x) => x).map(String);
    if (prop(sc, 'anyRepoWithHandoff') !== undefined) c.anyRepoWithHandoff = String(prop(sc, 'anyRepoWithHandoff')).toLowerCase() === 'true';
    const cw = prop(sc, 'closedWords');
    if (cw !== undefined && asList(cw).length > 0) c.closedWords = asList(cw).filter((x) => x).map(String);
    for (const k of ['staleCommits', 'lineChars', 'maxChars']) {
        const v = prop(sc, k);
        if (v !== undefined && /^\s*[+-]?\d+\s*$/.test(String(v)) && Number(v) > 0) c[k] = Number(v);
    }
    return c;
}

function topFolder(cwd, root) {
    const rel = relUnder(cwd, root);
    return rel == null ? null : rel.split(/[\\/]/)[0];
}

// The repository a card is built for, or null: cwd is under root, its top-level folder is mapped to
// a state-card group, and cwd is inside a git repository that sits under that folder.
function cardRepo(cwd, ptr, policy, cfg) {
    if (!cwd || !ptr.root || !isUnder(cwd, ptr.root)) return null;
    const folders = prop(policy, 'folders');
    if (cfg.groups.length === 0 || !policy || !folders) return null;
    const top = topFolder(cwd, ptr.root);
    if (!top) return null;
    const mappedRaw = prop(folders, top);
    if (mappedRaw === undefined) return null;
    const mapped = asList(mappedRaw).map(String);
    if (!mapped.some((g) => cfg.groups.some((x) => x.toLowerCase() === g.toLowerCase()))) return null;
    const r = git(cwd, ['rev-parse', '--show-toplevel']);
    if (r.code !== 0 || r.out.length === 0) return null;
    const repo = toFullPath(r.out[0]);
    const topDir = path.join(ptr.root, top);
    if (!isUnder(repo, topDir) || pathEq(repo, topDir)) return null;
    return repo;
}

// DES-14: the repository a card is built for when the group path above said no, or null: cwd is
// inside a git repository under root (not root itself) that holds a hand-off. Only consulted when
// stateCard.anyRepoWithHandoff is on.
function handoffRepo(cwd, ptr) {
    if (!cwd || !ptr.root || !isUnder(cwd, ptr.root)) return null;
    const r = git(cwd, ['rev-parse', '--show-toplevel']);
    if (r.code !== 0 || r.out.length === 0) return null;
    const repo = toFullPath(r.out[0]);
    if (!isUnder(repo, ptr.root) || pathEq(repo, ptr.root)) return null;
    if (!findCardDoc(repo, 'HANDOFF.md')) return null;
    return repo;
}

// The document's path relative to the repository, found without case at the root, then in docs/.
function findCardDoc(repo, name) {
    for (const dir of [repo, path.join(repo, 'docs')]) {
        const hit = findNamedFile(dir, name);
        if (hit) return hit.slice(repo.length).replace(/^[\\/]+/, '');
    }
    return null;
}

function cut(s, n) {
    const t = String(s).replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    return t.slice(0, Math.max(1, n - 3)).trimEnd() + '...';
}

// Lines under the first heading whose text matches one of patterns (tried in order), up to the next heading.
function mdSection(lines, patterns) {
    for (const p of patterns) {
        for (let i = 0; i < lines.length; i++) {
            const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]);
            if (!m) continue;
            const title = m[1].replace(/[*_`]/g, '').replace(/^[\d.\s-]+/, '');   // "## 3. Build Timeline" reads as "Build Timeline"
            if (!p.test(title)) continue;
            const body = [];
            for (let k = i + 1; k < lines.length && !/^#{1,6}\s/.test(lines[k]); k++) body.push(lines[k]);
            return { title: title.trim(), body };
        }
    }
    return null;
}

// The first pipe table in a block: { header: cells, rows: list of cells }, or null.
function mdTable(body) {
    const rows = [];
    for (const l of body) {
        const t = l.trim();
        if (!t.startsWith('|')) { if (rows.length > 0) break; continue; }
        if (/^\|[\s:|-]+\|?$/.test(t)) continue;                     // the |---|---| separator
        rows.push(t.replace(/^\|+|\|+$/g, '').split('|').map((c) => c.trim()));
    }
    if (rows.length < 1) return null;
    return { header: rows[0], rows: rows.slice(1) };
}

function prose(body, n) {
    const keep = body.filter((l) => l.trim() && !/^\|/.test(l.trim()) && !/^(---+|```)/.test(l.trim()))
        .map((l) => l.trim().replace(/^([-*+]|\d+\.)\s+/, '').replace(/^>\s*/, ''));
    if (keep.length === 0) return '';
    return cut(keep.slice(0, 4).join(' '), n);
}

// "last changed <date>, N commits behind HEAD" for a tracked document; says so when git has no record.
function docAge(repo, rel) {
    const r = git(repo, ['log', '-1', '--format=%H %cs', '--', rel.replace(/\\/g, '/')]);
    const first = r.out.length ? r.out[0] : '';
    const m = /^([0-9a-f]{7,40}) (\d{4}-\d{2}-\d{2})/i.exec(first);
    if (r.code !== 0 || !m) return { text: 'never committed', behind: -1 };
    const c = git(repo, ['rev-list', '--count', `${m[1]}..HEAD`]);
    let n = -1;
    if (c.code === 0 && c.out.length && /^\d+$/.test(c.out[0].trim())) n = Number(c.out[0].trim());
    const tail = n === 0 ? 'changed in the last commit' : n > 0 ? `${n} commit(s) behind HEAD` : 'age unknown';
    return { text: `last changed ${m[2]}, ${tail}`, behind: n };
}

// The card for one repository, as lines. Every part is optional; a missing part is named.
function stateCard(repo, ptr, cfg, why = 'GAME-13') {
    const n = cfg.lineChars;
    // A status cell is closed when it carries one of the closed words as a whole word, or a tick
    // mark (U+2705, U+2714).
    const closedRx = new RegExp('\\b(' + cfg.closedWords.map(escRx).join('|') + ')\\b|\u2705|\u2714', 'i');
    const out = [];
    const name = ptr.root && isUnder(repo, ptr.root) ? relUnder(repo, ptr.root) : repo;
    out.push(`design-first: state card for ${name} (${why}). Built from the repository's documents and from git, not from memory. Post it before any work; where it disagrees with what you find, say so first.`);

    // git: what is true on the disk
    const b = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = b.code === 0 && b.out.length ? b.out[0].trim() : 'no commit yet';
    const s = git(repo, ['status', '--porcelain']);
    const dirty = s.code === 0 ? s.out.filter((l) => l).length : -1;
    const a = git(repo, ['rev-list', '--count', '@{u}..HEAD']);
    const ahead = a.code === 0 && a.out.length ? a.out[0].trim() + ' unpushed' : 'no upstream branch';
    const l = git(repo, ['log', '-1', '--format=%cs']);
    const last = l.code === 0 && l.out.length ? 'last commit ' + l.out[0].trim() : 'no commit yet';
    out.push(`  git          branch ${branch}; ${dirty >= 0 ? dirty : '?'} uncommitted; ${ahead}; ${last}`);

    // the manifest: what is locked
    const dec = findCardDoc(repo, 'DECISIONS.md');
    if (!dec) out.push('  manifest     none found (DECISIONS.md, docs/DECISIONS.md). No manifest means no locked decisions; say so.');
    else {
        const age = docAge(repo, dec);
        out.push(`  manifest     ${dec}; ${age.text}`);
        const lines = readText(path.join(repo, dec)).split(/\r?\n/);
        const goal = mdSection(lines, [/^core goal/i]);
        if (goal) { const g = prose(goal.body, n); if (g) out.push(`    goal         ${g}`); }
        const tl = mdSection(lines, [/^build timeline/i, /\btimeline\b|\broadmap\b|\bmilestones?\b/i]);
        const tbl = tl ? mdTable(tl.body) : null;
        if (tbl && tbl.rows.length > 0) {
            const si = tbl.header.findIndex((h) => /status/i.test(h));
            if (si < 0) out.push(`    timeline     ${tbl.rows.length} row(s), no status column; read the table`);
            else {
                let closed = 0; let next = null;
                for (const row of tbl.rows) {
                    const st = si < row.length ? String(row[si]) : '';
                    if (closedRx.test(st)) closed++; else if (next == null) next = row;
                }
                let what;
                if (next) {
                    const cells = next.filter((c, i) => i !== si && c);
                    const stText = si < next.length && next[si] ? ` [${next[si]}]` : '';
                    what = 'next open row: ' + cut(cells.slice(0, 2).join(' - ') + stText, n);
                } else what = 'every row is closed';
                out.push(`    timeline     ${closed} of ${tbl.rows.length} row(s) closed; ${what}`);
            }
        }
        const cl = mdSection(lines, [/^change log/i, /^change requests?/i]);
        const ct = cl ? mdTable(cl.body) : null;
        if (ct && ct.rows.length > 0) {
            const lastRow = ct.rows[ct.rows.length - 1];
            out.push('    last change  ' + cut(lastRow.filter((c) => c).slice(0, 2).join(': '), n));
        }
        const oq = mdSection(lines, [/^open questions/i]);
        const ot = oq ? mdTable(oq.body) : null;
        if (ot && ot.rows.length > 0) {
            const open = ot.rows.filter((r) => !closedRx.test(r.join(' '))).length;
            out.push(`    questions    ${open} open of ${ot.rows.length} row(s)`);
        }
    }

    // the hand-off: what the last session said
    const ho = findCardDoc(repo, 'HANDOFF.md');
    if (!ho) out.push('  hand-off     none found (HANDOFF.md, docs/HANDOFF.md). The git log is the only hand-off; say so.');
    else {
        const age = docAge(repo, ho);
        const stale = age.behind > cfg.staleCommits ? `  << STALE: more than ${cfg.staleCommits} commits behind HEAD; read the git log before you trust it` : '';
        out.push(`  hand-off     ${ho}; ${age.text}${stale}`);
        const lines = readText(path.join(repo, ho)).split(/\r?\n/);
        const st = mdSection(lines, [/^(current\s+)?(state|status)\b/i, /^where\b/i]);
        const nx = mdSection(lines, [/^(what(\s+is|.s)\s+)?next\b(?!\s+session)/i, /\bnext\b(?!\s+session)/i]);
        const ns = mdSection(lines, [/^next\s+session\b/i]);
        if (st) { const t = prose(st.body, n); if (t) out.push(`    state        ${t}`); }
        if (nx) { const t = prose(nx.body, n); if (t) out.push(`    next         ${t}`); }
        // DES-14: the next session's opening prompt. A fenced block wins; otherwise the first paragraph.
        let np = '';
        if (ns) {
            let fence = false; const fb = [];
            for (const x of ns.body) {
                if (/^```/.test(x.trim())) { if (fence) break; fence = true; continue; }
                if (fence) fb.push(x);
            }
            np = fb.length > 0 ? cut(fb.join(' '), n) : prose(ns.body, n);
        }
        out.push('    next prompt  ' + (np || 'none; the agent writes its own'));
        if (!st && !nx) {
            const t = prose(lines.filter((x) => !/^#{1,6}\s/.test(x)), n);
            out.push('    opens with   ' + (t || '(empty)') + '  (no state or next heading)');
        }
    }
    out.push('  add          the hats in play. Check the lines above against git status and git log; a stale hand-off is a defect.');

    let text = out.join('\n');
    if (text.length > cfg.maxChars) text = text.slice(0, cfg.maxChars).trimEnd() + `\n  (card cut at ${cfg.maxChars} characters)`;
    return text.split('\n');
}

// What entry.mjs calls: the card's lines for this session start, or nothing.
export function stateCardLines(cwd, ptr) {
    const kit = kitRoot(ptr);
    const pol = readRoutePolicy(ptr, kit);
    const cfg = stateCardConfig(pol.policy);
    let why = 'GAME-13';
    let repo = cardRepo(cwd, ptr, pol.policy, cfg);
    if (!repo && cfg.anyRepoWithHandoff) { repo = handoffRepo(cwd, ptr); why = 'DES-14'; }
    if (!repo) return [];
    return stateCard(repo, ptr, cfg, why);
}
