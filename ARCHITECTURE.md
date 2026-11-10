# design-first — ARCHITECTURE

## System at a glance

A Claude Code plugin whose hooks guard the session, whose `adopt` command sets up an adopter's
private brain from an interview, and whose two tools (Doctor, law generator) keep the written law
honest about what is actually enforced on the disk. Since 0.3.0 a repository can carry the kit
itself: the hooks and tools are vendored into its `.claude/kit/` with a VERSION that names the
bytes, every hook registration is rendered into its `.claude/settings.json` from one registry, and
a session that loads no plugin (a cloud session, a clone on another machine) runs that copy and
proves on its first turn that the hooks loaded.

## Stack

| runtime | version | pinned by | lockfile | install | why |
|---|---|---|---|---|---|
| Node.js | 18 or newer | nothing but the requirement line in `README.md`; no `.node-version`, no `engines` | none; no packages | none | every hook, the Doctor, the law generator, adopt, the vendor, settings, extract, selfcheck and release tools and the docs build are plain `node` scripts |
| git | any on PATH | none | none | none | the guard's probes, the Stop card, the Doctor's repository scan and the release gate's clean-tree check ask git |

A runtime this table does not name is a Change Request (GATE-06). The kit pins nothing because it
installs nothing; the README's line is the record, and `adopt` checks for Node.js 18 before its
first question.

## Core flow

```
law.json (+ <brain>/law.overlay.json) --> tools/law/build-law.mjs --> LAW.md (kit) / <brain>/LAW.md
                                                    ^
claims.json ------------> tools/doctor/doctor.mjs --+-- claims | skipped | survey | could-not-look --> <brain>/state/
hooks/registry.json ----> tools/settings.mjs -Plugin --> hooks/hooks.json (the plugin form; KIT-REG-01 holds it to the registry)
                                             -Vendored --> <repo>/.claude/settings.json (the hooks block, deep-merged into the repo's own; KIT-SETTINGS-01 holds the kit's own)
tools/vendor.json -------> tools/vendor.mjs --> <repo>/.claude/kit/ + VERSION (the sha over the copy; a tree_sha claim holds it)
hooks/hooks.json, or <repo>/.claude/settings.json --> guard.mjs / fence.mjs / ask.mjs / agent.mjs / card.mjs --> allow | deny | ask | rewrite | advise, + log
                           route.mjs / subagent.mjs --> LAW.md rows by group, per session, into context
                           entry.mjs --> the arming line, then entry path + state card (GAME-13, DES-14), into context
                           stop.mjs --> the first stop of a source turn refused once, with the card (DES-07, GATE-01/05/06/07, GAME-12)
<brain>/doctor.config.json + policies + LAW.md --> tools/extract.mjs --> <repo>/.claude/kit/extract.json (values by class; the hooks read it where no pointer is)
commands/adopt.md -------> tools/adopt.mjs --> <root>/CLAUDE.md, <root>/.claude/settings*.json (rendered), <root>/.claude/kit/,
                                               <brain>/*, <brain>/.claude/kit/ and settings.json when the brain is separate, ~/.claude/design-first.json
commands/control.md -----> tools/control.mjs --> <brain>/control/<DOMAIN>-CONTROL.md, <brain>/control/INTAKE.md
the three suites + tools/tests/red-expected.json --> tools/release.mjs --> plugin.json bump, LAW.md, docs/, README.md, .claude/kit/
```

