# Canonical copies - {{OWNER_NAME}}

One subject, one file. A rule stated in two places will disagree in two places. This table says which file is the canonical copy of each subject and which files point at it.

When a subject moves, the old path keeps a one-line forwarding stub until nothing reads it: a retired but load-bearing file is never deleted while a consumer still reads it.

| Subject | Canonical file | Forwarding stubs | Since |
|---|---|---|---|
| The law | `LAW.md` (generated) | - | (YYYY-MM-DD) |
| Who the owner is | `me.md` | - | |
| How the owner's copy reads | `voice.md` | - | |
| The owner's prohibitions | `prohibitions.md` + `law.overlay.json` | - | |
| What the Doctor checks | `claims.json` + `doctor.config.json` | - | |
| The entry path | `entry.json` | - | |

## The machine-readable half (MAP-01)

This file is judgement. The enforced half is `doctor.config.json`: a copy that is not canonical
and must not be edited goes in `frozenPaths` (read, never edit) or `tombstonedPaths` (retired,
still read by something). The guard refuses an edit under either, and the Doctor reports a frozen
tree that moved. A copy named here but listed in neither is a sentence, not a rule.
