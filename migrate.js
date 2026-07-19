/* The v5→v6 forward migration (ADRs 0019–0029). A pure transform: take an old-shape store (any
 * of the loadable pre-v6 versions — v2 renamed day→routine, v4 stripped nutrition, v5 is current)
 * and return the v6 shape, losing no logged history. It is the one place that knows the old
 * block-cell key grammar, kept alive here solely to be dismantled: every logged set / round /
 * steady field becomes a Performance on its Exercise (ADR-0020), every logged class occurrence an
 * Attendance on its ClassType (ADR-0030), and old blocks/routines/placements become the new
 * Block / Session / Group / Item shape (ADR-0019). Imports only the pure helpers, so state.js can
 * run it during normalise and a pure-Node test can call it directly with an injected store. */

import {
  DEFAULT_WEEKS, DEFAULT_ROUNDS, DEFAULT_STATION_SEC, DEFAULT_STEADY_MIN,
  STRAIGHT_SET_REST, DEFAULT_RAIL, DEFAULT_BAND_TIER, WINDDOWN_DEFAULTS, DEFAULT_CLASS_TYPES,
} from "./constants.js";
import { mondayOf, scheduledDate, fmtYMD, parseRail, zoneOf, slugify, today, cellKey, cellScalarKey, isBandMetric } from "./helpers.js";

/* ---------------------------------------------------------------------- *
 * Exercise: old library record → v6 Exercise (definition + empty history)*
 * ---------------------------------------------------------------------- */
// The contexts an old record was valid in — its `contexts` set, or, for a record authored before
// ADR-0007, the legacy scalar `type`. Used only to infer the v6 intrinsic properties below.
function oldContexts(ex) {
  if (Array.isArray(ex.contexts)) return ex.contexts;
  return [ex.type === "strength" ? "strength" : "recovery"];
}

// Which band family an old banded move belongs to (the old model had one shared tier ladder and
// never recorded the family). Loop-style moves cue the band around a body part (thighs / knees /
// ankles) or call it a "mini-band"; long resistance-band moves cue a "full-size" band that is
// "anchored" (to a door / low point). Keying on those long-band phrases classifies the real library
// exactly (13 mini-loops vs 4 anchored long-bands); anything unrecognised defaults to the more
// common mini-loop. Reclassify per-exercise in the Library later (#50) if any slips through.
function bandFamilyOf(ex) {
  const t = ((ex.setup || "") + " " + (ex.name || "")).toLowerCase();
  return /full[- ]size|anchor|door|handle|long[- ]band/.test(t) ? "long-band" : "mini-loop";
}

// Best-effort equipment tags from the inferred load metric (the old model had no equipment). Only
// really consulted by the Holiday Session filter (#48); the Library editor (#50) refines it.
function equipmentFor(loadMetric, contexts) {
  if (loadMetric === "mini-loop") return ["mini-loops"];
  if (loadMetric === "long-band") return ["resistance-bands"];
  if (loadMetric === "kg") return ["adjustable-dumbbells"];
  if (loadMetric === "none" && contexts.includes("mobility")) return ["mat"];
  return [];
}

