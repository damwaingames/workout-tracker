/* Event handling and the block / backup operations they trigger. Mutates the store (through its
 * setters), then calls into render.js to reflect the change.
 *
 * Training handlers so far: block navigation + rename, and Session logging (#44) — each logging
 * input carries data-fh="log" and routes through the fieldByName map to record a Performance on the
 * exercise. The measurements card + footer backups are untouched infra. Composing the plan (#45)
 * brings its authoring handlers on top. */

import { slugify, uniqueId, buildPerformance, validYMD, cellScalarKey, itemLogMode } from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog, logPerformance, logAttendance,
  updateExercise, setExerciseRailBound, toggleExerciseEquip, setExerciseRetired,
  currentBlock, currentCell, deleteBlock, nextBlockNumber, blockIdTaken, defaultState, newBlockTemplate, M,
  blankRoutine, blankGroup, newItem, swapDays, toggleWinddown, setWinddownField, itemAtCtx,
} from "./state.js";
import { ACTION, FH, TARGET, MARK, markSelector, actionSelector } from "./actions.js";
import { EX_FIELDS } from "./constants.js";
import { slotCtx, classSlotCtx, fieldSelector, FIELD, LOG_FIELDS, CLASS_FIELDS } from "./slot.js";
import { render, renderBmi, renderWinddownAdherence, repopulate, hydrateNotes } from "./render.js";
import { exportBackup, importBackup, drivePush, drivePull } from "./io.js";

/* ---------------------------------------------------------------------- *
 * Clicks                                                                  *
 * ---------------------------------------------------------------------- */
export function handleClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  // Plan-authoring clicks (#45) all mutate the current block's template, then save + re-render — one
  // delegation instead of a case each, so handleClick stays about the app-level actions below.
  if (Object.prototype.hasOwnProperty.call(composeActions, el.dataset.action)) {
    composeActions[el.dataset.action](el);
    save(); render();
    return;
  }
  switch (el.dataset.action) {
    case ACTION.view: state.ui.view = el.dataset.view; save(); render(); break;
    case ACTION.week: state.ui.week = Number(el.dataset.week); save(); render(); break;
    // Fold/unfold a Session card (#47) — a persisted per-occurrence flag keyed by cell, like `.done`.
    case ACTION.toggleCollapse: {
      const k = cellScalarKey(currentCell(Number(el.dataset.pos)), "collapsed");
      setLog(k, state.log[k] ? "" : true); render(); break;
    }
    // Swap the Holiday Session into (or out of) a day (#48, ADR-0025) — a per-occurrence flag; the
    // planned exercises simply accrue no Performance while it's swapped in, so their ghosts wait.
    case ACTION.holidaySwap: {
      const k = cellScalarKey(currentCell(Number(el.dataset.pos)), "holiday");
      setLog(k, state.log[k] ? "" : true); render(); break;
    }
    // Tick / un-tick a wind-down night (#49, ADR-0028) — a date-keyed habit outside any block; a
    // full render is fine since no text field holds focus. A future night's button is disabled.
    case ACTION.winddownToggle: toggleWinddown(el.dataset.date); render(); break;
    // Retire / un-retire an exercise (#50, ADR-0020) — re-render so it re-sorts, tags, and drops out
    // of (or back into) the composer pickers, which filter retired.
    case ACTION.exRetire: { const ex = state.library[el.dataset.ex]; setExerciseRetired(el.dataset.ex, !(ex && ex.retired)); render(); break; }
    case ACTION.newBlock: newBlock(); break;
    case ACTION.deleteBlock: removeCurrentBlock(); break;
    case ACTION.editBlock: setEditing(!editing); render(); break;
    case ACTION.mAdd: {
      const id = el.dataset.m;
      if (state.measurements[id] && state.tracked.indexOf(id) < 0) state.tracked.push(id);
      save(); render(); break;
    }
    case ACTION.mRemove:
      state.tracked = state.tracked.filter((x) => x !== el.dataset.m);
      save(); render(); break;
    case ACTION.pickerOpen: {
      const zone = el.closest(markSelector(MARK.picker));
      const picker = zone && zone.querySelector(markSelector(MARK.pickerPanel));
      if (!picker) break;
      picker.hidden = !picker.hidden;
      if (!picker.hidden) {
        repopulate(zone, "");
        const s = picker.querySelector(markSelector(MARK.pickerSearch));
        if (s) s.focus();
      }
      break;
    }
    // Generic form disclosure: a trigger button + a hidden <form> sibling. Open reveals the form
    // and hides the trigger; cancel resets it and restores the trigger.
    case ACTION.formOpen: {
      const form = el.parentNode.querySelector("form");
      form.hidden = false; el.hidden = true;
      const first = form.querySelector("input, select, textarea");
      if (first) first.focus();
      break;
    }
    case ACTION.formCancel: {
      const form = el.closest("form");
      form.hidden = true; form.reset();
      const trigger = form.parentNode.querySelector(actionSelector(ACTION.formOpen));
      if (trigger) trigger.hidden = false;
      break;
    }
    case ACTION.export: exportBackup(); break;
    case ACTION.drivePush: drivePush(); break;
    case ACTION.drivePull: drivePull(); break;
    case ACTION.reset: resetAll(); break;
  }
}

