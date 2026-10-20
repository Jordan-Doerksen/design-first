# design-first

A working method for building software with coding agents, packaged as a Claude Code plugin.
Interview before code. Decisions locked in a manifest. Every rule has an id, one owning file,
and an enforcement grade that says whether a machine will stop you or only ask.

It runs as eight hooks around the agent's tool calls, a Doctor that checks what the documents
claim against the disk, and a generator that refuses to print a rule whose mechanism is missing.

Status: V1, installable. Windows, macOS and Linux, with Node.js 18 or newer and git on PATH.
The version is in `.claude-plugin/plugin.json`.

## Install and adopt

Installing is one step of two. Nothing is set up until you run `/design-first:adopt`.

```
claude plugin marketplace add Jordan-Doerksen/design-first
claude plugin install design-first@design-first
/design-first:adopt
```

**Before you adopt**, the hooks already run, on the kit's defaults and with no brain. The
guard's staging, history and `.env` rules, the fence, the question check, the subagent check
and the Stop card all work. The frozen and tombstoned path rules do not, and no law is put into
a session or a subagent, because all of those read the brain. Every session's first turn says
so: `design-first: no brain is set up on this profile ... Run /design-first:adopt to create one.`

**When you adopt**, the command checks for Node.js 18, then asks seven questions, one at a time,
the recommended answer first. The last is asked only when root is a git repo. The command only
asks; a script does every write.

<!-- adopt:start -->
<!-- rendered by docs/build.mjs from commands/adopt.md and tools/lib/adopt-plan.mjs; do not edit by hand -->

| # | it asks | recommended answer |
|---|---|---|
| 1 | **Root**: Which folder do your sessions start under? Root holds the entry `CLAUDE.md` and `.claude/settings.json`. | the current working directory |
| 2 | **Brain**: Where should your brain live? It is your private folder for personal law, claims and state. | `<root>/brain` |
| 3 | **Owner name**: What name should the guard use for you in its messages, and the brain's `me.md` carry as `owner.name`? | the git `user.name` if one is set |
| 4 | **GitHub owner(s)**: Which GitHub owner(s) do your repositories push to? A remote that matches none of them is reported as FOREIGN by the Doctor. | a name you can see in the root's remotes, if any |
| 5 | **Brain as a git repo**: Should the brain be a git repository? | Yes |
| 6 | **Frozen paths**: Any frozen paths: folders the guard must refuse to edit or delete, such as a reference copy you keep on purpose? | None |
| 7 | **Settings scope** (asked only if root is a git work tree): The kit's deny/ask permission rules go in a settings file under root. Commit them or keep them personal? | Commit them in `.claude/settings.json` |

The files it writes, from the plan `tools/adopt.mjs` writes from:

| file | why |
|---|---|
| `<root>/CLAUDE.md` | entry point; prohibitions in full |
| `<root>/.claude/settings.json` | kit deny/ask rules (SPEC 5.8) |
| `<brain>/me.md` | who the owner is; owner.name feeds the guard |
| `<brain>/voice.md` | how the owner's copy reads |
| `<brain>/prohibitions.md` | the owner's own hard rules (overlay owning file) |
| `<brain>/law.overlay.json` | overlay: empty clauses, empty overrides |
| `<brain>/lessons.md` | lessons -> clauses |
| `<brain>/canonical.md` | one subject, one file |
| `<brain>/DECISIONS.md` | the brain's own manifest (DES-01) |
| `<brain>/ARCHITECTURE.md` | the brain's own map (DES-01) |
| `<brain>/claims.json` | claims; BRAIN-POINTER-01 |
| `<brain>/doctor.config.json` | Doctor config; owners, frozen paths, snapshot pairs filled |
| `<brain>/entry.json` | the entry path |
| `<brain>/agent-policy.json` | subagent brief contract, model routes, spawn cap (DES-11) |
| `<brain>/route-policy.json` | law routed per prompt: words per group, folders, subagent defaults (DES-13) |
| `<brain>/Doctor.bat` | Windows shim; resolves the kit through the pointer |
| `<brain>/doctor.sh` | Linux and macOS shim; resolves the kit through the pointer |
| `<brain>/instructions/README.md` | owning files for overlay clauses |
| `<brain>/.gitattributes` | the repo decides its bytes, not core.autocrlf; only when the brain is a git repo |
| `<brain>/.gitignore` | state/ is generated (installed.json, heartbeat, Doctor output); only when the brain is a git repo |

<!-- adopt:end -->

