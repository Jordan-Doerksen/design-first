# design-first

A working method for building software with coding agents, packaged as a Claude Code plugin.
Interview before code. Decisions locked in a manifest. Every rule has an id, one owning file,
and an enforcement grade that says whether a machine will stop you or only ask.

It runs as eight hooks around the agent's tool calls, a Doctor that checks what the documents
claim against the disk, and a generator that refuses to print a rule whose mechanism is missing.

Status: V1, installable. Windows, macOS and Linux, with Node.js 18 or newer and git on PATH.
The version is in `.claude-plugin/plugin.json`.

## The method, on one page

1. **Interview every add.** A request is an opening position, not a spec: split it into decisions,
   give each a verdict, and ask about the real forks one question at a time. Silence is not approval.
2. **Lock decisions before code.** `DECISIONS.md` is the one record; a later change is a Change
   Request, never drift. `ARCHITECTURE.md` is one page naming every domain and its config.
3. **Build in chunks.** One domain at a time, tunable values in `.json`, split by subject and
   never by size.
4. **Cross-check every chunk** against the manifest, the architecture and the goal before the next.
5. **Gate the dangerous work.** Where a wrong output costs money, safety or trust, the spec gets an
   adversarial review before the repo exists. A review that finds nothing is a failed review.
6. **A fact about the disk is generated, never typed.** Every claim a document makes about files,
   remotes or state is an entry in `claims.json` that the Doctor checks.
7. **Show nothing rather than something false.** Absent is not zero, and a check that cannot look
   does not report green.
8. **A lesson must produce a rule.** An event with no rule is a story.

The full text of every rule is in `instructions/` and `workflows/`; the index is `LAW.md`. The
loops and gates, drawn: [`LOOPS.md`](LOOPS.md). The map: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## What is in the box

<!-- inventory:start -->
<!-- rendered by docs/build.mjs from ARCHITECTURE.md (Domains) and hooks/hooks.json; do not edit by hand -->

| path | holds |
|---|---|
| `.claude-plugin/` | manifest, marketplace |
| `hooks/` | session guards |
| `tools/law/` | generator |
| `tools/doctor/` | disk checker |
| `tools/vcs/` | git-side checks |
| `tools/tests/` | hook self-test |
| `commands/` | adopt, remove, gut, move, scope, ship |
| `tools/adopt.mjs`, `tools/remove.mjs` | the writers |
| `agents/` | read-only reviewer |
| `templates/` | root and brain files |
| `instructions/`, `workflows/`, `lessons/` | the rule text |
| `LOOPS.md` | the loops and gates, drawn |
| `docs/` | the public page |

The hooks, as `hooks/hooks.json` registers them:

| hook | event | on | what it does |
|---|---|---|---|
| `guard.mjs` | PreToolUse | Edit, Write, NotebookEdit, Bash, PowerShell | refuses the call that would stage a secret, rewrite git history, touch a frozen path, write source behind an open design gate, or leave or push the loop branch; advises on a write with no manifest or past one Read. |
| `fence.mjs` | PreToolUse | Edit, Write, Bash, PowerShell | stops a deletion it can see, and an edit that removes or weakens an assertion in a measuring file, with the fence question to answer first. |
| `ask.mjs` | PreToolUse | AskUserQuestion | refuses a question with more than one part, an option with no reason, an "either is fine", or a recommended option that is not first (OWN-04). |
| `agent.mjs` | PreToolUse | Agent | holds a subagent spawn to its brief contract, routes its model from the brain's policy, and asks past the spawn cap (DES-11). |
| `route.mjs` | UserPromptSubmit | every | injects the law groups the prompt's words and the working folder name, once per session, plus the groups every session gets (DES-13). |
| `stop.mjs` | Stop | every | ends a turn that changed source with its card, asked once: documents, the verify gate, the Change Request, the cross-check, the Definition of Done (DES-07, GATE-01, GATE-05/06/07, GAME-12). |
| `subagent.mjs` | SubagentStart | every | gives a subagent the session's law groups and the ADVISE clauses its role answers for, the ADVISE block reserved first (DES-13). |
| `entry.mjs` | SessionStart | startup, resume, clear, compact | prints the brain's entry path on session start, refreshes the pointer, clears the session's routes on a compaction, and opens a repository that carries a hand-off with its state card. |

<!-- inventory:end -->

Your own layer, the brain, lives outside this repo: who you are, how you want to be spoken to,
your prohibitions, your claims, your lessons. `adopt` writes it from an interview. Nothing about
the author ships here.

## Install

```
claude plugin marketplace add Jordan-Doerksen/design-first
claude plugin install design-first@design-first
/design-first:adopt
```

`adopt` asks seven questions, one at a time, then writes the files and runs the Doctor.
`/design-first:remove` reverses what `adopt` wrote and leaves anything you changed.

## What a grade means

`LAW.md` is generated from `law.json`. Every clause prints one of these grades:

| grade | a machine will |
|---|---|
| DENY | refuse, by a permission deny rule |
| HOOK | inspect the call and refuse when its rule matches |
| ADVISE | add context, or ask once; let the call or the turn proceed |
| GATE | stop and ask, or turn the Doctor red |
| BUILDABLE | nothing yet: the mechanism is specified and not shipped |
| OWNER | nothing: this is a standing ruling by the owner |
| HONOUR | nothing: this is a request |

The generator refuses to build `LAW.md` when a graded clause names a mechanism that is not in
this tree. The counts are the Summary table at the foot of `LAW.md`.

## Limits, stated up front

- One adopter per user profile: one pointer, at `~/.claude/design-first.json`.
- The guard inspects tool calls. It does not see nested shells, `xargs`, command substitution,
  git aliases or scripts the agent writes; the self-test asserts these gaps.
- The Doctor's repo survey is informational unless `surveyStrict` is on in your brain config.
- The Stop card asks once per turn that changed source and grades no answer.
- The kit never writes your user-level `settings.json`. When it wants a line there, it prints it.

## Run the checks

Run all of them before a version bump, on each system you ship for; nothing checks that they ran.

```
node tools/tests/run.mjs
node tools/doctor/selftest.mjs
node tools/tests/adopt-selftest.mjs
node tools/doctor/doctor.mjs -Kit
```

## License

MIT. Author: Jordan-Doerksen.
