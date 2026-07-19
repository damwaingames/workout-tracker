/* The data layer: seed catalogues, the mutable store (`state` / `editing`), schema
 * normalisation + the v5→v6 migration, persistence, and the queries that read over the store.
 * Imports the pure helpers + the migration transform; nothing imports back into here that would
 * form a cycle (render / events depend on this, not the reverse).
 *
 * `state` and `editing` are exported as live `let` bindings: importers read them as bare
 * identifiers and see every update, but may only *reassign* them through setState/setEditing here. */

import {
  STORAGE_KEY, SUPPORTED_VERSIONS, STORE_VERSION, DEFAULT_WEEKS, DEFAULT_ROUNDS, DEFAULT_STATION_SEC,
  DEFAULT_STEADY_MIN, STRAIGHT_SET_REST, DEFAULT_RAIL, WINDDOWN_DEFAULTS, DEFAULT_CLASS_TYPES,
} from "./constants.js";
import {
  today, mondayOf, cellKey, measureKey, slugify, uniqueId, bandKg, isBandMetric, e1rm, zoneOf,
} from "./helpers.js";
import { migrateToV6 } from "./migrate.js";

/* ---------------------------------------------------------------------- *
 * Seed data — a starter catalogue for a fresh install.                   *
 * ---------------------------------------------------------------------- */
// One v6 Exercise: a definition (name, cues, intrinsic volume type, load metric, loading mode,
// required equipment, default rail) plus an empty performance history it will accrue (ADR-0020).
function ex(id, name, o) {
  o = o || {};
  const rec = {
    id, name,
    volume: o.volume || "reps",
    loadMetric: o.load || "kg",
    equipment: o.equip || [],
    performances: [],
  };
  if (o.setup) rec.setup = o.setup;
  if (o.cue) rec.cue = o.cue;
  if (o.mode) rec.loadMode = o.mode;
  if (rec.volume === "reps") rec.defaultRail = (o.rail || DEFAULT_RAIL).slice();
  return rec;
}
function keyById(list) { const o = {}; list.forEach((x) => (o[x.id] = x)); return o; }

