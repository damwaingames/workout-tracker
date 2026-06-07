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
  ck("seed: banded-clamshells banded + default light",
    L["banded-clamshells"].banded === true && L["banded-clamshells"].defaultBand === "light");
  ck("seed: banded-hip-abductions banded + default medium",
    L["banded-hip-abductions"].banded === true && L["banded-hip-abductions"].defaultBand === "medium");

  // ---- Strength banded UI: band picker + reps-only sets, no weight input ----
  ck("strength banded: band picker present, defaults to light",
    (await page.inputValue(`${CLAM} select.band-pick`)) === "light");
  ck("strength banded: reps-only sets (no weight input)", (await page.$$(`${CLAM} .set .w`)).length === 0);
  ck("strength banded: 2 reps inputs (default sets)", (await page.$$(`${CLAM} .set .r`)).length === 2);

  // ---- Strength banded tonnage: light (5kg) × (10+12) reps = 110 ----
  await page.fill(`${CLAM} .set:nth-child(1) .r`, "10");
  await page.fill(`${CLAM} .set:nth-child(2) .r`, "12");
  ck("strength banded: 5kg × 22 reps = 110 kg", (await dayVol(D1)).trim() === "110 kg");
  await page.selectOption(`${CLAM} select.band-pick`, "medium");          // 8 kg
  await page.waitForTimeout(60);
  ck("strength banded: band → medium = 8kg × 22 = 176 kg", (await dayVol(D1)).trim() === "176 kg");
  ck("band choice logged per session", (await ls()).log["b1.w1.d1.ex.banded-clamshells.band"] === "medium");

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

  // ---- Week/block totals fold in the circuit-day band tonnage (176 + 176) ----
  const vol = await page.textContent("#volume");
  ck("week + block totals include circuit bands (352)",
    vol.includes("352 kg") && vol.indexOf("352 kg") !== vol.lastIndexOf("352 kg"));

  // ---- Edit mode: toggle a plain exercise into banded ----
  await page.click("#edit-toggle");
  ck("edit: clamshells Banded toggle is checked", await page.isChecked(`${CLAM} .banded-toggle`));
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

  // ---- Backfill migration: a legacy save with no banded flags re-derives them ----
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    Object.values(s.library).forEach((e) => { delete e.banded; delete e.defaultBand; });
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("migration: clamshells re-derives banded (band picker back)", await page.$(`${CLAM} select.band-pick`));
  ck("migration: hip-abductions re-derives banded (per-round reps back)", (await page.$$(`${HIP} .round-rep`)).length === 2);
});
