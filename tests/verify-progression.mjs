/* Pure-Node progression maths + queries test (no browser) — the #46 second seam. The double
 * progression target, the rail→zone threading, e1RM trend, and the e1RM-seeded guide ghost are
 * pure and combinatorially rich (zones × metrics × ghost/guide/cap tiers), so they're tested here
 * directly rather than through the slow, brittle UI (which verify-progression-ui covers). Prior art:
 * the pure-Node verify-migration.
 *
 * Run standalone (`node verify-progression.mjs`) or via run.mjs, which spawns it and checks the exit
 * code like any other verify-*.mjs — it just never launches Playwright. */

import {
  railZone, railZones, doubleProgression, nextBandTier, guideLoadKg, fmtTarget, e1rm, zoneOf,
} from "../helpers.js";
import { normalise, setState, ghostFor, progressionFor, e1rmTrend, prsOf } from "../state.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { (cond ? pass++ : fail++); console.log((cond ? "ok  " : "FAIL") + "  " + label); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ---------------------------------------------------------------------- *
 * Rail → zone: the thread double progression runs on (ADR-0021).          *
 * ---------------------------------------------------------------------- */
// The item's display zone is derived from the rail's FLOOR, so a within-zone widening keeps it:
// the ADR's own load-carries example, [8,12] → [10,15], must stay one zone.
ck("railZone [8,12] → hypertrophy", railZone([8, 12]) === "hypertrophy");
ck("railZone [10,15] → hypertrophy (same as [8,12] — load carries)", railZone([10, 15]) === "hypertrophy");
ck("railZone [3,5] → strength", railZone([3, 5]) === "strength");
ck("railZone [15,20] → endurance", railZone([15, 20]) === "endurance");
ck("railZone of a garbage rail → null", railZone(null) === null);

// The set of zones a rail SPANS — what the ghost matches against, so a set logged at a
// boundary-straddling rail's ceiling still threads (a [10,15] rail reaches into endurance).
ck("railZones [8,12] spans only hypertrophy", railZones([8, 12]).join() === "hypertrophy");
ck("railZones [10,15] spans hypertrophy + endurance", railZones([10, 15]).includes("hypertrophy") && railZones([10, 15]).includes("endurance"));
ck("railZones [3,5] spans only strength", railZones([3, 5]).join() === "strength");

/* ---------------------------------------------------------------------- *
 * Double progression: climb reps to the ceiling, then step load, reset.   *
 * ---------------------------------------------------------------------- */
const kg = (mag) => ({ metric: "kg", mag });
// Below the ceiling: same load, one more rep.
(() => {
  const t = doubleProgression([8, 12], kg(40), 10);
  ck("kg below ceiling → same load, +1 rep", t && t.load.metric === "kg" && t.load.mag === 40 && t.volume.val === 11 && t.stepped === false);
})();
// At (and beyond) the ceiling: step the load, reset to the floor.
(() => {
  const t = doubleProgression([8, 12], kg(40), 12);
  ck("kg at ceiling → step load (+2.5), reset to floor", t && near(t.load.mag, 42.5) && t.volume.val === 8 && t.stepped === true);
  const over = doubleProgression([8, 12], kg(40), 13);
  ck("kg over ceiling → also steps", over && near(over.load.mag, 42.5) && over.volume.val === 8 && over.stepped === true);
})();
// Bands step by TIER, not kg (ADR-0029): the discrete ladder is the natural "add load".
(() => {
  const below = doubleProgression([10, 15], { metric: "mini-loop", mag: "medium" }, 12);
  ck("band below ceiling → same tier, +1 rep", below && below.load.mag === "medium" && below.volume.val === 13 && below.stepped === false);
  const cap = doubleProgression([10, 15], { metric: "mini-loop", mag: "medium" }, 15);
  ck("band at ceiling → next tier, reset to floor", cap && cap.load.mag === "heavy" && cap.volume.val === 10 && cap.stepped === true);
})();
// Bodyweight (none) has no load to add — the target is always one more rep, never a step.
(() => {
  const t = doubleProgression([12, 20], { metric: "none", mag: null }, 20);
  ck("bodyweight at ceiling → keep climbing reps, never steps", t && t.load.metric === "none" && t.volume.val === 21 && t.stepped === false);
})();
ck("doubleProgression of a garbage rail → null", doubleProgression(null, kg(40), 10) === null);
ck("doubleProgression with no reference reps → null", doubleProgression([8, 12], kg(40), 0) === null);

ck("nextBandTier medium → heavy", nextBandTier("medium") === "heavy");
ck("nextBandTier x-heavy → clamps at x-heavy", nextBandTier("x-heavy") === "x-heavy");

/* ---------------------------------------------------------------------- *
 * Guide ghost: invert Epley to seed a cold zone's starting load (ADR-0022).*
 * ---------------------------------------------------------------------- */
ck("guideLoadKg inverts Epley for the floor reps, rounded down", guideLoadKg(56, 8) === Math.floor(56 / (1 + 8 / 30)));
ck("guideLoadKg with no e1RM → null (a pure-bodyweight move seeds nothing)", guideLoadKg(null, 8) === null);
ck("guideLoadKg with no reps → null", guideLoadKg(56, 0) === null);

/* ---------------------------------------------------------------------- *
 * Formatting a target for the UI.                                         *
 * ---------------------------------------------------------------------- */
