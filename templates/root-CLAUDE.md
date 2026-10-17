# CLAUDE.md - `{{ROOT}}`

Entry point for every session that starts under this folder. Written once by `design-first` (`/design-first:adopt`); yours to edit after that.

## 1. Who you are talking to

{{OWNER_NAME}}. Speak to them directly. Their personal layer is in the brain: `{{BRAIN}}/me.md` (who), `voice.md` (how their copy reads), `prohibitions.md` (their own hard rules).

## 2. Read this first

The brain's `entry.json` lists the files to read before the first build or edit task, in order: `{{BRAIN}}/entry.json`. The `entry.mjs` hook prints that list on session start when the session is under this root; a file it cannot find prints as `MISSING:`. Read what it lists and say which you read.

The law is `{{BRAIN}}/LAW.md`. Every rule has an id, an owning file and an enforcement grade that says whether a machine stops you breaking it. Cite the id, never a line number. The file is generated; do not edit it by hand.

## 3. Prohibitions

In full, on purpose. Nothing that stops damage lives behind a pointer.

{{PROHIBITIONS}}

The owner's own prohibitions, if any, are in `{{BRAIN}}/prohibitions.md` and carry their own ids.

## 4. The Doctor

The Doctor re-derives facts about this disk instead of trusting prose: every claim in `{{BRAIN}}/claims.json`, the repositories under this root, the hooks and permission rules that are wired. Run it when something looks wrong and before calling a change done.

- On Windows double-click `{{BRAIN}}/Doctor.bat`; on Linux or macOS run `{{BRAIN}}/doctor.sh`. Or run `node <pluginRoot>/tools/doctor/doctor.mjs` (the plugin root is in `~/.claude/design-first.json`).
- Exit `0` GREEN. Exit `1` RED: a claim is false. Exit `2` COULD-NOT-LOOK: something could not be checked, and that is not a pass.
- SURVEY findings (no remote, foreign remote, shallow clone, unpushed commits) are reported and do not change the exit code unless `surveyStrict` is on in `doctor.config.json`.
- Nothing runs it for you. No scheduled task, no login entry, no timer.

Every finding is explained in the kit's `tools/MANUAL.md`.

## 5. How work runs

Design first: interview, then `DECISIONS.md`, then `ARCHITECTURE.md`, then build in chunks, then cross-check. Interview every addition, one question at a time, multiple choice, recommended default first. More than one file means more than one agent, started in one message. Documents are co-equal artifacts: update them before calling anything done. The method files are in the kit under `instructions\` and `workflows\`; the entry path above points at them.

## 6. The kit

Installed as the `design-first` plugin. Reinstall on a new machine:

```
claude plugin marketplace add {{MARKETPLACE_SOURCE}}
claude plugin install design-first@design-first
/design-first:adopt
```

`/design-first:remove` reverses what adopt wrote and leaves everything you edited.
