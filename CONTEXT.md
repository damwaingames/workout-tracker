# Context — Workout Tracker

Ubiquitous language for the codebase. Use these terms in code, comments, and review.
Architecture vocabulary (module, interface, seam, depth, leverage, locality) is kept
separate and deliberately not redefined here.

## Domain

- **Block** — a 4-week training cycle. Has an id, a name, and seven **days**. The unit
  `Reset`/`New block`/`Delete block` operate on.
- **Day** — one of three **kinds**: `strength` (logged sets), `recovery` (a **circuit**),
  or `rest`. The day's kind fixes which exercise **type** it accepts.
- **Collapsed day** — a day folded down to just its header + focus + a one-line totals
  **day summary** (strength → volume; recovery → circuit total time, plus volume when
  load-bearing; any day → class minutes, and — once food is logged — kcal + the full
  macro line `Nc / Nf / Np`), to cut mobile scroll. State is a persisted
  per-cell `.collapsed` flag (absent = expanded, like `.done`); completing a day sets it,
  the header chevron toggles it. The body slides via a grid-row transition — so `toggleDay`
  and `afterDone` flip the class in place rather than re-rendering (a rebuilt element
  can't animate).
- **Placement** — an exercise as it sits on a day: `{ id, sets }` for strength, bare
  `{ id }` for a circuit move (timing lives on the day, not the move).
- **Library** — the `{id → record}` catalogue of exercises. Append-only from the UI
  (no delete), which is what lets `migrateLibrary` reconcile it against the seed safely.
- **Loading mode** — how a strength exercise's logged set maps to tonnage
  (`standard` / `per-side` / `two-dumbbell`); a per-exercise multiplier pair (`wMult`,
  `rMult`). Distinct from **banded**.
- **Banded move** — an exercise whose load comes from a resistance **band**, not free
  weight: it logs a band tier + reps, and its tonnage is `band kg × reps × rMult`.
- **Circuit** — a recovery day's structure: rounds + work/rest/round-rest seconds.
- **Class** — an extra logged session (`{ type, desc, mins }`) on top of the planned
  workout, on any day kind. Each **class type** carries a `rate` (kcal/min/kg). Type
  names are matched case-insensitively (logging "box-fit" reuses "Box-Fit"), so a
  spelling variant can't fork a duplicate type.
- **Holiday day** — a day swapped to the shared **Holiday Workout** for one cell,
  for when you're away from your kit. The Holiday Workout (`state.holiday`) is a
  single app-level band-only strength day, defined once in Edit mode and reused
  everywhere. A persisted per-cell `.holiday` flag (absent = normal, like `.done`)
  ticks it in on any day kind: the day keeps its number but takes the holiday day's
  kind / title / focus / exercises, and the band moves log against that same cell.
  `dayDef("holiday")` resolves the sentinel to `state.holiday` so the structural
  edit handlers reach it through the normal placement path.
- **Food** — a product from Open Food Facts, identified by its **barcode** (OFF's
  primary key, so two look-ups of the same product resolve to one Food). Carries a
  name, optional brand, and per-100g nutrition — the same `kcal`/`carb`/`fat`/
  `protein` the manual nutrition grid used.
- **Pantry** — the `{ barcode → Food }` catalogue of every food looked up
  (`state.pantry`). One structure doing two jobs: the **offline cache** (read when a
  lookup can't reach the network) and the **quick-pick** list (the foods you eat
  again and again). Populated from Open Food Facts when online. Append-only from the
  UI, like the exercise **Library** and for the same reason: a logged day references
  a Food by barcode, so removing one would orphan history. Deliberately *not* the
  service-worker HTTP cache, which is versioned and wiped on every release.
- **Food entry** — a food eaten on a day; the nutrition analogue of a **Placement**.
  Two kinds share one per-day list: a *pantry entry* `{ barcode, grams }` that
  references a **Food** in the **Pantry** (nutrition read live, so a later OFF
  correction reaches the days that logged it), and an ad-hoc *quick entry*
  (`{ name, kcal, carb, fat, protein }`) for food with no barcode — loose fruit,
  meals out — that carries its own numbers. A day's kcal + macros are the **derived
  sum** of its entries, replacing the four hand-typed scalars the grid used; a
  pantry entry contributes `per100g × grams / 100`. Each day card **tabs** between
  its Workout (exercises/circuit + classes) and its Nutrition (the food-entry list +
  derived totals); the active tab is a per-cell `.tab` flag, kin to `.collapsed`,
  switched independently per day.

## Store & log

- **Store** — the single mutable `state` object (blocks, library, log, ui, …),
  persisted whole to localStorage. Reassigned only through `setState`.
- **Log** — the flat `state.log` map. Keys are built through the key-grammar helpers
  (`cellKey`, `setKey`, `bandKey`, `classesKey`, …) and nowhere else.
- **Cell** — a `block/week/day` coordinate (`cellKey`); the prefix every day-scoped log
  key is hung off. The `block.id` prefix is load-bearing: `purgeBlockLog(blockId)` deletes
  a block's whole log in one prefix sweep (the rule, made executable). `logList(k)` owns
  the one structured shape a key can hold (a class list under a cell). Scalar reads stay
  at the call site — they hide no invariant, so wrapping them would only add shallow seams.

## Conventions

- **Dispatch by `data-*` tag → map.** Every event routes through a lookup map keyed by a
  data attribute, never a class scan: `data-action` (clicks → `handleClick`), `data-fh`
  (special field handlers → `fieldByName`), `data-refresh` (which running total a logged
  field re-patches live → `refreshBy`). CSS classes are for styling and test selection
  only — they don't route behaviour.

## Queries

- **Day load** (`dayLoad`) — a day's training load as two facts from one walk:
  `{ total, loadBearing }`. **Load-bearing** is structural, not value-based: a strength
  day always is; a recovery day becomes load-bearing the moment a banded move is placed
  (before any reps are logged, while `total` is still 0); a rest day never is. Render
  reads both facts here rather than re-deriving the banded predicate. A **holiday day**
  loads from the Holiday Workout instead (resolved here from the cell's `.holiday` flag),
  so every caller — including `renderVolumes`' all-weeks scan — counts the right total.
- **Progression** (`previousSets`) — the most-recent-earlier *non-empty* reading for an
  exercise before a cursor. Banded moves track too (they log a reps field, so the scan
  finds them) — their ghost placeholder + "Last:" line show last session's reps. A
  **holiday day** is skipped for free: that week logs the band moves, not the day's
  normal exercises, so the scan reads the normal exercise as empty there and resumes
  against the last non-holiday week. The scan has no holiday-specific code — see ADR-0002.
- **Day-volume delta** (`previousDayTotal`) — the progressive-overload change for a day
  vs the **most recent *normal* (non-holiday) session of that day number** — scanning
  back across weeks and block boundaries (rank like `previousSets`, per day number) for
  the latest earlier same-day that carried load, **skipping holiday weeks** and unlogged
  weeks. So `normal · holiday · normal` compares the third week to the first, not the
  holiday one in between. Null on a holiday day itself (holiday weeks aren't a tracking
  surface) or when there's no earlier normal session. Shown on the day-volume line as a
  signed `+N kg` / `−N kg` chip (green up / amber down); `renderVolumes` patches it live
  in both the body line and the collapsed summary (shared `data-vol-delta`).
