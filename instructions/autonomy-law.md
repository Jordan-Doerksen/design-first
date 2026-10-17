# Autonomy law — what an agent decides alone, and what stops the loop

This file owns `AUTO-01` to `AUTO-13`. It has the same rank as `instructions/design-methodology.md`
and does not restate it, `instructions/interview-every-add-law.md`, the hats and gates in
`workflows/coding.md`, or `instructions/observability-law.md`. Those stay in force unchanged. This
file says **which of their gates an agent may occupy**, and which stay with the owner.

**The problem it solves.** The other laws put the owner in every gate: the interview ("the human
decides"), interview-every-add ("every addition, however detailed the prompt"), the inner gate
("verify, stop, show, wait"). Together they make an unsupervised run illegal. That is correct for
**design**. It is not correct for **execution**, and the cost is that the owner is the only
verifier, so the work stops when they stop.

---

## 1. The two classes of decision

### AUTO-01

**A design decision is the owner's and an execution decision is the agent's; if it is not clearly
execution, it is design.**

The seed is `OWN-05`: do not ask an implementation question the owner cannot answer; when one
answer is defensible, choose it, record why, make it a config value. This clause gives that rule a
scope.

**Owner decisions — the loop STOPS:** any change to the manifest except an append to the Change
Log · new scope, mechanic, system or dependency · taste (a name, a tone, a palette, feel) · any
Change Request · a push or a merge · a delete, move or consolidation of any file · any project on
the brain's design-gate list · any secret or credential · any change that weakens an acceptance
criterion, test or probe.

**Agent decisions — the loop PROCEEDS and records the reason:** the implementation of an approved
story · an internal mechanic with no owner-visible change · a file split inside the current domain
(`DES-03`) · naming inside a domain · a **new** probe or test that **adds** an assertion · the value
of a tunable, put in config with the reason recorded.

### AUTO-02

**The loop stops at a manifest change, new scope, taste, a Change Request, a push or merge, a
delete or move, a design-gated project, any secret, or anything that weakens a check.**

This is the owner list above, as the stop condition. The loop also stops when every story in the
chunk passes, when a story is `BLOCKED`, or when the verify gate cannot run. Deletions are owner
decisions because of the three deletion guards (`GATE-11`–`GATE-13`); weakening a check is Goodhart
by definition.

---

## 2. The unit of work

### AUTO-03

**The unit of work is a story, not a chunk; the chunk stays the stop boundary.**

A chunk is a size. A story is a machine-checkable condition with an `acceptance[]` list, held in a
machine-readable ledger beside the manifest (for example `docs/specs/<chunk>.tasks.json`). The
ledger is the machine-readable half of the manifest; `DECISIONS.md` is the prose half.
**Selection:** the lowest `priority`, then the lowest `id`, where `passes == false`. The story is
the step; the chunk is where the loop stops and the owner looks.

---

## 3. The `passes` contract

### AUTO-04

**Only the Reviewer's verdict writes the pass mark, never the Builder; a Builder that edits the
ledger voids its own attempt.**

In practice the **harness** writes `passes` when the Reviewer returns `PASS`, so the Reviewer needs
no write access at all. That is stricter than "the Reviewer writes it", and it is the required form.
If the Builder edits the ledger, the attempt is void: the harness compares a hash before and after,
restores the file from git, and records a `FAIL`. A Builder cannot make its own target easier, even
by accident. No agent edits the `title`, `description` or `acceptance[]` of an existing story; that
is a Change Request. Adding a story is an owner decision.

### AUTO-05

**The Reviewer is a separate agent with a read-only tool set, defined in the kit's reviewer
agent file, not as a sentence.**

The Reviewer is not the Builder in a different stance. A green result from the agent that wrote the
code is not a cross-check. A hat is a stance; this separation is a **permission**, and a permission
exists as a file. The kit ships the definition at `agents/reviewer.md` with a read-only tool list
(`Read, Grep, Glob` — no Write, no Edit, no shell). The plugin registers it as the agent
`design-first:reviewer`. No copy is placed in the brain. The tool allowlist is what makes this
rule enforced rather than written, and a kit claim checks that line.

**There is one Reviewer file.** Until 2026-10-08 the first instance had two: this one, and an older
one in the root's own agents folder. They had drifted: the older one gave the three verdicts this
file defines, and the kit's gave a fourth and had no `BLOCKED`. A second definition of the Reviewer
is a defect, for the reason in `PRIN-05`. A brain that wants to be sure asserts the other file is
absent.

A loop runner that starts its Reviewer as its own process, not as a subagent, uses this same file:
it reads the body of `agents/reviewer.md` (through the pointer's `pluginRoot`, front matter dropped)
and adds only its own input and output contract, which the Output section allows. The front matter,
and with it the tool line, does not reach such a process: the runner's own command must hold the
Reviewer to the same read-only tools with no shell, and the kit claim on the tool line does not
check that command. The subagent hook does not fire for such a process, so the runner hands over the
`advise-by-role` clauses itself, read from the files the hook reads. A runner that cannot read the
file does not start a review (COULD-NOT-LOOK).

The independence comes from a **fresh context**, not a second person: a reviewer in a fresh
sub-agent context sees only the diff and the criteria it is given, not the reasoning that produced
the change. This is the one adversarial practice that does not need a second human. Tell it to flag
correctness and stated-requirement gaps only; a reviewer prompted to find gaps will report some even
when the work is sound.

**The verify gate is run by the harness, not by either agent.** An agent with a shell can write
files whatever a deny list says, so a Reviewer that runs the gate is not read-only. The gate moved
to the harness, and the Reviewer lost its shell.

| Hat | Owns | Refuses |
|---|---|---|
| **Reviewer** | A read-only adversarial score of the Builder's story against `acceptance[]` and the repo verify gate. Its verdict is the only thing that sets `passes`. | Any edit to source, tests, config or acceptance. Any claim of a pass without evidence. "It compiled." |

**The verdict is one of three:** `PASS` · `FAIL(reason, file:line)` · `BLOCKED(owner decision
required)`.

### AUTO-06

**Evidence means the command and its literal output, pasted; a model's claim that something passed
is not evidence.**

`passes: true` needs two conditions: the repo verify gate is green, **and** every line of
`acceptance[]` has evidence — a `file:line`, a probe name, or a log line — with the exact command
that was run and what it returned. Measured across 2,031 sessions and six frontier models, default
compliance with an unmonitored process instruction was **0 %** — one model verbally agreed ten out
of ten times and bypassed the instruction in all ten — and compliance reached **97 %** only when an
audit trail was rewarded. **The record is the mechanism, not documentation of it.**

### AUTO-07

**A deterministic check sets the pass mark; a model verdict may only add a finding, never clear
one.**

A test exit code, a build exit code, or a script diffing output against a fixture sets `passes`. A
judge can raise a `FAIL` the gate missed — judges beat held-out tests at spotting reward hacking —
but a judge verdict alone never sets `passes: true`. Language-model judges carry measured
self-preference bias that grows with capability, and systematic position bias. Confident is not
correct. Score on the **exact** success code, never on "not zero": for one common test runner, 1 is
a real failure and 5 is "nothing was collected", and a renamed test that selects nothing exits 5.

### AUTO-08

**A green verify gate is the floor, not the proof; a green gate with no new probe covering this
story's behaviour is a fail.**

A green gate says the code parses, boots, and passes the probes that already existed. It does not
say this story was built. The Reviewer fails a story whose behaviour no new probe exercises. And a
new probe counts only once it has been proven to go RED: restore the defect in a scratch copy,
confirm the probe fails, name the assertions that fire. A probe that cannot fail reports a safety it
cannot prove.

Nothing in the kit does the RED proof: the kit Reviewer has read-only tools and runs nothing
(`agents/reviewer.md`).

### AUTO-09

**Where a story is about feel, motion or appearance, a person is the gate, because a read-only
reviewer cannot look at a screen.**

Mark those stories as owner gates in the ledger. A static mockup validates layout; it cannot
validate timing, weight, contrast or impact. In one recorded case, minutes of real play found what
hundreds of commits of document work had not: the project would not open from its own launcher,
the backdrop out-contrasted the actors, and the pickups out-shone every threat. **Change one value,
run it, look.** Every interim hand-off also states what is *not* built yet, or a plan reads as a
bug.

---

## 4. The loop

**Phase 0 — the baseline.** Run the verify gate **before** the first story and record the result.
A red baseline refuses the run. A story passes only on a green gate (`AUTO-06`), so a gate that is
red before the loop starts would fail every story and blame the Builder for debt it did not make.
Fixing the gate is its own owner-approved chunk, as for a missing gate (`AUTO-12`). The loop makes
its branch only after the baseline is green, and a refused run leaves the repository on the branch
it was on. *(2026-10-15, CR-2026-10-15-GAPS D3: until then this paragraph allowed
"baseline debt" and failed a story on new debt only, which contradicted `AUTO-06` and the Reviewer
file; the strict reading is the one a loop runner holds.)*

**Then, for each story:** (1) the Builder reads the manifest, the architecture map and the story,
in a **fresh context** · (2) implements **that story only**, under the during-coding rules of
`DES-06` · (3) the harness runs the verify gate · (4) the Reviewer scores: `PASS` → the harness
writes `passes: true` and commits, **one story, one commit** · `FAIL` → back to the Builder,
**three attempts maximum**, then `BLOCKED` · `BLOCKED` → stop · (5) next story.

### AUTO-10

**Each story starts a fresh context; state lives on the disk, not in the context, and a reset
beats a compaction.**

A long context causes two failures: the agent runs out of room mid-story and leaves a half-built,
undocumented feature; later, an agent sees that progress exists and declares the work complete.
**The state lives on the disk** — the manifest, the ledger, the git log, `HANDOFF.md` — never in
the context.

### AUTO-11

**The loop works on its own branch and never pushes and never merges.**

The loop creates `harness/<chunk-slug>` and commits there freely. The push and the merge are the
owner's: the hand-back that gives them to the owner is `AUTO-13`. *(2026-10-15, CR-2026-10-15-GAPS
D7: until then this clause also carried the hand-back and printed HOOK for both halves, but guard
rule 11 refuses a push or a merge and writes no card and no command.)*

### AUTO-12

**No verify gate, no loop; nor on a design-gated project, a chunk with open questions, or a dirty
tree.**

The loop does not start on: a project with no verify gate (writing the gate is its own
owner-approved chunk) · a verify gate that is red before the first story (Phase 0) · a project on
the brain's design-gate list · a chunk with an unresolved item in the manifest's Open Questions
table · a repository with a dirty or untracked tree — report the state and stop (`SAFE-06`).

A loop runner reads the brain's design-gate list from one file, `design-gate.json` at the brain's
root (a `gated` array of folders under the root). It reads that file through the pointer, treats a
linked worktree as the repository it was made from, and refuses every run with COULD-NOT-LOOK when
it cannot read the file: an unread list is never "nothing is gated". The runner keeps no copy of
its own. Guard rule 10 (`hooks/guard.mjs#design-gate`) does
not read this list: it reads a different fact, the `Design gate: on` line in the repository's own
`DECISIONS.md`. The kit does not ship or check `design-gate.json`; a brain that has one checks it
with its own claim.

### AUTO-13

**The loop ends with a state card in HANDOFF.md and the exact push command for the owner.**

At the stop the loop writes a **state card** — hats · the chunk · stories passed · stories blocked
· what is next (the same card as `workflows/coding.md`, "Hats and gates") — into `HANDOFF.md`, and
prints **the exact push command** for the owner to run. The owner reviews one branch, not forty
chunks.

**Grade: BUILDABLE** (since 2026-10-15, CR-2026-10-15-GAPS D7; until then the second half of
`AUTO-11`, at HOOK). No kit code writes the card or the command, and no kit check reads that a loop
wrote them: this is loop-runner behaviour (DECISIONS.md 2.8), like `AUTO-02`, `AUTO-07`,
`AUTO-08`, `AUTO-10` and `AUTO-12`. A brain whose runner writes them re-grades `AUTO-13` in its
`law.overlay.json`, against a claim that reads the runner.

---

## 5. Definition of done for a loop run

Every story in the chunk has `passes: true` with evidence · the verify gate is green · the
cross-check (`GATE-05`) is run and recorded · `HANDOFF.md` carries the state card · the branch is
unpushed and the push command is in the report · the run log exists and names what did **not** run
(`OBS-03` applies to the loop itself). The kit does not run or record the cross-check for a loop:
the kit's Stop card asks for it only at the end of an agent turn and records no answer (its line in
the fence log says only that a card was given). A run that
stops with every story passed has not met this list until the cross-check is run and recorded in
`HANDOFF.md`.

