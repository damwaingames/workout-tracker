/* Pure helpers — key grammar, date maths, progression maths, and formatting. Every function
 * here is a pure function of its arguments (no `state` access), which is what keeps the module
 * graph acyclic: state.js / migrate.js import these, never the reverse. State-dependent queries
 * (performancesOf, prsOf, …) live in state.js. */

import {
  ZONES, BAND_TIERS, BAND_FAMILIES, LOAD_MODES, DEFAULT_BAND_TIER, DUMBBELL_KG, RIR_BUCKETS,
} from "./constants.js";

const RIR_IDS = RIR_BUCKETS.map((b) => b.id);

export function today() { return fmtYMD(new Date()); }

// Local-time YYYY-MM-DD ⇄ Date. Parsing via components (not `new Date(str)`, which reads the
// string as UTC and can shift the day across a timezone) keeps weekday derivation correct in
// every locale.
export function fmtYMD(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseYMD(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
// True when `s` is a real YYYY-MM-DD date — used to reject a garbage import startDate, which would
// otherwise sail through as a "snap" and leave mondayOf producing "NaN-NaN-NaN".
export function validYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseYMD(s).getTime());
}

// A block's start date anchors a contiguous run of real calendar weeks (ADR-0024); a routine's
// weekday is the start plus whole weeks plus its position in the weekly template. `mondayOf` snaps
// a date back to its week's Monday (the default block start); `scheduledDate` is the calendar date
// a routine sits on; `fmtWeekday` is the "Mon 16 Jun" header label. Fixed name arrays (not
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

// The one numeric clamp the app edits through: a whole number no lower than `floor`, with junk
// (blank, NaN, a fraction) landing on the floor. Rounds, rests, rail bounds, block weeks, durations —
// every editable count is "a whole number, no lower than this". The Store and the plan-authoring
// dispatch each carried their own implementation of it (#64); one invariant, so one function.
// Distinct from *defaulting* a garbage saved value to a seeded default, which is normalise's job.
export const intAtLeast = (value, floor) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(floor, n) : floor;
};

/* ---------------------------------------------------------------------- *
 * Log-key grammar — the SLIM occurrence log.                             *
 * Exercise performance history no longer lives in the log (it re-homed   *
 * onto the exercises — ADR-0020), so the effort key builders (setKey /   *
 * roundKey / bandKey / scheduleKey …) are gone. What remains are the     *
 * per-occurrence scalars no persistent entity owns (Session RPE, done)   *
 * and the weekly body measurements (untouched infra).                    *
 * ---------------------------------------------------------------------- */
// A `block/week/routine` coordinate — the prefix every occurrence-scalar key hangs off. The `.d`
// segment carries the routine's template position (0-based); the block.id prefix is load-bearing so
// deleteBlock can sweep a block's occurrence keys in one prefix pass.
export const cellKey = (blockId, wk, position) => blockId + ".w" + wk + ".d" + position;
// A cell's per-session flat scalar — Session RPE, the done flag, a rest-day note — keyed by field.
export const cellScalarKey = (cell, field) => cell + "." + field;
// The inverse: which week and which field a log key holds for one block at one template position, or
// null if it isn't a cell scalar of that block+position at all. It exists because a plan edit has to
// sweep or move a scalar in EVERY week the log holds one — not merely the weeks the block currently
// spans, since shortening a block leaves the later weeks' scalars in place for when it is lengthened
// again (#64).
//
// It answers "what IS this key" rather than "is this key that specific scalar", so a caller makes one
// pass over the log instead of a pass per field — and an unrecognised field comes back to be dealt
// with rather than being silently skipped by a loop that never asked about it.
export function parseCellScalar(key, blockId, position) {
  const head = blockId + ".w", mid = ".d" + position + ".";
  if (!key.startsWith(head)) return null;
  const at = key.indexOf(mid, head.length);
  if (at < 0) return null;
  const wk = key.slice(head.length, at), field = key.slice(at + mid.length);
  // A digits-only week is what separates a real cell key from one that merely shares the prefix. The
  // field is whatever trails the position segment, not checked against any list of known fields:
  // everything keyed this way is position-keyed by construction, and a caller that moves a scalar
  // with its day should move one it has never heard of too.
  if (!/^\d+$/.test(wk) || !field) return null;
  return { week: Number(wk), field };
}
// Weekly body measurement (one value per block/week/measurement). The block.id prefix means
// deleteBlock's sweep collects these too.
export const measureKey = (blockId, wk, mId) => blockId + ".w" + wk + ".m." + mId;

