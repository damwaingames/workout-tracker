/* The data layer: seed catalogues, the mutable store (`state` / `editing`),
 * schema normalisation + migrations, persistence, and the queries that read
 * over the store. Imports the pure helpers; nothing imports back into here that
 * would form a cycle (render/events depend on this, not the reverse).
 *
 * `state` and `editing` are exported as live `let` bindings: importers read
 * them as bare identifiers and see every update, but may only *reassign* them
 * through setState/setEditing here (ES modules make imported bindings read-only
 * for the importer). Property mutation (state.log[k] = …) works from anywhere. */

import {
  WEEKS, STORAGE_KEY, DEFAULT_SETS, CIRCUIT_DEFAULTS, WINDDOWN_DEFAULTS, DEFAULT_CLASS_TYPES, LOAD_MODES, ROUTINE_KINDS,
} from "./constants.js";
import {
  today, mondayOf, cellKey, setKey, roundRepKey, setsKey, roundsKey, bandKey, measureKey, cellScalarKey, scheduleKey,
  placement, loadMode, circuitOf, clampSets, clampRounds, uniqueId, validYMD, bandFor, bandKg,
} from "./helpers.js";

/* ---------------------------------------------------------------------- *
 * Seed data — straight from the training design doc.                     *
 * ---------------------------------------------------------------------- */
function S(id, name, setup, targetReps, loadMode) {
  const ex = { id, name, contexts: ["strength"], setup, targetReps };
  // Loading mode is optional — absent means standard (load as entered). Only the
  // multi-implement / per-side moves carry one, so tonnage is right out of the box.
  if (loadMode) ex.loadMode = loadMode;
  return ex;
}
// A recovery-circuit move is just a name + its contexts — rounds and timing live on the
// routine (the circuit), not the individual move. Seeded valid in `recovery` only; widen a
// record's contexts by hand to share one move with another kind (ADR-0007).
function C(id, name) {
  return { id, name, contexts: ["recovery"] };
}
// A mobility move — a stretch / cool-down drill for the wind-down (the `mobility` placement
// surface, ADR-0011). Like a circuit move it carries no sets (the wind-down is a checklist, not
// logged); `targetReps` is its hold / rep guide, `cue` an optional intrinsic pointer.
function mob(id, name, setup, targetReps, cue) {
  const ex = { id, name, contexts: ["mobility"], setup, targetReps };
  if (cue) ex.cue = cue;
  return ex;
}
// A catalogue is an {id → record} map; both the exercise library and the
// measurement catalogue are built this way.
function keyById(list) { const o = {}; list.forEach((x) => (o[x.id] = x)); return o; }

