import { verify } from "./harness.mjs";

/* Progressive-overload delta on the routine-volume line: the change vs the SAME routine last
 * week, as a signed "+N kg" (green / up) or "−N kg" (amber / down), live-patched as
 * you log. Shown in both the body line and the collapsed summary; suppressed when
 * there's nothing meaningful to compare (week 1, an unlogged routine, an exact match, or
 * a holiday week vs a normal week). */
verify(async ({ page, ck, ls, reset }) => {
  const routine = (cell) => `.routine[data-cell="${cell}"]`;
  const G1 = "b1.w1.d1", G2 = "b1.w2.d1"; // Workout A across weeks 1 and 2
  const setW = (cell, ex, i, v) => page.fill(`[data-k="${cell}.ex.${ex}.s${i}.w"]`, v);
  const setR = (cell, ex, i, v) => page.fill(`[data-k="${cell}.ex.${ex}.s${i}.r"]`, v);
  const bodyDelta = (cell) => page.textContent(`${routine(cell)} .routine-volume .vol-delta`);
  const deltaClass = (cell) => page.getAttribute(`${routine(cell)} .routine-volume .vol-delta`, "class");

  await reset();
  await page.waitForTimeout(120);

  // ---- Week 1 routine 1: goblet squats 50 × 10 = 500 kg. No prior week → no delta. ----
  await setW(G1, "goblet-squats", 0, "50");
  await setR(G1, "goblet-squats", 0, "10");
  await page.waitForTimeout(60);
  ck("week 1 shows no delta (no previous week to compare)", (await bodyDelta(G1)).trim() === "");

  // ---- Week 2 routine 1: not yet logged → still no delta (current routine reads 0) ----
  await page.click('[data-action="week"][data-week="2"]');
  await page.waitForTimeout(60);
  ck("week 2 before logging: no delta (routine not yet logged)", (await bodyDelta(G2)).trim() === "");

  // ---- Log more than last week → +100 kg, green/up ----
  await setW(G2, "goblet-squats", 0, "60"); // 60 × 10 = 600 vs 500
  await setR(G2, "goblet-squats", 0, "10");
  await page.waitForTimeout(60);
  ck("heavier than last week shows +100 kg", (await bodyDelta(G2)).includes("+100 kg"));
  ck("a gain is an 'up' (green) chip", /\bup\b/.test(await deltaClass(G2)));

  // ---- Drop below last week → −100 kg, amber/down ----
  await setW(G2, "goblet-squats", 0, "40"); // 400 vs 500
  await page.waitForTimeout(60);
  ck("lighter than last week shows a 100 kg drop", /100 kg/.test(await bodyDelta(G2)) && !(await bodyDelta(G2)).includes("+"));
  ck("a drop is a 'down' (amber) chip", /\bdown\b/.test(await deltaClass(G2)));

  // ---- Match last week exactly → no chip ----
  await setW(G2, "goblet-squats", 0, "50"); // 500 = 500
  await page.waitForTimeout(60);
  ck("matching last week shows no chip", (await bodyDelta(G2)).trim() === "");

  // ---- The collapsed summary carries the same delta (shared data-vol-delta) ----
  await setW(G2, "goblet-squats", 0, "60"); // back to +100
  await page.waitForTimeout(60);
  await page.click(`${routine(G2)} .routine-collapse`);
  await page.waitForTimeout(80);
  ck("collapsed summary shows the same +100 kg delta", (await page.textContent(`${routine(G2)} .routine-summary .vol-delta`)).includes("+100 kg"));
  await page.click(`${routine(G2)} .routine-collapse`); // expand again
  await page.waitForTimeout(80);

  // ---- A holiday routine itself shows no delta (holiday weeks aren't a tracking surface) ----
  await page.click(`${routine(G2)} input[data-k="${G2}.holiday"]`);
  await page.waitForTimeout(80);
  await page.fill(`[data-k="${G2}.ex.banded-monster-walks.s0.r"]`, "10"); // gives the holiday routine some volume
  await page.waitForTimeout(60);
  ck("holiday routine carries volume", /kg/.test(await page.textContent(`${routine(G2)} .routine-volume`)));
  ck("a holiday routine shows no delta", (await bodyDelta(G2)).trim() === "");

  // ---- A normal week skips an intervening holiday week, comparing to the last
  // normal session: week 1 (500, normal) · week 2 (holiday) · week 3 (normal). ----
  await page.click('[data-action="week"][data-week="3"]');
  await page.waitForTimeout(60);
  await setW("b1.w3.d1", "goblet-squats", 0, "70"); // 700 vs week 1's 500 (week 2 holiday, skipped)
  await setR("b1.w3.d1", "goblet-squats", 0, "10");
  await page.waitForTimeout(60);
  ck("week 3 skips the holiday week 2 and compares to week 1 (+200 kg)", (await bodyDelta("b1.w3.d1")).includes("+200 kg"));
});
