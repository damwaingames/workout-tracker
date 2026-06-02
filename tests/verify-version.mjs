import { verify } from "./harness.mjs";
import { APP_VERSION } from "../constants.js";

// Reads the expected version straight from source, so this never needs a manual
// edit on release — it just asserts the footer renders APP_VERSION.
verify(async ({ page, ck, url }) => {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(300);
  const tag = (await page.textContent("#version-tag"))?.trim();
  const expected = "v" + APP_VERSION;
  console.log("footer version tag:", JSON.stringify(tag), "· expected:", JSON.stringify(expected));
  ck("footer shows " + expected, tag === expected);
});
