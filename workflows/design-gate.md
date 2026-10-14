# The design gate — the stricter instance of the methodology

This file owns `GATE-08`, `GATE-09` and `GATE-10`. Read `instructions/design-methodology.md`
first: *every* project is design-first (interview → manifest → chunked build → cross-check). The
gate is the **extra pass on top** for the work with the highest stakes. It does not separate a
designed project from an undesigned one; there are no undesigned projects.

## The prime directive

Some work must be *correct*. For that work the standard manifest and cross-check are not enough; it
also gets an **adversarial gap review before any code**. That extra pass is this gate. All other
work is still designed; it only skips the adversarial review.

### GATE-08

**Work where a wrong output costs money, safety or a person's trust gets an adversarial gap review
of the spec and the manifest before the repository exists.**

**The stakes test.** Run the gate when a wrong output costs **money, safety, or the trust of a
person who relies on the output**. Games, portfolio pieces and pitch sites do not qualify. If
unsure, ask the owner one question: "does this count as a tool whose output someone will act on?"

**The adopter's gated list lives in the brain**, in its own file, as the only copy; other files
point at it. A project enters or leaves the list by owner ruling, recorded there with the date.
An autonomous loop never runs on a listed project (`AUTO-02`, `AUTO-12`).

**Before the repository exists**, write the same documents every project keeps, but write them
*first* and in the same folder they will live in. No parallel `/design` folder, no numbered
design-file series: a second document set is duplication, and duplication is the overload.

1. **`SPEC.md`** — the specification:
   1. purpose and audience — what the tool does and for whom;
   2. a concrete definition of "correct";
   3. the named failure modes that matter (for example, "the operator sees a wrong total");
   4. the hard constraints — latency, data freshness, platform;
   5. the exact schemas and contracts — fields, types, units, nullability;
   6. the edge-case list — not the phrase "handle errors gracefully".
2. **`DECISIONS.md`** — for each real decision: the choice, the options weighed, and the reason.

**The gap review.** Before any code, send `SPEC.md` + `DECISIONS.md` for an adversarial read. Use
this prompt verbatim:

> Review this design before any implementation begins. Find gaps, ambiguities, and unstated
> assumptions. For each one: what's missing, why it matters, and the one question I need to answer
> to resolve it. Don't suggest solutions — only surface what's unclear or incomplete.

Then correct the documents. Run the review again if the changes were large. Run it with **two
independent readers** where you can: in one recorded case the second reader found the schema
defects the first did not.

*Worked example.* A read-only reporting tool that computes a weekly total an operator will quote to
other people. Wrong total → lost trust → gated. The spec names "the total counts one scaled entry
as one event, not three" as a failure mode because the review asked how a scaled entry is counted;
without the review that line would have been discovered in production.

### GATE-09

**The gate is cleared when every finding is resolved or recorded, never because the review
returned nothing; a review that finds nothing is a failed review.**

Do not create the repository until every finding from the gap review is resolved in the documents
or recorded in the manifest's Open Questions table with an owner. Treat a failed review as a
failed test.

This rule was reworded once, and the old wording is the lesson. It used to read "until the gap
review returns nothing that would change the behaviour". Worded that way, the cheapest way to pass
the gate is a shallow review — the measure became the target. Two independent passes on the design
that exposed this returned 38 findings, and the worst were invisible from the inside. **Word every
gate condition as "every finding is resolved or recorded", never as "the review found nothing".**

### GATE-10

**When a tool fails later, check the spec first; a failure the spec did not predict is a spec
failure, not only a code failure.**

Open `SPEC.md` and look for the failure mode. If the spec does not list it, add the failure mode to
the spec *first*, then correct the code. The spec is the record of what "correct" means; a defect
the spec could not have predicted means the definition of correct was incomplete, and fixing only
the code leaves the next agent with a spec that still cannot predict it. Document debt is technical
debt (`DES-07`).

## After the gate passes — still the smallest slice

The gate gives correctness, not scope. When it is clean, build the smallest slice that works of
each designed chunk and show the owner (`DES-05`), split by domain, config in `.json`. The gate
requires care; it does not authorise extra scope.

## The record the guard reads (0.1.23, CR-2026-10-13-HONOUR)

GATE-08 and GATE-09 are enforced by guard rule 10 (`hooks/guard.ps1#design-gate`). A repository
declares its gate with one line in `DECISIONS.md`, either form:

```
Design gate: on
| Design gate | on |
```

While that line stands and `records/gate-cleared.md` is absent, every source write in the
repository is refused; documents, config and data stay writable, because the gate is cleared by
writing documents. The record is read, not trusted. It carries one `Findings: <n>` line with n
above zero, and one `- ` line per finding, each marked `resolved` or `recorded`:

```
# Gate cleared

Findings: 12

- F1 resolved: the spec names the failure mode (SPEC 4.2)
- F2 recorded: Open Questions row 3, owner named
```

A record with `Findings: 0`, fewer lines than findings, or a line marked neither way refuses the
write and names the line. Removing the `Design gate` line from `DECISIONS.md` ends the gate; that
is a Change Request like any other manifest edit.
