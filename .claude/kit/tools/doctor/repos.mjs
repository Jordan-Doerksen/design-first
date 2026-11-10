// repos.mjs - the repository sweep (SURVEY band). READ-ONLY: only git read commands, never a mutation.
// Returns arrays of plain objects. Emits no output of its own. Every path comes from the context
// and the config; nothing here names a real folder.

import fs from 'node:fs';
import path from 'node:path';
import { isUnder, pathEq, relUnder, toFullPath, getLeaf } from '../../hooks/lib/common.mjs';
import { gitLinesAsync, gitLines, listDir } from './util.mjs';

// A config part such as '\node_modules\' or '/node_modules/' read against a path with either
// separator, without case, as PowerShell's -like read it.
const slashFold = (s) => String(s).replace(/\\/g, '/').toLowerCase();
export function hasPart(p, part) { return slashFold(p).includes(slashFold(part)); }

// A .git FILE reads `gitdir: <path>`. A LINKED WORKTREE's gitdir holds a `commondir` file naming
// the parent's .git folder; a submodule's gitdir has none (its common dir IS its git dir), so a
// submodule stays an ordinary repo. Returns the parent repository's working folder, or null when
// the folder is not a linked worktree. Falls back to asking git when the marker is absent.
function worktreeParent(gitFile, repo) {
    let text;
    try { text = fs.readFileSync(gitFile, 'utf8').trim(); } catch { return null; }
    const m = /^gitdir:\s*(.+?)\s*$/.exec(text);
    if (!m) return null;
    let gitDir = m[1];
    if (!path.isAbsolute(gitDir)) gitDir = path.join(repo, gitDir);
    gitDir = toFullPath(gitDir);
    if (!gitDir) return null;
    let common = null;
    try {
        const cd = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
        if (cd) common = toFullPath(path.isAbsolute(cd) ? cd : path.join(gitDir, cd));
    } catch { common = null; }
    if (common == null) {
        const cd = gitLines(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'])[0];
        if (!cd || !cd.trim()) return null;
        common = toFullPath(cd.trim());
        if (!common) return null;
    }
    if (pathEq(common, gitDir)) return null;
    // The common dir is the parent's .git folder, so its parent is the parent repository. A bare
    // parent has no working folder; name the common dir itself in that case.
    if (getLeaf(common) === '.git') return path.dirname(common);
    return common;
}

function relName(full, root) {
    const rel = relUnder(full, root);
    if (rel == null) return full;
    // The root itself being a repo (the kit under -Kit) reads better by name than as ".".
    return rel === '' ? getLeaf(root) + ' (root)' : rel;
}

// The facts for ONE .git entry: a row, or null when the folder is excluded. It reads; it never writes.
async function oneRepoFacts(gitPath, isContainer, root, cfg, stateDir) {
    const repo = path.dirname(gitPath);
    for (const part of cfg.excludePathParts) if (hasPart(repo, part)) return null;
    const archived = cfg.archivedPathParts.some((part) => hasPart(repo, part));
    const rel = relName(repo, root);
    const frozen = cfg.frozenPaths.some((p) => isUnder(repo, p));
    const tomb = cfg.tombstonedPaths.some((p) => pathEq(repo, p));

    const wtParent = isContainer ? null : worktreeParent(gitPath, repo);
    if (wtParent != null) {
        // Only the worktree's own uncommitted state is its own; a frozen worktree that moved is
        // still a frozen reference that moved.
        const dirty = (await gitLinesAsync(repo, ['status', '--porcelain'])).length;
        return {
            path: rel, fullPath: repo, hasAttrs: true, archived, remote: '', ownsRemote: false, ahead: null, dirty,
            shallow: false, commits: 0, lastCommit: '', frozen, tombstoned: tomb, worktree: true, parent: relName(wtParent, root),
        };
    }

    // The six questions are independent, so they are asked at once.
    const [remoteL, aheadL, porcelain, gitDirL, commitsL, lastL] = await Promise.all([
        gitLinesAsync(repo, ['remote', 'get-url', 'origin']),
        gitLinesAsync(repo, ['rev-list', '--count', '@{u}..HEAD']),
        gitLinesAsync(repo, ['status', '--porcelain']),
        gitLinesAsync(repo, ['rev-parse', '--git-dir']),
        gitLinesAsync(repo, ['rev-list', '--count', 'HEAD']),
        gitLinesAsync(repo, ['log', '-1', '--format=%cs']),
    ]);
    const remote = (remoteL[0] || '').trim();
    const ownsRemote = remote !== '' && cfg.ownerRemotePatterns.some((pat) => remote.toLowerCase().includes(String(pat).toLowerCase()));
    const aheadS = (aheadL[0] || '').trim();
    const ahead = aheadS === '' ? null : Number.parseInt(aheadS, 10);
    // Exclude the Doctor's OWN generated state from the dirty count. Writing state/ dirties the
    // repo the brain lives in, so the next run would report a dirty count the previous run caused.
    let lines = porcelain;
    if (stateDir && isUnder(stateDir, repo)) {
        const stateRel = relUnder(stateDir, repo).replace(/\\/g, '/');
        if (stateRel) lines = lines.filter((l) => !l.toLowerCase().includes(stateRel.toLowerCase() + '/'));
    }
    const dirty = lines.length;
    // Shallow: git fsck CANNOT see this; only the marker file can.
    let gitDir = (gitDirL[0] || '').trim();
    if (!gitDir) gitDir = gitPath;
    else if (!path.isAbsolute(gitDir)) gitDir = path.join(repo, gitDir);
    const shallow = fs.existsSync(path.join(gitDir, 'shallow'));
    const commitsS = (commitsL[0] || '').trim();
    const commits = commitsS === '' ? 0 : Number.parseInt(commitsS, 10);
    const last = lastL[0] || '';
    // Without .gitattributes, core.autocrlf decides the bytes on disk instead of the repo.
    const hasAttrs = fs.existsSync(path.join(repo, '.gitattributes'));
    return {
        path: rel, fullPath: repo, hasAttrs, archived, remote, ownsRemote, ahead, dirty,
        shallow, commits, lastCommit: last, frozen, tombstoned: tomb, worktree: false, parent: '',
    };
}

// Every .git entry under root to maxDepth folders below it, in a stable order. A .git FILE is a
// submodule (surveyed as a repo) or a LINKED WORKTREE: that one shares its parent's objects, remotes
// and tracked tree, so it is FOLDED into the parent (worktree = true, parent = <parent path>) and
// only its own uncommitted state is recorded. Surveying it as a repo would repeat every
// tracked-secret, remote and shallow finding once per worktree.
function findGitEntries(root, maxDepth) {
    const out = [];
    const walk = (dir, depth) => {
        for (const e of listDir(dir)) {
            const full = path.join(dir, e.name);
            if (e.name === '.git' && (e.isDirectory() || e.isFile())) { out.push({ path: full, dir: e.isDirectory() }); continue; }
            if (e.isDirectory() && depth < maxDepth) walk(full, depth + 1);
        }
    };
    walk(root, 0);
    return out;
}

export async function repoFacts(root, cfg, stateDir = '') {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`root '${root}' does not exist`);
    const entries = findGitEntries(root, cfg.maxDepth);
    // Each repository costs six git processes. The repositories do not depend on each other, so they
    // are read `parallelGit` at a time, and the rows are put back in the order the sweep found them,
    // so the result is the one a sequential loop gives. parallelGit 1 reads one after another.
    const threads = Math.max(1, cfg.parallelGit || 1);
    const rows = new Array(entries.length).fill(null);
    let next = 0;
    const worker = async () => {
        while (next < entries.length) {
            const i = next++;
            rows[i] = await oneRepoFacts(entries[i].path, entries[i].dir, root, cfg, stateDir);
        }
    };
    await Promise.all(Array.from({ length: Math.min(threads, Math.max(1, entries.length)) }, worker));
    return rows.filter((r) => r != null);
}