/* ---------------------------------------------------------------------- *
 * Submits — only the measurement create form this slice                  *
 * ---------------------------------------------------------------------- */
export function handleSubmit(e) {
  const form = e.target.closest(markSelector(MARK.pickerForm));
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  const unit = fd.get("unit") === "kg" ? "kg" : "cm";
  const id = uniqueId(slugify(name), (x) => state.measurements[x]);
  state.measurements[id] = M(id, name, unit);
  if (state.tracked.indexOf(id) < 0) state.tracked.push(id);
  save(); render();
}

/* ---------------------------------------------------------------------- *
 * Field input                                                            *
 * ---------------------------------------------------------------------- */
const fieldById = {
  "import-input"(el) {
    if (el.files && el.files[0]) importBackup(el.files[0]);
    el.value = "";
  },
  "notes-field"(el) { state.notes = el.value; save(); },
  "block-name-input"(el) {
    const block = currentBlock();
    block.name = el.value;
    save();
    // Hand-patch the picker label instead of a full render (which would steal focus mid-type).
    const opt = document.querySelector('#block-select option[value="' + block.id + '"]');
    if (opt) opt.textContent = el.value;
  },
  "block-select"(el) { state.ui.block = el.value; state.ui.week = 1; save(); render(); },
  "height-input"(el) {
    const v = parseFloat(el.value);
    state.profile.heightCm = Number.isFinite(v) && v > 0 ? v : null;
    save(); renderBmi();
  },
  // The block start date (Edit mode) — a valid YYYY-MM-DD re-anchors the weekday labels (ADR-0024),
  // so it re-renders; garbage from a half-cleared field is ignored rather than corrupting the date.
  "block-start-input"(el) { const b = currentBlock(); if (validYMD(el.value)) { b.startDate = el.value; save(); render(); } },
  // The wind-down weekly target / nightly duration (Edit mode). The target drives the adherence
  // readout, so live-patch just that line (no full render, keeping the number input's focus); the
  // duration is text-only, so it needs no patch. Both are app-level singletons, not block state.
  "winddown-target"(el) { setWinddownField("weeklyTarget", el.value); renderWinddownAdherence(); },
  "winddown-duration"(el) { setWinddownField("durationMin", el.value); },
};

// Live-patch refreshers keyed by an input's data-refresh tag — the data-*→map dispatch the CONTEXT
// conventions mandate (behaviour routes off a tag, never a string scan). The full render already
// emits correct totals; these only re-patch in place so the edited input keeps focus mid-type.
const refreshBy = { bmi: renderBmi };

