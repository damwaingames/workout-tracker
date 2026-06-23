import { verify } from "./harness.mjs";

// ADR-0009: the block importer — a MERGE, not the wholesale Restore. New library exercises are
// added, block(s) appended (re-id on collision), and the log / pantry / profile left alone.
// All-or-nothing: a structural/semantic fault rejects the import with an error list and changes
// nothing; cosmetic faults (a non-Monday start) are coerced and reported.
verify(async ({ page, ck, ls, reset }) => {
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });

  await reset();
  await page.fill('[data-cell="b1.w1.d1"] .w', "42"); // a logged value the merge must preserve
  await page.waitForTimeout(40);
  ck("starts with one block (b1)", (await ls()).blocks.length === 1);

  const importFile = async (obj) => {
    dialogs.length = 0;
    await page.setInputFiles("#import-block-input", { name: "imp.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(obj)) });
    await page.waitForTimeout(80);
  };

  // ---- 1) clean import: a new exercise + block merge in; existing data untouched ----
  await importFile({
    version: 3,
    library: { rower: { id: "rower", name: "Rower", contexts: ["recovery", "steady"], levels: 16 } },
    blocks: [{ id: "b2", name: "Imported Block", createdAt: "2026-06-01", startDate: "2026-06-01", routines: [
      { routine: 1, kind: "strength", title: "S", focus: "x", exercises: [{ id: "goblet-squats", sets: 3 }] },
      { routine: 2, kind: "steady", title: "Cardio", focus: "RPE 5", durationMin: 25, exercises: [{ id: "rower" }] },
      { routine: 7, kind: "rest", title: "Rest", focus: "x", exercises: [] },
    ] }],
  });
  let s = await ls();
  ck("clean import: block appended (now 2)", s.blocks.length === 2);
  ck("clean import: new library exercise merged (rower, levels 16)", s.library.rower && s.library.rower.levels === 16);
  ck("clean import: ui jumped to the new block", s.ui.block === "b2");
  ck("clean import: existing log preserved", s.log["b1.w1.d1.ex.goblet-squats.s0.w"] === "42");
  ck("clean import: success dialog shown", dialogs.some((m) => m.includes("Imported 1 block")));

  // ---- 2) re-id on collision: an imported block whose id already exists ----
  await importFile({
    version: 3, blocks: [{ id: "b1", name: "Clashing", createdAt: "2026-06-01", startDate: "2026-06-01",
      routines: [{ routine: 1, kind: "rest", title: "R", focus: "x", exercises: [] }] }],
  });
  s = await ls();
  ck("collision: appended under a fresh id (now 3)", s.blocks.length === 3);
  ck("collision: original b1 not overwritten", s.blocks.filter((b) => b.id === "b1").length === 1);
  ck("collision: clashing block got a new id", !!s.blocks.find((b) => b.name === "Clashing" && b.id !== "b1"));

  const count = (await ls()).blocks.length;

  // ---- 3) reject: a recovery-only move placed in a strength routine (context mismatch) ----
  await importFile({
    version: 3, blocks: [{ id: "bX", name: "Bad", createdAt: "2026-06-01", startDate: "2026-06-01",
      routines: [{ routine: 1, kind: "strength", title: "S", focus: "x", exercises: [{ id: "high-knees", sets: 3 }] }] }],
  });
  s = await ls();
  ck("context mismatch rejected — nothing added", s.blocks.length === count);
  ck("context mismatch reported", dialogs.some((m) => m.includes("rejected") && m.includes("strength routine")));

  // ---- 4) reject: a dangling exercise reference ----
  await importFile({
    version: 3, blocks: [{ id: "bY", name: "Dangling", createdAt: "2026-06-01", startDate: "2026-06-01",
      routines: [{ routine: 1, kind: "strength", title: "S", focus: "x", exercises: [{ id: "no-such-move", sets: 3 }] }] }],
  });
  s = await ls();
  ck("dangling ref rejected — nothing added", s.blocks.length === count);
  ck("dangling ref reported", dialogs.some((m) => m.includes("isn't in the library")));

  // ---- 5) coerce: a non-Monday start date is snapped + reported (still imports) ----
  await importFile({
    version: 3, blocks: [{ id: "bMon", name: "Tuesday Start", createdAt: "2026-06-02", startDate: "2026-06-02",
      routines: [{ routine: 1, kind: "rest", title: "R", focus: "x", exercises: [] }] }],
  });
  s = await ls();
  const mon = s.blocks.find((b) => b.name === "Tuesday Start");
  ck("coercion: block still imported", !!mon);
  ck("coercion: start snapped to its Monday (2026-06-01)", mon && mon.startDate === "2026-06-01");
  ck("coercion: snap reported in the success dialog", dialogs.some((m) => m.includes("snapped")));
});
