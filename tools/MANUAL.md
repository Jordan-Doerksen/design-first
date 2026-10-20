# Doctor manual

How to run it, what each band means, every finding it can print and what to do about it.

## Run it

On Windows double-click `Doctor.bat` in your brain folder; on Linux or macOS run `./doctor.sh`
there. Or from any shell:

```
node <pluginRoot>/tools/doctor/doctor.mjs            # your brain and root
node <kit checkout>/tools/doctor/doctor.mjs -Kit     # the kit checks the tree this script sits in
node <pluginRoot>/tools/doctor/doctor.mjs -Json      # one JSON document, no colour
```

`-Kit` checks the copy of the kit that the script sits in. To check a change, run the checkout's
script; `<pluginRoot>/tools/doctor/doctor.mjs -Kit` and `Doctor.bat -Kit` check the copy the
pointer's `pluginRoot` names, which is the installed copy unless the plugin runs from the checkout.

Switches: `-Kit`, `-Json`, `-Quiet`, `-ConfigPath <file>`, `-ClaimsPath <file>`. `Doctor.bat` and
`doctor.sh` pass them through; `Doctor.bat` pauses only when run with no arguments.

Nothing runs it for you. No scheduled task, no login entry, no timer.

## Where it looks

Everything comes from the pointer `~/.claude/design-first.json` (on Windows,
`%USERPROFILE%\.claude\design-first.json`; `DF_POINTER_PATH` overrides the location, for tests):

| From the pointer | Derived from it |
|---|---|
| `root` - where sessions start | `<root>/.claude/settings.json` + `settings.local.json` |
| `brain` - your private folder | `<brain>/doctor.config.json`, `<brain>/claims.json`, `<brain>/state/`, `<brain>/records/` |
| `pluginRoot` - the kit | `<pluginRoot>/hooks/hooks.json`, `tools/law/build-law.mjs` |
| - | fence log, fixed: `~/.claude/fence-log.txt` |

Under `-Kit` there is no brain: the kit is `root`, `${KIT}` and `pluginRoot`; claims come from
`<kit>/tools/doctor/claims.json`; config from `<kit>/templates/doctor.config.json` (defaults if
absent); state goes to `<kit>/state/`.

## Bands and exit codes

| Band | Holds | Effect |
|---|---|---|
| **CLAIMS** | every claim in `claims.json`, plus the built-in config schema check | any `FAIL` = **RED, exit 1** |
| **SURVEY** | repository, wiring and snapshot findings | **REPORTED, exit 0**. With `surveyStrict: true` in the config, `fail`-severity findings are RED (exit 1). `warn` and `info` never change the exit code. |
| **COULD-NOT-LOOK** | anything the Doctor could not check, including every `UNKNOWN` claim and a crash of the Doctor itself | **exit 2. Never a pass.** It wins over RED. |

`GREEN` means: no false claim, nothing it could not look at, and (if strict) no survey fail.
A `GREEN` with survey findings printed is still exit 0; the verdict line says how many were
reported and not counted.

## The CLAIMS band

Each claim prints one line when it fails or cannot be evaluated:

