/* Health Connect export adapter — turns the logged nutrition into per-day records the native
 * companion app writes to Android Health Connect (the write itself is native; see the
 * health-connect-backlog spike). A leaf like io.js / drive.js: it holds the *integration
 * format* (the record shape, the clientRecordId upsert contract) and imports the store queries
 * it needs, so state.js never has to know what a Health Connect NutritionRecord looks like.
 * Nothing in the app calls this yet — it's the export half, staged ahead of the native write. */

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
