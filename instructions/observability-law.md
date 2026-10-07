# Observability law — every program logs, and ships a bug plan

This file owns `SAFE-04`, `OBS-01` to `OBS-10`, and `DISP-07`. It has the same rank as the design
methodology and applies to *every* program — a bot, a game, a data engine, a one-off script. There
are no exceptions. A program that fails silently is not done; it is a defect, even when it runs.

A silent feed failure once cost three weeks: the code did not log the failure, a critical verdict
went to a bare `print()` on a stream no file kept, and the cause was hunted instead of read. This
law exists so that when something breaks, the program has already told you.

---

## (1) Log generation — report what it IS and IS NOT doing

### OBS-01

**Every program ships structured, persisted logs; a silent failure is a defect even when the
program runs.**

Write to one place on disk that survives a restart. Never `print()` to a stream the next boot
loses. Structured means one JSON object per line with the keys in `OBS-02`, so a question like
"show me everything erroneous across every tool" is one filter, not a grep over prose.

### OBS-02

**Logs carry the same keys in every language, and severity is a number on the OpenTelemetry
model, not a house spelling.**

**The five keys, JSON lines, no exceptions:** `ts` · `level` + `severity_number` · `run_id` ·
`event` · `ctx{}`.

- **`severity_number`** comes from the OpenTelemetry log data model: TRACE 1–4 · DEBUG 5–8 ·
  INFO 9–12 · WARN 13–16 · ERROR 17–20 · FATAL 21–24. The load-bearing rule is
  `severity_number >= 17` means an erroneous situation. You do not need an OTel SDK to use its
  vocabulary.
- **`run_id`** is one id generated at process start (uuid4 hex) and bound into the logger
  immediately, so every line of that run carries it. Put it in the alert and in the report header;
  without it two runs of one tool are inseparable in one file, and an alert cannot be joined back
  to the lines that caused it. If you nest, use the W3C Trace Context names: `trace_id` for the
  run, `span_id` for the sub-step.
- **The binder, per stack:** Python `structlog` `.bind()` · Rust `tracing` + `tracing-subscriber`
  `.json().with_span_list(true)` · Node `pino` `.child(ctx)` · Godot a thin autoload. The binder is
  the part that pays: it removes hand-passing context through call stacks.

### OBS-03

**Log the negative space: the critical lines say what did not happen.**

The industry name is the **dead man's switch**: the safe state requires a continuous positive
action, and the *absence* of that action is the alarm. The critical lines are "input unavailable",
"not subscribed", "fell back to X", "0 rows", "skipped because Y". A log that looks healthy but has
a silent gap is worse than a log with too much detail.

**The silent STOP needs its own mechanism, and it must not be a timer.** A tool that never ran, or
stopped halfway, produces no error line, no exception and no non-zero exit; nothing inside the
program can report its own absence. Every tool writes a **heartbeat row** to one shared store at
start and at exit — `tool · run_id · started_at · finished_at · outcome` — and the place the
operator already looks reads that table **when they open it** and says "last completed run 6 days
ago". The check happens when someone looks, so it needs no scheduler.

### OBS-04

**Never hide an error: no swallowed exception, no unreachable handler, no unlogged external
failure.**

No `except: pass`. No handler the code cannot reach. Log every caught exception with its cause.
Name every external failure — an API refusal, a missing file, a dropped connection, a retired
model identifier — in the log, with enough context to act on.

*Lesson.* A connect function reported failure by returning, and nothing read the verdict; a closed
upstream logged "connected on port 0" and crashed later as FATAL. **Ask "what reads this?" of every
declared thing** — every return value, config key, enum member and public function — and treat
zero readers as a defect. Three states exist for a declared thing: wired, deleted, or documented as
inert. "Quietly present" is not one of them.

### OBS-05

**Install the process-level crash trap in every program, because a panic or a segfault kills the
process before any handler you wrote runs.**

A segfault, a Rust panic or an unhandled promise rejection ends the log mid-sentence with nothing
that says why. Install the trap at start, in every language:

- **Python:** `faulthandler.enable(file=open(logpath, 'a'))` for hard faults the `logging` module
  never sees, **plus** `sys.excepthook` to log the traceback before exit.
- **Rust:** `std::panic::set_hook` to write payload and backtrace through `tracing` before unwind;
  the packaged form is the `human-panic` crate.
- **Node:** `process.on('uncaughtException')` and `process.on('unhandledRejection')` → log, then
  exit non-zero.
- **Godot:** enable `debug/file_logging/enable_file_logging`.

Every one ends with an **explicit final log line**. A log file with no final line is then itself
evidence of a hard kill, instead of an ambiguity.

### OBS-06

**Every check returns a code and a reason on the Nagios contract, UNKNOWN wins aggregation, and a
panel renders OK only from a genuine OK.**

