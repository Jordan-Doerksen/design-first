// law-claim.mjs - the commit-msg check behind VCS-23: a law file in the commit needs a claim in
// the same commit, or a written reason why it needs none.
//
// Run by the shim templates/commit-msg, installed as <brain>/.git/hooks/commit-msg. Git calls the
// shim with the path of the message file; the shim finds this script through the pointer.
//   node tools/vcs/law-claim.mjs -MessageFile <path> [-RepoRoot <dir>]
// Exit 0 = the commit proceeds. Exit 1 = refused, with the reason on stderr.
//
// What counts as a law file is generated, not typed: every owning file the repository's LAW.md
// names as `brain:<path>`, plus law.overlay.json, plus lawClaim.extraFiles from doctor.config.json.
// A repository with no LAW.md at its root is not a brain, and nothing is checked.
//
// The commit passes when no law file is staged, when claims.json is staged, when the message carries
// a line "No-Claim: <reason>" (owner decision 2026-10-08: a written waiver; measured on the first
// instance, 18 of 30 law commits stated no fact about the disk), or when it is a merge.
//
// Honest limits. The check sees that claims.json changed, not that the new claim covers the new
// fact. A waiver's reason is read by a person, not graded. `git commit --no-verify` skips every
// commit hook, this one included. An internal error lets the commit through, says so on stderr and
// writes an ERROR line to the design-first hooks log; it never refuses a commit it could not inspect.
//
// anchor: law-claim  mode: gate  verbs: claim
//
// The message check (VOICE-05, 0.1.25, CR-2026-10-13-HONOUR) runs first, in every repository the
// shim is installed in, brain or not: the subject line is 72 characters or fewer (config
// commitMessage.maxSubject), is not a past-tense first word (Added, Fixed, Updated...), and is not
// a bare placeholder (Update, Fix, WIP, changes). A merge or a revert is exempt, and so is git's own
// 'fixup! <subject>' or 'squash! <subject>' (git commit --fixup or --squash). It reads tense from
// the first word only; "specific" is a person's judgement and is not graded.
//
// anchor: commit-message  mode: gate  verbs: write-commit

import path from 'node:path';
import { parseArgs } from '../lib/args.mjs';
import { git, readText, readJson, isFile, isDir, iin, parseIntStrict, writeLog } from '../../hooks/lib/common.mjs';

