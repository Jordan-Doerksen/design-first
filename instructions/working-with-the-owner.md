# Working with the owner — five rules about asking, ranking, deciding and stopping

This file owns `OWN-04`, `OWN-05`, `OWN-06`, `OWN-07` and `OWN-10`. The adopter's own preferences (name,
voice, what they are building, what overwhelms them) live in the brain's `me.md`, which `/adopt`
writes from the interview. This file holds only the method rules, which do not change per adopter.

### OWN-04

**Ask the owner one question at a time, as multiple choice, with the recommended option first;
every option carries a reason to pick it, the recommendation says why it wins, no two options are
offered as equally fine, and where the asking surface has no room for a reason the reason goes in
the text above it.**

A wall of questions is also overload. The owner reads one question, picks one option, and the next
question is built on that answer. Each question offers three or four real options plus a custom
one; the agent recommends one and says why in a clause, not a paragraph.

This is the design-first interview (`DES-01`): the owner **chooses**, the agent **records**. The
owner never has to read a document to make the decision; the manifest is the agent's record for
the next agent. When there is no real design choice — a trivial or obvious thing — build it; an
interview about nothing is overload too.

*Worked example.* Instead of "What runtime mode, where should thresholds live, what must the tool
never do, and which notification channel?", the agent asks: "Runtime mode? **(a) real-time,
recommended** — the data arrives continuously · (b) scheduled batch · (c) on demand · (d) other."
The answer decides which question comes next.

**Every option carries its reason** (amended 2026-10-14, CR-2026-10-14-OPTIONS). A choice without
information is not a choice: it hands the thinking back to the owner, which is the overload this
file exists to reduce. A reason says what the option gives, what it costs, and who would pick it.
A label is not a reason. The recommendation says why it wins. Two options are never offered as
equally fine: if they are close, say what tips it, and pick. The reasons come from the research
the decision's rank asks for (`OWN-10`), with the source named.

**Where the reasons go.** In a multiple-choice tool, each option's description holds its reason.
Some asking surfaces have no room for one: a host's next-step box with a short question field and
button labels of a few words, or a button row in plain text. There the reasons go in the reply
text written before the call, and the box carries the question only. A surface's own instruction
to keep its field short is not an instruction to drop the reasons; it says where they cannot go,
not that they are not needed.

