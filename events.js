/* Event handling and the block / backup operations they trigger. Mutates the
 * store (through its setters), then calls into render.js to reflect the change.
 * The store reassignments (setState/setEditing) all funnel through state.js —
 * an importer can read `state`/`editing` but can't reassign the binding here. */

import { DEFAULT_SETS, DEFAULT_BAND } from "./constants.js";
import {
  placement, clampSets, clampRounds, circuitOf, kindType,
  nonNegSec, slugify, uniqueId, today, bandKey, classesKey,
} from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog,
  currentBlock, dayDef, nextBlockNumber, normalise, defaultState, M,
} from "./state.js";
import {
  render, renderBmi, renderVolumes, renderNutritionTotals, renderClassTotal, patchCircuitTime, repopulate, hydrateNotes,
} from "./render.js";

/* ---------------------------------------------------------------------- *
 * Events                                                                  *
 * ---------------------------------------------------------------------- */
export function handleClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const day = el.dataset.day ? Number(el.dataset.day) : null;
  switch (el.dataset.action) {
    case "week":
      state.ui.week = Number(el.dataset.week); save(); render(); break;
    case "new-block": newBlock(); break;
    case "delete-block": deleteBlock(); break;
    case "edit-block": setEditing(!editing); render(); break;
    case "toggle-setup": el.closest(".exercise").classList.toggle("open"); break;
    case "remove-exercise": {
      const d = dayDef(day);
      d.exercises = d.exercises.filter((p) => p.id !== el.dataset.ex);
      save(); render(); break;
    }
    case "sets-inc":
    case "sets-dec": {
      const p = dayDef(day).exercises.find((x) => x.id === el.dataset.ex);
      if (p) {
        p.sets = clampSets((p.sets || DEFAULT_SETS) + (el.dataset.action === "sets-inc" ? 1 : -1));
        save(); render();
      }
      break;
    }
    case "rounds-inc":
    case "rounds-dec": {
      const d = dayDef(day);
      if (d) {
        // Rounds change the R-checkbox count per station, so re-render fully.
        d.rounds = clampRounds(circuitOf(d).rounds + (el.dataset.action === "rounds-inc" ? 1 : -1));
        save(); render();
      }
      break;
    }
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
    case "picker-new-open": {
      const picker = el.closest(".picker");
      picker.querySelector(".picker-form").hidden = false;
      el.hidden = true;
      const n = picker.querySelector('[name="name"]');
      if (n) n.focus();
      break;
    }
    case "picker-new-cancel": {
      const form = el.closest(".picker-form");
      form.hidden = true; form.reset();
      const link = el.closest(".picker").querySelector('[data-action="picker-new-open"]');
      if (link) link.hidden = false;
      break;
    }
    case "add-ex": {
      const ex = state.library[el.dataset.ex];
      dayDef(day).exercises.push(placement(ex && ex.type, el.dataset.ex, DEFAULT_SETS));
      save(); render(); break;
    }
    case "m-add": {
      const id = el.dataset.m;
      if (state.measurements[id] && state.tracked.indexOf(id) < 0) state.tracked.push(id);
      save(); render(); break;
    }
    case "m-remove": {
      state.tracked = state.tracked.filter((x) => x !== el.dataset.m);
      save(); render(); break;
    }
    case "class-add-open": {
      const zone = el.closest(".classes");
      const form = zone.querySelector(".class-form");
      form.hidden = false;
      el.hidden = true;
      const t = form.querySelector('[name="type"]');
      if (t) t.focus();
      break;
    }
    case "class-add-cancel": {
      const form = el.closest(".class-form");
      form.hidden = true; form.reset();
      const btn = el.closest(".classes").querySelector('[data-action="class-add-open"]');
      if (btn) btn.hidden = false;
      break;
    }
    case "class-remove": removeClass(el.dataset.cell, Number(el.dataset.i)); break;
    case "export": exportBackup(); break;
    case "reset": resetAll(); break;
  }
}

export function handleSubmit(e) {
  const classForm = e.target.closest(".class-form");
  if (classForm) { e.preventDefault(); return addClass(classForm); }
  const form = e.target.closest(".picker-form");
  if (!form) return;
  e.preventDefault();
  const zone = form.closest(".add-zone");
  if (zone && zone.dataset.picker === "measure") return addNewMeasurement(form);
  addNewExercise(form, zone ? Number(zone.dataset.day) : NaN);
}

