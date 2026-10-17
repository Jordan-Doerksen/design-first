# Interview-every-add — no request goes straight to the code

This file owns `GATE-01`, `GATE-02`, `GATE-03` and `GATE-04`. It has the same rank as
`instructions/design-methodology.md` and does not restate it. It governs every project and every
kind of work: tools, sites, bots, games, documents.

## The law in one line

**Every requested addition gets an interview pass before you build it — however detailed the
prompt is.**

### GATE-01

**Every requested addition gets the four-verdict pass of approve, redact, add and flavour, however
detailed the prompt; a long request is a strong opening position, not a spec.**

A long, specific request is the most dangerous kind, because it *looks* complete. The detail tells
you what the owner wants. It does not tell you whether the request is the best version of what they
want, what it conflicts with, or what it hides. Built word for word, it skips the one step that
finds:

- the element that contradicts a decision already locked in the manifest,
- the part that is three systems, not one,
- the decorative element nobody will see in use,
- the missing part that appears only when the program runs,
- the cheaper version that gives most of the result.

**A wrong detailed build costs more than one round of questions.**

**The four verdicts.** Every element of the request gets exactly one, and the pass is not complete
until every element has one:

| Verdict | Means |
|---|---|
| **APPROVE** | The element is right as asked. Say so plainly and move on; do not invent an objection to look thorough. |
| **REDACT** | Cut the element. Say what it costs and what the cut loses. |
| **ADD** | The request implies an element it does not state. Name it. |
| **FLAVOUR** | Keep the mechanic, change the presentation: name, tone, framing, voice. |

**The pass.**

1. **Restate the request** in one short paragraph. If the restatement is wrong, nothing after it
   has value.
2. **Split it into elements.** Elements are separable *decisions*, not build steps.
3. **Give every element a verdict.**
4. **Name the conflicts.** Which locked decision, existing system or prior owner verdict does this
   touch? Search the manifest before proposing anything; a taste call is also a decision.
5. **State the cost honestly.** "This is three new systems" is the most useful sentence in the pass.
6. **Then ask** — about real forks only, one question at a time, recommended default first
   (`OWN-04`). Never ask about a point the request already makes obvious.

**What this is not.** Not a delay: a small clear request gets a one-paragraph pass. Not
second-guessing: if the owner confirms an element after you raise a concern, that confirmation is
the decision — state it and build the full request. Not a licence to shrink the request: REDACT is
for an element that costs more than it gives, not for one that is hard. Not a reason to stop: while
an answer is open, do every part that does not depend on it.

**Definition of done for the pass.** Every element has a verdict · the conflicts are named · the
cost is stated · the open forks are asked as multiple choice · the answers are written into the
manifest before any code.

*Worked example.* "Add a settings page with theme, language, notification frequency, an export
button and a reset-everything button." Restated, split into five elements. Theme: APPROVE.
Language: REDACT — the app has one language and no translation files; the cost is a whole string
table, the loss is nothing today. Notification frequency: APPROVE, and ADD — it implies the
scheduler must read a config value it currently hardcodes. Export: APPROVE. Reset-everything:
FLAVOUR — keep it, but it needs a confirmation step and a plainer label. Conflict: the manifest
locked "no destructive action without confirmation" in chapter 2. Cost: one page, one config
change, one new confirm dialog. One question: confirm by typing a word, or by a second click?

### GATE-02

**Silence is not approval; full approval with nothing to cut is said out loud.**

If every element really is right, say "all of it approved, nothing to cut" — as a sentence. That
statement is a *result* of the pass, not a formality, and it is what distinguishes a pass that
happened from a pass that was skipped. An agent that goes quiet and starts building has not
approved anything; it has not looked.

### GATE-03

**A new third-party package is an owner decision, never an addition the agent makes itself; name
it exactly and wait.**

A package is never an ADD you make on your own. Name every package the request implies, by its
exact registry name, and wait for a yes. The reason is slopsquatting: across 2.23 million generated
code samples, hallucinated package names averaged **5.2 % for commercial models and 21.7 % for
open-source models**, and **43 % of hallucinated names reappeared on all ten identical re-runs** —
which is what makes them registrable by an attacker. A locally run open model is the higher-risk
generator, at roughly four times the commercial rate.

**Mechanism.** The kit's root settings template puts the install verbs under `permissions.ask`, so
the agent is stopped and the owner is asked before any of them runs. The rules ship as `Bash(...)`
and `PowerShell(...)` twins, because a rule that covers one shell is not a rule:

```
npm install *   npm i *   npm add *   pnpm add *   yarn add *   bun add *
pip install *   pip3 install *   python -m pip install *
python3 -m pip install *   py -m pip install *   uv add *   poetry add *
cargo add *   go get *   dotnet add package *
```

