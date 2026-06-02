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
const day1Ex = async () => (await ls()).blocks[0].days.find((d) => d.day === 1).exercises;

await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await page.reload({ waitUntil: "load" });
await page.click("#edit-toggle");

const D1 = '[data-cell="b1.w1.d1"]'; // strength day, Workout A
// Fresh load doesn't persist until the first save(), so count the DOM here.
const before = (await page.$$(`${D1} .exercise`)).length;
ck("day 1 seeded with 5 exercises", before === 5);

// ---- EXERCISE picker: open ----
await page.click(`${D1} [data-action="picker-open"]`);
ck("exercise picker opened", await page.isVisible(`${D1} .picker`));
ck("picker excludes already-added (no goblet-squats chip)", !(await page.$(`${D1} .pick[data-ex="goblet-squats"]`)));

// ---- search filters ----
await page.fill(`${D1} .picker-search`, "rdl");
await page.waitForTimeout(60);
const picks = await page.$$(`${D1} .pick`);
ck("search 'rdl' narrows to 1 match", picks.length === 1);
ck("match is Dumbbell RDLs", await page.$(`${D1} .pick[data-ex="dumbbell-rdls"]`));

// ---- pick adds to the day ----
await page.click(`${D1} .pick[data-ex="dumbbell-rdls"]`);
await page.waitForTimeout(60);
let ex = await day1Ex();
ck("exercise added to day (now 6)", ex.length === 6 && ex.some((p) => p.id === "dumbbell-rdls"));
ck("strength placement carries sets", ex.find((p) => p.id === "dumbbell-rdls").sets >= 1);

// ---- create a new exercise via the form ----
await page.click(`${D1} [data-action="picker-open"]`); // reopen after re-render
await page.click(`${D1} [data-action="picker-new-open"]`);
ck("create form revealed", await page.isVisible(`${D1} .picker-form`));
await page.fill(`${D1} .picker-form [name="name"]`, "Cable Face Pull");
await page.click(`${D1} .picker-form button[type="submit"]`); // type derives from the day kind now
await page.waitForTimeout(60);
let s = await ls();
ck("new exercise in library", !!s.library["cable-face-pull"]);
ck("new exercise added to day 1 (now 7)", (await day1Ex()).length === 7);

// ---- cancel path ----
await page.click(`${D1} [data-action="picker-open"]`);
await page.click(`${D1} [data-action="picker-new-open"]`);
await page.click(`${D1} .picker-form [data-action="picker-new-cancel"]`);
ck("create form hidden after cancel", !(await page.isVisible(`${D1} .picker-form`)));
ck("create link visible again", await page.isVisible(`${D1} [data-action="picker-new-open"]`));

// ---- remove an exercise ----
await page.click(`${D1} .exercise[data-ex="dumbbell-rdls"] [data-action="remove-exercise"]`);
await page.waitForTimeout(60);
ck("exercise removed (back to 6)", (await day1Ex()).length === 6);

// ---- MEASURE picker search (shared chrome, measure kind) ----
await page.click('.measurements-card [data-action="picker-open"]');
await page.fill('.measurements-card .picker-search', "thigh");
await page.waitForTimeout(60);
const mPicks = await page.$$(".measurements-card .pick");
ck("measure search 'thigh' narrows to 1", mPicks.length === 1 && !!(await page.$('.measurements-card .pick[data-m="thigh"]')));

await browser.close();
const failed = checks.filter(([, ok]) => !ok);
if (errors.length) console.log("\nERRORS:\n" + errors.join("\n"));
console.log("\n" + (failed.length === 0 && errors.length === 0 ? "PASS" : "FAIL (" + failed.length + " checks, " + errors.length + " errors)"));
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
