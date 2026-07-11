# Context — Workout Tracker

Ubiquitous language for the codebase. Use these terms in code, comments, and review.
Architecture vocabulary (module, interface, seam, depth, leverage, locality) is kept
separate and deliberately not redefined here.

## Domain

- **Block** — a 4-week training cycle. Has an id, a name, seven **routines**, a **start
  date** (the Monday everything's **weekday**s derive from), and a per-week **schedule**.
  The unit `Reset`/`New block`/`Delete block` operate on.
- **Routine** — the recurring training unit (the catalogue entry), one of five **kinds**:
  `strength` (logged sets), `recovery` (a **circuit**), `steady` (one unbroken **duration**
  of steady-state cardio), `rest`, or `class` (a scheduled group **class**). Identified by a number
  (1–7) that is the **progression key** — the last segment of every cell key (`.d{n}` on
  the wire, frozen — ADR-0005), what every temporal scan ranks by. Its kind drives how a
  placed exercise is logged and counted; *which* exercises it accepts is the inverse — an
  exercise declares the **contexts** it's valid in (ADR-0011). Placed onto a **weekday** each week by the **schedule**.
  _Avoid_: Day (the historical term; the persisted key segment still reads `.d`).
- **Schedule** — a week's ordered arrangement of the block's seven routines across that
  week's weekdays: a permutation, one per `(block, week)`. The single driver of render
  order — never the date. Stored as a log key (so `purgeBlockLog` sweeps it); **absent →
  the most-recent earlier arranged week in the same block, else identity (1–7)**, so
  reordering an earlier week propagates forward and a new block is a clean slate.
  Reordered in Edit mode by up/down **swap-with-neighbour**. _Avoid_: week plan, layout.
- **Weekday** — the real calendar day a routine sits on for a given week:
  `block start + (week − 1) × 7 + the routine's position in that week's schedule`. Shown on
  each routine's card (e.g. "Mon 16 Jun") and **derived, never stored** — there is no
  editable per-cell date (ADR-0005); to record doing a routine on a different day you
  **reorder** it. _Avoid_: slot, date stamp.
- **Collapsed routine** — a routine folded down to just its header + focus + a one-line
  totals **summary** (strength → volume; recovery → circuit total time, plus volume when
  load-bearing; steady → minutes + resistance; class → class type, minutes + burn; any
  routine → its **Session RPE**, and — once food is logged — kcal + the full macro line
  `Nc / Nf / Np`), to cut mobile scroll. State is a persisted
  per-cell `.collapsed` flag (absent = expanded, like `.done`); completing a routine sets
  it, the header chevron toggles it. The body slides via a grid-row transition — so
  `toggleRoutine` and `afterDone` flip the class in place rather than re-rendering (a
  rebuilt element can't animate).
- **Placement** — an exercise as it sits on a routine: `{ id, sets }` for strength, bare
  `{ id }` for a circuit move (timing lives on the routine, not the move).
- **Count override** — a single week's **set** count (strength) or **round** count (recovery)
  when it differs from the block-wide **template** the other weeks inherit. Where week-to-week
  *volume* progression lives: 2 sets in week 1 then 3 from week 2, or rounds climbing across a
  cardio block. Lowering a week's count *hides* the surplus rows/rounds without deleting what
  was logged in them. (Template-or-override, not the **schedule**'s lazy-lookback — ADR-0008.)
- **Library** — the `{id → record}` catalogue of exercises. Append-only from the UI
  (no delete), which is what lets `migrateLibrary` reconcile it against the seed safely.
- **Context** — the set of **placement surfaces** an exercise is valid on, carried on the
  exercise record: the routine kinds that accept placed exercises (`strength`, `recovery`,
  `steady`) plus the **wind-down** (`mobility`). A surface is not always a routine kind and a
  kind is not always a surface — `mobility` is the wind-down segment (no routine kind), while
  `class` holds a class type and `rest` holds nothing (kinds with no context); the sets only
  overlap. Replaces the old single exercise **type**: a move can belong to several (bodyweight
  core sits in both `strength` and `recovery`), and the rule is *behaviour follows the surface,
  validity follows the exercise* — the same move logs as weight×reps in a strength routine and
  as a per-round station in a recovery **circuit**. **Banded** is the precedent: a
  cross-context property read per surface, not per exercise type.
  _ADRs_: 0011
  _Avoid_: type (the retired scalar gate).
- **Setup, cue, focus** — three guidance fields, split by *who owns them* so a movement
  isn't duplicated per context. **setup** (exercise): how to perform it, context-free.
  **cue** (exercise): the movement's *intrinsic* quality target ("move with the breath"),
  unchanged across routines. **focus** (routine): the *session's* intent, including its
  **effort target** — so interval-vs-steady RPEs live here, never duplicated onto the
  exercise. That ownership split is what lets one `seated-elliptical` serve both `recovery`
  and `steady` instead of being two near-identical records. An effort target is an
  *instruction*, not a **progression** metric: RPE is feel-based and self-normalising —
  constant perceived effort even as absolute intensity climbs with fitness — so it never
  drives progression. What climbs at constant RPE is the **absolute output**: a `steady`
  routine progresses by its logged **resistance/level** (the ordinal setting on the machine),
  not by the kg **tonnage** that strength's overload delta reads — a steady routine carries no
  tonnage. (That same self-normalising quality is why RPE *is* logged as a **Session RPE** —
  a fatigue record, a different job entirely.)
- **Loading mode** — how a strength exercise's logged set maps to tonnage
  (`standard` / `per-side` / `two-dumbbell`); a per-exercise multiplier pair (`wMult`,
  `rMult`). Distinct from **banded**.
- **Banded move** — an exercise whose load comes from a resistance **band**, not free
  weight: it logs a band tier + reps, and its tonnage is `band kg × reps × rMult`.
- **Circuit** — a recovery routine's structure: rounds + work/rest/round-rest seconds.
- **Steady** — a `steady` routine's structure: one planned **duration** (`durationMin`) of one
  cardio activity, held at the RPE its **focus** sets. The cell logs `done`, **actual minutes**,
  and the machine's **resistance/level** (bounded by the activity's `levels` — the elliptical's
  10). Progression is the resistance **ghost** (last session's level + minutes), not tonnage.
  _Avoid_: cardio (that's the activity), interval (that's a `recovery` circuit).
- **Class** — a `class` routine **kind**: a scheduled group session (Box-Fit, Pilates)
  that owns its own **weekday** rather than being squeezed onto a training day. Holds one
  **class type** (just a name) + a planned **duration**; its cell logs done, actual minutes,
  a **note** (what you did), and the **calorie burn** read from your wearable — a class's
  absolute-output metric, the analogue of strength's **tonnage** and steady's
  **resistance/level** (a class has neither). Type names match case-insensitively (logging
  "box-fit" reuses "Box-Fit"), so a spelling variant can't fork a duplicate type.
  _ADRs_: 0010, 0014
  _Avoid_: the retired "extra class on any day" add-on (a class is now always its own
  routine); the retired modeled burn (`rate × mins × bodyweight`).
- **Wind-down** — the single app-level cool-down segment (`state.winddown`): one curated list
  of **mobility**-context stretches + a target **duration**, defined once (like the **Holiday
  Workout**) and shown beneath every non-rest routine. Carries its own per-cell done-tick,
  separate from the routine's, and counts toward no total. Not a **routine** — it owns no
  routine number or **weekday**, and isn't carried in a block **import**.
  _ADRs_: 0011, 0013
  _Avoid_: cooldown, stretch routine.
- **Session RPE** — a per-session felt-intensity score (1–10) logged on each **routine** and
  on the **wind-down**: how hard *that session* was *today*. A fatigue record only, never an
  input to progression — the logged inverse of an **effort target** (the unlogged instruction).
  Load / recovery *trends* are deliberately out of scope; the wearable owns those.
  _ADRs_: 0012
- **Holiday routine** — a routine swapped to the shared **Holiday Workout** for one cell,
  for when you're away from your kit. The Holiday Workout (`state.holiday`) is a
  single app-level band-only strength routine, defined once in Edit mode and reused
  everywhere. A persisted per-cell `.holiday` flag (absent = normal, like `.done`)
  ticks it in on any routine kind: the routine keeps its number (and its scheduled
  **weekday**) but takes the Holiday Workout's kind / title / focus / exercises, and the
  band moves log against that same cell. `routineDef("holiday")` resolves the sentinel to
  `state.holiday` so the structural edit handlers reach it through the normal placement path.
- **Food** — a barcoded product record in the **Pantry**: a name, optional brand, and
  per-100g nutrition (`kcal`/`carb`/`fat`/`protein` — the same fields the manual
  nutrition grid used). Identified by its **barcode** (the primary key, so two
  references to the same product resolve to one Food). Its usual origin is **Open Food
  Facts**, but a Food can also be **authored locally** when OFF has no record of a
  scanned/typed barcode.
- **Trusted Food** — a Food whose numbers a human vouched for from the label, by
  authoring it locally or hand-correcting it. The single source of authority flips from
  OFF to the user: an OFF re-lookup must **not** overwrite a trusted Food (ADR-0004),
  whereas a plain (untrusted) OFF-sourced Food is still refreshed by one. Not a separate
  noun — a boolean property a Food carries.
- **Pantry** — the `{ barcode → Food }` catalogue of every food looked up
  (`state.pantry`). One structure doing two jobs: the **offline cache** (read when a
  lookup can't reach the network) and the **quick-pick** list (the foods you eat
  again and again). Populated from Open Food Facts when online, or **authored locally** when OFF has no
  record of a barcode. **Append-only in membership** — never removed from the UI, like
  the exercise **Library** and for the same reason: a logged entry references a Food by
  barcode, so removing one would orphan history. Its *records*, though, are mutable: an
  untrusted Food is refreshed by an OFF re-lookup, a **trusted** one only by your
  hand-correction (ADR-0004). Deliberately *not* the
  service-worker HTTP cache, which is versioned and wiped on every release.
- **Food entry** — a food eaten on a routine; the nutrition analogue of a **Placement**.
  Two kinds share one per-routine list: a *pantry entry* `{ barcode, grams }` that
  references a **Food** in the **Pantry** (nutrition read live, so a later OFF
  correction reaches the cells that logged it), and an ad-hoc *quick entry*
  (`{ name, kcal, carb, fat, protein }`) for food with no barcode — loose fruit,
  meals out — that carries its own numbers. A routine's kcal + macros are the **derived
  sum** of its entries, replacing the four hand-typed scalars the grid used; a
  pantry entry contributes `per100g × grams / 100`. Each routine card **tabs** between
  its Workout (exercises/circuit + classes) and its Nutrition (the food-entry list +
  derived totals); the active tab is a per-cell `.tab` flag, kin to `.collapsed`,
  switched independently per routine.

## Store & log

- **Store** — the single mutable `state` object (blocks, library, log, ui, …),
  persisted whole to localStorage. Reassigned only through `setState`.
- **Drive backup** — the whole **Store** as a single blob in the app's *hidden*
  Google Drive folder, in the same form a file **export** produces (so the two are
  interchangeable). The cloud twin of the Store, moved by hand: *Back up to Drive*
  overwrites the blob with this device's Store; *Restore from Drive* overwrites this
  device's Store with the blob. Whole-blob **last-write-wins**, no per-item merge —
  deliberately Phase 1 of device sync (ADR-0006). _Avoid_: sync (the destination, not
  today's behaviour), cloud save.
- **Nutrition projection** — the app's per-day nutrition (kcal + macros) reshaped for an
  external chart system (Android **Health Connect**) and **published** one-way to it: a
  derived, lossy, read-only view of the **Store**, one record per logged **weekday**, keyed
  by that day's **cell**. Categorically *not* an **Export** (the whole round-trippable Store
  blob) nor a **Drive backup** (a bidirectional twin): there is no read-back, no "restore
  from Health Connect", no merge — the Store stays the sole source of truth and Health
  Connect is a downstream sink. **Publish** is its verb (one-way, to a system the app
  doesn't own), deliberately distinct from **back up** and the reserved **sync**.
  _ADRs_: 0015, 0016
  _Avoid_: export (the whole-Store blob), sync / backup (round-trippable), feed.
- **Import** — bringing an external block design and new exercises into the **Store** by
  *merging*: a strict subset of an **export** (`library?` / `blocks?`) added additively — new
  library entries appended (never clobbering your edits), a block appended under a fresh id if
  its id collides, the **log** / **pantry** / profile left untouched. Distinct from **Restore**
  (file or Drive), which overwrites the whole Store wholesale (ADR-0006). A flawed block is
  rejected whole with an error list rather than half-applied (ADR-0009). _Avoid_: restore (the
  wholesale replace), upload, sync.
- **Log** — the flat `state.log` map. Keys are built through the key-grammar helpers
  (`cellKey`, `setKey`, `bandKey`, `classesKey`, …) and nowhere else.
- **Cell** — a `block/week/routine` coordinate (`cellKey`); the prefix every routine-scoped
  log key is hung off. The coordinate's wire format keeps its historical `.d{routineNumber}`
  segment — frozen so existing logs aren't orphaned by the day→routine rename (ADR-0005),
  even though the value is the routine number, not a weekday. The `block.id` prefix is
  load-bearing: `purgeBlockLog(blockId)` deletes a block's whole log in one prefix sweep
  (the rule, made executable). `logList(k)` owns
  the one structured shape a key can hold (a list under a cell) and `logPush`/`logRemoveAt`/`logReplaceAt`
  are its only mutators (append / remove-at / replace-at, deleting the key once its last item goes), so
  that empty-delete invariant lives in one place rather than at each call site. Scalar reads stay
  at the call site — they hide no invariant, so wrapping them would only add shallow seams.

## Conventions

- **Dispatch by `data-*` tag → map.** Every event routes through a lookup map keyed by a
  data attribute, never a class scan: `data-action` (clicks → `handleClick`), `data-fh`
  (special field handlers → `fieldByName`), `data-refresh` (which running total a logged
  field re-patches live → `refreshBy`), `data-after` (which post-toggle effect a stateful
  checkbox runs → `afterCheck`). CSS classes are for styling and test selection
  only — they don't route behaviour.

## Queries

- **Routine load** (`routineLoad`) — a routine's training load as two facts from one walk:
  `{ total, loadBearing }`. **Load-bearing** is structural, not value-based: a strength
  routine always is; a recovery routine becomes load-bearing the moment a banded move is
  placed (before any reps are logged, while `total` is still 0); a rest routine never is.
  Render reads both facts here rather than re-deriving the banded predicate. A **holiday
  routine** loads from the Holiday Workout instead (resolved here from the cell's `.holiday`
  flag), so every caller — including `renderVolumes`' all-weeks scan — counts the right total.
- **Progression** (`previousSets`) — the most-recent-earlier *non-empty* reading for an
  exercise before a cursor. Banded moves track too (they log a reps field, so the scan
  finds them) — their ghost placeholder + "Last:" line show last session's reps. A
  **holiday routine** is skipped for free: that week logs the band moves, not the
  routine's normal exercises, so the scan reads the normal exercise as empty there and
  resumes against the last non-holiday week. The scan has no holiday-specific code — see
  ADR-0002.
- **Routine-volume delta** (`previousRoutineTotal`) — the progressive-overload change for a
  routine vs the **most recent *normal* (non-holiday) session of that routine** — scanning
  back across weeks and block boundaries (rank like `previousSets`, per routine number) for
  the latest earlier same-routine that carried load, **skipping holiday weeks** and unlogged
  weeks. So `normal · holiday · normal` compares the third week to the first, not the
  holiday one in between. Null on a holiday routine itself (holiday weeks aren't a tracking
  surface) or when there's no earlier normal session. Shown on the routine-volume line as a
  signed `+N kg` / `−N kg` chip (green up / amber down); `renderVolumes` patches it live
  in both the body line and the collapsed summary (shared `data-vol-delta`).
