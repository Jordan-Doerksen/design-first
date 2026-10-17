# design-first — ARCHITECTURE

## System at a glance

A Claude Code plugin whose hooks guard the session, whose `adopt` command sets up an adopter's
private brain from an interview, and whose two tools (Doctor, law generator) keep the written law
honest about what is actually enforced on the disk.

## Core flow

```
law.json (+ <brain>/law.overlay.json) --> tools/law/build-law.mjs --> LAW.md (kit) / <brain>/LAW.md
                                                    ^
claims.json ------------> tools/doctor/doctor.mjs --+-- claims | survey | could-not-look --> <brain>/state/
hooks/hooks.json --------> guard.mjs / fence.mjs / ask.mjs / agent.mjs --> allow | deny | ask | rewrite | advise, + log
                           route.mjs / subagent.mjs --> LAW.md rows by group, per session, into context
                           entry.mjs --> entry path + state card (GAME-13, DES-14), into context
                           stop.mjs --> the first stop of a source turn refused once, with the card (DES-07, GATE-01/05/06/07, GAME-12)
commands/adopt.md -------> tools/adopt.mjs --> <root>/CLAUDE.md, <root>/.claude/settings*.json,
                                               <brain>/*, ~/.claude/design-first.json
```

Everything resolves through the pointer file: `root` (where sessions start), `brain` (the
adopter's private layer), `pluginRoot` and its kind (checkout or cache).

## Domains

| domain | purpose | entry point | config | notes |
|---|---|---|---|---|
| `.claude-plugin/` | manifest, marketplace | `plugin.json` | — | the repo root is the plugin and its own marketplace |
| `hooks/` | session guards | `hooks.json` | `<brain>/doctor.config.json`, `<brain>/agent-policy.json` | `lib/` holds the tokeniser, rules and shared helpers (`guard-rules.mjs` rules 1-6, `guard-owner-rules.mjs` rules 7-9, `guard-gate-rules.mjs` rule 10, the design gate, `guard-loop-rules.mjs` rules 11 and 12, the loop branch); anchors declare mode and verbs; `agent.mjs` rewrites an Agent call's model from the policy and counts spawns per turn in the marker folder; `route.mjs` keeps a per-session route file there, puts the policy's `alwaysForSessions` groups first on every prompt (OWN-10), and `lib/law-rows.mjs` reads LAW.md for both routers; `subagent.mjs` leaves those session-only groups out of a subagent's injection; `ask.mjs` checks the shape of a question against the brain's `ask` config (OWN-04), and an allowed question writes the session's `<session>.asked` marker, which the Stop card reads for GATE-01; `fence.mjs` compares an Edit's old and new strings, or a Write's content with the file on disk, for a deletion it can see or an assertion removed from a measuring file; guard rule 6 is the DES-03 read check: it measures the bytes a write would leave against `readCeilingBytes`, tells the agent once per file per session on its context only (an advisory marked agent-only carries no `systemMessage`), and never asks for a split for size; `entry.mjs` calls `lib/state-card.mjs` for the state card (GAME-13 by folder group, DES-14 for any repository with a hand-off when `stateCard.anyRepoWithHandoff` is on), which reads the route policy to decide whether the session's repository gets one and prints the hand-off's `## Next session` prompt; `lib/turn-changes.mjs` is the Stop card's source of truth: the guard nominates repositories into `<session>.repos` with the commit HEAD was on, the router writes the prompt's time into `<session>.turn`, and `stop.mjs` asks git what changed since; the card's first line names the clauses of the lines on it, GATE-01 only when its interview line is there (GATE-06 has its Change Request line on every card); `guard-loop-rules.mjs` rule 11 lists the git commands it reads (push and send-pack, merge and pull; checkout and switch, worktree add, a rebase that checks out a branch that is not a loop branch, bisect and a fetch into a local branch on a loop branch; a branch rename, copy or forced move, update-ref and symbolic-ref; a fetch or ref move that writes or names a loop branch from any branch), reads a detached HEAD as the loop branch while a rebase or bisect of that branch is stopped (`onLoopBranch`), and any other git command that moves HEAD or a branch is its written residual |
| `tools/law/` | generator | `build-law.mjs` | `law.json` | `validate.mjs`, `render.mjs` imported; deterministic bytes; `validate.mjs` also fails a hook clause whose script, by its path under `hooks/`, `hooks/hooks.json` does not register (a `lib/` file is never registered: the ref names the script that loads it); the cases run in `tools/doctor/selftest-law.mjs` |
| `tools/doctor/` | disk checker | `doctor.mjs` | brain config + `claims.json` | `context`, `claims`, `claims-keyed`, `claims-tree`, `claims-exec`, `claims-ratchet`, `claims-snapshot`, `repos`, `enforcement`, `survey`, `report`, `selftest` (its config contract cases are in `selftest-config`, its snapshot cases in `selftest-snapshot`, its honesty cases, a Doctor crash and a registered hook with no smoke claim, in `selftest-truth`, and the law build and docs build on planted inputs in `selftest-law`, all imported, split out by domain), and `snapshot.mjs`, the writer a `snapshot_diff` claim compares against; the reader table and the default config in `context` must name the same keys, and the self-test fails when they do not; a claim is read-only, so a ratchet's record is written by `doctor.mjs` after the run, into `state/ratchets.json`; one run is one process, and `claims-tree` keeps each repository's file list, first-commit date and glob regex for the length of it; `repos` reads `parallelGit` repositories at a time |
| `tools/vcs/` | git-side checks | `law-claim.mjs` | `<brain>/doctor.config.json` (`lawClaim`) | run by the shim `templates/commit-msg`, copied to `<brain>/.git/hooks/commit-msg`; the shim finds the kit through the pointer on every commit |
| `tools/tests/` | hook self-test | `run.mjs` | `guard-cases.json` | temp repos and a fake pointer; never touches the real one; `run.mjs` imports these case files, split out by domain, in the order of the list near its end: `cases-law-claim.mjs` (the commit check, VCS-23), `cases-state-card.mjs` (the GAME-13 and DES-14 cards), `cases-stop-git.mjs` (the Stop card read from git), `cases-own.mjs` (OWN-04, OWN-10), `cases-size.mjs` (guard rule 6), `cases-loops.mjs` (the LOOPS.md lint), `cases-bypass.mjs` (the bypasses closed by CR-2026-10-15-GAPS D1), `cases-gate.mjs` (guard rule 10), `cases-truth.mjs` (what the Stop card and the session markers say), `cases-grades.mjs` (each grade against its mechanism), `cases-wording.mjs` (the Stop card's own words); `adopt-selftest.mjs` proves adopt and remove on throwaway folders |
| `commands/` | adopt, remove, gut, move, scope, ship | one `.md` each | — | prompts ask; scripts write |
| `tools/adopt.mjs`, `tools/remove.mjs` | the writers | — | `templates/` | record every write in `<brain>/state/installed.json` |
| `agents/` | read-only reviewer | `reviewer.md` | — | |
| `templates/` | root and brain files | — | — | copied or filled by `adopt.mjs`, never edited in place |
| `instructions/`, `workflows/`, `lessons/` | the rule text | `LAW.md` | — | one subject per file; every clause has a `### ID` heading in its owner |
| `LOOPS.md` | the loops and gates, drawn | `README.md` | — | hand-drawn charts at most 64 columns, plain ASCII, a numbered list after each; `tools/tests/cases-loops.mjs` fails on an unknown clause id, a wide line, a tab or non-ASCII, or a chart with no list (CR-2026-10-15-CHART) |
| `docs/` | the public page | `build.mjs` | `src/template.html`, `src/transcript-*.txt` | `index.html` is generated from the kit's own files (DECISIONS 3.3; the README's method list and the `LOOPS.md` overview among them, 3.8); `publish.mjs` copies the output to the owner's site; `page.css`, `page.js` are hand-written |

## Key design decisions

- **Config mutability:** all tunables live in the brain, never in the plugin, so a plugin update
  never touches an adopter's settings.
- **Fail-loud, not fail-closed:** a hook that errors allows the action, logs it, and surfaces it on
  both channels. A broken hook that blocks everything gets switched off; a logged one gets fixed.
- **Grades are checked:** each clause declares its grade in `law.json`, and the generator checks
  it against the mechanism the clause names: a hook or tool anchor must declare the matching mode
  and the clause verb, a kit hook script must be registered in `hooks/hooks.json`, a Doctor claim
  must exist, and a permission rule must sit under `deny`
  (DENY) or `ask` (GATE). A mechanism that is missing or does not match fails the build, and
  nothing is written (`DF_SKIP_HOOK_FILES=1` turns a missing mechanism file or anchor into a
  warning, for a chunk that has not landed). A BUILDABLE clause names a planned section, which is
  not checked against the disk. In a brain's `LAW.md`, a mechanism that exists but that the
  installed state records as not installed on this machine prints HONOUR (mechanism not
  installed).
- **Two LAW outputs:** the kit's with kit grades; the brain's with kit + overlay, re-derived from
  what is installed on that machine (`state/law-installed.json`, written by adopt: every hook
  `hooks.json` registers). Each is built again by a Doctor claim and is RED on any difference:
  `KIT-LAW-01` for the kit, `BRAIN-LAW-01` (shipped in the brain's claims) for the brain.
- **Runtime:** Node.js 18 or newer, no packages. Every hook is one `node` process that reads one
  JSON document on stdin; it loads `child_process` and `crypto` only on the path that needs them,
  asks git each question once per process, and finds a plain repository's root from its `.git`
  without starting git. Paths are compared the way the file system compares them: without case on
  Windows and macOS, with case on Linux, after symlinks are resolved. The Doctor reads the
  repositories under the root in parallel.
- **Storage:** JSON for config and claims, Markdown for rules, flat logs with ISO timestamps for
  hooks; the Doctor reads logs by time window, never the whole file.

## How to modify a domain

Read `DECISIONS.md`. Read this page. Open only that domain. Change config before logic. Run
`node tools/tests/run.mjs`, `node tools/doctor/selftest.mjs` and `node tools/tests/adopt-selftest.mjs`,
all three, on each system you ship for: the Doctor self-test runs the `Doctor.bat` shim through
`cmd` on Windows and `doctor.sh` through `sh` elsewhere.
Run `node tools/doctor/doctor.mjs -Kit`.
Update the manifest.
