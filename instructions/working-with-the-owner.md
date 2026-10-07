# Working with the owner — four rules about asking, deciding and stopping

This file owns `OWN-04`, `OWN-05`, `OWN-06` and `OWN-07`. The adopter's own preferences (name,
voice, what they are building, what overwhelms them) live in the brain's `me.md`, which `/adopt`
writes from the interview. This file holds only the method rules, which do not change per adopter.

### OWN-04

**Ask the owner one question at a time, as multiple choice, with the recommended default first.**

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
