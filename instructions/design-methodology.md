# Design-first methodology — the law

This file owns `DES-01`, `DES-02`, `DES-03`, `DES-04`, `DES-06`, `GATE-05`, `GATE-06`, `GATE-07`,
`GATE-11`, `GATE-12` and `GATE-13`. It is universal: tools, apps, systems, games, toys. It applies
`PRIN-01` (context economy) to code: a giant file *is* overload; small, scoped, domain-split files
behind one manifest reduce it. The quantity of process scales with the size of the work; the
discipline does not have an off switch.

### DES-01

**Interview, then the decisions manifest, then the architecture map, then build in chunks, then
cross-check; every project, no exceptions.**

The workflow: interview → manifest → architecture map → design one chunk → cross-check → implement
the approved chunk only → validate → update the documents → next chunk.

**Phase 1 — the interview.** A structured interview before implementation, in short decision
blocks: purpose · runtime mode · data sources · execution flow · config model · risk rules · UI ·
storage and logging · testing · deployment. Each question has three or four options plus a custom
one. Record **Chosen Answer · Rationale · Affects** (which folders). The agent asks one focused
question at a time with the recommended default first (`OWN-04`), explains the trade-offs, records
the answer, names the affected subsystems, bases the next question on the last answer, and stops
when the foundational design is complete. The agent does not start coding early, ask twenty
questions at once, make silent architecture assumptions, ignore prior decisions, or change scope
without a record. The owner never has to read a document: the manifest is the *agent's* record,
written for the next agent.

**Phase 2 — the manifest** (`DECISIONS.md`, at the project root or in `docs/`, one location per
repository). It is the single source of truth; every future agent consults it before an
architectural or behavioural change.

- **Header:** Project · Started · Last Updated · **Status** (In Design / In Build / In Testing /
  Live / Archived).
