import { verify } from "./harness.mjs";

verify(async ({ page, ck, ls, reset }) => {
  const routine1Ex = async () => (await ls()).blocks[0].routines.find((d) => d.routine === 1).exercises;

  await reset();
  await page.click("#edit-toggle");

  const D1 = '[data-cell="b1.w1.d1"]'; // strength routine, Workout A
  // Fresh load doesn't persist until the first save(), so count the DOM here.
  ck("routine 1 seeded with 5 exercises", (await page.$$(`${D1} .exercise`)).length === 5);

  // ---- EXERCISE picker: open ----
  await page.click(`${D1} [data-action="picker-open"]`);
  ck("exercise picker opened", await page.isVisible(`${D1} .picker`));
  ck("picker excludes already-added (no goblet-squats chip)", !(await page.$(`${D1} .pick[data-ex="goblet-squats"]`)));

  // ---- search filters ---- (use a term unique to Dumbbell RDLs: the library now
  // also has Single-Leg RDLs, so a bare "rdl" would match two)
  await page.fill(`${D1} .picker-search`, "dumbbell rdl");
  await page.waitForTimeout(60);
  ck("search 'dumbbell rdl' narrows to 1 match", (await page.$$(`${D1} .pick`)).length === 1);
  ck("match is Dumbbell RDLs", await page.$(`${D1} .pick[data-ex="dumbbell-rdls"]`));

  // ---- pick adds to the routine ----
  await page.click(`${D1} .pick[data-ex="dumbbell-rdls"]`);
  await page.waitForTimeout(60);
  let ex = await routine1Ex();
  ck("exercise added to routine (now 6)", ex.length === 6 && ex.some((p) => p.id === "dumbbell-rdls"));
  ck("strength placement carries sets", ex.find((p) => p.id === "dumbbell-rdls").sets >= 1);

  // ---- create a new exercise via the form ----
  await page.click(`${D1} [data-action="picker-open"]`); // reopen after re-render
  await page.click(`${D1} [data-action="form-open"]`);
  ck("create form revealed", await page.isVisible(`${D1} .picker-form`));
  await page.fill(`${D1} .picker-form [name="name"]`, "Cable Face Pull");
  await page.click(`${D1} .picker-form button[type="submit"]`); // type derives from the routine kind now
  await page.waitForTimeout(60);
  ck("new exercise in library", !!(await ls()).library["cable-face-pull"]);
  ck("new exercise added to routine 1 (now 7)", (await routine1Ex()).length === 7);

  // ---- cancel path ----
  await page.click(`${D1} [data-action="picker-open"]`);
  await page.click(`${D1} [data-action="form-open"]`);
  await page.click(`${D1} .picker-form [data-action="form-cancel"]`);
  ck("create form hidden after cancel", !(await page.isVisible(`${D1} .picker-form`)));
  ck("create link visible again", await page.isVisible(`${D1} [data-action="form-open"]`));

  // ---- remove an exercise ----
  await page.click(`${D1} .exercise[data-ex="dumbbell-rdls"] [data-action="remove-exercise"]`);
  await page.waitForTimeout(60);
  ck("exercise removed (back to 6)", (await routine1Ex()).length === 6);

  // ---- MEASURE picker search (shared chrome, measure kind) ----
  await page.click('.measurements-card [data-action="picker-open"]');
  await page.fill(".measurements-card .picker-search", "thigh");
  await page.waitForTimeout(60);
  ck("measure search 'thigh' narrows to 1",
    (await page.$$(".measurements-card .pick")).length === 1 && !!(await page.$('.measurements-card .pick[data-m="thigh"]')));
});
