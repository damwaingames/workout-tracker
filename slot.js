/* The slot ctx contract (#62) — the one place the render→handler agreement lives.
 *
 * A Performance back-references the exact plan slot it was logged in (ADR-0020): block, week,
 * routine position, group, item, round. That reference travels from the renderer to the input
 * handler through data-* attributes, and it used to be spelled independently on both sides — a
 * rename on one side produced Number(undefined) → NaN, which the guards swallowed as a silent
 * no-op that wrote a Performance to a slot that doesn't exist.
 *
 * So the attribute names live here and nowhere else. Callers hand a ctx out and get a ctx back;
 * they never spell an attribute. The reader takes a *dataset* (a plain string map — exactly what
 * el.dataset is) rather than an element, which keeps the contract a pure function of its arguments
 * and testable without a browser.
 *
 * Pure, like helpers.js: a function of its arguments, reading no state and importing only `helpers`
 * (for escaping). That's what keeps the graph acyclic — render and events import this; it imports
 * nothing that imports back. */

import { attr } from "./helpers.js";

// The six parts of a Session slot's ctx, in the order they're emitted (ADR-0020), and the three of
// a Class slot's coarser ctx (ADR-0030 — a class isn't composed of group/item/round). `block` is the
// only string; the rest are plan indices.
const SLOT_KEYS = ["block", "week", "routine", "group", "item", "round"];
const CLASS_SLOT_KEYS = ["block", "week", "routine"];

// Emit `keys` of a ctx as data-* attributes, ready to interpolate into an HTML tag. Validates on the
// way out as strictly as ctxFor validates on the way in: an incomplete ctx would otherwise emit
// `data-group="undefined"`, which the reader dutifully rejects — leaving a dead input and putting the
// noise on the far side of the seam. This is the single emit point, so it's the right place to be
// loud, matching slotInputs' throw-on-unknown-mode idiom.
function attrsFor(keys, ctx) {
  for (const k of keys) {
    if (ctx == null || ctx[k] == null || ctx[k] === "") throw new Error("slot ctx missing " + k);
    if (k !== "block" && !INDEX.test(String(ctx[k]))) throw new Error("slot ctx " + k + " is not an index: " + ctx[k]);
  }
  return keys.map((k) => attr(k, ctx[k])).join("");
}

// A plan index as it arrives from a dataset: digits and nothing else. Deliberately stricter than
// Number(), which quietly accepts whitespace (`Number(" ")` is 0), signs, fractions, exponents, and
// hex — any of which would resolve to a plausible-looking index for a locator that is in fact broken.
const INDEX = /^\d+$/;

// Read `keys` back off a dataset into a ctx, or null if any part is missing or malformed. Every key
// but `block` is a plan index — a blank, absent, or garbage locator yields null rather than a ctx
// carrying NaN, making a broken slot a loud no-op instead of silently writing history to a slot that
// doesn't exist.
function ctxFor(keys, dataset) {
  if (!dataset) return null;
  const ctx = {};
  for (const k of keys) {
    const raw = dataset[k];
    if (raw == null || raw === "") return null;
    if (k === "block") { ctx[k] = String(raw); continue; }
    if (!INDEX.test(String(raw))) return null;
    ctx[k] = Number(raw);
  }
  return ctx;
}

// A single plan index read off a control that isn't a log slot — the Edit-mode composer's routine /
// group / item locators (#64). Same strictness as a ctx part, for the same reason: `Number(" ")` is
// 0, so a blank or malformed locator would otherwise resolve to the FIRST group and edit it. -1 is
// the answer instead, an index no array holds, so the verb's bounds guard turns it into a no-op.
export const planIndex = (raw) => (INDEX.test(String(raw == null ? "" : raw)) ? Number(raw) : -1);

/* ---- A Session slot: the six-part Performance ctx (ADR-0020) ---- */
export const slotAttrs = (ctx) => attrsFor(SLOT_KEYS, ctx);
export const slotCtx = (dataset) => ctxFor(SLOT_KEYS, dataset);

/* ---- A Class slot: the coarser Attendance ctx (ADR-0030) ---- */
export const classSlotAttrs = (ctx) => attrsFor(CLASS_SLOT_KEYS, ctx);
export const classSlotCtx = (dataset) => ctxFor(CLASS_SLOT_KEYS, dataset);

/* ---- The in-slot field vocabulary ----
 * The names the renderer gives a slot's inputs and the names the handler reads back. Shared so
 * adding a logged field is one edit: LOG_FIELDS is exactly the raw set buildPerformance destructures
 * (weight, reps, band tier, minutes, machine level, RIR), gathered by value; the done tick is a
 * checkbox rather than a value, so it's named apart. CLASS_FIELDS is an Attendance's actuals
 * (ADR-0030/0014). */
export const FIELD = Object.freeze({
  w: "w", r: "r", tier: "tier", mins: "mins", level: "level", rir: "rir", // a Session slot's inputs
  done: "done", // the station tick — a checkbox, so gathered apart from the value fields
  kcal: "kcal", note: "note", // an Attendance's other two actuals
});
// The value fields a filled slot is gathered from — exactly the raw set buildPerformance
// destructures. FIELD.done isn't among them: it's a checkbox, read by checked-ness rather than value.
export const LOG_FIELDS = [FIELD.w, FIELD.r, FIELD.tier, FIELD.mins, FIELD.level, FIELD.rir];
export const CLASS_FIELDS = [FIELD.mins, FIELD.kcal, FIELD.note];

// Name an input (renderer) and find it again (handler) — the two sides of one name.
export const fieldAttr = (name) => attr("field", name);
export const fieldSelector = (name) => '[data-field="' + name + '"]';
