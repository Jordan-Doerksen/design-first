// fence.mjs - design-first PreToolUse fence (Edit | Write | Bash | PowerShell).
//
// Chesterton's Fence + Goodhart gate. FENCE trips on a deletion it can see (an Edit that empties a
// block or removes three or more lines, a Write that keeps under three quarters of the bytes, a
// destructive shell command from its list) and advises. GOODHART trips when an edit to a measuring
// file (a folder or file name in the path holds, as a word part, a word that starts with test,
// probe, verify or assert, or the word spec or specs; see isMeasuringPath) removes or neuters an
// assertion.
//
// Two tiers, because a guard that covers one language is not a guard:
//   PAREN form  - assert(...), self.assertEqual(...), expect(...) (not .expect(), a method call) -> DENIES
//   LOOSE form  - Python bare `assert x == 1`, pytest.raises, Rust assert_eq! -> ADVISES
// The loose pattern is broader and can misread a legitimate refactor, so it advises rather than
// denies. Both tiers fire only on a NET DECREASE inside a measuring path. The '* 0' deny fires with
// no decrease, and it is not reached when the same Edit or Write already got the loose-form advise.
// An Edit is compared on its old and new strings; a Write on the file on disk and the new content.
// A NotebookEdit is not fenced: the matcher in hooks.json does not send it here.
//
// Failure policy: an internal error ALLOWS the call, appends an ERROR line to the hooks log and says
// so on both channels. Never silent.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Workaround (CR-2026-10-15-GAPS review): a method call '.expect(' counted as an assertion, so a
// Rust test that swapped .expect("...") for '?' was denied. An expect( right after a '.' is a
// method call and does not count (chai.expect( is lost with it; see GATE-11's residual).
const ASSERT_RX = /\bassert\w*\s*\(|(?<!\.)\bexpect\w*\s*\(/g;
const countAsserts = (s) => (s ? [...s.matchAll(ASSERT_RX)].length : 0);

// The "* 0" idiom: a term multiplied by zero, '* 0', '* 0.', '* 0.0'. Workaround (CR-2026-10-15-GAPS
// review): the pattern ended in \b, which also fires between '0' and '.5', so '* 0.5' was read as a
// zero term and a test that halves a value was denied. The zero must not run on into a digit, a
// letter or another '.', so '* 0.5' and '* 0x10' do not match. Workaround (CR-2026-10-15-GAPS second
// review): the '*' that opens a C block comment matched too, so an Edit that wrote '/* 0 = off */'
// in a test was denied. A '*' right after '/' (or after '/' and more '*', as in '/** 0') opens a
// comment and is not a multiply.
const ZERO_TERM_RX = /(?<!\/\**)\*\s*0(?:\.0*)?(?![.\w])/i;

// A measuring file: a folder or file name in its path that holds a measuring word as a word part.
// A name is cut into word parts at any character that is not a letter or a digit, at a change from
// lower to upper case, and between letters and digits. A word part counts when it starts with test,
// probe, verify or assert, or is spec or specs, so tests/, testdata/, spec/, test_x.py, x.test.js,
// x_spec.rb, verify-build.ps1 and FooTest.java count. Workaround (CR-2026-10-15-GAPS review): the
// test was a substring match on the whole path, so latest/, inspector/ and special/ were measuring
// folders and a rewrite there that dropped an assertion was denied. 'spec' is matched whole (and
// plural) and not as a start, because special, specific and species start with it.
const MEASURING_WORD_RX = /^(test\w*|specs?|probe\w*|verify\w*|assert\w*)$/i;
function isMeasuringPath(p) {
    if (!p || !String(p).trim()) return false;
    for (const seg of String(p).split(/[\\/]/)) {
        if (!seg) continue;
        const cut = seg.replace(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])/g, ' ');
        for (const w of cut.split(/[^A-Za-z0-9]+/)) if (w && MEASURING_WORD_RX.test(w)) return true;
    }
    return false;
}

// Python bare assert and pytest.raises; Rust assert!/assert_eq!/assert_ne!/debug_assert*! (the
// `!` is why the paren regex counts 0 for these).
const LOOSE_RX = /^\s*assert\s|\bassert_eq\s*!|\bassert_ne\s*!|\bassert\s*!|\bdebug_assert\w*\s*!|\bpytest\.raises\b/gm;
const countAssertsLoose = (s) => (s ? [...s.matchAll(LOOSE_RX)].length : 0);

