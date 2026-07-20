/* Pure-Node test (no browser) for #48 — equipment filtering + the Holiday-Session swap. The kit
 * subset test, the away-eligible query, the per-cell holiday swap, and its effect on progression are
 * pure/deterministic, so they're tested here directly (the UI is driven by verify-holiday). Prior
 * art: verify-tonnage / verify-progression.
 *
 * Run standalone (`node verify-equipment.mjs`) or via run.mjs — it never launches Playwright. */

// A minimal localStorage so the save()-ing queries (logPerformance) run under pure Node.
globalThis.localStorage = { s: {}, setItem(k, v) { this.s[k] = v; }, getItem(k) { return k in this.s ? this.s[k] : null; }, removeItem(k) { delete this.s[k]; } };

import { fitsKit } from "../helpers.js";
import { AWAY_KIT } from "../constants.js";
import {
  normalise, setState, state, awayEligible, isHolidayCell, effectiveRoutine,
  logPerformance, ghostFor, performancesOf, swapDays,
} from "../state.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { (cond ? pass++ : fail++); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

/* ---------------------------------------------------------------------- *
 * Equipment ⊆ kit — filters, never gates (ADR-0023).                      *
 * ---------------------------------------------------------------------- */
ck("no equipment fits any kit (empty ⊆ anything)", fitsKit([], AWAY_KIT) === true);
ck("a mini-loop move fits the away kit", fitsKit(["mini-loops"], AWAY_KIT) === true);
ck("a door-anchor + band move fits the away kit", fitsKit(["door-anchor", "resistance-bands"], AWAY_KIT) === true);
ck("a dumbbell move does NOT fit the away kit", fitsKit(["adjustable-dumbbells"], AWAY_KIT) === false);
ck("a partly-away move (bench + band) does NOT fit", fitsKit(["bench", "resistance-bands"], AWAY_KIT) === false);

const ex = (id, name, equip, o) => Object.assign({ id, name, volume: "reps", loadMetric: "kg", equipment: equip, defaultRail: [8, 12], performances: [] }, o || {});
function store() {
  return normalise({
    version: 6,
    library: {
      goblet: ex("goblet", "Goblet", ["adjustable-dumbbells"], { performances: [{ date: "2026-06-01", load: { metric: "kg", mag: 8 }, volume: { type: "reps", val: 12 }, zone: "hypertrophy" }] }),
      loop: ex("loop", "Loop Walk", ["mini-loops"], { loadMetric: "mini-loop" }),
      bw: ex("bw", "Sit-up", []),
      door: ex("door", "Door Pull", ["door-anchor", "resistance-bands"], { loadMetric: "long-band" }),
      benchp: ex("benchp", "Bench Press", ["bench"]),
      retiredloop: ex("retiredloop", "Old Loop", ["mini-loops"], { loadMetric: "mini-loop", retired: true }),
    },
    classes: {},
    blocks: [{
      id: "b1", name: "B1", startDate: "2026-06-01", weeks: 2,
      template: [
        { kind: "session", title: "Planned", groups: [{ items: [{ exId: "goblet", rail: [8, 12] }], rounds: 3, restWithin: 0, restAfter: 90 }] },
        { kind: "rest" },
      ],
    }],
    holiday: { title: "Holiday Session", focus: "Bands only", groups: [{ items: [{ exId: "loop", rail: [10, 15] }], rounds: 3, restWithin: 0, restAfter: 60 }] },
    log: {}, ui: { block: "b1", week: 1, view: "plan" },
  });
}
setState(store());
const block = state.blocks[0];

// The away-eligible set: exercises whose equipment ⊆ AWAY_KIT, retired ones excluded (ADR-0025).
const eligible = awayEligible().map((e) => e.id);
ck("away-eligible includes the mini-loop, door-anchor and bodyweight moves", eligible.includes("loop") && eligible.includes("door") && eligible.includes("bw"));
ck("away-eligible excludes dumbbell + bench moves", !eligible.includes("goblet") && !eligible.includes("benchp"));
ck("away-eligible excludes retired moves even when they fit", !eligible.includes("retiredloop"));

/* ---------------------------------------------------------------------- *
 * The Holiday swap — a per-cell flag substitutes the Holiday Session.     *
 * ---------------------------------------------------------------------- */
ck("a day is not holiday by default", isHolidayCell(block, 1, 0) === false);
ck("effectiveRoutine returns the planned routine when not swapped", effectiveRoutine(block, 1, 0).title === "Planned" && !effectiveRoutine(block, 1, 0).holiday);

state.log["b1.w1.d0.holiday"] = true; // swap the Holiday Session into week-1 day-0
ck("isHolidayCell reflects the per-cell flag", isHolidayCell(block, 1, 0) === true);
ck("effectiveRoutine returns the Holiday Session (marked) when swapped", (() => {
  const r = effectiveRoutine(block, 1, 0);
  return r.holiday === true && r.kind === "session" && r.groups[0].items[0].exId === "loop";
})());
ck("only the swapped cell is holiday — another week's same day is untouched", isHolidayCell(block, 2, 0) === false);

// On a holiday day, the band exercise accrues its own Performance while the planned exercise's ghost
// waits untouched — ADR-0025's whole point, which falls out because progression is per-exercise.
const gobletGhostBefore = ghostFor("goblet", [8, 12]);
logPerformance("loop", { block: "b1", week: 1, routine: 0, group: 0, item: 0, round: 0 }, { load: { metric: "mini-loop", mag: "medium" }, volume: { type: "reps", val: 12 } });
ck("the holiday band move records its own Performance", performancesOf("loop").length === 1);
ck("the planned exercise gets NO new Performance on a holiday day", performancesOf("goblet").length === 1);
ck("the planned exercise's ghost is unchanged", ghostFor("goblet", [8, 12]) === gobletGhostBefore);

/* ---------------------------------------------------------------------- *
 * Reordering a holiday-swapped day carries the flag (swapDays, #47 seam). *
 * ---------------------------------------------------------------------- */
setState(store());
const b = state.blocks[0];
state.log["b1.w1.d0.holiday"] = true;
swapDays(b, 0, 1);
ck("the holiday flag follows the day to its new position", state.log["b1.w1.d1.holiday"] === true && state.log["b1.w1.d0.holiday"] === undefined);

console.log("\n" + (fail === 0 ? "PASS" : "FAIL") + ` (${pass} ok, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
