import { verify } from "./harness.mjs";

/* The v6 Library / exercise-history view (#42), driven through the real app in the browser:
 *   1. a fresh install seeds a v6 store; the Library lives behind its own top-level tab (v5.0.1);
 *   2. loading a v5 store migrates it forward (inject-a-v5-store-then-reload) — the migrated
 *      performances render as an exercise's timeline + PRs;
 *   3. deleting a block removes only the plan — the exercise's performances survive (ADR-0020). */
verify(async ({ page, ck, ls, reset, key }) => {
  page.on("dialog", (d) => d.accept()); // accept the delete-block confirm
  const showLibrary = () => page.click('[data-action="view"][data-view="library"]');
  const showPlan = () => page.click('[data-action="view"][data-view="plan"]');

  // --- 1. fresh install: v6 store; Plan is the default tab, Library behind its own ---
  await reset();
  await page.click('[data-action="week"][data-week="1"]'); // no-op → save() materialises the seed store
  await page.waitForTimeout(60);
  let s = await ls();
  ck("fresh install seeds schema v6", s.version === 6);
  ck("view tabs present", (await page.$('[data-action="view"][data-view="library"]')) !== null);
  ck("Plan is the default view (week view visible, library hidden)",
    (await page.isVisible("#week-view")) && !(await page.isVisible("#library-card")));
  await showLibrary();
  await page.waitForTimeout(40);
  ck("Library tab reveals the Library, hides the plan", (await page.isVisible("#library-card")) && !(await page.isVisible("#week-view")));
  ck("seeded exercises listed in the Library", (await page.$('.lib-ex[data-ex="goblet-squats"]')) !== null);
  // The tab choice persists across a reload.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(80);
  ck("Library tab persists across reload", await page.isVisible("#library-card"));

  // --- 2. inject a v5 store with logged history, reload → migrate forward ---
  await page.evaluate((k) => {
    const D = "b1.w1.d1";
    localStorage.setItem(k, JSON.stringify({
      version: 5,
      library: { "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", contexts: ["strength"], targetReps: "8–12" } },
      blocks: [{
        id: "b1", name: "Block 1", startDate: "2026-06-01",
        routines: [{ routine: 1, kind: "strength", title: "Workout A", focus: "Squat", exercises: [{ id: "goblet-squats", sets: 2 }] }],
      }],
      log: {
        [D + ".ex.goblet-squats.s0.w"]: "40", [D + ".ex.goblet-squats.s0.r"]: "10",
        [D + ".ex.goblet-squats.s1.w"]: "42", [D + ".ex.goblet-squats.s1.r"]: "8",
      },
      ui: { block: "b1", week: 1 },
    }));
  }, key);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);
  await page.click('[data-action="week"][data-week="1"]'); // no-op → persist the migrated store
  await page.waitForTimeout(60);
  s = await ls();
  ck("v5 store migrated to v6 on load", s.version === 6);
  ck("logged sets became performances on the exercise", s.library["goblet-squats"].performances.length === 2);
  ck("performance carries load + volume + zone", (() => {
    const p = s.library["goblet-squats"].performances[0];
    return p.load.metric === "kg" && p.volume.type === "reps" && p.zone === "hypertrophy";
  })());

  // The migrated plan renders as a read-only Session of Groups of Items (Plan tab, the default).
  ck("migrated plan renders a Session with a Group + Item",
    (await page.$('.routine.session .group .item')) !== null);

  // The exercise's timeline + PRs render on the Library tab, and expand on click.
  await showLibrary();
  await page.waitForTimeout(40);
  const ex = page.locator('.lib-ex[data-ex="goblet-squats"]');
  ck("migrated exercise shows its logged count", (await ex.locator(".lib-ex-count").textContent()).includes("2 logged"));
  ck("timeline is collapsed until opened", !(await ex.locator(".perf").first().isVisible()));
  await ex.locator("summary").click();
  await page.waitForTimeout(30);
  ck("clicking the exercise reveals its performance timeline", await ex.locator(".perf").first().isVisible());
  ck("timeline lists both performances", (await ex.locator(".perf").count()) === 2);
  ck("derived PRs shown (e1RM headline)", (await ex.locator(".pr-badges").textContent()).includes("e1RM"));

  // --- 3. deleting a block keeps the exercise's performances (ADR-0020) — Plan tab holds the controls ---
  await showPlan();
  await page.waitForTimeout(40);
  await page.click('[data-action="new-block"]'); // adds a 2nd block, enters Edit mode
  await page.waitForTimeout(60);
  await page.selectOption("#block-select", "b1"); // back to the block that carries the history
  await page.waitForTimeout(60);
  await page.click('[data-action="delete-block"]');
  await page.waitForTimeout(80);
  s = await ls();
  ck("block b1 deleted", !s.blocks.some((b) => b.id === "b1"));
  ck("exercise performances survive the block delete", s.library["goblet-squats"].performances.length === 2);
  ck("history still visible in the Library after delete",
    (await page.locator('.lib-ex[data-ex="goblet-squats"] .lib-ex-count').textContent()).includes("2 logged"));
});
