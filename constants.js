/* Shared constants — imported by every other module. No dependencies of its own. */

// Default block length (real calendar weeks). N is block-owned and variable now (ADR-0024) —
// this is only the length a freshly-seeded / migrated block starts at, not a hard cap.
export const DEFAULT_WEEKS = 4;
export const STORAGE_KEY = "workout-tracker-v2";
// The store-schema versions this build can load and restore. The gate lives here once so
// normalise / applyBackup can't drift apart. Bump by appending the new version. v6 is the
// training-model rework (Sessions of Groups of Items; the exercise owns its performance history;
// a Block is a container — ADRs 0019–0030).
export const SUPPORTED_VERSIONS = [2, 3, 4, 5, 6];
export const STORE_VERSION = 6;

// A Routine is one weekday's slot in a Block's weekly template: a Session you compose, a Class
// you attend, or Rest (an empty day). The strength/recovery/steady kinds collapsed into Session
// (ADR-0019); Rest stopped being a kind (it is just absence made visible — ADR-0024).
export const ROUTINE_KINDS = ["session", "rest", "class"];

/* ---------------------------------------------------------------------- *
 * Progression vocabulary (ADRs 0021, 0022)                               *
 * ---------------------------------------------------------------------- */
// The rep-zone a loaded rep-item falls in, derived from its reps (or its rail). Classification +
// trend only, never the mechanic (ADR-0021). `max` is the inclusive upper rep bound of the band.
export const ZONES = [
  { id: "strength", label: "Strength", max: 6 },
  { id: "hypertrophy", label: "Hypertrophy", max: 14 },
  { id: "endurance", label: "Endurance", max: Infinity },
];
// A rep-item's default rail (the [floor, ceiling] range double progression works between).
export const DEFAULT_RAIL = [8, 12];
// The achievable per-dumbbell weights (kg) across the user's dumbbells — the discrete-load ladder the
// double-progression "add load" step snaps to (ADR-0031), so a kg target is always a weight you can
// actually pick up. Ascending. Mostly the adjustable dumbbells' settings, plus the fixed 3 kg moulded
// pair (a valid rung between 2.5 and 3.5 — you'd just swap to it). The 1 kg punch weights are
// deliberately NOT here: they feed a time-volume weighted-punch (no rail, so double progression never
// touches it), not rep loading. This is the app's single kg ladder; a per-dumbbell weight in every
// loading mode (a two-dumbbell set logs kg/db). Supersedes the old flat +2.5 kg step.
export const DUMBBELL_KG = [2.5, 3, 3.5, 5, 6, 7, 8, 9.5, 10.5, 11.5, 13.5, 16, 18.5, 20.5, 23, 24];

// The optional per-set RIR marker (ADR-0027) — proximity to failure in three buckets. Advisory
// exactly like e1RM: logged on the Performance, may nudge the target, never gates progression. Most
// sets carry none (the unset default). `id` is the stored value; ordered easy→hard for the picker.
export const RIR_BUCKETS = [
  { id: "easy", label: "Too easy" },   // RIR 4+ — reps in reserve
  { id: "ideal", label: "Ideal" },     // RIR 2–3 — on target
  { id: "hard", label: "Too hard" },   // RIR 0 — to failure
];

/* ---------------------------------------------------------------------- *
 * Load metrics & bands (ADR-0023, 0029)                                  *
 * ---------------------------------------------------------------------- */
// The metric an exercise's Load is a magnitude on. Intrinsic to the exercise; the magnitude is
// logged per performance. `kg` free weight (bodyweight is just 0 kg), the two band families,
// an ordinal machine `machine-level`, or `none` (a timed skill/conditioning move — no resistance).
export const LOAD_METRICS = ["kg", "mini-loop", "long-band", "machine-level", "none"];

// The one x-light → x-heavy tier ladder both band families share (ordered for the picker; `id`
// is the stored value). Each family carries its OWN tier→kg table below — a mini-loop "heavy" is
// not a long-band "heavy" (ADR-0029).
export const BAND_TIERS = [
  { id: "x-light", label: "X-Light" },
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "heavy", label: "Heavy" },
  { id: "x-heavy", label: "X-Heavy" },
];
// The two band families, each with its own tier→kg equivalent (the user's real measured
// resistances). A band has no true fixed weight (resistance climbs as it stretches), so these are
// approximations used only to feed the volume-load readout and e1RM (which needs a real kg) — never
// a progression metric (ADR-0029). A mini-loop "heavy" (19 kg) is not a long-band "heavy" (41 kg).
export const BAND_FAMILIES = {
  "mini-loop": { label: "Mini-loop", kg: { "x-light": 4.5, light: 8, medium: 13.5, heavy: 19, "x-heavy": 25 } },
  "long-band": { label: "Long resistance-band", kg: { "x-light": 11, light: 20, medium: 32, heavy: 41, "x-heavy": 54 } },
};
// The neutral starting tier when a banded move is first placed — the middle of the ladder.
export const DEFAULT_BAND_TIER = BAND_TIERS[Math.floor(BAND_TIERS.length / 2)].id;