const err = (line) => process.stderr.write(line + '\n');
const prop = (obj, key) => {
    if (obj == null || typeof obj !== 'object') return undefined;
    const k = Object.keys(obj).find((x) => x.toLowerCase() === key.toLowerCase());
    return k === undefined ? undefined : obj[k];
};
const words = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== '' && x !== false).map(String);
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function main() {
    const opts = parseArgs(process.argv.slice(2), { values: ['MessageFile', 'RepoRoot'] });
    if (!opts.MessageFile) throw new Error('-MessageFile <path> is required');
    let dir = process.cwd();
    if (opts.RepoRoot) {
        dir = path.resolve(opts.RepoRoot);
        if (!isDir(dir)) throw new Error(`no such folder: ${dir}`);
    }
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    if (top.code !== 0 || !top.out.length || !top.out[0].trim()) return 0;   // not a repository: nothing to check
    const root = path.resolve(top.out[0].trim());
    const lawPath = path.join(root, 'LAW.md');

    // Tunables (doctor.config.json, keys lawClaim and commitMessage); built-in defaults when absent.
    let trailer = 'No-Claim'; let minReason = 10; let extra = [];
    let maxSubject = 72;
    let pastWords = ['Added', 'Fixed', 'Updated', 'Changed', 'Removed', 'Corrected', 'Moved', 'Merged', 'Refactored', 'Improved', 'Created', 'Deleted', 'Renamed', 'Replaced', 'Cleaned', 'Tweaked'];
    let placeholders = ['Update', 'Updates', 'Fix', 'Fixes', 'WIP', 'Changes', 'Misc', 'Stuff', 'Work', 'Save', 'Commit', 'Test', 'Tmp', 'Temp'];
    const cfgPath = path.join(root, 'doctor.config.json');
    if (isFile(cfgPath)) {
        const cfg = readJson(cfgPath);
        const lc = prop(cfg, 'lawClaim');
        if (lc && typeof lc === 'object') {
            if (prop(lc, 'trailer')) trailer = String(prop(lc, 'trailer'));
            const v = parseIntStrict(prop(lc, 'minReason'));
            if (v != null && v >= 1) minReason = v;
            if (prop(lc, 'extraFiles') !== undefined) extra = words(prop(lc, 'extraFiles'));
        }
        const cm = prop(cfg, 'commitMessage');
        if (cm && typeof cm === 'object') {
            const v = parseIntStrict(prop(cm, 'maxSubject'));
            if (v != null && v >= 20) maxSubject = v;
            const pw = words(prop(cm, 'pastTenseWords')); if (pw.length) pastWords = pw;
            const ph = words(prop(cm, 'placeholders')); if (ph.length) placeholders = ph;
        }
    }

    // ---- VOICE-05: the message, before anything about law files. Comment lines are git's, not the author's.
    const msgText = isFile(opts.MessageFile) ? readText(opts.MessageFile) : '';
    let subject = '';
    for (const line of msgText.split(/\r?\n/)) { if (/^\s*#/.test(line)) continue; if (line.trim()) { subject = line.trim(); break; } }
    // Workaround (CR-2026-10-15-GAPS review): the pattern was '^(Merge|Revert|fixup!|squash!)\b',
    // and a \b after '!' needs a letter, a digit or an underscore next, so git's own 'fixup! <subject>'
    // and 'squash! <subject>' were checked like any subject and refused when the prefix took them
    // past the length limit. The prefixes now end at the '!' and a space.
    const exempt = /^(?:(?:Merge|Revert)\b|(?:fixup|squash)!(?:\s|$))/i.test(subject);
    if (subject && !exempt) {
        let fault = null;
        const parts = subject.split(/\s+/);
        const first = parts[0].replace(/[:.,;!]+$/, '');
        if (subject.length > maxSubject) fault = `the subject is ${subject.length} characters; the limit is ${maxSubject}`;
        else if (iin(first, placeholders) && parts.length <= 2) fault = `'${subject}' says nothing about the change`;
        else if (iin(first, pastWords)) fault = `'${first}' is past tense; write what the commit does, present tense: '${first.replace(/ed$/i, '')}'`;
        if (fault) {
            err('');
            err('design-first VOICE-05: this commit message does not pass the house rule.');
            err('  subject: ' + subject);
            err('  fault:   ' + fault);
            err('  Commit messages are short, present tense and specific: "Correct the fence claim", not "Corrected the fence claim" and not "Updates".');
            err(`  Limits: subject ${maxSubject} characters or fewer; first word not past tense; not a bare placeholder.`);
            err('');
            return 1;
        }
    }

    if (!isFile(lawPath)) return 0;  // not a brain: the law-claim check does not apply

    const norm = (p) => String(p).trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    const lawFiles = new Set();
    for (const m of readText(lawPath).matchAll(/`brain:([^`]+)`/g)) lawFiles.add(norm(m[1]));
    lawFiles.add('law.overlay.json');
    for (const e of extra) lawFiles.add(norm(e));

    // A merge brings in commits that were each checked when they were made.
    if (git(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).code === 0) return 0;

    const diff = git(root, ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '--diff-filter=ACMRD']);
    if (diff.code !== 0) throw new Error('git diff --cached failed');
    const staged = diff.out.filter((s) => s);
    const hits = staged.filter((s) => lawFiles.has(norm(s))).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (hits.length === 0) return 0;
    if (staged.some((s) => norm(s) === 'claims.json')) return 0;

    const rx = new RegExp('^[ \\t]*' + escapeRx(trailer) + '[ \\t]*:[ \\t]*(.+?)[ \\t]*$', 'gim');
    let given = '';
    for (const m of msgText.matchAll(rx)) if (m[1].trim().length > given.length) given = m[1].trim();
    if (given.length >= minReason) return 0;

    err('');
    err('design-first VCS-23: this commit changes a law file and carries no claim.');
    err('  law file(s): ' + hits.join(', '));
    err('  When a law file states a fact about the disk, it gets a claim in the same commit.');
    err('    1. add or change the claim in claims.json and stage it, or');
    err(`    2. if this change states no fact about the disk, add a line to the commit message:  ${trailer}: <reason>`);
    if (given) err(`  The reason given ('${given}') is shorter than ${minReason} characters; say why no claim is needed.`);
    err('');
    return 1;
}

try {
    process.exitCode = main();
} catch (e) {
    const text = e && e.message ? e.message : String(e);
    writeLog('ERROR', 'law-claim', text.replace(/\s+/g, ' '));
    err(`design-first law-claim: internal error, VCS-23 was NOT checked for this commit (${text}). Logged to the design-first hooks log.`);
    process.exitCode = 0;
}
