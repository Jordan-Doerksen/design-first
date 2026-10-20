# {{DOMAIN_UPPER}}-CONTROL: {{DOMAIN}} Master Control

Owner's rule (the control regime): one session controls every session that touches {{DOMAIN}}
work, so the owner does not jump between chats. That session is "{{DOMAIN}} Master Control"
(id `{{SESSION_ID}}`; sidebar section {{DOMAIN}}). Items reach it from Intake (`{{INTAKE_CARD}}`)
as numbered prompts that end with a report-back line; the master answers each with one line, done
or blocked.

The domain: {{FOLDERS}}. The test: {{TEST}}.

This card is a brain file with a history. It lives at `{{CARD_PATH}}`, with every other control
card under `{{CONTROL_DIR}}`, never at a repository root and never outside every repository; a card
that sat elsewhere leaves a one-line pointer at its old path. Updated by the master only; committed
by the owner, never by a session (SAFE-06). No secret in it (SAFE-01). Written by
`/design-first:control` on {{DATE}}.

## How it works

- The master starts every {{DOMAIN}} session. A session the master starts reports back to it when
  its turn ends (the app does this). A session the owner started elsewhere is asked once to report
  by message; it may not.
- A session that writes gets its own branch, and its own worktree where the host gives one. Two
  writers never touch the same files. A session that only reads may share the checkout.
- Every brief names: goal, files or area, done-check, ruled out, and the report format below
  (DES-11; the agent hook refuses a subagent brief without the headings).
- Report format, four lines: repo and branch; files changed or posts made; needs from the owner;
  blocked on.
- The go-word for a push, a post or a merge is said in the session that does it; a relayed approval
  does not post. Work sessions draft and report; the master acts on the owner's word.
- Before any merge, push to a shared branch or post is asked of the owner, the master runs the
  plumbing checks.
- Nothing runs on a timer or at login; the owner starts every session. No secret in a tracked file
  (SAFE-01). A dirty tree is never tidied by a session (SAFE-06).
- Sidebar: one section per domain. The app cannot start a session inside a section, so the master
  files every session it starts under the {{DOMAIN}} section right after the start, and asks a
  session started elsewhere in this domain to be filed too. The master itself is pinned and filed
  there. A nested session moves with its parent, so a family started from one chat files as one
  block; a master is started from a fresh chat, never from another domain's session.

## Plumbing checks (the master runs these, by hand, before saying "done")

| Check | Command | Pass | Last run |
|---|---|---|---|
{{PLUMBING_ROWS}}

## Roster, {{DATE}}

| Session | Repo, branch | State | Next |
|---|---|---|---|
| {{DOMAIN}} Master Control (this) | | controls | |

Spend: the app reports a session's context size, not its total spend. A total per chunk is not
measured.

## Ladder

| Chunk | State | Proof |
|---|---|---|

## Open for the owner
