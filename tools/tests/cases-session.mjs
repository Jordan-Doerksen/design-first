// cases-session.mjs - hook self-test cases for the session hook (kit 0.3.0 chunk 1, rows 24 and 25):
// the cloud session-start tool held to the brief contract, the two permission-mode rules, the started
// marker keyed by title, and the send_message pass-through. Imported by run.mjs, which owns the
// fixtures and helpers used here. Never run directly.
//
// What is proven here and nowhere else:
//   1. mcp__claude-code-remote__create_session is a session tool (brief.sessionTools): its prompt is
//      the brief, checked against brief.required (CTRL-02); with no prompt the brief check is skipped.
//   2. session.requireMode: when the policy names a mode (a string), a create_session is denied unless
//      the caller's own mode (the hook input's permission_mode) and the child's requested mode
//      (tool_input.permission_mode) both equal it exactly, as typed; each miss names what was seen and
//      what the policy requires. The desktop start tool is not held to it. The template ships null: no
//      rule; a value that is not a string (false, say) is no rule either, never a mode named "false".
//   3. The started marker: every ALLOWED create_session appends its title to <session>.started; a
//      second start of the same title (case ignored, an empty title never matches) in one prompt is
//      denied from the marker; a denied start writes nothing; route.mjs deletes the file on a new
//      prompt, after which the same title starts again.
//   4. mcp__claude-code-remote__send_message passes through, silent on both channels, with one INFO
//      line in the hooks log and no ERROR line.
//   5. The policy is <brain>/agent-policy.json when the brain has one, else the kit template; a deny
//      names which. The fixture brain has none, so a policy is planted for the mode cases and removed
//      after them.
//   6. Row 25: hooks/hooks.json registers agent.mjs on all four names, and the template names the
//      cloud start tool under brief.sessionTools with session.requireMode null. The brief check runs
//      on the tools the policy names, not the matcher, so a tool named in one place and not the other
//      starts with its brief unchecked (instructions/control-law.md). Rules 4 and 5 are not gated by
//      the list: a brain policy whose sessionTools lacks create_session (or that has no brief key)
//      still holds every cloud start to the mode and the marker, and the hook logs one WARN line
//      naming the policy file, so an old brain copy is no silent off switch for a deny rule.
//   An internal error in the hook allows the call with an "internal error" line on both channels, the
//   same shape as an advisory; verdict() below reads that shape as 'error', never as 'allowed', so a
//   case that expects an allow cannot pass on a hook that crashed. It reads it through internalErrorReply
//   (hooks/lib/common.mjs, through the run's ctx), the one recognizer the Doctor's hook_smoke and the other
//   case files read, so no two of them can disagree on a hook's failure (review finding 27).

import fs from 'node:fs';
import path from 'node:path';

