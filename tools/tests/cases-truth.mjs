// cases-truth.mjs - hook self-test cases for the places where the Stop card or a session marker said
// something false, or a count passed silently (CR-2026-10-15-GAPS D5). Imported by run.mjs after
// cases-gate.mjs, which owns the fixtures and helpers used here. Never run directly.
//
// Each block names the fix it holds and what the hook did before it:
//   1  the Change Log flag counts only ADDED dated rows. A Write that kept an old row, or an Edit
//      that reworded one, was flagged as a new entry, git's diff took a reworded row for a new one,
//      and the ledger flag overrode git, so the GATE-06 line never appeared. git now decides for a
//      file it lists; the rows of a file staged before the first commit all count as added.
//   2  the docs test reads the path inside the repository, and a source extension wins. A repository
//      below any folder named docs got no card at all; docs/build.mjs was a document.
//   3  a repository past the git status cap is carded, its count called a floor. The capped flag was
//      set and never read, so a change past the cap passed without a word.
//   4  a time budget, a guard-error count and an earlier turn reset. The host ended a slow Stop hook
//      without a word; a call the guard failed on vanished from the card, also when a guard library
//      failed to load before the call was read; a router whose libraries failed to load left the
//      last turn's record in place.
//   5  housekeeping keeps a live session's markers. A session resumed after a day lost its interview
//      marker, and the card said no question was asked when one was.
//   6  a clear deletes the session's routes, as a compaction does.
//   7  a skill counts as named only once it printed, and prints alone when no group fits. It was
//      marked before printing and lost for the session when it did not print.
//   8  a call with no question writes no interview marker.
//   9  every card asks the Change Request question (GATE-06) and names GATE-06 on its first line,
//      with or without the Change Log line. A fix round named GATE-06 only with the Change Log
//      line, so a behaviour change that did not touch DECISIONS.md got no GATE-06 at all (second
//      CR-2026-10-15-GAPS review); with that change put back, cases 9a and 9c fail, and with the
//      question line taken out, 9a, 9b and 9c fail.
// Run against the seven hook files of 9409b1c (2026-10-15), 32 of the 38 cases in blocks 1-8 fail. Of the 6 that
// pass there, 4 hold the other side: a Write that adds a row is flagged, a row added in git is no
// GATE-06 line, an idle session's markers go, and a skill that printed is marked. 2 hold this
// chunk's own changes against a regression: a row staged before the first commit (the old ledger
// flag covered it; git's count must now), and a stopBudgetSeconds of 0 (it must keep the default).

import fs from 'node:fs';
import path from 'node:path';

