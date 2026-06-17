import { verify } from "./harness.mjs";

/* Slice 2: Open Food Facts lookup → Pantry → food entries. The network is mocked via
 * page.route so the test is offline-safe and deterministic; `offline` flips the route to
 * abort, standing in for no signal. */
verify(async ({ page, ck, ls, reset, ignoreError }) => {
  const num = async (sel) => Number((await page.textContent(sel)).replace(/[^0-9.]/g, ""));
  let offline = false;
  // The offline test aborts a request, which the browser logs as a net error before the
  // app's catch handles it — expected, so don't let it fail the run.
  ignoreError("Failed to load resource");

  await reset();

  await page.route(/openfoodfacts\.org/, async (route) => {
    if (offline) return route.abort("failed");
    const url = route.request().url();
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    // v2 search: products[] (a brands array is also tolerated by toFood, so test that).
    if (url.includes("/api/v2/search")) {
      return json({ products: [
        { code: "111", product_name: "Greek Yogurt", brands: ["Fage"], nutriments: { "energy-kcal_100g": 97, "carbohydrates_100g": 4, "fat_100g": 5, "proteins_100g": 9 } },
        { code: "222", product_name: "Greek Style Yogurt", brands: "Lidl", nutriments: { "energy-kcal_100g": 120, "carbohydrates_100g": 6, "fat_100g": 7, "proteins_100g": 8 } },
      ] });
    }
    if (url.includes("/api/v2/product/5000159461122")) {
      return json({ status: 1, product: { code: "5000159461122", product_name: "Mars Bar", brands: "Mars", nutriments: { "energy-kcal_100g": 449, "carbohydrates_100g": 65, "fat_100g": 17, "proteins_100g": 4 } } });
    }
    return json({ status: 0 }); // any other barcode → not found
  });

  // Food now lives in each day card's Nutrition tab (slice 4). Switch the day to that
  // tab, then address its food block by the cell-scoped selector.
  const foodSel = (cell) => `#week-view .day[data-cell="${cell}"] .food`;
  const nutTab = (cell) => page.click(`#week-view .day[data-cell="${cell}"] .day-tab[data-tab="nutrition"]`);
  // Open finder, run a Find, wait for the results list to settle.
  const find = async (cell, query) => {
    const sel = foodSel(cell);
    await nutTab(cell);
    await page.click(`${sel} [data-action="food-open"]`);
    await page.fill(`${sel} .food-search`, query);
    await page.click(`${sel} [data-action="food-find"]`);
    return sel;
  };
  // Pick a result by barcode, enter grams, confirm.
  const pick = async (sel, barcode, grams) => {
    await page.click(`${sel} .food-result[data-barcode="${barcode}"] [data-action="food-pick"]`);
    await page.fill(`${sel} .food-result[data-barcode="${barcode}"] input[name="grams"]`, String(grams));
    await page.click(`${sel} .food-result[data-barcode="${barcode}"] .food-grams-form button[type="submit"]`);
    await page.waitForTimeout(50);
  };

  // ---- finder opens; empty Pantry shows the empty-state ----
  await nutTab("b1.w1.d1");
  await page.click(`${foodSel("b1.w1.d1")} [data-action="food-open"]`);
  ck("finder reveals on Add food", await page.isVisible(`${foodSel("b1.w1.d1")} .food-finder`));
  ck("empty pantry shows empty-state row", await page.isVisible(`${foodSel("b1.w1.d1")} .food-result-empty`));
  await page.click(`${foodSel("b1.w1.d1")} [data-action="food-close"]`);

  // ---- one finder open at a time: opening another day's finder closes the first ----
  // (foundFoods is module-global, so a stale open finder's hits would otherwise strand a
  // pick on it — foodOpen sweeps other finders shut so the invariant the code assumes holds.)
  await nutTab("b1.w1.d1");
  await page.click(`${foodSel("b1.w1.d1")} [data-action="food-open"]`);
  await nutTab("b1.w1.d2");
  await page.click(`${foodSel("b1.w1.d2")} [data-action="food-open"]`);
  ck("opening a second finder closes the first", !(await page.isVisible(`${foodSel("b1.w1.d1")} .food-finder`)));
  ck("the closed finder's Add-food button is restored", await page.isVisible(`${foodSel("b1.w1.d1")} .food-add-btn`));
  await page.click(`${foodSel("b1.w1.d2")} [data-action="food-close"]`);

  // ---- name search → 2 OFF hits ----
  const d1 = await find("b1.w1.d1", "greek yogurt");
  await page.waitForSelector(`${d1} .food-result[data-barcode="111"]`);
  ck("name search returns 2 OFF hits", (await page.$$(`${d1} .food-result`)).length === 2);
  ck("hit shows name + brand + kcal/100g", /Fage/.test(await page.textContent(`${d1} .food-result[data-barcode="111"] .food-result-meta`)));

  // ---- pick → grams → entry + Pantry cache + derived total ----
  await pick(d1, "111", 200);
  const s1 = await ls();
  ck("pantry entry persisted { barcode, grams }",
    Array.isArray(s1.log["b1.w1.d1.food"]) && s1.log["b1.w1.d1.food"][0].barcode === "111" && s1.log["b1.w1.d1.food"][0].grams === 200);
  ck("food cached in the Pantry by barcode",
    s1.pantry && s1.pantry["111"] && s1.pantry["111"].name === "Greek Yogurt" && s1.pantry["111"].per100g.kcal === 97);
  ck("entry shows the cached food's name", (await page.textContent(d1 + " .food-name")) === "Greek Yogurt");
  ck("derived kcal = 97×200/100 = 194", (await num(d1 + " .food-kcal")) === 194);
  ck("day total derives macros (8c/10f/18p)", /8c/.test(await page.textContent(d1 + " .food-total")) &&
    /10f/.test(await page.textContent(d1 + " .food-total")) && /18p/.test(await page.textContent(d1 + " .food-total")));

  // ---- barcode lookup → pick ----
  const d2 = await find("b1.w1.d2", "5000159461122");
  await page.waitForSelector(`${d2} .food-result[data-barcode="5000159461122"]`);
  ck("barcode lookup returns the product", (await page.textContent(`${d2} .food-result-name`)) === "Mars Bar");
  await pick(d2, "5000159461122", 100);
  ck("barcode entry kcal = 449 (100g)", (await num(d2 + " .food-kcal")) === 449);
  ck("Mars cached in pantry", (await ls()).pantry["5000159461122"].name === "Mars Bar");

  // ---- Pantry quick-pick: both cached foods, filtered locally, NO Find ----
  const d3 = foodSel("b1.w1.d3");
  await nutTab("b1.w1.d3");
  await page.click(`${d3} [data-action="food-open"]`);
  ck("pantry quick-pick lists both cached foods", (await page.$$(`${d3} .food-result`)).length === 2);
  await page.fill(`${d3} .food-search`, "mars");
  ck("local filter narrows to 1", (await page.$$(`${d3} .food-result`)).length === 1);
  await pick(d3, "5000159461122", 50);
  ck("pantry pick logged an entry (offline path, no Find)",
    (await ls()).log["b1.w1.d3.food"][0].barcode === "5000159461122");
  ck("pantry stayed append-only (still 2 foods)", Object.keys((await ls()).pantry).length === 2);

  // The results list shows a transient "Searching…" row first, so wait for the settled
  // message (not just any .food-result-empty) before asserting.
  const settled = (sel, re) => page.waitForFunction(
    ([s, src]) => new RegExp(src).test(document.querySelector(s + " .food-results").textContent),
    [sel, re.source]);

  // ---- unknown barcode → offer a local add (ADR-0004: a barcode can be authored locally) ----
  const d5 = await find("b1.w1.d5", "9999999999999");
  await settled(d5, /add it to your foods/);
  ck("unknown barcode offers a local add (with the barcode)",
    await page.isVisible(`${d5} [data-action="food-add-local"][data-barcode="9999999999999"]`));
  await page.click(`${d5} [data-action="food-close"]`);

  // ---- offline: Find fails gracefully; pantry pick still works ----
  offline = true;
  const d6 = await find("b1.w1.d6", "greek yogurt");
  await settled(d6, /reach Open Food Facts/);
  ck("offline Find shows the offline fallback message", /Can.t reach Open Food Facts/.test(await page.textContent(`${d6} .food-results`)));
  await page.fill(`${d6} .food-search`, "greek");
  ck("pantry pick still works offline (local filter)", (await page.$$(`${d6} .food-result[data-barcode="111"]`)).length === 1);
});