Name your states — `DEGRADED{reason}`, `NO_DATA`, `BLIND` — and use the standard numbers. Every
check function returns `(code, reason)`: **0 OK · 1 WARNING · 2 CRITICAL · 3 UNKNOWN**, and
UNKNOWN takes precedence over everything in aggregation. `DEGRADED{reason}` and `NO_DATA` are code
3 with a reason string. Two hard consequences: **a panel may render OK only from a code-0 result**
— code 3 renders the reason text, never a number, never a healthy colour; and a green screen
produced by a checker that itself failed is the exact thing `SAFE-04` exists to stop.

*Lesson.* A status sidebar showed six green rows over a system whose exports had not left the
machine in weeks. Round one probed a run log for freshness; the script wrote the log whether the
export worked or not. Round two probed a success stamp; the stamp proved a push, not an export.
Round three found rows asserting on a hardcoded literal in the server source, a deny-list that
passed every value nobody had enumerated, and a premise that was false. Every one was **green by
default**. Two questions before trusting any check: **name an input that makes it fail** (if you
cannot, it is decoration), and **what does it report when it could not look?** Use allow-lists,
never deny-lists, for anything that gates a healthy colour. When two programs judge the same thing,
diff them; disagreement is the cheapest bug detector there is.

### OBS-07

**Show nothing rather than something false, and absent is not zero; a check that could not look
never reports green.**

Unreadable, absent, unparseable, permission-denied and timed-out are UNKNOWN. Asserting "nothing is
waiting" from a directory you failed to read is asserting an absence you never established. The
Doctor applies this to itself: exit 2, COULD-NOT-LOOK, is never a pass. A list of what to CHECK
misses by default; a list of what to SKIP reports by default — enumerate, then subtract with a
written reason beside each entry.

### SAFE-04

**Show nothing rather than something false: a blank panel beats a wrong number, anything
unverified is labelled, and absent is not zero.**

This is the prohibition form of `OBS-06` and `OBS-07`, stated here in full because it stops
damage. When data is missing or unverified, say so or show nothing. Write the honest label —
"structurally verified, not live-tested" — rather than the confident one. It applies to numbers, to
images (no placeholder presented as the real one), to evidence ("it compiled" is not a pass), and
to praise. Show the state in the place the operator watches: a status endpoint, a health stamp on
the output, a push to the channel they already read. A log nobody reads is not sufficient.

### OBS-08

**Every runnable tool ships a logger and a manual with a symptom, meaning and fix table.**

Build both in from the start, not after.

1. **The logger**, per `OBS-01`–`OBS-05`. A launcher also keeps its window open and tees the
   output. **Print the resolved log path as the first line of every run**, to stdout and into the
   log, so the manual can say "send the file at this path" and the person can find it.
2. **The manual** — `MANUAL.md`, or a README section "How to run + Troubleshooting" — with a
   **symptom → what it means → fix** table, and a **"When something breaks"** section answering:
   where the logs are (exact paths, which process owns which) · the triage order, cheapest first
   (the pushed alert, then the persisted log, then the live probe, then the raw artifact) · how to
   read them (the key states and what they mean) · the known silent spots, marked honestly, with a
   plan to close each.

A failure then leaves a trail, not an untraceable problem.

### OBS-09

**Every new game builds its debug watchdog before the first mechanic.**

Chunk one of a new game is a small in-engine harness that captures the engine's error channel,
unhandled rejections and console errors into a persisted ring-buffer log with a copy or export
control. It is the game-side form of `OBS-08`, so build-time failures during iteration leave a
trail. A mechanic built before the watchdog is a mechanic whose first crash is unrecorded.

### OBS-10

**A shipped tool logs to the per-user application data directory, never beside the executable.**

On Windows that is `%LOCALAPPDATA%\<AppName>\logs\`. A zip unpacked into a protected folder cannot
be written to without elevation, and the OS may silently redirect the write, so the tool fails
quietly on the operator's machine and leaves no evidence at all. Tauri's `app_log_dir` and Godot's
`user://` already resolve there. The logger rule is only true if the logger can write.

---

## (2) Measure the claim

### DISP-07

**A change that makes a claim ships the thing that measures the claim in the same commit, the
build prints it, the drawing and the check read the same function, and a figure that cannot be
regenerated does not ship.**

If a change claims "no line crosses a node", "every guard bites", "every figure is reproducible",
write the measurement in the same commit and have the build print the number. The thing that
renders and the thing that checks must read the **same function**, or they drift and the check
certifies a picture the renderer no longer draws. A figure or statistic that cannot be regenerated
from the repository is a typed fact (`PRIN-03`) wearing a chart; it does not ship. A completion
message reports what actually happened, never the totals it hoped for.

*Worked example.* Three routing attempts on a generated diagram each felt right and were wrong. A
generator-side check that counted wires passing over unrelated parts caught every one, including
the two that made it worse (five crossings → eight). The count prints in the build log.

---

## Definition of done (added to the methodology's checklist)

A subsystem is not done until it logs what it does and does not do, it has no silent failure path,
and its bug plan exists. A new silent path — a bare `print()` on a critical verdict, an
`except: pass`, an unlogged external failure — is a regression and gets a Change Request.
