import { chromium } from "playwright";
import { APP_VERSION } from "../constants.js";

// Reads the expected version straight from the source constant, so this never
// needs a manual edit on release — it just asserts the footer renders APP_VERSION.
const URL = process.env.WT_URL || "http://localhost:8765/";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "load" });
await page.waitForTimeout(300);

const tag = (await page.textContent("#version-tag"))?.trim();
const expected = "v" + APP_VERSION;
console.log("footer version tag:", JSON.stringify(tag), "· expected:", JSON.stringify(expected));

await browser.close();

const ok = tag === expected && errors.length === 0;
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