- **Core Goal** — one paragraph: what it does, what problem it solves.
- **Non-Negotiable Constraints** — the cardinal rules for *this* project (for example "read-only;
  never writes to the source system", "fail-closed on stale input").
- **Chapters → Decisions:** each *Decision X.Y* = Question · **Chosen Answer** · **Rationale** ·
  **Date Locked** · **Affects** · **Change Rule** (what must be reviewed if this decision changes).
- **Build Timeline** table — `| Phase | Chunk | Dependencies | Status | Review Date |`.
- **Open Questions** table — `| Question | Why It Matters | Owner | Status |`.
- **Change Log** table — `| Date | Change | Reason | Affected Areas |`.

**Phase 3 — the architecture map** (`ARCHITECTURE.md`). One page, short enough to read before you
modify anything: **System at a Glance** (two or three sentences) · **Core Flow** as ASCII (source →
parse → logic → validation → output → logging) · **Core Domains** table
`| Domain | Purpose | Entry Point | Config File | Notes |` · **Key Design Decisions** (runtime
mode, config mutability, risk model, storage model, UI model, file-split rule) · **How to Modify a
Domain**: read the manifest → read this → open *only* that domain → check its config first → change
logic only if config cannot solve it → run the tests → run the cross-check → update the manifest.

**Phases 4–8** are the rules below: the split (`DES-03`), config (`DES-04`), the cross-check
(`GATE-05`), change control (`GATE-06`), the operating rules (`DES-06`) and the definition of done
(`GATE-07`).

*Worked example.* The owner says: "Build me a tool that watches a weather feed and posts to a chat
channel when the temperature crosses a threshold." The interview asks, one at a time: runtime mode
(real-time, recommended) · where thresholds live (a config file, recommended) · what the tool must
never do (never post more than N times an hour; go silent when the feed is stale — recommended).
The manifest records fail-closed (a stale feed posts *nothing*), the hourly cap, and that the
channel's webhook lives in an ignored secrets file. The map shows feed → parse → threshold → notify
→ log, one row per domain (`/feed`, `/rules`, `/notify`, `/config`), each with its entry point and
its `.json`. The agent builds `/feed` first and cross-checks it (does it fail closed on a dead
feed?), then `/rules`, then `/notify`. Six months later the owner changes the cap by editing one
number in `config/thresholds.json`.

### DES-02

**A subsystem is not coded until its foundational decisions are locked in the manifest; a later
change is a Change Request, never drift.**

Do not code a subsystem whose decisions are not in `DECISIONS.md`. A locked decision *can* change —
through the Change Request in `GATE-06`, which updates the Change Log. What may never happen is a
"small" change that quietly alters the architecture and leaves the manifest describing a system
that no longer exists. Before coding, confirm: the goal is in writing · the relevant decisions are
locked · you know the target subsystem · you know where its config is · the expected behaviour is
clear · the validation steps are defined. If any item is missing, ask one focused question first.

*Lesson.* An agent designed a new slice from the code plus an external spec and started building on
the main branch. The manifest's change log recorded that the same work was already two thousand
lines into an adopted plan on a side branch. **Read the manifest's change log and list the
branches before any build, refactor or resume.** The manifest is the record of decided and
in-progress work; the code shows only what shipped.

### DES-03

**Split by subject, never by size: a part leaves its file when it is independent and separately
tunable, or when a real change finds a subject that falls out; a split-off file names what it
uses, and a tiny helper stays inline.**

**There is no line count.** One subject, one file (`PRIN-05`). A part gets its own file when it is
independent and separately tunable, or when a file opened for a real change shows a subject that
falls out of it. A five-line helper stays in its parent file. Never cite a file's size as the
reason for a split, and never pack or trim a file to stay under a number.

*Why there is no number* (amended 2026-10-15, CR-2026-10-15-SPLIT, after the first instance's
owner retired the rule on 2026-10-14). The old rule, review at 300 lines and split by 500, had no
source: it came from a generated methodology document that cites nothing, and the research usually
quoted for a 300-line figure was withdrawn by its author. Studies of size and defects find no
threshold. On the first instance the rule fired mostly on files that are one file by nature
(mockups, generated pages, test data, single-file games), agents packed files to just under the
line, and splits made for size narrowed guards and turned private helpers into cross-file imports.

**How to split.** A split-off file names what it uses: an import list, parameters, or, where the
language only loads a file into its caller's scope, a header that names every variable and helper
it reads from the file that loads it. It never depends on something it does not name. A helper
that several test files share goes to a named fixtures or helpers module with public names, not to
one test file that the others import from. An existing split that reads its parent's scope is
fixed when a real change next opens it, never in a refactor of its own (`DES-06`).

**The read check.** One limit is real for an agent: a single file read returns a bounded amount of
text, so a file past it is read in parts. Guard rule 6 (`hooks/guard.ps1`, anchor `file-size`)
measures the bytes a write would leave. When a write grows a source file past the brain's
`readCeilingBytes`, it tells the agent, once per file per session and never on the owner's screen,
to list the file's subjects from a search of its top-level definitions and to split only if a
subject falls out. It never asks for a split for size alone. Files whose first lines say they are
generated, and globs in `readCeilingExempt`, are skipped; each firing is logged.

The default ceiling is 49152 bytes. It was measured on 2026-10-15 during this rule's review: dense
files of three kinds (HTML, GDScript, Python) were read with Claude Code's Read tool, their bytes
divided by the tokens the tool reported, and the lowest result, 1.98 bytes per token, multiplied by
the Read limit of about 25,000 tokens; 49,500 rounds down to 48 KiB. Repeat that after a model or
tool change and set the config value; a stale ceiling only moves the note a little earlier or later.
The check measures text with line endings normalised, so a file stored with CRLF endings is
measured the same as one with LF.

What the check cannot see: Read also stops at 2,000 lines, so a long file of short lines is past
one Read below the ceiling; that is a tool limit, not a split rule, and the check does not count
lines. It cannot see whether a split was made by subject or whether a split file names what it
uses; the owner and the Reviewer judge that.

One primary responsibility per file: `rules_engine.py` + `rules.json` + `validators.py`, never a
god-object `engine.py`. Build one domain at a time (for example `/core /data /rules /ui /config
/tests`), each with a clear responsibility, inputs, outputs and validation criteria. Config lives
in `/config`, and each domain has its own `.json`.

This law replaced three earlier defaults in the method's first instance: the single-file default,
"don't organise until it hurts", and "momentum over architecture". A single very large file is not
a scoping discipline; the interview, the manifest and the split by subject are.

### DES-04

**Every tunable value lives in a config file, never in logic; changing behaviour never requires
changing code.**

Thresholds, multipliers, limits, time windows, identifiers, account names, feature flags, alert
settings, model names, strategy parameters → config. Logic defines *behaviour*; config defines
*tunable values*. A change of behaviour that needs a code change is a defect in the split.

*Lesson.* A chat bot called a hosted language model by an identifier written in a source file. The
vendor retired that model. Every call returned "model not found", the bot stayed connected and
looked healthy, and the one error line went to a console nobody read. It was the second retirement
to silence the same bot. **A vendor's identifier is the vendor's roadmap, not your code.** It lives
in a `.json` with an environment override so a dead model can be swapped from a hosting panel
without a commit; and every external call logs the provider, the identifier and the failure status
(`OBS-04`), because a dead dependency looks exactly like a healthy program from outside.

### DES-06

**During a chunk, edit only that chunk's files; no unrelated refactor.**

The agent operating rules. **Before coding:** the checklist under `DES-02`. **During coding:** edit
only the current chunk's files · no unrelated refactor · keep config separate from logic · comment
only where it reduces future confusion · preserve the architecture unless an approved Change
Request permits the change · write or update the tests when behaviour changes. **After coding:**
summarise what changed · list the modified files · map the change to the manifest · run or describe
the validation · report any scope creep · recommend the next chunk.

### GATE-05

**After each chunk, run the cross-check against the manifest, the architecture and the core goal.**

Compare the new work against `DECISIONS.md` and `ARCHITECTURE.md`, and against the existing
subsystems, the config files, the tests and the original goal. Run it after each design chunk ·
before a new subsystem · after implementing one · after changing config behaviour · after a new
dependency · after a change to the file structure · before calling anything complete.

**Checklist (pass / warn / fail):** Manifest Alignment · Architecture Alignment · No Contradictions
· Scope Stability · Context Economy · Config Separation · Split by Subject (a split file names what
it uses; a file this chunk opened that reads its parent's scope is fixed now) · Single Responsibility ·
Dependency Safety · Test Coverage · Core-Goal Alignment → Results + Action Items + **Approval
(Proceed: yes/no)**.

*Lesson.* A feature was built by three parallel agents and a thousand tests were green. One
cross-check agent, given the manifest and the full diff and told to break it on a real machine
with real config, found two defects the suite could not see: a downstream branch overwrote an
absence label, and the documented procedure named a log line no code path could reach. Each agent
had proven its own file; nothing had proven the composition. **After parallel agents land, start
one more with the manifest and the whole diff. Read code paths, not tests.**

### GATE-06

**Any change to design, behaviour, config, risk, execution, data flow or dependencies needs a
Change Request, and an approved one updates the Change Log.**

A project drifts when an agent silently makes a "small" change that alters the architecture. A
Change Request records: Proposed Change · Reason · Affected Areas · Risk (low/medium/high) ·
Required Updates checklist (manifest · architecture map · config · tests · README · cross-check) ·
Final Decision + Rationale. Approval is the owner's (`AUTO-01`). The approved change is appended
to the manifest's Change Log; the Open Questions table is where an unresolved one waits; a refused
one leaves the locked decision standing, and the work changes to agree with it (`DES-02`).

**Mechanism.** The Stop card (`hooks/stop.ps1#stop-done`) asks once in a turn that changed source;
the brain's `sourceExtensions` decides what is source. A turn that changed only config, data or
documents gets no card (the one exception is a repository whose git status lists more entries than
the hook reads), so write the Change Request by hand. Every card asks whether the turn changed
design, behaviour, config, risk, execution, data flow or dependencies and, if it did, for the name
of its Change Request, and names GATE-06 on its first line (since the second review of
CR-2026-10-15-GAPS; a fix round before it named GATE-06 only with the Change Log line, so a
behaviour change that left `DECISIONS.md` alone got no GATE-06 at all). The card adds a Change Log
line only when `DECISIONS.md` changed in a turn that also changed source and no dated table row
was added: for a `DECISIONS.md` that git lists, the turn's diffs must add more dated rows than
they remove; for one git does not list, and on a card counted from the calls, the guard's flag on an Edit or Write that
added a row decides. The line needs `DECISIONS.md` to count as a document: the kit's default
`stopDocs` list names it, and a brain list that leaves it out turns the line off for a
`DECISIONS.md` outside a `docs` folder. That line does not see a behaviour change that leaves
`DECISIONS.md` alone (the question on every card asks about it, and nothing checks the answer),
and it sees a dated row, not the owner's approval. The grade is under GATE-07.

### GATE-07

**Code that runs is not done; done is the Definition of Done checklist in the owning file.**

A subsystem is done when: its design decisions are in the manifest · its files follow the structure
· its tunable values are in config · tests or validation exist · it passes the cross-check · it
creates no unresolved dependency · it contradicts no earlier decision · it supports the core goal ·
it satisfies `instructions/observability-law.md` (it logs, it has no silent failure path, its bug
plan exists) · its documents are updated (`DES-07`) · the result fits one screen of explanation.

**Grade of GATE-05, GATE-06 and GATE-07: ADVISE** (since 2026-10-15, CR-2026-10-15-GAPS D4;
HOOK before). Their machine part is the Stop card (`hooks/stop.ps1#stop-done`). In a turn that
changed source it blocks the first stop once and hands over the card, which asks for the
Change Request a change needs, the cross-check and part of the Definition of Done, and names at
its top every clause it carries.
The second stop passes whatever the answer says, and nothing grades the answer, so the hook
advises; it does not refuse a skipped cross-check.

## The three deletion guards

Three named failure modes about *removing* things. Obey them as agent rules; all three are backed
by the kit's `fence.ps1` hook (GATE-13 only on a deletion the fence sees), and the honest limits of
that hook are written here.

### GATE-11

**An edit that removes or neuters an assertion in a measuring file is stopped or questioned; fix
the code, not the measure.**

Goodhart's law: a measure that becomes a target stops measuring. Never weaken a check to pass it.
A file is a measuring file when a folder name or the file name in its path holds a measuring word
as a word part. A name is cut into word parts at any character that is not a letter or a digit,
at a change from lower to upper case, and between letters and digits. A word part counts when it
starts with `test`, `probe`, `verify` or `assert`, or is `spec` or `specs`: `tests/`,
`testutils/`, `spec/`, `test_x.py`, `x.test.js`, `x_spec.rb` and `FooTest.java` count; `latest/`,
`inspector/` and `special/` do not. `spec` is matched whole, not as a start, because `special`,
`specific` and `species` start with it (since 2026-10-15, CR-2026-10-15-GAPS review; before, any
substring of the full path counted, and a rewrite under `latest/` that dropped an assertion was
denied).

**Mechanism.** The fence hook fires on a **net decrease** of assertions inside a measuring file,
in two tiers. The **paren form blocks**: `assert(`, `self.assertEqual(`, `expect(` and their
relatives return a deny, and the reason comes back to the agent to argue with the owner; an
`expect(` right after a `.` is a method call (Rust's `.expect(`) and does not count. The
**loose form advises**: a bare `assert x == y`, `pytest.raises`, `assert_eq!` / `assert!` (the `!`
defeats a paren match) are detected and questioned, not denied, because the wider pattern can
misread a legitimate refactor and a false positive on a blocking hook costs real work. An Edit is
compared on its old and new text; a Write to a measuring file that exists is compared the same way,
the file on disk against the new content, and a Write that brings a `* 0` term into a file that had
none is denied as an Edit that adds one is (since 2026-10-15, CR-2026-10-15-GAPS D1; before, a
Write was compared on bytes only). A zero term is `* 0`, `* 0.` or `* 0.0`; the zero must not run
on into a digit, a letter or another `.`, so `* 0.5` and `* 0x10` are not one, and a `*` right
after `/` opens a C comment, so `/* 0 = off */` and `/** 0 */` are not one either (since the
second review of CR-2026-10-15-GAPS; before, an Edit that wrote `/* 0 = off */` in a test was
denied). **Residual:** the
hook inspects tool calls, so an assertion removed by `sed`, a heredoc, or a script the agent writes
is not seen. A NotebookEdit is not fenced at all: the fence's matcher in `hooks/hooks.json` does
not send it to the hook. An assertion replaced by one that tests less keeps the count and is not
seen; an assertion moved to another file is seen as a removal from the file it leaves. A measuring
file whose name holds its word only inside or at the end of a longer word (`selftest.ps1`,
`conftest.py`) is not read as one, unless a folder above it is; a word part that only starts with
`test` (`testimonials.js`) is read as one. An assertion called as a method (`chai.expect(`,
`pm.expect(`, Zig's `testing.expect(`) is not counted, and neither is one called on a module
(`assert.equal(`), because the paren form needs the parenthesis right after the name. A zero
written another way (`0.0f`, `0e0`, `* zero`) is not a zero term. A line inside a block comment,
or a Markdown bullet in a `spec/` file, that starts with `* 0` is read as a zero term, and the edit
that adds it is denied (a false deny; reword the line). A test file made read-only for a fix chunk
closes part of that gap; the written rule closes the rest, by making it a violation rather than an
accident.

### GATE-12

**Before removing anything you did not put there, answer the fence question: what it prevents,
what breaks, and what evidence you checked.**

Chesterton's fence: know why a thing exists before you remove it. **Mechanism.** The fence hook
fires when an Edit empties a block or removes several lines, when a Write would keep too small a
share of the file's bytes, and on a destructive shell command from its list (such as a forced or
recursive delete, `git reset --hard` or `git clean -f`). It injects the question, and the edit
proceeds. A smaller deletion is not seen, and neither is an Edit or Write to a measuring file that
already got the Goodhart deny or advise (GATE-11); the thresholds and the list are in
`hooks/fence.ps1`. The answer is owed in the
reply, and "I don't know" is an answer that stops the deletion. Deleting, moving or consolidating a
file is an owner decision in an autonomous loop (`AUTO-02`).

*Lesson.* Removing a vendor SDK also removes its defaults. One of them, a retry count, had been
set deliberately — a commit explained why. **Search the change log before deleting a dependency,
and rebuild what it was quietly doing for you.**

### GATE-13

**Before you remove, automate or simplify a thing, list its full function, not only its named
one.**

The doorman fallacy: do not judge a thing by its most visible function. A doorman opens doors; he
also watches who comes in. Before removing, automating or simplifying something, write down
everything it does, then decide. Its machine part is the fence advise
(`hooks/fence.ps1#fence-net-deletion`), which asks what the thing prevents and what breaks, on a
deletion the fence sees (see GATE-12). An automation or a simplification that deletes nothing gets
no advise, and listing the full function stays the agent's job.

*Worked example.* A nightly script "just copies the export to the archive". Listing its full
function: it also rotates the previous copy, fails loudly if the export is missing, and is the only
thing that writes the timestamp a dashboard reads. Replacing it with a one-line copy loses three of
four functions, and the dashboard's "last export" silently freezes.

## The one-sentence rule

**If an agent cannot tell what to edit, what not to edit, and how to validate the change within a
few files, simplify the architecture.**
