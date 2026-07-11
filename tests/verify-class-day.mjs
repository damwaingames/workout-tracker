import { verify } from "./harness.mjs";

/* Class routine kind (ADR-0010) + wearable-logged burn (ADR-0014): a class owns its own day,
 * holds a type + planned duration, logs minutes / calories / note per cell, shows a collapsed
 * summary and header total, and is editable in Edit mode. Class types are names only (no rate),
 * and the retired add-on's `.classes` keys are left inert by the non-destructive v4 migration. */
verify(async ({ page, ck, ls, reset, key }) => {
  const D1 = "b1.w1.d1";
  const cell = `.routine[data-cell="${D1}"]`;
  const cs = `${cell} .class-session`;
  const total = () => page.innerHTML("#class-total");

  await reset();
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // save() so the seed is persisted to localStorage
  await page.waitForTimeout(40);

  // The seed has no class routine — turn routine 1 into one, and drop an inert pre-v4
  // `.classes` add-on key so the non-destructive migration can be checked.
  await page.evaluate(({ k, c }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const r = s.blocks[0].routines.find((x) => x.routine === 1);
    r.kind = "class"; r.classType = "Box-Fit"; r.durationMin = 45; delete r.exercises;
    s.log[c + ".classes"] = [{ type: "Yoga", desc: "old add-on", mins: 20 }];
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: key, c: D1 });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  // ---- Renders as a class session: type + target, no exercises / add-zone ----
  ck("class session rendered", !!(await page.$(cs)));
  ck("shows the class type", (await page.textContent(`${cs} .ex-name`)).includes("Box-Fit"));
  ck("shows the target duration", (await page.textContent(`${cs} .ex-target`)).includes("Target 45 min"));
  ck("no exercise cards on a class routine", (await page.$$(`${cell} .exercise`)).length === 0);
  ck("no add-zone on a class routine (nothing to place)", (await page.$(`${cell} .add-zone`)) === null);

  // ---- Log minutes / calories / note → persist under class keys; header total updates live ----
  await page.fill(`${cell} [data-k="${D1}.mins"]`, "50");
  await page.fill(`${cell} [data-k="${D1}.kcal"]`, "480");
  await page.fill(`${cell} [data-k="${D1}.note"]`, "sparring rounds");
  await page.waitForTimeout(60);
  let s = await ls();
  ck("minutes logged", s.log[`${D1}.mins`] === "50");
  ck("wearable calories logged", s.log[`${D1}.kcal`] === "480");
  ck("note logged", s.log[`${D1}.note`] === "sparring rounds");
  ck("header total shows logged minutes", /<strong>50 min<\/strong>/.test(await total()));
  ck("header total shows logged (not modeled) calories", /~480 kcal<\/strong> this week/.test(await total()));

  // ---- routineLoad is class-safe (review #1): editing a strength weight fires renderVolumes,
  //      which calls routineLoad over EVERY routine — including the class day — and must not throw.
  await page.fill('.routine[data-cell="b1.w1.d3"] .w', "20"); // d3 is a seed strength routine
  await page.waitForTimeout(60);
  ck("class day still rendered after a volume recompute", !!(await page.$(cs)));
  ck("strength volume line rendered with a class present", (await page.$('[data-vol-cell="b1.w1.d3"]')) !== null);

  // ---- classTypes is derived, not a persisted field (review #2); schema stamped v4 ----
  ck("no persisted classTypes field (derived on demand)", (await ls()).classTypes === undefined);
  ck("fresh seed is schema v4", (await ls()).version === 4);

  // ---- Pre-v4 `.classes` add-on key left inert (non-destructive migration) ----
  ck("pre-v4 .classes key untouched", Array.isArray(s.log[`${D1}.classes`]) && s.log[`${D1}.classes`][0].type === "Yoga");
  ck("no add-on class UI rendered", (await page.$(`.classes[data-cell="${D1}"]`)) === null);

  // ---- Summary (rebuilt on a full render — like steady, it isn't live-patched): type · mins · burn.
  // Reload forces a fresh render from the persisted log; the summary is in the DOM even while expanded.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  const summary = await page.textContent(`${cell} .routine-summary`);
  ck("summary shows type + minutes + burn",
    /Box-Fit/.test(summary) && /50 min/.test(summary) && /480 kcal/.test(summary));

  // ---- Edit mode: change duration + type; the card patches in place and persists ----
  await page.click("#edit-toggle");
  await page.waitForTimeout(60);
  await page.fill(`${cell} [data-field="durationMin"]`, "60");
  await page.waitForTimeout(40);
  ck("duration edit patches the target line", (await page.textContent(`${cs} .ex-target`)).includes("Target 60 min"));
  await page.fill(`${cell} [data-field="classType"]`, "Pilates");
  await page.waitForTimeout(40);
  ck("type edit patches the name", (await page.textContent(`${cs} .ex-name`)).includes("Pilates"));
  s = await ls();
  const routine1 = s.blocks[0].routines.find((x) => x.routine === 1);
  ck("edits persist on the routine template", routine1.durationMin === 60 && routine1.classType === "Pilates");
  ck("edited type offered in the datalist", !!(await page.$('#class-types option[value="Pilates"]')));
  await page.click("#edit-toggle"); // leave edit mode before the migration step
  await page.waitForTimeout(40);

  // ---- v3 → v4 migration: an old save upgrades; its `.classes` key survives inert ----
  await page.evaluate((k) => { const st = JSON.parse(localStorage.getItem(k)); st.version = 3; localStorage.setItem(k, JSON.stringify(st)); }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op → save() persists the stamp
  await page.waitForTimeout(60);
  s = await ls();
  ck("v3 save migrates to v4", s.version === 4);
  ck("legacy .classes key still present but inert after migration", Array.isArray(s.log[`${D1}.classes`]));
});
