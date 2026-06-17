import { verify } from "./harness.mjs";

/* Trusted, editable Pantry (Feature 1). The network is mocked via page.route so the test
 * is offline-safe and deterministic. Built vertically, tracer bullet first: edit a logged
 * entry in place, then macro display, then trusted authoring / correction / propagation. */
verify(async ({ page, ck, ls, reset }) => {
  const num = async (sel) => Number((await page.textContent(sel)).replace(/[^0-9.]/g, ""));
  await reset();

  let marsLookups = 0; // counts OFF product calls for the Mars barcode (proves the short-circuit)
  await page.route(/openfoodfacts\.org/, async (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/api/v2/search")) {
      // A name search returns the *OFF* Mars (449) — distinct from the trusted local one (500).
      return json({ products: [
        { code: "5000159461122", product_name: "Mars Bar", brands: "Mars",
          nutriments: { "energy-kcal_100g": 449, "carbohydrates_100g": 65, "fat_100g": 17, "proteins_100g": 4 } },
      ] });
    }
    if (url.includes("/api/v2/product/5000159461122")) {
      marsLookups++;
      return json({ status: 1, product: { code: "5000159461122", product_name: "Mars Bar", brands: "Mars",
        nutriments: { "energy-kcal_100g": 449, "carbohydrates_100g": 65, "fat_100g": 17, "proteins_100g": 4 } } });
    }
    return json({ status: 0 }); // any other barcode → not found
  });

  const foodSel = (cell) => `#week-view .routine[data-cell="${cell}"] .food`;
  const nutTab = (cell) => page.click(`#week-view .routine[data-cell="${cell}"] .routine-tab[data-tab="nutrition"]`);
  const find = async (cell, query) => {
    const sel = foodSel(cell);
    await nutTab(cell);
    await page.click(`${sel} [data-action="food-open"]`);
    await page.fill(`${sel} .food-search`, query);
    await page.click(`${sel} [data-action="food-find"]`);
    return sel;
  };
  const pick = async (sel, barcode, grams) => {
    await page.click(`${sel} .food-result[data-barcode="${barcode}"] [data-action="food-pick"]`);
    await page.fill(`${sel} .food-result[data-barcode="${barcode}"] input[name="grams"]`, String(grams));
    await page.click(`${sel} .food-result[data-barcode="${barcode}"] .food-grams-form button[type="submit"]`);
    await page.waitForTimeout(50);
  };

  // ---- Slice 1 (tracer): edit grams on a logged pantry entry, in place ----
  const d1 = await find("b1.w1.d1", "5000159461122");
  await page.waitForSelector(`${d1} .food-result[data-barcode="5000159461122"]`);
  await pick(d1, "5000159461122", 100);
  ck("entry logged at 100g → 449 kcal", (await num(`${d1} .food-kcal`)) === 449);

  await page.click(`${d1} .food-item [data-action="food-grams-edit"]`);
  await page.fill(`${d1} .food-grams-edit-form input[name="grams"]`, "150");
  await page.click(`${d1} .food-grams-edit-form button[type="submit"]`);
  await page.waitForTimeout(50);
  const s1 = await ls();
  ck("grams edit persisted in place (150g, same barcode, still one entry)",
    s1.log["b1.w1.d1.food"].length === 1 &&
    s1.log["b1.w1.d1.food"][0].grams === 150 &&
    s1.log["b1.w1.d1.food"][0].barcode === "5000159461122");
  ck("grams edit re-derives kcal = 449×150/100 = 674", (await num(`${d1} .food-kcal`)) === 674);

  // ---- Slice 2: edit a quick-entry row in place ----
  const q = foodSel("b1.w1.d2");
  await nutTab("b1.w1.d2");
  await page.click(`${q} [data-action="food-open"]`);
  await page.click(`${q} .food-quick [data-action="form-open"]`);
  await page.fill(`${q} .food-quick-form input[name="name"]`, "Banana");
  await page.fill(`${q} .food-quick-form input[name="kcal"]`, "90");
  await page.click(`${q} .food-quick-form button[type="submit"]`);
  await page.waitForTimeout(50);
  ck("quick entry logged → 90 kcal", (await num(`${q} .food-kcal`)) === 90);

  await page.click(`${q} .food-item [data-action="food-quick-edit"]`);
  await page.fill(`${q} .food-quick-edit-form input[name="name"]`, "Banana, large");
  await page.fill(`${q} .food-quick-edit-form input[name="kcal"]`, "120");
  await page.click(`${q} .food-quick-edit-form button[type="submit"]`);
  await page.waitForTimeout(50);
  const s2 = await ls();
  ck("quick edit persisted in place (120 kcal, renamed, still one entry)",
    s2.log["b1.w1.d2.food"].length === 1 &&
    s2.log["b1.w1.d2.food"][0].kcal === 120 &&
    s2.log["b1.w1.d2.food"][0].name === "Banana, large");
  ck("quick edit re-renders kcal = 120", (await num(`${q} .food-kcal`)) === 120);

  // ---- Slice 3: full macro line on routine rows + pick cards (not just kcal) ----
  const md = await find("b1.w1.d3", "5000159461122");
  await page.waitForSelector(`${md} .food-result[data-barcode="5000159461122"]`);
  const cardMeta = await page.textContent(`${md} .food-result-meta`);
  ck("pick card shows macros per 100g", /65c/.test(cardMeta) && /17f/.test(cardMeta) && /4p/.test(cardMeta));
  await pick(md, "5000159461122", 100);
  const rowMacros = await page.textContent(`${md} .food-item .food-macros`);
  ck("routine row shows the entry's macro contribution", /65c/.test(rowMacros) && /17f/.test(rowMacros) && /4p/.test(rowMacros));

  // ---- Slice 4: author a local Food on a not-found barcode (→ trusted, then logged) ----
  const la = await find("b1.w1.d4", "0000000000000");
  await page.waitForSelector(`${la} [data-action="food-add-local"]`);
  ck("not-found barcode offers a local add (with the barcode)",
    await page.isVisible(`${la} [data-action="food-add-local"][data-barcode="0000000000000"]`));
  await page.click(`${la} [data-action="food-add-local"]`);
  await page.fill(`${la} .food-detail-form input[name="name"]`, "Homemade Granola");
  await page.fill(`${la} .food-detail-form input[name="kcal"]`, "400");
  await page.fill(`${la} .food-detail-form input[name="carb"]`, "60");
  await page.fill(`${la} .food-detail-form input[name="fat"]`, "12");
  await page.fill(`${la} .food-detail-form input[name="protein"]`, "9");
  await page.click(`${la} .food-detail-form button[type="submit"]`);
  await page.waitForTimeout(50);
  const s4 = await ls();
  ck("authored Food cached in Pantry as trusted",
    s4.pantry["0000000000000"] && s4.pantry["0000000000000"].trusted === true &&
    s4.pantry["0000000000000"].name === "Homemade Granola" && s4.pantry["0000000000000"].per100g.kcal === 400);
  // After authoring, the new food is offered as a pickable row with its grams form open.
  await page.fill(`${la} .food-result[data-barcode="0000000000000"] input[name="grams"]`, "50");
  await page.click(`${la} .food-result[data-barcode="0000000000000"] .food-grams-form button[type="submit"]`);
  await page.waitForTimeout(50);
  const s4b = await ls();
  ck("authored Food logged as a pantry entry (50g)",
    s4b.log["b1.w1.d4.food"][0].barcode === "0000000000000" && s4b.log["b1.w1.d4.food"][0].grams === 50);
  ck("authored entry derives kcal = 400×50/100 = 200", (await num(`${la} .food-kcal`)) === 200);

  // ---- Slice 5: correct an OFF food from a finder row → trusted, numbers change ----
  const ce = await find("b1.w1.d5", "5000159461122");
  await page.waitForSelector(`${ce} .food-result[data-barcode="5000159461122"]`);
  await page.click(`${ce} .food-result[data-barcode="5000159461122"] [data-action="food-edit"]`);
  ck("correct form prefills the current kcal (449)", (await page.inputValue(`${ce} .food-detail-form input[name="kcal"]`)) === "449");
  await page.fill(`${ce} .food-detail-form input[name="kcal"]`, "500");
  await page.click(`${ce} .food-detail-form button[type="submit"]`);
  await page.waitForTimeout(50);
  const s5 = await ls();
  ck("corrected food is trusted with the new kcal",
    s5.pantry["5000159461122"].trusted === true && s5.pantry["5000159461122"].per100g.kcal === 500);

  // ---- Slice 6: a trusted barcode short-circuits the re-lookup (OFF never consulted) ----
  const before = marsLookups;
  const sc = await find("b1.w1.d6", "5000159461122");
  await page.waitForSelector(`${sc} .food-result[data-barcode="5000159461122"]`);
  ck("trusted barcode shows the local numbers (500), not OFF's 449",
    /500/.test(await page.textContent(`${sc} .food-result-meta`)));
  ck("trusted barcode did NOT consult Open Food Facts", marsLookups === before);

  // ---- Slice 7: a name-search pick won't overwrite a trusted food (foodPick guard) ----
  const ng = await find("b1.w1.d7", "mars"); // name search → OFF Mars (449), but it's trusted (500)
  await page.waitForSelector(`${ng} .food-result[data-barcode="5000159461122"]`);
  await pick(ng, "5000159461122", 100);
  const s7 = await ls();
  ck("name-search pick did not overwrite the trusted record (still 500, trusted)",
    s7.pantry["5000159461122"].per100g.kcal === 500 && s7.pantry["5000159461122"].trusted === true);
  ck("logged entry derives from the trusted 500, not OFF's 449", (await num(`${ng} .food-kcal`)) === 500);

  // ---- Slice 8: correcting a food from a routine row propagates to every routine that logged it ----
  // Mars (trusted, 500) is logged on d3 (100g) and d7 (100g) — correct it from d3's row.
  const d3sel = foodSel("b1.w1.d3"), d7sel = foodSel("b1.w1.d7");
  ck("d3 + d7 both derive the trusted 500 before correction",
    (await num(`${d3sel} .food-kcal`)) === 500 && (await num(`${d7sel} .food-kcal`)) === 500);
  await page.click(`${d3sel} .food-item [data-action="food-edit"]`);
  ck("routine-row correct prefills the trusted record (500), not a stale OFF hit",
    (await page.inputValue(`${d3sel} .food-detail-form input[name="kcal"]`)) === "500");
  await page.fill(`${d3sel} .food-detail-form input[name="kcal"]`, "600");
  await page.click(`${d3sel} .food-detail-form button[type="submit"]`);
  await page.waitForTimeout(50);
  ck("correction shows on the routine it was edited (d3 → 600)", (await num(`${d3sel} .food-kcal`)) === 600);
  ck("correction propagates to another routine that logged it (d7 → 600)", (await num(`${d7sel} .food-kcal`)) === 600);
  const s8 = await ls();
  ck("food stays trusted after a routine-row correction",
    s8.pantry["5000159461122"].trusted === true && s8.pantry["5000159461122"].per100g.kcal === 600);
});