/* ---------------------------------------------------------------------- *
 * Progression maths (ADRs 0021, 0022) — pure and deterministic.          *
 * ---------------------------------------------------------------------- */
// Parse a rep range like "8–12" / "10-15" / "8 – 12" into [floor, ceiling]. A bare "12" → [12, 12];
// anything unparseable (a hold like "30s each side") → null, so the caller falls back to a default.
export function parseRail(s) {
  const range = /(\d+)\s*[–—-]\s*(\d+)/.exec(String(s == null ? "" : s));
  if (range) return [Number(range[1]), Number(range[2])];
  const single = /(\d+)/.exec(String(s == null ? "" : s));
  return single ? [Number(single[1]), Number(single[1])] : null;
}
// The rep-zone a set falls in, from its rep count (ADR-0021). Only rep-volume efforts have one —
// a time-volume effort (a plank, a steady ride) returns null. reps ≤ 0 / non-finite → null.
export function zoneOf(reps) {
  const r = Number(reps);
  if (!Number.isFinite(r) || r <= 0) return null;
  return (ZONES.find((z) => r <= z.max) || ZONES[ZONES.length - 1]).id;
}
export const zoneLabel = (id) => { const z = ZONES.find((x) => x.id === id); return z ? z.label : ""; };

// Estimated one-rep max by the Epley formula, `w × (1 + reps/30)` (ADR-0022 pins Epley so the
// advisory readout and guide-ghost load are deterministic). Needs load > 0 and reps > 0 — a
// bodyweight set yields none. Returns a Number (kg) or null.
export function e1rm(kg, reps) {
  const w = Number(kg), r = Number(reps);
  if (!(w > 0) || !(r > 0)) return null;
  return w * (1 + r / 30);
}