// ENUMERATES the tree for folders that hold files but sit in no repo. It does not read a list of
// folders to look at: a list of what to CHECK misses by default; a list of what to SKIP reports by
// default. A folder with repos beneath it is a container: descend, do not report it.
export function unversionedFolders(root, cfg) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`root '${root}' does not exist`);
    // A root that is itself a repository (the kit under -Kit) has no unversioned sub-folders: every
    // folder in it is covered by that repository. Without this, each top-level folder would be reported.
    if (fs.existsSync(path.join(root, '.git'))) return [];
    const maxDepth = cfg.unversionedMaxDepth;
    const ignore = cfg.unversionedIgnorePathParts;
    const out = [];
    const repoBeneath = (dir) => {
        const look = (d, depth) => {
            for (const e of listDir(d)) {
                if (e.name === '.git') return true;
                if (e.isDirectory() && depth < 4 && look(path.join(d, e.name), depth + 1)) return true;
            }
            return false;
        };
        return look(dir, 0);
    };
    const countFiles = (dir, cap) => {
        let n = 0;
        const stack = [dir];
        while (stack.length && n < cap) {
            const d = stack.pop();
            for (const e of listDir(d)) {
                if (e.isDirectory()) stack.push(path.join(d, e.name));
                else if (e.isFile() && ++n >= cap) break;
            }
        }
        return n;
    };
    const walk = (dir, depth) => {
        if (depth > maxDepth) return;
        // Compare with a trailing separator so a part written "/_backups/" also matches at the end.
        const probe = dir.replace(/[\\/]+$/, '') + '/';
        if (ignore.some((part) => hasPart(probe, part))) return;
        if (fs.existsSync(path.join(dir, '.git'))) return;
        if (repoBeneath(dir)) {
            for (const e of listDir(dir)) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
            return;
        }
        // Counting is capped: the exact count does not change the verdict, and an uncapped walk
        // into an asset tree makes the Doctor slow enough to stop being run.
        const files = countFiles(dir, 501);
        if (files === 0) return;
        out.push({ path: relUnder(dir, root) ?? dir, fullPath: dir, files, capped: files > 500 });
    };
    for (const e of listDir(root)) if (e.isDirectory()) walk(path.join(root, e.name), 1);
    return out;
}

// A tracked file named .env (or .env.<x>, not .env.example) in a live repo. `secretExceptions` are
// full paths (already expanded by the config reader). A linked worktree lists the same tracked files
// as its parent, so it is skipped: the parent's scan already covers them.
export function trackedSecrets(cfg, repos) {
    const hits = [];
    for (const r of repos) {
        if (r.archived || r.worktree) continue;
        const tracked = gitLines(r.fullPath, ['ls-files']).filter((t) => /(^|\/)\.env(\.(?!example$)[^/]+)?$/i.test(t));
        for (const t of tracked) {
            const full = toFullPath(path.join(r.fullPath, t)) || path.join(r.fullPath, t);
            const excepted = cfg.secretExceptions.some((e) => pathEq(full, e));
            hits.push({ repo: r.path, file: t, fullPath: full, excepted });
        }
    }
    return hits;
}
