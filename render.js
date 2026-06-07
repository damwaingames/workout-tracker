/* Rendering: turns the store into DOM. Reads `state`/`editing` plus the queries
 * from state.js and the pure helpers; never mutates the store. The exported
 * entry points (render + the focus-preserving live patchers) are what events.js
 * calls after a mutation. */

import { WEEKS, MIN_SETS, MAX_SETS, DEFAULT_SETS, NUTRIENTS, LOAD_MODES, BANDS } from "./constants.js";
import {
  cellKey, setKey, roundKey, roundRepKey, bandKey, measureKey, nutKey,
  circuitOf, circuitSummary, kindType, loadMode, bandFor, esc, fmt,
} from "./helpers.js";
import {
  state, editing,
  currentBlock, currentBlockIndex, dayDef,
  previousSets, dayVolume, previousMeasure, bmiFor, nutritionTotals,
} from "./state.js";

export function render() { renderHeader(); renderWeek(); renderProgress(); renderVolumes(); renderMeasurements(); renderNutrition(); }

function renderHeader() {
  const sel = document.getElementById("block-select");
  sel.innerHTML = state.blocks
    .map((b) => '<option value="' + b.id + '"' + (b.id === state.ui.block ? " selected" : "") + ">" + esc(b.name) + "</option>")
    .join("");
  const et = document.getElementById("edit-toggle");
  et.textContent = editing ? "Done" : "Edit";
  et.classList.toggle("active", editing);

  let html = "";
  for (let w = 1; w <= WEEKS; w++) {
    html += '<button data-action="week" data-week="' + w + '" class="week-btn' + (w === state.ui.week ? " active" : "") + '">Week ' + w + "</button>";
  }
  if (editing) {
    html += '<button data-action="delete-block" class="week-btn danger"' + (state.blocks.length <= 1 ? " disabled" : "") + ">Delete block</button>";
  }
  document.getElementById("week-nav").innerHTML = html;
}

function renderWeek() {
  const block = currentBlock();
  const wk = state.ui.week;
  // In Edit mode the block name becomes an inline input; otherwise it's static.
  const nameHtml = editing
    ? '<input type="text" id="block-name-input" class="block-name-input" value="' + esc(block.name) + '" placeholder="Block name" aria-label="Block name" maxlength="40">'
    : esc(block.name);
  document.getElementById("week-view").innerHTML =
    '<p class="week-heading">' + nameHtml + " · Week " + wk + " of " + WEEKS +
    (editing ? ' <span class="edit-hint">— editing this block’s exercises</span>' : "") + "</p>" +
    block.days.map((d) => renderDay(block, d, wk)).join("");
  hydrate();
}

function renderDay(block, d, wk) {
  const cell = cellKey(block.id, wk, d.day);
  let body;
  if (d.kind === "strength") body = renderStrength(d, wk, cell);
  else if (d.kind === "recovery") body = renderRecovery(d, wk, cell);
  else body = renderRest(cell);

  return '<div class="day ' + d.kind + '" data-cell="' + cell + '">' +
    '<div class="day-head">' +
      '<label class="done-toggle"><input type="checkbox" data-k="' + cell + '.done" data-type="check"><span class="day-title">Day ' + d.day + ": " + esc(d.title) + "</span></label>" +
      '<input type="date" class="day-date" data-k="' + cell + '.date" data-type="text" aria-label="Date trained">' +
    "</div>" +
    '<div class="day-focus">' + esc(d.focus) + "</div>" +
    '<div class="day-body">' + body + "</div>" +
    (editing && d.kind !== "rest" ? renderAddZone(d) : "") +
    "</div>";
}

// The per-session band picker for a banded move (logged via bandKey, so it gets
// no data-k — hydrate would blank an unlogged select; we pre-select the resolved
// tier here and let the band-pick handler persist changes). Shown on both day
// kinds, above the move's reps.
function bandPicker(cell, exId, ex) {
  const cur = bandFor(ex, state.log[bandKey(cell, exId)]);
  return '<label class="band-pick-l">Band ' +
    '<select class="band-pick" data-fh="band-pick" data-cell="' + cell + '" data-ex="' + exId + '" aria-label="Band for ' + esc(ex.name) + '">' +
    BANDS.map((b) => '<option value="' + b.id + '"' + (b.id === cur ? " selected" : "") + ">" + esc(b.label) + " (" + b.kg + " kg)</option>").join("") +
    "</select></label>";
}