// The zones a rail *spans* — the set the ghost matches a past performance against (a rail is a
// contiguous rep range and the zones are contiguous bands, so the span runs from the floor's zone up
// to the ceiling's). Matching on the span, not a single zone, is what makes double progression's
// thread behave (ADR-0021): [8,12] spans {hypertrophy} and [10,15] spans {hypertrophy, endurance}, so
// they share a zone and a within-zone widening carries your load — while [8,12]→[3,5] spans {strength}
// instead, disjoint, so it starts a fresh thread. It also keeps a set logged at a straddling rail's
// ceiling (a [10,15] rail's 15th rep stores as endurance) as that rail's ghost, not orphaned.
export function railZones(rail) {
  if (!Array.isArray(rail) || !rail.length) return [];
  const lo = zoneOf(rail[0]), hi = zoneOf(rail[rail.length - 1]);
  if (!lo || !hi) return [];
  const from = ZONES.findIndex((z) => z.id === lo), to = ZONES.findIndex((z) => z.id === hi);
  return ZONES.slice(Math.min(from, to), Math.max(from, to) + 1).map((z) => z.id);
}
// The next band tier up the shared ladder (ADR-0029) — a band's "add load"; null at the top rung
// (nothing heavier to add), matching nextDumbbellKg's cap contract so a caller reads one sentinel.
export function nextBandTier(tier) {
  const i = BAND_TIERS.findIndex((t) => t.id === tier);
  return i >= 0 && i < BAND_TIERS.length - 1 ? BAND_TIERS[i + 1].id : null;
}
// The next achievable dumbbell weight above `kg` on the discrete-load ladder (ADR-0031) — a kg
// exercise's "add load". Strictly greater, so it never suggests a lighter weight even for an
// off-ladder current load; null when already at/above the top rung (nothing heavier to add).
export function nextDumbbellKg(kg) {
  const next = DUMBBELL_KG.find((w) => w > (Number(kg) || 0));
  return next === undefined ? null : next;
}
// Snap a computed load DOWN to the nearest achievable dumbbell weight ≤ it — conservative, so a
// seeded guide load is always a rung you can actually set (below the lightest rung → the lightest).
export function snapDownDumbbellKg(kg) {
  const v = Number(kg) || 0;
  let best = DUMBBELL_KG[0];
  DUMBBELL_KG.forEach((w) => { if (w <= v) best = w; });
  return best;
}
// The double-progression target: the next-set suggestion after a reference performance (ADR-0021).
// At a fixed load, climb reps to the rail's ceiling (same load, +1 rep); once the ceiling is met or
// beaten, step the load and reset to the floor. `refLoad` is the reference's Load ({metric, mag} —
// a kg number, a band tier, or none); `refReps` its reps. Returns a target shaped like a Performance
// ({load, volume, stepped}) so the renderer formats it with fmtLoad/fmtVolume, or null when there is
// nothing to target (no rail, or no reference reps to climb from). Metric-agnostic: kg steps to the
// next dumbbell rung (ADR-0031), a band by one tier; bodyweight (no load) simply keeps climbing reps.
// When the load axis is already maxed — the heaviest dumbbell / top tier — there's nothing heavier
// to add, so the target keeps climbing reps rather than suggesting an impossible weight.
export function doubleProgression(rail, refLoad, refReps) {
  if (!Array.isArray(rail) || rail.length < 2 || !refLoad) return null;
  const floor = rail[0], ceiling = rail[1], reps = Number(refReps);
  if (!(reps > 0)) return null;
  const metric = refLoad.metric;
  const loadless = metric === "none" || metric == null; // bodyweight — no load axis to step
  const climb = { load: { metric, mag: loadless ? null : refLoad.mag }, volume: { type: "reps", val: reps + 1 }, stepped: false };
  if (loadless || reps < ceiling) return climb;
  // At/over the ceiling: step the load axis and reset to the floor. Both next-rung helpers signal a
  // maxed axis (heaviest dumbbell / top tier) with null, so there's nothing heavier — keep climbing.
  const next = isBandMetric(metric) ? nextBandTier(refLoad.mag) : nextDumbbellKg(refLoad.mag);
  return next == null ? climb : { load: { metric, mag: next }, volume: { type: "reps", val: floor }, stepped: true };
}
// Seed a cold zone's starting load by inverting Epley for the rail's floor reps (ADR-0022):
// w = e1RM / (1 + reps/30), rounded DOWN (conservative). Needs a positive e1RM (a pure-bodyweight
// move seeds nothing) and reps — else null.
export function guideLoadKg(topE1rm, reps) {
  const e = Number(topE1rm), r = Number(reps);
  if (!(e > 0) || !(r > 0)) return null;
  return Math.floor(e / (1 + r / 30));
}

/* ---------------------------------------------------------------------- *
 * Bands & loading mode (ADR-0029)                                        *
 * ---------------------------------------------------------------------- */
const BAND_TIER_LABEL = Object.fromEntries(BAND_TIERS.map((t) => [t.id, t.label]));
export const bandTierLabel = (tier) => BAND_TIER_LABEL[tier] || tier || "";
// A band family's approximate kg for a tier — feeds the volume-load readout + e1RM, not
// progression (ADR-0029). 0 when the family/tier is unknown, so it contributes no load.
export function bandKg(family, tier) {
  const fam = BAND_FAMILIES[family];
  return (fam && fam.kg[tier]) || 0;
}
// True when a load metric is one of the band families — the single "is this banded?" test, derived
// from BAND_FAMILIES so it can't drift from the family table. Used by fmtLoad, loadKg, and migrate.
export const isBandMetric = (metric) => Object.prototype.hasOwnProperty.call(BAND_FAMILIES, metric);

