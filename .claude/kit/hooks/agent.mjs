// agent.mjs - holds a subagent spawn, or a session start, to its brief contract, routes a subagent's model from the brain's policy, asks past the spawn cap, and holds a cloud session start to the policy's permission mode and to one start per title per prompt (DES-11, CTRL-02).
//
// Five rules, in this order. Every one is a cost already paid: 516 subagents in two weeks, 97% on
// the most expensive model, briefs with no done-check, one session spawning 33, and a cloud child
// that stopped at a permission prompt with nobody to click.
//   1. agent-brief     - DENY a spawn whose brief lacks the contract headings (Goal:, Files: or Area:,
//                        Done when:, Ruled out:, Reports to:). Search-type agents need only Goal:,
//                        Done when: and Reports to:. Only the headings are checked, not what follows
//                        them. The same check runs on the host's session-start tools, named in the
//                        policy's brief.sessionTools (CTRL-02): the desktop app's start_session and
//                        the cloud's create_session. The tool input's prompt is the brief, and
//                        nothing else is done to the brief (no count, no route; a session's model is
//                        the host's). A session-start call with no prompt carries no brief (the offer
//                        card is a title alone; a proposal starts by its id) and is not held to it.
//   2. agent-cap       - count spawns per turn (session_id + prompt_id; with no prompt_id, per clock
//                        hour); above the cap, ASK the owner, naming the count and the models so far.
//                        The cap is checked before routing, so the ask can name the models so far; a
//                        spawn over the cap is not routed, and runs with no routed model if allowed.
//   3. agent-route     - when the call names no model and the spawn is at or under the cap, set one
//                        from the brain's role table (updatedInput). A model named on the call always
//                        wins.
//   4. session-mode    - DENY a cloud create_session (mcp__claude-code-remote__create_session) when
//                        the policy's session.requireMode names a mode and the caller's own mode (the
//                        hook input's permission_mode) or the child's requested mode
//                        (tool_input.permission_mode) is absent or differs from it; the reason names
//                        what was seen and what the policy requires. A child cannot be more
//                        permissive than its caller, and a child that hits a permission prompt in a
//                        container stops with nobody to answer, so equal is the one value that
//                        neither widens nor stalls. The compare is exact: a mode is the host's token,
//                        as typed. The template ships null: no rule; a requireMode that is not a
//                        string (false, say) is no rule either, never a mode named "false". The
//                        desktop start tool carries no mode and is not held to it. Rules 4 and 5 hold
//                        on every create_session, whether or not brief.sessionTools names it; a call
//                        the list does not name gets no brief check and one WARN line in the hooks
//                        log naming the policy file.
//   5. session-started - on every ALLOWED create_session, append { title, at } to the per-prompt
//                        marker <markerDir>/<session>.started; DENY a second start of the same title
//                        (case ignored; an empty title never matches) in the same prompt, read from
//                        that marker. route.mjs deletes the file on every new prompt. The title is
//                        the host-neutral key: the kit has no domains.
// send_message (mcp__claude-code-remote__send_message) passes through with one INFO line in the
// hooks log and nothing on either channel; the lines guard is a later chunk.
// Tunables live in <brain>/agent-policy.json. With no brain the kit template is the policy, and the
// hook says so once per session. Nested spawns (agent_id present) are checked and counted the same.
//
// What this hook cannot see: whether the host honours updatedInput.model for the Agent tool. That
// is proven by a live probe (a spawn whose first line reports its own model), not by this file.
// A session started by any path the matcher does not name (a click in the app, a command line)
// starts unchecked. The started marker lives in the marker folder for one prompt, so a container
// reclaimed between two prompts, or a second start typed with another title, is not caught by it.
// Whether the host honours the child's permission_mode is the host's to prove, not this file's.
// Failure policy: an internal error ALLOWS the call, logs an ERROR line and says so on both channels.
//
// anchor: agent-brief  mode: deny  verbs: parallelise,spawn,report-to
// anchor: agent-route  mode: advise  verbs: route-model
// anchor: agent-cap  mode: gate  verbs: cap-spawn
// anchor: session-mode  mode: deny  verbs: start-session
// anchor: session-started  mode: deny  verbs: start-session

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The cloud host's session tools, by full tool name. The start tool's brief is checked only when the
// policy's brief.sessionTools names it (the brief check reads the tools the policy names, not the
// matcher); rules 4 and 5 hold on every create_session the hook sees, named there or not.
const TOOL_START = 'mcp__claude-code-remote__create_session';
const TOOL_SEND = 'mcp__claude-code-remote__send_message';

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