// Special field handlers keyed by data-fh (the CONTEXT data-fh→fieldByName dispatch): a field whose
// change isn't a plain logged scalar but drives its own effect — the picker search filter, and a
// Session log input (gathers its slot → a Performance).
// Which bound of an exercise's default Rail a Library-editor target writes (the plan's own rail
// targets, reused — a default rail is the same concept one level up).
const EX_RAIL_BOUND = { [TARGET.railFloor]: 0, [TARGET.railCeiling]: 1 };

const fieldByName = {
  [FH.pickerSearch](el) { const zone = el.closest(markSelector(MARK.picker)); if (zone) repopulate(zone, el.value); },
  [FH.log]: logField,
  // Scalar plan edits (title/focus/rounds/rests/rail/duration) mutate + save but DON'T re-render, so
  // the field keeps focus mid-type — like the block-name input and the measurement values.
  [FH.compose]: composeField,
  // Adding an exercise to a Group IS structural (a new Item row), so it re-renders.
  [FH.itemAdd](el) {
    const g = groupAt(el);
    if (g && el.value) { g.items.push(newItem(el.value)); save(); render(); }
  },
  // Log a Class occurrence (#50): gather the card's minutes / kcal / note → an Attendance on the type.
  [FH.classLog]: classLogField,
  // Edit an exercise field in the Library (#50). Scalar mutate + save, no re-render (keeps focus); the
  // summary name is hand-patched, like the block-name input patches its select option.
  [FH.exEdit](el) {
    const target = el.dataset.target;
    // Translate the DOM target into a domain call — the two rail bounds map onto `defaultRail`, every
    // other target is an Exercise field name. state.js knows nothing about data-target either way.
    // A target→bound map rather than a ternary, matching composeTargets right below.
    const bound = EX_RAIL_BOUND[target];
    if (bound != null) setExerciseRailBound(el.dataset.ex, bound, el.value);
    else updateExercise(el.dataset.ex, target, el.value);
    if (target === EX_FIELDS.name) {
      // MARK.libEx marks the Library entry; data-ex names the exercise (a log slot carries one too,
      // hence both). The exercise id is the app's own slug, so it needs no attribute-value escaping.
      const nm = document.querySelector(markSelector(MARK.libEx) + '[data-ex="' + el.dataset.ex + '"] ' + markSelector(MARK.libExName));
      if (nm) nm.textContent = el.value;
    }
  },
  // Toggle an equipment tag on an exercise (#50) — a checkbox, so it reflects its own state; no render.
  [FH.exEquip](el) { toggleExerciseEquip(el.dataset.ex, el.dataset.equip); },
};

// Log (or clear) a Class occurrence's actuals at its plan slot (#50, ADR-0030): gather the card's
// minutes, wearable kcal, and note → an Attendance on the class type (null when all empty — honest
// under-completion). A full render would steal focus mid-type, so it reflects the logged state in place.
function classLogField(el) {
  const box = el.closest(markSelector(MARK.classSlot));
  if (!box) return;
  const ctx = classSlotCtx(box.dataset);
  if (!ctx) return; // a slot whose locator didn't read is a no-op, never a write to a guessed slot
  const val = (f) => { const n = box.querySelector(fieldSelector(f)); return n ? n.value : ""; };
  const raw = Object.fromEntries(CLASS_FIELDS.map((f) => [f, val(f)]));
  const mins = Number(raw.mins) || 0, kcal = Number(raw.kcal) || 0, note = raw.note.trim();
  const data = (mins > 0 || kcal > 0 || note) ? { mins, kcal, note } : null;
  logAttendance(box.dataset.class, ctx, data);
  const card = box.closest(markSelector(MARK.routineCard));
  if (card) card.classList.toggle("logged", !!data);
}

