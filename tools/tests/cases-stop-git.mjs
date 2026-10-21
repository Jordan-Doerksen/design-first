// cases-stop-git.mjs - hook self-test cases for the Stop card reading the turn's changes from git
// (lib/turn-changes.mjs). Imported by run.mjs, which owns the fixtures and helpers used here.
// Never run directly.
//
// Each case is one turn: a prompt (route.mjs writes the turn's start time), a tool call the guard
// sees (it nominates the repository), a change made on the disk the way a script makes it (no Edit
// call), then the stop. A file is "changed by a script" here by writing it directly.

import fs from 'node:fs';
import path from 'node:path';

export default function stopGitCases(t) {
    const { TMSYS, root, brain, record, section, like, blank, jp, put, readText, exists, newRepo, runGit, invokeHook, hookJson, classify, route, stop, guardEdit } = t;

    section("-- stop.mjs: the turn's changes are read from git");
    const guardShell = (session, cwd, cmd) => invokeHook('guard.mjs', hookJson({ session_id: session, cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } }));
    const marker = (session, ext) => path.join(process.env.DF_MARKER_DIR, session + ext);
    const stopVerdict = (r) => (r.code !== 0 ? `exit${r.code}` : blank(r.out) ? 'silent' : classify(r.out));

    const turnRepo = newRepo('repo-turn');
    put(path.join(turnRepo, '.gitignore'), 'ignored/\n');
    put(path.join(turnRepo, 'DECISIONS.md'), '# Decisions\n\n## Change Log\n\n| Date | Change |\n|---|---|\n| 2026-01-01 | Manifest created |\n');
    put(path.join(turnRepo, 'README.md'), 'readme');
    put(jp(turnRepo, 'src', 'a.py'), 'a = 1');
    put(jp(turnRepo, 'src', 'b.py'), 'b = 1');
    put(jp(turnRepo, 'src', 'c.py'), 'c = 1');
    runGit(turnRepo, ['add', '-A']); runGit(turnRepo, ['commit', '-q', '-m', 'init']);

    // 1. a script changes source and a document; no Edit call names either
    route('patch the scan', 'tg1', root);
    guardShell('tg1', turnRepo, 'python tools/patch.py DECISIONS.md spec.json');
    put(jp(turnRepo, 'src', 'a.py'), 'a = 2');
    fs.appendFileSync(path.join(turnRepo, 'DECISIONS.md'), '| 2026-02-02 | The scan is cached |\n');
    let r = stop('tg1', false);
    record('git: source changed by a command, no Edit call -> the card fires', 'block', stopVerdict(r), r.out);
    record('git: a document a script wrote is a document touched', 'named', like(r.out, '*repo-turn: 1 source file(s) changed*') && like(r.out, '*Documents touched: DECISIONS.md.*') ? 'named' : 'wrong', r.out);
    record('git: a dated row added by a script counts as the Change Log row', 'quiet', !like(r.out, '*no Change Log row*') ? 'quiet' : 'nagged', r.out);
    record('git: the card says where its count came from', 'said', like(r.out, '*Read from git*') ? 'said' : 'missing', r.out);

    // 2. what was dirty before the prompt is not this turn's work
    route('look around', 'tg2', root);
    guardShell('tg2', turnRepo, 'git status');
    r = stop('tg2', false);
    record('git: files left uncommitted by an earlier turn are not counted', 'silent', stopVerdict(r), r.out);

    // 3. a commit made this turn counts, though the tree is clean again
    route('commit it', 'tg3', root);
    guardShell('tg3', turnRepo, 'git commit -m work -- src/a.py DECISIONS.md');
    runGit(turnRepo, ['add', '-A']); runGit(turnRepo, ['commit', '-q', '-m', 'the scan is cached']);
    r = stop('tg3', false);
    record('git: files in a commit made since the prompt are counted', 'counted', stopVerdict(r) === 'block' && like(r.out, '*repo-turn: 1 source file(s) changed*') && like(r.out, '*Documents touched: DECISIONS.md.*') ? 'counted' : `wrong:${stopVerdict(r)}`, r.out);

    // 4. a commit from before the prompt does not count
    route('next', 'tg4', root);
    guardShell('tg4', turnRepo, 'git log --oneline');
    r = stop('tg4', false);
    record('git: a commit made before the prompt is not counted', 'silent', stopVerdict(r), r.out);

    // 5. the shell's folder is the root; the command names the repository (on Windows, an MSYS path after cd)
    route('edit by sed', 'tg5', root);
    guardShell('tg5', root, `cd ${TMSYS}/root/repo-turn && sed -i s/b/B/ src/b.py`);
    put(jp(turnRepo, 'src', 'b.py'), 'B = 1');
    r = stop('tg5', false);
    record('git: a repository named in the command (cd <path>) is looked at', 'block', stopVerdict(r), r.out);
    record('git: source changed, no document -> the DES-07 line, now true', 'des07', like(r.out, '*Documents touched: none*') ? 'des07' : 'wrong', r.out);

    // 6. DECISIONS.md changed by a script with no dated row -> GATE-06
    route('reword a decision', 'tg6', root);
    guardShell('tg6', turnRepo, 'python tools/reword.py');
    put(jp(turnRepo, 'src', 'c.py'), 'c = 2');
    fs.appendFileSync(path.join(turnRepo, 'DECISIONS.md'), 'A decision reworded, with no row.\n');
    r = stop('tg6', false);
    record('git: DECISIONS.md changed by a script with no dated row -> GATE-06 line', 'gate06', like(r.out, '*no Change Log row*') ? 'gate06' : 'quiet', r.out);

    // 7. a file deleted this turn counts
    runGit(turnRepo, ['add', '-A']); runGit(turnRepo, ['commit', '-q', '-m', 'tidy fixture']);
    route('remove it', 'tg7', root);
    guardShell('tg7', turnRepo, 'git rm src/c.py');
    fs.rmSync(jp(turnRepo, 'src', 'c.py'), { force: true });
    r = stop('tg7', false);
    record('git: a source file deleted this turn is counted', 'block', stopVerdict(r), r.out);

    // 8. an Edit call the guard allowed, but the file never changed (the tool failed) -> nothing to answer for
    route('try an edit', 'tg8', root);
    guardEdit('tg8', jp(turnRepo, 'src', 'a.py'));
    r = stop('tg8', false);
    record('git: an allowed Edit that changed nothing is not counted', 'silent', stopVerdict(r), r.out);

    // 9. an ignored file is in no git list; an Edit that named it and wrote it still counts
    route('edit an ignored file', 'tg9', root);
    guardEdit('tg9', jp(turnRepo, 'ignored', 'gen.py'));
    put(jp(turnRepo, 'ignored', 'gen.py'), 'g = 1');
    r = stop('tg9', false);
    record('git: a file git ignores counts when an Edit named it and wrote it', 'block', stopVerdict(r), r.out);

    // 10. the written residual: a repository no call pointed at is not looked at
    const quiet = newRepo('repo-unnamed');
    put(path.join(quiet, 'x.py'), 'x = 1'); runGit(quiet, ['add', '-A']); runGit(quiet, ['commit', '-q', '-m', 'init']);
    route('run a build', 'tg10', root);
    guardShell('tg10', root, 'node build.mjs');
    put(path.join(quiet, 'x.py'), 'x = 2');
    r = stop('tg10', false);
    record('git: a repository no call pointed at is NOT seen (written residual)', 'silent', stopVerdict(r), r.out);

    // 11. a background-task notice is not a turn boundary, and its words are not routed
    route('start the long job', 'tg11', root);
    guardShell('tg11', turnRepo, 'python tools/patch.py');
    put(jp(turnRepo, 'src', 'a.py'), 'a = 3');
    const stampBefore = readText(marker('tg11', '.turn'));
    const notice = '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "Start the server and read the log" completed (exit code 0)</summary>\n</task-notification>';
    const n = route(notice, 'tg11', root);
    record("route: a task notice does not move the turn's start", 'kept', readText(marker('tg11', '.turn')) === stampBefore && exists(marker('tg11', '.repos')) ? 'kept' : 'reset');
    record('route: the words inside a task notice are not routed', 'silent', blank(n.out) ? 'silent' : 'routed', n.out);
    r = stop('tg11', false);
    record('git: a change made before a task notice still counts at the stop', 'block', stopVerdict(r), r.out);

    // 12. stopFromGit false: back to counting Edit and Write calls only
    const cfgPath = path.join(brain, 'doctor.config.json');
    const cfgSaved = readText(cfgPath);
    const cfgObj = JSON.parse(cfgSaved); cfgObj.stopFromGit = false;
    put(cfgPath, JSON.stringify(cfgObj, null, 2));
    route('script again', 'tg12', root);
    guardShell('tg12', turnRepo, 'python tools/patch.py');
    put(jp(turnRepo, 'src', 'b.py'), 'B = 2');
    r = stop('tg12', false);
    record("git: stopFromGit false -> a command's change is not seen, as before 0.1.15", 'silent', stopVerdict(r), r.out);
    put(cfgPath, cfgSaved);

    // 13. stopCard (0.2.11, STOP-1): the card off per session role. The role is what route.mjs wrote
    // on the first prompt: a brief with a line-start "Reports to:" is a writer, anything else an owner.
    const hooksLog = process.env.DF_LOG_PATH;
    const logTail = () => (exists(hooksLog) ? readText(hooksLog) : '');
    const withCard = (card, fn) => { const o = JSON.parse(cfgSaved); if (card !== undefined) o.stopCard = card; put(cfgPath, JSON.stringify(o, null, 2)); try { return fn(); } finally { put(cfgPath, cfgSaved); } };
    const sourceTurn = (session, prompt) => { route(prompt, session, root); guardShell(session, turnRepo, 'python tools/patch.py'); put(jp(turnRepo, 'src', 'a.py'), `a = ${session}`); };
    withCard({ owner: false, writer: true }, () => {
        sourceTurn('tg13o', 'patch it');
        r = stop('tg13o', false);
        record('stopCard: owner false -> an owner session with source changed ends with no card', 'silent', stopVerdict(r), r.out);
        record('stopCard: the off line is in the hooks log, with the role and the config path', 'logged', like(logTail(), '*INFO stop card off for this owner session (stopCard.owner false in*doctor.config.json)*') ? 'logged' : 'missing', logTail().split('\n').slice(-3).join('\n'));
        sourceTurn('tg13w', 'Goal: patch it\nReports to: the master\nDone when: done');
        r = stop('tg13w', false);
        record('stopCard: owner false, writer true -> a writer session still gets the card', 'block', stopVerdict(r), r.out);
    });
    withCard({ owner: true, writer: false }, () => {
        sourceTurn('tg14w', 'Goal: patch it\nReports to: the master\nDone when: done');
        r = stop('tg14w', false);
        record('stopCard: writer false -> a writer session with source changed ends with no card', 'silent', stopVerdict(r), r.out);
        sourceTurn('tg14o', 'patch it again');
        r = stop('tg14o', false);
        record('stopCard: writer false, owner true -> an owner session still gets the card', 'block', stopVerdict(r), r.out);
    });
    withCard({ owner: 'no', writer: 0 }, () => {
        sourceTurn('tg15o', 'patch it');
        r = stop('tg15o', false);
        record('stopCard: only an explicit false turns the card off ("no" and 0 keep it)', 'block', stopVerdict(r), r.out);
    });
    withCard(undefined, () => {
        sourceTurn('tg16o', 'patch it');
        r = stop('tg16o', false);
        record('stopCard: no key -> the card as before 0.2.11', 'block', stopVerdict(r), r.out);
    });
}
