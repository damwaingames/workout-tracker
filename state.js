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
  WEEKS, STORAGE_KEY, DEFAULT_SETS, CIRCUIT_DEFAULTS, NUTRIENTS, DEFAULT_CLASS_TYPES,
} from "./constants.js";
import {
  today, cellKey, setKey, roundRepKey, bandKey, measureKey, nutKey, classesKey,
  placement, loadMode, circuitOf, bandFor, bandKg, kcalBurn,
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
    // Holiday-day band moves — a minimal-kit strength session (the seedHoliday
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
  ];
  const lib = keyById(list);
  // Banded moves take their load from a resistance band, not free weight (across
  // both day kinds). They log a band tier (defaulting to `defaultBand`) plus reps,
  // and their tonnage is band kg × reps × the loading-mode rep factor. `banded` is
  // what render/dayLoad branch on; `defaultBand` just pre-selects a sensible tier
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
  return lib;
}

// The shared Holiday Workout: a single band-only strength day any day can swap in
// (per-cell, via its 🏝 toggle). Day-shaped so the renderer / dayLoad treat it like
// a normal strength day, but app-level (one definition reused across blocks) — its
// band moves log against whichever cell ticks it in, leaving that day's own
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
    // Editable list of class types ({ name, rate }) for the per-day class logger.
    classTypes: DEFAULT_CLASS_TYPES.map((c) => ({ ...c })),
    // The shared band-only day any day can swap in via its 🏝 toggle.
    holiday: seedHoliday(),
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
  normaliseClassTypes(s);
  migrateSets(s);
  migrateCircuit(s);
  migrateLibrary(s);
  // The Holiday Workout is additive (older v2 saves predate it) — backfill it, or
  // any missing field on a partial one, from the seed. Runs after migrateLibrary so
  // its band moves are guaranteed in the library. Per-cell `.holiday` flags live in
  // the log and need no migration.
  if (!s.holiday || typeof s.holiday !== "object") s.holiday = seedHoliday();
  else {
    const h = seedHoliday();
    if (typeof s.holiday.kind !== "string") s.holiday.kind = h.kind;
    if (typeof s.holiday.title !== "string") s.holiday.title = h.title;
    if (typeof s.holiday.focus !== "string") s.holiday.focus = h.focus;
    if (!Array.isArray(s.holiday.exercises)) s.holiday.exercises = h.exercises;
  }
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
  });
}

