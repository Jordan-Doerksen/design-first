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

**The mechanism** is a git `commit-msg` check, `tools/vcs/law-claim.ps1`, for a brain that is a
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
**Mechanism:** the guard hook denies Edit/Write/Bash/PowerShell calls that target a path listed in
the brain's `frozenPaths` or `tombstonedPaths`. **Residual:** the path rules need a brain; without
one the guard runs its inline rules and gives one advisory per session that path rules are off. A
move performed by a script the agent writes, or inside a nested shell string, is not inspected.

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
each. The write rule denies writing a `.env` that is not ignored, or that is already tracked (with
the untrack remedy). A deliberate exception — one tracked secrets file by owner ruling — is listed
in the brain's `secretExceptions`, and the Doctor pins the root's Read denies on secret paths.

**Residual, written here so nobody believes otherwise:** the guard tokenises the command it is
given. `cmd /c "…"`, `pwsh -c "…"`, `bash -c "…"` nested strings, `xargs`, `$(…)`, backticks, user
git aliases, and scripts the agent writes and then runs are **not inspected**. The self-tests assert
these as *not denied*. The honest grade is therefore HOOK, not DENY.

**The proof step after a first push.** Local checks — `.gitignore` covers it, the staged list omits
it, a scan finds no secret string — are hygiene, not evidence of what landed on the remote. Query
the remote's own file listing and confirm the secrets file is absent. That one step is the
evidence.

---

## Definition of done

A repository is integral when: it has a remote you own · it is not shallow · it is pushed · its
bytes are pinned by `.gitattributes` · no secret is tracked · every fact a document asserts about
it is either generated or carried by a claim.

**Run the Doctor. If it is not GREEN, this law is not satisfied — and if it reports
COULD-NOT-LOOK, that is not a pass.**
