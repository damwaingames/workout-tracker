/* Event handling and the block / backup operations they trigger. Mutates the store (through its
 * setters), then calls into render.js to reflect the change.
 *
 * Training handlers so far: block navigation + rename, and Session logging (#44) — each logging
 * input carries data-fh="log" and routes through the fieldByName map to record a Performance on the
 * exercise. The measurements card + footer backups are untouched infra. Composing the plan (#45)
 * brings its authoring handlers on top. */

import { slugify, uniqueId, buildPerformance, validYMD, cellScalarKey } from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog, logPerformance, logAttendance,
  updateExercise, toggleExerciseEquip, setExerciseRetired,
  currentBlock, currentCell, deleteBlock, nextBlockNumber, blockIdTaken, defaultState, newBlockTemplate, M,
  blankRoutine, blankGroup, newItem, swapDays, toggleWinddown, setWinddownField, effectiveRoutine,
} from "./state.js";
import { slotCtx, classSlotCtx, fieldSelector, LOG_FIELDS, DONE_FIELD } from "./slot.js";
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
    case "view": state.ui.view = el.dataset.view; save(); render(); break;
    case "week": state.ui.week = Number(el.dataset.week); save(); render(); break;
    // Fold/unfold a Session card (#47) — a persisted per-occurrence flag keyed by cell, like `.done`.
    case "toggle-collapse": {
      const k = cellScalarKey(currentCell(Number(el.dataset.pos)), "collapsed");
      setLog(k, state.log[k] ? "" : true); render(); break;
    }
    // Swap the Holiday Session into (or out of) a day (#48, ADR-0025) — a per-occurrence flag; the
    // planned exercises simply accrue no Performance while it's swapped in, so their ghosts wait.
    case "holiday-swap": {
      const k = cellScalarKey(currentCell(Number(el.dataset.pos)), "holiday");
      setLog(k, state.log[k] ? "" : true); render(); break;
    }
    // Tick / un-tick a wind-down night (#49, ADR-0028) — a date-keyed habit outside any block; a
    // full render is fine since no text field holds focus. A future night's button is disabled.
    case "winddown-toggle": toggleWinddown(el.dataset.date); render(); break;
    // Retire / un-retire an exercise (#50, ADR-0020) — re-render so it re-sorts, tags, and drops out
    // of (or back into) the composer pickers, which filter retired.
    case "ex-retire": { const ex = state.library[el.dataset.ex]; setExerciseRetired(el.dataset.ex, !(ex && ex.retired)); render(); break; }
    case "new-block": newBlock(); break;
    case "delete-block": removeCurrentBlock(); break;
    case "edit-block": setEditing(!editing); render(); break;
    case "m-add": {
      const id = el.dataset.m;
      if (state.measurements[id] && state.tracked.indexOf(id) < 0) state.tracked.push(id);
      save(); render(); break;
    }
    case "m-remove":
      state.tracked = state.tracked.filter((x) => x !== el.dataset.m);
      save(); render(); break;
    case "picker-open": {
      const zone = el.closest("[data-picker]");
      const picker = zone && zone.querySelector("[data-picker-panel]");
      if (!picker) break;
      picker.hidden = !picker.hidden;
      if (!picker.hidden) {
        repopulate(zone, "");
        const s = picker.querySelector('[data-fh="picker-search"]');
        if (s) s.focus();
      }
      break;
    }
    // Generic form disclosure: a trigger button + a hidden <form> sibling. Open reveals the form
    // and hides the trigger; cancel resets it and restores the trigger.
    case "form-open": {
      const form = el.parentNode.querySelector("form");
      form.hidden = false; el.hidden = true;
      const first = form.querySelector("input, select, textarea");
      if (first) first.focus();
      break;
    }
    case "form-cancel": {
      const form = el.closest("form");
      form.hidden = true; form.reset();
      const trigger = form.parentNode.querySelector('[data-action="form-open"]');
      if (trigger) trigger.hidden = false;
      break;
    }
    case "export": exportBackup(); break;
    case "drive-push": drivePush(); break;
    case "drive-pull": drivePull(); break;
    case "reset": resetAll(); break;
  }
}

