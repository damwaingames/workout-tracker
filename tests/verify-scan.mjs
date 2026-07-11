import { verify } from "./harness.mjs";

/* Slice 3: camera barcode scanner (ADR-0003 — native BarcodeDetector, no decoder
 * library). Headless has no camera, so getUserMedia + BarcodeDetector are mocked via
 * addInitScript: a fake stream and a detector that returns a fixed barcode. The
 * "unsupported" leg force-removes BarcodeDetector (this Chromium ships it natively on a
 * secure origin) so scanSupported() reads false and the Scan button isn't drawn. */
verify(async ({ page, ck, reset, ls }) => {
  const BARCODE = "5000159461122";
  // Food lives in each routine card's Nutrition tab (slice 4): switch to it, then address
  // the cell's food block.
  const foodSel = (cell) => `#week-view .routine[data-cell="${cell}"] .food`;
  const nutTab = (cell) => page.click(`#week-view .routine[data-cell="${cell}"] .routine-tab[data-tab="nutrition"]`);

  // ---- 1) Unsupported: BarcodeDetector absent → no Scan button, other paths intact ----
  // Walk the prototype chain to delete the native BarcodeDetector, so the feature
  // detection (`"BarcodeDetector" in window`) reads false.
  await page.addInitScript(() => {
    let o = window;
    while (o) {
      if (Object.prototype.hasOwnProperty.call(o, "BarcodeDetector")) { delete o.BarcodeDetector; break; }
      o = Object.getPrototypeOf(o);
    }
  });
  await reset();
  const u = foodSel("b1.w1.d1");
  await nutTab("b1.w1.d1");
  await page.click(`${u} [data-action="food-open"]`);
  ck("Scan button absent when BarcodeDetector unsupported",
    (await page.$$(`${u} [data-action="food-scan"]`)).length === 0);
  ck("Find button still present when scanning unsupported",
    await page.isVisible(`${u} [data-action="food-find"]`));

  // ---- 2) Supported: mock the camera + detector; scan routes a barcode → OFF lookup ----
  await page.addInitScript((code) => {
    // A deterministic BarcodeDetector that always "sees" the test barcode. Defined on
    // window, so it overrides the native one for this leg.
    window.BarcodeDetector = class {
      constructor() {}
      static getSupportedFormats() { return Promise.resolve(["ean_13"]); }
      async detect() { return [{ rawValue: code, format: "ean_13" }]; }
    };
    // A fake camera: getUserMedia hands back an empty (but real) MediaStream, so the
    // <video> srcObject assignment is valid and every track.stop() is a no-op.
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
  }, BARCODE);
  await reset();

  // Mock OFF: the scanned barcode resolves to a product; any other → not found.
  await page.route(/openfoodfacts\.org/, async (route) => {
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (route.request().url().includes("/api/v2/product/" + BARCODE)) {
      return json({ status: 1, product: { code: BARCODE, product_name: "Mars Bar", brands: "Mars", nutriments: { "energy-kcal_100g": 449, "carbohydrates_100g": 65, "fat_100g": 17, "proteins_100g": 4 } } });
    }
    return json({ status: 0 });
  });

  const sel = foodSel("b1.w1.d1");
  await nutTab("b1.w1.d1");
  await page.click(`${sel} [data-action="food-open"]`);
  ck("Scan button present when BarcodeDetector supported",
    await page.isVisible(`${sel} [data-action="food-scan"]`));

  // The camera preview sits above the results (right under the Scan button) so it opens in view,
  // not below the fold — regression guard for that DOM ordering.
  ck("scanner preview precedes the results list in the finder", await page.evaluate((s) => {
    const finder = document.querySelector(s + " .food-finder");
    const scanner = finder.querySelector(".food-scanner");
    const results = finder.querySelector(".food-results");
    return !!(scanner.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, sel));

  await page.click(`${sel} [data-action="food-scan"]`);
  // The scan resolves with the barcode, runs the lookup, and paints the result row.
  await page.waitForSelector(`${sel} .food-result[data-barcode="${BARCODE}"]`);
  ck("scan → barcode lookup shows the product",
    (await page.textContent(`${sel} .food-result-name`)) === "Mars Bar");
  ck("scanner preview hidden again after a hit", !(await page.isVisible(`${sel} .food-scanner`)));
  ck("search box seeded with the scanned barcode",
    (await page.inputValue(`${sel} .food-search`)) === BARCODE);

  // Confirm a portion → entry logged + Food cached in the Pantry (the existing add path).
  await page.click(`${sel} .food-result[data-barcode="${BARCODE}"] [data-action="food-pick"]`);
  await page.fill(`${sel} .food-result[data-barcode="${BARCODE}"] input[name="grams"]`, "100");
  await page.click(`${sel} .food-result[data-barcode="${BARCODE}"] .food-grams-form button[type="submit"]`);
  await page.waitForTimeout(50);
  const s = await ls();
  ck("scanned food logged as a pantry entry", s.log["b1.w1.d1.food"][0].barcode === BARCODE);
  ck("scanned food cached in the Pantry", !!(s.pantry[BARCODE] && s.pantry[BARCODE].name === "Mars Bar"));

  // ---- 3) Cancel: open the scanner, cancel before a hit → preview hides, nothing logged ----
  // Re-stub the detector live to never find a code, so Cancel wins the race (addInitScript
  // won't re-run without a reload). scanBarcode reads window.BarcodeDetector at start.
  await page.evaluate(() => {
    window.BarcodeDetector = class { constructor() {} async detect() { return []; } };
  });
  const d2 = foodSel("b1.w1.d2");
  await nutTab("b1.w1.d2");
  await page.click(`${d2} [data-action="food-open"]`);
  await page.click(`${d2} [data-action="food-scan"]`);
  await page.waitForSelector(`${d2} .food-scanner:not([hidden])`);
  ck("scanner preview shows while scanning", await page.isVisible(`${d2} .food-scanner`));
  await page.click(`${d2} [data-action="food-scan-cancel"]`);
  await page.waitForTimeout(50);
  ck("Cancel hides the scanner preview", !(await page.isVisible(`${d2} .food-scanner`)));
  ck("Cancel logs no food entry", !(await ls()).log["b1.w1.d2.food"]);
});
