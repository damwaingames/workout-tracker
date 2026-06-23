import { verify } from "./harness.mjs";

// Feature B: the `steady` routine kind. One cardio activity held for a planned duration; the
// cell logs actual minutes + the machine's resistance/level; it's not load-bearing, and its
// progression prompt is the resistance "Last:" ghost (steady carries no tonnage). Also proves
// cue/setup now render on recovery circuit moves (the grill's "one fix, both kinds").
verify(async ({ page, ck, ls, reset }) => {
  await reset();

  const backup = {
    version: 3,
    library: {
      "test-flow": { id: "test-flow", name: "Test Flow", contexts: ["recovery"], setup: "Flow setup.", cue: "Move with your breath." },
    },
    blocks: [{ id: "b1", name: "Block 1", createdAt: "2026-06-01", startDate: "2026-06-01", routines: [
      { routine: 1, kind: "steady", title: "Cardio", focus: "Hold RPE 5–6.", durationMin: 30, exercises: [{ id: "seated-elliptical" }] },
      { routine: 2, kind: "recovery", title: "Mobility", focus: "Open up", rounds: 2, workSec: 45, restSec: 15, roundRestSec: 0, exercises: [{ id: "test-flow" }] },
      { routine: 7, kind: "rest", title: "Rest", focus: "Recover", exercises: [] },
    ] }],
    log: { "b1.w1.d1.mins": "25", "b1.w1.d1.resist": "5" }, // a prior steady session → ghost in w2
    ui: { block: "b1", week: 2 }, notes: "",
  };
  await page.setInputFiles("#import-input", {
    name: "steady.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForTimeout(80);

  const s = await ls();
  ck("seated-elliptical merged from seed with levels 10", s.library["seated-elliptical"] && s.library["seated-elliptical"].levels === 10);
  ck("seated-elliptical is valid in the steady context", s.library["seated-elliptical"].contexts.includes("steady"));
  const p = s.blocks[0].routines.find((r) => r.routine === 1).exercises[0];
  ck("steady placement is bare {id} (non-strength shape)", p && p.id === "seated-elliptical" && !("sets" in p));

  const D1 = '[data-cell="b1.w2.d1"]'; // steady (week 2)
  const D2 = '[data-cell="b1.w2.d2"]'; // recovery
  const tc = async (sel) => (await page.textContent(sel)).replace(/\s+/g, " ").trim();

  ck("steady card renders the activity", (await tc(`${D1} .ex-name`)).includes("Seated Elliptical"));
  ck("steady shows the planned target", (await tc(`${D1} .steady-target`)) === "Target 30 min");
  ck("steady has a minutes input", !!(await page.$(`${D1} input[data-k="b1.w2.d1.mins"]`)));
  ck("steady resistance input is capped at levels (max=10)", (await page.getAttribute(`${D1} input[data-k="b1.w2.d1.resist"]`, "max")) === "10");
  ck("steady is NOT load-bearing (no volume line)", !(await page.$(`${D1} .routine-volume`)));
  ck("steady shows the resistance ghost from last week", (await tc(`${D1} .last`)).includes("Last: L5 · 25 min"));
  ck("steady activity surfaces its setup ⓘ", !!(await page.$(`${D1} [data-action="toggle-setup"]`)));
  ck("steady collapsed summary shows the planned duration", (await tc(`${D1} .routine-summary`)).includes("30 min"));

  // --- log this week's session (persists via the generic data-k path) ---
  await page.fill(`${D1} input[data-k="b1.w2.d1.mins"]`, "28");
  await page.fill(`${D1} input[data-k="b1.w2.d1.resist"]`, "6");
  await page.waitForTimeout(50);
  const s2 = await ls();
  ck("logged minutes persisted", s2.log["b1.w2.d1.mins"] === "28");
  ck("logged resistance persisted", s2.log["b1.w2.d1.resist"] === "6");

  // --- cue/setup now render on a recovery circuit move ---
  ck("recovery move shows its intrinsic cue", (await tc(`${D2} .cue`)).includes("Move with your breath"));
  ck("recovery move surfaces a setup ⓘ", !!(await page.$(`${D2} [data-action="toggle-setup"]`)));

  // --- edit mode: changing the duration live-patches the target and persists ---
  await page.click("#edit-toggle");
  await page.fill(`${D1} input[data-fh="steady-field"]`, "35");
  await page.waitForTimeout(50);
  ck("duration edit live-patches the target", (await tc(`${D1} .steady-target`)) === "Target 35 min");
  ck("duration persisted on the routine template", (await ls()).blocks[0].routines.find((r) => r.routine === 1).durationMin === 35);

  // --- a steady routine holds ONE activity: creating another replaces it (review #1) ---
  await page.click(`${D1} [data-action="picker-open"]`);
  await page.click(`${D1} [data-action="form-open"]`);
  await page.fill(`${D1} .picker-form [name="name"]`, "Treadmill");
  await page.click(`${D1} .picker-form button[type="submit"]`);
  await page.waitForTimeout(60);
  const acts = (await ls()).blocks[0].routines.find((r) => r.routine === 1).exercises;
  ck("steady holds one activity — a created one replaces the old", acts.length === 1 && acts[0].id === "treadmill" && !("sets" in acts[0]));
});
