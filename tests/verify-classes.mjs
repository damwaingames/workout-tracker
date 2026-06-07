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
    await page.click(`${cz(cell)} [data-action="class-add-open"]`);
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
  ck("total shows 45 min week + block",
    /45 min<\/strong> this week/.test(await total()) && /45 min<\/strong> this block/.test(await total()));

  // ---- Multiple per day ----
  await addClass(D1, "Yoga", "", 30);
  ck("two classes on the day", (await page.$$(`${cz(D1)} .class-item`)).length === 2);
  ck("week total now 75 min", /75 min<\/strong> this week/.test(await total()));

  // ---- A brand-new type is remembered (classTypes + datalist) ----
  await addClass(D1, "Spin", "", 40);
  ck("new type added to classTypes", (await ls()).classTypes.includes("Spin"));
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
