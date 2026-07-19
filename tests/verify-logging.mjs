import { verify } from "./harness.mjs";

/* Logging a Session's performances (#44), driven through the real app. Each planned round of an
 * Item is a slot; filling it records a Performance ON the exercise (ADR-0020) — a loaded set logs
 * weight×reps, a band set logs tier×reps, a circuit station logs a done-tick, a steady Item logs
 * minutes+level. Under-completion is honest (an unfilled round has no Performance), and everything
 * persists to the Store and survives reload.
 *
 * A fixed-startDate v6 store is injected (normalise unions in the seed Library so the referenced
 * ids resolve); Performances are dated *today* (logged now), not the routine's scheduled date. */
verify(async ({ page, ck, ls, reset, key }) => {
  await reset();
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({
      version: 6,
      library: {}, classes: {},
      blocks: [{
        id: "b1", name: "Log Block", startDate: "2026-06-01", weeks: 1,
        template: [
          { kind: "session", title: "Everything", focus: "One of each", groups: [
            { items: [{ exId: "goblet-squats", rail: [8, 12] }], rounds: 3, restWithin: 0, restAfter: 90 },
            { items: [{ exId: "bicep-curls", rail: [8, 12] }, { exId: "crunches", rail: [12, 20] }], rounds: 2, restWithin: 0, restAfter: 60 },
            { items: [{ exId: "high-knees", time: 30 }, { exId: "wall-press-ups", time: 30 }], rounds: 3, restWithin: 15, restAfter: 0 },
            { items: [{ exId: "banded-hip-abductions", rail: [10, 15] }], rounds: 2, restWithin: 0, restAfter: 60 },
            { items: [{ exId: "seated-elliptical", time: 1800 }], rounds: 1, restWithin: 0, restAfter: 0 },
            // a circuit mixing a band rep station with a timed done-tick station (the spec's distinct cases)
            { items: [{ exId: "banded-glute-bridges", rail: [10, 15] }, { exId: "calf-raises", time: 30 }], rounds: 2, restWithin: 15, restAfter: 0 },
          ] },
          { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" }, { kind: "rest" },
        ],
      }],
      log: {}, ui: { block: "b1", week: 1, view: "plan" },
    }));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  const now = new Date();
  const todayYmd = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const perfsOf = (s, id) => (s.library[id] && s.library[id].performances) || [];
  const slot = (ex, round) => '.log-slot[data-ex="' + ex + '"][data-round="' + round + '"]';
  const field = (ex, round, f) => slot(ex, round) + ' [data-field="' + f + '"]';

  // --- 1. a loaded set records a Performance (load + reps, dated today) and shows it ---
  await page.fill(field("goblet-squats", 0, "w"), "40");
  await page.fill(field("goblet-squats", 0, "r"), "10");
  await page.waitForTimeout(50);
  let s = await ls();
  let gob = perfsOf(s, "goblet-squats");
  ck("a loaded set records exactly one Performance", gob.length === 1);
  ck("the Performance carries load kg + reps + zone, dated today", (() => {
    const p = gob[0];
    return p && p.load.metric === "kg" && Number(p.load.mag) === 40 &&
      p.volume.type === "reps" && Number(p.volume.val) === 10 && p.zone === "hypertrophy" && p.date === todayYmd;
  })());
  ck("the logged slot shows it (is marked logged)",
    await page.locator(slot("goblet-squats", 0)).evaluate((el) => el.classList.contains("logged")));

  // --- 2. under-completion: fill 2 of 3 sets, the third simply has no Performance (ADR-0026) ---
  await page.fill(field("goblet-squats", 1, "w"), "40");
  await page.fill(field("goblet-squats", 1, "r"), "8");
  await page.waitForTimeout(50);
  s = await ls();
  gob = perfsOf(s, "goblet-squats");
  ck("under-completing logs only the rounds done (2 of 3)", gob.length === 2);
  ck("the un-done round has no Performance", !gob.some((p) => p.ctx && p.ctx.round === 2));
  ck("each Performance is tagged with its round", gob.some((p) => p.ctx.round === 0) && gob.some((p) => p.ctx.round === 1));

  // --- 3. a superset Group logs per round ---
  await page.fill(field("bicep-curls", 0, "w"), "12");
  await page.fill(field("bicep-curls", 0, "r"), "12");
  await page.fill(field("bicep-curls", 1, "w"), "12");
  await page.fill(field("bicep-curls", 1, "r"), "10");
  await page.waitForTimeout(50);
  s = await ls();
  ck("a superset item logs a Performance per round", perfsOf(s, "bicep-curls").length === 2);

  // --- 4. a circuit timed station logs a done-tick ---
  await page.check(field("high-knees", 0, "done"));
  await page.waitForTimeout(50);
  s = await ls();
  const hk = perfsOf(s, "high-knees");
  ck("ticking a station records a timed Performance", hk.length === 1 &&
    hk[0].volume.type === "time" && Number(hk[0].volume.val) === 30 && hk[0].load.metric === "none" && hk[0].zone == null);

  // --- 5. a steady Item logs minutes + level ---
  await page.fill(field("seated-elliptical", 0, "mins"), "25");
  await page.fill(field("seated-elliptical", 0, "level"), "6");
  await page.waitForTimeout(50);
  s = await ls();
  const el = perfsOf(s, "seated-elliptical");
  ck("a steady Item records minutes + machine level", el.length === 1 &&
    el[0].volume.type === "time" && Number(el[0].volume.val) === 1500 &&
    el[0].load.metric === "machine-level" && Number(el[0].load.mag) === 6);

  // --- 6. a band set logs tier + reps ---
  await page.selectOption(field("banded-hip-abductions", 0, "tier"), "medium");
  await page.fill(field("banded-hip-abductions", 0, "r"), "12");
  await page.waitForTimeout(50);
  s = await ls();
  const bha = perfsOf(s, "banded-hip-abductions");
  ck("a band set records the tier as a mini-loop load + reps", bha.length === 1 &&
    bha[0].load.metric === "mini-loop" && bha[0].load.mag === "medium" && Number(bha[0].volume.val) === 12);

  // --- 6b. a rep station INSIDE a circuit logs reps/round (not a done-tick) — the spec's distinct case ---
  ck("a circuit's rep station shows rep inputs, not a done-tick",
    (await page.$$(slot("banded-glute-bridges", 0) + ' [data-field="r"]')).length === 1 &&
    (await page.$$(slot("banded-glute-bridges", 0) + ' [data-field="done"]')).length === 0);
  ck("a circuit's timed station shows a done-tick, not rep inputs",
    (await page.$$(slot("calf-raises", 0) + ' [data-field="done"]')).length === 1 &&
    (await page.$$(slot("calf-raises", 0) + ' [data-field="r"]')).length === 0);
  await page.selectOption(field("banded-glute-bridges", 0, "tier"), "light");
  await page.fill(field("banded-glute-bridges", 0, "r"), "15");
  await page.waitForTimeout(50);
  s = await ls();
  const bgb = perfsOf(s, "banded-glute-bridges");
  ck("the circuit rep station records a band rep Performance (reps, not a tick)", bgb.length === 1 &&
    bgb[0].volume.type === "reps" && Number(bgb[0].volume.val) === 15 && bgb[0].load.metric === "mini-loop" && bgb[0].load.mag === "light");

  // --- 7. clearing a logged field removes its Performance (honest un-log) ---
  await page.fill(field("bicep-curls", 1, "r"), "");
  await page.waitForTimeout(50);
  s = await ls();
  ck("clearing the reps removes that round's Performance", perfsOf(s, "bicep-curls").length === 1);

  // --- 8. everything persists to the Store and survives reload (inputs re-hydrate) ---
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  s = await ls();
  ck("performances survive reload", perfsOf(s, "goblet-squats").length === 2 && perfsOf(s, "seated-elliptical").length === 1);
  ck("a logged slot re-hydrates its inputs after reload",
    (await page.inputValue(field("goblet-squats", 0, "w"))) === "40" &&
    (await page.inputValue(field("goblet-squats", 0, "r"))) === "10");
  ck("a steady slot re-hydrates minutes + level after reload",
    (await page.inputValue(field("seated-elliptical", 0, "mins"))) === "25" &&
    (await page.inputValue(field("seated-elliptical", 0, "level"))) === "6");
  ck("a ticked station re-hydrates as checked",
    await page.locator(field("high-knees", 0, "done")).isChecked());

  // --- 9. it shows in the Library timeline (the exercise owns the history — ADR-0020) ---
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(50);
  ck("the logged work appears in the Library timeline",
    (await page.locator('.lib-ex[data-ex="goblet-squats"] .lib-ex-count').textContent()).includes("2 logged"));
});
