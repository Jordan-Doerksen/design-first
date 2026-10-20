---
description: Open a domain's master control session. Reads the domain's row from the Intake card or asks for it, renames the session, writes the control card from a template, lists and messages the domain's sessions, files them in the sidebar and pins the master. `intake` writes the Intake card.
argument-hint: <Domain word, or intake>
allowed-tools: AskUserQuestion, Bash(node *), Read, Glob, mcp__ccd_session_mgmt__list_sessions, mcp__ccd_session_mgmt__get_session, mcp__ccd_session_mgmt__set_session_title, mcp__ccd_session_mgmt__send_message, mcp__ccd_sidebar__list_sections, mcp__ccd_sidebar__create_section, mcp__ccd_sidebar__move_sessions, mcp__ccd_sidebar__set_pinned
---

You are running `/design-first:control` for: $ARGUMENTS

**You ask; the script writes.** The only file this command creates is the card, and `tools/control.mjs` writes it from a template. You never use Write or Edit here, and you never commit: a card is committed by the owner (SAFE-06). The session, sidebar and message tools are the host's (the Claude desktop app's), not the kit's. Where this host has one, use it; where it does not, print the step for the owner as one short action with what they will see when it worked (OWN-08).

## 0. The brain and the word

The brain is the folder the entry hook named on turn one (`design-first: entry path (brain <path>)`); failing that, read `brain` from the pointer `~/.claude/design-first.json`. Call it `<brain>`.

The argument is one word: a domain (`Desk`, `Games`, `Method`, ...) or `intake`. With `intake`, go to section 7. With no argument, ask one question with AskUserQuestion: which domain? The options are the rows of `<brain>/control/INTAKE.md` whose Master cell says none yet; first, marked (Recommended), the one with the most items waiting in that card's queue, and every option's description says what the domain owns and what waits for it; last, "another word (type it)". With no Intake card, ask for the word typed, with one line above the box saying what a domain word is: one word, a noun for the thing built, the same word on the sidebar section, the chat title and the card.

## 1. The domain's facts

Read `<brain>/control/INTAKE.md` when it exists and find the row whose Domain cell is the word: Owns gives the folders, Test the one-sentence test, Sidebar the section. Show the three facts, one line each, and go to section 2.

Without that card, or without a row for the word, ask three questions with AskUserQuestion, one at a time, recommended first, every option's description carrying its reason: what it gives and what it costs (OWN-04; `hooks/ask.mjs` refuses a description too short to hold one). Facts about the disk are yours to find first (GATE-15): list the top-level folders under root before question 1 and name the ones whose names carry the word.

1. **Folders** - "Which folders does <Domain> own?" Options: the folders you found (Recommended: they carry the word, and one folder has one home) · type them, comma-separated.
2. **Test** - "What one sentence says a thing belongs to <Domain>?" Options: a sentence you draft from the folders, in the shape "it teaches or checks a rule" (Recommended: one test with one meaning, and the owner can edit it on the card) · type one.
3. **Section** - "Which sidebar section holds <Domain> sessions?" Options: the word itself (Recommended: the same word on the section, the title and the card) · another existing section, named, which costs two words for one domain.

## 2. Rename the session

Where the host has a session-title tool, set this session's title to `<Domain> Master Control`. Where it has none, print: "Rename this chat to `<Domain> Master Control`. You will see the new title in the sidebar."

## 3. Write the card

One Bash call, every path in double quotes. Pass `-Session` with this session's id when the host shows it (the sessions list names this session by its title); omit it when it does not, and the card says the id is not recorded. Omit `-Folders` or `-Test` only when the owner gave none; the card then says they are not recorded.

```
node "${CLAUDE_PLUGIN_ROOT}/tools/control.mjs" -Domain "<Domain>" -Brain "<brain>" -Session "<id>" -Folders "<a,b>" -Test "<the sentence>"
```

The script writes `<brain>/control/<DOMAIN>-CONTROL.md` and never overwrites: an existing card is kept and its diff printed. Relay the script's output as printed. If it exited 1, show its ERROR line and stop; do not write the card by hand.

## 4. The domain's sessions

Where the host has a sessions list, list the sessions and name this domain's by the test: a session whose title or folder is under the domain's folders. For each one this master did not start, send one message asking for the four-line report: repo and branch; files changed or posts made; needs from the owner; blocked on. Say which sessions you named and which you messaged. A session the owner started may not answer; say so once and do not ask again. Where the host has no session tools, print the four lines for the owner to send.

## 5. The sidebar

Where the host has sidebar tools: find the domain's section, or create it under the domain's word; move this session and the domain's sessions into it; then pin this session (pin after the move, since a move unpins). A nested session moves with its parent and the host refuses to move it alone: when you meet one, say that it files with its parent, and leave it. Where the host has no sidebar tools, print: "Drag this chat into the <Section> section and pin it. You will see it at the top of that section."

## 6. Print the card and end

Paste the card as the script printed it. End with two lines: `Next:` the first item this master takes (from the Intake queue when there is one, else "nothing in the queue"); `Needs from you:` the commit line the script printed, or `nothing`.

## 7. `intake`

Rename the session to `Intake` (section 2, with that title). Run:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/control.mjs" -Intake -Brain "<brain>" -Session "<id>"
```

Pin this session where the host can (section 5; Intake sits above the domain sections, in none of them). Print the card (section 6). The domains of this machine are the owner's rows: ask nothing here; Intake fills the routing table as masters open.