A deviation from any rule here is an architecture change: file a Change Request (`GATE-06`) naming
the rule and the reason.

## The loop branch is the fact the guard reads (0.1.24, CR-2026-10-13-HONOUR)

AUTO-11 and AUTO-04 are enforced by guard rules 11 and 12 (`hooks/guard.mjs#loop-no-push`,
`hooks/guard.mjs#ledger`). Both read branch names from git, never a marker file: a branch that
starts with the loop prefix (brain config `loopBranchPrefix`, default `harness/`, the prefix the
harness loop creates) is the loop branch. On it, `git push`, `git merge` and `git pull` are
refused, and an Edit, Write or NotebookEdit to the story ledger (`loopLedgerGlobs`, default
`docs/specs/*.tasks.json` and `specs/*.tasks.json`) is refused. Commits are not touched: the loop
commits freely. The harness writes the pass mark with its own process, never through a tool
call, so the rule binds only an agent reaching for the ledger through Edit, Write or NotebookEdit.
A Bash or PowerShell command that writes the ledger (a redirect, `Set-Content`, `Copy-Item`, a
script) is not seen by rule 12; for that case the law's only check is the harness's hash compare
and restore (`AUTO-04`). Off the loop branch, rule 12 does not fire, and rule 11 still reads the
command, as the next paragraph says. Rules 11 and 12 bind only a process that loads the kit's
hooks, and an internal guard error allows the call (`hooks/guard.mjs`).

