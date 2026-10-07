# Prohibitions - {{OWNER_NAME}}'s own

The kit's prohibitions (the `SAFE-*` clauses) are in `LAW.md` and in full in the root `CLAUDE.md`. This file holds the owner's additions: hard rules that apply on this machine and nowhere else.

Each one is also a clause in `law.overlay.json` so it gets an id, a grade and a place in the generated `LAW.md`. The clause carries one sentence with no values; this file carries the full text, the numbers and the reasons. Use a new id in the `SAFE` group that the kit does not use (`SAFE-10` upward is free), with `"owner": "brain:prohibitions.md"`.

Grades you can give an overlay clause honestly: `OWNER` (a standing ruling, no mechanism) or `HONOUR` (a request). A grade above that needs a mechanism in the brain or the kit, and the generator refuses the file otherwise.

## SAFE-10 (example - replace or delete)

**Rule.** (One sentence. What must never happen.)

**Why.** (The cost already paid, in one or two lines.)

**What a machine does about it.** Nothing yet; grade `OWNER`. (Or: the frozen path in `doctor.config.json` that the guard denies.)