/* ---------------------------------------------------------------------- *
 * Submits — only the measurement create form this slice                  *
 * ---------------------------------------------------------------------- */
export function handleSubmit(e) {
  const form = e.target.closest("[data-picker-form]");
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
const fieldByName = {
  "picker-search"(el) { const zone = el.closest("[data-picker]"); if (zone) repopulate(zone, el.value); },
  log: logField,
  // Scalar plan edits (title/focus/rounds/rests/rail/duration) mutate + save but DON'T re-render, so
  // the field keeps focus mid-type — like the block-name input and the measurement values.
  compose: composeField,
  // Adding an exercise to a Group IS structural (a new Item row), so it re-renders.
  "item-add"(el) {
    const g = groupAt(el);
    if (g && el.value) { g.items.push(newItem(el.value)); save(); render(); }
  },
  // Log a Class occurrence (#50): gather the card's minutes / kcal / note → an Attendance on the type.
  "class-log": classLogField,
  // Edit an exercise field in the Library (#50). Scalar mutate + save, no re-render (keeps focus); the
  // summary name is hand-patched, like the block-name input patches its select option.
  "ex-edit"(el) {
    updateExercise(el.dataset.ex, el.dataset.target, el.value);
    if (el.dataset.target === "name") {
      // data-lib-ex marks the Library entry; data-ex names the exercise (a log slot carries one too,
      // hence both). The exercise id is the app's own slug, so it needs no attribute-value escaping.
      const nm = document.querySelector('[data-lib-ex][data-ex="' + el.dataset.ex + '"] [data-lib-ex-name]');
      if (nm) nm.textContent = el.value;
    }
  },
  // Toggle an equipment tag on an exercise (#50) — a checkbox, so it reflects its own state; no render.
  "ex-equip"(el) { toggleExerciseEquip(el.dataset.ex, el.dataset.equip); },
};

// The Item a Session-slot ctx points at — the planned Item, or the Holiday Session's when that day is
// swapped (ADR-0025), read through effectiveRoutine so the swap is honoured exactly as it is on
// render. Only the station mode needs it (for its planned duration); #64 will move this plan
// resolution into the plan-verbs module alongside the other locators.
function itemForCtx(ctx) {
  const block = state.blocks.find((b) => b.id === ctx.block) || currentBlock();
  const r = effectiveRoutine(block, ctx.week, ctx.routine);
  const g = r && r.groups && r.groups[ctx.group];
  return (g && g.items && g.items[ctx.item]) || null;
}

// Log (or clear) a Class occurrence's actuals at its plan slot (#50, ADR-0030): gather the card's
// minutes, wearable kcal, and note → an Attendance on the class type (null when all empty — honest
// under-completion). A full render would steal focus mid-type, so it reflects the logged state in place.
function classLogField(el) {
  const box = el.closest("[data-class-slot]");
  if (!box) return;
  const ctx = classSlotCtx(box.dataset);
  if (!ctx) return; // a slot whose locator didn't read is a no-op, never a write to a guessed slot
  const val = (f) => { const n = box.querySelector(fieldSelector(f)); return n ? n.value : ""; };
  const mins = Number(val("mins")) || 0, kcal = Number(val("kcal")) || 0, note = val("note").trim();
  const data = (mins > 0 || kcal > 0 || note) ? { mins, kcal, note } : null;
  logAttendance(box.dataset.class, ctx, data);
  const card = box.closest("[data-routine-card]");
  if (card) card.classList.toggle("logged", !!data);
}

// Log a Session Item's effort at one slot: gather the slot's raw inputs, build the Performance its
// mode records (or null to clear), write it onto the exercise, and reflect the logged state in place.
// A full render would steal focus mid-type — the measurements card avoids it the same way.
function logField(el) {
  const slot = el.closest("[data-slot]");
  if (!slot) return;
  const d = slot.dataset;
  const ex = state.library[d.ex];
  if (!ex) return;
  const ctx = slotCtx(d);
  if (!ctx) return; // ditto: a broken locator writes nothing rather than a Performance to nowhere
  const val = (f) => { const n = slot.querySelector(fieldSelector(f)); return n ? n.value : ""; };
  const raw = Object.fromEntries(LOG_FIELDS.map((f) => [f, val(f)]));
  const done = slot.querySelector(fieldSelector(DONE_FIELD));
  if (done) {
    raw.done = done.checked;
    // The station's planned duration comes from the Item that owns it, not from an attribute the
    // renderer echoed back (#62) — the plan is the source of truth for what was planned.
    const it = itemForCtx(ctx);
    raw.time = it && it.time != null ? it.time : 0;
  }
  const data = buildPerformance(d.mode, ex, raw);
  logPerformance(d.ex, ctx, data);
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
  "add-group"(el) { const r = routineAt(el); if (r && r.groups) r.groups.push(blankGroup()); },
  "remove-group"(el) { const r = routineAt(el); if (r && r.groups) r.groups.splice(Number(el.dataset.g), 1); },
  "group-up"(el) { const r = routineAt(el); if (r) swapBy(r.groups, Number(el.dataset.g), -1); },
  "group-down"(el) { const r = routineAt(el); if (r) swapBy(r.groups, Number(el.dataset.g), 1); },
  "remove-item"(el) { const g = groupAt(el); if (g) g.items.splice(Number(el.dataset.i), 1); },
  // Switch a day's kind — a fresh Routine of that kind (only when it actually changes, so an accidental
  // re-click of the active kind doesn't wipe the day's content).
  kind(el) { const b = currentBlock(); const pos = Number(el.dataset.pos); if (b.template[pos] && b.template[pos].kind !== el.dataset.kind) b.template[pos] = blankRoutine(el.dataset.kind); },
  "day-up"(el) { const b = currentBlock(); const p = Number(el.dataset.pos); swapDays(b, p, p - 1); },
  "day-down"(el) { const b = currentBlock(); const p = Number(el.dataset.pos); swapDays(b, p, p + 1); },
  "weeks-inc"() { currentBlock().weeks += 1; },
  "weeks-dec"() { const b = currentBlock(); b.weeks = Math.max(1, b.weeks - 1); if (state.ui.week > b.weeks) state.ui.week = b.weeks; },
};

// Scalar plan edits keyed by data-target — the CONTEXT data-*→map dispatch (like fieldByName). Each
// handler locates its own level (routine / group / item) off the input's data-pos/g/i and sets one
// field from the value, so all ten read the same way.
const composeTargets = {
  title: (el, v) => { const r = routineAt(el); if (r) r.title = v; },
  focus: (el, v) => { const r = routineAt(el); if (r) r.focus = v; },
  "class-type": (el, v) => { const r = routineAt(el); if (r) r.classType = v; },
  "class-dur": (el, v) => { const r = routineAt(el); if (r) r.durationMin = clampNum(v, 0); },
  rounds: (el, v) => { const g = groupAt(el); if (g) g.rounds = clampNum(v, 1); },
  rw: (el, v) => { const g = groupAt(el); if (g) g.restWithin = clampNum(v, 0); },
  ra: (el, v) => { const g = groupAt(el); if (g) g.restAfter = clampNum(v, 0); },
  "rail-floor": (el, v) => { const it = itemAt(el); if (it && it.rail) it.rail[0] = clampNum(v, 1); },
  "rail-ceiling": (el, v) => { const it = itemAt(el); if (it && it.rail) it.rail[1] = clampNum(v, 1); },
  "item-time": (el, v) => { const it = itemAt(el); if (it) it.time = clampNum(v, 0) * (el.dataset.unit === "min" ? 60 : 1); },
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