// Edit-mode loading controls for one exercise: a Banded toggle, then either the
// default-band picker (when banded) or the free-weight tonnage mode (strength
// only). Circuit moves get just the toggle + default band — they carry no mode.
function loadingEdit(d, ex) {
  const toggle = '<label class="banded-edit"><input type="checkbox" class="banded-toggle" data-fh="banded-toggle" data-ex="' + ex.id + '"' + (ex.banded ? " checked" : "") + "> Banded</label>";
  // A banded move shows its default-band picker (the tier sessions start on).
  const bandDefault = ex.banded
    ? '<label class="load-edit">Default band <select class="band-default" data-fh="band-default" data-ex="' + ex.id + '" aria-label="Default band for ' + esc(ex.name) + '">' +
      BANDS.map((b) => '<option value="' + b.id + '"' + (b.id === (ex.defaultBand || "") ? " selected" : "") + ">" + esc(b.label) + "</option>").join("") + "</select></label>"
    : "";
  // Loading-mode picker: all modes for free weights; only the rep-axis ones (Both
  // sides / Per side) for a band, since weight-doubling needs a second dumbbell. A
  // plain (non-banded) circuit move carries no load, so it gets no picker at all.
  let modePicker = "";
  if (ex.banded || d.kind === "strength") {
    const m = loadMode(ex);
    modePicker = '<label class="load-edit">Tonnage <select class="load-mode" data-fh="load-mode" data-ex="' + ex.id + '" aria-label="How ' + esc(ex.name) + ' counts toward tonnage">' +
      LOAD_MODES.filter((lm) => !ex.banded || lm.wMult === 1)
        .map((lm) => '<option value="' + lm.id + '"' + (lm.id === m.id ? " selected" : "") + ">" + esc(lm.label) + "</option>").join("") + "</select></label>";
  }
  return toggle + bandDefault + modePicker;
}

// The day's tonnage line. One source for the markup, since renderVolumes patches
// the inner <strong> (by data-vol-cell) during live edits — both day kinds emit it.
function volumeLine(cell, v) {
  return '<div class="day-volume">Day volume <strong data-vol-cell="' + cell + '">' + fmt(v) + " kg</strong></div>";
}

