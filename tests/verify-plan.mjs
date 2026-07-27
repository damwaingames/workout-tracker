/* Pure-Node test (no browser) for the plan-editing verbs (#64) — the module that owns the invariant
 * "a plan edit repairs the history that points at it" (ADR-0032).
 *
 * A Performance back-references the exact plan slot it was logged in (ADR-0020), by index. Every
 * structural edit that shifts those indices has to repair or retire the Performances keyed by them,
 * or a surviving slot pre-fills from a set logged somewhere else. The verbs take domain arguments and
 * don't persist, so this seam is a literal store + a verb call + a query — no storage adapter and no
 * browser. Prior art: verify-tonnage (which is where the swapDays assertions below came from).
 *
 * Run standalone (`node verify-plan.mjs`) or via run.mjs — it never launches Playwright. */

import { normalise, setState, state, performanceAt, performancesOf, attendanceAt } from "../state.js";
import { cellKey, cellScalarKey } from "../helpers.js";
import { removeGroup, moveGroup, addGroup, removeItem, setRoutineKind, setBlockWeeks, swapDays, atHoliday, setRoutineField, setGroupField, setItemRailBound, setItemTime, orphanCount } from "../plan.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { (cond ? pass++ : fail++); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

// A logged set and the slot ctx it was logged at — the six-part back-reference (ADR-0020).
const atWeek = (week, routine, group, item, round = 0) => ({ block: "b1", week, routine, group, item, round });
const at = (routine, group, item, round = 0) => atWeek(1, routine, group, item, round);
const perf = (ctx, kg, reps) => ({ date: "2026-07-01", load: { metric: "kg", mag: kg }, volume: { type: "reps", val: reps }, zone: "hypertrophy", ctx });
const ex = (id, name, performances) => ({ id, name, volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [8, 12], performances });
const item = (exId) => ({ exId, rail: [8, 12] });
const group = (...exIds) => ({ items: exIds.map(item), rounds: 1, restWithin: 0, restAfter: 90 });

// A Session whose three Groups are Goblet / Goblet / Row — the same exercise in two Groups, which is
// what turns the defect from untidy into wrong: remove the first Group and the second one's slot
// inherits the *removed* Group's numbers, because the index it is keyed by now points at it.
function store() {
  return normalise({
    version: 6,
    library: {
      gs: ex("gs", "Goblet", [perf(at(0, 0, 0), 20, 10), perf(at(0, 1, 0), 40, 5)]),
      row: ex("row", "Row", [perf(at(0, 2, 0), 30, 8)]),
    },
    classes: {},
    blocks: [{
      id: "b1", name: "B1", startDate: "2026-06-29", weeks: 2,
      template: [{ kind: "session", title: "Lift", groups: [group("gs"), group("gs"), group("row")] }, { kind: "rest" }],
    }],
    log: {}, ui: { block: "b1", week: 1, view: "plan" },
  });
}
// The verbs locate a routine the way the dispatch will: a block + a template position.
const target = () => ({ block: state.blocks[0], position: 0 });
// What a slot pre-fills with, in kg — null when it pre-fills nothing.
const fills = (exId, ctx) => { const p = performanceAt(exId, ctx); return p && p.load ? p.load.mag : null; };

/* ---------------------------------------------------------------------- *
 * Remove a Group — the reported defect (#64).                             *
 * ---------------------------------------------------------------------- */
setState(store());
removeGroup(target(), 0);

// The structural edit itself.
ck("removing a Group drops it from the plan", state.blocks[0].template[0].groups.length === 2);

// The repair: every surviving Performance still resolves to the slot holding its own set.
ck("the surviving Goblet slot pre-fills its OWN set (40kg), not the removed Group's (20kg)",
  fills("gs", at(0, 0, 0)) === 40);
ck("the Row slot moved up with its Group and keeps its set (30kg)", fills("row", at(0, 1, 0)) === 30);

// The orphan policy (ADR-0032): the deleted Group's set stays on the exercise, but its ctx is
// retired to the coarse {block, week, routine} shape, so it pre-fills no slot.
ck("the deleted Group's set survives on the exercise", performancesOf("gs").length === 2);
ck("...but pre-fills nothing (its ctx is retired to the coarse shape)",
  performancesOf("gs").filter((p) => p.ctx.group == null).length === 1);