function seedLibrary() {
  const list = [
    S("goblet-squats", "Goblet Squats", "Hold a single dumbbell vertically against your chest.", "8–12"),
    S("bent-over-rows", "Bent Over Rows", "Hinge at the hips with a flat back, dumbbells hanging down. Pull your elbows up.", "8–12", "two-dumbbell"),
    S("banded-clamshells", "Banded Clamshells", "Loop a resistance band around your thighs just above the knees. Open your knees out.", "10–15 each side", "per-side"),
    S("bicep-curls", "Bicep Curls", "Palms facing forward, curl the weights up keeping your elbows tucked at your sides.", "8–12", "two-dumbbell"),
    S("wrist-curls", "Wrist Curls", "Forearms resting on thighs, palms facing up. Curl your wrists upward.", "8–12", "two-dumbbell"),
    S("dumbbell-rdls", "Dumbbell RDLs", "Romanian deadlifts. Soft knees, push your hips straight back, slide the weights down your thighs.", "8–12", "two-dumbbell"),
    S("floor-chest-presses", "Floor Chest Presses", "Lie on your back on the floor or a firm mattress. Press the dumbbells up.", "8–12", "two-dumbbell"),
    S("glute-bridges", "Glute Bridges", "Lie on your back, knees bent, feet flat. Squeeze your glutes and lift your hips.", "10–15"),
    S("overhead-shoulder-presses", "Overhead Shoulder Presses", "Sit or stand tall. Press the dumbbells from shoulder height up overhead.", "8–12", "two-dumbbell"),
    S("crunches", "Crunches", "Lie on your back, lift your shoulder blades slightly using your upper abs.", "8–12"),
    S("sumo-squats", "Sumo Squats", "Wide stance, toes pointed out. Hold one dumbbell down between your legs.", "8–12"),
    S("dumbbell-lateral-raises", "Dumbbell Lateral Raises", "Raise your arms straight out to the sides until parallel with the floor.", "8–12", "two-dumbbell"),
    S("donkey-kicks", "Donkey Kicks", "On hands and knees (or leaning over a table). Drive one heel toward the ceiling.", "10–15 each leg", "per-side"),
    S("dumbbell-tricep-extensions", "Dumbbell Tricep Extensions", "Hold a dumbbell overhead with both hands, bend your elbows behind your head, then extend.", "8–12"),
    S("wrist-extensions", "Wrist Extensions", "Forearms resting on thighs, palms facing down. Curl your wrists upward.", "8–12", "two-dumbbell"),
    // Added later — setups kept generic (no specific weights/resistances; those
    // are logged per set / chosen per band). Banded flags applied below.
    S("cyclist-squats", "Cyclist Squats", "Elevate your heels on small dumbbell handles. Hold a dumbbell vertically against your chest.", "8–12"),
    S("deficit-reverse-lunges", "Deficit Reverse Lunges", "Stand on your mat. Step one foot back to lunge, lowering your back knee near the floor.", "8–12 each leg", "per-side"),
    S("single-leg-rdls", "Single-Leg RDLs", "Balance on one leg. Hinge at hips keeping your back flat, lowering one dumbbell toward the floor.", "8–12 each leg", "per-side"),
    S("banded-fire-hydrants", "Banded Fire Hydrants", "On hands and knees. Band above knees. Keep your knee bent at 90° and lift your leg out to the side.", "10–15 each leg", "per-side"),
    S("single-arm-concentrated-rows", "Single-Arm Concentrated Rows", "Staggered stance, rest one elbow on your forward knee. Row a single dumbbell to your hip.", "8–12 each arm", "per-side"),
    S("banded-lat-pulldowns", "Banded Lat Pulldowns", "Hold a mini-band overhead. Pull your elbows down and out, stretching the band to your upper chest.", "10–15"),
    S("bicep-hammer-curls", "Bicep Hammer Curls", "Palms facing each other (neutral grip). Curl the weights up keeping elbows locked at your sides.", "8–12", "two-dumbbell"),
    S("deficit-push-ups", "Deficit Push-Ups", "Place your hands on dumbbell handles (or push-up blocks) on the mat. Lower your chest past your hands for extra depth.", "8–12"),
    S("seated-shoulder-presses", "Seated Shoulder Presses", "Sit tall on your mat with legs straight or crossed. Press dumbbells from shoulder height overhead.", "8–12", "two-dumbbell"),
    S("banded-tricep-kickbacks", "Banded Tricep Kickbacks", "Hinge forward stepping on one end of a mini-band. Hold the other end and extend your arm straight back.", "10–15 each arm", "per-side"),
    S("plank-dumbbell-pull-throughs", "Plank Dumbbell Pull-Throughs", "High plank. Reach under your torso with one hand to pull a dumbbell across to the other side.", "8–12"),
    S("banded-bicycle-crunches", "Banded Bicycle Crunches", "Band around feet arches. Lie on back, alternate bringing your elbow to the opposite knee against band resistance.", "10–15"),
    // Holiday-routine band moves — a minimal-kit strength session (the seedHoliday
    // workout below places these). All banded; per-side ones double their reps.
    S("banded-monster-walks", "Banded Monster Walks", "Heavy band around your ankles (and another above the knees). Drop to a half-squat and take controlled lateral steps.", "10–15 each way", "per-side"),
    S("banded-glute-bridges", "Banded Glute Bridges", "Heavy band above your knees. Drive your hips up and push your knees outward against the band at the top.", "10–15"),
    S("banded-push-ups", "Banded Push-Ups", "Light band around your forearms, hands wide enough to keep the band under tension. Lower your chest with control.", "8–12"),
    S("banded-plank-leg-abductions", "Plank with Leg Abduction", "Medium band around your ankles. Hold a forearm plank and alternate tapping each foot out to the side.", "10–15 each side", "per-side"),
    C("high-knees", "High Knees"),
    C("wall-press-ups", "Wall Press-Ups"),
    C("glute-squeezes", "Glute Squeezes"),
    C("calf-raises", "Calf Raises"),
    C("chest-opener-stretch", "Chest Opener Stretch"),
    C("banded-hip-abductions", "Banded Hip Abductions"),
    C("hollow-body-holds", "Hollow Body Holds"),
    C("seated-forward-fold-stretch", "Seated Forward Fold Stretch"),
    C("quad-stretch", "Quad Stretch"),
    C("childs-pose-or-seated-torso-twist", "Child's Pose or Seated Torso Twist"),
    // Wind-down mobility moves (ADR-0013). Seeded valid only in `mobility`; the wind-down
    // picker offers these (plus the recovery stretches widened below).
    mob("cat-cow", "Cat-Cow", "On hands and knees, alternate arching your spine up (cat) and dropping your belly with chest lifted (cow).", "8–10 slow", "Move with the breath — inhale to cow, exhale to cat."),
    mob("arm-circles", "Arm Circles", "Stand tall, arms out to the sides. Draw slow, controlled circles — forward, then backward.", "10 each way"),
    mob("cross-arm-stretch", "Cross-Arm Stretch", "Bring one arm across your chest; use the other forearm to draw it gently closer. Swap sides.", "30s each side"),
    mob("cow-face", "Cow Face", "One arm reaches down the back from above, the other up from below; clasp hands (or a strap) between the shoulder blades. Swap sides.", "30s each side"),
    mob("thoracic-opener", "Thoracic Opener", "On all fours, thread one arm under your torso, then reach it up and open through the chest, eyes following the hand. Swap sides.", "8–10 each side", "Rotate through the upper back, not the low back."),
    mob("worlds-greatest-stretch", "World's Greatest Stretch", "From a lunge with the front foot planted, drop the same-side elbow toward the floor, then rotate that arm up to the ceiling. Swap sides.", "5 each side"),
    mob("isometric-contractions", "Isometric Contractions", "Gently contract the target muscle against little or no resistance and hold, breathing steadily.", "20–30s holds", "Chase a controlled squeeze, not fatigue."),
    mob("pigeon-pose", "Pigeon Pose", "From all fours, bring one shin forward across the mat, extend the other leg back, and fold over the front shin. Swap sides.", "45–60s each side", "Ease in — back off if the knee complains."),
    mob("tree-pose", "Tree Pose", "Stand on one leg; place the other foot on the calf or inner thigh (never the knee), hands at heart or overhead. Swap sides.", "30s each side", "Fix your gaze on one point to steady the balance."),
    // A steady-state cardio activity — valid in a recovery circuit (driven as intervals) or a
    // `steady` routine (one duration). `levels` is the machine's resistance scale, the ordinal
    // a steady session logs as its progression signal (CONTEXT "Steady").
    { id: "seated-elliptical", name: "Seated Elliptical", contexts: ["recovery", "steady"], levels: 10,
      setup: "Seated elliptical. Warm up easy for 2–3 min, settle into a steady rhythm, ease off the last 2. Set the resistance to hold the effort your routine's focus calls for." },
  ];
  const lib = keyById(list);
  // Banded moves take their load from a resistance band, not free weight (across
  // both routine kinds). They log a band tier (defaulting to `defaultBand`) plus reps,
  // and their tonnage is band kg × reps × the loading-mode rep factor. `banded` is
  // what render/routineLoad branch on; `defaultBand` just pre-selects a sensible tier
  // the user can change per session.
  const band = (id, tier) => { lib[id].banded = true; lib[id].defaultBand = tier; };
  band("banded-clamshells", "light");
  band("banded-hip-abductions", "medium");
  band("banded-fire-hydrants", "heavy");
  band("banded-tricep-kickbacks", "light");
  band("banded-lat-pulldowns", "light");
  band("banded-bicycle-crunches", "light");
  band("banded-monster-walks", "heavy");
  band("banded-glute-bridges", "heavy");
  band("banded-push-ups", "light");
  band("banded-plank-leg-abductions", "medium");
  // hollow-body-holds doubles as a strength core accessory (logged as bodyweight reps) and a
  // recovery circuit station, so it's valid in both kinds (ADR-0007). The seed-union in
  // migrateContexts carries this widening to existing saves, not just fresh installs.
  lib["hollow-body-holds"].contexts = ["recovery", "strength"];
  // These recovery stretches double as wind-down moves — widen them to the `mobility` surface
  // (ADR-0011) so the wind-down picker offers them alongside the mobility-only moves. The
  // seed-union in migrateLibrary carries this widening to existing saves, not just fresh ones.
  ["quad-stretch", "glute-squeezes", "chest-opener-stretch", "childs-pose-or-seated-torso-twist"]
    .forEach((id) => { lib[id].contexts = [...new Set([...lib[id].contexts, "mobility"])]; });
  return lib;
}