// Log a Session Item's effort at one slot: gather the slot's raw inputs, build the Performance its
// mode records (or null to clear), write it onto the exercise, and reflect the logged state in place.
// A full render would steal focus mid-type — the measurements card avoids it the same way.
function logField(el) {
  const slot = el.closest(markSelector(MARK.slot));
  if (!slot) return;
  const d = slot.dataset;
  const ctx = slotCtx(d);
  if (!ctx) return; // ditto: a broken locator writes nothing rather than a Performance to nowhere
  // The plan answers what was planned — the log mode and a station's duration are both classified
  // from the Item, not read back off attributes the renderer echoed (#62). A ctx that no longer
  // resolves to an Item can't be logged against meaningfully, so it's a no-op like a broken locator.
  const it = itemAtCtx(ctx);
  if (!it) return;
  // Before this, the mode and the exercise id were baked together at render, so they agreed by
  // construction; now the ctx and the id are two independent lookups. data-ex survives as the slot's
  // test-selection handle, so assert rather than assume — disagreement means the markup has drifted
  // from the plan, and classifying one exercise's Item as another's is exactly the silent write the
  // module exists to prevent. The plan's exId is the one that counts from here.
  if (it.exId !== d.ex) return;
  const ex = state.library[it.exId];
  if (!ex) return;
  const val = (f) => { const n = slot.querySelector(fieldSelector(f)); return n ? n.value : ""; };
  const raw = Object.fromEntries(LOG_FIELDS.map((f) => [f, val(f)]));
  const done = slot.querySelector(fieldSelector(FIELD.done));
  if (done) {
    raw.done = done.checked;
    raw.time = it.time != null ? it.time : 0;
  }
  const data = buildPerformance(itemLogMode(it, ex), ex, raw);
  logPerformance(it.exId, ctx, data);
  slot.classList.toggle("logged", !!data);
}

export function handleField(e) {
  const el = e.target;
  if (el.id && Object.prototype.hasOwnProperty.call(fieldById, el.id)) return fieldById[el.id](el);
  const fh = el.dataset.fh;
  if (fh && Object.prototype.hasOwnProperty.call(fieldByName, fh)) return fieldByName[fh](el);
  // Generic logged-field path: everything carrying data-k (the measurement values this slice).
  const k = el.dataset.k;
  if (!k) return;
  setLog(k, el.value);
  const r = el.dataset.refresh; // which running total this field feeds (if any)
  if (r && Object.prototype.hasOwnProperty.call(refreshBy, r)) refreshBy[r]();
}

/* ---------------------------------------------------------------------- *
 * Plan authoring (#45) — compose the current block's weekly template.     *
 * ---------------------------------------------------------------------- */
// Locate the routine / group / item a compose control points at, from its data-pos/g/i — or the
// app-level Holiday Session singleton when the control carries data-holiday (#48). Its Groups/Items
// then compose through the same mutators, since they only ever go through routineAt/groupAt/itemAt.
const routineAt = (el) => (el.dataset.holiday ? state.holiday : currentBlock().template[Number(el.dataset.pos)]);
const groupAt = (el) => { const r = routineAt(el); return r && r.groups && r.groups[Number(el.dataset.g)]; };
const itemAt = (el) => { const g = groupAt(el); return g && g.items && g.items[Number(el.dataset.i)]; };
// Swap array element i with its neighbour in `dir` (±1), if that neighbour exists.
function swapBy(arr, i, dir) { const j = i + dir; if (arr && arr[i] && arr[j] !== undefined) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } }
// A non-negative integer field value clamped to a floor (blank / garbage → the floor).
const clampNum = (v, min) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, n) : min; };