| Line | Means | Do |
|---|---|---|
| `FAIL  <ID>  <detail>` then `why: ...` | A statement a law file depends on has gone false. | Read the `why`. Fix the document or fix the world. Never delete the claim to make it pass. |
| `????  <ID>  <detail>` | The claim could not be evaluated (file missing, generator failed, hook not registered, unknown type). Counted in COULD-NOT-LOOK. | Make the thing checkable, or remove a claim that can never be. |
| `FAIL  CONFIG-SCHEMA  MIGRATE: <config> is schema N; this Doctor expects schema 1` | The plugin was updated and your `doctor.config.json` is older (or has no `schema`). Every reader below assumes schema 1. | Follow the migration note in the kit README, then set `schema` to 1. |
| `FAIL  BRAIN-LAW-01  <brain>/LAW.md differs from the generator's output` | Your brain's `LAW.md` is not what a fresh build of the kit's `law.json`, your overlay and `state/law-installed.json` gives. A plugin update changed the law, or someone edited `LAW.md` by hand. The route and subagent hooks read their law rows from this file, so sessions get the old law until it is rebuilt. | Rebuild it with the command under the table. Never edit `LAW.md` by hand; change the overlay. |
| `????  BRAIN-LAW-01  installed missing: <brain>/state/law-installed.json` | The file `adopt` writes for the law build is gone (a fresh clone of the brain, or `state/` was deleted). | Run `/design-first:adopt` again; attach mode writes it and changes no file you edited. |
| `every claim holds` | All claims PASS. | - |
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
| `config_paths_each` | `configKey` or `paths[]`, `base?`, `file?`, `contains[]` | every listed folder holds `file` with every string in `contains`; with `base`, a relative entry is joined under that folder; with no `file`, each entry is itself the file read; a string in `contains` may hold alternatives split by `\|` and one of them must be present; an empty list passes and says so | a folder missing the file, a file missing, or the file missing a string | the config key absent, no list given, or no `file` and no `contains` |
| `file_not_contains` | `path`, `needle` | absent | present | file missing |
| `log_window_free_of` | `path`, `needle`, `days` | no line that starts with an ISO date/timestamp within `days` contains `needle`. No log file at all is a PASS, said in the detail. | such a line exists | `days` not a positive integer |
| `remote_is` | `path`, `remote` (default `origin`), `pattern` (regex) | `git remote get-url` matches | no such remote, or no match | folder missing, not a work tree |
| `json_subset_equal` | `path`, `subset` (inline JSON) | every key in `subset` equals the file's value; arrays compare as order-insensitive sets of equal length | a difference (the detail names the path) | file missing or not JSON |
| `json_keyed_match` | `path`, `other`, `collection` (dotted path), `key`, `requireAll?` (default false) | every record present in BOTH files' collections (matched on `key`) is deep-equal; extra records on either side are fine | a shared record differs (detail: the key and the first differing field), or `requireAll` and a `path` key is missing from `other` | either file missing or not JSON, `collection` missing or not an array in either file, no shared keys |
| `generated_matches` | `generator`, `source`, `overlay?`, `installed?`, `output` | the generator, run from the kit root into a temp file, produces the same bytes as `output` after CRLF->LF | bytes differ (first differing byte given), or `output` missing | generator missing, exits non-zero, times out (60 s), `node` absent |
| `tree_free_of` | `root`, `words[]`, `extensions[]`, `exclude[]`, `allow[]` of `{ path, words[] }` | no whole-word, case-insensitive hit in any scanned file | hits (file:line "word", first 12) | root missing, no words, no extensions |
| `tree_equals` | `path`, `other`, `exclude[]`, `extensions[]?` | every file under `path` exists under `other` with the same bytes or the same text after CRLF->LF, and nothing under `other` is missing from `path`; the same folder on both sides is a PASS | a file differs or exists on one side only (first 12 named) | either folder missing, or nothing left to compare after `exclude` and `extensions` |
| `tree_each` | `root`, `require[]` of `{file}` / `{glob}` / `{glob, pattern}`, `depth?` (2), `where?` `{anyOf[]}`, `exclude[]?`, `since?` (ISO date), `accepted[]?` of `{path, reason, since}`, `emptyOk?` (true: nothing selected is a PASS that says so; for a template claim on a root that may hold no matching repository yet) | every selected git repository under `root` meets every requirement; a repository whose first commit predates `since` is reported, never failed (the ratchet); accepted repositories are reported | a selected, non-grandfathered, non-accepted repository falls short (first 12 named with what is missing) | root missing, nothing selected, no `require`, an accepted entry without a reason, or `since` not a date |
| `snapshot_diff` | `root`, `snapshot` (the file `tools/doctor/snapshot.mjs` wrote), `expected[]` of `{path, change}` / `{glob, change}` with change `added` / `removed` / `modified`, `exclude[]?`, `maxDays?` | the differences between the snapshot and the tree now are exactly the expected ones: every expected entry matched a difference and every difference matched an entry; an empty `expected` means nothing may change | a difference nothing expected, or an expected change that did not happen (first 12 named with their kind) | root missing; snapshot missing, not JSON or not schema 1; `expected` absent or an entry malformed; `maxDays` not a positive integer; the snapshot older than `maxDays` |
| `tree_rules` | same selection fields as `tree_each` (`root`, `depth?`, `where?`, `exclude[]?`, `since?`, `accepted[]?`), plus `files?` (glob, '\|'-joined), `except[]?` (globs never read), `allowOnLine?` (regex), `rules[]` of `{id, forbid, files?}` or `{id, when, require, files?}` | no selected repository has a hit: a `forbid` line (unless that line or the one above matches `allowOnLine`), or a file matching `when` that lacks `require` | a repository has hits (rule, file:line, first three, then a count); the ratchet and accepted entries apply as for `tree_each` | no rules, a rule without id or shape, or the `tree_each` UNKNOWN cases |
| `ratchet` | `path` (a markdown file), `row` (first-cell text of the table row), `heading?` (default `Summary`), `accepted?` `{ value, since, reason }` | the integer in that row is at or under the value recorded on the last run in `state/ratchets.json`; with no record yet the baseline is recorded and an INFO line says so; a rise passes once when an unused `accepted` entry covers it | the count rose and no unused `accepted` entry covers it; the record does not move, so a re-run stays RED | file missing, heading or row not found, the cell is not an integer, `accepted` without `value`, `since` or `reason`, or `ratchets.json` unreadable |
| `hook_smoke` | `hook`, `event` (`SessionStart`, `PreToolUse`, `UserPromptSubmit`, `SubagentStart` or `Stop`) | hook runs as registered in `hooks.json` with synthetic stdin, exit 0; SessionStart also needs non-empty stdout; PreToolUse, SubagentStart and Stop need empty stdout or JSON; UserPromptSubmit may print anything or nothing | exits non-zero, times out (10 s), prints nothing (SessionStart), prints non-JSON (PreToolUse), script missing, interpreter not on PATH | `hooks.json` missing/unparseable, hook not registered for that event |
| `pointer_valid` | - | pointer parses and `root`, `brain`, `pluginRoot` all exist | otherwise (the detail says which) | - |
| `config_schema` | `path`, `expected` | `schema` equals `expected` | mismatch or no `schema` field: detail starts `MIGRATE:` | file missing or not JSON |

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
`Alpha` and `Beta` inside `Alpha-Beta` there, while a bare `Alpha` in the same file still trips.

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
| `hook REGISTERED BUT MISSING: <script> (<event>) - hooks.json calls a file that is not there` | fail | Enforcement you believe in is not running. | Restore the file or remove the registration. |
| `no hooks.json at <path> - no hook is registered` | fail | The pointer's `pluginRoot` has no `hooks/hooks.json`. | Start a session so `entry.mjs` refreshes the pointer, or re-install the plugin. |
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
| `WARNING: state could not be written to <dir>` | Not a band; printed when `state/` is not writable. The verdict stands. | Check permissions on the state folder. |
| `COULD-NOT-LOOK: the Doctor stopped: <message> at <file>:<line>. No verdict was reached.` | The Doctor itself failed outside every check: a kit file that does not load, or a defect in a step. Nothing was judged, so this is exit 2 and never RED; `Doctor.bat` prints `COULD NOT LOOK`. Under `-Json` it is one document with `verdict`, `exitCode`, `reason` and `mode`. A crash up to and in the verdict step leaves `state/` as the previous run wrote it; a crash in the report comes after `state/` is written, so `last-run.json` then holds a verdict this run did not print. | Read the file and line. Re-install the plugin if a kit file is damaged; otherwise report the defect with that line. |