// The shared Holiday Workout: a single band-only strength routine any routine can swap in
// (per-cell, via its 🏝 toggle). Day-shaped so the renderer / routineLoad treat it like
// a normal strength routine, but app-level (one definition reused across blocks) — its
// band moves log against whichever cell ticks it in, leaving that routine's own
// exercises un-logged, so previousSets resumes normal progression after the break.
function seedHoliday() {
  return {
    title: "Holiday Workout", focus: "Bands only — minimal kit", kind: "strength",
    exercises: [
      "banded-monster-walks", "banded-glute-bridges", "banded-push-ups",
      "banded-clamshells", "banded-plank-leg-abductions",
    ].map((id) => placement("strength", id, DEFAULT_SETS)),
  };
}

// The shared wind-down (ADR-0013): one app-level cool-down segment shown under every non-rest
// routine, edited once. `kind: "mobility"` is NOT a routine kind — it's the placement surface
// (ADR-0011) that routineDef("winddown") exposes, so the add / remove / create-move handlers and
// the picker reach state.winddown through the same path as the holiday sentinel reaches
// state.holiday. Bare {id} placements (a checklist, no sets); the duration is a target only.
function seedWinddown() {
  return {
    kind: "mobility", durationMin: WINDDOWN_DEFAULTS.durationMin,
    exercises: [
      "cat-cow", "arm-circles", "cross-arm-stretch", "quad-stretch",
      "pigeon-pose", "childs-pose-or-seated-torso-twist",
    ].map((id) => placement("mobility", id)),
  };
}

// Body-measurement catalogue. Bodyweight is the only mass (kg); circumferences
// are cm. The user tracks a subset (state.tracked) and can add their own.
export function M(id, name, unit) { return { id, name, unit }; }
function seedMeasurements() {
  const list = [
    M("bodyweight", "Bodyweight", "kg"),
    M("waist", "Waist", "cm"),
    M("chest", "Chest", "cm"),
    M("hips", "Hips", "cm"),
    M("thigh", "Thigh", "cm"),
    M("calf", "Calf", "cm"),
    M("bicep", "Bicep", "cm"),
    M("forearm", "Forearm", "cm"),
    M("neck", "Neck", "cm"),
  ];
  return keyById(list);
}

function seedBlock(id, name) {
  // Sets live on each placement, not the exercise — the program's strength routines
  // all start at 2 sets; circuit placements carry none (rounds/timing live on
  // the recovery routine itself).
  const routine = (n, kind, title, focus, ids) => ({
    routine: n, kind, title, focus,
    exercises: ids.map((exId) => placement(kind, exId, DEFAULT_SETS)),
    ...(kind === "recovery" ? { ...CIRCUIT_DEFAULTS } : {}),
  });
  return {
    // startDate (a Monday) is the anchor every routine's weekday derives from (ADR-0005);
    // a fresh block starts this week.
    id, name, createdAt: today(), startDate: mondayOf(today()),
    routines: [
      routine(1, "strength", "Workout A", "Squat & Row", ["goblet-squats", "bent-over-rows", "banded-clamshells", "bicep-curls", "wrist-curls"]),
      routine(2, "recovery", "Recovery A", "Cardio Flush", ["high-knees", "wall-press-ups", "glute-squeezes", "calf-raises", "chest-opener-stretch"]),
      routine(3, "strength", "Workout B", "Hinge & Press", ["dumbbell-rdls", "floor-chest-presses", "glute-bridges", "overhead-shoulder-presses", "crunches"]),
      routine(4, "recovery", "Recovery B", "Glute & Core Activation", ["banded-hip-abductions", "hollow-body-holds", "glute-squeezes", "calf-raises", "seated-forward-fold-stretch"]),
      routine(5, "strength", "Workout C", "Sumo & Accessory", ["sumo-squats", "dumbbell-lateral-raises", "donkey-kicks", "dumbbell-tricep-extensions", "wrist-extensions"]),
      routine(6, "recovery", "Recovery C", "Mobility & Length", ["high-knees", "wall-press-ups", "banded-hip-abductions", "quad-stretch", "childs-pose-or-seated-torso-twist"]),
      routine(7, "rest", "Rest Day", "Complete Decompression", []),
    ],
  };
}

export function defaultState() {
  return {
    version: 5, library: seedLibrary(), blocks: [seedBlock("b1", "Block 1")],
    log: {}, ui: { block: "b1", week: 1 }, notes: "",
    // Body stats: the measurement catalogue, the user's tracked subset, and a
    // one-time profile (height → BMI). Weekly values live in `log` (measureKey).
    measurements: seedMeasurements(), tracked: ["bodyweight"], profile: {},
    // The shared band-only routine any routine can swap in via its 🏝 toggle.
    holiday: seedHoliday(),
    // The shared wind-down cool-down segment, shown under every non-rest routine (ADR-0013).
    winddown: seedWinddown(),
  };
}

/* ---------------------------------------------------------------------- *
 * Store                                                                  *
 * ---------------------------------------------------------------------- */
export let state;
export let editing = false;
export function setState(s) { state = s; }
export function setEditing(v) { editing = v; }

