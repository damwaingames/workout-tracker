import { verify } from "./harness.mjs";

/* Collapsible routines: the chevron toggle, the persisted `.collapsed` flag (absent =
 * expanded), the animated body slide (grid 1fr↔0fr → height to ~0), the collapsed-
 * only totals summary per routine kind (strength volume / recovery circuit-time),
 * auto-collapse on done + auto-expand on un-done, and survival across a reload. */
verify(async ({ page, ck, ls, reset }) => {
  const D1 = '.routine[data-cell="b1.w1.d1"]'; // strength — Workout A
  const D2 = '.routine[data-cell="b1.w1.d2"]'; // recovery — Recovery A (no banded moves)
  const isCollapsed = (sel) => page.$eval(sel, (el) => el.classList.contains("is-collapsed"));
  const ariaExpanded = (sel) => page.getAttribute(`${sel} .routine-collapse`, "aria-expanded");
  const flag = async (cell) => (await ls()).log[`${cell}.collapsed`];
  const bodyHeight = async (sel) => { const b = await page.locator(`${sel} .routine-collapsible`).boundingBox(); return b ? b.height : 0; };
  const SLIDE = 400; // > the .28s grid transition, so height has settled

  await reset();
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op click → persists the seed so ls() isn't null
  await page.waitForTimeout(60);

  // ---- Default: expanded, body shown, summary hidden, no flag ----
  ck("routine starts expanded", !(await isCollapsed(D1)));
  ck("expanded: aria-expanded is true", (await ariaExpanded(D1)) === "true");
  ck("expanded: summary hidden", !(await page.isVisible(`${D1} .routine-summary`)));
  ck("expanded: body has height", (await bodyHeight(D1)) > 0);
  ck("no collapsed flag stored yet", (await flag("b1.w1.d1")) === undefined);

  // ---- Manual collapse via the chevron (in-place CSS flip + persist) ----
  await page.click(`${D1} .routine-collapse`);
  await page.waitForTimeout(SLIDE);
  ck("collapsed after chevron click", await isCollapsed(D1));
  ck("collapsed: aria-expanded is false", (await ariaExpanded(D1)) === "false");
  ck("collapsed: body slid to ~0 height", (await bodyHeight(D1)) < 5);
  ck("collapsed: summary visible", await page.isVisible(`${D1} .routine-summary`));
  ck("collapsed flag persisted true", (await flag("b1.w1.d1")) === true);
  ck("strength summary shows tonnage (Volume … kg)", /Volume.*kg/.test(await page.textContent(`${D1} .routine-summary`)));

  // ---- Manual expand re-grows the body and clears the flag (absent = expanded) ----
  await page.click(`${D1} .routine-collapse`);
  await page.waitForTimeout(SLIDE);
  ck("expanded again after second click", !(await isCollapsed(D1)));
  ck("expand re-grows the body", (await bodyHeight(D1)) > 0);
  ck("expanding deletes the flag", (await flag("b1.w1.d1")) === undefined);

  // ---- Edit-then-collapse: the summary must show the LIVE volume, not a stale 0.
  // Logging a set live-patches the body routine-volume line; collapsing reveals the
  // summary without a full render, so the summary figure must be kept in sync too. ----
  await page.fill('[data-k="b1.w1.d1.ex.goblet-squats.s0.w"]', "50");
  await page.fill('[data-k="b1.w1.d1.ex.goblet-squats.s0.r"]', "10"); // 50 × 10 = 500 kg
  await page.waitForTimeout(60);
  ck("body routine-volume reflects the edit (500 kg)", /500 kg/.test(await page.textContent(`${D1} .routine-volume`)));
  await page.click(`${D1} .routine-collapse`);
  await page.waitForTimeout(60);
  ck("collapsed summary shows the live volume, not a stale 0", /Volume 500 kg/.test(await page.textContent(`${D1} .routine-summary`)));
  await page.click(`${D1} .routine-collapse`); // re-expand, so the done test below collapses from open
  await page.waitForTimeout(SLIDE);

  // ---- Recovery collapsed summary tracks circuit total time, not volume ----
  await page.click(`${D2} .routine-collapse`);
  await page.waitForTimeout(60);
  const s2 = await page.textContent(`${D2} .routine-summary`);
  ck("recovery summary shows circuit total time (≈ … min)", /≈.*min/.test(s2));
  ck("band-less recovery summary has no Volume", !/Volume/.test(s2));

  // ---- Auto-collapse on done, auto-expand on un-done (the class flips instantly) ----
  await page.click(`${D1} input[data-k="b1.w1.d1.done"]`);
  await page.waitForTimeout(60);
  ck("marking a routine done auto-collapses it", await isCollapsed(D1));
  ck("done sets the collapsed flag", (await flag("b1.w1.d1")) === true);
  ck("done: aria-expanded is false", (await ariaExpanded(D1)) === "false");
  await page.click(`${D1} input[data-k="b1.w1.d1.done"]`);
  await page.waitForTimeout(60);
  ck("un-marking done auto-expands", !(await isCollapsed(D1)));
  ck("un-done clears the collapsed flag", (await flag("b1.w1.d1")) === undefined);

  // ---- Collapse survives a reload ----
  await page.click(`${D1} .routine-collapse`);
  await page.waitForTimeout(60);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("collapse state survives reload", await isCollapsed(D1));
  ck("aria-expanded false after reload", (await ariaExpanded(D1)) === "false");
});
