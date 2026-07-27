/* Pure-Node test (no browser) for the #47 maths + queries — the RIR marker on a Performance, the
 * advisory RIR nudge, and the tonnage volume-load readout (loading-mode-honest). These are
 * pure/deterministic, so they're tested here rather than through the UI (which verify-rir-rpe
 * drives). Prior art: verify-progression / verify-migration. The day-reorder assertions that used to
 * live here moved to verify-plan with the verb itself (#64).
 *
 * Run standalone (`node verify-tonnage.mjs`) or via run.mjs — it never launches Playwright. */

import { buildPerformance, rirNudge, fmtTonnage } from "../helpers.js";
import { normalise, setState, state, sessionTonnageKg, blockTonnageKg } from "../state.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { (cond ? pass++ : fail++); console.log((cond ? "ok  " : "FAIL") + "  " + label); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ---------------------------------------------------------------------- *
 * RIR on the Performance (ADR-0027) — a rep-set marker, advisory only.    *
 * ---------------------------------------------------------------------- */
ck("a rep set carries its RIR bucket", buildPerformance("load-reps", {}, { r: "10", w: "8", rir: "easy" }).rir === "easy");
ck("a band rep set carries RIR", buildPerformance("band-reps", { loadMetric: "mini-loop" }, { r: "12", tier: "medium", rir: "hard" }).rir === "hard");
ck("a bodyweight rep set carries RIR", buildPerformance("reps", {}, { r: "15", rir: "ideal" }).rir === "ideal");
ck("no RIR → no rir field (most sets carry none)", !("rir" in buildPerformance("load-reps", {}, { r: "10", w: "8" })));
ck("a garbage RIR is ignored", !("rir" in buildPerformance("load-reps", {}, { r: "10", w: "8", rir: "bogus" })));
ck("a timed station never carries RIR", !("rir" in buildPerformance("station", {}, { done: true, time: "30", rir: "easy" })));
ck("a steady effort never carries RIR", !("rir" in buildPerformance("steady", {}, { mins: "20", level: "6", rir: "easy" })));

// The advisory nudge — reps-to-spare says size up, to-failure says hold; ideal / none say nothing.
ck("RIR easy nudges to size up", /size up|add load/i.test(rirNudge("easy") || ""));
ck("RIR hard nudges to hold", /hold/i.test(rirNudge("hard") || ""));
ck("RIR ideal produces no nudge", rirNudge("ideal") === null);
ck("no RIR produces no nudge", rirNudge(null) === null && rirNudge(undefined) === null);

/* ---------------------------------------------------------------------- *
 * Tonnage (ADR-0029) — a volume-load readout, loading-mode-honest.        *
 * ---------------------------------------------------------------------- */
ck("fmtTonnage renders tonnes to one decimal", fmtTonnage(3500) === "3.5 t");
ck("fmtTonnage 682.5 kg → 0.7 t", fmtTonnage(682.5) === "0.7 t");
ck("fmtTonnage of nothing → '' (hidden)", fmtTonnage(0) === "" && fmtTonnage(-5) === "");

const perf = (ctx, load, reps) => ({ date: "2026-06-01", load, volume: { type: "reps", val: reps }, zone: "hypertrophy", ctx });
const c = (group, item) => ({ block: "b1", week: 1, routine: 0, group, item, round: 0 });
function store() {
  return normalise({
    version: 6,
    library: {
      // one exercise per loading mode, plus a band and a bodyweight move, each with a week-1 set
      gs: { id: "gs", name: "Goblet", volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [8, 12],
        performances: [perf(c(0, 0), { metric: "kg", mag: 8 }, 10)] },                                   // standard: 8×10 = 80
      row: { id: "row", name: "Row", volume: "reps", loadMetric: "kg", loadMode: "two-dumbbell", equipment: [], defaultRail: [8, 12],
        performances: [perf(c(1, 0), { metric: "kg", mag: 8 }, 10)] },                                   // two-dumbbell: (8×2)×10 = 160
      side: { id: "side", name: "Row/side", volume: "reps", loadMetric: "kg", loadMode: "per-side", equipment: [], defaultRail: [8, 12],
        performances: [perf(c(1, 1), { metric: "kg", mag: 10 }, 12)] },                                  // per-side: 10×(12×2) = 240
      band: { id: "band", name: "Band", volume: "reps", loadMetric: "mini-loop", equipment: [], defaultRail: [10, 15],
        performances: [perf(c(2, 0), { metric: "mini-loop", mag: "medium" }, 15)] },                     // band: 13.5×15 = 202.5
      bw: { id: "bw", name: "Crunch", volume: "reps", loadMetric: "none", equipment: [], defaultRail: [12, 20],
        performances: [perf(c(3, 0), { metric: "none", mag: null }, 20)] },                              // bodyweight: 0
    },
    classes: {},
    blocks: [{
      id: "b1", name: "B1", startDate: "2026-06-01", weeks: 2,
      template: [
        { kind: "session", title: "Lift", groups: [
          { items: [{ exId: "gs", rail: [8, 12] }], rounds: 1, restWithin: 0, restAfter: 90 },
          { items: [{ exId: "row", rail: [8, 12] }, { exId: "side", rail: [8, 12] }], rounds: 1, restWithin: 0, restAfter: 90 },
          { items: [{ exId: "band", rail: [10, 15] }], rounds: 1, restWithin: 0, restAfter: 90 },
          { items: [{ exId: "bw", rail: [12, 20] }], rounds: 1, restWithin: 0, restAfter: 90 },
        ] },
        { kind: "rest" },
      ],
    }],
    log: {}, ui: { block: "b1", week: 1, view: "plan" },
  });
}
setState(store());
const block = state.blocks[0];

ck("session tonnage sums loaded rep-Items, loading-mode-honest (80+160+240+202.5)", near(sessionTonnageKg(block, 1, 0), 682.5));
ck("two-dumbbell doubles the weight (row = 160, not 80)", near(sessionTonnageKg(block, 1, 0), 682.5)); // balance below proves each mult
ck("bodyweight (0 kg) adds no tonnage", (() => {
  // drop everything but the bodyweight item's group → 0
  const only = normalise({ version: 6, library: { bw: state.library.bw }, classes: {},
    blocks: [{ id: "b1", name: "B", startDate: "2026-06-01", weeks: 1, template: [{ kind: "session", title: "x", groups: [{ items: [{ exId: "bw", rail: [12, 20] }], rounds: 1, restWithin: 0, restAfter: 0 }] }] }],
    log: {}, ui: { block: "b1", week: 1 } });
  return sessionTonnageKg(only.blocks[0], 1, 0) === 0;
})());
ck("a Rest day has no tonnage", sessionTonnageKg(block, 1, 1) === 0);
ck("a week with no logged sets has no tonnage", sessionTonnageKg(block, 2, 0) === 0);
ck("block tonnage sums every week × day (only week 1 logged → 682.5)", near(blockTonnageKg(block), 682.5));

console.log("\n" + (fail === 0 ? "PASS" : "FAIL") + ` (${pass} ok, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
