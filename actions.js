/* The dispatch vocabulary (#62) — every name that routes an event, declared once.
 *
 * CONTEXT's convention is that behaviour routes through a `data-*` tag → map lookup. The tags were
 * bare string literals spelled independently by the emitter (render/compose) and the dispatch
 * (events), which is the same drift the slot ctx had: a `data-fh` or `data-target` that stops
 * matching its handler is *silent* — handleField falls through to the data-k path and returns,
 * composeField does `if (set)` and returns — so a plan edit quietly stops saving. A `data-action`
 * mismatch is louder (a dead button), but shares the fix.
 *
 * So the emitter calls this module's builder and the dispatch map is keyed by the same constant.
 * Rename a constant and both sides move together; mistype one and it's `undefined` at both ends
 * rather than a name that matches on one side only. Nothing spells a `data-` prefix inline — which
 * also means a name can't sit inside a string literal where a sweep would mistake prose for code.
 *
 * The app shell (index.html) authors six of these as literals — HTML can't import — so the
 * vocabulary alone can't protect them. verify-actions.mjs closes that: it scrapes every routing
 * attribute out of the live DOM and asserts each value is declared here.
 *
 * Names + the emitters/selectors that spell them. Imports only `helpers` (for the shared attribute
 * builder), so it sits near the root of the graph beside constants.js. */

import { attr } from "./helpers.js";

// data-action → handleClick (the app-level switch) and composeActions (the plan-authoring
// delegation). One namespace, one attribute, so one map — which of the two dispatches handles a
// given name is events.js's business, not the emitter's.
export const ACTION = Object.freeze({
  // App-level (handleClick). new-block / edit-block / export / drive-push / drive-pull / reset are
  // authored in index.html rather than emitted, so nothing here interpolates them — they're declared
  // for the dispatch side and for the DOM guard.
  view: "view",
  week: "week",
  toggleCollapse: "toggle-collapse",
  holidaySwap: "holiday-swap",
  winddownToggle: "winddown-toggle",
  exRetire: "ex-retire",
  newBlock: "new-block",
  deleteBlock: "delete-block",
  editBlock: "edit-block",
  mAdd: "m-add",
  mRemove: "m-remove",
  pickerOpen: "picker-open",
  formOpen: "form-open",
  formCancel: "form-cancel",
  export: "export",
  drivePush: "drive-push",
  drivePull: "drive-pull",
  reset: "reset",
  // Plan authoring (composeActions) — each mutates the current block's template.
  addGroup: "add-group",
  removeGroup: "remove-group",
  groupUp: "group-up",
  groupDown: "group-down",
  removeItem: "remove-item",
  kind: "kind",
  dayUp: "day-up",
  dayDown: "day-down",
  weeksInc: "weeks-inc",
  weeksDec: "weeks-dec",
});

// data-fh → fieldByName: a field whose change isn't a plain logged scalar but drives its own effect.
export const FH = Object.freeze({
  pickerSearch: "picker-search",
  log: "log",
  compose: "compose",
  itemAdd: "item-add",
  classLog: "class-log",
  exEdit: "ex-edit",
  exEquip: "ex-equip",
});

// data-target under FH.compose → composeTargets: which plan field a compose input sets.
export const TARGET = Object.freeze({
  title: "title",
  focus: "focus",
  classType: "class-type",
  classDur: "class-dur",
  rounds: "rounds",
  rw: "rw",
  ra: "ra",
  railFloor: "rail-floor",
  railCeiling: "rail-ceiling",
  itemTime: "item-time",
});

// Marker attributes — an element a handler must *find*. CSS classes are for styling and test
// selection and don't route behaviour (CONTEXT), so anything reached by `closest`/`querySelector`
// carries one of these instead. Same silent-failure class as the rest: a marker that stops matching
// leaves the handler's `if (el)` guard returning quietly, so they're declared here like everything
// else rather than spelled at both ends.
// The prefix is what makes a marker self-describing: verify-actions scrapes `data-mark-*` and knows
// it has found exactly the markers, with no list of payload attributes to keep in step.
const MARK_PREFIX = "mark-";

export const MARK = Object.freeze({
  slot: "slot",                             // one round's log slot (carries a Session ctx)
  classSlot: "class-slot",                  // a Class card's actuals (carries an Attendance ctx)
  routineCard: "routine-card",              // the day card a logged flag toggles on
  picker: "picker",                         // an add-zone: the disclosure + its panel
  pickerPanel: "picker-panel",
  pickerSearch: "picker-search",
  pickerList: "picker-list",
  pickerForm: "picker-form",
  libEx: "lib-ex",                          // a Library entry (paired with data-ex for the id)
  libExName: "lib-ex-name",                 // its summary label, live-patched on rename
  winddownAdherence: "winddown-adherence",  // the adherence line, live-patched on target change
});

/* ---- Emitting a name, and finding it again ---- */
export const actionAttr = (a) => attr("action", a);
export const fhAttr = (h) => attr("fh", h);
export const targetAttr = (t) => attr("target", t);
// A marker is presence, not a value, so it emits bare — no builder needed, and no `true` sentinel
// threaded through the shared one to select a second behaviour.
export const markAttr = (m) => " data-" + MARK_PREFIX + m;
export const markSelector = (m) => "[data-" + MARK_PREFIX + m + "]";
export const actionSelector = (a) => '[data-action="' + a + '"]';
