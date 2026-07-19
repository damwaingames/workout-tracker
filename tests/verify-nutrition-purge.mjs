import { verify } from "./harness.mjs";

/* ADR-0018: the nutrition domain was removed. Loading a pre-v5 store must purge every trace of
 * it — the Pantry catalogue plus every food-entry (`.food`) and legacy nutrition-scalar (`.nut.`)
 * log key — while any non-nutrition log data is left untouched, and the schema stamps v5. `load()`
 * normalises in memory only, so (like verify-class-day) a no-op click forces the save that
 * persists the purge before we read localStorage back. */
verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.click('[data-action="week"][data-week="1"]'); // no-op → save() materialises the seed store
  await page.waitForTimeout(60);

  const D1 = "b1.w1.d1";
  // Downgrade the fresh store to v4 and salt it with nutrition data + one survivor key.
  await page.evaluate(({ k, cell }) => {
    const st = JSON.parse(localStorage.getItem(k));
    st.version = 4;
    st.pantry = { "5000159407236": { barcode: "5000159407236", name: "Test Bar", per100g: { kcal: 500 } } };
    st.log[cell + ".food"] = [{ barcode: "5000159407236", grams: 40, meal: "snack" }]; // a pantry food entry
    st.log[cell + ".nut.kcal"] = "300"; // a legacy manual-grid nutrition scalar
    st.log[cell + ".done"] = true; // a non-nutrition survivor — must be left alone
    localStorage.setItem(k, JSON.stringify(st));
  }, { k: key, cell: D1 });

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op → save() persists the migrated store
  await page.waitForTimeout(60);
  const s = await ls();

  ck("store migrated to schema v5", s.version === 5);
  ck("Pantry catalogue removed", s.pantry === undefined);
  ck("food-entry (.food) key purged", s.log[`${D1}.food`] === undefined);
  ck("legacy nutrition scalar (.nut.) key purged", s.log[`${D1}.nut.kcal`] === undefined);
  ck("non-nutrition log data left untouched", s.log[`${D1}.done`] === true);

  // The stripped app has no nutrition UI: no per-routine Nutrition tab and no Health Connect publish.
  ck("no routine Nutrition tab rendered", (await page.$(".routine-tab")) === null);
  ck("no publish-to-Health-Connect button", (await page.$('[data-action="publish-nutrition"]')) === null);
});
