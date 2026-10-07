# Lessons — errors already paid for, each with the rule it produced

This file owns `DES-08`. Every other entry here is an event that produced a clause in `LAW.md`; the
clause id is the rule, and the owning file holds its full text. An event with no rule is a story
and does not belong here. Add a new lesson at the top of its group: date · what happened · the
clause it produced.

### DES-08

**Every workaround carries an inline note saying what failed and why this is the fix, because an
unexplained correction gets cleaned up and the defect returns.**

When you write a workaround or correct a problem, add a note where the change is: *what failed*
and *why this is the fix*. A code comment beats a manifest entry beats a commit line, because the
next reader meets the code first. Do not write "what it does"; write "what forced it". A fix with no
reason looks arbitrary, the next reader or agent removes it, and the bug returns. (Adopted
2026-06-25.)

*Worked example.* `# Clamp dt at both ends: the first animation-frame timestamp can precede the
load-time baseline, and a negative dt gave a negative arc radius that threw and froze frame one.`
Without that line, the clamp is a suspicious no-op and gets removed.

---

## Verification and probes

**2026-09-22 · A claim whose needle also matches the note recording its own removal can never go
red.** A Doctor claim proving a retired folder still had a live consumer used a bare word as its
needle; the consumer had been removed, and the comment documenting the removal contained the word.
Green for two weeks over a false fact; found by a read-only reviewer, not the author. → `VCS-23`
(pin the needle to the string that disappears; prove every claim RED on a sabotaged copy).

**2026-09-22 · A list of what to CHECK misses by default.** A sweep for unversioned folders read a
hand-typed list of paths and ran green for months while a folder holding two hundred files existed
nowhere else and had no git, because nobody had listed it. → `VCS-01` (absence is a claim needing
proof) · `OBS-07` (enumerate, then subtract with a written reason).

**2026-09-03 · A health check that cannot fail is worse than no health check.** Six green rows over
a system whose exports had not left the machine in weeks: a freshness probe on a log written
whether the job worked or not; then a stamp that proved a push, not an export; then rows asserting
on a hardcoded literal, a deny-list, and a false premise. Every one green by default. → `OBS-06`
(a panel renders OK only from a genuine OK; allow-lists) · `OBS-07` (could-not-look is UNKNOWN).

**2026-09-02 · A green suite after a parallel build is not a cross-check.** Three parallel agents,
a thousand green tests; one cross-check agent with the manifest and the full diff found two defects
the suite could not see, because each agent had proven its own file and nothing had proven the
composition. → `GATE-05` (cross-check after each chunk) · `DES-11` (one more agent after parallel
agents land) · `AUTO-05` (the reviewer is separate).

**2026-08-17 · A gate review that finds nothing is a failed review.** A checklist said the gate
passes when the adversarial review "returned nothing behaviour-changing", which rewards a shallow
review. Two independent passes on the same design returned 38 findings. → `GATE-09`.

**2026-08-17 · Verify a first push against the remote's file listing.** Three local checks were
green — ignore file covers the secret, staged list omits it, no secret string in any committable
file — and none is evidence of what landed on the remote. → `VCS-07` (the proof step: query the
remote's own listing).

**2026-08-12 · Drive it live; a mockup cannot prove feel.** Every visual chunk of a game had been
proven as a static mockup and ported blind. Minutes of real play found the project would not open
from its own launcher, the backdrop out-contrasted the actors, and the pickups out-shone every
threat. → `AUTO-09` (a person is the gate for feel, motion and appearance).

**2026-08-04 · Wire a hook trigger; a written lesson gets re-learned.** The same mistake was made a
third time after being written down twice. The fix was a `PreToolUse` hook that fires at the
moment of the action, silent in the common case, pipe-tested before wiring. → `PRIN-04` (the next
misbehaviour produces a mechanism, not a paragraph).

**2026-07-20 · Feel-gate on real play before the dependent layers.** A mechanic passed screenshots,
forty probes and two audits and was rejected in one real flight. Its replacement gated the core loop
on the owner playing the half-built slice before anything was built on top. An interim build that
does not say what is not in it yet reads as a bug. → `AUTO-09`.

## Documents and manifests

**2026-08-17 · Read the brain before you build, not after the fourth deliverable.** A whole
repository was built and four rounds shipped without opening the entry point. Everything produced
broke a law already written: no interview, no manifest before code, no gate on a tool whose output
costs money, a single-file structure the law had retired. The work was not bad; it was unaligned,
which costs more because it looks finished. → `DES-01` · `GATE-01` (a long, specific prompt is a
first proposal, not permission to skip the design).

**2026-07-28 · A stale document is a defect, and the hand-off goes stale first.** A hand-off still
described chunk 0 as the current state weeks after five major systems shipped, in the one place a
fresh agent is told to trust. → `DES-07` · `GAME-13` (the state card comes from the documents, and a
disagreement with the real state is raised first).

**2026-07-11 · Read the manifest's change log and the branches before any build.** A slice was
designed from the code plus an external spec and started on the main branch; the manifest recorded
the same work already two thousand lines into an adopted plan on a side branch. → `DES-02`.

**2026-06-25 · Annotate every workaround with what forced it.** → `DES-08` (above).

**undated · Documents are co-equal artifacts; drift is debt.** A project's documents said twelve
puzzles; the code had nineteen. → `DES-07`.

## Architecture and scope

**2026-09-07 · A vendor's model identifier lives in config.** A hosted model was retired by its
vendor; every call failed with "model not found"; the bot stayed connected and looked healthy for
weeks because the one error line went to a console nobody read. Second time for the same bot.
→ `DES-04` (every tunable in config, with an environment override) · `OBS-04` (log the provider,
the identifier and the failure status of every external call).

**2026-08-17 · The reference's own code answers most design questions.** Eight open questions were
put to the owner after a gate review; three were answered in the reference implementation's source,
in functions already read that session. → `OWN-05` (do not ask what you can derive; ask only what
the reference cannot answer).

**2026-07-02 · Design-first is the law; single-file is retired.** The former defaults — one file
when possible, don't organise until it hurts, momentum over architecture — were reversed for
everything, games included, because a very large file is overload. → `DES-01` · `DES-03`.

**2026-06-22 · Tools get a pre-code gap review.** The one addition to an existing document set is an
adversarial review of `SPEC.md` + `DECISIONS.md` before the repository exists; it goes into the
same document set, not a parallel design folder. → `GATE-08`.

**undated · Duplication is the overload; one canonical copy each.** Near-identical copies of one
project were the single largest source of overload. → `PRIN-05` (one subject, one file) · `MAP-01`
(confirm the canonical copy before editing anything with versions).

**undated · Never hardcode secrets.** One bot had a live token committed in its entry file; its
sibling, built the same week, used an ignored `.env`. → `SAFE-01`.

## Platform and encoding

**2026-07-14 · Hash the bytes the server serves.** A build hashed the working tree; one file was
CRLF on disk and LF in git and on the host, so the manifest stated a hash no download could match
and the integrity check refused the file forever. → `DES-09` (pin the bytes in the repository; fail
the build on CRLF text instead of hashing it).

## Method

**2026-10-06 · A rule in the entry point lost to a rule in the entry path, three times.** A
preference about how answers should sound was written, then written again, then asked for a third
time. The cause was not forgetting: a second file loaded later in the entry path owned the same
subject and said something different, and the one with more detail won. → `PRIN-05` (when a rule
does not stick, find the rule it is losing to; decide the owner; delete the loser).

**undated · Show nothing rather than something false.** A blank panel beats a wrong number; label
the unverified honestly. → `SAFE-04`.
