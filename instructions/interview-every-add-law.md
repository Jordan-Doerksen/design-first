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
npm install *   npm i *   pnpm add *   yarn add *
pip install *   uv add *  cargo add *
```

An `ask` rule prompts even when a more specific `allow` rule matches, and it matches inside
subshells, command substitutions and loop bodies. **Residual:** an install performed by a script
the agent writes and then executes is not a tool call on this pattern and is not asked. The rule
above is a speed bump for an honest agent; the written rule is what makes a dishonest path a
violation rather than an accident.

### GATE-04

**The Programmer hat unlocks only after the interview pass is complete.**

Hats are defined in `workflows/coding.md` ("Hats and gates"). The Programmer hat owns the approved
spec only. Until the pass above has restated, split, judged, costed and asked, there is no approved
spec, and code written before it is code written against a guess. In an approved autonomous loop
(`instructions/autonomy-law.md`) the pass runs at the chunk boundary, before the loop starts; the
loop never interprets a new request.

## The marker the Stop hook reads (0.1.23, CR-2026-10-13-HONOUR)

GATE-01 is enforced by `hooks/stop.ps1#interview`. Every allowed AskUserQuestion call writes the
session's interview marker (`<markers>/<session>.asked`, by `hooks/ask.ps1`). When a turn changed
source in a repository whose `.git` was created since the prompt, and the session has no marker,
the Stop card carries the interview line for that repository and refuses the stop once. The hook
cannot grade the interview; it can see that none happened before a new repository got code.
