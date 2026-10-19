// cases-gitcall.mjs - hook self-test case 49 of CR-2026-10-16-ONEWRITER (chunk 0, ported to the
// Node hooks in 0.2.3): how the guard reads the head of a git call. Imported by run.mjs, which owns
// the fixtures and helpers used here. Never run directly.
//
// SAFE-01 through rule 1 (stage-secret), and the other git rules through the same reading
// (lib/tokenise.mjs, getGitCall):
//   - env (with its options, env -C and short groups such as env -vC among them), command, time and
//     NAME=value words before git. Each made the call read as not-git (CR-2026-10-19-REVIEW F1).
//   - --git-dir and --work-tree, in the '=' and the space form, and the GIT_DIR= and GIT_WORK_TREE=
//     words. Rule 1 probes in the call's folder with the same options, so git picks the work tree it
//     stages from; they were skipped, so from another folder the probe found no repository, or the
//     wrong one. Rule 11 reads the branch from the folder above a git dir that ends in .git, never
//     from a work tree (the 'loop' cases).
//   - An empty 'git -C ""' keeps the folder an earlier env -C chose.
//   - Review round 2 of the PowerShell line: env's long options by an unambiguous prefix (env --c
//     <dir> is --chdir), as GNU env reads them; core.excludesFile from 'git -c' and from
//     GIT_CONFIG_COUNT words, carried into rule 1's probe and rule 7's status; rule 7's status read
//     with the call's --git-dir and --work-tree, in the work tree git would change; and git's
//     --attr-source option.
//   - '-c k=v' is a config value, not '-C <folder>'. The PowerShell line read -c as -C (its -eq
//     ignores case); the port never did. The two -c cases hold that it stays so.
// Every deny case here was an allow in 0.2.2, so each one fails if its fix is reverted, except
// three that 0.2.2 denied too: the two 'git -c' cases, and 'git --work-tree=<outside> checkout
// main', which holds that a work tree does not move the folder rule 11 reads (the first chunk 0
// build on the PowerShell line moved it, and allowed this). The allow case on the clean repository
// named by --work-tree fails if reverted too: before, the call's own folder, which holds a secret,
// was read. Each of the three excludes-file allow cases fails under one mutation: '-c
// core.excludesFile=<file ignoring .env>' if the value is not carried, the words with no
// GIT_CONFIG_COUNT if the count is not read, and the words overridden by -c if the words win over
// -c. The RESIDUAL cases are the written residual in guard.mjs's header, asserted as not denied so
// nobody believes otherwise.

import path from 'node:path';