It never overwrites. A file that already exists is kept and its diff printed, so adopting over
a brain you already have changes nothing you wrote. It also writes the pointer
`~/.claude/design-first.json`, the brain's `LAW.md` and `state/`, byte snapshots of the root
files when root is not a repo, and runs `git init` (no commit) for a repo brain. Then it runs
the Doctor once: exit 0 is GREEN, 1 is RED, 2 is COULD-NOT-LOOK, which is not a pass. For
frozen paths it prints lines to paste into `~/.claude/settings.json`; it never writes that file.

**After you adopt**, start a new session under root (the entry path prints on turn one), fill
`<brain>/me.md` and `voice.md`, and commit the brain.

To see every step with nothing written, run the script yourself with `-DryRun`:
`node <pluginRoot>/tools/adopt.mjs -Root <root> -OwnerName <name> -DryRun`.
`/design-first:remove` reverses what `adopt` wrote and keeps, and lists, anything you changed.

## Commands

<!-- commands:start -->
<!-- rendered by docs/build.mjs from commands/*.md; do not edit by hand -->

| command | what it does |
|---|---|
| `/design-first:adopt` | Set up design-first on this machine. Asks seven questions one at a time, then a script writes root, brain and pointer, generates LAW.md and runs the Doctor. |
| `/design-first:control` | Open a domain's master control session. Reads the domain's row from the Intake card or asks for it, renames the session, writes the control card from a template, lists and messages the domain's sessions, files them in the sidebar and pins the master. `intake` writes the Intake card. |
| `/design-first:council` | Run a pitch past every council seat in the project's agents folder, one question at a time, and record the verdicts. Writes the manifest only after the owner says yes. |
| `/design-first:gut` | Stress-test an idea before committing to it. Blunt devil's advocate. |
| `/design-first:move` | Get a recommendation (not a survey) on a decision. |
| `/design-first:remove` | Reverse what /design-first:adopt wrote. Deletes only unedited kit-written files and generated ones, keeps and lists everything you changed, removes the pointer. |
| `/design-first:scope` | Plan a feature before building. Approach, what to reuse, simplest version, the one decision needed. |
| `/design-first:ship` | Build something in this codebase's style, then prove it actually works. |

<!-- commands:end -->

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
| `commands/` | adopt, remove, control, council, gut, move, scope, ship |
| `tools/adopt.mjs`, `tools/remove.mjs`, `tools/control.mjs` | the writers |
| `agents/` | read-only reviewer |
| `templates/` | root and brain files; the two control cards |
| `instructions/`, `workflows/`, `lessons/` | the rule text |
| `LOOPS.md` | the loops and gates, drawn |
| `docs/` | the public page |

The hooks, as `hooks/hooks.json` registers them:

| hook | event | on | what it does |
|---|---|---|---|
| `guard.mjs` | PreToolUse | Edit, Write, NotebookEdit, Bash, PowerShell | refuses the call that would stage a secret, rewrite git history, touch a frozen path, write source behind an open design gate, or leave or push the loop branch; advises on a write with no manifest or past one Read. |
| `fence.mjs` | PreToolUse | Edit, Write, Bash, PowerShell | stops a deletion it can see, and an edit that removes or weakens an assertion in a measuring file, with the fence question to answer first. |
| `ask.mjs` | PreToolUse | AskUserQuestion | refuses a question with more than one part, an option with no reason, an "either is fine", or a recommended option that is not first (OWN-04). |
| `agent.mjs` | PreToolUse | Agent, mcp__ccd_session__start_session | holds a subagent spawn, or a session start, to its brief contract, routes a subagent's model from the brain's policy, and asks past the spawn cap (DES-11, CTRL-02). |
| `route.mjs` | UserPromptSubmit | every | injects the law groups the prompt's words and the working folder name, once per session, plus the groups every session gets (DES-13). |
| `stop.mjs` | Stop | every | ends a turn that changed source with its card, asked once: documents, the verify gate, the Change Request, the cross-check, the Definition of Done (DES-07, GATE-01, GATE-05/06/07, GAME-12). |
| `subagent.mjs` | SubagentStart | every | gives a subagent the session's law groups and the ADVISE clauses its role answers for, the ADVISE block reserved first (DES-13). |
| `entry.mjs` | SessionStart | startup, resume, clear, compact | prints the brain's entry path on session start, refreshes the pointer, clears the session's routes on a compaction, and opens a repository that carries a hand-off with its state card. |

<!-- inventory:end -->

Your own layer, the brain, lives outside this repo: who you are, how you want to be spoken to,
your prohibitions, your claims, your lessons. `adopt` writes it from an interview. Nothing about
the author ships here.

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
