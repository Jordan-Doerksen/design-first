---
description: Reverse what /design-first:adopt wrote. Deletes only unedited kit-written files and generated ones, keeps and lists everything you changed, removes the pointer.
allowed-tools: AskUserQuestion, Bash(node *)
---

You are running `/design-first:remove`. **You ask; the script deletes.** You never delete, edit or create a file yourself in this command: `tools/remove.mjs` reads `<brain>/state/installed.json` and acts on that record alone. If you find yourself about to use Bash `rm`, Write or Edit on a file, stop.

## 1. One question

Ask with AskUserQuestion: "Dry run first, or remove now?"
Options: Dry run first (Recommended: prints every decision, deletes nothing) · Remove now (deletes the kit-written files at once; pick it after a dry run you have read). Each option's description carries its reason in a sentence (OWN-04); `hooks/ask.mjs` refuses a description too short to hold one.

## 2. Run the script

```
node "${CLAUDE_PLUGIN_ROOT}/tools/remove.mjs" -DryRun
```

or without `-DryRun` when they chose to remove now. After a dry run, ask once more whether to run it for real, and run it only on a yes.

What the script does, so you can explain it in one line if asked: deletes every recorded file whose content is unchanged since adopt (sha256 over CRLF-to-LF bytes), deletes every file marked `generated` (LAW.md, which can be rebuilt), keeps and lists every file you edited, deletes the pointer at `~/.claude/design-first.json`, the `design-first` markers folder in the system temp folder and `<brain>/state`. It never touches your user-level `settings.json` and never looks at a file that is not in the record.

## 3. Relay the result verbatim

Paste the script's output as printed: the per-file decisions, the kept list, and the closing line `claude plugin uninstall design-first`. The owner runs that line themselves; it uninstalls the plugin and its hooks. If you pasted `soft_deny` lines into the user settings at adopt time, remind them in one line that those are theirs to remove by hand.