export default function gitCallCases(t) {
    const { T, record, section, like, put, newRepo, runGit, invokeHook, hookJson, classify } = t;

    const fwd = (p) => String(p).replace(/\\/g, '/');
    const gcShell = (name, tool, cmd, cwd, expect, contains) => {
        const r = invokeHook('guard.mjs', hookJson({ session_id: 'gc', cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command: cmd } }));
        let got = r.code !== 0 ? `exit${r.code}` : classify(r.out);
        if (got === expect && contains && !like(r.out, `*${contains}*`)) got = `missing-text:${contains}`;
        record(name, expect, got, r.out);
    };

    section('-- case 49: the head of a git call (SAFE-01, CR-2026-10-16-ONEWRITER chunk 0)');
    const gcRepo = newRepo('repo-gc-secret');
    put(path.join(gcRepo, 'README.md'), 'gc');
    runGit(gcRepo, ['add', '-A']); runGit(gcRepo, ['commit', '-q', '-m', 'init']);
    put(path.join(gcRepo, '.env'), 'TOKEN=untracked-not-ignored');
    const gcClean = newRepo('repo-gc-clean');
    put(path.join(gcClean, 'README.md'), 'clean');
    runGit(gcClean, ['add', '-A']); runGit(gcClean, ['commit', '-q', '-m', 'init']);
    // A plain folder, in no repository, that holds an untracked secret: git stages from it when a call
    // names it as the work tree, or names only a git dir and runs there.
    const gcPlain = path.join(T, 'gc-plain');
    put(path.join(gcPlain, '.env'), 'TOKEN=in-a-plain-folder');
    put(path.join(gcPlain, 'notes.txt'), 'plain');
    // A repository on a loop branch (rule 11, AUTO-11).
    const gcLoop = newRepo('repo-gc-loop');
    put(path.join(gcLoop, 'README.md'), 'loop');
    runGit(gcLoop, ['add', '-A']); runGit(gcLoop, ['commit', '-q', '-m', 'init']);
    runGit(gcLoop, ['checkout', '-q', '-b', 'harness/chunk-1']);
    // A repository whose .env is ignored only by the excludes file its own config names, and a second
    // excludes file that ignores .env, for a call to name.
    const gcExcl = newRepo('repo-gc-excl');
    put(path.join(gcExcl, 'README.md'), 'excl');
    runGit(gcExcl, ['add', '-A']); runGit(gcExcl, ['commit', '-q', '-m', 'init']);
    put(path.join(gcExcl, '.env'), 'TOKEN=ignored-by-excludes-file-only');
    const gcIgnore = path.join(T, 'gc-ignore-env');
    put(gcIgnore, '.env');
    runGit(gcExcl, ['config', 'core.excludesFile', fwd(gcIgnore)]);
    const gcR = fwd(gcRepo);
    const gcC = fwd(gcClean);
    const gcP = fwd(gcPlain);
    const gcL = fwd(gcLoop);
    const gcI = fwd(gcIgnore);
    const gcOut = path.join(T, 'outside');
    const gcOutFwd = fwd(gcOut);

    // -c is not -C
    gcShell('case 49: git -c user.name=x add -A, untracked .env -> denied', 'Bash', 'git -c user.name=x add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: git -c user.name=x add -A (PowerShell) -> denied', 'PowerShell', 'git -c user.name=x add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: git -c k=v -C <repo> add . from outside -> denied', 'Bash', `git -c core.quotepath=off -C ${gcR} add .`, gcOut, 'deny', '.env');
    // prefixes before git
    gcShell('case 49: env git add -A -> denied', 'Bash', 'env git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: env -i PATH=/usr/bin git add -A -> denied', 'Bash', 'env -i PATH=/usr/bin git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: env -C <repo> git add -A from outside -> denied', 'Bash', `env -C ${gcR} git add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: env -vC <repo> git add -A from outside (short group) -> denied', 'Bash', `env -vC ${gcR} git add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: env -iC <repo> PATH=/usr/bin git add -A from outside -> denied', 'Bash', `env -iC ${gcR} PATH=/usr/bin git add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: env -C <repo> git -C "" add -A from outside (empty -C) -> denied', 'Bash', `env -C ${gcR} git -C "" add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: command git add -A -> denied', 'Bash', 'command git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: time git add -A -> denied', 'Bash', 'time git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: time -p git add -A -> denied', 'Bash', 'time -p git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: VAR=x git add -A -> denied', 'Bash', 'VAR=x git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: env VAR=x time command git add -A (chained) -> denied', 'Bash', 'env VAR=x time command git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: VAR=x git stash drop -> denied (rule 7 reads the same call)', 'Bash', 'VAR=x git stash drop', gcRepo, 'deny');
    // env's long options by an unambiguous prefix, as GNU env reads them (review round 2)
    gcShell('case 49: env --c <repo> git add -A from outside (--chdir by prefix) -> denied', 'Bash', `env --c ${gcR} git add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: env --ch=<repo> git add -A from outside -> denied', 'Bash', `env --ch=${gcR} git add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: env --deb git add -A (--debug by prefix) -> denied', 'Bash', 'env --deb git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: env --u GIT_DIR git add -A (--unset by prefix) -> denied', 'Bash', 'env --u GIT_DIR git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: GIT_WORK_TREE=<clean> env --u GIT_WORK_TREE git add -A -> denied', 'Bash', `GIT_WORK_TREE=${gcC} env --u GIT_WORK_TREE git add -A`, gcRepo, 'deny', '.env');
    gcShell('case 49: env --ignore-env git add -A -> denied', 'Bash', 'env --ignore-env git add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: env --i git add -A (ambiguous; env refuses it, runs nothing) -> allowed', 'Bash', 'env --i git add -A', gcRepo, 'allow');
    // core.excludesFile the call sets is carried into rule 1's probe and rule 7's status (review round 2)
    gcShell('case 49: git add -A, .env ignored by the repository excludes file -> allowed', 'Bash', 'git add -A', gcExcl, 'allow');
    gcShell('case 49: git -c core.excludesFile= add -A un-ignores the .env -> denied', 'Bash', 'git -c core.excludesFile= add -A', gcExcl, 'deny', '.env');
    gcShell('case 49: GIT_CONFIG_COUNT=1 KEY_0=core.excludesFile VALUE_0= git add -A -> denied', 'Bash', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0= git add -A', gcExcl, 'deny', '.env');
    gcShell('case 49: git -c core.excludesFile= clean -fd, .env un-ignored -> denied (rule 7)', 'Bash', 'git -c core.excludesFile= clean -fd', gcExcl, 'deny', 'dirty tree');
    gcShell('case 49: git -c core.excludesFile=<file ignoring .env> add -A -> allowed', 'Bash', `git -c core.excludesFile=${gcI} add -A`, gcRepo, 'allow');
    gcShell('case 49: GIT_CONFIG_KEY_0/VALUE_0 with no GIT_CONFIG_COUNT (git reads none) -> allowed', 'Bash', 'GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0= git add -A', gcExcl, 'allow');
    gcShell('case 49: GIT_CONFIG_* un-ignore, git -c re-ignores (-c wins) -> allowed', 'Bash', `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0= git -c core.excludesFile=${gcI} add -A`, gcExcl, 'allow');
    // git global options the reading did not list (review round 2)
    gcShell('case 49: git --attr-source=HEAD add -A -> denied', 'Bash', 'git --attr-source=HEAD add -A', gcRepo, 'deny', '.env');
    gcShell('case 49: git --attr-source HEAD add -A -> denied', 'Bash', 'git --attr-source HEAD add -A', gcRepo, 'deny', '.env');
    // --git-dir and --work-tree name the repository
    gcShell('case 49: git --git-dir=R/.git --work-tree=R add -A from outside -> denied', 'Bash', `git --git-dir=${gcR}/.git --work-tree=${gcR} add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: git --git-dir R/.git --work-tree R add -A from outside -> denied', 'Bash', `git --git-dir ${gcR}/.git --work-tree ${gcR} add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: git --git-dir R\\.git --work-tree R add -A (PowerShell) -> denied', 'PowerShell', `git --git-dir ${path.join(gcRepo, '.git')} --work-tree ${gcRepo} add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: git --git-dir=<clean>/.git add -A from a plain folder with a .env -> denied', 'Bash', `git --git-dir=${gcC}/.git add -A`, gcPlain, 'deny', '.env');
    gcShell('case 49: git --work-tree=<plain folder> add -A from the clean repository -> denied', 'Bash', `git --work-tree=${gcP} add -A`, gcClean, 'deny', '.env');
    gcShell('case 49: git --git-dir=<clean>/.git --work-tree=<plain folder> add -A -> denied', 'Bash', `git --git-dir=${gcC}/.git --work-tree=${gcP} add -A`, gcOut, 'deny', '.env');
    gcShell('case 49: GIT_DIR=R/.git GIT_WORK_TREE=R git add -A from outside -> denied', 'Bash', `GIT_DIR=${gcR}/.git GIT_WORK_TREE=${gcR} git add -A`, gcOut, 'deny', '.env');
    // a work tree does not move the folder rule 11 reads the branch from
    gcShell('case 49 loop: git --work-tree=<outside> checkout main on a loop branch -> denied', 'Bash', `git --work-tree=${gcOutFwd} checkout main`, gcLoop, 'deny', 'loop branch');
    gcShell('case 49 loop: GIT_WORK_TREE=<outside> git switch main on a loop branch -> denied', 'Bash', `GIT_WORK_TREE=${gcOutFwd} git switch main`, gcLoop, 'deny', 'loop branch');
    gcShell('case 49 loop: git --git-dir=L/.git --work-tree=<outside> checkout main -> denied', 'Bash', `git --git-dir=${gcL}/.git --work-tree=${gcOutFwd} checkout main`, gcOut, 'deny', 'loop branch');
    // rule 7 reads the status of the work tree git would change (review round 2)
    gcShell('case 49: GIT_DIR=<clean>/.git git clean -fdx from a plain folder with files -> denied', 'Bash', `GIT_DIR=${gcC}/.git git clean -fdx`, gcPlain, 'deny', 'gc-plain');
    gcShell('case 49: git --work-tree=<plain folder> clean -fdx from the clean repository -> denied', 'Bash', `git --work-tree=${gcP} clean -fdx`, gcClean, 'deny', 'gc-plain');
    gcShell('case 49: git --git-dir=<clean>/.git --work-tree=<clean> clean -fdx from the secret one -> allowed', 'Bash', `git --git-dir=${gcC}/.git --work-tree=${gcC} clean -fdx`, gcRepo, 'allow');
    // the other side
    gcShell('case 49: env git add -A in a repository with no untracked secret -> allowed', 'Bash', 'env git add -A', gcClean, 'allow');
    gcShell('case 49: git -c user.name=x add -A, no untracked secret -> allowed', 'Bash', 'git -c user.name=x add -A', gcClean, 'allow');
    gcShell('case 49: --git-dir/--work-tree naming a clean repository, run from the secret one -> allowed', 'Bash', `git --git-dir=${gcC}/.git --work-tree=${gcC} add -A`, gcRepo, 'allow');
    // the written residual (guard.mjs header)
    gcShell('RESIDUAL case 49: nohup git add -A (a wrapper not read) -> not denied', 'Bash', 'nohup git add -A', gcRepo, 'allow');
    gcShell("RESIDUAL case 49: env -S 'git add -A' (one string split into words) -> not denied", 'Bash', "env -S 'git add -A'", gcRepo, 'allow');
    gcShell('RESIDUAL case 49: export GIT_DIR=R/.git GIT_WORK_TREE=R; git add -A (not a prefix word) -> not denied', 'Bash', `export GIT_DIR=${gcR}/.git GIT_WORK_TREE=${gcR}; git add -A`, gcOut, 'allow');
    gcShell('RESIDUAL case 49: EV= git --config-env=core.excludesFile=EV add -A (a value by --config-env) -> not denied', 'Bash', 'EV= git --config-env=core.excludesFile=EV add -A', gcExcl, 'allow');
}
