# design-first

A working method for building software with coding agents, packaged as a Claude Code plugin.
Interview before code. Decisions locked in a manifest. Every rule has an id, one owning file,
and an enforcement grade that tells the truth about whether a machine will stop you.

Status: V1 in build. Chunks 1 to 5 of 11 are done and verified. Not installable until chunk 7.

## The method, on one page

1. **Interview every add.** However detailed the request, it is an opening position, not a spec.
   Split it into decisions, give each one a verdict (approve, cut, add, reframe), name what it
   conflicts with, state the cost, then ask about the real forks, one multiple-choice question at a
   time with the recommended default first. Silence is not approval.
2. **Lock decisions before code.** `DECISIONS.md` is the one record. A later change is a Change
   Request, never drift. `ARCHITECTURE.md` is one page and names every domain and its config file.
3. **Build in chunks.** One domain at a time. Tunable values live in `.json`, logic defines
   behaviour. Review a file at 300 lines, split by 500. Parallel agents are the default when more
   than one file changes.
4. **Cross-check every chunk** against the manifest, the architecture, the existing subsystems and
   the original goal before the next one starts.
5. **Gate the dangerous work.** When a wrong output costs money, safety or someone's trust, write the
   SPEC and the decisions first and send them for an adversarial gap review before the repo exists.
   A review that finds nothing is a failed review. The gate clears when findings are resolved, not
   when they are absent.
6. **A fact about the disk is generated, never typed.** Prose rots. Every claim a document makes
   about files, remotes or state becomes an entry in `claims.json` that the Doctor checks.
7. **Show nothing rather than something false.** A blank panel beats a wrong number. Absent is not
   zero. A check that cannot look does not report green.
8. **A lesson must produce a rule.** An event with no rule is a story.

The full text of every rule is in `instructions/` and `workflows/`. The index is `LAW.md`.

## What a grade means

`LAW.md` is generated from `law.json`. Every clause prints one of six grades:

| grade | a machine will |
|---|---|
| DENY | refuse, by a permission deny rule |
| HOOK | inspect the call and refuse when its rule matches |
| ADVISE | inspect the call, inject a question, let it proceed |
| GATE | stop and ask, or turn the Doctor red |
| OWNER | nothing: this is a standing ruling by the owner |
| HONOUR | nothing: this is a request |

The generator refuses to print a grade above HONOUR unless the mechanism exists in this tree and
declares the clause's verb. The exact counts are the Summary table at the foot of `LAW.md`, which
is generated; as of 0.1.5 the kit ships 78 clauses: 24 have a mechanism (7 HOOK, 6 ADVISE, 11 GATE), 13
more are BUILDABLE with the mechanism specified in DECISIONS.md 2.7. Most rules are requests. The index says so.

## What is in the box

| path | holds |
|---|---|
| `law.json`, `LAW.md` | the 78 clauses and their generated index |
| `instructions/`, `workflows/`, `lessons/` | the rule text, one subject per file |
| `hooks/` | `guard.ps1` (secrets, git history, frozen paths), `fence.ps1` (deletion and weakened assertions), `agent.ps1` (subagent brief contract, model routing, spawn cap), `route.ps1` (the law for the task, per prompt, from the index), `subagent.ps1` (the session's law into every subagent), `entry.ps1` (the personal layer on session start) |
| `tools/doctor/` | checks claims, surveys repos, smokes the hooks; three bands, three exit codes |
| `tools/law/` | the generator |
| `tools/vcs/` | `law-claim.ps1`, a git commit check: a law file in a commit needs a claim or a written reason (install: `tools/MANUAL.md`) |
| `tools/tests/` | the hook cases, on real hooks and real commits, and the Doctor self-test; run under pwsh |
| `commands/` | `adopt`, `remove`, and four small working commands |
| `agents/reviewer.md` | a read-only adversarial reviewer |
| `templates/` | the files `adopt` writes into your root and your brain |

Your own layer, called the brain, lives outside this repo: who you are, how you want to be spoken
to, your prohibitions, your claims, your lessons. `adopt` writes it from an interview. Nothing
about the author ships here.

## Install

```
claude plugin marketplace add Jordan-Doerksen/design-first
claude plugin install design-first@design-first
/design-first:adopt
```

`adopt` asks six questions, one at a time, then a script writes the files and runs the Doctor.
The result is exit 0 with any survey findings printed. `/design-first:remove` reverses exactly
what `adopt` wrote and leaves anything you changed.

## Limits, stated up front

- Windows and PowerShell 7 on PATH. Bash twins of the hooks are a Change Request.
- One adopter per Windows user profile.
- The guard inspects tool calls. It does not see nested shells (`cmd /c`, `pwsh -c`, `bash -c`),
  `xargs`, command substitution, git aliases, or scripts the agent writes. These cases are in the
  self-test, asserted as not denied, so the gap is written down.
- The Doctor's repo survey is informational by default. Set `surveyStrict` in your brain config to
  make it fail the run.
- The kit never writes your user-level `settings.json`. When it wants a line there, it prints it.

## Run the checks

```
pwsh -NoProfile -File tools/tests/run.ps1
pwsh -NoProfile -File tools/doctor/selftest.ps1
pwsh -NoProfile -File tools/doctor/doctor.ps1 -Kit
```

## License

MIT. Author: Jordan-Doerksen.