ck("...and the retired ctx still records the day it was logged",
  performancesOf("gs").some((p) => p.ctx.group == null && p.ctx.block === "b1" && p.ctx.week === 1 && p.ctx.routine === 0));

/* ---------------------------------------------------------------------- *
 * Move a Group — a reorder, so nothing is orphaned; the history swaps too. *
 * ---------------------------------------------------------------------- */
setState(store());
const order = () => state.blocks[0].template[0].groups.map((g) => g.items[0].exId).join(",");
moveGroup(target(), 1, 1); // the 40kg Goblet Group trades places with the Row Group

ck("moving a Group down reorders the plan", order() === "gs,row,gs");
ck("the moved Group's set follows it to its new index (40kg)", fills("gs", at(0, 2, 0)) === 40);
ck("the Group it traded with keeps its own set (30kg)", fills("row", at(0, 1, 0)) === 30);
ck("a Group that didn't move is untouched (20kg)", fills("gs", at(0, 0, 0)) === 20);
ck("a reorder orphans nothing", performancesOf("gs").every((p) => p.ctx.group != null));
ck("moving past the end is a no-op", moveGroup(target(), 2, 1) === false && order() === "gs,row,gs");
ck("moving before the start is a no-op", moveGroup(target(), 0, -1) === false && order() === "gs,row,gs");

// Adding appends past the end, so it shifts no index and owes no repair.
addGroup(target());
ck("adding a Group appends an empty one and disturbs no history",
  state.blocks[0].template[0].groups.length === 4 && fills("gs", at(0, 2, 0)) === 40);

/* ---------------------------------------------------------------------- *
 * Remove an Item — the same defect one level down, inside a Group.        *
 * ---------------------------------------------------------------------- */
// Group 0 is a three-Item circuit (Goblet / Row / Goblet again); Group 1 exists to prove the repair
// stays inside the Group it edited.
function itemStore() {
  return normalise({
    version: 6,
    library: {
      gs: ex("gs", "Goblet", [perf(at(0, 0, 0), 20, 10), perf(at(0, 0, 2), 40, 5), perf(at(0, 1, 0), 50, 6)]),
      row: ex("row", "Row", [perf(at(0, 0, 1), 30, 8)]),
    },
    classes: {},
    blocks: [{
      id: "b1", name: "B1", startDate: "2026-06-29", weeks: 2,
      template: [{ kind: "session", title: "Lift", groups: [group("gs", "row", "gs"), group("gs")] }, { kind: "rest" }],
    }],
    log: {}, ui: { block: "b1", week: 1, view: "plan" },
  });
}
setState(itemStore());
removeItem(target(), 0, 0); // drop the first Goblet from the circuit

ck("removing an Item drops it from its Group", state.blocks[0].template[0].groups[0].items.length === 2);
ck("the surviving Goblet slot pre-fills its OWN set (40kg), not the removed Item's (20kg)",
  fills("gs", at(0, 0, 1)) === 40);
ck("the Row slot moved up with it and keeps its set (30kg)", fills("row", at(0, 0, 0)) === 30);
ck("the removed Item's set is retired, not deleted",
  performancesOf("gs").length === 3 && performancesOf("gs").filter((p) => p.ctx.item == null).length === 1);
ck("another Group's history is untouched (50kg)", fills("gs", at(0, 1, 0)) === 50);
ck("removing an Item that isn't there is a no-op", removeItem(target(), 0, 9) === false);

/* ---------------------------------------------------------------------- *
 * Switch a Routine's kind — the edit that replaces a Routine wholesale.   *
 * ---------------------------------------------------------------------- */
