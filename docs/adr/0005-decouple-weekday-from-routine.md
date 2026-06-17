# 5. Decouple weekday from routine; derive dates from a per-week schedule

Date: 2026-06-17

## Status

Accepted

## Context

`day` conflated two concepts: a **routine**'s identity (the progression key — `d.day`,
the last segment of every cell key, what every temporal scan ranks by) and its **weekday
position** (which, until now, was just the order of `block.days`). The user does the same
seven routines each week but on real weekdays, in an order that shifts week to week. The
only ordering signal was an editable per-cell `.date` stamp, entered (or auto-stamped on
completion) independently per cell — so the dates drifted out of order. That drift was the
pain this change exists to kill.

## Decision

1. **Keep the cell key routine-keyed** (`block/week/routine`). Because the key — and thus
   every temporal scan (`previousSets`, `latestByWeek` → `previousMeasure` /
   `previousRoutineTotal`, `routineLoad`) — addresses cells by routine, **none of the scans
   change**. Progression follows the *routine*, not the calendar slot: move Workout A from
   Monday to Wednesday and its "Last:" line still compares to last week's Workout A. This
   is the load-bearing reason the feature is a render-order + label change, not an
   algorithm change (ADR-0001 stands untouched).

2. **A per-week Schedule** holds each week's ordering of the routines. It lives in the log
   as a per-`(block, week)` key (parallel to `measureKey`), not on the block object —
   `block.routines` is *per-block, shared across weeks* (ADR-0002's premise), and a per-week
   arrangement doesn't fit that model. Absent → **lazy lookback** to the most-recent earlier
   arranged week in the same block, else identity (1..7). So reordering an earlier week
   propagates forward to weeks not yet explicitly arranged; a new block is a clean identity
   slate. Reorder is up/down **swap-with-neighbour**, **Edit mode only** (consistent with
   every other layout change). No schema bump, no migration — old saves render identity order.

3. **The block carries a start date** (a free `YYYY-MM-DD`, editable in Edit mode,
   defaulting to the Monday of `createdAt`'s week — clean Mon–Sun weeks out of the box, but
   a midweek start is representable). Each cell's **weekday + date is derived**:
   `startDate + (week − 1) × 7 + position-in-schedule`. Nothing per-cell is stored.

4. **Drop the editable per-cell `.date`** and the auto-stamp-on-done. An editable date is
   precisely what let order drift out of sync; "I did Workout A on Wednesday" is expressed
   by **reordering** it into Wednesday's slot, which moves its order *and* its derived date
   together. The schedule is the single source of both order and date.

5. **Rename `day` → `routine` throughout** code, CSS, and test selectors — but **freeze the
   persisted `.d` key segment**: `cellKey` still emits `…​.d{routineNumber}` into
   localStorage. Renaming the wire format would orphan every existing log. The code says
   `routine`; the storage says `.d`; the gap is deliberate and lives here. Shipped as its
   own behaviour-free PR ahead of the feature.

## Considered options

- **Keep an editable per-cell date, pre-filled from the schedule.** Rejected: a date that
  disagrees with the schedule order re-creates the exact out-of-order display the feature
  removes, and forces an ambiguity over whether the weekday label follows the schedule or
  the override. `.date` reads nowhere in logic, so dropping it costs nothing.
- **One schedule per block** (not per-week). Rejected: can't record "this week I shuffled
  it," and reordering any week would silently change every week.
- **Schedule on the block object.** Rejected: muddies `block.routines`' per-block-shared
  model and forces `newBlock`/`deleteBlock` to copy it; the log key gets prefix-purge for free.
- **Per-week date anchors / mid-block-break support.** Out of scope — not asked for. A
  mid-block break is handled coarsely by editing the block start date (which shifts *all*
  weeks); per-week anchors can be revisited if breaks become common.

## Consequences

- **Every temporal scan is unchanged** — the whole point. The diff is render order, the
  weekday/date label, the reorder UI, the schedule reader, and the rename.
- **The holiday flag stays orthogonal.** A holiday-flagged routine simply takes its
  scheduled weekday like any other; ADR-0002's skip is unaffected.
- **Legacy `.date` log keys go inert** — nothing reads them, and `purgeBlockLog`'s
  block-prefix sweep still clears them on block delete, so no migration is required.
- The rename is a large but mechanical, behaviour-free diff, kept in its own PR so a real
  bug can't hide among the rename hunks.