On a PC everything resolves through the pointer file: `root` (where sessions start), `brain` (the
adopter's private layer), `pluginRoot` and its kind (checkout or cache). In a clone with no
pointer the hooks resolve their kit root in one order, `DF_KIT_ROOT`, the copy that is running,
`${CLAUDE_PROJECT_DIR}/.claude/kit` when it holds `law.json` and both policy templates, then the
pointer's `pluginRoot`, and read their values from `.claude/kit/extract.json`; the Doctor builds its
context under `-Scope brain` from `-Root`, or `CLAUDE_PROJECT_DIR` without it.

## Domains

| domain | purpose | entry point | config | notes |
|---|---|---|---|---|
| `.claude-plugin/` | manifest, marketplace | `plugin.json` | - | the repo root is the plugin and its own marketplace; the release gate moves the version |
| `hooks/` | session guards | `registry.json` | `<brain>/doctor.config.json` or `<repo>/.claude/kit/extract.json`, `<brain>/agent-policy.json` | one script per hook, one row each under Hooks below; `registry.json` is the one place a registration is typed, and `tools/settings.mjs` renders it into `hooks.json` and into a repository's settings file (KIT-03; never hand-edit `hooks.json`); `lib/` holds the tokeniser, the guard rules (`guard-rules.mjs` rules 1-6, `guard-owner-rules.mjs` 7-9 and 13-15, `guard-gate-rules.mjs` 10, `guard-loop-rules.mjs` 11 and 12), `law-rows.mjs` (LAW.md for both routers), `state-card.mjs`, `turn-changes.mjs`, `bounded.mjs` (the card hook's rows, one parser for both sources), `kit-version.mjs` (the version and tree sha the vendor tool, the arming line, the guard's ARMED reason and the Doctor compute one way), `secrets.mjs` (the secret shapes the extract refuses) and the shared helpers, among them the kit root order, the yield rule and the marker folder under the host's `scratchpad_dir`; anchors declare mode and verbs; session markers live in the marker folder |
| `tools/law/` | generator | `build-law.mjs` | `law.json` | `validate.mjs`, `render.mjs` imported; deterministic bytes; `validate.mjs` also fails a hook clause whose script, by its path under `hooks/`, the registration record does not register (a `lib/` file is never registered: the ref names the script that loads it); the record is `hooks/hooks.json` beside the law, or `hooks/registry.json` in a vendored copy, which carries no `hooks.json`, while beside `.claude-plugin/plugin.json` a missing `hooks.json` still fails; the cases run in `tools/doctor/selftest-law.mjs` |
| `tools/doctor/` | disk checker | `doctor.mjs` | brain config + `claims.json` | `context`, `claims`, `claims-keyed`, `claims-tree`, `claims-exec`, `claims-ratchet`, `claims-snapshot`, `repos`, `enforcement`, `survey`, `report`, `selftest` (its config contract cases are in `selftest-config`, its snapshot cases in `selftest-snapshot`, its honesty cases, a Doctor crash and a registered hook with no smoke claim, in `selftest-truth`, the law build and docs build on planted inputs in `selftest-law`, a word in letter codes planted against the shipped leak claim in `selftest-words`, and the `-Host`, SKIPPED and `-Scope brain` runs in `selftest-host`, all imported, split out by domain), and `snapshot.mjs`, the writer a `snapshot_diff` claim compares against; `claims-tree` carries `tree_sha` (a VERSION file against its tree) and `claims` the dispatcher with `line_count`; `context` resolves the registration record the survey and the `hook_smoke` runner read, `hooks.json` in the plugin form and the root's `.claude/settings.json` in the vendored form; a claim not run on this host is SKIPPED, its own band and count, never a pass; the reader table and the default config in `context` must name the same keys, and the self-test fails when they do not; a claim is read-only, so a ratchet's record is written by `doctor.mjs` after the run, into `state/ratchets.json`; one run is one process, and `claims-tree` keeps each repository's file list, first-commit date and glob regex for the length of it; `repos` reads `parallelGit` repositories at a time |
| `tools/vcs/` | git-side checks | `law-claim.mjs` | `<brain>/doctor.config.json` (`lawClaim`) | run by the shim `templates/commit-msg`, copied to `<brain>/.git/hooks/commit-msg`; the shim finds the kit through the pointer on every commit |
| `tools/tests/` | hook self-test | `run.mjs` | `guard-cases.json` | temp repos and a fake pointer; never touches the real one; `run.mjs` imports these case files, split out by domain, in the order of the list near its end: `cases-law-claim.mjs` (the commit check, VCS-23), `cases-state-card.mjs` (the GAME-13 and DES-14 cards), `cases-stop-git.mjs` (the Stop card read from git), `cases-own.mjs` (OWN-04, OWN-10), `cases-writer.mjs` (the route policy's `writerSkip` and the `Role:` line), `cases-size.mjs` (guard rule 6), `cases-loops.mjs` (the LOOPS.md lint), `cases-bypass.mjs` (the bypasses closed by CR-2026-10-15-GAPS D1), `cases-gate.mjs` (guard rule 10), `cases-truth.mjs` (what the Stop card and the session markers say), `cases-grades.mjs` (each grade against its mechanism), `cases-wording.mjs` (the Stop card's own words), `cases-gitcall.mjs` (the head of a git call: the prefixes, `--git-dir`, `--work-tree` and `core.excludesFile`, SAFE-01, CR-2026-10-16-ONEWRITER chunk 0), `cases-publish.mjs` (the site's `kit.json` on a temp site), `cases-selfcheck.mjs` (the arming probe and guard rule 15), `cases-session.mjs` (the cloud session start: the brief, the permission mode, the started marker), `cases-card.mjs` (the bounded-file hook), `cases-extract.mjs` (the extract's classes, rows and refusals), `cases-registry.mjs` (the registry render, the four sets, the merge, `-Check`), `cases-vendor.mjs` (the vendored copy, VERSION and `-Check`), `cases-release.mjs` (the release gate on fixture suites), `cases-parity.mjs` (the plugin form and the vendored form decide alike; the yield rule; the arming line), `cases-kitroot.mjs` (the running copy is the kit root; last, since it moves the pointer); every suite ends with a `red-expected: N` line, and `red-expected.json` maps each mechanism of the tree to the case that proved it red, read by `tools/release.mjs`; `adopt-selftest.mjs` proves adopt, remove and control on throwaway folders |
| `commands/` | adopt, remove, control, council, gut, move, scope, ship | one `.md` each | - | prompts ask; scripts write |
| `tools/adopt.mjs`, `tools/remove.mjs`, `tools/control.mjs` | the writers | - | `templates/` | adopt and remove record every write in `<brain>/state/installed.json`; a fresh adopt vendors the kit into the root, and into the brain when the brain is a separate folder, and renders their settings files through `tools/settings.mjs` (`-Vendor`, on by default; `-Settings <set>`, `pc` by default; a settings file with a `hooks` key of its own is kept and the merge command printed), with the vendored files recorded under `vendored`; attach mode writes only what is missing; remove deletes a vendored file only while its recorded sha still matches and says the brain's `.gitignore` lines stay; control writes one card under `<brain>/control/` and records nothing, since a card is the master's file from its first line and remove never deletes it |
| `tools/settings.mjs`, `tools/vendor.mjs`, `tools/vendor.json` | the registry renderer and the vendor tool | - | `hooks/registry.json`, `templates/settings.cloud-*.json` | `settings.mjs` renders the registry in the plugin form or the vendored form, keeps the rows of one host, adds a permissions set and deep-merges into a repository's own file, and `-Check` compares a render with the file byte for byte (anchor `settings-registry`, KIT-03); `vendor.mjs` copies the manifest into `<repo>/.claude/kit/` and writes VERSION, and `-Check` recomputes the sha (anchor `vendor-sha`, KIT-01); a manifest `include` entry must exist, an `optional` one travels when present, and `hooks/hooks.json` and the self-test files never travel |
| `tools/selfcheck.mjs` | the arming probe | - | - | prints `UNARMED: no guard saw this call` and exits 2 whenever it runs at all; a loaded guard refuses the command before it starts, with `ARMED <version> <sha>` (rule 15, KIT-02); the script imports nothing, so a broken copy still says UNARMED |
| `tools/extract.mjs` | the brain's values for a clone | - | `<brain>/doctor.config.json`, the policies, the overlay, `control/domains.json` | writes `<repo>/.claude/kit/extract.json` by class (`public`, `shared`, `private`, `full`), every path row host-neutral as `{repo, path}`; refuses to write an output that carries a secret shape (`hooks/lib/secrets.mjs`), a word of the brain's `leakWords` or, outside `private` and `full`, an overlay clause id; never opens `profile/`, `memory/` or the owner's own files |
| `tools/release.mjs`, `tools/tests/red-expected.json` | the release gate | - | the map | runs the three suites as child processes from the checkout, reads every mechanism from the tree (registry rows, numbered guard rules, claim types, anchor lines) and refuses a bump until each maps to a case that ran and passed, the tree is clean, `docs/build.mjs -Check` is green and the kit Doctor (`tools/doctor/doctor.mjs -Kit`) is GREEN; on green with `-Bump` it moves `plugin.json`, rebuilds `LAW.md`, `docs/` and `README.md` and vendors the kit into its own `.claude/kit/`, and prints the Node version that ran (anchor `release-gate`) |
| `.claude/kit/`, `.claude/settings.json` | the kit's own vendored copy and settings | `VERSION` | - | the checkout carries what an adopter gets: `.claude/kit/` vendored from itself, held to its VERSION by `KIT-VENDOR-01` (a `tree_sha` claim), and a settings file rendered in the vendored form with the `cloud-brain` set, held to that render by `KIT-SETTINGS-01`, so a cloud session on the checkout loads the vendored hooks; on a PC beside the plugin the vendored copy yields; after a change to any file the manifest names, refresh the copy with `node tools/vendor.mjs -Target . -Kit .` and commit it |
| `agents/` | read-only reviewer | `reviewer.md` | - | |
| `templates/` | root and brain files; the two control cards; the three cloud permission sets | - | - | copied or filled by `adopt.mjs`, never edited in place; `CONTROL.md` and `INTAKE.md` are filled by `control.mjs`; `settings.cloud-brain.json`, `settings.cloud-writer.json` and `settings.cloud-checker.json` are the permissions blocks `tools/settings.mjs -Set` adds for a session with nobody to click (the pc set's deny rows, then its ask rows as deny rows, never an ask key); `root-settings.json` stays the `pc` set |
| `instructions/`, `workflows/`, `lessons/` | the rule text | `LAW.md` | - | one subject per file; every clause has a `### ID` heading in its owner; `instructions/kit-law.md` owns the KIT group |
| `LOOPS.md` | the loops and gates, drawn | `README.md` | - | hand-drawn charts at most 64 columns, plain ASCII, a numbered list after each; chart 7 draws the vendored path from the registry to the arming line; `tools/tests/cases-loops.mjs` fails on an unknown clause id, a wide line, a tab or non-ASCII, or a chart with no list (CR-2026-10-15-CHART) |
| `docs/` | the public page | `build.mjs` | `src/template.html`, `src/transcript-*.txt` | `index.html` is generated from the kit's own files (DECISIONS 3.3; the README's method list and the `LOOPS.md` overview among them, 3.8), and so are the README's three marked blocks (the inventory; what adopt asks and writes, from `commands/adopt.md` and `tools/lib/adopt-plan.mjs`; the commands); `data.mjs` is the one reader of the adopt questions, the transcripts and the README's install block, for `build.mjs` and `publish.mjs` both (DISP-07); `publish.mjs` writes those facts to the owner's site as `method/data/kit.json` and nothing else, and `publish-selftest.mjs` checks it on a temp site; `page.css`, `page.js` are hand-written, and `page.css` caps the page at `--page-max` (3.4) |

## Hooks

What each hook does is its script's first comment line; `docs/build.mjs` renders those lines, with
the events and matchers from `hooks.json`, into the README's inventory and the page. This table
holds what the README does not: the lib each one leans on and the markers it reads or writes.
Every hook, right after it parses its input (0.3.0), moves its markers and both logs under the
host's `scratchpad_dir` when the input carries one (the `DF_*` test seam first, then
`scratchpad_dir`, then the fixed locations) and applies the yield rule: a copy running from
`.claude/kit/hooks/` prints nothing and exits 0, with one INFO line in the log, when the PC
pointer names a plugin root that holds `law.json`, because the plugin runs on the same event.

