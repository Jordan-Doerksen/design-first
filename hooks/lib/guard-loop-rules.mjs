// guard-loop-rules.mjs - guard rules 11 and 12: the loop branch (AUTO-04, AUTO-11). Imported by
// guard.mjs after guard-rules.mjs. Never run directly.
//
// The harness loop works on a branch named with the loop prefix (config loopBranchPrefix, default
// "harness/"). That name is the one fact both rules read, and git holds it, not a marker file. At a
// detached HEAD, the branch that a stopped rebase or a running bisect goes back to counts as that
// name (rebase-merge/head-name, rebase-apply/head-name, BISECT_START; see onLoopBranch).
//
// Rule 11, loop-no-push (AUTO-11): nothing on the loop branch leaves the machine or lands on another
// branch by an agent's hand. The loop ends with a state card and the push command for the owner
// (AUTO-13, the runner's work, not this rule's). The git commands that move HEAD or a branch are an
// open-ended set: this rule reads the commands and forms listed under Covers, and a command or form
// that is not listed there is a residual, whatever it moves.
// Covers:
//  - On a loop branch: git push, merge and pull, whatever they name. git send-pack, the plumbing
//    under push, is read as a push here and below (check of the third review).
//  - From any branch (CR-2026-10-15-GAPS D1): a push, merge or pull that names a loop-prefixed ref;
//    push --all, --branches, --mirror or a glob refspec that covers a loop branch the repository holds.
//  - On a loop branch: a checkout or switch that leaves it (to another branch, a new branch without
//    the prefix, or a detached HEAD); a new loop-prefixed branch, a local loop-prefixed branch and a
//    checkout of files stay allowed. A target stays on the loop only when refs/heads holds it:
//    'harness/x~0', '^0' and '@{0}' detach HEAD and are refused. With --track and no new name, only
//    the name git makes counts: 'git checkout -t harness/x' makes the branch 'x' and is refused.
//    'git checkout -' stays only when the previous branch is still a local loop branch. A target of
//    HEAD or '@', or of the loop branch HEAD is on, stays.
//  - A rename, copy or forced move of a branch (git branch -m, -M, -c, -C, -f) and a ref written by
//    hand (git update-ref, a git symbolic-ref write or delete): on a loop branch whatever they name,
//    from any branch when they name a loop-prefixed ref (second review: 'git branch -M harness/x
//    main' took HEAD onto main with the loop's work, and the next push passed).
//  - On a loop branch: a git worktree add whose new worktree is not on a loop branch (a detached
//    worktree, another branch, a branch named after the folder): from that folder a push of the
//    loop's work passed (check of the second review).
//  - On a loop branch (third review): a git rebase that names a branch to check out that is not a
//    local loop branch (git rebase <upstream> <branch>, --onto <new> <upstream> <branch>, --root
//    <branch>); git bisect, except log, visualize, terms, help and a reset with no commit while no
//    bisect runs; a git fetch whose refspec writes a local branch, with '.' (this repository) as the
//    repository too, or whose refspecs come on standard input (--stdin). A rebase with no branch
//    argument, and a fetch into a remote-tracking ref, a tag or no destination, stay allowed.
//  - On a stopped rebase of a loop branch (check of the third review): the rules above, as on the
//    branch, and git rebase --quit, which leaves HEAD detached at the rebased loop commits;
//    --continue, --skip and --abort stay allowed. rebase --root, fetch --stdin and fetch --refmap
//    are read in any abbreviation git takes (--ro, --st, --refm).
//  - From any branch (third review): a git fetch whose destination is a loop-prefixed local branch,
//    or a glob that can cover one, or that writes a local branch from a loop ref or from a glob
//    source that can cover one ('refs/heads/*:refs/heads/copy/*').
// Workaround: the rule read only the branch that was checked out, so 'git checkout main'
// and then 'git push origin harness/x' or 'git merge harness/x' in a second call passed. The
// switch part also binds an interactive session that sits on a loop branch: the owner switches off
// it by hand.
// Cannot see:
//  - Any other git command or form that moves HEAD or a branch, for example on a loop branch git
//    stash branch <name>, a git clone of this repository at a commit (--revision), git rebase --exec
//    or an exec line in an interactive rebase (a command string git runs in a shell), and a long
//    option written as an abbreviation git accepts (--det for --detach), except the three named
//    under Covers; and the shell residual (nested shells, scripts on disk, git aliases).
//  - A loop commit named by a sha, a tag, FETCH_HEAD, @{u} or @{-1}; a detached HEAD at a loop
//    commit that is no loop branch here and no stopped rebase or running bisect of one.
//  - Off a loop branch: a checkout, switch, rebase or bisect that puts HEAD at a loop commit (git
//    checkout --detach harness/x, git checkout harness/x~0, git bisect start harness/x main); a
//    cherry-pick, rebase or reset that brings loop commits onto another branch, also from another
//    worktree; a move that names the loop's work only by a sha or on standard input (git branch -f
//    main <sha>, git update-ref --stdin, git fetch --stdin); a new branch, tag or worktree made at a
//    loop ref under another name (git branch <name> harness/x, git checkout -b <name> harness/x, git
//    switch -c, git tag, git worktree add -b or --detach).
//  - On a loop branch: a plain 'git branch <name>' or 'git tag <name>', and a fetch into a tag or a
//    remote-tracking ref, each of which makes a name at the loop's work and moves no branch (a
//    switch to it and a push of it here are refused, but a push of it from another worktree that
//    already exists and is not on a loop branch passes).
//  - A push whose refspec is ':' or comes from config (push.default matching, a remote.<name>.push
//    entry), and a fetch whose refspec comes from config (a remote.<name>.fetch entry).
//
// Rule 12, ledger (AUTO-04): on a loop branch, an Edit, Write or NotebookEdit to the story ledger
// (config loopLedgerGlobs, default docs/specs/*.tasks.json and specs/*.tasks.json) is refused. The
// harness writes the pass mark from the Reviewer's verdict with its own process, never through a
// tool call; a Builder or Reviewer that reaches for the ledger is making its own target easier.
// Cannot see: a Bash or PowerShell write to the ledger (a redirect, Set-Content, Copy-Item, a
// script); guard.mjs never calls this rule for a shell command, and the case
// 'RESIDUAL ledger' in tools/tests/guard-cases.json asserts it is not denied. For that case the
// harness's hash compare and restore is the only check (instructions/autonomy-law.md, AUTO-04).
//
// anchor: loop-no-push  mode: deny  verbs: push
// anchor: ledger  mode: deny  verbs: write-passes

