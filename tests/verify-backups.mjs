import { verify } from "./harness.mjs";

verify(async ({ page, ck, ls, reset }) => {
  await reset();

  // --- log a value (exercises the generic setLog path) ---
  await page.fill('[data-cell="b1.w1.d1"] .w', "42");
  await page.waitForTimeout(40);
  ck("logged weight persisted", (await ls()).log["b1.w1.d1.ex.goblet-squats.s0.w"] === "42");

  // --- IMPORT a hand-built v2 backup (drives setState(normalise(data)) + setEditing(false)) ---
  const backup = {
    version: 2,
    library: { "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", type: "strength", targetReps: "8–12" } },
    blocks: [{ id: "b9", name: "Imported Block", createdAt: "2026-01-01",
      days: [{ day: 1, kind: "strength", title: "Imported A", focus: "Test", exercises: [{ id: "goblet-squats", sets: 3 }] }] }],
    log: { "b9.w1.d1.ex.goblet-squats.s0.w": "99" },
    ui: { block: "b9", week: 1 }, notes: "imported notes",
    measurements: { bodyweight: { id: "bodyweight", name: "Bodyweight", unit: "kg" } },
    tracked: ["bodyweight"], profile: {},
  };
  await page.setInputFiles("#import-input", {
    name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForTimeout(80);
  let s = await ls();
  ck("import replaced state (block name)", s.blocks[0].name === "Imported Block");
  ck("import kept logged value", s.log["b9.w1.d1.ex.goblet-squats.s0.w"] === "99");
  ck("import cleared editing (Edit label)", (await page.textContent("#edit-toggle")).trim() === "Edit");
  ck("imported notes hydrated into field", (await page.inputValue("#notes-field")) === "imported notes");
  ck("imported block rendered", (await page.textContent("#week-view")).includes("Imported A"));

  // --- RESET (drives setState(defaultState()) + setEditing(false)) ---
  page.once("dialog", (d) => d.accept());
  await page.click('[data-action="reset"]');
  await page.waitForTimeout(80);
  s = await ls();
  ck("reset restored seed block", s.blocks.length === 1 && s.blocks[0].id === "b1");
  ck("reset cleared old log", !s.log["b9.w1.d1.ex.goblet-squats.s0.w"]);
  ck("reset re-rendered seed day", (await page.textContent("#week-view")).includes("Workout A"));
});
