import { verify } from "./harness.mjs";

/* Progression surfaced in the real app (#46) — the first seam for the ghost / target / guide ghost /
 * e1RM. A v6 store is injected with pre-seeded performances (progression reads accumulated history),
 * and we assert what a rep-Item shows *before* you log:
 *   - a real ghost (your last in-zone set) + the double-progression target;
 *   - for a cold zone with no in-zone history, an e1RM-seeded guide ghost, marked estimated;
 *   - e1RM as an advisory readout here and a trend in the Library — never a per-set verdict;
 *   - logging a fresh below-ceiling set makes the target climb a rep (double progression, not e1RM). */
verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.evaluate((k) => {
    const perf = (date, kg, reps, zone) => ({ date, load: { metric: "kg", mag: kg }, volume: { type: "reps", val: reps }, zone });
    localStorage.setItem(k, JSON.stringify({
      version: 6,
      library: {
        // a rising hypertrophy history on real dumbbell rungs — ghost = the last set (8×12), which
        // caps the [8,12] rail, so the target steps to the next rung (9.5 kg) and resets to the floor
        "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [8, 12],
          performances: [perf("2026-06-01", 8, 10, "hypertrophy"), perf("2026-06-08", 8, 12, "hypertrophy")] },
        // history ONLY in hypertrophy (6 kg × 12), but placed on a strength rail → a cold zone → a
        // guide ghost, its e1RM seed snapped down to a real rung (7 kg)
        "bicep-curls": { id: "bicep-curls", name: "Bicep Curls", volume: "reps", loadMetric: "kg", equipment: [],
          performances: [perf("2026-06-02", 6, 12, "hypertrophy")] },
      },
      classes: {},
      blocks: [{
        id: "b1", name: "Prog Block", startDate: "2026-06-01", weeks: 1,
        template: [
          { kind: "session", title: "Lift", focus: "Ghosts & targets", groups: [
            { items: [{ exId: "goblet-squats", rail: [8, 12] }], rounds: 3, restWithin: 0, restAfter: 90 },
            { items: [{ exId: "bicep-curls", rail: [3, 5] }], rounds: 3, restWithin: 0, restAfter: 90 },
          ] },
          { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" },
        ],
      }],
      log: {}, ui: { block: "b1", week: 1, view: "plan" },
    }));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  const itemFor = (ex) => page.locator(".item", { has: page.locator('.log-slot[data-ex="' + ex + '"]') });
  const progText = async (ex) => (await itemFor(ex).locator(".item-progress").textContent()) || "";

  // --- 1. a real ghost + a double-progression target on the loaded item ---
  const gob = await progText("goblet-squats");
  ck("a rep-Item shows the ghost of the last in-zone set (8 kg × 12)", gob.includes("Ghost 8 kg × 12"));
  ck("it shows a double-progression target", gob.includes("Target"));
  ck("capping the rail steps to the next dumbbell rung, resets to the floor (9.5 kg × 8)", gob.includes("9.5 kg × 8"));
  ck("e1RM shows as an advisory readout beside the ghost", gob.includes("e1RM"));

  // --- 2. a cold zone (strength rail, only hypertrophy history) shows a self-retiring guide ghost ---
  const bic = await progText("bicep-curls");
  ck("a cold zone shows a guide ghost, marked estimated", bic.includes("Guide") && bic.includes("(est.)"));
  ck("the guide ghost seeds an e1RM-derived load, snapped to a real rung (7 kg × 3)", bic.includes("7 kg × 3"));
  ck("the cold zone shows no real ghost", !bic.includes("Ghost "));

  // --- 3. the Library surfaces e1RM as a trend (max + direction), never a per-set verdict ---
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(40);
  const lib = page.locator('.lib-ex[data-ex="goblet-squats"]');
  await lib.locator("summary").click();
  await page.waitForTimeout(30);
  const badges = await lib.locator(".pr-badges").textContent();
  ck("the Library shows a headline e1RM PR", badges.includes("e1RM"));
  ck("the e1RM carries a rising trend arrow (↑)", badges.includes("↑"));
  ck("PRs still bucket per zone (a hypertrophy best is shown)", badges.toLowerCase().includes("hypertrophy"));

  // --- 4. logging a fresh below-ceiling set makes the target climb a rep — double progression, not
  //        e1RM (the new 40×11 set has a LOWER e1RM than 40×12, yet it becomes the ghost and the
  //        target climbs, proving e1RM never judged the set) ---
  await page.click('[data-action="view"][data-view="plan"]');
  await page.waitForTimeout(40);
  await page.fill('.log-slot[data-ex="goblet-squats"][data-round="0"] [data-field="w"]', "8");
  await page.fill('.log-slot[data-ex="goblet-squats"][data-round="0"] [data-field="r"]', "11");
  await page.waitForTimeout(50);
  await page.reload({ waitUntil: "load" });          // progression refreshes on the next render
  await page.waitForTimeout(120);
  const s = await ls();
  ck("the fresh set persisted as a Performance", (s.library["goblet-squats"].performances || []).some((p) => p.volume.val === 11));
  const after = await progText("goblet-squats");
  ck("the newest set is now the ghost (8 kg × 11)", after.includes("Ghost 8 kg × 11"));
  ck("the target climbs one rep at the same load (8 kg × 12) — double progression, not an e1RM verdict",
    after.includes("Target 8 kg × 12"));
});
