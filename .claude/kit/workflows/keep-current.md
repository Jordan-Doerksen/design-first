# Keeping the brain current — the agent's job, not the owner's

This file owns no clause. It is the procedure by which the adopter's private brain stays true.

**The rule.** The owner does not maintain the brain by hand. The agent looks for what is worth a
record and offers to save it; the owner approves one line. The owner does not open files or search
their memory for the moment; the agent identifies the event and drafts the record.

**Baseline.** The brain is the default start point for every task — its `instructions/`, its
`workflows/`, its `lessons.md`. Do not invent a parallel approach when the brain already has one.
When a task shows a gap, add to the brain.

## When the agent offers an update

At a natural stop point, if something *durable* occurred. Trigger → destination:

- A pattern repeats across two or more projects, or a new pattern is clearly reliable → the
  matching law file in `instructions/`, or `workflows/`.
- Something was learned from a failure, or a decision was made that must not be made twice →
  `lessons.md`, **with the clause id it produced** (an event with no rule is a story).
- Something was tried and abandoned → `lessons.md`, so nobody tries the failed approach again.
- The owner states a new preference about how the agent works → the brain's `me.md`.
- A rule did not stick → first find the rule it is losing to (`PRIN-05`), then edit the owner of
  that subject; never add a third copy.
- A new fact about the disk → not a sentence; a claim in `claims.json` in the same commit
  (`VCS-23`).

## How it works, so it costs the owner nothing

1. The agent writes the exact line and names the file. The owner replies **yes / no / tweak**. The
   agent makes the edit, then commits and pushes the brain (`VCS-04`).
2. One line is the whole draft. No blocks of text to read.
3. The agent does not ask repeatedly. A trivial single event does not start this; several updates
   are collected into one request.
4. **Never hand-maintain a restatement of the law.** A summary file that restates every rule
   cannot keep up and will carry stale or invented exceptions within weeks. If a self-contained
   brief is ever needed, generate it from `LAW.md` with a script (`PRIN-03`).
5. The owner can always say **not now**, or start the process at any time with **update the
   brain**.
