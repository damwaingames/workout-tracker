/* Pure-Node migration test (no browser): inject a v5 store, run it through normalise (which runs
 * the v5→v6 forward migration), and assert the v6 shape + that no logged history is lost. The
 * migration is pure and combinatorially rich (zones × metrics × strength/circuit/steady/class), so
 * it's tested here directly rather than through the slow, brittle UI. Prior art: the pre-strip
 * pure-Node verify-health-export, which imported a builder and asserted on its output.
 *
 * Run standalone (`node verify-migration.mjs`) or via run.mjs, which spawns it and checks the exit
 * code like any other verify-*.mjs — it just never launches Playwright. */

import { normalise, setState, state, deleteBlock, performancesOf, prsOf, newBlockTemplate } from "../state.js";
import { zoneOf, e1rm, bandKg } from "../helpers.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { (cond ? pass++ : fail++); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

// A representative v5 store: one block whose five routines exercise every migration path —
// free-weight strength, a banded strength move, a mixed circuit (timed + banded), a steady ride,
// and a logged class — plus occurrence scalars, a measurement, and a schedule for dating.
function v5store() {
  const D = (r) => "b1.w1.d" + r; // old cellKey: block.w{wk}.d{routineNumber}
  return {
    version: 5,
    library: {
      "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", contexts: ["strength"], setup: "Hold a dumbbell to your chest.", targetReps: "8–12" },
      "bent-over-rows": { id: "bent-over-rows", name: "Bent Over Rows", contexts: ["strength"], targetReps: "8–12", loadMode: "two-dumbbell" },
      "banded-clamshells": { id: "banded-clamshells", name: "Banded Clamshells", contexts: ["strength"], banded: true, defaultBand: "light", targetReps: "10–15 each side", loadMode: "per-side", setup: "Loop a mini-band around your thighs." },
      "high-knees": { id: "high-knees", name: "High Knees", contexts: ["recovery"] },
      "banded-hip-abductions": { id: "banded-hip-abductions", name: "Banded Hip Abductions", contexts: ["recovery"], banded: true, defaultBand: "medium", targetReps: "10–15" },
      "seated-elliptical": { id: "seated-elliptical", name: "Seated Elliptical", contexts: ["steady"], levels: 10 },
      // a full-size anchored band → long-band family (not mini-loop) — the family the old data never recorded
      "band-face-pulls": { id: "band-face-pulls", name: "Band Face Pulls", contexts: ["strength"], banded: true, defaultBand: "light", targetReps: "15", setup: "Full-size band anchored at face height. Pull toward your face." },
      // a timed hold: strength context but NO rep range → must migrate as time/none, not reps/kg
      "wall-posture-holds": { id: "wall-posture-holds", name: "Wall Posture Holds", contexts: ["strength", "recovery"], setup: "Back to the wall, hold." },
    },
    blocks: [{
      id: "b1", name: "Block 1", createdAt: "2026-06-01", startDate: "2026-06-01", // a Monday
      routines: [
        { routine: 1, kind: "strength", title: "Workout A", focus: "Squat & Row", exercises: [{ id: "goblet-squats", sets: 2 }, { id: "bent-over-rows", sets: 2 }, { id: "banded-clamshells", sets: 1 }, { id: "band-face-pulls", sets: 1 }] },
        { routine: 2, kind: "recovery", title: "Recovery A", focus: "Flush", exercises: [{ id: "high-knees" }, { id: "banded-hip-abductions" }], rounds: 2, workSec: 60, restSec: 15, roundRestSec: 0 },
        { routine: 3, kind: "steady", title: "Cardio", focus: "Zone 2", exercises: [{ id: "seated-elliptical" }], durationMin: 30 },
        { routine: 4, kind: "class", title: "Class", focus: "", classType: "Box-Fit", durationMin: 45 },
        { routine: 5, kind: "rest", title: "Rest", focus: "", exercises: [] },
        // an empty steady routine (names no activity) that still logged a session — must not be lost
        { routine: 6, kind: "steady", title: "Cardio 2", focus: "", exercises: [], durationMin: 30 },
      ],
    }],
    log: {
      // strength sets (free weight)
      [D(1) + ".ex.goblet-squats.s0.w"]: "40", [D(1) + ".ex.goblet-squats.s0.r"]: "10",
      [D(1) + ".ex.goblet-squats.s1.w"]: "40", [D(1) + ".ex.goblet-squats.s1.r"]: "8",
      [D(1) + ".ex.bent-over-rows.s0.w"]: "20", [D(1) + ".ex.bent-over-rows.s0.r"]: "12",
      // banded strength move: a per-cell band tier + a reps field (no weight)
      [D(1) + ".ex.banded-clamshells.band"]: "heavy", [D(1) + ".ex.banded-clamshells.s0.r"]: "15",
      // a long-band set, no per-cell band tier → falls back to the exercise default (light)
      [D(1) + ".ex.band-face-pulls.s0.r"]: "15",
      // circuit: two done rounds (timed station) + a banded move logging reps per round
      [D(2) + ".ex.high-knees.r0"]: true, [D(2) + ".ex.high-knees.r1"]: true,
      [D(2) + ".ex.banded-hip-abductions.band"]: "light",
      [D(2) + ".ex.banded-hip-abductions.rr0"]: "12", [D(2) + ".ex.banded-hip-abductions.rr1"]: "10",
      // steady: actual minutes + machine level (routine 3 names the elliptical; routine 6 doesn't)
      [D(3) + ".mins"]: "32", [D(3) + ".resist"]: "6",
      [D(6) + ".mins"]: "25", [D(6) + ".resist"]: "7",
      // class: actual minutes + wearable burn + note
      [D(4) + ".mins"]: "45", [D(4) + ".kcal"]: "400", [D(4) + ".note"]: "great session",
      // occurrence scalars + a measurement + a schedule
      [D(1) + ".rpe"]: "8", [D(1) + ".done"]: true, [D(1) + ".collapsed"]: true,
      "b1.w1.m.bodyweight": "70", "b1.w1.sched": [1, 2, 3, 4, 5],
      // leftover nutrition keys from a pre-strip save (ADR-0018) — must not survive to v6
      [D(1) + ".food"]: [{ barcode: "x", grams: 40 }], [D(1) + ".nut.kcal"]: "300",
    },
    pantry: { x: { barcode: "x", name: "Bar" } },
    holiday: { title: "Holiday Workout", focus: "Bands", kind: "strength", exercises: [{ id: "banded-clamshells", sets: 2 }] },
    winddown: { kind: "mobility", durationMin: 12, exercises: [{ id: "cat-cow" }] },
    measurements: { bodyweight: { id: "bodyweight", name: "Bodyweight", unit: "kg" } },
    tracked: ["bodyweight"], profile: { heightCm: 170 },
    ui: { block: "b1", week: 1 }, notes: "feeling good",
  };
}