// Two weeks of the same Session, except week 2 was swapped for the Holiday Session (ADR-0025) — so
// week 2's set was logged against the singleton's Groups, not this Routine's, and must survive a
// kind switch that legitimately orphans week 1's.
const scalar = (wk, pos, field) => cellScalarKey(cellKey("b1", wk, pos), field);
function kindStore() {
  return normalise({
    version: 6,
    library: { gs: ex("gs", "Goblet", [perf(at(0, 0, 0), 20, 10), perf(atWeek(2, 0, 0, 0), 25, 10)]) },
    classes: { bf: { id: "bf", name: "Box Fit", attendances: [{ date: "2026-07-02", mins: 45, kcal: 400, note: "", ctx: { block: "b1", week: 1, routine: 1 } }] } },
    blocks: [{
      id: "b1", name: "B1", startDate: "2026-06-29", weeks: 2,
      template: [
        { kind: "session", title: "Lift", groups: [group("gs")] },
        { kind: "class", classType: "bf", durationMin: 45 },
        { kind: "rest" },
      ],
    }],
    log: {
      [scalar(1, 0, "rpe")]: 8, [scalar(2, 0, "rpe")]: 7, [scalar(1, 0, "collapsed")]: true,
      [scalar(2, 0, "holiday")]: true,
    },
    ui: { block: "b1", week: 1, view: "plan" },
  });
}
setState(kindStore());
ck("re-picking the kind a Routine already is changes nothing", setRoutineKind(target(), "session") === false);

setRoutineKind(target(), "rest");
ck("switching kind replaces the Routine", state.blocks[0].template[0].kind === "rest" && !state.blocks[0].template[0].groups);
ck("the replaced Session's own sets are retired", fills("gs", at(0, 0, 0)) === null &&
  performancesOf("gs").some((p) => p.ctx.week === 1 && p.ctx.group == null));
ck("...but a Holiday-swapped week's set survives — it was logged against the Holiday Session",
  fills("gs", atWeek(2, 0, 0, 0)) === 25);
ck("the replaced Session's RPE goes with it", state.log[scalar(1, 0, "rpe")] === undefined);
ck("...and the Holiday-swapped week keeps its RPE", state.log[scalar(2, 0, "rpe")] === 7);
ck("the collapsed flag is untouched — it is UI state, not the Routine's", state.log[scalar(1, 0, "collapsed")] === true);

setRoutineKind({ block: state.blocks[0], position: 1 }, "rest");
ck("switching a Class away retires its Attendances too",
  attendanceAt("bf", { block: "b1", week: 1, routine: 1 }) === null &&
  state.classes.bf.attendances.length === 1 && !state.classes.bf.attendances[0].ctx);

/* ---------------------------------------------------------------------- *
 * The Holiday Session — the same verbs, a different set of logged cells.  *
 * ---------------------------------------------------------------------- */
// Week 1 of the Session day is swapped for the Holiday Session (ADR-0025), week 2 is the planned
// Session. Editing the singleton must repair the swapped week's history and leave the planned week's
// alone — the two occupy the same routine position, so only the swap flag tells them apart.
function holidayStore() {
  return normalise({
    version: 6,
    library: { gs: ex("gs", "Goblet", [perf(at(0, 0, 0), 20, 10), perf(at(0, 1, 0), 40, 5), perf(atWeek(2, 0, 0, 0), 99, 3)]) },
    classes: {},
    blocks: [{
      id: "b1", name: "B1", startDate: "2026-06-29", weeks: 2,
      template: [{ kind: "session", title: "Lift", groups: [group("gs")] }, { kind: "rest" }],
    }],
    holiday: { title: "Holiday", focus: "", groups: [group("gs"), group("gs")] },
    log: { [scalar(1, 0, "holiday")]: true },
    ui: { block: "b1", week: 1, view: "plan" },
  });
}
setState(holidayStore());
removeGroup(atHoliday(), 0);

ck("a Group can be removed from the Holiday Session", state.holiday.groups.length === 1);
ck("the swapped week's history is repaired by the singleton's verb (40kg moves up)",
  fills("gs", at(0, 0, 0)) === 40);
ck("the planned Session's own week is untouched by a Holiday edit (99kg)",
  fills("gs", atWeek(2, 0, 0, 0)) === 99);

/* ---------------------------------------------------------------------- *
 * Block length — the viewed-week clamp belongs to the verb (#64).         *
 * ---------------------------------------------------------------------- */
setState(store());
state.ui.week = 4;
setBlockWeeks(state.blocks[0], 6);
ck("a Block can be lengthened", state.blocks[0].weeks === 6 && state.ui.week === 4);
setBlockWeeks(state.blocks[0], 2);
ck("shortening past the viewed week clamps the view with it", state.blocks[0].weeks === 2 && state.ui.week === 2);
setBlockWeeks(state.blocks[0], 0);
ck("a Block can't be shortened below one week", state.blocks[0].weeks === 1 && state.ui.week === 1);
ck("shortening retires nothing — it is reversible, and re-lengthening restores the weeks",
  (setBlockWeeks(state.blocks[0], 2), fills("gs", at(0, 0, 0)) === 20));