/* ---------------------------------------------------------------------- *
 * Equipment (ADR-0023)                                                   *
 * ---------------------------------------------------------------------- */
// The kit an exercise can require — a curated set of tags matched to real gear. Filters, never
// gates: its first job is the Holiday Session, which takes exercises whose required kit ⊆ the
// reduced away-from-home set (AWAY_KIT).
export const EQUIPMENT = [
  "adjustable-dumbbells", "dumbbells-3kg", "martial-weights-1kg",
  "mat", "bench", "mini-loops", "resistance-bands", "door-anchor",
];
// The reduced kit you travel with — the Holiday Session is assembled only from exercises whose
// required equipment ⊆ this set (ADR-0025).
export const AWAY_KIT = ["mini-loops", "resistance-bands", "door-anchor"];

/* ---------------------------------------------------------------------- *
 * Loading mode & tonnage (ADR-0029)                                      *
 * ---------------------------------------------------------------------- */
// How a free-weight exercise's logged set is read for the volume-load (tonnage) readout — NOT a
// progression input (ADR-0029). It relabels the inputs and carries the wMult/rMult pair that keeps
// tonnage honest: per-side counts the reps on both sides, two-dumbbell the weight on both. First
// entry is the default (an absent `ex.loadMode` resolves to it).
export const LOAD_MODES = [
  { id: "standard", label: "Both sides", wMult: 1, rMult: 1 },
  { id: "per-side", label: "Per side", wMult: 1, rMult: 2, rUnit: "/side" },
  { id: "two-dumbbell", label: "Two dumbbells", wMult: 2, rMult: 1, wUnit: "kg/db" },
];

/* ---------------------------------------------------------------------- *
 * Group / session defaults (ADR-0019)                                    *
 * ---------------------------------------------------------------------- */
// A Group is items × N rounds with a rest-within (0 = superset) and a rest-after (all seconds
// except rounds). Straight sets default to a lone-item Group with a between-sets rest-after.
export const DEFAULT_ROUNDS = 3;
export const STRAIGHT_SET_REST = 90;   // rest-after between straight sets, seconds
export const DEFAULT_STATION_SEC = 45; // a circuit station's default work duration, seconds
export const DEFAULT_STEADY_MIN = 30;  // a steady item's default duration, minutes

// The shared wind-down's default weekly adherence target and nightly duration (ADR-0028): a daily
// mobility habit done most nights (~6 of 7), tracked outside the block like body measurements.
export const WINDDOWN_DEFAULTS = { durationMin: 10, weeklyTarget: 6 };

// Seed names for class types (ADR-0014/0030). A class type is now a first-class entity that owns
// its attendance history (state.classes), seeded from these; the plan references it by id.
export const DEFAULT_CLASS_TYPES = ["Yoga", "Pilates", "Box-Fit"];

/* ---------------------------------------------------------------------- *
 * Google Drive backup (Phase 1 of device sync — ADR-0006)               *
 * ---------------------------------------------------------------------- */
// GOOGLE_CLIENT_ID is the OAuth 2.0 Web-application client ID (public, safe to commit — no secret
// in the browser token flow). Left empty, the Drive buttons stay hidden (driveEnabled reads false).
export const GOOGLE_CLIENT_ID = "519272429593-7qm9mnii4abr059d55t494r83vt8an8g.apps.googleusercontent.com";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const DRIVE_FILENAME = "workout-tracker-state.json";

// Human-facing release version (semver), surfaced in the footer. Bump on each deploy and keep
// CACHE in sw.js in lockstep. v5.0.0 landed the v6 store rework; v5.0.1 moves the Library behind
// its own top-level tab; v5.1.0 renders the block as a read-only week grid; v5.2.0 makes a Session's
// Items loggable — each round records a Performance on the exercise; v5.3.0 adds Edit-mode authoring
// (compose a block in the UI — Sessions/Groups/Items, rails, kind switch, reorder, weeks, no JSON);
// v5.4.0 surfaces progression — a rep-Item's ghost, double-progression target, e1RM trend + guide ghost;
// v5.5.0 adds the three logged extras — per-set RIR (advisory nudge), per-session RPE, and a tonnage
// volume-load readout (session + block), plus a collapse chevron on Session cards; v5.6.0 adds the
// Holiday Session — definable from the away-eligible exercises, swapped into a day with the 🏝 toggle;
// v5.7.0 adds the Wind-down — the daily mobility habit tracked outside any block as weekly adherence;
// v5.8.0 logs Class attendances (minutes / wearable burn / note) + gives the Library exercise editing
// and retire/un-retire — the last v6-rework slice; v5.8.1 makes the service worker network-first, so a
// new deploy shows up on the next launch instead of stranding a device on the cached old shell;
// v5.8.2 gives the render→handler contract its own modules — slot.js builds and reads a slot's ctx in
// one place, actions.js declares every name that routes an event — instead of both sides spelling the
// same string literals independently (#62).
export const APP_VERSION = "5.8.2";
