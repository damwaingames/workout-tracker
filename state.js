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
  WEEKS, STORAGE_KEY, DEFAULT_SETS, CIRCUIT_DEFAULTS, NUTRIENTS,
} from "./constants.js";
import {
  today, cellKey, setKey, roundRepKey, bandKey, measureKey, nutKey,
  placement, loadMode, circuitOf, bandFor, bandKg,
} from "./helpers.js";

/* ---------------------------------------------------------------------- *
 * Seed data — straight from the training design doc.                     *
 * ---------------------------------------------------------------------- */
function S(id, name, setup, targetReps, loadMode) {
  const ex = { id, name, type: "strength", setup, targetReps };
  // Loading mode is optional — absent means standard (load as entered). Only the
  // multi-implement / per-side moves carry one, so tonnage is right out of the box.
  if (loadMode) ex.loadMode = loadMode;
  return ex;
}
// Circuit moves are just a name + type now — rounds and timing live on the day
// (the circuit), not the individual move.
function C(id, name) {
  return { id, name, type: "circuit" };
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
  ];
  const lib = keyById(list);
  // Banded moves take their load from a resistance band, not free weight (across
  // both day kinds). They log a band tier (defaulting to `defaultBand`) plus reps,
  // and their tonnage is band kg × reps × the loading-mode rep factor. `banded` is
  // what render/dayVolume branch on; `defaultBand` just pre-selects a sensible tier
  // the user can change per session.
  const band = (id, tier) => { lib[id].banded = true; lib[id].defaultBand = tier; };
  band("banded-clamshells", "light");
  band("banded-hip-abductions", "medium");
  band("banded-fire-hydrants", "heavy");
  band("banded-tricep-kickbacks", "light");
  band("banded-lat-pulldowns", "light");
  band("banded-bicycle-crunches", "light");
  return lib;
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
  // Sets live on each placement, not the exercise — the program's strength days
  // all start at 2 sets; circuit placements carry none (rounds/timing live on
  // the recovery day itself).
  const day = (n, kind, title, focus, ids) => ({
    day: n, kind, title, focus,
    exercises: ids.map((exId) => placement(kind, exId, DEFAULT_SETS)),
    ...(kind === "recovery" ? { ...CIRCUIT_DEFAULTS } : {}),
  });
  return {
    id, name, createdAt: today(),
    days: [
      day(1, "strength", "Workout A", "Squat & Row", ["goblet-squats", "bent-over-rows", "banded-clamshells", "bicep-curls", "wrist-curls"]),
      day(2, "recovery", "Recovery A", "Cardio Flush", ["high-knees", "wall-press-ups", "glute-squeezes", "calf-raises", "chest-opener-stretch"]),
      day(3, "strength", "Workout B", "Hinge & Press", ["dumbbell-rdls", "floor-chest-presses", "glute-bridges", "overhead-shoulder-presses", "crunches"]),
      day(4, "recovery", "Recovery B", "Glute & Core Activation", ["banded-hip-abductions", "hollow-body-holds", "glute-squeezes", "calf-raises", "seated-forward-fold-stretch"]),
      day(5, "strength", "Workout C", "Sumo & Accessory", ["sumo-squats", "dumbbell-lateral-raises", "donkey-kicks", "dumbbell-tricep-extensions", "wrist-extensions"]),
      day(6, "recovery", "Recovery C", "Mobility & Length", ["high-knees", "wall-press-ups", "banded-hip-abductions", "quad-stretch", "childs-pose-or-seated-torso-twist"]),
      day(7, "rest", "Rest Day", "Complete Decompression", []),
    ],
  };
}

export function defaultState() {
  return {
    version: 2, library: seedLibrary(), blocks: [seedBlock("b1", "Block 1")],
    log: {}, ui: { block: "b1", week: 1 }, notes: "",
    // Body stats: the measurement catalogue, the user's tracked subset, and a
    // one-time profile (height → BMI). Weekly values live in `log` (measureKey).
    measurements: seedMeasurements(), tracked: ["bodyweight"], profile: {},
  };
}

/* ---------------------------------------------------------------------- *
 * Store                                                                  *
 * ---------------------------------------------------------------------- */
export let state;
export let editing = false;
export function setState(s) { state = s; }
export function setEditing(v) { editing = v; }