ck("fmtTarget kg → '42.5 kg × 8'", fmtTarget(doubleProgression([8, 12], kg(40), 12)) === "42.5 kg × 8");
ck("fmtTarget band → 'Heavy band × 10'", fmtTarget(doubleProgression([10, 15], { metric: "mini-loop", mag: "medium" }, 15)) === "Heavy band × 10");
ck("fmtTarget bodyweight → '21 reps'", fmtTarget(doubleProgression([12, 20], { metric: "none", mag: null }, 20)) === "21 reps");

/* ---------------------------------------------------------------------- *
 * State queries over a real timeline: ghost / target / guide / trend.     *
 * ---------------------------------------------------------------------- */
const perf = (date, load, reps, zone) => ({ date, load, volume: { type: "reps", val: reps }, zone: zone || zoneOf(reps) });
function store() {
  return normalise({
    version: 6,
    library: {
      // a free-weight lift with a rising hypertrophy history
      sq: { id: "sq", name: "Squat", volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [8, 12],
        performances: [perf("2026-06-01", kg(40), 10), perf("2026-06-08", kg(40), 12)] },
      // a lift whose only history is at a [10,15] rail's ceiling — 15 reps stores as endurance,
      // but must still count as the ghost for a [10,15] item (the straddle-cap case)
      dl: { id: "dl", name: "Deadlift", volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [10, 15],
        performances: [perf("2026-06-05", kg(60), 12), perf("2026-06-12", kg(60), 15)] },
      // history in ONE zone only — used to prove a cold zone seeds a guide ghost and then retires it
      pr: { id: "pr", name: "Press", volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [8, 12],
        performances: [perf("2026-06-03", kg(30), 10)] },
    },
    classes: {},
    blocks: [{ id: "b1", name: "B1", startDate: "2026-06-01", weeks: 1, template: [{ kind: "rest" }] }],
    log: {}, ui: { block: "b1", week: 1, view: "plan" },
  });
}
setState(store());

// The ghost is the LAST in-zone performance (ADR-0021).
ck("ghostFor picks the most recent in-zone performance", (() => {
  const g = ghostFor("sq", [8, 12]);
  return g && g.date === "2026-06-08" && g.volume.val === 12;
})());

// Working load carries across a rail change WITHIN a zone; the target re-reads the new rail (ADR-0021).
(() => {
  const p = progressionFor({ exId: "sq", rail: [10, 15] }, { loadMetric: "kg" });
  ck("load carries across [8,12]→[10,15] (ghost still found, same 40 kg)", p && p.ghost && p.ghost.load.mag === 40);
  ck("target re-reads the widened rail (12<15 → 40 kg × 13)", p && p.target && p.target.load.mag === 40 && p.target.volume.val === 13);
})();

// A zone CHANGE starts a fresh thread — no in-zone ghost, so a guide ghost seeds it instead.
(() => {
  const p = progressionFor({ exId: "sq", rail: [3, 5] }, { loadMetric: "kg" });
  ck("a disjoint zone finds no real ghost", p && !p.ghost);
  ck("a cold zone seeds a guide ghost (estimated, e1RM-derived)", p && p.guide && p.guide.estimated === true && p.guide.load.metric === "kg" && p.guide.load.mag > 0);
})();

// The straddle-cap case: a [10,15] item whose last set hit 15 reps (stored endurance) must still
// see that as its ghost and step the load — the whole point of double progression at the cap.
(() => {
  const p = progressionFor({ exId: "dl", rail: [10, 15] }, { loadMetric: "kg" });
  ck("a set at a straddling rail's ceiling is still the ghost", p && p.ghost && p.ghost.volume.val === 15);
  ck("capping the rail steps the load and resets to the floor", p && p.target && p.target.stepped === true && near(p.target.load.mag, 62.5) && p.target.volume.val === 10);
})();

// The guide ghost self-retires the instant a real in-zone performance exists (ADR-0022).
(() => {
  const cold = progressionFor({ exId: "pr", rail: [3, 5] }, { loadMetric: "kg" });   // strength: no history → guide
  const warm = progressionFor({ exId: "pr", rail: [8, 12] }, { loadMetric: "kg" });  // hypertrophy: has history → real ghost
  ck("cold zone shows a guide ghost", cold && cold.guide && !cold.ghost);
  ck("a zone with history shows a real ghost, no guide", warm && warm.ghost && !warm.guide);
})();

// e1RM trend: advisory only — a cross-zone max + latest + direction (ADR-0022), never a per-set judge.
(() => {
  const t = e1rmTrend("sq");
  ck("e1rmTrend reports the top e1RM as its max", t && near(t.max, e1rm(40, 12)));
  ck("e1rmTrend reports the latest e1RM", t && near(t.latest, e1rm(40, 12)));
  ck("e1rmTrend reads 'up' when the latest e1RM beats the prior", t && t.dir === "up");
  ck("e1rmTrend of a history-free exercise → null", e1rmTrend("no-such-id") === null);
})();

// PRs derive per (exercise, zone) — the readout the Library shows (ADR-0020/0021).
(() => {
  const pr = prsOf("sq");
  ck("PRs bucket per rep-zone", pr && pr.kind === "reps" && pr.byZone && pr.byZone.hypertrophy);
  ck("PRs carry a headline top e1RM", pr && pr.topE1rm && near(pr.topE1rm.value, e1rm(40, 12)));
})();

console.log("\n" + (fail === 0 ? "PASS" : "FAIL") + ` (${pass} ok, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