// Backfill a shared app-level segment (state.holiday / state.winddown) against its seed: a
// missing or non-object value is replaced wholesale; otherwise each seed field whose stored
// value is the wrong shape (array-vs-not, or a differing typeof) is reset from the seed. The
// seed is the schema — add a field to a seed and it backfills here automatically, with no
// per-field check to keep in step. Additive, so old saves migrate without a schema bump.
function backfillFromSeed(cur, seed) {
  if (!cur || typeof cur !== "object") return seed;
  Object.keys(seed).forEach((k) => {
    const ok = Array.isArray(seed[k]) ? Array.isArray(cur[k]) : typeof cur[k] === typeof seed[k];
    if (!ok) cur[k] = seed[k];
  });
  return cur;
}

function normalise(s) {
  if (!s || (s.version !== 2 && s.version !== 3 && s.version !== 4 && s.version !== 5) || !Array.isArray(s.blocks) || !s.blocks.length) return defaultState();
  if (!s.log) s.log = {};
  if (!s.library) s.library = seedLibrary();
  // Body stats are additive — older v2 saves predate them, so backfill the
  // defaults rather than bumping the schema version (keeps old backups importable).
  if (!s.measurements) s.measurements = seedMeasurements();
  if (!Array.isArray(s.tracked)) s.tracked = ["bodyweight"];
  if (!s.profile || typeof s.profile !== "object") s.profile = {};
  migrateRoutines(s);
  // Per-block start date (the Monday weekdays derive from) is additive — older saves
  // predate it. Backfill to the Monday of createdAt's week (ADR-0005), today's week if
  // createdAt is missing too. Runs after migrateRoutines so every block is well-formed.
  s.blocks.forEach((b) => { if (!b.startDate) b.startDate = mondayOf(b.createdAt || today()); });
  migrateSets(s);
  migrateCircuit(s);
  migrateContexts(s);
  migrateLibrary(s);
  purgeNutrition(s);
  // The Holiday Workout and Wind-down are shared app-level segments, both additive (pre-v4 saves
  // predate them) — backfill a missing one whole, or any wrong-shaped field, from its seed. Both
  // run after migrateLibrary so their moves are guaranteed in the library. Per-cell `.holiday` /
  // `.winddown` flags live in the log and need no migration.
  s.holiday = backfillFromSeed(s.holiday, seedHoliday());
  s.winddown = backfillFromSeed(s.winddown, seedWinddown());
  if (!s.ui || !s.blocks.some((b) => b.id === s.ui.block)) s.ui = { block: s.blocks[0].id, week: 1 };
  if (typeof s.notes !== "string") s.notes = "";
  // Schema is now v5 (nutrition domain removed — ADR-0018). A migrated v2/v3/v4 save is well-formed
  // by here; stamp it so the next save persists the bump. purgeNutrition above dropped the Pantry
  // and every food/legacy-nutrition log key, so the bump marks a store that carries no food data.
  // STORAGE_KEY stays "…-v2" (a storage slot name, not the schema number) so data isn't orphaned.
  s.version = 5;
  return s;
}
export { normalise };

// The catalogue entry was renamed day → routine: `block.days` → `block.routines`, and
// each entry's `.day` number → `.routine`. Older v2 saves still carry the old field
// names, so rename them in place before the other migrations (which now iterate
// `b.routines` / read `.routine`). Idempotent — a no-op once renamed — and additive, so
// old backups import unchanged. Only the in-memory template fields move; the persisted
// log key segment stays `.d` (cellKey), so logged data isn't orphaned (ADR-0005).
function migrateRoutines(s) {
  s.blocks.forEach((b) => {
    if (!Array.isArray(b.routines)) b.routines = Array.isArray(b.days) ? b.days : [];
    delete b.days;
    b.routines.forEach((r) => {
      if (r.routine == null && r.day != null) r.routine = r.day;
      delete r.day;
    });
  });
}

// Sets moved off the library record (defaultSets) onto each routine's placement:
// exerciseIds[] → exercises[{ id, sets }]. Idempotent — a no-op once migrated.
function migrateSets(s) {
  s.blocks.forEach((b) => {
    (b.routines || []).forEach((d) => {
      if (!Array.isArray(d.exercises)) {
        const ids = Array.isArray(d.exerciseIds) ? d.exerciseIds : [];
        d.exercises = ids.map((id) => {
          const ex = s.library[id];
          return placement(d.kind, id, ex && ex.defaultSets);
        });
      }
      delete d.exerciseIds;
    });
  });
  Object.keys(s.library).forEach((id) => delete s.library[id].defaultSets);
}

// Circuit timing moved from the per-move library record onto the recovery routine.
// Backfill the routine-level fields for older saves; the defaults match the prior
// hardcoded behaviour. Additive + idempotent (a no-op once present).
function migrateCircuit(s) {
  s.blocks.forEach((b) => {
    (b.routines || []).forEach((d) => {
      if (d.kind !== "recovery") return;
      if (typeof d.rounds !== "number") d.rounds = CIRCUIT_DEFAULTS.rounds;
      if (typeof d.workSec !== "number") d.workSec = CIRCUIT_DEFAULTS.workSec;
      if (typeof d.restSec !== "number") d.restSec = CIRCUIT_DEFAULTS.restSec;
      if (typeof d.roundRestSec !== "number") d.roundRestSec = CIRCUIT_DEFAULTS.roundRestSec;
    });
  });
  // Strip the retired per-move circuit fields (timing now lives on the routine),
  // mirroring how migrateSets cleaned up defaultSets.
  Object.keys(s.library).forEach((id) => {
    const ex = s.library[id];
    delete ex.duration; delete ex.rest; delete ex.rounds;
  });
}

// v4→v5: the nutrition domain was removed (ADR-0018), so purge every trace of it from a
// loaded store — the Pantry catalogue plus every food-entry (`.food`) and legacy nutrition-
// scalar (`.nut.`) log key. A flat log sweep (not a block×week×routine walk) so orphaned keys
// from deleted blocks go too. Idempotent — a no-op once swept — and destructive by design:
// this is the one-way removal the schema bump records, not a reversible migration.
function purgeNutrition(s) {
  delete s.pantry;
  Object.keys(s.log).forEach((k) => {
    if (k.endsWith(".food") || k.includes(".nut.")) delete s.log[k];
  });
}