function seedLibrary() {
  const DB = ["adjustable-dumbbells"], MAT = ["mat"], LOOP = ["mini-loops"];
  return keyById([
    ex("goblet-squats", "Goblet Squats", { equip: DB, setup: "Hold a single dumbbell vertically against your chest." }),
    ex("bent-over-rows", "Bent Over Rows", { equip: DB, mode: "two-dumbbell", setup: "Hinge at the hips with a flat back, dumbbells hanging down. Pull your elbows up." }),
    ex("bicep-curls", "Bicep Curls", { equip: DB, mode: "two-dumbbell", setup: "Palms forward, curl the weights up keeping your elbows tucked at your sides." }),
    ex("dumbbell-rdls", "Dumbbell RDLs", { equip: DB, mode: "two-dumbbell", setup: "Soft knees, push your hips straight back, slide the weights down your thighs." }),
    ex("floor-chest-presses", "Floor Chest Presses", { equip: DB, mode: "two-dumbbell", setup: "Lie on your back on the floor. Press the dumbbells up." }),
    ex("glute-bridges", "Glute Bridges", { equip: MAT, rail: [10, 15], setup: "Lie on your back, knees bent, feet flat. Squeeze your glutes and lift your hips." }),
    ex("overhead-shoulder-presses", "Overhead Shoulder Presses", { equip: DB, mode: "two-dumbbell", setup: "Press the dumbbells from shoulder height up overhead." }),
    ex("crunches", "Crunches", { equip: MAT, setup: "Lie on your back, lift your shoulder blades slightly using your upper abs." }),
    ex("sumo-squats", "Sumo Squats", { equip: DB, setup: "Wide stance, toes pointed out. Hold one dumbbell down between your legs." }),
    ex("dumbbell-lateral-raises", "Dumbbell Lateral Raises", { equip: DB, mode: "two-dumbbell", setup: "Raise your arms straight out to the sides until parallel with the floor." }),
    ex("single-arm-concentrated-rows", "Single-Arm Concentrated Rows", { equip: DB, mode: "per-side", rail: [8, 12], setup: "Staggered stance, rest one elbow on your forward knee. Row a dumbbell to your hip." }),
    ex("deficit-reverse-lunges", "Deficit Reverse Lunges", { equip: DB, mode: "per-side", setup: "Step one foot back to lunge, lowering your back knee near the floor." }),
    ex("banded-clamshells", "Banded Clamshells", { load: "mini-loop", equip: LOOP, mode: "per-side", rail: [10, 15], setup: "Loop a mini-band around your thighs above the knees. Open your knees out." }),
    ex("banded-hip-abductions", "Banded Hip Abductions", { load: "mini-loop", equip: LOOP, rail: [10, 15], setup: "Mini-band above the knees. Drive your knees apart against the band." }),
    ex("banded-glute-bridges", "Banded Glute Bridges", { load: "mini-loop", equip: LOOP, rail: [10, 15], setup: "Band above your knees. Drive your hips up and push your knees out at the top." }),
    ex("banded-monster-walks", "Banded Monster Walks", { load: "mini-loop", equip: LOOP, mode: "per-side", rail: [10, 15], setup: "Band around your ankles. Half-squat and take controlled lateral steps." }),
    ex("banded-push-ups", "Banded Push-Ups", { load: "mini-loop", equip: LOOP, setup: "Light band around your forearms. Lower your chest with control." }),
    ex("high-knees", "High Knees", { volume: "time", load: "none", setup: "Run on the spot, driving your knees up toward your chest." }),
    ex("wall-press-ups", "Wall Press-Ups", { volume: "time", load: "none", setup: "Hands on a wall, lower your chest toward it and press back." }),
    ex("glute-squeezes", "Glute Squeezes", { volume: "time", load: "none", setup: "Stand or lie down and squeeze your glutes hard, hold, release." }),
    ex("calf-raises", "Calf Raises", { volume: "time", load: "none", setup: "Rise onto the balls of your feet, then lower with control." }),
    ex("hollow-body-holds", "Hollow Body Holds", { volume: "time", load: "none", equip: MAT, setup: "On your back, press your low back down and lift shoulders + legs into a dish." }),
    ex("seated-forward-fold-stretch", "Seated Forward Fold Stretch", { volume: "time", load: "none", equip: MAT, setup: "Sit with legs extended and fold forward from the hips." }),
    ex("quad-stretch", "Quad Stretch", { volume: "time", load: "none", setup: "Stand, pull one heel toward your glute, keep knees together. Swap sides." }),
    ex("cat-cow", "Cat-Cow", { volume: "time", load: "none", equip: MAT, setup: "On hands and knees, alternate arching (cat) and dropping (cow) your spine.", cue: "Move with the breath — inhale to cow, exhale to cat." }),
    ex("pigeon-pose", "Pigeon Pose", { volume: "time", load: "none", equip: MAT, setup: "One shin forward across the mat, the other leg back; fold over the front shin.", cue: "Ease in — back off if the knee complains." }),
    ex("worlds-greatest-stretch", "World's Greatest Stretch", { volume: "time", load: "none", equip: MAT, setup: "From a lunge, drop the same-side elbow down, then rotate that arm to the ceiling." }),
    ex("seated-elliptical", "Seated Elliptical", { volume: "time", load: "machine-level", setup: "Warm up easy, settle into a steady rhythm, ease off the last 2 min. Set resistance to hold the effort your session's focus calls for." }),
  ]);
}

// The class-type catalogue (ADR-0030): each type is a first-class entity that owns its attendance
// history, seeded from the default names. Ids are slugs so case can't fork a type ("box-fit").
function seedClasses() {
  const o = {};
  DEFAULT_CLASS_TYPES.forEach((name) => { const id = slugify(name); o[id] = { id, name, attendances: [] }; });
  return o;
}

