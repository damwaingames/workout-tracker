import { verify } from "./harness.mjs";

/* Backup infra (file Export / Import + Reset), untouched by the v6 rework beyond the version gate.
 * Import a hand-built v2 backup and confirm it's swapped in AND migrated forward to v6 (its logged
 * set re-homing to a performance — ADR-0020); then Reset restores the seed store. The generic
 * logged-field path is exercised via a measurement value (the surviving data-k input this slice). */
verify(async ({ page, ck, ls, reset }) => {
  await reset();

  // --- a logged value via the generic setLog path (a measurement) ---
  await page.fill('.measure-row[data-m="bodyweight"] .measure-val', "70");
  await page.waitForTimeout(40);
  ck("logged measurement persisted", (await ls()).log["b1.w1.m.bodyweight"] === "70");

  // --- IMPORT a hand-built v2 backup (drives setState(normalise(data)) → migrateToV6) ---
  await page.click("#edit-toggle"); // so the import can be seen to clear editing
  const backup = {
    version: 2,
    library: { "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", type: "strength", targetReps: "8–12" } },
    blocks: [{ id: "b9", name: "Imported Block", createdAt: "2026-01-01",
      days: [{ day: 1, kind: "strength", title: "Imported A", focus: "Test", exercises: [{ id: "goblet-squats", sets: 3 }] }] }],
    log: { "b9.w1.d1.ex.goblet-squats.s0.w": "99", "b9.w1.d1.ex.goblet-squats.s0.r": "5" },
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
  ck("import migrated to v6", s.version === 6);
  ck("imported logged set re-homed to a performance", (() => {
    const p = s.library["goblet-squats"].performances;
    return p.length === 1 && p[0].load.mag === 99 && p[0].volume.val === 5;
  })());
  ck("import cleared editing (Edit label)", (await page.textContent("#edit-toggle")).trim() === "Edit");
  ck("imported notes hydrated into field", (await page.inputValue("#notes-field")) === "imported notes");
  ck("imported block rendered", (await page.textContent("#week-view")).includes("Imported A"));

  // --- RESET (drives setState(defaultState()) + setEditing(false)) ---
  page.once("dialog", (d) => d.accept());
  await page.click('[data-action="reset"]');
  await page.waitForTimeout(80);
  s = await ls();
  ck("reset restored seed block", s.blocks.length === 1 && s.blocks[0].id === "b1");
  ck("reset re-rendered seed session", (await page.textContent("#week-view")).includes("Workout A"));
});