function normalise(s) {
  if (!s || s.version !== 2 || !Array.isArray(s.blocks) || !s.blocks.length) return defaultState();
  if (!s.log) s.log = {};
  if (!s.library) s.library = seedLibrary();
  // Body stats are additive — older v2 saves predate them, so backfill the
  // defaults rather than bumping the schema version (keeps old backups importable).
  if (!s.measurements) s.measurements = seedMeasurements();
  if (!Array.isArray(s.tracked)) s.tracked = ["bodyweight"];
  if (!s.profile || typeof s.profile !== "object") s.profile = {};
  migrateSets(s);
  migrateCircuit(s);
  migrateExerciseLoading(s);
  migrateLibraryAdditions(s);
  if (!s.ui || !s.blocks.some((b) => b.id === s.ui.block)) s.ui = { block: s.blocks[0].id, week: 1 };
  if (typeof s.notes !== "string") s.notes = "";
  return s;
}
export { normalise };

// Sets moved off the library record (defaultSets) onto each day's placement:
// exerciseIds[] → exercises[{ id, sets }]. Idempotent — a no-op once migrated.
function migrateSets(s) {
  s.blocks.forEach((b) => {
    (b.days || []).forEach((d) => {
      if (!Array.isArray(d.exercises)) {
        const ids = Array.isArray(d.exerciseIds) ? d.exerciseIds : [];
        d.exercises = ids.map((id) => {
          const ex = s.library[id];
          return placement(ex && ex.type, id, ex && ex.defaultSets);
        });
      }
      delete d.exerciseIds;
    });
  });
  Object.keys(s.library).forEach((id) => delete s.library[id].defaultSets);
}

// Circuit timing moved from the per-move library record onto the recovery day.
// Backfill the day-level fields for older saves; the defaults match the prior
// hardcoded behaviour. Additive + idempotent (a no-op once present).
function migrateCircuit(s) {
  s.blocks.forEach((b) => {
    (b.days || []).forEach((d) => {
      if (d.kind !== "recovery") return;
      if (typeof d.rounds !== "number") d.rounds = CIRCUIT_DEFAULTS.rounds;
      if (typeof d.workSec !== "number") d.workSec = CIRCUIT_DEFAULTS.workSec;
      if (typeof d.restSec !== "number") d.restSec = CIRCUIT_DEFAULTS.restSec;
      if (typeof d.roundRestSec !== "number") d.roundRestSec = CIRCUIT_DEFAULTS.roundRestSec;
    });
  });
  // Strip the retired per-move circuit fields (timing now lives on the day),
  // mirroring how migrateSets cleaned up defaultSets.
  Object.keys(s.library).forEach((id) => {
    const ex = s.library[id];
    delete ex.duration; delete ex.rest; delete ex.rounds;
  });
}

// Per-exercise loading metadata — the loading mode (per-side / two-dumbbell) and
// the banded flag + default band — is additive, so older saves predate it.
// Backfill the program's seed defaults onto matching library records, but only
// per-field where the user hasn't already set one, so manual choices and custom
// exercises are left alone. Idempotent once a field is present.
function migrateExerciseLoading(s) {
  const seed = seedLibrary();
  Object.keys(seed).forEach((id) => {
    const ex = s.library[id], sd = seed[id];
    if (!ex) return;
    if (ex.loadMode == null && sd.loadMode) ex.loadMode = sd.loadMode;
    if (ex.banded == null && sd.banded) { ex.banded = true; ex.defaultBand = sd.defaultBand; }
  });
}

