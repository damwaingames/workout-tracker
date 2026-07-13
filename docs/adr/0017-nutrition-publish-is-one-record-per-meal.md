# The nutrition publish is one record per logged meal, keyed by cell + meal

ADR-0016 made the **nutrition projection** one record per day, keyed by the **cell**, and argued
against per-**food-entry** records (entries are index-addressed, so they have no stable upsert
id, and Health Connect "charts the day's total whatever feeds it"). That held for *charting* but
broke *display*: a per-day record carried the day's kcal + macros and **nothing else**, and
Google Health never showed it. Health Connect stored the record — it was a structurally valid
`NutritionRecord` — but the reader's rule is *nutrients **plus at least one of** a meal type or a
food name*, and a bare daily total had neither. Worse, a whole-day total maps to no single meal,
so it could not honestly be given a meal type: Google's only buckets are breakfast / lunch /
dinner / snack.

So the record's granularity moves from the **day** to the **meal**. The PWA gains a first-class
**meal** on every **food entry** (chosen in the finder, pre-selected to the current hour), and:

- **The upsert identity is `cell` + `meal`.** One record per logged meal per day, `clientId =
  "<cell>.<meal>"` (e.g. `b1.w1.d1.breakfast`). Still **not** per-entry — entries stay index-
  addressed with no stable id — but per-meal *is* stable, because `MEALS` is a fixed, named set,
  not an open-ended list. A **schedule** reorder still moves a record's *date* and not its
  `clientId` (the cell is routine-numbered — ADR-0005), so re-publishing re-dates in place.
- **The record carries its `meal`, and the companion sets a real `MealType` from it.** This is
  the whole point: the meal type is what makes Google Health *show* the record and file it under
  the right meal. The projection stays pure (a bare `meal` id + `date`); the id→`MealType`
  mapping and the meal's nominal time-of-day are native concerns (the companion places breakfast
  in the morning, dinner in the evening, etc., in the device zone) — mirroring how ADR-0016 kept
  the `[00:00,24:00)` interval a native concern.
- **A mealless entry falls back to the first meal.** A migrated legacy `.nut.*` total, or an
  entry restored from a pre-meal backup, has no `meal`; `mealOf` buckets it under breakfast so it
  still renders and still publishes, rather than vanishing from every meal section and every
  record.

The day total is unchanged (`routineNutrition`, the sum across all meals); `mealNutrition`
partitions it, so the meals' records always sum to the day — the two cannot drift.

## Consequences

- **Everything else from ADR-0016 stands.** Write-time `clientRecordVersion`, monotonic last-
  write-wins, the single publish source, the timezone-agnostic projection — all unchanged. This
  ADR narrows *what a record is* (per-meal, meal-tagged), not *how or by whom it is written*
  (still the stateless companion — ADR-0015).
- **More, smaller records.** A day with three meals publishes three records instead of one. They
  upsert independently, so editing one meal re-writes only its record; the cost is a longer
  projection, which is bounded by 4 × logged-days and still trivially small.
- **Re-publish after the change is clean.** The per-day records this supersedes had `clientId =
  cell` (no meal suffix), so the new per-meal ids never collide with them — an old per-day record
  is simply orphaned, not overwritten. A one-time manual delete of the old entries in Health
  Connect clears them; there are only as many as days already published.
