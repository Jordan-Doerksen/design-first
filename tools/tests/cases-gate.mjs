// cases-gate.mjs - hook self-test cases for guard rule 10, the design gate, and the docs/ manifest
// that rules 5 and 10 read (CR-2026-10-15-GAPS D2). Imported by run.mjs, which owns the fixtures and
// helpers used here. Never run directly.
//
// Each block names the clause it holds and the form that used to pass:
//   GATE-09  the record: a line counts only as '- <id> resolved|recorded: <where>', any other '- '
//            line refuses, and the distinct ids must equal Findings. '- F1 not resolved yet' cleared
//            the gate, because the word 'resolved' was found anywhere in the line. A Findings count
//            too large to parse threw, and the guard's internal-error path let the write through.
//            After the final review: a list line in another style ('* ', '+ ', '1. ') and a second
//            Findings line refuse; '* F2 open' sat beside a clean '- F1' line and the gate cleared.
//   GATE-08  an Edit or Write that removes the gate line from DECISIONS.md while the gate is not
//            cleared is refused, also when old_string matches only after curly quotes are folded,
//            as the host matches it. Every DECISIONS.md write passed, because it is not source.
//   DES-02   a DECISIONS.md in docs/ is a manifest: rule 5 does not advise, and rule 10 reads its
//   GATE-08  gate line. Both rules read only the root, so the gate was silently off.
// Run against the two rule files of 9409b1c (2026-10-15), 23 of the first 27 cases fail. Most were
// allowed or advised before; '- F1 unresolved' and a short count were refused before too, under
// another reason, so they fail on the reason text. The 4 that pass either way are allow cases that
// hold the other side: a record in the strict form, a kept gate line, a gate that is cleared, and a
// DECISIONS.md that is not the manifest. The 4 'gate review' cases came later; all 4 are allowed by
// the D2 rule file that the review read, and fail if their fix is reverted. The 'gate check' case
// came from the check of those fixes: a list inside a quote ('> - F2') hid a finding the same way.

import path from 'node:path';

