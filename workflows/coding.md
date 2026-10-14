# Coding and build tasks — how a build runs

This file owns `DES-05`, `DES-07`, `DES-10`, `DES-11`, `DES-12`, `VOICE-05` and `GAME-11` to
`GAME-14`. The law behind it is `instructions/design-methodology.md`; this file is how a session
applies it.

## The prime directive

### DES-05

**Build the smallest slice that works, then show the owner; never over-engineer the slice and
never skip the design.**

Design first, then the smallest slice. Interview → manifest → architecture map → one chunk at a
time → cross-check. Find the smallest useful slice of the first chunk, build it, show it, then
interview about the next step one question at a time (`OWN-04`). Add no work for a possible future
need and write no abstraction before you need it; but do not skip the interview, the manifest or
the domain split to get there faster. Design-first gives context economy; it never gives
permission to over-engineer or to delay.

Give a short explanation, then build: one or two sentences about the plan, not an essay. State in
one sentence what the result is for; skip that for a trivial edit. A result should fit one screen
of explanation.

**The gate for tools.** Where a wrong output costs money, safety or trust, add the adversarial gap
review before any code (`workflows/design-gate.md`). Everything else is still designed; it skips
only that extra pass.

## Subagents: a brief, a routed model, a cap

### DES-11

**A subagent starts only with a brief that names the goal, the files or area, the done-check and
what is ruled out; its model follows the brain's role table unless the call names one; more
spawns than the cap in one turn ask the owner.**

The mechanism is `hooks/agent.ps1`, on every call to the Agent tool. The tunables are in
`<brain>/agent-policy.json` (the kit template is the default until a brain has one).

**The brief contract.** Four headings, each at the start of its own line: `Goal:`, `Files:` (or
`Area:`), `Done when:`, `Ruled out:`. A search-type agent (`Explore`, `claude-code-guide`) needs
only `Goal:` and `Done when:`. A brief without them is refused with the missing headings named,
and the spawn is re-issued in one turn. The brief is the only context a subagent has; it does not
get the entry path, and it cannot see the reasoning that produced it.

**Routing.** When the call names no model, the hook sets one from the role table: searches go to
the fastest tier, routine builds to the middle tier, review, planning and anything design-shaped
inherit the session model. A model named on the call always wins. The table is the owner's, and a
change to it is a Change Request on the brain, not on this file.

**The cap.** Spawns are counted per turn. Above the cap the hook stops and asks, naming the count
and the models so far. The number is in the policy; the default is eight.

**Why the old rule went.** Until 2026-10-08 this clause said *more than one file means more than
one agent*. Measured over two weeks on the first instance: 516 spawns, 97% inheriting the most
expensive model, median brief 3,400 characters with no done-check, one session spawning 33. A
rule that fans out by file count optimises wall-clock and bills every agent for context the parent
already had. The replacement: **parallelise independent decisions, not files.** Several files
that serve one decision are one agent's job. Anything deterministic (a generator, a checker, a
rename across files) is a script, not an agent. Where one file genuinely depends on another, work
in sequence. After a fan-out lands, one more pass cross-checks the composition against the
manifest and the full diff (`GATE-05`): each agent proved its own piece, and nothing has proved
the whole.

## The law arrives by route

### DES-13

**A session is handed the law for its task by route: the generated index rows for each matched
group, once per session, with the owning file named; the full rule set is never loaded at
start.**

The mechanism is `hooks/route.ps1` on every prompt and `hooks/subagent.ps1` at every subagent
start; the tunables are `<brain>/route-policy.json` (the kit template until a brain has one).

**How it routes.** Each prompt is matched, whole-word, against the words the policy lists per law
group, and the session's working folder can name groups too. A group that becomes active is
injected once: its rows from `LAW.md`, one clause per line with its grade, then the owning files
resolved to real paths. Routes stick for the session, because most prompts are follow-ups that
name nothing ("yes", "make it larger"); a later prompt adds only groups not yet active. The
entry hook clears the session's routes on compaction so the next prompt re-injects. A subagent
receives, before its first prompt, the groups active in the session that spawned it plus the
groups the policy marks always-on (the prohibitions by default).

**What stays at session start.** The entry path (`<brain>/entry.json`) now lists only what
cannot be routed: the personal layer, who the owner is and how they write. Everything that is a
clause arrives by route; the full text is one path away in the injected block.

