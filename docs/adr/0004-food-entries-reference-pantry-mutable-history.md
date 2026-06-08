# 4. Food entries reference the Pantry; an OFF edit rewrites past days by design

Date: 2026-06-08

## Status

Accepted

## Context

A logged food entry can hold its nutrition one of two ways. The exercise model already
sets a precedent: a **Placement** stores `{ id, sets }` and reads the exercise record
from the **Library** live, so editing the library record changes how past placements
render. Most food diaries do the opposite — they *snapshot* a portion's nutrition at
log time, so a day's intake is frozen against later edits.

This choice matters more for food than for exercises, because the user is an **Open
Food Facts contributor** and may correct a product's data *after* logging it, and
because a re-scan can re-fetch that product.

Two shapes were considered:

1. **Reference** — entry `{ barcode, grams }`; nutrition read from
   `pantry[barcode].per100g` at render. Matches the Library/Placement precedent. A
   later OFF re-fetch updates every day that logged the food. Forces the **Pantry
   strictly append-only** (a removed Food orphans its entries).
2. **Snapshot** — the entry freezes `per100g` (or the computed contribution) at log
   time. History is immutable; the Pantry becomes a prunable pure-cache. Diverges from
   the precedent and duplicates the nutrition onto every entry.

## Decision

Take shape 1 (reference). A pantry entry is `{ barcode, grams }`; the **Pantry is the
single source** of a Food's nutrition and is **append-only**. An active re-lookup
(scan / barcode / search) of an already-cached food re-fetches from Open Food Facts
when online and updates the record — which is what actually carries a correction down
into the days that logged it.

## Consequences

- **Consistent with the Library/Placement model.** One catalogue; entries hold a
  reference plus a quantity. No second pattern for a reader to learn.

- **OFF corrections propagate into history *on purpose*.** As a contributor, the user
  wants improving data to improve past days, not leave them stale. This is the *opposite*
  of a typical food diary and **will look like a bug** to someone expecting frozen
  history — which is the whole reason this ADR exists. Do not "fix" it by snapshotting
  without reopening this decision: doing so silently severs correction-propagation, the
  feature the reference model was chosen to give.

- **The Pantry must stay append-only** — same constraint, same reason, as the exercise
  Library: a logged day references a Food by barcode, so removing one orphans every
  entry that points at it.

- **A pantry entry renders nothing meaningful if its barcode is missing** from the
  Pantry (e.g. a half-restored backup). Mitigated because the Pantry rides in the same
  `state` blob and the same `exportBackup` / `importBackup` file, so entries and their
  Foods always travel together.

- **The quick entry is the deliberate exception.** Un-barcoded food (loose fruit, meals
  out) has no Food to reference, so it carries its own frozen numbers — it *is* a
  snapshot. "Reference" applies only to barcoded entries.

- **Reopenable toward snapshots if frozen history is ever wanted** (e.g. to audit what a
  day *said* at the time): snapshot `per100g` into the entry (shape 2). Note that re-
  introduces data duplication and lets the Pantry drift from recorded history.
