# Principles — the four ideas every other rule serves

This file owns `PRIN-01`, `PRIN-03`, `PRIN-04` and `PRIN-05`. The other law files assume these
four and do not restate them. Read this file once, first.

### PRIN-01

**Context economy comes before every other rule.** Every decision about files, folders and config
must *reduce* what an agent has to read before it can change something safely.

A good design lets an agent answer five questions without opening unrelated folders:

- What does this subsystem do?
- Where is its config?
- What is safe to edit?
- What decisions already constrain this?
- What proves that the change worked?

**If a change needs the agent to read unrelated folders, the architecture is too complex.** A giant
file is overload for a person and for a model alike; small, scoped, domain-split files behind one
manifest reduce it. This is the reason `instructions/design-methodology.md` exists: the manifest,
the architecture map, the domain split and the config rule are all this principle applied to code.

*Worked example.* A tool has `/feed`, `/rules`, `/notify` and `/config`. A new agent is asked to add
a second notification channel. It reads the architecture map, finds `/notify`, opens that folder
and its `.json`, and never reads `/feed` or `/rules`. Six months later the owner changes a threshold
by editing one number in `config/thresholds.json` and touches no code. That is the benefit.

### PRIN-03

**A fact about the disk is generated, never typed.** If a statement can be derived, derive it.

Every false statement that survived for weeks in the method's first instance was a *fact stored as
law*: a claim about the disk, typed by hand, with nothing able to detect that it had gone wrong. One
law file told every agent a guard hook did not exist while the hook fired ten times a day. An
inventory called one folder both retired and canonical, sixty lines apart. A typed count of rules
was wrong within a week.

So a document may **state a rule** and may **name what enforces it**, but a document may not assert
a fact about the disk unless that fact is produced by a tool. The kit's mechanism is the Doctor and
its `claims.json`: a fact becomes a claim (`path_exists`, `file_contains`, `remote_is`,
`json_subset_equal`, `generated_matches`, …), the Doctor evaluates it, and a false claim is RED.
`LAW.md` itself is the first example — it is generated from `law.json`, and the Doctor compares the
committed file with a fresh build. A hand edit is RED.

The detail for repositories and law files is `instructions/integrity-law.md` (`VCS-15`, `VCS-23`).

### PRIN-04

**The next misbehaviour produces a mechanism, not a paragraph.** Writing the rule harder is the
reflex that made adherence worse.

Every rule is one of two things, and you must know which. **ENFORCED** means a hook, a permission
rule, a Doctor claim or a tool allowlist backs it; it survives a tired model, a context compaction
and a long session. **ADVISORY** means it is a request, and adherence falls as the context grows.
The platform's own wording: instruction files and memory are context, not enforced configuration;
to block an action regardless of what the model decides, use a `PreToolUse` hook.

The reflex to resist is this: a rule is broken, so the rule is rewritten in bold, with a warning
sign, in a second file. Now two files state it, they will drift (`PRIN-05`), the entry path is
longer (`PRIN-01`), and nothing stops the next break. The correct response is to ask **"what event
would have caught this?"** and wire that event: a hook that fires at the moment of the action, a
permission `ask` rule, a Doctor claim that goes RED, or a tool whose allowlist does not include the
verb. The `grade` column in `LAW.md` exists so this question is asked of every clause and the
honest answer is visible.

**The mechanism for this clause is a ratchet.** The Doctor reads the `HONOUR` row of the Summary in
the generated `LAW.md` and compares it with the value it recorded on the last run
(`state/ratchets.json`). The count may fall, and the record follows it down. A count that rises
turns the run RED, because a rise means a new rule arrived with nothing to enforce it. There are
three ways out, in this order: give the rule a mechanism; give it the grade it really has (a
standing ruling is `OWNER`, not `HONOUR`); or sign the raise in the claim with `accepted`: the new
value, the date and the reason. A signed raise works once. Written limit: the record is local
state, so a fresh checkout records its own baseline on its first run.

*Worked example.* An agent repeatedly ran a whole test suite locally on a platform the suite was
not written for, after the lesson had been written down twice. The third time, instead of a third
paragraph, a `PreToolUse` hook was added that fires only on a whole-suite run inside a repository
that has CI, reads that repository's own CI platform and names the mismatch. Two rules came with
it: a hook is **silent in the common case** (a hook that fires constantly is trained away as
noise), and a hook is **pipe-tested before it is wired**, with the real payload, proving it fires
when it should and stays quiet when it should. A hook that never fires reports a safety that does
not exist.

### PRIN-05

**One subject, one file.** A rule stated in two places will disagree in two places.

Each clause in `LAW.md` has exactly one owning file, and that file holds the full text, the
reasoning and the values. Every other file that needs the rule cites the clause id and points at
the owner. The cost of the alternative is not untidiness; it is that the two copies drift, an agent
reads the stale one, and the stale one wins because it was loaded later or had more detail.

*Worked example.* A rule about how answers should sound was written in the owner's preferences
file. It "never stuck", and was written again, and again. The cause was not forgetting: a second
file, loaded later in the entry path, said something different about the same subject, and the one
with more detail won. The fix was not a third copy. It was deciding which file owns the subject,
deleting the losing sentence, and adding a line to the index that says who owns it. When a rule
does not stick, **find the rule it is losing to** before writing it again.

**The single permitted exception** is the prohibitions in the root entry file: anything that stops
damage appears there in full as well as in `LAW.md`, because nothing that stops damage may live
behind a pointer. That exception is named here so it is not generalised.

The corollary for lessons: `lessons/lessons.md` records an event *and* the clause id it produced.
An event with no rule is a story, and a rule that lives only in a lesson is a rule nobody will find.

## One file, checked by the generator (0.1.25, CR-2026-10-13-HONOUR)

PRIN-05 is enforced by the law generator (`tools/law/build-law.ps1#state-once`): every clause
has its `### ID` heading in exactly one file under `instructions/`, `workflows/` and `lessons/`
(and the brain's `instructions/` when a brain root is given), and that file is the clause's
owning file. A heading in two files, in none, or in a file other than the owner fails the build,
so `LAW.md` cannot be generated from a rule stated in two places.
