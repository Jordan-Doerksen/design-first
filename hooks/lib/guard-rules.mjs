// guard-rules.mjs - guard rules 1-6, in SPEC 5.4 order. Imported by guard.mjs. Rules 7-9 are in guard-owner-rules.mjs.
// Each rule returns null (no opinion) or a deny object from newDeny. Advisories are added to the
// advisories list and emitted once by guard.mjs.

import path from 'node:path';
import fs from 'node:fs';
import {
    newDeny, toFullPath, isUnder, pathEq, getLeaf, getExt, nearestExistingDir, git, gitFirst, isDir, isFile,
    firstTime, writeLog, sha1Hex, iin, has, str, FOLD_CASE,
} from './common.mjs';

export const SECRET_GLOBS = ['*.env', '*.env.*', '*.key', '*.pem', '*.p12', '*.pfx'];
export const ENV_GLOBS = ['*.env', '*.env.*'];

// PowerShell -like: * and ? wildcards, [abc] classes, case-insensitive.
export function likeRx(glob) {
    let rx = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') rx += '[\\s\\S]*';
        else if (c === '?') rx += '[\\s\\S]';
        else if (c === '[') {
            const j = glob.indexOf(']', i + 1);
            if (j > i + 1) { rx += '[' + glob.slice(i + 1, j).replace(/\\/g, '\\\\') + ']'; i = j; }
            else rx += '\\[';
        } else rx += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }
    return new RegExp('^' + rx + '$', 'i');
}
const likeCache = new Map();
export function like(s, glob) {
    if (!likeCache.has(glob)) likeCache.set(glob, likeRx(glob));
    return likeCache.get(glob).test(str(s));
}

export function isSecretName(leaf, globs) {
    if (!leaf || !leaf.trim()) return false;
    if (like(leaf, '*.env.example')) return false;
    return globs.some((g) => like(leaf, g));
}

function isException(full, exceptions) {
    if (!full) return false;
    return exceptions.some((e) => pathEq(full, e));
}

// The advisories of this call. agentOnly: the advisory goes to the agent's context and never to the
// owner's screen (no systemMessage title). Rule 6 uses it: a note about a file's size is the agent's.
export const advisories = [];
export function addAdvisory(title, body, agentOnly = false) { advisories.push({ title, body, agentOnly }); }

// Short-option group scan: returns { flags: letters seen before a value-taking letter;
// consumesNext: true when the last letter takes a value and nothing followed it }.
function readShortGroup(tok, valueLetters) {
    const r = { flags: [], consumesNext: false };
    const letters = tok.slice(1);
    for (let k = 0; k < letters.length; k++) {
        const ch = letters[k];
        if (valueLetters.includes(ch)) {
            if (k === letters.length - 1) r.consumesNext = true;
            break;
        }
        r.flags.push(ch);
    }
    return r;
}

// ============================================================================ (1) staging
// anchor: stage-secret  mode: deny  verbs: stage,track
const LONG_VALUED = ['--message', '--file', '--reuse-message', '--reedit-message', '--author', '--date',
    '--template', '--fixup', '--squash', '--trailer', '--pathspec-from-file', '--chmod', '--gpg-sign', '--cleanup'];

