/* Event handling and the block / backup operations they trigger. Mutates the
 * store (through its setters), then calls into render.js to reflect the change.
 * The store reassignments (setState/setEditing) all funnel through state.js —
 * an importer can read `state`/`editing` but can't reassign the binding here. */

import { ALL_WEEKS, DEFAULT_SETS, DEFAULT_BAND } from "./constants.js";
import {
  placement, clampSets, clampRounds, clampDuration, circuitOf,
  nonNegSec, slugify, uniqueId, today, mondayOf, cellKey, setsKey, roundsKey, bandKey, scheduleKey, parseRoutine,
} from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog, logList, logPush, logRemoveAt, logReplaceAt, purgeBlockLog,
  currentBlock, routineDef, placeMove, currentCell, effectiveSets, effectiveRounds, weekSchedule, nextBlockNumber, defaultState, M, findClassType,
} from "./state.js";
import {
  render, renderProgress, renderBmi, renderVolumes, renderClassTotal, patchCircuitTime, patchSteadyTime, patchClass, hydrate, repopulate, hydrateNotes,
} from "./render.js";
import { exportBackup, importBackup, importBlockFile, drivePush, drivePull } from "./io.js";

/* ---------------------------------------------------------------------- *
 * Events                                                                  *
 * ---------------------------------------------------------------------- */
