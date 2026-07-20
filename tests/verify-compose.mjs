import { verify } from "./harness.mjs";

/* Composing a Block in the UI (#45), driven through the real app — the original flaw the rework
 * targets: authoring a plan with no JSON. A brand-new block is BLANK (not a clone); in Edit mode a day
 * switches between Session / Class / Rest, a Session grows Groups and Items (with rails, rounds, and
 * rests that make it straight / superset / circuit), the block's weeks + start date are editable, and
 * days reorder. The composed plan persists and renders in the read grid (#43). */
verify(async ({ page, ck, ls, reset }) => {
  const cur = (s) => s.blocks.find((b) => b.id === s.ui.block);
  const T = (s, pos) => cur(s).template[pos];

  await reset();
  await page.waitForTimeout(60);

  // --- new block is BLANK and opens in Edit mode (AC4 — composable, not a forced clone) ---
  await page.click('[data-action="new-block"]');
  await page.waitForTimeout(60);
  let s = await ls();
  ck("a new block is created and selected", cur(s) && cur(s).id !== "b1");
  ck("the new block is a blank week (seven Rest days), not a clone",
    cur(s).template.length === 7 && cur(s).template.every((r) => r.kind === "rest"));
  ck("the new block opens in Edit mode (authoring controls shown)",
    (await page.$('[data-action="weeks-inc"]')) !== null && (await page.$('[data-action="kind"][data-pos="0"]')) !== null);

  // --- switch day 0 to a Session and name it ---
  await page.click('[data-action="kind"][data-kind="session"][data-pos="0"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("a day switches to a Session", T(s, 0).kind === "session");
  await page.fill('[data-fh="compose"][data-target="title"][data-pos="0"]', "Push Day");
  await page.fill('[data-fh="compose"][data-target="focus"][data-pos="0"]', "Chest & shoulders");
  await page.waitForTimeout(50);
  s = await ls();
  ck("the Session title + focus are editable (no JSON)", T(s, 0).title === "Push Day" && T(s, 0).focus === "Chest & shoulders");

  // --- add a Group, set its rounds, add two Items → a superset ---
  await page.click('[data-action="add-group"][data-pos="0"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("a Group can be added to the Session", T(s, 0).groups.length === 1);

  await page.fill('[data-fh="compose"][data-target="rounds"][data-pos="0"][data-g="0"]', "4");
  await page.waitForTimeout(40);
  s = await ls();
  ck("the Group's rounds are editable", T(s, 0).groups[0].rounds === 4);

  await page.selectOption('[data-fh="item-add"][data-pos="0"][data-g="0"]', "goblet-squats");
  await page.waitForTimeout(50);
  s = await ls();
  ck("an exercise is added from the Library as an Item with a rail",
    T(s, 0).groups[0].items.length === 1 && T(s, 0).groups[0].items[0].exId === "goblet-squats" && Array.isArray(T(s, 0).groups[0].items[0].rail));

  await page.fill('[data-fh="compose"][data-target="rail-floor"][data-pos="0"][data-g="0"][data-i="0"]', "6");
  await page.fill('[data-fh="compose"][data-target="rail-ceiling"][data-pos="0"][data-g="0"][data-i="0"]', "10");
  await page.waitForTimeout(50);
  s = await ls();
  ck("an Item's rail [floor,ceiling] is editable", T(s, 0).groups[0].items[0].rail[0] === 6 && T(s, 0).groups[0].items[0].rail[1] === 10);

  // a 2nd Item with rest-within 0 makes the Group a superset
  await page.selectOption('[data-fh="item-add"][data-pos="0"][data-g="0"]', "bicep-curls");
  await page.waitForTimeout(50);
  s = await ls();
  ck("a Group with two Items and no rest-within is a superset", T(s, 0).groups[0].items.length === 2 && T(s, 0).groups[0].restWithin === 0);

  // --- Groups add / reorder / remove, and a circuit config (≥2 items + rest-within) ---
  await page.click('[data-action="add-group"][data-pos="0"]'); // a 2nd group (index 1)
  await page.selectOption('[data-fh="item-add"][data-pos="0"][data-g="1"]', "high-knees");
  await page.selectOption('[data-fh="item-add"][data-pos="0"][data-g="1"]', "calf-raises");
  await page.fill('[data-fh="compose"][data-target="rw"][data-pos="0"][data-g="1"]', "15");
  await page.waitForTimeout(50);
  s = await ls();
  ck("a 2nd Group with two Items and a rest-within is a circuit config", T(s, 0).groups[1].items.length === 2 && T(s, 0).groups[1].restWithin === 15);
  await page.click('[data-action="group-up"][data-pos="0"][data-g="1"]'); // circuit → index 0
  await page.waitForTimeout(50);
  s = await ls();
  ck("Groups can be reordered", T(s, 0).groups[0].restWithin === 15 && T(s, 0).groups[1].restWithin === 0);
  await page.click('[data-action="remove-group"][data-pos="0"][data-g="0"]'); // remove the circuit
  await page.waitForTimeout(50);
  s = await ls();
  ck("a Group can be removed", T(s, 0).groups.length === 1 && T(s, 0).groups[0].items.length === 2);

  // --- block length (N weeks) + start date are editable ---
  await page.click('[data-action="weeks-inc"]');
  await page.click('[data-action="weeks-inc"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("the block's week count is editable (N weeks, ADR-0024)", cur(s).weeks === 6);
  await page.fill('#block-start-input', "2026-06-01");
  await page.waitForTimeout(50);
  s = await ls();
  ck("the block start date is editable", cur(s).startDate === "2026-06-01");

  // --- reorder the days within the week (session at 0 moves to 1) ---
  await page.click('[data-action="day-down"][data-pos="0"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("a day can be reordered within the week", T(s, 0).kind === "rest" && T(s, 1).kind === "session" && T(s, 1).title === "Push Day");

  // --- exit Edit → the composed plan renders in the read grid (#43) ---
  await page.click('[data-action="edit-block"]'); // Done
  await page.waitForTimeout(60);
  ck("the composed Session renders as a superset Group of its Items",
    (await page.$('.week-grid .routine.session .group.superset .item')) !== null);
  ck("the composed exercise shows in the read grid",
    (await page.locator(".week-grid .routine.session").first().textContent()).includes("Goblet Squats"));

  // --- persists across reload ---
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(100);
  s = await ls();
  ck("the composed plan persists across reload",
    T(s, 1).kind === "session" && T(s, 1).groups[0].items.length === 2 && cur(s).weeks === 6);

  // --- reordering a day carries its logged history with it (ADR-0020) ---
  // (read mode after reload) log a set against the session at slot 1, then move the day.
  await page.fill('.log-slot[data-ex="goblet-squats"][data-round="0"] [data-field="w"]', "50");
  await page.fill('.log-slot[data-ex="goblet-squats"][data-round="0"] [data-field="r"]', "8");
  await page.waitForTimeout(50);
  s = await ls();
  ck("a set logs against the composed session at its slot (routine 1)",
    s.library["goblet-squats"].performances.some((p) => p.ctx.routine === 1));
  await page.click('[data-action="edit-block"]'); // back into Edit
  await page.waitForTimeout(40);
  await page.click('[data-action="day-up"][data-pos="1"]'); // move the session back to slot 0
  await page.waitForTimeout(50);
  s = await ls();
  ck("reordering a day moves its Performance's slot back-reference with it (routine 1 → 0)",
    T(s, 0).kind === "session" &&
    s.library["goblet-squats"].performances.some((p) => p.ctx.routine === 0) &&
    !s.library["goblet-squats"].performances.some((p) => p.ctx.routine === 1));

  // --- a day's content can be changed between Session / Class / Rest (still in Edit) ---
  await page.click('[data-action="kind"][data-kind="class"][data-pos="2"]');
  await page.waitForTimeout(50);
  await page.selectOption('[data-fh="compose"][data-target="class-type"][data-pos="2"]', "box-fit");
  await page.fill('[data-fh="compose"][data-target="class-dur"][data-pos="2"]', "45");
  await page.waitForTimeout(50);
  s = await ls();
  ck("a day can be set to a Class with a type + duration", T(s, 2).kind === "class" && T(s, 2).classType === "box-fit" && T(s, 2).durationMin === 45);

  await page.click('[data-action="kind"][data-kind="rest"][data-pos="0"]');
  await page.waitForTimeout(50);
  s = await ls();
  ck("a Session day can be changed back to Rest", T(s, 0).kind === "rest");
});
