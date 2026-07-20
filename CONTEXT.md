# Context — Workout Tracker

Ubiquitous language for the codebase. Use these terms in code, comments, and review.
Architecture vocabulary (module, interface, seam, depth, leverage, locality) is kept
separate and deliberately not redefined here.

## Domain

- **Block** — a **container** that assembles a **weekly template** — an ordered set of **routines**,
  one per weekday — repeated over **N** real calendar weeks (its id, name, **start date**, and
  length; N is variable). Owns the *plan* only, never an **exercise**'s **performance** history
  (ADR-0020), so deleting a block removes a plan, not history. _ADRs_: 0020, 0024. _Avoid_: cycle (a
  block need not be 4 weeks).
- **Routine** — one weekday's slot in a **block**'s **weekly template**: it holds a **session** (a
  workout you compose) or a **class** (an external event), or is empty — a **Rest** day. Reordering
  a day is a plain plan edit; its **weekday** is a real date. _ADRs_: 0019, 0024. _Avoid_: Day
  (historical); kind (the retired structural gate — `strength`/`recovery`/`steady` no longer distinct).
- **Rest** — a **routine** with no body: an empty weekday, still drawn in the week grid (never
  collapsed away) so the seven days read true and you can't log to the wrong one. Not a kind — just
  absence made visible. _ADRs_: 0024.
- **Session** — a **routine** you compose: an ordered list of **groups**. The single
  training-routine the old `strength`/`recovery`/`steady` kinds collapsed into; whether it reads
  as lifting, conditioning, or cardio is emergent from its **items**, not chosen up front. Never
  a **class** (an external event is not composed). _ADRs_: 0019. _Avoid_: workout, kind.
- **Group** — an ordered list of **items** performed for N **rounds**, with a `rest-within`
  (between items; `0` = a **superset**) and a `rest-after` (after each round). The one rotation
  primitive: a lone-item Group is N straight **sets**; a multi-item Group is a superset or a
  **circuit**. _ADRs_: 0019. _Avoid_: superset / circuit (Group *configs*, not separate types);
  block (that is the cycle).
- **Item** — a member of a **group**: an exercise carrying a **volume** (measured in *time* or
  *reps*) and a **load**. The unit a **round** steps through; *what it tracks* — not any routine
  kind — is the only thing distinguishing a lifting item from a conditioning one. _ADRs_: 0019.
  _Avoid_: station / set / move (all Items, differing only in volume/load).
- **Load** — the resistance an **item** works against, as a magnitude on a *metric*: kg (free
  weight — **bodyweight is just 0 kg**, `+N` once you add a plate), a **mini-loop** or **long
  resistance-band** tier (two band families), an ordinal machine **level**, or *none* (a timed
  skill/conditioning move with no resistance). The metric is
  intrinsic to the **exercise**; the magnitude is logged per performance. One axis of an Item (the
  other is its **volume**); a bench's `40 kg` and a steady machine's `level 6` are the same axis in
  different units. _ADRs_: 0019. _Avoid_: weight / resistance (each is one metric, not the axis).
- **Weekday** — the real calendar date a **routine** falls on: the **block**'s **start date** plus
  the week offset plus the day's position in the **weekly template**. Shown on each card ("Mon 16
  Jun"). A **performance** carries its own logged date, so an ad-hoc shift needs no re-planning.
  _ADRs_: 0024. _Avoid_: slot; schedule (the retired permutation layer).