// Log a class on a day cell: type (required) + free-text note + minutes (>0).
// Classes are an array under one cell key; a brand-new type is remembered in the
// editable classTypes list so the datalist offers it next time.
function addClass(form) {
  const cell = form.closest(".classes").dataset.cell;
  const fd = new FormData(form);
  const type = String(fd.get("type") || "").trim();
  const mins = parseFloat(fd.get("mins"));
  if (!type || !(mins > 0)) return;
  const desc = String(fd.get("desc") || "").trim();
  // Remember a brand-new type (rate starts at 0; set it in the Edit-mode editor).
  if (!state.classTypes.some((c) => c.name === type)) state.classTypes.push({ name: type, rate: 0 });
  const key = classesKey(cell);
  const list = Array.isArray(state.log[key]) ? state.log[key] : [];
  list.push({ type, desc, mins });
  setLog(key, list);
  render();
}

function removeClass(cell, i) {
  const key = classesKey(cell);
  const list = Array.isArray(state.log[key]) ? state.log[key].slice() : [];
  list.splice(i, 1);
  setLog(key, list.length ? list : ""); // "" deletes the key once the last class goes
  render();
}

function addNewExercise(form, day) {
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  // Type follows the day's kind, not a form field — so a created exercise is
  // always valid for the day it's added to.
  const type = kindType(dayDef(day).kind);
  const id = uniqueId(slugify(name), (x) => state.library[x]);
  const ex = { id, name, type };
  const setup = String(fd.get("setup") || "").trim();
  if (setup) ex.setup = setup;
  // Strength moves carry a rep target; circuit moves carry nothing extra
  // (rounds/timing live on the recovery day).
  if (type === "strength") ex.targetReps = String(fd.get("targetReps") || "").trim() || "8–12";
  state.library[id] = ex;
  // parseFloat so an empty field arrives as NaN → DEFAULT_SETS (not 0).
  dayDef(day).exercises.push(placement(type, id, parseFloat(fd.get("sets"))));
  save(); render();
}

function addNewMeasurement(form) {
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  const unit = fd.get("unit") === "kg" ? "kg" : "cm";
  const id = uniqueId(slugify(name), (x) => state.measurements[x]);
  state.measurements[id] = M(id, name, unit);
  if (state.tracked.indexOf(id) < 0) state.tracked.push(id);
  save(); render();
}

// Field handlers keyed by element id; each fully handles its element. Looked up
// before the class-based handlers and the generic data-k path in handleField.
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
    // Hand-patch the picker label instead of a full render (which would steal
    // focus mid-type). Log keys use block.id, never the name, so nothing re-keys.
    const opt = document.querySelector('#block-select option[value="' + block.id + '"]');
    if (opt) opt.textContent = el.value;
  },
  "block-select"(el) { state.ui.block = el.value; state.ui.week = 1; save(); render(); },
  "height-input"(el) {
    const v = parseFloat(el.value);
    state.profile.heightCm = Number.isFinite(v) && v > 0 ? v : null;
    save(); renderBmi();
  },
};

// Handlers dispatched by a data-fh tag (the element keeps its class for styling
// and selection). data-fh is hashable, so fieldByName below is a real O(1) lookup
// like fieldById — mirroring handleClick's data-action switch — rather than a
// classList scan that grows a branch per field type.
function pickerSearch(el) {
  const zone = el.closest(".add-zone");
  if (zone) repopulate(zone, el.value);
}
function circuitField(el) {
  const d = dayDef(Number(el.dataset.day));
  if (d) { d[el.dataset.field] = nonNegSec(el.value); save(); patchCircuitTime(d); }
}
// Loading mode lives on the library record (not the placement), so changing it
// here updates the exercise everywhere it appears; a full render relabels its
// inputs and recomputes every affected day/week/block volume.
function loadModeField(el) {
  const ex = state.library[el.dataset.ex];
  if (!ex) return;
  ex.loadMode = el.value; // store the choice verbatim — incl. "standard", so the backfill migration won't re-touch it
  save(); render();
}
// The per-session band choice is a logged value (one per cell + exercise), so
// it's editable on any week/block — including past ones — like a weight is. Only
// the volumes need patching; the picker already shows the new value.
function bandPickField(el) {
  setLog(bandKey(el.dataset.cell, el.dataset.ex), el.value);
  renderVolumes();
}
// The Banded flag and default band live on the library record (apply everywhere
// the exercise is placed), so both re-render: toggling swaps the whole logging UI
// for that exercise; the default changes what unlogged sessions assume.
function bandedToggleField(el) {
  const ex = state.library[el.dataset.ex];
  if (!ex) return;
  // Store false verbatim rather than deleting — an absent flag reads as "never
  // chosen" to migrateLibrary, which would re-band a seeded move on the next
  // load. false ≠ null, so the migration leaves the user's choice alone, and
  // both dayVolume and the renderer treat false exactly like not-banded.
  if (el.checked) { ex.banded = true; if (!ex.defaultBand) ex.defaultBand = DEFAULT_BAND; }
  else ex.banded = false;
  save(); render();
}
function bandDefaultField(el) {
  const ex = state.library[el.dataset.ex];
  if (ex) { ex.defaultBand = el.value; save(); render(); }
}
// A class type's calorie rate (kcal/min/kg) on the editable classTypes list.
// Live-patch the header total only, so the rate input keeps focus while typing
// (per-class ~kcal labels refresh on the next full render).
function classRateField(el) {
  const t = state.classTypes.find((c) => c.name === el.dataset.typeName);
  if (t) { t.rate = parseFloat(el.value) || 0; save(); renderClassTotal(); }
}
const fieldByName = {
  "picker-search": pickerSearch,
  "circuit-field": circuitField,
  "load-mode": loadModeField,
  // Band selects/toggles carry no data-k (logged out-of-band so hydrate can't
  // blank an unlogged default), so they're dispatched here, ahead of data-k.
  "band-pick": bandPickField,
  "banded-toggle": bandedToggleField,
  "band-default": bandDefaultField,
  "ct-rate": classRateField,
};