// Exercises added to the seed library in a later release won't exist in an older
// save (which carries its own persisted library). Add any seed exercise the save
// is missing, by id — additive and idempotent. The library is append-only from
// the UI (no delete), so this can't clobber the user's own entries or edits.
function migrateLibraryAdditions(s) {
  const seed = seedLibrary();
  Object.keys(seed).forEach((id) => { if (!s.library[id]) s.library[id] = seed[id]; });
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
export function dayDef(day) { return currentBlock().days.find((d) => d.day === day); }

export function setLog(k, v) {
  if (v === "" || v === false || v == null) delete state.log[k];
  else state.log[k] = v;
  save();
}

export function nextBlockNumber() {
  let max = 0;
  state.blocks.forEach((b) => { const m = /(\d+)/.exec(b.name || ""); if (m) max = Math.max(max, +m[1]); });
  return max + 1;
}

export function readSets(blockId, wk, day, exId, sets) {
  const cell = cellKey(blockId, wk, day);
  return Array.from({ length: sets }, (_, i) => ({
    w: state.log[setKey(cell, exId, i, "w")] || "",
    r: state.log[setKey(cell, exId, i, "r")] || "",
  }));
}

// The most recent earlier logged instance of an exercise — last week within a
// block, or the previous block's last occurrence at a block boundary.
export function previousSets(exId, curBlockIdx, curWeek, curDay) {
  if (!state.library[exId]) return null;
  // A single monotonic rank over (block, week, day) — day ≤ 7 so *8 never
  // collides. Used both to filter "earlier than the cursor" and to pick the latest.
  const rank = (bi, wk, day) => (bi * (WEEKS + 1) + wk) * 8 + day;
  const cutoff = rank(curBlockIdx, curWeek, curDay);
  let best = null;
  state.blocks.forEach((block, bi) => {
    block.days.forEach((d) => {
      const p = d.exercises.find((x) => x.id === exId);
      if (!p) return;
      for (let wk = 1; wk <= WEEKS; wk++) {
        const order = rank(bi, wk, d.day);
        if (order >= cutoff) continue;
        const s = readSets(block.id, wk, d.day, exId, p.sets || DEFAULT_SETS);
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
    const sets = p.sets || DEFAULT_SETS;
    for (let i = 0; i < sets; i++) { const r = parseFloat(state.log[setKey(cell, p.id, i, "r")]); if (r > 0) total += r; }
  } else {
    const rounds = circuitOf(d).rounds;
    for (let i = 0; i < rounds; i++) { const r = parseFloat(state.log[roundRepKey(cell, p.id, i)]); if (r > 0) total += r; }
  }
  return total;
}

// Training volume (tonnage) for one day. Free-weight strength sets contribute
// weight × reps, scaled by the loading mode (per-side doubles reps, two-dumbbell
// doubles weight). Banded moves contribute band kg × summed reps — and because a
// band can sit on a recovery day, circuits now carry load too. Rest days are 0.
export function dayVolume(block, wk, d) {
  if (d.kind === "rest") return 0;
  const cell = cellKey(block.id, wk, d.day);
  let v = 0;
  d.exercises.forEach((p) => {
    const ex = state.library[p.id];
    if (!ex) return;
    if (ex.banded) {
      // Band kg × reps; per-side still doubles the reps (the only loading-mode axis
      // that applies to a band — there's no second band for two-dumbbell's weight).
      const kg = bandKg(bandFor(ex, state.log[bandKey(cell, p.id)]));
      if (kg > 0) v += kg * loadMode(ex).rMult * bandedReps(cell, d, p);
    } else if (d.kind === "strength") {
      const m = loadMode(ex);
      readSets(block.id, wk, d.day, p.id, p.sets || DEFAULT_SETS).forEach((s) => {
        const w = parseFloat(s.w), r = parseFloat(s.r);
        if (w > 0 && r > 0) v += w * m.wMult * r * m.rMult;
      });
    }
  });
  return v;
}

// Most recent earlier value of a measurement, scanning (block, week) like
// previousSets but without days — measurements are weekly, not per-day.
export function previousMeasure(mId, curBlockIdx, curWeek) {
  const rank = (bi, wk) => bi * (WEEKS + 1) + wk;
  const cutoff = rank(curBlockIdx, curWeek);
  let best = null;
  state.blocks.forEach((block, bi) => {
    for (let wk = 1; wk <= WEEKS; wk++) {
      const order = rank(bi, wk);
      if (order >= cutoff) continue;
      const v = state.log[measureKey(block.id, wk, mId)];
      if (v != null && v !== "" && (!best || order > best.order)) best = { order, value: v };
    }
  });
  return best ? best.value : null;
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

// Summed nutrition over a set of weeks (one week for the week total, all of them
// for the block total) — every day of each week, every field. `kcalDays` counts
// days that logged calories, so the headline avg kcal/day divides by days the
// user actually recorded rather than the full 7×N (parallels dayVolume's scan).
export function nutritionTotals(block, weeks) {
  // Derive the accumulator from NUTRIENTS so the nutrient set has one source of
  // truth — adding a field there can't silently skip it here.
  const sum = Object.fromEntries(NUTRIENTS.map((n) => [n.id, 0]));
  let kcalDays = 0;
  weeks.forEach((wk) => {
    block.days.forEach((d) => {
      const cell = cellKey(block.id, wk, d.day);
      NUTRIENTS.forEach((n) => {
        const v = parseFloat(state.log[nutKey(cell, n.id)]);
        if (v > 0) sum[n.id] += v;
      });
      if (parseFloat(state.log[nutKey(cell, "kcal")]) > 0) kcalDays++;
    });
  });
  return { ...sum, kcalDays };
}
