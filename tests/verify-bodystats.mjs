import { chromium } from "playwright";

const URL = process.env.WT_URL || "http://localhost:8765/";
const errors = [];
const checks = [];
const ck = (label, cond) => { checks.push([label, !!cond]); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const ls = () => page.evaluate(() => JSON.parse(localStorage.getItem("workout-tracker-v2")));

// ---- Fresh start ----
await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(150);

ck("Measurements card present", await page.$("#measurements-card h2"));
ck("default tracked = bodyweight row", await page.$('.measure-row[data-m="bodyweight"]'));
ck("no extra rows by default", (await page.$$(".measure-row")).length === 1);
ck("BMI hidden with no height", await page.getAttribute("#bmi-line", "hidden") !== null);

// ---- Log bodyweight ----
await page.fill('.measure-row[data-m="bodyweight"] .measure-val', "70");
await page.waitForTimeout(50);
let s = await ls();
ck("bodyweight stored under measureKey", s.log["b1.w1.m.bodyweight"] === "70");
ck("BMI still hidden (no height yet)", await page.getAttribute("#bmi-line", "hidden") !== null);

// ---- Set height → BMI appears & is correct ----
await page.fill("#height-input", "175");
await page.waitForTimeout(50);
s = await ls();
ck("height stored on profile", s.profile.heightCm === 175);
ck("BMI now shown", await page.getAttribute("#bmi-line", "hidden") === null);
const bmi = (await page.textContent("#bmi-value"))?.trim();
ck("BMI = 22.9 (70 / 1.75^2)", bmi === "22.9"); // 70/3.0625 = 22.857

// ---- Live: typing bodyweight updates BMI without losing focus ----
await page.click('.measure-row[data-m="bodyweight"] .measure-val');
await page.fill('.measure-row[data-m="bodyweight"] .measure-val', "");
await page.type('.measure-row[data-m="bodyweight"] .measure-val', "80", { delay: 20 });
const focusKept = await page.evaluate(() => document.activeElement?.classList.contains("measure-val"));
const bmi2 = (await page.textContent("#bmi-value"))?.trim();
ck("focus kept while typing bodyweight", focusKept === true);
ck("BMI live-updated to 26.1 (80/1.75^2)", bmi2 === "26.1"); // 80/3.0625 = 26.122

// ---- Edit mode: add a preset measurement ----
await page.click("#edit-toggle");
await page.click('.measurements-card [data-action="picker-open"]');
await page.click('.measurements-card [data-action="m-add"][data-m="waist"]');
await page.waitForTimeout(50);
ck("waist row added", await page.$('.measure-row[data-m="waist"]'));
s = await ls();
ck("waist in tracked", s.tracked.includes("waist"));

// ---- Create a custom measurement ----
await page.click('.measurements-card [data-action="picker-open"]'); // picker reopened after re-render
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
const wk2Val = await page.inputValue('.measure-row[data-m="bodyweight"] .measure-val');
const wk2Ph = await page.getAttribute('.measure-row[data-m="bodyweight"] .measure-val', "placeholder");
ck("week 2 bodyweight empty", wk2Val === "");
ck("week 2 shows week 1 value as ghost", wk2Ph === "80");

// ---- Migration: an old v2 blob with no body-stats fields ----
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("workout-tracker-v2"));
  delete s.measurements; delete s.tracked; delete s.profile;
  localStorage.setItem("workout-tracker-v2", JSON.stringify(s));
});
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
const beforeKeys = Object.keys((await ls()).log).filter((k) => k.startsWith("b1.") && k.includes(".m.")).length;
ck("had measurement keys before delete", beforeKeys > 0);

await browser.close();

const failed = checks.filter(([, ok]) => !ok);
if (errors.length) console.log("\nERRORS:\n" + errors.join("\n"));
console.log("\n" + (failed.length === 0 && errors.length === 0 ? "PASS" : "FAIL (" + failed.length + " checks, " + errors.length + " errors)"));
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
