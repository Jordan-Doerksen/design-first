// cases-card.mjs - hook self-test cases for the bounded-file hook (0.3.0, hooks/card.mjs): a file
// that matches a boundedFiles row of the brain's doctor.config.json, or of the repository's
// .claude/kit/extract.json when there is no brain, refuses a write that adds an id, grows the file
// while it is over maxBytes, grows its head past headLines, or shrinks it when it is append-only.
// Imported by run.mjs, which owns the fixtures and helpers used here. Never run directly.
//
// The rows are laid over the fixture brain's config for these cases alone and put back after them,
// as the guard-cases loop does with brainSet. The planted faults, each seen red before the hook was
// built: an added local_ id allowed, a 30,001-character result from a 30,000-character file allowed,
// a shrink of an append-only file allowed. The review's faults, each seen red too: replace_all
// ignored, CRLF not normalised, a trailing newline counted as a line, a bad pattern or a bad tunable
// thrown instead of skipped, maxBytes 0 not off, only the first matching row judged. The fix pass's
// faults, each seen red too: a {repo, path} row naming the resolved folder of a linked clone dropped
// by the card hook while the guard held it; an extract whose values is not an object, and a brain
// config that is JSON and not an object, read in silence as no rows; a DF_EXTRACT_PATH that names no
// file taken by the card hook (no rows) while the guard passed it over and read the clone's extract.

import fs from 'node:fs';
import path from 'node:path';

