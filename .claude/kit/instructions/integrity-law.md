# Integrity law — how work stops being lost, corrupted, or quietly wrong

This file owns `SAFE-01`, `SAFE-06`, `SAFE-09`, `DES-09`, `VCS-01`, `VCS-02`, `VCS-04`, `VCS-06`,
`VCS-07`, `VCS-12`, `VCS-14`, `VCS-15`, `VCS-22`, `VCS-23` and `SKIN-07`. It is about the bytes:
every repository, every artifact, every document. It does not restate
`instructions/observability-law.md` (what a running program reports) or
`instructions/autonomy-law.md` (what an agent may decide).

**The one idea** is `PRIN-03`: a fact about the disk is generated, never typed. A rule is written,
and it names what enforces it. The Doctor (`tools/doctor/`) is the generator of facts here; the
grade legend is in `LAW.md` and is not repeated.

---

## Part 1 — Absence (how work is actually lost)

Corruption is rarely the exposure. **Absence is.** A sweep of the method's first instance found
eighteen repositories with no remote at all, including the machinery that implemented its own
autonomy law.

### VCS-01

**Every repository has a remote you own.**

A folder with recent work and no remote is a defect, not a choice. The Doctor's SURVEY band reports
`noRemote` for every repository under the root; the owner sets `surveyStrict` to make it RED.
**Absence is a claim, and it needs the same proof as presence**: a check that only looks where it
was told to look will report green over a folder nobody listed. The Doctor therefore walks the tree
and subtracts an ignore list with a written reason per entry, rather than checking a typed list.

### VCS-02

**A remote you do not own is not a backup, and is reported as a different failure from having
none.**

It looks backed up and is not. *Example of the shape:* a project started from a public template
kept the template's URL as `origin`, ran eighteen commits ahead of it, and could not push anywhere.
Fix: `git remote rename origin upstream`, add your own `origin`, push; the upstream link survives
for template pulls. The Doctor reports `foreignRemote`, matched against the brain's
`ownerRemotePatterns`.

### VCS-04

**Committed is not backed up; pushed is.**

A commit lives on one disk. The method's own law repository once carried its live, obeyed rules as
six uncommitted files for twelve days: the law on the remote was not the law on disk. The Doctor
reports the ahead-count per repository. Commit and push continuously; a session that ends with
unpushed commits says so in its report.

### VCS-06

**A backup is not a backup until it is proven by a logged restore drill.**

**The drill**, ten minutes, quarterly: clone one repository at random from its remote into a
scratch folder and compare `git rev-parse HEAD^{tree}` against the live copy. A git tree hash is a
Merkle root over every tracked path, mode and blob, so **an equal tree hash is byte-exact proof**
over the whole tree. Assert the clone is **not shallow** (`VCS-22`), or a truncated history
restores and reports success. Log one line — date, repository, result — to an append-only file in
the brain's `records/` folder, **never** under `state/`, which the Doctor regenerates wholesale.

The drill reads its eligible set from the Doctor's generated repository list, so it cannot drift
from what the Doctor sees. Because a tree hash is still git vouching for itself, confirm the first
drill independently once: a content hash over a few restored binary files, compared byte for byte.

### VCS-22

**A shallow clone cannot be backed up and the standard integrity check cannot see it; unshallow it
before trusting it.**

*Example of the shape:* a push was rejected with `remote unpack failed: index-pack failed` because
`.git/shallow` had truncated the history to two commits. **`git fsck` reported it clean** — it
honours the shallow boundary and does not look past it, so the standard check is blind to the whole
class. Only the marker file reveals it. Fix: `git fetch --unshallow <remote>`; that repository went
from 2 commits to 118. The Doctor reports `shallow`.

**Grades of the survey clauses** (since 2026-10-15, CR-2026-10-15-GAPS D7; GATE before). The
survey reports `noRemote`, `foreignRemote` and `shallow` as `fail` findings, and `unpushed` as a
`warn` finding. A survey finding changes the Doctor's verdict only when it is a `fail` and the
brain config sets `surveyStrict`, which the kit's template ships off. So in the kit VCS-01, VCS-02,
VCS-04 and VCS-22 grade HONOUR: no machine stops you by default. A brain that sets `surveyStrict`
true re-grades VCS-01, VCS-02 and VCS-22 to GATE in its `law.overlay.json`, on the survey anchors
`survey-no-remote`, `survey-foreign-remote` and `survey-shallow`, and holds the setting with a
claim. VCS-04 stays HONOUR even then, because a `warn` never changes the verdict.

---

## Part 2 — Bytes (how work is quietly corrupted)

### DES-09

**Every repository carries its line-ending attributes file in its first commit; the bytes belong
to the repository, not to a machine setting.**

