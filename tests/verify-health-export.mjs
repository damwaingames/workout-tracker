/* Health Connect export adapter (pure): nutritionRecord / allNutritionRecords derive a per-day
 * NutritionRecord payload — a stable cell-key clientId (so re-syncing a day upserts rather than
 * duplicates), the routine's scheduled calendar date, and the day's derived {kcal,carb,fat,
 * protein} at full precision (only float noise trimmed) — for the future native Health Connect
 * write. It's a pure function of the Store (no DOM), so unlike the browser verify-*.mjs this
 * runs straight in Node: seed a fixed-date Store, assert the emitted records. See the
 * health-connect-backlog spike for why the write half is native and out of scope here. */

import { setState, state } from "../state.js";
import { nutritionRecord, allNutritionRecords } from "../health.js";
import { scheduleKey } from "../helpers.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { cond ? pass++ : fail++; console.log((cond ? "ok  " : "FAIL") + "  " + label); };

// A minimal Store: one block starting Mon 2026-07-13 with three routines (ids 1,2,3). Only the
// fields the builder reads (block id / startDate / routines[].routine) — no seed machinery, so
// the dates are fixed and the assertions deterministic (defaultState()'s startDate tracks today).
const block = { id: "b1", name: "T", startDate: "2026-07-13", routines: [{ routine: 1 }, { routine: 2 }, { routine: 3 }] };
setState({ blocks: [block], log: {} });

const food = (cell, entries) => { state.log[cell + ".food"] = entries; };
// Two quick entries on Mon (w1 d1) — must sum, and the kcal (100.1 + 50.2) exercises the float-
// noise trim (raw float is 150.29999…); one on w2 d3 with fractional values — precision kept.
food("b1.w1.d1", [
  { kcal: 100.1, carb: 10, fat: 5, protein: 8 },
  { kcal: 50.2, carb: 5, fat: 1, protein: 2 },
]);
food("b1.w2.d3", [{ kcal: 200.4, carb: 20.6, fat: 9.5, protein: 30.5 }]);

const recs = allNutritionRecords();
const byId = Object.fromEntries(recs.map((r) => [r.clientId, r]));

// ---- Only logged days emit a record; empty days are dropped ----
ck("two logged days → two records", recs.length === 2);
ck("clientId is the cell key (w1 d1)", !!byId["b1.w1.d1"]);
ck("clientId is the cell key (w2 d3)", !!byId["b1.w2.d3"]);
ck("an empty day emits nothing", nutritionRecord(block, 1, 2) === null);

// ---- Same-day entries sum into one record; the summed kcal has its float noise trimmed ----
const mon = byId["b1.w1.d1"];
ck("same-day entries sum (kcal 100.1+50.2 → 150.3, noise trimmed)", mon.kcal === 150.3 && mon.carb === 15 && mon.fat === 6 && mon.protein === 10);

// ---- Date = block start + week offset + schedule position (identity order here) ----
ck("w1 d1 date is the block-start Monday", mon.date === "2026-07-13");
ck("w2 d3 date is +1 week +2 positions", byId["b1.w2.d3"].date === "2026-07-22");

// ---- Fractional totals keep their precision (only float noise trimmed) — not flattened to
// whole numbers; Health Connect stores Doubles and does its own display rounding ----
const d3 = byId["b1.w2.d3"];
ck("kcal precision kept (200.4)", d3.kcal === 200.4);
ck("carb precision kept (20.6)", d3.carb === 20.6);
ck("fat precision kept (9.5)", d3.fat === 9.5);
ck("protein precision kept (30.5)", d3.protein === 30.5);

// ---- The record's date follows the per-week schedule reorder (ADR-0005), not the routine id.
// Reorder week 1 to [3,1,2]: routine 1 is now at position 1, so its logged day shifts +1 day,
// while its clientId (the cell key) is unchanged — the upsert stays stable across a reorder. ----
state.log[scheduleKey("b1", 1)] = [3, 1, 2];
const reordered = nutritionRecord(block, 1, 1);
ck("reorder shifts the date", reordered.date === "2026-07-14");
ck("reorder leaves the clientId stable", reordered.clientId === "b1.w1.d1");

console.log("\n" + (fail === 0 ? "PASS" : `FAIL (${fail} checks)`));
process.exit(fail === 0 ? 0 : 1);
