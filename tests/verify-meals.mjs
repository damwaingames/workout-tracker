import { verify } from "./harness.mjs";

/* Meal types (v3.5.0): a food entry carries the meal it was logged under; the Nutrition tab
 * groups entries under Breakfast / Lunch / Dinner / Snack headings with per-meal subtotals, and
 * the finder's meal picker (pre-selected to the current hour) sets a new entry's meal. The
 * Health Connect projection then emits one record per meal (covered pure in verify-health-export
 * — ADR-0017). Here we drive the real UI: pick a meal, log food, and assert the grouping, the
 * stored meal, and that removal stays index-correct across the grouping. */
verify(async ({ page, ck, ls, reset }) => {
  const foodSel = (cell) => `#week-view .routine[data-cell="${cell}"] .food`;
  const nutTab = (cell) => page.click(`#week-view .routine[data-cell="${cell}"] .routine-tab[data-tab="nutrition"]`);

  // Open the finder, pick a meal, then quick-add a food under it.
  const addFood = async (cell, meal, { name, kcal, carb, fat, protein }) => {
    const sel = foodSel(cell);
    await nutTab(cell);
    await page.click(`${sel} [data-action="food-open"]`);
    await page.check(`${sel} .food-meal-select input[value="${meal}"]`);
    await page.click(`${sel} [data-action="form-open"]`);
    const set = async (n, v) => { if (v != null) await page.fill(`${sel} .food-quick-form input[name="${n}"]`, String(v)); };
    await set("name", name); await set("kcal", kcal); await set("carb", carb); await set("fat", fat); await set("protein", protein);
    await page.click(`${sel} .food-quick-form button[type="submit"]`);
    await page.waitForTimeout(40);
  };

  await reset();
  const d1 = foodSel("b1.w1.d1");

  // ---- the finder offers all four meals, exactly one pre-checked (current-hour default) ----
  await nutTab("b1.w1.d1");
  await page.click(`${d1} [data-action="food-open"]`);
  ck("meal picker offers the four meals", (await page.$$(`${d1} .food-meal-select .food-meal-opt`)).length === 4);
  ck("exactly one meal pre-selected on open", (await page.$$(`${d1} .food-meal-select input:checked`)).length === 1);
  await page.click(`${d1} [data-action="food-close"]`);

  // ---- log breakfast → a Breakfast section with its subtotal; the entry stores its meal ----
  await addFood("b1.w1.d1", "breakfast", { name: "Oats", kcal: 400, carb: 60, fat: 8, protein: 15 });
  ck("Breakfast section renders", await page.isVisible(`${d1} .food-meal[data-meal="breakfast"]`));
  ck("Breakfast entry shows its name", (await page.textContent(`${d1} .food-meal[data-meal="breakfast"] .food-name`)) === "Oats");
  ck("Breakfast subtotal shows the meal's kcal", /400 cal/.test(await page.textContent(`${d1} .food-meal[data-meal="breakfast"] .food-meal-sub`)));
  ck("entry stores meal = breakfast", (await ls()).log["b1.w1.d1.food"][0].meal === "breakfast");

  // ---- log lunch on the same day → a second section; the day total sums both meals ----
  await addFood("b1.w1.d1", "lunch", { name: "Salad", kcal: 300, carb: 20, fat: 12, protein: 25 });
  ck("Lunch section renders alongside Breakfast", await page.isVisible(`${d1} .food-meal[data-meal="lunch"]`));
  ck("two meal sections now present", (await page.$$(`${d1} .food-meal`)).length === 2);
  ck("day total sums both meals (700 cal)", /700 cal/.test(await page.textContent(`${d1} .food-total`)));
  ck("second entry stores meal = lunch", (await ls()).log["b1.w1.d1.food"][1].meal === "lunch");

  // ---- removal stays index-correct across the grouping: removing the breakfast entry (index 0)
  //      must leave the lunch entry (index 1) intact, not delete the wrong row ----
  await page.click(`${d1} .food-meal[data-meal="breakfast"] [data-action="food-remove"]`);
  await page.waitForTimeout(40);
  ck("Breakfast section gone once its only entry is removed", !(await page.isVisible(`${d1} .food-meal[data-meal="breakfast"]`)));
  ck("Lunch section survives (index-correct removal)", await page.isVisible(`${d1} .food-meal[data-meal="lunch"]`));
  ck("the survivor is the lunch entry", (await page.textContent(`${d1} .food-meal[data-meal="lunch"] .food-name`)) === "Salad");
  const s = await ls();
  ck("one entry remains, meal = lunch", s.log["b1.w1.d1.food"].length === 1 && s.log["b1.w1.d1.food"][0].meal === "lunch");
});