On a machine where `core.autocrlf=true` is set in the system git config, a repository without a
`.gitattributes` has its bytes on disk decided by a platform default instead of by the project.
That silently breaks shell scripts (`#!/bin/bash\r` = command not found), any recorded hash over a
checked-in file, any config hash a tool prints, and it produces whole-file phantom diffs. **The
block, at every repository root, in the first commit:**

```
* text=auto eol=lf
*.sh  text eol=lf
*.bat text eol=crlf
*.ps1 text eol=crlf
*.png binary
*.zip binary
*.exe binary
*.pck binary
*.uid -text
*.import -text
```

Then once per existing repository: `git add --renormalize . && git commit -m "Normalize line
endings"`. **Leave `core.autocrlf` alone** — `.gitattributes` overrides it, and a repository file
beating a machine setting is the whole point. Rule of thumb for anything not listed: **if a program
other than git reads the bytes, declare the file explicitly.** The kit's own `.gitattributes` is
this block.

*Lesson.* A build hashed the working tree to produce an integrity manifest. One file sat on disk
with CRLF while git stored and the host served LF, so the manifest stated a hash no download could
ever match, and the integrity check correctly refused that file forever. **Hash the bytes the
server serves, not the bytes an editor left on disk**, and make the manifest builder *fail* on
CRLF text instead of hashing it.

**Grade: HONOUR** (since 2026-10-15, CR-2026-10-15-GAPS D7; GATE before). The Doctor's survey
reports a repository with no `.gitattributes` as `noGitattributes`, a `warn` finding, and a `warn`
never changes the verdict, with `surveyStrict` on or off. The survey line is a report, not a stop.

---

## Part 3 — Claims (how documents go wrong)

### VCS-15

**A claim about the state of the disk is generated, never typed.**

This is the clause the whole file exists for; `PRIN-03` is its principle. **Mechanism:** the Doctor
evaluates `claims.json`, and `KIT-LAW-01` asserts that the committed `LAW.md` equals a fresh build
from `law.json` (bytes compared after mapping CRLF to LF). A generated state file older than seven
days renders as **STATE UNKNOWN**, never as stale numbers.

### VCS-23

**When a law file states a fact about the disk, it gets a claim in the same commit.**

This is the rule that stops the rot returning. A claim is cheap: `path_exists`, `file_contains`,
`file_not_contains`, `remote_is`, `json_subset_equal`. Two rules about writing one:

- **Pin the needle to the string that would disappear**, not to a word that survives its own
  removal. A claim meant to prove a retired folder still had a consumer used a bare word as its
  needle; the consumer had been removed, and the *comment documenting the removal* contained the
  word, so the claim stayed green over a fact that had been false for two weeks. The needle is now
  the full path, which exists only in a real consumer.
- **Prove every claim RED on a sabotaged copy before it counts.** Point the needle at something
  absent, confirm the verdict flips and the exit code follows, then restore. A claim that cannot
  fail is not a claim.

**The mechanism** is a git `commit-msg` check, `tools/vcs/law-claim.mjs`, for a brain that is a
repository. A commit that changes a law file (an owning file named in `LAW.md`, or the overlay) is
refused unless `claims.json` is in the same commit, or the message carries a line
`No-Claim: <reason>`. The waiver exists because most law edits state no fact about the disk: a
rule about tone has nothing to claim, and a check that refuses those is a check that gets skipped.
The reason stays in the history. Install and limits: `tools/MANUAL.md`.

### SKIN-07

**Never snapshot a count from any external corpus into a law; read the catalogue for the current
corpus, because a number quoted in a law goes stale silently.**

A law file that says "the reference contains forty case studies" is a typed fact about another
repository. The reference grows; the law does not; and an agent that trusts the law will cite a
corpus that no longer exists. Point at the reference's own index or catalogue and read it at use
time. The same applies to "N repositories", "N skills installed" and every other count: generate
it or point at where it is generated. This is `PRIN-03` applied to corpora you do not control.

---

## Part 4 — Retirement (how dead things keep working)

### SAFE-09

**A retired but load-bearing folder is never deleted, moved or archived while a live consumer
still reads it.**

