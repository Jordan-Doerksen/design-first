# Starting a new project — idea → repository

This file owns no clause. It is the order of operations for a new project, each step pointing at
the clause that governs it.

1. **Interview first** (`DES-01`, `OWN-04`). One question at a time; lock the foundational
   decisions before any folder exists.
2. **For a tool whose wrong output costs money, safety or trust, run the gate before step 3**
   (`GATE-08`): `SPEC.md` + `DECISIONS.md`, gap-reviewed and cleared (`GATE-09`), before the
   repository exists.
3. **One standalone repository**: its own folder, its own git, a remote you own (`VCS-01`), the
   line-ending attributes file in the first commit (`DES-09`). Never a copy inside another project.
4. **The document set** (`DES-07`): `DECISIONS.md`, `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md`,
   `CHANGELOG.md`. They are part of the product.
5. **Secrets in an ignored secrets file** (`SAFE-01`), with a committed `.env.example` naming the
   keys without the values.
6. **A LICENSE** if the work is free and open.
7. **Logging and a bug plan from chunk one** (`OBS-01`, `OBS-08`; for a game, `OBS-09`).
8. **Match an installed skill before building from nothing** (`DES-12`).
9. **Build the smallest slice inside the design** (`DES-05`), split by domain (`DES-03`), config in
   `.json` (`DES-04`).
10. **Record the stack in the map before the first chunk** (`STACK-01`): a `## Stack` section in
    `ARCHITECTURE.md`, one row per runtime with its version pin, its lockfile and its install verb,
    taken from the brain's default table for this kind of project (`STACK-03`). A departure from
    the table is a decision in the manifest with its reason. The pin files are in the first commit
    (`STACK-02`), and the install verb is the locked one (`DES-10`).

Then `workflows/coding.md` for how the build runs.