| hook | event | leans on | notes |
|---|---|---|---|
| `guard.mjs` | PreToolUse | `lib/guard-rules.mjs`, `guard-owner-rules.mjs`, `guard-gate-rules.mjs`, `guard-loop-rules.mjs`, `kit-version.mjs` | rules 1-15; rule 6 is the DES-03 read check, measuring the bytes a write would leave against `readCeilingBytes` and telling the agent once per file per session on its context only, never asking for a split for size; rule 11 lists the git commands it reads (push and send-pack, merge and pull; checkout and switch, worktree add, a rebase that checks out a branch that is not a loop branch, bisect and a fetch into a local branch on a loop branch; a branch rename, copy or forced move, update-ref and symbolic-ref; a fetch or ref move that writes or names a loop branch from any branch), reads a detached HEAD as the loop branch while a rebase or bisect of it is stopped (`onLoopBranch`), and any other git command that moves HEAD or a branch is its written residual; rule 15 (anchor `selfcheck-armed`, in `guard-owner-rules.mjs`) refuses `node <path>/selfcheck.mjs` with the reason `ARMED <version> <sha>`, the version module loaded only when the command names the probe; rule 4 reads the extract's `{repo, path}` rows against `CLAUDE_PROJECT_DIR` and names the extract in its reason when the values came from it; nominates the repositories a call pointed at into `<session>.repos` with the commit HEAD was on |
| `fence.mjs` | PreToolUse | `lib/common.mjs` | compares an Edit's old and new strings, or a Write's content with the file on disk, for a deletion it can see or an assertion removed from a measuring file |
| `ask.mjs` | PreToolUse | `lib/common.mjs` | checks the shape of a question against the brain's `ask` config (OWN-04); an allowed question writes `<session>.asked`, which the Stop card reads for GATE-01 |
| `agent.mjs` | PreToolUse | `lib/common.mjs` | rewrites an Agent call's model from `agent-policy.json` and counts spawns per turn in the marker folder; on a session-start tool named in `brief.sessionTools` (the desktop app's start tool and the cloud's `create_session`) checks the brief headings only (CTRL-02); on a cloud `create_session` also holds the caller's `permission_mode` and the child's to `session.requireMode` when the policy names one, and refuses a second start of the same title in one prompt from `<session>.started`, which it appends on every allowed start; the cloud's `send_message` passes through with one INFO line |
| `card.mjs` | PreToolUse | `lib/bounded.mjs`, `lib/common.mjs` | holds a file matching a `boundedFiles` row (the brain's `doctor.config.json` through the pointer, else the extract) to its limits: an added id, growth while over `maxBytes`, a head past `headLines` and longer than before, a shrink of an append-only file; computes the result an Edit or Write would leave against the file on disk after CRLF to LF; the template ships no row, so the kit itself is unaffected |
| `route.mjs` | UserPromptSubmit | `lib/law-rows.mjs` | keeps `<session>.routes`, puts the policy's `alwaysForSessions` groups first on every prompt (OWN-10), writes the prompt's time into `<session>.turn` and deletes `<session>.started` with the edit ledger at every prompt, marks the session a writer in `<session>.role` when its first prompt has a line-start `Role: writer`, or `Reports to:` at the start of a line with no `Role:` line, decides again when the mark is gone (a reclaimed VM), and drops the policy's `writerSkip` law from a writer (`entry.mjs` clears the mark on a clear, not on a compaction) |
| `subagent.mjs` | SubagentStart | `lib/law-rows.mjs` | leaves the session-only groups out of a subagent's injection; sizes the advise-by-role block first and reserves its room before admitting groups (CR-2026-10-17-ADVISE-FIRST) |
| `entry.mjs` | SessionStart | `lib/kit-version.mjs`, `lib/state-card.mjs` | prints the arming line first on every source, `kit: armed <version> <sha>` over the kit root `lib/common.mjs` resolved, `kit: unarmed MISSING: kit` with no kit root, or `kit: unarmed ERROR: ...` (with an ERROR log line) for a kit root whose version cannot be read, never silence; a vendored copy whose files are not the bytes its VERSION names reads `kit: armed <version> <sha> DIFFERS: the tree is not the bytes VERSION names`, and one whose VERSION lists no file `... DIFFERS: VERSION names no file; nothing to prove`, each with a WARN log line and the check to run (`node .claude/kit/tools/vendor.mjs -Target <repo> -Check` for a `<repo>/.claude/kit` root; any other root is named with its VERSION instead); the state card (GAME-13 by folder group, DES-14 for any repository with a hand-off when `stateCard.anyRepoWithHandoff` is on) reads the route policy to decide whether the session's repository gets one and prints the hand-off's `## Next session` prompt; prunes no marker and no log under `scratchpad_dir` |
| `stop.mjs` | Stop | `lib/turn-changes.mjs` | asks git what changed since `<session>.turn` in each repository in `<session>.repos`; the card's first line names the clauses of the lines on it, GATE-01 only when its interview line is there, GATE-06 on every card |

## The vendored kit (0.3.0)

A hook registered by the plugin runs only where the plugin is installed, and a cloud session
installs none: its messages travel one way, its state lives outside git, and nothing told it that
no hook loaded. So a repository carries the kit itself, and three facts about that copy are checked
by a machine (`instructions/kit-law.md`, KIT-01 to KIT-03; the chart is `LOOPS.md` 7).

- **One registry, two forms.** `hooks/registry.json` holds one row per registration (`id`, `event`,
  `matcher`, `script`, `timeout`, `host`, `mode`, `vendor`). `tools/settings.mjs` renders it: `-Plugin`
  into `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths, byte for byte what the kit committed
  before the registry existed; `-Vendored` into a repository's `.claude/settings.json` with
  `${CLAUDE_PROJECT_DIR}/.claude/kit` paths. `-Host pc|cloud` keeps the rows for one host, `-Set` adds
  the permissions block of one of four sets (`pc`, the template as it is; `cloud-brain`,
  `cloud-writer`, `cloud-checker`, each with the install verbs as deny rows and no ask key), and a
  deep merge keeps the repository's own rows and keys. `-Check` is the gate, and on every kit
  Doctor run `KIT-REG-01` runs the plugin render against `hooks/hooks.json` and `KIT-SETTINGS-01`
  the vendored render with the `cloud-brain` set against the kit's own `.claude/settings.json`. A
  vendored render that names `CLAUDE_PLUGIN_ROOT` is refused: the variable is unset in a container.
- **The copy and its proof.** `tools/vendor.json` names what travels: the hooks and their libraries
  with the registry (never `hooks.json`), `law.json`, `LAW.md` and every file the law cites, the
  policy templates and the pc permission template (`root-settings.json`; the three cloud sets stay
  in the checkout, so a vendored `settings.mjs` refuses a cloud `-Set`), the Doctor, the law
  generator, the tool libraries, the settings and vendor tools, and the optional tools
  (`selfcheck.mjs`, `extract.mjs`, `gate.mjs` when it exists).
  `tools/vendor.mjs` copies them into `<repo>/.claude/kit/` and writes `VERSION` (`version`, `sha256`
  over the copied files, `files`, `at`), rewritten only when one of the first three differs; a
  manifest entry that does not exist refuses the run before anything is written, because a short
  copy fails open. `vendor.mjs -Check` and the Doctor claim type `tree_sha` recompute the sha;
  the brain's claims ship `KIT-VENDOR-01` on the root's copy and `KIT-VENDOR-02` on the brain's,
  and the kit's own claims carry `KIT-VENDOR-01` on its own copy. Neither sees a file the manifest
  does not name.
- **Where a hook reads from.** `lib/common.mjs getKitRoot` resolves the kit root in one order
  (`DF_KIT_ROOT`, the running copy, `${CLAUDE_PROJECT_DIR}/.claude/kit`, the pointer's plugin root),
  and `readBrainConfig` takes the brain's `doctor.config.json` through the pointer when there is
  one, else the extract at `DF_EXTRACT_PATH` or `${CLAUDE_PROJECT_DIR}/.claude/kit/extract.json`.
  `tools/extract.mjs` writes that file from the brain by class; a path row travels as `{repo, path}`
  and resolves under `CLAUDE_PROJECT_DIR` only in the clone whose folder name is that repository (a
  `repo` of `*` resolves in every clone). In a clone a hook never reads a `doctor.config.json`;
  the Doctor (the clone's own, under `-Scope brain`) and the extract (the brain's) read that file
  directly.
- **Two proofs that the hooks loaded.** `entry.mjs` prints `kit: armed <version> <sha>` first on
  every start (with `DIFFERS: ...` when a vendored copy is not the bytes its VERSION names), or
  `kit: unarmed ...`, never silence. A session's brief then runs
  `node .claude/kit/tools/selfcheck.mjs`: guard rule 15 refuses it with `ARMED <version> <sha>`,
  and when no guard saw the call the script prints `UNARMED: no guard saw this call` and exits 2.
  The refusal is the proof a model cannot forge, so KIT-02 is graded on the guard's anchor.
- **One copy decides a call.** The yield rule in `lib/common.mjs`: a hook running from
  `.claude/kit/hooks/` steps aside when the PC pointer names a plugin root that holds `law.json`
  (one INFO line, exit 0), unless that root is the copy itself. The pointer never travels, so in
  the cloud the vendored copy always decides. A stale pointer makes every vendored hook yield to
  nobody, and the arming line and the probe are the only signs. A side-effect dedup for two spawns
  of one hook was designed and deferred: both copies decide alike, and the ledger may hold a line
  twice.
- **The Doctor in a clone.** `doctor.mjs -Scope brain -Host cloud -Root .`, run from the clone's
  root, builds its context with no pointer, from `-Root` or, without it, `CLAUDE_PROJECT_DIR` (a
  cloud session's hooks get that variable, its Bash does not): root and brain are the clone, the
  kit is its `.claude/kit/` when that holds the Doctor, the claims are its `claims.json`, and the
  registration record is its `.claude/settings.json`, there or not. `-Host` is explicit, never
  guessed; under `cloud` a claim whose path needs `${ROOT}`, `%USERPROFILE%` or `${LOCALAPPDATA}`,
  or whose typed `host` is the other one, is SKIPPED: its own band and `-Json` count, never a pass,
  outside the verdict. `tree_sha` and `line_count` are the two claim types added for it.
- **The kit's own copy.** The checkout commits `.claude/kit/` vendored from itself and a
  `.claude/settings.json` rendered with the `cloud-brain` set, so a cloud session on the kit runs
  what an adopter runs; `KIT-VENDOR-01` holds the copy to its VERSION, `KIT-SETTINGS-01` holds the
  settings file to the registry render, and the release gate vendors the copy again on every bump.
- **The release gate.** `tools/release.mjs` runs the kit Doctor (`tools/doctor/doctor.mjs -Kit`)
  and spawns the three suites, reads every mechanism of the tree and refuses a bump until
  `tools/tests/red-expected.json` maps each to a case that ran and passed, the kit Doctor is GREEN,
  the tree is clean and the docs match; each suite prints `red-expected: N` beside its count. On
  green with `-Bump` it moves `plugin.json`, rebuilds `LAW.md`, the page and the README, vendors
  the kit into itself and prints the Node version that ran.
- **What stays out.** An adopter's own regime (its sessions, their titles and its domains) stays in
  its brain, and the kit's examples use invented names; the session hook keys its started marker on
  the title, because the kit defines no domains. What a host does with a deny inside a container, whether a SessionStart line is
  visible there and whether a child honours its `permission_mode` are written in `tools/MANUAL.md`
  as unconfirmed, not assumed.

## Key design decisions

- **Config mutability:** all tunables live in the brain, never in the plugin, so a plugin update
  never touches an adopter's settings. A clone with no brain reads the extract, which carries
  values only, never the brain's text.
- **Fail-loud, not fail-closed:** a hook that errors allows the action, logs it, and surfaces it on
  both channels. A broken hook that blocks everything gets switched off; a logged one gets fixed.
  The one deliberate refusal before anything runs is the vendor tool's: a manifest entry that does
  not exist stops the copy, because a short copy would fail open in silence.
- **Grades are checked:** each clause declares its grade in `law.json`, and the generator checks
  it against the mechanism the clause names: a hook or tool anchor must declare the matching mode
  and the clause verb, a kit hook script must be registered in `hooks/hooks.json` (in a vendored
  copy, which carries no `hooks.json`, in `hooks/registry.json`), a Doctor claim
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
- **One registry, rendered, never typed:** a registration is typed once, in `hooks/registry.json`;
  `hooks/hooks.json` and every repository's `.claude/settings.json` are renders of it, and a hand
  edit to a render is a RED run (`KIT-REG-01` on `hooks/hooks.json`, `KIT-SETTINGS-01` on the kit's own
  settings file, `SETTINGS-BLOCK-01` on an adopter's). The registry travels with the
  vendored copy so that the vendored law build can prove its hook clauses; the plugin form does not.
- **A session runs the bytes its repository carries:** the vendored copy under `.claude/kit/` is
  the kit a cloud session runs, held to its VERSION by a claim, and a session proves on its first
  turn that the copy loaded (the arming line, the guard's ARMED refusal). On a PC the plugin keeps
  deciding until the pointer is gone, and a vendored hook yields rather than decide a call twice.
- **Hosts are explicit:** the Doctor never guesses where it runs. `-Host pc|cloud` is typed on the
  command line (`Doctor.bat` and `doctor.sh` pass every argument through and add none), a claim the
  host cannot judge is SKIPPED in its own band and never a pass, and without `-Host` nothing is
  skipped.
- **Runtime:** the Stack section names it. Every hook is one `node` process that reads one
  JSON document on stdin; it loads `child_process` and `crypto` only on the path that needs them,
  asks git each question once per process, and finds a plain repository's root from its `.git`
  without starting git. Paths are compared the way the file system compares them: without case on
  Windows and macOS, with case on Linux, after symlinks are resolved. The Doctor reads the
  repositories under the root in parallel.
- **Storage:** JSON for config and claims, Markdown for rules, flat logs with ISO timestamps for
  hooks; the Doctor reads logs by time window, never the whole file. A cloud session's markers and
  logs land under the host's `scratchpad_dir`, which dies with the session, and nothing prunes there.

## How to modify a domain

Read `DECISIONS.md`. Read this page. Open only that domain. Change config before logic. Run
`node tools/tests/run.mjs`, `node tools/doctor/selftest.mjs` and `node tools/tests/adopt-selftest.mjs`,
all three, on each system you ship for: the Doctor self-test runs the `Doctor.bat` shim through
`cmd` on Windows and `doctor.sh` through `sh` elsewhere.
Run `node tools/doctor/doctor.mjs -Kit`.
A change to `hooks/registry.json` needs `node tools/settings.mjs -Plugin -Out hooks/hooks.json` and
`node tools/settings.mjs -Vendored -Set cloud-brain -Out .claude/settings.json` and a commit of the
three files (`KIT-REG-01` and `KIT-SETTINGS-01` hold the two renders); a change to any file
`tools/vendor.json` names needs
`node tools/vendor.mjs -Target . -Kit .` and a commit of `.claude/kit/` (`KIT-VENDOR-01` holds the
copy to its own VERSION, not to the checkout, so a copy left behind stays GREEN; the same command
with `-DryRun` names what a fresh vendor would rewrite);
a new registry row, guard rule, claim type or anchor needs its row in `tools/tests/red-expected.json`
naming the case that proved it red. Before a version bump run `node tools/release.mjs -DryRun`; the
bump itself is `node tools/release.mjs -Bump patch|minor|major`, which refuses until every suite is
green, every mechanism is mapped, the kit Doctor is GREEN, the tree is clean and the docs match.
Update the manifest.