Retired as a product is not the same as unused. A folder may be forbidden to work in and still be
read by a live config, a build step or a test. Removing it is an outage that looks like tidying.
**Mechanism:** the guard hook denies an Edit, Write or NotebookEdit of a path listed in the
brain's `frozenPaths` or `tombstonedPaths`, except a tombstoned folder's own `TOMBSTONE.md`, the
record the tombstone claim reads. It also denies a Bash or PowerShell command that names such a
path after a delete or move command from its list (such as `rm`, `del`, `mv`, `Remove-Item`,
`Move-Item`, `Clear-Content`), or in `git clean`, `git restore`, `git rm` or `git checkout`. A shell
write into such a path (a redirect, `Set-Content`, `Out-File`, `cp`, `Copy-Item`) is not
inspected. For a git repository at or under a frozen path, the Doctor survey reports an
uncommitted write as `frozenDirty` after it is made (`VCS-14`; RED only with `surveyStrict`). A
write in a frozen folder that holds no repository, or that sits inside a repository the list does
not freeze as a whole, and a write that is then committed, are not found. **Residual:** the path rules need a brain; without
one the guard runs its inline rules and gives one advisory per session that path rules are off. A
move performed by a script the agent writes, or inside a nested shell string, is not inspected.
Path spellings (2026-10-15, CR-2026-10-15-GAPS): `\\?\`, `\\.\`, `\\?\UNC\`, an admin share on
`localhost` or `127.0.0.1`, and a PowerShell `FileSystem::` provider path are mapped to the plain
path before the compare. Not mapped: 8.3 short names, junctions and symbolic links, `subst` or
mapped drives, `\\?\Volume{...}`, the machine by its own name or another address, and a
PowerShell parameter written with the path glued on (`-LiteralPath:<path>`).

### VCS-12

**A retired but load-bearing folder gets a tombstone naming its status, its remaining consumers,
and who may remove it.**

The tombstone is a file at the folder root: status · date · **remaining consumers by `file:line`**
· who may remove it. Each consumer gets a Doctor claim asserting it still exists, so the tombstone
can be lifted the day it does not. Nothing new may point at a tombstoned path; a consumer newer than
the tombstone date is a defect.

### VCS-14

**A frozen reference stays byte-clean; a dirty frozen tree is a failure.**

A frozen reference — a proven implementation, a set of golden test vectors, a retired version kept
for comparison — is valuable precisely because it does not change. *Example of the shape:* a
reference holding the golden vectors for cross-language math carried seven modified files and new
source for three months. **Mechanism:** the Doctor reports `frozenDirty` for every path in the
brain's `frozenPaths`, and the guard hook denies edits under them (same residual as `SAFE-09`).

### SAFE-06

**Never tidy, commit, reset or consolidate a dirty or untracked tree on your own initiative; some
are dirty on purpose to protect something that works.**

A dirty tree is a signal, not a mess. The owner may be holding a working state that is not yet
committed, or protecting a frozen reference from a sweep. An agent that encounters one reports the
state — modified, untracked, ahead — and stops. An autonomous loop does not start on one
(`AUTO-12`). A sweep that would touch many repositories (adding a `.gitattributes`, say) skips the
dirty ones and says so, then revisits each as its tree comes clean.

**Mechanism:** guard rule 7 (`hooks/guard.mjs#dirty-tree`) refuses `reset --hard`/`--merge`/`--keep`,
`checkout -- <path>` (or `-f`, or `.`, or a path that exists), `restore` without `--staged`,
`clean -f`, `switch --discard-changes` and `stash` while `git status --porcelain` in the command's
folder is not empty, and `stash drop` / `stash clear` always. It follows a `cd` earlier in the same
command line. **Cannot see:** nested shells, scripts on disk, aliases, a commit or `add -A` made
on the agent's own initiative (that part of the rule stays a judgement), and a folder change by
any route other than `cd`, `Set-Location`, `pushd` or `chdir`.

---

## Part 5 — Secrets

### SAFE-01

**Secrets live in an ignored secrets file and never enter a commit; a leaked token is rotated
first and removed second.**

Tokens, webhooks, keys and passwords live in a `.env` (or equivalent) that `.gitignore` covers,
read through the environment, never hardcoded. **If a token leaks: rotate first, then remove.**
Assume it is already public; a history rewrite does not un-publish anything.

*Lesson.* A bot repository had a live token committed in its entry file. The sibling bot, built the
same week, did it correctly with an ignored `.env`. The difference was not knowledge; it was that
nothing stopped the first one.

### VCS-07

**No secret in a tracked file; a deliberate exception is registered, never silent.**