// A lone-item Group of N straight sets against a rail — the shape strength placements take.
function setsGroup(exId, rounds, rail) {
  return { items: [{ exId, rail: (rail || DEFAULT_RAIL).slice() }], rounds, restWithin: 0, restAfter: STRAIGHT_SET_REST };
}
function seedBlock(id, name) {
  const session = (title, focus, groups) => ({ kind: "session", title, focus, groups });
  const template = [
    session("Workout A", "Squat & Row", [setsGroup("goblet-squats", 3), setsGroup("bent-over-rows", 3), setsGroup("banded-clamshells", 3, [10, 15]), setsGroup("bicep-curls", 3)]),
    // A conditioning circuit: one Group of timed stations rotated for rounds (ADR-0019).
    session("Recovery A", "Cardio Flush", [{ items: ["high-knees", "wall-press-ups", "glute-squeezes", "calf-raises"].map((exId) => ({ exId, time: DEFAULT_STATION_SEC })), rounds: DEFAULT_ROUNDS, restWithin: 15, restAfter: 0 }]),
    session("Workout B", "Hinge & Press", [setsGroup("dumbbell-rdls", 3), setsGroup("floor-chest-presses", 3), setsGroup("glute-bridges", 3, [10, 15]), setsGroup("overhead-shoulder-presses", 3)]),
    { kind: "rest" },
    session("Workout C", "Sumo & Accessory", [setsGroup("sumo-squats", 3), setsGroup("dumbbell-lateral-raises", 3), setsGroup("single-arm-concentrated-rows", 3), setsGroup("crunches", 3)]),
    // A steady effort: one one-round Group whose item is a timed machine-level ride.
    session("Steady Cardio", "Zone 2", [{ items: [{ exId: "seated-elliptical", time: DEFAULT_STEADY_MIN * 60 }], rounds: 1, restWithin: 0, restAfter: 0 }]),
    { kind: "rest" },
  ];
  return { id, name, startDate: mondayOf(today()), weeks: DEFAULT_WEEKS, template };
}

// The Holiday Session (ADR-0025): a single band-only Session swapped in when away from your kit.
function seedHoliday() {
  return {
    title: "Holiday Session", focus: "Bands only — minimal kit",
    groups: ["banded-monster-walks", "banded-glute-bridges", "banded-push-ups", "banded-clamshells"].map((exId) => setsGroup(exId, 3, [10, 15])),
  };
}

// The wind-down (ADR-0028): a freeform daily mobility habit tracked as weekly adherence, not a
// planned routine — so it holds only a nightly duration + a weekly target, no fixed stretch list.
function seedWinddown() { return { durationMin: WINDDOWN_DEFAULTS.durationMin, weeklyTarget: WINDDOWN_DEFAULTS.weeklyTarget }; }

// Body-measurement catalogue (untouched infra). Bodyweight is the only mass (kg); the rest are cm.
export function M(id, name, unit) { return { id, name, unit }; }
function seedMeasurements() {
  return keyById([
    M("bodyweight", "Bodyweight", "kg"), M("waist", "Waist", "cm"), M("chest", "Chest", "cm"),
    M("hips", "Hips", "cm"), M("thigh", "Thigh", "cm"), M("calf", "Calf", "cm"),
    M("bicep", "Bicep", "cm"), M("forearm", "Forearm", "cm"), M("neck", "Neck", "cm"),
  ]);
}

export function defaultState() {
  return {
    version: STORE_VERSION, library: seedLibrary(), classes: seedClasses(),
    blocks: [seedBlock("b1", "Block 1")], log: {}, ui: { block: "b1", week: 1, view: "plan" }, notes: "",
    measurements: seedMeasurements(), tracked: ["bodyweight"], profile: {},
    holiday: seedHoliday(), winddown: seedWinddown(),
  };
}
// A brand-new block for the ＋ Block button — a fresh seed template (authoring is a later slice).
export function newBlockTemplate(id, name) { return seedBlock(id, name); }

/* ---------------------------------------------------------------------- *
 * Store                                                                  *
 * ---------------------------------------------------------------------- */
export let state;
export let editing = false;
export function setState(s) { state = s; }
export function setEditing(v) { editing = v; }

const clampMin = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : d; };