export default function truthCases(t) {
    const { T, root, brain, kit, hooks, record, section, like, blank, jp, put, readText, exists, setOld, newRepo, runGit,
        invokeHook, hookJson, parseOut, classify, route, stop, entry, ledger } = t;

    const verdict = (r) => {
        if (r.code !== 0) return `exit${r.code}`;
        if (blank(r.out)) return 'silent';
        const j = parseOut(r.out);
        if (j == null) return 'bad-output';
        if (j.decision === 'block') return 'block';
        if (j.systemMessage && !j.hookSpecificOutput) return 'notice';
        return classify(r.out);
    };
    const guard = (session, cwd, tool, ti) => invokeHook('guard.mjs', hookJson({ session_id: session, cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: ti }));
    const marker = (session, ext) => path.join(process.env.DF_MARKER_DIR, session + ext);
    const logSince = (from) => { const s = readText(process.env.DF_LOG_PATH); return s.length > from ? s.slice(from) : ''; };
    const cfgPath = path.join(brain, 'doctor.config.json');
    const setConfig = (key, value) => { const o = JSON.parse(readText(cfgPath)); o[key] = value; put(cfgPath, JSON.stringify(o, null, 2)); };

    // ------------------------------------------------------------------ 1. the Change Log flag
    section('-- truth D5-1: the Change Log flag counts only added dated rows');
    const clRepo = newRepo('repo-tr-rows');
    const clHead = '# Decisions\n\n## Change Log\n\n| Date | Change |\n|---|---|\n';
    const clOld = clHead + '| 2026-01-01 | Manifest created |\n';
    put(path.join(clRepo, 'DECISIONS.md'), clOld);
    put(jp(clRepo, 'src', 'app.py'), 'a = 1');
    runGit(clRepo, ['add', '-A']); runGit(clRepo, ['commit', '-q', '-m', 'init']);
    const clDecisions = path.join(clRepo, 'DECISIONS.md');
    const clSrc = jp(clRepo, 'src', 'app.py');
    const clKept = '# Decisions\n\nA decision reworded.\n\n## Change Log\n\n| Date | Change |\n|---|---|\n| 2026-01-01 | Manifest created |\n';
    const clAdded = clOld + '| 2026-10-15 | A new decision |\n';

    // 1a. the ledger alone (no prompt time on record, so the card counts Edit and Write calls)
    guard('tr-cl-w', clRepo, 'Write', { file_path: clDecisions, content: clKept });
    guard('tr-cl-w', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 1', new_string: 'a = 2' });
    let led = readText(ledger('tr-cl-w'));
    record('truth D5-1: a Write of DECISIONS.md that keeps its old rows is not flagged', 'unflagged', /DECISIONS\.md\t\r?\n/i.test(led) && !/\tchangelog/i.test(led) ? 'unflagged' : 'flagged', led);
    let r = stop('tr-cl-w', false);
    record('truth D5-1: that Write, from the ledger -> the GATE-06 line', 'gate06', verdict(r) === 'block' && like(r.out, '*no Change Log row*') ? 'gate06' : `quiet:${verdict(r)}`, r.out);
    guard('tr-cl-e', clRepo, 'Edit', { file_path: clDecisions, old_string: '| 2026-01-01 | Manifest created |', new_string: '| 2026-01-01 | Manifest created, reworded |' });
    guard('tr-cl-e', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 1', new_string: 'a = 2' });
    led = readText(ledger('tr-cl-e'));
    record('truth D5-1: an Edit that rewords an old row is not flagged', 'unflagged', like(led, '*DECISIONS.md*') && !/\tchangelog/i.test(led) ? 'unflagged' : 'flagged', led);
    r = stop('tr-cl-e', false);
    record('truth D5-1: that Edit, from the ledger -> the GATE-06 line', 'gate06', verdict(r) === 'block' && like(r.out, '*no Change Log row*') ? 'gate06' : `quiet:${verdict(r)}`, r.out);
    guard('tr-cl-a', clRepo, 'Write', { file_path: clDecisions, content: clAdded });
    guard('tr-cl-a', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 1', new_string: 'a = 2' });
    led = readText(ledger('tr-cl-a'));
    record('truth D5-1: a Write that adds a dated row is flagged (the other side)', 'flagged', /DECISIONS\.md\tchangelog/i.test(led) ? 'flagged' : 'unflagged', led);

    // 1b. git reads the turn: each case writes the file on the disk as the tool would, then commits it
    // so the next case starts from a clean tree.
    const clTurn = (session, tool, ti, content) => {
        route('reword the decisions', session, root);
        guard(session, clRepo, tool, ti);
        put(clDecisions, content);
        put(clSrc, `a = '${session}'`);
        const res = stop(session, false);
        runGit(clRepo, ['add', '-A']); runGit(clRepo, ['commit', '-q', '-m', session]);
        return res;
    };
    r = clTurn('tr-cl-gw', 'Write', { file_path: clDecisions, content: clKept }, clKept);
    record('truth D5-1: git, a Write that keeps the old rows -> the GATE-06 line', 'gate06', verdict(r) === 'block' && like(r.out, '*no Change Log row*') ? 'gate06' : `quiet:${verdict(r)}`, r.out);
    r = clTurn('tr-cl-ge', 'Edit', { file_path: clDecisions, old_string: '| 2026-01-01 | Manifest created |', new_string: '| 2026-01-01 | Manifest created, reworded |' }, clKept.replace(/Manifest created/g, 'Manifest created, reworded'));
    record('truth D5-1: git, an Edit that rewords an old row -> the GATE-06 line', 'gate06', verdict(r) === 'block' && like(r.out, '*no Change Log row*') ? 'gate06' : `quiet:${verdict(r)}`, r.out);
    let clNow = readText(clDecisions);
    r = clTurn('tr-cl-ga', 'Write', { file_path: clDecisions, content: clNow + '| 2026-10-15 | A new decision |\n' }, clNow + '| 2026-10-15 | A new decision |\n');
    record('truth D5-1: git, a dated row added -> no GATE-06 line (the other side)', 'quiet', verdict(r) === 'block' && !like(r.out, '*no Change Log row*') ? 'quiet' : `wrong:${verdict(r)}`, r.out);
    // git decides over the ledger flag. The guard runs before the tool, so an Edit that adds a row is
    // flagged even when the tool then rejects it (old_string not found); the file on the disk changed
    // only in its prose, and git sees no added row.
    clNow = readText(clDecisions);
    r = clTurn('tr-cl-stale', 'Edit', { file_path: clDecisions, old_string: '## Change Log', new_string: '## Change Log\n\n| 2026-10-15 | A row the tool never wrote |' }, clNow.replace(/A decision reworded\./g, 'A decision reworded again.'));
    record('truth D5-1: git, a flagged Edit whose row never reached the disk -> the GATE-06 line', 'gate06', verdict(r) === 'block' && like(r.out, '*no Change Log row*') ? 'gate06' : `quiet:${verdict(r)}`, r.out);
    // A repository with no commit yet: the turn writes DECISIONS.md with a dated row and stages it. git
    // lists the file but has no HEAD to diff it against, so every row in it is an added row.
    const unRepo = newRepo('repo-tr-unborn');
    const unDecisions = path.join(unRepo, 'DECISIONS.md');
    route('start the repository', 'tr-cl-unborn', root);
    guard('tr-cl-unborn', unRepo, 'Write', { file_path: unDecisions, content: clOld });
    put(unDecisions, clOld);
    put(jp(unRepo, 'src', 'main.py'), 'm = 1');
    runGit(unRepo, ['add', '-A']);
    r = stop('tr-cl-unborn', false);
    record('truth D5-1: git, DECISIONS.md with a row staged before the first commit -> no GATE-06 line', 'quiet', verdict(r) === 'block' && like(r.out, '*repo-tr-unborn*') && !like(r.out, '*no Change Log row*') ? 'quiet' : `wrong:${verdict(r)}`, r.out);

    // ------------------------------------------------------------------ 2. the docs test
    section('-- truth D5-2: the docs test reads the path inside the repository');
    const inDocs = newRepo(jp('docs', 'repo-tr-indocs'));
    put(jp(inDocs, 'src', 'x.py'), 'x = 1');
    runGit(inDocs, ['add', '-A']); runGit(inDocs, ['commit', '-q', '-m', 'init']);
    put(ledger('tr-docs-under'), jp(inDocs, 'src', 'x.py') + '\t\n');
    r = stop('tr-docs-under', false);
    record('truth D5-2: a repository below a folder named docs gets its card', 'block', verdict(r) === 'block' && like(r.out, '*repo-tr-indocs: 1 source file(s) changed*') ? 'block' : verdict(r), r.out);
    const docSrc = newRepo('repo-tr-docsrc');
    put(jp(docSrc, 'docs', 'build.mjs'), 'console.log(1);');
    put(jp(docSrc, 'docs', 'guide.md'), '# guide');
    runGit(docSrc, ['add', '-A']); runGit(docSrc, ['commit', '-q', '-m', 'init']);
    put(ledger('tr-docs-src'), jp(docSrc, 'docs', 'build.mjs') + '\t\n' + jp(docSrc, 'docs', 'guide.md') + '\t\n');
    r = stop('tr-docs-src', false);
    record('truth D5-2: a source-extension file under docs/ counts as source', 'source', verdict(r) === 'block' && like(r.out, '*repo-tr-docsrc: 1 source file(s) changed*') ? 'source' : verdict(r), r.out);
    record('truth D5-2: a Markdown file under docs/ is still a document', 'document', like(r.out, '*Documents touched: guide.md.*') ? 'document' : 'missing', r.out);

    // ------------------------------------------------------------------ 3. the git status cap
    section('-- truth D5-3: a repository past the git status cap is carded as a floor');
    const capRepo = newRepo('repo-tr-capped');
    put(path.join(capRepo, 'README.md'), 'capped');
    runGit(capRepo, ['add', '-A']); runGit(capRepo, ['commit', '-q', '-m', 'init']);
    // 4001 untracked files written before the prompt: git status lists each, the hook reads the first 4000
    // (turnChanges, cap 4000). The source file the turn writes sorts after them, past the cap.
    const genDir = path.join(capRepo, 'gen');
    fs.mkdirSync(genDir, { recursive: true });
    for (let i = 1; i <= 4001; i++) fs.writeFileSync(path.join(genDir, `f${String(i).padStart(4, '0')}.txt`), 'g');
    let logFrom = readText(process.env.DF_LOG_PATH).length;
    route('generate the files', 'tr-cap', root);
    invokeHook('guard.mjs', hookJson({ session_id: 'tr-cap', cwd: capRepo, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'python tools/gen.py' } }));
    put(jp(capRepo, 'zz', 'new.py'), 'n = 1');
    r = stop('tr-cap', false);
    record('truth D5-3: a change past the git status cap is carded, not passed', 'block', verdict(r), r.out);
    record('truth D5-3: the card calls that count a floor', 'floor', like(r.out, '*repo-tr-capped: 0 source file(s) changed*') && like(r.out, '*more than 4000 entries here*this count is a floor*') ? 'floor' : 'missing', r.out);
    record('truth D5-3: the cap is logged as a WARN line', 'logged', like(logSince(logFrom), '*WARN stop git status in*repo-tr-capped listed more than 4000 entries*') ? 'logged' : 'missing', logSince(logFrom));
    fs.rmSync(genDir, { recursive: true, force: true });

    // ------------------------------------------------------------------ 4. the time budget, the guard-error count, the turn reset
    section('-- truth D5-4: a short count says so');
    const cfgSaved = readText(cfgPath);
    setConfig('stopBudgetSeconds', 0.001);   // spent before the first repository is read
    route('patch it', 'tr-bud1', root);
    invokeHook('guard.mjs', hookJson({ session_id: 'tr-bud1', cwd: clRepo, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'python tools/patch.py' } }));
    put(clSrc, 'a = 3');
    logFrom = readText(process.env.DF_LOG_PATH).length;
    r = stop('tr-bud1', false);
    record('truth D5-4: budget spent, nothing to card -> a notice naming the repository', 'notice', verdict(r) === 'notice' && like(r.out, '*time budget*repo-tr-rows*') ? 'notice' : verdict(r), r.out);
    record('truth D5-4: the spent budget is logged as a WARN line', 'logged', like(logSince(logFrom), '*WARN stop time budget of*repo-tr-rows*') ? 'logged' : 'missing', logSince(logFrom));
    route('edit it', 'tr-bud2', root);
    guard('tr-bud2', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 3', new_string: 'a = 4' });
    put(clSrc, 'a = 4');
    r = stop('tr-bud2', false);
    record('truth D5-4: budget spent, an Edit in the ledger -> the card says git was not read', 'said', verdict(r) === 'block' && like(r.out, '*ran out before git was read here*') ? 'said' : verdict(r), r.out);
    // A carded repository and an unread one with nothing in the ledger: the card names the unread one.
    route('edit it', 'tr-bud3', root);
    guard('tr-bud3', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 4', new_string: 'a = 41' });
    invokeHook('guard.mjs', hookJson({ session_id: 'tr-bud3', cwd: docSrc, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node docs/build.mjs' } }));
    put(clSrc, 'a = 41');
    r = stop('tr-bud3', false);
    record('truth D5-4: budget spent, the card names a repository it did not read', 'named', verdict(r) === 'block' && like(r.out, '*Not read: the time budget*repo-tr-docsrc*') ? 'named' : verdict(r), r.out);
    // A value outside (0, 18] keeps the default: 0 would spend the budget before the first repository.
    setConfig('stopBudgetSeconds', 0);
    route('edit it', 'tr-bud0', root);
    guard('tr-bud0', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 41', new_string: 'a = 42' });
    put(clSrc, 'a = 42');
    r = stop('tr-bud0', false);
    record('truth D5-4: a stopBudgetSeconds of 0 keeps the default, so git is read', 'git', verdict(r) === 'block' && like(r.out, '*Read from git*') && !like(r.out, '*time budget*') ? 'git' : verdict(r), r.out);
    put(cfgPath, cfgSaved);
    runGit(clRepo, ['add', '-A']); runGit(clRepo, ['commit', '-q', '-m', 'budget cases']);

    // the guard fails inside: the call is counted, the card says the count may be short
    route('edit it', 'tr-gerr', root);
    invokeHook('guard.mjs', hookJson({ session_id: 'tr-gerr', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit' }));
    let gerr = readText(marker('tr-gerr', '.guard-error'));
    record('truth D5-4: a guard internal error is counted in <session>.guard-error', 'counted', gerr.split('\n').filter((l) => l.trim()).length === 1 && like(gerr, '*no tool_input*') ? 'counted' : 'missing', gerr);
    r = stop('tr-gerr', false);
    record('truth D5-4: guard failed, nothing recorded -> a notice, not a silent pass', 'notice', verdict(r) === 'notice' && like(r.out, '*guard failed on 1 call(s)*') ? 'notice' : verdict(r), r.out);
    guard('tr-gerr', clRepo, 'Edit', { file_path: clSrc, old_string: 'a = 4', new_string: 'a = 5' });
    put(clSrc, 'a = 5');
    r = stop('tr-gerr', false);
    record('truth D5-4: guard failed, a source edit recorded -> the card says the count may be short', 'said', verdict(r) === 'block' && like(r.out, '*guard failed on 1 call(s)*may be short*') ? 'said' : verdict(r), r.out);
    runGit(clRepo, ['add', '-A']); runGit(clRepo, ['commit', '-q', '-m', 'guard-error cases']);
    put(marker('tr-gerr2', '.guard-error'), '2026-10-15T00:00:00Z\tleft by the last turn\n');
    route('next', 'tr-gerr2', root);
    record('truth D5-4: a new prompt clears the guard-error count', 'cleared', !exists(marker('tr-gerr2', '.guard-error')) ? 'cleared' : 'kept');

    // the router resets the turn before its libraries load: a copy of the hooks with a library that throws
    const brokenHooks = path.join(T, 'hooks-broken');
    fs.cpSync(hooks, brokenHooks, { recursive: true, force: true });
    put(jp(brokenHooks, 'lib', 'law-rows.mjs'), "throw new Error('law-rows.mjs broken on purpose (cases-truth fixture)');\n");
    put(marker('tr-rbroken', '.edits'), jp(clRepo, 'src', 'app.py') + '\t\n');
    put(marker('tr-rbroken', '.repos'), clRepo + '\tnone\n');
    put(marker('tr-rbroken', '.turn'), '2026-01-01T00:00:00.0000000+00:00');
    const rb = invokeHook('route.mjs', hookJson({ session_id: 'tr-rbroken', cwd: root, hook_event_name: 'UserPromptSubmit', prompt_id: 'p', prompt: 'commit it' }), brokenHooks).out;
    const turnNow = readText(marker('tr-rbroken', '.turn')).trim();
    record('truth D5-4: a router whose library fails still starts the turn', 'reset', like(rb, '*internal error*') && !exists(marker('tr-rbroken', '.edits')) && !exists(marker('tr-rbroken', '.repos')) && !like(turnNow, '2026-01-01*') ? 'reset' : 'kept', `out: ${rb} | turn: ${turnNow}`);
    // The guard fails while it loads a library, before it has read the call: the call still counts under its session.
    put(jp(brokenHooks, 'lib', 'guard-loop-rules.mjs'), "throw new Error('guard-loop-rules.mjs broken on purpose (cases-truth fixture)');\n");
    const gb = invokeHook('guard.mjs', hookJson({ session_id: 'tr-gerr-lib', cwd: clRepo, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: clSrc, old_string: 'a', new_string: 'b' } }), brokenHooks).out;
    gerr = readText(marker('tr-gerr-lib', '.guard-error'));
    record('truth D5-4: a guard whose library fails counts the call under its session', 'counted', like(gb, '*internal error*') && like(gerr, '*broken on purpose*') ? 'counted' : 'missing', `out: ${gb} | marker: ${gerr}`);

    // ------------------------------------------------------------------ 5. housekeeping keeps a live session's markers
    section("-- truth D5-5: housekeeping keeps a live session's markers");
    put(marker('tr-live', '.asked'), '2026-10-13T00:00:00Z'); setOld(marker('tr-live', '.asked'));
    entry(root, 'tr-live', 'resume');
    record('truth D5-5: a session resumed after a day keeps its own interview marker', 'kept', exists(marker('tr-live', '.asked')) ? 'kept' : 'deleted');
    put(marker('tr-busy', '.asked'), '2026-10-13T00:00:00Z'); setOld(marker('tr-busy', '.asked'));
    put(marker('tr-busy', '.turn'), new Date().toISOString());
    put(marker('tr-idle', '.asked'), '2026-10-13T00:00:00Z'); setOld(marker('tr-idle', '.asked'));
    put(marker('tr-idle', '.turn'), '2026-10-13T00:00:00Z'); setOld(marker('tr-idle', '.turn'));
    entry(root, 'tr-other', 'startup');
    record('truth D5-5: another session that wrote a marker within the day keeps its old ones', 'kept', exists(marker('tr-busy', '.asked')) ? 'kept' : 'deleted');
    record('truth D5-5: a session idle for a day loses its markers (the other side)', 'deleted', !exists(marker('tr-idle', '.asked')) && !exists(marker('tr-idle', '.turn')) ? 'deleted' : 'kept');

    // ------------------------------------------------------------------ 6. a clear deletes the session's routes
    section("-- truth D5-6: a clear deletes the session's routes");
    route('commit it', 'tr-clear', root);
    const hadRoutes = exists(marker('tr-clear', '.routes'));
    logFrom = readText(process.env.DF_LOG_PATH).length;
    entry(root, 'tr-clear', 'clear');
    record("truth D5-6: a clear deletes the session's routes", 'cleared', hadRoutes && !exists(marker('tr-clear', '.routes')) ? 'cleared' : `kept (had: ${hadRoutes})`);
    record('truth D5-6: a clear logs what it found under the session id', 'logged', like(logSince(logFrom), '*INFO entry clear: session tr-clear had a route file*') ? 'logged' : 'missing', logSince(logFrom));
    r = route('commit it', 'tr-clear', root);
    record('truth D5-6: after a clear the group is injected again', 'vcs-again', /group VCS/i.test(r.out) ? 'vcs-again' : 'silent', r.out);

    // ------------------------------------------------------------------ 7. a skill is named once it printed
    section('-- truth D5-7: a skill counts as named only once it printed');
    const polPath = path.join(brain, 'route-policy.json');
    const setPolicy = (maxChars) => {
        const p = JSON.parse(readText(path.join(kit, 'templates', 'route-policy.json')));
        p.maxChars = maxChars;
        put(polPath, JSON.stringify(p, null, 2));
    };
    // The sandbox skill is run.mjs's (root/.claude/skills/sandbox-skill, "pitchsite").
    setPolicy(200);   // every group is over the cap
    r = route('make a pitchsite for the shop', 'tr-sk1', root);
    record('truth D5-7: no group fits under the cap -> the skill prints alone', 'named', /design-first skills \(DES-12\)/i.test(r.out) && /sandbox-skill: Build a pitchsite/i.test(r.out) && !/group OWN/i.test(r.out) ? 'named' : 'silent', r.out);
    record('truth D5-7: a skill that printed is marked as named', 'marked', like(readText(marker('tr-sk1', '.skills')), '*sandbox-skill*') ? 'marked' : 'unmarked');
    // Measure where the skill block starts when everything fits, then set the cap just past the groups.
    fs.rmSync(polPath, { force: true });
    const m = route('make a pitchsite and commit it', 'tr-sk-measure', root);
    const at = m.out.indexOf('design-first skills');
    if (at < 0) {
        record('truth D5-7: the measuring prompt names the skill', 'named', 'silent', m.out);
    } else {
        // The hook counts the characters it writes, LF line ends included, as this capture holds them.
        const cap = at + 20;
        setPolicy(cap);
        r = route('make a pitchsite and commit it', 'tr-sk2', root);
        fs.rmSync(polPath, { force: true });
        record('truth D5-7: groups print, the skill block does not fit and is not marked', 'unmarked', /group VCS/i.test(r.out) && !/sandbox-skill/i.test(r.out) && !like(readText(marker('tr-sk2', '.skills')), '*sandbox-skill*') ? 'unmarked' : 'wrong', `cap ${cap} | ${r.out}`);
        r = route('another pitchsite please', 'tr-sk2', root);
        record('truth D5-7: a skill that did not print is named on the next matching prompt', 'named', /sandbox-skill: Build a pitchsite/i.test(r.out) ? 'named' : 'lost', r.out);
    }
    fs.rmSync(polPath, { force: true });

    // ------------------------------------------------------------------ 8. a call with no question writes no marker
    section('-- truth D5-8: a call with no question writes no interview marker');
    r = invokeHook('ask.mjs', hookJson({ session_id: 'tr-ask0', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [] } }));
    record('truth D5-8: a call with no question is let through and writes no .asked marker', 'allow-unmarked', verdict(r) === 'silent' && !exists(marker('tr-ask0', '.asked')) ? 'allow-unmarked' : `${verdict(r)}/marked:${exists(marker('tr-ask0', '.asked'))}`, r.out);

    // ------------------------------------------------------------------ 9. GATE-06 on every card
    section('-- truth 9: every card asks the Change Request question and names GATE-06');
    // The clause ids in the card's first line: "... then stop (DES-07, GATE-05, ...; the hook asks once per turn)."
    const headIds = (res) => {
        const j = parseOut(res.out);
        const head = j && j.reason ? String(j.reason).split('\n')[0] : '';
        const mm = /\(([^;)]*);/.exec(head);
        return mm ? mm[1].split(',').map((s) => s.trim()).filter((s) => s) : [];
    };
    // No turn marker for these sessions, so each card counts the ledger, and the ledger's changelog flag
    // says whether the DECISIONS.md edit carried a row (the guard sets it).
    const crAsked = (res) => {
        // The Change Request question, on the card itself, not only the id on its first line.
        const j = parseOut(res.out);
        return like(j && j.reason ? String(j.reason) : '', '*Change Request (GATE-06): did this turn change design, behaviour, config, risk, execution, data flow or dependencies?*name its Change Request*');
    };
    const headRepo = newRepo('repo-tr-head');
    const hSrc = jp(headRepo, 'src', 'h.py'); const hDec = path.join(headRepo, 'DECISIONS.md');
    put(hSrc, 'h = 1');
    put(hDec, '# decisions');
    // 9a: the common case of a missing Change Request, a behaviour change that does not touch DECISIONS.md.
    put(ledger('tr-h06-src'), hSrc + '\t\n');
    r = stop('tr-h06-src', false);
    let ids = headIds(r);
    record('truth 9a: source only, no Change Log line -> GATE-06 named and the Change Request question asked', 'asked', verdict(r) !== 'block' ? verdict(r) : like(r.out, '*no Change Log row*') ? 'changelog-line' : !ids.includes('GATE-06') ? 'unnamed: ' + ids.join(', ') : !crAsked(r) ? 'not-asked' : 'asked', r.out);
    put(ledger('tr-h06-norow'), hSrc + '\t\n' + hDec + '\t\n');
    r = stop('tr-h06-norow', false);
    ids = headIds(r);
    record('truth 9b: DECISIONS.md with no row -> the Change Log line as well, GATE-06 named, the question asked', 'asked', verdict(r) !== 'block' ? verdict(r) : !like(r.out, '*no Change Log row*') ? 'no-changelog-line' : !ids.includes('GATE-06') ? 'unnamed: ' + ids.join(', ') : !crAsked(r) ? 'not-asked' : 'asked', r.out);
    record('truth 9b: the first line keeps the order of the lines it names', 'ordered', ids.join(',') === 'DES-07,GATE-05,GATE-06,GATE-07,GAME-12' ? 'ordered' : ids.join(','), r.out);
    put(ledger('tr-h06-row'), hSrc + '\t\n' + hDec + '\tchangelog\n');
    r = stop('tr-h06-row', false);
    ids = headIds(r);
    record('truth 9c: DECISIONS.md with a row -> no Change Log line, GATE-06 still named and the question asked', 'asked', verdict(r) !== 'block' ? verdict(r) : like(r.out, '*no Change Log row*') ? 'changelog-line' : !ids.includes('GATE-06') ? 'unnamed: ' + ids.join(', ') : !crAsked(r) ? 'not-asked' : 'asked', r.out);
}
