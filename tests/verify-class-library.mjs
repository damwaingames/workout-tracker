import { verify } from "./harness.mjs";

/* Class logging + Library edit/retire (#50, ADRs 0030/0014/0020). A v6 store is seeded with a
 * Session (one loaded rep-Item already logged, so tonnage exists) and a Class routine, plus the
 * Box-Fit class type. Asserts:
 *   - a Class routine logs actual minutes, a note, and the wearable calorie burn → an Attendance on
 *     the class type (ADR-0030), re-hydrated on reload and shown in the Library;
 *   - an exercise's fields edit in the Library (name, loading mode, default rail, equipment), and a
 *     loading-mode correction reflects in a DERIVED figure over history (session tonnage doubles);
 *   - an exercise retires — gone from the composer picker, history intact, tagged — and un-retires. */
verify(async ({ page, ck, ls, url, key }) => {
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate((k) => localStorage.removeItem(k), key);
  await page.evaluate(({ k, store }) => localStorage.setItem(k, JSON.stringify(store)), {
    k: key,
    store: {
      version: 6,
      library: {
        "goblet-squats": {
          id: "goblet-squats", name: "Goblet Squats", volume: "reps", loadMetric: "kg",
          loadMode: "standard", equipment: ["adjustable-dumbbells"], defaultRail: [8, 12],
          setup: "Hold a dumbbell to your chest.", cue: "",
          // one logged set → 40 kg × 10 = 400 kg tonnage at standard mode
          performances: [{ date: "2026-06-01", load: { metric: "kg", mag: 40 }, volume: { type: "reps", val: 10 },
            zone: "hypertrophy", ctx: { block: "b1", week: 1, routine: 0, group: 0, item: 0, round: 0 } }],
        },
      },
      classes: { "box-fit": { id: "box-fit", name: "Box-Fit", attendances: [] } },
      blocks: [{
        id: "b1", name: "Block", startDate: "2026-06-01", weeks: 1,
        template: [
          { kind: "session", title: "Lift", focus: "", groups: [
            { items: [{ exId: "goblet-squats", rail: [8, 12] }], rounds: 1, restWithin: 0, restAfter: 90 } ] },
          { kind: "class", classType: "box-fit", durationMin: 45 },
          { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" },
        ],
      }],
      log: {}, ui: { block: "b1", week: 1, view: "plan" },
    },
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  // ---------- 1. Class attendance logging (ADR-0030/0014) ----------
  const clog = '.routine.class .class-log[data-class="box-fit"]';
  ck("the class card offers a minutes input", (await page.$(clog + ' [data-field="mins"]')) !== null);
  ck("the class card offers a wearable-burn (kcal) input", (await page.$(clog + ' [data-field="kcal"]')) !== null);
  ck("the class card offers a note input", (await page.$(clog + ' [data-field="note"]')) !== null);

  await page.fill(clog + ' [data-field="mins"]', "45");
  await page.fill(clog + ' [data-field="kcal"]', "380");
  await page.fill(clog + ' [data-field="note"]', "tough one");
  await page.waitForTimeout(60);
  let s = await ls();
  const att = (s.classes["box-fit"].attendances || [])[0];
  ck("logging records an Attendance on the class type", !!att);
  ck("the Attendance carries minutes / kcal / note", att && att.mins === 45 && att.kcal === 380 && att.note === "tough one");
  ck("the Attendance is dated (YYYY-MM-DD)", att && /^\d{4}-\d{2}-\d{2}$/.test(att.date));
  ck("the Attendance back-references its plan slot", att && att.ctx && att.ctx.block === "b1" && att.ctx.routine === 1);

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("the logged minutes re-hydrate on reload", (await page.inputValue(clog + ' [data-field="mins"]')) === "45");
  ck("the class card shows it's logged", (await page.$(".routine.class.logged")) !== null);

  // Library shows the attendance history
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(60);
  ck("the class type shows one attendance in the Library", (await page.locator('.lib-ex[data-class="box-fit"] .lib-ex-count').textContent()).includes("1"));
  await page.click('.lib-ex[data-class="box-fit"] summary');
  ck("the attendance row shows minutes + burn", (await page.locator('.lib-ex[data-class="box-fit"] .perf-timeline').textContent()).includes("45 min"));

  // ---------- 2. Library exercise editing (ADR-0020) ----------
  await page.click(".lib-edit-toggle"); // the Library's own Edit toggle (plan-view one is hidden here)
  await page.waitForTimeout(60);
  await page.click('.lib-ex[data-ex="goblet-squats"] summary');
  ck("Edit mode reveals the exercise edit form", (await page.$('.lib-ex[data-ex="goblet-squats"] .lib-edit')) !== null);

  // name — a scalar edit; the summary label hand-patches (no re-render, keeps focus)
  await page.fill('.lib-ex[data-ex="goblet-squats"] .lib-edit [data-target="name"]', "Goblet Squat");
  await page.waitForTimeout(60);
  s = await ls();
  ck("editing the name mutates the exercise record", s.library["goblet-squats"].name === "Goblet Squat");
  ck("the summary label live-patches to the new name", (await page.locator('.lib-ex[data-ex="goblet-squats"] .lib-ex-name').textContent()) === "Goblet Squat");

  // default rail
  await page.fill('.lib-ex[data-ex="goblet-squats"] .lib-edit [data-target="rail-floor"]', "10");
  await page.waitForTimeout(60);
  s = await ls();
  ck("editing the default rail floor mutates the record", s.library["goblet-squats"].defaultRail[0] === 10);

  // equipment toggle
  await page.check('.lib-ex[data-ex="goblet-squats"] .lib-edit .ex-equip [data-equip="mat"]');
  await page.waitForTimeout(60);
  s = await ls();
  ck("toggling equipment updates the exercise's kit", s.library["goblet-squats"].equipment.includes("mat"));

  // loading mode — a correction that must reflect in a DERIVED figure over history (tonnage)
  await page.selectOption('.lib-ex[data-ex="goblet-squats"] .lib-edit [data-target="loadMode"]', "two-dumbbell");
  await page.waitForTimeout(60);
  s = await ls();
  ck("editing the loading mode mutates the record", s.library["goblet-squats"].loadMode === "two-dumbbell");
  // exit Edit mode so the plan renders the log view (where tonnage shows, not the composer)
  await page.click(".lib-edit-toggle"); // now "Done"
  await page.waitForTimeout(60);
  await page.click('[data-action="view"][data-view="plan"]');
  await page.waitForTimeout(60);
  // 40 kg × 10 reps × wMult 2 (two-dumbbell) = 800 kg = 0.8 t (was 0.4 t at standard)
  ck("the loading-mode correction reflects in session tonnage over history", (await page.locator(".routine.session .tonnage").textContent()).includes("0.8"));

  // ---------- 3. Retire / un-retire (ADR-0020) ----------
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(60);
  await page.click(".lib-edit-toggle"); // re-enter Edit mode
  await page.waitForTimeout(60);
  await page.click('.lib-ex[data-ex="goblet-squats"] summary');
  await page.click('.lib-ex[data-ex="goblet-squats"] [data-action="ex-retire"]');
  await page.waitForTimeout(60);
  s = await ls();
  ck("retiring sets the retired flag", s.library["goblet-squats"].retired === true);
  ck("the exercise's performance history survives retirement", s.library["goblet-squats"].performances.length === 1);
  ck("the Library tags the exercise retired", (await page.locator('.lib-ex[data-ex="goblet-squats"]').textContent()).includes("retired"));

  // gone from the composer picker (pickers filter retired — ADR-0020); the composer shows in Edit mode
  await page.click('[data-action="view"][data-view="plan"]');
  await page.waitForTimeout(60);
  const optionValues = await page.$$eval('.routine.session .item-add option', (os) => os.map((o) => o.value));
  ck("a retired exercise is gone from the composer picker", !optionValues.includes("goblet-squats"));

  // un-retire (still in Edit mode)
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(60);
  await page.click('.lib-ex[data-ex="goblet-squats"] summary');
  await page.click('.lib-ex[data-ex="goblet-squats"] [data-action="ex-retire"]');
  await page.waitForTimeout(60);
  s = await ls();
  ck("un-retiring clears the flag", !s.library["goblet-squats"].retired);
});
