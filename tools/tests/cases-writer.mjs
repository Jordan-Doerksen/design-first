// cases-writer.mjs - hook self-test cases for writerSkip (owner ruling 29, 2026-10-20): the router
// records a session whose FIRST prompt has "Reports to:" at the start of a line as a writer and leaves
// the policy's writerSkip groups and clause rows out of it; hooks/subagent.mjs applies the same skip.
// 0.3.0: a line-start "Role:" is read before "Reports to:" (only "Role: writer" is a writer), and a
// session whose marker is gone on a later prompt is re-marked from that prompt's "Role:" line.
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

    // role (0.3.0, chunk 1 row 29): a line-start "Role:" on the first prompt is read before "Reports to:".
    // Only "Role: writer" marks a writer; any other value (planning, master, reviewer, checker, owner) marks
    // an owner session even when the same brief names a master with "Reports to:". When the marker is
    // gone on a later prompt (a reclaimed VM empties the marker folder), the role is decided again from
    // that prompt: "Role: writer" re-marks the writer, a prompt with neither line reads as owner. With
    // the marker present, a later "Reports to:" or "Role:" line changes nothing (today's rule, kept).
    section('-- role: "Role:" is read before "Reports to:" on the first prompt; a lost marker is re-marked');
    withSkip({ groups: [], clauses: ['OWN-06', 'DES-05'] });
    const roleOf = (id) => { const f = path.join(process.env.DF_MARKER_DIR, `${id}.role`); return exists(f) ? readText(f).trim() : 'none'; };
    // the reclaimed VM: every marker of the session is gone, not only the role
    const wipe = (id) => { for (const f of fs.readdirSync(process.env.DF_MARKER_DIR)) if (f.startsWith(`${id}.`)) fs.rmSync(path.join(process.env.DF_MARKER_DIR, f), { force: true }); };
    const master = 'Reports to: Method Master Control, the session that started you';
    r = route(`Role: planning\nGoal: plan the thing\n${master}\nVoice: terse`, 'w-role-plan', repoClean);
    record('role: a first prompt with "Role: planning" and a "Reports to:" line is not a writer (OWN-06 arrives)', 'owner', roleOf('w-role-plan') === 'owner' && /group OWN/.test(r.out) && has(r.out, 'OWN-06') ? 'owner' : `marked=${roleOf('w-role-plan')}`, r.out);
    record('role: the owner law rows still route for the planning session (5 clauses)', 'whole', /: 5 clause/.test(r.out) && has(r.out, 'OWN-04') && has(r.out, 'OWN-05') && has(r.out, 'OWN-10') ? 'whole' : 'wrong', r.out);
    for (const value of ['master', 'reviewer', 'checker', 'owner']) {
        const id = `w-role-${value}`;
        r = route(`Role: ${value}\nGoal: do the thing\n${master}`, id, repoClean);
        record(`role: "Role: ${value}" with a "Reports to:" line is not a writer`, 'owner', roleOf(id) === 'owner' && has(r.out, 'OWN-06') ? 'owner' : `marked=${roleOf(id)}`, r.out);
    }
    r = route(`Role: writer\nGoal: do the thing\n${master}\nVoice: terse`, 'w-role-writer', repoClean);
    record('role: a first prompt with "Role: writer" marks a writer (OWN-06 is skipped)', 'writer', roleOf('w-role-writer') === 'writer' && /group OWN/.test(r.out) && !has(r.out, 'OWN-06') && has(r.out, 'OWN-05') ? 'writer' : `marked=${roleOf('w-role-writer')}`, r.out);
    r = route('Role: writer\nGoal: do the thing\nVoice: terse', 'w-role-only', repoClean);
    record('role: "Role: writer" with no "Reports to:" line is a writer too', 'writer', roleOf('w-role-only') === 'writer' && !has(r.out, 'OWN-06') && has(r.out, 'OWN-05') ? 'writer' : `marked=${roleOf('w-role-only')}`, r.out);
    r = route('Role: Writer\nGoal: do the thing', 'w-role-case', repoClean);
    record('role: the value is read without case ("Role: Writer")', 'writer', roleOf('w-role-case') === 'writer' && !has(r.out, 'OWN-06') ? 'writer' : `marked=${roleOf('w-role-case')}`, r.out);
    r = route('the role: writer is a phrase mid-line, and a Role: writer heading mid-line too', 'w-role-mid', repoClean);
    record('role: a mid-line "Role:" does not mark a writer', 'owner', roleOf('w-role-mid') === 'owner' && has(r.out, 'OWN-06') ? 'owner' : `marked=${roleOf('w-role-mid')}`, r.out);
    // A host reminder block prepended to the typed text with no newline between them (the host hands
    // "<system-reminder>...</system-reminder>Role: writer" over as one string): the block is stripped, and
    // what replaces it must leave the typed text's first line at a line start, or neither "Role:" nor
    // "Reports to:" is read. The block's own words (review, gate, package) must still route nothing.
    // The first brief carries no "Reports to:" line, so only its "Role:" line can mark it.
    // Red before route.mjs replaced the block with a line break instead of a space: marked=owner.
    const reminder = '<system-reminder>\nThe host attached this: review the page, log the gate, add a package.\n</system-reminder>';
    r = route(`${reminder}Role: writer\nGoal: do the thing\nVoice: terse`, 'w-role-reminder', repoClean);
    record('role: a host reminder block directly followed by "Role: writer" (no newline between) marks a writer', 'writer', roleOf('w-role-reminder') === 'writer' && !has(r.out, 'OWN-06') && has(r.out, 'OWN-05') && !/group GATE/.test(r.out) ? 'writer' : `marked=${roleOf('w-role-reminder')}`, r.out);
    r = route(`${reminder}Reports to: M\nGoal: do the thing`, 'w-role-reminder2', repoClean);
    record('role: a host reminder block directly followed by "Reports to: M" (no newline between) marks a writer', 'writer', roleOf('w-role-reminder2') === 'writer' && !has(r.out, 'OWN-06') && has(r.out, 'OWN-05') ? 'writer' : `marked=${roleOf('w-role-reminder2')}`, r.out);
    // the reclaimed VM: the markers are gone on a later prompt
    {
        const id = 'w-role-remark';
        route('yes please', id, repoClean);
        const wasOwner = roleOf(id) === 'owner';
        wipe(id);
        r = route('Role: writer\nplease build the new feature', id, root);
        record('role: a deleted marker plus a later prompt with "Role: writer" re-marks the writer', 'writer', wasOwner && roleOf(id) === 'writer' ? 'writer' : `was=${wasOwner} marked=${roleOf(id)}`, r.out);
        record('role: the re-marked writer gets the skip (OWN-06 and DES-05 out, the rest of both groups in)', 'skipped', /group OWN/.test(r.out) && !has(r.out, 'OWN-06') && has(r.out, 'OWN-05') && /group DES/.test(r.out) && !has(r.out, 'DES-05') && has(r.out, 'DES-04') ? 'skipped' : 'wrong', r.out);
    }
    {
        const id = 'w-role-plain';
        route('yes please', id, repoClean);
        wipe(id);
        r = route('please build the new feature', id, root);
        record('role: a deleted marker plus a plain prompt stays owner (OWN-06 and DES-05 arrive)', 'owner', roleOf(id) === 'owner' && has(r.out, 'OWN-06') && has(r.out, 'DES-05') ? 'owner' : `marked=${roleOf(id)}`, r.out);
    }
    {
        const id = 'w-role-lost';
        route(brief, id, repoClean);
        const wasWriter = roleOf(id) === 'writer';
        wipe(id);
        r = route('please build the new feature', id, root);
        record('role: a writer whose markers are gone reads as owner on a plain prompt (the re-mark needs a "Role:" line)', 'owner', wasWriter && roleOf(id) === 'owner' && has(r.out, 'OWN-06') && has(r.out, 'DES-05') ? 'owner' : `was=${wasWriter} marked=${roleOf(id)}`, r.out);
    }
    // the marker present: a later line changes nothing (today's rule)
    route('yes please', 'w-role-late', repoClean);
    r = route('Reports to: someone\nplease build the new feature', 'w-role-late', root);
    record('role: with the marker present, a later "Reports to:" alone changes nothing', 'owner', roleOf('w-role-late') === 'owner' && has(r.out, 'DES-05') ? 'owner' : `marked=${roleOf('w-role-late')}`, r.out);
    route('yes please', 'w-role-late2', repoClean);
    r = route('Role: writer\nplease build the new feature', 'w-role-late2', root);
    record('role: with the marker present, a later "Role: writer" changes nothing either (the mark is the role)', 'owner', roleOf('w-role-late2') === 'owner' && has(r.out, 'DES-05') ? 'owner' : `marked=${roleOf('w-role-late2')}`, r.out);

    if (kept != null) put(policyFile, kept); else fs.rmSync(policyFile, { force: true });
}
