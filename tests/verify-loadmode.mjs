import { verify } from "./harness.mjs";

/* Per-exercise loading mode: seed classification, the per-mode input labels, the
 * tonnage multipliers (per-side doubles reps, two-dumbbell doubles weight), the
 * edit-mode picker, and the backfill migration for legacy saves. */
verify(async ({ page, ck, ls, reset, key }) => {
  const D1 = '[data-cell="b1.w1.d1"]'; // Workout A: goblet-squats, bent-over-rows, …
  const D5 = '[data-cell="b1.w1.d5"]'; // Workout C: …, donkey-kicks (per-side), …
  const ex = (cell, id) => `${cell} .exercise[data-ex="${id}"]`;
  const lib = async () => (await ls()).library;
  const units = (sel) => page.$$eval(`${sel} .set:first-child .unit`, (els) => els.map((e) => e.textContent));
  const dayVol = (cell) => page.textContent(`${cell} [data-vol-cell]`);
  const fill = async (cell, id, w, r) => {
    await page.fill(`${ex(cell, id)} .set:first-child .w`, w);
    await page.fill(`${ex(cell, id)} .set:first-child .r`, r);
  };

  await reset();
  await page.waitForTimeout(120);
  // A fresh load seeds state but only persists on the first interaction; click
  // week 1 (a no-op that saves) so the seeded library is readable from storage.
  await page.click('[data-action="week"][data-week="1"]');
  await page.waitForTimeout(60);

  // ---- Seed classification ----
  const L = await lib();
  ck("seed: bent-over-rows = two-dumbbell", L["bent-over-rows"].loadMode === "two-dumbbell");
  ck("seed: donkey-kicks = per-side", L["donkey-kicks"].loadMode === "per-side");
  ck("seed: goblet-squats has no mode (= standard)", L["goblet-squats"].loadMode == null);

  // ---- Per-mode input labels ----
  ck("two-dumbbell weight unit = kg/db",
    JSON.stringify(await units(ex(D1, "bent-over-rows"))) === JSON.stringify(["kg/db"]));
  ck("standard = single kg unit, no reps unit",
    JSON.stringify(await units(ex(D1, "goblet-squats"))) === JSON.stringify(["kg"]));
  ck("per-side = kg weight unit + /side reps unit",
    JSON.stringify(await units(ex(D5, "donkey-kicks"))) === JSON.stringify(["kg", "/side"]));

  // ---- Tonnage maths ----
  await fill(D1, "goblet-squats", "10", "10");   // standard → 10×10 = 100
  ck("standard 10×10 = 100 kg", (await dayVol(D1)).trim() === "100 kg");
  await fill(D1, "bent-over-rows", "10", "10");   // two-dumbbell → (10×2)×10 = 200
  ck("two-dumbbell 10×10 adds 200 → day = 300 kg", (await dayVol(D1)).trim() === "300 kg");
  await fill(D5, "donkey-kicks", "5", "10");      // per-side → 5×(10×2) = 100
  ck("per-side 5×10 = 100 kg (reps doubled)", (await dayVol(D5)).trim() === "100 kg");

  // ---- Edit-mode picker: re-classify, tonnage + label follow ----
  await page.click("#edit-toggle");
  const sel = `${ex(D1, "goblet-squats")} select.load-mode`;
  ck("edit: picker defaults to standard", (await page.inputValue(sel)) === "standard");
  await page.selectOption(sel, "two-dumbbell");
  await page.waitForTimeout(60);
  ck("change persisted on library record", (await lib())["goblet-squats"].loadMode === "two-dumbbell");
  ck("goblet now doubles weight → 200 + 200 = 400 kg", (await dayVol(D1)).trim() === "400 kg");
  ck("goblet weight unit relabelled to kg/db",
    JSON.stringify(await units(ex(D1, "goblet-squats"))) === JSON.stringify(["kg/db"]));

  // ---- Backfill migration: a legacy save with no modes gets the seed defaults ----
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    Object.values(s.library).forEach((e) => delete e.loadMode);
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("migration: legacy bent-over-rows relabelled kg/db",
    JSON.stringify(await units(ex(D1, "bent-over-rows"))) === JSON.stringify(["kg/db"]));
  ck("migration: legacy donkey-kicks relabelled /side",
    JSON.stringify(await units(ex(D5, "donkey-kicks"))) === JSON.stringify(["kg", "/side"]));
});