**Rule 11 from any branch (2026-10-15, CR-2026-10-15-GAPS D1).** The loop's work leaves by a push
or a merge that names its branch, so rule 11 does not wait to be on it. From any branch it refuses
a `git push`, `git merge` or `git pull` whose arguments name a loop-prefixed ref (`harness/x`,
`HEAD:harness/x`, `refs/heads/harness/x`, `origin/harness/x`), and a `git push --all`,
`--branches`, `--mirror` or glob refspec that covers a loop branch the repository holds. On a loop
branch it refuses a `git checkout` or `git switch` that leaves it: to another branch, to a new
branch without the prefix, or to a detached HEAD. A target stays on the loop only when it is the
short name of a local branch with the loop prefix (`refs/heads/` holds it): a revision such as
`harness/x~0`, `harness/x^0` or `harness/x@{0}` and a loop-prefixed tag detach HEAD and are
refused. A loop-prefixed name with no local branch is refused too, also where git would guess a
new branch from a remote one; `git switch -c harness/x origin/harness/x` names the new branch and
passes (since 2026-10-15, CR-2026-10-15-GAPS review; before, a prefix match on the whole revision
let `git checkout harness/x~0` detach HEAD, and from there `git push origin HEAD:main` passed).
With `--track` and no new name, git names the new branch itself (it drops `refs/`, `remotes/` and
everything up to the first `/`), and only that name counts: `git checkout -t origin/harness/x`
makes `harness/x` and passes, and `git checkout -t harness/x` makes `x` at the loop commit and is
refused. `git checkout -` passes only when the previous branch is still a local loop branch; when
it is gone and a loop-prefixed tag has its name, git detaches HEAD at the tag, and it is refused
(both since the check of the review fixes, 2026-10-15; before, both passed). A
new loop-prefixed branch, a switch to a local loop branch and a checkout of files stay allowed, and
so does a checkout of `HEAD` (or `@`) or of the loop branch HEAD is on, which leaves HEAD where
it is (since the second review of CR-2026-10-15-GAPS; before, `git checkout HEAD` was refused as a
switch off the loop). A rename, copy or forced move of a branch (`git branch -m`, `-M`, `-c`, `-C` or `-f`)
and a ref written by hand (`git update-ref`, or a `git symbolic-ref` that writes or deletes a ref)
are refused on a loop branch whatever they name, and from any branch when they name a loop-prefixed
ref (`git branch -f main harness/x`, `git update-ref refs/heads/main harness/x`). A list, a read, a
delete and a move that names no loop ref pass (since the second review of CR-2026-10-15-GAPS;
before, `git branch -M harness/x main` took HEAD onto `main` with the loop's work, and the next
`git push origin main` passed). On a loop branch, a `git worktree add` whose new worktree is not on
a loop branch is refused: a detached worktree (`--detach`, `HEAD`, a sha, a tag), another branch,
or the branch git names after the folder when no start is given; one on a new loop-prefixed branch
(`-b harness/y`) or on a local loop branch passes (since the check of the second review; before,
`git worktree add --detach ../wt HEAD` and then `git -C ../wt push origin HEAD:main` passed,
because the new folder is on no loop branch). On a loop branch, a `git rebase` that names a branch
to check out that is not a local loop branch (`git rebase <upstream> <branch>`,
`--onto <new> <upstream> <branch>`, `--root <branch>`; `HEAD` and a sha are no branch to git,
which rebases them at a detached HEAD), `git bisect` (except `log`, `visualize`, `terms`, `help`,
and a `reset` with no commit while no bisect runs), and a `git fetch` whose refspec writes a local
branch (`git fetch . HEAD:main`; `.` is this repository) or whose refspecs come on standard input
are refused; from any branch, a `git fetch` whose destination is a loop-prefixed local branch, or
a glob that can cover one, or that writes a local branch from a loop ref (`git fetch . harness/x:main`)
is refused. A rebase with no branch argument (`git rebase main`), and a fetch into a
remote-tracking ref (`refs/remotes/...`), a tag or no destination, pass (since the third review of
CR-2026-10-15-GAPS; before, `git rebase HEAD main` and `git bisect start HEAD main` took HEAD off
the loop branch, `git fetch . HEAD:main` moved `main` onto the loop's work, and the push that
followed passed). A rebase that stops (a conflict, an `edit` line) leaves HEAD detached at the
loop's work; while a rebase of a loop branch is stopped, or a bisect that started on one runs, the
rule reads the branch it goes back to as the branch HEAD is on, so everything above applies there,
and `git rebase --quit`, which ends the rebase and keeps the detached HEAD, is refused;
`--continue`, `--skip` and `--abort` pass. `git rebase --root`, `git fetch --stdin` and
`git fetch --refmap` are read in any abbreviation git takes (`--ro`, `--st`, `--refm`), and from
any branch a fetch into local branches from a glob source that can cover a loop branch
(`git fetch . "refs/heads/*:refs/heads/copy/*"`) is refused. `git send-pack`, the plumbing under
`git push`, is read as a push everywhere above (since the check of the third review; before, a
plain `git rebase main` that stopped let `git push origin HEAD:main` pass, `git rebase --ro main`
checked out `main`, the glob made `copy/harness/x` at the loop's work, and `git send-pack
<repository> HEAD:refs/heads/main` pushed from the loop branch in one call).
This also binds an interactive session that sits on a loop branch: the owner switches off it by
hand. **Residual:** the git commands that move HEAD or a branch are an open-ended set. Rule 11
reads the commands and forms named in this paragraph, listed in full in the header of
`hooks/lib/guard-loop-rules.mjs`, and **any command or form not named there is a residual**,
whatever it moves: for example, on a loop branch, `git stash branch <name>`, a `git clone` of the
repository at a commit (`--revision`), `git rebase --exec` or an `exec` line in an interactive
rebase (a command string git runs in a shell), and a long option that git accepts as an
abbreviation (`--det` for `--detach`), except the three named above. Also not seen: a loop commit
named by a sha, a tag, `FETCH_HEAD`, `@{u}` or `@{-1}` (so off a loop branch `git branch -f main
<sha>` passes); a detached HEAD at a loop commit with no stopped rebase or running bisect of a loop
branch behind it, which is no loop branch to the rule; off a loop branch, a
checkout, switch, rebase or bisect that puts HEAD at a loop commit (`git checkout --detach
harness/x`, `git bisect start harness/x main`), and a cherry-pick, rebase or reset that brings
loop commits onto another branch, also from another worktree; off a loop branch,
`git update-ref --stdin` and `git fetch --stdin`, whose refs come on standard input; off a loop
branch, a new branch, tag or worktree made at a loop ref under another name
(`git branch <name> harness/x`, `git checkout -b <name> harness/x`, `git switch -c`, `git tag`,
`git worktree add -b` or `--detach`); on a loop branch, a plain `git branch <name>` or
`git tag <name>`, and a fetch into a tag or a remote-tracking ref, each of which makes a name at
the loop's work and moves no branch (a switch to it and a push of it there are refused, but a
push of it from another worktree that already exists and is not on a loop branch passes); a
`git push` whose refspec is `:` (matching) or comes from config (`push.default` set to
`matching`, or a `remote.<name>.push` entry), and a `git fetch` whose refspec comes from config
(a `remote.<name>.fetch` entry); and the guard's shell residual (nested shells, scripts on disk,
git aliases).

**The loop's last write to `HANDOFF.md` ends with `## Next session` (DES-14, 2026-10-14):** the
exact opening prompt for the session that picks the branch up, under the state card the loop
already writes. The kit does not write this section, and no kit check reads that the loop wrote
it. The kit's state card prints the section, or says there is none, only for a session that starts
inside that repository, and only when the repository's top-level folder maps to a group listed in
`stateCard.groups` or the brain turns `stateCard.anyRepoWithHandoff` on.