function migrateExercise(ex) {
  const contexts = oldContexts(ex);
  const banded = !!ex.banded;
  const hasLevels = Number(ex.levels) > 0;
  const rail = parseRail(ex.targetReps); // a parseable rep range ("8–12 each leg" → [8,12]) marks a rep move
  // Volume + load metric, in priority order — the old model didn't store either, so both are
  // inferred from the intrinsic signals it did carry:
  //   banded            → reps against a band family (banded moves log a rep count);
  //   levelled machine  → a timed effort against a machine level (steady cardio);
  //   a mobility-only move → a timed, resistance-free move (held / flowed by feel);
  //   has a rep range   → reps against kg (bodyweight is just 0 kg);
  //   otherwise         → time, no load — a timed hold / conditioning station with no rep range
  //                        (this is what rescues holds like hollow-body-holds from being read as reps).
  let loadMetric, volume;
  if (banded) { loadMetric = bandFamilyOf(ex); volume = "reps"; }
  else if (hasLevels) { loadMetric = "machine-level"; volume = "time"; }
  else if (contexts.includes("mobility") && !contexts.includes("strength")) { loadMetric = "none"; volume = "time"; }
  else if (rail) { loadMetric = "kg"; volume = "reps"; }
  else { loadMetric = "none"; volume = "time"; }

  const out = { id: ex.id, name: ex.name, volume, loadMetric, equipment: equipmentFor(loadMetric, contexts) };
  if (ex.setup) out.setup = ex.setup;
  if (ex.cue) out.cue = ex.cue;
  // Loading mode survives only for its narrowed job (tonnage honesty — ADR-0029); standard is the
  // default, so it is omitted rather than stored.
  if (ex.loadMode && ex.loadMode !== "standard") out.loadMode = ex.loadMode;
  // A rep exercise carries a default rail — its parsed old target, else the default range.
  if (volume === "reps") out.defaultRail = rail || DEFAULT_RAIL.slice();
  out.performances = [];
  return out;
}

/* ---------------------------------------------------------------------- *
 * Blocks: old routines/placements → the weekly template of Routines      *
 * ---------------------------------------------------------------------- */
// The old routines of a block, tolerant of every historical shape: v2 `days` with `.day` numbers
// and `exerciseIds`, v5 `routines` with `.routine` numbers and `exercises` placements.
function oldRoutines(block) {
  const list = Array.isArray(block.routines) ? block.routines : (Array.isArray(block.days) ? block.days : []);
  return list.map((r) => {
    const num = r.routine != null ? r.routine : r.day;
    const exercises = Array.isArray(r.exercises)
      ? r.exercises
      : (Array.isArray(r.exerciseIds) ? r.exerciseIds.map((id) => ({ id })) : []);
    return { ...r, routine: num, exercises };
  });
}

// One old placement → a v6 Item: an exercise ref carrying the axis it tracks. A rep move takes a
// rail (its default, since the old placement held none); a time move takes the planned duration.
function toItem(exId, lib, timeSec) {
  const ex = lib[exId];
  const item = { exId };
  if (ex && ex.volume === "reps") item.rail = (ex.defaultRail || DEFAULT_RAIL).slice();
  else if (timeSec != null) item.time = timeSec;
  return item;
}

// A lone-item Group of N straight sets — the shape a strength placement (and a Holiday move) takes:
// one exercise run for N rounds with a between-sets rest-after and no rest-within (ADR-0019).
function straightSets(exId, sets, lib) {
  return { items: [toItem(exId, lib)], rounds: Math.max(1, Number(sets) || 1), restWithin: 0, restAfter: STRAIGHT_SET_REST };
}

// An old routine → a v6 Routine (a Session of Groups, a Class, or Rest). The strength/recovery/
// steady kinds collapse into Session, differing only in how their one-or-many Groups are shaped:
//   strength → one lone-item Group per exercise (N straight sets),
//   recovery → one Group of all items rotated for N rounds (a circuit / superset),
//   steady   → one one-item, one-round Group (a single timed effort).
function toRoutine(r, lib, classIdOf) {
  if (r.kind === "class") {
    return { kind: "class", classType: classIdOf(r.classType), durationMin: Number(r.durationMin) || DEFAULT_STEADY_MIN };
  }
  if (r.kind === "rest") return { kind: "rest" };

  let groups = [];
  if (r.kind === "steady") {
    const ex = r.exercises[0];
    if (ex) groups = [{ items: [toItem(ex.id, lib, (Number(r.durationMin) || DEFAULT_STEADY_MIN) * 60)], rounds: 1, restWithin: 0, restAfter: 0 }];
  } else if (r.kind === "recovery") {
    const workSec = Number(r.workSec) || DEFAULT_STATION_SEC;
    const items = r.exercises.map((p) => toItem(p.id, lib, workSec)).filter((it) => lib[it.exId]);
    if (items.length) groups = [{ items, rounds: Number(r.rounds) || DEFAULT_ROUNDS, restWithin: Number(r.restSec) || 0, restAfter: Number(r.roundRestSec) || 0 }];
  } else {
    // strength (or any other placement-bearing kind): one lone-item Group per exercise, its rounds
    // the old set count — a straight-set is a one-item Group run for N rounds (ADR-0019).
    groups = r.exercises.filter((p) => lib[p.id]).map((p) => straightSets(p.id, p.sets, lib));
  }
  return { kind: "session", title: r.title || "Session", focus: r.focus || "", groups };
}

