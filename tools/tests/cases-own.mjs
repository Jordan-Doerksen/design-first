// cases-own.mjs - hook self-test cases for OWN-04 (the shape of a question, hooks/ask.mjs) and OWN-10
// (the always route, hooks/route.mjs alwaysForSessions; hooks/subagent.mjs leaves those groups out).
// Imported by run.mjs, which owns the fixtures and helpers used here. Never run directly.

import fs from 'node:fs';
import path from 'node:path';

export default function ownCases(t) {
    const { kit, brain, root, repoClean, record, section, blank, put, readText, exists, invokeHook, hookJson, classify, route, sub, entry } = t;

    section('-- OWN-04 and OWN-10: the ask config and the always route');
    const policyFile = path.join(brain, 'route-policy.json');
    const alwaysKept = exists(policyFile) ? readText(policyFile) : null;
    if (alwaysKept != null) fs.rmSync(policyFile, { force: true });   // the template policy (alwaysForSessions: OWN) applies
    // always-route (OWN-10, CR-2026-10-14-OPTIONS): the template's alwaysForSessions group reaches every session
    let r = route('yes please', 'r-own', repoClean);
    record('route: a fresh session whose prompt names nothing gets OWN, with OWN-04 and OWN-10', 'own', r.code === 0 && /group OWN/i.test(r.out) && /OWN-04 \[HOOK\]/i.test(r.out) && /OWN-10 \[ADVISE\]/i.test(r.out) ? 'own' : 'missing', r.out);
    r = route('ok', 'r-own', repoClean);
    record('route: the always group is not injected twice in a session', 'silent', !/group OWN/i.test(r.out) ? 'silent' : 'again', r.out);
    r = route('please build the new feature and commit it', 'r-own2', root);
    record('route: the always group comes before the matched groups', 'first', r.out.indexOf('group OWN') >= 0 && r.out.indexOf('group OWN') < r.out.indexOf('group DES') ? 'first' : 'later', r.out);
    entry(root, 'r-own', 'compact');
    r = route('ok', 'r-own', repoClean);
    record('route: after compaction the always group is injected again', 'own-again', /group OWN/i.test(r.out) ? 'own-again' : 'silent', r.out);
    r = sub('r-own', 'general-purpose');
    record('subagent: a session-only group (alwaysForSessions) is not sent to a subagent', 'no-own', r.code === 0 && /group SAFE/i.test(r.out) && !/group OWN/i.test(r.out) && /OWN-06 \(deliver\)/i.test(r.out) ? 'no-own' : 'wrong', r.out);
    // A brain policy without the key behaves as before 0.1.34: nothing routes on a prompt that names nothing.
    const tplPolicy = JSON.parse(readText(path.join(kit, 'templates', 'route-policy.json')));
    delete tplPolicy.alwaysForSessions;
    const policyKept = exists(policyFile) ? readText(policyFile) : null;
    put(policyFile, JSON.stringify(tplPolicy, null, 2));
    r = route('yes please', 'r-nokey', root);
    record('route: a brain policy without alwaysForSessions routes nothing on a bare prompt (as 0.1.33)', 'silent', r.code === 0 && blank(r.out) ? 'silent' : 'noisy', r.out);
    route('please build it', 'r-nokey', root);
    r = sub('r-nokey', 'general-purpose');
    record('subagent: without the key, a subagent gets SAFE and the session groups (as 0.1.33)', 'safe+des', /group SAFE/i.test(r.out) && /group DES/i.test(r.out) && !/group OWN/i.test(r.out) ? 'safe+des' : 'wrong', r.out);
    if (policyKept != null) put(policyFile, policyKept); else fs.rmSync(policyFile, { force: true });
    if (alwaysKept != null) put(policyFile, alwaysKept);

    // ask config (OWN-04): the brain's `ask` key turns checks off, and an unreadable config keeps the defaults
    const askBare = (session) => invokeHook('ask.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'q', header: 'h', multiSelect: false, options: [{ label: 'a', description: 'a' }, { label: 'b', description: 'b' }] }] } }));
    const cfgPath = path.join(brain, 'doctor.config.json');
    const cfgOrig = readText(cfgPath);
    const cfgOff = JSON.parse(cfgOrig);
    cfgOff.ask = { minReason: 0, recommendedMarker: '' };
    put(cfgPath, JSON.stringify(cfgOff, null, 2));
    r = askBare('st-ask-off');
    record('ask: minReason 0 and an empty marker turn those checks off', 'allow', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
    put(cfgPath, '{ this is not json');
    r = askBare('st-ask-broken');
    record('ask: an unreadable brain config keeps the default checks (no fail-open)', 'deny', r.code === 0 ? classify(r.out) : `exit${r.code}`, r.out);
    invokeHook('ask.mjs', hookJson({ session_id: 'st-ask-broken-ok', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'q', header: 'h', multiSelect: false, options: [{ label: 'a (Recommended)', description: 'Gives the thing the case needs; costs nothing worth a word.' }, { label: 'b', description: 'Gives a second path for a different owner; costs one more step.' }] }] } }));
    record('ask: with an unreadable config, an allowed question still writes the marker', 'written', exists(path.join(process.env.DF_MARKER_DIR, 'st-ask-broken-ok.asked')) ? 'written' : 'missing');
    put(cfgPath, cfgOrig);
}
