# Doctor manual

How to run it, what each band means, every finding it can print and what to do about it.

## Run it

Double-click `Doctor.bat` in your brain folder, or from any shell:

```
pwsh -NoProfile -File <pluginRoot>\tools\doctor\doctor.ps1            # your brain and root
pwsh -NoProfile -File <pluginRoot>\tools\doctor\doctor.ps1 -Kit       # the kit checks itself
pwsh -NoProfile -File <pluginRoot>\tools\doctor\doctor.ps1 -Json      # one JSON document, no colour
```

Switches: `-Kit`, `-Json`, `-Quiet`, `-ConfigPath <file>`, `-ClaimsPath <file>`. `Doctor.bat` passes
them through and pauses only when run with no arguments.

Nothing runs it for you. No scheduled task, no login entry, no timer.

## Where it looks

Everything comes from the pointer `%USERPROFILE%\.claude\design-first.json`
(`DF_POINTER_PATH` overrides the location, for tests):

| From the pointer | Derived from it |
|---|---|
| `root` - where sessions start | `<root>\.claude\settings.json` + `settings.local.json` |
| `brain` - your private folder | `<brain>\doctor.config.json`, `<brain>\claims.json`, `<brain>\state\`, `<brain>\records\` |
| `pluginRoot` - the kit | `<pluginRoot>\hooks\hooks.json`, `tools\law\build-law.ps1` |
| - | fence log, fixed: `%USERPROFILE%\.claude\fence-log.txt` |

Under `-Kit` there is no brain: the kit is `root`, `${KIT}` and `pluginRoot`; claims come from
`<kit>\tools\doctor\claims.json`; config from `<kit>\templates\doctor.config.json` (defaults if
absent); state goes to `<kit>\state\`.

## Bands and exit codes

| Band | Holds | Effect |
|---|---|---|
| **CLAIMS** | every claim in `claims.json`, plus the built-in config schema check | any `FAIL` = **RED, exit 1** |
| **SURVEY** | repository, wiring and snapshot findings | **REPORTED, exit 0**. With `surveyStrict: true` in the config, `fail`-severity findings are RED (exit 1). `warn` and `info` never change the exit code. |
| **COULD-NOT-LOOK** | anything the Doctor could not check, including every `UNKNOWN` claim | **exit 2. Never a pass.** It wins over RED. |

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
| `every claim holds` | All claims PASS. | - |
| `no claims to check` | The claims file has an empty `claims` array. | Add a claim whenever a law file states a fact about the disk. |

### Claim types (SPEC 5.2)

Paths expand `%USERPROFILE%` (and any `%VAR%`), `${ROOT}`, `${BRAIN}`, `${KIT}`. A relative path is
brain-relative (kit-relative under `-Kit`). A path with an unexpandable variable is UNKNOWN.

| type | fields | PASS when | FAIL when | UNKNOWN when |
|---|---|---|---|---|
| `path_exists` | `path` | present | missing | unexpanded variable |
| `path_absent` | `path` | absent | present | unexpanded variable |
| `file_contains` | `path`, `needle` | literal substring found anywhere in the file | absent | file missing |
| `file_fresh` | `path`, `maxDays`, `graceFromInstall?` | the last line that starts with an ISO date is at most `maxDays` old; with `graceFromInstall` a missing file passes until `maxDays` after the write time of `state/installed.json` | file missing (past the grace), no dated line, or the last dated line is older | `maxDays` not a positive integer |
| `config_paths_each` | `configKey` or `paths[]`, `file`, `contains[]` | every listed folder holds `file` with every string in `contains`; an empty list passes and says so | a folder missing the file, or the file missing a string | the config key absent, or no list given |
| `file_not_contains` | `path`, `needle` | absent | present | file missing |
| `log_window_free_of` | `path`, `needle`, `days` | no line that starts with an ISO date/timestamp within `days` contains `needle`. No log file at all is a PASS, said in the detail. | such a line exists | `days` not a positive integer |
| `remote_is` | `path`, `remote` (default `origin`), `pattern` (regex) | `git remote get-url` matches | no such remote, or no match | folder missing, not a work tree |
| `json_subset_equal` | `path`, `subset` (inline JSON) | every key in `subset` equals the file's value; arrays compare as order-insensitive sets of equal length | a difference (the detail names the path) | file missing or not JSON |
| `json_keyed_match` | `path`, `other`, `collection` (dotted path), `key`, `requireAll?` (default false) | every record present in BOTH files' collections (matched on `key`) is deep-equal; extra records on either side are fine | a shared record differs (detail: the key and the first differing field), or `requireAll` and a `path` key is missing from `other` | either file missing or not JSON, `collection` missing or not an array in either file, no shared keys |
| `generated_matches` | `generator`, `source`, `overlay?`, `installed?`, `output` | the generator, run from the kit root into a temp file, produces the same bytes as `output` after CRLF->LF | bytes differ (first differing byte given), or `output` missing | generator missing, exits non-zero, times out (60 s), `pwsh` absent |
| `tree_free_of` | `root`, `words[]`, `extensions[]`, `exclude[]`, `allow[]` of `{ path, words[] }` | no whole-word, case-insensitive hit in any scanned file | hits (file:line "word", first 12) | root missing, no words, no extensions |
| `tree_equals` | `path`, `other`, `exclude[]`, `extensions[]?` | every file under `path` exists under `other` with the same bytes or the same text after CRLF->LF, and nothing under `other` is missing from `path`; the same folder on both sides is a PASS | a file differs or exists on one side only (first 12 named) | either folder missing, or nothing left to compare after `exclude` and `extensions` |
| `tree_each` | `root`, `require[]` of `{file}` / `{glob}` / `{glob, pattern}`, `depth?` (2), `where?` `{anyOf[]}`, `exclude[]?`, `since?` (ISO date), `accepted[]?` of `{path, reason, since}`, `emptyOk?` (true: nothing selected is a PASS that says so; for a template claim on a root that may hold no matching repository yet) | every selected git repository under `root` meets every requirement; a repository whose first commit predates `since` is reported, never failed (the ratchet); accepted repositories are reported | a selected, non-grandfathered, non-accepted repository falls short (first 12 named with what is missing) | root missing, nothing selected, no `require`, an accepted entry without a reason, or `since` not a date |
| `tree_rules` | same selection fields as `tree_each` (`root`, `depth?`, `where?`, `exclude[]?`, `since?`, `accepted[]?`), plus `files?` (glob, '\|'-joined), `except[]?` (globs never read), `allowOnLine?` (regex), `rules[]` of `{id, forbid, files?}` or `{id, when, require, files?}` | no selected repository has a hit: a `forbid` line (unless that line or the one above matches `allowOnLine`), or a file matching `when` that lacks `require` | a repository has hits (rule, file:line, first three, then a count); the ratchet and accepted entries apply as for `tree_each` | no rules, a rule without id or shape, or the `tree_each` UNKNOWN cases |
| `ratchet` | `path` (a markdown file), `row` (first-cell text of the table row), `heading?` (default `Summary`), `accepted?` `{ value, since, reason }` | the integer in that row is at or under the value recorded on the last run in `state\ratchets.json`; with no record yet the baseline is recorded and an INFO line says so; a rise passes once when an unused `accepted` entry covers it | the count rose and no unused `accepted` entry covers it; the record does not move, so a re-run stays RED | file missing, heading or row not found, the cell is not an integer, `accepted` without `value`, `since` or `reason`, or `ratchets.json` unreadable |
| `hook_smoke` | `hook`, `event` (`SessionStart`, `PreToolUse`, `UserPromptSubmit`, `SubagentStart` or `Stop`) | hook runs as registered in `hooks.json` with synthetic stdin, exit 0; SessionStart also needs non-empty stdout; PreToolUse, SubagentStart and Stop need empty stdout or JSON; UserPromptSubmit may print anything or nothing | exits non-zero, times out (10 s), prints nothing (SessionStart), prints non-JSON (PreToolUse), script missing, interpreter not on PATH | `hooks.json` missing/unparseable, hook not registered for that event |
| `pointer_valid` | - | pointer parses and `root`, `brain`, `pluginRoot` all exist | otherwise (the detail says which) | - |
| `config_schema` | `path`, `expected` | `schema` equals `expected` | mismatch or no `schema` field: detail starts `MIGRATE:` | file missing or not JSON |

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
| `outside a category folder: <repo> - a project lives at <category>\<name>` | fail | `categories.folders` is set, and this repository's first folder under root is not one of them. It was born on or after `categories.since`, or has no commit yet. | Move it into a category now, while a move costs nothing. If it belongs where it is, add `{ path, kinds: ["outsideCategory"], since, reason }` to `acceptedExceptions`. |
| `outside a category folder: <repo> (born <date>, before <since>: reported, not failed)` | warn | The same, for one repository born before `categories.since`. | Move it when its work allows, or accept it with a reason. |
| `N repositories sit outside a category folder and predate the ratchet (...): <names>` | warn | Two or more of the line above, folded into one: the move backlog. | The same, one repository at a time. Never the root, the brain or the root's `.claude` folder; those are not projects. |
| `categories.since is not a date: '<value>'` | warn | The ratchet date could not be read, so every stray is treated as new. | Write it as `YYYY-MM-DD`. |
| `no .gitattributes: <repo> - core.autocrlf decides its bytes, not the repo` | warn | A machine setting decides the repo's bytes. | Add one when the tree is clean. |
| `no git at all: <path> (N files) - nothing is protecting them` | warn | Real content in no repository. Enumerated, not looked up. | `git init`, `.gitignore` before the first commit, remote. If deliberate, add a part to `unversionedIgnorePathParts` with a reason. |
| `tracked .env: <repo>/<file> - a secret file is in git.` | fail | A secret file is tracked. | Rotate first, then `git rm --cached`, then ignore it. Or register it in `secretExceptions` on purpose. |
| `tracked secret file, registered exception: <repo>/<file>` | info | Tracked, and you said so in `secretExceptions`. | Nothing, unless the reason is gone. |
| `no restore drill has been logged (<records>\restore-drill.log absent)` | info | Nothing has proved a backup gives anything back. | Run a restore drill when you have one; it logs here. |
| `restore-drill.log has no dated entry` | warn | The log exists but no line starts with a date. | Fix the log format. |
| `restore drill is N days old (last <date>) - quarterly is the ask` | warn | The drill stopped being run. | Run it. |
| `restore drill has N logged FAIL line(s) - a restore did not reproduce the local tree` | fail | The backup did not give back what the disk holds. | Read the log. Do not clear it to make this pass. |
| `entry-point snapshot is STALE: <file> changed and the snapshot was not updated in the same change.` | fail | A live file that governs every session drifted from its byte snapshot. Compared after CRLF->LF. | Copy live over snapshot, commit. The live file is authoritative. |
| `no snapshot for <file>` | fail | A pair in `entryPointSnapshots` has no snapshot file. | Copy the live file to the snapshot path. |
| `entry-point file is GONE: <path>` | fail | The live file is missing; the snapshot is the only copy. | Restore from the snapshot before anything else runs. |
| `entryPointSnapshots entry could not be expanded` | warn | A pair uses a variable that has no value here. | Fix the pair in the config. |
| `hook REGISTERED BUT MISSING: <script> (<event>) - hooks.json calls a file that is not there` | fail | Enforcement you believe in is not running. | Restore the file or remove the registration. |
| `no hooks.json at <path> - no hook is registered` | fail | The pointer's `pluginRoot` has no `hooks\hooks.json`. | Start a session so `entry.ps1` refreshes the pointer, or re-install the plugin. |
| `no root settings: neither <root>\.claude\settings.json nor settings.local.json exists` | fail | The kit's deny/ask rules are not installed. | `/design-first:adopt`. |
| `root settings carry 0 deny rules` | warn | The `Read(**/.env)` hygiene rules are absent. | Re-apply the root settings template. |
| `fence hook has not fired in N days - it may be wired but dead` | warn | Older than `enforcement.fenceLogStaleDays`. | Make a deliberate net deletion and confirm a trip lands in the log. |
| `fence log: no trips yet (<path> does not exist)` | info | No trip has been logged. Not an error. | Nothing. |
| `dead config key: <key> - nothing reads it` | warn | A key in `doctor.config.json` has no reader (derived from the pointer, removed in schema 1, or missing from `_readers`). | Delete it from the config. |
| `config not read (<reason>); kit mode runs on defaults` | info | `-Kit` found no `templates\doctor.config.json`. | Nothing. |
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
| `COULD-NOT-LOOK: doctor.config.json: <reason>` | Config missing or not JSON. | Copy `templates\doctor.config.json` into the brain, or fix the JSON. |
| `repository sweep failed` / `unversioned-folder sweep failed` / `tracked-secret scan failed` / `restore-drill log check failed` / `entry-point snapshot check failed` / `enforcement check failed` / `claims run failed` | A whole check threw. The reason follows. | Fix the reason; re-run. |
| `hooks.json could not be parsed` / `settings could not be parsed: <file>` / `fence log could not be read` | A file the Doctor reads is not readable. | Fix the file. |
| `claim <ID> could not be evaluated: <detail>` | One `UNKNOWN` claim. | See the claim's `????` line. |
| `WARNING: state could not be written to <dir>` | Not a band; printed when `state\` is not writable. The verdict stands. | Check permissions on the state folder. |

## Config: `<brain>\doctor.config.json` (SPEC 5.3)

| key | reader | means |
|---|---|---|
| `schema` | doctor.ps1 | Must be 1. Mismatch is the `MIGRATE` claim. |
| `surveyStrict` | report.ps1 | `true`: survey `fail` findings turn the verdict RED. Default `false`. |
| `maxDepth` | repos.ps1 | How deep to look for `.git` under root. |
| `parallelGit` | repos.ps1 | How many repositories the sweep reads at a time. Default 8. Set 1 to read them one after another; the result is the same, only slower. |
| `excludePathParts` | repos.ps1 | Repos whose path contains a part are not swept. |
| `archivedPathParts` | repos.ps1 | Repos whose path contains a part are listed, not judged. |
| `ownerRemotePatterns` | repos.ps1 | A remote URL containing none is FOREIGN. |
| `frozenPaths` | repos.ps1, enforcement.ps1, hooks/guard.ps1 | Do-not-edit trees. Absolute or `${ROOT}`-relative. |
| `tombstonedPaths` | repos.ps1, hooks/guard.ps1 | Retired but load-bearing. Absolute or `${ROOT}`-relative. |
| `unversionedMaxDepth` | repos.ps1 | How deep the no-git-at-all sweep walks. |
| `unversionedIgnorePathParts` | repos.ps1 | Folders deliberately outside git. Add a reason next to each. |
| `secretExceptions` | repos.ps1, hooks/guard.ps1 | Tracked secret files you accept. Absolute or `${ROOT}`-relative. Apply to staging and write rules alike. |
| `acceptedExceptions` | doctor.ps1 | `{ path, kinds[], since, reason }`: reported, not counted. |
| `entryPointSnapshots` | doctor.ps1 | `{ live, snapshot }` pairs, compared after CRLF->LF. |
| `enforcement.fenceLogStaleDays` | enforcement.ps1 | Days before `fence hook has not fired` is printed. |
| `categories.folders` | survey.ps1 | Top-level folders under root that hold projects. A repository under any other first folder is `outside a category folder`. Empty: the check is off. |
| `lawClaim.extraFiles` | tools/vcs/law-claim.ps1 | More repo-relative paths that count as law files for the commit check. |
| `lawClaim.trailer` | tools/vcs/law-claim.ps1 | The waiver line's name. Default `No-Claim`. |
| `lawClaim.minReason` | tools/vcs/law-claim.ps1 | Shortest reason accepted on the waiver line. Default 10 characters. |
| `categories.since` | survey.ps1 | ISO date. A stray born before it (git's first-commit date) is reported; one born on or after it is a fail. Empty: every stray is a fail. |
| `splitLines` | hooks/guard.ps1 | A source write that leaves a file over this many lines asks (DES-03). Default 500; 0 disables. |
| `sourceExtensions` | hooks/guard.ps1, hooks/stop.ps1 | Which extensions count as source. Documents, config and data do not. |
| `stopDocs` | hooks/stop.ps1 | File names that count as documents on the Stop card. A file under `docs/` counts too. |
| `stopFromGit` | hooks/stop.ps1 | Default true: the Stop card reads the turn's changes from git, so a file a command changed is counted. False: the card counts Edit and Write calls only, as before 0.1.15. |
| `forbidScheduling` | hooks/guard.ps1 | Default false. True: guard rule 8 refuses a command that creates a scheduled task, a cron entry, a Run key, a service or a Startup-folder entry. |
| `contentRules` | hooks/guard.ps1 | Default empty. A list of `{ id, under[], except[], exceptParts[], extensions[], pattern, shell, why }`. Guard rule 9 refuses an edit under `under` that adds a match of `pattern`. A rule needs `id`, `pattern` and one `under` path that resolves. |
| `loopBranchPrefix` | hooks/guard.ps1 | Default `harness/`. A repository whose current branch starts with it is on the loop branch: guard rule 11 refuses `git push`, `merge` and `pull` there (AUTO-11), rule 12 refuses edits to the story ledger (AUTO-04). |
| `loopLedgerGlobs` | hooks/guard.ps1 | Default `docs/specs/*.tasks.json`, `specs/*.tasks.json`. Repository-relative globs of the story ledger rule 12 protects on the loop branch. |
| `commitMessage` | tools/vcs/law-claim.ps1 | `{ maxSubject, pastTenseWords[], placeholders[] }`. Defaults 72, a built-in past-tense list, a built-in placeholder list. The commit-msg shim refuses a subject over the limit, a past-tense first word or a bare placeholder (VOICE-05); merges and reverts are exempt. |

Keys that are no longer keys and are reported as dead if present: `root`, `stateDir`, `recordsDir`,
`gitTimeoutSeconds`, `staleStateDays`, `_retiredUnversionedWatchlist`, `enforcement.settingsPath`,
`enforcement.fenceLogPath`. Keys starting with `_` are comments and are ignored.

## Generated output: `<brain>\state\`

Generated, never hand-edited. Byte-identical on a re-run with nothing changed, except `last-run.json`.

| File | Holds |
|---|---|
| `repos.json` | every swept repo: remote, ownership, ahead, dirty, shallow, frozen, last commit; linked worktrees carry `worktree: true` and `parent` |
| `repos.generated.md` | the same as a table, sorted, no timestamp; worktrees are not rows (folded into their parents) |
| `last-run.json` | when it ran, the mode, the verdict, `repoCount`, `worktreeCount` and the band counts; the only file with a timestamp |
| `ratchets.json` | one record per `ratchet` claim id: `value`, `recordedAt`, `acceptedUsed`. Rewritten only when a record moves. Deleting it resets every ratchet to a new baseline, so keep it in git when the brain is a repository. |

All state files are UTF-8 without BOM, LF.

## Prove it still works

```
pwsh -NoProfile -File <pluginRoot>\tools\doctor\selftest.ps1
```

Builds a throwaway pointer, brain, root and kit-like tree under `%TEMP%` with a fake
`USERPROFILE`, plants one true and one false case for every claim type (the span case and the
keyed compare's `requireAll` and missing-collection cases included), a CRLF-vs-LF generated file
that must pass, a stale snapshot, an absent fence log that must be REPORTED and not RED, a schema
mismatch that must say `MIGRATE`, a repo with two linked worktrees whose tracked secret must be
reported exactly once (one of them frozen and dirty, which must still trip), and proves exit codes
0, 1 and 2, the `-Kit` and `-Json` paths and the `Doctor.bat` shim. The config cases
(`selftest-config.ps1`, run by the same command) prove that every key in the reader table has a
default, that a file which sets every key loads, and that a key with no default loads and does not
throw. It never touches your real
folders. About a minute. Run it after any change to the Doctor: a check that cannot fail is worse
than no check.

## The commit check: `tools\vcs\law-claim.ps1` (VCS-23)

A git `commit-msg` hook for a brain that is a repository. A commit that changes a law file must
carry a claim, or a written reason why it needs none.

**Install** (once per clone; `.git\hooks` is not versioned):

```
Copy-Item <pluginRoot>\templates\commit-msg <brain>\.git\hooks\commit-msg
```

The shim finds the kit through the pointer on every commit, so it survives a plugin update. Then
add two claims so the Doctor proves it is there: `path_exists` on `${BRAIN}/.git/hooks/commit-msg`,
and `file_contains` on the same file with the needle `tools\vcs\law-claim.ps1`.

**A law file** is every owning file the brain's `LAW.md` names as `brain:<path>`, plus
`law.overlay.json`, plus `lawClaim.extraFiles`. The list is read from `LAW.md` at commit time.

| You see | Means | Do |
|---|---|---|
| `design-first VCS-23: this commit changes a law file and carries no claim.` | A law file is in the commit, `claims.json` is not, and the message has no waiver. The commit was refused. | Stage the claim in `claims.json`. Or, when the change states no fact about the disk, add a line `No-Claim: <reason>` to the commit message. |
| `The reason given ('...') is shorter than N characters` | The waiver line is there with no real reason. | Say why no claim is needed. |
| `design-first law-claim: no pointer at <path>; VCS-23 was NOT checked` | The shim could not find the kit. The commit went through unchecked. | Start a session so `entry.ps1` writes the pointer, or run `/design-first:adopt`. |
| `design-first law-claim: pwsh is not on PATH; VCS-23 was NOT checked` | PowerShell 7 was not found. The commit went through unchecked. | `winget install Microsoft.PowerShell`. |
| `design-first law-claim: internal error, VCS-23 was NOT checked` | The script failed. The commit went through, and an ERROR line is in the hooks log. | Read the log line; report it. |
| nothing, and a law commit went through | The shim is not installed in this clone, or the commit used `--no-verify`. | Install it. The two Doctor claims catch a missing shim. |

Limits: the check sees that `claims.json` changed, not that the claim covers the new fact; a
waiver's reason is read by a person; a merge is not checked; `--no-verify` skips every commit hook.

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
- It reports what is true now. It does not know what you intended.

## Anchors and grades

A script anchor is a comment line `# anchor: <name>  mode: <deny|advise|gate>  verbs: <a,b>`. The law generator derives a clause's grade from the anchor it cites: `mode: deny` in a hook prints HOOK, `mode: advise` prints ADVISE, and `mode: gate` in a tool prints GATE. The Doctor carries one tool anchor, `could-not-look`, on the line that decides the COULD-NOT-LOOK verdict: a Doctor that could not look never reports green, and the clauses that say so cite that line.