// Round half to even, as a cast to an integer does in .NET, so a percentage reads the same as before.
function roundEven(x) {
    const f = Math.floor(x); const d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
}

const GOODHART_QUESTIONS = `1. What sabotage does this assertion catch? Name the concrete defect.
2. After your edit, can the probe still go RED? Prove it: put the bug back, run it, name the
   assertion that fires (sed + run + restore is enough).
3. Are you weakening the check to make something pass? If the honest answer is yes, fix the CODE,
   not the measure.

If the assertion is genuinely obsolete, say what replaced its coverage. An assertion with no
replacement is a Preserve.`;

let C = null;
function fenceLog(line) { C.addTextLine(C.getFenceLogPath(), `${C.stampNow()}  ${line}`); }

// anchor: goodhart-paren  mode: deny  verbs: weaken-assertion
function goodhart(what, file) {
    const body = `GOODHART TRIPPED - ${what} in ${file}\n\n` +
        'You are editing the thing that MEASURES, not the thing being measured. When the measure ' +
        `becomes the target, it stops measuring. Before this edit lands, state in your reply:\n\n${GOODHART_QUESTIONS}`;
    fenceLog(`[goodhart-paren deny] GOODHART: ${what} in ${file}`);
    return C.newDeny('fence', `GOODHART: assertion weakened (${what} in ${file})`,
        `GOODHART: this edit removes or neuters an assertion in ${file} (${what}). Fix the CODE, not the measure. ` +
        `If the assertion is genuinely obsolete, say what replaced its coverage and ask the owner.\n\n${body}`);
}

// anchor: goodhart-loose  mode: advise  verbs: weaken-assertion
function goodhartSoft(what, file) {
    const body = `GOODHART (advisory) - ${what} in ${file}\n\n` +
        'This looks like an assertion being removed from a measuring file. It is not blocked, because ' +
        `detection for this language is broader and can misread a legitimate refactor. Answer it anyway:\n\n${GOODHART_QUESTIONS}`;
    fenceLog(`[goodhart-loose advise] GOODHART: ${what} in ${file}`);
    return C.newAdvisory('fence', [{ title: `GOODHART (advisory): ${what} in ${file}`, body }]);
}

// anchor: fence-net-deletion  mode: advise  verbs: delete,simplify
function fence(what) {
    const body = `FENCE TRIPPED - ${what}

You are removing something you did not put there. Before this edit lands, state in your reply:
1. What does it prevent? Name the failure mode, not the syntax.
2. What breaks if it is gone? Name the call sites you actually checked.
3. Evidence you used: git log -S '<thing>' | git blame | the Change Log in DECISIONS.md |
   the probe that covers it | the comment above it.
   If ZERO of those exist, that is the finding. Preserve it and say so.

Verdict, one of: Preserve | Modify | Replace | Remove. If uncertain, Preserve.

Does NOT apply when the owner named this thing for removal - an explicit ask is the approval.
Applies DOUBLE if the word in your head was "consolidate", "tidy", "clean up", or "simplify".`;
    fenceLog(`[fence-net-deletion advise] FENCE: ${what}`);
    return C.newAdvisory('fence', [{ title: `net deletion detected (${what})`, body }]);
}

const DESTRUCTIVE = [/rm\s+(-\w*[rf]\w*\s+)/i, /Remove-Item[^|;]*-(Recurse|Force)/i, /git\s+reset\s+--hard/i,
    /git\s+clean\s+-\w*[fdx]/i, /git\s+checkout\s+--\s/i, /git\s+restore\s+/i, /git\s+stash\s+drop/i,
    /git\s+branch\s+-D/i, /Move-Item[^|;]*-Force/i, /Clear-Content/i];

