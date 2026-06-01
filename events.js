/* Event handling and the block / backup operations they trigger. Mutates the
 * store (through its setters), then calls into render.js to reflect the change.
 * The store reassignments (setState/setEditing) all funnel through state.js —
 * an importer can read `state`/`editing` but can't reassign the binding here. */

import { DEFAULT_SETS } from "./constants.js";
import {
  placement, clampSets, clampRounds, circuitOf, kindType,
  nonNegSec, slugify, uniqueId, today,
} from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog,
  currentBlock, dayDef, nextBlockNumber, normalise, defaultState, M,
} from "./state.js";
import {
  render, renderBmi, renderVolumes, patchCircuitTime, repopulate, hydrateNotes,
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
    case "export": exportBackup(); break;
    case "reset": resetAll(); break;
  }
}

export function handleSubmit(e) {
  const form = e.target.closest(".picker-form");
  if (!form) return;
  e.preventDefault();
  const zone = form.closest(".add-zone");
  if (zone && zone.dataset.picker === "measure") return addNewMeasurement(form);
  addNewExercise(form, zone ? Number(zone.dataset.day) : NaN);
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

// Class-based field handlers. Kept as explicit checks rather than a map: a
// classList can't be hashed, so a map would only dress up the same linear
// contains() scan — unlike fieldById, which is a real O(1) lookup.
function pickerSearch(el) {
  const zone = el.closest(".add-zone");
  if (zone) repopulate(zone, el.value);
}
function circuitField(el) {
  const d = dayDef(Number(el.dataset.day));
  if (d) { d[el.dataset.field] = nonNegSec(el.value); save(); patchCircuitTime(d); }
}

export function handleField(e) {
  const el = e.target;
  if (el.id && Object.prototype.hasOwnProperty.call(fieldById, el.id)) return fieldById[el.id](el);
  if (el.classList.contains("picker-search")) return pickerSearch(el);
  if (el.classList.contains("circuit-field")) return circuitField(el);
  // Generic logged-field path: everything carrying data-k.
  const k = el.dataset.k;
  if (!k) return;
  if (el.dataset.type === "check") {
    setLog(k, el.checked);
    if (k.slice(-5) === ".done") afterDone(el, k);
  } else {
    setLog(k, el.value);
    if (el.classList.contains("w") || el.classList.contains("r")) renderVolumes();
    else if (el.classList.contains("measure-val")) renderBmi();
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
