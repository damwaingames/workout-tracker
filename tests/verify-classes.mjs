import { verify } from "./harness.mjs";

/* Per-day class logger: add/remove, multiple per day, any day kind, the editable
 * type list (datalist), week/block minute totals, and the classTypes migration. */
verify(async ({ page, ck, ls, reset, key }) => {
  const D1 = "b1.w1.d1"; // strength day
  const D7 = "b1.w1.d7"; // rest day
  const cz = (cell) => `.classes[data-cell="${cell}"]`;
  const classesLog = async (cell) => (await ls()).log[`${cell}.classes`];
  const total = () => page.innerHTML("#class-total");
  const addClass = async (cell, type, desc, mins) => {
    await page.click(`${cz(cell)} [data-action="form-open"]`);
    await page.fill(`${cz(cell)} .class-form [name="type"]`, type);
    if (desc) await page.fill(`${cz(cell)} .class-form [name="desc"]`, desc);
    await page.fill(`${cz(cell)} .class-form [name="mins"]`, String(mins));
    await page.click(`${cz(cell)} .class-form button[type="submit"]`);
    await page.waitForTimeout(60);
  };

  await reset();
  await page.waitForTimeout(120);

  // ---- Zone present on every day kind; total hidden until something's logged ----
  ck("class zone on a strength day", !!(await page.$(cz(D1))));
  ck("class zone on a rest day", !!(await page.$(cz(D7))));
  ck("class total hidden when nothing logged", (await page.textContent("#class-total")).trim() === "");

  // ---- Add a class: renders, logs as an array, totals appear ----
  await addClass(D1, "Pilates", "reformer, core", 45);
  ck("class item rendered", (await page.$$(`${cz(D1)} .class-item`)).length === 1);
  const txt = await page.textContent(`${cz(D1)} .class-item`);
  ck("shows type + note + minutes", /Pilates/.test(txt) && /reformer/.test(txt) && /45 min/.test(txt));
  const log1 = await classesLog(D1);
  ck("logged as array under .classes key",
    Array.isArray(log1) && log1.length === 1 && log1[0].type === "Pilates" && log1[0].mins === 45);
  ck("seeded types carry a kcal/min/kg rate",
    (await ls()).classTypes.find((c) => c.name === "Pilates").rate === 0.04);
  ck("total shows 45 min week + block",
    /45 min<\/strong> this week/.test(await total()) && /45 min<\/strong> this block/.test(await total()));

  // ---- Multiple per day ----
  await addClass(D1, "Yoga", "", 30);
  ck("two classes on the day", (await page.$$(`${cz(D1)} .class-item`)).length === 2);
  ck("week total now 75 min", /75 min<\/strong> this week/.test(await total()));

  // ---- A brand-new type is remembered (classTypes + datalist), rate starts 0 ----
  await addClass(D1, "Spin", "", 40);
  ck("new type added to classTypes (rate 0)",
    (await ls()).classTypes.some((c) => c.name === "Spin" && c.rate === 0));
  ck("new type offered in the datalist", !!(await page.$('#class-types option[value="Spin"]')));

  // ---- Remove a class (first item) ----
  await page.click(`${cz(D1)} .class-item:nth-child(1) .remove`);
  await page.waitForTimeout(60);
  ck("one class removed (back to 2)", (await page.$$(`${cz(D1)} .class-item`)).length === 2);
  const log2 = await classesLog(D1);
  ck("removed from the logged array", log2.length === 2 && !log2.some((c) => c.type === "Pilates"));

  // ---- Rest day holds a class; week total spans all days ----
  await addClass(D7, "Yoga", "wind-down", 20);
  ck("rest day holds a class", (await page.$$(`${cz(D7)} .class-item`)).length === 1);
  ck("week total sums across days (Yoga 30 + Spin 40 + 20 = 90)", /90 min<\/strong> this week/.test(await total()));

  // ---- Emptying a day deletes its classes key ----
  await page.click(`${cz(D7)} .class-item:nth-child(1) .remove`);
  await page.waitForTimeout(60);
  ck("emptying a day deletes its classes key", (await classesLog(D7)) === undefined);

  // ---- Calorie burn: rate × minutes × bodyweight ----
  // D1 now holds Yoga(30) + Spin(40, rate 0). Log 60 kg, then add Pilates(45):
  // Pilates 0.04×45×60 = 108, Yoga 0.02×30×60 = 36, Spin 0 → week ~144 kcal.
  await page.fill('[data-k="b1.w1.m.bodyweight"]', "60");
  await page.waitForTimeout(40);
  await addClass(D1, "Pilates", "reformer", 45);
  ck("per-class kcal shown (Pilates ~108)", (await page.textContent(cz(D1))).includes("~108 kcal"));
  ck("per-class kcal shown (Yoga ~36)", (await page.textContent(cz(D1))).includes("~36 kcal"));
  ck("zero-rate type shows no kcal (Spin)", !(await page.textContent(cz(D1))).includes("~0 kcal"));
  ck("total folds in burn (~144 kcal this week)", /~144 kcal<\/strong> this week/.test(await total()));

  // ---- Edit-mode rate editor: changing a rate live-updates the total ----
  await page.click("#edit-toggle");
  ck("rate editor present", !!(await page.$(".class-types-edit .ct-rate[data-type-name='Pilates']")));
  ck("rate editor shows seeded Pilates rate", (await page.inputValue(".ct-rate[data-type-name='Pilates']")) === "0.04");
  await page.fill(".ct-rate[data-type-name='Pilates']", "0.08"); // Pilates → 0.08×45×60 = 216; week 36+216 = 252
  await page.waitForTimeout(40);
  ck("editing a rate persists", (await ls()).classTypes.find((c) => c.name === "Pilates").rate === 0.08);
  ck("total live-updates with the new rate (~252 kcal)", /~252 kcal<\/strong> this week/.test(await total()));
  // A deliberately-zeroed seeded rate is a real choice (no burn estimate) and must
  // survive a reload — not spring back to its seed via a missing-vs-zero fallback.
  await page.fill(".ct-rate[data-type-name='Yoga']", "0"); // Yoga seed is 0.02; zero it on purpose
  await page.waitForTimeout(40);
  ck("zeroing a seeded rate persists in-session", (await ls()).classTypes.find((c) => c.name === "Yoga").rate === 0);
  await page.click("#edit-toggle"); // leave edit mode before the migration step
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("zeroed seeded rate stays 0 after reload (no seed spring-back)",
    (await ls()).classTypes.find((c) => c.name === "Yoga").rate === 0);

  // ---- Migration: legacy string[] classTypes coerce to { name, rate } ----
  // A known type takes its seed rate; an unknown one starts at 0.
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.classTypes = ["Yoga", "Spin"]; // the earlier bare-string shape
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op click → save() persists the normalised list
  await page.waitForTimeout(60);
  const migrated = (await ls()).classTypes;
  ck("legacy string type coerces to object with seed rate (Yoga 0.02)",
    migrated.some((c) => c.name === "Yoga" && c.rate === 0.02));
  ck("legacy unknown string type starts at rate 0",
    migrated.some((c) => c.name === "Spin" && c.rate === 0));

  // ---- Migration: a save without classTypes backfills the defaults ----
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    delete s.classTypes;
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("migration: default class types restored (datalist has Pilates)", !!(await page.$('#class-types option[value="Pilates"]')));
});