export default function sessionCases(t) {
    const { kit, root, brain, record, section, like, blank, readText, exists, put, invokeHook, hookJson, parseOut, classify, internalErrorReply, route, toJson } = t;

    const TOOL_START = 'mcp__claude-code-remote__create_session';
    const TOOL_SEND = 'mcp__claude-code-remote__send_message';
    const TOOL_DESKTOP = 'mcp__ccd_session__start_session';
    const FOUR = `Agent|${TOOL_DESKTOP}|${TOOL_START}|${TOOL_SEND}`;
    const BRIEF = 'Goal: count the files under tools.\nFiles: tools/\nDone when: the count is pasted with the command that produced it.\nRuled out: editing anything.\nReports to: the lead, the count pasted.';
    const NO_DONE = BRIEF.split('\n').filter((l) => !/^Done when:/.test(l)).join('\n');
    const brainPolicy = path.join(brain, 'agent-policy.json');
    const templatePolicy = path.join(kit, 'templates', 'agent-policy.json');
    const markerOf = (session) => path.join(process.env.DF_MARKER_DIR, session + '.started');
    const markerLines = (session) => readText(markerOf(session)).split(/\r?\n/).filter((l) => l.trim());
    const reasonOf = (r) => { const j = parseOut(r.out); return j && j.hookSpecificOutput ? String(j.hookSpecificOutput.permissionDecisionReason || '') : ''; };
    // The hook's answer as one word: 'denied' for a deny, 'allowed' for silence or an advisory, 'error' for the
    // internal-error output (an allow that says "internal error" on both channels, shaped like an advisory), else what classify saw.
    const verdict = (r) => {
        if (r.code !== 0) return `exit${r.code}`;
        if (internalErrorReply(r.out)) return 'error';
        const c = classify(r.out);
        return c === 'deny' ? 'denied' : c === 'allow' || c === 'advise' ? 'allowed' : c;
    };
    const deniedWith = (r, text) => (verdict(r) === 'denied' ? (like(reasonOf(r), `*${text}*`) ? 'denied' : `denied-without:${text}`) : verdict(r));
    const call = (session, tool, ti, top = {}) => invokeHook('agent.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'PreToolUse', prompt_id: 'p1', tool_name: tool, tool_input: ti, ...top }));
    const start = (session, ti, top) => call(session, TOOL_START, ti, top);

    section('-- session hook: the cloud session tools (0.3.0 rows 24, 25)');
    record('session: the fixture brain has no agent-policy.json, so the kit template is the policy', 'none', exists(brainPolicy) ? 'planted' : 'none');

    // 1. the brief contract on create_session, and 3. the marker
    let r = start('ss-brief', { title: 'Alpha Master', prompt: NO_DONE });
    record('session: create_session without Done when: -> denied', 'denied', verdict(r), r.out);
    record('session: the brief deny names the missing heading and CTRL-02', 'named', like(reasonOf(r), '*Missing: Done when:*') && like(reasonOf(r), '*CTRL-02*') ? 'named' : 'wrong', r.out);
    record('session: the brief deny names the kit template as the policy', 'template', like(reasonOf(r), `*${templatePolicy}*`) ? 'template' : 'other', r.out);
    record('session: a denied start writes no marker', 'absent', exists(markerOf('ss-brief')) ? 'present' : 'absent');
    r = start('ss-brief', { title: 'Alpha Master', prompt: BRIEF });
    record('session: create_session with the full brief -> allowed, with the advisory', 'allowed',
        verdict(r) === 'allowed' && classify(r.out) === 'advise' && like(r.out, '*session brief carries the contract headings*') ? 'allowed' : verdict(r) === 'allowed' ? `allowed-without-advisory:${classify(r.out)}` : verdict(r), r.out);
    record('session: an allowed start writes the marker with its title and time', 'written', (() => {
        const lines = markerLines('ss-brief');
        if (lines.length !== 1) return `lines: ${lines.length}`;
        const j = parseOut(lines[0]);
        return j && j.title === 'Alpha Master' && !blank(j.at) ? 'written' : 'wrong';
    })(), readText(markerOf('ss-brief')));
    r = start('ss-brief', { title: 'alpha master', prompt: BRIEF });
    record('session: a second start of the same title in one prompt -> denied from the marker', 'denied', deniedWith(r, 'was already started this prompt'), r.out);
    record('session: the marker deny names the title', 'named', like(reasonOf(r), '*"Alpha Master"*') ? 'named' : 'wrong', r.out);
    record('session: the denied second start adds no marker line', '1', String(markerLines('ss-brief').length), readText(markerOf('ss-brief')));
    r = start('ss-brief', { title: 'Beta Master', prompt: BRIEF });
    record('session: another title in the same prompt -> allowed', 'allowed', verdict(r), r.out);
    record('session: the marker now holds two titles', '2', String(markerLines('ss-brief').length), readText(markerOf('ss-brief')));
    const hadMarker = exists(markerOf('ss-brief'));
    route('yes please', 'ss-brief', root);
    record('session: route.mjs deletes the started marker on a new prompt', 'cleared', hadMarker ? (exists(markerOf('ss-brief')) ? 'kept' : 'cleared') : 'never-written');
    r = start('ss-brief', { title: 'Alpha Master', prompt: BRIEF });
    record('session: the same title starts again after a new prompt', 'allowed', verdict(r), r.out);
    r = start('ss-noprompt', { title: 'Offer' });
    record('session: create_session with no prompt -> passes through, silent', 'silent', r.code === 0 && blank(r.out) ? 'silent' : verdict(r), r.out);
    record('session: an allowed start with no prompt still writes the marker', 'written', markerLines('ss-noprompt').length === 1 ? 'written' : 'missing', readText(markerOf('ss-noprompt')));
    start('ss-notitle', { prompt: BRIEF });
    r = start('ss-notitle', { prompt: BRIEF });
    record('session: two starts with no title in one prompt -> both allowed (an empty title never matches)', 'allowed', verdict(r), r.out);

    // 4. send_message
    const logBefore = readText(process.env.DF_LOG_PATH);
    r = call('ss-send', TOOL_SEND, { session_id: 'session_x', message: 'go: ship it now, send the word' });
    record('session: send_message with any payload -> allowed, silent', 'silent', r.code === 0 && blank(r.out) ? 'silent' : verdict(r), r.out);
    const logNew = readText(process.env.DF_LOG_PATH).slice(logBefore.length);
    record('session: send_message leaves one INFO line "send_message seen" in the hooks log', 'logged', (logNew.match(/ INFO agent send_message seen/g) || []).length === 1 ? 'logged' : 'missing', logNew);
    record('session: send_message leaves no ERROR line', 'clean', / ERROR agent /.test(logNew) ? 'error' : 'clean', logNew);
    r = call('ss-send', TOOL_SEND, {});
    record('session: send_message with an empty payload -> allowed, silent', 'silent', r.code === 0 && blank(r.out) ? 'silent' : verdict(r), r.out);

    // 6. row 25: the matcher and the template name the same tools
    const hooksDoc = parseOut(readText(path.join(kit, 'hooks', 'hooks.json')));
    const agentReg = hooksDoc && hooksDoc.hooks && Array.isArray(hooksDoc.hooks.PreToolUse)
        ? hooksDoc.hooks.PreToolUse.find((e) => Array.isArray(e.hooks) && e.hooks.some((h) => /hooks\/agent\.mjs/.test(String(h.command)))) : null;
    record('session: hooks.json registers agent.mjs on the four names', 'four', agentReg && agentReg.matcher === FOUR ? 'four' : String(agentReg ? agentReg.matcher : 'not registered'));
    const tpl = parseOut(readText(templatePolicy)) || {};
    const tools = tpl.brief && Array.isArray(tpl.brief.sessionTools) ? tpl.brief.sessionTools : [];
    record('session: the template names create_session under brief.sessionTools', 'named', tools.includes(TOOL_START) ? 'named' : 'missing', tools.join(', '));
    record('session: the template keeps the desktop start tool under brief.sessionTools', 'kept', tools.includes(TOOL_DESKTOP) ? 'kept' : 'dropped', tools.join(', '));
    record('session: the template ships session.requireMode null', 'null', tpl.session && typeof tpl.session === 'object' && 'requireMode' in tpl.session && tpl.session.requireMode === null ? 'null' : 'other', JSON.stringify(tpl.session));
    record('session: the template _comment documents sessionTools and requireMode', 'documented', /requireMode/.test(String(tpl._comment)) && /create_session/.test(String(tpl._comment)) ? 'documented' : 'silent');
    // The law page shows the template's default in its sessionTools row (the column "default in the kit template"):
    // every tool the template ships is named there, read from the template, never typed here. Red first (review
    // finding 2): the row named the desktop start tool only, so the page said a cloud start is unchecked by default.
    const ctrlRow = readText(path.join(kit, 'instructions', 'control-law.md')).split(/\r?\n/).find((l) => /^\|\s*`sessionTools`\s*\|/.test(l)) || '';
    const ctrlDefault = ctrlRow.split('|').map((c) => c.trim())[3] || '';
    const ctrlUnnamed = tools.filter((x) => !ctrlDefault.includes('`' + x + '`'));
    record("session: instructions/control-law.md's sessionTools row names every tool the template ships as its default", 'named', ctrlRow === '' ? 'no row' : tools.length > 0 && ctrlUnnamed.length === 0 ? 'named' : `unnamed: ${ctrlUnnamed.join(', ')}`, ctrlRow);

    // 2. the two mode rules, on a planted brain policy; 5. the brain policy is the one read
    const modePolicy = {
        schema: 1,
        brief: { required: ['Goal:', 'Files:|Area:', 'Done when:', 'Ruled out:', 'Reports to:'], lightTypes: [], lightRequired: [], sessionTools: [TOOL_DESKTOP, TOOL_START] },
        routes: { default: 'inherit' },
        cap: { perTurn: 8 },
        session: { requireMode: 'auto' },
    };
    put(brainPolicy, toJson(modePolicy));
    try {
        r = start('ss-mode1', { title: 'A', prompt: BRIEF, permission_mode: 'auto' }, { permission_mode: 'default' });
        record('session: requireMode auto, caller default -> denied naming both', 'denied', deniedWith(r, 'caller mode default, policy requires auto'), r.out);
        record('session: the mode deny names the brain policy', 'brain', like(reasonOf(r), `*${brainPolicy}*`) ? 'brain' : 'other', r.out);
        record('session: a mode deny writes no marker', 'absent', exists(markerOf('ss-mode1')) ? 'present' : 'absent');
        r = start('ss-mode2', { title: 'A', prompt: BRIEF }, { permission_mode: 'auto' });
        record('session: caller auto, no tool_input.permission_mode -> denied "child mode missing"', 'denied', deniedWith(r, 'child mode missing'), r.out);
        r = start('ss-mode3', { title: 'A', prompt: BRIEF, permission_mode: 'default' }, { permission_mode: 'auto' });
        record('session: caller auto, child default -> denied naming both', 'denied', deniedWith(r, 'child mode default, policy requires auto'), r.out);
        r = start('ss-mode4', { title: 'A', prompt: BRIEF, permission_mode: 'auto' });
        record('session: no permission_mode in the hook input -> denied "caller mode unknown"', 'denied', deniedWith(r, 'caller mode unknown'), r.out);
        r = start('ss-mode5', { title: 'A', prompt: BRIEF, permission_mode: 'auto' }, { permission_mode: 'auto' });
        record('session: both auto -> allowed', 'allowed', verdict(r), r.out);
        record('session: the allowed start under requireMode writes the marker', 'written', markerLines('ss-mode5').length === 1 ? 'written' : 'missing', readText(markerOf('ss-mode5')));
        r = start('ss-mode6', { title: 'A', prompt: BRIEF, permission_mode: 'auto' }, { permission_mode: 'Auto' });
        record('session: the mode compare is exact: caller Auto -> denied naming both', 'denied', deniedWith(r, 'caller mode Auto, policy requires auto'), r.out);
        r = start('ss-mode6b', { title: 'A', prompt: BRIEF, permission_mode: 'AUTO' }, { permission_mode: 'auto' });
        record('session: the mode compare is exact: child AUTO -> denied naming both', 'denied', deniedWith(r, 'child mode AUTO, policy requires auto'), r.out);
        r = start('ss-mode7', { title: 'A', permission_mode: 'auto' }, { permission_mode: 'default' });
        record('session: the mode rule holds a create_session with no prompt as well', 'denied', deniedWith(r, 'caller mode default, policy requires auto'), r.out);
        r = call('ss-mode8', TOOL_DESKTOP, { title: 'A', prompt: BRIEF, initiation: 'user_asked' }, { permission_mode: 'default' });
        record('session: the desktop start tool is not held to requireMode', 'allowed', verdict(r), r.out);
        r = start('ss-mode9', { title: 'A', prompt: NO_DONE, permission_mode: 'auto' }, { permission_mode: 'auto' });
        record('session: the brief is still checked under requireMode', 'denied', deniedWith(r, 'Done when:'), r.out);
        // A requireMode that is not a string is no rule, never a mode named "false" (a brain copy may write false for off).
        put(brainPolicy, toJson({ ...modePolicy, session: { requireMode: false } }));
        r = start('ss-mode10', { title: 'A', prompt: BRIEF, permission_mode: 'default' }, { permission_mode: 'default' });
        record('session: requireMode false (not a string) holds no mode rule', 'allowed', verdict(r), r.out);
        // A brain policy whose sessionTools lacks create_session (a copy older than the cloud tool): the brief is not
        // checked, but rules 4 and 5 hold on every create_session the hook sees, and one WARN line names the policy
        // file. Red before (the documented hole): the start passed in silence, brief, mode and marker alike.
        put(brainPolicy, toJson({ ...modePolicy, brief: { ...modePolicy.brief, sessionTools: [TOOL_DESKTOP] } }));
        const holeWarn = (from) => readText(process.env.DF_LOG_PATH).slice(from).split(/\r?\n/).filter((l) => l.includes(`WARN agent create_session is not in brief.sessionTools of ${brainPolicy}: its brief is not checked`)).length;
        let holeFrom = readText(process.env.DF_LOG_PATH).length;
        r = start('ss-hole', { title: 'A', prompt: NO_DONE, permission_mode: 'default' }, { permission_mode: 'default' });
        record('session: a brain policy without create_session in sessionTools still holds the mode rule (a wrong mode is denied)', 'denied', deniedWith(r, 'caller mode default, policy requires auto'), r.out);
        record('session: that start writes one WARN line naming the policy file (its brief is not checked)', '1', String(holeWarn(holeFrom)), readText(process.env.DF_LOG_PATH).slice(holeFrom));
        r = start('ss-hole2', { title: 'A', prompt: NO_DONE, permission_mode: 'auto' }, { permission_mode: 'auto' });
        record('session: without create_session in sessionTools the brief is not checked (no Done when: passes) and the allowed start writes the marker', 'allowed+written', `${verdict(r)}+${markerLines('ss-hole2').length === 1 ? 'written' : 'absent'}`, r.out);
        // A policy with no brief key at all names no session tool either: the same two rules hold.
        put(brainPolicy, toJson({ schema: 1, routes: { default: 'inherit' }, cap: { perTurn: 8 }, session: { requireMode: 'auto' } }));
        holeFrom = readText(process.env.DF_LOG_PATH).length;
        r = start('ss-hole3', { title: 'A', prompt: NO_DONE, permission_mode: 'default' }, { permission_mode: 'auto' });
        record('session: a brain policy with no brief key still holds the mode rule (a wrong child mode is denied) and logs the WARN line', 'denied+1', `${deniedWith(r, 'child mode default, policy requires auto')}+${holeWarn(holeFrom)}`, r.out);
    } finally { fs.rmSync(brainPolicy, { force: true }); }
    r = start('ss-after', { title: 'A', prompt: BRIEF, permission_mode: 'default' }, { permission_mode: 'default' });
    record('session: the brain policy removed, the template (requireMode null) holds no mode rule', 'allowed', verdict(r), r.out);
    record('session: the planted brain policy is gone for the cases after this file', 'gone', exists(brainPolicy) ? 'left' : 'gone');
}