// True when an exercise's required equipment is a subset of a kit (ADR-0023) — the "can I do this
// with what I've got?" test. Empty equipment fits any kit (bodyweight needs nothing). Filters, never
// gates: its first job is assembling the Holiday Session from the away kit (ADR-0025).
export const fitsKit = (equipment, kit) => (equipment || []).every((tag) => kit.includes(tag));

const LOAD_MODE_BY_ID = Object.fromEntries(LOAD_MODES.map((m) => [m.id, m]));
// The loading-mode record for an exercise (default standard). Pure — both the renderer (input
// labels) and the tonnage maths read through this, so they can't disagree on what a mode means.
export function loadMode(ex) { return (ex && LOAD_MODE_BY_ID[ex.loadMode]) || LOAD_MODES[0]; }
export const repsLabel = (m) => "reps" + (m.rUnit || "");

/* ---------------------------------------------------------------------- *
 * Logging an Item (#44) — how a planned Item is logged, and the effort a  *
 * filled slot records. Pure: both the renderer (which inputs to draw) and *
 * the input handler (the Performance to build) read through these, so the *
 * two can't disagree on what an Item logs.                                *
 * ---------------------------------------------------------------------- */
// The input mode an Item logs on, from its volume axis (rail = reps, time) crossed with its
// exercise's load metric (ADR-0019). The closed set of five, which slotInputs (which inputs) and
// buildPerformance (which Performance) both switch on: a rep set is weight×reps (`load-reps`), a
// band tier×reps (`band-reps`), or bare reps (`reps`); a timed effort is a steady minutes+level
// (`steady`) or a done-tick station (`station`). null when the Item carries no loggable axis.
export function itemLogMode(it, ex) {
  if (!it || !ex) return null;
  if (Array.isArray(it.rail)) {
    if (isBandMetric(ex.loadMetric)) return "band-reps";
    return ex.loadMetric === "kg" ? "load-reps" : "reps";
  }
  if (it.time != null) return ex.loadMetric === "machine-level" ? "steady" : "station";
  return null;
}

// The {load, volume} a filled slot records, from its mode + the raw input strings — or null when the
// slot is empty (an unlogged round: honest under-completion, ADR-0026). A rep effort needs reps > 0
// to exist (reps is its volume axis; zone/e1RM are undefined without it); a station needs its tick.
export function buildPerformance(mode, ex, raw) {
  const reps = Number(raw.r);
  switch (mode) {
    case "load-reps": {
      if (!(reps > 0)) return null;
      const w = Number(raw.w);
      return repPerf({ metric: "kg", mag: w > 0 ? w : 0 }, reps, raw.rir);
    }
    case "band-reps":
      if (!(reps > 0)) return null;
      return repPerf({ metric: ex.loadMetric, mag: raw.tier || DEFAULT_BAND_TIER }, reps, raw.rir);
    case "reps":
      if (!(reps > 0)) return null;
      return repPerf({ metric: "none", mag: null }, reps, raw.rir);
    case "steady": {
      const mins = Number(raw.mins);
      if (!(mins > 0)) return null;
      const level = raw.level !== "" && raw.level != null ? Number(raw.level) : null;
      return { load: { metric: "machine-level", mag: level }, volume: { type: "time", val: Math.round(mins * 60) } };
    }
    case "station":
      if (!raw.done) return null;
      return { load: { metric: "none", mag: null }, volume: { type: "time", val: Number(raw.time) || 0 } };
    // Unreachable in correct operation (itemLogMode only ever yields one of the five modes above);
    // a throw turns any future mode drift into an instant failure, not a set that silently won't log.
    default: throw new Error("Unknown log mode: " + mode);
  }
}
// A rep-volume Performance's {load, volume}, carrying an optional RIR marker (ADR-0027) only when a
// real bucket is set — most sets carry none, so an unset/garbage rir leaves no `rir` field at all.
function repPerf(load, reps, rir) {
  const p = { load, volume: { type: "reps", val: reps } };
  if (RIR_IDS.includes(rir)) p.rir = rir;
  return p;
}
// The advisory RIR nudge for the next set (ADR-0027) — reps-to-spare says size up, to-failure says
// hold; ideal / none say nothing. Advisory only: it never gates progression (double progression is
// the judge, ADR-0021) — the renderer shows it beside the target, no more.
export function rirNudge(rir) {
  if (rir === "easy") return "reps to spare last time — size up";
  if (rir === "hard") return "to failure last time — hold this weight";
  return null;
}