- **Collapsed routine** — a **routine** folded to just its header + a one-line **summary** of
  whatever its **Groups**/**Items** track, plus its **tonnage** and **Session RPE**, to cut mobile
  scroll. A persisted per-occurrence collapsed flag, toggled by the header chevron. (Auto-collapse on
  completion awaits a done flag — not yet modelled.) _ADRs_: 0012, 0019.
- **Exercise** — a movement the app knows about, owning both its *definition* — name, cueing, its
  intrinsic **volume** type (time or reps), **load** metric, **loading mode**, and required
  **equipment** — and its *history*, the timeline of **performances** it accumulates. Progression,
  **PRs**, and **e1RM** are its own, derived from that history. These properties *describe*, they
  don't *gate* (ADR-0023): any exercise can be an **Item** in any **Group**. Self-contained:
  exercises know about themselves. _ADRs_: 0020, 0023.
- **Performance** — one logged effort of an **exercise**: a date, a **load**, a **volume**, and its
  derived rep-zone, tagged with the **session** it was done in. The atomic unit of an exercise's
  history and the sole source every derived figure (PR, e1RM, ghost) reads. _ADRs_: 0020.
  _Avoid_: set / rep-log (a Performance may be time- or rep-**volume**).
- **Library** — the catalogue of every **exercise**. Append-only in membership (never shrinks); an
  unwanted exercise is **retired** — hidden from pickers, never deleted, since a **performance**
  references it and deleting would orphan history (ADR-0020).
- **Equipment** — the kit an **exercise** requires, a set of tags from a curated list matched to
  real gear: `adjustable-dumbbells` · `dumbbells-3kg` · `martial-weights-1kg` · `mat` · `bench` ·
  `mini-loops` · `resistance-bands` · `door-anchor`. Filters, never gates — its first job is the
  **Holiday Session**, which takes exercises whose required kit ⊆ the reduced away-from-home set
  (mini-loops + resistance-bands + door-anchor). _ADRs_: 0023. _Avoid_: context / type (the retired
  validity gate — an exercise is *described*, not *gated*).
- **Setup, cue, focus** — three guidance fields split by who owns them. **setup** (**exercise**):
  how to perform it. **cue** (exercise): the movement's *intrinsic* quality target ("move with the
  breath"), unchanged wherever it's placed. **focus** (the **session**'s intent): what a session is
  *for*, including an **effort target** (e.g. an RPE to hold) — an *instruction*, never a
  **progression** input (that's **double progression**; felt intensity is logged separately as
  **Session RPE** and **RIR**). Owning setup/cue on the exercise and focus on the session is what
  lets one movement serve every placement rather than being duplicated. _ADRs_: 0012, 0021.
- **Loading mode** — how a free-weight **exercise**'s logged set is read: `standard` / `per-side`
  (log one side, both worked) / `two-dumbbell` (log one dumbbell, both moved). Relabels the inputs
  (`reps/side`, `kg/db`) and carries the `wMult`/`rMult` pair that keeps **tonnage** honest — not a
  progression input (ADR-0029). Orthogonal to a **band** load metric. _ADRs_: 0029.
- **Banded move** — an **exercise** whose **load** metric is a **band family** rather than kg. Two
  families — **mini-loop** and **long resistance-band** — share one x-light→x-heavy tier ladder
  but each has its own tier→kg table (a mini-loop "heavy" ≠ a long-band "heavy"). The exercise
  declares its family; the performance logs a tier; its tier→kg feeds **tonnage** and **e1RM**
  (ADR-0029), not a progression metric. _ADRs_: 0029. _Avoid_: band (which family? — always name it).
- **Tonnage** — the volume-load figure: total **load** × **reps** over a loaded rep-**Item**, a
  **session**, or a block ("3.5 tonnes today"). A readout only, never a **progression** signal — the
  frontier judges (ADR-0029). Distinct from an **Item**'s **Volume** axis (time | reps). _ADRs_: 0029.
- **Rail** — the explicit rep range `[floor, ceiling]` a rep-**volume** **item** is programmed to
  (8–12, 10–15): the bounds **double progression** works between, and what a **zone** derives from.
  _ADRs_: 0021. _Avoid_: rep range on the exercise (it's per placement; the exercise holds only a
  default).
- **Zone** — the coarse rep-band a loaded rep-item falls in — strength ≤6 / hypertrophy 7–14 /
  endurance ≥15 — *derived* from its **rail**. Classification + trend only, never the mechanic; the
  unit progression **threads** by, per **exercise**. Only rep-volume items have one. _ADRs_: 0021.
  _Avoid_: rail (the exact range; a Zone is its coarse bucket).
- **Double progression** — the progress rule: at fixed **load**, climb **volume** to the **rail**'s
  ceiling, then add load and reset to the floor. Defines "beat this"; generalizes across metrics
  (reps+kg ≡ minutes+level); its next-set suggestion is the **target**. The kg "add load" step snaps
  to the adjustable dumbbells' **discrete ladder** (ADR-0031) — a band steps by **tier** — and once
  the load axis is maxed (heaviest dumbbell / top tier) the target keeps climbing reps instead. _ADRs_:
  0021, 0031. _Avoid_: overload delta (the retired single-number progress metric).
- **Ghost** — the reference shown before a set: your last in-**zone** **performance** (the *real*
  ghost); absent that, a **guide ghost** — an **e1RM**-seeded estimate from another zone
  (conservative, self-retiring). _ADRs_: 0021, 0022. _Avoid_: target (the double-progression
  *suggestion*; a Ghost is *history*).
- **e1RM** — estimated one-rep max, computed from a **performance** by the **Epley** formula
  (`w × (1 + reps/30)`). Advisory only — a cross-zone **trend**, the max **readout**, and the
  cold-start **guide ghost** — never the per-session judge (that's **double progression**). Needs
  load > 0. _ADRs_: 0022. _Avoid_: 1RM (a *tested* max; e1RM is estimated).
- **PR** — a personal record on an **exercise**: the best of an axis (its per-**zone** frontier, or
  top **e1RM**), derived from **performance** history and shown in the **Library**. _ADRs_: 0020, 0021.
- **Circuit** — a **group** of timed **items** with a non-zero `rest-within` (rest between
  stations): the conditioning config of the one Group primitive, not a structure of its own.
  _ADRs_: 0019.
- **Steady** — a **group** of one time-**volume** **item** carrying a machine **level** as its
  **load**, run for a single **round**: the steady-state-cardio config of the Group primitive.
  Logs actual minutes + the level; progression is the resistance **ghost** (last session's level
  + minutes). _ADRs_: 0019. _Avoid_: cardio (the activity); interval (a multi-round **circuit**).
- **Class** — the one **routine** that is not a **session**: an external attended group session
  (Box-Fit, Pilates) you *log* rather than compose. Deliberately never modelled as an **item** or a
  degenerate exercise — that fold is the failure every other tracker makes. A class **routine** holds
  only the *plan*: a reference to a **class type** + a planned **duration**. _ADRs_: 0014, 0019, 0030.
  _Avoid_: degenerate exercise; the retired "extra class on any day" add-on.
- **Class type** — a **first-class entity** (a name, matched case-insensitively so "box-fit" reuses
  "Box-Fit") that **owns its attendance history**, exactly as an **exercise** owns its
  **performances** (ADR-0020) — the class sibling of the **Library**. Kept in the `classes`
  catalogue; a **block**'s class routine references it, so deleting a block keeps every attendance.
  _ADRs_: 0030. _Avoid_: "a class type is just a name" (the pre-v6 derived-only stance).
- **Attendance** — one logged occurrence of a **class**: a date, actual **minutes**, the wearable's
  **calorie burn** (ADR-0014), and a **note**. The atomic unit of a **class type**'s history — the
  class analogue of a **Performance**. _ADRs_: 0030.
- **Wind-down** — a **daily mobility habit**: an evening stretch done most nights (a weekly target
  of ~6 of 7, typically skipping Sunday), *winged* by feel rather than a fixed plan. Tracked
  *outside* the **block** as weekly adherence (like body **measurements**); any stretches logged are
  ordinary **performances** on mobility **exercises**. Not a training **session**, not a post-workout
  cool-down. _ADRs_: 0028. _Avoid_: cool-down segment; stretch routine (it's unplanned, by feel).
- **Session RPE** — a per-**session** felt-intensity score (1–10): how hard *that session* was
  *today*. A whole-session fatigue record only, never an input to progression. Distinct from **RIR**
  (per-set intensity, not per-session fatigue). _ADRs_: 0012.
- **RIR** — an optional per-**performance** proximity-to-failure marker in three buckets: *too easy*
  (RIR 4+), *ideal* (RIR 2–3), *too hard* (to failure). **Advisory** like **e1RM** — it nudges the
  **target** but never gates **double progression** (ADR-0027). _Avoid_: RPE (that's whole-session
  fatigue — **Session RPE**); effort target (the unlogged instruction).
- **Holiday Session** — a single catch-all **session** built from exercises whose required
  **equipment** ⊆ the away-from-home kit (mini-loops + resistance-bands + door-anchor), defined
  once and swapped in for a day when you're travelling. No special progression handling: the band
  exercises accrue their own **performances** and the planned exercises' **ghosts** wait untouched
  (ADR-0025). _ADRs_: 0025. _Avoid_: Holiday Workout / holiday routine (the retired per-cell swap).

## Store & log

- **Store** — the single mutable `state` object (blocks, library, classes, log, ui, …),
  persisted whole to localStorage. Reassigned only through `setState`. Exercise **performance**
  history lives on `library` records and class **attendance** history on `classes` records
  (ADR-0020/0030); a **block** is a plan **container** and owns no logged history.
- **Drive backup** — the whole **Store** as a single blob in the app's *hidden*
  Google Drive folder, in the same form a file **export** produces (so the two are
  interchangeable). The cloud twin of the Store, moved by hand: *Back up to Drive*
  overwrites the blob with this device's Store; *Restore from Drive* overwrites this
  device's Store with the blob. Whole-blob **last-write-wins**, no per-item merge —
  deliberately Phase 1 of device sync (ADR-0006). _Avoid_: sync (the destination, not
  today's behaviour), cloud save.
- **Import** — bringing an external block design and new exercises into the **Store** by
  *merging*: a strict subset of an **export** (`library?` / `blocks?`) added additively — new
  library entries appended (never clobbering your edits), a block appended under a fresh id if
  its id collides, the **log** / profile left untouched. Distinct from **Restore**
  (file or Drive), which overwrites the whole Store wholesale (ADR-0006). A flawed block is
  rejected whole with an error list rather than half-applied (ADR-0009). _Avoid_: restore (the
  wholesale replace), upload, sync.
- **Log** — the flat `state.log` map, now **slim**: the exercise-effort key grammar re-homed to the
  exercise timelines at v6 (ADR-0020), so the log carries only per-occurrence data no entity owns —
  **Session RPE** (ADR-0012), the **collapsed** flag, and the **holiday**-swap flag (ADR-0025), all
  position-keyed — plus weekly body **measurements**. Keys are built through the surviving key-grammar
  helpers (`cellKey`,
  `cellScalarKey`, `measureKey`) and nowhere else. A position-keyed scalar follows its routine when a
  day is reordered (`swapDays`).
- **Cell** — a `block/week/position` coordinate (`cellKey`), the prefix an occurrence-scalar key
  hangs off; `.d{position}` is the routine's 0-based slot in the weekly template. The `block.id`
  prefix is load-bearing: deleting a block sweeps its occurrence + measurement keys in one prefix
  pass (`deleteBlock`) — never touching **performances** / **attendances**, which live on their
  entities (ADR-0020/0030), so the delete is safe. Supersedes the pre-v6 `purgeBlockLog` (which
  deleted logged history keyed to the wrong owner).

## Conventions

- **Dispatch by `data-*` tag → map.** Every event routes through a lookup map keyed by a
  data attribute, never a class scan: `data-action` (clicks → `handleClick`), `data-fh`
  (special field handlers → `fieldByName`), `data-refresh` (which running total a logged
  field re-patches live → `refreshBy`), `data-after` (which post-toggle effect a stateful
  checkbox runs → `afterCheck`). CSS classes are for styling and test selection
  only — they don't route behaviour.
