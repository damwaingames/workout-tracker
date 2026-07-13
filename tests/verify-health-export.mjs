/* Health Connect export adapter (pure): mealRecord / routineMealRecords / allNutritionRecords
 * derive one NutritionRecord payload per logged (day, meal) — a stable cell+meal clientId (so
 * re-syncing a meal upserts rather than duplicates), the routine's scheduled calendar date, the
 * `meal` tag the companion maps to a native MealType, and the meal's derived {kcal,carb,fat,
 * protein} at full precision (only float noise trimmed). Pure functions of the Store (no DOM),
 * so unlike the browser verify-*.mjs this runs straight in Node: seed a fixed-date Store, assert
 * the emitted records. See ADR-0017 (per-meal, amending 0016's per-day record). */

import { setState, state } from "../state.js";
import { mealRecord, routineMealRecords, allNutritionRecords } from "../health.js";
import { scheduleKey } from "../helpers.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { cond ? pass++ : fail++; console.log((cond ? "ok  " : "FAIL") + "  " + label); };

// A minimal Store: one block starting Mon 2026-07-13 with three routines (ids 1,2,3). Only the
// fields the builder reads (block id / startDate / routines[].routine) — no seed machinery, so
// the dates are fixed and the assertions deterministic.
const block = { id: "b1", name: "T", startDate: "2026-07-13", routines: [{ routine: 1 }, { routine: 2 }, { routine: 3 }] };
setState({ blocks: [block], log: {} });

const food = (cell, entries) => { state.log[cell + ".food"] = entries; };
// w1 d1: two breakfast entries (must sum; kcal 100.1+50.2 exercises the float-noise trim, raw
// 150.29999…) + one lunch entry — so the day emits TWO records, one per meal.
food("b1.w1.d1", [
  { kcal: 100.1, carb: 10, fat: 5, protein: 8, meal: "breakfast" },
  { kcal: 50.2, carb: 5, fat: 1, protein: 2, meal: "breakfast" },
  { kcal: 300, carb: 30, fat: 10, protein: 20, meal: "lunch" },
]);
// w1 d2: a legacy/mealless entry — must fall back to the first meal (breakfast) via mealOf.
food("b1.w1.d2", [{ kcal: 111, carb: 1, fat: 1, protein: 1 }]);
// w2 d3: one dinner entry with fractional values — precision kept.
food("b1.w2.d3", [{ kcal: 200.4, carb: 20.6, fat: 9.5, protein: 30.5, meal: "dinner" }]);

const recs = allNutritionRecords();
const byId = Object.fromEntries(recs.map((r) => [r.clientId, r]));

// ---- One record per logged meal; empty meals + empty days drop out ----
ck("four logged meals → four records", recs.length === 4);
ck("clientId is cell + meal (d1 breakfast)", !!byId["b1.w1.d1.breakfast"]);
ck("clientId is cell + meal (d1 lunch)", !!byId["b1.w1.d1.lunch"]);
ck("clientId is cell + meal (d3 dinner)", !!byId["b1.w2.d3.dinner"]);
ck("each record carries its meal tag", byId["b1.w1.d1.lunch"].meal === "lunch" && byId["b1.w2.d3.dinner"].meal === "dinner");
ck("an unlogged meal emits nothing", mealRecord(block, 1, 1, "dinner") === null);
ck("an unlogged day emits nothing", routineMealRecords(block, 1, 3).length === 0);

// ---- Same-meal entries sum into one record; the summed kcal has its float noise trimmed ----
const bfast = byId["b1.w1.d1.breakfast"];
ck("breakfast entries sum (kcal 100.1+50.2 → 150.3, noise trimmed)",
  bfast.kcal === 150.3 && bfast.carb === 15 && bfast.fat === 6 && bfast.protein === 10);
ck("lunch is its own record (kcal 300)", byId["b1.w1.d1.lunch"].kcal === 300);

// ---- A mealless/legacy entry lands under the default meal (breakfast) ----
const legacy = byId["b1.w1.d2.breakfast"];
ck("mealless entry → breakfast record", !!legacy && legacy.meal === "breakfast" && legacy.kcal === 111);

// ---- Date = block start + week offset + schedule position (identity order here) ----
ck("d1 date is the block-start Monday", bfast.date === "2026-07-13");
ck("d3 date is +1 week +2 positions", byId["b1.w2.d3.dinner"].date === "2026-07-22");

// ---- Fractional totals keep their precision (only float noise trimmed) ----
const dnr = byId["b1.w2.d3.dinner"];
ck("kcal precision kept (200.4)", dnr.kcal === 200.4);
ck("carb precision kept (20.6)", dnr.carb === 20.6);
ck("fat precision kept (9.5)", dnr.fat === 9.5);
ck("protein precision kept (30.5)", dnr.protein === 30.5);

// ---- The record's date follows the per-week schedule reorder (ADR-0005), not the routine id.
// Reorder week 1 to [3,1,2]: routine 1 is now at position 1, so its logged day shifts +1 day,
// while its clientId (cell + meal) is unchanged — the upsert stays stable across a reorder. ----
state.log[scheduleKey("b1", 1)] = [3, 1, 2];
const reordered = mealRecord(block, 1, 1, "breakfast");
ck("reorder shifts the date", reordered.date === "2026-07-14");
ck("reorder leaves the clientId stable", reordered.clientId === "b1.w1.d1.breakfast");

console.log("\n" + (fail === 0 ? "PASS" : `FAIL (${fail} checks)`));
process.exit(fail === 0 ? 0 : 1);
