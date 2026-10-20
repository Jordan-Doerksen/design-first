# Development stack law — what runs a project, written where the Doctor reads it

This file owns `STACK-01`, `STACK-02` and `STACK-03`. It is about the runtime a repository needs:
which one, which version, how the version and the dependencies are pinned, and how they are
installed. It does not restate `DES-10` (`workflows/coding.md`), which owns the install verb;
`STACK-02` owns the pin file. Neither restates the other.

**The one idea:** a session that starts a repository picks its runtime by habit, and a habit has no
id, no owning file and no grade. The architecture map names every domain, its entry point and its
config, and before this group it never named the runtime; a reader assembled the stack from the
layout. This group puts the stack on the one page every session reads (`PRIN-01`), and the pins in
files the Doctor can read (`PRIN-03`).

---

## The Stack section

Every `ARCHITECTURE.md` carries a `## Stack` section, after System at a glance and before Domains,
with one table:

```
## Stack

| runtime | version | pinned by | lockfile | install | why |
|---|---|---|---|---|---|
| Node.js | 22.x | .node-version | package-lock.json | npm ci | the UI build |
| Rust | stable | rust-toolchain.toml | Cargo.lock | cargo build --locked | the desktop shell |
```

One runtime per row. A runtime the table does not name is a Change Request (`GATE-06`), not an
install. A build-only tool (a compiler on PATH, a game editor) gets a row with `none` in the
lockfile column. A page served from the file system with no build writes one row:
`| none | — | — | — | — | file:// page, no build |`. The section exists even when the stack is
nothing, because absent is not zero (`SAFE-04`).

The section is the record. It is read by a session when it opens the repository, by the
`new-project` workflow before the first chunk, and by the Doctor, which checks that it exists. The
Doctor does not compare its rows with the pin files; a row that names the wrong version is prose,
and that limit is written below.

## Pins per runtime

The pin file, the lockfile and the fail-on-drift verb for each runtime, from one official page per
row (npm `npm ci`; uv `sync`; cargo `build`; the Godot project settings page; the Tauri 2
configuration files page; the PowerShell `about_Requires` page; the mise `mise.lock` page).

| runtime | version pin | lockfile | fail-on-drift verb |
|---|---|---|---|
| Node.js + npm | `.node-version` (fnm) or `.nvmrc` (nvm). `engines` in `package.json` is advisory unless `engine-strict` is set, so it is not a pin. `packageManager` pins npm itself, read by Corepack. | `package-lock.json` | `npm ci`: errors when the lock and `package.json` disagree; never writes either |
| Python + uv | `.python-version`; `requires-python` in `pyproject.toml` is a range | `uv.lock`, committed | `uv sync --locked`: errors when the lock is missing or stale. `--frozen` skips the check and does not catch drift. |
| Rust + cargo | `rust-toolchain.toml`, `[toolchain] channel`, read by rustup; the closest file wins | `Cargo.lock` | `cargo build --locked`; `cargo install --locked` is opt-in and otherwise ignores the lock |
| Godot 4 | none documented. `project.godot` is INI text; `addons/*/plugin.cfg` carries the plugin's own version and no engine constraint | none | none; there is no package manager |
| Tauri 2 | `src-tauri/Cargo.toml` pins `tauri` and `tauri-build` (exact, with `=`); `package.json` pins `@tauri-apps/cli` and `@tauri-apps/api` on the same minor. `version` in `tauri.conf.json` is the app's own. | `src-tauri/Cargo.lock` and the root `package-lock.json` | `cargo build --locked` in `src-tauri`; the CLI errors on a Tauri version mismatch unless told to ignore it |
| PowerShell 7 | `#Requires -Version 7.0` in the script, checked before it runs; `#Requires -PSEdition Core` also exists | none | none |
| mise, cross-runtime | `mise.toml` `[tools]`; reads `.tool-versions`, `.nvmrc` and `.python-version` once enabled per tool | `mise.lock` | `mise install --locked`: fails rather than resolves when no lock entry matches |

Two things this table settled: `engines` is not the Node pin, so the Node claim requires
`.node-version` or `.nvmrc`; Godot has no pin file, so the Stack section's version column is its
record and no claim reads it. A repository with two runtimes (a Tauri app) may add `mise.toml` and
`mise.lock` as one cross-runtime pin; the claims do not require it.

