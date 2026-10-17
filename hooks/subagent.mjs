// subagent.mjs - design-first SubagentStart hook: a subagent inherits the session's law (DES-13),
// and the clauses only a model can judge arrive with the role that judges them (advise-by-role).
//
// A subagent gets its brief and nothing else: no root CLAUDE.md, no entry path, no routed law.
// This hook reads the session's route file (written by route.mjs) and injects, before the
// subagent's first prompt, the rows of the groups the policy marks alwaysForSubagents (the
// prohibitions by default) and of every group active in the session, except the alwaysForSessions
// groups (unless alwaysForSubagents also lists them). Same cap as the router: the advise-by-role
// block below is sized first and its room reserved, then a group past the cap is named without its
// rows. With no pointer file it injects nothing. The host re-injects after the subagent's own
// compaction.
//
// advise-by-role (CR-2026-10-13-HONOUR): every clause whose enforcedBy ref names this anchor is
// read from the kit's law.json (and the brain's overlay when there is one) and injected with one
// instruction per role. The Reviewer names each clause in its report as holding or as a finding
// with a place; a Builder is told the Reviewer will. That is the per-action half of ADVISE; the
// route hook's group rows are the per-session half. A clause that nothing reads at the moment it
// matters is HONOUR; a clause a named role must answer for is not.
//
// Failure policy: an internal error injects nothing law-shaped, logs an ERROR line and says so.
//
// anchor: subagent-law  mode: advise  verbs: route-law
// anchor: advise-by-role  mode: advise  verbs: decide,deliver,expose-action,configure,slice,scope-edit,annotate,confirm,diagnose,decide-scope,size-work,evidence,shape-log,log-negative,aggregate,locate-log,wear-hat,cite,taste,frontier

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStdin } from './lib/stdin.mjs';

const ADVISE_REF = 'hooks/subagent.mjs#advise-by-role';

function writeContext(text) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } }) + '\n');
}

// The clauses this anchor carries: from the kit's law.json, plus the brain's overlay clauses that
// name the same ref. Read from the source files, not from LAW.md, so a clause is injected exactly
// when its record says this hook enforces it.
function readAdviseClauses(C, kit, brain) {
    const files = [path.join(kit, 'law.json')];
    if (brain) { const o = path.join(brain, 'law.overlay.json'); if (C.isFile(o)) files.push(o); }
    const out = [];
    for (const f of files) {
        if (!C.isFile(f)) continue;
        const j = C.readJson(f);
        for (const c of Array.isArray(j.clauses) ? j.clauses : []) {
            const e = c && c.enforcedBy;
            if (e == null) continue;
            if (String(e.ref) !== ADVISE_REF) continue;
            out.push({ id: C.str(c.id), verb: C.str(c.verb), rule: C.str(c.rule) });
        }
    }
    return out;
}

function formatAdvise(clauses, isReviewer) {
    if (clauses.length === 0) return '';
    const lines = [isReviewer
        ? `ADVISE clauses, ${clauses.length} rules only a reader can judge. You are the Reviewer: your report carries an ADVISE section that names every id below as 'holds' or as a finding with file:line. An id you did not look at is BLOCKED, never PASS.`
        : `ADVISE clauses, ${clauses.length} rules only a reader can judge. They bind this work; the Reviewer names each one in its report as holding or as a finding.`];
    for (const c of clauses) lines.push(`- ${c.id} (${c.verb}): ${c.rule}`);
    return lines.join('\n');
}

