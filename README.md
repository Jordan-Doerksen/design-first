# design-first

A working method for building software with coding agents, packaged as a Claude Code plugin.
Interview before code. Decisions locked in a manifest. Every rule has an id, one owning file,
and an enforcement grade that tells the truth about whether a machine will stop you.

Status: V1, installable. Windows and PowerShell 7 only. The version is in `.claude-plugin/plugin.json`.

## The method, on one page

1. **Interview every add.** However detailed the request, it is an opening position, not a spec.
   Split it into decisions, give each one a verdict (approve, cut, add, reframe), name what it
   conflicts with, state the cost, then ask about the real forks, one multiple-choice question at a
   time with the recommended default first. Silence is not approval.
2. **Lock decisions before code.** `DECISIONS.md` is the one record. A later change is a Change
   Request, never drift. `ARCHITECTURE.md` is one page and names every domain and its config file.
3. **Build in chunks.** One domain at a time. Tunable values live in `.json`, logic defines
   behaviour. Split by subject, never by size: there is no line count. Parallelise independent decisions, not
   files; several files that serve one decision are one agent's job.
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

The full text of every rule is in `instructions/` and `workflows/`. The index is `LAW.md`. How the
loops and gates fit together, drawn as plain-text charts with every step also in words: [`LOOPS.md`](LOOPS.md).

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

The generator refuses to build `LAW.md` when a clause graded DENY, HOOK, ADVISE or GATE names a
mechanism that does not exist in this tree, or that does not declare the clause's verb and mode,
or a hook script that `hooks/hooks.json` does not register (`DF_SKIP_HOOK_FILES=1` turns a missing
mechanism file or anchor into a warning, for a chunk that has not landed). The counts are the Summary table at the foot of `LAW.md`, which is generated;
this page types none. A BUILDABLE clause has its mechanism specified in DECISIONS.md (2.7, or 2.8
for the loop runner) and not shipped.

## What is in the box

| path | holds |
|---|---|
| `law.json`, `LAW.md` | the clauses and their generated index |
| `LOOPS.md` | the loops and gates drawn as plain-text charts, each with its steps in words; a lint case keeps its clause ids and widths true |
| `instructions/`, `workflows/`, `lessons/` | the rule text, one subject per file |
| `hooks/` | `guard.ps1` (secrets, git history, frozen paths, a dirty tree, an open design gate in `DECISIONS.md` or `docs/DECISIONS.md` and the removal of its line, the loop branch: a push (`git send-pack` too), merge or pull on it or naming it; on it (a rebase or bisect of it stopped at a detached HEAD counts), a command that leaves it or moves another branch onto its work (a checkout or switch, a worktree add, a rebase that checks out a branch that is not a loop branch, a bisect that can check out a commit, a fetch into a local branch, a branch rename, copy or forced move, a ref written by hand); from any branch, a branch move, ref write or fetch that writes or names a loop branch; a story-ledger edit on it; `hooks/lib/guard-loop-rules.ps1` lists the git commands rule 11 reads, and any other git command that moves HEAD or a branch is a residual; and, when the brain turns them on, scheduling and content rules; its shell rules read the folder that a `cd`, `pushd` or `Set-Location` earlier in the command moves to; it also advises on a source write with no manifest and on a write that grows a file past one Read), `fence.ps1` (a deletion it can see, and an Edit or a Write that removes or weakens an assertion in a measuring file), `agent.ps1` (subagent brief contract, model routing, spawn cap), `route.ps1` (the law for the task, per prompt, from the index, plus the groups every session gets, and the installed skills that the prompt's words match), `subagent.ps1` (the session's law into every subagent, and the clauses that a named role answers for), `entry.ps1` (the personal layer on session start, and a state card built from the documents when the session starts in a game repository, or, with the brain's `stateCard.anyRepoWithHandoff` on, in any repository under the root that holds a hand-off), `ask.ps1` (one question per call, each option's description long enough to carry a reason, no "either is fine", the recommended option first; an allowed question marks the session as asked, for the Stop card's interview line), `stop.ps1` (a turn that changed source ends with its card, asked once: documents touched, a Change Log line when `DECISIONS.md` changed with no new row, an interview line for a repository created this turn when no question was asked this session, the verify gate's command and output, the Change Request question, the cross-check, the Definition of Done; its first line names the clauses of the lines on the card, GATE-06 on every card and GATE-01 only with the interview line; what changed is read from git in each repository under the root that a tool call this turn pointed at, so a file a script wrote there counts, and the limits are at the top of `hooks/lib/turn-changes.ps1`; a file in a `docs/` folder inside the repository is a document unless its extension is a source extension; a count that may be short says so) |
| `tools/doctor/` | checks claims, surveys repos, smokes the hooks; three bands, three exit codes |
| `tools/law/` | the generator |
| `tools/vcs/` | `law-claim.ps1`, a git commit check: a law file in a commit needs a claim or a written reason (install: `tools/MANUAL.md`) |
| `tools/tests/` | `run.ps1`, the hook cases on real hooks and real commits: `guard-cases.json` and the case files it dot-sources by domain (`cases-law-claim`, `cases-state-card`, `cases-stop-git`, `cases-own`, `cases-size`, `cases-loops`, `cases-bypass`, `cases-gate`, `cases-truth`, `cases-grades`, `cases-wording`); `adopt-selftest.ps1`, adopt and remove on throwaway folders; run under pwsh. The Doctor self-test is `tools/doctor/selftest.ps1` |
| `commands/` | `adopt`, `remove`, and four small working commands |
| `agents/reviewer.md` | the Reviewer, registered as `design-first:reviewer`: read-only, three verdicts (PASS, FAIL, BLOCKED), evidence or no pass |
| `templates/` | the files `adopt` writes into your root and your brain |
| `docs/` | the public page, generated by `docs/build.ps1` from this repo's own files (the method list above and the `LOOPS.md` overview among them) and four recorded runs; a hand edit of `docs/index.html` turns the kit Doctor RED |