// Bring any loadable store to a well-formed v6 shape. A pre-v6 save runs through the forward
// migration (ADRs 0019–0029); a v6 save is only backfilled. Unloadable input resets to defaults —
// which is why applyBackup gates on the version explicitly before ever calling this.
function normalise(s) {
  if (!s || !SUPPORTED_VERSIONS.includes(s.version) || !Array.isArray(s.blocks) || !s.blocks.length) return defaultState();
  if (s.version < STORE_VERSION) s = migrateToV6(s);

  if (!s.library || typeof s.library !== "object") s.library = {};
  // Union in any seed exercise a save lacks (a later release added it); never clobber the user's
  // own records or edits. Ensure every record carries a performance history array.
  const seedLib = seedLibrary();
  Object.keys(seedLib).forEach((id) => { if (!s.library[id]) s.library[id] = seedLib[id]; });
  Object.values(s.library).forEach((rec) => { if (!Array.isArray(rec.performances)) rec.performances = []; });

  if (!s.classes || typeof s.classes !== "object") s.classes = {};
  const seedCl = seedClasses();
  Object.keys(seedCl).forEach((id) => { if (!s.classes[id]) s.classes[id] = seedCl[id]; });
  Object.values(s.classes).forEach((ct) => { if (!Array.isArray(ct.attendances)) ct.attendances = []; });

  if (!s.log || typeof s.log !== "object") s.log = {};
  if (!s.measurements) s.measurements = seedMeasurements();
  if (!Array.isArray(s.tracked)) s.tracked = ["bodyweight"];
  if (!s.profile || typeof s.profile !== "object") s.profile = {};
  s.holiday = (s.holiday && Array.isArray(s.holiday.groups)) ? s.holiday : seedHoliday();
  s.winddown = (s.winddown && typeof s.winddown === "object")
    ? { durationMin: clampMin(s.winddown.durationMin, WINDDOWN_DEFAULTS.durationMin), weeklyTarget: clampMin(s.winddown.weeklyTarget, WINDDOWN_DEFAULTS.weeklyTarget) }
    : seedWinddown();

  s.blocks.forEach((b) => {
    if (!b.startDate) b.startDate = mondayOf(today());
    b.weeks = clampMin(b.weeks, DEFAULT_WEEKS);
    if (!Array.isArray(b.template)) b.template = [];
    while (b.template.length < 7) b.template.push({ kind: "rest" });
    b.template.forEach((r, i) => { if (!r || !r.kind) b.template[i] = { kind: "rest" }; });
  });
  if (!s.ui || typeof s.ui !== "object" || !s.blocks.some((b) => b.id === s.ui.block)) s.ui = { block: s.blocks[0].id, week: 1 };
  if (s.ui.view !== "library") s.ui.view = "plan"; // the top-level tab; anything unknown → plan
  if (typeof s.notes !== "string") s.notes = "";
  s.version = STORE_VERSION;
  return s;
}
export { normalise };

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

export function setLog(k, v) {
  if (v === "" || v === false || v == null) delete state.log[k];
  else state.log[k] = v;
  save();
}

// Delete a block — the *plan* only. Its exercises' performances and its classes' attendances live
// on those entities (ADR-0020/0030), not in the block or the log, so they survive untouched; this
// removes the block object and sweeps its block-prefixed occurrence + measurement log keys. (The
// pre-v6 block-log purge deleted logged history keyed to the wrong owner — ADR-0020 re-homed it, so
// this delete is safe.) No save() — the caller saves after confirming.
export function deleteBlock(blockId) {
  if (state.blocks.length <= 1) return false;
  Object.keys(state.log).forEach((k) => { if (k.indexOf(blockId + ".") === 0) delete state.log[k]; });
  state.blocks = state.blocks.filter((b) => b.id !== blockId);
  if (!state.blocks.some((b) => b.id === state.ui.block)) state.ui = { block: state.blocks[0].id, week: 1 };
  return true;
}

export function nextBlockNumber() {
  let max = 0;
  state.blocks.forEach((b) => { const m = /(\d+)/.exec(b.name || ""); if (m) max = Math.max(max, +m[1]); });
  return max + 1;
}
export function blockIdTaken(id) { return state.blocks.some((b) => b.id === id); }

