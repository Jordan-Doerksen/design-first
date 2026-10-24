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
- **The fog.** Beyond the frontier are decisions the agent can see coming but cannot yet phrase,
  because they hang on open nodes. The test: can the *question* be stated precisely now, not can
  it be answered. A question that can be stated goes to the manifest's Open Questions table, with
  an owner, even when it is blocked. One that cannot is written under the manifest's **Not yet
  specified** list (`DES-01`), as coarse as the view allows, never pre-sliced into questions. Each
  settled node clears fog ahead of it: a line graduates to the Open Questions table when it can be
  phrased, or is struck when the settled node made it moot. Work ruled beyond the project's goal
  is not fog; it is a non-goal under Non-Negotiable Constraints and never graduates. So "done
  means empty" reads: the frontier is empty, the Open Questions table holds only blocked questions
  with owners, and the fog is written, not silent. Added 2026-10-23 (CR-2026-10-23-LIBRARY), from
  the `wayfinder` skill in the same repository, whose map keeps a "Not yet specified" section with
  the same test.

Grade ADVISE by `hooks/subagent.mjs#advise-by-role`: the Reviewer names the clause as holding or as
a finding, with a frontier item that was asked before its prerequisite, a fact the owner was asked
to supply, a build that began with an open node the manifest lists neither as a question nor as
fog, or a fog line that was sharp enough to be a question.

### GATE-16

**An APPROVE or ADD verdict carries the observable that would show the element wrong, written beside the verdict and into the spec's failure modes; an element with no such observable is not approved, it is unfalsifiable, and it goes to the Open Questions table.**

Added 2026-10-23 (CR-2026-10-23-LIBRARY), after the owner asked whether a prompt library should
seed the interview. It should not; one pattern in `danielmiessler/fabric` (`check_falsifiability`,
MIT) carried a move the pass lacked: for each claim, name the observation that would prove it
wrong, and call a claim with none unfalsifiable.

- **Where it sits.** GATE-10 says a failure the spec did not predict is a spec failure. AUTO-08
  says a story with no probe covering its behaviour fails the gate. The spec list in GATE-08 asks
  for named failure modes. All three act after the pass. This clause puts the same question inside
  the pass, element by element: *what would show this is wrong?* The owner's own instruments
  pre-register a hypothesis before the data is read; this is that move applied to the interview.
- **What the line is.** One observable per APPROVE or ADD: a thing a person or a probe can see,
  with the condition under which seeing it means the element failed. "A signal fires with a
  timestamp inside the pause window on a recorded session." Not "it works well", not "it feels
  right"; those are not observable. The line is written beside the verdict in the pass and copied
  into `SPEC.md` failure modes, where it becomes the first probe for the story (AUTO-08).
- **REDACT and FLAVOUR carry nothing.** One cuts the element, the other changes its presentation;
  neither adds behaviour to disprove.
- **No observable, no approval.** An element nobody can state a test for is a design problem, not
  a feature. It goes to the Open Questions table with the owner named, and the pass continues on
  the elements that have one (the "not a reason to stop" rule in GATE-01 holds).
- **Cost.** One sentence per APPROVE or ADD. A small request's pass grows by one line per element
  and no more.

*Worked example.* "Add a midday pause to the desk." APPROVE; disprove: a signal fires with a
timestamp inside the pause window on a recorded session. ADD: the window's bounds are a config
value, not a literal; disprove: changing the value in the config file and restarting does not move
the pause. Both lines go into `SPEC.md` failure modes before any code.

Grade ADVISE by `hooks/route.mjs#route-law`: the row reaches the session with the GATE group when
an interview word routes, which is where the pass runs, with the owner. It does not ride the
subagent advise block. Workaround, recorded so nobody moves it there by reflex: at 0.2.13 the block
plus the SAFE, DES, VCS and OBS rows sit within about 90 characters of the 9,500 cap at a
29-character kit path; one more clause in the block deferred OBS for a general-purpose subagent in
the suite's own case, and the shortest honest sentence could not buy the room back. A Reviewer that
reads `SPEC.md` still has GATE-10 for a failure mode the spec did not name. The finding this clause
asks for is an APPROVE or ADD that carries no observable, or one whose observable is not
observable.