// The started marker: one JSON line per allowed cloud start this prompt, { title, at }. A line this
// hook did not write (not JSON) is skipped, never a reason to fail.
function readStarted(C, p) {
    if (!C.isFile(p)) return [];
    const rows = [];
    for (const l of C.readText(p).split(/\r?\n/)) {
        if (!l.trim()) continue;
        try { const j = JSON.parse(l); if (j && typeof j === 'object') rows.push(j); } catch { /* not a marker line */ }
    }
    return rows;
}

// Rule 4. Returns '' when the start may go on, else the short reason ('caller mode x, policy
// requires y', 'child mode missing', ...). requireMode is the policy's non-blank mode. The compare
// is exact: the host's modes are tokens as typed (acceptEdits), and a mode spelt another way is not
// one the host has.
function modeFault(C, j, ti, requireMode) {
    const callerMode = C.str(j.permission_mode).trim();
    const childMode = C.str(ti.permission_mode).trim();
    if (!callerMode) return 'caller mode unknown';
    if (callerMode !== requireMode) return `caller mode ${callerMode}, policy requires ${requireMode}`;
    if (!childMode) return 'child mode missing';
    if (childMode !== requireMode) return `child mode ${childMode}, policy requires ${requireMode}`;
    return '';
}

try {
    const C = await import('./lib/common.mjs');
    const { prop } = await import('./lib/law-rows.mjs');
    const raw = C.readStdin();
    if (C.isBlank(raw)) throw new Error('empty stdin (no tool call payload)');
    const j = JSON.parse(raw);
    C.setMarkerDir(j);                                                 // markers and logs under the host's scratchpad_dir when given (0.3.0)
    if (C.yieldToPlugin('agent', import.meta.url)) process.exit(0);    // the yield rule: a vendored copy steps aside for the plugin (0.3.0)
    const toolName = C.str(j.tool_name);
    if (toolName === TOOL_SEND) {
        // ---------------------------------------------------------------- send_message: pass through
        // The lines guard (what a message to a session may carry) is a later chunk. One line in the
        // log says the call was seen; nothing is printed, and silence is allow.
        C.writeLog('INFO', 'agent', `send_message seen (session ${C.isBlank(j.session_id) ? 'unknown' : C.str(j.session_id)})`);
    } else if (toolName !== 'Agent') {
        const ptr0 = C.readPointer();
        const pol0 = readAgentPolicy(C, ptr0);
        const sessionTools = list(prop(prop(pol0.policy, 'brief') || {}, 'sessionTools'));
        const named = sessionTools.some((t) => t === toolName);
        const cloud = toolName === TOOL_START;
        if (named || cloud) {
            // ---------------------------------------------------------------- CTRL-02: a session start
            // The host's session-start tool. The brief is the input's prompt; a call with no prompt is
            // an offer (a title alone) or a proposal started by its id, whose brief was checked when it
            // was sent, so the brief check is skipped. The cloud start tool is also held to rules 4 and
            // 5, on every create_session the hook sees, whatever brief.sessionTools says: the list gates
            // the brief check only, so a brain copy older than the cloud tool is no silent off switch for
            // a deny rule, and the hook says in the log that the brief went unchecked. The desktop tool
            // is held to neither (it carries no mode, and the kit's domain is the title).
            const ti = j.tool_input;
            if (ti == null) throw new Error(`payload has no tool_input (tool_name='${toolName}')`);
            if (cloud && !named) C.writeLog('WARN', 'agent', `create_session is not in brief.sessionTools of ${pol0.source}: its brief is not checked`);
            const owner = C.getOwnerName(ptr0.brain);
            const fenceLog = C.getFenceLogPath();
            const required = list(prop(prop(pol0.policy, 'brief') || {}, 'required'));
            const hasPrompt = ti.prompt != null && !C.isBlank(C.str(ti.prompt));
            const briefChecked = named && hasPrompt;
            let deny = null;                 // { title, reason, fence }: the first rule that refuses

            // ---------------------------------------------------------------- 1. brief contract (deny)
            if (briefChecked) {
                const prompt = C.str(ti.prompt);
                const missing = required.filter((h) => !hasHeading(prompt, h));
                if (missing.length > 0) {
                    deny = {
                        title: `session brief rejected (${missing.join(', ')} missing)`,
                        reason: `A session brief must carry these headings at line start: ${required.join(', ')}. Missing: ${missing.join(', ')}. ` +
                            "Write the brief with every heading on its own line (for example 'Reports to: Method Master Control, the four-line report at turn end'), then start the session again. " +
                            `This is ${owner}'s rule CTRL-02 (with DES-11 for the work headings); the policy is ${pol0.source}.`,
                        fence: `BLOCKED[AGENT: session brief rejected, ${missing.join(', ')}, tool ${toolName}]`,
                    };
                }
            }

            // ---------------------------------------------------------------- 4. session-mode (deny)
            // A string names the mode; null (the template), false or any other shape is no rule, so a
            // brain copy that writes false for off does not lock every cloud start behind a mode "false".
            const sessionCfg = prop(pol0.policy, 'session');
            const requireRaw = sessionCfg ? prop(sessionCfg, 'requireMode') : undefined;
            const requireMode = typeof requireRaw === 'string' ? requireRaw.trim() : '';
            if (!deny && cloud && requireMode) {
                const fault = modeFault(C, j, ti, requireMode);
                if (fault) {
                    deny = {
                        title: `session mode rejected (${fault})`,
                        reason: `${fault}. A cloud session start must name permission_mode '${requireMode}' on the call (tool_input.permission_mode), from a caller running in that mode (the hook input's permission_mode): ` +
                            'a child cannot be more permissive than its caller, and a child that hits a permission prompt in a container stops with nobody to answer, so equal is the one value that neither widens nor stalls. ' +
                            (fault === 'caller mode unknown' ? 'The host passed no permission_mode with this call, so the caller\'s mode is not known here. ' : '') +
                            `This is ${owner}'s rule; the policy is ${pol0.source} (session.requireMode).`,
                        fence: `BLOCKED[AGENT: session mode rejected, ${fault}, tool ${toolName}]`,
                    };
                }
            }

            // ---------------------------------------------------------------- 5. session-started (deny)
            const title = C.str(ti.title).trim();
            const started = cloud ? C.sessionFile(C.str(j.session_id), '.started') : null;
            if (!deny && cloud && title) {
                const prior = readStarted(C, started).find((row) => !C.isBlank(row.title) && C.ieq(C.str(row.title).trim(), title));
                if (prior) {
                    deny = {
                        title: `session already started this prompt ("${C.str(prior.title)}")`,
                        reason: `a session titled "${C.str(prior.title)}" was already started this prompt (at ${C.str(prior.at)}, recorded in ${started}). ` +
                            'One start per title per prompt: a second start of the same session is a duplicate until the next prompt, when the record is cleared. ' +
                            `Use the session already started, or give the new one its own title. This is ${owner}'s rule; the policy is ${pol0.source}.`,
                        fence: `BLOCKED[AGENT: session already started, "${C.str(prior.title)}", tool ${toolName}]`,
                    };
                }
            }

            if (deny) {
                C.addTextLine(fenceLog, `${C.stampNow()}  ${deny.fence}`);
                C.writeJson(C.newDeny('agent', deny.title, deny.reason));
            } else {
                if (cloud) C.addTextLine(started, JSON.stringify({ title, at: C.isoNow() }));
                if (briefChecked) {
                    const modeNote = cloud && requireMode ? `; permission mode ${requireMode} on the caller and the child, as the policy requires` : '';
                    C.writeJson(C.newAdvisory('agent', [{ title: 'session brief carries the contract headings',
                        body: `design-first: the session brief carries ${required.join(', ')} (CTRL-02); the session's model and count are the host's, not routed here${modeNote}.` }]));
                }
            }
        }
    } else {
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
