/* Pure-Node slot ctx contract test (no browser) — #62. The render→handler contract used to be ~80
 * bare string literals spelled independently on both sides; slot.js owns it now, so this is where
 * it's proved. The round trip IS the behaviour: a ctx that goes out must come back identical, and a
 * broken locator must come back as nothing rather than a ctx carrying NaN.
 *
 * We assert through the dataset, not through rendered HTML — slotCtx takes a plain string map
 * (exactly what el.dataset is), which is what keeps this contract on the fast seam. Prior art: the
 * pure-Node verify-progression / verify-tonnage.
 *
 * Run standalone (`node verify-slot.mjs`) or via run.mjs, which spawns it and checks the exit code
 * like any other verify-*.mjs — it just never launches Playwright. */

import {
  slotAttrs, slotCtx, classSlotAttrs, classSlotCtx,
  LOG_FIELDS, CLASS_FIELDS, DONE_FIELD, fieldAttr, fieldSelector,
} from "../slot.js";

let pass = 0, fail = 0;
const ck = (label, cond) => { (cond ? pass++ : fail++); console.log((cond ? "ok  " : "FAIL") + "  " + label); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Mirror what a browser does when it turns attributes into el.dataset. Deliberately an independent
// implementation (a regex, not slot.js's own serialiser) so the round-trip assertion can actually
// disagree with the code rather than passing by construction.
const datasetOf = (attrs) => Object.fromEntries(
  [...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(([, k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]),
);

/* ---------------------------------------------------------------------- *
 * A Session slot's ctx — the six-part back-reference a Performance        *
 * carries (ADR-0020): block, week, routine, group, item, round.           *
 * ---------------------------------------------------------------------- */
(() => {
  const ctx = { block: "b1", week: 2, routine: 3, group: 1, item: 0, round: 2 };
  const back = slotCtx(datasetOf(slotAttrs(ctx)));
  ck("a Session ctx survives the round trip through the attributes", same(back, ctx));
})();

/* ---------------------------------------------------------------------- *
 * A Class slot's ctx — the coarser three-part reference an Attendance     *
 * carries (ADR-0030): a class isn't composed of group/item/round.         *
 * ---------------------------------------------------------------------- */
(() => {
  const ctx = { block: "b1", week: 1, routine: 4 };
  const back = classSlotCtx(datasetOf(classSlotAttrs(ctx)));
  ck("a Class ctx survives the round trip through the attributes", same(back, ctx));
  ck("a Class ctx carries no group/item/round", back && !("group" in back) && !("round" in back));
})();

/* ---------------------------------------------------------------------- *
 * Broken locators. The whole point of the module: a ctx that can't be     *
 * read must come back as nothing, so a mis-emitted slot is a loud no-op   *
 * rather than a Performance written to a slot that doesn't exist.         *
 * ---------------------------------------------------------------------- */
(() => {
  const good = { block: "b1", week: 1, routine: 0, group: 0, item: 0, round: 0 };
  const brokenAt = (over) => slotCtx(Object.assign(datasetOf(slotAttrs(good)), over));

  ck("a missing part → null", brokenAt({ group: undefined }) === null);
  ck("a blank part → null", brokenAt({ item: "" }) === null);
  ck("a whitespace part → null (Number(' ') is 0 — the trap)", brokenAt({ round: " " }) === null);
  ck("a non-numeric part → null, never a ctx carrying NaN", brokenAt({ routine: "two" }) === null);
  ck("a fractional index → null", brokenAt({ group: "1.5" }) === null);
  ck("a negative index → null", brokenAt({ item: "-1" }) === null);
  ck("a missing block → null", brokenAt({ block: "" }) === null);
  ck("no dataset at all → null", slotCtx(null) === null && slotCtx(undefined) === null);
  ck("a Class ctx rejects a broken part the same way", classSlotCtx({ block: "b1", week: "x", routine: "0" }) === null);
})();

/* ---------------------------------------------------------------------- *
 * Zero indices are the falsy trap: the first Group's first Item's first   *
 * round is {0,0,0}, which must round-trip like any other slot.            *
 * ---------------------------------------------------------------------- */
(() => {
  const ctx = { block: "b1", week: 1, routine: 0, group: 0, item: 0, round: 0 };
  ck("an all-zero slot round-trips (0 is a position, not an absence)", same(slotCtx(datasetOf(slotAttrs(ctx))), ctx));
})();

/* ---------------------------------------------------------------------- *
 * A real slot's dataset carries more than the ctx (the exercise, the log  *
 * mode, the field handler). Reading a ctx must take its six parts and     *
 * leave the rest alone.                                                   *
 * ---------------------------------------------------------------------- */
(() => {
  const ctx = { block: "b1", week: 3, routine: 2, group: 1, item: 1, round: 0 };
  const dataset = Object.assign(datasetOf(slotAttrs(ctx)), { ex: "goblet-squats", mode: "load-reps", fh: "log" });
  ck("extra dataset keys are ignored, not leaked into the ctx", same(slotCtx(dataset), ctx));
})();

/* ---------------------------------------------------------------------- *
 * A block id is user-facing text, so it must survive the attribute        *
 * boundary — including a quote, which would otherwise break out of it.    *
 * ---------------------------------------------------------------------- */
(() => {
  const ctx = { block: 'b"1', week: 1, routine: 0, group: 0, item: 0, round: 0 };
  const attrs = slotAttrs(ctx);
  ck("a quote in a block id is escaped rather than breaking the attribute", !attrs.includes('b"1'));
  ck("an ampersand in a block id is escaped", slotAttrs({ ...ctx, block: "a&b" }).includes("&amp;"));
})();

/* ---------------------------------------------------------------------- *
 * The in-slot field vocabulary — the other half of the contract. The      *
 * renderer names an input and the handler looks it up; both go through    *
 * here, so adding a logged field is one edit rather than two that can     *
 * silently disagree.                                                      *
 * ---------------------------------------------------------------------- */
(() => {
  ck("every log field's emitted attribute is found by its own selector",
    LOG_FIELDS.every((f) => datasetOf(fieldAttr(f)).field === f));
  ck("the done tick and the class fields agree the same way",
    datasetOf(fieldAttr(DONE_FIELD)).field === DONE_FIELD && CLASS_FIELDS.every((f) => datasetOf(fieldAttr(f)).field === f));
  ck("a selector targets the field its attribute emits",
    LOG_FIELDS.every((f) => fieldSelector(f) === '[data-field="' + f + '"]'));
  ck("the log vocabulary is the set buildPerformance reads",
    same([...LOG_FIELDS].sort(), ["level", "mins", "r", "rir", "tier", "w"]));
  ck("the class vocabulary is minutes, wearable burn, and a note (ADR-0030/0014)",
    same([...CLASS_FIELDS].sort(), ["kcal", "mins", "note"]));
})();

console.log("\n" + (fail === 0 ? "PASS" : "FAIL") + ` (${pass} ok, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
