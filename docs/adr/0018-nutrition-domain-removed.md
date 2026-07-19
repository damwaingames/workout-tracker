# The nutrition domain is removed; the app is a training tracker only

Supersedes [ADR-0003](0003-native-barcodedetector-no-scanner-library.md),
[ADR-0004](0004-food-entries-reference-pantry-mutable-history.md),
[ADR-0015](0015-nutrition-published-to-health-connect-via-stateless-companion.md),
[ADR-0016](0016-nutrition-publish-is-an-idempotent-per-day-upsert.md),
[ADR-0017](0017-nutrition-publish-is-one-record-per-meal.md).

The app grew a whole nutrition domain — **Food**, the **Pantry**, **Food entries**, **Meals**,
**Trusted Foods**, Open Food Facts lookup, native barcode scanning, and a one-way **nutrition
projection** published to Android **Health Connect** via a companion app. It worked, but it was
the app trying to be a food tracker as well as a training tracker, and nutrition is now tracked
better elsewhere (directly in Google Health). Meanwhile the one thing this app is *for* —
planning and structuring training **blocks** — was still the weakest surface. Carrying the
nutrition domain made every future change to the training core reason around food code it never
touches.

So the entire nutrition domain is removed, wholesale, to leave a focused training tracker:
exercise **Library**, **blocks** / **routines** / **schedule**, **circuits**, **steady**,
**classes**, the **wind-down**, **holiday** swaps, body **measurements**, **Session RPE**,
progression + overload, and Drive backup.

- **Deleted whole:** `off.js` (Open Food Facts), `scan.js` (barcode camera), `health.js`
  (Health Connect projection), `render-nutrition.js`, and their seven verify tests. The
  per-routine **Workout | Nutrition tabs** collapse back to a single, untabbed routine body.
- **The class calorie burn stays.** A **class** logs a wearable-read `kcal` **burn** (ADR-0014) —
  that is a *training* metric (the analogue of strength's tonnage), not nutrition, and is
  untouched. The retired thing is *food intake*, not *energy expenditure*.
- **The store schema bumps v4 → v5 with a one-way purge.** Loading a pre-v5 store runs
  `purgeNutrition`: it drops `state.pantry` and sweeps every food-entry (`.food`) and legacy
  nutrition-scalar (`.nut.`) **log** key. This is **destructive by design** — the removal the
  version bump records, not a reversible migration. Logged nutrition history is gone; that is the
  point (it lives in Google Health now). All three version gates — `normalise`, `applyBackup`
  (file / Drive restore), and `validateBlockImport` — accept v5 so new backups and block imports
  round-trip.
- **The Health Connect companion app is orphaned.** It lives in a separate repo; nothing in this
  repo publishes to it any more. It is archived there, not here.

## Consequences

- **The superseded ADRs stay as history.** 0003/0004 (scanning + Pantry model) and 0015/0016/0017
  (the publish pipeline) described real decisions that shipped and then were withdrawn whole. They
  are marked *Superseded by this ADR*, not deleted — the reasoning trail is worth keeping even
  though the code is gone.
- **A restored old backup loses its food data silently.** `purgeNutrition` runs on every load and
  on every file/Drive restore, so importing a v2–v4 backup that carried food entries strips them
  on the way in. Non-nutrition data (workouts, logs, measurements, notes) restores unchanged.
- **This is subtractive, and clears the deck.** Removing the domain is the first step toward
  making block authoring first-class (editable routine **kinds**, titles, and focus — the gap
  that motivated this): the training core is now the whole app, not half of it.