// Reconcile the persisted library against the current seed in a single pass —
// two complementary, additive halves of one concept (the save is guaranteed to
// have a library by the guard in normalise):
//   • a seed exercise the save is MISSING (a later release added it) → add the
//     whole record, already stamped with its loadMode/banded by seedLibrary;
//   • a seed exercise the save already HAS → backfill loading metadata (loadMode,
//     banded + default band) per-field, only where the user hasn't set one, so
//     manual choices and custom exercises are left alone.
// The library is append-only from the UI (no delete), so neither half can clobber
// a user's own entries or edits. Idempotent once each record/field is present.
function migrateLibrary(s) {
  const seed = seedLibrary();
  Object.keys(seed).forEach((id) => {
    const sd = seed[id], ex = s.library[id];
    if (!ex) { s.library[id] = sd; return; }
    if (ex.loadMode == null && sd.loadMode) ex.loadMode = sd.loadMode;
    if (ex.banded == null && sd.banded) { ex.banded = true; ex.defaultBand = sd.defaultBand; }
    // Widen contexts from the seed (additive union) — broadening a seed move's contexts in a
    // release reaches existing saves, the contexts sibling of the loadMode / banded backfills.
    // migrateContexts runs first (normalise call order), so ex.contexts is already an array.
    if (sd.contexts) ex.contexts = [...new Set([...ex.contexts, ...sd.contexts])];
  });
}

// The contexts an exercise is valid in — its `contexts` set, or, for a record authored before
// ADR-0007, derived from the legacy scalar `type`. The single home for that legacy mapping,
// shared by migrateContexts and the block-import validator so the rule can't drift.
export const contextsOf = (ex) => (Array.isArray(ex.contexts) ? ex.contexts : [ex.type === "strength" ? "strength" : "recovery"]);

// Exercises carried a scalar `type` (strength | circuit) that hard-gated the picker; it's
// replaced by a `contexts` set — the routine kinds a move is valid in — with behaviour now
// driven by the routine, not the exercise (ADR-0007). Apply the legacy mapping (a no-op once a
// record has contexts) and drop the dead field. Idempotent + additive, so old backups migrate.
function migrateContexts(s) {
  Object.keys(s.library).forEach((id) => {
    const ex = s.library[id];
    ex.contexts = contextsOf(ex);
    delete ex.type;
  });
}

export function load() {
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { parsed = null; }
  state = normalise(parsed);
}
export function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------------------------------------------------------------------- *
 * Queries over the store                                                 *
 * ---------------------------------------------------------------------- */
export function currentBlock() { return state.blocks.find((b) => b.id === state.ui.block) || state.blocks[0]; }
export function currentBlockIndex() { return Math.max(0, state.blocks.findIndex((b) => b.id === state.ui.block)); }
// A routine by its number within the current block, or a shared app-level segment for a
// sentinel — the "holiday" Holiday Workout or the "winddown" Wind-down — so the structural edit
// handlers (sets / add / remove / the picker) operate on state.holiday / state.winddown through
// the same path as a real routine. The wind-down's `kind: "mobility"` is what makes its picker
// offer mobility moves and its placements land bare (ADR-0011/0013).
export function routineDef(routine) {
  if (routine === "holiday") return state.holiday;
  if (routine === "winddown") return state.winddown;
  return currentBlock().routines.find((d) => d.routine === routine);
}

// Place a built placement onto a routine, honouring each kind's arity: a steady routine holds
// exactly one activity (CONTEXT "Steady"), so a new one replaces; every other kind appends.
// The single home for that invariant — the add + create handlers and the block importer all
// route through it, so none can forget the rule. Mutates the routine; callers save + render.
export function placeMove(routine, p) {
  if (routine.kind === "steady") routine.exercises = [p];
  else routine.exercises.push(p);
}

// This week's cell for a routine in the current block — the coordinate the in-app edit
// handlers (the count steppers and apply-all) operate on.
export function currentCell(routine) { return cellKey(currentBlock().id, state.ui.week, routine); }

// A week's routine order: the stored schedule (a permutation of the block's routine
// numbers) reconciled against the catalogue — unknown numbers dropped, any missing ones
// appended in catalogue order — so the result is always a clean bijection over the
// routines. (The catalogue is fixed at seven and the only writer, reorderRoutine, derives
// its array from here, so that reconciliation is insurance against a corrupt / hand-edited
// log, not support for adding or removing routines — there's no such UI.) Absent → identity
// (catalogue order). The single driver of render order (never the date); the cell key
// stays routine-keyed, so temporal scans are unaffected (ADR-0005).
export function weekSchedule(block, wk) {
  const ids = block.routines.map((r) => r.routine);
  // This week's stored order, else the nearest earlier arranged week in the block (lazy
  // lookback — reordering one week carries forward until the next explicitly-arranged
  // one), else identity. Stays within the block: a new block is a clean identity slate.
  let stored = null;
  for (let w = wk; w >= 1 && !stored; w--) {
    const s = state.log[scheduleKey(block.id, w)];
    if (Array.isArray(s)) stored = s;
  }
  const order = (stored || []).filter((n) => ids.includes(n));
  ids.forEach((n) => { if (!order.includes(n)) order.push(n); });
  return order;
}

export function setLog(k, v) {
  if (v === "" || v === false || v == null) delete state.log[k];
  else state.log[k] = v;
  save();
}

// The log is a flat {key: value} map, so the *shape* a key holds lives with these
// readers, not at each call site. logList owns the one structured shape — a class
// list stored under a cell — returning the stored array or an empty one.
export function logList(k) { return Array.isArray(state.log[k]) ? state.log[k] : []; }
// The three mutators of that shape, paired with logList so the "a key holds a list, and
// it's deleted when its last item goes" rule lives beside the reader rather than
// copy-pasted at each call site. logPush appends; logRemoveAt drops index i off a copy
// (so the stored array isn't touched before setLog decides whether to keep or delete it);
// logReplaceAt swaps the item at i in place — an edit, so length is unchanged (a no-op
// for an out-of-range index, and it never empties the key).
export function logPush(k, item) { const l = logList(k); l.push(item); setLog(k, l); }
export function logRemoveAt(k, i) { const l = logList(k).slice(); l.splice(i, 1); setLog(k, l.length ? l : ""); }
export function logReplaceAt(k, i, item) { const l = logList(k).slice(); if (i >= 0 && i < l.length) l[i] = item; setLog(k, l); }

