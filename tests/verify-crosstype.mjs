import { verify } from "./harness.mjs";

verify(async ({ page, ck, ls, reset }) => {
  const exOf = async (routineNo) => (await ls()).blocks[0].routines.find((d) => d.routine === routineNo).exercises;

  await reset();
  await page.click("#edit-toggle");

  const D1 = '[data-cell="b1.w1.d1"]'; // strength — Workout A
  const D2 = '[data-cell="b1.w1.d2"]'; // recovery — Recovery A

  // ---- STRENGTH routine: picker offers only strength, form has reps+sets, no type select ----
  await page.click(`${D1} [data-action="picker-open"]`);
  const d1tags = await page.$$eval(`${D1} .pick .tag`, (els) => els.map((e) => e.textContent.trim()));
  ck("strength routine: no recovery chips in picker", d1tags.length > 0 && !d1tags.includes("recovery"));
  ck("strength routine: a circuit move (high-knees) is NOT offered", !(await page.$(`${D1} .pick[data-ex="high-knees"]`)));
  ck("strength routine: a strength move (dumbbell-rdls) IS offered", !!(await page.$(`${D1} .pick[data-ex="dumbbell-rdls"]`)));
  await page.click(`${D1} [data-action="form-open"]`);
  ck("strength form: no type select", !(await page.$(`${D1} .picker-form [name="type"]`)));
  ck("strength form: has targetReps", !!(await page.$(`${D1} .picker-form [name="targetReps"]`)));
  ck("strength form: has sets", !!(await page.$(`${D1} .picker-form [name="sets"]`)));

  // ---- RECOVERY routine: picker offers only circuits, form has neither reps nor sets ----
  await page.click(`${D2} [data-action="picker-open"]`);
  const d2tags = await page.$$eval(`${D2} .pick .tag`, (els) => els.map((e) => e.textContent.trim()));
  ck("recovery routine: every chip is recovery", d2tags.length > 0 && d2tags.every((t) => t === "recovery"));
  ck("recovery routine: a strength move (dumbbell-rdls) is NOT offered", !(await page.$(`${D2} .pick[data-ex="dumbbell-rdls"]`)));
  ck("recovery routine: a circuit move (hollow-body-holds) IS offered", !!(await page.$(`${D2} .pick[data-ex="hollow-body-holds"]`)));
  await page.click(`${D2} [data-action="form-open"]`);
  ck("recovery form: no type select", !(await page.$(`${D2} .picker-form [name="type"]`)));
  ck("recovery form: no targetReps", !(await page.$(`${D2} .picker-form [name="targetReps"]`)));
  ck("recovery form: no sets", !(await page.$(`${D2} .picker-form [name="sets"]`)));

  // ---- Create on RECOVERY routine → must be a circuit placement (bare {id}, no sets) ----
  await page.fill(`${D2} .picker-form [name="name"]`, "Box Jumps");
  await page.click(`${D2} .picker-form button[type="submit"]`);
  await page.waitForTimeout(60);
  let s = await ls();
  ck("recovery create: library contexts is [recovery]", s.library["box-jumps"] && Array.isArray(s.library["box-jumps"].contexts) && s.library["box-jumps"].contexts.join() === "recovery");
  ck("recovery create: circuit carries no per-move rounds (now routine-level)", !("rounds" in s.library["box-jumps"]));
  const d2p = (await exOf(2)).find((p) => p.id === "box-jumps");
  ck("recovery create: placement is bare {id} (no sets)", d2p && !("sets" in d2p));

  // ---- Create on STRENGTH routine → strength placement with sets ----
  await page.click(`${D1} [data-action="picker-open"]`);
  await page.click(`${D1} [data-action="form-open"]`);
  await page.fill(`${D1} .picker-form [name="name"]`, "Cable Row");
  await page.click(`${D1} .picker-form button[type="submit"]`);
  await page.waitForTimeout(60);
  s = await ls();
  ck("strength create: library contexts is [strength]", s.library["cable-row"] && Array.isArray(s.library["cable-row"].contexts) && s.library["cable-row"].contexts.join() === "strength");
  const d1p = (await exOf(1)).find((p) => p.id === "cable-row");
  ck("strength create: placement carries a clamped sets count", d1p && d1p.sets >= 1 && d1p.sets <= 6);
});
