/* The data layer: seed catalogues, the mutable store (`state` / `editing`), schema
 * normalisation + the v5→v6 migration, persistence, and the queries that read over the store.
 * Imports the pure helpers + the migration transform; nothing imports back into here that would
 * form a cycle (render / events depend on this, not the reverse).
 *
 * `state` and `editing` are exported as live `let` bindings: importers read them as bare
 * identifiers and see every update, but may only *reassign* them through setState/setEditing here. */

import {
  STORAGE_KEY, SUPPORTED_VERSIONS, STORE_VERSION, DEFAULT_WEEKS, DEFAULT_ROUNDS, DEFAULT_STATION_SEC,
  DEFAULT_STEADY_MIN, STRAIGHT_SET_REST, DEFAULT_RAIL, WINDDOWN_DEFAULTS, DEFAULT_CLASS_TYPES, AWAY_KIT,
} from "./constants.js";
import {
  today, mondayOf, fmtYMD, scheduledDate, cellKey, cellScalarKey, measureKey, slugify, uniqueId, bandKg, isBandMetric,
  e1rm, zoneOf, loadMode, railZones, doubleProgression, guideLoadKg, snapDownDumbbellKg, rirNudge, fitsKit,
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
// planned routine — so it holds only a nightly duration, a weekly target, and its own done-map
// (date → true), the habit's history the way an exercise owns its performances (ADR-0020).
function seedWinddown() { return { durationMin: WINDDOWN_DEFAULTS.durationMin, weeklyTarget: WINDDOWN_DEFAULTS.weeklyTarget, done: {} }; }

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
// A brand-new block for the ＋ Block button — a BLANK weekly template (seven Rest days), composed up
// from nothing in Edit mode (#45), never a forced clone of the last block (the original flaw — #40).
export function newBlockTemplate(id, name) {
  const template = [];
  for (let i = 0; i < 7; i++) template.push({ kind: "rest" });
  return { id, name, startDate: mondayOf(today()), weeks: DEFAULT_WEEKS, template };
}

/* ---------------------------------------------------------------------- *
 * Plan-authoring builders (#45) — the fresh pieces the composer inserts.  *
 * ---------------------------------------------------------------------- */
// A fresh Routine of a given kind, for the Session/Class/Rest kind switch. A Session starts empty
// (compose its Groups); a Class references the first known class type; Rest is bodyless.
export function blankRoutine(kind) {
  if (kind === "session") return { kind: "session", title: "Session", focus: "", groups: [] };
  if (kind === "class") { const c = classList()[0]; return { kind: "class", classType: c ? c.id : "", durationMin: DEFAULT_STEADY_MIN }; }
  return { kind: "rest" };
}
// A fresh Group — a lone straight-set rotation (no items yet); its rounds + rests tune it into a
// superset / circuit / steady as items are added (ADR-0019).
export function blankGroup() { return { items: [], rounds: DEFAULT_ROUNDS, restWithin: 0, restAfter: STRAIGHT_SET_REST }; }
// A fresh Item for a picked exercise: a rep move carries its default rail, a timed move its default
// duration (steady in one long round, a station in seconds) — the axis follows the exercise (ADR-0019).
export function newItem(exId) {
  const ex = state.library[exId];
  if (!ex) return { exId };
  if (ex.volume === "reps") return { exId, rail: (ex.defaultRail || DEFAULT_RAIL).slice() };
  return { exId, time: ex.loadMetric === "machine-level" ? DEFAULT_STEADY_MIN * 60 : DEFAULT_STATION_SEC };
}

// The per-occurrence log scalars keyed by a routine's template position — they must follow a day
// when it is reordered (#47/#48), else a swapped day mis-associates its RPE / holiday state with the
// wrong routine. (Session RPE, collapsed flag, Holiday-Session swap.)
const CELL_SCALARS = ["rpe", "collapsed", "holiday"];

// Swap two weekdays within a block's template (ADR-0024) — a true swap of the two positions, correct
// for ANY pair (the up/down UI passes neighbours; it is not a splice-and-shift). Each day's logged
// history follows it: (1) swap ctx.routine a↔b on this block's performances, so a set logged for a
// routine stays with it (the effort stays on its exercise — ADR-0020; only its slot back-reference
// moves); (2) swap the per-occurrence log scalars (Session RPE, collapsed) at positions a↔b across
// EVERY week, since those are keyed by template position (#47 — carried from #45's day-reorder).
export function swapDays(block, a, b) {
  const t = block.template;
  if (!t || !t[a] || !t[b] || a === b) return;
  [t[a], t[b]] = [t[b], t[a]];
  Object.values(state.library).forEach((ex) => {
    (ex.performances || []).forEach((p) => {
      if (!p.ctx || p.ctx.block !== block.id) return;
      if (p.ctx.routine === a) p.ctx.routine = b;
      else if (p.ctx.routine === b) p.ctx.routine = a;
    });
  });
  for (let wk = 1; wk <= block.weeks; wk++) {
    CELL_SCALARS.forEach((field) => {
      const ka = cellScalarKey(cellKey(block.id, wk, a), field);
      const kb = cellScalarKey(cellKey(block.id, wk, b), field);
      const va = state.log[ka], vb = state.log[kb]; // read both before writing either
      if (vb === undefined) delete state.log[ka]; else state.log[ka] = vb;
      if (va === undefined) delete state.log[kb]; else state.log[kb] = va;
    });
  }
}

/* ---------------------------------------------------------------------- *
 * Store                                                                  *
 * ---------------------------------------------------------------------- */
export let state;
export let editing = false;
export function setState(s) { state = s; }
export function setEditing(v) { editing = v; }

const clampMin = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : d; };

