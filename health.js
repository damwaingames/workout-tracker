/* Nutrition projection builder — reshapes the logged nutrition into the per-day records the app
 * PUBLISHES one-way to Android Health Connect via a stateless companion (ADR-0015/0016; the write
 * itself is native — see the health-connect-backlog spike). NOT an Export (that's the whole
 * round-trippable Store blob): a projection is a derived, lossy, one-way view. A leaf like
 * io.js / drive.js — it holds the *integration format* (the record shape, the clientRecordId
 * upsert contract) and imports the store queries it needs, so state.js never has to know what a
 * Health Connect NutritionRecord looks like. The Publish button (renderNutrition) hands
 * allNutritionRecords() to the Android share sheet via shareNutrition(); the stateless companion
 * is that sheet's ACTION_SEND target and does the native write. */

import { ALL_WEEKS, NUTRIENTS } from "./constants.js";
import { cellKey, foodKey, scheduledDate, fmtYMD } from "./helpers.js";
import { state, routineNutrition, weekSchedule, logList } from "./state.js";

// Cap IEEE-754 float noise (0.1+0.2…) at one decimal without rounding the value away — Health
// Connect stores energy/macros as Doubles and does its own display rounding, so the export
// keeps the precision the app has rather than flattening to whole numbers at the boundary.
const round1 = (v) => Math.round(v * 10) / 10;

// A single logged day as a Health Connect NutritionRecord payload, or null when that day logged
// no food. `clientId` is the cell key — a *stable* per-day id, so re-syncing a day UPSERTS its
// record instead of duplicating it (Health Connect keys upserts on clientRecordId; the native
// side supplies clientRecordVersion = write time). `date` is the routine's calendar day (block
// start + week offset + its position in that week's schedule — ADR-0005, so a reorder moves the
// date, never the cell key). The nutrients are the day's derived totals at full precision (only
// float noise trimmed), built from NUTRIENTS so the nutrient set keeps its one home.
export function nutritionRecord(block, wk, routine) {
  const cell = cellKey(block.id, wk, routine);
  if (!logList(foodKey(cell)).length) return null; // no logged food → no record for the day
  const n = routineNutrition(cell);
  const position = weekSchedule(block, wk).indexOf(routine);
  const nutrients = Object.fromEntries(NUTRIENTS.map((x) => [x.id, round1(n[x.id])]));
  return { clientId: cell, date: fmtYMD(scheduledDate(block.startDate, wk, position)), ...nutrients };
}

// Every logged day across every block as NutritionRecord payloads — the block × week × routine
// walk with empty days dropped, for a full Health Connect backfill/export. The per-day unit
// (nutritionRecord) is what a future write-on-log path re-emits for a single edited day; this is
// the initial scan over that same builder.
export function allNutritionRecords() {
  const out = [];
  state.blocks.forEach((block) => {
    ALL_WEEKS.forEach((wk) => {
      block.routines.forEach((r) => {
        const rec = nutritionRecord(block, wk, r.routine);
        if (rec) out.push(rec);
      });
    });
  });
  return out;
}

// True when this browser can share files (Web Share API, Level 2) — Chrome/Android does. It's the
// only place the Publish button appears, like scanSupported gates the camera button (ADR-0003);
// guarded so a browser without navigator.canShare simply omits the button rather than erroring.
export function nutritionShareSupported() {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [new File([""], "n.json", { type: "application/json" })] });
  } catch {
    return false;
  }
}

// Publish the nutrition projection: hand it to the Android share sheet as a JSON file, where the
// companion app (its ACTION_SEND target) receives and writes it (ADR-0015). application/json keeps
// the sheet to the companion, not every chat app. Nothing-to-publish is surfaced rather than
// sharing an empty file; a dismissed sheet (AbortError) is the user's choice, so stay silent; only
// a real failure alerts.
export async function shareNutrition() {
  const records = allNutritionRecords();
  if (!records.length) {
    window.alert("No nutrition logged yet — log some food first, then publish.");
    return;
  }
  const file = new File([JSON.stringify(records)], "nutrition-projection.json", { type: "application/json" });
  try {
    await navigator.share({ files: [file], title: "Nutrition" });
  } catch (e) {
    if (e && e.name === "AbortError") return; // the user dismissed the share sheet
    window.alert("Couldn't share your nutrition: " + (e && e.message ? e.message : e));
  }
}