function checkEdit(ti) {
    const old = C.str(ti.old_string);
    const nw = C.str(ti.new_string);
    const fp = C.str(ti.file_path);
    if (!old) return null;
    if (isMeasuringPath(fp)) {
        const oldA = countAsserts(old); const newA = countAsserts(nw);
        if (newA < oldA) return goodhart(`${oldA - newA} assertion(s) removed`, fp);
        const oldL = countAssertsLoose(old); const newL = countAssertsLoose(nw);
        if (newL < oldL) return goodhartSoft(`${oldL - newL} assertion(s) removed (Python/Rust form)`, fp);
        // The "* 0.0" idiom: an assertion survives textually but its term is erased.
        if (ZERO_TERM_RX.test(nw) && !ZERO_TERM_RX.test(old)) return goodhart("a '* 0' term introduced (an assertion may be erasing itself)", fp);
    }
    if (!nw) return fence(`an entire block is being deleted from ${fp}`);
    const lost = old.split('\n').length - nw.split('\n').length;
    if (lost >= 3) return fence(`${lost} lines removed from ${fp}`);
    return null;
}

function checkWrite(ti, cwd) {
    const p = C.str(ti.file_path);
    if (!p) return null;
    const full = path.isAbsolute(p) ? p : path.resolve(cwd || process.cwd(), p);
    let st;
    try { st = fs.statSync(full); } catch { return null; }
    if (!st.isFile()) return null;
    const oldLen = st.size;
    if (oldLen <= 0) return null;
    const content = C.str(ti.content);
    // A Write to a measuring file is compared assertion by assertion, like an Edit: the file on disk
    // is the old text and the content is the new. Workaround (CR-2026-10-15-GAPS D1): this branch
    // compared bytes only, so a full rewrite that dropped assertions got at most a size advise, and
    // none when it kept three quarters of the bytes.
    if (isMeasuringPath(p)) {
        const old = C.readText(full); const nw = content;
        const oldA = countAsserts(old); const newA = countAsserts(nw);
        if (newA < oldA) return goodhart(`${oldA - newA} assertion(s) removed by a Write`, p);
        const oldL = countAssertsLoose(old); const newL = countAssertsLoose(nw);
        if (newL < oldL) return goodhartSoft(`${oldL - newL} assertion(s) removed by a Write (Python/Rust form)`, p);
        if (ZERO_TERM_RX.test(nw) && !ZERO_TERM_RX.test(old)) return goodhart("a '* 0' term introduced by a Write (an assertion may be erasing itself)", p);
    }
    const newLen = Buffer.byteLength(content, 'utf8');
    if (newLen < oldLen * 0.75) {
        const pct = roundEven(100 - (newLen / oldLen) * 100);
        return fence(`overwriting ${p} and losing ~${pct}% of it`);
    }
    return null;
}

function checkShell(ti) {
    const cmd = C.str(ti.command);
    if (!cmd.trim()) return null;
    for (const rx of DESTRUCTIVE) {
        const m = rx.exec(cmd);
        if (m) return fence(`destructive command: ${m[0].trim()}`);
    }
    return null;
}

try {
    C = await import('./lib/common.mjs');
    const raw = C.readStdin();
    if (C.isBlank(raw)) throw new Error('empty stdin (no tool call payload)');
    const j = JSON.parse(raw);
    const tool = C.str(j.tool_name);
    const ti = j.tool_input;
    if (ti == null) throw new Error(`payload has no tool_input (tool_name='${tool}')`);
    let result = null;
    if (tool === 'Edit') result = checkEdit(ti);
    else if (tool === 'Write') result = checkWrite(ti, j.cwd ? String(j.cwd) : '');
    else if (tool === 'Bash' || tool === 'PowerShell') result = checkShell(ti);
    if (result) C.writeJson(result);
} catch (e) {
    // Internal error: allow, log, surface. Written inline so it works even when lib/ failed to load.
    const msg = e && e.message ? e.message : String(e);
    try {
        const log = process.env.DF_LOG_PATH || path.join(os.homedir(), '.claude', 'design-first-hooks.log');
        fs.mkdirSync(path.dirname(log), { recursive: true });
        fs.appendFileSync(log, `${new Date().toISOString()} ERROR fence ${msg.replace(/\s+/g, ' ')}\n`, 'utf8');
    } catch { /* never fatal */ }
    process.stdout.write(JSON.stringify({
        systemMessage: `FENCE: internal error, call allowed (${msg})`,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `fence hook hit an internal error and ALLOWED this call without inspecting it: ${msg}. Logged to the design-first hooks log.` },
    }) + '\n');
}
process.exitCode = 0;
