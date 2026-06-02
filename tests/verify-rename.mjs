import { verify } from "./harness.mjs";

verify(async ({ page, ck, ls, reset }) => {
  await reset();
  await page.waitForTimeout(200);

  // Edit mode → rename input appears, prefilled with the current name.
  await page.click("#edit-toggle");
  ck('rename input prefilled with "Block 1"', (await page.inputValue("#block-name-input")) === "Block 1");

  // Type a new name char-by-char to exercise the live keystroke path + focus.
  await page.click("#block-name-input");
  await page.fill("#block-name-input", "");
  await page.type("#block-name-input", "Glute Phase", { delay: 20 });

  // Focus must survive the live picker-label patch (no full re-render).
  ck("focus kept while typing the name",
    await page.evaluate(() => document.activeElement?.id === "block-name-input"));
  ck("picker option live-patched to new name",
    (await page.evaluate(() => document.querySelector("#block-select option:checked")?.textContent)) === "Glute Phase");
  ck("new name persisted to storage", (await ls()).blocks[0].name === "Glute Phase");

  // Exit Edit → heading shows the new name as static text (no input).
  await page.click("#edit-toggle");
  await page.waitForTimeout(100);
  ck("rename input gone after Done", await page.evaluate(() => !document.getElementById("block-name-input")));
  ck("heading shows new name", (await page.textContent(".week-heading"))?.trim().startsWith("Glute Phase"));

  // Persist across reload.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(150);
  ck("name survives reload",
    (await page.evaluate(() => document.querySelector("#block-select option:checked")?.textContent)) === "Glute Phase");
});
