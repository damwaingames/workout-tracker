import { chromium } from "playwright";

const URL = process.env.WT_URL || "http://localhost:8765/";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// Fresh state.
await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(200);

// Enter Edit mode → rename input should appear, prefilled with current name.
await page.click('#edit-toggle');
const before = await page.inputValue("#block-name-input");
console.log("input prefilled with:", JSON.stringify(before));

// Type a new name char-by-char to exercise the live keystroke path + focus.
await page.click("#block-name-input");
await page.fill("#block-name-input", "");
await page.type("#block-name-input", "Glute Phase", { delay: 20 });

// Focus must survive the live picker-label patch (no full re-render).
const stillFocused = await page.evaluate(() => document.activeElement?.id === "block-name-input");
const optText = await page.evaluate(() =>
  document.querySelector('#block-select option:checked')?.textContent);
const stored = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("workout-tracker-v2")).blocks[0].name);
console.log("focus kept:", stillFocused, "| picker option:", JSON.stringify(optText), "| stored:", JSON.stringify(stored));

// Exit Edit → heading should show the new name as static text (no input).
await page.click("#edit-toggle");
await page.waitForTimeout(100);
const inputGone = await page.evaluate(() => !document.getElementById("block-name-input"));
const heading = (await page.textContent(".week-heading"))?.trim();
console.log("input gone after Done:", inputGone, "| heading:", JSON.stringify(heading));

// Persist across reload.
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(150);
const afterReload = await page.evaluate(() =>
  document.querySelector('#block-select option:checked')?.textContent);
console.log("name after reload:", JSON.stringify(afterReload));

await browser.close();

const ok =
  before === "Block 1" &&
  stillFocused === true &&
  optText === "Glute Phase" &&
  stored === "Glute Phase" &&
  inputGone === true &&
  heading?.startsWith("Glute Phase") &&
  afterReload === "Glute Phase" &&
  errors.length === 0;
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