export default function gateCases(t) {
    const { root, repoGated, repoGatedOk, repoGatedBad, repoNoManifest, record, section, like, jp, put, newRepo, invokeHook, hookJson, classify } = t;

    const run = (tool, ti, session) => invokeHook('guard.mjs', hookJson({ session_id: session, cwd: root, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: ti }));
    const gtCase = (name, tool, ti, expect, contains, session = 'gt') => {
        const r = run(tool, ti, session);
        let got = r.code !== 0 ? `exit${r.code}` : classify(r.out);
        if (got === expect && contains && !like(r.out, `*${contains}*`)) got = `missing-text:${contains}`;
        record(name, expect, got, r.out);
    };
    // A gated repository with one source file. manifestRel is DECISIONS.md or docs/DECISIONS.md; an
    // empty record writes no record.
    const gtRepo = (name, manifestRel, manifest, rec) => {
        const d = newRepo(name);
        put(jp(d, 'src', 'core.py'), 'print(1)');
        if (manifestRel) put(jp(d, manifestRel), manifest);
        if (rec) put(jp(d, 'records', 'gate-cleared.md'), rec);
        return d;
    };
    const writeSource = (name, repo, expect, contains) => gtCase(name, 'Write', { file_path: jp(repo, 'src', 'core.py'), content: 'print(2)' }, expect, contains);
    const on = '# decisions\n\nDesign gate: on\n';

    // ------------------------------------------------------------------ GATE-09: the record's strict form
    section('-- gate D2: GATE-09, the record counts only finding lines');
    let g = gtRepo('repo-gt-neg', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 not resolved yet\n');
    writeSource("gate D2: record '- F1 not resolved yet' -> deny, status negated", g, 'deny', 'negated');
    g = gtRepo('repo-gt-unres', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 unresolved: SPEC 4.2\n');
    writeSource("gate D2: record '- F1 unresolved: SPEC 4.2' -> deny, status negated", g, 'deny', 'negated');
    g = gtRepo('repo-gt-negid', 'DECISIONS.md', on, 'Findings: 1\n\n- not resolved: F1\n');
    writeSource("gate D2: record '- not resolved: F1' (a word in the id's place) -> deny", g, 'deny', 'negated');
    g = gtRepo('repo-gt-misplaced', 'DECISIONS.md', on, 'Findings: 1\n\n- F1: resolved in SPEC 4.2\n');
    writeSource("gate D2: record '- F1: resolved in ...' (status after the colon) -> deny", g, 'deny', 'not right after its id');
    g = gtRepo('repo-gt-noplace', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved\n');
    writeSource("gate D2: record '- F1 resolved' (no ': <where>') -> deny", g, 'deny', 'names no place');
    g = gtRepo('repo-gt-noid', 'DECISIONS.md', on, 'Findings: 1\n\n- A resolved: SPEC 4.2\n');
    writeSource("gate D2: record '- A resolved: ...' (an id with no digit) -> deny", g, 'deny', 'carries no digit');
    g = gtRepo('repo-gt-dup', 'DECISIONS.md', on, 'Findings: 2\n\n- F1 resolved: SPEC 4.2\n- F1 recorded: Open Questions row 3\n');
    writeSource('gate D2: Findings: 2 with one id listed twice -> deny, distinct ids counted', g, 'deny', '1 distinct');
    g = gtRepo('repo-gt-extra', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved: SPEC 4.2\n- F2 resolved: SPEC 4.3\n');
    writeSource('gate D2: Findings: 1 with two ids listed -> deny, count must equal', g, 'deny', 'Findings: 1 declared, 2 distinct');
    g = gtRepo('repo-gt-stray', 'DECISIONS.md', on, 'Findings: 2\n\n- F1 resolved: SPEC 4.2\n- F2 recorded: Open Questions row 3\n- every question resolved by the second reader\n');
    writeSource("gate D2: a stray '- ' line that says 'resolved' -> deny, line named", g, 'deny', 'every question resolved by the second reader');
    g = gtRepo('repo-gt-short', 'DECISIONS.md', on, 'Findings: 3\n\n- F1 resolved: SPEC 4.2\n- F2 recorded: Open Questions row 3\n');
    writeSource('gate D2: Findings: 3 with two ids listed -> deny', g, 'deny', 'Findings: 3 declared, 2 distinct');
    // The same id marked up two ways is one finding, not two.
    g = gtRepo('repo-gt-markup', 'DECISIONS.md', on, 'Findings: 2\n\n- **F1** resolved: SPEC 4.2\n- F1 recorded: Open Questions row 3\n');
    writeSource("gate D2: Findings: 2 with '**F1**' and 'F1' -> deny, one id however marked", g, 'deny', 'Findings: 2 declared, 1 distinct');
    // A count past the integer range threw in the parser, and the guard's internal-error path allowed the write.
    g = gtRepo('repo-gt-huge', 'DECISIONS.md', on, 'Findings: 99999999999\n\n- F1 resolved: SPEC 4.2\n');
    writeSource('gate D2: a Findings count past the integer range -> deny, not an error allow', g, 'deny', 'is not a count');
    // A list line in another style hid a finding from the count: '- ' lines alone were read, so a second
    // finding written as '* ', '+ ' or '1. ' sat open while 'Findings: 1' cleared the gate. And only the
    // first Findings line was read. Both were found by the final review of CR-2026-10-15-GAPS.
    g = gtRepo('repo-gt-star', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved: SPEC 4.2\n* F2 open, the reviewer is still checking\n');
    writeSource("gate review: a '* F2 open' line beside a clean '- F1' line -> deny, line named", g, 'deny', 'F2 open, the reviewer is still checking');
    g = gtRepo('repo-gt-numbered', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved: SPEC 4.2\n1. F2 open\n');
    writeSource("gate review: a '1. F2 open' line -> deny, another list style", g, 'deny', 'another style');
    g = gtRepo('repo-gt-plus', 'DECISIONS.md', on, 'Findings: 1\n\n+ F2 open\n- F1 resolved: SPEC 4.2\n');
    writeSource("gate review: a '+ F2 open' line -> deny, another list style", g, 'deny', 'another style');
    g = gtRepo('repo-gt-twocounts', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved: SPEC 4.2\n\nFindings: 3\n');
    writeSource('gate review: two Findings lines (1 and 3) -> deny, ambiguous', g, 'deny', 'the record states one count');
    // A list inside a quote was read as neither a '- ' line nor another style (hooks check of the fixes).
    g = gtRepo('repo-gt-quoted', 'DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved: SPEC 4.2\n\n> - F2 open, from the second reader\n');
    writeSource("gate check: a '> - F2 open' line inside a quote -> deny, line named", g, 'deny', 'inside a quote');
    // The strict form clears: CRLF line ends, prose, a lower or upper case status word and an id with a
    // hyphen. A rule that refused this record would refuse every honest one. (Until the review above it
    // also held a '* ' note line; a '* ' line is now refused, so the note is prose.)
    g = gtRepo('repo-gt-clean', 'DECISIONS.md', on, '# Gate cleared\r\n\r\nFindings: 2\r\n\r\nTwo readers, 2026-10-15.\r\n\r\nA note, not a finding.\r\n' +
        '- F1 resolved: the spec names the failure mode (SPEC 4.2)\r\n- S1-8 Recorded: Open Questions row 3, owner named\r\n');
    writeSource('gate D2: a record in the strict form (CRLF, prose, two ids) -> allowed', g, 'allow', '');

    // ------------------------------------------------------------------ GATE-08: the gate line stays while the gate is open
    section('-- gate D2: GATE-08, the agent does not remove an open gate line');
    const decisions = path.join(repoGated, 'DECISIONS.md');
    gtCase('gate D2: Edit that deletes the open gate line -> deny', 'Edit', { file_path: decisions, old_string: 'Design gate: on\n', new_string: '' }, 'deny', 'Change Request');
    gtCase("gate D2: Edit that turns the open gate line to 'off' -> deny", 'Edit', { file_path: decisions, old_string: 'Design gate: on', new_string: 'Design gate: off' }, 'deny', 'Design gate: on');
    gtCase('gate D2: Write of DECISIONS.md without the open gate line -> deny', 'Write', { file_path: decisions, content: '# decisions\n\nThe gate is done.\n' }, 'deny', 'removes the');
    gtCase('gate D2: Write of DECISIONS.md that keeps the open gate line -> allowed', 'Write', { file_path: decisions, content: '# decisions\n\nDesign gate: on\n\n## 1. Scope\n' }, 'allow', '');
    gtCase('gate D2: Edit that deletes the line while the record is bad (Findings: 0) -> deny', 'Edit', { file_path: path.join(repoGatedBad, 'DECISIONS.md'), old_string: 'Design gate: on\n', new_string: '' }, 'deny', 'Findings: 0');
    gtCase('gate D2: Edit that deletes the gate row once the gate is cleared -> allowed', 'Edit', { file_path: path.join(repoGatedOk, 'DECISIONS.md'), old_string: '| Design gate | on |\n', new_string: '' }, 'allow', '');
    // The host finds old_string after folding curly quotes to straight ones, so the check folds them too:
    // an exact match missed this old_string, allowed, and the host removed the line.
    const curly = gtRepo('repo-gt-curly', 'DECISIONS.md', '# decisions\n\n\u201CGate\u201D below.\nDesign gate: on\n', null);
    gtCase('gate D2: Edit with straight quotes where the file has curly ones, removing the line -> deny', 'Edit', { file_path: path.join(curly, 'DECISIONS.md'), old_string: '"Gate" below.\nDesign gate: on\n', new_string: '' }, 'deny', 'Change Request');

    // ------------------------------------------------------------------ DES-02 / GATE-08: a manifest in docs/
    section('-- gate D2: DES-02 / GATE-08, a manifest in docs/');
    const docsOpen = gtRepo('repo-gt-docs-open', 'docs/DECISIONS.md', on, null);
    put(jp(docsOpen, 'vendor', 'DECISIONS.md'), on);   // a DECISIONS.md that is not the manifest
    // The reason names the manifest that declares the gate; JSON doubles a backslash in that name.
    writeSource('gate D2: gate line in docs/DECISIONS.md, no record -> source write denied', docsOpen, 'deny', JSON.stringify(jp('docs', 'DECISIONS.md')).slice(1, -1) + ' declares');
    gtCase('gate D2: Edit that deletes the open gate line in docs/DECISIONS.md -> deny', 'Edit', { file_path: jp(docsOpen, 'docs', 'DECISIONS.md'), old_string: 'Design gate: on\n', new_string: '' }, 'deny', 'Change Request');
    gtCase('gate D2: the same edit in a DECISIONS.md that is not the manifest -> allowed', 'Edit', { file_path: jp(docsOpen, 'vendor', 'DECISIONS.md'), old_string: 'Design gate: on\n', new_string: '' }, 'allow', '');
    g = gtRepo('repo-gt-docs-shadow', 'docs/DECISIONS.md', on, null);
    put(path.join(g, 'DECISIONS.md'), '# decisions');
    writeSource('gate D2: a root DECISIONS.md with no gate line does not hide the docs/ gate -> deny', g, 'deny', 'gate-cleared.md');
    g = gtRepo('repo-gt-docs-ok', 'docs/DECISIONS.md', on, 'Findings: 1\n\n- F1 resolved: SPEC 4.2\n');
    writeSource('gate D2: docs/ gate with a clean record -> allowed', g, 'allow', '');
    g = gtRepo('repo-gt-docs-plain', 'docs/DECISIONS.md', '# decisions', null);
    gtCase('manifest D2: source write with DECISIONS.md in docs/ -> no advise', 'Write', { file_path: jp(g, 'src', 'core.py'), content: 'print(2)' }, 'allow', '', 'gt-manifest-docs');
    gtCase('manifest D2: source write with no manifest anywhere -> advises, names docs/', 'Write', { file_path: jp(repoNoManifest, 'src', 'app.py'), content: 'print(2)' }, 'advise', 'in docs', 'gt-manifest-none');
}
