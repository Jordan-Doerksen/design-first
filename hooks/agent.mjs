// agent.mjs - holds a subagent spawn, or a session start, to its brief contract, routes a subagent's model from the brain's policy, and asks past the spawn cap (DES-11, CTRL-02).
//
// Three rules, in this order. Every one is a cost already paid: 516 subagents in two weeks, 97% on
// the most expensive model, briefs with no done-check, one session spawning 33.
//   1. agent-brief  - DENY a spawn whose brief lacks the contract headings (Goal:, Files: or Area:,
//                     Done when:, Ruled out:, Reports to:). Search-type agents need only Goal:,
//                     Done when: and Reports to:. Only the headings are checked, not what follows
//                     them. The same check runs on the host's session-start tools, named in the
//                     policy's brief.sessionTools (CTRL-02): the tool input's prompt is the brief,
//                     and nothing else is done to the call (no count, no route; a session's model
//                     is the host's). A session-start call with no prompt carries no brief (the
//                     offer card is a title alone; a proposal starts by its id) and passes through.
//   2. agent-cap    - count spawns per turn (session_id + prompt_id; with no prompt_id, per clock
//                     hour); above the cap, ASK the owner, naming the count and the models so far.
//                     The cap is checked before routing, so the ask can name the models so far; a
//                     spawn over the cap is not routed, and runs with no routed model if allowed.
//   3. agent-route  - when the call names no model and the spawn is at or under the cap, set one
//                     from the brain's role table (updatedInput). A model named on the call always
//                     wins.
// Tunables live in <brain>/agent-policy.json. With no brain the kit template is the policy, and the
// hook says so once per session. Nested spawns (agent_id present) are checked and counted the same.
//
// What this hook cannot see: whether the host honours updatedInput.model for the Agent tool. That
// is proven by a live probe (a spawn whose first line reports its own model), not by this file.
// Failure policy: an internal error ALLOWS the call, logs an ERROR line and says so on both channels.
//
// anchor: agent-brief  mode: deny  verbs: parallelise,spawn,report-to
// anchor: agent-route  mode: advise  verbs: route-model
// anchor: agent-cap  mode: gate  verbs: cap-spawn

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readAgentPolicy(C, ptr) {
    // Brain policy first; the kit template as the fallback. Returns { policy, source, fromBrain }.
    const kitTemplate = path.join(KIT, 'templates', 'agent-policy.json');
    const candidates = [];
    if (ptr.brain) candidates.push({ path: path.join(ptr.brain, 'agent-policy.json'), fromBrain: true });
    candidates.push({ path: kitTemplate, fromBrain: false });
    for (const c of candidates) {
        if (C.isFile(c.path)) return { policy: C.readJson(c.path), source: c.path, fromBrain: c.fromBrain };
    }
    throw new Error(`no agent policy: neither <brain>/agent-policy.json nor ${kitTemplate} exists`);
}

function hasHeading(prompt, spec) {
    // spec is "Goal:" or "Files:|Area:". A heading counts only at the start of a line, after
    // optional list or emphasis markers, so prose that mentions the word does not satisfy it.
    for (const alt of spec.split('|')) {
        const word = escRx(alt.replace(/:+$/, '').trim());
        if (new RegExp('^[\\s\\-\\*#>_]*' + word + '\\s*\\**\\s*:', 'im').test(prompt)) return true;
    }
    return false;
}

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String);

function requiredHeadings(prop, policy, type) {
    const brief = prop(policy, 'brief') || {};
    const light = list(prop(brief, 'lightTypes'));
    if (light.some((t) => t.toLowerCase() === type.toLowerCase())) return list(prop(brief, 'lightRequired'));
    return list(prop(brief, 'required'));
}

function getRoute(prop, policy, type) {
    // Returns a model name, or 'inherit'. Explicit per-type route first, then the default.
    const routes = prop(policy, 'routes');
    if (routes && prop(routes, type) !== undefined) return String(prop(routes, type));
    if (routes && prop(routes, 'default') !== undefined) return String(prop(routes, 'default'));
    return 'inherit';
}

