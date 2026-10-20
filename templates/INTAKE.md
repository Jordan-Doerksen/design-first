# INTAKE: the front door above the domain masters

Owner's rule: one chat takes every raw need, thought and idea, sorts it into a domain, settles the
intent, and hands one prompt to that domain's master. That chat is "Intake" (id `{{SESSION_ID}}`).
It never does the long work.

This card is a brain file with a history. It lives at `{{CARD_PATH}}`, with every control card
under `{{CONTROL_DIR}}`, never at a repository root and never outside every repository; a card that
sat elsewhere leaves a one-line pointer at its old path. Updated by Intake only; committed by the
owner, never by a session (SAFE-06). Written by `/design-first:control intake` on {{DATE}}.

## Decisions (the interview: six questions, one at a time, recommended first, every option with its reason)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Who owns intent and routing, and who owns the build? | | |
| 2 | How does a prompt reach a master? | | |
| 3 | What does this card hold? | | |
| 4 | How does a master report back, and what happens when it does not? | | |
| 5 | Which domains exist, one word each, and when does a master open? | | |
| 6 | What is this chat called, and what is the word for a domain controller? | | |

A label is one word, a noun for the thing built. It owns one disk root, has one membership test,
and the same word is on the sidebar section, the chat title and the card.

## Routing table

| Domain | Owns | Test | Master | Card | Sidebar |
|---|---|---|---|---|---|

One row per domain, written by Intake. Opening a master: `/design-first:control <Domain>` in a
fresh chat writes its card under `{{CONTROL_DIR}}`, files the master in the domain's sidebar
section and pins it; Intake fills the row above.

## How an item moves

1. **Dumped.** The owner writes it here, raw. Intake gives it a number and a one-line title.
2. **Sorted.** Intake names the domain by the test above. An item that passes two tests is split
   into two items. An item that passes none is marked unrouted and Intake asks one question.
3. **Settled.** Intake asks only what changes the prompt: the real need, what is out, the rank.
   One question at a time, options with reasons, recommended first (OWN-04). Facts about the disk
   are Intake's job to find (GATE-15).
4. **Proposed.** Intake lists its adds and cuts, each marked. Silence is not approval (GATE-02).
5. **Sent.** Intake shows the prompt; the owner says send; Intake messages the master. State: sent.
6. **Reported.** The master messages Intake one line. State: done or blocked.

## The prompt Intake sends

```
From Intake, item <n>: <title>
Goal: <what the owner wants, one or two sentences>
Domain: <Domain>. Passes the test: <the test>
Area: <folders or repos Intake knows; the master finds the rest>
Done-check: <the outcome the owner will see>
Ruled out: <what the owner said no to>
Rank: <low | medium | high>, Intake's estimate; the master re-ranks (OWN-10)
Open: <what Intake did not settle, or "nothing">
Report: when this item is done or blocked, message Intake ({{SESSION_ID}}) one line:
"item <n> done: <proof>" or "item <n> blocked: <why>".
```

This prompt is a request. The master runs its own interview on it (GATE-01).

## Queue

| # | Item | Domain | State | Sent to | Report |
|---|---|---|---|---|---|

## Spend

The app reports a session's context size, not its total spend. A per-item total is not measured.
