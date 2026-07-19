import { verify } from "./harness.mjs";

/* The v6 Library / exercise-history view (#42), driven through the real app in the browser:
 *   1. a fresh install seeds a v6 store and renders the Library;
 *   2. loading a v5 store migrates it forward (inject-a-v5-store-then-reload, like
 *      verify-nutrition-purge) — the migrated performances render as an exercise's timeline + PRs;
 *   3. deleting a block removes only the plan — the exercise's performances survive (ADR-0020). */
verify(async ({ page, ck, ls, reset, key }) => {
  page.on("dialog", (d) => d.accept()); // accept the delete-block confirm

  // --- 1. fresh install: v6 store, Library rendered ---
  await reset();
  await page.click('[data-action="week"][data-week="1"]'); // no-op → save() materialises the seed store
  await page.waitForTimeout(60);
  let s = await ls();
  ck("fresh install seeds schema v6", s.version === 6);
  ck("Library card renders", (await page.$("#library-card")) !== null);
  ck("seeded exercises listed in the Library", (await page.$('.lib-ex[data-ex="goblet-squats"]')) !== null);

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

  // The migrated plan renders as a read-only Session of Groups of Items.
  ck("migrated plan renders a Session with a Group + Item",
    (await page.$('.routine.session .group .item')) !== null);

  // The exercise's timeline + PRs render, and expand on click.
  const ex = page.locator('.lib-ex[data-ex="goblet-squats"]');
  ck("migrated exercise shows its logged count", (await ex.locator(".lib-ex-count").textContent()).includes("2 logged"));
  ck("timeline is collapsed until opened", !(await ex.locator(".perf").first().isVisible()));
  await ex.locator("summary").click();
  await page.waitForTimeout(30);
  ck("clicking the exercise reveals its performance timeline", await ex.locator(".perf").first().isVisible());
  ck("timeline lists both performances", (await ex.locator(".perf").count()) === 2);
  ck("derived PRs shown (e1RM headline)", (await ex.locator(".pr-badges").textContent()).includes("e1RM"));

  // --- 3. deleting a block keeps the exercise's performances (ADR-0020) ---
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
