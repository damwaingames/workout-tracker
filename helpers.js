/* Pure helpers — key grammar, clamps, formatting, and circuit maths. Every
 * function here is a pure function of its arguments (no `state` access), which
 * is what keeps the module graph acyclic: state.js imports these, never the
 * reverse. State-dependent queries (readSets, previousSets, …) live in state.js. */

import {
  MIN_SETS, MAX_SETS, DEFAULT_SETS,
  MIN_ROUNDS, MAX_ROUNDS, CIRCUIT_DEFAULTS,
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
// Weekly body measurement (one value per block/week/measurement). Shares
// state.log — the ".m." segment can't collide with a day's ".dN" cells, and
// the block.id prefix means deleteBlock's purge sweeps these up for free.
export const measureKey = (blockId, wk, mId) => blockId + ".w" + wk + ".m." + mId;
// Daily nutrition value — one per block/week/day/field, hung off the same day
// cell as .done/.date/.energy. The ".nut." segment is distinct from those, so
// it shares the cell without collision, and the block.id prefix means deleteBlock
// sweeps it up too. (cell already encodes block/week/day via cellKey.)
export const nutKey = (cell, field) => cell + ".nut." + field;

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
