# Loops and gates

How work moves through design-first, drawn as plain-text charts. Each chart has one
sentence before it and a numbered list after it that says every step, gate and loop-back
in words. The list is the version for a phone or a screen reader; the chart and the list
say the same thing.

The charts describe the kit in this repository. A session runs the installed copy, so a
change reaches a session after the plugin update and a restart. The full rules are in
`instructions/` and `workflows/`; `LAW.md` indexes them by id.

## Contents

- [Legend](#legend)
- [The overview](#the-overview)
- [1. The project method loop](#1-the-project-method-loop)
- [2. A session and each prompt](#2-a-session-and-each-prompt)
- [3. The hooks on a tool call](#3-the-hooks-on-a-tool-call)
- [4. The end of a turn](#4-the-end-of-a-turn)
- [5. The autonomous loop](#5-the-autonomous-loop)
- [6. Outside the session](#6-outside-the-session)

## Legend

- **deny**: a hook refuses the call, and the agent sees the reason.
- **ask**: the host asks the owner before the call runs.
- **advise**: a hook adds a note to the agent's context, and the call goes on.
- **block once**: the Stop hook refuses the first stop of a turn, then lets the next one through.
- **RED**, **COULD-NOT-LOOK**: verdicts of the Doctor. COULD-NOT-LOOK is not a pass.
- **law text**: a step the law asks for that no machine checks.
- **(runner)**: a step of the owner's loop runner, which is outside the kit.
- A loop-back runs up the left edge of a chart; its condition is written where it leaves.
- Every hook allows the call and logs the error when it fails inside itself.
- The ids are the kit's clauses with the kit's grades. An adopter's brain can re-grade a
  clause in its `law.overlay.json`.

## The overview

The outer loop, from an idea to the next chunk. The sections below draw each part in detail.

```text
      owner: an idea or an addition
                   |
                   v
+--------> 1  INTERVIEW               GATE-01
|             one verdict per element  OWN-04
|             rank each decision       OWN-10
|             one question, reasons
|             frontier first           GATE-15
|                  |
|                  v
|          2  LOCK DECISIONS.md        DES-01
|             map ARCHITECTURE.md
|                  |
|                  v
|          3  STAKES?                  GATE-08
|             money, safety or trust:
|             gap review first; source
|             writes denied till clear
|                  |
|                  v
|   +----> 4  BUILD one slice          DES-05
|   |              |
|   |              v
|   +-fail 5  INNER GATE               GAME-12
|   |         verify, stop, show, wait
|   |              |
|   |              v
|   +-fail 6  OUTER GATE               GATE-05
|             cross-check, Definition  GATE-07
|             of Done; Stop card
|                  |
+---- CR --- 7  LOCKED DECISION        GATE-06
                must change? write a
                Change Request
                   |
                   v
             8  NEXT CHUNK, or DONE
```

1. Interview: restate the request, give each element one verdict (approve, redact, add, flavour), rank each decision and research by its rank, and ask one question at a time with a reason on every option. Work the questions as a design tree: ask next a question whose prerequisites are settled, and find facts about the environment yourself instead of asking the owner for them. (GATE-01, OWN-04, OWN-10, GATE-15)
2. Lock the decisions in DECISIONS.md and map the domains in ARCHITECTURE.md. (DES-01)
3. If a wrong output costs money, safety or trust, run an adversarial gap review of the spec first. In a repository that declares the gate, the guard refuses source writes until the gate is cleared. (GATE-08, GATE-09)
4. Build the smallest slice of one chunk. (DES-05)
5. Inner gate after each change: run the verify gate, stop, say what changed and what it proves, and wait. If it fails, go back to step 4. (GAME-12)
6. Outer gate at the end of the chunk: cross-check against the manifest, the architecture and the goal, and check the Definition of Done; the Stop card asks once per turn. If it fails, go back to step 4. (GATE-05, GATE-07)
7. If a locked decision must change, write a Change Request and go back to step 1. (GATE-06)
8. Next chunk, or done.

## 1. The project method loop

This chart shows how one piece of work goes from the owner's idea to a finished chunk. It covers the interview, the manifest, the stakes test and the design gate, the build with its inner gate, the outer gate, the Change Request, and a failure after the tool ships. Each step names what the kit's machine does there (deny, ask, advise or block once), or says "law text" where no machine checks the step. The chart draws the main loop-backs. The numbered list gives every condition and every loop-back in words, including the ones the chart does not draw.

```text
    owner: an idea or an addition
                  |
                  v
           1  INTERVIEW                         GATE-01
              new repo, no question: block once
              wrong question shape: deny        OWN-04
              rank and research: advise         OWN-10
              frontier; find facts: advise      GATE-15
                  |
                  v
+--------> 2  LOCK DECISIONS.md                 DES-01
|             map ARCHITECTURE.md (law text)
|             source write, no manifest         DES-02
|             at root or docs/: advise once     GATE-04
|                 |
|                 v
|   +----> 3  STAKES? GAP REVIEW                GATE-08
|   |         money, safety or trust:
|   |         review spec, manifest (law text)
|   |         no such stakes: go to step 5
|   |             |
|   |             v
|   +-deny 4  GATE RECORD                       GATE-09
|             gate line on, record not clear:
|             source Edit or Write: deny;
|             removing the gate line: deny
|                 |
|                 v
|   +----> 5  BUILD ONE SLICE                   DES-05
|   |         grows past one Read: advise       DES-03
|   |         new package install: ask          GATE-03
|   |         assert removed in a test: deny    GATE-11
|   |             |
|   |             v
|   +-fail 6  INNER GATE                        GAME-12
|   |         verify, stop, show, wait
|   |         Stop card: block once a turn;
|   |         it runs no verify gate
|   |             |
|   |             v
|   +-fail 7  OUTER GATE                        GATE-05
|             cross-check, Definition of Done   GATE-07
|             documents: on the same card,      DES-07
|             which grades nothing
|                 |
|                 v
+-- CR --- 8  CHANGE REQUEST                    GATE-06
|             owner yes: dated Change Log row
|             manifest edit, no dated row,
|             source changed: block once
|                 |
|                 v
+- fails - 9  NEXT CHUNK, OR DONE               GATE-10
              fails later: SPEC.md first
              (law text; subagents: advise)
```

1. INTERVIEW. The owner brings an idea or an addition. Even when the request is detailed, restate it, split it into elements and give each element one verdict: approve, redact, add or flavour. Name the conflicts with the manifest and state the cost (GATE-01). The pass is law text, and no machine grades it. The machine sees one case only. When a turn changes source in a repository whose .git folder was made in that turn, and no question was asked in the session, the Stop card adds the interview line and blocks once (GATE-01: advise). Rank each decision low, medium or high, and research in proportion (OWN-10: advise). The route hook adds the OWN rows to the first prompt of each session and again after a compaction or a clear, but only when the brain's route policy lists the group. No machine sees the rank. Ask only the real forks: one question per call, a reason in the description of each option, and the recommended option first (OWN-04: deny). The ask hook refuses a call with more than one question, an option description too short to carry a reason, wording that offers the options as equally fine, or a first option that is not marked recommended. It does not see questions or reasons written in plain text. Work the questions as a design tree by frontier: the next question is one whose prerequisites are settled; facts about the environment are the agent's job to find, by a subagent with a brief when the search is long, and are never the owner's to supply; the pass ends only when no branch is left silently assumed (GATE-15: advise; it reaches the session with the GATE rows only when a prompt names one of the GATE group's route words, such as interview or review, and the group fits under the size cap; it reaches every subagent by advise-by-role; nothing checks the order of the questions). Show the options for a taste decision side by side before you ask (GATE-14; law text in the session). The council command is a variant of this step. If the owner corrects the restatement, do step 1 again.
2. LOCK DECISIONS.md. Write each answer into DECISIONS.md with its chosen answer, rationale, date, affected areas and change rule. Map ARCHITECTURE.md on one page (DES-01). DES-01 is BUILDABLE: the kit does not check this order, so it is law text and nothing checks it. Before the first source write, confirm the goal, the locked decisions, the subsystem, the config place, the behaviour and the validation. Also read the Change Log and the branches (DES-02). If an item is missing, ask one question and go back to step 1. A source write in a git repository that has no DECISIONS.md, at its root or in docs/, gets an advise, once per repository per session (DES-02, GATE-04). The write goes on. When step 8 or step 9 sends the work back here, change the documents first: the Change Log row and the required updates, or the new failure mode in SPEC.md.
3. STAKES? GAP REVIEW. If a wrong output costs money, safety or the trust of a person who relies on it, write SPEC.md and DECISIONS.md first. Send them for an adversarial gap review with the fixed prompt, and use a second, independent reader where possible. Then correct the documents (GATE-08). If you are not sure about the stakes, ask the owner one question. If the corrections are large, do the review again. The stakes test and the review are law text; nothing checks them. GATE-08 has the HOOK grade only because of the deny at step 4. If the work does not have such stakes, step 4 does not apply: go to step 5.
4. GATE RECORD. Declare the gate with the line "Design gate: on" in DECISIONS.md, at the root or in docs/; the guard reads both. Resolve or record every finding. Then write records/gate-cleared.md: a Findings line above zero, and one line for each finding in the form "- <id> resolved: <where>" or "- <id> recorded: <where>", with as many distinct ids as findings (GATE-09). Every "- " line in the record must be a finding line. A negated or misplaced status, a missing place, an id with no digit or a wrong count makes the guard deny the write, and the reason names the line. So does a list line in another style ("* ", "+ ", "1. ") or inside a quote ("> - "), and a record with two Findings lines is denied as ambiguous. Until that record clears the gate, the guard denies each source Edit or Write in the repository. It also denies an Edit or Write that removes the gate line or turns it off, so only the owner ends an open gate, by Change Request. Documents, config and data stay writable. A review that finds nothing does not clear the gate. If the guard denies a write, go back to step 3. The guard does not check a shell command that writes source or the manifest. It reads the form of each finding line, not whether the line is true. The law puts the gate before the repository exists, but the hook acts only inside a repository, at a source write or an edit of the manifest. Like every kit hook, the guard allows the call if it has an internal error, and it says so.
5. BUILD ONE SLICE. The Programmer hat opens only after the interview pass and an owner-approved spec (GATE-04, GAME-11). The machine part of GATE-04 is the advise at step 2. Build the smallest slice that works. Edit only the files of this chunk, and put each tunable value in config (DES-05, DES-06, DES-04). In the session these rules are law text, and nothing checks them. The subagent hook gives them to each subagent as advise, but only their ids when the block is over the size cap. When a write makes a source file grow past one Read, the guard tells the agent to list the subjects of the file (DES-03: advise). It does this once per file per session, on the agent's context only. It never asks for a split because of size. An install command on the root settings list makes the host ask the owner (GATE-03: ask). A script that installs a package is not asked. An Edit that removes a call-form assertion from a file whose path names a test, probe, spec, verify or assert gets a deny (GATE-11: deny). The bare form gets an advise. An edit that deletes a block or several lines gets the fence question (GATE-12: advise). The agent hook denies a subagent spawn whose brief does not have its headings. It asks the owner when the spawns in one turn go over the cap (DES-11).
6. INNER GATE. After each small change that you can verify, run the repository's verify gate, stop, say what changed and what it proves, and wait (GAME-12). If the verify gate fails or the owner rejects the slice, go back to step 5. A trivial, reversible, single-file edit that the owner asks for is exempt. The machine part is the Stop card. It blocks the first stop of each turn that changed source, then it lets the turn end. Its GAME-12 line asks for the verify gate's command and its pasted output (GAME-12: advise). It does not run the verify gate, and it grades nothing. In an approved autonomous loop the Reviewer holds this gate (AUTO-05), and the owner's loop runner, outside the kit, runs the verify gate. A FAIL goes back to the Builder until its attempts are used, and then the story is BLOCKED. On the loop branch the guard denies an Edit or Write to the story ledger (AUTO-04), and it denies a push, merge or pull, a switch off the branch, and a rename, copy or forced move of a branch or a ref written by hand; from any branch it denies a push, merge or pull, a branch rename, copy or move, or a written ref, that names a loop branch (AUTO-11).
7. OUTER GATE. At each chunk boundary, run the cross-check against DECISIONS.md, ARCHITECTURE.md, the subsystems, the config, the tests and the core goal. End it with Proceed yes or no (GATE-05). Check the Definition of Done (GATE-07). Update the documents, and end HANDOFF.md with the opening prompt for the next session (DES-07, DES-14). After parallel agents, start one more agent with the manifest and the whole diff. Then ask the owner before you continue (GAME-12). If Proceed is no, go back to step 5. If Proceed is yes, go to step 8. The same Stop card asks for the documents, the Change Request a change needs, the cross-check and the Definition of Done in the reply, but it grades none of them. A turn that changed only documents or config gets no card (unless git status in a repository lists more entries than the Stop hook reads; see chart 4, step 6), and neither does a repository outside the root, where the manifest advise and the design gate still act; do this step by hand in those cases.
8. CHANGE REQUEST. If a locked decision must change, write a Change Request: the change, the reason, the affected areas, the risk, the required updates, and the final decision with its rationale (GATE-06). The owner decides (AUTO-01). If the owner says yes, add a dated Change Log row. Then go back to step 2 for the required updates and a new cross-check. If the owner has not decided, the Change Request waits in the Open Questions table. If the owner says no, the locked decision stays, and drift is not permitted (DES-02): go back to step 5 and make the work agree with the decision. If no locked decision must change, go to step 9. The Stop card adds a Change Log line, and blocks once, only when DECISIONS.md changed with no dated row in a turn that also changed source. It sees a dated row, not the owner's approval. Every Stop card also asks whether the turn changed design, behaviour, config, risk, execution, data flow or dependencies, and if it did, to name its Change Request (GATE-06: advise); it does not check the answer.
9. NEXT CHUNK, OR DONE. Update the Build Timeline and HANDOFF.md. For the next chunk, go back to step 1 for each decision that it still needs. When its decisions are already locked, go to step 5. When no chunk is left, the work is done. The next session opens with a state card from HANDOFF.md only where the brain's route policy turns the card on. The kit template has it off (DES-14, GAME-13: advise). If a shipped tool fails later, open SPEC.md and look for the failure mode (GATE-10). If the spec does not list it, add it to the spec first. Then go back to step 2, and fix the code through steps 5 to 7, with step 8 if a decision changes. In the session GATE-10 is law text, and nothing checks it. The subagent hook gives it to each subagent as advise, or only its id when the advise block is over the size cap.

## 2. A session and each prompt

This chart shows what the kit's hooks do when a session starts and each time a prompt comes in. At the start, entry.mjs checks the pointer, lists the entry path and builds the state card. At each prompt, route.mjs starts the turn, sends the law rows by route and names the skills. The route file that it writes is also what subagent.mjs reads when a subagent starts. The chart also shows where the flow goes back.

```text
  host: a session starts or resumes
                   |
                   v
+--------> 1  ENTRY PATH                  DES-13
|             no pointer: adopt line
|             compact, clear: delete routes
|             under root: list; advise
|                  |
|                  v
|          2  STATE CARD                  GAME-13
|             starts in a game repo, or   DES-14
|             (switch on) a hand-off
|             repo: advise
|                  |
|                  v
|   +----> 3  EACH PROMPT
|   |         new turn for the Stop card
|   |         (a task notice is not one)
|   |              |
|   |              v
|   |      4  MATCH GROUPS                OWN-10
|   |         always groups first,        DES-13
|   |         then words and folder;
|   |         drop groups sent before
|   |              |
|   |              v
|   |      5  PRINT ROWS                  DES-13
|   |         each group that fits;       DES-12
|   |         over the cap: hold back;
|   |         skill names; advise
|   |              |
|   |              v
|   +-next 6  TURN RUNS
|             tool calls, subagents,
|             the Stop card
+--- compact or clear
```

1. ENTRY PATH (DES-13). The host runs the entry hook when a session starts or resumes. It runs it again when the session is compacted or cleared. If there is no pointer file, the hook prints one line that tells you to run the adopt command, and does nothing more. If the pointer file cannot be read, the hook logs an error, says so, and prints the adopt line. If the host did not expand the plugin root variable, the hook logs an error, says so, and does not update the pointer. If the variable is good, the hook updates the plugin root in the pointer when the running install is of the same kind (checkout or cache). A different kind gets one warning per session, and the pointer stays as it is. If the brain folder is there, the hook writes a heartbeat. If the brain folder is not there, the hook gives a warning, and there is no entry path and no card. On a compaction or a clear, the hook deletes the route file of this session, so that the next prompt sends the law again. On a clear, it also logs whether a route file was there under the session id. It deletes the marker files of each other session that wrote none of its files in the last day, and old log lines. It never deletes the files of the session that starts. If the session starts under the root, the hook lists the entry path files in order. A file that is not there prints as MISSING. Outside the root, the hook prints one line and no entry path. The agent reads the files and says which files it read (law text; nothing checks it). This step only advises. On an internal error, the hook prints an error note with its partial output, and the session continues.
2. STATE CARD (GAME-13, DES-14). A card can come only when step 1 lists the entry path, that is, when the session starts under the root and the brain folder is there. The card comes when the session starts inside a repository that sits below a top-level folder that the route policy maps to a card group (a game repository). The kit template maps no folder, so the brain must map one. If the brain turns on the hand-off switch (the kit template ships it off), any other repository under the root that holds a hand-off also gets a card. A session that starts at the root gets no card. The card shows what git, the manifest and the hand-off say, with the age of each document. It also shows the Next session prompt of the hand-off, or a line that says there is none. The agent posts the card, adds the hats in play and names each disagreement with the disk before work (law text; nothing checks it). If the card cannot be built, the hook says so, and the entry path stays. This step only advises.
3. EACH PROMPT. Each prompt runs the route hook. A task notice that the host sends as a prompt also runs it. If the prompt is not a task notice, the hook starts a new turn for the Stop card: it deletes the edit list, the repository list and the guard-error file of the turn, and writes the time. A task notice does not start a turn. If the prompt is empty, the hook stops here. Then the hook removes reminder blocks and task notice blocks, so that only the typed words route. If there is no pointer, the hook stops here. A prompt with no typed words left still goes on to step 4. So a task notice can still route the always groups and the folder groups.
4. MATCH GROUPS (OWN-10, DES-13). The hook reads the route policy of the brain. If the brain has no policy, it reads the kit template. If neither is there, that is an internal error (see step 5). First, the hook takes the groups that the policy sends to every session. The template lists the OWN group. A brain policy without that key sends none. Then the hook adds each group whose words are in the prompt as whole words, and the groups that the policy maps to the top-level folder of the session. It removes each group that the route file of this session already holds. The hook only sends the rows. That the agent ranks each decision and does the research is law text; nothing checks it.
5. PRINT ROWS (DES-13, DES-12). The hook compares the typed words with the name and description of each installed skill. A match counts as named for this session only after its name prints. If no group is new, the hook prints only the skill names and stops. If there are new groups, the hook takes them in order. A group that LAW.md does not have is logged and not printed. A group that does not fit under the cap is held back, and the hook goes on to the next group. A group that fits prints as its rows, with the owning files. If one or more groups print, the hook records them in the route file of this session, names the groups that it held back, and adds the skill names if they fit under the cap. Skill names that do not fit are not marked, so a later prompt that matches them names them. If no group prints, the hook prints only the skill names. The hook does not record a group that it held back. An always group or a folder group comes again on the next prompt. A word group comes again only when its words come again. This step only advises, and the hook never refuses a prompt. On an internal error, the hook says that it sent no law for this prompt.
6. TURN RUNS. The turn makes its tool calls, starts its subagents and ends with the Stop card (other charts). A subagent gets the groups that are in the route file of this session, plus the groups that the policy sends to every subagent. It does not get the groups that the policy sends only to sessions. When the next prompt comes, go back to step 3. When the host compacts the session or the owner clears it, go back to step 1. The routes of the session id that the host reports are then deleted, so the next prompt sends the always groups and the matched groups again. If the host gives a clear a new session id, that id has no routes yet, and the result is the same.

## 3. The hooks on a tool call

This chart shows what the kit's hooks do when the agent calls a tool. Each step acts only on the tools it names and says its effect. Every deny, and every 'no' to an ask, goes back to the agent.

```text
           the agent calls a tool
                   |
                   v
+--------> 1  THE HOST RUNS THE HOOKS
|             that name the tool; each step
|             acts on its own tools only
|             hook error: allow, log, say so
|                  |
|                  v
+-deny --- 2  FILE WRITE: GUARD DENIES           VCS-07
|             first deny wins: .env, frozen      SAFE-09 VCS-14
|             path, opt-in bans, design gate     MAP-01 GATE-08
|             open, loop ledger                  GATE-09 AUTO-04
|                  |
|                  v
+-deny --- 3  EDIT OR WRITE: FENCE
|             test path loses an assertion:      GATE-11
|             deny; loose form: advise
|             net deletion: advise               GATE-12 GATE-13
|                  |
|                  v
|          4  FILE WRITE: GUARD ADVISES
|             no DECISIONS.md: advise            DES-02 GATE-04
|             grows past one Read: advise        DES-03
|             records it for the Stop card
|                  |
|                  v
+-deny --- 5  SHELL: GUARD DENIES
|             per part: secret, history,         SAFE-01 VCS-07
|             dirty tree, loop push,             SAFE-06 AUTO-11
|             frozen path, opt-in bans           SAFE-09 VCS-14
|                  |
|                  v
|          6  SHELL: FENCE ADVISES               GATE-12 GATE-13
|             destructive command: advise
|             guard records the repository
|                  |
|                  v
+-deny --- 7  QUESTION: ASK HOOK DENIES          OWN-04
|             over one question, a short
|             reason, an equal-options
|             phrase, first not recommended
|                  |
|                  v
+-deny --- 8  AGENT CALL: DENY, ASK              DES-11
|             brief lacks a heading: deny
+-no -------- over the cap: ask the owner
|             under it, no model named: rewrite
|                  |
|                  v
|          9  THE CALL RUNS                      DES-13
|             a spawn: the subagent gets
|             law rows at its start: advise
+-its calls - each one starts at step 1
```

1. THE HOST RUNS THE HOOKS. The agent calls a tool. The host runs, side by side, each kit hook whose matcher names that tool: the guard on Edit, Write, NotebookEdit, Bash and PowerShell; the fence on Edit, Write, Bash and PowerShell; the ask hook on AskUserQuestion; the agent hook on Agent. No kit hook runs on any other tool at this layer. One deny from any hook refuses the call. Each step below acts only on its own tools, and a call that a step does not name goes on to the next step. If a hook has an internal error, it allows the call, writes an ERROR line to the hooks log and tells the agent and the owner. Go to step 2.
2. FILE WRITE: GUARD DENIES. For Edit, Write and NotebookEdit, the guard runs its deny rules in this order and stops at the first deny. (a) A .env file that git tracks or does not ignore; outside a repository the rule only advises. (b) A frozen or tombstoned path; the frozen list also holds copies that are not canonical. This rule needs the brain's config, and a tombstoned folder's own TOMBSTONE.md stays writable. A path spelled with a \\?\ or \\.\ prefix, or through this machine's admin share (\\localhost\C$, \\127.0.0.1\C$), is read as the drive path; an 8.3 short name, a junction or a mapped drive is not. (c) A write into the Startup folder, and (d) a content ban; these two rules run only when the brain turns them on. (e) A source write in a repository whose DECISIONS.md, at the root or in docs/, says 'Design gate: on' while its gate-cleared record is missing or does not clear the gate, and an Edit or Write that removes that line while the gate is not cleared; documents, config and data stay writable. (f) An edit of the story ledger while the repository is on the loop branch; the owner's loop runner, outside the kit, writes the pass mark. With no brain, rules (b), (c) and (d) are off, and the guard says so once per session. A deny goes back to the agent with its reason, and the guard writes a BLOCKED line to the fence log: go back to step 1. Otherwise, go to step 3.
3. EDIT OR WRITE: FENCE. The fence is a separate hook that runs beside the guard, on Edit and Write only; NotebookEdit has no fence. It checks an Edit whose old text is not empty, and a Write over a file that exists (the file on disk is the old text), in a path where a folder or file name holds as a word part a word that starts with test, probe, verify or assert, or the word spec or specs (tests/, testutils/ and x.test.js count; latest/ and special/ do not). There it denies an edit that removes a paren-form assertion (such as assert( or expect( ; a .expect( method call does not count), and an edit that adds a '* 0' term (not a multiply by 0.5, and not a C comment that opens with a zero, such as '/* 0 = off */'), unless the same edit also removes a loose-form assertion, which only advises. It only advises when a loose-form assertion goes, such as a bare assert, assert_eq! or pytest.raises. On any path, it advises when an Edit empties a block or removes several lines, and when a Write keeps too small a share of the file's bytes. A deny goes back to the agent: go back to step 1. The fence questions in the advice are law text; nothing checks the answers. Otherwise, go to step 4.
4. FILE WRITE: GUARD ADVISES. When the guard denied nothing, it runs two advise rules, and the call goes on. A source write in a git repository with no DECISIONS.md at its root or in docs/ gets a note, once per repository per session. The read check: an Edit or Write that grows a source file past one Read gets a note, once per file per session. The note goes to the agent's context only, and the owner does not see it. It asks the agent to list the file's subjects, and it never asks for a split for size. The read check skips generated files, exempt paths and NotebookEdit. Last, the guard records an edit inside a git repository for the Stop card, and records its repository. It flags a DECISIONS.md write that adds a Change Log row. The guard records the edit before the fence or the owner answers, because the hooks run side by side. Go to step 5.
5. SHELL: GUARD DENIES. For Bash and PowerShell, the guard splits the command into parts at &&, ||, ;, |, & and new lines that are outside quotes. Each part is read in the folder it runs in, after any cd, Set-Location or pushd before it in the same command, when that folder exists; a folder the guard cannot find, such as a variable, leaves it where it was. For each part, in this order, it denies: (a) a git add or git commit -a that stages a file that looks like a secret, also through a pathspec with magic such as :/ that covers the whole tree; (b) a git command that destroys history, such as gc --prune, reflog expire, a force push or a remote branch delete; (c) a git command that overwrites or hides work while the tree is dirty, and stash drop or stash clear at any time; (d) git push (or git send-pack, the plumbing under it), merge or pull on the loop branch, a push, merge or pull from any branch that names a loop branch, a push --all or --mirror while a loop branch exists, a checkout or switch that leaves the loop branch, and a git branch -m, -M, -c, -C or -f, a git update-ref or a git symbolic-ref write on the loop branch, or from any branch when it names a loop branch, and a git worktree add on the loop branch whose new worktree is not on a loop branch, and on the loop branch a git rebase that names a branch other than a local loop branch, a git bisect that can check out a commit, and a git fetch into a local branch, and from any branch a git fetch that writes a loop branch or writes a local branch from one or from a glob that can cover one; a rebase or a bisect of the loop branch that is stopped at a detached HEAD counts as the loop branch, and git rebase --quit is denied there; rebase --root, fetch --stdin and fetch --refmap are read in any abbreviation git takes; any other git command or form that moves HEAD or a branch is a residual of this rule; (e) a destructive command on a frozen or tombstoned path, which needs the brain, also when the path is spelled with a \\?\ prefix, through this machine's admin share (\\localhost\C$) or as a PowerShell provider path (FileSystem::C:\...); and (f) a schedule, when the brain turns that rule on. It stops at the first deny. Then each content ban that the brain applies to commands checks the whole command, when the command runs from a folder in the ban's scope. The guard does not see nested shells, substitutions, git aliases or scripts on disk. A deny goes back to the agent: go back to step 1. Otherwise, go to step 6.
6. SHELL: FENCE ADVISES. For Bash and PowerShell, the fence advises on a destructive command, such as a recursive delete, a hard reset or a forced branch delete, and the call goes on. The answer that it asks for is law text; nothing checks it. When the guard allowed the command, it records each repository that the command points at, so the Stop card can ask git what changed. Go to step 7.
7. QUESTION: ASK HOOK DENIES. For AskUserQuestion, the ask hook denies a call that holds more than one question. For one question, it names every problem at once. It denies when an option description is too short to carry a reason. It denies when a phrase offers the options as equally fine, except when the phrase is negated, quoted, or in a sentence that has a contrast word such as 'but'. It denies when the first option's label is not marked recommended. A deny goes back to the agent: go back to step 1. An allowed question writes the session's interview marker, which the Stop card reads. Go to step 8.
8. AGENT CALL: DENY, ASK. For Agent, the agent hook first checks the brief. It denies a brief whose lines do not start with the headings that the policy names for that agent type: the goal, the files or area, the done-check and what is ruled out. A search type needs fewer headings. The hook checks the heading words only. It does not count a denied brief: go back to step 1. Next, the hook counts the spawns of this turn. Over the cap, the host asks the owner, and the hook counts the spawn whatever the answer. If the owner says no, go back to step 1. If the owner says yes, the spawn runs with no routed model: go to step 9. At or under the cap, the hook rewrites a call that names no model with the model from the role table, if the table routes that type, and allows it. Any other call gets a note with the count. With no brain policy, the kit's template is the policy, and the hook says so once per session. Go to step 9.
9. THE CALL RUNS. The host runs the call when no hook denied it and the owner said yes to any ask. For an Agent call, the subagent hook runs as the subagent starts, and it never denies. It injects the law rows of two kinds of group: the groups that the policy sends to every subagent, and the groups active in the session, less the session-only groups. It names a group past the size cap without its rows. Then it adds the advise-by-role clauses, the interview frontier (GATE-15) among them, or only their ids when they do not fit. The Reviewer must name each of these clauses in its report (law text; nothing in the kit checks it). With no pointer file, the hook injects nothing. On an internal error, it injects a note and no law. Each tool call that the subagent makes starts again at step 1.

## 4. The end of a turn

Two hooks record each turn: the router at each owner prompt and the guard at each tool call. When the agent tries to end the turn, the Stop hook reads that record and git. When source changed, it blocks the first stop with a card, then yields on the next stop.

```text
        the owner sends a prompt
                   |
                   v
           1  TURN STARTS
              router: clear the ledger
              and the repo list; write
              the prompt time
                   |
                   v
           2  RECORD EACH CALL
              guard, each call it lets
              through: edit path to the
              ledger; its repo and commit
                   |
                   v
      the agent tries to end the turn
                   |
                   v
+--------> 3  CARD GIVEN ALREADY?
|             a stop hook blocked in
|             this turn: yield, turn ends
|                  |
|                  v
|          4  ANYTHING RECORDED?
|             no: no card, turn ends
|                  |
|                  v
|          5  WHAT CHANGED?
|             git, per repo: commits and
|             files since the prompt;
|             else ledger only, card says so
|                  |
|                  v
|          6  SOURCE CHANGED?
|             only source files count
|             no: no card, turn ends
|                  |
|                  v
|          7  NEW REPO, NO QUESTION?    GATE-01
|             yes: interview line
|                  |
|                  v
|          8  CROSS-CHECK CARD          GATE-05
|             documents touched?        DES-07
|             DECISIONS.md: dated row?  GATE-06
|             change needs a CR?        GATE-06
|             verify gate output?       GAME-12
|             Definition of Done, part  GATE-07
|                  |
|                  v
+-answer-- 9  BLOCK ONCE
              refuse this stop; card
              to the agent; nothing
              grades the answer
```

1. TURN STARTS. When the owner sends a prompt, the router hook deletes the session's edit ledger and repository list, then writes the prompt time. It also deletes the guard-error file of the session. A background-task notice is not a prompt and resets nothing. The router does this reset before it loads its libraries, so a library that fails to load cannot keep the last turn's record. If the router cannot write the marker folder, the last turn's record and time stay.
2. RECORD EACH CALL. The guard hook runs before each Edit, Write, NotebookEdit, Bash and PowerShell call. For each call that it does not deny, it records two things. First, an Edit, Write or NotebookEdit in a git repository under the root adds a ledger line with its path. A DECISIONS.md write that adds a dated table row gets a Change Log flag: an Edit whose new text holds more dated rows than the text it replaces, or a Write whose content holds more dated rows than the file on disk. Second, each repository that the call points at goes on the repository list once per turn, with the commit HEAD is on before the call runs. For an edit, that is the file's repository. For a shell call, it is the working folder's repository and the repository of each path word under the root. A call the guard denies is not recorded. A call that the fence denies, or that the owner refuses, is recorded, because the hooks run side by side. A call made while the guard fails inside is not recorded either. For that call, the guard adds a line to the guard-error file of the session, so the Stop hook can say that its count may be short.
3. CARD GIVEN ALREADY? The agent tries to end the turn, and the host runs the Stop hook. If the host flag stop_hook_active is set, a stop hook already blocked in this turn. The hook yields, and the turn ends. The hook keeps no record of its own card, and the flag does not say which hook blocked.
4. ANYTHING RECORDED? If the ledger and the repository list are both empty, there is no card and the turn ends. If the guard failed on a call this turn, the hook first tells the owner in a system message that the count may be short. The hook reads the config and git only after this check.
5. WHAT CHANGED? The hook reads git when the prompt time is on record and the config does not set stopFromGit to false. It looks at each ledger repository and each listed repository under the root. Git gives the files in commits made since the recorded commit, less commits older than the prompt. It also gives the uncommitted files written since the prompt. A ledger file that git ignores counts when it was written since the prompt. Otherwise the hook counts the ledger paths only, and a repository that only a shell call pointed at is dropped. A repository that git cannot read is also counted from the ledger. The hook has a time budget: stopBudgetSeconds in the brain config, 15 seconds by default, under the host timeout of 20 seconds. When the budget is spent, the hook reads git in no more repositories. It counts each of them from the ledger, logs a warning, and names them on the card. In each fallback the card says that a file a command changed is not in the count. A call that the fence or the owner refused after the guard recorded it counts as a change in a fallback; git mode drops it, because its file was not written since the prompt. When no repository on the card was read from git, the card also says that an edit refused after the guard allowed it can still be in the count. If git status lists more than 4000 entries in a repository, the hook reads only the first 4000. It logs a warning, and the card calls the count of that repository a floor.
6. SOURCE CHANGED? The hook sorts each changed path. A file name on the stopDocs list is a document. A file with a source extension is source, also in a docs folder. Any other file in a docs folder inside the repository is a document. A docs folder above the repository does not count. Any other file (config, data, other Markdown) is not counted. A repository past the git status cap counts as changed source, because its count is a floor. If no repository has a changed source file, there is no card and the turn ends. If the time budget left a repository unread, or the guard failed on a call this turn, the hook first tells the owner so in a system message.
7. NEW REPO, NO QUESTION? This step runs for each repository with changed source. If its .git was created since the prompt and the session has no question marker, the card gets the interview line for that repository (GATE-01). The ask hook writes the marker when it lets through an AskUserQuestion call that carries one question, before the owner answers. A call with no question writes no marker. One marker at any time in the session clears this check. With no prompt time on record, the check is skipped.
8. CROSS-CHECK CARD. For each repository with changed source, the card names the documents touched. If there are none, a DES-07 line asks which document must carry the change, or why none does. A GATE-06 line appears when DECISIONS.md changed and no dated table row was added. For a DECISIONS.md that git lists, a row is added when the diffs of the turn add more dated rows than they remove, so a reworded old row is not a new row. In a repository with no commit yet, each row of a staged DECISIONS.md is added. For one that git does not list, and on a card counted from the ledger, the ledger flag decides. The line needs DECISIONS.md to count as a document: a brain stopDocs list that leaves the name out turns the line off for a DECISIONS.md outside a docs folder. The line asks for the row, or why the edit is not a Change Request. On every card, a GATE-06 line also asks whether the turn changed design, behaviour, config, risk, execution, data flow or dependencies, and if it did, to name its Change Request; a behaviour change that does not touch DECISIONS.md is the common case of a missing one. The card also names each repository that was not read before the time budget ran out, and the calls that the guard failed on, so that a short count says so. The card then asks for the verify gate's command and its pasted output for each small change, or a statement that the edit was the exempt one (GAME-12), for the cross-check (GATE-05) and for part of the Definition of Done (GATE-07): what ran, any contradicted decision, and whether the result fits one screen. Its first line names every clause that it carries: DES-07, GATE-05, GATE-06, GATE-07 and GAME-12, and GATE-01 when a repository on the card has the interview line. law.json grades the six ADVISE: the hook blocks the first stop once, then yields, and grades nothing (CR-2026-10-15-GAPS D4; HOOK before).
9. BLOCK ONCE. The hook writes a STOP line to the fence log and blocks this stop. The card goes to the agent. Nothing grades the answer (law text; nothing checks it). The card says that no machine checks the answer; the only Doctor claim at this layer checks that the hook starts. The Stop card runs when the main session stops. The kit registers no SubagentStop hook, so a subagent's own stop gets no card, and its changes count on the card of the session turn in which it ran, when its calls pointed at that repository. The card asks for the verify gate's command and output (GAME-12: advise), but the hook runs no verify gate and does not check the pasted output (law text; nothing checks it). When the agent answers the card and tries to stop again, go back to step 3, where the hook yields. Calls that the agent makes before that stop go through step 2, but they get no card in this turn. If the hook fails inside at any step, it lets the stop through, logs an ERROR line and tells the owner.

## 5. The autonomous loop

This chart shows one autonomous loop run on one chunk: the start checks, the story loop and the hand-back. "(runner)" marks a step of the owner's loop runner, outside the kit. The kit itself checks none of those steps. "(kit agent)", the guard, the fence, the kit Doctor, the Stop card and the state card are parts that the kit ships. The detail lines name their effect: deny, advise, block once or RED.

```text
  by hand: the owner's loop runner, outside the kit
                   |
                   v
           1  START CHECKS (runner)             AUTO-12
              no verify gate, dirty tree,       SAFE-06
              open question, gated, red phase 0: no loop
              else loop branch                  AUTO-11
                   |
                   v
+--------> 2  NEXT STORY (runner)               AUTO-03
|             lowest priority, then id
|             owner-gate story: stop            AUTO-09
|                  |
|                  v
|   +----> 3  BUILDER (runner)                  AUTO-10
|   |         fresh context, one story          DES-06
|   |         guard deny: ledger edit;          AUTO-04
|   |         git push, merge, pull             AUTO-11
|   |         branch -m/-c/-f, update-ref,
|   |         worktree add off the loop,
|   |         rebase <up> <branch>, bisect,
|   |         fetch into a local branch
|   |              |
|   |              v
|   +-fail 4  VERIFY GATE (runner)              AUTO-07
|   |         exact success code, never         AUTO-08
|   |         "not zero"; green is a floor
|   |              |
|   |              v
|   +-fail 5  REVIEWER (kit agent)              AUTO-05
|             read-only; adds a FAIL, never     AUTO-06
|             clears one; kit Doctor RED on     AUTO-07
|             a tool change or "PASS WITH"
|                  |
|                  v
|          6  PASS MARK (runner)                AUTO-04
|             PASS and green gate: writes       AUTO-07
|             the mark; one story, one commit
|                  |
|                  v
+- more -- 7  STOP? (runner)                    AUTO-02
              owner call, BLOCKED, gate         AUTO-01
              cannot run, or chunk done
                   |
                   v
           8  HAND BACK (runner)                AUTO-13
              state card, push command, run log OBS-03
              next-session prompt: advise       DES-14
              loop cross-check: law text        GATE-05
```

1. START CHECKS (the owner's loop runner, outside the kit). The owner starts the runner by hand. Nothing in the kit starts it on a timer. The loop does not start if the project has no verify gate, if the project is on the design-gate list, if the chunk has an open question in the manifest, or if the tree is dirty or has untracked files (SAFE-06). In that case the runner reports the state and stops (AUTO-12). If not, the runner runs phase 0: the verify gate before the first story, on the tree it would start from. A red gate refuses the run, and the repository stays on the branch it was on. If the gate is green, the runner makes the loop branch, a branch whose name starts with the loop prefix (AUTO-11). The design-gate list a runner reads is the brain's `design-gate.json`, through the pointer; when it cannot read the list, it refuses with COULD-NOT-LOOK. The kit's guard rule 10 does not read that list. The kit grades AUTO-12 BUILDABLE: the runner does this step, and nothing in the kit checks it.
2. NEXT STORY (runner). The runner takes the open story with the lowest priority, then the lowest id. The story is the unit of work, and the chunk is where the loop stops (AUTO-03, ADVISE). If no open story is left, the chunk is done: go to step 7. If the next story is an owner gate (feel, motion or appearance), a person must look, so the loop stops in front of it: go to step 7 (AUTO-09, OWNER). Nothing in the kit checks this step.
3. BUILDER (runner). The runner starts a Builder in a fresh context. The Builder reads the manifest, the architecture map and the story, and builds that story only (AUTO-10, BUILDABLE; DES-06, ADVISE). On the loop branch, the kit guard reads the branch name from git. It denies an Edit, Write or NotebookEdit to the story ledger (rule 12, AUTO-04, HOOK). It also denies git push (and git send-pack, the plumbing under it), merge and pull, a checkout or switch that leaves the loop branch, which is any target but HEAD, @ or a local loop branch (harness/x~0 detaches HEAD and is denied, and so is checkout -t harness/x, which makes the branch x), and a git branch -m, -M, -c, -C or -f, a git update-ref or a git symbolic-ref write, which would take the loop's work to another name with no checkout, and a git worktree add whose new worktree is not on a loop branch, a git rebase that names a branch other than a local loop branch, a git bisect that can check out a commit, and a git fetch into a local branch; from any branch it denies a push, merge or pull, and one of those branch or ref commands, that names a loop branch, and a git fetch that writes a loop branch or writes a local branch from one (rule 11, AUTO-11, HOOK). A rebase that stops on a conflict leaves HEAD detached at the loop's work; the guard counts that, and a running bisect that started on the loop branch, as the loop branch, and denies git rebase --quit there. Any other git command or form that moves HEAD or a branch is a residual of rule 11. Commits are not denied. The other kit hooks act as they do in any session. A source write in a repository whose DECISIONS.md declares an open design gate is denied (rule 10, GATE-08). An Edit or Write that removes a call-form assertion from a measuring file is denied (GATE-11). A write that grows a source file past one Read gets a note on the agent's context, once per file (DES-03, advise). The Stop card blocks the first stop of a turn that changed source, once, and asks for the verify gate output, the Change Request, the cross-check and the Definition of Done (GAME-12, GATE-06, GATE-05, GATE-07, block once). These hooks act only if the kit loads in the Builder's process, and nobody has proven that it does. The kit guard does not see a shell write to the ledger. For that case the law gives the work to the runner: it compares a hash, restores the ledger from git and voids the attempt (law text; nothing in the kit checks it).
4. VERIFY GATE (runner). The runner runs the verify gate. No agent runs it. The runner scores the exact success code, never "not zero" (AUTO-07, BUILDABLE). A green gate is the floor, not the proof (AUTO-08, BUILDABLE). If the gate is red, the attempt fails: go back to step 3 with the reason. The failed attempt counts toward the attempt cap. Past the cap, the story is BLOCKED: go to step 7. Nothing in the kit checks this step.
5. REVIEWER (kit agent). The runner starts a separate agent. This agent scores the story against its acceptance lines and the gate result. The kit defines this agent in its reviewer agent file with the tools Read, Grep and Glob only, so it cannot write or run anything (AUTO-05, GATE). The owner runs the kit Doctor by hand. It goes RED if that tool line changes, or if a "PASS WITH" verdict comes back. The Reviewer gives PASS, FAIL or BLOCKED, with evidence for each acceptance line (AUTO-06, ADVISE). It can add a FAIL, but it never clears one (AUTO-07). When the Reviewer starts as a subagent, the subagent hook gives it the ADVISE clauses, and its report names each one as holding or as a finding (advise). A runner that starts the Reviewer as its own process builds the prompt from the same agent file plus its own input and output contract, and gives it the ADVISE clauses itself, because the subagent hook does not fire for that process. The agent file's tool line does not reach that process either: the runner's own command must hold it to the same read-only tools, and the kit Doctor does not check that command. On PASS, go to step 6. On FAIL, go back to step 3 with the reason. Past the attempt cap, the story is BLOCKED. On BLOCKED, go to step 7. The other verdict rules are law text in the agent file.
6. PASS MARK (runner). When the Reviewer gives PASS and the gate is green, the runner writes the pass mark with its own process and commits: one story, one commit. The Builder never writes the pass mark (AUTO-04), and a model verdict alone never sets it (AUTO-07). The kit does not see this write, because rule 12 binds only a tool call. Then go to step 7.
7. STOP? (runner). The loop stops at an owner decision: a manifest change other than a Change Log append, new scope, taste, a Change Request, a push or merge, a delete or move, a design-gated project, any secret, or anything that weakens a check (AUTO-02, AUTO-01). It also stops when a story is BLOCKED, when the verify gate cannot run, and when every story in the chunk passes. When it stops, go to step 8. If no stop condition applies and stories remain, go back to step 2. The kit grades AUTO-02 BUILDABLE: the runner does this step. Some kit hooks deny one part of this list. Rule 11 denies a push or merge. Rules 1 and 3 deny staging a file that looks like a secret, or writing a .env that git does not ignore. Rule 10 denies a source write behind an open design gate. The fence denies an Edit or Write that removes an assertion (GATE-11). A deny refuses that one call. It does not stop the loop.
8. HAND BACK (runner). The runner writes a state card into HANDOFF.md and prints the exact push command (AUTO-13). The kit grades AUTO-13 BUILDABLE: the runner does this step, and nothing in the kit writes or checks the card or the command. The loop never pushes and never merges (AUTO-11, HOOK by guard rule 11). The runner also keeps a run log that names what did not run (OBS-03). The law also says that this last write ends with a "## Next session" opening prompt (DES-14, ADVISE). The kit's state card prints that prompt, or says that there is none, but only when two conditions are true. The next session must start inside that repository. The repository must be in a state-card folder, or the brain must turn on the hand-off card for every repository (advise). The owner reviews the one branch and runs the push command. The law also asks the loop run to record the cross-check against the manifest, the architecture and the core goal (GATE-05) (law text; nothing checks it).

## 6. Outside the session

This chart shows the checks that the owner starts by hand, outside a session, in the order that a kit change goes through them: the law and page builds, the self-tests, the kit Doctor on the checkout, the commit and push, the page publish, the plugin update with a restart, and the brain Doctor on the new installed copy.

```text
      owner, by hand: a kit change
                   |
                   v
+--------> 1  EDIT, BUMP THE VERSION
|             in the checkout, not in the
|             running copy
|             (law text; nothing checks it)
|                  |
|                  v
+-fail---- 2  REBUILD LAW.md AND PAGE        PRIN-05
|             bad clause or page input:      SKIN-07
|             exit 1, writes nothing
|                  |
|                  v
+-fail---- 3  RUN THE SELF-TESTS
|             hook cases, Doctor, adopt;
|             a failed case: exit 1
|                  |
|                  v
+-RED----- 4  KIT DOCTOR (-Kit)              PRIN-03
|             from the checkout: law, page   DISP-07
|             match a rebuild; HONOUR only   PRIN-04
|             falls; RED or COULD-NOT-LOOK   OBS-07
|                  |
|                  v
|   +----> 5  COMMIT, PUSH                   VOICE-05
|   |         kit checkout: no shim;
|   |         nothing checks it
|   +-refuse  copied shim: bad subject
|                  |
|                  v
+-stale--- 6  PUBLISH THE PAGE
|             when it changed; stale page:
|             stops; no commit
|                  |
|                  v
|          7  PLUGIN UPDATE, RESTART
|             copies a new version only;
|             session start sets the
|             pointer, same kind only
|                  |
|                  v
|   +----> 8  BRAIN DOCTOR (Doctor.bat)      OBS-07
|   |         stale brain LAW.md: RED
|   +-brain   old config schema: RED
+-kit-------  a kit fault: RED
```

1. EDIT, BUMP THE VERSION. The owner starts every step in this chart by hand. Nothing runs on a timer or at login. Edit the kit checkout, not the copy that the host runs. When the change must reach an installed copy, increase the version in the plugin manifest (law text; nothing checks it). The page shows the version, so a bump with no page rebuild makes step 4 RED. A change with no bump is not seen by any check, and the installed copy stays old.
2. REBUILD LAW.md AND PAGE. Run the law build. It loads the clauses and any overlay. Then it checks each clause: the shape; no value in the rule (a colour, a unit, a date, a line number or a path); no count (SKIN-07); a heading in exactly one law file, and that file is the owner (PRIN-05); and a mechanism file that exists, with one anchor that names the clause verb and the mode that the grade needs. Each clause declares its grade in law.json, and the build fails unless the mechanism's anchor declares the matching mode and the clause verb. With DF_SKIP_HOOK_FILES set to 1, a missing mechanism file or anchor is a warning, not a failure, for a chunk that has not landed. If a check fails, the build prints every fault, exits 1 and writes nothing. Then run the page build. A missing input file, a missing README section or Core flow block, a grade that the page does not know, a transcript with no header, or an unfilled placeholder stops it, and it writes nothing. Its check mode exits 1 when the page on disk is stale. If either build fails, go back to step 1.
3. RUN THE SELF-TESTS. On each system you ship for, run the hook cases, the Doctor self-test and the adopt self-test. Each one exits 1 when a case does not give the expected result. If a case fails, go back to step 1. The architecture map asks for these three runs before a change is done, but nothing checks that they ran (law text; nothing checks it).
4. KIT DOCTOR (-Kit). Run the Doctor script of the checkout with -Kit. Doctor.bat -Kit runs the Doctor of the installed copy, and that Doctor checks the installed copy, not this change. In -Kit mode the Doctor checks the checkout with the kit's own claims and needs no brain. It builds the law and the page again into a temporary file, and each must match the file on disk byte for byte (PRIN-03, VCS-15, DISP-07). A difference is RED. A build error is COULD-NOT-LOOK. The HONOUR count in LAW.md may only fall (PRIN-04): with no record, the run sets the baseline; a rise is RED unless a signed raise covers it; a signed raise works once; on RED the record does not move. The other kit claims: no private word in the kit's text files; the reviewer agent keeps read-only tools and no softened pass (AUTO-05); the restore drill log exists and is not too old, even with no change (VCS-06); each listed retired folder has a tombstone (VCS-12); each registered hook starts once on a harmless call. Survey findings are reported, and a fail finding counts only when the config sets surveyStrict. So the kit grades the survey clauses HONOUR (VCS-01, VCS-02, VCS-04, VCS-22, DES-09), and a brain that sets surveyStrict re-grades VCS-01, VCS-02 and VCS-22 to GATE in its overlay. COULD-NOT-LOOK wins over RED, and RED wins over GREEN (OBS-07, SAFE-04). If the verdict is RED or COULD-NOT-LOOK, fix the cause and go back to step 1.
5. COMMIT, PUSH. Add the Change Log row to the manifest, then commit and push (law text; nothing checks it). The kit checkout has no commit-msg shim, so no machine checks the kit's own commit. The survey reports unpushed commits only as a warning, which never changes the verdict (VCS-04, graded HONOUR). The push matters: an adopter who added the marketplace from the remote gets the change only after it. In a repository where a person copied the shim into the git hooks folder (adopt does not install it), the commit check refuses a subject that is over the limit, starts with a past-tense word, or is a bare placeholder (VOICE-05, graded BUILDABLE in the kit because adopt does not install the shim; a brain that installs it re-grades it to GATE in its overlay). A subject whose first word is Merge or Revert, in any case, is exempt. A subject in git's own 'fixup! <subject>' or 'squash! <subject>' form is exempt too. In a brain (a LAW.md at its root), the check also refuses a commit that stages a law file with no claims.json change and no No-Claim line with a reason (VCS-23, graded BUILDABLE). If the check refuses, change the message or stage the claim, then commit again (step 5). With no node, no pointer, no kit script, or an internal error, the commit goes through and the shim says so. A commit with --no-verify skips the check.
6. PUBLISH THE PAGE. When the page changed, run the publish script. It runs the page check first. If the page is stale, it stops: something changed after step 4, so go back to step 1. Then it copies the page files to the site checkout, and it adds a registry entry only when there is none. It does not commit. The owner reads the diff and commits in the site checkout.
7. PLUGIN UPDATE, RESTART. Run the plugin update. The host copies the kit again only when the version changed (host behaviour recorded in the manifest, not kit code). That is why step 1 bumps the version. Then start a session; a start, a resume, a clear and a compact each run the entry hook. The entry hook sets the pointer to the running copy only when its install kind, cache or checkout, matches the kind in the pointer. On a mismatch it warns and does not change the pointer. Nothing in the kit checks that this step ran (law text; nothing checks it). A brain can add a tree_equals claim that compares the running copy with the checkout. Its Doctor then goes RED until the two match.
8. BRAIN DOCTOR (Doctor.bat, doctor.sh). Run Doctor.bat or doctor.sh in the brain. It finds the kit through the pointer, so it tests the change only after step 7. A missing node, pointer, pointer folder, Doctor script, git, or readable config gives COULD-NOT-LOOK, and so does a crash of the Doctor itself: it prints the file and line and exits 2, never RED. A brain config with an older schema than the Doctor expects is RED, with a MIGRATE note. Then the brain's claims run: the pointer, the brain's LAW.md against a fresh build (BRAIN-LAW-01, which adopt ships), the HONOUR ratchet on that file, the restore drill, the tombstones and the manifest scans. The route hook reads its rows from the brain's LAW.md. Nothing rebuilds it after an update, so an update that changes the law turns the brain Doctor RED until the owner rebuilds it with the command in the Doctor manual (PRIN-03, VCS-15). The build reads the installed state that adopt wrote under the brain's state folder; when that file is gone, the claim is COULD-NOT-LOOK until adopt runs again. If the fault is in the brain, for example an old config schema, fix the brain and run step 8 again. If the fault is in the kit, go back to step 1.
