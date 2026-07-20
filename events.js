/* Event handling and the block / backup operations they trigger. Mutates the store (through its
 * setters), then calls into render.js to reflect the change.
 *
 * Training handlers so far: block navigation + rename, and Session logging (#44) — each logging
 * input carries data-fh="log" and routes through the fieldByName map to record a Performance on the
 * exercise. The measurements card + footer backups are untouched infra. Composing the plan (#45)
 * brings its authoring handlers on top. */

import { slugify, uniqueId, buildPerformance, validYMD } from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog, logPerformance,
  currentBlock, deleteBlock, nextBlockNumber, blockIdTaken, defaultState, newBlockTemplate, M,
  blankRoutine, blankGroup, newItem, swapDays,
} from "./state.js";
import { render, renderBmi, repopulate, hydrateNotes } from "./render.js";
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
      const zone = el.closest(".add-zone");
      const picker = zone.querySelector(".picker");
      picker.hidden = !picker.hidden;
      if (!picker.hidden) {
        repopulate(zone, "");
        const s = picker.querySelector(".picker-search");
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
  const form = e.target.closest(".picker-form");
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
};

// Live-patch refreshers keyed by an input's data-refresh tag — the data-*→map dispatch the CONTEXT
// conventions mandate (behaviour routes off a tag, never a string scan). The full render already
// emits correct totals; these only re-patch in place so the edited input keeps focus mid-type.
const refreshBy = { bmi: renderBmi };

// Special field handlers keyed by data-fh (the CONTEXT data-fh→fieldByName dispatch): a field whose
// change isn't a plain logged scalar but drives its own effect — the picker search filter, and a
// Session log input (gathers its slot → a Performance).
const fieldByName = {
  "picker-search"(el) { const zone = el.closest(".add-zone"); if (zone) repopulate(zone, el.value); },
  log: logField,
  // Scalar plan edits (title/focus/rounds/rests/rail/duration) mutate + save but DON'T re-render, so
  // the field keeps focus mid-type — like the block-name input and the measurement values.
  compose: composeField,
  // Adding an exercise to a Group IS structural (a new Item row), so it re-renders.
  "item-add"(el) {
    const g = groupAt(el);
    if (g && el.value) { g.items.push(newItem(el.value)); save(); render(); }
  },
};

// Log a Session Item's effort at one slot: gather the slot's raw inputs, build the Performance its
// mode records (or null to clear), write it onto the exercise, and reflect the logged state in place.
// A full render would steal focus mid-type — the measurements card avoids it the same way.
function logField(el) {
  const slot = el.closest(".log-slot");
  if (!slot) return;
  const d = slot.dataset;
  const ex = state.library[d.ex];
  if (!ex) return;
  const val = (f) => { const n = slot.querySelector('[data-field="' + f + '"]'); return n ? n.value : ""; };
  const raw = { w: val("w"), r: val("r"), tier: val("tier"), mins: val("mins"), level: val("level") };
  const done = slot.querySelector('[data-field="done"]');
  if (done) { raw.done = done.checked; raw.time = done.dataset.time; }
  const ctx = { block: d.block, week: Number(d.week), routine: Number(d.routine), group: Number(d.group), item: Number(d.item), round: Number(d.round) };
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
// Locate the routine / group / item a compose control points at, from its data-pos/g/i.
const routineAt = (el) => currentBlock().template[Number(el.dataset.pos)];
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
