# 1. Keep previousSets and previousMeasure as separate temporal scans

Date: 2026-06-07

## Status

Accepted

## Context

`previousSets` and `previousMeasure` (both in `state.js`) each walk training history
backwards from a cursor to return the most-recent-earlier reading. They share a visible
skeleton: build a monotonic `rank` over `(block, week[, day])`, take a `cutoff`, scan all
blocks × weeks, and keep the highest-rank entry whose reading is non-empty.

That shared skeleton invites merging them into one generic "history walker"
(`latestBefore(...)`) parameterised by a reader. An architecture review will keep spotting
the two rank-scans and re-suggesting the merge.

## Decision

Keep the two scans separate. Do **not** introduce a generic temporal walker.

## Consequences

The functions differ in more than their reader, and the differences are most of each body:

- **Iteration dimensionality differs.** `previousMeasure` scans `block × week` (2-D) and
  reads one scalar key. `previousSets` scans `block × day-bearing-the-placement × week`
  (3-D): it must first find *which day* an exercise is placed on, then evaluate a whole
  sets array. A generic walker would have to parameterise the iteration space itself, not
  just the reading.
- **Reader and emptiness test differ.** Scalar `!= null && !== ""` vs a sets array tested
  with `.some(w || r)`.

The only genuinely common part is the tail reduction ("keep the max-rank non-empty before
the cutoff") — about three lines. A generic `latestBefore` would take an enumerator
callback **plus** a reader **plus** an emptiness predicate: an interface wider than the
duplication it removes, a seam nothing actually varies across. By the deletion test,
removing such a walker would bring back only ~3 lines per caller — it concentrates no
complexity.

Cost accepted: the ~3-line "scan backwards, keep latest non-empty" shape stays duplicated
across the two functions. If a *third* temporal scan with the same iteration shape ever
appears, reopen this decision — three callers would change the maths.
