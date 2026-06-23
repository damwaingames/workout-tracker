import { verify } from "./harness.mjs";

// ADR-0008: per-week counts. A strength exercise's set count and a recovery routine's round
// count are a block-wide template + an optional per-cell override. The stepper writes this
// week's override; "all weeks" writes the template and clears overrides; lowering a count
// hides surplus rows/rounds without destroying their logged data.
verify(async ({ page, ck, ls, reset }) => {
  await reset();

  const backup = {
    version: 3,
    library: { "test-lift": { id: "test-lift", name: "Test Lift", contexts: ["strength"], targetReps: "8–12" } },
    blocks: [{ id: "b1", name: "B1", createdAt: "2026-06-01", startDate: "2026-06-01", routines: [
      { routine: 1, kind: "strength", title: "Lift", focus: "x", exercises: [{ id: "test-lift", sets: 2 }] },
      { routine: 2, kind: "recovery", title: "Circuit", focus: "x", rounds: 2, workSec: 60, restSec: 15, roundRestSec: 0, exercises: [{ id: "high-knees" }] },
      { routine: 7, kind: "rest", title: "Rest", focus: "x", exercises: [] },
    ] }],
    log: {}, ui: { block: "b1", week: 1 }, notes: "",
  };
  await page.setInputFiles("#import-input", {
    name: "pw.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForTimeout(80);
  await page.click("#edit-toggle");

  const D1 = '[data-cell="b1.w1.d1"]', D1w2 = '[data-cell="b1.w2.d1"]';
  const rows = (D) => page.$$eval(`${D} .sets .set`, (e) => e.length);
  const rounds = (D) => page.$$eval(`${D} .rounds .round`, (e) => e.length);
  const wk = async (n) => { await page.click(`[data-action="week"][data-week="${n}"]`); await page.waitForTimeout(40); };
  const log = async (k) => (await ls()).log[k];

  // --- per-week set override: week 1 diverges, week 2 stays on the template ---
  ck("week 1 starts at the template (2 set rows)", (await rows(D1)) === 2);
  await page.click(`${D1} [data-action="sets-inc"]`); await page.waitForTimeout(40);
  ck("stepper bumped week 1 to 3 rows", (await rows(D1)) === 3);
  ck("override stored on the week-1 cell", String(await log("b1.w1.d1.ex.test-lift.sets")) === "3");
  await wk(2);
  ck("week 2 untouched — still 2 rows (template)", (await rows(D1w2)) === 2);
  ck("no override key on week 2", !(await log("b1.w2.d1.ex.test-lift.sets")));

  // --- non-destructive: log into set 3, drop to 2, the set-3 data survives ---
  await wk(1);
  await page.fill(`${D1} input[data-k="b1.w1.d1.ex.test-lift.s2.w"]`, "20"); await page.waitForTimeout(40);
  ck("set-3 weight logged", (await log("b1.w1.d1.ex.test-lift.s2.w")) === "20");
  await page.click(`${D1} [data-action="sets-dec"]`); await page.waitForTimeout(40); // 3 → 2 (== template)
  ck("week 1 back to 2 rows", (await rows(D1)) === 2);
  ck("stepping back to the template clears the override", !(await log("b1.w1.d1.ex.test-lift.sets")));
  ck("dropped set-3 data is NOT destroyed", (await log("b1.w1.d1.ex.test-lift.s2.w")) === "20");

  // --- apply to all weeks: bump week 1, propagate to the template, clear overrides ---
  await page.click(`${D1} [data-action="sets-inc"]`); await page.waitForTimeout(40); // override 3
  await page.click(`${D1} [data-action="sets-all"]`); await page.waitForTimeout(40);
  const s = await ls();
  ck("apply-all wrote the template (sets=3)", s.blocks[0].routines.find((r) => r.routine === 1).exercises[0].sets === 3);
  ck("apply-all cleared the week-1 override", !s.log["b1.w1.d1.ex.test-lift.sets"]);
  await wk(2);
  ck("week 2 now follows the new template (3 rows)", (await rows(D1w2)) === 3);

  // --- recovery rounds are per-week too ---
  await wk(1);
  const D2 = '[data-cell="b1.w1.d2"]';
  ck("week 1 recovery starts at 2 rounds", (await rounds(D2)) === 2);
  await page.click(`${D2} [data-action="rounds-inc"]`); await page.waitForTimeout(40);
  ck("week 1 recovery bumped to 3 rounds", (await rounds(D2)) === 3);
  ck("round override stored on the week-1 cell", String(await log("b1.w1.d2.rounds")) === "3");
  await wk(2);
  ck("week 2 recovery still at the template (2 rounds)", (await rounds('[data-cell="b1.w2.d2"]')) === 2);
});