// Re-home legacy per-cell `.winddown` ticks onto the date-keyed habit (#49, ADR-0028). Pre-#49 the
// wind-down was a per-routine cool-down whose done-tick lived on the cell scalar (and the v6
// migration still carries those forward verbatim); now it's a daily habit the singleton owns, so a
// tick on the routine at a cell becomes a tick on that routine's calendar date. Idempotent — it
// deletes each key it re-homes, so a second load finds none. A tick whose block has vanished can't
// be dated and is dropped rather than mis-attributed.
function rehomeWinddownLog(s) {
  const blockById = {};
  s.blocks.forEach((b) => { blockById[b.id] = b; });
  Object.keys(s.log).forEach((k) => {
    const m = /^(.+)\.w(\d+)\.d(\d+)\.winddown$/.exec(k);
    if (!m) return;
    const b = blockById[m[1]];
    if (s.log[k] && b) s.winddown.done[fmtYMD(scheduledDate(b.startDate, Number(m[2]), Number(m[3])))] = true;
    delete s.log[k];
  });
}

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
  const wd = (s.winddown && typeof s.winddown === "object") ? s.winddown : {};
  s.winddown = {
    durationMin: clampMin(wd.durationMin, WINDDOWN_DEFAULTS.durationMin),
    weeklyTarget: clampMin(wd.weeklyTarget, WINDDOWN_DEFAULTS.weeklyTarget),
    done: (wd.done && typeof wd.done === "object") ? { ...wd.done } : {},
  };

  s.blocks.forEach((b) => {
    if (!b.startDate) b.startDate = mondayOf(today());
    b.weeks = clampMin(b.weeks, DEFAULT_WEEKS);
    if (!Array.isArray(b.template)) b.template = [];
    while (b.template.length < 7) b.template.push({ kind: "rest" });
    b.template.forEach((r, i) => { if (!r || !r.kind) b.template[i] = { kind: "rest" }; });
  });
  rehomeWinddownLog(s); // sweep any legacy per-cell `.winddown` tick onto the date-keyed habit (blocks now dated)
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
  // Persist the normalised store so on-disk always matches the current schema: a forward migration
  // (v5→v6) or a one-time re-home (the wind-down tick sweep, #49) reaches disk on this launch rather
  // than lingering until the first interaction. Idempotent for an already-current store.
  save();
}
export function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------------------------------------------------------------------- *
 * Queries over the store                                                 *
 * ---------------------------------------------------------------------- */
export function currentBlock() { return state.blocks.find((b) => b.id === state.ui.block) || state.blocks[0]; }
export function currentBlockIndex() { return Math.max(0, state.blocks.findIndex((b) => b.id === state.ui.block)); }

// The Holiday-Session swap (ADR-0025): a per-occurrence flag (`.holiday` cell scalar, position-keyed
// like `.collapsed`) that substitutes the single shared Holiday Session for a day's plan when you're
// away from your kit. `effectiveRoutine` is what the log view + tonnage read — the swapped-in Holiday
// Session (marked `holiday: true`) or the planned routine. The plan (Edit mode) always shows the real
// routine; only logging is redirected, so the planned exercises accrue no Performance that day and
// their ghosts wait untouched — ADR-0025's outcome, free from per-exercise progression (ADR-0020).
export function isHolidayCell(block, wk, position) {
  return !!state.log[cellScalarKey(cellKey(block.id, wk, position), "holiday")];
}
export function effectiveRoutine(block, wk, position) {
  if (!isHolidayCell(block, wk, position)) return block.template[position];
  const h = state.holiday;
  return { kind: "session", holiday: true, title: h.title, focus: h.focus, groups: h.groups };
}

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
// The exercises the Holiday Session can be built from (ADR-0023/0025): every non-retired exercise
// whose required equipment ⊆ the away-from-home kit (mini-loops + resistance-bands + door-anchor).
// Bodyweight moves (no kit) qualify too. Alphabetical, like libraryList.
export function awayEligible() {
  return libraryList().filter((e) => !e.retired && fitsKit(e.equipment, AWAY_KIT));
}
export function performancesOf(exId) {
  const ex = state.library[exId];
  return ex && Array.isArray(ex.performances) ? ex.performances : [];
}