export function handleField(e) {
  const el = e.target;
  if (el.id && Object.prototype.hasOwnProperty.call(fieldById, el.id)) return fieldById[el.id](el);
  const fh = el.dataset.fh;
  if (fh && Object.prototype.hasOwnProperty.call(fieldByName, fh)) return fieldByName[fh](el);
  // Generic logged-field path: everything carrying data-k.
  const k = el.dataset.k;
  if (!k) return;
  if (el.dataset.type === "check") {
    setLog(k, el.checked);
    if (k.slice(-5) === ".done") afterDone(el, k);
  } else {
    setLog(k, el.value);
    // "round-rep" = a banded circuit move's per-round reps, which feed tonnage.
    if (el.classList.contains("w") || el.classList.contains("r") || el.classList.contains("round-rep")) renderVolumes();
    else if (el.classList.contains("measure-val")) renderBmi();
    else if (el.classList.contains("nut-val")) renderNutritionTotals();
  }
}

function afterDone(el, k) {
  const cell = k.slice(0, -5);
  if (el.checked && !state.log[cell + ".date"]) setLog(cell + ".date", today());
  // Full re-render: the date stamp + is-done styling flow through hydrate()
  // rather than a separate hand-patch path. Nothing is focused after a tick.
  render();
}

/* ---------------------------------------------------------------------- *
 * Blocks & backups                                                       *
 * ---------------------------------------------------------------------- */
function newBlock() {
  const src = currentBlock();
  const num = nextBlockNumber();
  const taken = {};
  state.blocks.forEach((b) => (taken[b.id] = true));
  const id = uniqueId("b" + num, (x) => taken[x]);
  const nb = {
    id, name: "Block " + num, createdAt: today(),
    // Spread the day so all its fields (incl. recovery circuit timing) carry
    // over; only exercises need a deep copy so placements aren't shared.
    days: src.days.map((d) => ({ ...d, exercises: d.exercises.map((p) => ({ ...p })) })),
  };
  state.blocks.push(nb);
  state.ui.block = id;
  state.ui.week = 1;
  setEditing(true);
  save(); render();
}

function deleteBlock() {
  if (state.blocks.length <= 1) return;
  const b = currentBlock();
  if (!window.confirm("Delete " + b.name + " and all of its logged data? This cannot be undone.")) return;
  Object.keys(state.log).forEach((k) => { if (k.indexOf(b.id + ".") === 0) delete state.log[k]; });
  state.blocks = state.blocks.filter((x) => x.id !== b.id);
  state.ui.block = state.blocks[0].id;
  state.ui.week = 1;
  save(); render();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workout-log-" + today() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const r = new FileReader();
  r.onload = function () {
    let data;
    try {
      data = JSON.parse(r.result);
      if (!data || typeof data !== "object" || !Array.isArray(data.blocks) || !data.blocks.length) throw new Error("bad");
    } catch (err) {
      window.alert("Could not read that backup file.");
      return;
    }
    // Gate on version explicitly: normalise() resets unknown input to defaults,
    // so without this an incompatible backup would silently wipe current data.
    if (data.version !== 2) {
      window.alert("That backup is from an incompatible version — not importing. Your current data is unchanged.");
      return;
    }
    setState(normalise(data));
    setEditing(false);
    save(); render(); hydrateNotes();
  };
  r.readAsText(file);
}

function resetAll() {
  if (!window.confirm("Erase ALL blocks, exercises, and logs and start fresh? This cannot be undone.")) return;
  setState(defaultState());
  setEditing(false);
  save(); render(); hydrateNotes();
}
