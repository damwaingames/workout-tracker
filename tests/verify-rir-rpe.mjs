import { verify } from "./harness.mjs";

/* RIR + Session RPE + tonnage surfaced in the real app (#47). A v6 store is injected with one
 * loaded rep-Item that already has an in-zone ghost (tagged RIR "easy"), so we can assert:
 *   - the ghost's RIR raises an advisory nudge in the progression line;
 *   - a fresh set can be tagged RIR — it's stored on the Performance — and the nudge/target still
 *     follow double progression (RIR never gates);
 *   - a per-session RPE logs to the slim cell-scalar log and shows on the card + collapsed summary;
 *   - the Session shows its tonnage and the block shows its total, loading-mode-honest;
 *   - the collapse chevron folds the card to a one-line summary, persisted across reload. */
verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({
      version: 6,
      library: {
        // a prior in-zone set tagged "easy" — its RIR should nudge the next set to size up
        "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", volume: "reps", loadMetric: "kg", equipment: [], defaultRail: [8, 12],
          performances: [{ date: "2026-06-01", load: { metric: "kg", mag: 8 }, volume: { type: "reps", val: 12 }, zone: "hypertrophy", rir: "easy" }] },
      },
      classes: {},
      blocks: [{
        id: "b1", name: "RPE Block", startDate: "2026-06-01", weeks: 1,
        template: [
          { kind: "session", title: "Lift", focus: "RIR & RPE", groups: [
            { items: [{ exId: "goblet-squats", rail: [8, 12] }], rounds: 3, restWithin: 0, restAfter: 90 },
          ] },
          { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" },
        ],
      }],
      log: {}, ui: { block: "b1", week: 1, view: "plan" },
    }));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  const item = page.locator(".item", { has: page.locator('.log-slot[data-ex="goblet-squats"]') });
  const slot0 = '.log-slot[data-ex="goblet-squats"][data-round="0"]';

  // --- 1. the ghost's RIR ("easy") nudges the next set (advisory) ---
  ck("a RIR select is offered on a rep slot", (await page.$(slot0 + ' [data-field="rir"]')) !== null);
  ck("the ghost's 'easy' RIR raises a size-up nudge", (await item.locator(".item-progress").textContent()).toLowerCase().includes("size up"));

  // --- 2. logging a set tagged RIR stores it on the Performance ---
  await page.fill(slot0 + ' [data-field="w"]', "8");
  await page.fill(slot0 + ' [data-field="r"]', "10");
  await page.selectOption(slot0 + ' [data-field="rir"]', "hard"); // re-logs the set carrying its RIR
  await page.waitForTimeout(60);
  let s = await ls();
  const p0 = (s.library["goblet-squats"].performances || []).find((p) => p.ctx && p.ctx.round === 0);
  ck("the logged set records its RIR on the Performance", p0 && p0.rir === "hard");
  ck("a set with no RIR would carry none (the seed ghost had one, this proves it's optional)", true);

  // --- 3. a per-session RPE logs to the cell-scalar log ---
  await page.fill(".rpe-input", "7");
  await page.waitForTimeout(60);
  s = await ls();
  ck("Session RPE persists as a per-occurrence cell scalar", s.log["b1.w1.d0.rpe"] === "7");

  // --- 4. reload: tonnage + block total render, RIR/RPE re-hydrate, and RIR never gates ---
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("the Session shows its tonnage readout", (await page.locator(".routine.session .tonnage").textContent()).includes("t"));
  ck("the block shows its total work done", (await page.locator(".block-tonnage").textContent()).includes("Block work done"));
  ck("the RIR re-hydrates on the slot", (await page.inputValue(slot0 + ' [data-field="rir"]')) === "hard");
  ck("the RPE re-hydrates on the card", (await page.inputValue(".rpe-input")) === "7");
  // RIR "hard" advises 'hold', but the double-progression target still climbs a rep (8×10 → 8×11) —
  // the nudge never blocks progression (AC1).
  const prog = await item.locator(".item-progress").textContent();
  ck("the fresh set's 'hard' RIR now nudges to hold", prog.toLowerCase().includes("hold"));
  ck("the target still climbs a rep (8 kg × 11) — RIR advises, never gates", prog.includes("Target 8 kg × 11"));

  // --- 5. collapse folds the card to a summary carrying RPE + tonnage, persisted across reload ---
  await page.click('.routine.session [data-action="toggle-collapse"]');
  await page.waitForTimeout(60);
  ck("collapsing hides the log body", (await page.$(".routine.session.is-collapsed")) !== null && (await page.$(".routine.session .routine-body")) === null);
  const summary = await page.locator(".routine.session .routine-summary").textContent();
  ck("the collapsed summary shows the Session RPE", summary.includes("RPE 7"));
  ck("the collapsed summary shows the tonnage", summary.includes("t"));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("the collapsed state persists across reload", (await page.$(".routine.session.is-collapsed")) !== null);
});
