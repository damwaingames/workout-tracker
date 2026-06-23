import { verify } from "./harness.mjs";

// ADR-0007: an exercise carries a SET of contexts (the routine kinds it's valid in);
// validity follows the exercise, behaviour follows the routine. Proves the cross-context
// case the old scalar `type` couldn't express — one move offered in two kinds, placed with
// a kind-appropriate shape — and that a legacy `type`-only record migrates on import.
verify(async ({ page, ck, ls, reset }) => {
  await reset();

  const backup = {
    version: 3,
    library: {
      "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", contexts: ["strength"], targetReps: "8–12" },
      "wall-plank": { id: "wall-plank", name: "Wall Plank", contexts: ["strength", "recovery"], targetReps: "hold" },
      "legacy-stretch": { id: "legacy-stretch", name: "Legacy Stretch", type: "circuit" }, // pre-contexts shape
    },
    blocks: [{ id: "b1", name: "Block 1", createdAt: "2026-06-01", startDate: "2026-06-01", routines: [
      { routine: 1, kind: "strength", title: "Strength A", focus: "x", exercises: [{ id: "goblet-squats", sets: 3 }] },
      { routine: 2, kind: "recovery", title: "Recovery A", focus: "x", exercises: [], rounds: 2, workSec: 60, restSec: 15, roundRestSec: 0 },
      { routine: 7, kind: "rest", title: "Rest", focus: "x", exercises: [] },
    ] }],
    log: {}, ui: { block: "b1", week: 1 }, notes: "",
  };
  await page.setInputFiles("#import-input", {
    name: "ctx.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForTimeout(80);

  // --- migration: a legacy `type` record gains contexts and drops the dead field ---
  const lib = (await ls()).library;
  ck("legacy type:circuit migrated to contexts [recovery]", Array.isArray(lib["legacy-stretch"].contexts) && lib["legacy-stretch"].contexts.join() === "recovery");
  ck("legacy record dropped its .type", !("type" in lib["legacy-stretch"]));
  ck("cross-context record kept both contexts", lib["wall-plank"].contexts.join() === "strength,recovery");

  await page.click("#edit-toggle");
  const D1 = '[data-cell="b1.w1.d1"]'; // strength
  const D2 = '[data-cell="b1.w1.d2"]'; // recovery
  const offered = (D, ex) => page.$(`${D} .pick[data-ex="${ex}"]`).then((h) => !!h);

  // --- strength picker offers the cross-context move; hides a recovery-only one ---
  await page.click(`${D1} [data-action="picker-open"]`);
  ck("strength picker offers cross-context move (wall-plank)", await offered(D1, "wall-plank"));
  ck("strength picker hides recovery-only move (legacy-stretch)", !(await offered(D1, "legacy-stretch")));
  await page.click(`${D1} .pick[data-ex="wall-plank"]`); // place it (re-renders)
  await page.waitForTimeout(60);

  // --- recovery picker offers the SAME move; hides a strength-only one ---
  await page.click(`${D2} [data-action="picker-open"]`);
  ck("recovery picker offers the SAME cross-context move (wall-plank)", await offered(D2, "wall-plank"));
  ck("recovery picker hides strength-only move (goblet-squats)", !(await offered(D2, "goblet-squats")));
  await page.click(`${D2} .pick[data-ex="wall-plank"]`); // place it (re-renders)
  await page.waitForTimeout(60);

  // --- behaviour follows the routine: same move, kind-appropriate placement shape ---
  const routines = (await ls()).blocks[0].routines;
  const p1 = routines.find((r) => r.routine === 1).exercises.find((p) => p.id === "wall-plank");
  const p2 = routines.find((r) => r.routine === 2).exercises.find((p) => p.id === "wall-plank");
  ck("placed in strength → placement carries a sets count", p1 && p1.sets >= 1);
  ck("placed in recovery → placement is bare {id} (no sets)", p2 && !("sets" in p2));
});