// A block's routines laid out as a 7-slot weekly template, one Routine per weekday (Mon..Sun),
// indexed by the old routine number (1→Mon). Any slot the old block didn't fill is an explicit Rest
// so all seven days always read true (ADR-0024).
function toTemplate(routines, lib, classIdOf) {
  const template = Array.from({ length: 7 }, () => ({ kind: "rest" }));
  routines.forEach((r) => {
    const i = (Number(r.routine) || 1) - 1;
    if (i >= 0 && i < 7) template[i] = toRoutine(r, lib, classIdOf);
  });
  return template;
}

/* ---------------------------------------------------------------------- *
 * The log walk: cell-keyed logs → Performances + Attendances             *
 * ---------------------------------------------------------------------- */
// Every routine-scoped log key hangs off a `block.id.w{wk}.d{routineNumber}` cell (ADR-0005's
// frozen `.d` segment). Capture the coordinate + the trailing field; measurement (`.m.`) and
// schedule (`.sched`) keys don't carry a `.d`, so they never match here.
const CELL = /^(.+)\.w(\d+)\.d(\d+)\.(.+)$/;
// Occurrence scalars with no owning entity (Session RPE, the wind-down tick, the recovery energy
// note, a rest-day joints note) are carried forward verbatim — real user data a later slice
// (#47 RPE, #49 wind-down) will re-home. `done` / `collapsed` (UI + derivable from performances),
// the now-redundant `holiday` swap flag, and `sched` (the dissolved schedule — ADR-0024) are dropped.
const KEEP_SCALARS = new Set(["rpe", "wdrpe", "energy", "joints", "winddown"]);

// The historical weekday a routine fell on: the block start + week offset + its position in that
// week's schedule (the old reorderable permutation, honoured via lazy-lookback so dates match what
// the app showed). A performance carries its own date (ADR-0020), so this is the sensible date the
// old logs never stored, computed once here.
function positionResolver(block, log) {
  const nums = oldRoutines(block).map((r) => Number(r.routine)).filter((n) => n >= 1);
  return (wk, routineNum) => {
    let stored = null;
    for (let w = wk; w >= 1 && !stored; w--) {
      const s = log[block.id + ".w" + w + ".sched"];
      if (Array.isArray(s)) stored = s;
    }
    const order = (stored || []).filter((n) => nums.includes(n));
    nums.forEach((n) => { if (!order.includes(n)) order.push(n); });
    const pos = order.indexOf(routineNum);
    return pos >= 0 ? pos : routineNum - 1;
  };
}

// Build one Performance record. Load axis follows the exercise's metric; volume + zone follow what
// was logged. `ctx` back-references the session occurrence so a Session view can render it (ADR-0020).
function performance(date, load, volume, ctx) {
  return { date, load, volume, zone: volume.type === "reps" ? zoneOf(volume.val) : null, ctx };
}

