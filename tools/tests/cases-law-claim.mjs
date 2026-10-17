// cases-law-claim.mjs - hook self-test cases for the commit check (VCS-23) and the message check
// (VOICE-05). Imported by run.mjs, which owns the fixtures and helpers used here. Never run directly.

import fs from 'node:fs';
import path from 'node:path';

export default function lawClaimCases(t) {
    const { kit, repoClean, record, section, like, jp, put, readText, newRepo, runGit, gitTry, NO_POINTER } = t;

    // ------------------------------------------------------------------ 6. the commit-msg check (VCS-23): tools/vcs/law-claim.mjs behind templates/commit-msg
    // Real commits in a small brain-shaped repository with the shim installed, so the path git takes is
    // the path tested: sh shim -> pointer -> kit script -> exit code -> git refuses or proceeds.
    section('-- commit-msg: law-claim (VCS-23)');
    const verdict = (r) => (r.code === 0 ? 'committed' : like(r.out, '*VCS-23*') ? 'refused' : `exit${r.code}`);
    const install = (repo) => {
        const dest = path.join(repo, '.git', 'hooks', 'commit-msg');
        fs.copyFileSync(shim, dest);
        try { fs.chmodSync(dest, 0o755); } catch { /* Windows: git runs it through sh */ }
    };
    const lawRepo = newRepo('repo-brain');
    put(path.join(lawRepo, 'LAW.md'), '| OWN-01 | OWNER | a rule | `brain:instructions/me.md` |\n');
    put(jp(lawRepo, 'instructions', 'me.md'), 'v1');
    put(path.join(lawRepo, 'law.overlay.json'), '{}');
    put(path.join(lawRepo, 'claims.json'), '{ "claims": [] }');
    put(path.join(lawRepo, 'notes.md'), 'n1');
    runGit(lawRepo, ['add', '-A']); runGit(lawRepo, ['commit', '-q', '-m', 'init']);
    const shim = path.join(kit, 'templates', 'commit-msg');
    install(lawRepo);
    record('law-claim: the shim is LF (sh cannot run a CRLF script)', 'lf', readText(shim).includes('\r') ? 'crlf' : 'lf');

    put(jp(lawRepo, 'instructions', 'me.md'), 'v2'); runGit(lawRepo, ['add', 'instructions/me.md']);
    let r = gitTry(lawRepo, ['commit', '-m', 'edit the law']);
    record('law-claim: a law file with no claim and no waiver -> refused', 'refused', verdict(r), r.out);
    record('law-claim: the refusal names the law file and both ways out', 'named', like(r.out, '*instructions/me.md*') && like(r.out, '*claims.json*') && like(r.out, '*No-Claim: <reason>*') ? 'named' : 'missing', r.out);
    put(path.join(lawRepo, 'claims.json'), '{ "claims": [ 1 ] }'); runGit(lawRepo, ['add', 'claims.json']);
    r = gitTry(lawRepo, ['commit', '-m', 'edit the law, with its claim']);
    record('law-claim: the same edit with claims.json staged -> committed', 'committed', verdict(r), r.out);
    put(jp(lawRepo, 'instructions', 'me.md'), 'v3'); runGit(lawRepo, ['add', 'instructions/me.md']);
    r = gitTry(lawRepo, ['commit', '-m', 'a voice rule', '-m', 'No-Claim: a voice rule, it states no fact about the disk']);
    record('law-claim: a written waiver in the message -> committed', 'committed', verdict(r), r.out);
    put(jp(lawRepo, 'instructions', 'me.md'), 'v4'); runGit(lawRepo, ['add', 'instructions/me.md']);
    r = gitTry(lawRepo, ['commit', '-m', 'lazy', '-m', 'No-Claim: none']);
    record('law-claim: a waiver with no real reason -> refused, and says why', 'refused', verdict(r) === 'refused' && like(r.out, '*shorter than*') ? 'refused' : `wrong:${verdict(r)}`, r.out);
    runGit(lawRepo, ['reset', '-q', '--hard']);
    put(path.join(lawRepo, 'notes.md'), 'n2'); runGit(lawRepo, ['add', 'notes.md']);
    r = gitTry(lawRepo, ['commit', '-m', 'notes only']);
    record('law-claim: no law file in the commit -> committed, silent', 'committed', r.code === 0 && !like(r.out, '*law-claim*') && !like(r.out, '*VCS-23*') ? 'committed' : 'noisy', r.out);
    put(path.join(lawRepo, 'law.overlay.json'), '{ "a": 1 }'); runGit(lawRepo, ['add', 'law.overlay.json']);
    r = gitTry(lawRepo, ['commit', '-m', 'a new clause']);
    record('law-claim: the overlay is a law file -> refused', 'refused', verdict(r) === 'refused' && like(r.out, '*law.overlay.json*') ? 'refused' : `wrong:${verdict(r)}`, r.out);
    runGit(lawRepo, ['reset', '-q', '--hard']);
    // commit by path: git builds a temporary index for the named path; the hook must read that one
    put(jp(lawRepo, 'instructions', 'me.md'), 'v5');
    r = gitTry(lawRepo, ['commit', '-m', 'by path', '--', 'instructions/me.md']);
    record('law-claim: commit by path (nothing staged beforehand) -> refused', 'refused', verdict(r), r.out);
    r = gitTry(lawRepo, ['commit', '-m', 'by path', '-m', 'No-Claim: by path, a wording change only', '--', 'instructions/me.md']);
    record('law-claim: commit by path with a waiver -> committed', 'committed', verdict(r), r.out);
    // lawClaim.extraFiles in doctor.config.json adds a law file
    put(path.join(lawRepo, 'doctor.config.json'), '{ "schema": 1, "lawClaim": { "extraFiles": [ "notes.md" ] } }'); runGit(lawRepo, ['add', 'doctor.config.json']);
    gitTry(lawRepo, ['commit', '-m', 'config']);
    put(path.join(lawRepo, 'notes.md'), 'n3'); runGit(lawRepo, ['add', 'notes.md']);
    r = gitTry(lawRepo, ['commit', '-m', 'notes again']);
    record('law-claim: lawClaim.extraFiles makes another file a law file -> refused', 'refused', verdict(r), r.out);
    runGit(lawRepo, ['reset', '-q', '--hard']);
    // no pointer: the shim cannot find the kit; it says so and lets the commit through
    put(jp(lawRepo, 'instructions', 'me.md'), 'v6'); runGit(lawRepo, ['add', 'instructions/me.md']);
    const saved = process.env.DF_POINTER_PATH; process.env.DF_POINTER_PATH = NO_POINTER;
    try { r = gitTry(lawRepo, ['commit', '-m', 'no pointer']); } finally { process.env.DF_POINTER_PATH = saved; }
    record('law-claim: no pointer -> committed, and says VCS-23 was not checked', 'said-so', r.code === 0 && like(r.out, '*NOT checked*') ? 'said-so' : `wrong:exit${r.code}`, r.out);
    // a repository with no LAW.md is not a brain: the hook is silent there
    install(repoClean);
    put(jp(repoClean, 'src', 'main.py'), 'print(3)'); runGit(repoClean, ['add', '-A']);
    r = gitTry(repoClean, ['commit', '-m', 'code']);
    record('law-claim: a repository with no LAW.md -> committed, silent', 'committed', r.code === 0 && !like(r.out, '*law-claim*') && !like(r.out, '*VCS-23*') ? 'committed' : 'noisy', r.out);

    // ------------------------------------------------------------------ 6b. the message check (VOICE-05), same shim, any repository
    section('-- commit-msg: message (VOICE-05)');
    const verdictV = (x) => (x.code === 0 ? 'committed' : like(x.out, '*VOICE-05*') ? 'refused' : `exit${x.code}`);
    put(jp(repoClean, 'src', 'main.py'), 'print(4)'); runGit(repoClean, ['add', '-A']);
    r = gitTry(repoClean, ['commit', '-m', 'Updated the main script']);
    record('message: a past-tense first word -> refused, present tense suggested', 'refused', verdictV(r) === 'refused' && like(r.out, '*past tense*') ? 'refused' : `wrong:${verdictV(r)}`, r.out);
    r = gitTry(repoClean, ['commit', '-m', 'Update']);
    record('message: a bare placeholder -> refused', 'refused', verdictV(r) === 'refused' && like(r.out, '*says nothing*') ? 'refused' : `wrong:${verdictV(r)}`, r.out);
    r = gitTry(repoClean, ['commit', '-m', 'Correct the fence claim so that the ' + 'x'.repeat(60)]);
    record('message: a subject over 72 characters -> refused, length named', 'refused', verdictV(r) === 'refused' && like(r.out, '*characters; the limit is 72*') ? 'refused' : `wrong:${verdictV(r)}`, r.out);
    r = gitTry(repoClean, ['commit', '-m', 'Correct the fence claim', '-m', 'A body may be as long as it needs to be and may say Updated as much as it likes.']);
    record('message: short, present tense, specific -> committed', 'committed', verdictV(r), r.out);
    put(jp(repoClean, 'src', 'main.py'), 'print(5)'); runGit(repoClean, ['add', '-A']);
    r = gitTry(repoClean, ['commit', '-m', "Merge branch 'x' into main"]);
    record('message: a merge subject is exempt', 'committed', verdictV(r), r.out);
    // git's own 'fixup! <subject>' and 'squash! <subject>' are exempt (CR-2026-10-15-GAPS review). The
    // pattern put \b after the '!', which never matches before the space git writes, so a subject that
    // the prefix took past the limit was refused. Each subject below is over 72 characters only by its
    // prefix. 'Merged' holds the other side: the exemption is the word Merge, not a word that starts so.
    const fxBase = 'Correct the fence claim so the record ' + 'x'.repeat(30);
    put(jp(repoClean, 'src', 'main.py'), 'print(6)'); runGit(repoClean, ['add', '-A']);
    r = gitTry(repoClean, ['commit', '-m', 'Merged the fence branch']);
    record("message: 'Merged ...' is past tense, not a merge subject -> refused", 'refused', verdictV(r), r.out);
    r = gitTry(repoClean, ['commit', '-m', 'fixup! ' + fxBase]);
    record("message: a 'fixup! <subject>' over the limit only by its prefix -> exempt", 'committed', verdictV(r), r.out);
    put(jp(repoClean, 'src', 'main.py'), 'print(7)'); runGit(repoClean, ['add', '-A']);
    r = gitTry(repoClean, ['commit', '-m', 'squash! ' + fxBase]);
    record("message: a 'squash! <subject>' over the limit only by its prefix -> exempt", 'committed', verdictV(r), r.out);
}