// --- pure progression maths (ADR-0021/0022) ---
ck("zoneOf: 5 reps → strength", zoneOf(5) === "strength");
ck("zoneOf: 10 reps → hypertrophy", zoneOf(10) === "hypertrophy");
ck("zoneOf: 15 reps → endurance", zoneOf(15) === "endurance");
ck("zoneOf: 0 reps → null", zoneOf(0) === null);
ck("e1rm: Epley 40kg×10 = 53.33", Math.abs(e1rm(40, 10) - 40 * (1 + 10 / 30)) < 1e-9);
ck("e1rm: bodyweight (0kg) → null", e1rm(0, 10) === null);
// band tier→kg is per family (ADR-0029): a mini-loop "heavy" ≠ a long-band "heavy"
ck("bandKg: mini-loop heavy = 19", bandKg("mini-loop", "heavy") === 19);
ck("bandKg: long-band light = 20", bandKg("long-band", "light") === 20);
ck("bandKg: families differ at the same tier", bandKg("mini-loop", "medium") !== bandKg("long-band", "medium"));

// --- run the migration ---
setState(normalise(v5store()));
ck("store migrated to schema v6", state.version === 6);

// Exercise definitions took the v6 shape.
const gs = state.library["goblet-squats"];
ck("exercise gains volume type", gs.volume === "reps");
ck("exercise gains load metric (kg)", gs.loadMetric === "kg");
ck("targetReps → defaultRail [8,12]", Array.isArray(gs.defaultRail) && gs.defaultRail[0] === 8 && gs.defaultRail[1] === 12);
ck("exercise owns a performances array", Array.isArray(gs.performances));
ck("banded move → band-family metric", state.library["banded-clamshells"].loadMetric === "mini-loop");
ck("banded move keeps its loading mode", state.library["banded-clamshells"].loadMode === "per-side");
ck("steady move → machine-level + time", state.library["seated-elliptical"].loadMetric === "machine-level" && state.library["seated-elliptical"].volume === "time");
ck("timed circuit move → none + time", state.library["high-knees"].loadMetric === "none" && state.library["high-knees"].volume === "time");
ck("legacy `contexts` dropped", state.library["goblet-squats"].contexts === undefined);

