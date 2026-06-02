import { chromium } from "playwright";

const URL = process.env.WT_URL || "http://localhost:8765/";
const errors = [];
const checks = [];
const ck = (label, cond) => { checks.push([label, !!cond]); console.log((cond ? "ok  " : "FAIL") + "  " + label); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const ls = () => page.evaluate(() => JSON.parse(localStorage.getItem("workout-tracker-v2")));

await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await page.reload({ waitUntil: "load" });

// --- log a value, then rename a block in edit mode (exercises the setState-free path) ---
await page.fill('[data-cell="b1.w1.d1"] .w', "42");
await page.waitForTimeout(40);
ck("logged weight persisted", (await ls()).log["b1.w1.d1.ex.goblet-squats.s0.w"] === "42");

// --- IMPORT a hand-built v2 backup (drives setState(normalise(data)) + setEditing(false)) ---
const backup = {
  version: 2,
  library: { "goblet-squats": { id: "goblet-squats", name: "Goblet Squats", type: "strength", targetReps: "8–12" } },
  blocks: [{ id: "b9", name: "Imported Block", createdAt: "2026-01-01",
    days: [{ day: 1, kind: "strength", title: "Imported A", focus: "Test", exercises: [{ id: "goblet-squats", sets: 3 }] }] }],
  log: { "b9.w1.d1.ex.goblet-squats.s0.w": "99" },
  ui: { block: "b9", week: 1 }, notes: "imported notes",
  measurements: { bodyweight: { id: "bodyweight", name: "Bodyweight", unit: "kg" } },
  tracked: ["bodyweight"], profile: {},
};
await page.setInputFiles("#import-input", {
  name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
});
await page.waitForTimeout(80);
let s = await ls();
ck("import replaced state (block name)", s.blocks[0].name === "Imported Block");
ck("import kept logged value", s.log["b9.w1.d1.ex.goblet-squats.s0.w"] === "99");
ck("import cleared editing (Edit label)", (await page.textContent("#edit-toggle")).trim() === "Edit");
ck("imported notes hydrated into field", (await page.inputValue("#notes-field")) === "imported notes");
ck("imported block rendered", (await page.textContent("#week-view")).includes("Imported A"));

// --- RESET (drives setState(defaultState()) + setEditing(false)) ---
page.once("dialog", (d) => d.accept());
await page.click('[data-action="reset"]');
await page.waitForTimeout(80);
s = await ls();
ck("reset restored seed block", s.blocks.length === 1 && s.blocks[0].id === "b1");
ck("reset cleared old log", !s.log["b9.w1.d1.ex.goblet-squats.s0.w"]);
ck("reset re-rendered seed day", (await page.textContent("#week-view")).includes("Workout A"));

await browser.close();
const failed = checks.filter(([, ok]) => !ok);
if (errors.length) console.log("\nERRORS:\n" + errors.join("\n"));
console.log("\n" + (failed.length === 0 && errors.length === 0 ? "PASS" : "FAIL (" + failed.length + " checks, " + errors.length + " errors)"));
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
