import { verify } from "./harness.mjs";

/* The Wind-down (#49, ADR-0028): a freeform daily mobility habit tracked OUTSIDE any block, as
 * weekly adherence against a target (~6 of 7). A frozen clock (Sat 18 Jul 2026) pins "today" so the
 * current calendar week (Mon 13 – Sun 19 Jul) is deterministic. We seed a v6 store whose wind-down
 * already has six nights ticked this week (Mon–Sat), plus one LEGACY per-cell `.winddown` log scalar
 * (a pre-#49 tick) that normalise must re-home onto the date-keyed habit and sweep from the log.
 *
 * Asserts:
 *   - the card draws the seven days of this calendar week, with an "N / target" adherence readout;
 *   - a ticked night shows done, today is marked, a future night isn't yet tickable;
 *   - hitting the target flags the readout met;
 *   - the legacy `.winddown` log key is re-homed to winddown.done (by its routine's date) + removed;
 *   - toggling a night persists to winddown.done and survives reload;
 *   - Edit mode exposes the weekly target, and lowering it live-updates the readout. */
verify(async ({ page, ck, ls, url, key }) => {
  // Freeze the clock BEFORE the app loads so today() is deterministic. Sat 18 Jul 2026.
  await page.clock.install({ time: new Date("2026-07-18T20:00:00") });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate((k) => localStorage.removeItem(k), key);
  await page.evaluate(({ k, store }) => localStorage.setItem(k, JSON.stringify(store)), {
    k: key,
    store: {
      version: 6,
      library: {},
      classes: {},
      blocks: [{
        id: "b1", name: "Block", startDate: "2026-06-01", weeks: 1,
        template: [{ kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }],
      }],
      // Six nights ticked this week (Mon 13 – Sat 18), meeting the target of 6.
      winddown: { durationMin: 10, weeklyTarget: 6, done: {
        "2026-07-13": true, "2026-07-14": true, "2026-07-15": true,
        "2026-07-16": true, "2026-07-17": true, "2026-07-18": true,
      } },
      // A legacy per-cell tick (pre-#49): b1/w1/d0 → Mon 1 Jun 2026 (outside this week). Must re-home.
      log: { "b1.w1.d0.winddown": true },
      ui: { block: "b1", week: 1, view: "plan" },
    },
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  // --- 1. the card renders the seven days of the current calendar week ---
  ck("the wind-down card renders", (await page.$("#winddown-card h2")) !== null);
  ck("it draws seven day cells (Mon–Sun of this week)", (await page.$$(".winddown-week .wd-day")).length === 7);
  ck("Monday of this week is the first cell", (await page.$('.wd-day[data-date="2026-07-13"]')) !== null);
  ck("Sunday of this week is the last cell", (await page.$('.wd-day[data-date="2026-07-19"]')) !== null);

  // --- 2. adherence readout: 6 of 6, met ---
  const adh = page.locator(".winddown-adherence");
  ck("the adherence readout shows done / target", (await adh.textContent()).includes("6 / 6"));
  ck("meeting the target flags the readout met", (await page.$(".winddown-adherence.met")) !== null);

  // --- 3. done / today / future states ---
  ck("today's night is marked done", (await page.$('.wd-day[data-date="2026-07-18"].done')) !== null);
  ck("today's night is marked today", (await page.$('.wd-day[data-date="2026-07-18"].today')) !== null);
  ck("a future night isn't tickable yet", await page.locator('.wd-day[data-date="2026-07-19"]').isDisabled());

  // --- 4. the legacy per-cell tick re-homed onto the date-keyed habit + swept from the log ---
  let s = await ls();
  ck("the legacy .winddown log scalar is re-homed to its routine's date", s.winddown.done["2026-06-01"] === true);
  ck("the legacy log key is removed from the slim log", s.log["b1.w1.d0.winddown"] === undefined);
  ck("re-homed dates outside this week don't skew the weekly readout", (await adh.textContent()).includes("6 / 6"));

  // --- 5. toggling tonight persists + survives reload ---
  await page.click('.wd-day[data-date="2026-07-18"]');
  await page.waitForTimeout(60);
  ck("toggling tonight off updates the readout", (await adh.textContent()).includes("5 / 6"));
  ck("the readout is no longer met", (await page.$(".winddown-adherence.met")) === null);
  s = await ls();
  ck("the un-ticked night is dropped from winddown.done", s.winddown.done["2026-07-18"] === undefined);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("the toggle persists across reload", (await page.locator(".winddown-adherence").textContent()).includes("5 / 6"));

  // --- 6. Edit mode exposes the target; lowering it live-updates the readout ---
  await page.click('[data-action="edit-block"]');
  await page.waitForTimeout(60);
  ck("Edit mode reveals the weekly-target input", (await page.inputValue("#winddown-target")) === "6");
  await page.fill("#winddown-target", "5");
  await page.waitForTimeout(60);
  ck("lowering the target live-updates the readout", (await page.locator(".winddown-adherence").textContent()).includes("5 / 5"));
  ck("with five of five the readout reads met again", (await page.$(".winddown-adherence.met")) !== null);
  s = await ls();
  ck("the new target persists to the store", s.winddown.weeklyTarget === 5);
});
