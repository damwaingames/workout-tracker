import { verify } from "./harness.mjs";

/* Per-week schedule + derived weekdays (Feature 2, ADR-0005): a block carries a
 * start date; each routine sits on a real weekday derived from start + (week-1)*7 +
 * its position in that week's schedule. The cell key stays routine-keyed, so every
 * temporal scan is unchanged — this suite covers the new render order, the derived
 * weekday/date header, lazy-lookback seeding, and up/down reorder. */
verify(async ({ page, ck, ls, reset, key }) => {
  // The same weekday/date label the app derives, computed independently here.
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = (date) => WD[date.getDay()] + " " + date.getDate() + " " + MO[date.getMonth()];
  const ymd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const mondayOf = (date) => { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const titleOf = (cell) => page.textContent(`.routine[data-cell="${cell}"] .routine-title`);

  await reset();

  // ---- Slice 1: the block carries a startDate (defaulting to this week's Monday), and
  //      each routine's header shows its derived weekday + date. Identity order (no
  //      schedule yet) → routine 1 sits at position 0 of week 1, so its date == startDate. ----
  const expectMon = mondayOf(new Date()); // the default start: Monday of the seed's createdAt (today)

  const t1 = await titleOf("b1.w1.d1");
  ck("routine 1 header shows its derived weekday + date (this week's Monday)", t1.includes(label(expectMon)));
  ck("routine 1 header no longer shows 'Day 1'", !/Day 1\b/.test(t1));

  // Persistence: after any save, the startDate is on the block as a Monday YYYY-MM-DD.
  await page.click('button[data-action="week"][data-week="1"]');
  await page.waitForTimeout(40);
  const startDate = (await ls()).blocks[0].startDate;
  ck("startDate persisted as a Monday (YYYY-MM-DD)", /^\d{4}-\d{2}-\d{2}$/.test(startDate) && ymd(startDate).getDay() === 1);

  // ---- Slice 2: a stored schedule (a permutation of the routine numbers) drives the
  //      render ORDER — not the catalogue's numeric 1..7. ----
  const cellOrder = () => page.$$eval("#week-view .routine", (els) => els.map((e) => e.dataset.cell));
  const setSchedule = async (wk, order) => {
    await page.evaluate(({ k, wk, order }) => {
      const s = JSON.parse(localStorage.getItem(k));
      s.log["b1.w" + wk + ".sched"] = order;
      localStorage.setItem(k, JSON.stringify(s));
    }, { k: key, wk, order });
    await page.reload({ waitUntil: "load" });
  };

  await setSchedule(1, [3, 1, 2, 4, 5, 6, 7]); // routine 3 first, then 1, then 2, …
  const ord = await cellOrder();
  ck("routines render in the stored schedule order", ord[0] === "b1.w1.d3" && ord[1] === "b1.w1.d1" && ord[2] === "b1.w1.d2");
  ck("routine moved to position 0 takes the Monday slot", (await titleOf("b1.w1.d3")).includes(label(expectMon)));

  // ---- Slice 3: an un-arranged week lazily inherits the most-recent EARLIER arranged
  //      week in the block (so reordering one week carries forward); identity if none. ----
  const weekOrder = async (wk) => { await page.click(`button[data-action="week"][data-week="${wk}"]`); await page.waitForTimeout(40); return cellOrder(); };

  // Week 1 is arranged [3,1,2,…]; week 2 has no schedule of its own → inherits week 1.
  const w2 = await weekOrder(2);
  ck("un-arranged week 2 inherits week 1's order", w2[0] === "b1.w2.d3" && w2[1] === "b1.w2.d1" && w2[2] === "b1.w2.d2");

  // Arrange week 3 differently; week 4 (un-arranged) inherits the nearer week 3, while
  // week 2 still inherits week 1 — each takes the most-recent earlier arranged week.
  await setSchedule(3, [2, 1, 3, 4, 5, 6, 7]);
  const w4 = await weekOrder(4);
  ck("week 4 inherits the nearer arranged week 3, not week 1", w4[0] === "b1.w4.d2" && w4[1] === "b1.w4.d1");
  const w2b = await weekOrder(2);
  ck("week 2 still inherits week 1 (most-recent earlier)", w2b[0] === "b1.w2.d3" && w2b[1] === "b1.w2.d1");

  // ---- Slice 4: up/down reorder swaps neighbours, materialises + persists the week's
  //      schedule, disabled at the ends, Edit mode only. ----
  await reset();
  await page.click("#edit-toggle");
  await page.waitForTimeout(40);
  const up = (cell) => `.routine[data-cell="${cell}"] [data-action="routine-up"]`;
  const down = (cell) => `.routine[data-cell="${cell}"] [data-action="routine-down"]`;
  ck("reorder arrows appear in Edit mode", !!(await page.$(down("b1.w1.d1"))));
  ck("first routine's up arrow is disabled", await page.isDisabled(up("b1.w1.d1")));
  ck("last routine's down arrow is disabled", await page.isDisabled(down("b1.w1.d7")));

  await page.click(down("b1.w1.d1")); // routine 1 (pos 0) swaps with routine 2 (pos 1)
  await page.waitForTimeout(60);
  const ord4 = await cellOrder();
  ck("down swaps a routine with its later neighbour", ord4[0] === "b1.w1.d2" && ord4[1] === "b1.w1.d1");
  ck("reorder materialised + persisted the week schedule", JSON.stringify((await ls()).log["b1.w1.sched"]) === JSON.stringify([2, 1, 3, 4, 5, 6, 7]));

  await page.click("#edit-toggle");
  await page.waitForTimeout(40);
  ck("reorder arrows hidden outside Edit mode", !(await page.$(down("b1.w1.d2"))));

  // ---- Slice 5: derived dates track across weeks, and editing the block start (a free
  //      date, no snap) shifts every derived date. ----
  await reset();
  const wk1d1 = await titleOf("b1.w1.d1");
  await page.click('button[data-action="week"][data-week="2"]');
  await page.waitForTimeout(40);
  const wk2d1 = await titleOf("b1.w2.d1");
  const mon = mondayOf(new Date());
  const plus7 = new Date(mon); plus7.setDate(plus7.getDate() + 7);
  ck("week 1 routine 1 sits on this week's Monday", wk1d1.includes(label(mon)));
  ck("week 2 routine 1 is exactly 7 days later", wk2d1.includes(label(plus7)));

  await page.click("#edit-toggle");
  await page.waitForTimeout(40);
  await page.fill("#block-start-input", "2026-03-04"); // a Wednesday — free date, not snapped
  await page.waitForTimeout(60);
  await page.click('button[data-action="week"][data-week="1"]');
  await page.waitForTimeout(40);
  ck("editing the block start shifts routine 1 to the new start", (await titleOf("b1.w1.d1")).includes(label(ymd("2026-03-04"))));
  ck("block start edit persisted (free date, no snap to Monday)", (await ls()).blocks[0].startDate === "2026-03-04");

  // ---- Slice 6: the editable per-cell date is gone (the schedule is the single source of
  //      order + date); completing a routine no longer stamps a .date log key. ----
  await reset();
  ck("no per-cell date input on a routine card", !(await page.$('.routine[data-cell="b1.w1.d1"] input[type="date"]')));
  await page.click('.routine[data-cell="b1.w1.d1"] input[data-k="b1.w1.d1.done"]');
  await page.waitForTimeout(60);
  ck("completing a routine no longer stamps a .date key", (await ls()).log["b1.w1.d1.date"] === undefined);
  ck("completing still works (done flag set)", (await ls()).log["b1.w1.d1.done"] === true);

  // ---- Slice 7 (invariant guard): progression follows the ROUTINE, not the weekday.
  //      Log routine 1 in week 1, move routine 1 to a later weekday in week 2 — its "Last:"
  //      ghost still reads week 1's reps, because the cell key stays routine-keyed (ADR-0005). ----
  await reset();
  await page.fill('input[data-k="b1.w1.d1.ex.goblet-squats.s0.w"]', "50");
  await page.fill('input[data-k="b1.w1.d1.ex.goblet-squats.s0.r"]', "10");
  await page.waitForTimeout(60);

  await page.click('button[data-action="week"][data-week="2"]'); await page.waitForTimeout(40);
  await page.click("#edit-toggle"); await page.waitForTimeout(40);
  await page.click(down("b1.w2.d1")); // routine 1 → position 1 (a later weekday)
  await page.waitForTimeout(60);
  await page.click("#edit-toggle"); await page.waitForTimeout(40);

  const last = await page.textContent('.routine[data-cell="b1.w2.d1"] .last');
  ck("moved routine still ghosts last week's reps (scan follows routine, not weekday)", /50/.test(last) && /10/.test(last));
  const tue2 = new Date(mondayOf(new Date())); tue2.setDate(tue2.getDate() + 8); // week 2, Tuesday slot
  ck("the moved routine now sits on a later weekday (its slot changed, identity didn't)", (await titleOf("b1.w2.d1")).includes(label(tue2)));

  // ---- Slice 8: a new block starts this week with its own startDate (a clean identity
  //      slate — schedules don't carry across blocks), so its headers render, not break. ----
  await reset();
  await page.click('[data-action="new-block"]');
  await page.waitForTimeout(80);
  const nbId = (await ls()).ui.block;
  ck("a new block carries its own startDate (this week's Monday)", (await titleOf(nbId + ".w1.d1")).includes(label(mondayOf(new Date()))));
});