Bare `npm install`, `uv sync` and `cargo install *` are asked as well (DES-10). An `ask` rule
prompts even when a more specific `allow` rule matches, and it matches inside subshells, command
substitutions and loop bodies. The list was widened on 2026-10-15 (CR-2026-10-15-GAPS D1): `npm
add`, `pip3`, `python -m pip` and the other forms above were not asked before. An adopter that
installed the template earlier copies the new lines from `templates/root-settings.json` into its
root settings by hand: adopt never overwrites a settings file that exists, it shows the difference
and keeps the file.
**Residual:** an install performed by a script the agent writes and then executes is not a tool
call on this pattern and is not asked. A verb or form not on the list is not asked either: for
example `npx <package>`, `pipx install`, `uv pip install`, `gem install`, `composer require`,
`conda install`, `dotnet add <project> package`, or an interpreter named by a path or a version
(`python3.12 -m pip`, `py -3 -m pip`). The host matches the rule, not the kit, so no kit test can
prove the match; the self-test proves only that the template carries every verb above as Bash and
PowerShell twins. The rule above is a speed bump for an honest agent; the written rule is what
makes a dishonest path a violation rather than an accident.

### GATE-04

**The Programmer hat unlocks only after the interview pass is complete.**

Hats are defined in `workflows/coding.md` ("Hats and gates"). The Programmer hat owns the approved
spec only. Until the pass above has restated, split, judged, costed and asked, there is no approved
spec, and code written before it is code written against a guess. In an approved autonomous loop
(`instructions/autonomy-law.md`) the pass runs at the chunk boundary, before the loop starts; the
loop never interprets a new request.

## The marker the Stop hook reads (0.1.23, CR-2026-10-13-HONOUR)

GATE-01 is advised by `hooks/stop.mjs#interview`, once per turn, for a repository created this turn
in a session with no question asked. The grade is ADVISE, not HOOK (since 2026-10-15,
CR-2026-10-15-GAPS D4): the card blocks the first stop once, yields on the second whatever the
answer says, and grades nothing. When the interview line is on the card, the card's first line
names GATE-01 with the other clauses it carries. Every allowed AskUserQuestion call that carries
one question writes the session's interview marker (`<markers>/<session>.asked`, by `hooks/ask.mjs`);
a call with no question writes none. The marker lasts while the session is live: the entry hook's
housekeeping deletes a session's markers only after none of them was written for a day, and never
the markers of the session that starts. When a turn changed source in a repository whose `.git`
was created since the prompt, and the session has no marker,
the Stop card carries the interview line for that repository and refuses the stop once. The hook
cannot grade the interview. It sees one case only: a repository whose `.git` was created since the
prompt (a clone counts; a new folder inside an existing repository does not), in a session in
which the question hook has allowed no AskUserQuestion call that carries a question, on any
subject. `hooks/ask.mjs` writes the marker when it allows the call, before the owner answers. With
no prompt time on record, the Stop hook does not check.

### GATE-14

**A decision about appearance, motion or feel is asked only after more than one real option is rendered side by side on one page; the question that follows is one question, with the recommended option first.**

Added 2026-10-14 (CR-2026-10-14-REVIEW), from an outside reader of the kit. The interview works
for logic; for taste it gets a better answer when the owner looks at real options than when he
reads them described. So a taste call is a decision (the pass above says so) and it gets its own
step: the agent renders the candidates on one static page, side by side, in the repository's
scratch or docs folder, opens it, and only then asks the one question. The chosen option is named
in `DECISIONS.md` by its label on that page. A text-only taste question is a finding for the
Reviewer, not a refusal: the mechanism is `hooks/subagent.mjs#advise-by-role`, which hands this
clause to every subagent (only its id when the advise block is over the size cap) and makes the
Reviewer name it as holding or as a finding.

### GATE-15

**The interview is a design tree worked by frontier: the next question is one whose prerequisites are settled, facts about the environment are the agent's job to find and never the owner's to supply, and the pass ends only when no branch is left silently assumed.**

Added 2026-10-15 (CR-2026-10-15-FRONTIER), after the owner compared this law with the `grilling`
skill in Matt Pocock's `mattpocock/skills` (MIT), whose interview primitive is the same idea with
three sharper mechanics. The pass above says what to judge (four verdicts) and OWN-04 says how to
ask (one question, recommended option first, reasons on every option). This clause says which
question comes next and when the asking is over.

- **The tree.** Every decision hangs off the decisions it depends on. The **frontier** is the set
  of open decisions whose prerequisites are all settled: the questions that can be asked now
  without guessing at an answer not yet heard. A question whose answer depends on another open
  question is not on the frontier; it waits.
- **One from the frontier.** OWN-04 holds: one question per turn. The agent computes the frontier,
  asks its most load-bearing item, and recomputes after the answer, because each answer settles a
  node and pushes the frontier outward. The source skill asks the whole frontier in one numbered
  round; here that is a sequence of single questions, for PRIN-02.
- **Facts are the agent's; decisions are the owner's.** A frontier item that needs a fact from the
  disk, a tool or a document is not a question for the owner. The agent looks it up, by a subagent
  with a DES-11 brief when the lookup is long, and does not block on it: the questions downstream of
  that fact wait, the rest of the frontier is asked meanwhile. The owner is asked only what only
  the owner can decide (OWN-05).
- **Done means empty.** The pass is complete when the frontier is empty, not when the owner looks
  tired of questions and not when a plan merely exists. Anything still assumed in silence is an
  open node. GATE-02 stands: full approval is said out loud.

Grade ADVISE by `hooks/subagent.mjs#advise-by-role`: the Reviewer names the clause as holding or as
a finding, with a frontier item that was asked before its prerequisite, a fact the owner was asked
to supply, or a build that began with an open node.
