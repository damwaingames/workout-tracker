import { verify } from "./harness.mjs";

/* Shared wind-down (ADR-0013) + the mobility placement surface (ADR-0011): shown under every
 * non-rest day (not rest), one shared move list with an independent per-cell done-tick, edited
 * once in Edit mode via a mobility-filtered picker, and counting toward no total. Plus the seed:
 * new mobility moves + the recovery stretches widened to the mobility surface. */
verify(async ({ page, ck, ls, reset, key }) => {
  const D1 = "b1.w1.d1", D3 = "b1.w1.d3", D7 = "b1.w1.d7"; // strength / strength / rest
  const wd = (cell) => `.routine[data-cell="${cell}"] .winddown`;
  const zone = ".winddown-edit .add-zone";

  await reset();
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // save() so localStorage is populated
  await page.waitForTimeout(40);

  // ---- Shown under non-rest days, not under rest ----
  ck("wind-down under a strength day", !!(await page.$(wd(D1))));
  ck("no wind-down under a rest day", (await page.$(wd(D7))) === null);
  const moves1 = await page.textContent(`${wd(D1)} .winddown-moves`);
  ck("shows the seeded stretch names", /Cat-Cow/.test(moves1) && /Quad Stretch/.test(moves1));
  ck("shows the target duration", (await page.textContent(`${wd(D1)} .winddown-done`)).includes("10 min"));

  // ---- Independent per-cell done-tick, separate from the routine's own done ----
  await page.check(`${wd(D1)} input[type="checkbox"]`);
  await page.waitForTimeout(50);
  let s = await ls();
  ck("done-tick logs on the cell", s.log[`${D1}.winddown`] === true);
  ck("wind-down done is separate from routine done", !s.log[`${D1}.done`]);
  ck("another day's wind-down stays unticked", !s.log[`${D3}.winddown`]);

  // ---- The seed: new mobility moves + widened recovery stretches ----
  const lib = s.library;
  ck("new mobility move seeded (pigeon-pose, mobility context)", !!lib["pigeon-pose"] && lib["pigeon-pose"].contexts.includes("mobility"));
  ck("recovery stretch widened to mobility (quad-stretch)", lib["quad-stretch"].contexts.includes("mobility") && lib["quad-stretch"].contexts.includes("recovery"));

  // ---- Edit mode: the shared editor replaces the per-card view; mobility-filtered picker ----
  await page.click("#edit-toggle");
  await page.waitForTimeout(60);
  ck("wind-down editor present in Edit mode", !!(await page.$(".winddown-edit")));
  ck("per-card wind-down hidden in Edit mode (edited centrally)", (await page.$(wd(D1))) === null);

  await page.click(`${zone} [data-action="picker-open"]`);
  await page.waitForTimeout(50);
  const picks = await page.$$eval(`${zone} .pick`, (els) => els.map((e) => e.dataset.ex));
  ck("mobility picker offers a mobility move (thoracic-opener)", picks.includes("thoracic-opener"));
  ck("mobility picker offers a widened stretch (chest-opener-stretch)", picks.includes("chest-opener-stretch"));
  ck("mobility picker excludes a strength-only move (goblet-squats)", !picks.includes("goblet-squats"));

  // ---- Add / remove a stretch on the shared list ----
  await page.click(`${zone} .pick[data-ex="thoracic-opener"]`);
  await page.waitForTimeout(60);
  s = await ls();
  const added = s.winddown.exercises.find((p) => p.id === "thoracic-opener");
  ck("adding a stretch appends to state.winddown", !!added);
  ck("added placement is bare (no sets — a checklist)", added && !("sets" in added));

  await page.click(`.winddown-edit .exercise[data-ex="cat-cow"] [data-action="remove-exercise"]`);
  await page.waitForTimeout(60);
  ck("removing a stretch drops it from state.winddown", !(await ls()).winddown.exercises.some((p) => p.id === "cat-cow"));

  // ---- Duration edit persists ----
  await page.fill(`.winddown-edit [data-fh="winddown-field"]`, "15");
  await page.waitForTimeout(50);
  ck("duration edit persists on state.winddown", (await ls()).winddown.durationMin === 15);

  // ---- Leaving Edit mode: cards reflect the new duration + edited move list, on every non-rest day ----
  await page.click("#edit-toggle");
  await page.waitForTimeout(60);
  ck("new duration shows on the cards", (await page.textContent(`${wd(D1)} .winddown-done`)).includes("15 min"));
  const moves2 = await page.textContent(`${wd(D1)} .winddown-moves`);
  ck("edited moves reflected on the cards", /Thoracic Opener/.test(moves2) && !/Cat-Cow/.test(moves2));
  ck("same shared wind-down on another non-rest day (d3)", /Thoracic Opener/.test(await page.textContent(`${wd(D3)} .winddown-moves`)));

  // ---- Additive migration: a pre-v4 save with no winddown backfills from seed (no schema bump) ----
  await page.evaluate((k) => { const st = JSON.parse(localStorage.getItem(k)); delete st.winddown; localStorage.setItem(k, JSON.stringify(st)); }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("missing winddown backfilled (renders on the card)", !!(await page.$(wd(D1))));
  await page.click('[data-action="week"][data-week="1"]');
  await page.waitForTimeout(40);
  ck("backfilled winddown persisted with moves", Array.isArray((await ls()).winddown.exercises) && (await ls()).winddown.exercises.length > 0);
});
