# design-first — ARCHITECTURE

## System at a glance

A Claude Code plugin whose hooks guard the session, whose commands set up and remove an adopter's
private brain, and whose two tools (Doctor, law generator) keep the written law honest about what
is actually enforced on the disk.

## Core flow

```
law.json (+ brain overlay) -> build-law.ps1 -> LAW.md
                                     ^
claims.json ----------> doctor.ps1 --+-- compares LAW.md, checks disk facts, smokes hooks -> state/
hooks.json ----> guard.ps1 / fence.ps1 / entry.ps1 -> allow | deny | advise, + log
commands/adopt.md -> adopt.ps1 -> <root>/CLAUDE.md, <root>/.claude/settings.json, <brain>/*, pointer
```

## Domains

| Domain | Purpose | Entry point | Config | Notes |
|---|---|---|---|---|
| `.claude-plugin/` | manifest and marketplace | `plugin.json` | — | repo root is the plugin |
| `hooks/` | session guards | `hooks.json` | brain `doctor.config.json` via the pointer | PowerShell 7 only |
| `commands/` | adopt, remove, gut, move, scope, ship | one `.md` each | — | prompts; scripts do the writes |
| `agents/` | read-only reviewer | `reviewer.md` | — | |
| `tools/law/` | generator | `build-law.ps1` | `law.json` | deterministic bytes |
| `tools/doctor/` | disk checker | `doctor.ps1` | brain config + `claims.json` | three bands |
| `tools/tests/` | self-tests | `run.ps1` | fixtures in temp | under pwsh |
| `templates/` | root and brain files | — | — | written by `adopt.ps1` |
| `instructions/`, `workflows/` | the law text | `LAW.md` index | — | one subject, one file |

## How to modify a domain

Read `DECISIONS.md`. Read this page. Open only that domain. Change config before logic. Run
`tools/tests/run.ps1`. Run the Doctor. Update the manifest.