// Structural authoring clicks — each mutates the current block's template; handleClick saves + renders.
const composeActions = {
  [ACTION.addGroup](el) { const r = routineAt(el); if (r && r.groups) r.groups.push(blankGroup()); },
  [ACTION.removeGroup](el) { const r = routineAt(el); if (r && r.groups) r.groups.splice(Number(el.dataset.g), 1); },
  [ACTION.groupUp](el) { const r = routineAt(el); if (r) swapBy(r.groups, Number(el.dataset.g), -1); },
  [ACTION.groupDown](el) { const r = routineAt(el); if (r) swapBy(r.groups, Number(el.dataset.g), 1); },
  [ACTION.removeItem](el) { const g = groupAt(el); if (g) g.items.splice(Number(el.dataset.i), 1); },
  // Switch a day's kind — a fresh Routine of that kind (only when it actually changes, so an accidental
  // re-click of the active kind doesn't wipe the day's content).
  [ACTION.kind](el) { const b = currentBlock(); const pos = Number(el.dataset.pos); if (b.template[pos] && b.template[pos].kind !== el.dataset.kind) b.template[pos] = blankRoutine(el.dataset.kind); },
  [ACTION.dayUp](el) { const b = currentBlock(); const p = Number(el.dataset.pos); swapDays(b, p, p - 1); },
  [ACTION.dayDown](el) { const b = currentBlock(); const p = Number(el.dataset.pos); swapDays(b, p, p + 1); },
  [ACTION.weeksInc]() { currentBlock().weeks += 1; },
  [ACTION.weeksDec]() { const b = currentBlock(); b.weeks = Math.max(1, b.weeks - 1); if (state.ui.week > b.weeks) state.ui.week = b.weeks; },
};

// Scalar plan edits keyed by data-target — the CONTEXT data-*→map dispatch (like fieldByName). Each
// handler locates its own level (routine / group / item) off the input's data-pos/g/i and sets one
// field from the value, so all ten read the same way.
const composeTargets = {
  [TARGET.title]: (el, v) => { const r = routineAt(el); if (r) r.title = v; },
  [TARGET.focus]: (el, v) => { const r = routineAt(el); if (r) r.focus = v; },
  [TARGET.classType]: (el, v) => { const r = routineAt(el); if (r) r.classType = v; },
  [TARGET.classDur]: (el, v) => { const r = routineAt(el); if (r) r.durationMin = clampNum(v, 0); },
  [TARGET.rounds]: (el, v) => { const g = groupAt(el); if (g) g.rounds = clampNum(v, 1); },
  [TARGET.rw]: (el, v) => { const g = groupAt(el); if (g) g.restWithin = clampNum(v, 0); },
  [TARGET.ra]: (el, v) => { const g = groupAt(el); if (g) g.restAfter = clampNum(v, 0); },
  [TARGET.railFloor]: (el, v) => { const it = itemAt(el); if (it && it.rail) it.rail[0] = clampNum(v, 1); },
  [TARGET.railCeiling]: (el, v) => { const it = itemAt(el); if (it && it.rail) it.rail[1] = clampNum(v, 1); },
  [TARGET.itemTime]: (el, v) => { const it = itemAt(el); if (it) it.time = clampNum(v, 0) * (el.dataset.unit === "min" ? 60 : 1); },
};
// Set the field a compose input names, then save — no render, so the edited input keeps focus mid-type
// (like the block-name + measurement inputs). An unknown target is ignored, as the field dispatch does.
function composeField(el) {
  const set = composeTargets[el.dataset.target];
  if (set) { set(el, el.value); save(); }
}

/* ---------------------------------------------------------------------- *
 * Blocks & backups                                                       *
 * ---------------------------------------------------------------------- */
function newBlock() {
  const num = nextBlockNumber();
  const id = uniqueId("b" + num, (x) => blockIdTaken(x));
  state.blocks.push(newBlockTemplate(id, "Block " + num));
  state.ui.block = id;
  state.ui.week = 1;
  setEditing(true);
  save(); render();
}

// Delete the current block — the plan only. Its exercises' performances and its classes'
// attendances live on those entities (ADR-0020/0030), so they survive; deleteBlock removes the
// block object and sweeps its occurrence + measurement log keys.
function removeCurrentBlock() {
  if (state.blocks.length <= 1) return;
  const b = currentBlock();
  if (!window.confirm("Delete " + b.name + "? Its plan goes, but every logged performance and class stays on your exercises.")) return;
  deleteBlock(b.id);
  save(); render();
}

function resetAll() {
  if (!window.confirm("Erase ALL blocks, exercises, and logs and start fresh? This cannot be undone.")) return;
  setState(defaultState());
  setEditing(false);
  save(); render(); hydrateNotes();
}
