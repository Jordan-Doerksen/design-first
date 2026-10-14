# {{OWNER_NAME}}'s brain — DECISIONS

| | |
|---|---|
| Project | the brain: the private layer of design-first for {{OWNER_NAME}} |
| Started | {{DATE}} |
| Last Updated | {{DATE}} |
| Status | adopted; the entry path, the Doctor and the hooks run from here |

This is the brain's own manifest. The kit (`design-first`) is a plugin and does not change when
this file changes; the brain holds everything about its owner. Written by `/design-first:adopt`;
edit it from here on, and add a Change Log row for every decision that changes.

## Core Goal

One private folder that makes the written law honest: who the owner is, how they want to be
spoken to, their own prohibitions, the claims the Doctor checks against the disk, and the lessons
that became rules.

## Non-Negotiable Constraints

- Nothing in this folder ships with the kit. It is the owner's, and it stays on this machine and in
  the owner's own remote.
- `LAW.md` here is generated from the kit's `law.json`, `law.overlay.json` and the installed state;
  a hand edit is a RED Doctor run.
- A fact about the disk is a claim in `claims.json`, never a sentence here.

## Decisions

**1.1 Root and brain.** Root `{{ROOT}}`; brain `{{BRAIN}}`. The pointer in the user profile names
both. **Change Rule:** moving either is `/design-first:remove`, then `/design-first:adopt` again.

**1.2 The overlay.** `law.overlay.json` adds the owner's own clauses and may re-grade a kit clause
against a mechanism installed here. Every clause it adds has one owning file under
`instructions/` with a `### ID` heading. **Change Rule:** a new clause is a Change Log row.

**1.3 The Doctor's reach.** `doctor.config.json` names the frozen and tombstoned paths, the owner's
remotes and the category folders. Those lists are the machine-readable half of `canonical.md`.
**Change Rule:** a path enters or leaves a list with a row here that says why.

## Change Log

| Date | Change | Reason | Files |
|---|---|---|---|
| {{DATE}} | Adopted. The kit wrote this folder from its templates and the interview answers. | first install | all |
