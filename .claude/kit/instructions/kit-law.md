# Kit law: a repository runs the kit it carries, proves it loaded, and registers it from one place

This file owns `KIT-01`, `KIT-02` and `KIT-03`. It is about the kit's own plumbing: how a
repository gets its copy of the hooks and tools (the vendored tree under `.claude/kit/`), how a
session proves those hooks are loaded before it edits anything (the arming line and the selfcheck
probe), and where a hook registration is typed (the registry), so that every rendered settings
file says the same thing. It does not restate what each hook refuses (the hook's own file and its
owning law file do that), and it does not restate the Doctor's claim types (`tools/MANUAL.md`).

**The one idea:** a hook that did not load is silent, and silence looks like a pass. Three facts
about the plumbing can be checked by a machine: the bytes under `.claude/kit/` are the bytes its
`VERSION` names, a loaded guard refuses one known command with the kit's version in its reason,
and every registration comes out of one registry file. Each fact has a mechanism with an anchor
line in its script, and the grade of each clause comes from that anchor's mode, never from a word
typed here.

---

## The vendored tree

`tools/vendor.mjs` copies the manifest `tools/vendor.json` (the hooks and their libraries with
the registry `hooks/registry.json`, never the rendered `hooks/hooks.json`; `law.json`, `LAW.md`
and every file the law cites: its owning files under `instructions/`, `workflows/` and `lessons/`,
the policy and permission templates, the vendor and settings tools; the Doctor, the law generator,
the tool libraries, and the optional tools such as the selfcheck probe) into `<repo>/.claude/kit/`
and writes `.claude/kit/VERSION`: the kit's
version, a sha over the copied files computed on the copy itself, the sorted file list and the
time of the last change. A second run with nothing changed writes nothing. The copy must carry
`law.json` and both policy templates: `hooks/agent.mjs` allows every call when it finds no policy,
and a copy without `law.json` is not taken as a kit root at all, so a short copy fails open. The
tool refuses to vendor a manifest entry that does not exist, before it writes anything.

`node tools/vendor.mjs -Target <repo> -Check` reads `VERSION`, recomputes the sha over the listed
files and exits 1 on a difference, naming the files whose time is newer than `VERSION` (none when
more than half of them are, as when a git checkout or a copy wrote them after `VERSION`); a
listed file that is gone is exit 1 by name; a missing or unreadable `VERSION` is exit 2, never 0,
and so is one that lists no file (the sha of nothing matches any tree). The
in-repo twin is the Doctor claim type `tree_sha` (`tools/doctor/claims-tree.mjs`), which reads the
same `VERSION`, recomputes the same sha and goes RED on the same difference; a claims file that
carries one checks the tree on every Doctor run.

## The arming proof

`hooks/entry.mjs` prints `kit: armed <version> <sha>` as its first plain line at every session
start, from the kit root it resolved; with no kit root it prints `kit: unarmed MISSING: kit`, and
for a kit root whose version cannot be read (a `VERSION` that is not its shape, no `VERSION` and no
`plugin.json` with its manifest, a missing module) `kit: unarmed ERROR: ...` with an ERROR line in
the hooks log, never nothing.
A vendored copy's sha is recomputed over the files its `VERSION` lists: when they are not those
bytes the line reads `kit: armed <version> <sha> DIFFERS: the tree is not the bytes VERSION names`,
and a `VERSION` that lists no file reads `... DIFFERS: VERSION names no file; nothing to prove`,
each with a WARN line in the hooks log and the check to run (`node .claude/kit/tools/vendor.mjs
-Target <repo> -Check` when the root is `<repo>/.claude/kit`; any other root is named with its
`VERSION` instead, `kit root <root>, its VERSION <root>/VERSION`). The line says a hook ran; it does
not say which copy decides a call.

