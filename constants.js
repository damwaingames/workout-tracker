/* Shared constants — imported by every other module. No dependencies of its own. */

export const WEEKS = 4;
export const STORAGE_KEY = "workout-tracker-v2";
export const MIN_SETS = 1, MAX_SETS = 6, DEFAULT_SETS = 2;
export const MIN_ROUNDS = 1, MAX_ROUNDS = 6;
// A recovery day's circuit timing (all seconds, except rounds). These defaults
// reproduce the original hardcoded behaviour: 2 rounds, 1 min stations, 15 sec
// rest between stations, no rest between rounds.
export const CIRCUIT_DEFAULTS = { rounds: 2, workSec: 60, restSec: 15, roundRestSec: 0 };
// Daily nutrition fields, in column order. The user logs these by hand (numbers
// copied from whatever app they track in) — kcal and the three macros are all
// independent inputs; nothing is derived. `id` is the log-key segment, `head`
// the column header, `unit` the header's small print, `label` the aria name.
export const NUTRIENTS = [
  { id: "kcal", label: "Calories", head: "Cals", unit: "kcal" },
  { id: "carb", label: "Carbs", head: "Carbs", unit: "g" },
  { id: "fat", label: "Fat", head: "Fat", unit: "g" },
  { id: "protein", label: "Protein", head: "Protein", unit: "g" },
];
// Human-facing release version (semver), surfaced in the footer. Bump on each
// deploy and keep CACHE in sw.js in lockstep — it carries the same number.
export const APP_VERSION = "1.3.0";