try {
    const raw = readStdin();
    const C = await import('./lib/common.mjs');
    const L = await import('./lib/law-rows.mjs');
    let j = null;
    if (raw.trim()) { try { j = JSON.parse(raw); } catch { j = null; } }
    const sessionId = j && j.session_id ? String(j.session_id) : 'unknown';
    const agentType = j && j.agent_type ? String(j.agent_type) : 'subagent';
    const isReviewer = /reviewer/i.test(agentType);

    const ptr = C.readPointer();
    if (ptr.pointer != null) {
        const kit = L.kitRoot(ptr);
        const pol = L.readRoutePolicy(ptr, kit);
        const policy = pol.policy;
        const maxChars = L.policyMaxChars(policy);
        const listOf = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).filter((x) => x).map(String);

        const wanted = [];
        for (const g of listOf(L.prop(policy, 'alwaysForSubagents'))) if (!wanted.includes(g)) wanted.push(g);
        // A group the policy sends to every session (alwaysForSessions, OWN in the template) is about the
        // session's talk with the owner, and a subagent does not talk to the owner; the advise-by-role
        // block below already carries the clauses of that group a subagent answers for. Measured
        // 2026-10-14 on the kit LAW.md: SAFE, DES, VCS and OBS rows plus the advise block came to about
        // 8,850 characters, under the 9,500 cap; the OWN rows add 1,209 and put it near 10,050, over the
        // cap, and the self-test's Reviewer case got the clause ids without their text. List the group in
        // alwaysForSubagents to send it anyway. That measure counted a kit path once per owning file;
        // since CR-2026-10-17-PATHS the folders are named once, and the same rows come to about 9,270
        // characters with a 23-character kit path, one more per character of path (9,452 at 200).
        const sessionOnly = listOf(L.prop(policy, 'alwaysForSessions'));
        for (const g of L.readActiveRoutes(sessionId)) {
            if (sessionOnly.includes(g) && !wanted.includes(g)) continue;
            if (!wanted.includes(g)) wanted.push(g);
        }

        let out = `You are a design-first subagent (${agentType}). The brief is your spec; these are the law groups active in the session that spawned you. Cite ids; open the owning file for the full text. ${L.lawFoldersLine(ptr, kit)}\n\n`;

        // advise-by-role is sized first and its room reserved before any group is admitted.
        // Workaround (CR-2026-10-17-ADVISE-FIRST): the groups were admitted greedily and the ADVISE
        // block appended last into what was left, so with five routed groups (SAFE, DES, VCS, OBS and
        // VOICE, the usual session) the block, about 3,150 characters, did not fit and the Reviewer
        // got twenty ids with no text, the thing GATE-09 and AUTO-05 lean on. A group that does not
        // fit beside the block is deferred instead; its rows are the per-session half and the session
        // already read them.
        const advise = readAdviseClauses(C, kit, ptr.brain);
        const adviseText = advise.length > 0 ? formatAdvise(advise, isReviewer) : '';
        const adviseFits = adviseText && out.length + adviseText.length + 2 <= maxChars;
        const reserved = adviseFits ? adviseText.length + 2 : 0;

        const injected = []; const deferred = [];
        if (wanted.length > 0) {
            const law = L.lawPath(ptr, kit);
            const groups = L.readLawGroups(law);
            for (const g of wanted) {
                const grp = L.findGroup(groups, g);
                if (!grp) continue;
                const text = L.formatLawGroup(g, grp, ptr, kit);
                if (out.length + text.length + 2 + reserved > maxChars) { deferred.push(g); continue; }
                out += text + '\n\n'; injected.push(g);
            }
            if (deferred.length > 0) out += `Over the size cap, not injected: ${deferred.join(', ')}; index at ${law}.\n\n`;
        }

        // advise-by-role: after the groups, in the room reserved above. Over the cap (the block alone
        // does not fit under it), the ids are named so the Reviewer still knows what it must answer for.
        let adviseInjected = false;
        if (advise.length > 0) {
            if (adviseFits && out.length + adviseText.length + 2 <= maxChars) out += adviseText + '\n';
            else out += `ADVISE clauses over the size cap, not injected; the ids a Reviewer must answer for: ${advise.map((c) => c.id).join(', ')}. Full text in ${path.join(kit, 'law.json')}.\n`;
            adviseInjected = true;
        }

        if (injected.length > 0 || adviseInjected) writeContext(out.trimEnd());
    }
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR subagent ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    writeContext(`design-first subagent hook hit an internal error and injected no law: ${msg}. Logged to the design-first hooks log.`);
}
process.exitCode = 0;
