// card.mjs - refuses a write to a bounded file that adds an id, grows it while it is over its size, grows its typed head past its line limit, or shrinks it when it is append-only.
//
// The bounded-file hook (0.3.0): PreToolUse on Edit, Write and NotebookEdit. The rows come from the
// brain's doctor.config.json through the pointer (boundedFiles), or, with no brain, from the
// repository's .claude/kit/extract.json (lib/bounded.mjs reads both, one parser). A row is
//   { glob, maxBytes (30000), headLines (15), idPatterns ([]), appendOnly (false) }
// and the template ships the list empty, so the kit itself is unaffected until a brain names a row.
// For a file that matches a row, the result of the call (an Edit's old_string replaced by its
// new_string in the file's current text, every occurrence under replace_all; a Write's content) is
// refused, with the reason the model sees, when:
//   1. adds-id      - the result holds a match of an idPatterns regex that the current text does not
//                     (a typed file never carries a session, sidebar, run or trigger id);
//   2. over-size    - the result is longer than maxBytes (UTF-8 bytes of LF text) and longer than
//                     the current text: only growth is refused, so a trim of an oversize file passes;
//   3. head-over    - the head (the lines before the first line that is <!-- kit:generated -->, or
//                     the whole file when there is none) is longer than headLines and longer than
//                     the current head;
//   4. append-only  - appendOnly and the result is shorter than the current text.
// A file that matches no row is allowed. A NotebookEdit is allowed with one INFO line: a notebook
// is not a bounded file kind. Both sides are compared after CRLF -> LF, as the guard's read check
// does, because the host matches an LF old_string against a CRLF file.
//
// What this hook cannot see (the written residual): a shell write (a redirect, Set-Content, cp,
// git checkout) to a bounded file; an Edit whose old_string the host matches after folding curly
// quotes, which this hook matches exactly (the host then refuses it, or it passes unjudged); an id
// in a shape no pattern names; an id moved from one bounded file to another (each file is judged
// against its own current text); and the file's history, since the current text on disk is the
// only "before".
//
// Failure policy: an internal error ALLOWS the call, appends an ERROR line to the hooks log and
// says so on both channels. Never fail-closed, never silent.
//
// anchor: card-bounded  mode: deny  verbs: edit,write

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let C = null;
let B = null;

const MARKER = '<!-- kit:generated -->';
const lf = (s) => (s == null ? '' : String(s).replace(/\r\n/g, '\n'));

// The current text of the file and the text the call leaves, both LF, or null when the host will
// refuse the Edit itself (its old_string is not in the file). Modelled on the guard's getSizeChange.
function resultOf(tool, ti, full) {
    const base = C.isFile(full) ? lf(C.readText(full)) : '';
    if (tool === 'Write') return { base, text: lf(ti.content) };
    const old = lf(ti.old_string); const nw = lf(ti.new_string);
    if (!old) return base.length > 0 ? null : { base, text: nw };   // an empty old_string fills an empty file only
    const i = base.indexOf(old);
    if (i < 0) return null;
    const all = C.has(ti, 'replace_all') ? Boolean(ti.replace_all) : false;
    return { base, text: all ? base.split(old).join(nw) : base.slice(0, i) + nw + base.slice(i + old.length) };
}

// The lines above the first marker line, or every line when there is no marker; a trailing newline
// is not a line.
function headLineCount(text) {
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const at = lines.findIndex((l) => l.trim() === MARKER);
    return at < 0 ? lines.length : at;
}

// The matches of rx in text that base does not hold, each once.
function newMatches(rx, base, text) {
    const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    const had = new Set();
    for (const m of base.matchAll(g)) had.add(m[0]);
    const added = [];
    for (const m of text.matchAll(g)) if (!had.has(m[0]) && !added.includes(m[0])) added.push(m[0]);
    return added;
}