export function stagingRule(call, exceptions, owner) {
    if (call.sub !== 'add' && call.sub !== 'commit') return null;
    const a = call.args;
    const cwd = call.cwd;

    // Option-value stripping (finding 75): a message or a file argument is prose, not a pathspec.
    const valueLetters = call.sub === 'commit' ? 'mFCct' : '';
    const paths = []; let hasAll = false; let afterDashDash = false;
    for (let i = 0; i < a.length; i++) {
        const t = a[i];
        if (afterDashDash) { paths.push(t); continue; }
        if (t === '--') { afterDashDash = true; continue; }
        if (/^--[A-Za-z-]+=/.test(t)) continue;
        if (iin(t, LONG_VALUED)) { i++; continue; }
        if (t.toLowerCase() === '--all') { hasAll = true; continue; }
        if (/^-[A-Za-z]+$/.test(t)) {
            const g = readShortGroup(t, valueLetters);
            // PowerShell's -in folds case, so -a and -A both read as "all" here, as before.
            if (iin('a', g.flags)) hasAll = true;
            if (iin('A', g.flags) || iin('u', g.flags)) paths.push('-A');
            if (g.consumesNext) i++;
            continue;
        }
        if (t.startsWith('-')) continue;
        paths.push(t);
    }
    if (call.sub === 'commit' && !hasAll) return null;

    const probes = [];
    for (const p of paths) {
        if (iin(p, ['-A', '-u', '-Au', '-uA', '.', './', '.\\'])) { probes.push(p); continue; }
        const leaf = getLeaf(p);
        if (isSecretName(leaf, SECRET_GLOBS)) {
            const full = toFullPath(p, cwd);
            if (isException(full, exceptions)) continue;
            return stageDeny(p, owner);
        }
        // A pathspec with magic (':/', ':(top)', ':(glob)...', ':!x') is probed as typed, and git
        // reads the magic: ':/' and ':(top)' cover the whole work tree from the top level, as -A
        // does, and an exclusion keeps its meaning. It comes after the name test, so ':/.env' is
        // still refused by name when git tracks or ignores that file. Workaround
        // (CR-2026-10-15-GAPS review): such a pathspec is neither a wildcard nor a folder on disk,
        // so it was never probed, and 'git add :/' staged an untracked .env with no refusal.
        if (p.startsWith(':')) { probes.push(p); continue; }
        const full = toFullPath(p, cwd);
        if (/[*?[]/.test(p) || (full && isDir(full))) probes.push(p);
    }
    if (hasAll && call.sub === 'add') probes.push('-A');

    // Wildcard probe (finding 71): ask git which untracked, un-ignored files the pathspec covers.
    for (const p of probes) {
        let runDir = cwd;
        let spec = ['--', p];
        if (p.startsWith('-')) {
            // -A / -u / --all cover the whole work tree, so probe from the top level.
            const top = git(cwd, ['rev-parse', '--show-toplevel']);
            if (top.code !== 0) continue;
            runDir = toFullPath(gitFirst(top));
            spec = [];
        }
        const ls = git(runDir, ['ls-files', '--others', '--exclude-standard', '-z', ...spec]);
        if (ls.code !== 0 || !ls.raw) continue;
        for (const f of ls.raw.split('\0')) {
            if (!f.trim()) continue;
            if (!isSecretName(getLeaf(f), SECRET_GLOBS)) continue;
            const full = toFullPath(f, runDir);
            if (isException(full, exceptions)) continue;
            return stageDeny(`${f} (via '${p}')`, owner);
        }
    }
    return null;
}

function stageDeny(what, owner) {
    const reason = `BLOCKED - this command stages a file that looks like a credential: ${what}\n\n` +
        'Secrets live in a gitignored .env, always; a token is never committed. If this one ' +
        'has leaked, rotate it first and assume it is already public. If this file is a ' +
        `deliberate exception, ${owner} registers it in secretExceptions in the brain's ` +
        'doctor.config.json before it is staged; an exception is recorded, never assumed.';
    return newDeny('guard', `staging a secret (${what})`, reason);
}

// ============================================================================ (2) history
// anchor: git-history  mode: deny  verbs: destroy-history
export function historyRule(call, owner) {
    const a = call.args;
    let hit = null;
    switch (call.sub) {
        case 'gc':
            if (a.some((t) => /^--prune(=.*)?$/i.test(t))) hit = 'git gc --prune removes unreachable objects, the recovery net for anything never committed';
            break;
        case 'reflog':
            if (iin('expire', a)) hit = 'git reflog expire removes the reflog, the first recovery tool after a bad reset';
            break;
        case 'push': {
            const valued = ['-o', '--push-option', '--receive-pack', '--exec', '--repo'];
            for (let i = 0; i < a.length; i++) {
                const t = a[i];
                if (iin(t, valued)) { i++; continue; }
                if (/^--(force|force-with-lease)(=.*)?$/i.test(t)) { hit = `${t} rewrites published history`; break; }
                if (iin(t, ['--delete', '-d'])) { hit = `${t} deletes a remote branch`; break; }
                if (/^-[A-Za-z]+$/.test(t) && t.includes('f')) { hit = `${t} (force) rewrites published history`; break; }
                if (/^-[A-Za-z]+$/.test(t) && t.includes('d')) { hit = `${t} (delete) deletes a remote branch`; break; }
                if (t.startsWith('-')) continue;
                if (t.startsWith('+')) { hit = `refspec ${t} forces the update`; break; }
                if (/^:.+/.test(t)) { hit = `refspec ${t} deletes the remote branch`; break; }
            }
            break;
        }
        default: break;
    }
    if (!hit) return null;
    const reason = `BLOCKED - that command destroys git history: ${hit}.\n\n` +
        "Git's recovery order is reflog, fsck --lost-found, stash, bundle; these commands remove " +
        'exactly what that order depends on, on every branch. If this rewrite is genuinely wanted, ' +
        `${owner} runs it by hand.`;
    return newDeny('guard', `history destruction (${hit})`, reason);
}

// ============================================================================ (3) env write
// anchor: env-write  mode: deny  verbs: write-secret
export function envWriteRule(full, exceptions, owner) {
    if (!full) return null;
    if (!isSecretName(getLeaf(full), ENV_GLOBS)) return null;
    if (isException(full, exceptions)) return null;
    const dir = nearestExistingDir(full);
    if (!dir) return null;
    const tracked = git(dir, ['ls-files', '--error-unmatch', '--', full]);
    if (tracked.code === 0) {
        const reason = `BLOCKED - ${full} is a secret file that is already tracked by git.\n\n` +
            `Untrack it first: git rm --cached "${full}", then add it to .gitignore, then write it. ` +
            `If tracking it is deliberate, ${owner} registers it in secretExceptions in the brain's doctor.config.json.`;
        return newDeny('guard', `writing a tracked secret file (${full})`, reason);
    }
    const ign = git(dir, ['check-ignore', '-q', '--', full]);
    if (ign.code === 0) return null;
    if (ign.code === 1) {
        const reason = `BLOCKED - ${full} is a secret file and is not ignored by git.\n\n` +
            "Add it to .gitignore first (that edit and 'git add .gitignore' are allowed), then write it. " +
            `If committing it is deliberate, ${owner} registers it in secretExceptions in the brain's doctor.config.json.`;
        return newDeny('guard', `writing a secret file that is not ignored (${full})`, reason);
    }
    addAdvisory(`secret file outside any git repo (${full})`,
        `${full} looks like a secret file and is outside any git repository, so git cannot say whether it is ignored. ` +
        "Allowed. If a repo is created around it later, ignore it before the first 'git add'.");
    return null;
}

// ============================================================================ (4) path rules
// anchor: frozen-path  mode: deny  verbs: edit-frozen,confirm-canonical
// MAP-01 rides here (owner decision 2026-10-13): a copy that is not canonical and must not be
// edited is a frozen path; the brain's frozenPaths list is the machine-readable column of its
// canonical.md, and this rule refuses the edit.
const DESTRUCTIVE_HEADS = ['rm', 'rmdir', 'del', 'erase', 'rd', 'ri', 'mv', 'move', 'remove-item', 'move-item', 'rename-item', 'clear-content'];

function protectedHit(full, prot) {
    for (const r of prot) if (isUnder(full, r)) return r;
    return null;
}

function frozenDeny(what, root, owner) {
    const reason = `BLOCKED - ${what} is inside ${root}, which the brain lists as FROZEN or TOMBSTONED.\n\n` +
        'Frozen means read, never edit. Tombstoned means retired but still read by a live consumer; ' +
        `moving or deleting it breaks that consumer silently. Changing this is ${owner}'s decision: the ` +
        "path comes out of frozenPaths / tombstonedPaths in the brain's doctor.config.json first, as a recorded change.";
    return newDeny('guard', `protected path (${what})`, reason);
}

export function pathRuleFile(full, prot, owner, tombstoned = []) {
    if (!full || prot.length === 0) return null;
    const hit = protectedHit(full, prot);
    if (!hit) return null;
    // VCS-12: TOMBSTONE.md directly inside a tombstoned folder is the record the tombstone claim
    // reads; it is the one write the rule allows there. A frozen folder gets no such file.
    if (getLeaf(full).toLowerCase() === 'tombstone.md') {
        const parent = path.dirname(full);
        if (tombstoned.some((t) => t && pathEq(parent, t))) return null;
    }
    return frozenDeny(full, hit, owner);
}

export function pathRuleShell(tokens, gitCall, cwd, prot, owner) {
    if (prot.length === 0 || !tokens || tokens.length === 0) return null;
    let destructive = DESTRUCTIVE_HEADS.includes(tokens[0].toLowerCase());
    if (gitCall && ['clean', 'restore', 'rm', 'checkout'].includes(gitCall.sub)) destructive = true;
    if (!destructive) return null;
    for (const t of tokens) {
        if (t.startsWith('-')) continue;
        const full = toFullPath(t, cwd);
        const hit = full ? protectedHit(full, prot) : null;
        if (hit) return frozenDeny(t, hit, owner);
    }
    return null;
}

// ============================================================================ (5) manifest before code
// anchor: no-manifest  mode: advise  verbs: lock,unlock
// A source write inside a git repository with no DECISIONS.md at its root or in docs/ advises on
// both channels (a title on the owner's screen, the note in the agent's context); the call goes on.
// Once per repository per session (DES-02, GATE-04). Docs, config and data files are not source;
// the brain's sourceExtensions list decides, with a built-in default when there is no brain.
export const DEFAULT_SOURCE_EXTENSIONS = ['.py', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.rs', '.go', '.cs', '.gd', '.ps1', '.sh', '.html', '.css', '.scss', '.vue', '.svelte', '.lua', '.c', '.h', '.cpp', '.java', '.kt', '.swift'];

// The top of the repository a path is in, or null. Answered from the file system when the answer is
// plain: the nearest .git above the path is a folder with a HEAD and no core.worktree, or a .git file
// that names its git folder (a worktree or a submodule), the path is not inside the .git folder, and
// GIT_DIR and GIT_WORK_TREE are unset. No .git above the path means no repository, as git would say.
// Anything else asks git. Workaround: every Edit asked git this question three times, and one git
// process costs more than the rest of the hook on Windows.
function plainRepoRoot(dir) {
    if (process.env.GIT_DIR || process.env.GIT_WORK_TREE) return undefined;
    let d = dir;
    for (let i = 0; i < 256; i++) {
        const g = path.join(d, '.git');
        let st = null;
        try { st = fs.statSync(g); } catch { st = null; }
        if (st) {
            const rel = dir.slice(d.length).replace(/^[\\/]+/, '');
            if (/^\.git([\\/]|$)/i.test(rel)) return undefined;
            if (st.isDirectory()) {
                if (!isFile(path.join(g, 'HEAD'))) return undefined;
                try { if (/^\s*worktree\s*=/im.test(fs.readFileSync(path.join(g, 'config'), 'utf8'))) return undefined; } catch { return undefined; }
                return d;
            }
            try { if (/^gitdir:/.test(fs.readFileSync(g, 'utf8'))) return d; } catch { /* ask git */ }
            return undefined;
        }
        const parent = path.dirname(d);
        if (parent === d) return null;
        d = parent;
    }
    return undefined;
}
export function getRepoRoot(full) {
    const dir = nearestExistingDir(full);
    if (!dir) return null;
    const plain = plainRepoRoot(dir);
    if (plain !== undefined) return plain;
    const r = git(dir, ['rev-parse', '--show-toplevel']);
    if (r.code !== 0 || r.out.length === 0) return null;
    return toFullPath(r.out[0]);
}

// The repository an edit counts against in the edit ledger and on the Stop card, or null when the
// edit is not a code change: a path outside the root (when a pointer names one), or in no git
// repository. Workaround: the first live Stop card (2026-10-08) named the session scratchpad as a
// repository, because a path with no repository was grouped under its own folder. A scratch file
// has no manifest to cross-check and no documents to update, so it must not raise the card.
export function getLedgerRepo(full, root) {
    if (!full) return null;
    if (root && !isUnder(full, root)) return null;
    return getRepoRoot(full);
}

// The repository's manifest files: DECISIONS.md at the root, then docs/DECISIONS.md, the two places
// the law permits (design-methodology.md, Phase 2). Both are returned when both exist. The name is
// matched without case, so a 'decisions.md' counts on a case-sensitive disk too. Rules 5 and 10
// read this list. Workaround (CR-2026-10-15-GAPS D2): both rules read only the root, so a docs/
// manifest got a false "no manifest" advise and its design gate line was never read.
export function findNamedFile(dir, name) {
    if (!isDir(dir)) return null;
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    const hit = names.filter((e) => e.name.toLowerCase() === name.toLowerCase())
        .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
        .find((e) => e.isFile() || (e.isSymbolicLink() && isFile(path.join(dir, e.name))));
    return hit ? path.join(dir, hit.name) : null;
}
export function getManifestPaths(repoRoot) {
    const out = [];
    if (!repoRoot) return out;
    for (const dir of [repoRoot, path.join(repoRoot, 'docs')]) {
        const hit = findNamedFile(dir, 'DECISIONS.md');
        if (hit) out.push(hit);
    }
    return out;
}

export function manifestRule(full, sourceExts, sessionId, owner, skipUnder) {
    if (!full) return;
    const ext = getExt(full);
    if (!sourceExts.includes(ext)) return;
    for (const s of skipUnder) if (s && isUnder(full, s)) return;
    const root = getRepoRoot(full);
    if (!root) return;
    if (getManifestPaths(root).length > 0) return;
    const key = 'manifest-' + sha1Hex(FOLD_CASE ? root.toLowerCase() : root).slice(0, 12);
    if (!firstTime(sessionId, key)) return;
    addAdvisory(`no DECISIONS.md in ${root}`,
        `DES-02 / GATE-04: a subsystem is not coded until its decisions are locked in DECISIONS.md, and this repository has none at its root or in docs/ (${root}). ` +
        `Interview ${owner}, write the manifest, then build; or, if this is a toy or a throwaway, say so and carry on. This notice appears once per repository per session.`);
}

// ============================================================================ (6) the read check
// anchor: file-size  mode: advise  verbs: split
// DES-03 (CR-2026-10-15-SPLIT): split by subject, never by size; there is no line count. The one
// real limit is a single Read, so a write that GROWS a source file past the brain's
// readCeilingBytes tells the agent, once per file per session and on the agent's channel only, to
// list the file's subjects from its top-level definitions and to split only if a subject falls out.
// A file whose first lines say it is generated, and readCeilingExempt globs, are skipped. Each
// firing is one INFO line in the hooks log.

// Before and after sizes of a Write or Edit, in UTF-8 bytes of LF-normalised text, or null when the
// result cannot be known. Line endings are normalised on both sides because the host's Edit matches
// an LF old_string against a CRLF file and writes CRLF back: matching the raw text missed every
// multi-line Edit of a CRLF file, so the check never fired there (CR-2026-10-15-SPLIT review).
const lf = (s) => (s == null ? '' : String(s).replace(/\r\n/g, '\n'));
export function readFileText(full) {
    const t = fs.readFileSync(full, 'utf8');
    return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}
export function getSizeChange(tool, ti, full) {
    const exists = isFile(full);
    const base = exists ? lf(readFileText(full)) : '';
    let text;
    if (tool === 'Write') text = lf(ti.content);
    else if (tool === 'Edit') {
        const old = lf(ti.old_string); const nw = lf(ti.new_string);
        if (!old) {
            if (base.length > 0) return null;   // an empty old_string on a non-empty file: the host refuses it
            text = nw;                           // an Edit that creates or fills a file
        } else {
            const all = has(ti, 'replace_all') ? Boolean(ti.replace_all) : false;
            const i = base.indexOf(old);
            if (i < 0) return null;              // the host will refuse an Edit that does not match
            text = all ? base.split(old).join(nw) : base.slice(0, i) + nw + base.slice(i + old.length);
        }
    } else return null;
    return { before: Buffer.byteLength(base, 'utf8'), after: Buffer.byteLength(text, 'utf8'), text };
}

// Glob match on the full path. Only * is a wildcard (** is the same), so a folder named with
// brackets matches literally and a malformed entry cannot throw; / and \ are equal. ${ROOT},
// ${BRAIN} and %USERPROFILE% are expanded by readBrainConfig. A glob that still fails is logged
// and skipped, never fatal: one bad entry once made every source write throw.
export function pathGlob(full, globs) {
    const p = full.replace(/\\/g, '/');
    for (const g of globs || []) {
        if (!g || !String(g).trim()) continue;
        try {
            const raw = String(g).replace(/\\/g, '/').replace(/\*\*/g, '*');
            const body = raw.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*');
            const rx = new RegExp('^(?:' + body + '|[\\s\\S]*/' + body + ')$', 'i');
            if (rx.test(p)) return true;
        } catch (e) { writeLog('ERROR', 'guard', `readCeilingExempt entry '${g}' skipped: ${e.message}`); }
    }
    return false;
}

// A generated file says so in its first lines: '@generated', or a line that carries both
// 'generated' and 'do not edit'. Prose that only mentions generation is not a marker.
const GENERATED_MARKER = /^.{0,12}(@generated\b|.*\bgenerated\b.*\bdo not edit\b|.*\bdo not edit\b.*\bgenerated\b)/im;

export function sizeRule(tool, ti, full, sourceExts, ceiling, exempt, sessionId) {
    // An ADVISE rule must never cost a deny-free call its ledger entry or the Stop card: any error
    // here is logged and the rule is skipped.
    try {
        if (!full || ceiling <= 0) return;
        const ext = getExt(full);
        if (!sourceExts.includes(ext)) return;
        if (pathGlob(full, exempt)) return;
        const size = getSizeChange(tool, ti, full);
        if (size == null) return;
        if (size.after <= ceiling) return;
        if (size.after <= size.before) return;   // a write that does not grow the file is not the moment
        const head = size.text.split('\n').slice(0, 5).join('\n');
        if (GENERATED_MARKER.test(head)) return;
        const key = 'readcheck-' + sha1Hex(FOLD_CASE ? full.toLowerCase() : full).slice(0, 12);
        if (!firstTime(sessionId, key)) return;
        const kb = Math.round(size.after / 1024);
        writeLog('INFO', 'guard', `DES-03 read check: ${full} grows to ${size.after} bytes (ceiling ${ceiling})`);
        addAdvisory(`read check: ${full} is past one Read`,
            `DES-03: this write grows ${full} to about ${kb} KB, past one Read (readCeilingBytes ${ceiling}). There is no size rule and this is not a request to split. ` +
            'Before you go on, list the file\'s subjects from a search of its top-level definitions (do not read it whole for this), and split a part out only if it is a subject of its own: independent and separately tunable. A split-off file names what it uses. This note appears once per file per session.', true);
    } catch (e) { writeLog('ERROR', 'guard', `rule 6 (read check) skipped for ${full}: ${e.message}`); }
}
