import { verify } from "./harness.mjs";

/* Publish to Health Connect (v3.4.0): the Nutrition card's Publish button hands the nutrition
 * projection (allNutritionRecords) to the Android share sheet as an application/json file, for the
 * companion app to receive and write (ADR-0015). Headless Chromium has no Web Share, so we mock
 * canShare/share to force the button on and capture what gets shared — then assert the shared file
 * IS the projection. Also checks the button is gated out when there's nothing to publish. */
verify(async ({ page, ck, reset }) => {
  // Log a day's food through the real UI (reset()'s reseed isn't persisted until a mutation, so
  // this is also how we get a Store to publish from) — mirrors verify-nutrition's addFood.
  const foodSel = (cell) => `#week-view .routine[data-cell="${cell}"] .food`;
  const addFood = async (cell, { name, kcal, carb, fat, protein }) => {
    const sel = foodSel(cell);
    await page.click(`#week-view .routine[data-cell="${cell}"] .routine-tab[data-tab="nutrition"]`);
    await page.click(`${sel} [data-action="food-open"]`);
    await page.click(`${sel} [data-action="form-open"]`);
    const set = async (n, v) => { if (v != null) await page.fill(`${sel} .food-quick-form input[name="${n}"]`, String(v)); };
    await set("name", name); await set("kcal", kcal); await set("carb", carb); await set("fat", fat); await set("protein", protein);
    await page.click(`${sel} .food-quick-form button[type="submit"]`);
    await page.waitForTimeout(40);
  };

  // Force Web Share "supported" and capture the shared payload (headless has neither API).
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = data; };
  });

  await reset();
  await page.waitForTimeout(80);

  // ---- Gated out when there's no nutrition to publish ----
  ck("no Publish button with zero nutrition", (await page.$('[data-action="publish-nutrition"]')) === null);

  // ---- Log a day's food; the button now appears (nutrition exists + Web Share mocked-on) ----
  await addFood("b1.w1.d1", { name: "Test meal", kcal: 500, carb: 50, fat: 10, protein: 30 });
  ck("Publish button appears once nutrition exists", (await page.$('[data-action="publish-nutrition"]')) !== null);

  // ---- Clicking shares the projection as an application/json file ----
  await page.click('[data-action="publish-nutrition"]');
  await page.waitForTimeout(60);
  const shared = await page.evaluate(async () => {
    const f = window.__shared && window.__shared.files && window.__shared.files[0];
    return f ? { name: f.name, type: f.type, text: await f.text() } : null;
  });
  ck("shared a file", shared !== null);
  ck("file named nutrition-projection.json", shared && shared.name === "nutrition-projection.json");
  ck("file is application/json", shared && shared.type === "application/json");

  const records = shared ? JSON.parse(shared.text) : [];
  const rec = records.find((r) => r.clientId === "b1.w1.d1");
  ck("projection carries the logged day (clientId = cell)", !!rec);
  ck("record has the day's kcal", rec && rec.kcal === 500);
  ck("record carries the macros", rec && rec.carb === 50 && rec.fat === 10 && rec.protein === 30);
});