## The claims

No new claim type. `tree_each` selects a repository by its marker files (`where`), requires files
or a pattern (`require`), and ratchets by the first-commit date (`since`): a repository born before
`since` is reported, never failed; one born after it with a gap is RED. The four scan claims ship
in `templates/claims.json`, with `since` as a placeholder the adopter sets to the adopt date.

| claim | where | requires | carries |
|---|---|---|---|
| `KIT-STACK-01` | the kit's own `ARCHITECTURE.md` | contains `## Stack` | `STACK-01`, on this kit |
| `SCAN-STACK-01` | `ARCHITECTURE.md` | `ARCHITECTURE.md` contains `## Stack` | `STACK-01`, on an adopter's repositories |
| `SCAN-STACK-02` | `package.json` | `package-lock.json`, `pnpm-lock.yaml` or `yarn.lock`; `.node-version` or `.nvmrc` | `STACK-02` (Node.js) |
| `SCAN-STACK-03` | `pyproject.toml` | `uv.lock` or `poetry.lock`; `.python-version` | `STACK-02` (Python) |
| `SCAN-STACK-04` | `Cargo.toml` or `src-tauri/Cargo.toml` | `rust-toolchain.toml` and `Cargo.lock`, at the root or under `src-tauri/` | `STACK-02` (Rust) |

A clause names one claim. `STACK-02` names `SCAN-STACK-02`; `SCAN-STACK-03` and `SCAN-STACK-04` are
the same rule's instruments for the other two runtimes, listed here because the record has one
`ref` field. Godot and a `file://` page get no pin claim: the first has no documented pin file, the
second has nothing to pin. In the kit `STACK-02` is BUILDABLE: the kit itself pins nothing (no
packages, no lockfile), so the kit cannot prove the rule on its own tree, and the mechanism is the
shipped claims above. A brain that carries them re-declares `STACK-02` as GATE on `SCAN-STACK-02`
in its overlay.

## Limits, written down

- A pin file that exists and is stale (a version range nobody honours, a lockfile the resolve-fresh
  verb rewrote) passes the claim. The claim sees presence, not truth; `DES-10`'s ask rule on the
  verb is the other half.
- A runtime with no root marker (a Python script with no `pyproject.toml`, a map scripting file)
  is invisible to the claims and relies on the section alone.
- A Stack section that names the wrong version is prose; nothing compares it with the pin file. A
  `generated_matches` claim per repository could, and is not in this group.
- The default table (`STACK-03`) is the brain's and changes; the clause names the table, not the
  values, so a change to the table is a brain edit, never a law change.

---

## Clause headings

One `### ID` heading per clause this file owns, so the law generator can check that each rule is
stated in one file (`PRIN-05`).

### STACK-01

**Every repository's architecture map carries a Stack section that names each runtime it needs,
its version pin, its lockfile and its install verb; a runtime the section does not name is a Change
Request.**

The section's shape is above. GATE: the kit's own map is checked by `KIT-STACK-01` on every kit
Doctor run, and an adopter's repositories by `SCAN-STACK-01` from the shipped claims, with the
first-commit ratchet. The claim sees the heading, not the rows.

### STACK-02

**A runtime's version pin and its lockfile are files at the repository root that the Doctor reads,
never a line in prose.**

The files per runtime are in the pin table above; the install verb that reads them is `DES-10`'s.
BUILDABLE in the kit, because the kit's tree has nothing to pin; the shipped claims
`SCAN-STACK-02`, `SCAN-STACK-03` and `SCAN-STACK-04` are the mechanism, and a brain that runs them
re-declares the clause GATE. A pin under `src-tauri/` counts as at the root for the Rust half of a
Tauri app.

### STACK-03

**A new repository takes its stack from the brain's default table for its kind, and a departure is
a decision in the manifest with its reason.**

The table lives in the brain, in the file its overlay names as the owner of the brain's own stack
clauses; the kit ships no default, because a default stack is the owner's taste and the kit is
method only. A brain with no table yet writes it in the first new repository's interview, one row
per kind of project. ADVISE by `hooks/subagent.mjs#advise-by-role`: every subagent that builds is
told the Reviewer names this clause, and the Reviewer names it as holding or as a finding with a
place. The `new-project` workflow reads the table before the first chunk.
