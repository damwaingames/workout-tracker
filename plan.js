/* Plan-editing verbs (#64) — every structural change to a plan, and the history repair each one owes.
 *
 * A Performance back-references the exact plan slot it was logged in (ADR-0020): block, week, routine
 * position, group, item, round — all but the block by *index*. So a plan edit that shifts those
 * indices invalidates the history keyed by them. Reordering a day always knew this and remapped
 * `ctx.routine`; its nine siblings lived in the click dispatch, where the invariant had nowhere to
 * live, and skipped the repair — deleting a Group left the later Groups' Performances pre-filling
 * slots they were never logged in. Silently.
 *
 * The verbs live here so that invariant has one home: each takes a **plan location** and indices —
 * never a DOM element — does the structural edit, and repairs or retires the Performances whose ctx
 * it just invalidated (ADR-0032). Adding a plan-editing control means adding a verb here, which is
 * where the obligation is visible, rather than a line in a dispatch map where it isn't.
 *
 * Two conventions carried from the verbs that were already right:
 * - **Verbs don't persist.** They mutate and return; the caller saves. That's what deleteBlock and
 *   the day-reorder already did, and it's what keeps this module testable under plain Node.
 * - **Domain arguments only.** No `data-*`, no elements. events.js resolves a control to a location
 *   and calls a verb, exactly as it translates a DOM target into a Store call. */

import { cellKey, cellScalarKey, intAtLeast } from "./helpers.js";
import { state, isHolidayCell, blankGroup, blankRoutine, newItem } from "./state.js";

/* ---------------------------------------------------------------------- *
 * Plan locations — which routine a verb edits, and which logged cells its *
 * structure keys.                                                         *
 * ---------------------------------------------------------------------- */
// A location is either a Block's weekly-template position or the Holiday Session singleton. The
// composer edits both through the same controls (#48), so the verbs take both through one argument.
export const atRoutine = (block, position) => ({ block, position });
export const atHoliday = () => ({ holiday: true });

export function routineOf(loc) {
  return loc.holiday ? state.holiday : (loc.block && loc.block.template[loc.position]) || null;
}
export function groupOf(loc, gi) {
  const r = routineOf(loc);
  return (r && Array.isArray(r.groups) && r.groups[gi]) || null;
}
export function itemOf(loc, gi, ii) {
  const g = groupOf(loc, gi);
  return (g && Array.isArray(g.items) && g.items[ii]) || null;
}

// The plan cells whose logged Performances are keyed by THIS routine's structure (ADR-0024 — one
// weekly template over N real weeks, so a routine occupies one cell per week).
//
// The Holiday swap (ADR-0025) is what makes this more than a loop: a holiday-swapped cell logs
// against the Holiday Session's Groups, not the planned routine's. So a Block routine owns its
// non-swapped cells only, and the singleton owns every swapped cell anywhere — which is exactly what
// makes editing the Holiday Session repair the right history, and what keeps a kind switch from
// retiring the away-workout sets logged on that day.
function cellsOf(loc) {
  const cells = [];
  const add = (b, wk, pos) => cells.push({ block: b.id, week: wk, routine: pos });
  if (loc.holiday) {
    state.blocks.forEach((b) => {
      for (let wk = 1; wk <= b.weeks; wk++)
        b.template.forEach((r, pos) => { if (isHolidayCell(b, wk, pos)) add(b, wk, pos); });
    });
    return cells;
  }
  const b = loc.block;
  if (!b) return cells;
  for (let wk = 1; wk <= b.weeks; wk++) if (!isHolidayCell(b, wk, loc.position)) add(b, wk, loc.position);
  return cells;
}

const cellSet = (cells) => new Set(cells.map((c) => cellKey(c.block, c.week, c.routine)));
const inCells = (keys, ctx) => !!ctx && keys.has(cellKey(ctx.block, ctx.week, ctx.routine));

// Every slot-keyed Performance logged in one of those cells. A Performance whose ctx is already
// coarse (a migrated one, or one an earlier edit retired) is skipped: it keys no slot, so there is
// nothing to shift and nothing left to retire.
function performancesIn(cells) {
  const keys = cellSet(cells);
  const found = [];
  Object.values(state.library).forEach((ex) => {
    (ex.performances || []).forEach((p) => {
      if (p.ctx && p.ctx.group != null && inCells(keys, p.ctx)) found.push(p);
    });
  });
  return found;
}