*What the hook sees.* `hooks/ask.mjs` reads every multiple-choice call and refuses one that holds
more than one question, an option whose description is shorter than the minimum length, a phrase
that offers options as equally fine, or a first option whose label does not hold the recommended
marker. The marker is a word match, so a label such as "X (not recommended)" also passes. A negated
phrase ("not equally good"), a quoted one, or one in a sentence that also holds a contrast word
such as "but" or "however", before or after the phrase, is not counted as a tie ("both are fine,
but this one costs less"). The hook checks for the word; it does not check that the sentence says
what tips it, which is the agent's job. A multi-select question is held to the same rules, and
only its first option's label is checked for the marker. The
minimum, the phrases and the recommended marker are config values; an unreadable config keeps the
defaults. In a multiple-choice call the description is the reason's place even when reasons were
also written above the question, because the description is the only part the hook can see. It
does not see reasons written in plain text or above a next-step box, and it cannot judge whether a
reason is a good one; a padded description passes. Those parts are delivered by route
(`alwaysForSessions`) and judged by the owner.

*Worked example.* Asked how a README should treat a typed count, the agent offered two buttons,
"drop the numbers" and "generate them", with no trade-off, and the owner had to ask which was the
more professional choice. The question that follows this rule reads: "(a) generate them,
recommended — a generated count cannot go stale, costs one build step · (b) drop the numbers — no
build step, but the README says less · (c) other."

### OWN-05

**Do not ask the owner an implementation question they have no way to answer.** When one answer
is defensible, choose it, record why, and make it a config value so it stays reversible.

The interview is for design choices that belong to the owner: scope, behaviour, taste, risk. It is
not for internal mechanics. A question like "should the retry back-off be exponential or linear?"
has a defensible default; asking it spends the owner's attention and gets a guess back. Choose,
write one line in the manifest saying why, and put the value in the domain's `.json` so the owner
can change it later without a conversation.

The boundary between the two classes of decision is the whole subject of
`instructions/autonomy-law.md` (`AUTO-01`): if it is not clearly execution, it is design, and the
owner decides.

*Worked example.* Porting a behaviour from an existing reference implementation, the agent had
eight open questions for the owner. Three of them — which pricing model, which identifier form,
which record defines the planned value — were answered in the reference's own source, in functions
the agent had already read. The owner would have had to reconstruct from memory what the file
states exactly. **Before asking the owner anything about a ported behaviour, read the reference
for it.** Ask only what the reference cannot answer: preferences, priorities and facts that live
outside the code.

### OWN-06

**Deliver what was asked, then stop.** Offer an addition in one line; do not build it first.

Give the owner the thing they asked for. Do not add an item they did not request, and do not
reformat or cut their content on an assumption. If a related addition looks useful, say so in one
line and wait. Building it first removes the owner's choice and adds something they now have to
evaluate, which is the overload the method exists to reduce.

This pairs with the smallest-slice rule (`DES-05`): deliver the smallest thing that works, show it,
and let the next step be chosen.

*Worked example.* Asked for a script that renames exported files by date, the agent writes the
script, shows one dry run, and ends with: "It could also move them into year folders — want that?"
It does not write the folder logic until the answer is yes.

### OWN-07

**When the project has a UI, anything the operator must run is a button in the app, not a script
on the disk.**

A tool that ships to a person who is not its developer is judged by the minute they spend starting
it. A folder of `.bat` or `.sh` files is a second interface they have to learn, with no feedback
when a step fails. If the application has a window, every operator action — start, stop, update,
export, send the log — is a control in that window, with its result shown there. A script is
acceptable only for the single action that has to exist before the window does: starting the
server or the app itself.

*Worked example.* A desktop launcher had a "Backups" row that read a run log, and an `update.bat`
beside the executable for pulling a new version. The operator never ran the `.bat`, because nothing
in the window told them to. Moving "Update" into the window as a button that prints its own result
is the fix; documenting the `.bat` better is not.

### OWN-10

**Never assume the best way: rank each decision low, medium or high and state the rank; a low one
is acted on, a medium one gets a quick research pass first, a high one gets serious recon, and a
case study supplements research but never replaces it.**

(Added 2026-10-14, CR-2026-10-14-OPTIONS.) An answer from judgement alone reinvents a pattern that
already exists and misses the proven, safe path. The rank keeps the research in proportion, so a
trivial call stays fast; research about nothing is overload too.

| Rank | When | What happens first |
|---|---|---|
| Low | reversible, local, and no effect on money, safety, trust or anything public | act; no research |
| Medium | a design or method choice that sticks, or that other people see | a quick pass: a focused web or documentation sweep for how it is normally done right |
| High | hard to reverse, public, money, safety or trust, a law, an architecture | serious recon: several sources, prior art and failure modes, before anything is proposed; pairs with the gap review (`GATE-08`) |

- **State the rank** in one line with its reason, before the work on that decision starts.
- **Rank per decision, not per action.** A task holds a few decisions; rank those. A rank on every
  tool call is noise.
- **The findings feed the options.** What the research found goes into each option's reason
  (`OWN-04`), with the source named.
- **A case study is not research.** A style bible's case, donor code or a reference repository
  shows one answer. Research shows whether it is the normal right one, and what fails.
- **Research informs the slice; it does not replace it** (`DES-05`). The smallest slice still ships.

*What delivers it.* No machine can see whether a rank was stated or research was done. The rule
reaches every session because `hooks/route.mjs` adds the groups in the route policy's
`alwaysForSessions` list to every session's first prompt, and again after a compaction or a clear;
the template lists `OWN`. The owner judges it. A subagent does not receive it, because
`hooks/subagent.mjs` leaves the session-only groups out of a subagent's injection; a brief that
needs research says so itself. An existing brain gets the route only when its own
`route-policy.json` carries the key: adopt copies the template once, and an upgrade does not edit
the brain.

*Worked example.* Asked which of two README treatments was "the more professional choice", the
agent answered from its own judgement, with nothing behind it. The decision was medium: other
people read the README. The rule asks for a quick pass first, a look at how maintained projects
treat a typed count, and the finding goes into the reasons of the options.
