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
 * Pure, like helpers.js: imports nothing, reads no state. That's what keeps the graph acyclic
 * (render / compose / events import this; it imports nobody). */

import { esc } from "./helpers.js";

// The six parts of a Session slot's ctx, in the order they're emitted (ADR-0020), and the three of
// a Class slot's coarser ctx (ADR-0030 — a class isn't composed of group/item/round). `block` is the
// only string; the rest are plan indices.
const SLOT_KEYS = ["block", "week", "routine", "group", "item", "round"];
const CLASS_SLOT_KEYS = ["block", "week", "routine"];

// Emit `keys` of a ctx as data-* attributes, escaped and ready to interpolate into an HTML tag.
// Leading space so a caller can concatenate it straight after an attribute.
function attrsFor(keys, ctx) {
  return keys.map((k) => ' data-' + k + '="' + esc(String(ctx[k])) + '"').join("");
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
export const LOG_FIELDS = ["w", "r", "tier", "mins", "level", "rir"];
export const DONE_FIELD = "done";
export const CLASS_FIELDS = ["mins", "kcal", "note"];

// Name an input (renderer) and find it again (handler) — the two sides of one name.
export const fieldAttr = (name) => ' data-field="' + name + '"';
export const fieldSelector = (name) => '[data-field="' + name + '"]';