// The Attendance sibling (ADR-0030): a class occurrence is keyed by the same cell, just without the
// group/item/round a class has no notion of.
function attendancesIn(cells) {
  const keys = cellSet(cells);
  const found = [];
  Object.values(state.classes).forEach((ct) => {
    (ct.attendances || []).forEach((a) => { if (inCells(keys, a.ctx)) found.push(a); });
  });
  return found;
}

/* ---------------------------------------------------------------------- *
 * Retiring history an edit has orphaned (ADR-0032)                        *
 * ---------------------------------------------------------------------- */
// Coarsen a Performance's ctx to the day it was logged, dropping the group/item/round that no longer
// point anywhere. The set stays on the exercise — it was really performed, and the exercise owns its
// history (ADR-0020), so it keeps counting towards PRs, ghosts and the e1RM trend. What it stops
// doing is pre-filling a slot and being tallied into that Session's tonnage, because it is no longer
// part of any planned slot. This is deliberately the same shape the v6 migration produces for
// pre-v6 history, which is already proven never to collide with a live slot.
function retire(p) {
  p.ctx = { block: p.ctx.block, week: p.ctx.week, routine: p.ctx.routine };
}

// An Attendance's ctx IS the coarse triple, so there is nothing to coarsen — retiring it means
// dropping it, which is the shape a migrated Attendance already has and equally collision-proof.
function retireAttendance(a) { delete a.ctx; }

/* ---------------------------------------------------------------------- *
 * The verbs                                                              *
 * ---------------------------------------------------------------------- */
// Add an empty Group to a Session — the one structural edit with no history consequence, since a
// Group appended past the end shifts no existing index.
export function addGroup(loc) {
  const r = routineOf(loc);
  if (!r || !Array.isArray(r.groups)) return false;
  r.groups.push(blankGroup());
  return true;
}

// Add an exercise to a Group, as a fresh Item. Appends, so — like addGroup — it shifts no index and
// owes no repair.
export function addItem(loc, gi, exId) {
  const g = groupOf(loc, gi);
  if (!g || !Array.isArray(g.items) || !exId) return false;
  g.items.push(newItem(exId));
  return true;
}

// Move a Group one place in `dir` (±1): a true swap of two indices, so no history is orphaned — the
// two Groups' Performances trade group indices, mirroring what the day-reorder does with the routine
// index one level up. A move off either end is a no-op (the UI disables those buttons anyway).
export function moveGroup(loc, gi, dir) {
  const r = routineOf(loc);
  const gj = gi + dir;
  if (!r || !Array.isArray(r.groups) || !r.groups[gi] || !r.groups[gj]) return false;
  [r.groups[gi], r.groups[gj]] = [r.groups[gj], r.groups[gi]];
  performancesIn(cellsOf(loc)).forEach((p) => {
    if (p.ctx.group === gi) p.ctx.group = gj;
    else if (p.ctx.group === gj) p.ctx.group = gi;
  });
  return true;
}

// Remove a Group: the later Groups shift down one, so their Performances' group index shifts with
// them, and the removed Group's own Performances are retired.
export function removeGroup(loc, gi) {
  const r = routineOf(loc);
  if (!r || !Array.isArray(r.groups) || !r.groups[gi]) return false;
  r.groups.splice(gi, 1);
  performancesIn(cellsOf(loc)).forEach((p) => {
    if (p.ctx.group === gi) retire(p);
    else if (p.ctx.group > gi) p.ctx.group -= 1;
  });
  return true;
}

// Remove an Item: the Group's later Items shift down one. The same repair as removeGroup, one level
// in — so it applies only to Performances logged in THIS Group, leaving the sibling Groups (whose
// item indices didn't move) alone.
export function removeItem(loc, gi, ii) {
  const g = groupOf(loc, gi);
  if (!g || !Array.isArray(g.items) || !g.items[ii]) return false;
  g.items.splice(ii, 1);
  performancesIn(cellsOf(loc)).forEach((p) => {
    if (p.ctx.group !== gi) return;
    if (p.ctx.item === ii) retire(p);
    else if (p.ctx.item > ii) p.ctx.item -= 1;
  });
  return true;
}

// The per-occurrence log scalar that belongs to the Routine itself rather than to the cell: a Session
// RPE is that Session's fatigue reading (ADR-0012), so it goes when the Session does. `collapsed` is
// UI state and `holiday` is the swap flag — both are properties of the cell, and both stay.
const ROUTINE_SCALARS = ["rpe"];