/* ---------------------------------------------------------------------- *
 * Reorder the days — the verb that was already right, moved here (#64).   *
 * ---------------------------------------------------------------------- */
// Reorder day 0 ↔ day 1 after logging: RPE / collapsed keyed by template position must follow the
// day across EVERY week, and a set's ctx.routine still swaps (ADR-0020). Day 0 has an RPE+collapsed
// (week 1) and day 1 has an RPE (week 2) — the one-side-present case.
setState(store());
state.log[scalar(1, 0, "rpe")] = "7";
state.log[scalar(1, 0, "collapsed")] = true;
state.log[scalar(2, 1, "rpe")] = "9";
swapDays(state.blocks[0], 0, 1);

ck("RPE follows the day to its new position (w1 d0 → d1)",
  state.log[scalar(1, 1, "rpe")] === "7" && state.log[scalar(1, 0, "rpe")] === undefined);
ck("the collapsed flag follows the day too",
  state.log[scalar(1, 1, "collapsed")] === true && state.log[scalar(1, 0, "collapsed")] === undefined);
ck("scalars swap across EVERY week (w2 d1 RPE → d0)",
  state.log[scalar(2, 0, "rpe")] === "9" && state.log[scalar(2, 1, "rpe")] === undefined);
ck("a logged set's ctx.routine swaps with the day", performancesOf("gs").every((p) => p.ctx.routine === 1));
ck("...so it still pre-fills its slot, at the day's new position", fills("gs", atWeek(1, 1, 0, 0)) === 20);

/* ---------------------------------------------------------------------- *
 * Scalar plan edits — no ctx consequence, but the same clamp as the Store. *
 * ---------------------------------------------------------------------- */
setState(store());
const g0 = () => state.blocks[0].template[0].groups[0];

setRoutineField(target(), "title", "Push Day");
ck("a Session's title is editable", state.blocks[0].template[0].title === "Push Day");
ck("an unknown routine field is refused, not written",
  setRoutineField(target(), "kind", "rest") === false && state.blocks[0].template[0].kind === "session");

setGroupField(target(), 0, "rounds", "0");
ck("rounds clamp to at least one", g0().rounds === 1);
setGroupField(target(), 0, "restWithin", "-5");
ck("a rest clamps to at least zero", g0().restWithin === 0);
setGroupField(target(), 0, "restAfter", "");
ck("a blank rest lands on the floor rather than NaN", g0().restAfter === 0);
ck("an unknown group field is refused", setGroupField(target(), 0, "items", []) === false && g0().items.length === 1);

setItemRailBound(target(), 0, 0, 0, "0");
ck("a rail bound clamps to at least one rep", g0().items[0].rail[0] === 1);
ck("an out-of-range rail index is refused", setItemRailBound(target(), 0, 0, 2, 5) === false && g0().items[0].rail.length === 2);
setItemTime(target(), 0, 0, "-30");
ck("an Item's duration clamps to at least zero", g0().items[0].time === 0);

ck("no scalar edit disturbed the logged history", fills("gs", at(0, 0, 0)) === 20 && fills("row", at(0, 2, 0)) === 30);

/* ---------------------------------------------------------------------- *
 * What an edit would orphan — what the dispatch confirms before calling.   *
 * ---------------------------------------------------------------------- */
setState(store());
ck("a Group's logged sets are counted before it is removed", orphanCount(target(), 0) === 1);
ck("an Item's are counted the same way", orphanCount(target(), 2, 0) === 1);
ck("a whole Routine's are counted for a kind switch", orphanCount(target()) === 3);
ck("an unlogged Group counts nothing", (addGroup(target()), orphanCount(target(), 3) === 0));
ck("a Rest day counts nothing", orphanCount({ block: state.blocks[0], position: 1 }) === 0);

console.log("\n" + (fail === 0 ? "PASS" : `FAIL (${fail} checks)`) + `  [${pass}/${pass + fail}]`);
process.exit(fail === 0 ? 0 : 1);
