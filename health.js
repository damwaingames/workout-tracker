/* Nutrition projection builder — reshapes the logged nutrition into the per-meal records the app
 * PUBLISHES one-way to Android Health Connect via a stateless companion (ADR-0015/0016; the write
 * itself is native — see the health-connect-backlog spike). NOT an Export (that's the whole
 * round-trippable Store blob): a projection is a derived, lossy, one-way view. A leaf like
 * io.js / drive.js — it holds the *integration format* (the record shape, the clientRecordId
 * upsert contract) and imports the store queries it needs, so state.js never has to know what a
 * Health Connect NutritionRecord looks like. The Publish button (renderNutrition) hands
 * allNutritionRecords() to the Android share sheet via shareNutrition(); the stateless companion
 * is that sheet's ACTION_SEND target and does the native write. */

import { ALL_WEEKS, NUTRIENTS, MEALS } from "./constants.js";
import { cellKey, foodKey, mealOf, scheduledDate, fmtYMD } from "./helpers.js";
import { state, mealNutrition, weekSchedule, logList } from "./state.js";

// Cap IEEE-754 float noise (0.1+0.2…) at one decimal without rounding the value away — Health
// Connect stores energy/macros as Doubles and does its own display rounding, so the export
// keeps the precision the app has rather than flattening to whole numbers at the boundary.
const round1 = (v) => Math.round(v * 10) / 10;

// A single logged (day, meal) as a Health Connect NutritionRecord payload, or null when that
// meal logged no food that day. `clientId` is the cell key + meal — a *stable* per-day-per-meal
// id, so re-syncing UPSERTS the meal's record instead of duplicating it (Health Connect keys
// upserts on clientRecordId; the native side supplies clientRecordVersion = write time). `meal`
// is the projection tag the companion maps to a native MealType, so the food lands in the right
// meal in Google Health — a record carrying neither a meal type nor a name is stored but never
// shown (ADR-0017, amending 0016's per-day record). `date` is the routine's calendar day (block
// start + week offset + its position in that week's schedule — ADR-0005, so a reorder moves the
// date, never the id). The nutrients are the meal's derived totals at full precision (only float
// noise trimmed), built from NUTRIENTS so the nutrient set keeps its one home.
export function mealRecord(block, wk, routine, meal) {
  const cell = cellKey(block.id, wk, routine);
  if (!logList(foodKey(cell)).some((e) => mealOf(e) === meal)) return null; // no food this meal
  const n = mealNutrition(cell, meal);
  const position = weekSchedule(block, wk).indexOf(routine);
  const nutrients = Object.fromEntries(NUTRIENTS.map((x) => [x.id, round1(n[x.id])]));
  return { clientId: cell + "." + meal, date: fmtYMD(scheduledDate(block.startDate, wk, position)), meal, ...nutrients };
}

// Every logged meal on a routine's day, in day order — the per-record unit a future write-on-log
// path re-emits for a single edited day; empty meals drop out.
export function routineMealRecords(block, wk, routine) {
  return MEALS.map((m) => mealRecord(block, wk, routine, m.id)).filter(Boolean);
}

// Every logged meal across every block as NutritionRecord payloads — the block × week × routine
// × meal walk with empty meals dropped, for a full Health Connect backfill/export.
export function allNutritionRecords() {
  const out = [];
  state.blocks.forEach((block) => {
    ALL_WEEKS.forEach((wk) => {
      block.routines.forEach((r) => { out.push(...routineMealRecords(block, wk, r.routine)); });
    });
  });
  return out;
}

// True when this browser can share at all (Web Share API) — Chrome/Android can. It's the only place
// the Publish button appears, like scanSupported gates the camera button (ADR-0003).
export function nutritionShareSupported() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// Publish the nutrition projection: hand it to the Android share sheet, where the companion app
// (its ACTION_SEND text/plain target) receives and writes it (ADR-0015). Shared as TEXT, not a
// file: Chrome's Web Share blocks a file whose MIME isn't on its allowlist (application/json is
// not — it rejects with NotAllowedError "Permission denied"), whereas text always shares; the
// companion reads it from the intent's EXTRA_TEXT. Nothing-to-publish is surfaced rather than
// sharing empty; a dismissed sheet (AbortError) is the user's choice, so stay silent; only a real
// failure alerts.
export async function shareNutrition() {
  const records = allNutritionRecords();
  if (!records.length) {
    window.alert("No nutrition logged yet — log some food first, then publish.");
    return;
  }
  try {
    await navigator.share({ text: JSON.stringify(records), title: "Nutrition" });
  } catch (e) {
    if (e && e.name === "AbortError") return; // the user dismissed the share sheet
    window.alert("Couldn't share your nutrition: " + (e && e.message ? e.message : e));
  }
}