export default function cardCases(t) {
    const { T, brain, root, record, section, say, jp, put, readText, toJson, invokeHook, hookJson, classify, withoutPointer } = t;

    section('-- card.mjs: bounded files (0.3.0)');
    const cfgPath = path.join(brain, 'doctor.config.json');
    const kept = readText(cfgPath);
    const cards = jp(brain, 'control', 'cards');
    const archive = jp(brain, 'control', 'archive');
    const open = jp(brain, 'control', 'open');
    const call = (session, tool, ti, cwd = root) => invokeHook('card.mjs', hookJson({ session_id: session, cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: ti }));
    const edit = (session, file, oldS, newS, extra = {}) => call(session, 'Edit', { file_path: file, old_string: oldS, new_string: newS, ...extra });
    const write = (session, file, content) => call(session, 'Write', { file_path: file, content });
    // 'allow', 'deny', 'advise' (the internal-error reply), 'exit<n>' or 'bad-output'. A deny must
    // carry its reason phrase in the reply, else it is 'deny-without:<phrase>'.
    const got = (r, phrase) => {
        if (r.code !== 0) return `exit${r.code}`;
        const c = classify(r.out);
        if (c === 'deny' && phrase && !String(r.out).includes(phrase)) return `deny-without:${phrase}`;
        return c;
    };
    const logText = () => readText(process.env.DF_LOG_PATH);
    let before;
    const savedProject = process.env.CLAUDE_PROJECT_DIR;
    const savedExtract = process.env.DF_EXTRACT_PATH;
    delete process.env.DF_EXTRACT_PATH;   // a seam left in the host's shell must not feed the brain cases
    try {
        put(cfgPath, toJson({
            ...JSON.parse(kept),
            boundedFiles: [
                { glob: '${BRAIN}/control/cards/*.md', maxBytes: 30000, headLines: 15, idPatterns: ['local_[0-9a-f]{8}', 'session_01[A-Za-z0-9]+'], appendOnly: false },
                { glob: '${BRAIN}/control/archive/*.md', appendOnly: true },
                // One pattern JavaScript cannot read, maxBytes 0 (the size rule off), a headLines that is no
                // integer (the default 15 keeps); and a second row on one of the files, so a file is judged
                // against every row it matches.
                { glob: '${BRAIN}/control/open/*.md', maxBytes: 0, headLines: 'lots', idPatterns: ['(', 'local_[0-9a-f]{8}'] },
                { glob: '${BRAIN}/control/open/NOTES.md', appendOnly: true },
            ],
        }));
        // DESK.md: a 14-line typed head, the generated marker, a body that carries one id already.
        const head = Array.from({ length: 14 }, (_, i) => `head line ${i + 1}`).join('\n');
        const deskText = `${head}\n<!-- kit:generated -->\nbody row one local_0badf00d\nbody row two\n`;
        const desk = path.join(cards, 'DESK.md');
        put(desk, deskText);

        // ---- the id rule
        let r = edit('cd-id-edit', desk, 'body row two', 'body row two local_0a1b2c3d');
        record('card: an Edit that adds local_0a1b2c3d to a card is denied', 'deny', got(r, 'adds id local_[0-9a-f]{8}'), r.out);
        r = write('cd-id-write', desk, deskText + 'started as session_01AbCdEf\n');
        record('card: a Write that adds a session_01 id to a card is denied', 'deny', got(r, 'adds id session_01[A-Za-z0-9]+'), r.out);
        r = edit('cd-id-kept', desk, 'body row one local_0badf00d', 'body row one (kept) local_0badf00d');
        record('card: an Edit that keeps an id the card already carries is allowed', 'allow', got(r), r.out);
        // replace_all: the id forms at the SECOND occurrence only (local_ + the new text), so a hook that
        // replaced the first occurrence alone would allow it. Red with replace_all ignored.
        const all = path.join(cards, 'ALL.md');
        put(all, '# All\n\nref deadbeef\nkey local_deadbeef\n');
        r = edit('cd-id-all', all, 'deadbeef', '0a1b2c3d', { replace_all: true });
        record('card: an Edit with replace_all that forms a new id at its second occurrence is denied', 'deny', got(r, 'adds id local_[0-9a-f]{8}'), r.out);
        r = edit('cd-id-one', all, 'deadbeef', '0a1b2c3d');
        record('card: the same Edit without replace_all changes the first occurrence only and is allowed', 'allow', got(r), r.out);
        // CRLF on disk, LF in the call (the host matches an LF old_string against a CRLF file): both
        // sides are compared after CRLF -> LF, so the added id is still seen. Red with that removed.
        const crlf = path.join(cards, 'CRLF.md');
        put(crlf, '# Crlf\r\n\r\nrow one\r\nrow two\r\n');
        r = edit('cd-id-crlf', crlf, 'row one\nrow two', 'row one\nrow two local_0a1b2c3d');
        record('card: an LF Edit of a CRLF card that adds an id is denied (both sides LF-normalised)', 'deny', got(r, 'adds id local_[0-9a-f]{8}'), r.out);

        // ---- the size rule: over maxBytes and growing is denied; a shrink of an oversize file passes
        const big = path.join(cards, 'BIG.md');
        put(big, 'x'.repeat(29999) + '\n');                       // 30,000 characters, one line
        r = edit('cd-size-grow', big, 'x', 'xy');                  // the first x alone: 30,001
        record('card: a 30,001-character result from a 30,000-character card is denied', 'deny', got(r, 'over 30000 and growing'), r.out);
        put(big, 'x'.repeat(30009) + '\n');                       // 30,010 characters: already over
        r = edit('cd-size-shrink', big, 'xxxxx', '');              // 30,005: still over, but smaller
        record('card: a shrinking edit of an oversize card is allowed', 'allow', got(r), r.out);
        r = edit('cd-size-same', big, 'xxxxx', 'yyyyy');           // 30,010: over, not growing
        record('card: an edit that keeps an oversize card the same size is allowed', 'allow', got(r), r.out);

        // ---- the head rule: the lines above the first <!-- kit:generated --> line
        r = edit('cd-head-grow', desk, 'head line 14', 'head line 14\nhead line 15\nhead line 16');
        record('card: a head growing past 15 lines is denied', 'deny', got(r, 'head over 15 lines and growing'), r.out);
        const tall = path.join(cards, 'TALL.md');
        const tallHead = Array.from({ length: 18 }, (_, i) => `head line ${i + 1}`).join('\n');
        put(tall, `${tallHead}\n<!-- kit:generated -->\nbody\n`);
        r = edit('cd-head-shrink', tall, 'head line 17\nhead line 18\n', '');   // 16 lines: over, but shorter
        record('card: a head shrinking while still over 15 lines is allowed', 'allow', got(r), r.out);
        const marked = path.join(cards, 'NOMARK.md');
        put(marked, Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
        r = edit('cd-head-nomark', marked, 'line 15', 'line 15\nline 16');
        record('card: with no marker the whole card is the head, and growing past 15 lines is denied', 'deny', got(r, 'head over 15 lines and growing'), r.out);
        const fourteen = path.join(cards, 'FOURTEEN.md');
        put(fourteen, Array.from({ length: 14 }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
        r = edit('cd-head-edge', fourteen, 'line 14', 'line 14\nline 15');
        record('card: with no marker, growing to exactly 15 lines is allowed (a trailing newline is not a line)', 'allow', got(r), r.out);

        // ---- the append-only rule
        const arch = path.join(archive, 'DESK-2026-10.md');
        const archText = '# Archive\n\n| row one |\n| row two |\n| row three |\n';
        put(arch, archText);
        r = edit('cd-arch-shrink', arch, '| row two |\n', '');
        record('card: a shrink of an append-only archive is denied', 'deny', got(r, 'append-only file shrinks'), r.out);
        r = write('cd-arch-append', arch, archText + '| row four |\n');
        record('card: an append to an append-only archive is allowed', 'allow', got(r), r.out);

        // ---- the row tunables: a pattern JavaScript cannot read is skipped and logged, never disarms the
        // row; maxBytes 0 turns the size rule off; a headLines that is no integer keeps the default and is
        // logged; and a file is judged against every row it matches
        const notes = path.join(open, 'NOTES.md');
        const notesText = '# Notes\n\nrow one\nrow two\n';
        put(notes, notesText);
        before = logText().length;
        r = write('cd-row-badpat', notes, notesText + 'local_0a1b2c3d\n');
        record('card: a row with one unreadable idPatterns entry still denies an id its other pattern names', 'deny', got(r, 'adds id local_[0-9a-f]{8}'), r.out);
        record('card: the unreadable idPatterns entry is logged as ERROR card and skipped', 'logged', /ERROR card boundedFiles\[2\]: idPatterns entry '\('/.test(logText().slice(before)) ? 'logged' : 'silent', logText().slice(before));
        const sizeOff = path.join(open, 'SIZE.md');   // matches the maxBytes 0 row only
        put(sizeOff, notesText);
        r = write('cd-row-maxbytes0', sizeOff, notesText + 'y'.repeat(31000) + '\n');
        record('card: maxBytes 0 turns the size rule off for the row (a 31,000-byte write passes)', 'allow', got(r), r.out);
        r = write('cd-row-headlines', notes, notesText + Array.from({ length: 12 }, (_, i) => `row ${i + 3}`).join('\n') + '\n');
        record('card: a headLines that is no integer keeps the default 15 (a 16-line head is denied)', 'deny', got(r, 'head over 15 lines and growing'), r.out);
        record('card: the non-integer headLines is logged as ERROR card', 'logged', /ERROR card boundedFiles\[2\]: headLines 'lots' is not an integer/.test(logText().slice(before)) ? 'logged' : 'silent', logText().slice(before));
        r = edit('cd-row-second', notes, 'row two\n', '');
        record('card: a file is judged against every row it matches (the second row, append-only, denies a shrink)', 'deny', got(r, 'append-only file shrinks'), r.out);

        // ---- allowed writes
        r = write('cd-clean', desk, deskText + 'body row three\n');
        record('card: a clean write to a card is allowed', 'allow', got(r), r.out);
        r = write('cd-norow', path.join(brain, 'notes.md'), 'local_0a1b2c3d session_01AbCdEf ' + 'x'.repeat(31000));
        record('card: a file matching no row is allowed, ids and size unread', 'allow', got(r), r.out);
        before = logText().length;
        r = call('cd-notebook', 'NotebookEdit', { notebook_path: path.join(cards, 'DESK.ipynb'), new_source: 'local_0a1b2c3d' });
        record('card: a NotebookEdit is allowed', 'allow', got(r), r.out);
        record('card: the NotebookEdit logs that a notebook is not a bounded file kind', 'logged', logText().slice(before).includes('notebook: not a bounded file kind') ? 'logged' : 'silent', logText().slice(before));

        // ---- no brain: the repository's extract names the rows, host-neutral ({ repo, path } rows)
        const project = jp(T, 'outside', 'brain-clone');
        const pcard = jp(project, 'control', 'cards', 'DESK.md');
        put(pcard, '# Alpha\n\nrow one\nrow two\n');
        const extractRows = (repo) => ({ generated_by: 'cases-card.mjs', class: 'full', values: { boundedFiles: [
            { glob: { repo, path: 'control/cards/*.md' }, idPatterns: ['local_[0-9a-f]{8}'] },
            { glob: { repo: 'other-repo', path: 'control/cards/*.md' }, appendOnly: true },
        ] } });
        put(jp(project, '.claude', 'kit', 'extract.json'), toJson(extractRows('brain-clone')));
        process.env.CLAUDE_PROJECT_DIR = project;
        r = withoutPointer(() => edit('cd-extract-id', pcard, 'row two', 'row two local_0a1b2c3d', {}));
        record('card: no pointer, the extract row for this repository denies an added id', 'deny', got(r, 'adds id local_[0-9a-f]{8}'), r.out);
        r = withoutPointer(() => edit('cd-extract-other', pcard, 'row two\n', ''));
        record('card: no pointer, an extract row naming another repository is dropped (a shrink passes)', 'allow', got(r), r.out);
        // A row whose repo is "*" is every repository's (tools/extract.mjs writes a ${ROOT} glob that way, lead
        // decision M25): bounded.mjs resolves it under the clone whatever the folder is named. Red before the
        // resolver knew "*": the row was dropped as another repository's and the added id passed.
        put(jp(project, '.claude', 'kit', 'extract.json'), toJson(extractRows('*')));
        r = withoutPointer(() => edit('cd-extract-star', pcard, 'row two', 'row two local_0a1b2c3d', {}));
        record('card: no pointer, an extract row whose repo is "*" (the whole root) denies an added id whatever the clone folder is named', 'deny', got(r, 'adds id local_[0-9a-f]{8}'), r.out);
        // CLAUDE_PROJECT_DIR as the host types it can be a link (a junction on Windows) to a folder of another name.
        // A {repo, path} row naming the folder the link resolves to holds in the card hook as it does in the guard:
        // both read the row through one resolver (hooks/lib/common.mjs resolveRepoRow: the typed folder name or the
        // resolved one, without case). Red before bounded.mjs called it: the guard denied the frozen path, the card
        // allowed the added id (allow/deny). A host that cannot make the link says so and skips this one case.
        const cardLink = jp(T, 'outside', 'linked-desk');
        let linkMade = false;
        try { fs.symlinkSync(project, cardLink, 'junction'); linkMade = true; } catch (e) { say(`  card: no link could be made here (${e.message}); the linked-clone case is not run`); }
        if (linkMade) {
            put(jp(project, 'control', 'frozen', 'x.md'), 'frozen\n');
            put(jp(project, '.claude', 'kit', 'extract.json'), toJson({ generated_by: 'cases-card.mjs', class: 'full', values: {
                frozenPaths: [{ repo: 'brain-clone', path: 'control/frozen' }],
                boundedFiles: [{ glob: { repo: 'brain-clone', path: 'control/cards/*.md' }, idPatterns: ['local_[0-9a-f]{8}'] }],
            } }));
            process.env.CLAUDE_PROJECT_DIR = cardLink;
            const viaLink = withoutPointer(() => edit('cd-link-card', jp(cardLink, 'control', 'cards', 'DESK.md'), 'row two', 'row two local_0a1b2c3d', {}));
            const guardViaLink = withoutPointer(() => invokeHook('guard.mjs', hookJson({ session_id: 'cd-link-guard', cwd: cardLink, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(cardLink, 'control', 'frozen', 'x.md'), old_string: 'frozen', new_string: 'thawed' } })));
            record('card: CLAUDE_PROJECT_DIR a link to a folder of another name, a row naming the resolved folder holds in the card hook as in the guard', 'deny/deny',
                `${got(viaLink, 'adds id local_[0-9a-f]{8}')}/${guardViaLink.code === 0 ? classify(guardViaLink.out) : `exit${guardViaLink.code}`}`, `card: ${viaLink.out}\nguard: ${guardViaLink.out}`);
            process.env.CLAUDE_PROJECT_DIR = project;
        }
        // An extract whose values is not an object (a number, a list) is an unreadable config, never no rows: the card
        // hook allows the call with the internal-error notice and an ERROR line, as the guard advises on the same file.
        // Red before readBoundedFiles checked the shape: the call was allowed in silence.
        for (const [label, values] of [['a number', 5], ['a list', []]]) {
            put(jp(project, '.claude', 'kit', 'extract.json'), toJson({ generated_by: 'cases-card.mjs', class: 'full', values }));
            before = logText().length;
            r = withoutPointer(() => edit(`cd-extract-values-${label.replace(/\s+/g, '-')}`, pcard, 'row two', 'row two local_0a1b2c3d', {}));
            record(`card: no pointer, an extract whose values is ${label} allows the call on both channels (internal error), never silence`, 'advise', got(r), r.out);
            record(`card: that extract (values ${label}) is logged as ERROR card: has no values object`, 'logged', /ERROR card extract at .* has no values object/.test(logText().slice(before)) ? 'logged' : 'silent', logText().slice(before));
        }
        // An extract that is not JSON is unreadable too, and the reply and the ERROR line name it, as the guard's
        // advisory names the extract: the parser's own words name no file. Red before readBoundedFiles named the
        // extract: both carried the parser's words alone.
        {
            const named = /extract at .* is not JSON: /;
            put(jp(project, '.claude', 'kit', 'extract.json'), '{ not json');
            before = logText().length;
            r = withoutPointer(() => edit('cd-extract-notjson', pcard, 'row two', 'row two local_0a1b2c3d', {}));
            let j = null;
            try { j = JSON.parse(r.out); } catch { /* got() says what the reply is */ }
            const h = j && j.hookSpecificOutput;
            const c = got(r);
            record('card: no pointer, an extract that is not JSON allows the call on both channels (internal error), naming the extract', 'advise',
                c === 'advise' && !(j && named.test(String(j.systemMessage)) && h && named.test(String(h.additionalContext))) ? 'advise-without-cause' : c, r.out);
            record('card: that extract (not JSON) is logged as ERROR card: extract at <path> is not JSON', 'logged', new RegExp(`ERROR card ${named.source}`).test(logText().slice(before)) ? 'logged' : 'silent', logText().slice(before));
        }
        const seam = path.join(T, 'extract-seam.json');
        put(seam, toJson(extractRows('other-repo')));
        process.env.DF_EXTRACT_PATH = seam;
        r = withoutPointer(() => edit('cd-extract-seam', pcard, 'row two', 'row two local_0a1b2c3d', {}));
        record('card: the DF_EXTRACT_PATH seam is read before the repository extract (its rows name no repository here)', 'allow', got(r), r.out);
        // A seam that names no file, with the clone's own extract present: the guard and the card hook take their
        // extract from one candidate rule (hooks/lib/common.mjs extractPath: the seam when it names a file, then
        // <project>/.claude/kit/extract.json), so both read the clone's rows. Red before bounded.mjs imported it:
        // the guard denied the frozen path from the clone's extract and the card hook took the seam, found no
        // file there and read no row, so the added id passed (allow/deny).
        put(jp(project, 'control', 'frozen', 'x.md'), 'frozen\n');
        put(jp(project, '.claude', 'kit', 'extract.json'), toJson({ generated_by: 'cases-card.mjs', class: 'full', values: {
            frozenPaths: [{ repo: 'brain-clone', path: 'control/frozen' }],
            boundedFiles: [{ glob: { repo: 'brain-clone', path: 'control/cards/*.md' }, idPatterns: ['local_[0-9a-f]{8}'] }],
        } }));
        process.env.DF_EXTRACT_PATH = path.join(T, 'no-such-extract.json');
        const seamGoneCard = withoutPointer(() => edit('cd-seam-gone-card', pcard, 'row two', 'row two local_0a1b2c3d', {}));
        const seamGoneGuard = withoutPointer(() => invokeHook('guard.mjs', hookJson({ session_id: 'cd-seam-gone-guard', cwd: project, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: jp(project, 'control', 'frozen', 'x.md'), old_string: 'frozen', new_string: 'thawed' } })));
        record('card: DF_EXTRACT_PATH naming no file, the card hook and the guard both read the clone extract', 'deny/deny',
            `${got(seamGoneCard, 'adds id local_[0-9a-f]{8}')}/${seamGoneGuard.code === 0 ? classify(seamGoneGuard.out) : `exit${seamGoneGuard.code}`}`, `card: ${seamGoneCard.out}\nguard: ${seamGoneGuard.out}`);
        delete process.env.DF_EXTRACT_PATH;
        delete process.env.CLAUDE_PROJECT_DIR;
        r = withoutPointer(() => edit('cd-nothing', pcard, 'row two', 'row two local_0a1b2c3d', {}));
        record('card: no pointer and no extract, a write is allowed (no row to hold it to)', 'allow', got(r), r.out);

        // ---- fail loud, never closed: an unreadable brain config allows the call and says so, naming its cause.
        // Each pair asks for the cause: the ERROR card line must name doctor.config.json and what is wrong with it,
        // and so must both channels of the reply, which carry the error's words. A card hook that crashed on
        // anything else (a throw planted right after the stdin parse) allows the call with an ERROR card line and
        // the internal-error reply too, and the not-JSON pair read PASS on it. Red first with that throw planted;
        // and red on the real tree until lib/bounded.mjs named the file the parser could not read (the parser's
        // own words name no file).
        const replyNaming = (res, cause) => {
            const c = got(res);
            if (c !== 'advise') return c;
            let j = null;
            try { j = JSON.parse(res.out); } catch { /* got() read it as JSON already */ }
            const h = j && j.hookSpecificOutput;
            return j && cause.test(String(j.systemMessage)) && h && cause.test(String(h.additionalContext)) ? 'advise' : 'advise-without-cause';
        };
        const notJson = /doctor\.config\.json at .* is not JSON: /;
        put(cfgPath, '{ not json');
        before = logText().length;
        r = write('cd-badcfg', desk, deskText + 'local_0a1b2c3d\n');
        record('card: a brain config that is not JSON allows the call on both channels (internal error)', 'advise', replyNaming(r, notJson), r.out);
        record('card: that brain config (not JSON) is logged as ERROR card: not JSON', 'logged', new RegExp(`ERROR card ${notJson.source}`).test(logText().slice(before)) ? 'logged' : 'silent', logText().slice(before));
        // A brain config that is JSON and not an object (a number, a list) is unreadable too, never an empty config:
        // the same internal-error allow and ERROR line. Red before readBoundedFiles checked the shape: allowed in silence.
        const notObject = /doctor\.config\.json at .* is not a JSON object/;
        for (const [label, text] of [['a number', '42'], ['a list', '[]']]) {
            put(cfgPath, text);
            before = logText().length;
            r = write(`cd-badcfg-${label.replace(/\s+/g, '-')}`, desk, deskText + 'local_0a1b2c3d\n');
            record(`card: a brain config that is ${label}, not an object, allows the call on both channels (internal error)`, 'advise', replyNaming(r, notObject), r.out);
            record(`card: that brain config (${label}) is logged as ERROR card: not a JSON object`, 'logged', new RegExp(`ERROR card ${notObject.source}`).test(logText().slice(before)) ? 'logged' : 'silent', logText().slice(before));
        }
    } finally {
        put(cfgPath, kept);
        if (savedProject === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = savedProject;
        if (savedExtract === undefined) delete process.env.DF_EXTRACT_PATH; else process.env.DF_EXTRACT_PATH = savedExtract;
    }
}
