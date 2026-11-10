# Doctor manual

How to run it, what each band means, every finding it can print and what to do about it. Since
0.3.0 the kit tools around it are here too: the vendor tool, the settings renderer, the arming
probe, the extract and the release gate, each with its lines, its exit codes and its limits.

## Run it

On Windows double-click `Doctor.bat` in your brain folder; on Linux or macOS run `./doctor.sh`
there. Or from any shell:

```
node <pluginRoot>/tools/doctor/doctor.mjs            # your brain and root
node <kit checkout>/tools/doctor/doctor.mjs -Kit     # the kit checks the tree this script sits in
node <pluginRoot>/tools/doctor/doctor.mjs -Json      # one JSON document, no colour
node .claude/kit/tools/doctor/doctor.mjs -Scope brain -Host cloud -Root .   # a cloud session, from the brain clone's root
```

`-Kit` checks the copy of the kit that the script sits in. To check a change, run the checkout's
script; `<pluginRoot>/tools/doctor/doctor.mjs -Kit` and `Doctor.bat -Kit` check the copy the
pointer's `pluginRoot` names, which is the installed copy unless the plugin runs from the checkout.

Switches: `-Kit`, `-Json`, `-Quiet`, `-ConfigPath <file>`, `-ClaimsPath <file>`, and since 0.3.0
`-Host pc|cloud` (which host this is: explicit, never guessed; a claim this host cannot judge is
SKIPPED, below), `-Scope brain` (also `--scope brain`: a brain checkout with no pointer) and
`-Root <folder>` (with `-Scope brain`: the checkout, when `CLAUDE_PROJECT_DIR` is not set; a cloud
session's Bash does not set it, only its hooks get it, so the cloud command above passes `-Root .`
and runs from the root of the brain clone).
`Doctor.bat` and `doctor.sh` pass them through; `Doctor.bat` pauses only when run with no arguments.

Nothing runs it for you. No scheduled task, no login entry, no timer.

## Where it looks

Everything comes from the pointer `~/.claude/design-first.json` (on Windows,
`%USERPROFILE%\.claude\design-first.json`; `DF_POINTER_PATH` overrides the location, for tests):

| From the pointer | Derived from it |
|---|---|
| `root` - where sessions start | `<root>/.claude/settings.json` + `settings.local.json` |
| `brain` - your private folder | `<brain>/doctor.config.json`, `<brain>/claims.json`, `<brain>/state/`, `<brain>/records/` |
| `pluginRoot` - the kit | `<pluginRoot>/hooks/hooks.json` (the plugin form; when the kit carries no `hooks.json`, a vendored copy, the registrations are read from `<root>/.claude/settings.json`), `tools/law/build-law.mjs` |
| - | fence log, fixed: `~/.claude/fence-log.txt` |

Under `-Kit` there is no brain: the kit is `root`, `${KIT}` and `pluginRoot`; claims come from
`<kit>/tools/doctor/claims.json`; config from `<kit>/templates/doctor.config.json` (defaults if
absent); state goes to `<kit>/state/`.

Under `-Scope brain` (0.3.0) there is no pointer: a cloud session holds one clone and no profile
file. `root` and `brain` are both `CLAUDE_PROJECT_DIR`, or `-Root <folder>` (which wins); the kit is
`<brain>/.claude/kit` when that vendored copy holds `tools/doctor/doctor.mjs`, else the copy
running; claims come from `<brain>/claims.json`, config from `<brain>/doctor.config.json`, state
goes to `<brain>/state/`. The hook registrations are read from `<brain>/.claude/settings.json`, the
vendored form rendered by `tools/settings.mjs -Vendored`, with `${CLAUDE_PROJECT_DIR}` read as the
brain: that file is the record whether or not it exists, because the kit this scope resolves may be
the running copy, whose `hooks/hooks.json` registers that checkout's hooks and never the brain's.
`settings.local.json` is never read: a clone does not carry it. The brain's `claims.json` as adopt
ships it marks the pointer and tombstone claims `host: pc`, so a `-Host cloud` run skips them.

## Bands and exit codes

| Band | Holds | Effect |
|---|---|---|
| **CLAIMS** | every claim in `claims.json`, plus the built-in config schema check | any `FAIL` = **RED, exit 1** |
| **SURVEY** | repository, wiring and snapshot findings | **REPORTED, exit 0**. With `surveyStrict: true` in the config, `fail`-severity findings are RED (exit 1). `warn` and `info` never change the exit code. |
| **COULD-NOT-LOOK** | anything the Doctor could not check, including every `UNKNOWN` claim and a crash of the Doctor itself | **exit 2. Never a pass.** It wins over RED. |
| **SKIPPED** (0.3.0) | every claim not run on this host: with `-Host cloud`, a claim whose raw path fields (`path`, `other`, `root`, `base`, `paths`, `source`, `output`, `overlay`, `installed`, `snapshot`, `generator`) carry `${ROOT}`, `%USERPROFILE%` (any letter case), `${LOCALAPPDATA}` or `%LOCALAPPDATA%`; with either host, a claim whose typed `host` names the other one | **its own band and its own count, outside the verdict.** Never a pass, never counted under CLAIMS, never COULD-NOT-LOOK. Without `-Host` nothing is skipped. |

`GREEN` means: no false claim, nothing it could not look at, and (if strict) no survey fail.
A `GREEN` with survey findings printed is still exit 0; the verdict line says how many were
reported and not counted. A run with skipped claims says so in its reason (`N claim(s) skipped on
this host, not counted`): a false claim beside skipped ones is still RED, and a run in which every
claim was skipped is GREEN with the line `no claim ran on this host (N skipped); nothing was
proved`, which is not a pass of anything. The header line names both: `scope <pointer|brain|kit>
host <pc|cloud|(none given: nothing is skipped by host)>`.

## The CLAIMS band

Each claim prints one line when it fails or cannot be evaluated:

| Line | Means | Do |
|---|---|---|
| `FAIL  <ID>  <detail>` then `why: ...` | A statement a law file depends on has gone false. | Read the `why`. Fix the document or fix the world. Never delete the claim to make it pass. |
| `????  <ID>  <detail>` | The claim could not be evaluated (file missing, generator failed, hook not registered, unknown type). Counted in COULD-NOT-LOOK. | Make the thing checkable, or remove a claim that can never be. |
| `FAIL  CONFIG-SCHEMA  MIGRATE: <config> is schema N; this Doctor expects schema 1` | The plugin was updated and your `doctor.config.json` is older (or has no `schema`). Every reader below assumes schema 1. | Follow the migration note in the kit README, then set `schema` to 1. |
| `FAIL  BRAIN-LAW-01  <brain>/LAW.md differs from the generator's output` | Your brain's `LAW.md` is not what a fresh build of the kit's `law.json`, your overlay and `state/law-installed.json` gives. A plugin update changed the law, or someone edited `LAW.md` by hand. The route and subagent hooks read their law rows from this file, so sessions get the old law until it is rebuilt. | Rebuild it with the command under the table. Never edit `LAW.md` by hand; change the overlay. |
| `????  BRAIN-LAW-01  installed missing: <brain>/state/law-installed.json` | The file `adopt` writes for the law build is gone: `state/` was deleted, or this is a clone of a brain whose commit does not carry it (a brain adopted before 0.3.0 ignores all of `state/`). | On the PC, run `/design-first:adopt` again: attach mode writes it and changes no file you edited. A clone cannot run adopt: commit `state/law-installed.json` in the brain from the PC (the `.gitignore` adopt writes, `state/*` and `!state/law-installed.json`, lets it through; a brain adopted before 0.3.0 changes its `.gitignore` to those two lines by hand and commits that file), then clone or pull again. A clone has no grace period for `RESTORE-01` either: log a dated restore drill in `records/restore-drill.log` and commit it. |
| `every claim holds` | All claims PASS. | - |
| `every claim that ran holds (N skipped, not counted)` | Every claim that ran passed; N were SKIPPED for this host (0.3.0) and proved nothing. | Run the Doctor on the other host for those, or read their `SKIP` lines. |
| `no claim ran on this host (N skipped); nothing was proved` | Every claim was SKIPPED. The verdict is GREEN because nothing was false, and it is not a pass of anything. | Give this host a claim it can judge, or run on the other host. |
| `SKIP  <ID>  host pc claim, run with -Host cloud` (or the other way round) | The claim is typed `host: pc` (or `cloud`) and this run is the other host. Printed in the SKIPPED band, after the CLAIMS band. | Nothing here. |
| `SKIP  <ID>  path needs ${ROOT}; no pointer here` (or `%USERPROFILE%`, `${LOCALAPPDATA}`) | Under `-Host cloud` a path field carries a token only the PC can stand behind. | Nothing here; a cloud clone holds no root tree and no profile. |
| `????  <ID>  'host' must be pc, cloud or any (got 'x')` | A typed `host` nothing knows. COULD-NOT-LOOK on every run, with or without `-Host`, so a typo never skips a claim in silence. | Fix the word. |
| `no claims to check` | The claims file has an empty `claims` array. | Add a claim whenever a law file states a fact about the disk. |

Rebuild the brain's `LAW.md` with the same inputs `BRAIN-LAW-01` uses (adopt ships that claim in
the brain's `claims.json`). Run it after every plugin update that changes the law, and after every
overlay edit:

```
node <pluginRoot>/tools/law/build-law.mjs -Source <pluginRoot>/law.json -Overlay <brain>/law.overlay.json -Installed <brain>/state/law-installed.json -BrainRoot <brain> -Out <brain>/LAW.md
```

`state/law-installed.json` is written by `adopt`, not by the Doctor: every hook the kit's
`hooks.json` registers (`true` when its script exists), whether root settings carry the kit's
rules, and the pointer. A clause whose mechanism it records as `false` prints `HONOUR (mechanism
not installed)`. A hook it does not name keeps the kit grade, so a hook that a later plugin
version registers is not printed as missing.

### Claim types (SPEC 5.2)

Paths expand `%USERPROFILE%` (the home folder on every system, and any other `%VAR%`), `${ROOT}`, `${BRAIN}`, `${KIT}`. A relative path is
brain-relative (kit-relative under `-Kit`). A path with an unexpandable variable is UNKNOWN.