/* ---------------------------------------------------------------------- *
 * Formatting                                                             *
 * ---------------------------------------------------------------------- */
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function fmt(n) { return Math.round(n).toLocaleString(); }

// One `data-*` attribute, escaped and ready to concatenate into a tag (leading space included). Every
// routing attribute in the app emits through this rather than through a bare quote-plus-concat, so the
// quoting can't be got wrong at ~60 call sites — and a name can't be spelled inside a string literal
// where a find/replace would mistake prose for code.
export function attr(name, value) {
  return " data-" + name + '="' + esc(String(value)) + '"';
}

// A rail [lo, hi] as "8–12" (a bare "12" when lo === hi).
export function fmtRail(rail) {
  if (!Array.isArray(rail) || !rail.length) return "";
  return rail[0] === rail[1] ? String(rail[0]) : rail[0] + "–" + rail[1];
}

// A performance's Volume as human text: "12 reps" for a count, a friendly duration for time
// (stored canonically in seconds — "45 s", "3 min", "3 min 30 s").
export function fmtVolume(vol) {
  if (!vol) return "";
  if (vol.type === "reps") return vol.val + " rep" + (Number(vol.val) === 1 ? "" : "s");
  const sec = Math.round(Number(vol.val) || 0);
  if (sec < 60) return sec + " s";
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? m + " min " + s + " s" : m + " min";
}

// A performance's Load as human text: "40 kg" (0 kg → "bodyweight"), a band tier ("Medium band"),
// a machine level ("Level 6"), or "" for a resistance-free (none-metric) move.
export function fmtLoad(load) {
  if (!load) return "";
  const mag = load.mag;
  if (isBandMetric(load.metric)) return bandTierLabel(mag) + " band";
  switch (load.metric) {
    case "kg": return Number(mag) > 0 ? mag + " kg" : "bodyweight";
    case "machine-level": return mag != null && mag !== "" ? "Level " + mag : "";
    default: return "";
  }
}

// A double-progression target as human text: "9.5 kg × 8", "Heavy band × 10", or bare "21 reps"
// for a load-free (bodyweight) climb. Reuses fmtLoad + fmtVolume so a target reads exactly as a
// Performance's own load/volume do (no re-spelt pluralisation).
export function fmtTarget(t) {
  if (!t || !t.volume) return "";
  const load = fmtLoad(t.load);
  return load ? load + " × " + t.volume.val : fmtVolume(t.volume);
}

// The volume-load readout as human text (ADR-0029): kilograms rendered as tonnes to one decimal
// ("3.5 t"). Empty for nothing done (≤ 0), so a session/block with no logged work draws no readout.
export function fmtTonnage(kg) {
  return kg > 0 ? (kg / 1000).toFixed(1) + " t" : "";
}

export function slugify(s) { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
export function uniqueId(base, has) {
  base = base || "exercise";
  let id = base, n = 2;
  while (has(id)) id = base + "-" + n++;
  return id;
}
