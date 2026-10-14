---
description: Run a pitch past every council seat in the project's agents folder, one question at a time, and record the verdicts. Writes the manifest only after the owner says yes.
argument-hint: <the pitch, or the path of the spec>
---
Convene the council on: $ARGUMENTS

The council is every agent file in this project's `.claude/agents/` whose name starts with
`council-`. List them first, by file name and the one-line description in each file's front
matter. If there are none, say so and stop; do not invent seats.

## 1. Read before you ask

Read the pitch or the spec named above, and any `DECISIONS.md`, `SPEC.md` or `HANDOFF.md` it
names. Do not invent constraints. If the pitch is a few words, say what you took it to mean in
one line and ask the owner to confirm before the seats run.

## 2. Run every seat

Start each seat as a subagent with a brief that carries, each on its own line: `Goal:` (judge
this pitch from your seat), `Files:` (the pitch and the documents it names), `Done when:` (your
verdict table is returned), `Ruled out:` (editing anything; inventing a constraint). The model
comes from the brain's agent policy; do not name one. Run the seats in parallel; they are
independent. Each seat returns what its own file says it returns. Do not summarise a seat's
report in its place: quote its verdict line and its table.

## 3. Verdict per element

Split the pitch into its elements (a mechanic, a screen, a name, a rule, a file). For each
element, give one verdict from the four, with the seats that drove it:

| Element | Verdict | Which seats, and why |
|---|---|---|
| ... | APPROVE / REDACT / ADD / FLAVOUR | ... |

APPROVE: as pitched. REDACT: cut, with the reason. ADD: something the pitch needs and does not
have. FLAVOUR: keep, but as taste the owner decides, not as a rule.

## 4. One question at a time

Where the seats disagree, or an element needs the owner, ask one question. Multiple choice, two
to four options, the recommended one first with the reason in one line. Wait for the answer
before the next question. Keep a running **Design log** under the questions: the question, the
answer, the date.

## 5. Record, then wait

When the questions are answered, write the council record the project's law names (in a brain
that carries GAME-21 it is `records/council-<spec>.md` in the repository: the pitch, the seats
that returned a table, each verdict table, the element verdicts, the Design log). Then stop and
ask: "Write the approved elements into DECISIONS.md?" Write to `DECISIONS.md` only after the
owner says yes. Silence is not approval.

Do not build anything. The Programmer hat stays locked until the manifest carries the decision.
