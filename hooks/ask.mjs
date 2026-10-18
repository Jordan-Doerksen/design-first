// ask.mjs - refuses a question with more than one part, an option with no reason, an "either is fine", or a recommended option that is not first (OWN-04).
//
// The shape of a question to the owner. A call is refused, with the reason the model sees, when:
//   - it carries more than one question (one at a time; ask the next after the answer);
//   - an option's description is shorter than the minimum (a label is not a reason: each option
//     says what it gives, what it costs and who would pick it);
//   - the question, a label or a description offers the options as equally fine (a negated or
//     quoted phrase, or one in a sentence that holds a contrast word, is not a tie);
//   - the first option's label does not hold the recommended marker (a word match, so a label
//     that says "not recommended" also passes).
// A multi-select question is held to the same rules: each option carries its reason, and the
// first option's label carries the recommended marker; the order of the other options is not
// checked.
// The minimum, the phrases and the marker are the brain's `ask` config (defaults in
// lib/common.mjs, askDefaults). What this hook cannot see is written in the owning file:
// reasons given in plain text or above a host's next-step box, and whether a reason is a good one.
// Non-AskUserQuestion payloads exit silently.
//
// An allowed question also writes the session's interview marker (<markers>/<session>.asked), which
// the Stop hook reads for GATE-01: a repository created this turn with no question asked this
// session gets the interview line on the card. A call with no question is let through and writes
// no marker.
//
// Failure policy: an internal error ALLOWS the call, logs an ERROR line and says so.
//
// anchor: ask-shape  mode: deny  verbs: ask

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SENTENCE_END = ['.', '!', '?', '\n'];

// The problems with one question, as short lines; none means the shape is right.
function askProblems(C, q, askCfg) {
    const problems = [];
    const opts = Array.isArray(q && q.options) ? q.options.filter((o) => o != null) : [];

    const min = Number(askCfg.minReason) || 0;
    if (min > 0) {
        const bare = opts.filter((o) => C.str(o.description).trim().length < min).map((o) => `'${C.str(o.label)}'`);
        if (bare.length > 0) {
            problems.push(`The description of ${bare.join(', ')} is under ${min} characters, too short to carry a reason. Each option's description says what it gives, what it costs and who would pick it.`);
        }
    }

    const text = [C.str(q.question)];
    for (const o of opts) text.push(C.str(o.label), C.str(o.description));
    const hay = text.join('\n');
    let hit = null;
    for (const p of askCfg.equalPhrases || []) {
        const words = C.str(p).trim().split(/\s+/).filter((w) => w).map(escRx);
        if (words.length === 0) continue;
        const rx = new RegExp('(?<![a-z])' + words.join('\\s+') + '(?![a-z])', 'gi');
        for (const m of hay.matchAll(rx)) {
            // Three uses of a phrase are not a tie (CR-2026-10-14-OPTIONS review): a negation ("not
            // equally good"), a quoted mention ('"either is fine" is not an answer'), and a sentence
            // that goes on to say what tips it ("both are fine, but this one costs less"), which is
            // exactly what OWN-04 asks for when two options are close.
            const lead = hay.slice(0, m.index).replace(/[ \t]+$/, '');
            if (/(?:(?<![a-z])not|(?<![a-z])never|n't)$/i.test(lead)) continue;
            if (lead.length > 0 && `"'\`\u201C\u2018`.includes(lead[lead.length - 1])) continue;
            let start = 0;
            for (let k = Math.max(0, m.index - 1); k >= 0; k--) { if (SENTENCE_END.includes(hay[k])) { start = k + 1; break; } }
            let end = -1;
            for (let k = m.index + m[0].length; k < hay.length; k++) { if (SENTENCE_END.includes(hay[k])) { end = k; break; } }
            if (end < 0) end = hay.length;
            const sentence = hay.slice(start, end);
            if (/(?<![a-z])(but|though|although|however|except|unless|whereas|yet)(?![a-z])/i.test(sentence)) continue;
            hit = m[0]; break;
        }
        if (hit) break;
    }
    if (hit) problems.push(`'${hit}' offers the options as equally fine. Say what tips it and recommend one.`);

    const marker = C.str(askCfg.recommendedMarker);
    if (marker && opts.length > 0 && !C.toRegex(marker, 'i').test(C.str(opts[0].label))) {
        problems.push("The first option is not marked recommended. Put the recommended option first, mark its label (for example 'Name (Recommended)') and say in its description why it wins.");
    }
    return problems;
}

try {
    const C = await import('./lib/common.mjs');
    const raw = C.readStdin();
    if (C.isBlank(raw)) throw new Error('empty stdin (no tool call payload)');
    const j = JSON.parse(raw);
    if (C.str(j.tool_name) === 'AskUserQuestion') {
        const ti = j.tool_input;
        const qs = ti != null && Array.isArray(ti.questions) ? ti.questions.filter((q) => q != null) : [];
        const n = qs.length;
        const ptr = C.readPointer();

        let title = null; let lines = [];
        if (n > 1) {
            title = `${n} questions in one call`;
            lines = [`This call carries ${n} questions. Ask the first question alone now; ask the next one after the answer.`];
        } else if (n === 1) {
            // An unreadable brain config must not switch the checks off or lose the interview marker
            // (failing open here would skip both): the defaults apply and the log says why.
            let askCfg;
            try { askCfg = C.readBrainConfig(ptr).ask; }
            catch (e) { C.writeLog('WARN', 'ask', `brain config unreadable, the ask defaults apply: ${e.message}`); askCfg = C.askDefaults(); }
            if (askCfg == null) askCfg = C.askDefaults();
            lines = askProblems(C, qs[0], askCfg);
            if (lines.length > 0) title = `question shape: ${lines.length} problem(s)`;
        }

        if (!title) {
            // Only a call that carries one question writes the interview marker. Workaround
            // (CR-2026-10-15-GAPS D5): a call with no question was let through and wrote it too, so a call
            // that asked nothing cleared the GATE-01 line on the Stop card. It is still let through.
            if (n === 1) C.addTextLine(C.sessionFile(j.session_id ? String(j.session_id) : 'unknown', '.asked'), C.isoNow());
        } else {
            const owner = ptr.brain ? C.getOwnerName(ptr.brain) : 'The owner';
            const reason = `${owner} answers one question at a time, as multiple choice, with the recommended option first, and every option carries a reason to pick it (OWN-04). Fix this and ask again:\n- ${lines.join('\n- ')}`;
            C.addTextLine(C.getFenceLogPath(), `${C.stampNow()}  BLOCKED[ASK: ${title}]`);
            C.writeJson(C.newDeny('ask', title, reason));
        }
    }
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR ask ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    process.stdout.write(JSON.stringify({
        systemMessage: `ASK: internal error, call allowed (${msg})`,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `ask hook hit an internal error and ALLOWED this call without inspecting it: ${msg}. Logged to the design-first hooks log.` },
    }) + '\n');
}
process.exitCode = 0;