function renderStrength(d, wk, cell) {
  const bi = currentBlockIndex();
  const body = d.exercises.map((place) => {
    const exId = place.id;
    const ex = state.library[exId];
    if (!ex) return "";
    const sets = place.sets || DEFAULT_SETS;
    const banded = !!ex.banded; // banded moves log a band + reps, not weight × reps
    const m = loadMode(ex); // free-weight tonnage multipliers + per-mode labels
    const prev = banded ? null : previousSets(exId, bi, wk, d.day);
    let rows = "";
    for (let i = 0; i < sets; i++) {
      if (banded) {
        rows +=
          '<div class="set banded"><span class="set-n">Set ' + (i + 1) + "</span>" +
          '<input type="number" inputmode="numeric" class="r" data-k="' + setKey(cell, exId, i, "r") + '" data-type="text" placeholder="reps">' +
          '<span class="unit">reps' + (m.rUnit ? esc(m.rUnit) : "") + "</span></div>";
        continue;
      }
      const p = prev && prev[i];
      rows +=
        '<div class="set"><span class="set-n">Set ' + (i + 1) + "</span>" +
        '<input type="number" inputmode="decimal" class="w" data-k="' + setKey(cell, exId, i, "w") + '" data-type="text" placeholder="' + (p && p.w ? esc(p.w) : "wt") + '">' +
        '<span class="unit">' + esc(m.wUnit || "kg") + "</span>" +
        '<span class="x">×</span>' +
        '<input type="number" inputmode="numeric" class="r" data-k="' + setKey(cell, exId, i, "r") + '" data-type="text" placeholder="' + (p && p.r ? esc(p.r) : "reps") + '">' +
        (m.rUnit ? '<span class="unit">' + esc(m.rUnit) + "</span>" : "") +
        "</div>";
    }
    const last = prev
      ? '<div class="last">Last: ' + prev.map((s) => (s.w ? esc(s.w) + " kg × " : "") + (s.r ? esc(s.r) : "–")).join(", ") + "</div>"
      : "";
    const bandRow = banded ? bandPicker(cell, exId, ex) : ""; // the per-session band selector
    const setsEdit = editing
      ? '<div class="sets-edit">Sets <button class="step" type="button" data-action="sets-dec" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Fewer sets">−</button>' +
        '<span class="sets-count">' + sets + "</span>" +
        '<button class="step" type="button" data-action="sets-inc" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="More sets">＋</button>' +
        // How this exercise is loaded (band vs free weight, and its tonnage mode) —
        // a property of the exercise, so it persists on the library record.
        loadingEdit(d, ex) + "</div>"
      : "";
    return '<div class="exercise" data-ex="' + exId + '">' +
      '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
      (ex.targetReps ? '<span class="ex-target">' + esc(ex.targetReps) + "</span>" : "") +
      (ex.setup ? '<button class="info" type="button" data-action="toggle-setup" aria-label="How to do this">ⓘ</button>' : "") +
      (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
      "</div>" +
      (ex.setup ? '<div class="setup">' + esc(ex.setup) + "</div>" : "") +
      setsEdit +
      bandRow +
      '<div class="sets">' + rows + "</div>" + last +
      "</div>";
  }).join("");
  // Compute the day's volume inline so a fresh render is already correct;
  // renderVolumes() only re-patches this during live (keystroke) edits.
  return body + volumeLine(cell, dayVolume(currentBlock(), wk, d));
}

function renderRecovery(d, wk, cell) {
  const rounds = circuitOf(d).rounds; // rounds drive the checkbox / reps count per move
  // A banded move turns this recovery day into a tonnage-bearing one (mirrors the
  // predicate dayVolume walks), so it gets a day-volume line below.
  const hasBand = d.exercises.some((p) => { const ex = state.library[p.id]; return ex && ex.banded; });
  const moves = d.exercises.map((place) => {
    const exId = place.id;
    const ex = state.library[exId];
    if (!ex) return "";
    let inner;
    if (ex.banded) {
      // Banded circuit move: a per-session band + a reps input for each round
      // (replacing the bare completion checkboxes), so it can feed tonnage.
      const m = loadMode(ex); // per-side annotates the reps and doubles them in tonnage
      let reps = "";
      for (let r = 0; r < rounds; r++) {
        reps += '<label class="round"><span class="round-n">R' + (r + 1) + "</span>" +
          '<input type="number" inputmode="numeric" class="round-rep" data-k="' + roundRepKey(cell, exId, r) + '" data-type="text" placeholder="' + (m.rUnit ? "reps" + m.rUnit : "reps") + '"></label>';
      }
      inner = bandPicker(cell, exId, ex) + '<div class="rounds reps">' + reps + "</div>";
    } else {
      let checks = "";
      for (let r = 0; r < rounds; r++) {
        checks += '<label class="round"><input type="checkbox" data-k="' + roundKey(cell, exId, r) + '" data-type="check"> R' + (r + 1) + "</label>";
      }
      inner = '<div class="rounds">' + checks + "</div>";
    }
    return '<div class="exercise circuit" data-ex="' + exId + '">' +
      '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
      (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
      "</div>" +
      (editing ? '<div class="sets-edit">' + loadingEdit(d, ex) + "</div>" : "") +
      inner + "</div>";
  }).join("");
  // Recovery days are usually load-free; only show a day-volume line once a banded
  // move makes one contribute (so pure-cardio days stay uncluttered).
  const volLine = hasBand ? volumeLine(cell, dayVolume(currentBlock(), wk, d)) : "";
  return moves +
    (editing ? renderCircuitEdit(d) : "") +
    volLine +
    '<div class="recovery-meta">' +
      '<label class="inline">Energy (1–10)<input type="number" min="1" max="10" data-k="' + cell + '.energy" data-type="text"></label>' +
      '<span class="circuit-note" data-circuit-cell="' + cell + '">' + esc(circuitSummary(d)) + "</span>" +
    "</div>";
}

// Edit-mode circuit controls: a rounds stepper (re-renders, since it changes
// the R-checkbox count) plus work / rest / round-rest second inputs (live patch).
function renderCircuitEdit(d) {
  const c = circuitOf(d);
  const secField = (field, label, val) =>
    '<label class="circuit-field-l">' + label +
    ' <input type="number" inputmode="numeric" min="0" class="circuit-field" data-fh="circuit-field" data-day="' + d.day + '" data-field="' + field + '" value="' + val + '">s</label>';
  return '<div class="circuit-edit">' +
    '<div class="rounds-edit">Rounds ' +
      '<button class="step" type="button" data-action="rounds-dec" data-day="' + d.day + '" aria-label="Fewer rounds">−</button>' +
      '<span class="sets-count">' + c.rounds + "</span>" +
      '<button class="step" type="button" data-action="rounds-inc" data-day="' + d.day + '" aria-label="More rounds">＋</button></div>' +
    secField("workSec", "Work", c.workSec) +
    secField("restSec", "Rest", c.restSec) +
    secField("roundRestSec", "Round rest", c.roundRestSec) +
    "</div>";
}

// Live-patch a recovery day's summary line when its work/rest seconds change,
// so the second input keeps focus mid-type (rounds re-render via the stepper).
export function patchCircuitTime(d) {
  const el = document.querySelector('[data-circuit-cell="' + cellKey(currentBlock().id, state.ui.week, d.day) + '"]');
  if (el) el.textContent = circuitSummary(d);
}

function renderRest(cell) {
  return '<p class="rest-note">No structured exercise — focus on hydration, nutrition, and muscle repair.</p>' +
    '<label class="inline block">How your joints / knees feel<input type="text" data-k="' + cell + '.joints" data-type="text" placeholder="e.g. knees happy, left wrist a little tight"></label>';
}

// Shared picker chrome — an add button, search box, result list, a create-new
// link, and a create form whose fields differ per kind. data-picker (+ optional
// data-day) drives the generic open/search/create handlers; only the catalogue,
// row markup, and these form fields are kind-specific.
function pickerZone(o) {
  const dayAttr = o.day != null ? ' data-day="' + o.day + '"' : "";
  return '<div class="add-zone" data-picker="' + o.kind + '"' + dayAttr + ">" +
    '<button class="add-btn" type="button" data-action="picker-open">' + o.addLabel + "</button>" +
    '<div class="picker" hidden>' +
      '<input type="text" class="picker-search" data-fh="picker-search" placeholder="' + o.searchPlaceholder + '">' +
      '<div class="picker-list"></div>' +
      '<button class="link" type="button" data-action="picker-new-open">' + o.createLabel + "</button>" +
      '<form class="picker-form" hidden>' + o.formFields +
        '<div class="form-actions"><button type="submit">' + o.submitLabel + "</button>" +
        '<button type="button" class="link" data-action="picker-new-cancel">Cancel</button></div>' +
      "</form>" +
    "</div></div>";
}

function renderAddZone(d) {
  // The day's kind fixes the exercise type, so there's no type picker: a
  // strength day's form collects reps + sets, a recovery day's collects neither
  // (circuits use fixed rounds). This is what stops a mismatched placement.
  const strength = d.kind === "strength";
  return pickerZone({
    kind: "exercise",
    day: d.day,
    addLabel: strength ? "＋ Add exercise" : "＋ Add move",
    searchPlaceholder: strength ? "Search strength exercises…" : "Search circuit moves…",
    createLabel: strength ? "＋ Create a new exercise" : "＋ Create a new move",
    submitLabel: "Add to day",
    formFields:
      '<input name="name" placeholder="' + (strength ? "Exercise" : "Move") + ' name" required>' +
      '<input name="setup" placeholder="How-to / setup (optional)">' +
      (strength
        ? '<input name="targetReps" placeholder="Target reps" value="8–12">' +
          '<label class="sets-field">Sets <input name="sets" type="number" min="' + MIN_SETS + '" max="' + MAX_SETS + '" value="' + DEFAULT_SETS + '"></label>'
        : ""),
  });
}

function renderProgress() {
  const b = currentBlock();
  const days = b.days.length;
  let weekDone = 0, blockDone = 0;
  for (let wk = 1; wk <= WEEKS; wk++) {
    for (let i = 0; i < days; i++) {
      if (state.log[cellKey(b.id, wk, b.days[i].day) + ".done"]) {
        blockDone++;
        if (wk === state.ui.week) weekDone++;
      }
    }
  }
  document.getElementById("progress").innerHTML =
    "<strong>" + weekDone + "</strong> / " + days + " this week · <strong>" + blockDone + "</strong> / " + (days * WEEKS) + " this block";
}

// The focus-preserving live updater: re-patches the visible week's day volumes
// plus the week/block totals without a re-render, so a weight/reps input keeps
// focus mid-edit. Full renders already emit correct day volumes via renderStrength.
export function renderVolumes() {
  const b = currentBlock();
  const wk = state.ui.week;
  let weekVol = 0, blockVol = 0;
  for (let w = 1; w <= WEEKS; w++) {
    b.days.forEach((d) => {
      const v = dayVolume(b, w, d);
      blockVol += v;
      if (w === wk) {
        weekVol += v;
        const el = document.querySelector('[data-vol-cell="' + cellKey(b.id, w, d.day) + '"]');
        if (el) el.textContent = fmt(v) + " kg";
      }
    });
  }
  const out = document.getElementById("volume");
  if (out) out.innerHTML =
    "Volume · <strong>" + fmt(weekVol) + " kg</strong> this week · <strong>" + fmt(blockVol) + " kg</strong> this block";
}

// The week's Measurements card: one value input per tracked measurement (with
// the previous reading as a ghost placeholder), an auto BMI, and a set-once
// height. Values use data-k/log like the workout grid; the live BMI patch
// (renderBmi) avoids a full render so a value input keeps focus mid-type.
function renderMeasurements() {
  const card = document.getElementById("measurements-card");
  if (!card) return;
  const block = currentBlock();
  const wk = state.ui.week;
  const bi = currentBlockIndex();

  const rows = state.tracked.map((mId) => {
    const m = state.measurements[mId];
    if (!m) return "";
    const k = measureKey(block.id, wk, mId);
    const val = state.log[k] != null ? state.log[k] : "";
    const prev = previousMeasure(mId, bi, wk);
    return '<div class="measure-row" data-m="' + mId + '">' +
      '<span class="measure-name">' + esc(m.name) + "</span>" +
      '<input type="number" inputmode="decimal" class="measure-val" data-k="' + k + '" data-type="text" aria-label="' + esc(m.name) + " (" + esc(m.unit) + ')" value="' + esc(val) + '" placeholder="' + (prev != null ? esc(String(prev)) : "—") + '">' +
      '<span class="unit">' + esc(m.unit) + "</span>" +
      (editing ? '<button class="remove" type="button" data-action="m-remove" data-m="' + mId + '" aria-label="Remove">×</button>' : "") +
      "</div>";
  }).join("");

  const heightVal = state.profile && state.profile.heightCm != null ? state.profile.heightCm : "";
  card.innerHTML =
    "<h2>Measurements</h2>" +
    (rows || '<p class="muted small">No measurements tracked — hit Edit to add some.</p>') +
    '<div class="bmi-line" id="bmi-line" hidden>BMI <strong id="bmi-value"></strong></div>' +
    '<label class="inline measure-height">Height <input type="number" inputmode="decimal" min="0" id="height-input" value="' + esc(heightVal) + '" placeholder="height"> cm</label>' +
    (editing ? renderMeasureAddZone() : "");
  renderBmi();
}

function renderMeasureAddZone() {
  return pickerZone({
    kind: "measure",
    addLabel: "＋ Add measurement",
    searchPlaceholder: "Search measurements…",
    createLabel: "＋ Create a new measurement",
    submitLabel: "Add",
    formFields:
      '<input name="name" placeholder="Measurement name" required>' +
      '<select name="unit"><option value="cm">cm</option><option value="kg">kg</option></select>',
  });
}

// Live patcher for the BMI line (parallels renderVolumes): recomputes from the
// current week's bodyweight + stored height and shows/hides accordingly.
export function renderBmi() {
  const line = document.getElementById("bmi-line");
  if (!line) return;
  const b = bmiFor(currentBlock(), state.ui.week);
  const out = document.getElementById("bmi-value");
  if (b == null) { line.hidden = true; if (out) out.textContent = ""; }
  else { line.hidden = false; if (out) out.textContent = b.toFixed(1); }
}

// The Nutrition card: a 7-day grid of plain number inputs (calories + the three
// macros) the user copies from their tracking app, with Week and Block total
// rows and an avg kcal/day line. Values use data-k/log like the workout grid;
// the totals live-patch (renderNutritionTotals) avoids a full render so an input
// keeps focus mid-type, exactly like renderVolumes/renderBmi.
function renderNutrition() {
  const card = document.getElementById("nutrition-card");
  if (!card) return;
  const block = currentBlock();
  const wk = state.ui.week;

  const head = '<div class="nut-row nut-head"><span class="nut-day"></span>' +
    NUTRIENTS.map((n) => '<span class="nut-col-h">' + esc(n.head) + "<small>" + esc(n.unit) + "</small></span>").join("") +
    "</div>";

  const rows = block.days.map((d) => {
    const cell = cellKey(block.id, wk, d.day);
    return '<div class="nut-row">' +
      '<span class="nut-day">Day ' + d.day + "</span>" +
      NUTRIENTS.map((n) => {
        const k = nutKey(cell, n.id);
        const val = state.log[k] != null ? state.log[k] : "";
        return '<input type="number" inputmode="decimal" min="0" class="nut-val" data-k="' + k + '" data-type="text" aria-label="Day ' + d.day + " " + esc(n.label) + " (" + esc(n.unit) + ')" value="' + esc(val) + '">';
      }).join("") +
      "</div>";
  }).join("");

  const totalRow = (label, scope) =>
    '<div class="nut-row nut-total">' +
    '<span class="nut-day">' + label + "</span>" +
    NUTRIENTS.map((n) => '<span class="nut-col" data-nut-total="' + scope + "-" + n.id + '"></span>').join("") +
    "</div>";

  card.innerHTML =
    "<h2>Nutrition</h2>" +
    '<div class="nut-grid">' + head + rows + totalRow("Week", "week") + totalRow("Block", "block") + "</div>" +
    '<p class="nut-avg muted small" id="nut-avg"></p>';
  renderNutritionTotals();
}

// Live-patch the Nutrition card's Week/Block total cells + the avg kcal/day line
// from the current log, leaving the inputs (and focus) untouched.
export function renderNutritionTotals() {
  const card = document.getElementById("nutrition-card");
  if (!card) return;
  const block = currentBlock();
  const allWeeks = Array.from({ length: WEEKS }, (_, i) => i + 1);
  const week = nutritionTotals(block, [state.ui.week]);
  const all = nutritionTotals(block, allWeeks);
  [["week", week], ["block", all]].forEach(([scope, t]) =>
    NUTRIENTS.forEach((n) => {
      const el = card.querySelector('[data-nut-total="' + scope + "-" + n.id + '"]');
      if (el) el.textContent = fmt(t[n.id]);
    })
  );
  const avg = document.getElementById("nut-avg");
  if (avg) {
    const perDay = (t) => (t.kcalDays ? fmt(t.kcal / t.kcalDays) + " kcal/day" : "—");
    avg.textContent = "Avg " + perDay(week) + " this week · " + perDay(all) + " this block";
  }
}

function hydrate() {
  document.querySelectorAll("#week-view [data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (el.dataset.type === "check") el.checked = !!state.log[k];
    else el.value = state.log[k] != null ? state.log[k] : "";
  });
  document.querySelectorAll("#week-view [data-cell]").forEach((c) =>
    c.classList.toggle("is-done", !!state.log[c.dataset.cell + ".done"])
  );
}

export function hydrateNotes() {
  const nf = document.getElementById("notes-field");
  if (nf) nf.value = state.notes || "";
}

// Shared picker body: the catalogue minus already-chosen ids, optionally
// narrowed by `keep`, name-filtered and sorted, rendered through a per-kind row
// builder (or the same "no matches" line).
function renderPickList(picker, catalogue, chosenIds, query, rowHtml, keep) {
  const on = {};
  chosenIds.forEach((id) => (on[id] = true));
  const q = (query || "").trim().toLowerCase();
  const items = Object.keys(catalogue)
    .map((id) => catalogue[id])
    .filter((x) => !on[x.id] && (!keep || keep(x)) && (!q || x.name.toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => a.name.localeCompare(b.name));
  picker.querySelector(".picker-list").innerHTML = items.length
    ? items.map(rowHtml).join("")
    : '<p class="muted small">No matches — create a new one below.</p>';
}

function populatePicker(picker, day, query) {
  // Only offer exercises whose type matches the day's kind, so a circuit can't
  // be added to a strength day (or vice versa).
  const type = kindType(dayDef(day).kind);
  renderPickList(picker, state.library, dayDef(day).exercises.map((p) => p.id), query, (ex) =>
    '<button class="pick" type="button" data-action="add-ex" data-day="' + day + '" data-ex="' + ex.id + '">' +
    esc(ex.name) + ' <span class="tag">' + (ex.type === "circuit" ? "circuit" : esc(ex.targetReps || "")) + "</span></button>",
    (ex) => ex.type === type);
}

function populateMeasurePicker(picker, query) {
  renderPickList(picker, state.measurements, state.tracked, query, (m) =>
    '<button class="pick" type="button" data-action="m-add" data-m="' + m.id + '">' +
    esc(m.name) + ' <span class="tag">' + esc(m.unit) + "</span></button>");
}

// Re-render a picker's list by its kind, so the generic open/search chrome
// needn't know which catalogue it's driving.
export function repopulate(zone, query) {
  const picker = zone.querySelector(".picker");
  if (!picker) return;
  if (zone.dataset.picker === "measure") populateMeasurePicker(picker, query);
  else populatePicker(picker, Number(zone.dataset.day), query);
}
