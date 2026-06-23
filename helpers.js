/* Pure helpers — key grammar, clamps, formatting, and circuit maths. Every
 * function here is a pure function of its arguments (no `state` access), which
 * is what keeps the module graph acyclic: state.js imports these, never the
 * reverse. State-dependent queries (readSets, previousSets, …) live in state.js. */

import {
  MIN_SETS, MAX_SETS, DEFAULT_SETS,
  MIN_ROUNDS, MAX_ROUNDS, CIRCUIT_DEFAULTS, STEADY_DEFAULTS, LOAD_MODES, BANDS,
} from "./constants.js";

export function today() { return fmtYMD(new Date()); }

// Local-time YYYY-MM-DD ⇄ Date. Parsing via components (not `new Date(str)`, which
// reads the string as UTC and can shift the day across a timezone) keeps weekday
// derivation correct in every locale.
function fmtYMD(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseYMD(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }

// Feature 2 date derivation (ADR-0005). A block's start date anchors a contiguous run
// of weeks; a routine's weekday is the start plus whole weeks plus its position in that
// week's schedule. `mondayOf` snaps a date back to its week's Monday (the default block
// start); `scheduledDate` is the calendar date (a `Date`, fed straight to fmtWeekday) a
// routine sits on; `fmtWeekday` is the "Mon 16 Jun" header label. Fixed name arrays (not
// toLocale*) keep it locale-stable.
export function mondayOf(dateStr) {
  const d = parseYMD(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Sun(0)→−6 … Mon(1)→0 … Sat(6)→−5
  return fmtYMD(d);
}
export function scheduledDate(startDate, wk, position) {
  const d = parseYMD(startDate);
  d.setDate(d.getDate() + (wk - 1) * 7 + position);
  return d;
}
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtWeekday(date) {
  return WEEKDAY_NAMES[date.getDay()] + " " + date.getDate() + " " + MONTH_NAMES[date.getMonth()];
}

// The log-key grammar lives here and nowhere else — renderers (data-k) and
// readers must build keys through these so the format stays authoritative.
export const cellKey = (blockId, wk, routine) => blockId + ".w" + wk + ".d" + routine;
export const setKey = (cell, exId, i, f) => cell + ".ex." + exId + ".s" + i + "." + f; // f: "w" | "r"
export const roundKey = (cell, exId, r) => cell + ".ex." + exId + ".r" + r;
// Banded moves: the chosen band tier for one exercise on one routine cell (".band",
// distinct from ".sN"/".rN"), plus per-round reps for a banded circuit move
// (".rr" + r — separate from the ".r" + r round checkbox of a normal circuit).
export const bandKey = (cell, exId) => cell + ".ex." + exId + ".band";
export const roundRepKey = (cell, exId, r) => cell + ".ex." + exId + ".rr" + r;
// Per-week count overrides (ADR-0008): a single week's set count for one strength exercise,
// or one recovery routine's round count, when it differs from the block-wide template. Absent
// → the template. `.sets` can't collide with setKey's `.s{i}.{w|r}`, nor `.rounds` with
// roundKey's `.r{n}`. Both hang off the block-prefixed cell, so purgeBlockLog still sweeps them.
export const setsKey = (cell, exId) => cell + ".ex." + exId + ".sets";
export const roundsKey = (cell) => cell + ".rounds";
// Weekly body measurement (one value per block/week/measurement). Shares
// state.log — the ".m." segment can't collide with a routine's ".dN" cells, and
// the block.id prefix means deleteBlock's purge sweeps these up for free.
export const measureKey = (blockId, wk, mId) => blockId + ".w" + wk + ".m." + mId;
// Legacy daily nutrition scalar — one per block/week/routine/field. Superseded by the
// food-entry list (foodKey); read only by migrateNutrition, which folds any of these
// it finds into a single quick entry and deletes them. Kept so old saves still migrate.
export const nutKey = (cell, field) => cell + ".nut." + field;
// Classes logged on a routine cell — a single ".classes" key holding an array of
// { type, desc, mins } (variable length, so not the scalar data-k path). The
// block.id prefix (via cell) means deleteBlock's purge sweeps it up too.
export const classesKey = (cell) => cell + ".classes";
// Food eaten on a routine — a single ".food" key holding an array of food entries:
// a pantry entry { barcode, grams } (nutrition read live from state.pantry) or an
// ad-hoc quick entry { name, kcal, carb, fat, protein }. Variable length like
// classes, so not the scalar path; the block.id prefix (via cell) means deleteBlock's
// purge sweeps it up too. The routine's kcal + macros are the derived sum (routineNutrition).
export const foodKey = (cell) => cell + ".food";
// A steady cell's per-session scalars, the most-coupled flat keys in the app (written by the
// log inputs, read by routineSummary AND the previousSteady cross-week scan), so the literal
// lives here once. field: "mins" (actual minutes done) | "resist" (the machine's level).
export const steadyKey = (cell, field) => cell + "." + field;
// A week's routine schedule — the ordered routine numbers for one block/week, stored as
// a single key (like measureKey, not hung off a cell). Absent → weekSchedule derives the
// order. The block.id prefix means purgeBlockLog sweeps it on block delete (ADR-0005).
export const scheduleKey = (blockId, wk) => blockId + ".w" + wk + ".sched";

// Round and clamp an int into [min, max]; non-numeric (missing) → fallback.
// NB: 0 must clamp to min, so we can't use `|| fallback` (0 is falsy).
function clampInt(n, min, max, fallback) {
  n = Math.round(n);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
export const clampSets = (n) => clampInt(n, MIN_SETS, MAX_SETS, DEFAULT_SETS);
export const clampRounds = (n) => clampInt(n, MIN_ROUNDS, MAX_ROUNDS, CIRCUIT_DEFAULTS.rounds);
// Steady duration has no real upper bound, so the max is a generous sanity cap, not a UI limit.
export const clampDuration = (n) => clampInt(n, 1, 999, STEADY_DEFAULTS.durationMin);
export const nonNegSec = (n) => { n = Math.round(+n); return Number.isFinite(n) && n > 0 ? n : 0; };

// The single place that knows a placement's shape, keyed by the *routine's kind* (not the
// exercise): a strength routine's placement owns a (clamped) set count; every other kind
// carries none (timing/duration live on the routine). Behaviour follows the routine — an
// exercise's own contexts only gate which routines will accept it (ADR-0007).
export function placement(kind, id, sets) {
  return kind === "strength" ? { id, sets: clampSets(sets) } : { id };
}
// A routine reference from a data-routine attribute: a number for a real routine, or the
// "holiday" sentinel for the shared Holiday Workout (which routineDef resolves to
// state.holiday). Kept here so every parse site (clicks, submit, the picker)
// coerces identically and Number("holiday")=NaN can't leak through.
export const parseRoutine = (v) => (v === "holiday" ? "holiday" : Number(v));

// The loading-mode record for an exercise (default standard). An absent/unknown
// `ex.loadMode` resolves to the first LOAD_MODES entry. Pure — both the renderer
// (input labels) and routineLoad (the tonnage multipliers) read through this, so
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

// Band helpers — pure, so the renderer (picker + labels) and routineLoad (the kg
// that feeds tonnage) read bands the same way. The chosen tier for a session is
// the logged value, falling back to the exercise's default; bandKg turns a tier
// id into its approximate kg (0 when unset/unknown, so it contributes no load).
const BAND_BY_ID = Object.fromEntries(BANDS.map((b) => [b.id, b]));
export function bandFor(ex, logged) { return logged || (ex && ex.defaultBand) || ""; }
export function bandKg(id) { const b = BAND_BY_ID[id]; return b ? b.kg : 0; }

// A recovery routine's circuit settings, normalised (defaults applied, types coerced).
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
function circuitTime(stations, rounds, c) {
  if (stations <= 0) return 0;
  return rounds * stations * c.workSec +
    rounds * (stations - 1) * c.restSec +
    (rounds - 1) * c.roundRestSec;
}
// "90 sec" / "1 min" / "12 min 30 sec".
function fmtSecs(sec) {
  sec = Math.round(sec);
  if (sec < 60) return sec + " sec";
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? m + " min " + s + " sec" : m + " min";
}
// The circuit's estimated total time, formatted ("≈ 12 min 30 sec"). The headline
// figure from circuitSummary, exposed on its own for the collapsed routine summary —
// where only the total matters, not the round / work / rest breakdown.
// `rounds` overrides the template count for the displayed week (per-week rounds — ADR-0008);
// absent, the routine's own template is used. So the estimate tracks the week's actual rounds.
export function circuitTimeLabel(d, rounds) {
  const c = circuitOf(d);
  return "≈ " + fmtSecs(circuitTime(d.exercises.length, rounds != null ? rounds : c.rounds, c));
}
// The one-line circuit summary shown under a recovery routine: structure + estimate. Takes the
// week's effective `rounds` so a per-week override reflects in both the count and the time.
export function circuitSummary(d, rounds) {
  const c = circuitOf(d);
  const r = rounds != null ? rounds : c.rounds;
  const parts = [
    r + " round" + (r === 1 ? "" : "s"),
    fmtSecs(c.workSec) + " work",
    fmtSecs(c.restSec) + " rest",
  ];
  if (c.roundRestSec > 0) parts.push(fmtSecs(c.roundRestSec) + " between rounds");
  return parts.join(" · ") + " · " + circuitTimeLabel(d, r);
}
// A steady routine's duration, defaulted like circuitOf — one planned figure (minutes). The
// resistance/level and actual minutes are logged per cell (the session), not on the template.
export function steadyOf(d) {
  return { durationMin: clampDuration(d.durationMin) };
}
// The one-line steady summary: the planned duration. The effort target lives in the routine's
// focus and the resistance is logged per session, so neither belongs in this headline.
export function steadySummary(d) {
  return steadyOf(d).durationMin + " min steady";
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
