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
// How a strength exercise's logged set maps to tonnage (weight × reps). The
// stored weight/reps are always exactly what the user typed; a non-standard mode
// only scales that set's contribution to the volume total and relabels one input.
// `wMult`/`rMult` are the tonnage multipliers, `wUnit` overrides the weight "kg"
// unit, `rUnit` annotates the reps input. First entry is the default (and an
// absent `ex.loadMode` resolves to it). For tonnage, doubling either factor
// doubles the product — so per-side and two-dumbbell give the same total; they
// differ only in which input is relabelled.
//   standard      — load as entered.
//   per-side      — one side logged but both worked: reps ×2, reps shown "/side".
//   two-dumbbell  — per-dumbbell weight logged but both moved: weight ×2, "kg/db".
export const LOAD_MODES = [
  { id: "standard", label: "Both sides", wMult: 1, rMult: 1 },
  { id: "per-side", label: "Per side", wMult: 1, rMult: 2, rUnit: "/side" },
  { id: "two-dumbbell", label: "Two dumbbells", wMult: 2, rMult: 1, wUnit: "kg/db" },
];

// Resistance-band tiers for banded exercises, lightest → heaviest. A band has no
// true fixed weight (resistance climbs as it stretches and varies by brand), so
// each tier carries only an *approximate* kg equivalent — a rough proxy used as
// the "weight" in band tonnage (kg × reps). Ordered for the picker; `id` is the
// stored value. kg figures are mini-loop-band midpoints (≈5–30 lb across the set).
export const BANDS = [
  { id: "x-light", label: "X-Light", kg: 3 },
  { id: "light", label: "Light", kg: 5 },
  { id: "medium", label: "Medium", kg: 8 },
  { id: "heavy", label: "Heavy", kg: 10 },
  { id: "x-heavy", label: "X-Heavy", kg: 12 },
];
// The neutral starting band when a move is first marked banded — the middle tier,
// derived so the "sensible default" lives in one place rather than as a literal.
export const DEFAULT_BAND = BANDS[Math.floor(BANDS.length / 2)].id;

// Seed types for the "class" logger — a class is any extra session you did on a
// day (type + free-text note + minutes), logged on top of the planned workout.
// Each type carries a `rate` in kcal/min/kg, so a class's calorie burn estimates
// as rate × minutes × bodyweight. The list is editable: a new type typed into the
// add-class form is remembered (starting at rate 0, set in the Edit-mode editor).
export const DEFAULT_CLASS_TYPES = [
  { name: "Yoga", rate: 0.02 },
  { name: "Pilates", rate: 0.04 },
  { name: "Box-Fit", rate: 0.08 },
];

// Human-facing release version (semver), surfaced in the footer. Bump on each
// deploy and keep CACHE in sw.js in lockstep — it carries the same number.
export const APP_VERSION = "1.10.0";
