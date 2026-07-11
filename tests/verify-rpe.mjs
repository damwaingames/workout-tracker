import { verify } from "./harness.mjs";

/* Session RPE (ADR-0012): a per-session 1–10 fatigue field on every non-rest routine and a
 * separate one on the wind-down, logged per cell and echoed in the collapsed summary — a record
 * only, never fed to any progression / overload scan or total. */
verify(async ({ page, ck, ls, reset }) => {
  const D1 = "b1.w1.d1", D3 = "b1.w1.d3", D7 = "b1.w1.d7"; // strength / strength / rest
  const rpe = (cell) => `.routine[data-cell="${cell}"] [data-k="${cell}.rpe"]`;

  await reset();
  await page.waitForTimeout(120);

  // ---- Shown on non-rest routines, not on rest ----
  ck("Session RPE on a strength routine", !!(await page.$(rpe(D1))));
  ck("no Session RPE on a rest routine", (await page.$(`.routine[data-cell="${D7}"] .session-rpe`)) === null);

  // ---- Logs per cell; it's a record, not completion or tonnage ----
  await page.fill(rpe(D1), "7");
  await page.waitForTimeout(50);
  let s = await ls();
  ck("RPE logs on the cell", s.log[`${D1}.rpe`] === "7");
  ck("RPE is not completion (routine done stays unset)", !s.log[`${D1}.done`]);
  ck("RPE adds no tonnage (routine volume still 0 kg)", (await page.textContent(`[data-vol-cell="${D1}"]`)).includes("0 kg"));

  // ---- The wind-down carries its own, separate RPE ----
  const wd = `.routine[data-cell="${D1}"] .winddown [data-k="${D1}.wdrpe"]`;
  ck("wind-down has its own RPE input", !!(await page.$(wd)));
  await page.fill(wd, "2");
  await page.waitForTimeout(50);
  s = await ls();
  ck("routine RPE and wind-down RPE are distinct keys", s.log[`${D1}.rpe`] === "7" && s.log[`${D1}.wdrpe`] === "2");

  // ---- Echoed in the collapsed summary (rebuilt on a full render — force one via reload) ----
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("RPE echoed in the collapsed summary", /RPE 7/.test(await page.textContent(`.routine[data-cell="${D1}"] .routine-summary`)));

  // ---- Independent per cell ----
  ck("another routine's RPE stays empty", !(await ls()).log[`${D3}.rpe`]);
});