// The decision for one Edit or Write: null (allow) or a deny from newDeny, one line per rule that
// fires across every row the file matches.
function checkBounded(tool, ti, cwd, ptr) {
    const full = C.toFullPath(C.str(ti.file_path), cwd);
    if (!full) return null;
    if (ptr.warning) C.writeLog('WARN', 'card', ptr.warning);
    const problems = [];
    const rows = B.readBoundedFiles(C, ptr, problems);
    for (const p of problems) C.writeLog('ERROR', 'card', p);
    const hits = rows.filter((r) => B.globMatches(full, r.glob));
    if (hits.length === 0) return null;
    const change = resultOf(tool, ti, full);
    if (change == null) return null;
    const { base, text } = change;
    const before = Buffer.byteLength(base, 'utf8'); const after = Buffer.byteLength(text, 'utf8');
    const found = [];
    for (const row of hits) {
        for (const rx of row.idPatterns) {
            const added = newMatches(rx, base, text);
            if (added.length > 0) found.push({ title: `adds id ${rx.source}`, line: `This ${tool} adds the id ${added.map((x) => `'${x}'`).join(', ')} (pattern ${rx.source}), which the file does not carry now. A typed file names a thing by its title or its item, never by a session, sidebar, run or trigger id.` });
        }
        if (row.maxBytes > 0 && after > row.maxBytes && after > before) found.push({ title: `over ${row.maxBytes} and growing`, line: `This ${tool} leaves the file at ${after} bytes, over its limit of ${row.maxBytes} and larger than it is now (${before}). Trim it first (move closed rows to the archive) and write again; a write that shrinks it passes.` });
        if (row.headLines > 0) {
            const h0 = headLineCount(base); const h1 = headLineCount(text);
            if (h1 > row.headLines && h1 > h0) found.push({ title: `head over ${row.headLines} lines and growing`, line: `This ${tool} grows the head (the lines above the first ${MARKER} line) to ${h1} lines, over its limit of ${row.headLines} and longer than it is now (${h0}). The head is typed and short; the body below the marker is generated. Shorten the head or put the text in the body.` });
        }
        if (row.appendOnly && after < before) found.push({ title: 'append-only file shrinks', line: `This ${tool} shrinks the file from ${before} to ${after} bytes, and the file is append-only: rows move in by sha-proven copy and never out. Append; do not rewrite.` });
    }
    if (found.length === 0) return null;
    const titles = [...new Set(found.map((f) => f.title))];
    const title = titles.join(' | ');
    const reason = `CARD: ${full} is a bounded file and this ${tool} is refused.\n- ${found.map((f) => f.line).join('\n- ')}`;
    C.writeLog('INFO', 'card', `denied ${tool} ${full}: ${title}`);
    C.addTextLine(C.getFenceLogPath(), `${C.stampNow()}  BLOCKED[CARD: ${title}]`);
    return C.newDeny('card', title, reason);
}

try {
    C = await import('./lib/common.mjs');
    B = await import('./lib/bounded.mjs');
    const raw = C.readStdin();
    if (C.isBlank(raw)) throw new Error('empty stdin (no tool call payload)');
    const j = JSON.parse(raw);
    // Both calls arrive with the 0.3.0 common.mjs; a hook that runs beside an older copy still answers.
    if (typeof C.setMarkerDir === 'function') C.setMarkerDir(j);
    if (typeof C.yieldToPlugin === 'function' && C.yieldToPlugin('card', HERE)) {
        // A vendored copy beside a plugin that runs: the plugin decides, this copy prints nothing.
    } else {
        const tool = C.str(j.tool_name);
        const ti = j.tool_input;
        if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
            if (ti == null) throw new Error(`payload has no tool_input (tool_name='${tool}')`);
            if (tool === 'NotebookEdit') C.writeLog('INFO', 'card', `notebook: not a bounded file kind (${C.str(ti.notebook_path)})`);
            else {
                const result = checkBounded(tool, ti, j.cwd ? String(j.cwd) : '', C.readPointer());
                if (result) C.writeJson(result);
            }
        }
    }
} catch (e) {
    // Internal error: allow, log, surface. Written inline so it works even when lib/ failed to load.
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR card ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    process.stdout.write(JSON.stringify({
        systemMessage: `CARD: internal error, call allowed (${msg})`,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `card hook hit an internal error and ALLOWED this call without inspecting it: ${msg}. Logged to the design-first hooks log.` },
    }) + '\n');
}
process.exitCode = 0;
