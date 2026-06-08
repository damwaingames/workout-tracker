import { verify } from "./harness.mjs";

/* Banded moves: seed flags, the per-session band picker (logged), reps-only
 * strength sets and per-round circuit reps, tonnage on BOTH day kinds (band kg ×
 * reps), the edit-mode Banded toggle, and the backfill migration. */
verify(async ({ page, ck, ls, reset, key }) => {
  const D1 = '[data-cell="b1.w1.d1"]'; // Workout A — has banded-clamshells (strength)
  const D4 = '[data-cell="b1.w1.d4"]'; // Recovery B — has banded-hip-abductions (circuit)
  const ex = (cell, id) => `${cell} .exercise[data-ex="${id}"]`;
  const lib = async () => (await ls()).library;
  const dayVol = (cell) => page.textContent(`${cell} [data-vol-cell]`);
  const CLAM = ex(D1, "banded-clamshells");
  const HIP = ex(D4, "banded-hip-abductions");

  await reset();
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op click → persists the seed
  await page.waitForTimeout(60);

  // ---- Seed flags ----
  const L = await lib();
  ck("seed: banded-clamshells banded + per-side + default light",
    L["banded-clamshells"].banded === true && L["banded-clamshells"].loadMode === "per-side" && L["banded-clamshells"].defaultBand === "light");
  ck("seed: banded-hip-abductions banded + medium, NOT per-side (both legs together)",
    L["banded-hip-abductions"].banded === true && L["banded-hip-abductions"].defaultBand === "medium" && L["banded-hip-abductions"].loadMode == null);
  // New library additions carry their corrected metadata.
  ck("seed: single-leg-rdls present + per-side", !!L["single-leg-rdls"] && L["single-leg-rdls"].loadMode === "per-side");
  ck("seed: banded-fire-hydrants banded + per-side + heavy",
    L["banded-fire-hydrants"].banded === true && L["banded-fire-hydrants"].loadMode === "per-side" && L["banded-fire-hydrants"].defaultBand === "heavy");
  ck("seed: single-arm-concentrated-rows targetReps says 'each arm'", /each arm/.test(L["single-arm-concentrated-rows"].targetReps));
  ck("seed: setups carry no specific kg (cyclist-squats)", !/\d\s?kg/.test(L["cyclist-squats"].setup));

  // ---- Strength banded UI: band picker + reps-only sets, no weight input ----
  ck("strength banded: band picker present, defaults to light",
    (await page.inputValue(`${CLAM} select.band-pick`)) === "light");
  ck("strength banded: reps-only sets (no weight input)", (await page.$$(`${CLAM} .set .w`)).length === 0);
  ck("strength banded: 2 reps inputs (default sets)", (await page.$$(`${CLAM} .set .r`)).length === 2);
  ck("strength banded per-side: reps unit shows /side",
    (await page.textContent(`${CLAM} .set:first-child .unit`)).trim() === "reps/side");

  // ---- Strength banded tonnage: per-side doubles reps → light (5kg) × 22 × 2 = 220 ----
  await page.fill(`${CLAM} .set:nth-child(1) .r`, "10");
  await page.fill(`${CLAM} .set:nth-child(2) .r`, "12");
  ck("strength banded per-side: 5kg × 22 × 2 = 220 kg", (await dayVol(D1)).trim() === "220 kg");
  await page.selectOption(`${CLAM} select.band-pick`, "medium");          // 8 kg
  await page.waitForTimeout(60);
  ck("strength banded per-side: band → medium = 8kg × 22 × 2 = 352 kg", (await dayVol(D1)).trim() === "352 kg");
  ck("band choice logged per session", (await ls()).log["b1.w1.d1.ex.banded-clamshells.band"] === "medium");

  // ---- Banded moves track previous-week reps (placeholder + Last line) ----
  // Week 1 logged clamshells 10 / 12 above; week 2 should ghost those reps and show
  // the "Last:" summary — banded sets log a reps field, so previousSets finds them.
  await page.click('[data-action="week"][data-week="2"]');
  await page.waitForTimeout(60);
  const CLAM2 = ex('[data-cell="b1.w2.d1"]', "banded-clamshells"); // same move, week 2's cell
  ck("banded set1 reps placeholder = last week (10)", (await page.getAttribute(`${CLAM2} .set:nth-child(1) .r`, "placeholder")) === "10");
  ck("banded set2 reps placeholder = last week (12)", (await page.getAttribute(`${CLAM2} .set:nth-child(2) .r`, "placeholder")) === "12");
  ck("banded Last line shows previous reps", /Last:\s*10,\s*12/.test(await page.textContent(`${CLAM2} .last`)));
  await page.click('[data-action="week"][data-week="1"]'); // back to week 1 for the rest
  await page.waitForTimeout(60);

  // ---- Circuit banded UI: band picker + per-round reps, day-volume line appears ----
  ck("circuit banded: band picker defaults to medium",
    (await page.inputValue(`${HIP} select.band-pick`)) === "medium");
  ck("circuit banded: per-round reps inputs (2 rounds)", (await page.$$(`${HIP} .round-rep`)).length === 2);
  ck("circuit banded: no completion checkbox for this move", (await page.$$(`${HIP} input[type="checkbox"]`)).length === 0);
  ck("non-banded circuit move still has checkboxes",
    (await page.$$(`${ex(D4, "hollow-body-holds")} input[type="checkbox"]`)).length === 2);

  // ---- Circuit banded tonnage: medium (8kg) × (12+10) reps = 176 ----
  await page.fill(`${HIP} .rounds.reps .round:nth-child(1) .round-rep`, "12");
  await page.fill(`${HIP} .rounds.reps .round:nth-child(2) .round-rep`, "10");
  ck("circuit banded: recovery day now carries tonnage = 176 kg", (await dayVol(D4)).trim() === "176 kg");

  // ---- Week/block totals fold in both band days (clamshells 352 + hip-abd 176) ----
  const vol = await page.textContent("#volume");
  ck("week + block totals include circuit bands (528)",
    vol.includes("528 kg") && vol.indexOf("528 kg") !== vol.lastIndexOf("528 kg"));

  // ---- Edit mode: toggle a plain exercise into banded ----
  await page.click("#edit-toggle");
  ck("edit: clamshells Banded toggle is checked", await page.isChecked(`${CLAM} .banded-toggle`));
  ck("edit: banded move shows a Tonnage picker set to per-side",
    (await page.inputValue(`${CLAM} select.load-mode`)) === "per-side");
  ck("edit: banded Tonnage picker hides two-dumbbell (2 options)",
    (await page.$$(`${CLAM} select.load-mode option`)).length === 2);
  await page.check(`${ex(D1, "goblet-squats")} .banded-toggle`);
  await page.waitForTimeout(60);
  const L2 = await lib();
  ck("toggling on sets banded + a default band", L2["goblet-squats"].banded === true && L2["goblet-squats"].defaultBand === "medium");
  ck("toggled exercise now shows a band picker", await page.$(`${ex(D1, "goblet-squats")} select.band-pick`));
  await page.uncheck(`${ex(D1, "goblet-squats")} .banded-toggle`);
  await page.waitForTimeout(60);
  ck("toggling off stores banded:false (not deleted)", (await lib())["goblet-squats"].banded === false);

  // ---- Un-banding a SEEDED move must survive a reload: it's stored false (not
  //      deleted), else the backfill migration would re-band it behind the user. ----
  await page.uncheck(`${CLAM} .banded-toggle`);
  await page.waitForTimeout(60);
  ck("un-band seeded move stores false", (await lib())["banded-clamshells"].banded === false);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("after reload, seeded move stays un-banded (no band picker)", (await page.$(`${CLAM} select.band-pick`)) === null);
  ck("after reload, seeded move shows weight inputs again", (await page.$$(`${CLAM} .set .w`)).length > 0);

  // ---- Backfill migration: a legacy save (no banded flags, missing a newer
  //      exercise) re-derives the flags and re-adds the exercise. ----
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    Object.values(s.library).forEach((e) => { delete e.banded; delete e.defaultBand; });
    delete s.library["single-leg-rdls"]; // simulate a save predating this exercise
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("migration: clamshells re-derives banded (band picker back)", await page.$(`${CLAM} select.band-pick`));
  ck("migration: hip-abductions re-derives banded (per-round reps back)", (await page.$$(`${HIP} .round-rep`)).length === 2);
  await page.click('[data-action="week"][data-week="1"]'); // persist the migrated state, then read it back
  await page.waitForTimeout(60);
  ck("migration: missing seed exercise re-added to library", !!(await lib())["single-leg-rdls"]);
});
