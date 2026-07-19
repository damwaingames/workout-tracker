import { verify } from "./harness.mjs";

// ADR-0009: the block importer — a MERGE, not the wholesale Restore. New library exercises are
// added, block(s) appended (re-id on collision), and the log / profile left alone.
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

  // ---- 6) reject: an unparseable start date (caught, not a false "snap") ----
  const countNow = (await ls()).blocks.length;
  await importFile({
    version: 3, blocks: [{ id: "bBad", name: "Garbage Date", createdAt: "2026-06-01", startDate: "not-a-date",
      routines: [{ routine: 1, kind: "rest", title: "R", focus: "x", exercises: [] }] }],
  });
  s = await ls();
  ck("malformed start date rejected — nothing added", s.blocks.length === countNow);
  ck("malformed date reported as invalid, not snapped", dialogs.some((m) => m.includes("isn't a valid") && !m.includes("snapped")));

  // ---- 7) class routine (ADR-0010) imports cleanly at version 4 with a type + duration ----
  const before7 = (await ls()).blocks.length;
  await importFile({
    version: 4, blocks: [{ id: "bC", name: "Class Block", createdAt: "2026-06-01", startDate: "2026-06-01",
      routines: [{ routine: 1, kind: "class", title: "Box-Fit", focus: "conditioning", classType: "Box-Fit", durationMin: 45 }] }],
  });
  s = await ls();
  const cb = s.blocks.find((b) => b.name === "Class Block");
  ck("v4 class routine imports (block appended)", s.blocks.length === before7 + 1 && !!cb);
  ck("class routine keeps its type + duration", cb && cb.routines[0].kind === "class" && cb.routines[0].classType === "Box-Fit" && cb.routines[0].durationMin === 45);

  // ---- 8) reject: a class routine with no class type ----
  const before8 = (await ls()).blocks.length;
  await importFile({
    version: 4, blocks: [{ id: "bNoType", name: "No Type", createdAt: "2026-06-01", startDate: "2026-06-01",
      routines: [{ routine: 1, kind: "class", title: "x", focus: "x", durationMin: 30 }] }],
  });
  s = await ls();
  ck("class routine without a classType rejected — nothing added", s.blocks.length === before8);
  ck("missing classType reported", dialogs.some((m) => m.includes("needs a classType")));

  // ---- 9) coerce: exercises listed on a class routine are dropped (imports, reported) ----
  const before9 = (await ls()).blocks.length;
  await importFile({
    version: 4, blocks: [{ id: "bStray", name: "Stray Ex", createdAt: "2026-06-01", startDate: "2026-06-01",
      routines: [{ routine: 1, kind: "class", title: "Box-Fit", focus: "x", classType: "Box-Fit", durationMin: 45, exercises: [{ id: "goblet-squats", sets: 3 }] }] }],
  });
  s = await ls();
  const stray = s.blocks.find((b) => b.name === "Stray Ex");
  ck("class routine with stray exercises still imports", s.blocks.length === before9 + 1 && !!stray);
  ck("stray exercises dropped from the class routine", stray && Array.isArray(stray.routines[0].exercises) && stray.routines[0].exercises.length === 0);
  ck("the drop is reported as a coercion", dialogs.some((m) => m.includes("dropped exercises listed on a class routine")));
});
