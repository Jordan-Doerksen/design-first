# design-first

A working method for building software with coding agents, packaged as a Claude Code plugin.

Status: chunk 1 of 11. Not installable yet.

## What it is

- Interview before code. Decisions locked in a manifest before a subsystem is built.
- Every rule has an id, one owning file, and an enforcement grade that says whether a machine
  will stop you breaking it. Most rules are HONOUR. The index says so.
- A Doctor that checks facts about the disk instead of trusting prose. A fact in a document is
  generated, never typed.
- Two guard hooks and a session-start hook, with their limits written down.
- An onboarding command that writes your own private layer from an interview. Nothing about the
  author ships.

## Limits, stated up front

- Windows and PowerShell 7 only in this version.
- One adopter per Windows user profile.
- The guard inspects tool calls. It does not inspect scripts the agent writes, nested shells, or
  command substitutions. The owning file lists the residual.
- The kit ships zero DENY-grade clauses. Hooks grade HOOK or ADVISE; permission rules grade GATE.

## Install

Not yet. The three commands will be documented here when chunk 7 lands.

## License

MIT. Author: Jordan-Doerksen.