// Purge every log key belonging to a block. The cell-key grammar guarantees every
// routine / measure / class / band key is hung off a `block.id`-prefixed
// cell, so one prefix sweep collects them all — the invariant the key-grammar
// comments promise, made executable in one named place. No save(): unlike setLog
// (a per-field edit), this is a sub-step of deleteBlock, which saves once at the end.
export function purgeBlockLog(blockId) {
  Object.keys(state.log).forEach((k) => { if (k.indexOf(blockId + ".") === 0) delete state.log[k]; });
}

export function nextBlockNumber() {
  let max = 0;
  state.blocks.forEach((b) => { const m = /(\d+)/.exec(b.name || ""); if (m) max = Math.max(max, +m[1]); });
  return max + 1;
}

/* ---------------------------------------------------------------------- *
 * Block import (ADR-0009): validate (pure) then merge (mutate).          *
 * ---------------------------------------------------------------------- */
const importLoadModeIds = LOAD_MODES.map((m) => m.id);
const badLoadMode = (ex) => !!ex.loadMode && !importLoadModeIds.includes(ex.loadMode);
// The two payload parts both phases read — interpreted one way so validate + merge can't disagree.
const importParts = (data) => ({
  importLib: (data && data.library && typeof data.library === "object") ? data.library : {},
  blocks: Array.isArray(data && data.blocks) ? data.blocks : [],
});

// Validate a block-import payload (a subset export — ADR-0009) against the current library plus
// the import's own. Pure read — returns { errors, coercions } and mutates nothing, so the merge
// runs only once errors is empty. Errors are structural/semantic and reject the whole import;
// coercions are cosmetic fixes the merge applies + reports.
export function validateBlockImport(data) {
  if (!data || typeof data !== "object" || (data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5)) {
    return { errors: ["This isn't a workout-tracker export at version 2, 3, 4 or 5."], coercions: [] };
  }
  const { importLib, blocks } = importParts(data);
  if (!blocks.length) return { errors: ["The file has no blocks to import."], coercions: [] };
  const lib = (id) => state.library[id] || importLib[id]; // existing wins; import fills gaps
  const errors = [], coercions = [];
  blocks.forEach((b, bi) => {
    const label = '"' + ((b && b.name) || ("block " + (bi + 1))) + '"';
    if (!b || typeof b !== "object" || !Array.isArray(b.routines) || !b.routines.length) { errors.push(label + ": has no routines"); return; }
    const nums = b.routines.map((r) => r && r.routine);
    nums.forEach((n) => { if (!Number.isInteger(n) || n < 1 || n > 7) errors.push(label + ": routine number " + JSON.stringify(n) + " is outside 1–7"); });
    if (new Set(nums).size !== nums.length) errors.push(label + ": has duplicate routine numbers");
    b.routines.forEach((r) => {
      if (!r || !ROUTINE_KINDS.includes(r.kind)) { errors.push(label + " routine " + (r && r.routine) + ": unknown kind " + JSON.stringify(r && r.kind)); return; }
      // A class routine holds a class type + duration, not placed exercises (ADR-0010) — validate
      // those instead and skip the library/context checks (it has nothing to place).
      if (r.kind === "class") {
        if (typeof r.classType !== "string" || !r.classType.trim()) errors.push(label + " routine " + r.routine + ": a class routine needs a classType name");
        if (r.durationMin != null && !(Number(r.durationMin) > 0)) errors.push(label + " routine " + r.routine + ": durationMin must be a positive number");
        // A class holds no placed exercises; any listed are cosmetic noise, dropped on merge (not a reject).
        if (Array.isArray(r.exercises) && r.exercises.length) coercions.push(label + " routine " + r.routine + ": dropped exercises listed on a class routine");
        return;
      }
      (Array.isArray(r.exercises) ? r.exercises : []).forEach((p) => {
        const ex = p && lib(p.id);
        if (!ex) { errors.push(label + " routine " + r.routine + ": exercise " + JSON.stringify(p && p.id) + " isn't in the library"); return; }
        if (r.kind !== "rest" && !contextsOf(ex).includes(r.kind)) errors.push(label + " routine " + r.routine + ": " + JSON.stringify(p.id) + " isn't valid in a " + r.kind + " routine");
      });
    });
    if (b.startDate != null && b.startDate !== "" && !validYMD(b.startDate)) errors.push(label + ": start date " + JSON.stringify(b.startDate) + " isn't a valid YYYY-MM-DD date");
    else if (b.startDate && b.startDate !== mondayOf(b.startDate)) coercions.push(label + ": start date snapped to its Monday");
  });
  Object.keys(importLib).forEach((id) => { if (importLib[id] && badLoadMode(importLib[id])) coercions.push(id + ": dropped unrecognised loadMode " + JSON.stringify(importLib[id].loadMode)); });
  return { errors, coercions };
}

// Apply a VALIDATED block import by merging into the Store: add new library exercises (existing
// records never clobbered — the append-only rule), append each block (re-id on collision via the
// same uniqueId machinery newBlock uses), point ui at it, then normalise + persist. Mutates the
// Store; the caller renders + reports. Call validateBlockImport first — this assumes validity.
export function mergeBlockImport(data) {
  const { importLib, blocks } = importParts(data);
  Object.keys(importLib).forEach((id) => {
    if (state.library[id]) return;
    const ex = { ...importLib[id], id };
    if (badLoadMode(ex)) delete ex.loadMode;
    state.library[id] = ex;
  });
  const taken = {}; state.blocks.forEach((b) => (taken[b.id] = true));
  let landed = null;
  blocks.forEach((b) => {
    const id = (b.id && !taken[b.id]) ? b.id : uniqueId("b" + nextBlockNumber(), (x) => taken[x]);
    taken[id] = true;
    // Drop any exercises the import listed on a class routine (it holds none — the coercion above
    // reported it), so the stored shape stays clean rather than relying on migrateSets to empty it.
    const routines = b.routines.map((r) => (r.kind === "class" ? { ...r, exercises: [] } : r));
    state.blocks.push({ ...b, id, routines, createdAt: b.createdAt || today(), startDate: mondayOf(b.startDate || today()) });
    landed = id;
  });
  if (landed) { state.ui.block = landed; state.ui.week = 1; }
  setState(normalise(state));
  setEditing(false);
  save();
  return landed;
}