// The library as a display list: every exercise, retired ones last (a retired move is hidden from
// pickers but kept, since a performance references it — ADR-0020), alphabetical within each group.
export function libraryList() {
  return Object.values(state.library).sort((a, b) =>
    (!!a.retired - !!b.retired) || a.name.localeCompare(b.name));
}
export function classList() {
  return Object.values(state.classes).sort((a, b) => a.name.localeCompare(b.name));
}
export function performancesOf(exId) {
  const ex = state.library[exId];
  return ex && Array.isArray(ex.performances) ? ex.performances : [];
}

// The kg-equivalent of a Load, for e1RM + volume-load: a kg magnitude direct, a band tier via its
// family's table (ADR-0029), and 0 for a machine level or a resistance-free move (no real kg).
export function loadKg(load) {
  if (!load) return 0;
  if (load.metric === "kg") return Number(load.mag) || 0;
  if (isBandMetric(load.metric)) return bandKg(load.metric, load.mag);
  return 0;
}

// An exercise's PRs, derived from its performance history and shown read-only in the Library
// (ADRs 0020/0021/0022). For a rep exercise: the headline top e1RM (needs load > 0), plus the best
// set per rep-zone (by e1RM where loaded, else by rep count for bodyweight). For a time exercise:
// the longest effort, plus the top machine level where it carries one. Null when there's no history.
export function prsOf(exId) {
  const ex = state.library[exId];
  if (!ex) return null;
  const perfs = ex.performances || [];
  if (!perfs.length) return null;
  if (ex.volume === "reps") {
    let topE1rm = null;
    const byZone = {};
    perfs.forEach((p) => {
      const kg = loadKg(p.load);
      const est = e1rm(kg, p.volume.val);
      if (est != null && (!topE1rm || est > topE1rm.value)) topE1rm = { value: est, perf: p };
      const z = p.zone || zoneOf(p.volume.val);
      if (z) {
        const score = est != null ? est : Number(p.volume.val);
        if (!byZone[z] || score > byZone[z].score) byZone[z] = { score, perf: p, est };
      }
    });
    return { kind: "reps", topE1rm, byZone };
  }
  let longest = null, topLevel = null;
  perfs.forEach((p) => {
    if (!longest || Number(p.volume.val) > Number(longest.volume.val)) longest = p;
    if (p.load && p.load.metric === "machine-level" && p.load.mag != null && (!topLevel || Number(p.load.mag) > Number(topLevel.load.mag))) topLevel = p;
  });
  return { kind: "time", longest, topLevel };
}

/* ---------------------------------------------------------------------- *
 * Measurements (untouched infra — weekly, per block/week/measurement)    *
 * ---------------------------------------------------------------------- */
// Most recent earlier value of a measurement, scanning (block, week) back from the cursor.
export function previousMeasure(mId, curBlockIdx, curWeek) {
  const rank = (bi, wk) => bi * 100 + wk;
  const cutoff = rank(curBlockIdx, curWeek);
  let best = null;
  state.blocks.forEach((block, bi) => {
    for (let wk = 1; wk <= block.weeks; wk++) {
      const order = rank(bi, wk);
      if (order >= cutoff) continue;
      const v = state.log[measureKey(block.id, wk, mId)];
      if (v != null && v !== "" && (!best || order > best.order)) best = { order, v };
    }
  });
  return best ? best.v : null;
}

// BMI for a week = bodyweight / height² (metric). Null unless both a stored height and that week's
// bodyweight are present.
export function bmiFor(block, wk) {
  const h = parseFloat(state.profile && state.profile.heightCm);
  const w = parseFloat(state.log[measureKey(block.id, wk, "bodyweight")]);
  if (!(h > 0) || !(w > 0)) return null;
  const m = h / 100;
  return w / (m * m);
}

// The cell coordinate for a routine position in the current block/week (occurrence scalars).
export function currentCell(position) { return cellKey(currentBlock().id, state.ui.week, position); }
