import { chromium } from "playwright";

const URL = process.env.WT_URL || "http://localhost:8765/";
const errors = [];
const checks = [];
const ck = (label, cond) => { checks.push([label, !!cond]); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const ls = () => page.evaluate(() => JSON.parse(localStorage.getItem("workout-tracker-v2")));
const recDay = async () => (await ls()).blocks[0].days.find((d) => d.day === 2);

const D2 = '[data-cell="b1.w1.d2"]';      // Recovery A — 5 moves
const note = `${D2} .circuit-note`;
const roundsOfFirstMove = () => page.$$eval(`${D2} .exercise.circuit:first-of-type .round`, (e) => e.length);

await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(120);

// ---- Defaults ----
ck("default: 2 round-checkboxes per move", (await roundsOfFirstMove()) === 2);
ck("default: no per-move duration meta", (await page.$$(`${D2} .ex-meta`)).length === 0);
ck("default summary = 2 rounds, 1 min, 15 sec, ~12 min",
  (await page.textContent(note)).trim() === "2 rounds · 1 min work · 15 sec rest · ≈ 12 min");

// ---- Edit controls present ----
await page.click("#edit-toggle");
ck("circuit-edit controls show in Edit", await page.$(`${D2} .circuit-edit`));
ck("rounds stepper shows 2", (await page.textContent(`${D2} .rounds-edit .sets-count`)).trim() === "2");
ck("work field = 60", (await page.inputValue(`${D2} .circuit-field[data-field="workSec"]`)) === "60");
ck("rest field = 15", (await page.inputValue(`${D2} .circuit-field[data-field="restSec"]`)) === "15");
ck("round-rest field = 0", (await page.inputValue(`${D2} .circuit-field[data-field="roundRestSec"]`)) === "0");

// ---- Rounds stepper: re-renders, checkbox count follows, total recomputes ----
await page.click(`${D2} [data-action="rounds-inc"]`);
await page.waitForTimeout(60);
ck("rounds-inc → 3 checkboxes per move", (await roundsOfFirstMove()) === 3);
ck("rounds-inc persisted (d.rounds=3)", (await recDay()).rounds === 3);
ck("summary recomputed to ~18 min (3×5×60 + 3×4×15)",
  (await page.textContent(note)).trim() === "3 rounds · 1 min work · 15 sec rest · ≈ 18 min");

// ---- Work seconds: live patch, focus preserved, total recomputes ----
await page.click(`${D2} .circuit-field[data-field="workSec"]`);
await page.fill(`${D2} .circuit-field[data-field="workSec"]`, "");
await page.type(`${D2} .circuit-field[data-field="workSec"]`, "30", { delay: 20 });
const focusKept = await page.evaluate(() => document.activeElement?.dataset?.field === "workSec");
ck("focus kept while typing work seconds", focusKept === true);
ck("work persisted (d.workSec=30)", (await recDay()).workSec === 30);
ck("summary live-updated (3×5×30 + 3×4×15 = 630s = 10 min 30 sec)",
  (await page.textContent(note)).trim() === "3 rounds · 30 sec work · 15 sec rest · ≈ 10 min 30 sec");

// ---- Between-rounds rest: shows in summary and adds (rounds-1)×roundRest ----
await page.fill(`${D2} .circuit-field[data-field="roundRestSec"]`, "30");
await page.waitForTimeout(50);
ck("round-rest persisted (d.roundRestSec=30)", (await recDay()).roundRestSec === 30);
ck("summary includes between-rounds rest, total = 690s = 11 min 30 sec",
  (await page.textContent(note)).trim() === "3 rounds · 30 sec work · 15 sec rest · 30 sec between rounds · ≈ 11 min 30 sec");

// ---- newBlock clone carries circuit settings ----
await page.click('[data-action="new-block"]'); // clones current block, selects new, enters edit
await page.waitForTimeout(60);
const cloned = (await ls()).blocks.find((b) => b.id !== "b1").days.find((d) => d.day === 2);
ck("cloned block's recovery day keeps rounds/work/round-rest",
  cloned.rounds === 3 && cloned.workSec === 30 && cloned.roundRestSec === 30);

// ---- Migration: old recovery day with no circuit fields backfills to defaults ----
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("workout-tracker-v2"));
  const d = s.blocks[0].days.find((x) => x.day === 2);
  delete d.rounds; delete d.workSec; delete d.restSec; delete d.roundRestSec;
  // Old-shape library: a circuit move still carrying retired per-move timing.
  s.library["high-knees"].duration = "1 min";
  s.library["high-knees"].rest = "15 sec";
  s.library["high-knees"].rounds = 2;
  localStorage.setItem("workout-tracker-v2", JSON.stringify(s));
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(120);
// ui.block may be the cloned one; force block b1 + week 1 to inspect day 2.
await page.selectOption("#block-select", "b1"); // also triggers a save (persists migration)
await page.waitForTimeout(80);
ck("migration: backfilled day renders 2 checkboxes (in-memory)", (await roundsOfFirstMove()) === 2);
ck("migration: summary back to default ~12 min",
  (await page.textContent(note)).trim() === "2 rounds · 1 min work · 15 sec rest · ≈ 12 min");
const hk = (await ls()).library["high-knees"];
ck("migration: retired per-move fields stripped from library after save",
  !("duration" in hk) && !("rest" in hk) && !("rounds" in hk));

await browser.close();
const failed = checks.filter(([, ok]) => !ok);
if (errors.length) console.log("\nERRORS:\n" + errors.join("\n"));
console.log("\n" + (failed.length === 0 && errors.length === 0 ? "PASS" : "FAIL (" + failed.length + " checks, " + errors.length + " errors)"));
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