export function readSets(blockId, wk, routine, exId, sets) {
  const cell = cellKey(blockId, wk, routine);
  return Array.from({ length: sets }, (_, i) => ({
    w: state.log[setKey(cell, exId, i, "w")] || "",
    r: state.log[setKey(cell, exId, i, "r")] || "",
  }));
}

// The effective count for a cell: the per-week override if one's logged, else the block-wide
// template (ADR-0008). One pair of resolvers every count-bearing site routes through — the
// row/round loops in render, and the temporal scans (previousSets, routineLoad, bandedReps) —
// so a per-week count is a flat lookup, never a lazy-lookback inside a scan (ADR-0001).
// Lowering a count only shrinks the loop; the logged data under the dropped rows/rounds stays.
// One home for "per-week override, else block-wide template": parse the override key, clamp it
// if a value's present, else fall back to the template (ADR-0008). effectiveSets / effectiveRounds
// are its only two shapes — both read by the render loops and the temporal scans.
const resolveOverride = (key, clamp, fallback) => {
  const o = parseInt(state.log[key], 10);
  return Number.isFinite(o) ? clamp(o) : fallback;
};
export const effectiveSets = (cell, place) => resolveOverride(setsKey(cell, place.id), clampSets, place.sets || DEFAULT_SETS);
export const effectiveRounds = (cell, d) => resolveOverride(roundsKey(cell), clampRounds, circuitOf(d).rounds);

// The most recent earlier logged instance of an exercise — last week within a
// block, or the previous block's last occurrence at a block boundary.
export function previousSets(exId, curBlockIdx, curWeek, curRoutine) {
  if (!state.library[exId]) return null;
  // A single monotonic rank over (block, week, routine) — routine ≤ 7 so *8 never
  // collides. Used both to filter "earlier than the cursor" and to pick the latest.
  const rank = (bi, wk, routine) => (bi * (WEEKS + 1) + wk) * 8 + routine;
  const cutoff = rank(curBlockIdx, curWeek, curRoutine);
  let best = null;
  state.blocks.forEach((block, bi) => {
    block.routines.forEach((d) => {
      const p = d.exercises.find((x) => x.id === exId);
      if (!p) return;
      for (let wk = 1; wk <= WEEKS; wk++) {
        const order = rank(bi, wk, d.routine);
        if (order >= cutoff) continue;
        // Each cell reads its OWN effective count — a prior week may have a different override.
        const cell = cellKey(block.id, wk, d.routine);
        const s = readSets(block.id, wk, d.routine, exId, effectiveSets(cell, p));
        if (s.some((x) => x.w || x.r) && (!best || order > best.order)) best = { order, sets: s };
      }
    });
  });
  return best ? best.sets : null;
}

// Reps summed across a banded move's logged inputs: strength reads each set's
// reps field; a circuit move reads its per-round reps. (Banded load is band kg ×
// these reps, so the "weight" is the band rather than a typed number.)
function bandedReps(cell, d, p) {
  let total = 0;
  if (d.kind === "strength") {
    const sets = effectiveSets(cell, p);
    for (let i = 0; i < sets; i++) { const r = parseFloat(state.log[setKey(cell, p.id, i, "r")]); if (r > 0) total += r; }
  } else {
    const rounds = effectiveRounds(cell, d);
    for (let i = 0; i < rounds; i++) { const r = parseFloat(state.log[roundRepKey(cell, p.id, i)]); if (r > 0) total += r; }
  }
  return total;
}

// Training load for one routine: the tonnage `total` plus `loadBearing` — whether the
// routine carries load at all. These are two facts the number alone can't express: a
// recovery routine becomes load-bearing the moment it holds a banded move, before any
// reps are logged (so `total` is still 0 but the routine-volume line should already
// show). Strength routines are always load-bearing; a recovery routine becomes so once a
// banded move is placed; rest routines never are. Free-weight sets contribute
// weight × reps scaled by the loading mode (per-side doubles reps, two-dumbbell
// doubles weight); banded moves contribute band kg × summed reps × the per-side
// factor. Render reads both facts here instead of re-deriving the banded predicate.
// Whether a cell is flagged as a holiday routine — the one place the `.holiday` flag
// string is read, so every caller (the swap below, previousRoutineTotal's skip) shares it.
export function isHoliday(cell) { return !!state.log[cell + ".holiday"]; }
// A holiday-flagged cell swaps in the shared Holiday Workout; otherwise the routine
// itself. The cell's coordinates stay the real routine's — only the kind + exercise list
// come from the swap (the band moves log against this same cell, which is what lets
// previousSets skip the holiday week — ADR-0002). One name for the swap, read by both
// routineLoad and the renderer rather than re-expressed at each.
export function holidaySwap(cell, d) { return isHoliday(cell) ? state.holiday : d; }

export function routineLoad(block, wk, d) {
  const cell = cellKey(block.id, wk, d.routine);
  const eff = holidaySwap(cell, d);
  // No tonnage accrues for the kinds that hold no weighted placement: rest, steady, or a class
  // (ADR-0010). Explicit here rather than relying on migrateSets happening to stamp exercises:[]
  // — so this never depends on an unrelated migration to avoid `undefined.forEach`.
  if (eff.kind === "rest" || eff.kind === "steady" || eff.kind === "class") return { total: 0, loadBearing: false };
  let total = 0, loadBearing = eff.kind === "strength";
  eff.exercises.forEach((p) => {
    const ex = state.library[p.id];
    if (!ex) return;
    if (ex.banded) {
      loadBearing = true; // a placed banded move makes the routine count, reps or not
      // Band kg × reps; per-side still doubles the reps (the only loading-mode axis
      // that applies to a band — there's no second band for two-dumbbell's weight).
      const kg = bandKg(bandFor(ex, state.log[bandKey(cell, p.id)]));
      if (kg > 0) total += kg * loadMode(ex).rMult * bandedReps(cell, eff, p);
    } else if (eff.kind === "strength") {
      const m = loadMode(ex);
      readSets(block.id, wk, d.routine, p.id, effectiveSets(cell, p)).forEach((s) => {
        const w = parseFloat(s.w), r = parseFloat(s.r);
        if (w > 0 && r > 0) total += w * m.wMult * r * m.rMult;
      });
    }
  });
  return { total, loadBearing };
}

