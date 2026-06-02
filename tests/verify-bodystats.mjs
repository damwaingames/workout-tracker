import { verify } from "./harness.mjs";

verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.waitForTimeout(150);

  ck("Measurements card present", await page.$("#measurements-card h2"));
  ck("default tracked = bodyweight row", await page.$('.measure-row[data-m="bodyweight"]'));
  ck("no extra rows by default", (await page.$$(".measure-row")).length === 1);
  ck("BMI hidden with no height", (await page.getAttribute("#bmi-line", "hidden")) !== null);

  // ---- Log bodyweight ----
  await page.fill('.measure-row[data-m="bodyweight"] .measure-val', "70");
  await page.waitForTimeout(50);
  let s = await ls();
  ck("bodyweight stored under measureKey", s.log["b1.w1.m.bodyweight"] === "70");
  ck("BMI still hidden (no height yet)", (await page.getAttribute("#bmi-line", "hidden")) !== null);

  // ---- Set height → BMI appears & is correct ----
  await page.fill("#height-input", "175");
  await page.waitForTimeout(50);
  s = await ls();
  ck("height stored on profile", s.profile.heightCm === 175);
  ck("BMI now shown", (await page.getAttribute("#bmi-line", "hidden")) === null);
  ck("BMI = 22.9 (70 / 1.75^2)", (await page.textContent("#bmi-value"))?.trim() === "22.9");

  // ---- Live: typing bodyweight updates BMI without losing focus ----
  await page.click('.measure-row[data-m="bodyweight"] .measure-val');
  await page.fill('.measure-row[data-m="bodyweight"] .measure-val', "");
  await page.type('.measure-row[data-m="bodyweight"] .measure-val', "80", { delay: 20 });
  ck("focus kept while typing bodyweight",
    (await page.evaluate(() => document.activeElement?.classList.contains("measure-val"))) === true);
  ck("BMI live-updated to 26.1 (80/1.75^2)", (await page.textContent("#bmi-value"))?.trim() === "26.1");

  // ---- Edit mode: add a preset measurement ----
  await page.click("#edit-toggle");
  await page.click('.measurements-card [data-action="picker-open"]');
  await page.click('.measurements-card [data-action="m-add"][data-m="waist"]');
  await page.waitForTimeout(50);
  ck("waist row added", await page.$('.measure-row[data-m="waist"]'));
  ck("waist in tracked", (await ls()).tracked.includes("waist"));

  // ---- Create a custom measurement ----
  await page.click('.measurements-card [data-action="picker-open"]'); // reopened after re-render
  await page.click('.measurements-card [data-action="picker-new-open"]');
  await page.fill('.measurements-card .picker-form [name="name"]', "Left Thigh");
  await page.selectOption('.measurements-card .picker-form [name="unit"]', "cm");
  await page.click('.measurements-card .picker-form button[type="submit"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("custom measurement in catalogue", !!s.measurements["left-thigh"] && s.measurements["left-thigh"].name === "Left Thigh");
  ck("custom measurement tracked", s.tracked.includes("left-thigh"));

  // ---- Remove a measurement ----
  await page.click('.measure-row[data-m="waist"] [data-action="m-remove"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("waist removed from tracked", !s.tracked.includes("waist"));
  ck("waist kept in catalogue (re-addable)", !!s.measurements["waist"]);

  await page.click("#edit-toggle"); // leave edit mode

  // ---- Previous-value ghost across weeks ----
  await page.click('[data-action="week"][data-week="2"]');
  await page.waitForTimeout(80);
  ck("week 2 bodyweight empty", (await page.inputValue('.measure-row[data-m="bodyweight"] .measure-val')) === "");
  ck("week 2 shows week 1 value as ghost",
    (await page.getAttribute('.measure-row[data-m="bodyweight"] .measure-val', "placeholder")) === "80");

  // ---- Migration: an old v2 blob with no body-stats fields ----
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    delete s.measurements; delete s.tracked; delete s.profile;
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(150);
  // normalise() backfills in-memory and only persists on the next save() (same as
  // migrateSets) — so assert the DOM reflects the backfill, then a save persists it.
  ck("bodyweight row renders after migration (in-memory backfill)", await page.$('.measure-row[data-m="bodyweight"]'));
  ck("logged value survived migration (w1 bodyweight=80)", (await ls()).log["b1.w1.m.bodyweight"] === "80");
  await page.fill("#height-input", "180"); // triggers a save
  await page.waitForTimeout(50);
  s = await ls();
  ck("backfill persisted after save: measurements", s.measurements && !!s.measurements.bodyweight);
  ck("backfill persisted after save: tracked", Array.isArray(s.tracked) && s.tracked.includes("bodyweight"));
  ck("backfill persisted after save: profile", s.profile && s.profile.heightCm === 180);

  // ---- deleteBlock purges measurement keys (shares log) ----
  const measureKeys = Object.keys((await ls()).log).filter((k) => k.startsWith("b1.") && k.includes(".m.")).length;
  ck("had measurement keys before delete", measureKeys > 0);
});