## Config: `<brain>/doctor.config.json` (SPEC 5.3)

| key | reader | means |
|---|---|---|
| `schema` | doctor.mjs | Must be 1. Mismatch is the `MIGRATE` claim. |
| `surveyStrict` | report.mjs | `true`: survey `fail` findings turn the verdict RED. Default `false`, so the kit grades VCS-01, VCS-02 and VCS-22 HONOUR; with `true`, re-grade them to GATE in `law.overlay.json` on their survey anchors and add a `json_subset_equal` claim that holds `surveyStrict: true`. VCS-04 and DES-09 rest on `warn` findings and stay HONOUR. |
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
| `forbidScheduling` | hooks/guard.mjs | Default false. True: guard rule 8 refuses a command that creates a scheduled task, a cron entry, a Run key, a service or a Startup-folder entry. |
| `contentRules` | hooks/guard.mjs | Default empty. A list of `{ id, under[], except[], exceptParts[], extensions[], pattern, shell, why }`. Guard rule 9 refuses an edit under `under` that adds a match of `pattern`. A rule needs `id`, `pattern` and one `under` path that resolves. |
| `loopBranchPrefix` | hooks/guard.mjs | Default `harness/`. A repository whose current branch starts with it is on the loop branch, and so is a detached HEAD while a rebase of such a branch is stopped or a bisect that started on one runs (there rule 11 also refuses `rebase --quit`): guard rule 11 refuses `git push` (and `git send-pack`, the plumbing under it), `merge` and `pull` there, and a command that leaves it or moves another branch onto its work: a `checkout` or `switch` off it, a `worktree add` off it, a `rebase` that names a branch other than a local loop branch, a `bisect` that can check out a commit, a `fetch` into a local branch, a `branch -m`/`-M`/`-c`/`-C`/`-f`, `update-ref` and a `symbolic-ref` write (AUTO-11); rule 12 refuses edits to the story ledger (AUTO-04). From any branch, rule 11 refuses a push, merge or pull that names a branch with the prefix, a `push --all`, `--mirror` or glob refspec that covers one, a branch move or ref write that names one, and a `fetch` that writes one or writes a local branch from one or from a glob that can cover one. Any other git command or form that moves HEAD or a branch is a residual (`hooks/lib/guard-loop-rules.mjs`). |
| `loopLedgerGlobs` | hooks/guard.mjs | Default `docs/specs/*.tasks.json`, `specs/*.tasks.json`. Repository-relative globs of the story ledger rule 12 protects on the loop branch. |
| `commitMessage` | tools/vcs/law-claim.mjs | `{ maxSubject, pastTenseWords[], placeholders[] }`. Defaults 72, a built-in past-tense list, a built-in placeholder list. The commit-msg shim refuses a subject over the limit, a past-tense first word or a bare placeholder (VOICE-05); merges and reverts are exempt. |
| `ask` (in `doctor.config.json`) | hooks/ask.mjs | `{ minReason, equalPhrases[], recommendedMarker }` (OWN-04). Defaults 40 characters, a built-in list of equal-options phrases ("both are acceptable", "either is fine", "no wrong answer" and others), and `(?i)\brecommended/b` on the first option's label. A question is refused when an option's description is shorter than `minReason`, when its text holds a phrase from the list (a phrase that is negated, quoted, or in a sentence that also holds a contrast word such as 'but' does not count; see `instructions/working-with-the-owner.md`), or when its first option's label does not match the marker. `minReason` 0 or an empty marker turns that check off. |