**Why.** Measured on the first instance on 2026-10-08: the entry path was eight files, 1,848
lines, roughly 35k tokens if read, and a model either spent that before opening the code or
skimmed and read none of it in particular. A group's rows are 150 to 900 tokens; the whole index
is about 6k. Routes that stick covered 91% of 1,985 prompts over two weeks; the prompt alone
covered 34%. `PRIN-01` is the principle; this clause is its first mechanism.

## Skills before an empty start

### DES-12

**Match the task to an installed skill before building from an empty start, by reading the
installed skills directory itself rather than a list in a law file.**

A skill encodes conventions that are otherwise re-derived badly. Before building from nothing,
list the installed skills directory and read the descriptions against the task. **The directory is
the index.** A list of skills written in a law file goes stale the week after it is written, and an
agent that trusts it will report a skill as missing because it looked where the list said rather
than where the skill is. Absence is a claim and needs the same proof as presence (`VCS-01`).

## Defaults

- **Split by domain, config beside logic.** Each domain folder holds its logic and its `.json`. The
  file-size rule lives in `instructions/design-methodology.md` (`DES-03`); do not copy the numbers
  here.
- **Config in `.json`, never hardcoded** (`DES-04`). A change of behaviour must not need a change of
  code.
- **A dependency only for a real reason, and only by owner decision** (`GATE-03`). Keep the list
  short; the structure is not optional.

### DES-10

**Install with the fail-on-drift verb, never the resolve-fresh verb, and pin the toolchain as well
as the dependencies.**

A committed lockfile that the install command ignores is the purest form of a check that cannot
fail. The locked verbs: `npm ci` — never `npm install` — for any build or fresh clone; it installs
exactly the lockfile and errors if lockfile and `package.json` disagree · `uv sync --locked` /
`uv run --locked`, which error on a stale lock instead of rewriting it · `cargo build --locked` for
a release and `cargo install --locked` **always**, because `cargo install` otherwise ignores the
lockfile entirely. **Write the exact command into the repository's `HANDOFF.md`** so no agent
guesses. This costs one different word in a command you already type, and it turns silent drift
into a loud error.

**Pin the toolchain, not only the dependencies.** The usual cause of "works on my machine" is a
different compiler, interpreter or engine, not a package version. One small file per repository,
added as you touch each project: Rust `rust-toolchain.toml` (rustup switches on `cd`, on every
clone) · Python `.python-version` (uv honours it) · Node `.nvmrc` plus an `engines` field · Godot
the exact editor version, suffix included, written into the manifest — a `4.x.stable` editor needs
`4.x.stable` export templates, or every export is blocked.

## Documents are part of the product

### DES-07

**Documents are co-equal artifacts, updated before the work is called done; document debt is
technical debt.**

`DECISIONS.md`, `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md` and `CHANGELOG.md` are part of the
deliverable, not an addition after it. **Update `HANDOFF.md` when each chunk completes; do not wait
for the end of the build.** On a long build, write the completed work, the next work and the
owner's stop point after every real milestone, because a session can end at a usage or token limit
mid-work and the next agent must resume from the document alone.

A stale document is a defect, not untidiness, and the hand-off goes stale first. When a document's
job is to orient someone who was not there, it holds a pointer to the live source (the change log,
the git log) rather than a copy that rots silently. When a correction lands in one file, search the
whole repository for the same claim before calling it fixed. *Example of the shape:* a project's
hand-off still said "chunk 0 built, next: core loop" weeks after five major systems had shipped, in
the one place a fresh agent is told to trust.

## Commits

### VOICE-05

**Commit messages are short, present tense and specific; the house writing standard governs the
rest but not tense, so tense is specified in the owning file.**