| type | fields | PASS when | FAIL when | UNKNOWN when |
|---|---|---|---|---|
| `path_exists` | `path` | present | missing | unexpanded variable |
| `path_absent` | `path` | absent | present | unexpanded variable |
| `file_contains` | `path`, `needle` | literal substring found anywhere in the file | absent | file missing |
| `file_fresh` | `path`, `maxDays`, `graceFromInstall?` | the last line that starts with an ISO date is at most `maxDays` old; with `graceFromInstall` a missing file passes until `maxDays` after the write time of `state/installed.json` | file missing (past the grace), no dated line, or the last dated line is older | `maxDays` not a positive integer |
| `config_paths_each` | `configKey` or `paths[]`, `base?`, `file?`, `contains[]`, `regex[]?` | every listed folder holds `file` with every string in `contains` and a match for every pattern in `regex`; with `base`, a relative entry is joined under that folder; with no `file`, each entry is itself the file read; a string in `contains` may hold alternatives split by `\|` and one of them must be present; a `regex` entry is a bare source, matched with flags `im` (so `^` is a line start), or `/source/flags`, so a claim can carry a hook's own pattern; an empty list passes and says so | a folder missing the file, a file missing, or the file missing a string or a match; each row names the folder or file and ends with the full path read | the config key absent, no list given, no `file` and neither `contains` nor `regex`, or a `regex` that does not compile |
| `file_not_contains` | `path`, `needle` | absent | present | file missing |
| `line_count` (0.3.0) | `path`, `max` | the file has at most `max` lines; LF or CRLF, a trailing newline is not a line, an empty file has none (detail `N lines (max M)`) | more lines than `max` (detail `N lines, max M: <path>`) | file missing, or `max` not a positive integer |
| `log_window_free_of` | `path`, `needle`, `days` | no line that starts with an ISO date/timestamp within `days` contains `needle`. No log file at all is a PASS, said in the detail. | such a line exists | `days` not a positive integer |
| `remote_is` | `path`, `remote` (default `origin`), `pattern` (regex) | `git remote get-url` matches | no such remote, or no match | folder missing, not a work tree |
| `json_subset_equal` | `path`, `subset` (inline JSON) | every key in `subset` equals the file's value; arrays compare as order-insensitive sets of equal length | a difference (the detail names the path) | file missing or not JSON |
| `json_keyed_match` | `path`, `other`, `collection` (dotted path), `key`, `requireAll?` (default false) | every record present in BOTH files' collections (matched on `key`) is deep-equal; extra records on either side are fine | a shared record differs (detail: the key and the first differing field), or `requireAll` and a `path` key is missing from `other` | either file missing or not JSON, `collection` missing or not an array in either file, no shared keys |
| `generated_matches` | `generator`, `args?`, `source`, `overlay?`, `installed?`, `output` | the generator, run from the kit root into a temp file, produces the same bytes as `output` after CRLF->LF; `args` (0.3.0) is a list of strings passed to the generator as typed, before `-Source`, so a claim names the form of a file one generator renders in several (`KIT-SETTINGS-01`: `-Vendored -Set cloud-brain`) | bytes differ (first differing byte given), or `output` missing | generator missing, exits non-zero, times out (60 s), `node` absent, `args` not a list of strings (never dropped) |
| `tree_free_of` | `root`, `words[]`, `extensions[]`, `exclude[]`, `allow[]` of `{ path, words[] }` | no whole-word, case-insensitive hit in any scanned file | hits (file:line "word", first 12) | root missing, no words, no extensions |
| `tree_equals` | `path`, `other`, `exclude[]`, `extensions[]?` | every file under `path` exists under `other` with the same bytes or the same text after CRLF->LF, and nothing under `other` is missing from `path`; the same folder on both sides is a PASS | a file differs or exists on one side only (first 12 named) | either folder missing, or nothing left to compare after `exclude` and `extensions` |
| `tree_each` | `root`, `require[]` of `{file}` / `{glob}` / `{glob, pattern}`, `depth?` (2), `where?` `{anyOf[]}`, `exclude[]?`, `since?` (ISO date), `accepted[]?` of `{path, reason, since}`, `emptyOk?` (true: nothing selected is a PASS that says so; for a template claim on a root that may hold no matching repository yet) | every selected git repository under `root` meets every requirement; a repository whose first commit predates `since` is reported, never failed (the ratchet); accepted repositories are reported | a selected, non-grandfathered, non-accepted repository falls short (first 12 named with what is missing) | root missing, nothing selected, no `require`, an accepted entry without a reason, or `since` not a date |
| `snapshot_diff` | `root`, `snapshot` (the file `tools/doctor/snapshot.mjs` wrote), `expected[]` of `{path, change}` / `{glob, change}` with change `added` / `removed` / `modified`, `exclude[]?`, `maxDays?` | the differences between the snapshot and the tree now are exactly the expected ones: every expected entry matched a difference and every difference matched an entry; an empty `expected` means nothing may change | a difference nothing expected, or an expected change that did not happen (first 12 named with their kind) | root missing; snapshot missing, not JSON or not schema 1; `expected` absent or an entry malformed; `maxDays` not a positive integer; the snapshot older than `maxDays` |
| `tree_rules` | same selection fields as `tree_each` (`root`, `depth?`, `where?`, `exclude[]?`, `since?`, `accepted[]?`), plus `files?` (glob, '\|'-joined), `except[]?` (globs never read), `allowOnLine?` (regex), `rules[]` of `{id, forbid, files?}` or `{id, when, require, files?}` | no selected repository has a hit: a `forbid` line (unless that line or the one above matches `allowOnLine`), or a file matching `when` that lacks `require` | a repository has hits (rule, file:line, first three, then a count); the ratchet and accepted entries apply as for `tree_each` | no rules, a rule without id or shape, or the `tree_each` UNKNOWN cases |
| `tree_sha` (0.3.0) | `path` (a `VERSION` file as `tools/vendor.mjs` writes it: `version`, `sha256`, `files`, `at`) | the sha recomputed over the listed files beside the VERSION file, through the same `hooks/lib/kit-version.mjs` the vendor tool and the arming line use (sorted paths, CRLF read as LF), equals the recorded one, over one listed file or more (detail `version <v>, <n> files`) | the sha differs (`sha differs; <n> files listed (<path>)`) or a listed file is gone (`tree file missing: <rel>; <n> files listed (<path>)`): the tree is not what its VERSION says | the VERSION file is missing or not the shape (`VERSION missing or unparseable`), or it lists no file (`VERSION names no file; nothing to prove`: the sha of nothing always matches); nothing to compare against is not a pass |
| `ratchet` | `path` (a markdown file), `row` (first-cell text of the table row), `heading?` (default `Summary`), `accepted?` `{ value, since, reason }` | the integer in that row is at or under the value recorded on the last run in `state/ratchets.json`; with no record yet the baseline is recorded and an INFO line says so; a rise passes once when an unused `accepted` entry covers it | the count rose and no unused `accepted` entry covers it; the record does not move, so a re-run stays RED | file missing, heading or row not found, the cell is not an integer, `accepted` without `value`, `since` or `reason`, or `ratchets.json` unreadable |
| `hook_smoke` | `hook`, `event` (`SessionStart`, `PreToolUse`, `UserPromptSubmit`, `SubagentStart` or `Stop`) | hook runs as registered in the registration record (`hooks.json` in the plugin form; `<root>/.claude/settings.json` in the vendored form and under `-Scope brain`, 0.3.0) with synthetic stdin and a marker folder of the run's own (`DF_MARKER_DIR`: one `design-first-smoke-*` folder under the OS temp folder, shared by the run's smokes and removed when the run ends, so no `doctor-smoke` marker lands in `<os temp>/design-first`; a run stopped by a signal, Ctrl+C, SIGTERM or SIGKILL, ends with no exit event and leaves its folder there), exit 0; SessionStart also needs non-empty stdout; PreToolUse, SubagentStart and Stop need empty stdout or JSON; UserPromptSubmit may print anything or nothing; on every event, never the kit's internal-error reply | exits non-zero, times out (10 s), prints nothing (SessionStart), prints non-JSON (PreToolUse), script missing, interpreter not on PATH, or exits 0 with the kit's internal-error reply, on any event (read by `internalErrorReply` in `hooks/lib/common.mjs`, the one recognizer the hook self-tests' smoke cases read too: JSON whose `systemMessage` says `internal error`, as `GUARD: internal error, call allowed (...)` or `ENTRY: internal error (...)`; JSON whose `additionalContext` says `hook hit an internal error`, as `subagent.mjs` answers; plain text that says it, as `route.mjs` answers: the hook ran and inspected nothing; the detail names the hook, the event and the reply) | the record missing or unparseable (`hooks.json`; in the vendored form the settings file, or one with no `hooks` block), hook not registered for that event, no marker folder could be made under the OS temp folder |
| `pointer_valid` | - | pointer parses and `root`, `brain`, `pluginRoot` all exist | otherwise (the detail says which) | - |
| `config_schema` | `path`, `expected` | `schema` equals `expected` | mismatch or no `schema` field: detail starts `MIGRATE:` | file missing or not JSON |

Every claim may carry `host` (0.3.0): `pc`, `cloud` or `any`, one word or a list. With `-Host`
given, a claim typed for the other host is SKIPPED; a word that is none of the three is UNKNOWN on
every run. Type it only on a claim whose path says nothing about where it belongs (a `pointer_valid`
claim, a `config_paths_each` claim read through a config key): a path that carries `${ROOT}`,
`%USERPROFILE%` or `${LOCALAPPDATA}` is skipped under `-Host cloud` on its own. `${BRAIN}` and
`${KIT}` paths run on both hosts. The template claims ship `host: pc` on `BRAIN-POINTER-01` and
`TOMBSTONE-01`.

`snapshot_diff` details (CR-2026-10-14-REVIEW): the before/after check for a refactor. Write the
before-state, add the claim, make the change, run the Doctor, and remove the claim (or take a new
snapshot) once the change is accepted. The claim never re-baselines itself, and `maxDays` turns a
forgotten one into COULD-NOT-LOOK instead of a green that means nothing.

```
node <pluginRoot>/tools/doctor/snapshot.mjs -Root <folder> -Out <file.json> [-Exclude a,b/c]
```

The writer walks `Root` with the claim's own rule (`.git` and every `Exclude` path skipped) and
writes `{ schema: 1, root, taken, exclude, files: [{ path, size, sha256 }] }`, paths sorted, forward
slashes, lower case. It exits 1 when `Root` is not a folder or `Out` cannot be written, and prints
one line either way. Where to keep the snapshot is the repository's call; the kit never commits one.

`tree_free_of` details: `exclude` entries are paths relative to `root` (a file or a folder); the `.git`
folder is always skipped. `allow` is span-based: a permitted word's match span suppresses every
sub-word hit inside that span and nothing else, so allowing `Alpha-Beta` in `README.md` covers
`Alpha` and `Beta` inside `Alpha-Beta` there, while a bare `Alpha` in the same file still trips. A
word in `words` may be written in letter codes (`\x41\x6c\x70\x68\x61`), so a public config can refuse
a word it must not spell: the scan matches the decoded word, and a hit reports the codes as written.

`json_keyed_match` details: for two files that each keep their own copy of a case table (golden
vectors, fixtures, a rule list). Both files are parsed; `collection` is walked as a dotted path
(`vectors.cases`; a top-level key that itself contains a dot is tried first, whole) and must reach
an array in each. Each array is indexed by the string value of `key` in document order; records
without that key are skipped, and a repeated key keeps the last record. For every key present on
both sides the two records must be deep-equal: objects carry the same property names (order
ignored) with equal values, arrays have the same length with equal items in order, scalars compare
as case-sensitive strings (so `1` and `"1"` are equal, as in `json_subset_equal`), and a property
that is `null` on one side and absent on the other is a difference. The first differing key in
`path`'s order fails the claim and the detail reads `key '<key>' = '<value>' differs: $.<field> is
'<a>' vs '<b>'`. With `requireAll: true` every key in `path` must also exist in `other`; the detail
lists the missing keys. No shared key at all is UNKNOWN, not PASS: nothing was compared.

## The SURVEY band

Printed first, read from the machine: one row per registered hook (`[ ok ]` / `[GONE]`), root
settings rule counts, `soft_deny` counts, the fence log line. Then findings, `[FAIL]` / `[WARN]` /
`[INFO]`. Accepted findings are listed under `ACCEPTED`, never hidden.

**Linked worktrees.** A folder whose `.git` is a FILE reading `gitdir: <path>`, where that git dir
holds a `commondir` marker, is a linked worktree (`git worktree add`). It shares its parent's
objects, remotes and tracked tree, so it is not a repository of its own: the remote, unpushed,
shallow, `.gitattributes` and tracked-secret checks run on the parent only, and the worktree is
folded into it. The header reads `N repositories under root (A archived, not counted; W
worktree(s) folded into their parents)`. What stays the worktree's own is its uncommitted state: a
worktree under `frozenPaths` with changes still prints `frozen reference has MOVED`. A submodule's
`.git` file has no `commondir` and is surveyed as a repository, as before.

| Finding | Severity | Means | Do |
|---|---|---|---|
| `no remote: <repo> (N commits exist on this disk only)` | fail | Those commits exist on one disk. | Create a private remote and push. |
| `empty repo, no remote: <repo> (0 commits - nothing to back up yet)` | warn | Nothing to lose yet. | Commit, then add a remote. |
| `FOREIGN remote: <repo> -> <url>. Looks backed up; cannot be pushed.` | fail | The remote matches none of `ownerRemotePatterns`. | `git remote rename origin upstream`, add your own, push. Or add your pattern to the config. |
| `N commits unpushed: <repo>` | warn | Committed is not backed up; pushed is. | `git -C <repo> push`. |
| `SHALLOW clone: <repo> (N commits visible). It cannot be pushed to a new remote.` | fail | Truncated history. `git fsck` cannot see this; only the marker file can. | `git -C <repo> fetch --unshallow <remote>`. |
| `frozen reference has MOVED: <repo> (N uncommitted entries)` | fail | Something edited a path in `frozenPaths`. Also printed for a linked worktree under a frozen path. | Read the diff. Keep or revert is the owner's call. |
| `N linked worktree(s) of <parent>: <names>` | info | Those folders are worktrees of `<parent>`; their remote, history and tracked-file findings are reported once, on the parent. | Nothing. Remove a worktree with `git -C <parent> worktree remove <name>` when it is done. |
| `outside a category folder: <repo> - a project lives at <category>/<name>` | fail | `categories.folders` is set, and this repository's first folder under root is not one of them. It was born on or after `categories.since`, or has no commit yet. | Move it into a category now, while a move costs nothing. If it belongs where it is, add `{ path, kinds: ["outsideCategory"], since, reason }` to `acceptedExceptions`. |
| `outside a category folder: <repo> (born <date>, before <since>: reported, not failed)` | warn | The same, for one repository born before `categories.since`. | Move it when its work allows, or accept it with a reason. |
| `N repositories sit outside a category folder and predate the ratchet (...): <names>` | warn | Two or more of the line above, folded into one: the move backlog. | The same, one repository at a time. Never the root, the brain or the root's `.claude` folder; those are not projects. |
| `categories.since is not a date: '<value>'` | warn | The ratchet date could not be read, so every stray is treated as new. | Write it as `YYYY-MM-DD`. |
| `no .gitattributes: <repo> - core.autocrlf decides its bytes, not the repo` | warn | A machine setting decides the repo's bytes. | Add one when the tree is clean. |
| `no git at all: <path> (N files) - nothing is protecting them` | warn | Real content in no repository. Enumerated, not looked up. | `git init`, `.gitignore` before the first commit, remote. If deliberate, add a part to `unversionedIgnorePathParts` with a reason. |
| `tracked .env: <repo>/<file> - a secret file is in git.` | fail | A secret file is tracked. | Rotate first, then `git rm --cached`, then ignore it. Or register it in `secretExceptions` on purpose. |
| `tracked secret file, registered exception: <repo>/<file>` | info | Tracked, and you said so in `secretExceptions`. | Nothing, unless the reason is gone. |
| `no restore drill has been logged (<records>/restore-drill.log absent)` | info | Nothing has proved a backup gives anything back. | Run a restore drill when you have one; it logs here. |
| `restore-drill.log has no dated entry` | warn | The log exists but no line starts with a date. | Fix the log format. |
| `restore drill is N days old (last <date>) - quarterly is the ask` | warn | The drill stopped being run. | Run it. |
| `restore drill has N logged FAIL line(s) - a restore did not reproduce the local tree` | fail | The backup did not give back what the disk holds. | Read the log. Do not clear it to make this pass. |
| `entry-point snapshot is STALE: <file> changed and the snapshot was not updated in the same change.` | fail | A live file that governs every session drifted from its byte snapshot. Compared after CRLF->LF. | Copy live over snapshot, commit. The live file is authoritative. |
| `no snapshot for <file>` | fail | A pair in `entryPointSnapshots` has no snapshot file. | Copy the live file to the snapshot path. |
| `entry-point file is GONE: <path>` | fail | The live file is missing; the snapshot is the only copy. | Restore from the snapshot before anything else runs. |
| `entryPointSnapshots entry could not be expanded` | warn | A pair uses a variable that has no value here. | Fix the pair in the config. |
| `hook REGISTERED BUT MISSING: <script> (<event>) - <record> calls a file that is not there` | fail | Enforcement you believe in is not running. `<record>` is `hooks.json` in the plugin form or `.claude/settings.json` in the vendored form (0.3.0), with `${CLAUDE_PLUGIN_ROOT}` read as the kit and `${CLAUDE_PROJECT_DIR}` as the root. | Restore the file or remove the registration; for a vendored copy, vendor the kit again (`node <kit>/tools/vendor.mjs -Target <root>`). |
| `no hooks.json at <path> - no hook is registered; the plugin root in the pointer may be wrong` | fail | The pointer's `pluginRoot` has no `hooks/hooks.json`, and no settings file could stand in for it. | Start a session so `entry.mjs` refreshes the pointer, or re-install the plugin. |
| `no settings file at <settings> (the kit's hooks.json at <hooksJson> registers that checkout's hooks, not this brain's) - no hook is registered; the vendored kit's registrations were never rendered (...)` | fail | Under `-Scope brain` the settings file is the registration record (0.3.0), there or not; this brain has none, so no hook loads in a session on it, whatever the running copy registers for itself. | Render it: `node <kit>/tools/settings.mjs -Vendored -Out <brain>/.claude/settings.json`, or run adopt, which renders it. |
| `no hooks.json at <k> and no settings file at <s> - no hook is registered; ...` | fail | Neither record exists: a vendored copy with no rendered settings file, or a plugin root with no `hooks.json` and a root with no settings. | The same render; in the plugin form, re-install the plugin. |
| `no hooks block in <path> - no hook is registered; render the registrations into it (node <kit>/tools/settings.mjs -Vendored -Out <path>)` | fail | The record parses and registers nothing: a settings file written with `-Vendor false`, an attach that kept a 0.2.x file, a hand-written one. The same silence as a missing file, said out loud (SAFE-04). | Run the printed command; the merge keeps your own rows. |
| `no root settings: neither <root>/.claude/settings.json nor settings.local.json exists` | fail | The kit's deny/ask rules are not installed. | `/design-first:adopt`. |
| `root settings carry 0 deny rules` | warn | The `Read(**/.env)` hygiene rules are absent. | Re-apply the root settings template. |
| `fence hook has not fired in N days - it may be wired but dead` | warn | Older than `enforcement.fenceLogStaleDays`. | Make a deliberate net deletion and confirm a trip lands in the log. |
| `fence log: no trips yet (<path> does not exist)` | info | No trip has been logged. Not an error. | Nothing. |
| `dead config key: <key> - nothing reads it` | warn | A key in `doctor.config.json` has no reader (derived from the pointer, removed in schema 1, or missing from `_readers`). | Delete it from the config. |
| `config not read (<reason>); kit mode runs on defaults` | info | `-Kit` found no `templates/doctor.config.json`. | Nothing. |
| `<finding>  [accepted <since>: <reason>]` | accepted | Its `(path, kind)` is in `acceptedExceptions`. Reported, not counted. | Nothing, unless the reason is gone. |

Finding kinds for `acceptedExceptions`: `noRemote`, `emptyRepo`, `foreignRemote`, `unpushed`,
`shallow`, `frozenDirty`, `noGitattributes`, `noGitAtAll`, `trackedSecret`, `hookMissing`,
`hooksJsonMissing`, `rootSettingsMissing`, `noDenyRules`, `fenceStale`, `deadConfigKey`,
`entryPointDrift`, `entryPointSnapshotMissing`, `entryPointLiveMissing`, `restoreDrillStale`,
`restoreDrillFailed`, `outsideCategory`. The `path` is the one printed in the finding (`${ROOT}`-relative or absolute).

## The COULD-NOT-LOOK band

| Line | Means | Do |
|---|---|---|
| `COULD-NOT-LOOK: pointer not found at <path>. Run /design-first:adopt ...` | No pointer. Nothing can be resolved. | `/design-first:adopt`, or `-Kit` to check the kit itself. |
| `COULD-NOT-LOOK: pointer could not be parsed` / `pointer has no '<key>'` | The pointer is damaged. | Re-run `/design-first:adopt` (attach mode rewrites only the pointer). |
| `COULD-NOT-LOOK: pointer '<key>' names a folder that does not exist: <path>` | Root, brain or plugin root moved. | Fix the pointer or move the folder back. |
| `COULD-NOT-LOOK: git is not on PATH` | The survey needs git. | Install git. |
| `COULD-NOT-LOOK: doctor.config.json: <reason>` | Config missing or not JSON. | Copy `templates/doctor.config.json` into the brain, or fix the JSON. |
| `repository sweep failed` / `unversioned-folder sweep failed` / `tracked-secret scan failed` / `restore-drill log check failed` / `entry-point snapshot check failed` / `enforcement check failed` / `claims run failed` | A whole check threw. The reason follows. | Fix the reason; re-run. |
| `hooks.json could not be parsed` / `settings could not be parsed: <file>` / `fence log could not be read` | A file the Doctor reads is not readable. | Fix the file. |
| `claim <ID> could not be evaluated: <detail>` | One `UNKNOWN` claim. | See the claim's `????` line. |
| `COULD-NOT-LOOK: -Host must be pc or cloud (got 'x')` | A host word nothing knows (0.3.0). | Pass `pc` or `cloud`, or nothing. |
| `COULD-NOT-LOOK: -Scope must be brain (...)` / `-Scope brain and -Kit name two different subjects; pass one of them` / `-Root is read only with -Scope brain` | A flag pair that names two subjects, or a scope nothing knows. | Pass one of `-Kit`, `-Scope brain` or neither (the pointer scope). |
| `COULD-NOT-LOOK: -Scope brain needs CLAUDE_PROJECT_DIR or -Root <folder>: nothing names the brain checkout` / `-Scope brain names a folder that does not exist: <p>` | The brain scope has nothing to build its context from. | Pass `-Root <folder>`, or run from a session whose host sets `CLAUDE_PROJECT_DIR`. In a cloud session only the hooks get `CLAUDE_PROJECT_DIR`: from the brain clone's root, run `node .claude/kit/tools/doctor/doctor.mjs -Scope brain -Host cloud -Root .`. |
| `????  <ID>  <why>; nothing shows that '<hook>' is registered (render the registrations into it: node <kit>/tools/settings.mjs -Vendored -Out <settings>)` | A `hook_smoke` claim with no registration record: under `-Scope brain` the brain has no `.claude/settings.json` (`<why>` names every file it looked for). | Render the settings file, or run adopt. |
| `????  <ID>  no hooks block in <path>, so nothing is registered; render the registrations into it (...)` | A `hook_smoke` claim on a settings file that carries no `hooks` key. | The printed command. |
| `????  <ID>  hook '<hook>' is not registered for <event> in <path> (not built yet, or the registration moved)` | The record exists and does not name that hook for that event; `<path>` is `hooks.json` or the settings file. | Add the row to `hooks/registry.json` and re-render, or fix the claim. |
| `WARNING: state could not be written to <dir>` | Not a band; printed when `state/` is not writable. The verdict stands. | Check permissions on the state folder. |
| `COULD-NOT-LOOK: the Doctor stopped: <message> at <file>:<line>. No verdict was reached.` | The Doctor itself failed outside every check: a kit file that does not load, or a defect in a step. Nothing was judged, so this is exit 2 and never RED; `Doctor.bat` prints `COULD NOT LOOK`. Under `-Json` it is one document with `verdict`, `exitCode`, `reason` and `mode`. A crash up to and in the verdict step leaves `state/` as the previous run wrote it; a crash in the report comes after `state/` is written, so `last-run.json` then holds a verdict this run did not print. | Read the file and line. Re-install the plugin if a kit file is damaged; otherwise report the defect with that line. |

## Config: `<brain>/doctor.config.json` (SPEC 5.3)

| key | reader | means |
|---|---|---|
| `schema` | doctor.mjs | Must be 1. Mismatch is the `MIGRATE` claim. |
| `surveyStrict` | report.mjs | `true`: survey `fail` findings turn the verdict RED. Default `false`, so the kit grades VCS-01, VCS-02 and VCS-22 HONOUR; with `true`, re-grade them to GATE in `law.overlay.json` on their survey anchors and add a `json_subset_equal` claim that holds `surveyStrict: true`. VCS-04 and DES-09 rest on `warn` findings: the kit grades them HONOUR, and a brain may grade them ADVISE in `law.overlay.json` with `enforcedBy.kind` `survey` on their survey anchors (Anchors and grades, below). |
| `maxDepth` | repos.mjs | How deep to look for `.git` under root. |
| `parallelGit` | repos.mjs | How many repositories the sweep reads at a time. Default 8. Set 1 to read them one after another; the result is the same, only slower. |
| `excludePathParts` | repos.mjs | Repos whose path contains a part are not swept. |
| `archivedPathParts` | repos.mjs | Repos whose path contains a part are listed, not judged. |
| `ownerRemotePatterns` | repos.mjs | A remote URL containing none is FOREIGN. |
| `frozenPaths` | repos.mjs, enforcement.mjs, hooks/guard.mjs | Do-not-edit trees. Absolute or `${ROOT}`-relative. |
| `tombstonedPaths` | repos.mjs, hooks/guard.mjs | Retired but load-bearing. Absolute or `${ROOT}`-relative. |
| `controlCards` | claims-fresh.mjs (`CTRL-CARD-01`) | The control cards, relative to `<brain>/control/` (`DESK-CONTROL.md`, `INTAKE.md`). Each must exist and name its master (CTRL-03). Empty: the claim passes and says so. |
| `unversionedMaxDepth` | repos.mjs | How deep the no-git-at-all sweep walks. |
| `unversionedIgnorePathParts` | repos.mjs | Folders deliberately outside git. Add a reason next to each. |
| `secretExceptions` | repos.mjs, hooks/guard.mjs | Tracked secret files you accept. Absolute or `${ROOT}`-relative. Apply to staging and write rules alike. |
| `acceptedExceptions` | doctor.mjs | `{ path, kinds[], since, reason }`: reported, not counted. |
| `entryPointSnapshots` | doctor.mjs | `{ live, snapshot }` pairs, compared after CRLF->LF. |
| `enforcement.fenceLogStaleDays` | enforcement.mjs | Days before `fence hook has not fired` is printed. |
| `categories.folders` | survey.mjs | Top-level folders under root that hold projects. A repository under any other first folder is `outside a category folder`. Empty: the check is off. |
| `lawClaim.extraFiles` | tools/vcs/law-claim.mjs | More repo-relative paths that count as law files for the commit check. |
| `lawClaim.trailer` | tools/vcs/law-claim.mjs | The waiver line's name. Default `No-Claim`. |
| `lawClaim.minReason` | tools/vcs/law-claim.mjs | Shortest reason accepted on the waiver line. Default 10 characters. |
| `categories.since` | survey.mjs | ISO date. A stray born before it (git's first-commit date) is reported; one born on or after it is a fail. Empty: every stray is a fail. |
| `readCeilingBytes` | hooks/guard.mjs | The read check (DES-03). A write that grows a source file past this many bytes, about one Read, tells the agent once per file per session, on its context only, to list the file's subjects; it never asks for a split for size. Default 49152; 0 turns it off. |
| `readCeilingExempt` | hooks/guard.mjs | Path globs the read check skips. Only `*` is a wildcard (`**` is the same) and it matches across folders; brackets and other characters match literally, so a folder named `[slug]` needs no escaping. `${ROOT}`, `${BRAIN}` and `%USERPROFILE%` expand. A file whose first lines carry `@generated`, or a line with both "generated" and "do not edit", is skipped without a glob. |
| `sourceExtensions` | hooks/guard.mjs, hooks/stop.mjs | Which extensions count as source. Documents, config and data do not. |
| `stopDocs` | hooks/stop.mjs | File names that count as documents on the Stop card. A file in a `docs/` folder inside the repository counts too, unless its extension is a source extension: `docs/build.mjs` is source. A `docs` folder above the repository does not count. |
| `stopFromGit` | hooks/stop.mjs | Default true: the Stop card reads the turn's changes from git in each repository under the root that a tool call this turn pointed at, so a file a command changed there is counted; a repository no call named, and a copy that keeps the old write time, are not seen. False, or no prompt time on record: the card counts Edit and Write calls only, as before 0.1.15; a turn that changed source only through commands gets no card, and an Edit or Write that a later hook or the owner refused still counts. |
| `stopBudgetSeconds` | hooks/stop.mjs | Default 15. The Stop card's time budget in seconds, under the host's 20-second Stop timeout. When it is spent, the hook reads git in no more repositories: it counts them from Edit and Write calls, logs a WARN line and names them on the card (or, with nothing to card, in a system message). A value outside (0, 18] keeps the default. |
| `stopCard` | hooks/stop.mjs | Default `{ "owner": true, "writer": true }`. `false` turns the Stop card off for sessions of that role: the role the router wrote in `<session>.role` on the first prompt (writer = a line-start `Role: writer`, or a line-start `Reports to:` when the prompt has no `Role:` line, else owner; no file reads as owner; when the mark is gone on a later prompt, a reclaimed VM, the router decides again by the same rule, 0.3.0). Off: the turn ends with no card and no block, one INFO line goes to the hooks log, and the guard-failure notice still reaches the owner. Any value but `false` keeps the card on (0.2.11, CR-2026-10-21-COMMAND STOP-1). |
| `forbidScheduling` | hooks/guard.mjs | Default false. True: guard rule 8 refuses a command that creates a scheduled task, a cron entry, a Run key, a service or a Startup-folder entry. |
| `blanketKill` | hooks/guard.mjs | Default true. Guard rule 14, no-blanket-kill (0.2.13): in a writer session (the role the router wrote in `<session>.role`; a subagent is judged by its parent session's role) a kill by image name is refused: `taskkill` with `/IM` or `-IM`, `Stop-Process`, `spps` or PowerShell's `kill` with `-Name` (any unambiguous prefix, `-ProcessName`, or a joined `:value`), `pkill`, `killall`. A call that names both `/PID` and `/IM` is refused. A kill by PID passes (`taskkill /PID <n>`, `Stop-Process -Id <n>`, `kill <n>`), so does the same text as quoted data, and so does every form in an owner session. `false` turns the rule off. Not matched (residual): `Get-Process -Name x | Stop-Process`, `taskkill /FI "IMAGENAME eq ..."`, `wmic process where name=... delete`, `Get-CimInstance Win32_Process ... | Invoke-CimMethod Terminate`, positional `Stop-Process python`, nested shells (`pwsh -c`, `cmd /c`, `bash -c`), `xargs`, `$(...)`, a script written to disk and then run. |
| `contentRules` | hooks/guard.mjs | Default empty. A list of `{ id, under[], except[], exceptParts[], extensions[], pattern, shell, why }`. Guard rule 9 refuses an edit under `under` that adds a match of `pattern`. A rule needs `id`, `pattern` and one `under` path that resolves. |
| `loopBranchPrefix` | hooks/guard.mjs | Default `harness/`. A repository whose current branch starts with it is on the loop branch, and so is a detached HEAD while a rebase of such a branch is stopped or a bisect that started on one runs (there rule 11 also refuses `rebase --quit`): guard rule 11 refuses `git push` (and `git send-pack`, the plumbing under it), `merge` and `pull` there, and a command that leaves it or moves another branch onto its work: a `checkout` or `switch` off it, a `worktree add` off it, a `rebase` that names a branch other than a local loop branch, a `bisect` that can check out a commit, a `fetch` into a local branch, a `branch -m`/`-M`/`-c`/`-C`/`-f`, `update-ref` and a `symbolic-ref` write (AUTO-11); rule 12 refuses edits to the story ledger (AUTO-04). From any branch, rule 11 refuses a push, merge or pull that names a branch with the prefix, a `push --all`, `--mirror` or glob refspec that covers one, a branch move or ref write that names one, and a `fetch` that writes one or writes a local branch from one or from a glob that can cover one. Any other git command or form that moves HEAD or a branch is a residual (`hooks/lib/guard-loop-rules.mjs`). |
| `loopLedgerGlobs` | hooks/guard.mjs | Default `docs/specs/*.tasks.json`, `specs/*.tasks.json`. Repository-relative globs of the story ledger rule 12 protects on the loop branch. |
| `commitMessage` | tools/vcs/law-claim.mjs | `{ maxSubject, pastTenseWords[], placeholders[] }`. Defaults 72, a built-in past-tense list, a built-in placeholder list. The commit-msg shim refuses a subject over the limit, a past-tense first word or a bare placeholder (VOICE-05); merges and reverts are exempt. |
| `boundedFiles` | hooks/card.mjs | Default empty (0.3.0). Rows of `{ glob, maxBytes, headLines, idPatterns[], appendOnly }` with the defaults 30000, 15, none and false: for a file matching `glob` (`${ROOT}`, `${BRAIN}` and `%USERPROFILE%` expand; only `*` is a wildcard and it crosses folders; a `{ repo, path }` row of the extract resolves under `CLAUDE_PROJECT_DIR` in the clone it names), the card hook refuses an Edit or Write that adds a match of an `idPatterns` regex the file does not carry now, that leaves the file over `maxBytes` (UTF-8 bytes of LF text) and larger than before, that grows the head (the lines above the first `<!-- kit:generated -->` line) past `headLines` and longer than before, or that shrinks an append-only file; a shrink of an oversize file passes; `maxBytes` or `headLines` at 0 turns that rule off; a value that is not an integer keeps the default and is logged; a pattern JavaScript cannot read is dropped with an ERROR line. The refusal reads `CARD: <path> is a bounded file and this <tool> is refused.` with one line per rule that fired, and the fence log gets `BLOCKED[CARD: <titles>]`. |
| `leakWords` | tools/extract.mjs | Default empty (0.3.0). Words a `public`, `shared` or `private` extract may not carry: the serialized output is scanned for each without case, and a hit refuses the write naming the word by its position (`leakWords[<i>]`), never spelling it. Read by the extract alone, never by a hook or the Doctor. |
| `ask` (in `doctor.config.json`) | hooks/ask.mjs | `{ minReason, equalPhrases[], recommendedMarker, maxQuestions }` (OWN-04). `maxQuestions` default 1: a call with more questions is refused; an owner who batches independent questions raises it (0.2.12), every question in the batch is checked, and a problem names its question. Defaults 40 characters, a built-in list of equal-options phrases ("both are acceptable", "either is fine", "no wrong answer" and others), and `(?i)\brecommended/b` on the first option's label. A question is refused when an option's description is shorter than `minReason`, when its text holds a phrase from the list (a phrase that is negated, quoted, or in a sentence that also holds a contrast word such as 'but' does not count; see `instructions/working-with-the-owner.md`), or when its first option's label does not match the marker. `minReason` 0 or an empty marker turns that check off. |

Keys that are no longer keys and are reported as dead if present: `root`, `stateDir`, `recordsDir`,
`gitTimeoutSeconds`, `staleStateDays`, `_retiredUnversionedWatchlist`, `enforcement.settingsPath`,
`enforcement.fenceLogPath`, and `splitLines` (since 0.1.35: DES-03 has no line count; delete it and, if
you want a different read check, set `readCeilingBytes`). Keys starting with `_` are comments and are ignored.

The hooks read this file through the pointer on a PC. Where no pointer names a brain (a cloud
session, a clone on another machine), they read the same keys from `<repo>/.claude/kit/extract.json`,
the file `tools/extract.mjs` writes (below), under its `values`; `DF_EXTRACT_PATH` names another
file for a test. A path row there is host-neutral, `{ "repo": "<folder name>", "path": "<rel>" }`,
and resolves to `${CLAUDE_PROJECT_DIR}/<rel>` only in a clone whose folder name is that repository
(compared without case; a `repo` of `*` resolves in every clone); a string row with `${ROOT}` or
`${BRAIN}` resolves nowhere there, because nothing stands for the token. The guard's frozen-path
refusal names the file the values came from. An extract that exists and is not JSON, or whose
`values` is not a JSON object (missing, a number, a list), is read as an unreadable config, and so is
a brain `doctor.config.json` that is JSON and not an object: the guard skips its path rules (its
inline rules still run and can refuse the call), logs an ERROR line and advises
`brain config unreadable, path rules skipped` with the reason (`extract unreadable: <path> ...`, or
`doctor.config.json unreadable: ...`); the card hook allows the call with its internal-error notice
(`CARD: internal error, call allowed (...)`) and an ERROR line; the ask and stop hooks keep their
defaults and log a WARN line.

## Route policy: `<brain>/route-policy.json` (DES-13)

Read by `hooks/route.mjs` on every prompt and `hooks/subagent.mjs` at every subagent start; the
template's `_comment` describes each key. `adopt` copies `templates/route-policy.json` into the
brain once; a kit upgrade never edits the brain's copy, so a key added to the template after adopt
reaches a brain only when it is added there by hand.

| Key | Since | Effect |
|---|---|---|
| `alwaysForSessions` | 0.1.34 | Groups added to every session's first prompt, and again after a compaction or a clear, whatever the words and the folder (OWN-10). The template lists `OWN`. Absent: no group arrives without a matching word or folder, as before 0.1.34. These groups are not sent to subagents unless `alwaysForSubagents` lists them too. |
| `writerSkip` | kit-next | `{ "groups": [], "clauses": [] }`. Law a writer session does not receive (owner ruling 29, 2026-10-20: work sessions answer their master tersely). A writer session is one the router marked writer in `<session>.role` on its first prompt (a line-start `Role: writer`, or a line-start `Reports to:` when the prompt has no `Role:` line, 0.3.0; a later prompt decides again only when the mark is gone), and a clear deletes the mark and a compaction keeps it. `groups` are law group ids dropped whole; `clauses` are clause ids dropped one row at a time (for example `OWN-09`), so the rest of the group still arrives. `hooks/subagent.mjs` applies it to every subagent, which is always a writer, in the group rows and in the advise-by-role block. Empty or absent: nothing is dropped. Ids match without case. |

To take a new key on an existing brain, copy its line from the template into the brain's
`route-policy.json`.

## Generated output: `<brain>/state/`

Generated, never hand-edited. Byte-identical on a re-run with nothing changed, except `last-run.json`.

| File | Holds |
|---|---|
| `repos.json` | every swept repo: remote, ownership, ahead, dirty, shallow, frozen, last commit; linked worktrees carry `worktree: true` and `parent` |
| `repos.generated.md` | the same as a table, sorted, no timestamp; worktrees are not rows (folded into their parents) |
| `last-run.json` | when it ran, the mode, the `scope` (`pointer`, `brain` or `kit`) and `host` (`pc`, `cloud` or empty) it ran with, the verdict, `repoCount`, `worktreeCount` and the band counts, `claimsPass`, `claimsFail`, `claimsUnknown` and `claimsSkipped` among them (a skipped claim is never in `claimsPass`); the only file with a timestamp. `-Json` prints the same `scope`, `host` and four claim counts after `reason`. |
| `ratchets.json` | one record per `ratchet` claim id: `value`, `recordedAt`, `acceptedUsed`. Rewritten only when a record moves. Deleting it, a fresh clone, or `/design-first:remove` resets every ratchet: the next run passes at any value and records it as the new baseline. When the brain is a repository, the `.gitignore` adopt writes ignores everything under `state/` but `law-installed.json` (adopt keeps a `.gitignore` that exists), so the record is local to this machine (`PRIN-04`, written limit in `instructions/principles.md`). |
| `law-installed.json` | written by `adopt`, read by the law build and `BRAIN-LAW-01`: `hooks` (every hook `hooks.json` registers, `true` when its script exists), `rootSettings`, `pointer`. The Doctor never writes it. |

All state files are UTF-8 without BOM, LF.

## Prove it still works

```
node <pluginRoot>/tools/doctor/selftest.mjs
```

Builds a throwaway pointer, brain, root and kit-like tree in the system temp folder with a fake
home folder (`HOME` and `USERPROFILE`), plants one true and one false case for every claim type (the span case and the
keyed compare's `requireAll` and missing-collection cases included), a CRLF-vs-LF generated file
that must pass, a stale snapshot, an absent fence log that must be REPORTED and not RED, a schema
mismatch that must say `MIGRATE`, a repo with two linked worktrees whose tracked secret must be
reported exactly once (one of them frozen and dirty, which must still trip), and proves exit codes
0, 1 and 2, the `-Kit` and `-Json` paths and the shim (`Doctor.bat` on Windows, `doctor.sh` elsewhere). The config cases
(`selftest-config.mjs`, run by the same command) prove that every key in the reader table has a
default, that a file which sets every key loads, and that a key with no default loads and does not
throw. The honesty cases (`selftest-truth.mjs`) crash a scratch copy of the Doctor twice, once
while it loads its files and once in the verdict step under `-Json`, and require exit 2 with the
reason, the file and the line; and they require a `hook_smoke` claim in the kit's own claims for
every hook `hooks.json` registers. The law cases (`selftest-law.mjs`) run the kit's law build and
docs build from scratch copies on planted inputs: the LAW.md legend for ADVISE, a clause on a hook
script that `hooks.json` does not register or on a `lib/` file named like one it does (the build
must fail), a script registered in a subfolder of `hooks/`, a kit with no `hooks.json`, and a
DENY clause that the docs page must count as stopped and show on a coloured chip. The host cases
(`selftest-host.mjs`, 0.3.0) run the Doctor with `-Host pc` and `-Host cloud` against claims that
carry `${ROOT}`, `%USERPROFILE%`, `${LOCALAPPDATA}` and typed hosts, require the SKIPPED band, its
`-Json` count and a verdict that ignores it, run `-Scope brain` on a planted brain with no pointer,
with `-Root`, with the long form, with every flag pair that must be could-not-look, and on a brain
that carries the vendored kit and a rendered settings file, where BRAIN-LAW-01 must pass from the
vendored generator and the hook smoke must read the settings file, and where a vendored guard,
entry, route and subagent that throw after they read stdin must make the smoke FAIL (the three
forms of the internal-error reply). There, a run's smokes must leave no marker in
`<os temp>/design-first` and no smoke folder, also when the run throws after them, and a smoke
with no marker folder to make must be could-not-look. The planted trees of the two
new claim types (a VERSION over three files, one byte flipped, one file gone, no VERSION, a VERSION
that is not the shape, a VERSION that lists no file; a file of sixty lines and one of sixty-one)
are among the true, false and unknown cases. Each suite ends with `red-expected: N`, the number of its cases whose expected
value is a refusal, which `tools/release.mjs` reads. It never touches your real
folders. A few seconds. Run it after any change to the Doctor: a check that cannot fail is worse
than no check.

## The site's data file: `docs/publish.mjs` (0.2.7)

```
node docs/publish.mjs [-Site <path to the site checkout>]
node docs/publish-selftest.mjs        # the same publish into a temp site, every key checked
```

It runs `docs/build.mjs -Check` first and stops on a stale page. It refuses a folder with no
`data/registry.json`. It writes one file, `<site>/method/data/kit.json`, and nothing else: it
copies no page, adds no registry entry, deletes nothing and commits nothing. With no `-Site` it
uses the owner's checkout on Windows; elsewhere `-Site` is required. It prints one line:

```
wrote method/data/kit.json  (design-first <version>, <n> clauses: <grade> <n>, ...; <n> adopt questions; transcripts recorded <date> at <version>)
```

| key | from |
|---|---|
| `kit`, `version` | `.claude-plugin/plugin.json` |
| `built` | the date of the run (ISO) |
| `adopt_questions` `[{n, label, question, recommended}]` | `commands/adopt.md` |
| `transcripts` `{adopt, doctor, doctor_kit, guard}` | `docs/src/transcript-*.txt`, each a line array without its header line |
| `transcript_meta` `{recorded, kit_version, machine}` | the transcripts' header line, as recorded and never restamped; the four headers must agree on the date and version or the publish fails |
| `clauses` `[{id, group, grade, rule}]` | the kit's own `law.json`, never a brain overlay |
| `grade_counts` | a count of `clauses` by grade |
| `install` | the commands in the README's "Install and adopt" code block |

`docs/data.mjs` reads every one of these, and `docs/build.mjs` renders the page from the same
functions, so the page and the file cannot disagree about a source. `tools/tests/run.mjs` runs the
self-test as `cases-publish.mjs`.

## The commit check: `tools/vcs/law-claim.mjs` (VCS-23)

A git `commit-msg` hook for a brain that is a repository. A commit that changes a law file must
carry a claim, or a written reason why it needs none.

**Install** (once per clone; `.git/hooks` is not versioned):

```
cp <pluginRoot>/templates/commit-msg <brain>/.git/hooks/commit-msg
chmod +x <brain>/.git/hooks/commit-msg      # Linux and macOS; Git for Windows runs it through sh
```

The shim finds the kit through the pointer on every commit, so it survives a plugin update. Then
add two claims so the Doctor proves it is there: `path_exists` on `${BRAIN}/.git/hooks/commit-msg`,
and `file_contains` on the same file with the needle `tools/vcs/law-claim.mjs`.

**Grades.** `adopt` does not install the shim, so the kit grades VCS-23 and VOICE-05 BUILDABLE
(DECISIONS.md 2.7). With the shim installed and the two claims added, re-grade both to GATE in
`law.overlay.json`: VCS-23 on `tools/vcs/law-claim.mjs#law-claim`, VOICE-05 on
`tools/vcs/law-claim.mjs#commit-message`. Then rebuild `LAW.md`.

**A law file** is every owning file the brain's `LAW.md` names as `brain:<path>`, plus
`law.overlay.json`, plus `lawClaim.extraFiles`. The list is read from `LAW.md` at commit time.

| You see | Means | Do |
|---|---|---|
| `design-first VCS-23: this commit changes a law file and carries no claim.` | A law file is in the commit, `claims.json` is not, and the message has no waiver. The commit was refused. | Stage the claim in `claims.json`. Or, when the change states no fact about the disk, add a line `No-Claim: <reason>` to the commit message. |
| `The reason given ('...') is shorter than N characters` | The waiver line is there with no real reason. | Say why no claim is needed. |
| `design-first law-claim: no pointer at <path>; VCS-23 was NOT checked` | The shim could not find the kit. The commit went through unchecked. | Run `/design-first:adopt`; it writes the pointer. A session start does not create one: `entry.mjs` only refreshes `pluginRoot` in a pointer that already exists. |
| `design-first law-claim: node is not on PATH; VCS-23 was NOT checked` | Node.js was not found by the shell git runs hooks in. The commit went through unchecked. | Install Node.js 18 or newer (on Windows `winget install OpenJS.NodeJS.LTS`), then open a new shell. |
| `design-first law-claim: internal error, VCS-23 was NOT checked` | The script failed. The commit went through, and an ERROR line is in the hooks log. | Read the log line; report it. |
| nothing, and a law commit went through | The shim is not installed in this clone, or the commit used `--no-verify`. | Install it. The two Doctor claims catch a missing shim. |

Limits: the check sees that `claims.json` changed, not that the claim covers the new fact; a
waiver's reason is read by a person; a merge is not checked; `--no-verify` skips every commit hook.

## The vendored kit: `tools/vendor.mjs` and `tools/vendor.json` (0.3.0)

```
node tools/vendor.mjs -Target <repo root> [-Kit <kit root>] [-Manifest <path>] [-Record <installed.json>] [-DryRun]
node tools/vendor.mjs -Target <repo root> -Check
```

A plugin's hooks run only where the plugin is installed, and a cloud session installs none. So a
repository carries the kit: `vendor.mjs` copies every file the manifest `tools/vendor.json` names
(`include`: files and folders that must exist; `optional`: taken when present, the selfcheck probe,
the extract and the gate tool among them; `exclude`: exact paths, folder prefixes ending in `/`, or
`*.<ext>` suffixes; `hooks/hooks.json` and the self-test files never travel) into
`<target>/.claude/kit/<rel>`, byte for byte, a file whose bytes already match left alone. Then it
writes `<target>/.claude/kit/VERSION`: `{ version, sha256, files, at }`, the kit's `plugin.json`
version (or the source copy's own VERSION), the sha256 over the copied files computed on the
target copy (`hooks/lib/kit-version.mjs`: sorted forward-slash paths, each file's text with CRLF
read as LF), the sorted file list and the time. VERSION is rewritten only when `version`, `sha256`
or `files` differ from what is there, so a second run writes nothing and `at` names the last
change. `-Kit` is the checkout to copy from (default: the one this script sits in; a vendored copy
cannot vendor, it carries no manifest); `-Record <installed.json>` merges one row
`{ path: ".claude/kit/<rel>", sha256 }` per copied file into that file's `vendored` list, the sha
over CRLF->LF bytes as adopt records files, every other key kept, so `remove` can take the copy
away; `-DryRun` prints every line and writes nothing. Nothing is deleted: a file in the copy that
the manifest no longer names stays until `remove` takes it by its record. `adopt` runs this into
the root and, when the brain is a separate folder, into the brain, only when
`<target>/.claude/kit/VERSION` is absent; a copy whose VERSION was deleted is vendored again, and
the tool restores an edited vendored file to the kit's bytes.

`-Check` reads VERSION, names a listed file that is gone, recomputes the sha and compares. The
in-repo twin is the Doctor claim type `tree_sha` (`KIT-VENDOR-01` on the root's copy and
`KIT-VENDOR-02` on the brain's, shipped in the brain's claims; `KIT-VENDOR-01` is also carried by the
kit for its own copy), which reads the same VERSION on every run.

| You see | Means | Do |
|---|---|---|
| `vendor: <kit> (<version>) -> <target>/.claude/kit` then `  wrote       .claude/kit/<rel>` lines and `vendored <n> files, sha <sha12>` | The copy was written and VERSION names it. | Commit `.claude/kit/` by path (adopt prints the command). |
| `vendored: unchanged` | Every file and VERSION already match. | Nothing. |
| `vendor: dry run, <n> file(s) and VERSION would be written; nothing written` | `-DryRun`. | Run it without the flag. |
| `  recorded  <n> vendored row(s) in <installed.json>` (or `already in`) | `-Record` merged the rows. | Nothing. |
| `vendor: ok <version> <sha12>` (exit 0) | `-Check`: the tree is what its VERSION says. | Nothing. |
| `vendor: tree differs from VERSION <version> <sha12>: newer than VERSION: <files>` (exit 1) | A listed file was written after VERSION (named by its time; at most half of the listed files are newer). | Vendor the kit again, or put the edit in the kit and vendor from there; never edit a vendored file in place. |
| `vendor: tree differs from VERSION <version> <sha12> (no file named: <n> of <m> listed files are newer than VERSION, as after a checkout or a copy; git diff, or vendor -DryRun from the kit, can find the change)` (exit 1) | The sha differs and more than half of the listed files were written after VERSION, as when a git checkout or a copy wrote them, so their times single out nothing. | `git diff -- .claude/kit` in a clone, or `node <kit>/tools/vendor.mjs -Target <repo> -DryRun`, shows what differs; vendor again to restore the copy. |
| `vendor: tree differs from VERSION <version> <sha12> (no file named: no listed file is newer than VERSION)` (exit 1) | The sha differs and no file's time gives it away (an edited file given an older time, or a copy restored from elsewhere). | Vendor again. |
| `vendor: tree differs from VERSION <version> <sha12>: missing <files>` (exit 1) | A listed file is gone. | Vendor again. |
| `vendor: VERSION missing: <path>` or `vendor: VERSION missing (unparseable, or without version, sha256 and files): <path>` or `vendor: VERSION names no file; nothing to prove: <path>` (exit 2) | Nothing to check against: not a pass. | Vendor the kit into the target. |
| `vendor: refused: manifest entry not found: <rel> (manifest <path>, kit <kit>)` / `manifest has no include list: <path>` / `manifest names no file: <path>` (exit 1, nothing written) | An `include` entry does not exist in the kit, or the manifest has no `include` list or selects no file. A manifest never vendors less than it says: a short copy fails open (`hooks/agent.mjs` allows every call when it finds no policy; a copy without `law.json` is not a kit root at all). | Fix the kit or the manifest. |
| `vendor: refused: record file unreadable: <path>: <why>; nothing written` / `record file is not a JSON object: <path>; nothing written` / `record file is not a file: <path>; nothing written` (exit 1) | The `-Record` file is there and is not a JSON object. It is read before the first write, so nothing was copied: a copy is never left on disk that no record names. | Fix or move the record file (adopt's is `<brain>/state/installed.json`), then run again. |
| `vendor: the copy and VERSION were written; the record was not: <path>: <why>` (or `the copy was written and VERSION already named it; ...`, or `the copy and VERSION were already in place; ...`) (exit 2) | The record could not be written after the copy (its folder could not be made, the disk refused): the copy is on disk and its VERSION names it, and no record does, so `remove` cannot take it away. | Fix the cause and run the same command again: the copy is unchanged and the rows are written. |
| `vendor: manifest missing: <path> (-Kit must name a checkout of the kit, or pass -Manifest)` / `manifest unreadable: <path>: <why>` / `target is not a folder` / `-Target is required` / `unexpected argument <x>` / `plugin.json unreadable: <path>: <why>` / `plugin.json names no version: <path>` / `kit version unknown: no .claude-plugin/plugin.json and no VERSION under <kit>` (exit 2) | A usage fault, a manifest that is there and is not JSON, or a kit whose version cannot be read: the tool could not read what to copy, and nothing was written. | Name a checkout and a folder that exists; fix the manifest or the kit's `plugin.json`. |
| `vendor: ERROR <message> (could not look; nothing proven)` (exit 2) | An internal error. | Report it with the line. |

Limits: `-Check` and `tree_sha` see the listed files only, so a file planted under `.claude/kit/`
that the manifest does not name is neither in the sha nor reported; a listed file edited and then
given an older time is exit 1 but unnamed, and so is an edit in a clone or a copy whose listed
files git or the copier wrote after VERSION (more than half newer); neither says whether the host
loads the copied hooks (the arming proof does) or which of two copies decided a call (the yield
rule, below). Neither compares the copy with the kit it came from: `tree_sha` holds the copy to
its own VERSION, not to the checkout, so a manifest file changed after the last vendor leaves
`KIT-VENDOR-01` GREEN with the copy behind; `node tools/vendor.mjs -Target . -Kit . -DryRun` names
what a fresh vendor would rewrite. Of the four permission sets only `pc` travels
(`templates/root-settings.json`): a vendored `settings.mjs` checks a settings file and renders
`-Set pc`, and refuses a cloud set with `settings: set template missing: <path>` (exit 2), so a
cloud set is rendered from a checkout.

## The settings renderer: `tools/settings.mjs` (0.3.0)

```
node tools/settings.mjs [-Plugin | -Vendored] [-Host pc|cloud] [-Set pc|cloud-brain|cloud-writer|cloud-checker]
                        [-Source <registry>] [-Out <path>] [-Check] [-BrainRoot <x>]
```

`hooks/registry.json` is the one place a hook registration is typed: one row per registration with
`id`, `event`, `matcher` (absent for a hook that fires on every call of its event), `script`,
`timeout`, `host` (a list of `any`, `pc`, `cloud`), `mode` (deny, advise or gate, informational) and
`vendor`. This tool is the only writer of a file that carries one, and it renders the registry two
ways: `-Plugin` (the default when neither form is given) as `node "${CLAUDE_PLUGIN_ROOT}/<script>"`,
the form `hooks/hooks.json` has always had, byte for byte; `-Vendored` as
`node "${CLAUDE_PROJECT_DIR}/.claude/kit/<script>"`, the form a repository's `.claude/settings.json`
carries. Row order is render order, grouped under `hooks.<event>`. `-Host pc` keeps the rows whose
`host` names `pc` or `any`, `-Host cloud` likewise; without it every row renders. `-Set` adds the
permissions block of one set. When `-Out` names an existing JSON file the render is deep-merged
into it: the rendered `hooks` object replaces the file's `hooks` key (the kit owns registrations),
`permissions.allow`, `.deny` and `.ask` become the union of the file's rows and the set's rows, file
rows first and no duplicate, and every other key of the file is kept as it is; a new file is
`permissions` then `hooks`. `adopt` runs this merge into a settings file that has no `hooks` key, or
whose `hooks` key already is the rendered block; a file with a `hooks` key of its own it keeps as it
is, printing its diff and this command, because the merge would drop that file's hooks. Output is 2-space JSON with
a trailing LF, written to `-Out` or printed to stdout without it. `-Check` writes nothing: it
compares the result with `-Out`'s file byte for
byte after CRLF->LF, prints the first differing lines as a short diff, and exits 1 on a difference,
2 when the target is missing. `-BrainRoot` is accepted and ignored: the Doctor's `generated_matches`
runner passes it to every generator, and `tools/lib/args.mjs` throws on an option it does not know,
which is why `KIT-REG-01` can run this tool as `settings.mjs -Source <registry> -BrainRoot <brain>
-Out <tmp>` with no form flag. `DF_KIT_ROOT` names another kit root for a test.

The four sets, each a file under `templates/`:

| set | template | allow | deny | ask |
|---|---|---|---|---|
| `pc` | `root-settings.json`, the file as it is (the GATE-03 and DES-10 ask rules are anchored on it) | none | its deny rows | its ask rows: the install verbs ask a human |
| `cloud-brain` | `settings.cloud-brain.json`: a session on the brain repository | `git add`, `git commit`, `git push origin claude/*` and `-u`, `git fetch`, `git rebase origin/main`, `gh pr create`, `gh pr merge --auto`, `node .claude/kit/*`, `node scripts/*` | the pc deny rows, then every pc ask row as a deny row, in the same order | none, ever |
| `cloud-writer` | `settings.cloud-writer.json`: a session that writes a branch on a work repository | the same without the rebase and the repository script | the same | none |
| `cloud-checker` | `settings.cloud-checker.json`: a session that checks a branch and reports | `git fetch`, `node .claude/kit/*`, `gh api` (no commit, no push, no merge verb) | the same | none |

A cloud set carries no `ask` key because an ask with no human is a hang; a denied install ends in
an honest BLOCKED line instead. The tool refuses a cloud set whose template carries one. `-Set pc`
renders the ask key whatever the host (adopt renders the root file with `-Host pc`). A change to
the pc template's ask list must reach the three cloud templates too; a case pins it.

| You see | Means | Do |
|---|---|---|
| `settings: wrote <path> (<n> registrations, <form> form[, host <h>][, set <s>])` | Rendered, or merged into the file. | Commit it. |
| `settings: ok <path> (<bytes> bytes, <n> registrations, ...)` (exit 0) | `-Check`: the file equals the render. | Nothing. |
| a diff (`--- <path> (on disk)`, `+++ render of <registry> (<form> form)`, `@@ line N @@`, `-` and `+` lines) then `settings: <path> differs from the registry render at line N; regenerate it, never hand-edit` (exit 1) | The file drifted from the registry, or the registry from the file. | `node tools/settings.mjs -Plugin -Out hooks/hooks.json` for the kit's own file; the vendored form with the same set for a repository's; commit both the registry and the render. |
| `settings: target missing: <path>` (exit 2) | `-Check` with no file to compare. | Render it. |
| `settings: registry missing: <path>` / `registry could not be read: <path> (<why>)` / `registry could not be parsed: <path> (<why>)` / `set template missing: <path>` / `set template could not be read: <path> (<why>)` / `set template could not be parsed: <path> (<why>)` / `DF_KIT_ROOT is not a folder: <path>` (exit 2) | An input the render needs is not there or is not JSON: the tool could not look, nothing is rendered and nothing is written. It is not a refusal of what the registry says. | Name a registry that exists (`-Source`), restore the template under the kit's `templates/`, or unset `DF_KIT_ROOT`. |
| `settings: a vendored render must not name CLAUDE_PLUGIN_ROOT (unset in a cloud container): <line>` (exit 1) | The render, or a kept row of the target file, names the plugin variable, so in a container the command would read `node "/hooks/guard.mjs"` and no hook would load. | Take the row out of the target file, or render the plugin form on purpose. |
| `settings: ask row in a cloud set (<set>): templates/<file> carries permissions.ask, and an ask with no human is a hang` (exit 1) | A cloud template grew an ask key. | Move the rows to `deny`. |
| `settings: row <id> is missing <field>` / `has an unknown event <x> (one of ...)` / `timeout must be a number of seconds above 0` / `host must be an array of any, pc, cloud` / `mode must be deny, advise, gate` / `vendor must be true or false` / `script must be a path under the kit root` / `script missing under <kit>: <script>` / `duplicate row id <id>` (exit 1) | A registry row is wrong; nothing is rendered. | Fix the row. |
| `settings: -Plugin and -Vendored exclude each other` / `-Host must be pc or cloud` / `-Check needs -Out <path>` / `unknown set <x>` / `unexpected argument <x>` / `target is not a JSON object` / `target could not be parsed: <path> (<why>)` (exit 1) | A usage fault, or a target file that is not JSON: it is never merged into or overwritten, and to `-Check` it is not the render. | Fix the call or the file. |
| `settings: ERROR ...` (exit 2) | An internal error. | Report it with the line. |

What it cannot see: a registration typed into a file it never renders (a user-level settings file,
a `settings.local.json` nobody names as `-Out`); whether the host honours the hook; whether a
script travels (the `vendor` flag is a statement, read against the manifest by a case, not here).
`KIT-REG-01` holds the kit's own `hooks/hooks.json` to the render and `KIT-SETTINGS-01` its own `.claude/settings.json` (`-Vendored -Set cloud-brain`); `SETTINGS-BLOCK-01`, which adopt ships,
holds a repository's file to the render adopt made.

## The arming probe: `tools/selfcheck.mjs` and guard rule 15 (0.3.0)

A hook that did not load is silent, and silence looks like a pass. Two lines say otherwise, and
only one of them is a proof.

The arming line: `hooks/entry.mjs` prints `kit: armed <version> <sha12>` as its first plain line
on every start, resume, clear and compaction, from the VERSION of a vendored copy or from the
manifest's files of a checkout or a plugin install (`hooks/lib/kit-version.mjs`, the same sha
`vendor.mjs` writes). With no kit root it prints `kit: unarmed MISSING: kit (no .claude/kit, no
plugin, no pointer)` and writes one ERROR line to the hooks log naming every place the search looked
(`DF_KIT_ROOT`, the running copy, the project's `.claude/kit`, the pointer); a kit root with neither a VERSION nor `.claude-plugin/plugin.json` prints
`kit: unarmed ERROR: no VERSION and no .claude-plugin/plugin.json at <root>` (`no VERSION and no
tools/vendor.json beside .claude-plugin/plugin.json` when only the manifest is missing), and one
whose version cannot be read (a VERSION that is not the `{version, sha256, files}` shape, a
missing module) prints `kit: unarmed ERROR: kit version unreadable at <root> (<why>)`, each with an
ERROR line in the hooks log; `kit: armed unknown <sha12>` means `plugin.json` names no version. A
vendored copy's sha is recomputed over the files its VERSION lists: when they are not those bytes
(a file edited since, a listed file gone) the line reads `kit: armed <version> <sha12> DIFFERS: the
tree is not the bytes VERSION names (check: node .claude/kit/tools/vendor.mjs -Target <repo> -Check)`
and a WARN line goes to the hooks log; run the check, then vendor the kit again. A VERSION that lists
no file proves nothing (the sha of nothing matches any tree), so it reads `... DIFFERS: VERSION names
no file; nothing to prove (check: ...)` whatever the files hold. The `(check: ...)` form appears when
the kit root is `<repo>/.claude/kit`; for any other root (the `DF_KIT_ROOT` seam, a pointer's
`pluginRoot` that carries a VERSION) `vendor.mjs -Check` would read another file, so the line names
the root and its VERSION instead: `(kit root <root>, its VERSION <root>/VERSION)`. Never
silence: the line is pushed before anything that can fail, so an internal error still prints it as
partial output. The line says a hook ran; a model can type the same words, and it does not say
which copy decided a call.

The proof: a session's brief runs `node .claude/kit/tools/selfcheck.mjs` first.

| You see | Means | Do |
|---|---|---|
| the command is refused with `GUARD: ARMED` and the reason `ARMED <version> <sha12>` | Guard rule 15 (`selfcheck-armed` in `hooks/lib/guard-owner-rules.mjs`, KIT-02) read a Bash or PowerShell command whose command word is `node` or `node.exe`, by any path, and whose next word ends in `selfcheck.mjs`, by any path and either slash, after the prefixes rule 13 skips (`&`, `NAME=value`, `env`, `command`, `exec`, `nohup`, `time`). The hooks are loaded; the script never started. A refusal is the one thing a model cannot forge. | Go on with the brief. |
| the reason reads `ARMED unknown unknown` | The guard is loaded and the kit's version could not be read (a manifest include missing, an unreadable file, a VERSION missing or not its shape); the hooks log has an ERROR line `rule 15: the kit's version could not be read ...` that names the cause (with no kit root at all, `rule 15: ... no kit root; looked at ...`, naming every place the search looked). The refusal still proves the guard. | Read the log line; vendor the kit again. |
| `UNARMED: no guard saw this call` (exit 2) | The script ran: no guard refused the command, so the hooks are not loaded in this session, or the command took a form the guard does not read (below). The brief says stop. | Check `.claude/settings.json` carries the hooks block (`tools/settings.mjs -Vendored -Check -Out <file>`) and `.claude/kit/` is complete (`vendor.mjs -Check`); fix, then start a new session. |

The script imports nothing and reads nothing, so a copy with a broken library, a missing
`law.json` or a planted marker file still says UNARMED; exit 0 never happens in it. Not read by
rule 15, the written residual: a node option between the two words (`node --no-warnings
x/selfcheck.mjs`), another runner (`npx`, `deno`, a package script), a `sudo` or `doas` prefix, the
words as quoted data (`echo "node selfcheck.mjs"`, allowed), and the shell residual, a nested shell
(`bash -c "..."`, `pwsh -c "..."`, `cmd /c "..."`) or a script on disk that runs it. In every
unmatched form the script runs and prints UNARMED while the guard may well be loaded: the safe side,
a stop and never a false go. `KIT-02` is graded HOOK on the guard's anchor; the script's own anchor
(`selfcheck`, mode gate) marks the UNARMED exit and no clause cites it.

## The extract: `tools/extract.mjs` (0.3.0)

```
node tools/extract.mjs -Brain <brain root> -Class full|private|shared|public -Out <path>
                       [-Repo <name>] [-Kit <kit root>] [-Overlay <path>]
```

A vendored hook has no pointer and no brain. It reads its values from the repository's
`.claude/kit/extract.json`, which this tool writes from the brain: values only, never the brain's
text, by class. Exit 0 written, 1 refused (a leak; nothing is written, a pre-existing `-Out` is
left untouched), 2 could-not-look (a missing or unreadable input, a bad option). Every line starts
`extract:`; refusals and drops go to stderr.

| class | carries |
|---|---|
| `public` and `shared` | the hook-read keys of `doctor.config.json` (`frozenPaths`, `tombstonedPaths`, `secretExceptions`, `readCeilingBytes`, `readCeilingExempt`, `sourceExtensions`, `stopDocs`, `stopFromGit`, `stopBudgetSeconds`, `stopCard`, `forbidScheduling`, `blanketKill`, `loopBranchPrefix`, `loopLedgerGlobs`, `ask`, `boundedFiles`), `agentPolicy` (`brief` and `cap` of `agent-policy.json`, no routes) and `lawIds` (the id and grade of every row of the brain's `LAW.md` that is a kit clause: no rule text, and no overlay clause, whose id is a leak there and refuses the write) |
| `private` | the same, plus `contentRules`, `agentPolicy.routes`, `routePolicy` (`route-policy.json` whole), `overlay` (every clause's id, grade and rule text; every override's id and grade) and the overlay ids in `lawIds` |
| `full` | every key of `doctor.config.json` but `_readers` and `_comment`, the overlay, `agent-policy.json`, `route-policy.json` and `cloud-policy.json` whole; host paths kept verbatim |

A key the brain did not type is not written. Path rows: a row that starts with `${ROOT}/`, or a
bare relative row, becomes `{ repo, path }`; the repository is the longest path the brain's
`control/domains.json` types (a `repos` key, a domain's `paths` entry), named by its last segment;
else, when the first segment is a category folder (a domain's `folders`, or `categories.folders`),
the second segment; else the first segment. `path` is the rest, or `.` at the repository root.
`${BRAIN}/...` names the brain folder's name. A row naming the whole root (`${ROOT}` alone) is
every repository's row, `{ "repo": "*", "path": "." }`, in every class (stderr `kept (every
repository)`). Any other absolute path, or a row with an environment token, is a host path:
dropped from a non-`full` class with `dropped (host path): <row>`, kept by `full`. A
`readCeilingExempt` or `boundedFiles` glob is a row only when it starts with `${ROOT}/` or
`${BRAIN}/`; a bare glob is kept. `contentRules` `under` and `except` rows follow the same rule, and
a rule left with no `under` row is dropped. `-Repo <name>` keeps only that repository's rows and the
`*` rows (compared without case), drops the others with `dropped (not <name>): <row>` and writes
`repo` into the header. The overlay is `-Overlay`, else the path the brain's `claims.json` names in
its law claim's `overlay` field (`${BRAIN}` and `${KIT}` expanded), else `law/overlay.json`, else
`law.overlay.json`; none is fine. The header is `generated_by`, `kit_version` (the running kit's, or
`-Kit`'s), `brain_commit` (git HEAD of the brain when the brain folder is a repository's top level,
else empty), `class`, `repo` (with `-Repo`), `at`; 2-space JSON, trailing LF.

| You see | Means | Do |
|---|---|---|
| `extract: wrote <out> (<class>, <n> value keys)` (exit 0) | Written. | Commit it in the repository. |
| `extract: refused: <pattern> pattern found in the <class> output (<n> hits); nothing written` (exit 1) | The serialized output holds a secret shape: one of the nine patterns of `hooks/lib/secrets.mjs` (a Discord webhook URL, a GitHub token or fine-grained token, an Anthropic key, an OpenAI key, an AWS key id, a PEM private key, a Slack token, a Discord bot token), named by pattern, never by the match. Scanned in every class. | Take the value out of the brain's config; rotate it if it was ever committed. |
| `extract: refused: leak word leakWords[<i>] found in the <class> output; nothing written` (exit 1) | A word of the brain's `leakWords` list is in a non-`full` output, named by its position. | Find the value that carries it. |
| `extract: refused: overlay clause id <ID> found in the <class> output; nothing written` (exit 1) | A `public` or `shared` output carries an overlay clause id. | Take the reference out, or use `private`. |
| `extract: refused to open <rel>: profile/, memory/ and the owner's own files never enter an extract; nothing written` (also `refused to write`) (exit 1) | A config path, `-Overlay`, the claims file's overlay path or `-Out` points into `profile/` or `memory/` under the brain, or at `me.md`, `voice.md`, `prohibitions.md` or the profile card by name, anywhere. The refusal names the path, never its text. | Point elsewhere. |
| `extract: dropped (host path): <row>` / `dropped (not <repo>): <row>` / `dropped (no under row left): contentRules <id>` / `dropped (no glob left): boundedFiles <glob>` / `kept (every repository): <row>` (stderr, the run goes on) | A row that cannot travel host-neutral, or that names another repository, was left out; a whole-root row was kept for every clone. | Read them once; a dropped frozen path is not protected in the clone. |
| `extract: no LAW.md in <brain>: lawIds empty` | The brain has no generated `LAW.md`. | Build it (the command under The CLAIMS band). |
| `extract: could not look: kit version unreadable: <why>` (exit 2, nothing written) | The kit's version could not be read: its VERSION is not the `{version, sha256, files}` shape, its `tools/vendor.json` or a file the manifest names is unreadable, the folder has no readable VERSION and no `plugin.json` with a manifest, or `plugin.json` names no version or is not JSON (the line says which). No extract carries an empty `kit_version`. | Pass `-Kit <checkout>`, or fix the kit. |
| `extract: could not look: ...` (exit 2) | A missing or unreadable input: `-Brain`, `-Class` or `-Out` absent, a class not in the four, the brain folder missing, no `doctor.config.json`, a file that is not JSON (quoted text is masked in the message), an overlay named and not found, an overlay path with a token this tool cannot expand. | Fix the input. |

What the reader does with it is under Config above. What the extract cannot see: a value that is
itself private text (a sentence typed as a `stopDocs` name is a value to it); a secret in a shape
the nine patterns do not name; a note name the brain did not list in `leakWords`; a token typed in a
non-path key (a `${ROOT}` inside `stopDocs` survives verbatim into `public`); a repository the
domain map and the category list both miss (its first segment is then the repository); a
category-level row (`under: ${ROOT}/trading`) names the category as if it were a repository, which
no lone clone matches. Nothing yet compares an extract's `kit_version` or `brain_commit` with the
kit a clone carries: a stale extract is read as it is.

## The release gate: `tools/release.mjs` (0.3.0)

```
node tools/release.mjs [-DryRun] [-Bump patch|minor|major] [-Root <kit checkout>]
```

Nothing used to check that the three self-tests ran before a version bump. This tool bumps only
after they did, and after every mechanism of the tree proved it can go red. Seven rules, in order:
the tree is clean (`git status --porcelain` prints nothing; an untracked file counts); `docs/build.mjs
-Check` exits 0; the kit's own Doctor (`tools/doctor/doctor.mjs -Kit`) exits 0 and prints its
`VERDICT: GREEN` line (a RED or a COULD-NOT-LOOK kit Doctor never ships, and an exit 0 with no GREEN
line proved nothing); `tools/tests/run.mjs`, `tools/doctor/selftest.mjs` and `tools/tests/adopt-selftest.mjs`
are spawned one after another from the checkout (never imported: `run.mjs` runs on import and
`cases-kitroot.mjs` moves the pointer), each must exit 0, print its `N passed, M failed` line with
M = 0 and print `red-expected: N` with N above 0; every mechanism read from the tree (`registry:<id>`
for each row of `hooks/registry.json`, `guard:<n>` for each numbered rule in the header comment of
`hooks/guard.mjs`, `claim:<type>` for each case of the dispatcher in `tools/doctor/claims.mjs`,
`anchor:<file>#<name>` for each anchor line in a tracked or untracked-not-ignored script outside
`.claude/`) maps in `tools/tests/red-expected.json` to one or more case names that a suite printed
and that passed; then, on green with `-Bump`, the version in `.claude-plugin/plugin.json` moves,
`LAW.md` is rebuilt, the page and the README are rebuilt, and the kit is vendored into its own
`.claude/kit/`, in that order, so the vendored copy holds the rebuilt files and its VERSION names the
new version (`LAW.md` carries no version, so a bump's rebuild leaves it unchanged); the Node
version that ran is printed on every run. Nothing is committed: the owner commits the listed files
by path. A mapped `run.mjs` name longer than 72 characters matches by its first 72 (the suite's
print width); a Doctor name is read with and without its `(exit N)` or `(Nx)` suffix. Exit 0 green,
1 refused, 2 could not look. The gate takes a few minutes.

| You see | Means | Do |
|---|---|---|
| `release: <root> (<version>)`, `  node <ver>`, `  tree clean`, `  docs ok (...)`, `  doctor GREEN (tools/doctor/doctor.mjs -Kit exit 0)`, three `  suite <rel>: N passed, 0 failed, red-expected N (exit 0)` lines, `  map tools/tests/red-expected.json: N mechanisms (...): N mapped, 0 unmapped, 0 unseen, 0 failed, 0 stale`, then `green: the kit Doctor GREEN, 3 suites green, N mechanisms each mapped to a case that ran and passed; no -Bump given, no release file changed (would be: patch x, minor y, major z)` (exit 0) | The gate is green and no release file moved (the kit Doctor wrote its ignored `state/`, as on every run). | Run it with `-Bump <word>` to release. |
| `  tree DIRTY: N entries` and `refused: ... the tree is dirty (...)` | Uncommitted or untracked files. | Commit or discard first. |
| `  docs STALE (docs/build.mjs -Check exit 1: ...)` | The page or the README blocks do not match a fresh render. | `node docs/build.mjs`, commit. |
| `  doctor RED (tools/doctor/doctor.mjs -Kit exit 1)` and `the kit Doctor (tools/doctor/doctor.mjs -Kit) is RED (exit 1): FAIL <id> ...; a RED or COULD-NOT-LOOK kit Doctor never ships` (or `is COULD-NOT-LOOK (exit 2): ???? <id> ...`, or `exited 0 and printed no VERDICT: GREEN line: nothing proved the kit's own claims hold`) | One of the kit's own claims is false or could not be checked (the first three claim lines are named), or the Doctor printed no verdict. Because the gate runs the kit Doctor, `KIT-RESTORE-01` refuses a release once the last drill logged in `records/restore-drill.log` is older than its window. | Run `node tools/doctor/doctor.mjs -Kit`, fix what it names, commit. |
| `suite <rel>: N failed: <names>` / `suite <rel> exited N` / `printed no 'N passed, M failed' line` / `printed no red-expected line (read as 0)` / `printed red-expected: 0` | A suite is red, crashed, or counts no refusal case. | Fix the suite; a suite with no refusal case proves nothing. |
| `mechanism <id> has no mapping in tools/tests/red-expected.json` (`UNMAPPED`) | A new registry row, guard rule, claim type or anchor line has no case that proved it red. | Write the case, see it fail first, add the entry. |
| `mechanism <id>: no suite printed the mapped case '<name>'` (`UNSEEN`) | A case was renamed or removed. | Fix the name in the map. |
| `mechanism <id>: the mapped case failed: '<name>'` (`FAILED`) | The case ran red for the wrong reason. | Fix the mechanism. |
| `tools/tests/red-expected.json maps <id>, which no registry row, guard rule, claim type or anchor line of the tree carries` (`STALE`) | A mechanism was retired and its entry stayed. | Remove the entry. |
| `  mapped    <id>  N cases (N matched by the first 72 characters only)` (`-DryRun` lists every mechanism) | The map holds; the note names a long `run.mjs` name read by its cut. | Check those entries by eye when a name changes past its 72nd character. |
| `bumped a -> b (<word>): .claude-plugin/plugin.json`, `  rebuilt <what> (...)` lines, `released <b> on node <ver>: commit .claude-plugin/plugin.json, LAW.md, docs/index.html, README.md and .claude/kit/ by path` | The release is on disk. | Commit by path; the gate commits nothing. |
| `  FAILED <what>: <rel> exited N: ...` then `refused: the version is bumped to <b> but <what> did not rebuild; fix and run the generator by hand, or restore plugin.json` (exit 1) | A generator failed after the bump. | Do what it says. |
| `release: <message>` (exit 2: usage, a `-Bump` word that is not one of the three, a root that is no git work tree, `hooks/registry.json` or `hooks/guard.mjs` missing, `tools/doctor/doctor.mjs` missing, a suite missing, a suite that could not be started) | Nothing was proved. | Fix the input. |

What it cannot see: whether a mapped case is the right case for its mechanism (a map that names a
passing case of another mechanism still passes; the map is read by a person at review); a
mechanism that no registry row, numbered rule line, dispatcher case or anchor line declares; two
`run.mjs` names that share their first 72 characters (both must pass); whatever the suites and the
kit Doctor themselves cannot see. The `red-expected` count each suite prints is a heuristic over its record
shapes (a refusal word in the expected value, a numeric expected 1 or 2, a name with `red:`); the
proof per mechanism is the map.

## Markers, logs, the kit root and the yield rule (0.3.0)

Where a hook keeps its markers and writes its logs follows one precedence in every getter: the
`DF_*` test seam (`DF_MARKER_DIR`, `DF_LOG_PATH`, `DF_FENCE_LOG_PATH`) first, then the hook input's
`scratchpad_dir` when the host hands one over (a folder the host owns and that dies with the
session: the markers go to `<scratchpad_dir>/design-first/`, the hooks log to
`<scratchpad_dir>/design-first-hooks.log`, the fence log to `<scratchpad_dir>/fence-log.txt`),
then the fixed locations (`<os temp>/design-first/`, `~/.claude/design-first-hooks.log`,
`~/.claude/fence-log.txt`). Nothing of the kit prunes under `scratchpad_dir`; `entry.mjs` still
prunes the fixed marker folder and the fixed log. The route hook's turn reset, which runs before
its libraries load, follows the same precedence inline.

A payload a hook cannot read: the route, stop, subagent and entry hooks read a stdin that is not
JSON as no payload and write one ERROR line, `payload is not JSON: <its first 80 characters>`, and
read an empty stdin as no payload with no line (entry still prints its arming line first); the
guard, fence, ask, agent and card hooks allow the call with the internal-error reply and an ERROR
line, `empty stdin (no tool call payload)` for an empty one.

The kit root a hook reads its law, policies and VERSION from is resolved in one order
(`hooks/lib/common.mjs getKitRoot`): `DF_KIT_ROOT` when it holds `law.json`; the copy that is
running, when it holds `law.json`, so the law rows and the entry path never name another version
than the hook code; `${CLAUDE_PROJECT_DIR}/.claude/kit` when it holds `law.json` and both policy
templates (a copy missing one is no kit: `agent.mjs` would allow every call); the pointer's
`pluginRoot` when it holds `law.json`; else none, which `entry.mjs` prints as the unarmed line.
The values come from the brain's `doctor.config.json` through the pointer when there is one, else
from the extract (`DF_EXTRACT_PATH`, then `${CLAUDE_PROJECT_DIR}/.claude/kit/extract.json`).

The yield rule: a hook running from `<repository>/.claude/kit/hooks/` steps aside, exit 0 and one
INFO line `yield: plugin present at <pluginRoot>` in the hooks log, nothing on stdout, when the PC
pointer file exists, parses, and its `pluginRoot` holds `law.json` and is not this very copy. The
plugin registered on that profile runs on the same event, and no two copies may decide one call.
The pointer is a PC file never in a repository, so in a cloud session the vendored copy always
decides; on a PC the plugin decides until the pointer is gone. No test seam turns the rule off; the
parity cases prove it with a planted pointer and a copy under `.claude/kit/hooks/`. The risk,
written down: a stale pointer whose `pluginRoot` still holds `law.json` after the plugin is
unregistered makes every vendored hook yield to nobody; the missing arming line and the probe's
UNARMED are the only signs. A side-effect dedup for two spawns of one hook (the host running a
vendored and a plugin copy of one event) was designed and deferred: both copies decide alike, and
the edit ledger may hold a line twice.

## Upgrading a brain from the PowerShell version (0.1.x)

0.2.0 runs on Node.js. The hooks and the Doctor need nothing from the brain to move: the brain's
config, claims, overlay and state are read as they are, path parts written with backslashes
(`\node_modules\`) still match, and a claim that names a kit script by its old `.ps1` name runs the
`.mjs` script beside it. Three files in the brain were written for PowerShell and are not rewritten
by `adopt`, which never overwrites a file:

1. `Doctor.bat` still calls `pwsh` and the old `doctor.ps1`, and prints that the Doctor is missing.
   Delete it and run `/design-first:adopt` again: attach mode writes only what is missing, so it
   writes the new `Doctor.bat` and `doctor.sh` and leaves every other file as it is. Or copy both
   from the plugin's `templates/` folder into the brain yourself.
2. `.git/hooks/commit-msg`, if you installed the commit check: copy the new shim over it (see The
   commit check below), and change the `file_contains` needle of its claim to
   `tools/vcs/law-claim.mjs`.
3. A `hook_smoke` claim or a `generated_matches` claim you wrote yourself keeps working; the
   `_readers` notes in `doctor.config.json` still name `.ps1` readers, which is only text.

Rebuild the brain's `LAW.md` afterwards (the command under The CLAIMS band): its header line names
the generator, now `build-law.mjs`, so `BRAIN-LAW-01` is RED until you do.

## A git call the guard now refuses (SAFE-01, 0.2.3)

Since 0.2.3 the guard reads a git call after the prefixes `env` (its long options by any
unambiguous prefix too, such as `env --c <dir>`), `command`, `time` and `NAME=value`, and after
`--attr-source`. It probes a call that names `--git-dir` or `--work-tree` (or the `GIT_DIR=` and
`GIT_WORK_TREE=` words) with the same options, and a call that sets `core.excludesFile` (by `-c`
or by `GIT_CONFIG_COUNT` words) with that value. Calls that passed before are now refused when
they stage a secret, or tidy a dirty work tree. (This is chunk 0 of CR-2026-10-16-ONEWRITER, 0.1.41
on the PowerShell line, which the Node port did not carry until 0.2.3.)

| You see | Means | Do |
|---|---|---|
| `BLOCKED - this command stages a file that looks like a credential: <file> (via '-A')` on a call such as `env git add -A`, `VAR=x git add -A`, `command git add -A`, `git --attr-source=HEAD add -A`, `git --git-dir=<R>/.git --work-tree=<R> add -A` or `git --work-tree=<folder> add -A` | The call stages an untracked secret file in the work tree git uses for it: the folder `--work-tree` names; with `--git-dir` alone, the folder the call runs in (git takes it as the work tree); else the repository the call's folder is in. `<file>` is named from the top of that work tree. Before 0.2.3, a prefix made the call read as not-git, `--attr-source` ended the reading, and `--git-dir` and `--work-tree` were skipped, so these calls staged the file with no refusal. | Do what any staging refusal asks: ignore the file in `.gitignore`, stage by path, or have the owner record a deliberate exception in `secretExceptions`. If `<file>` is in a folder you did not mean, check the folder that `--work-tree`, `--git-dir`, `git -C` or `env -C` names. |
| The same refusal on `git -c core.excludesFile= add -A`, while `git add -A` alone passes | The call turns off the excludes file that ignores the secret, so git stages it. The guard probes with the call's `core.excludesFile` value. | Drop the `-c core.excludesFile=` override, or ignore the file in the repository's own `.gitignore`. |
| `BLOCKED - git clean -f deletes untracked files ... and the work tree at <folder> has <n> uncommitted or untracked change(s)` on a call that names `--git-dir`, `--work-tree`, `GIT_DIR=` or `GIT_WORK_TREE=` | Rule 7 (SAFE-06) reads the status of the work tree git would change: the folder `--work-tree` names, or with a git dir alone the folder the call runs in. Before, it read the repository above the git dir, which can be clean while `<folder>` holds files. | Leave `<folder>` as it is. If the call named the wrong folder, check `--work-tree`, `--git-dir` and the folder it runs in. Tidying a dirty tree is the owner's call. |

## A Python heredoc the guard refuses (rule 13, `no-python-heredoc`)

Guard rule 13 runs in every session, with or without a brain, and has no config key. It reads each
Bash or PowerShell sub-command, and the pipeline it is in: the command word reduced to its file
name, then the other words in order. The reading lives once, in `hooks/lib/guard-owner-rules.mjs`.

| You see | Means | Do |
|---|---|---|
| `BLOCKED - no-python-heredoc: this command pipes a heredoc into Python (<text>)` on a command such as `python - <<'EOF'`, `python3 <<EOF`, `py -3 -<<EOF`, `python -u - <<EOF`, `python -X utf8 - <<EOF`, `C:\Python312\python.exe <<EOF`, `cat <<EOF \| python` or `cat <<'EOF' \| py -3` | A heredoc is the Python code: python, python3 (any version suffix) or py (any version flag) has no script file, `-m` or `-c` before the `<<`, or reads its code from stdin while an earlier command in the same pipeline carries a heredoc. Broken heredoc one-liners left runaway Python processes on 2026-10-20 (owner ruling, kit-next batch entry 3). Not refused, because the heredoc is input data there: `python script.py <<EOF`, `python -m mymod <<EOF`, `python -c "..." <<EOF`, `cat <<EOF \| python script.py`. Also not refused: `cat <<EOF > run.py`, `cat <<EOF \| grep x`, `python - < file.py` (one `<` is a redirect), and the same text inside a quoted string given to `echo`, `grep` or `git commit -m` (a command is read from its command word). | Write the code into a script file with the Write or Edit tool, then run that file (`python <file>.py`). |

## Known gaps, stated honestly

- A repository is listed once per run and the list is reused by every scan claim, and git is
  asked for a first-commit date once per repository. A file created while the Doctor is running
  is seen by the next run, not this one.
- A `tree_rules` rule whose `forbid` pattern uses a lookaround, an atomic or named group, a
  condition, an inline option or one of `\A \z \Z \G` is read line by line with no whole-text
  check first. The result is the same; that rule is slower on a large tree.
- The repo sweep reads `maxDepth` folders deep. A repo nested deeper is invisible.
- A linked worktree whose parent lives outside `root` (or under `excludePathParts`) is still
  folded and the INFO line names the parent by full path, but nothing checks that parent.
- `log_window_free_of` only reads lines that start with a date. A log that writes dates elsewhere
  on the line is read as undated, and undated lines are ignored.
- `hook_smoke` proves a hook starts and answers; it does not prove the hook's decisions are right.
  That is what the kit's hook self-tests are for. It knows the kit's internal-error reply by its
  words (`internal error` in a `systemMessage`, `hook hit an internal error` in an
  `additionalContext` or in plain text): a hook that reported a failure in other words would pass,
  and a hook whose answer quotes those words itself (a skill description, an entry note) fails.
- `tree_free_of` reads the files named by `extensions` and nothing else. A leak in an unlisted
  extension is not seen; the pre-flip history scan has the same scope.
- `state/law-installed.json` records what `adopt` saw. A hook script deleted after adopt still
  reads as installed in the brain's `LAW.md`; the survey line `hook REGISTERED BUT MISSING` is
  what catches it. Run `adopt` again after such a change and rebuild `LAW.md`.
- The arming probe and nested shells (0.3.0). Guard rule 15 reads the command word and the one
  after it. `node .claude/kit/tools/selfcheck.mjs` run through `bash -c`, `pwsh -c`, `cmd /c`,
  another runner, a `sudo` or `doas` prefix, a node option before the script, or a script on
  disk is not seen: the probe runs and prints UNARMED while the guard is loaded. The safe side, a
  stop and never a false go; the brief runs the plain form.
- The side-effect dedup is deferred. When a host runs two copies of one hook on one event (a
  vendored copy beside a plugin, with no pointer to make one yield), both decide alike, both write
  a ledger line, and the Stop card may count an edit twice. The yield rule covers the PC; the
  cloud runs one copy.
- Capabilities UNCONFIRMED in the cloud, so nothing rests on them: that a PreToolUse deny inside
  a container returns its reason to the model without ending the turn (the design's
  `continueOnBlock` field is not used; a deny already carries the reason); that a SessionStart
  hook's stdout line is visible in the session's transcript; that a child session honours the
  `permission_mode` the caller passes; that a cloud child carries `gh` credentials for its own
  repository; that a push notification from a cloud session reaches a phone. Each is a probe, not
  a mechanism; the arming line and the selfcheck are written so a false reading is a stop.
- `vendor.mjs -Check` and `tree_sha` see the listed files only. A file planted under `.claude/kit/`
  that the manifest does not name is in no sha and no report, and nothing in the kit removes it; a
  listed file edited and then given an older time is exit 1 but unnamed, and so is an edit in a
  clone or a copy whose listed files git or the copier wrote after VERSION (more than half
  newer). Neither compares the copy with the checkout it came from: a manifest file changed after
  the last vendor leaves the copy behind and `KIT-VENDOR-01` GREEN until the kit is vendored again
  (the release gate does it on a bump; `node tools/vendor.mjs -Target . -Kit . -DryRun` names what
  is behind).
- A stale pointer (0.3.0): on a PC, a pointer whose `pluginRoot` still holds `law.json` after the
  plugin is unregistered makes every vendored hook yield to nobody. The missing arming line and the
  probe's UNARMED are the only signs; delete the pointer or run `remove`.
- A `-Scope brain` run on a PC whose pointer names a plugin that holds `law.json`: the vendored
  hook the smoke claim starts yields, so the smoke reads a silent allow from a yield and PASSES
  without the hook's body having run. A cloud run has no pointer and is not affected.
- `adopt` in attach mode on a brain adopted before 0.3.0 keeps its `claims.json` (the shipped
  `KIT-VENDOR-01`, `KIT-VENDOR-02` and `SETTINGS-BLOCK-01` do not reach it) and its settings file (the
  diff and the merge command are printed, nothing is changed). Copy the three claims by hand; the subset of
  `SETTINGS-BLOCK-01` goes stale after a registry change until `claims.json` is refreshed from a
  new render (a second adopt prints the diff).
- `adopt` in attach mode on a brain adopted as a git repository before 0.3.0 also keeps its
  `.gitignore` with the old `state/` line (attach writes only missing files and prints the diff), so
  the brain's commit carries no `state/law-installed.json` and a committed clone of it shows
  `BRAIN-LAW-01` COULD-NOT-LOOK until that `.gitignore` is changed by hand: the
  `????  BRAIN-LAW-01  installed missing` row of the CLAIMS band says how.
- `remove` leaves a settings file that adopt merged the hooks block into, a repository's own
  `.claude/settings.json` or `settings.local.json` that had no `hooks` key or whose `hooks` key
  already was the render (it was the repository's before adopt, so it is not recorded): after remove
  its hooks block names a `.claude/kit/` that is gone. Delete the block yourself. A settings file
  with a `hooks` key of its own is never merged into: adopt keeps it as it is and prints the merge
  command, which replaces that key.
- After `adopt -Vendor false` and the fix-up commands its off line prints, `remove` leaves the
  `.claude/kit/` copies and the settings files those commands wrote: adopt did not write them, so
  they are not recorded (the printed vendor commands carry no `-Record`). Delete them yourself.
- A cloud brain run proves the brain's own vendored copy (`KIT-VENDOR-02`, a `${BRAIN}` claim, is
  recomputed under `-Host cloud`) and nothing of the root: `KIT-VENDOR-01` and `SETTINGS-BLOCK-01`
  are `${ROOT}` claims and are SKIPPED there, and the brain's own `.claude/settings.json` is read as
  the registration record but held to no render.
- The self-tests have one false red by path length: `tools/tests/run.mjs` run from a kit folder
  whose path is about 101 characters or longer fails the subagent size case, because the folder
  name is printed once per injection and the test's fixture then passes the 9,500-character cap.
  Run the suites from a shorter checkout path; the release gate runs them from the checkout.
- A hooks log line is appended by whichever copy ran; under `scratchpad_dir` it dies with the
  session, and nothing collects it. A cloud session's refusals are read in that session or not at
  all.
- It reports what is true now. It does not know what you intended.

## Anchors and grades

A script anchor is a comment line `// anchor: <name>  mode: <deny|advise|gate>  verbs: <a,b>` (a `#` comment is read too, for a script in a language that uses one). The law generator checks a clause's grade against the anchor it cites: a HOOK clause needs `mode: deny` in a hook, an ADVISE clause `mode: advise` in a hook, and a GATE clause on a tool `mode: gate`. A hook clause's ref must name a script that `hooks/hooks.json` registers, by its path under `hooks/`; its anchor may sit in that script or in a `lib/` file beside it. A clause on a kit hook script that nothing registers fails the build, because that script never runs, and so does a ref to a `lib/` file: it runs only through the script that loads it, so name that script. In a vendored copy, which carries no `hooks.json`, the registration record is `hooks/registry.json` (its rows' `script`), so the vendored generator proves a brain's hook clauses from the registry (0.3.0); beside `.claude-plugin/plugin.json`, a checkout or a plugin install, a missing `hooks.json` still fails the clause and names plugin.json as the reason the registry is not read, and a `hooks.json` that exists and cannot be read is never papered over. A survey anchor in `tools/doctor/survey.mjs` is cited with `enforcedBy.kind` `survey` (0.2.7): the anchor must declare `mode: advise`, the grade must be ADVISE, and `hooks/hooks.json` is not read for it, because a survey line runs in the Doctor and not in a hook. A `warn` finding never changes the verdict, so a survey kind cannot carry GATE; until 0.2.7 such a clause had to name kind `hook` on a script that is not a hook. The Doctor carries one tool anchor, `could-not-look`, on the line that decides the COULD-NOT-LOOK verdict: a Doctor that could not look never reports green, and the clauses that say so cite that line.