// Every logged set became a Performance on the right exercise, sensibly dated.
const gsp = performancesOf("goblet-squats");
ck("free-weight sets → 2 performances", gsp.length === 2);
ck("performance load = 40 kg", gsp[0].load.metric === "kg" && gsp[0].load.mag === 40);
ck("performance volume = 10 reps", gsp[0].volume.type === "reps" && gsp[0].volume.val === 10);
ck("performance zone derived (10 → hypertrophy)", gsp[0].zone === "hypertrophy");
ck("performance dated by derived weekday (Mon 1 Jun)", gsp[0].date === "2026-06-01");
ck("performance keeps a session back-ref", gsp[0].ctx && gsp[0].ctx.block === "b1" && gsp[0].ctx.week === 1);

const bc = performancesOf("banded-clamshells");
ck("banded strength → 1 performance", bc.length === 1);
ck("banded performance uses the cell's band tier (heavy)", bc[0].load.metric === "mini-loop" && bc[0].load.mag === "heavy");
ck("banded performance reps = 15 → endurance", bc[0].volume.val === 15 && bc[0].zone === "endurance");

const hk = performancesOf("high-knees");
ck("circuit done rounds → 2 timed performances", hk.length === 2);
ck("timed round volume = workSec (60s), no load", hk[0].volume.type === "time" && hk[0].volume.val === 60 && hk[0].load.metric === "none");
ck("timed round dated to routine 2 (Tue 2 Jun)", hk[0].date === "2026-06-02");

const ha = performancesOf("banded-hip-abductions");
ck("banded circuit reps → 2 rep performances", ha.length === 2 && ha[0].volume.type === "reps");
ck("banded circuit uses its cell band tier (light)", ha[0].load.metric === "mini-loop" && ha[0].load.mag === "light");

const se = performancesOf("seated-elliptical");
ck("steady sessions → 2 performances (named routine + recovered empty one)", se.length === 2);
ck("steady performance = level 6, 32 min (1920s)", se[0].load.metric === "machine-level" && se[0].load.mag === 6 && se[0].volume.val === 32 * 60);
// an empty steady routine (no named activity) that logged a session is recovered onto the sole
// machine-level exercise, so no logged steady session is lost.
ck("empty steady routine recovered onto the sole machine activity (25 min, L7)",
  se.some((p) => p.volume.val === 25 * 60 && p.load.mag === 7));

// A full-size anchored band migrates to the long-band family, keying kg off the right table.
const fp = performancesOf("band-face-pulls");
ck("full-size anchored band → long-band family", state.library["band-face-pulls"].loadMetric === "long-band");
ck("long-band performance created (default tier light)", fp.length === 1 && fp[0].load.metric === "long-band" && fp[0].load.mag === "light");
ck("long-band e1RM uses the long-band table (light=20kg × 15)", (() => { const pr = prsOf("band-face-pulls"); return pr.topE1rm && Math.abs(pr.topE1rm.value - e1rm(20, 15)) < 1e-9; })());

// A timed hold (strength context, but no rep range) migrates as time/none, not reps/kg.
ck("timed hold (no rep range) → time volume, no load",
  state.library["wall-posture-holds"].volume === "time" && state.library["wall-posture-holds"].loadMetric === "none");

