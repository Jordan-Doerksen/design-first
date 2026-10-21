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

The card is read by Intake and by a fresh session, so it stays short: about 30,000 characters at most. The
"Now" block comes first; every open item is one row, its state and its next step; spawn-ready briefs that have not
started stay on the card. Closed items, histories, done briefs and old log lines move word for word to
`{{DOMAIN_UPPER}}-ARCHIVE.md` beside this card: copy first, then cut, never delete.

## Now

At most 15 lines, rewritten whenever the state changes:
- Running: each session's id, its chunk and its branch, or "none".
- Waits on the owner: any question word for word, with its options, or "nothing".
- Next move: the one recommended next move and its reason.
- Ready briefs: the headings of spawn-ready briefs that have not started, or "none".
- Last verified: each repository's last verified commit, equal to its origin.
- Release batch: the number of changes waiting for a release, or "none".

## Open items (state; next)

| # | Item | State | Next |
|---|---|---|---|

## How it works

- The master starts every {{DOMAIN}} session. A session the master starts reports back to it when
  its turn ends (the app does this). A session the owner started elsewhere is asked once to report
  by message; it may not.
- A session that writes gets its own branch, and its own worktree where the host gives one. Two
  writers never touch the same files. A session that only reads may share the checkout.
- Every brief names: goal, files or area, done-check, ruled out, and what it reports to in the
  format below, on a `Reports to:` line (DES-11, CTRL-02; the agent hook refuses a subagent brief
  or a session brief without the headings).
- A brief may also carry a `Voice:` line, which is documented and not required. Template text:
  `Voice: terse, for your master, not the owner; no hype, no recap prose.` A work session answers its
  master, not the owner (owner ruling 29, 2026-10-20), and the router leaves the policy's `writerSkip`
  law out of a session whose first prompt has `Reports to:` at the start of a line.
- A brief may also carry a report rule (owner ruling 32, 2026-10-20). Template text:
  `Report rule: message only for done, blocked, or a question for the owner; no progress, acknowledgement or state lines.`
  The master holds this rule toward Intake too: no progress or acknowledgement line goes up.
- Report format, four lines: repo and branch; files changed or posts made; needs from the owner;
  blocked on.
- A decision reaches the owner by its rank (OWN-10). Low or medium: the master decides what it can
  defend (OWN-05) and sends Intake one question at a time. High, or a new project: the item gets a
  real design-first interview in a fresh Fable planning session. The master sends Intake one line
  saying the interview is ready and how many questions it has; the owner opens the planning session
  by Intake's link and does the whole interview in one sitting (OWN-04). That session writes the
  plan and the spawn-ready briefs onto this card, then ends; the go returns to Intake as one line.
  A question to the owner outside that interview is a breach.
- Fable plans, and only plans. This master and Intake run on Opus. Builds run on Sonnet. Reviews,
  order code and other safety-critical writes run on Opus. A Fable session writes only when the
  owner names Fable for that item, so every brief names Opus or Sonnet unless the owner did.
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

## Commit log

| Date | Hash | Repo, branch | Files | Why |
|---|---|---|---|---|
