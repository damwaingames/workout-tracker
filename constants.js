/* Shared constants — imported by every other module. No dependencies of its own. */

export const WEEKS = 4;
// 1..WEEKS as a list, for the all-weeks scans (block totals, the nutrition migration) —
// named once so the `Array.from(…, i + 1)` incantation isn't rebuilt at each call site.
// Read-only by every consumer (forEach / map), so a single shared array is safe.
export const ALL_WEEKS = Array.from({ length: WEEKS }, (_, i) => i + 1);
export const STORAGE_KEY = "workout-tracker-v2";
export const MIN_SETS = 1, MAX_SETS = 6, DEFAULT_SETS = 2;
export const MIN_ROUNDS = 1, MAX_ROUNDS = 6;
// A recovery routine's circuit timing (all seconds, except rounds). These defaults
// reproduce the original hardcoded behaviour: 2 rounds, 1 min stations, 15 sec
// rest between stations, no rest between rounds.
export const CIRCUIT_DEFAULTS = { rounds: 2, workSec: 60, restSec: 15, roundRestSec: 0 };
// A steady routine's plan: one unbroken duration (minutes) of steady-state cardio. The
// effort target (RPE) lives in the routine's focus, not here; the resistance/level logged
// per session is the progression signal (see CONTEXT "Steady").
export const STEADY_DEFAULTS = { durationMin: 30 };
// The shared wind-down segment's default planned duration (minutes) — a short cool-down
// shown under every non-rest routine (ADR-0013). Like STEADY_DEFAULTS, the sensible default
// lives here rather than as a literal in seedWinddown / the clamp fallback.
export const WINDDOWN_DEFAULTS = { durationMin: 10 };
// The five routine kinds. The block-import validator reads from here so "what kinds exist"
// has one home. Which hold placed exercises: `strength`, `recovery`, `steady` (the contexts —
// ADR-0011); `rest` holds nothing; `class` holds a class type + duration, not exercises (ADR-0010).
export const ROUTINE_KINDS = ["strength", "recovery", "steady", "rest", "class"];
// The four nutrition fields, in display order. A routine's totals are the derived sum of
// its food entries (see routineNutrition); a quick entry stores these `id`s directly, a
// pantry entry derives them from its Food's per-100g values. `id` is the field key
// (in entries, per100g, and the quick-entry form), `head` the short label, `unit` its
// small print, `label` the aria name, and `off` the Open Food Facts nutriment key the
// lookup reads to build per100g — so the OFF field names live in exactly one place.
export const NUTRIENTS = [
  { id: "kcal", label: "Calories", head: "Cals", unit: "kcal", off: "energy-kcal_100g" },
  { id: "carb", label: "Carbs", head: "Carbs", unit: "g", off: "carbohydrates_100g" },
  { id: "fat", label: "Fat", head: "Fat", unit: "g", off: "fat_100g" },
  { id: "protein", label: "Protein", head: "Protein", unit: "g", off: "proteins_100g" },
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

// Seed names for class routines (ADR-0010) — a class is its own routine kind (Box-Fit,
// Pilates), holding one class type + a planned duration. A class type is just a name now
// (its burn is logged from your wearable per session, not modeled — ADR-0014), so it needs
// no stored list: classTypeNames derives the autocomplete/canonicalisation set from these
// seeds unioned with the class routines actually in use, never a persisted, mutated array.
export const DEFAULT_CLASS_TYPES = ["Yoga", "Pilates", "Box-Fit"];

// Google Drive backup (Phase 1 of device sync — ADR-0006). A Drive backup is the
// whole Store as one blob in the app's hidden per-app Drive folder, moved by hand.
// GOOGLE_CLIENT_ID is the OAuth 2.0 Web-application client ID from your Google Cloud
// project (public, safe to commit — there's no secret in the browser token flow). Set
// it to switch the feature on; left empty, the Drive buttons stay hidden (driveEnabled
// reads false), so the app ships dormant until you've done the one-time console setup
// documented in the README. The scope is drive.appdata (the hidden folder, not your
// visible Drive); DRIVE_FILENAME names the single blob inside it.
export const GOOGLE_CLIENT_ID = "519272429593-7qm9mnii4abr059d55t494r83vt8an8g.apps.googleusercontent.com";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const DRIVE_FILENAME = "workout-tracker-state.json";

// Human-facing release version (semver), surfaced in the footer. Bump on each
// deploy and keep CACHE in sw.js in lockstep — it carries the same number.
export const APP_VERSION = "3.2.0";
