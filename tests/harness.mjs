/* Shared scaffold for the verify-*.mjs scripts. Owns the whole lifecycle —
 * browser launch, console/pageerror capture, the check tally, and the pass/fail
 * exit — so each script is reduced to only its unique assertions.
 *
 * Each script stays standalone: verify() does its own launch + process.exit, so
 * `WT_URL=<live deploy> node verify-version.mjs` still works, and the runner
 * spawns each file unchanged. STORAGE_KEY is imported from source (not re-typed)
 * and passed into page.evaluate, so the storage key lives in exactly one place. */

import { chromium } from "playwright";
import { STORAGE_KEY } from "../constants.js";

const url = process.env.WT_URL || "http://127.0.0.1:8765/";

export async function verify(run) {
  const errors = [];
  const checks = [];
  const ck = (label, cond) => { checks.push(!!cond); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const ls = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
  // Fresh load: wipe storage then reload so the app reseeds its defaults.
  const reset = async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
    await page.reload({ waitUntil: "load" });
  };

  try {
    await run({ page, ck, ls, reset, url, key: STORAGE_KEY });
  } catch (e) {
    // A thrown assertion (e.g. a selector that vanished after a refactor) becomes
    // a normal FAIL with its stack captured, rather than an unhandled rejection.
    errors.push("threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((ok) => !ok).length;
  if (errors.length) console.log("\nERRORS:\n" + errors.join("\n"));
  const ok = failed === 0 && errors.length === 0;
  console.log("\n" + (ok ? "PASS" : `FAIL (${failed} checks, ${errors.length} errors)`));
  process.exit(ok ? 0 : 1);
}
