# 2. Substitute the Holiday Workout by a per-cell flag, not a per-week placement list

Date: 2026-06-08

## Status

Accepted

## Context

A day's exercise list (`day.exercises`) is **per-block** — shared across all four
weeks of the block. Only the log is per-cell (`block/week/day`). The requirement was
to swap in a band-only "Holiday Workout" for individual days while away from a full
kit, **without disturbing the rest of the block**, and — crucially — so that when the
same day comes round the next normal week, its progression tracks against the last
*non-holiday* session, not the holiday one.

Two shapes were considered:

1. A **per-cell placement override** — store an alternate `{id, sets}[]` under a new
   log key per substituted cell, editable per day, seeded from a template.
2. A **per-cell flag** that swaps in one **shared** app-level Holiday Workout
   (`state.holiday`) by reference.

## Decision

Take shape 2: a single shared `state.holiday` day, ticked into any cell by a persisted
`.holiday` flag. `dayLoad` and the renderer resolve the flag to swap in the holiday
day's kind + exercises for that cell; the band moves log under the real cell. The
structural edit handlers reach the shared definition through a `dayDef("holiday")`
sentinel, reusing the existing placement path (sets / add / remove / picker).

Leave **`previousSets` untouched**.

## Consequences

- **The progression-skip requirement falls out for free.** `previousSets` keeps the
  most-recent-earlier *non-empty* reading. A holiday day logs the band moves, never
  the day's normal exercises, so that week reads empty for them and the scan skips
  straight to the last non-holiday week. No holiday-specific branch enters the scan —
  which keeps faith with ADR-0001 (don't widen the temporal scans for a seam nothing
  varies across). The holiday band moves are all `banded`, and banded moves never show
  a "Last:" line, so they need no history of their own either.

- **One definition, edited once.** Chosen over the per-cell override (shape 1) for
  simplicity and consolidation: every holiday day is the same band routine, edited in
  one place. The cost — you can't make one holiday day differ from another — is
  acceptable for a holiday and was the user's explicit preference. If per-day holiday
  variation is ever genuinely needed, reopen this: the override (shape 1) is the path,
  and `.holiday`-flagged cells would carry their own list instead of a bare flag.

- **Additive, no schema bump.** `state.holiday` backfills from seed in `normalise`
  (like body-stats / class types); the `.holiday` flags are ordinary log keys, swept by
  `purgeBlockLog`'s block-prefix purge. Old backups import unchanged.

- **`dayLoad` owns the resolution.** It reads the flag and swaps the exercise list
  internally (via the shared `holidaySwap` helper, which the renderer also uses), so
  every caller — notably `renderVolumes`' all-weeks scan — counts the right total
  without each re-deriving the substitution. The cell coordinates stay the real day's;
  only the kind + exercises come from the holiday day.

- **Band-only is convention, enforced where it's cheap.** The skip's cleanliness rests
  on the holiday moves being banded: a banded move logs under its own id and shows no
  cross-day "Last:" line, so it neither pollutes the normal day's emptiness nor needs
  history of its own. The Holiday Workout's **picker is therefore filtered to banded
  moves**, so the natural path keeps the invariant. The **Create-new-exercise** path is
  *not* constrained — a user who deliberately creates and adds a non-banded move (or one
  that also sits on a normal day) can blur the skip for that one exercise that week.
  Accepted as a self-inflicted edge: hard-enforcing it (forcing `banded` on anything
  added to the holiday day) would cost more than the niche it closes. Revisit if it ever
  bites in practice.