// The spine of the weekly "most-recent-earlier" scans: walk (block, week) backwards
// from a cursor and return the latest cell's value for which `valueAt` is non-null.
// previousMeasure and previousRoutineTotal share this *exact* 2-D enumerator + reduction,
// differing only in the reader — so the walker takes just a reader (null = empty), not
// the enumerator+predicate that ADR-0001 once rejected. previousSets stays separate:
// it's the lone 3-D scan (block × placement-bearing-routine × week). See ADR-0001's amendment.
function latestByWeek(curBi, curWk, valueAt) {
  const rank = (bi, wk) => bi * (WEEKS + 1) + wk;
  const cutoff = rank(curBi, curWk);
  let best = null;
  state.blocks.forEach((block, bi) => {
    for (let wk = 1; wk <= WEEKS; wk++) {
      const order = rank(bi, wk);
      if (order >= cutoff) continue;
      const v = valueAt(block, wk);
      if (v != null && (!best || order > best.order)) best = { order, v };
    }
  });
  return best ? best.v : null;
}

// The load of the most recent *normal* (non-holiday) session of this routine number,
// earlier than the cursor — for the progressive-overload delta on the routine's volume
// line. Skips holiday weeks and any week the routine carried no load, so the delta always
// compares against the last time the real workout was done: week-1-normal ·
// week-2-holiday · week-3-normal → week 3 vs week 1. Null on a holiday routine itself
// (holiday weeks aren't a tracking surface) or when there's no earlier normal session.
export function previousRoutineTotal(block, wk, d) {
  if (isHoliday(cellKey(block.id, wk, d.routine))) return null;
  const curBi = Math.max(0, state.blocks.findIndex((b) => b.id === block.id));
  return latestByWeek(curBi, wk, (b, w) => {
    const pd = b.routines.find((x) => x.routine === d.routine);
    if (!pd || isHoliday(cellKey(b.id, w, pd.routine))) return null; // skip holiday weeks
    const total = routineLoad(b, w, pd).total;
    return total > 0 ? total : null;
  });
}

// The most recent earlier *steady* session of this routine — its logged resistance/level and
// actual minutes — for the "Last:" ghost on a steady routine (its progression prompt, since
// steady carries no tonnage delta). Shares the latestByWeek 2-D spine, so it adds no new scan
// kind (ADR-0001). A holiday-flagged week logs band moves, not steady fields, so it reads
// empty there and resumes against the last real steady session for free (ADR-0002).
export function previousSteady(block, wk, d) {
  const curBi = Math.max(0, state.blocks.findIndex((b) => b.id === block.id));
  return latestByWeek(curBi, wk, (b, w) => {
    const pd = b.routines.find((x) => x.routine === d.routine);
    if (!pd) return null;
    const cell = cellKey(b.id, w, pd.routine);
    const mins = state.log[cellScalarKey(cell, "mins")], resist = state.log[cellScalarKey(cell, "resist")];
    return (mins || resist) ? { mins: mins || "", resist: resist || "" } : null;
  });
}

// Most recent earlier value of a measurement, scanning (block, week) — measurements
// are weekly, not per-routine. Shares the latestByWeek 2-D spine with previousRoutineTotal;
// its reader is the measure log value, with "" treated as empty (ADR-0001 amendment).
export function previousMeasure(mId, curBlockIdx, curWeek) {
  return latestByWeek(curBlockIdx, curWeek, (block, wk) => {
    const v = state.log[measureKey(block.id, wk, mId)];
    return v != null && v !== "" ? v : null;
  });
}

// BMI for a week = bodyweight / height² (metric). Null unless both a stored
// height and that week's bodyweight are present.
export function bmiFor(block, wk) {
  const h = parseFloat(state.profile && state.profile.heightCm);
  const w = parseFloat(state.log[measureKey(block.id, wk, "bodyweight")]);
  if (!(h > 0) || !(w > 0)) return null;
  const m = h / 100;
  return w / (m * m);
}

// The class-type names in play: the seeds unioned with every class routine's type across all
// blocks. The single source for BOTH the Edit-mode autocomplete (the datalist) and case
// canonicalisation, so what's offered and what a typed spelling resolves to can never disagree.
// A class type is just a name (ADR-0014), never mutated on a stored list — deriving it is why
// there's no persisted state.classTypes to keep in sync (any legacy one sits inert, unread).
export function classTypeNames() {
  const names = new Set(DEFAULT_CLASS_TYPES);
  state.blocks.forEach((b) => b.routines.forEach((r) => { if (r.kind === "class" && r.classType) names.add(r.classType); }));
  return [...names];
}
// The canonical class-type name matching `name` case-insensitively ("box-fit" → "Box-Fit"), or
// undefined. Reads the derived set, so canonicalisation and the offered list stay in lockstep.
export function findClassType(name) {
  const lc = String(name).toLowerCase();
  return classTypeNames().find((n) => n.toLowerCase() === lc);
}

// Class minutes + logged calorie burn over a set of weeks (one week / all weeks). Sums the
// per-session actuals on class-kind cells — minutes and the wearable's logged kcal (ADR-0014)
// — the figures the header Classes line shows. Each is counted on its own (a class with only
// kcal, or only minutes, still contributes).
export function classTotals(block, weeks) {
  let mins = 0, kcal = 0;
  weeks.forEach((wk) => {
    block.routines.forEach((d) => {
      if (d.kind !== "class") return;
      const cell = cellKey(block.id, wk, d.routine);
      const m = parseFloat(state.log[cellScalarKey(cell, "mins")]);
      const k = parseFloat(state.log[cellScalarKey(cell, "kcal")]);
      if (m > 0) mins += m;
      if (k > 0) kcal += k;
    });
  });
  return { mins, kcal };
}