// Switch a Routine's kind: a fresh Routine of that kind replaces it, so every Performance and
// Attendance logged against the old one is orphaned outright — there is no index to shift, the slot
// itself is gone. Re-picking the kind it already is changes nothing (an accidental re-click must not
// wipe the day). Note which cells this covers: a Holiday-swapped week logged against the singleton,
// not this Routine, so its sets and its RPE both survive the switch.
export function setRoutineKind(loc, kind) {
  const b = loc.block;
  if (!b || !b.template[loc.position] || b.template[loc.position].kind === kind) return false;
  const cells = cellsOf(loc);
  b.template[loc.position] = blankRoutine(kind);
  performancesIn(cells).forEach(retire);
  attendancesIn(cells).forEach(retireAttendance);
  cells.forEach((c) => ROUTINE_SCALARS.forEach((f) => { delete state.log[cellScalarKey(cellKey(c.block, c.week, c.routine), f)]; }));
  return true;
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
// The holiday flag is one of the scalars that moves, which is what keeps a swapped-in Holiday
// Session and the sets logged under it pointing at each other after the reorder.
export function swapDays(block, a, b) {
  const t = block.template;
  if (!t || !t[a] || !t[b] || a === b) return false;
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
  return true;
}

// Set a Block's length in real weeks (ADR-0024), and clamp the viewed week to it — the clamp lives
// here rather than at the call site so shortening a Block can't leave the view pointing past its end.
// Nothing is retired: unlike a removed Group, shortening destroys no structure and is undone by
// lengthening again, so the weeks beyond the end keep their history for when they come back.
export function setBlockWeeks(block, weeks) {
  if (!block) return false;
  block.weeks = intAtLeast(weeks, 1);
  if (state.ui.week > block.weeks) state.ui.week = block.weeks;
  return true;
}

/* ---- Scalar edits: no history consequence, but the same clamp ----
 * These change a Routine / Group / Item in place without moving an index, so nothing needs
 * repairing. They live here anyway, beside their structural siblings — and it puts every editable
 * count on the one shared clamp (helpers.intAtLeast) rather than a second implementation next to the
 * dispatch. Each field set is an allow-list mapping the field to the floor its value clamps to
 * (`null` = free text), so a stray target can't write an arbitrary plan field — the updateExercise
 * idiom, and the reason a `kind` or `groups` can't be smuggled in through a scalar setter. */
const ROUTINE_FIELDS = { title: null, focus: null, classType: null, durationMin: 0 };
const GROUP_FIELDS = { rounds: 1, restWithin: 0, restAfter: 0 };

function setField(obj, fields, field, value) {
  if (!obj || !Object.prototype.hasOwnProperty.call(fields, field)) return false;
  const floor = fields[field];
  obj[field] = floor == null ? String(value) : intAtLeast(value, floor);
  return true;
}

// A Session's title / focus, or a Class Routine's type / planned duration (ADR-0010).
export const setRoutineField = (loc, field, value) => setField(routineOf(loc), ROUTINE_FIELDS, field, value);
// A Group's rounds and its two rests — what tune it into a straight set / superset / circuit (ADR-0019).
export const setGroupField = (loc, gi, field, value) => setField(groupOf(loc, gi), GROUP_FIELDS, field, value);

// One end of an Item's rep rail (ADR-0021). The bound index is rejected rather than coerced, as the
// Store's own rail setter does — an out-of-range index is a programmer error, not user input.
export function setItemRailBound(loc, gi, ii, index, value) {
  const it = itemOf(loc, gi, ii);
  if (!it || !Array.isArray(it.rail) || (index !== 0 && index !== 1)) return false;
  it.rail[index] = intAtLeast(value, 1);
  return true;
}

// A timed Item's planned duration, in seconds — the caller converts from whatever unit it collected
// (a steady effort is authored in minutes, a station in seconds — ADR-0019).
export function setItemTime(loc, gi, ii, seconds) {
  const it = itemOf(loc, gi, ii);
  if (!it) return false;
  it.time = intAtLeast(seconds, 0);
  return true;
}

/* ---- What an edit would orphan ---- */
// The logged work a removal or a kind switch would retire (ADR-0032): a Group's, an Item's, or —
// with no indices — the whole Routine's, Attendances included. The dispatch asks before the
// destructive edits so the answer can be put to the user, which is the difference between being told
// and finding out later.
export function orphanCount(loc, gi, ii) {
  const cells = cellsOf(loc);
  const perfs = performancesIn(cells).filter((p) =>
    (gi == null || p.ctx.group === gi) && (ii == null || p.ctx.item === ii));
  return perfs.length + (gi == null ? attendancesIn(cells).length : 0);
}
