# Control law — one master per domain, one intake above them, every brief says where it reports

This file owns `CTRL-01`, `CTRL-02` and `CTRL-03`. It is about how sessions are started, briefed
and answered for when more than one chat works on one machine: the control session for a domain,
the intake above the control sessions, the brief a work session or a subagent starts from, and
the card that records a master. It does not restate `DES-11` (`workflows/coding.md`), which owns
the brief's four work headings; `CTRL-02` owns the fifth. Writers in their own worktree, one
writer per file set, is `CR-2026-10-16-ONEWRITER`'s subject and is not restated here.

**The one idea:** a chat cannot be seen by a machine. A master that dies is invisible, a brief
that names no controller is accepted, and a card copied by eye sits in three places. This group
puts the one checkable fact about a brief (where it reports) in the hook that already reads every
brief, puts the one checkable fact about a master (its card) in a Doctor claim, and writes the
rest down as a ruling with its grade said out loud.

---

## The shape of the regime

- One **control session** per domain, named `<Domain> Master Control`, started from a fresh chat
  with `/design-first:control <Domain>`. It plans the domain's work, starts the sessions that do
  it, and keeps the domain's card.
- One **Intake** above the masters, started with `/design-first:control intake`. It sorts the
  owner's items by the domain test, settles what changes the prompt, and messages the master; it
  never does the work.
- A **work session** starts from its master, with a brief, and reports to it at turn end. A session
  the owner started elsewhere is asked once to report; it may not, and that is the residual.
- A **subagent** starts from a session, with a brief, and reports to the session that spawned it.

## The brief and the report

Every brief carries the four work headings (`DES-11`) and one more, `Reports to:`, at the start of
its own line. The heading names the session or chat the report goes to and the shape it takes.
The hook checks the heading, not what follows it; an empty `Reports to:` passes, and that limit is
written below.

The report shape a `Reports to:` line points at is one of two:

- **The four-line report** (a work session to its master): repo and branch; files changed or posts
  made; needs from the owner; blocked on. The card template, `templates/CONTROL.md`, carries it.
- **Intake's report-back line** (a master to Intake): `item <n> done: <proof>` or
  `item <n> blocked: <why>`. The Intake template, `templates/INTAKE.md`, carries it.

A subagent's `Reports to:` names the session that spawned it and the shape its brief asks for
(pasted output, a PASS or FAIL with evidence, a list). The line is about twenty characters; a brief
without it is refused once and rewritten.

## The mechanism, and its config values

`hooks/agent.mjs#agent-brief` runs on every call to the Agent tool and on every call to the host's
session-start tool. The tunables are in `<brain>/agent-policy.json`, under `brief`:

| key | what it holds | default in the kit template |
|---|---|---|
| `required` | the headings every full brief carries | `Goal:`, `Files:` or `Area:`, `Done when:`, `Ruled out:`, `Reports to:` |
| `lightTypes` | agent types that search rather than build | `Explore`, `claude-code-guide` |
| `lightRequired` | the headings a light type carries | `Goal:`, `Done when:`, `Reports to:` |
| `sessionTools` | the host's session-start tools, by full tool name | `mcp__ccd_session__start_session` |

The session-start tool is the host's, not the kit's, so its name is a config value and not a line
in the hook (`OWN-05`); the matcher in `hooks/hooks.json` names the same tool, because a hook runs
only on the tools its matcher names, and a brain that adds a tool to `sessionTools` adds it to the
matcher in its own settings. On a session-start call the hook reads the tool input's `prompt` as
the brief and checks `required` against it, and nothing else: no spawn count, no model route,
since a session's model is the host's. A session-start call with no `prompt` carries no brief and
is passed through: the host's offer card is a title alone, and a proposal is started by its id
after its brief was checked on the call that carried it.

## The card and its claim

Every control card is a brain file under `<brain>/control/`: `<DOMAIN>-CONTROL.md` for a domain,
`INTAKE.md` for Intake. The brain's `doctor.config.json` lists them under `controlCards`, paths
relative to that folder. The claim `CTRL-CARD-01` (type `config_paths_each`, shipped in
`templates/claims.json`) reads the list and checks that each card exists and holds the words
`Master Control` or `Intake`: a card that is missing is a master with no record, and a card that
names no master is a file nobody answers for. An empty list passes and says so. The kit's own run
carries the same claim as `KIT-CONTROL-01`, which is what grades `CTRL-03`; the kit lists no card,
and the detail says so.

A card is written by `/design-first:control` from its template, kept by its master, and committed
by the owner (`SAFE-06`). A card that sat elsewhere leaves a one-line pointer at its old path.

## Limits, written down

- A machine cannot see a chat. `CTRL-01` is a ruling; the card's file date is the only trace of a
  master's life, and a stale-card claim (`file_fresh`, one line) waits until a card has gone stale
  once.
- The hook sees the heading, not the report. A brief that says `Reports to: Intake` and never
  reports is caught by Intake's queue, read by a person, not by a claim.
- The hook sees only the tools its matcher names. A host with a different session-start tool needs
  its name in `sessionTools` and in the matcher; until then its sessions start unchecked, and the
  Doctor does not know it.
- A master started from another domain's chat files with its parent in the sidebar. `CTRL-01` says
  fresh chat; nothing refuses the other way.

---

## Clause headings

One `### ID` heading per clause this file owns, so the law generator can check that each rule is
stated in one file (`PRIN-05`).

### CTRL-01

**One control session per domain and one intake above them, each started from a fresh chat and
never from another domain's session; a work session starts from its master, never from a loose
chat, and reports to it at turn end.**

OWNER: a standing ruling, 2026-10-19. No machine can see which chat started which; the regime is
kept by the owner and the masters, and the card is its record. The command
`/design-first:control` does a master's first run so the fresh start is one step and not a paste.

### CTRL-02

**Every brief, for a subagent or for a session, names what it reports to and in what shape; a
brief that does not is refused.**

HOOK by `hooks/agent.mjs#agent-brief`: `Reports to:` is in `brief.required` and
`brief.lightRequired`, and the matcher covers the Agent tool and the session-start tools named in
`brief.sessionTools`. The report shapes are above. The hook reads the heading, not the text after
it.

### CTRL-03

**Every control card lives in the brain's control folder, exists at its path and names its
master.**

GATE by `KIT-CONTROL-01` on the kit's run and `CTRL-CARD-01` from the shipped claims on a brain's
run, both `config_paths_each` on `controlCards` with the words `Master Control` or `Intake`. The
claim sees the file and the words, never whether the master's chat is alive.