import { newDeny, toFullPath, nearestExistingDir, git, gitFirst, isFile, exists, getLeaf, readText, iin, ieq } from './common.mjs';
import { getRepoRoot, like } from './guard-rules.mjs';

const DEFAULT_PREFIX = 'harness/';
const DEFAULT_LEDGER_GLOBS = ['docs/specs/*.tasks.json', 'specs/*.tasks.json'];
const istarts = (s, p) => s.toLowerCase().startsWith(p.toLowerCase());
// Membership in an option list: a long option folds case, a short one does not. Workaround: the lists
// were read with a fold, so '-S' (no value) took the value slot of '-s' and '-f' that of '-F', and the
// next word, a branch name, was skipped as a value: a refusal turned into a pass.
const optIn = (t, list) => (/^-[^-]/.test(t) ? list.includes(t) : iin(t, list));

function currentBranch(dir) {
    const d = nearestExistingDir(dir);
    if (!d) return null;
    const r = git(d, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (r.code !== 0 || r.out.length === 0) return null;
    return r.out[0].trim();
}

// The branch a stopped rebase or a running bisect goes back to, read from the git folder:
// rebase-merge/head-name or rebase-apply/head-name ('refs/heads/<name>'), or BISECT_START (the short
// name, or a sha when the bisect started at a detached HEAD). null when none of them is there.
function stoppedBranch(dir) {
    const d = nearestExistingDir(dir);
    if (!d) return null;
    const r = git(d, ['rev-parse', '--git-path', 'rebase-merge/head-name', '--git-path', 'rebase-apply/head-name', '--git-path', 'BISECT_START']);
    if (r.code !== 0) return null;
    for (const p of r.out) {
        const f = toFullPath(p, d);
        if (!f || !isFile(f)) continue;
        let first = '';
        try { first = readText(f).split(/\r?\n/)[0] || ''; } catch { first = ''; }
        const name = first.trim().replace(/^refs\/heads\//, '');
        if (name) return name;
    }
    return null;
}

// The loop branch the repository is on, or null. A detached HEAD counts as on a loop branch while a
// rebase or a bisect that started on that loop branch is stopped or running: HEAD then sits at the
// loop's work with no branch name. Workaround (check of the third review of CR-2026-10-15-GAPS): a
// plain 'git rebase main' on a loop branch, which stays allowed, stops at a detached HEAD on a
// conflict or an 'edit' line; the rule read no branch there, and 'git push origin HEAD:main',
// 'git checkout main' and 'git branch -f main HEAD' passed with the rebased loop commits.
export function onLoopBranch(dir, prefix) {
    if (!prefix || !prefix.trim()) prefix = DEFAULT_PREFIX;
    let b = currentBranch(dir);
    if (!b) return null;
    if (b === 'HEAD') { b = stoppedBranch(dir); if (!b) return null; }
    return istarts(b, prefix) ? b : null;
}

function loopPrefixed(name, prefix) { return Boolean(name) && istarts(name, prefix); }

// A checkout or switch target keeps HEAD on a loop branch only when it is the short name of a local
// branch that has the loop prefix. Workaround (CR-2026-10-15-GAPS review): the test was a prefix
// match on the whole revision, so 'git checkout harness/x~0' (also '^0' and '@{0}') detached HEAD
// and passed, and from the detached HEAD 'git push origin HEAD:main' passed too. A revision suffix
// (~ ^ @ :) or a name with no branch under refs/heads (a tag, a remote ref) leaves the branch.
function loopLocalBranch(dir, name, prefix) {
    if (!loopPrefixed(name, prefix)) return false;
    if (/[~^@:]/.test(name)) return false;
    const d = nearestExistingDir(dir);
    if (!d) return false;
    return git(d, ['show-ref', '--verify', '--quiet', 'refs/heads/' + name]).code === 0;
}

// The branch names a typed ref can stand for: a leading '+' and each side of 'src:dst' are read,
// 'refs/heads/' or 'heads/' is stripped, 'refs/remotes/<r>/' or 'remotes/<r>/' is stripped, and
// '<r>/' is stripped when <r> is one of the repository's remotes. The typed form is kept as well,
// so a remote that happens to share the prefix's first word cannot hide a loop ref.
function refNames(token, remotes) {
    const names = [];
    for (const side of token.replace(/^\++/, '').split(':')) {
        if (!side) continue;
        names.push(side);
        let m;
        if ((m = /^(refs\/)?heads\/(.+)$/i.exec(side))) names.push(m[2]);
        else if ((m = /^(refs\/)?remotes\/[^/]+\/(.+)$/i.exec(side))) names.push(m[2]);
        else if ((m = /^([^/]+)\/(.+)$/i.exec(side)) && (remotes || []).includes(m[1])) names.push(m[2]);
    }
    return names;
}

// Options of push, merge and pull that take the next token as their value, so a value such as a
// merge message is never read as a ref.
const LOOP_VALUED = ['-o', '--push-option', '--server-option', '--receive-pack', '--exec', '--repo', '--upload-pack',
    '-m', '--message', '-F', '--file', '-s', '--strategy', '-X', '--strategy-option', '--into-name', '--cleanup',
    '--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '--negotiation-tip', '--refmap'];

function loopDeny(what, title, owner) {
    const reason = `BLOCKED - ${what}. AUTO-11: the loop works on its own branch and never pushes and never merges; ` +
        `it ends with a state card in HANDOFF.md and the exact push command (AUTO-13), and ${owner} runs that command after reading the branch. ` +
        'A merge into or out of a loop branch is a push in another direction and is refused for the same reason, from any branch. ' +
        `If this session is not a loop and the command is wanted, ${owner} runs it by hand.`;
    return newDeny('guard', title, reason);
}

function getRemotes(dir) {
    const d = nearestExistingDir(dir);
    if (!d) return [];
    const rr = git(d, ['remote']);
    if (rr.code !== 0) return [];
    return rr.out.map((s) => s.trim()).filter((s) => s);
}

// push (and send-pack), merge, pull: refused on a loop branch. From any branch, refused when they
// name a loop ref, or push every branch (--all, --branches, --mirror, a glob refspec) while a loop
// branch exists. For push, pull and send-pack the first positional is the repository.
function loopTransferRule(call, prefix, owner) {
    const branch = onLoopBranch(call.cwd, prefix);
    if (branch) return loopDeny(`git ${call.sub} on the loop branch ${branch}`, `loop branch: git ${call.sub} refused`, owner);
    const a = call.args;
    // Positional arguments, values of options skipped. For push and pull the first one is the
    // repository, not a ref.
    let pos = [];
    for (let i = 0; i < a.length; i++) {
        const t = String(a[i]);
        if (t === '--') continue;
        if (optIn(t, LOOP_VALUED)) { i++; continue; }
        if (t.startsWith('-')) continue;
        pos.push(t);
    }
    if (['push', 'pull', 'send-pack'].includes(call.sub) && pos.length > 0) pos = pos.slice(1);
    if (call.sub === 'push' || call.sub === 'send-pack') {
        const every = a.find((t) => iin(t, ['--all', '--branches', '--mirror']));
        const globs = pos.filter((t) => t.includes('*'));
        const d = nearestExistingDir(call.cwd);
        if ((every || globs.length > 0) && d) {
            const refs = git(d, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
            if (refs.code === 0) {
                for (const lb of refs.out.map((s) => s.trim()).filter((s) => loopPrefixed(s, prefix))) {
                    if (every) return loopDeny(`git ${call.sub} ${every} would push the loop branch ${lb} with the rest`, `loop branch: git ${call.sub} ${every} refused`, owner);
                    for (const g of globs) {
                        const src = g.replace(/^\++/, '').split(':')[0].replace(/^(refs\/)?heads\//i, '');
                        if (src && like(lb, src)) return loopDeny(`the refspec ${g} would push the loop branch ${lb}`, 'loop branch: git push of a glob refspec refused', owner);
                    }
                }
            }
        }
    }
    if (pos.length === 0) return null;
    const remotes = pos.some((t) => t.includes('/')) ? getRemotes(call.cwd) : [];
    for (const t of pos) {
        for (const n of refNames(t, remotes)) {
            if (loopPrefixed(n, prefix)) return loopDeny(`git ${call.sub} names the loop ref ${t}`, `loop branch: git ${call.sub} of ${t} refused`, owner);
        }
    }
    return null;
}

// checkout, switch: on a loop branch, a call that leaves it is refused. A checkout of files (paths
// after a '--', a path that is not a ref, or a tree-ish followed by paths) is rule 7's business.
function loopSwitchRule(call, prefix, owner) {
    const branch = onLoopBranch(call.cwd, prefix);
    if (!branch) return null;
    let a = call.args.map(String);
    // Workaround (D1 check): any '--' used to end the rule, but 'git checkout main --' and
    // 'git checkout -b feature --' switch branches (the '--' only says the word before it is a
    // branch), and git switch takes no paths, so 'git switch -- main' switches too. Only a checkout
    // with paths after its '--' is a checkout of files.
    let after = [];
    const dd = a.indexOf('--');
    if (dd >= 0) {
        after = a.slice(dd + 1);
        if (call.sub === 'checkout' && after.length > 0) return null;
        a = a.slice(0, dd);
    }
    const createOpts = call.sub === 'switch' ? ['-c', '-C', '--create', '--force-create', '--orphan'] : ['-b', '-B', '--orphan'];
    // The short letters that take a new branch name, case-sensitive, and the flag letters that may
    // come before one in a group ('-qb name'). Workaround (D1 check): git also reads the name stuck
    // to the letter ('-bfeature', '-cfeature'); that form was skipped as an option and left the
    // loop branch unseen.
    const createLetters = call.sub === 'switch' ? ['c', 'C'] : ['b', 'B'];
    const flagLetters = ['q', 'f', 'm', 'l', 'p', 't', 'd'];
    let nw = null; let detach = false; let track = false; const pos = [];
    for (let i = 0; i < a.length; i++) {
        const t = a[i];
        if (optIn(t, createOpts)) { if (i + 1 < a.length) nw = a[i + 1]; i++; continue; }
        let m;
        if ((m = /^(--create|--force-create|--orphan)=(.+)$/i.exec(t))) { nw = m[2]; continue; }
        if (ieq(t, '--detach') || (call.sub === 'switch' && t === '-d')) { detach = true; continue; }
        if (iin(t, ['-t', '--track']) || /^--track=/i.test(t)) { track = true; continue; }
        if (t.length > 2 && t[0] === '-' && t[1] !== '-') {
            // A short-option group: flags, then at most one create letter with its name stuck to it
            // or in the next token.
            for (let q = 1; q < t.length; q++) {
                const ch = t[q];
                if (createLetters.includes(ch)) {
                    const rest = t.slice(q + 1);
                    if (rest) nw = rest; else if (i + 1 < a.length) { nw = a[i + 1]; i++; }
                    break;
                }
                if (!flagLetters.includes(ch)) break;
                if (ch === 't') track = true;
                if (ch === 'd' && call.sub === 'switch') detach = true;
            }
            continue;
        }
        if (t.startsWith('-') && t !== '-') continue;
        pos.push(t);
    }
    if (call.sub === 'switch') pos.push(...after);
    let leave = null;
    if (nw) {
        if (!loopPrefixed(nw, prefix)) leave = `git ${call.sub} makes the branch ${nw} from the loop branch ${branch}, under a name this rule does not watch`;
    } else if (detach) {
        leave = `git ${call.sub} --detach leaves the loop branch ${branch} for a detached HEAD`;
    } else if (pos.length === 1) {
        const target = pos[0];
        if (!track && (target === 'HEAD' || target === '@' || target === branch)) {
            // HEAD (or '@', git's short name for it), or the loop branch HEAD is on, keeps HEAD where
            // it is: git special-cases HEAD and does not detach it. Workaround (CR-2026-10-15-GAPS
            // second review): 'HEAD' is not a loop-prefixed name, so 'git checkout HEAD', a no-op, was
            // refused as a switch off the loop. 'HEAD~0' and any other revision still detach and are
            // refused below.
        } else if (target === '-') {
            const prev = git(call.cwd, ['rev-parse', '--abbrev-ref', '@{-1}']);
            const name = prev.code === 0 && prev.out.length ? prev.out[0].trim() : '';
            // The previous branch stays on the loop only as a local loop branch, as any other target.
            // Workaround (CR-2026-10-15-GAPS hooks check): a prefix test passed 'git checkout -' when
            // that branch was gone and a loop-prefixed tag of its name stood in its place; git then
            // checks out the tag and detaches HEAD.
            if (!loopLocalBranch(call.cwd, name, prefix)) leave = `git ${call.sub} - leaves the loop branch ${branch} for the previous branch ${name || '(unknown)'}`;
        } else {
            if (call.sub === 'checkout' && git(call.cwd, ['rev-parse', '--verify', '--quiet', target + '^{commit}']).code !== 0) {
                const f = toFullPath(target, call.cwd);
                if (f && exists(f)) return null;   // a path that is not a ref: a checkout of files
            }
            // Only the short name of a local loop-prefixed branch keeps HEAD on a loop branch. A full
            // refname, a remote-tracking ref, a tag, a sha and a revision such as harness/x~0 detach
            // HEAD; a loop-prefixed name with no local branch is refused too.
            // With --track and no new name, git makes a new branch and names it itself: it drops a
            // leading 'refs/', then 'remotes/', then everything up to the first '/'. Only that name
            // counts. Workaround (CR-2026-10-15-GAPS hooks check): the local-branch test ran first
            // and the typed form was read as a name, so 'git checkout -t harness/x' passed, and git
            // made the branch 'x' at the loop commit, off the loop, with no remote needed.
            let made = null; let stays;
            if (track) {
                made = target.replace(/^refs\//, '').replace(/^remotes\//, '');
                const cut = made.indexOf('/');
                made = cut >= 0 ? made.slice(cut + 1) : '';
                stays = Boolean(made && !/[~^@:]/.test(target) && loopPrefixed(made, prefix));
            } else stays = loopLocalBranch(call.cwd, target, prefix);
            if (!stays) {
                leave = track && made ? `git ${call.sub} --track ${target} makes the branch ${made} and leaves the loop branch ${branch}` : `git ${call.sub} ${target} leaves the loop branch ${branch}`;
            }
        }
    }
    if (!leave) return null;
    const reason = `BLOCKED - ${leave}. AUTO-11: the loop stays on its own branch until ${owner} has read it. A switch off the loop branch is how a push ` +
        'or a merge of the loop\'s work gets past this rule, so it is refused while the repository is on a loop branch. A new branch ' +
        `that starts with the loop prefix, and a checkout of files, are allowed. If this session is not a loop, ${owner} switches by hand.`;
    return newDeny('guard', `loop branch: git ${call.sub} off the loop branch refused`, reason);
}

// branch -m/-M/-c/-C/-f, update-ref, symbolic-ref: each one renames, copies or moves a branch, or
// writes a ref by hand, with no checkout and no push for the rest of this rule to see. On a loop
// branch they are refused whatever they name; from any branch, when they name a loop-prefixed ref.
// Workaround (CR-2026-10-15-GAPS second review): 'git branch -M harness/x main' renamed the loop
// branch, HEAD went with it onto main, and 'git push origin main' passed in the next call; from main,
// 'git branch -f main harness/x' moved main to the loop's work. symbolic-ref is the same move:
// 'git symbolic-ref HEAD refs/heads/main' takes HEAD off the loop branch with no checkout.
// Long options of git branch that take the next token as their value (-u is read in its group).
const BRANCH_VALUED = ['--set-upstream-to', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort'];
function loopRefMoveRule(call, prefix, owner) {
    const a = call.args.map(String);
    let what = null; const pos = [];
    if (call.sub === 'branch') {
        // The operation: -m/-M/--move, -c/-C/--copy, -f/--force; a delete (-d, -D, --delete)
        // moves nothing, also with --force. Short letters may be grouped ('-fm'); -u takes a value.
        let op = null; let del = false;
        for (let i = 0; i < a.length; i++) {
            const t = a[i];
            if (t === '--') { pos.push(...a.slice(i + 1)); break; }
            if (iin(t, BRANCH_VALUED)) { i++; continue; }
            if (ieq(t, '--move')) { op = t; continue; }
            if (ieq(t, '--copy')) { op = t; continue; }
            if (ieq(t, '--force')) { if (!op) op = t; continue; }
            if (ieq(t, '--delete')) { del = true; continue; }
            if (t.startsWith('--')) continue;
            if (t.length >= 2 && t[0] === '-') {
                for (let q = 1; q < t.length; q++) {
                    const ch = t[q];
                    if (['m', 'M', 'c', 'C'].includes(ch)) op = '-' + ch;
                    else if (ch === 'f') { if (!op) op = '-f'; }
                    else if (ch === 'd' || ch === 'D') del = true;
                    else if (ch === 'u') { if (q === t.length - 1) i++; break; }   // -u <upstream> or -u<upstream>
                }
                continue;
            }
            pos.push(t);
        }
        if (op && !del) what = `git branch ${op}`;
    } else if (call.sub === 'update-ref') {
        // Every form writes or deletes a ref. The refs of --stdin come on standard input, which
        // this rule does not read: off a loop branch that form passes (the residual above).
        for (let i = 0; i < a.length; i++) {
            const t = a[i];
            if (ieq(t, '-m')) { i++; continue; }
            if (t.startsWith('-')) continue;
            pos.push(t);
        }
        what = 'git update-ref';
    } else if (call.sub === 'symbolic-ref') {
        // A read ('git symbolic-ref HEAD', '--short HEAD') passes; a write (a name and a target)
        // or a delete (-d, --delete) is the move.
        let del = false;
        for (let i = 0; i < a.length; i++) {
            const t = a[i];
            if (ieq(t, '-m')) { i++; continue; }
            if (iin(t, ['-d', '--delete'])) { del = true; continue; }
            if (t.startsWith('-')) continue;
            pos.push(t);
        }
        if (del || pos.length >= 2) what = 'git symbolic-ref' + (del ? ' --delete' : '');
    }
    if (!what) return null;
    let leave = null;
    const branch = onLoopBranch(call.cwd, prefix);
    if (branch) leave = `${what} on the loop branch ${branch} renames, copies or moves a branch, or writes a ref, with no checkout`;
    else {
        const remotes = pos.some((t) => t.includes('/')) ? getRemotes(call.cwd) : [];
        for (const t of pos) {
            if (refNames(t, remotes).some((n) => loopPrefixed(n, prefix))) { leave = `${what} names the loop ref ${t}`; break; }
        }
    }
    if (!leave) return null;
    const reason = `BLOCKED - ${leave}. AUTO-11: the loop's work stays on its own branch until ${owner} has read it. A branch rename, copy or forced ` +
        'move, or a ref written by hand, carries that work under a name this rule does not watch, and a push of that name then passes; ' +
        `so it is refused on a loop branch, and from any branch when it names a loop branch. If this session is not a loop, ${owner} runs it by hand.`;
    return newDeny('guard', `loop branch: ${what} refused`, reason);
}

// worktree add: on a loop branch, a new worktree is a checkout in another folder, and a worktree off
// the loop is where a push of the loop's work then passes, because that folder is on no loop branch.
// So it is refused unless the new worktree is on a loop branch: a new branch with the loop prefix
// (-b, -B), or a local loop branch named as its start. A detached worktree (--detach, HEAD, a sha, a
// tag), another branch, and the branch git names after the folder when no start is given are refused.
// Workaround (CR-2026-10-15-GAPS check of the second review): 'git worktree add --detach ../wt HEAD'
// and then 'git -C ../wt push origin HEAD:main' passed, two commands off the loop, the same shape as
// the rename the second review closed. Off a loop branch this part does not fire (the residual above).
function loopWorktreeRule(call, prefix, owner) {
    const a = call.args.map(String);
    if (a.length === 0 || !ieq(a[0], 'add')) return null;
    const branch = onLoopBranch(call.cwd, prefix);
    if (!branch) return null;
    let nw = null; let detach = false; const pos = [];
    for (let i = 1; i < a.length; i++) {
        const t = a[i];
        if (t === '--') { pos.push(...a.slice(i + 1)); break; }
        if (ieq(t, '--reason')) { i++; continue; }                  // --lock --reason <string>
        if (ieq(t, '--detach')) { detach = true; continue; }
        if (t.startsWith('--')) continue;
        if (t.length >= 2 && t[0] === '-') {
            // A short-option group: flags (-f, -q, -d), then at most one -b or -B with its name stuck
            // to it or in the next token.
            for (let q = 1; q < t.length; q++) {
                const ch = t[q];
                if (ch === 'b' || ch === 'B') {
                    const rest = t.slice(q + 1);
                    if (rest) nw = rest; else if (i + 1 < a.length) { nw = a[i + 1]; i++; }
                    break;
                }
                if (ch === 'd') detach = true;
            }
            continue;
        }
        pos.push(t);
    }
    if (pos.length === 0) return null;                        // no path: git refuses it
    let leave = null;
    if (nw) {
        if (!loopPrefixed(nw, prefix)) leave = `git worktree add makes the branch ${nw} from the loop branch ${branch}, in another folder, under a name this rule does not watch`;
    } else if (detach) {
        leave = `git worktree add --detach checks out the loop branch ${branch}'s work in another folder at a detached HEAD`;
    } else if (pos.length >= 2) {
        if (!loopLocalBranch(call.cwd, pos[1], prefix)) leave = `git worktree add ${pos[1]} checks out something other than a local loop branch in another folder`;
    } else {
        // No start: git names the branch after the folder and makes it at HEAD when it does not exist.
        const leaf = getLeaf(pos[0]);
        if (!loopPrefixed(leaf, prefix)) leave = `git worktree add ${pos[0]} makes or checks out the branch ${leaf}, in another folder, off the loop branch ${branch}`;
    }
    if (!leave) return null;
    const reason = `BLOCKED - ${leave}. AUTO-11: the loop stays on its own branch until ${owner} has read it. A worktree off the loop branch is a switch ` +
        "made in another folder, and a push of the loop's work from there passes, so it is refused while the repository is on a loop " +
        'branch. A worktree on a new branch that starts with the loop prefix, or on a local loop branch, is allowed. If this session is ' +
        `not a loop, ${owner} adds the worktree by hand.`;
    return newDeny('guard', 'loop branch: git worktree add off the loop branch refused', reason);
}

// A long option as git reads it: its full name, or an abbreviation of at least `min` letters, since
// git takes any unique prefix of a long option. `min` is the shortest prefix that names only this
// option in git 2.56 (git rebase -h, git fetch -h); a shorter one is ambiguous, and git then refuses
// the command itself. Used only where a missed option turns a refusal into a pass: rebase --root,
// fetch --stdin and fetch --refmap. Workaround (check of the third review of CR-2026-10-15-GAPS):
// 'git rebase --ro main' checked out main, and 'echo HEAD:main | git fetch --st .' moved main onto
// the loop's work, because the rule matched the full names only.
function longOpt(t, name, min) {
    const w = t.split('=')[0];
    if (!w.startsWith('--') || w.length < 2 + min) return false;
    return name.startsWith(w.slice(2));
}

// The refusal for a command that takes HEAD off the loop branch with no checkout or switch of its own
// name (rebase with a branch, bisect).
function loopLeaveDeny(leave, title, owner) {
    const reason = `BLOCKED - ${leave}. AUTO-11: the loop stays on its own branch until ${owner} has read it. A command that takes HEAD off the loop ` +
        "branch is how a push or a merge of the loop's work gets past this rule (from a detached HEAD, 'git push origin HEAD:main' " +
        `names no loop branch), so it is refused while the repository is on a loop branch. If this session is not a loop, ${owner} runs it by hand.`;
    return newDeny('guard', title, reason);
}

// rebase: with a branch argument, git checks that branch out first and rebases it. On a loop branch,
// a rebase whose branch is not a local loop branch is refused; 'HEAD' and a sha are no branch to git,
// which then rebases at a detached HEAD. A rebase with no branch argument rebases the loop branch
// itself and stays allowed, whatever its upstream or --onto. Workaround (CR-2026-10-15-GAPS third
// review): 'git rebase HEAD main' put HEAD on main with the loop's work, and 'git push origin main'
// then passed. Every positional after the upstream is checked (all of them with --root), so a valued
// option this parser does not know shifts the words to a refusal, never to a pass. --root is read in
// any abbreviation git takes (--ro, --roo). On a stopped rebase of a loop branch (onLoopBranch),
// --quit is refused: it ends the rebase and leaves HEAD detached at the rebased loop commits, where
// the rule then reads no loop branch; --continue, --skip and --abort go on or go back to the branch.
// Options of git rebase that take the next token as their value.
const REBASE_VALUED = ['--onto', '-x', '--exec', '-s', '--strategy', '-X', '--strategy-option', '-C', '--whitespace', '--empty', '--trailer'];
function loopRebaseRule(call, prefix, owner) {
    const branch = onLoopBranch(call.cwd, prefix);
    if (!branch) return null;
    const a = call.args.map(String);
    if (a.some((t) => ieq(t, '--quit'))) {
        return loopLeaveDeny(`git rebase --quit ends the rebase of the loop branch ${branch} and leaves HEAD detached at its work`, 'loop branch: git rebase --quit refused', owner);
    }
    let root = false; const pos = [];
    for (let i = 0; i < a.length; i++) {
        const t = a[i];
        if (t === '--') { pos.push(...a.slice(i + 1)); break; }
        if (optIn(t, REBASE_VALUED)) { i++; continue; }
        if (longOpt(t, 'root', 2)) { root = true; continue; }
        if (t.startsWith('--')) continue;
        if (t.length >= 2 && t[0] === '-') {
            // A short-option group: flags, then at most one valued letter. s, X, x and C take the rest
            // of the token or the next one; S and r take only a value stuck to them.
            for (let q = 1; q < t.length; q++) {
                const ch = t[q];
                if (['s', 'X', 'x', 'C'].includes(ch)) { if (q === t.length - 1) i++; break; }
                if (ch === 'S' || ch === 'r') break;
            }
            continue;
        }
        pos.push(t);
    }
    const named = root ? pos : pos.length > 1 ? pos.slice(1) : [];
    for (const n of named) {
        if (!loopLocalBranch(call.cwd, n, prefix)) {
            return loopLeaveDeny(`git rebase checks out ${n} first and leaves the loop branch ${branch}`, 'loop branch: git rebase of another branch refused', owner);
        }
    }
    return null;
}

// bisect: every subcommand that can check out a commit detaches HEAD. On a loop branch only the ones
// that move nothing pass: log, visualize (view), terms and help, and a reset with no commit while no
// bisect is running. Start, good, bad, new, old, skip, run, replay, a custom term and a reset that
// names a commit or ends a running bisect are refused. Workaround (CR-2026-10-15-GAPS third review):
// 'git bisect start HEAD main' detached HEAD at a loop commit, and 'git push origin HEAD:main' passed.
function loopBisectRule(call, prefix, owner) {
    const branch = onLoopBranch(call.cwd, prefix);
    if (!branch) return null;
    const a = call.args.map(String);
    if (a.length === 0) return null;                               // prints the usage
    const verb = a[0];
    if (iin(verb, ['log', 'visualize', 'view', 'terms', 'help', '-h', '--help'])) return null;
    if (ieq(verb, 'reset') && a.slice(1).filter((t) => !t.startsWith('-')).length === 0) {
        const d = nearestExistingDir(call.cwd);
        const gp = git(d, ['rev-parse', '--git-path', 'BISECT_START']);
        const f = gp.code === 0 && gp.out.length ? toFullPath(gp.out[0], d) : null;
        if (f && !exists(f)) return null;  // no bisect running: nothing to move
    }
    return loopLeaveDeny(`git bisect ${verb} on the loop branch ${branch} can move HEAD off it (to a commit at a detached HEAD, or to the branch a running bisect started on)`, `loop branch: git bisect ${verb} refused`, owner);
}

// fetch: a refspec with a destination writes that ref with no checkout, the same move as git branch -f.
// The rule reads a destination as git's get_local_ref does: 'refs/...' as it is; 'heads/x', 'tags/x'
// and 'remotes/x' under 'refs/'; any other name under 'refs/heads/', so 'main' is the local branch main.
// On a loop branch, a fetch whose destination is a local branch is refused, whatever the repository
// ('.' is this one). From any branch, a fetch whose destination is a loop-prefixed local branch (or a
// glob that can cover one), or that writes a local branch from a loop ref, is refused. A fetch into a
// remote-tracking ref or a tag, and a fetch with no destination, pass. Workaround (CR-2026-10-15-GAPS
// third review): 'git fetch . HEAD:main' moved main onto the loop's work, HEAD stayed on the loop
// branch, and a push of main from anywhere that is not on a loop branch then passed.
// Options of git fetch that take the next token as their value (--refmap is read separately).
const FETCH_VALUED = ['-o', '--server-option', '--upload-pack', '--depth', '--deepen', '--shallow-since', '--shallow-exclude',
    '-j', '--jobs', '--negotiation-tip', '--filter', '--submodule-prefix', '--recurse-submodules-default'];
// A glob source refspec can cover a loop branch when its literal part (before the '*') is a start of
// 'refs/heads/', 'heads/', 'refs/remotes/' or 'remotes/' (it covers every branch), or, with that
// prefix or a remote's name stripped, starts with the loop prefix or is a start of it ('h*',
// 'refs/heads/*'). Workaround (check of the third review of CR-2026-10-15-GAPS): from main,
// 'git fetch . "refs/heads/*:refs/heads/copy/*"' made copy/harness/x at the loop's work, and
// 'git push origin copy/harness/x:main' then passed; only a source that named the loop ref was read.
function globCoversLoop(src, prefix, remotes) {
    if (!src || !src.includes('*')) return false;
    const lit = src.split('*')[0];
    for (const w of ['refs/heads/', 'heads/', 'refs/remotes/', 'remotes/']) if (w.startsWith(lit)) return true;
    const cands = [lit];
    let m;
    if ((m = /^(refs\/)?heads\/(.*)$/.exec(lit))) cands.push(m[2]);
    else if (/^(refs\/)?remotes\/[^/]*$/.test(lit)) return true;      // part of a remote's name: every remote branch
    else if ((m = /^(refs\/)?remotes\/[^/]+\/(.*)$/.exec(lit))) cands.push(m[2]);
    else if ((m = /^([^/]+)\/(.*)$/.exec(lit)) && (remotes || []).includes(m[1])) cands.push(m[2]);
    for (const c of cands) {
        if (istarts(c, prefix) || istarts(prefix, c)) return true;
    }
    return false;
}
function fetchLocalBranch(dst) {
    if (!dst) return null;
    let m;
    if ((m = /^refs\/heads\/(.+)$/.exec(dst))) return m[1];
    if (/^refs\//.test(dst)) return null;
    if ((m = /^heads\/(.+)$/.exec(dst))) return m[1];
    if (/^(tags|remotes)\//.test(dst)) return null;
    return dst;
}
function loopFetchRule(call, prefix, owner) {
    const a = call.args.map(String);
    const pos = []; const maps = []; let multiple = false; let stdin = false;
    for (let i = 0; i < a.length; i++) {
        const t = a[i];
        if (t === '--') { pos.push(...a.slice(i + 1)); break; }
        // --refmap and --stdin in any abbreviation git takes (--refm, --st): see longOpt.
        if (longOpt(t, 'refmap', 4)) {
            if (t.includes('=')) maps.push(t.slice(t.indexOf('=') + 1)); else if (i + 1 < a.length) { maps.push(a[i + 1]); i++; }
            continue;
        }
        if (optIn(t, FETCH_VALUED)) { i++; continue; }
        if (ieq(t, '--multiple')) { multiple = true; continue; }
        if (longOpt(t, 'stdin', 2)) { stdin = true; continue; }
        if (t.startsWith('--')) continue;
        if (t.length >= 2 && t[0] === '-') {
            // A short-option group: flags (m is --multiple), then at most one j or o with its value.
            for (let q = 1; q < t.length; q++) {
                const ch = t[q];
                if (ch === 'j' || ch === 'o') { if (q === t.length - 1) i++; break; }
                if (ch === 'm') multiple = true;
            }
            continue;
        }
        pos.push(t);
    }
    // The first positional is the repository; with --multiple every positional is one.
    const specs = [];
    if (!multiple && pos.length > 1) specs.push(...pos.slice(1));
    specs.push(...maps);
    if (!stdin && !specs.some((s) => s.includes(':'))) return null;   // no destination: no git call
    const branch = onLoopBranch(call.cwd, prefix);
    let leave = null;
    if (branch && stdin) leave = `git fetch --stdin on the loop branch ${branch} reads refspecs from standard input, which this rule does not see`;
    let remotes = null;
    for (const rs of specs) {
        if (leave) break;
        const s = rs.replace(/^\++/, '');
        if (s.startsWith('^')) continue;                            // a negative refspec writes nothing
        const cut = s.indexOf(':');
        if (cut < 0) continue;                                     // no destination: FETCH_HEAD only
        const src = s.slice(0, cut);
        const local = fetchLocalBranch(s.slice(cut + 1));
        if (!local) continue;
        if (branch) { leave = `git fetch ${rs} writes the local branch ${local} on the loop branch ${branch}, with no checkout`; break; }
        const lit = local.split('*')[0];
        const covers = local.includes('*') && (istarts(lit, prefix) || istarts(prefix, lit));
        if (loopPrefixed(local, prefix) || covers) { leave = `git fetch ${rs} writes the loop branch ${local}`; break; }
        if (src.includes('/') && remotes == null) remotes = getRemotes(call.cwd);
        if (refNames(src, remotes || []).some((n) => loopPrefixed(n, prefix))) { leave = `git fetch ${rs} writes the local branch ${local} from the loop ref ${src}`; break; }
        if (globCoversLoop(src, prefix, remotes || [])) { leave = `git fetch ${rs} writes local branches from the glob ${src}, which can cover a loop branch`; break; }
    }
    if (!leave) return null;
    const reason = `BLOCKED - ${leave}. AUTO-11: the loop's work stays on its own branch until ${owner} has read it. A fetch into a local branch moves ` +
        "that branch with no checkout, so on a loop branch it carries the loop's work under a name this rule does not watch, and a push " +
        'of that name then passes; from any branch, a fetch that writes a loop branch, or writes a local branch from a loop ref, is ' +
        'refused for the same reason. A fetch into a remote-tracking ref (refs/remotes/...) and a fetch with no destination are allowed. ' +
        `If this session is not a loop, ${owner} runs it by hand.`;
    return newDeny('guard', 'loop branch: git fetch into a local branch refused', reason);
}

export function loopPushRule(call, prefix, owner) {
    if (call == null) return null;
    if (!prefix || !prefix.trim()) prefix = DEFAULT_PREFIX;
    // send-pack is the plumbing under push: 'git send-pack <repository> HEAD:refs/heads/main' pushes
    // with no push in the command. Workaround (check of the third review of CR-2026-10-15-GAPS): on a
    // loop branch it sent the loop's work to the remote in one call, and the rule did not read it.
    if (['push', 'merge', 'pull', 'send-pack'].includes(call.sub)) return loopTransferRule(call, prefix, owner);
    if (call.sub === 'checkout' || call.sub === 'switch') return loopSwitchRule(call, prefix, owner);
    if (['branch', 'update-ref', 'symbolic-ref'].includes(call.sub)) return loopRefMoveRule(call, prefix, owner);
    if (call.sub === 'worktree') return loopWorktreeRule(call, prefix, owner);
    if (call.sub === 'rebase') return loopRebaseRule(call, prefix, owner);
    if (call.sub === 'bisect') return loopBisectRule(call, prefix, owner);
    if (call.sub === 'fetch') return loopFetchRule(call, prefix, owner);
    return null;
}

function globRegex(glob) {
    const g = glob.replace(/\\/g, '/');
    const esc = g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = esc.replace(/\\\*\\\*\//g, '(?:.*/)?').replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '[^/]');
    return new RegExp('^' + rx + '$', 'i');
}

export function ledgerRule(full, globs, prefix, owner) {
    if (!full) return null;
    if (!globs || globs.length === 0) globs = DEFAULT_LEDGER_GLOBS;
    const root = getRepoRoot(full);
    if (!root) return null;
    const rel = full.slice(root.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
    const hit = globs.find((g) => globRegex(g).test(rel));
    if (!hit) return null;
    const branch = onLoopBranch(root, prefix);
    if (!branch) return null;
    const reason = `BLOCKED - ${rel} is the story ledger (${hit}) and this repository is on the loop branch ${branch}. AUTO-04: only the Reviewer's verdict writes the pass mark, ` +
        "and the harness writes it from that verdict with its own process; a Builder that edits the ledger voids its own attempt. " +
        `Change a story's acceptance criteria with ${owner}, off the loop branch, as a Change Request.`;
    return newDeny('guard', 'loop branch: ledger edit refused', reason);
}
