# Autonomy law — what an agent decides alone, and what stops the loop

This file owns `AUTO-01` to `AUTO-12`. It has the same rank as `instructions/design-methodology.md`
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
A failure that exists before the loop starts is baseline debt; the Reviewer fails a story on **new**
debt only.

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

**The loop works on its own branch and never pushes and never merges; it ends with a state card
and the push command for the owner.**

The loop creates `harness/<chunk-slug>` and commits there freely. At the stop it writes a **state
card** — hats · the chunk · stories passed · stories blocked · what is next (the same card as
`workflows/coding.md`, "Hats and gates") — into `HANDOFF.md`, and prints **the exact push
command** for the owner to run. The owner reviews one branch, not forty chunks.

### AUTO-12

**No verify gate, no loop; nor on a design-gated project, a chunk with open questions, or a dirty
tree.**

The loop does not start on: a project with no verify gate (writing the gate is its own
owner-approved chunk) · a project on the brain's design-gate list · a chunk with an unresolved
item in the manifest's Open Questions table · a repository with a dirty or untracked tree — report
the state and stop (`SAFE-06`).

---

## 5. Definition of done for a loop run

Every story in the chunk has `passes: true` with evidence · the verify gate is green · the
cross-check (`GATE-05`) is run and recorded · `HANDOFF.md` carries the state card · the branch is
unpushed and the push command is in the report · the run log exists and names what did **not** run
(`OBS-03` applies to the loop itself).

A deviation from any rule here is an architecture change: file a Change Request (`GATE-06`) naming
the rule and the reason.

## The loop branch is the fact the guard reads (0.1.24, CR-2026-10-13-HONOUR)

AUTO-11 and AUTO-04 are enforced by guard rules 11 and 12 (`hooks/guard.ps1#loop-no-push`,
`hooks/guard.ps1#ledger`). Both read one fact, the current branch name, from git: a branch that
starts with the loop prefix (brain config `loopBranchPrefix`, default `harness/`, the prefix the
harness loop creates) is the loop branch. On it, `git push`, `git merge` and `git pull` are
refused, and an Edit or Write to the story ledger (`loopLedgerGlobs`, default
`docs/specs/*.tasks.json` and `specs/*.tasks.json`) is refused. Commits are not touched: the loop
commits freely. The harness writes the pass mark with its own process, never through a tool
call, so the rule binds only an agent reaching for the ledger. Off the loop branch, neither rule
fires.

**The loop's last write to `HANDOFF.md` ends with `## Next session` (DES-14, 2026-10-14):** the
exact opening prompt for the session that picks the branch up, under the state card the loop
already writes. The state card hook prints it at that session's start.