**Mechanism (the guard hook's staging rule).** On `git add` or `git commit -a`, every argument is
tested against `*.env`, `*.env.*` (not `*.env.example`), `*.key`, `*.pem`, `*.p12`, `*.pfx`; a
wildcard add (`.`, `-A`, `-u`, a directory) lists the untracked, un-ignored files under it and tests
each. A pathspec with magic, one that starts with `:` (`:/`, `:(top)`, `:(glob)…`, `:!x`), is listed
the same way and git reads the magic, so `git add :/` from any folder covers the whole work tree
from the top level, as `-A` does (since 2026-10-15, CR-2026-10-15-GAPS review; before, such a
pathspec was neither a wildcard nor a folder, was never listed, and staged an untracked `.env`). The
rule reads the folder the git command runs in: a `cd`, `Set-Location`, `sl`, `pushd`,
`Push-Location` or `chdir` earlier in the same command line moves it to a folder that exists, so
`cd <repo> && git add -A` is probed in that repository (since 2026-10-15, CR-2026-10-15-GAPS D1;
before, the probe ran in the tool call's folder and missed the secret). A target the hook cannot
find (a variable, a substitution, a folder the same command makes) leaves the folder where it was,
so `cd "$(git rev-parse --show-toplevel)" && git add -A` is still probed from the tool call's
folder. The write rule denies writing a `.env` that is not ignored, or that is already tracked (with
the untrack remedy). A deliberate exception — one tracked secrets file by owner ruling — is listed
in the brain's `secretExceptions`, and the Doctor pins the root's Read denies on secret paths. The
clause record names `hooks/guard.mjs#stage-secret`; the write rule is the separate anchor
`#env-write`, and no clause record names it.

**Residual, written here so nobody believes otherwise:** the guard tokenises the command it is
given. `cmd /c "…"`, `pwsh -c "…"`, `bash -c "…"` nested strings, `xargs`, `$(…)`, backticks, user
git aliases, and scripts the agent writes and then runs are **not inspected**. A folder change by
any other route (`popd`, `Pop-Location`, a `cd` inside a nested shell) is not followed, and a file
the same command line creates before a wildcard `git add` does not exist yet when the hook probes.
The write rule reads Edit, Write and NotebookEdit calls only: a `.env` that a shell command writes
(a redirect, `Set-Content`, `cp`) is not inspected there. The staging rule catches a new one when
it is staged by name or by a wildcard add. A `.env` that git already tracks is in no untracked
list, so a wildcard add or `git commit -a` that stages a change to it is not refused; only a
`git add` that names it is. A pathspec read from a file (`--pathspec-from-file`) is not read. The
history rule reads `git push`; `git send-pack` (a force or a remote branch delete) is read only by
rule 11, on a loop branch, so off a loop branch it is not refused. The
self-tests assert the nested forms, the shell write and the tracked wildcard add as *not denied*.
The honest grade is therefore HOOK, not DENY.

**The proof step after a first push.** Local checks — `.gitignore` covers it, the staged list omits
it, a scan finds no secret string — are hygiene, not evidence of what landed on the remote. Query
the remote's own file listing and confirm the secrets file is absent. That one step is the
evidence.

**Also in the guard, under no clause.** The guard refuses history destruction
(`hooks/guard.mjs#git-history`: `gc --prune`, `reflog expire`, a force push, a remote branch
delete). No clause in `law.json` names this rule. It is a kit default, so it is not in the
`LAW.md` grades.

---

## Definition of done

A repository is integral when: it has a remote you own · it is not shallow · it is pushed · its
bytes are pinned by `.gitattributes` · no secret is tracked · every fact a document asserts about
it is either generated or carried by a claim.

**Run the Doctor. If it is not GREEN, this law is not satisfied — and if it reports
COULD-NOT-LOOK, that is not a pass.**

## No count in a rule, checked by the generator (0.1.25, CR-2026-10-13-HONOUR)

SKIN-07 is enforced by the law generator (`tools/law/build-law.mjs#no-count`): a clause's rule
text may not carry a count, a number followed by a plural noun (`94 repositories`, `18 sites`),
nor any number of two or more digits. A bare single digit still warns, so a threshold is seen
before it is accepted. The scope is the rule text and the generated `LAW.md`; prose in an owning
file may cite a measurement with its date, because a sentence with a date is a record, not a law.

## The restore drill and the tombstone, as claims (0.1.26, CR-2026-10-13-HONOUR)

VCS-06 is enforced by the Doctor claim type `file_fresh` (kit claim `KIT-RESTORE-01`, brain
template `RESTORE-01`): `records/restore-drill.log` must exist and its last dated line must be
younger than `maxDays`. The drill itself is four commands: clone the remote into a fresh folder,
compare HEAD with the working copy, count the tracked files, append one dated line. The kit ran
its own on 2026-10-13 and the line is in the log.

VCS-12 is enforced by the claim type `config_paths_each` (kit claim `KIT-TOMBSTONE-01`, brain
template `TOMBSTONE-01`): every path under `tombstonedPaths` in `doctor.config.json` holds a
`TOMBSTONE.md` with `status:`, `consumers:` and `remove:` lines. An empty list passes and says so.
