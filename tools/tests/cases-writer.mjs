// cases-writer.mjs - hook self-test cases for writerSkip (owner ruling 29, 2026-10-20): the router
// records a session whose FIRST prompt has "Reports to:" at the start of a line as a writer and leaves
// the policy's writerSkip groups and clause rows out of it; hooks/subagent.mjs applies the same skip.
// Imported by run.mjs, which owns the fixtures and helpers used here. Never run directly.

import fs from 'node:fs';
import path from 'node:path';

export default function writerCases(t) {
    const { kit, brain, root, repoClean, record, section, put, readText, exists, route, sub, entry } = t;

    section('-- writerSkip: owner-voice law stays out of a writer session');
    const policyFile = path.join(brain, 'route-policy.json');
    const kept = exists(policyFile) ? readText(policyFile) : null;
    const tpl = JSON.parse(readText(path.join(kit, 'templates', 'route-policy.json')));
    const withSkip = (skip) => { const p = JSON.parse(JSON.stringify(tpl)); if (skip === undefined) delete p.writerSkip; else p.writerSkip = skip; put(policyFile, JSON.stringify(p, null, 2)); };
    const has = (out, id) => new RegExp(`\\b${id} \\[`).test(out);
    const brief = 'Goal: do the thing\nReports to: Method Master Control, the session that started you\nVoice: terse';

    // The kit's OWN group is OWN-04, 05, 06, 07 and 10; its DES group holds DES-04 and DES-05. These
    // clause ids stand in for the brain's owner-voice clause (OWN-09 lives in the brain's overlay, not
    // in the kit's LAW.md).
    withSkip({ groups: [], clauses: ['OWN-06', 'DES-05'] });
    let r = route(brief, 'w-a', repoClean);
    record('writer: a brief session gets the OWN group without the skipped clause', 'skipped', r.code === 0 && /group OWN/.test(r.out) && !has(r.out, 'OWN-06') ? 'skipped' : 'wrong', r.out);
    record('writer: the other clauses of the same group still arrive (OWN-04, 05, 10)', 'rest', has(r.out, 'OWN-05') && has(r.out, 'OWN-04') && has(r.out, 'OWN-10') ? 'rest' : 'lost', r.out);
    record('writer: the group line counts the rows that printed', '4 clause', /group OWN \(.*\): 4 clause/.test(r.out) ? '4 clause' : 'wrong', r.out);
    r = route('please build the new feature', 'w-a', root);
    record('writer: a clause skipped in a later group is skipped there too, the group still prints', 'skipped', /group DES/.test(r.out) && has(r.out, 'DES-04') && !has(r.out, 'DES-05') ? 'skipped' : 'wrong', r.out);

    r = route('yes please', 'w-o', repoClean);
    record('non-writer: the same policy leaves a plain session unchanged (OWN-06 arrives)', 'whole', /: 5 clause/.test(r.out) && has(r.out, 'OWN-06') ? 'whole' : 'wrong', r.out);
    r = route('please build the new feature', 'w-o', root);
    record('non-writer: DES-05 arrives in a plain session', 'whole', has(r.out, 'DES-05') ? 'whole' : 'wrong', r.out);

    route('yes please', 'w-late', repoClean);
    r = route('Reports to: someone\nplease build the new feature', 'w-late', root);
    record('late brief: a plain first prompt, then "Reports to:", is not a writer', 'owner', has(r.out, 'DES-05') ? 'owner' : 'writer', r.out);
    r = route('note that Reports to: is a heading', 'w-mid', repoClean);
    record('mid-line "Reports to:" does not mark a writer', 'owner', has(r.out, 'OWN-06') ? 'owner' : 'writer', r.out);

    // a clear clears the mark and the next prompt decides again; a compaction keeps it
    {
        const id = 'w-clear';
        route(brief, id, repoClean);
        const roleFile = path.join(process.env.DF_MARKER_DIR, `${id}.role`);
        const marked = exists(roleFile) && readText(roleFile).trim() === 'writer';
        entry(root, id, 'clear');
        const gone = !exists(roleFile);
        r = route('yes please', id, repoClean);
        record('writer: a clear clears the mark, and a plain next prompt is not a writer', 'cleared', marked && gone && has(r.out, 'OWN-06') ? 'cleared' : `marked=${marked} gone=${gone}`, r.out);
    }
    {
        const id = 'w-compact';
        route(brief, id, repoClean);
        const roleFile = path.join(process.env.DF_MARKER_DIR, `${id}.role`);
        entry(root, id, 'compact');
        const kept = exists(roleFile) && readText(roleFile).trim() === 'writer';
        r = route('yes please', id, repoClean);
        record('writer: a compaction keeps the mark, and a plain next prompt still gets no skipped clause', 'kept', kept && /group OWN/.test(r.out) && has(r.out, 'OWN-05') && !has(r.out, 'OWN-06') ? 'kept' : `kept=${kept}`, r.out);
    }

    // whole-group skip
    withSkip({ groups: ['GATE'], clauses: [] });
    r = route(`${brief}\ninterview me on this addition`, 'w-g', repoClean);
    record('writer: a skipped group does not print', 'none', !/group GATE/.test(r.out) && /group OWN/.test(r.out) ? 'none' : 'printed', r.out);
    r = route('interview me on this addition', 'w-g2', repoClean);
    record('non-writer: the same group prints', 'gate', /group GATE/.test(r.out) ? 'gate' : 'missing', r.out);

    // a subagent is always a writer
    withSkip({ groups: [], clauses: ['OWN-06', 'DES-05'] });
    route('please build the new feature', 'w-s', root);
    r = sub('w-s', 'general-purpose');
    record('subagent: a skipped clause is out of the group rows and the advise block', 'skipped', r.code === 0 && /group DES/.test(r.out) && has(r.out, 'DES-01') && !has(r.out, 'DES-05') && !/DES-05 \(/.test(r.out) && !/OWN-06 \(/.test(r.out) ? 'skipped' : 'wrong', r.out);
    record('subagent: the other advise clauses still arrive (OWN-05)', 'rest', /OWN-05 \(decide\)/.test(r.out) ? 'rest' : 'lost', r.out);

    // no key, or an empty one: exactly today's behaviour
    for (const [label, skip] of [['no key', undefined], ['an empty key', { groups: [], clauses: [] }]]) {
        withSkip(skip);
        const id = `w-e-${label.replace(/\W/g, '')}`;
        r = route(`${brief}\nplease build the new feature`, id, root);
        record(`writer: ${label} drops nothing`, 'whole', /: 5 clause/.test(r.out) && has(r.out, 'OWN-06') && has(r.out, 'DES-05') ? 'whole' : 'wrong', r.out);
        r = sub(id, 'general-purpose');
        record(`subagent: ${label} drops nothing`, 'whole', has(r.out, 'DES-05') && /OWN-06 \(/.test(r.out) ? 'whole' : 'wrong', r.out);
    }

    if (kept != null) put(policyFile, kept); else fs.rmSync(policyFile, { force: true });
}
