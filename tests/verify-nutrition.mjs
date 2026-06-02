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
// Read a total/avg cell as a plain number (locale-agnostic: strip non-digits).
const num = async (sel) => Number((await page.textContent(sel)).replace(/[^0-9.]/g, ""));

await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await page.reload({ waitUntil: "load" });

// ---- card shape ----
ck("nutrition card present", await page.isVisible("#nutrition-card"));
ck("7 day input rows", (await page.$$("#nutrition-card .nut-row:not(.nut-head):not(.nut-total)")).length === 7);
ck("4 inputs on day 1 (kcal+C+F+P)", (await page.$$('#nutrition-card .nut-row:not(.nut-head):not(.nut-total) >> nth=0 >> .nut-val')).length === 4);

// ---- fill week 1 ----
await page.fill('[data-k="b1.w1.d1.nut.kcal"]', "2000");
await page.fill('[data-k="b1.w1.d1.nut.carb"]', "200");
await page.fill('[data-k="b1.w1.d1.nut.fat"]', "70");
await page.fill('[data-k="b1.w1.d1.nut.protein"]', "150");
await page.fill('[data-k="b1.w1.d2.nut.kcal"]', "1800");
await page.waitForTimeout(60);

const s = await ls();
ck("values persisted under .nut. keys", s.log["b1.w1.d1.nut.kcal"] === "2000" && s.log["b1.w1.d1.nut.carb"] === "200" && s.log["b1.w1.d2.nut.kcal"] === "1800");

// ---- week totals live-patched ----
ck("week kcal total = 3800", (await num('[data-nut-total="week-kcal"]')) === 3800);
ck("week carb total = 200", (await num('[data-nut-total="week-carb"]')) === 200);
ck("week fat total = 70", (await num('[data-nut-total="week-fat"]')) === 70);
ck("week protein total = 150", (await num('[data-nut-total="week-protein"]')) === 150);
// only week 1 has data, so block == week here
ck("block kcal total = 3800", (await num('[data-nut-total="block-kcal"]')) === 3800);

// ---- avg kcal/day (2 days logged kcal → 3800/2 = 1900) ----
const avg = await page.textContent("#nut-avg");
ck("avg shows 1900 kcal/day this week", /1[,.]?900\s*kcal\/day this week/.test(avg));

// ---- switch week: totals isolate, block accumulates ----
await page.click('#week-nav [data-action="week"][data-week="2"]');
await page.waitForTimeout(40);
ck("week 2 starts empty (kcal input blank)", (await page.inputValue('[data-k="b1.w2.d1.nut.kcal"]')) === "");
ck("week 2 total resets to 0", (await num('[data-nut-total="week-kcal"]')) === 0);
await page.fill('[data-k="b1.w2.d1.nut.kcal"]', "1000");
await page.waitForTimeout(40);
ck("week 2 total = 1000", (await num('[data-nut-total="week-kcal"]')) === 1000);
ck("block total accumulates = 4800", (await num('[data-nut-total="block-kcal"]')) === 4800);

// ---- back to week 1: values still there ----
await page.click('#week-nav [data-action="week"][data-week="1"]');
await page.waitForTimeout(40);
ck("week 1 kcal input still 2000", (await page.inputValue('[data-k="b1.w1.d1.nut.kcal"]')) === "2000");

// ---- clearing a value removes the key + updates total ----
await page.fill('[data-k="b1.w1.d2.nut.kcal"]', "");
await page.waitForTimeout(40);
ck("cleared key deleted from log", !("b1.w1.d2.nut.kcal" in (await ls()).log));
ck("week total back to 2000", (await num('[data-nut-total="week-kcal"]')) === 2000);

await browser.close();
const failed = checks.filter(([, ok]) => !ok);
if (errors.length) console.log("\nERRORS:\n" + errors.join("\n"));
console.log("\n" + (failed.length === 0 && errors.length === 0 ? "PASS" : "FAIL (" + failed.length + " checks, " + errors.length + " errors)"));
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
