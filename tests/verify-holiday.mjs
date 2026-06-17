import { verify } from "./harness.mjs";

/* Holiday routines: a per-cell 🏝 flag swaps the shared Holiday Workout (a band-only
 * strength routine) into any routine. The band moves log against that cell while the routine's
 * own exercises stay un-logged — so previousSets resumes normal progression after
 * the break. Covers the seeded band library + holiday definition, the toggle swap
 * on every routine kind, band tonnage, the progression-skip guarantee, the shared
 * editor, the revert on untick, additive migration, and survival across a reload. */
verify(async ({ page, ck, ls, reset, key }) => {
  const routine = (cell) => `.routine[data-cell="${cell}"]`;
  const D1 = routine("b1.w1.d1"); // strength — Workout A
  const D2 = routine("b1.w1.d2"); // recovery — Recovery A
  const holidayBox = (cell) => `${routine(cell)} input[data-k="${cell}.holiday"]`;
  const flag = async (cell) => (await ls()).log[`${cell}.holiday`];
  const titleOf = (cell) => page.textContent(`${routine(cell)} .routine-title`);
  const hasClass = (cell, cls) => page.$eval(routine(cell), (el, c) => el.classList.contains(c), cls);

  await reset();
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op click → persist the seed so ls() isn't null

  // ---- Seed: the new band moves + the holiday definition ----
  const st = await ls();
  const lib = st.library;
  ck("band move seeded (monster walks), banded", lib["banded-monster-walks"] && lib["banded-monster-walks"].banded === true);
  ck("monster walks is per-side", lib["banded-monster-walks"].loadMode === "per-side");
  ck("band move seeded (glute bridges)", lib["banded-glute-bridges"] && lib["banded-glute-bridges"].banded === true);
  ck("band move seeded (push-ups)", lib["banded-push-ups"] && lib["banded-push-ups"].banded === true);
  ck("band move seeded (plank leg abduction), per-side", lib["banded-plank-leg-abductions"] && lib["banded-plank-leg-abductions"].loadMode === "per-side");
  ck("holiday workout seeded (strength, 5 moves)", st.holiday && st.holiday.kind === "strength" && st.holiday.exercises.length === 5);

  // ---- Default: normal workout shown, holiday toggle present on every routine, off ----
  ck("holiday toggle on a strength routine", !!(await page.$(holidayBox("b1.w1.d1"))));
  ck("holiday toggle on a rest routine", !!(await page.$(holidayBox("b1.w1.d7"))));
  ck("routine starts non-holiday", !(await hasClass("b1.w1.d1", "is-holiday")));
  ck("normal title shows Workout A", /Workout A/.test(await titleOf("b1.w1.d1")));
  ck("normal routine shows its own exercise (goblet squats)", !!(await page.$(`${D1} .exercise[data-ex="goblet-squats"]`)));
  ck("no holiday flag stored yet", (await flag("b1.w1.d1")) === undefined);

  // ---- Tick holiday: the routine swaps to the band workout ----
  await page.click(holidayBox("b1.w1.d1"));
  await page.waitForTimeout(80);
  ck("routine is now is-holiday", await hasClass("b1.w1.d1", "is-holiday"));
  ck("flag persisted true", (await flag("b1.w1.d1")) === true);
  ck("title swaps to Holiday Workout", /Holiday Workout/.test(await titleOf("b1.w1.d1")));
  ck("routine number preserved (Day 1)", /Day 1:/.test(await titleOf("b1.w1.d1")));
  ck("holiday badge shown", !!(await page.$(`${D1} .holiday-badge`)));
  ck("a band move is now shown (monster walks)", !!(await page.$(`${D1} .exercise[data-ex="banded-monster-walks"]`)));
  ck("the normal exercise is gone (goblet squats)", !(await page.$(`${D1} .exercise[data-ex="goblet-squats"]`)));
  ck("holiday body is structurally read-only (no remove button)", !(await page.$(`${D1} .exercise[data-ex="banded-monster-walks"] [data-action="remove-exercise"]`)));

  // ---- Band tonnage on the holiday routine: heavy(10) × per-side(×2) × 10 reps = 200 ----
  await page.fill(`[data-k="b1.w1.d1.ex.banded-monster-walks.s0.r"]`, "10");
  await page.waitForTimeout(60);
  ck("holiday routine volume reflects band tonnage (200 kg)", /200 kg/.test(await page.textContent(`${D1} .routine-volume`)));

  // ---- All routine kinds: a recovery routine can be swapped too (becomes the strength holiday) ----
  await page.click(holidayBox("b1.w1.d2"));
  await page.waitForTimeout(80);
  ck("recovery routine swaps to the strength holiday workout", (await hasClass("b1.w1.d2", "is-holiday")) && (await hasClass("b1.w1.d2", "strength")));
  ck("recovery-as-holiday shows a band move", !!(await page.$(`${D2} .exercise[data-ex="banded-glute-bridges"]`)));

  // ---- The progression-skip guarantee ----
  // Week1 day1: log goblet squats 50×10 (normal). Make week2 day1 a holiday. Week3
  // day1's goblet progression must point at week1 (skip the holiday week) — because
  // the holiday routine logs band moves, never goblet squats, so week2 reads empty.
  await page.click(holidayBox("b1.w1.d1")); // un-holiday week1 day1 first
  await page.waitForTimeout(80);
  await page.fill(`[data-k="b1.w1.d1.ex.goblet-squats.s0.w"]`, "50");
  await page.fill(`[data-k="b1.w1.d1.ex.goblet-squats.s0.r"]`, "10");
  await page.waitForTimeout(60);
  await page.click('[data-action="week"][data-week="2"]');
  await page.waitForTimeout(60);
  await page.click(holidayBox("b1.w2.d1"));
  await page.waitForTimeout(80);
  ck("week2 day1 is holiday", (await flag("b1.w2.d1")) === true);
  await page.click('[data-action="week"][data-week="3"]');
  await page.waitForTimeout(60);
  const gobletWk3 = await page.getAttribute(`[data-k="b1.w3.d1.ex.goblet-squats.s0.w"]`, "placeholder");
  ck("week3 progression skips the holiday week (Last weight = 50, from week1)", gobletWk3 === "50");

  // ---- Edit the shared Holiday Workout: one definition, applies wherever ticked ----
  await page.click('[data-action="week"][data-week="1"]');
  await page.waitForTimeout(60);
  await page.click("#edit-toggle");
  await page.waitForTimeout(60);
  ck("holiday editor present in edit mode", !!(await page.$(".holiday-edit")));
  ck("editor lists all 5 holiday moves", (await page.$$(".holiday-edit .exercise")).length === 5);
  // The holiday picker is band-only: offers banded strength moves, hides free-weight ones.
  await page.click('.holiday-edit [data-action="picker-open"]');
  await page.waitForTimeout(60);
  ck("holiday picker offers a banded strength move", !!(await page.$('.holiday-edit .picker-list .pick[data-ex="banded-fire-hydrants"]')));
  ck("holiday picker excludes a non-banded strength move", !(await page.$('.holiday-edit .picker-list .pick[data-ex="goblet-squats"]')));
  await page.click('.holiday-edit [data-action="picker-open"]'); // close the picker
  await page.waitForTimeout(40);
  await page.click('.holiday-edit .exercise[data-ex="banded-push-ups"] [data-action="remove-exercise"]');
  await page.waitForTimeout(60);
  ck("removing a move updates the shared definition (4 left)", (await ls()).holiday.exercises.length === 4);
  ck("the removed move is banded-push-ups", !(await ls()).holiday.exercises.some((p) => p.id === "banded-push-ups"));
  await page.click("#edit-toggle"); // leave edit mode
  await page.waitForTimeout(60);
  // D2 (recovery) is still ticked holiday — it must reflect the edited definition.
  ck("a ticked routine reflects the edit (push-ups gone from D2)", !(await page.$(`${D2} .exercise[data-ex="banded-push-ups"]`)));

  // ---- Untick: the routine reverts to its own normal workout ----
  await page.click(holidayBox("b1.w1.d2"));
  await page.waitForTimeout(80);
  ck("unticking clears the flag", (await flag("b1.w1.d2")) === undefined);
  ck("recovery routine reverts (not is-holiday)", !(await hasClass("b1.w1.d2", "is-holiday")));
  ck("recovery routine shows its own move again", !!(await page.$(`${D2} .exercise[data-ex="high-knees"]`)));

  // ---- Survives a reload ----
  await page.click('[data-action="week"][data-week="2"]');
  await page.waitForTimeout(60);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  ck("holiday flag survives reload (week2 day1 still holiday)", await hasClass("b1.w2.d1", "is-holiday"));

  // ---- Additive migration: an older save (no holiday, missing a band move) backfills ----
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    delete s.holiday;
    delete s.library["banded-monster-walks"];
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // save() persists the normalised state
  await page.waitForTimeout(60);
  const after = await ls();
  ck("migration backfills the holiday workout", after.holiday && after.holiday.exercises.length >= 1);
  ck("migration backfills a missing band move into the library", !!after.library["banded-monster-walks"]);
});
