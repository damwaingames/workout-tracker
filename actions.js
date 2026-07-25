/* The dispatch vocabulary (#62) — every name that routes an event, declared once.
 *
 * CONTEXT's convention is that behaviour routes through a `data-*` tag → map lookup. The tags were
 * bare string literals spelled independently by the emitter (render/compose) and the dispatch
 * (events), which is the same drift the slot ctx had: a `data-fh` or `data-target` that stops
 * matching its handler is *silent* — handleField falls through to the data-k path and returns,
 * composeField does `if (set)` and returns — so a plan edit quietly stops saving. A `data-action`
 * mismatch is louder (a dead button), but shares the fix.
 *
 * So the emitter interpolates a constant and the dispatch map is keyed by the same constant. Rename
 * a constant and both sides move together; mistype one and it's `undefined` at both ends rather
 * than a name that matches on one side only.
 *
 * The app shell (index.html) authors six of these as literals — HTML can't import — so the
 * vocabulary alone can't protect them. verify-actions.mjs closes that: it scrapes every routing
 * attribute out of the live DOM and asserts each value is declared here.
 *
 * Pure data. Imports nothing, so it sits at the root of the graph beside constants.js. */

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

// data-target under FH.exEdit → updateExercise's allow-list: which Exercise field a Library editor
// input sets. Shares the data-target attribute with TARGET (and deliberately reuses the two rail
// names — a plan Item's rail and an exercise's *default* rail are the same concept at two levels);
// the data-fh is what picks the dispatch, so the two vocabularies never collide.
export const EX_FIELD = Object.freeze({
  name: "name",
  setup: "setup",
  cue: "cue",
  loadMode: "loadMode",
  loadMetric: "loadMetric",
  railFloor: "rail-floor",
  railCeiling: "rail-ceiling",
});