// Class types are { name, rate (kcal/min/kg) }. Coerce each entry to that shape:
// a bare string (an earlier shape) becomes { name }, leaving the single rate pass
// below to supply its rate — the one place rate is normalised. A stored rate of 0
// is a deliberate "no burn estimate for this type" choice and is kept; only a
// missing, negative, or non-numeric rate falls back to the seed rate for a known
// type (else 0). A missing/invalid list → the seed defaults.
function normaliseClassTypes(s) {
  const seedRate = Object.fromEntries(DEFAULT_CLASS_TYPES.map((c) => [c.name, c.rate]));
  if (!Array.isArray(s.classTypes)) { s.classTypes = DEFAULT_CLASS_TYPES.map((c) => ({ ...c })); return; }
  const coerced = s.classTypes
    .map((c) => (typeof c === "string" ? { name: c } : c))
    .filter((c) => c && c.name)
    .map((c) => { const r = parseFloat(c.rate); return { name: c.name, rate: Number.isFinite(r) && r >= 0 ? r : (seedRate[c.name] || 0) }; });
  // Collapse case-duplicate type names ("Box-Fit" / "Box-fit" / "box-fit") to a
  // single entry — keeping the first spelling seen and the highest rate in the
  // group — so a typed case variant can't fork a second type. addClass matches the
  // same way and classRate reads case-insensitively, so older logged classes under
  // a variant spelling still resolve to the kept rate.
  const byLower = new Map();
  coerced.forEach((c) => {
    const prev = byLower.get(c.name.toLowerCase());
    if (prev) prev.rate = Math.max(prev.rate, c.rate);
    else byLower.set(c.name.toLowerCase(), c);
  });
  s.classTypes = Array.from(byLower.values());
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
// A day by its number within the current block, or the shared Holiday Workout for
// the "holiday" sentinel — so the structural edit handlers (sets / add / remove /
// the picker) operate on state.holiday through the same path as a real day.
export function dayDef(day) {
  if (day === "holiday") return state.holiday;
  return currentBlock().days.find((d) => d.day === day);
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

// Purge every log key belonging to a block. The cell-key grammar guarantees every
// day / measure / nutrition / class / band key is hung off a `block.id`-prefixed
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

// Training load for one day: the tonnage `total` plus `loadBearing` — whether the
// day carries load at all. These are two facts the number alone can't express: a
// recovery day becomes load-bearing the moment it holds a banded move, before any
// reps are logged (so `total` is still 0 but the day-volume line should already
// show). Strength days are always load-bearing; a recovery day becomes so once a
// banded move is placed; rest days never are. Free-weight sets contribute
// weight × reps scaled by the loading mode (per-side doubles reps, two-dumbbell
// doubles weight); banded moves contribute band kg × summed reps × the per-side
// factor. Render reads both facts here instead of re-deriving the banded predicate.
// A cell flagged "holiday" swaps in the shared Holiday Workout; otherwise the day
// itself. The cell's coordinates stay the real day's — only the kind + exercise
// list come from the swap (the band moves log against this same cell, which is what
// lets previousSets skip the holiday week — ADR-0002). One name for the swap, read
// by both dayLoad and the renderer rather than re-expressed at each.
export function holidaySwap(cell, d) { return state.log[cell + ".holiday"] ? state.holiday : d; }

export function dayLoad(block, wk, d) {
  const cell = cellKey(block.id, wk, d.day);
  const eff = holidaySwap(cell, d);
  if (eff.kind === "rest") return { total: 0, loadBearing: false };
  let total = 0, loadBearing = eff.kind === "strength";
  eff.exercises.forEach((p) => {
    const ex = state.library[p.id];
    if (!ex) return;
    if (ex.banded) {
      loadBearing = true; // a placed banded move makes the day count, reps or not
      // Band kg × reps; per-side still doubles the reps (the only loading-mode axis
      // that applies to a band — there's no second band for two-dumbbell's weight).
      const kg = bandKg(bandFor(ex, state.log[bandKey(cell, p.id)]));
      if (kg > 0) total += kg * loadMode(ex).rMult * bandedReps(cell, eff, p);
    } else if (eff.kind === "strength") {
      const m = loadMode(ex);
      readSets(block.id, wk, d.day, p.id, p.sets || DEFAULT_SETS).forEach((s) => {
        const w = parseFloat(s.w), r = parseFloat(s.r);
        if (w > 0 && r > 0) total += w * m.wMult * r * m.rMult;
      });
    }
  });
  return { total, loadBearing };
}

// The same day's load one week earlier — wk-1 in this block, or the previous block's
// last week at a week-1 boundary — for the progressive-overload delta on the day's
// volume line. Only a like-for-like comparison: null when the earlier same-day cell's
// holiday state differs from this one's (a band-only holiday day vs a free-weight day
// isn't a meaningful delta), or when there's no earlier same-day cell at all.
export function previousDayTotal(block, wk, d) {
  const curHoliday = !!state.log[cellKey(block.id, wk, d.day) + ".holiday"];
  let pBlock, pWk;
  if (wk > 1) { pBlock = block; pWk = wk - 1; }
  else {
    const bi = state.blocks.findIndex((b) => b.id === block.id);
    if (bi <= 0) return null;
    pBlock = state.blocks[bi - 1]; pWk = WEEKS;
  }
  const pd = pBlock.days.find((x) => x.day === d.day);
  if (!pd) return null;
  if (!!state.log[cellKey(pBlock.id, pWk, pd.day) + ".holiday"] !== curHoliday) return null;
  return dayLoad(pBlock, pWk, pd).total;
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
// user actually recorded rather than the full 7×N (parallels dayLoad's scan).
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

// The class type matching a name, case-insensitively — the one definition of "the
// same class type" (names are deduped case-insensitively in normaliseClassTypes, so
// at most one matches). Both the rate lookup and addClass's reuse-or-create read
// through this. Returns the stored { name, rate } or undefined.
export function findClassType(name) {
  const lc = String(name).toLowerCase();
  return state.classTypes.find((c) => c && c.name.toLowerCase() === lc);
}
// The rate (kcal/min/kg) for a class type, 0 if unknown. Case-insensitive (via
// findClassType) so a class logged under a variant spelling still resolves its rate.
export function classRate(name) {
  const t = findClassType(name);
  return t ? (parseFloat(t.rate) || 0) : 0;
}

// The bodyweight (kg) used for a week's class-calorie estimates: that week's
// logged reading, else the most recent earlier one, else 0 (→ no estimate).
export function weekBodyweight(block, wk) {
  const cur = parseFloat(state.log[measureKey(block.id, wk, "bodyweight")]);
  if (cur > 0) return cur;
  const bi = Math.max(0, state.blocks.findIndex((b) => b.id === block.id));
  const prev = parseFloat(previousMeasure("bodyweight", bi, wk));
  return prev > 0 ? prev : 0;
}

// Class minutes + estimated calorie burn over a set of weeks (one week / all
// weeks). Mirrors nutritionTotals' scan; burn uses each week's bodyweight and the
// type's rate, summed from the same per-class round the labels show.
export function classTotals(block, weeks) {
  let mins = 0, kcal = 0;
  weeks.forEach((wk) => {
    const kg = weekBodyweight(block, wk);
    block.days.forEach((d) => {
      logList(classesKey(cellKey(block.id, wk, d.day))).forEach((c) => {
        const m = parseFloat(c.mins);
        if (m > 0) { mins += m; kcal += kcalBurn(classRate(c.type), m, kg); }
      });
    });
  });
  return { mins, kcal };
}