Keys that are no longer keys and are reported as dead if present: `root`, `stateDir`, `recordsDir`,
`gitTimeoutSeconds`, `staleStateDays`, `_retiredUnversionedWatchlist`, `enforcement.settingsPath`,
`enforcement.fenceLogPath`, and `splitLines` (since 0.1.35: DES-03 has no line count; delete it and, if
you want a different read check, set `readCeilingBytes`). Keys starting with `_` are comments and are ignored.

## Route policy: `<brain>/route-policy.json` (DES-13)

Read by `hooks/route.mjs` on every prompt and `hooks/subagent.mjs` at every subagent start; the
template's `_comment` describes each key. `adopt` copies `templates/route-policy.json` into the
brain once; a kit upgrade never edits the brain's copy, so a key added to the template after adopt
reaches a brain only when it is added there by hand.

| Key | Since | Effect |
|---|---|---|
| `alwaysForSessions` | 0.1.34 | Groups added to every session's first prompt, and again after a compaction or a clear, whatever the words and the folder (OWN-10). The template lists `OWN`. Absent: no group arrives without a matching word or folder, as before 0.1.34. These groups are not sent to subagents unless `alwaysForSubagents` lists them too. |

To take a new key on an existing brain, copy its line from the template into the brain's
`route-policy.json`.

## Generated output: `<brain>/state/`

Generated, never hand-edited. Byte-identical on a re-run with nothing changed, except `last-run.json`.

| File | Holds |
|---|---|
| `repos.json` | every swept repo: remote, ownership, ahead, dirty, shallow, frozen, last commit; linked worktrees carry `worktree: true` and `parent` |
| `repos.generated.md` | the same as a table, sorted, no timestamp; worktrees are not rows (folded into their parents) |
| `last-run.json` | when it ran, the mode, the verdict, `repoCount`, `worktreeCount` and the band counts; the only file with a timestamp |
| `ratchets.json` | one record per `ratchet` claim id: `value`, `recordedAt`, `acceptedUsed`. Rewritten only when a record moves. Deleting it, a fresh clone, or `/design-first:remove` resets every ratchet: the next run passes at any value and records it as the new baseline. When the brain is a repository, the `.gitignore` adopt writes ignores `state/` (adopt keeps a `.gitignore` that exists), so the record is local to this machine (`PRIN-04`, written limit in `instructions/principles.md`). |
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
DENY clause that the docs page must count as stopped and show on a coloured chip. It never touches your real
folders. A few seconds. Run it after any change to the Doctor: a check that cannot fail is worse
than no check.

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
  That is what the kit's hook self-tests are for.
- `tree_free_of` reads the files named by `extensions` and nothing else. A leak in an unlisted
  extension is not seen; the pre-flip history scan has the same scope.
- `state/law-installed.json` records what `adopt` saw. A hook script deleted after adopt still
  reads as installed in the brain's `LAW.md`; the survey line `hook REGISTERED BUT MISSING` is
  what catches it. Run `adopt` again after such a change and rebuild `LAW.md`.
- It reports what is true now. It does not know what you intended.

## Anchors and grades

A script anchor is a comment line `// anchor: <name>  mode: <deny|advise|gate>  verbs: <a,b>` (a `#` comment is read too, for a script in a language that uses one). The law generator checks a clause's grade against the anchor it cites: a HOOK clause needs `mode: deny` in a hook, an ADVISE clause `mode: advise` in a hook, and a GATE clause on a tool `mode: gate`. A hook clause's ref must name a script that `hooks/hooks.json` registers, by its path under `hooks/`; its anchor may sit in that script or in a `lib/` file beside it. A clause on a kit hook script that nothing registers fails the build, because that script never runs, and so does a ref to a `lib/` file: it runs only through the script that loads it, so name that script. The Doctor carries one tool anchor, `could-not-look`, on the line that decides the COULD-NOT-LOOK verdict: a Doctor that could not look never reports green, and the clauses that say so cite that line.
