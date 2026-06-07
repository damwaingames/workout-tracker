/* Pure helpers — key grammar, clamps, formatting, and circuit maths. Every
 * function here is a pure function of its arguments (no `state` access), which
 * is what keeps the module graph acyclic: state.js imports these, never the
 * reverse. State-dependent queries (readSets, previousSets, …) live in state.js. */

import {
  MIN_SETS, MAX_SETS, DEFAULT_SETS,
  MIN_ROUNDS, MAX_ROUNDS, CIRCUIT_DEFAULTS, LOAD_MODES, BANDS,
} from "./constants.js";

export function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// The log-key grammar lives here and nowhere else — renderers (data-k) and
// readers must build keys through these so the format stays authoritative.
export const cellKey = (blockId, wk, day) => blockId + ".w" + wk + ".d" + day;
export const setKey = (cell, exId, i, f) => cell + ".ex." + exId + ".s" + i + "." + f; // f: "w" | "r"
export const roundKey = (cell, exId, r) => cell + ".ex." + exId + ".r" + r;
// Banded moves: the chosen band tier for one exercise on one day cell (".band",
// distinct from ".sN"/".rN"), plus per-round reps for a banded circuit move
// (".rr" + r — separate from the ".r" + r round checkbox of a normal circuit).
export const bandKey = (cell, exId) => cell + ".ex." + exId + ".band";
export const roundRepKey = (cell, exId, r) => cell + ".ex." + exId + ".rr" + r;
// Weekly body measurement (one value per block/week/measurement). Shares
// state.log — the ".m." segment can't collide with a day's ".dN" cells, and
// the block.id prefix means deleteBlock's purge sweeps these up for free.
export const measureKey = (blockId, wk, mId) => blockId + ".w" + wk + ".m." + mId;
// Daily nutrition value — one per block/week/day/field, hung off the same day
// cell as .done/.date/.energy. The ".nut." segment is distinct from those, so
// it shares the cell without collision, and the block.id prefix means deleteBlock
// sweeps it up too. (cell already encodes block/week/day via cellKey.)
export const nutKey = (cell, field) => cell + ".nut." + field;
// Classes logged on a day cell — a single ".classes" key holding an array of
// { type, desc, mins } (variable length, so not the scalar data-k path). The
// block.id prefix (via cell) means deleteBlock's purge sweeps it up too.
export const classesKey = (cell) => cell + ".classes";

// Round and clamp an int into [min, max]; non-numeric (missing) → fallback.
// NB: 0 must clamp to min, so we can't use `|| fallback` (0 is falsy).
function clampInt(n, min, max, fallback) {
  n = Math.round(n);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
export const clampSets = (n) => clampInt(n, MIN_SETS, MAX_SETS, DEFAULT_SETS);
export const clampRounds = (n) => clampInt(n, MIN_ROUNDS, MAX_ROUNDS, CIRCUIT_DEFAULTS.rounds);
export const nonNegSec = (n) => { n = Math.round(+n); return Number.isFinite(n) && n > 0 ? n : 0; };

// The single place that knows a placement's shape: strength placements own a
// (clamped) set count; circuit placements carry none (the day owns the timing).
export function placement(type, id, sets) {
  return type === "strength" ? { id, sets: clampSets(sets) } : { id };
}
// The exercise type a day accepts: strength days take strength exercises,
// every other non-rest day (recovery) takes circuits. The single source of the
// day-kind ↔ exercise-type rule, so the picker and the create form agree and a
// mismatched placement can't be built.
export function kindType(kind) { return kind === "strength" ? "strength" : "circuit"; }

// The loading-mode record for an exercise (default standard). An absent/unknown
// `ex.loadMode` resolves to the first LOAD_MODES entry. Pure — both the renderer
// (input labels) and dayLoad (the tonnage multipliers) read through this, so
// they can't disagree on what a mode means.
const LOAD_MODE_BY_ID = Object.fromEntries(LOAD_MODES.map((m) => [m.id, m]));
export function loadMode(ex) {
  return (ex && LOAD_MODE_BY_ID[ex.loadMode]) || LOAD_MODES[0];
}
// The reps-axis annotation for a mode: "reps", or "reps/side" when a side is
// logged but both are worked (per-side). One source so the strength set unit and
// the circuit round placeholder can't drift. rUnit is a fixed LOAD_MODES constant
// (only ever "/side" or undefined), so it needs no escaping.
export const repsLabel = (m) => "reps" + (m.rUnit || "");

// Band helpers — pure, so the renderer (picker + labels) and dayLoad (the kg
// that feeds tonnage) read bands the same way. The chosen tier for a session is
// the logged value, falling back to the exercise's default; bandKg turns a tier
// id into its approximate kg (0 when unset/unknown, so it contributes no load).
const BAND_BY_ID = Object.fromEntries(BANDS.map((b) => [b.id, b]));
export function bandFor(ex, logged) { return logged || (ex && ex.defaultBand) || ""; }
export function bandKg(id) { const b = BAND_BY_ID[id]; return b ? b.kg : 0; }

// A recovery day's circuit settings, normalised (defaults applied, types coerced).
// The single read-side accessor so the renderer and the time maths agree.
export function circuitOf(d) {
  return {
    rounds: clampRounds(d.rounds),
    workSec: nonNegSec(d.workSec),
    restSec: nonNegSec(d.restSec),
    roundRestSec: nonNegSec(d.roundRestSec),
  };
}
// Estimated total seconds for a circuit. Rest sits strictly between stations
// within a round ((stations − 1) gaps) and between rounds ((rounds − 1) gaps),
// so the workout ends on a work interval — nothing trailing.
function circuitTime(stations, c) {
  if (stations <= 0) return 0;
  return c.rounds * stations * c.workSec +
    c.rounds * (stations - 1) * c.restSec +
    (c.rounds - 1) * c.roundRestSec;
}
// "90 sec" / "1 min" / "12 min 30 sec".
function fmtSecs(sec) {
  sec = Math.round(sec);
  if (sec < 60) return sec + " sec";
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? m + " min " + s + " sec" : m + " min";
}
// The one-line circuit summary shown under a recovery day: structure + estimate.
export function circuitSummary(d) {
  const c = circuitOf(d);
  const parts = [
    c.rounds + " round" + (c.rounds === 1 ? "" : "s"),
    fmtSecs(c.workSec) + " work",
    fmtSecs(c.restSec) + " rest",
  ];
  if (c.roundRestSec > 0) parts.push(fmtSecs(c.roundRestSec) + " between rounds");
  return parts.join(" · ") + " · ≈ " + fmtSecs(circuitTime(d.exercises.length, c));
}

export function slugify(s) { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
export function uniqueId(base, has) {
  base = base || "exercise";
  let id = base, n = 2;
  while (has(id)) id = base + "-" + n++;
  return id;
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function fmt(n) { return Math.round(n).toLocaleString(); }

// Estimated calorie burn for a class: rate (kcal/min/kg) × minutes × bodyweight,
// rounded. Any missing/zero factor → 0 (no estimate). Pure, so the per-class label
// and the rolled-up total compute it identically.
export const kcalBurn = (rate, mins, kg) => Math.round((rate || 0) * (mins || 0) * (kg || 0));