"Correct the fence claim", not "Corrected the fence claim" and not "Updates". The adopter's
writing standard (the brain's `voice.md`) governs the rest — active voice, one word one meaning, no
idiom — but a writing standard does not set tense, so **tense is set here: present**. One commit,
one subject; the body, if any, says what forced the change (`DES-08`).

## Hats and gates

The build roles and the two review gates. Written for game repositories first, where code before
the spec is the characteristic failure; they apply to any repository with a spec.

### GAME-11

**State the hat you wear and wear one at a time; the Programmer hat stays locked until an
owner-approved spec exists.**

A hat is a named role. State the hat when it changes. Each hat has its own concerns and can refuse
the others.

| Hat | Owns | Refuses |
|---|---|---|
| **Creative Director** | Vision, scope, core-goal alignment. Has the authority to refuse. | Features that do not serve the core goal; a scope increase dressed as polish |
| **Designer** | Mechanics, economy, pacing, the user's next recurring decisions | Dead mechanics; anything not explainable in one sentence |
| **UI/UX** | The project's UI contract and its reference | Ad-hoc placements; a layout the contract does not permit |
| **Programmer** | The approved spec *only*: domain split, config in files, strict typing, one-way state → render | Unrelated refactors; hardcoded tunables; work on an unapproved design |
| **QA** | Edge cases, affordances, logs, the negative space — what does **not** run | "It compiled" as evidence; silent failures |
| **Reviewer** | A read-only adversarial score of a story against its acceptance and the verify gate (`instructions/autonomy-law.md`) | Any edit; any pass without evidence |

**The Programmer hat stays locked** until the Creative Director, the Designer and UI/UX have
produced an owner-approved spec. A hat is a stance in one context, not a reason to start more
agents.

### GAME-12

**The inner gate runs after every small verifiable change (verify, stop, show what changed and
what it proves, wait), the outer gate runs at every chunk boundary, and only a trivial,
reversible, owner-requested single-file edit is exempt.**

- **Inner gate** — after every small verifiable change (one story, one slice of a chunk): run the
  repository's verify gate, then **stop**. Two lines: what changed, what it proves. Wait. Do not
  combine three stories into one silent sequence. The owner holds this gate by default; in an
  approved loop the Reviewer holds it (`AUTO-05`). The gate is never removed.
- **Outer gate** — at a chunk boundary: run the cross-check (`GATE-05`), summarise the design state,
  map it to the manifest, **then ask before continuing**. Here design drift becomes a Change Request
  and not a surprise.
- **Exception:** a trivial, reversible, single-file edit the owner requests directly. Make it.

Speed is not a reason to skip a gate.

### GAME-13

**A session on a game repository opens with a state card built from the repository's documents,
never from memory, and a disagreement with the real state is raised before any work.**

Before any work, post: **hats in play · current milestone and position in it · decisions locked so
far · what is next.** Take it from `HANDOFF.md` + `DECISIONS.md` + the story ledger — never from
memory. If those sources disagree with the repository's actual state (`git status`, `git branch -a`,
what runs), say so before continuing. A stale hand-off is a defect, the same as a silent failure.

**The mechanism** is the session-start hook. When a session starts inside a game repository,
`hooks/entry.ps1` prints the card's machine half after the entry path: what git says (branch,
uncommitted, unpushed, last commit), what the manifest says (the core goal, the Build Timeline
position, the last Change Log row, the open questions) and what the hand-off says (its state and
next sections), each document with its age in commits. A hand-off far behind HEAD is flagged
STALE. A part that is not there is named as missing. You post the card, add the hats in play, and
name any disagreement before the first edit.

Which repositories are game repositories is the brain's `route-policy.json`: a top-level folder
mapped to the `GAME` group in `folders`, and `stateCard.groups`. Written limits: the card fires
only when the session starts in the repository, and most sessions start at the root, where you
build the card by hand from the same documents; the hook reads the documents' shape, not their
truth; a document that is many commits old is old, not necessarily wrong.

### GAME-14

**Cite the pattern or do not claim one; a pattern the cited reference does not contain is labelled
as from memory, not from the reference.**

When proposing a UI or a system, name the pattern and the document that records it: "commitment-
point pattern — `reference/deep_dives/<file>.md`". Never attribute a pattern to a reference that
does not contain it. If it comes from your own knowledge, label it: *"from memory, not the
reference."* `SAFE-04` applies to evidence, not only to numbers. Needing the same missing case study
repeatedly is a request to write it, not permission to invent it. For the current contents of a
reference, read its own index (`SKIN-07`), never a count written in a law file.

## Definition of done

`GATE-07` in `instructions/design-methodology.md`. Code that runs is not done.

## The commit message, checked at commit time (0.1.25, CR-2026-10-13-HONOUR)

VOICE-05 is enforced by the commit-msg shim (`tools/vcs/law-claim.ps1#commit-message`) in every
repository the shim is installed in: the subject line is 72 characters or fewer, its first word is
not past tense (Added, Fixed, Updated and their kind), and it is not a bare placeholder (Update,
WIP, changes). A merge or a revert is exempt. "Specific" is not graded; a person reads that.
Tunables: `commitMessage` in the brain's `doctor.config.json`.