export function handleClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  // "holiday" sentinel (the shared Holiday Workout editor) survives the parse; a
  // real routine stays a number. routineDef resolves "holiday" → state.holiday.
  const routine = el.dataset.routine ? parseRoutine(el.dataset.routine) : null;
  switch (el.dataset.action) {
    case "week":
      state.ui.week = Number(el.dataset.week); save(); render(); break;
    case "new-block": newBlock(); break;
    case "delete-block": deleteBlock(); break;
    case "edit-block": setEditing(!editing); render(); break;
    case "routine-up": reorderRoutine(routine, -1); break;
    case "routine-down": reorderRoutine(routine, 1); break;
    case "toggle-setup": el.closest(".exercise").classList.toggle("open"); break;
    case "remove-exercise": {
      const d = routineDef(routine);
      d.exercises = d.exercises.filter((p) => p.id !== el.dataset.ex);
      save(); render(); break;
    }
    case "sets-inc":
    case "sets-dec": {
      const exId = el.dataset.ex;
      const p = routineDef(routine).exercises.find((x) => x.id === exId);
      if (p) {
        // Per-week: write THIS cell's set-count override, not the template. Stepping back to the
        // template count clears the override (setLog("") deletes), so the week tracks it again.
        const cell = currentCell(routine);
        const next = clampSets(effectiveSets(cell, p) + (el.dataset.action === "sets-inc" ? 1 : -1));
        setLog(setsKey(cell, exId), next === (p.sets || DEFAULT_SETS) ? "" : next);
        render();
      }
      break;
    }
    case "rounds-inc":
    case "rounds-dec": {
      const d = routineDef(routine);
      if (d) {
        // Per-week round override for this cell (work/rest secs stay block-wide). Rounds change
        // the R-checkbox count, so re-render. Stepping back to the template clears the override.
        const cell = currentCell(routine);
        const next = clampRounds(effectiveRounds(cell, d) + (el.dataset.action === "rounds-inc" ? 1 : -1));
        setLog(roundsKey(cell), next === circuitOf(d).rounds ? "" : next);
        render();
      }
      break;
    }
    // Apply this week's per-week count to the whole block: write the template, then clear every
    // week's override → uniform again (ADR-0008 "apply to all weeks").
    case "sets-all": {
      const def = routineDef(routine), exId = el.dataset.ex;
      const p = def.exercises.find((x) => x.id === exId);
      if (p) {
        p.sets = effectiveSets(currentCell(routine), p);
        ALL_WEEKS.forEach((w) => delete state.log[setsKey(cellKey(currentBlock().id, w, routine), exId)]);
        save(); render();
      }
      break;
    }
    case "rounds-all": {
      const d = routineDef(routine);
      if (d) {
        d.rounds = effectiveRounds(currentCell(routine), d);
        ALL_WEEKS.forEach((w) => delete state.log[roundsKey(cellKey(currentBlock().id, w, routine))]);
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
    // Generic form disclosure: a trigger button and a hidden <form> sit as
    // siblings in a small wrapper (.picker, .class-add). Open reveals the form and
    // hides the trigger, focusing the first field; cancel resets it and restores
    // the trigger. Shared by the picker's create form and the add-class form. (The
    // outer picker-open toggle stays separate — it also repopulates the list.)
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
    case "add-ex": {
      // Placement shape follows the routine's kind, not the exercise (a cross-context move
      // gets a strength placement in a strength routine, a bare one elsewhere — ADR-0007).
      // routineDef re-parses the sentinel / scans the block, so resolve it once.
      const def = routineDef(routine);
      // placeMove honours the single-activity rule (steady replaces, others append).
      placeMove(def, placement(def.kind, el.dataset.ex, DEFAULT_SETS));
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
    case "toggle-routine": toggleRoutine(el); break;
    case "export": exportBackup(); break;
    case "drive-push": drivePush(); break;
    case "drive-pull": drivePull(); break;
    case "reset": resetAll(); break;
  }
}

// Collapse / expand a routine in place — a CSS class flip plus the persisted flag, no
// full render (snappy, and the collapsed summary is already in the DOM). setLog
// deletes the key on `false`, so expanded = absent, which is what renderRoutine reads.
function toggleRoutine(el) {
  const routineEl = el.closest(".routine");
  const collapsed = routineEl.classList.toggle("is-collapsed"); // CSS rotates the caret + slides the body
  setLog(routineEl.dataset.cell + ".collapsed", collapsed);
  el.setAttribute("aria-expanded", String(!collapsed));
}

// Move a routine onto an adjacent weekday in the viewed week: take the week's resolved
// order (weekSchedule returns a fresh array, so we swap in place — an inherited / identity
// week thus becomes its own explicit schedule once persisted), swap with the neighbour,
// persist, re-render. A no-op at the ends (ADR-0005). The cell key is unchanged, so the
// routine keeps its logged data and progression — only its weekday slot moves.
function reorderRoutine(routineNum, dir) {
  const block = currentBlock();
  const wk = state.ui.week;
  const order = weekSchedule(block, wk);
  const i = order.indexOf(routineNum);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  setLog(scheduleKey(block.id, wk), order);
  render();
}

export function handleSubmit(e) {
  const form = e.target.closest(".picker-form");
  if (!form) return;
  e.preventDefault();
  const zone = form.closest(".add-zone");
  if (zone && zone.dataset.picker === "measure") return addNewMeasurement(form);
  addNewExercise(form, zone ? parseRoutine(zone.dataset.routine) : NaN);
}

function addNewExercise(form, routine) {
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  // Contexts follow the routine's kind, not a form field — so a created exercise is seeded
  // valid for exactly the routine it's added to (widen it later to share with another kind).
  const def = routineDef(routine);
  const kind = def.kind;
  const id = uniqueId(slugify(name), (x) => state.library[x]);
  const ex = { id, name, contexts: [kind] };
  const setup = String(fd.get("setup") || "").trim();
  if (setup) ex.setup = setup;
  // Strength moves carry a rep target; circuit / steady moves carry nothing extra
  // (rounds / duration live on the routine).
  if (kind === "strength") ex.targetReps = String(fd.get("targetReps") || "").trim() || "8–12";
  state.library[id] = ex;
  // parseFloat so an empty field arrives as NaN → DEFAULT_SETS (not 0); placeMove applies the
  // single-activity rule (steady replaces) so create and add-ex stay in lockstep.
  placeMove(def, placement(kind, id, parseFloat(fd.get("sets"))));
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
  "import-block-input"(el) {
    if (el.files && el.files[0]) importBlockFile(el.files[0]);
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
  "block-start-input"(el) {
    if (!el.value) return; // a cleared date input keeps the existing start
    currentBlock().startDate = el.value;
    save(); render(); // every routine's weekday/date re-derives, so a full render
  },
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
  const d = routineDef(Number(el.dataset.routine));
  if (d) { d[el.dataset.field] = nonNegSec(el.value); save(); patchCircuitTime(d); }
}
// A steady routine's planned duration (minutes). Like circuitField, it lives on the routine
// template and live-patches the target line so the input keeps focus mid-type.
function steadyField(el) {
  const d = routineDef(Number(el.dataset.routine));
  if (d) { d.durationMin = clampDuration(el.value); save(); patchSteadyTime(d); }
}
// Loading mode lives on the library record (not the placement), so changing it
// here updates the exercise everywhere it appears; a full render relabels its
// inputs and recomputes every affected routine/week/block volume.
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
  // both routineLoad and the renderer treat false exactly like not-banded.
  if (el.checked) { ex.banded = true; if (!ex.defaultBand) ex.defaultBand = DEFAULT_BAND; }
  else ex.banded = false;
  save(); render();
}
function bandDefaultField(el) {
  const ex = state.library[el.dataset.ex];
  if (ex) { ex.defaultBand = el.value; save(); render(); }
}
// A class routine's type + planned duration, both on the routine template. Like steadyField it
// live-patches the session card (patchClass) so the type text input keeps focus mid-type. A typed
// type is canonicalised to an existing class type's spelling (case-insensitive) so "box-fit" and
// "Box-Fit" don't diverge; a brand-new name is stored verbatim (offered via classTypeNames, so
// no classTypes mutation is needed here — which would otherwise fire on every keystroke).
function classField(el) {
  const d = routineDef(Number(el.dataset.routine));
  if (!d) return;
  if (el.dataset.field === "durationMin") {
    d.durationMin = clampDuration(el.value);
  } else {
    const typed = String(el.value || "").trim();
    d.classType = findClassType(typed) || typed; // canonical spelling if known, else the new name verbatim
  }
  save(); patchClass(d);
}
// The shared wind-down's planned duration (minutes) — a target on state.winddown (the singleton,
// so no data-routine). Unlike steady/class it isn't live-patched: the per-day wind-down labels
// aren't in the DOM while editing (the central editor is shown instead), so a plain save keeps
// the input's focus and the new duration renders on the cards when you leave Edit mode.
function winddownField(el) {
  state.winddown.durationMin = clampDuration(el.value);
  save();
}
const fieldByName = {
  "picker-search": pickerSearch,
  "circuit-field": circuitField,
  "steady-field": steadyField,
  "class-field": classField,
  "winddown-field": winddownField,
  "load-mode": loadModeField,
  // Band selects/toggles carry no data-k (logged out-of-band so hydrate can't
  // blank an unlogged default), so they're dispatched here, ahead of data-k.
  "band-pick": bandPickField,
  "banded-toggle": bandedToggleField,
  "band-default": bandDefaultField,
};

// Live-patch refreshers keyed by an input's data-refresh tag — the same data-*→map
// dispatch as fieldByName / handleClick. A logged field declares which running total
// it feeds, so handleField needn't scan CSS classes (which exist for styling, and
// shouldn't double as routing). The full render already emits correct totals; these
// only re-patch in place so the edited input keeps focus mid-type.
const refreshBy = {
  volumes: renderVolumes,  // weight / reps / banded round-reps → routine + week + block tonnage
  bmi: renderBmi,          // a measurement value → the BMI line
  classes: renderClassTotal, // a class's logged minutes / calories → the header Classes total
};

// What a stateful checkbox runs after it logs, keyed by its data-after tag — the same
// data-*→map dispatch as refreshBy / fieldByName, rather than the handler sniffing the
// log-key suffix (behaviour routes off a tag, never a string — the CONTEXT.md rule). A
// plain checkbox (a circuit round tick) carries no data-after and just logs.
//   done    — stamp the date, auto-collapse, re-sync the flags + progress.
//   holiday — swap the whole routine body in/out (a full render).
const afterCheck = {
  done: afterDone,
  holiday: render,
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
    const a = el.dataset.after; // which post-toggle effect this checkbox declares (if any)
    if (a && Object.prototype.hasOwnProperty.call(afterCheck, a)) afterCheck[a](el, k);
  } else {
    setLog(k, el.value);
    const r = el.dataset.refresh; // which running total this field feeds (if any)
    if (r && Object.prototype.hasOwnProperty.call(refreshBy, r)) refreshBy[r]();
  }
}

function afterDone(el, k) {
  const cell = k.slice(0, -5);
  const done = el.checked;
  // Completing a routine auto-collapses it (less to scroll past); reopening expands it.
  // setLog deletes on false, so un-completing clears the flag → expanded.
  setLog(cell + ".collapsed", done);
  // Reflect the changed flags through hydrate — the canonical "log → existing DOM"
  // pass (is-done, is-collapsed + caret). It patches in place rather
  // than rebuilding, so the collapse still animates; then refresh the one off-routine
  // thing it doesn't own: the header progress count.
  hydrate();
  renderProgress();
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
    // A new block starts this week with a clean identity slate — schedules live in the
    // log (not copied) and weekdays re-derive from its own start date (ADR-0005).
    id, name: "Block " + num, createdAt: today(), startDate: mondayOf(today()),
    // Spread the routine so all its fields (incl. recovery circuit timing) carry
    // over; only exercises need a deep copy so placements aren't shared.
    routines: src.routines.map((d) => ({ ...d, exercises: d.exercises.map((p) => ({ ...p })) })),
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
  purgeBlockLog(b.id);
  state.blocks = state.blocks.filter((x) => x.id !== b.id);
  state.ui.block = state.blocks[0].id;
  state.ui.week = 1;
  save(); render();
}

function resetAll() {
  if (!window.confirm("Erase ALL blocks, exercises, and logs and start fresh? This cannot be undone.")) return;
  setState(defaultState());
  setEditing(false);
  save(); render(); hydrateNotes();
}