// Walk the whole log once: convert every effort key into a Performance on its exercise and every
// class occurrence into an Attendance on its ClassType, keep the occurrence scalars + measurements,
// and drop everything now redundant. Mutates `lib` (pushing performances) and `classes` (pushing
// attendances); returns the slim log to carry forward.
function walkLog(store, lib, classes, classIdOf) {
  const log = store.log && typeof store.log === "object" ? store.log : {};
  const blockById = {}, posOf = {}, routineOf = {};
  (store.blocks || []).forEach((b) => {
    blockById[b.id] = b;
    posOf[b.id] = positionResolver(b, log);
    routineOf[b.id] = {};
    oldRoutines(b).forEach((r) => { routineOf[b.id][Number(r.routine)] = r; });
  });

  // Pass 1 — index the values a Performance needs to be built but that aren't themselves efforts:
  // the per-cell band tier (banded moves take their kg from it) and the per-cell steady/class
  // scalars (grouped into one Performance / Attendance per cell). Strength sets are grouped by set
  // index so a set's weight + reps land in one record.
  const bandAt = {};           // "blockId|wk|routine|exId" → tier
  const strengthSets = {};     // "blockId|wk|routine|exId|i" → { w, r }
  const cellScalars = {};      // "blockId|wk|routine" → { mins, resist, kcal, note }
  const rounds = [];           // { blockId, wk, routine, exId, reps? } for circuit efforts
  const keptLog = {};

  const cellKeyOf = (b, wk, rt) => b + "|" + wk + "|" + rt;

  Object.keys(log).forEach((key) => {
    const v = log[key];
    // Body measurements are untouched infra — carried verbatim.
    if (/\.w\d+\.m\./.test(key)) { keptLog[key] = v; return; }
    const m = CELL.exec(key);
    if (!m) return; // schedule keys and anything unrecognised are dropped
    const [, blockId, wkStr, rtStr, field] = m;
    const wk = Number(wkStr), rt = Number(rtStr);
    const base = cellKeyOf(blockId, wk, rt);

    let mm;
    if ((mm = /^ex\.(.+)\.s(\d+)\.(w|r)$/.exec(field))) {
      const gk = base + "|" + mm[1] + "|" + mm[2];
      (strengthSets[gk] || (strengthSets[gk] = { exId: mm[1], blockId, wk, rt, i: Number(mm[2] )}))[mm[3]] = v;
    } else if ((mm = /^ex\.(.+)\.rr(\d+)$/.exec(field))) {
      if (Number(v) > 0) rounds.push({ blockId, wk, rt, exId: mm[1], reps: Number(v) });
    } else if ((mm = /^ex\.(.+)\.r(\d+)$/.exec(field))) {
      if (v) rounds.push({ blockId, wk, rt, exId: mm[1] }); // a done checkbox → a timed round
    } else if ((mm = /^ex\.(.+)\.band$/.exec(field))) {
      bandAt[base + "|" + mm[1]] = v;
    } else if (field === "mins" || field === "resist" || field === "kcal" || field === "note") {
      (cellScalars[base] || (cellScalars[base] = {}))[field] = v;
    } else if (KEEP_SCALARS.has(field)) {
      // Real occurrence data with no owning entity — carried forward, but re-keyed onto the v6 cell
      // grammar through the helpers (the key grammar lives only in helpers): the old key held the
      // routine NUMBER, the new cellKey holds the template POSITION (routine N landed at slot N−1 in
      // toTemplate), so later slices read it back via cellKey / cellScalarKey.
      keptLog[cellScalarKey(cellKey(blockId, wk, rt - 1), field)] = v;
    }
    // everything else (ex.*.sets / .rounds overrides, done, collapsed, holiday) is dropped
  });

  // The band tier a banded effort logged (per cell), else the exercise's old default, else neutral.
  const tierFor = (blockId, wk, rt, exId) => bandAt[cellKeyOf(blockId, wk, rt) + "|" + exId] || (lib[exId] && lib[exId]._defaultBand) || DEFAULT_BAND_TIER;
  const dateFor = (blockId, wk, rt) => {
    const b = blockById[blockId];
    if (!b) return today();
    return fmtYMD(scheduledDate(b.startDate, wk, posOf[blockId](wk, rt)));
  };
  const push = (exId, perf) => { if (lib[exId]) lib[exId].performances.push(perf); };
  // A steady routine logged its minutes/level on the CELL, not on an exercise, so an old steady
  // routine that never named its activity (an empty exercises list) would strand that session with
  // no owner. Recover it to the library's sole machine-level activity when there's exactly one
  // (there is — the seated elliptical), so no logged steady session is lost.
  const machineIds = Object.keys(lib).filter((id) => lib[id].loadMetric === "machine-level");
  const soleMachineId = machineIds.length === 1 ? machineIds[0] : null;

  // Pass 2a — strength sets. A banded strength move logs reps against a band tier; a free-weight
  // move logs weight × reps (weight absent = bodyweight, 0 kg). Either way a Performance needs a
  // rep count — reps is the volume axis, and e1RM/zone are undefined without it — so a set that
  // logged a weight but no reps (an incomplete half-entry) is intentionally dropped rather than
  // stored as a rep-less rep-Performance. The inverse (reps, no weight) IS kept, as bodyweight.
  Object.values(strengthSets).forEach((g) => {
    const ex = lib[g.exId];
    if (!ex) return;
    const reps = Number(g.r);
    if (!(reps > 0)) return;
    const ctx = { block: g.blockId, week: g.wk, routine: g.rt };
    const date = dateFor(g.blockId, g.wk, g.rt);
    if (isBandMetric(ex.loadMetric)) {
      push(g.exId, performance(date, { metric: ex.loadMetric, mag: tierFor(g.blockId, g.wk, g.rt, g.exId) }, { type: "reps", val: reps }, ctx));
    } else {
      const w = Number(g.w);
      push(g.exId, performance(date, { metric: "kg", mag: w > 0 ? w : 0 }, { type: "reps", val: reps }, ctx));
    }
  });

  // Pass 2b — circuit rounds. A banded round logged reps (a rep effort against a band); a plain
  // round is a done checkbox → a timed station of the routine's work seconds.
  rounds.forEach((rd) => {
    const ex = lib[rd.exId];
    if (!ex) return;
    const ctx = { block: rd.blockId, week: rd.wk, routine: rd.rt };
    const date = dateFor(rd.blockId, rd.wk, rd.rt);
    if (rd.reps != null && isBandMetric(ex.loadMetric)) {
      push(rd.exId, performance(date, { metric: ex.loadMetric, mag: tierFor(rd.blockId, rd.wk, rd.rt, rd.exId) }, { type: "reps", val: rd.reps }, ctx));
    } else if (rd.reps == null) {
      const workSec = Number((routineOf[rd.blockId][rd.rt] || {}).workSec) || DEFAULT_STATION_SEC;
      push(rd.exId, performance(date, { metric: "none", mag: null }, { type: "time", val: workSec }, ctx));
    }
  });

  // Pass 2c — per-cell steady efforts and class attendances, resolved by the routine's kind.
  Object.keys(cellScalars).forEach((base) => {
    const [blockId, wkStr, rtStr] = base.split("|");
    const wk = Number(wkStr), rt = Number(rtStr);
    const r = (routineOf[blockId] || {})[rt];
    if (!r) return;
    const sc = cellScalars[base];
    const date = dateFor(blockId, wk, rt);
    if (r.kind === "steady") {
      const mins = Number(sc.mins);
      if (mins > 0) {
        const exId = (r.exercises[0] && r.exercises[0].id) || soleMachineId;
        const level = sc.resist != null && sc.resist !== "" ? Number(sc.resist) : null;
        push(exId, performance(date, { metric: "machine-level", mag: level }, { type: "time", val: mins * 60 }, { block: blockId, week: wk, routine: rt }));
      }
    } else if (r.kind === "class") {
      const mins = Number(sc.mins) || 0, kcal = Number(sc.kcal) || 0, note = sc.note || "";
      if (mins > 0 || kcal > 0 || note) {
        const ct = classes[classIdOf(r.classType)];
        if (ct) ct.attendances.push({ date, mins, kcal, note });
      }
    }
  });

  // Chronological order is the invariant every derived figure reads off (ADR-0020).
  Object.values(lib).forEach((ex) => { ex.performances.sort((a, b) => a.date.localeCompare(b.date)); delete ex._defaultBand; });
  Object.values(classes).forEach((ct) => ct.attendances.sort((a, b) => a.date.localeCompare(b.date)));
  return keptLog;
}