// Class occurrences became Attendances on a first-class ClassType (ADR-0030).
ck("class type catalogue exists", state.classes && state.classes["box-fit"]);
const att = state.classes["box-fit"].attendances;
ck("class logged → 1 attendance", att.length === 1);
ck("attendance carries mins/kcal/note", att[0].mins === 45 && att[0].kcal === 400 && att[0].note === "great session");
ck("attendance dated (Wed... routine 4 = 4 Jun)", att[0].date === "2026-06-04");

// Blocks converted to containers with a weekly template of Routines.
const t = state.blocks[0].template;
ck("block has a 7-day template", Array.isArray(t) && t.length === 7);
ck("strength routine → Session", t[0].kind === "session");
ck("strength → one lone-item Group per exercise (straight sets)", t[0].groups.length === 4 && t[0].groups[0].items.length === 1 && t[0].groups[0].rounds === 2);
ck("recovery routine → Session with one circuit Group", t[1].kind === "session" && t[1].groups.length === 1 && t[1].groups[0].items.length === 2 && t[1].groups[0].restWithin === 15);
ck("steady routine → Session with a one-round Group", t[2].kind === "session" && t[2].groups[0].rounds === 1);
ck("class routine → Class", t[3].kind === "class" && t[3].classType === "box-fit" && t[3].durationMin === 45);
ck("empty routine → Rest", t[4].kind === "rest");
ck("block is a plain container (no logged data on it)", t[0].groups[0].items[0].exId === "goblet-squats");

// Occurrence scalars: real data kept (re-keyed to the v6 cell grammar — routine 1 → position 0),
// UI/derivable flags dropped, measurements untouched infra.
ck("Session RPE kept, re-keyed to template position", state.log["b1.w1.d0.rpe"] === "8");
ck("done flag dropped (derivable)", state.log["b1.w1.d1.done"] === undefined && state.log["b1.w1.d0.done"] === undefined);
ck("collapsed flag dropped (UI state)", state.log["b1.w1.d1.collapsed"] === undefined && state.log["b1.w1.d0.collapsed"] === undefined);
ck("schedule key dropped (schedule dissolved)", state.log["b1.w1.sched"] === undefined);
ck("body measurement kept untouched", state.log["b1.w1.m.bodyweight"] === "70");
ck("no old effort keys remain", !Object.keys(state.log).some((k) => /\.ex\./.test(k)));
// Nutrition was removed at v4 (ADR-0018); a v6 migration must carry no trace of it.
ck("pantry dropped", state.pantry === undefined);
ck("nutrition log keys dropped (.food / .nut.)", !Object.keys(state.log).some((k) => k.endsWith(".food") || k.includes(".nut.")));

// Singletons: Holiday Session + freeform wind-down.
ck("holiday → Holiday Session (groups)", Array.isArray(state.holiday.groups) && state.holiday.groups.length === 1);
ck("wind-down → freeform habit (duration + weekly target, no list)", state.winddown.durationMin === 12 && state.winddown.weeklyTarget > 0 && state.winddown.exercises === undefined);

// PRs derived read-only from history (ADR-0020/0021/0022).
const pr = prsOf("goblet-squats");
ck("PR: top e1RM derived from history", pr && pr.kind === "reps" && pr.topE1rm && Math.abs(pr.topE1rm.value - e1rm(40, 10)) < 1e-9);
ck("PR: per-zone best present", pr.byZone && pr.byZone.hypertrophy);
const spr = prsOf("seated-elliptical");
ck("PR (time exercise): longest effort (32 min) + top level (7)", spr.kind === "time" && spr.longest.volume.val === 1920 && Number(spr.topLevel.load.mag) === 7);

// Deleting a block removes only the plan — performances + attendances survive (ADR-0020/0030).
state.blocks.push(newBlockTemplate("b2", "Block 2"));
deleteBlock("b1");
ck("block b1 removed", !state.blocks.some((b) => b.id === "b1"));
ck("exercise performances survive block deletion", performancesOf("goblet-squats").length === 2);
ck("class attendances survive block deletion", state.classes["box-fit"].attendances.length === 1);
ck("deleted block's log keys swept", !Object.keys(state.log).some((k) => k.indexOf("b1.") === 0));

console.log("\n" + (fail === 0 ? "PASS" : "FAIL") + ` (${pass} ok, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