function turnCounterPath(C, sessionId, promptId) {
    const dir = C.getMarkerDir();
    C.ensureDir(dir);
    if (C.isBlank(promptId)) {
        const d = new Date(); const pad = (x) => String(x).padStart(2, '0');
        promptId = `hour-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}`;
    }
    return path.join(dir, `${sessionId}.${promptId}`.replace(/[^A-Za-z0-9_.-]/g, '_') + '.spawns');
}

try {
    const C = await import('./lib/common.mjs');
    const { prop } = await import('./lib/law-rows.mjs');
    const raw = C.readStdin();
    if (C.isBlank(raw)) throw new Error('empty stdin (no tool call payload)');
    const j = JSON.parse(raw);
    const toolName = C.str(j.tool_name);
    const ptr0 = toolName === 'Agent' ? null : C.readPointer();
    const pol0 = toolName === 'Agent' ? null : readAgentPolicy(C, ptr0);
    const sessionTools = pol0 ? list(prop(prop(pol0.policy, 'brief') || {}, 'sessionTools')) : [];
    if (toolName !== 'Agent' && sessionTools.some((t) => t === toolName)) {
        // ---------------------------------------------------------------- CTRL-02: a session brief
        // The host's session-start tool. The brief is the input's prompt; a call with no prompt is an
        // offer (a title alone) or a proposal started by its id, whose brief was checked when it was
        // sent, so it passes through with nothing said.
        const ti = j.tool_input;
        if (ti == null) throw new Error(`payload has no tool_input (tool_name='${toolName}')`);
        if (ti.prompt != null && !C.isBlank(C.str(ti.prompt))) {
            const prompt = C.str(ti.prompt);
            const owner = C.getOwnerName(ptr0.brain);
            const fenceLog = C.getFenceLogPath();
            const required = list(prop(prop(pol0.policy, 'brief') || {}, 'required'));
            const missing = required.filter((h) => !hasHeading(prompt, h));
            if (missing.length > 0) {
                const reason = `A session brief must carry these headings at line start: ${required.join(', ')}. Missing: ${missing.join(', ')}. ` +
                    "Write the brief with every heading on its own line (for example 'Reports to: Method Master Control, the four-line report at turn end'), then start the session again. " +
                    `This is ${owner}'s rule CTRL-02 (with DES-11 for the work headings); the policy is ${pol0.source}.`;
                C.addTextLine(fenceLog, `${C.stampNow()}  BLOCKED[AGENT: session brief rejected, ${missing.join(', ')}, tool ${toolName}]`);
                C.writeJson(C.newDeny('agent', `session brief rejected (${missing.join(', ')} missing)`, reason));
            } else {
                C.writeJson(C.newAdvisory('agent', [{ title: 'session brief carries the contract headings',
                    body: `design-first: the session brief carries ${required.join(', ')} (CTRL-02); the session's model and count are the host's, not routed here.` }]));
            }
        }
    } else if (toolName === 'Agent') {
        const ti = j.tool_input;
        if (ti == null) throw new Error("payload has no tool_input (tool_name='Agent')");
        const sessionId = C.str(j.session_id);
        const promptId = C.str(j.prompt_id);
        const nested = !C.isBlank(j.agent_id);

        const type = ti.subagent_type ? String(ti.subagent_type) : 'general-purpose';
        const prompt = C.str(ti.prompt);
        const named = ti.model ? String(ti.model) : '';

        const ptr = C.readPointer();
        const pol = readAgentPolicy(C, ptr);
        const policy = pol.policy;
        const owner = C.getOwnerName(ptr.brain);
        const fenceLog = C.getFenceLogPath();

        // ---------------------------------------------------------------- 1. brief contract (deny)
        const required = requiredHeadings(prop, policy, type);
        const missing = required.filter((h) => !hasHeading(prompt, h));
        if (missing.length > 0) {
            const reason = `A subagent brief must carry these headings at line start: ${required.join(', ')}. Missing for agent type '${type}': ${missing.join(', ')}. ` +
                "Write the brief with every heading on its own line (for example 'Done when: the self-test passes and the output is pasted'), then spawn again. " +
                `This is ${owner}'s rule DES-11; the policy is ${pol.source}.`;
            C.addTextLine(fenceLog, `${C.stampNow()}  BLOCKED[AGENT: brief rejected, ${missing.join(', ')}, type ${type}]`);
            C.writeJson(C.newDeny('agent', `brief rejected (${missing.join(', ')} missing)`, reason));
        } else {
            // The kit-defaults notice is claimed here, after the brief check, so a denied first call (whose
            // reason already names the policy source) does not use up the once-per-session marker.
            const advisories = [];
            if (!pol.fromBrain && C.firstTime(sessionId, 'agentpolicy')) {
                advisories.push({ title: 'no brain policy, kit defaults in use',
                    body: `No brain policy, kit defaults in use: design-first found no <brain>/agent-policy.json, so the kit template at ${pol.source} is the policy for this session. Run /design-first:adopt, or copy the template into the brain, to tune routes and the cap.` });
            }

            // ---------------------------------------------------------------- 2. cap (counted before routing so the ask can list models)
            let cap = 0;
            const capObj = prop(policy, 'cap');
            if (capObj && prop(capObj, 'perTurn') !== undefined) { const v = C.parseIntStrict(prop(capObj, 'perTurn')); if (v != null) cap = v; }
            const route = getRoute(prop, policy, type);
            const effective = named || (route !== 'inherit' ? route : 'inherit');
            const counter = turnCounterPath(C, sessionId, promptId);
            const prior = C.isFile(counter) ? C.readText(counter).split(/\r?\n/).filter((l) => l.trim()) : [];
            const n = prior.length + 1;
            const nestedTag = nested ? ' nested' : '';
            if (cap > 0 && n > cap) {
                const counts = new Map();
                for (const l of prior) { const m = l.split('\t')[0]; counts.set(m, (counts.get(m) || 0) + 1); }
                const summary = [...counts].map(([m, c]) => `${m} x${c}`).join(', ');
                const reason = `Spawn ${n} of this turn, cap ${cap} (policy ${pol.source}). So far: ${summary}. Type now: ${type}, model ${effective}${nestedTag}. ` +
                    'Say yes to allow it, or reshape the work: one agent per independent decision, not per file; a script for anything deterministic.';
                C.addTextLine(counter, `${effective}\t${type}\tASKED`);
                C.addTextLine(fenceLog, `${C.stampNow()}  ASK[AGENT: spawn ${n} over cap ${cap}]`);
                C.writeJson({
                    systemMessage: `AGENT: spawn ${n} over the cap of ${cap} this turn`,
                    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
                });
            } else {
                C.addTextLine(counter, `${effective}\t${type}`);
                const capText = cap > 0 ? `spawn ${n} of ${cap} this turn` : `spawn ${n} this turn, no cap`;

                // ---------------------------------------------------------------- 3. routing (rewrite when the call names no model)
                if (!named && route !== 'inherit') {
                    const updated = { ...ti, model: route };
                    let body = `design-first routed agent type '${type}' to model '${route}' (brain role table: ${pol.source}); ${capText}${nestedTag}. Name a model on the call to override.`;
                    if (advisories.length > 0) body = advisories.map((a) => a.body).join('\n\n') + '\n\n' + body;
                    C.writeJson({
                        systemMessage: `AGENT: ${type} -> ${route}, ${capText}`,
                        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'routed by design-first agent policy', updatedInput: updated, additionalContext: body },
                    });
                } else {
                    // Inherit, or a model named on the call: pass through with the count on both channels.
                    const why = named ? `model '${named}' named on the call` : `type '${type}' inherits the session model by policy`;
                    C.writeJson(C.newAdvisory('agent', [...advisories, { title: `${capText}, ${why}`, body: `design-first: ${capText}; ${why}${nestedTag}.` }]));
                }
            }
        }
    }
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR agent ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    process.stdout.write(JSON.stringify({
        systemMessage: `AGENT: internal error, call allowed (${msg})`,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `agent hook hit an internal error and ALLOWED this call without inspecting it: ${msg}. Logged to the design-first hooks log.` },
    }) + '\n');
}
process.exitCode = 0;