// A Performance's ctx back-references the exact plan slot it was logged in (ADR-0020): the block,
// week, routine position, group, item, and round. `sameItemSlot` matches every field BUT round —
// it identifies one Item across all its rounds (what tonnage sums over); `sameSlot` adds the round
// for an exact single-round match (what logging upserts). A migrated Performance (coarser ctx, no
// group/item/round) never collides with a slot.
function sameItemSlot(a, b) {
  return !!a && !!b && a.block === b.block && a.week === b.week && a.routine === b.routine &&
    a.group === b.group && a.item === b.item;
}
function sameSlot(a, b) { return sameItemSlot(a, b) && a.round === b.round; }

// The Performance logged at a plan slot (or null) — what a logging input pre-fills from on render.
export function performanceAt(exId, ctx) {
  const ex = state.library[exId];
  return (ex && Array.isArray(ex.performances) && ex.performances.find((p) => sameSlot(p.ctx, ctx))) || null;
}

// Log (or clear) a Session Item's effort at one slot: replace any Performance already at that slot
// with the freshly built one, dated today (ADR-0020 — the effort lives on the exercise, not the
// log). `data` null clears the slot (an un-done / cleared round leaves no Performance — honest
// under-completion, ADR-0026). Zone is derived from the reps for a rep effort, null for a timed one.
export function logPerformance(exId, ctx, data) {
  const ex = state.library[exId];
  if (!ex) return;
  if (!Array.isArray(ex.performances)) ex.performances = [];
  ex.performances = ex.performances.filter((p) => !sameSlot(p.ctx, ctx));
  if (data) {
    const p = {
      date: today(), load: data.load, volume: data.volume,
      zone: data.volume.type === "reps" ? zoneOf(data.volume.val) : null, ctx,
    };
    if (data.rir) p.rir = data.rir; // optional per-set marker (ADR-0027); most sets carry none
    ex.performances.push(p);
  }
  save();
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
 * Progression (#46) — ghost, double-progression target, e1RM, guide ghost*
 * reading the exercise's own timeline (ADRs 0020/0021/0022).             *
 * ---------------------------------------------------------------------- */
// The real ghost (ADR-0021): the most recent performance whose rep-zone is one the item's rail
// spans (railZones) — "your last in-zone set." Matching the spanned zones rather than a single
// label means a set logged at a boundary-straddling rail's ceiling (a [10,15] rail's 15th rep
// stores as endurance) still counts as its ghost. Latest date wins, ties broken by log order (a
// re-logged slot moves to the array's end). Null when nothing in the timeline is in-zone.
export function ghostFor(exId, rail) {
  const zones = railZones(rail);
  if (!zones.length) return null;
  let best = null;
  performancesOf(exId).forEach((p) => {
    if (!p.zone || zones.indexOf(p.zone) < 0) return;
    if (!best || p.date >= best.date) best = p;
  });
  return best;
}

// The advisory e1RM readout (ADR-0022): a cross-zone max + a trend direction — never a per-set
// verdict (double progression owns that). Reads the loaded performances in date order (bodyweight
// sets yield no e1RM and drop out); null when the exercise has none.
export function e1rmTrend(exId) {
  const series = performancesOf(exId)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((p) => e1rm(loadKg(p.load), p.volume && p.volume.val))
    .filter((v) => v != null);
  if (!series.length) return null;
  const latest = series[series.length - 1], prev = series.length > 1 ? series[series.length - 2] : null;
  const dir = prev == null ? "flat" : latest > prev + 1e-9 ? "up" : latest < prev - 1e-9 ? "down" : "flat";
  return { max: Math.max(...series), dir };
}

// The progression surface a rep-Item renders before its log slots (ADR-0021/0022): the real ghost
// (last in-zone set) with its double-progression target; failing that, a self-retiring guide ghost
// (an e1RM-seeded starting load for a cold zone) with a start-at-the-floor target; plus the advisory
// e1RM. Only rep-Items thread this way — a timed Item (no rail) returns null. The guide ghost is a
// kg seed only: a band tier isn't inferred from kg, and a pure-bodyweight move has no e1RM to invert.
export function progressionFor(item, ex) {
  if (!ex || !item || !Array.isArray(item.rail)) return null;
  const rail = item.rail;
  const trend = e1rmTrend(item.exId);
  const ghost = ghostFor(item.exId, rail);
  if (ghost) {
    // The ghost's RIR (if any) nudges the next set — advisory, never a gate (ADR-0027).
    return { ghost, guide: null, target: doubleProgression(rail, ghost.load, ghost.volume.val), e1rm: trend, nudge: rirNudge(ghost.rir) };
  }
  let guide = null, target = null;
  if (ex.loadMetric === "kg" && trend) {
    const seed = guideLoadKg(trend.max, rail[0]);
    if (seed != null && seed > 0) {
      // Snap the e1RM-inverted seed to a real dumbbell rung (ADR-0031) — an estimate you can't load
      // is no use as a starting weight. Guide + target hold the same numbers (start at the floor on
      // the seeded load) but own separate objects, so neither aliases the other.
      const mag = snapDownDumbbellKg(seed), floor = rail[0];
      guide = { load: { metric: "kg", mag }, volume: { type: "reps", val: floor }, estimated: true };
      target = { load: { metric: "kg", mag }, volume: { type: "reps", val: floor }, stepped: false };
    }
  }
  return { ghost: null, guide, target, e1rm: trend, nudge: null };
}

/* ---------------------------------------------------------------------- *
 * Tonnage (#47) — the volume-load readout (ADR-0029), never a progression *
 * signal. Loading mode makes it honest: per-side counts reps on both      *
 * sides (rMult), two-dumbbell the weight on both (wMult).                  *
 * ---------------------------------------------------------------------- */
// A Session's total volume-load (kg) for one occurrence (block/week/position): over its loaded
// rep-Items only, sum each logged set's kg-equivalent × reps, scaled by the exercise's loading mode.
// A band tier resolves to kg (loadKg); bodyweight (0 kg) and timed Items add nothing. 0 for a
// non-Session routine or an unlogged occurrence.
export function sessionTonnageKg(block, wk, position) {
  const r = effectiveRoutine(block, wk, position); // a holiday-swapped day tallies the Holiday Session
  if (!r || r.kind !== "session" || !Array.isArray(r.groups)) return 0;
  let kg = 0;
  r.groups.forEach((g, gi) => {
    (g.items || []).forEach((it, ii) => {
      const ex = state.library[it.exId];
      if (!ex || !Array.isArray(it.rail)) return; // loaded rep-Items only (ADR-0029)
      const m = loadMode(ex);
      const slot = { block: block.id, week: wk, routine: position, group: gi, item: ii };
      (ex.performances || []).forEach((p) => {
        if (!sameItemSlot(p.ctx, slot) || !p.volume || p.volume.type !== "reps") return; // every round of this Item
        kg += loadKg(p.load) * m.wMult * (Number(p.volume.val) || 0) * m.rMult;
      });
    });
  });
  return kg;
}
// A Block's total volume-load (kg) — every week × every day's Session tonnage.
export function blockTonnageKg(block) {
  let kg = 0;
  for (let wk = 1; wk <= block.weeks; wk++)
    for (let pos = 0; pos < block.template.length; pos++) kg += sessionTonnageKg(block, wk, pos);
  return kg;
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

/* ---------------------------------------------------------------------- *
 * Wind-down — the daily mobility habit (#49, ADR-0028)                    *
 * ---------------------------------------------------------------------- */
// The current calendar week's seven nights (Mon–Sun containing today), each with its date and done
// flag — the adherence surface. Block-independent (the habit lives outside any block), so the week
// is anchored to today, not a block start. A night after today isn't yet a fact, so it's `future`.
export function windDownWeek() {
  const now = today();
  const monday = mondayOf(now);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = scheduledDate(monday, 1, i);
    const iso = fmtYMD(date);
    days.push({ iso, date, done: !!state.winddown.done[iso], future: iso > now, isToday: iso === now });
  }
  return days;
}

// Weekly adherence: nights done this calendar week against the target (~6 of 7). A readout only —
// the wind-down feeds no progression, exactly like a body measurement.
export function windDownAdherence() {
  const done = windDownWeek().filter((d) => d.done).length;
  return { done, target: state.winddown.weeklyTarget, met: done >= state.winddown.weeklyTarget };
}

// Tick / un-tick a night. A future night can't be logged (you haven't done it yet); an un-tick
// deletes the key so the done-map stays sparse. Persists, like every store mutation.
export function toggleWinddown(iso) {
  if (iso > today()) return;
  if (state.winddown.done[iso]) delete state.winddown.done[iso];
  else state.winddown.done[iso] = true;
  save();
}

// Set the weekly target / nightly duration (Edit mode) — each a positive integer, floored at 1
// (the same clamp the store's other counts use).
export function setWinddownField(field, value) {
  state.winddown[field] = clampMin(value, 1);
  save();
}
