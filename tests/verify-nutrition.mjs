import { verify } from "./harness.mjs";

verify(async ({ page, ck, ls, reset, key }) => {
  // A single-number cell (per-entry kcal, avg) → strip non-digits. The total/week
  // lines hold several numbers, so those are asserted with locale-tolerant regexes.
  const num = async (sel) => Number((await page.textContent(sel)).replace(/[^0-9.]/g, ""));
  const line = (scope) => page.textContent(`#nutrition-card [data-nut-line="${scope}"]`);

  // Open a day's finder → quick-entry form, fill it, submit. Keyed by the day's cell.
  const addFood = async (cell, { name, kcal, carb, fat, protein }) => {
    const sel = `#nutrition-card .food[data-cell="${cell}"]`;
    await page.click(`${sel} [data-action="food-open"]`);  // reveal the finder
    await page.click(`${sel} [data-action="form-open"]`);  // reveal the quick-entry form
    const set = async (n, v) => { if (v != null) await page.fill(`${sel} .food-quick-form input[name="${n}"]`, String(v)); };
    await set("name", name); await set("kcal", kcal); await set("carb", carb); await set("fat", fat); await set("protein", protein);
    await page.click(`${sel} .food-quick-form button[type="submit"]`);
    await page.waitForTimeout(40);
  };

  await reset();

  // ---- card shape ----
  ck("nutrition card present", await page.isVisible("#nutrition-card"));
  ck("7 day food blocks", (await page.$$("#nutrition-card .food")).length === 7);
  ck("each day has an Add food button", (await page.$$('#nutrition-card .food [data-action="food-open"]')).length === 7);
  ck("quick-entry form starts hidden", !(await page.isVisible('#nutrition-card .food[data-cell="b1.w1.d1"] .food-quick-form')));

  // ---- add a quick entry (derived totals) ----
  await addFood("b1.w1.d1", { name: "Oats", kcal: 2000, carb: 200, fat: 70, protein: 150 });
  const d1 = '#nutrition-card .food[data-cell="b1.w1.d1"]';
  ck("entry shows its name", (await page.textContent(d1 + " .food-name")) === "Oats");
  ck("entry shows its kcal = 2000", (await num(d1 + " .food-kcal")) === 2000);
  ck("day total line shows kcal + macros", /2[,.]?000 cal/.test(await page.textContent(d1 + " .food-total")) &&
    /200c/.test(await page.textContent(d1 + " .food-total")) && /70f/.test(await page.textContent(d1 + " .food-total")) && /150p/.test(await page.textContent(d1 + " .food-total")));

  const s1 = await ls();
  ck("entry persisted as a quick entry under foodKey",
    Array.isArray(s1.log["b1.w1.d1.food"]) && s1.log["b1.w1.d1.food"].length === 1 &&
    s1.log["b1.w1.d1.food"][0].name === "Oats" && s1.log["b1.w1.d1.food"][0].kcal === 2000 &&
    s1.log["b1.w1.d1.food"][0].carb === 200 && !("barcode" in s1.log["b1.w1.d1.food"][0]));

  // ---- second entry, another day: week + block accumulate, avg over kcal-days ----
  await addFood("b1.w1.d2", { kcal: 1000 });
  ck("week line kcal = 3000", /3[,.]?000 cal/.test(await line("week")));
  ck("week line carries macros 200/70/150", /200c/.test(await line("week")) && /70f/.test(await line("week")) && /150p/.test(await line("week")));
  ck("block line kcal = 3000 (only week 1 logged)", /3[,.]?000 cal/.test(await line("block")));
  ck("avg = 1500 kcal/day this week (3000 over 2 logged days)", /1[,.]?500\s*kcal\/day this week/.test(await page.textContent("#nutrition-card .nut-avg")));

  // ---- empty-nutrient entry is dropped (at least one nutrient must be > 0) ----
  await addFood("b1.w1.d3", { name: "ghost" });
  ck("all-zero quick entry not added", !("b1.w1.d3.food" in (await ls()).log));

  // ---- week switch: week isolates, block accumulates ----
  await page.click('#week-nav [data-action="week"][data-week="2"]');
  await page.waitForTimeout(40);
  ck("week 2 day blocks start empty (no food-list)", (await page.$$("#nutrition-card .food-list")).length === 0);
  ck("week 2 line = 0 cal", /^0 cal/.test((await line("week")).trim()));
  ck("block line still 3000 across weeks", /3[,.]?000 cal/.test(await line("block")));
  await addFood("b1.w2.d1", { kcal: 500 });
  ck("week 2 line = 500", /500 cal/.test(await line("week")));
  ck("block line accumulates = 3500", /3[,.]?500 cal/.test(await line("block")));

  // ---- back to week 1: entries persist ----
  await page.click('#week-nav [data-action="week"][data-week="1"]');
  await page.waitForTimeout(40);
  ck("week 1 d1 entry still 'Oats'", (await page.textContent(d1 + " .food-name")) === "Oats");

  // ---- remove an entry: list + totals update, key deleted when last entry goes ----
  await page.click('#nutrition-card .food[data-cell="b1.w1.d2"] [data-action="food-remove"]');
  await page.waitForTimeout(40);
  ck("d2 food key deleted once empty", !("b1.w1.d2.food" in (await ls()).log));
  ck("week line back to 2000 after removal", /2[,.]?000 cal/.test(await line("week")));

  // ---- migration: legacy .nut.* scalars fold into a quick entry on load ----
  await reset();
  // reset()'s reload reseeds defaults in memory but load() doesn't save, so storage is
  // empty until a mutation — prime it with one entry, then inject the legacy scalars.
  await addFood("b1.w1.d1", { kcal: 100 });
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    Object.assign(s.log, {
      "b1.w1.d4.nut.kcal": "1850", "b1.w1.d4.nut.carb": "77",
      "b1.w1.d4.nut.fat": "45", "b1.w1.d4.nut.protein": "154",
    });
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });

  const d4 = '#nutrition-card .food[data-cell="b1.w1.d4"]';
  ck("migrated scalars show as a quick entry", (await page.textContent(d4 + " .food-list")).includes("Logged total"));
  ck("migrated entry kcal = 1850", (await num(d4 + " .food-kcal")) === 1850);
  ck("migrated day total carries the macros", /77c/.test(await page.textContent(d4 + " .food-total")) &&
    /45f/.test(await page.textContent(d4 + " .food-total")) && /154p/.test(await page.textContent(d4 + " .food-total")));

  // A save (adding any entry) persists the migrated state → assert the scalars are gone.
  await addFood("b1.w1.d1", { kcal: 100 });
  const sm = await ls();
  ck("legacy .nut.* keys deleted after migration",
    !("b1.w1.d4.nut.kcal" in sm.log) && !("b1.w1.d4.nut.carb" in sm.log));
  ck("migrated entry persisted under foodKey",
    Array.isArray(sm.log["b1.w1.d4.food"]) && sm.log["b1.w1.d4.food"][0].kcal === 1850 && sm.log["b1.w1.d4.food"][0].protein === 154);
});
