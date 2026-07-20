import { verify } from "./harness.mjs";

/* Equipment + the Holiday Session, driven through the real app (#48). A v6 store is injected (its
 * empty library is unioned up to the seed by normalise, so the seed exercises + their equipment
 * resolve). We assert:
 *   - an exercise's required equipment shows in the Library;
 *   - the Holiday-Session editor (Edit mode) offers ONLY away-eligible exercises (equipment ⊆ the
 *     away kit) — a dumbbell move is absent, a band move present — and you can add one;
 *   - the 🏝 toggle swaps the Holiday Session into a day: its band work logs a Performance, the
 *     planned exercise gets none (its ghost waits), and the swap persists across reload. */
verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({
      version: 6,
      library: {}, // normalise unions in the full seed library → referenced ids + equipment resolve
      classes: {},
      blocks: [{
        id: "b1", name: "Holiday Block", startDate: "2026-06-01", weeks: 1,
        template: [
          { kind: "session", title: "Leg Day", focus: "Squats", groups: [
            { items: [{ exId: "goblet-squats", rail: [8, 12] }], rounds: 3, restWithin: 0, restAfter: 90 },
          ] },
          { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" },
        ],
      }],
      holiday: { title: "Holiday Session", focus: "Bands only", groups: [
        { items: [{ exId: "banded-clamshells", rail: [10, 15] }], rounds: 3, restWithin: 0, restAfter: 60 },
      ] },
      log: {}, ui: { block: "b1", week: 1, view: "plan" },
    }));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  // --- 1. an exercise carries its equipment, shown in the Library ---
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(40);
  ck("an exercise shows its required equipment in the Library",
    (await page.locator('.lib-ex[data-ex="goblet-squats"] .lib-meta').textContent()).includes("adjustable-dumbbells"));
  await page.click('[data-action="view"][data-view="plan"]');
  await page.waitForTimeout(40);

  // --- 2. the Holiday editor (Edit mode) filters its picker to away-eligible exercises ---
  await page.click('[data-action="edit-block"]');
  await page.waitForTimeout(60);
  ck("the Holiday Session editor is shown in Edit mode", (await page.$(".holiday-editor")) !== null);
  const holidayOpts = await page.$$eval(".holiday-editor .item-add option", (os) => os.map((o) => o.value));
  ck("the Holiday picker offers band moves (equipment ⊆ away kit)", holidayOpts.includes("banded-clamshells") && holidayOpts.includes("banded-glute-bridges"));
  ck("the Holiday picker excludes dumbbell moves (not in the away kit)", !holidayOpts.includes("goblet-squats"));
  // a bodyweight move (no kit) is eligible too
  ck("the Holiday picker offers a bodyweight move (no kit needed)", holidayOpts.includes("high-knees"));

  // --- 3. the Holiday Session is definable — add an away-eligible exercise, it persists ---
  await page.selectOption(".holiday-editor .item-add", "banded-glute-bridges");
  await page.waitForTimeout(60);
  let s = await ls();
  ck("adding an away-eligible exercise grows the Holiday Session", s.holiday.groups[0].items.length === 2 &&
    s.holiday.groups[0].items.some((it) => it.exId === "banded-glute-bridges"));

  // --- 4. swap the Holiday Session into day 0; its band work logs, the planned move does not ---
  await page.click('[data-action="edit-block"]'); // Done → back to the log view
  await page.waitForTimeout(60);
  const day0 = () => page.locator(".week-grid .routine").first();
  ck("before swapping, day 0 is the planned Leg Day (goblet-squats)", (await day0().textContent()).includes("Leg Day"));
  await day0().locator('[data-action="holiday-swap"]').click();
  await page.waitForTimeout(60);
  ck("swapping shows the Holiday Session with a badge", (await day0().locator(".holiday-badge").count()) === 1 &&
    (await day0().locator(".routine-title").textContent()).includes("Holiday Session"));
  ck("the planned goblet-squats slot is gone; the band move is shown",
    (await page.$('.log-slot[data-ex="goblet-squats"]')) === null && (await page.$('.log-slot[data-ex="banded-clamshells"]')) !== null);

  // log a band set on the holiday day
  const bslot = '.log-slot[data-ex="banded-clamshells"][data-round="0"]';
  await page.selectOption(bslot + ' [data-field="tier"]', "medium");
  await page.fill(bslot + ' [data-field="r"]', "14");
  await page.waitForTimeout(60);
  s = await ls();
  ck("the holiday band move records its own Performance", (s.library["banded-clamshells"].performances || []).length === 1);
  ck("the planned exercise gets NO Performance on the holiday day", (s.library["goblet-squats"].performances || []).length === 0);

  // --- 5. the swap persists across reload; un-swapping restores the planned day ---
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("the holiday swap persists across reload", (await day0().locator(".holiday-badge").count()) === 1);
  await day0().locator('[data-action="holiday-swap"]').click(); // toggle back off
  await page.waitForTimeout(60);
  ck("un-swapping restores the planned Leg Day", (await day0().textContent()).includes("Leg Day") &&
    (await day0().locator(".holiday-badge").count()) === 0);
  ck("the band Performance still survives in history after un-swapping",
    ((await ls()).library["banded-clamshells"].performances || []).length === 1);
});