The proof that the guard decides is the selfcheck. A session's brief runs
`node .claude/kit/tools/selfcheck.mjs` first. Guard rule 15 (`hooks/guard.mjs`, the anchor
`selfcheck-armed` in `hooks/lib/guard-owner-rules.mjs`) refuses a Bash or PowerShell command
whose command word is `node` and whose next word is `selfcheck.mjs` by any path, with the title
`ARMED` and the reason `ARMED <version> <sha>` of the running kit (`ARMED unknown unknown` when
the kit's version cannot be read; the refusal still proves the guard). The refusal reaches the
model and the script never starts. When no guard saw the call, `tools/selfcheck.mjs` runs, prints
`UNARMED: no guard saw this call` and exits 2 (its own anchor, `selfcheck`, mode gate, marks that
exit), and the brief says stop. The proof is a hook decision: a model can touch a marker file, it
cannot produce one.

## The registry

`hooks/registry.json` holds one row per hook registration: `id`, `event`, `matcher`, `script`,
`timeout`, `host` (`any`, `pc`, `cloud`), `mode` and `vendor`. `tools/settings.mjs` is the only
writer of the files that carry a registration: `-Plugin` renders `hooks/hooks.json` with
`${CLAUDE_PLUGIN_ROOT}` paths, `-Vendored` renders a repository's `.claude/settings.json` with
`${CLAUDE_PROJECT_DIR}/.claude/kit` paths, `-Host` keeps the rows for one host, `-Set` adds the
permissions block of one set, and a deep merge keeps a repository's own `permissions`. `-Check`
compares a render with the file on disk byte for byte and exits 1 on a difference. A vendored
render that still names `CLAUDE_PLUGIN_ROOT` is refused: the variable is unset in a cloud
container, so no hook would load.

The Doctor claim `KIT-REG-01` (`generated_matches`, in `tools/doctor/claims.json`) renders the
registry through `settings.mjs` and compares the result with the committed `hooks/hooks.json`: a
hand edit to `hooks.json`, or a registry change with no re-render, is a RED kit run. The renderer's
default form is `-Plugin`, because the Doctor's generator runner passes `-Source`, `-Out` and,
with a brain, `-BrainRoot`, and no form flag. `KIT-SETTINGS-01` holds the kit's own
`.claude/settings.json` the same way: it renders the registry with `-Vendored -Set cloud-brain` (the
claim's `args`) and compares the result with the committed file.

## Limits, written down

- `vendor.mjs -Check` and `tree_sha` see the listed files only. A file in `.claude/kit/` that the
  manifest does not name is not in the sha, is not reported, and nothing in the kit removes it.
- A listed file edited and then given an older time is still exit 1, but unnamed.
- In a clone, git writes most listed files after `VERSION`, and a copy may, so their times single
  out nothing: an edit there is still exit 1, but unnamed when more than half of the listed files
  are newer than `VERSION`.
- Rule 15 reads the command word and the one after it. A selfcheck run through a nested shell
  (`bash -c "..."`, `pwsh -c "..."`, `cmd /c "..."`), through another runner, with a node option
  before the script, or from a script on disk is not seen: the probe then runs and prints
  `UNARMED` while the guard is loaded, which is the safe side, a stop and never a false go.
- On a PC, a vendored hook yields to the plugin when the pointer file names a plugin root that
  holds `law.json` (the yield rule in `hooks/lib/common.mjs`). A stale pointer after the plugin is
  gone makes every vendored hook yield to nobody; the missing arming line and the probe's
  `UNARMED` are the only signs.
- `settings.mjs` renders the files it is pointed at. A registration typed into a user-level
  settings file, or into a `settings.local.json` nobody names as `-Out`, is not rendered and not
  compared; `KIT-REG-01` reads the kit's own `hooks/hooks.json` and `KIT-SETTINGS-01` its own
  `.claude/settings.json`, and nothing else.

---

## Clause headings

One `### ID` heading per clause this file owns, so the law generator can check that each rule is
stated in one file (`PRIN-05`).

### KIT-01

**A repository runs only the kit it carries: the vendored tree is the bytes its VERSION names.**

GATE by `tools/vendor.mjs#vendor-sha`: `-Check` recomputes the sha over the files `VERSION` lists
and exits 1 on a difference or a missing file, 2 with no `VERSION` or one that lists no file. The
Doctor's `tree_sha` claim type reads the same file on every run of a claims file that carries one.
Neither sees a file the manifest does not name.

### KIT-02

**A session proves its hooks loaded before it edits: the arming line at start, the guard's ARMED
refusal of the selfcheck command.**

HOOK by `hooks/guard.mjs#selfcheck-armed` (rule 15, in `hooks/lib/guard-owner-rules.mjs`): the
command `node <path>/selfcheck.mjs` is refused with the reason `ARMED <version> <sha>`. The arming
line from `hooks/entry.mjs` and the `UNARMED` exit of `tools/selfcheck.mjs` (anchor `selfcheck`,
mode gate) are the two sides of the same proof; the clause is graded on the refusal, because a
refusal is the one thing a model cannot forge. The nested-shell forms above are the residual.

### KIT-03

**Every hook registration is rendered from one registry; a hand-edited registration is RED.**

GATE by `tools/settings.mjs#settings-registry`: the renderer takes its registrations from
`hooks/registry.json` and nowhere else, refuses a row that is short a field, an unknown event, a
script that does not exist or a vendored render that names `CLAUDE_PLUGIN_ROOT`, and `-Check`
exits 1 on a file that differs from the render. `KIT-REG-01` runs that render on every kit Doctor
run against the committed `hooks/hooks.json`, and `KIT-SETTINGS-01` the vendored render with the
`cloud-brain` set against the kit's own `.claude/settings.json`. A registration typed somewhere the
renderer is never pointed at is the residual.
