---
description: Set up design-first on this machine. Asks seven questions one at a time, then a script writes root, brain and pointer, generates LAW.md and runs the Doctor.
allowed-tools: AskUserQuestion, Bash(node *), Bash(git -C *), Bash(git config *)
---

You are running `/design-first:adopt`. **You ask; the script writes.** In this command you never create, edit or delete a file yourself, with no exception: every write is done by `tools/adopt.mjs` from templates and the answers below, and recorded, so `/design-first:remove` can reverse exactly that. If you find yourself about to use Write or Edit, stop.

## 0. Node.js 18 or newer

Run `node --version`.
If the command is not found or the major version is below 18, stop and say exactly this, then end:

> Node.js 18 or newer is not on PATH. Install it (from https://nodejs.org, `winget install OpenJS.NodeJS.LTS` on Windows, or your package manager on Linux and macOS), open a new terminal, then run `/design-first:adopt` again. Nothing was written.

## 1. The questions

Ask with AskUserQuestion, **one question at a time**, recommended default first and marked. Every option's description carries its reason in a sentence: what it gives and what it costs (OWN-04); `hooks/ask.mjs` refuses a description too short to hold one. Accepting a shown default counts as the user typing it. Do not batch questions. Do not skip a question because the answer seems obvious. Before question 1, you may run `git config user.name` and `git -C "<cwd>" rev-parse --is-inside-work-tree` to prepare defaults; show, never assume.

1. **Root** - "Which folder do your sessions start under? Root holds the entry `CLAUDE.md` and `.claude/settings.json`."
   Options: the current working directory (Recommended) · another folder (they type it).
2. **Brain** - "Where should your brain live? It is your private folder for personal law, claims and state."
   Options: `<root>/brain` (Recommended) · another folder (they type it; another drive is fine).
3. **Owner name** - "What name should the guard use for you in its messages, and the brain's `me.md` carry as `owner.name`?"
   Options: the git `user.name` if one is set (Recommended) · type a name.
4. **GitHub owner(s)** - "Which GitHub owner(s) do your repositories push to? A remote that matches none of them is reported as FOREIGN by the Doctor."
   Options: a name you can see in the root's remotes, if any (Recommended) · none yet · type one or more, comma-separated.
5. **Brain as a git repo** - "Should the brain be a git repository?"
   Options: Yes (Recommended: the brain is the only copy of your personal law, and git is its backup and its history) · No, a plain folder.
6. **Frozen paths** - "Any frozen paths: folders the guard must refuse to edit or delete, such as a reference copy you keep on purpose?"
   Options: None (Recommended) · type one or more, comma-separated (absolute, or relative to root).
7. **Settings scope** - ask **only if root is a git work tree** (`git -C "<root>" rev-parse --is-inside-work-tree` prints `true`): "The kit's deny/ask permission rules go in a settings file under root. Commit them or keep them personal?"
   Options: Commit them in `.claude/settings.json` (Recommended: everyone who clones root gets the same rules) · keep them personal in `.claude/settings.local.json`.
   If root is not a work tree, do not ask; the script uses `.claude/settings.json`.

## 2. Run the script

One Bash call, with every path in double quotes and the answers as named parameters. Omit `-GitHubOwners` / `-FrozenPaths` when the answer was none; include `-BrainIsRepo` only when the answer was yes; include `-SettingsScope` only when question 7 was asked:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/adopt.mjs" -Root "<root>" -Brain "<brain>" -OwnerName "<name>" -GitHubOwners "<a,b>" -BrainIsRepo -FrozenPaths "<p,q>" -SettingsScope <shared|personal> -PluginRoot "${CLAUDE_PLUGIN_ROOT}"
```

The script is idempotent and safe on an existing brain: it writes only missing files and prints a unified diff for each one that already exists (attach mode). It never overwrites anything.

## 3. Relay the result verbatim

Paste the script's printed output as it is: the file list, every diff, the Doctor's report with its exit code and band (`0` GREEN, `1` RED, `2` COULD-NOT-LOOK which is not a pass), the `soft_deny` lines to paste by hand into the user-level `settings.json` the script names (`~/.claude/settings.json`; the script never writes that file; neither do you), and the `next` steps. Do not summarise the diffs away and do not soften a RED. If the script exited 1, show its ERROR line and stop; do not try to finish by hand.
