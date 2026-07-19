import { verify } from "./harness.mjs";

/* The read-only week grid (#43), driven through the real app in the browser. A block renders as a
 * real-calendar week: seven weekdays anchored to the block's start date, every day shown, an empty
 * day as Rest. A Session renders its Groups of Items (straight sets, superset, circuit, steady); a
 * Class its type + planned duration. Switching weeks advances the dates; the block's length drives
 * how many weeks exist. Read-only — no logging or editing controls in the grid yet.
 *
 * A fixed-startDate v6 store is injected so the weekday dates are deterministic (the seed block's
 * start is today's Monday, which would vary). normalise backfills the seed Library + class types, so
 * the referenced exercise/class ids resolve without spelling out every definition here. */
verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({
      version: 6,
      library: {}, // normalise unions in the full seed library → referenced ids resolve
      classes: {}, // normalise unions in the seed class types → "box-fit" → "Box-Fit"
      blocks: [{
        id: "b1", name: "Test Block", startDate: "2026-06-01", weeks: 2,
        template: [
          // Mon: straight sets (one-item Group) + a superset (two items, no rest-within)
          { kind: "session", title: "Push Day", focus: "Chest & Shoulders", groups: [
            { items: [{ exId: "goblet-squats", rail: [8, 12] }], rounds: 3, restWithin: 0, restAfter: 90 },
            { items: [{ exId: "bicep-curls", rail: [10, 15] }, { exId: "crunches", rail: [12, 20] }], rounds: 3, restWithin: 0, restAfter: 60 },
          ] },
          // Tue: a conditioning circuit — timed stations with rest between them
          { kind: "session", title: "Conditioning", focus: "Cardio flush", groups: [
            { items: [{ exId: "high-knees", time: 30 }, { exId: "wall-press-ups", time: 30 }], rounds: 4, restWithin: 15, restAfter: 60 },
          ] },
          // Wed: a steady effort — one timed item against a machine level, one round
          { kind: "session", title: "Steady Cardio", focus: "Zone 2", groups: [
            { items: [{ exId: "seated-elliptical", time: 1800 }], rounds: 1, restWithin: 0, restAfter: 0 },
          ] },
          // Thu: a Class
          { kind: "class", classType: "box-fit", durationMin: 45 },
          // Fri–Sun: Rest
          { kind: "rest" }, { kind: "rest" }, { kind: "rest" },
        ],
      }],
      log: {},
      ui: { block: "b1", week: 1, view: "plan" },
    }));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  const s = await ls();
  ck("injected v6 store loads without migration", s.version === 6);

  // --- the seven-day grid ---
  ck("the week renders as a grid of seven days", (await page.$$(".week-grid .routine")).length === 7);
  const firstDay = page.locator(".week-grid .routine").first();
  ck("the first day carries its real calendar date (1 Jun)", (await firstDay.textContent()).includes("1 Jun"));
  ck("empty days render as Rest (three of them)", (await page.$$(".week-grid .routine.rest")).length === 3);
  ck("a Rest day says Rest", (await page.locator(".week-grid .routine.rest").first().textContent()).includes("Rest"));

  // --- the block's length drives how many weeks exist ---
  ck("two weeks exist (block length is 2)", (await page.$$('[data-action="week"]')).length === 2);

  // --- Session groups & items ---
  ck("straight sets render their rail", (await page.locator(".group.straight").first().textContent()).includes("8–12 reps"));
  const superset = page.locator(".group.superset").first();
  ck("a superset Group is marked and groups two items", (await superset.locator(".item").count()) === 2);
  ck("a superset states there is no rest within", (await superset.textContent()).includes("no rest (superset)"));
  const circuit = page.locator(".group.circuit").first();
  ck("a circuit Group shows timed stations", (await circuit.locator(".item-target").first().textContent()).includes("30 s"));
  ck("a circuit states its rest-within", (await circuit.textContent()).includes("15s within"));
  const steady = page.locator(".group.steady").first();
  ck("a steady Item shows its duration", (await steady.textContent()).includes("30 min"));
  ck("a steady Item shows it works against a level", (await steady.textContent()).toLowerCase().includes("level"));

  // --- a Class renders its type + planned duration ---
  const cls = page.locator(".week-grid .routine.class").first();
  ck("a Class renders its type", (await cls.textContent()).includes("Box-Fit"));
  ck("a Class renders its planned duration", (await cls.textContent()).includes("45 min"));

  // --- read-only: no logging / editing controls in the grid ---
  ck("the grid is read-only (no inputs)", (await page.$$(".week-grid input")).length === 0);

  // --- switching weeks advances the dates ---
  await page.click('[data-action="week"][data-week="2"]');
  await page.waitForTimeout(60);
  const firstDayW2 = page.locator(".week-grid .routine").first();
  ck("switching to week 2 advances the first day's date by seven days (8 Jun)",
    (await firstDayW2.textContent()).includes("8 Jun") && !(await firstDayW2.textContent()).includes("1 Jun"));
  ck("still seven days after the week switch", (await page.$$(".week-grid .routine")).length === 7);
});