/* ---------------------------------------------------------------------- *
 * App-level singletons                                                   *
 * ---------------------------------------------------------------------- */
// The Holiday Session (ADR-0025): a Session assembled from the away-kit band moves. The old shared
// Holiday Workout was a strength-shaped routine; convert its placements to lone-item Groups.
function migrateHoliday(old, lib) {
  const exercises = (old && Array.isArray(old.exercises)) ? old.exercises : [];
  const groups = exercises.filter((p) => lib[p.id]).map((p) => straightSets(p.id, p.sets, lib));
  return { title: (old && old.title) || "Holiday Session", focus: (old && old.focus) || "Bands only — minimal kit", groups };
}

/* ---------------------------------------------------------------------- *
 * The whole transform                                                    *
 * ---------------------------------------------------------------------- */
export function migrateToV6(store) {
  const s = store || {};
  const oldLib = (s.library && typeof s.library === "object") ? s.library : {};

  // Library first — every later step (item rails, the log walk's banded/volume decisions) reads the
  // migrated definitions. Stash each record's old default band under a private field for the walk.
  const lib = {};
  Object.keys(oldLib).forEach((id) => {
    const ex = oldLib[id];
    if (!ex || typeof ex !== "object") return;
    const mex = migrateExercise({ ...ex, id });
    if (oldLib[id].defaultBand) mex._defaultBand = oldLib[id].defaultBand;
    lib[id] = mex;
  });

  // Class catalogue (ADR-0030): seed the defaults, then add any class type an old block referenced.
  // Ids are slugs, which canonicalise case ("box-fit" and "Box-Fit" → one entity).
  const classes = {};
  const classIdOf = (name) => {
    const id = slugify(name || "") || "class";
    if (!classes[id]) classes[id] = { id, name: name || id, attendances: [] };
    return id;
  };
  DEFAULT_CLASS_TYPES.forEach((n) => classIdOf(n));
  (s.blocks || []).forEach((b) => oldRoutines(b).forEach((r) => { if (r.kind === "class" && r.classType) classIdOf(r.classType); }));

  // Blocks → containers with a weekly template + real length. Backfill a missing start date to the
  // Monday of createdAt's week (the pre-v6 default), so weekday derivation stays correct.
  const startDateOf = (b) => b.startDate || mondayOf(b.createdAt || today());
  const blocks = (s.blocks || []).map((b) => ({
    id: b.id,
    name: b.name || "Block",
    startDate: startDateOf(b),
    weeks: DEFAULT_WEEKS,
    template: toTemplate(oldRoutines(b), lib, classIdOf),
  }));

  // The log walk populates performances + attendances and returns the slim carried-forward log. It
  // reads the OLD routine shape (kind, workSec, classType) + the resolved start date for dating, so
  // it's given the original blocks with their start dates backfilled — not the converted templates.
  const walkBlocks = (s.blocks || []).map((b) => ({ ...b, startDate: startDateOf(b) }));
  const log = walkLog({ ...s, blocks: walkBlocks }, lib, classes, classIdOf);

  const out = {
    version: 6,
    library: lib,
    classes,
    blocks,
    log,
    ui: (s.ui && typeof s.ui === "object") ? s.ui : { block: blocks[0] && blocks[0].id, week: 1 },
    notes: typeof s.notes === "string" ? s.notes : "",
    // Body measurements are untouched infra.
    measurements: s.measurements, tracked: s.tracked, profile: s.profile,
    // App-level singletons: the Holiday Session, and the wind-down as a freeform weekly-adherence
    // habit (its old fixed stretch list is dropped — it's winged by feel now, ADR-0028).
    holiday: migrateHoliday(s.holiday, lib),
    winddown: { durationMin: (s.winddown && Number(s.winddown.durationMin)) || WINDDOWN_DEFAULTS.durationMin, weeklyTarget: WINDDOWN_DEFAULTS.weeklyTarget },
  };
  return out;
}
