# design-first — ARCHITECTURE

## System at a glance

A Claude Code plugin whose hooks guard the session, whose `adopt` command sets up an adopter's
private brain from an interview, and whose two tools (Doctor, law generator) keep the written law
honest about what is actually enforced on the disk.

## Core flow

```
law.json (+ <brain>/law.overlay.json) --> tools/law/build-law.ps1 --> LAW.md (kit) / <brain>/LAW.md
                                                    ^
claims.json ------------> tools/doctor/doctor.ps1 --+-- claims | survey | could-not-look --> <brain>/state/
hooks/hooks.json --------> guard.ps1 / fence.ps1 / agent.ps1 --> allow | deny | ask | rewrite | advise, + log
                           route.ps1 / subagent.ps1 / entry.ps1 --> LAW.md rows by group, per session, into context
commands/adopt.md -------> tools/adopt.ps1 --> <root>/CLAUDE.md, <root>/.claude/settings*.json,
                                               <brain>/*, %USERPROFILE%\.claude\design-first.json
```

Everything resolves through the pointer file: `root` (where sessions start), `brain` (the
adopter's private layer), `pluginRoot` and its kind (checkout or cache).

## Domains

| domain | purpose | entry point | config | notes |
|---|---|---|---|---|
| `.claude-plugin/` | manifest, marketplace | `plugin.json` | — | the repo root is the plugin and its own marketplace |
| `hooks/` | session guards | `hooks.json` | `<brain>/doctor.config.json`, `<brain>/agent-policy.json` | `lib/` holds the tokeniser, rules and shared helpers; anchors declare mode and verbs; `agent.ps1` rewrites an Agent call's model from the policy and counts spawns per turn in the marker folder; `route.ps1` keeps a per-session route file there and `lib/law-rows.ps1` reads LAW.md for both routers |
| `tools/law/` | generator | `build-law.ps1` | `law.json` | `validate.ps1`, `render.ps1` dot-sourced; deterministic bytes |
| `tools/doctor/` | disk checker | `doctor.ps1` | brain config + `claims.json` | `context`, `claims`, `claims-keyed`, `claims-tree`, `claims-exec`, `claims-ratchet`, `repos`, `enforcement`, `survey`, `report`, `selftest`; a claim is read-only, so a ratchet's record is written by `doctor.ps1` after the run, into `state/ratchets.json` |
| `tools/vcs/` | git-side checks | `law-claim.ps1` | `<brain>/doctor.config.json` (`lawClaim`) | run by the shim `templates/commit-msg`, copied to `<brain>/.git/hooks/commit-msg`; the shim finds the kit through the pointer on every commit |
| `tools/tests/` | hook self-test | `run.ps1` | `guard-cases.json` | temp repos and a fake pointer; never touches the real one |
| `commands/` | adopt, remove, gut, move, scope, ship | one `.md` each | — | prompts ask; scripts write |
| `tools/adopt.ps1`, `tools/remove.ps1` | the writers | — | `templates/` | record every write in `<brain>/state/installed.json` |
| `agents/` | read-only reviewer | `reviewer.md` | — | |
| `templates/` | root and brain files | — | — | copied or filled by `adopt.ps1`, never edited in place |
| `instructions/`, `workflows/`, `lessons/` | the rule text | `LAW.md` | — | one subject per file; every clause has a `### ID` heading in its owner |

## Key design decisions

- **Config mutability:** all tunables live in the brain, never in the plugin, so a plugin update
  never touches an adopter's settings.
- **Fail-loud, not fail-closed:** a hook that errors allows the action, logs it, and surfaces it on
  both channels. A broken hook that blocks everything gets switched off; a logged one gets fixed.
- **Grades are mechanical:** the generator derives them from the mechanism's declared mode and
  verbs. A missing mechanism prints HONOUR.
- **Two LAW outputs:** the kit's with kit grades; the brain's with kit + overlay, re-derived from
  what is installed on that machine.
- **Storage:** JSON for config and claims, Markdown for rules, flat logs with ISO timestamps for
  hooks; the Doctor reads logs by time window, never the whole file.

## How to modify a domain

Read `DECISIONS.md`. Read this page. Open only that domain. Change config before logic. Run
`tools/tests/run.ps1` and `tools/doctor/selftest.ps1`. Run `tools/doctor/doctor.ps1 -Kit`.
Update the manifest.