Your own layer, called the brain, lives outside this repo: who you are, how you want to be spoken
to, your prohibitions, your claims, your lessons. `adopt` writes it from an interview. Nothing
about the author ships here.

## Install

```
claude plugin marketplace add Jordan-Doerksen/design-first
claude plugin install design-first@design-first
/design-first:adopt
```

`adopt` asks seven questions, one at a time (the seventh only when root is a git work tree), then
a script writes the files and runs the Doctor.
The result is exit 0 with any survey findings printed. `/design-first:remove` reverses exactly
what `adopt` wrote and leaves anything you changed.

## Limits, stated up front

- Windows and PowerShell 7 on PATH. Bash twins of the hooks are a Change Request.
- One adopter per Windows user profile.
- The guard inspects tool calls. It does not see nested shells (`cmd /c`, `pwsh -c`, `bash -c`),
  `xargs`, command substitution, git aliases, or scripts the agent writes. The rules that guard a
  file (a `.env`, source behind an open design gate, the story ledger) read Edit, Write and
  NotebookEdit calls only, so a plain shell write of that file is not inspected. These cases are in
  the self-test, asserted as not denied, so the gap is written down.
- The Doctor's repo survey is informational by default. Set `surveyStrict` in your brain config to
  make its `fail` findings fail the run. So the survey clauses print HONOUR in the kit; with
  `surveyStrict` on, re-grade VCS-01, VCS-02 and VCS-22 to GATE in your `law.overlay.json`.
- The Stop card blocks the first stop of a turn that changed source, once, and then lets the turn
  end. It grades no answer, so the clauses it carries print ADVISE (a hook that asks once), not
  HOOK. It runs when the main session stops: the
  kit registers no SubagentStop hook (`hooks/hooks.json`), so a subagent's own stop gets no card,
  and its changes count on the card of the session turn in which it ran, when its calls pointed at
  that repository.
- The kit never writes your user-level `settings.json`. When it wants a line there, it prints it.

## Run the checks

Run all of them on Windows before a version bump; nothing checks that they ran.

```
pwsh -NoProfile -File tools/tests/run.ps1
pwsh -NoProfile -File tools/doctor/selftest.ps1
pwsh -NoProfile -File tools/tests/adopt-selftest.ps1
pwsh -NoProfile -File tools/doctor/doctor.ps1 -Kit
```

## License

MIT. Author: Jordan-Doerksen.
