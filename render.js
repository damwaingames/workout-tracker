/* Rendering: turns the store into DOM. Reads `state`/`editing` plus the queries
 * from state.js and the pure helpers; never mutates the store. The exported
 * entry points (render + the focus-preserving live patchers) are what events.js
 * calls after a mutation. */

import { WEEKS, MIN_SETS, MAX_SETS, DEFAULT_SETS, NUTRIENTS, LOAD_MODES, BANDS } from "./constants.js";
import {
  cellKey, setKey, roundKey, roundRepKey, bandKey, measureKey, classesKey, foodKey,
  circuitOf, circuitSummary, circuitTimeLabel, kindType, loadMode, repsLabel, bandFor, kcalBurn, parseDay, esc, fmt,
} from "./helpers.js";
import {
  state, editing,
  currentBlock, currentBlockIndex, dayDef,
  previousSets, dayLoad, holidaySwap, previousDayTotal, previousMeasure, bmiFor, nutritionTotals, dayNutrition, entryNutrition,
  classTotals, weekBodyweight, classRate, logList,
} from "./state.js";

export function render() { renderHeader(); renderWeek(); renderProgress(); renderVolumes(); renderMeasurements(); renderNutrition(); renderClassTotal(); }

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
  const kg = weekBodyweight(block, wk); // per-week value — hoisted out of the days loop (each renderClasses needs it)
  // In Edit mode the block name becomes an inline input; otherwise it's static.
  const nameHtml = editing
    ? '<input type="text" id="block-name-input" class="block-name-input" value="' + esc(block.name) + '" placeholder="Block name" aria-label="Block name" maxlength="40">'
    : esc(block.name);
  document.getElementById("week-view").innerHTML =
    '<p class="week-heading">' + nameHtml + " · Week " + wk + " of " + WEEKS +
    (editing ? ' <span class="edit-hint">— editing this block’s exercises</span>' : "") + "</p>" +
    // Shared autocomplete list of known class types — every add-class form's type
    // input references this by id, so adding a type makes it offered everywhere.
    '<datalist id="class-types">' + state.classTypes.map((t) => '<option value="' + esc(t.name) + '">').join("") + "</datalist>" +
    (editing ? renderHolidayEdit() : "") +
    (editing ? renderClassTypesEdit() : "") +
    block.days.map((d) => renderDay(block, d, wk, kg)).join("");
  hydrate();
}

function renderDay(block, d, wk, kg) {
  const cell = cellKey(block.id, wk, d.day);
  // Collapse is a persisted per-cell flag (absent = expanded), set on completion
  // and toggleable by hand. The collapsed view shows only day-head + focus + the
  // totals summary; everything else lives in .day-collapsible, hidden by CSS.
  const collapsed = !!state.log[cell + ".collapsed"];
  // Holiday: another per-cell flag that swaps the shared Holiday Workout in for
  // this day. The day number stays; the kind / title / focus / exercises come
  // from state.holiday. Its band moves log against this cell, so the day's own
  // exercises stay un-logged and previousSets resumes against the last normal week.
  // The holiday body is structurally read-only here (the template is edited once in
  // renderHolidayEdit), so the inline sets / remove / add zone are suppressed.
  const eff = holidaySwap(cell, d);
  const holiday = eff !== d;
  const ed = holiday ? { ...eff, day: d.day } : d; // keep the real day number for previousSets / the cell
  let body;
  if (ed.kind === "strength") body = renderStrength(ed, wk, cell, editing && !holiday);
  else if (ed.kind === "recovery") body = renderRecovery(ed, wk, cell);
  else body = renderRest(cell);

  return '<div class="day ' + ed.kind + (collapsed ? " is-collapsed" : "") + (holiday ? " is-holiday" : "") + '" data-cell="' + cell + '">' +
    '<div class="day-head">' +
      '<div class="day-head-main">' +
        '<button class="day-collapse" type="button" data-action="toggle-day" aria-label="Collapse or expand this day" aria-expanded="' + (!collapsed) + '">▾</button>' +
        '<label class="done-toggle"><input type="checkbox" data-k="' + cell + '.done" data-type="check"><span class="day-title">Day ' + d.day + ": " + esc(ed.title) +
          (holiday ? ' <span class="holiday-badge">🏝 Holiday</span>' : "") + "</span></label>" +
      "</div>" +
      '<div class="day-head-side">' +
        // The 🏝 toggle is a logged per-cell flag (like .done), shown on every day so
        // any day can be swapped to the band workout while you're away from your kit.
        '<label class="holiday-toggle" title="Swap in your Holiday Workout (bands only) for this day">' +
          '<input type="checkbox" data-k="' + cell + '.holiday" data-type="check" aria-label="Use the Holiday Workout for this day">' +
          '<span aria-hidden="true">🏝</span></label>' +
        '<input type="date" class="day-date" data-k="' + cell + '.date" data-type="text" aria-label="Date trained">' +
      "</div>" +
    "</div>" +
    '<div class="day-focus">' + esc(ed.focus) + "</div>" +
    daySummary(block, ed, wk, cell) +
    // .day-collapsible is a one-row grid (1fr ↔ 0fr) so the inner height animates
    // to the content's natural size; the inner clips during the slide.
    '<div class="day-collapsible"><div class="day-collapsible-inner">' +
      '<div class="day-body">' + body + "</div>" +
      (editing && ed.kind !== "rest" && !holiday ? renderAddZone(d) : "") +
      renderClasses(cell, kg) +
    "</div></div>" +
    "</div>";
}

// The collapsed day's one-line totals (CSS-hidden while expanded). Strength days
// show tonnage; recovery days show the circuit's estimated total time, plus tonnage
// when a banded move makes the day load-bearing; any day adds logged class minutes.
// Empty (no line) for a rest day with nothing logged.
function daySummary(block, d, wk, cell) {
  const bits = [];
  // The volume figure carries the SAME data-vol-cell as the body's day-volume line,
  // so renderVolumes patches both (querySelectorAll) on every volume-affecting edit.
  // They are two views of one dayLoad().total and must never be patched independently
  // — collapse then just reveals an already-fresh number, no work in toggleDay/afterDone.
  const volBit = (total) => 'Volume <strong data-vol-cell="' + cell + '">' + fmt(total) + ' kg</strong><span class="vol-delta" data-vol-delta="' + cell + '"></span>';
  if (d.kind === "recovery") {
    bits.push(circuitTimeLabel(d));
    const { total, loadBearing } = dayLoad(block, wk, d);
    if (loadBearing) bits.push(volBit(total));
  } else if (d.kind === "strength") {
    bits.push(volBit(dayLoad(block, wk, d).total));
  }
  const mins = logList(classesKey(cell)).reduce((s, c) => s + (parseFloat(c.mins) || 0), 0);
  if (mins > 0) bits.push("Classes " + fmt(mins) + " min");
  return bits.length ? '<div class="day-summary">' + bits.join(" · ") + "</div>" : "";
}

// The per-day class logger — a list of logged classes (type · note · minutes ·
// ~kcal, each removable) and an add form, on every day kind. Classes are logged
// activity (shown in both modes), not part of the day template. `kg` is the
// week's bodyweight, used (with the type's rate) to estimate each class's burn.
function renderClasses(cell, kg) {
  const list = logList(classesKey(cell));
  const items = list.map((c, i) => {
    const kcal = kcalBurn(classRate(c.type), parseFloat(c.mins), kg);
    return '<li class="class-item"><span class="class-text">' +
      '<span class="class-type">' + esc(c.type) + "</span>" +
      (c.desc ? ' <span class="class-desc">' + esc(c.desc) + "</span>" : "") +
      ' <span class="class-mins">' + esc(String(c.mins)) + " min</span>" +
      (kcal > 0 ? ' <span class="class-kcal">~' + fmt(kcal) + " kcal</span>" : "") + "</span>" +
      '<button class="remove" type="button" data-action="class-remove" data-cell="' + cell + '" data-i="' + i + '" aria-label="Remove class">×</button></li>';
  }).join("");
  return '<div class="classes" data-cell="' + cell + '">' +
    (list.length ? '<ul class="class-list">' + items + "</ul>" : "") +
    '<div class="class-add">' +
      '<button class="link class-add-btn" type="button" data-action="form-open">＋ Add class</button>' +
      '<form class="class-form" hidden>' +
        '<input list="class-types" name="type" placeholder="Type (e.g. Pilates)" autocomplete="off" required>' +
        '<input name="desc" placeholder="What you did (optional)">' +
        '<input type="number" inputmode="numeric" min="1" name="mins" placeholder="Mins" required>' +
        '<div class="form-actions"><button type="submit">Add</button>' +
        '<button type="button" class="link" data-action="form-cancel">Cancel</button></div>' +
      "</form>" +
    "</div></div>";
}

// Edit-mode editor for the shared Holiday Workout — the band-only day any day can
// swap in via its 🏝 toggle. Structural only (no per-set logging): each move shows
// its sets stepper + loading controls + remove, plus the add picker. Edits apply
// everywhere it's ticked in, since it's one shared definition; the placement
// handlers reach it through the data-day="holiday" sentinel (dayDef → state.holiday).
function renderHolidayEdit() {
  const hd = state.holiday;
  const moves = hd.exercises.map((place) => {
    const ex = state.library[place.id];
    if (!ex) return "";
    const sets = place.sets || DEFAULT_SETS;
    return '<div class="exercise" data-ex="' + place.id + '">' +
      '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
      (ex.targetReps ? '<span class="ex-target">' + esc(ex.targetReps) + "</span>" : "") +
      '<button class="remove" type="button" data-action="remove-exercise" data-day="holiday" data-ex="' + place.id + '" aria-label="Remove">×</button>' +
      "</div>" +
      '<div class="sets-edit">Sets ' +
        '<button class="step" type="button" data-action="sets-dec" data-day="holiday" data-ex="' + place.id + '" aria-label="Fewer sets">−</button>' +
        '<span class="sets-count">' + sets + "</span>" +
        '<button class="step" type="button" data-action="sets-inc" data-day="holiday" data-ex="' + place.id + '" aria-label="More sets">＋</button>' +
        loadingEdit(hd, ex) +
      "</div></div>";
  }).join("");
  return '<div class="holiday-edit">' +
    '<h2 class="holiday-edit-h">🏝 Holiday Workout</h2>' +
    '<p class="muted small">A band-only day you can swap into any day with its 🏝 toggle — for when you’re away from your kit. It logs separately, so your normal progression picks up where it left off.</p>' +
    '<div class="day-body">' + moves + "</div>" +
    renderAddZone({ kind: hd.kind, day: "holiday" }) +
    "</div>";
}

// Edit-mode editor for the class-type calorie rates (kcal/min/kg). One row per
// type; a new type created by logging starts at 0 and is set here. Live-patches
// the header total on change (renderClassTotal), so a rate input keeps focus.
function renderClassTypesEdit() {
  return '<div class="class-types-edit"><div class="ct-head">Class burn rates <span class="ct-unit">kcal / min / kg</span></div>' +
    state.classTypes.map((t) =>
      '<label class="ct-row"><span class="ct-name">' + esc(t.name) + "</span>" +
      '<input type="number" class="ct-rate" data-fh="ct-rate" data-type-name="' + esc(t.name) + '" inputmode="decimal" step="0.01" min="0" value="' + esc(String(t.rate)) + '"></label>'
    ).join("") + "</div>";
}

// The header's Classes line (week + block: minutes, plus estimated burn once a
// bodyweight makes it computable). Shown only once anything's logged so it doesn't
// clutter an empty header. Parallels the Volume line; exported so a live rate edit
// can re-patch it without a full render.
export function renderClassTotal() {
  const el = document.getElementById("class-total");
  if (!el) return;
  const b = currentBlock();
  const week = classTotals(b, [state.ui.week]);
  const block = classTotals(b, Array.from({ length: WEEKS }, (_, i) => i + 1));
  const part = (t) => "<strong>" + fmt(t.mins) + " min</strong>" + (t.kcal > 0 ? " · <strong>~" + fmt(t.kcal) + " kcal</strong>" : "");
  el.innerHTML = (week.mins || block.mins)
    ? "Classes · " + part(week) + " this week · " + part(block) + " this block"
    : "";
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
  return '<div class="day-volume">Day volume <strong data-vol-cell="' + cell + '">' + fmt(v) + ' kg</strong>' +
    '<span class="vol-delta" data-vol-delta="' + cell + '"></span></div>';
}

// Fill (or clear) a day-volume delta chip: the progressive-overload change vs the
// same day last week, as a signed "+N kg" / "−N kg" coloured up (green) / down. Empty
// when there's nothing to compare — no prior same-day load, the day not yet logged,
// or an exact match. previousDayTotal already gates to like-for-like (holiday) weeks.
function setVolDelta(el, cur, prev) {
  el.classList.remove("up", "down");
  if (!(cur > 0) || !(prev > 0) || cur === prev) { el.textContent = ""; return; }
  const diff = cur - prev;
  el.classList.add(diff > 0 ? "up" : "down");
  el.textContent = (diff > 0 ? "+" : "−") + fmt(Math.abs(diff)) + " kg";
}

// `editStruct` gates the per-exercise structural edit chrome (sets stepper,
// loading controls, remove). It's the global `editing` for a normal day, but
// false for a holiday-substituted day — that day's structure is the shared
// Holiday Workout, edited once in renderHolidayEdit, not per placed day.
function renderStrength(d, wk, cell, editStruct) {
  const bi = currentBlockIndex();
  const body = d.exercises.map((place) => {
    const exId = place.id;
    const ex = state.library[exId];
    if (!ex) return "";
    const sets = place.sets || DEFAULT_SETS;
    const banded = !!ex.banded; // banded moves log a band + reps, not weight × reps
    const m = loadMode(ex); // free-weight tonnage multipliers + per-mode labels
    // Last session's sets (band moves track reps too — they log a reps field, so the
    // "most-recent non-empty" scan finds them just like a free-weight move).
    const prev = previousSets(exId, bi, wk, d.day);
    let rows = "";
    for (let i = 0; i < sets; i++) {
      const p = prev && prev[i];
      if (banded) {
        rows +=
          '<div class="set banded"><span class="set-n">Set ' + (i + 1) + "</span>" +
          '<input type="number" inputmode="numeric" class="r" data-k="' + setKey(cell, exId, i, "r") + '" data-type="text" data-refresh="volumes" placeholder="' + (p && p.r ? esc(p.r) : "reps") + '">' +
          '<span class="unit">' + repsLabel(m) + "</span></div>";
        continue;
      }
      rows +=
        '<div class="set"><span class="set-n">Set ' + (i + 1) + "</span>" +
        '<input type="number" inputmode="decimal" class="w" data-k="' + setKey(cell, exId, i, "w") + '" data-type="text" data-refresh="volumes" placeholder="' + (p && p.w ? esc(p.w) : "wt") + '">' +
        '<span class="unit">' + esc(m.wUnit || "kg") + "</span>" +
        '<span class="x">×</span>' +
        '<input type="number" inputmode="numeric" class="r" data-k="' + setKey(cell, exId, i, "r") + '" data-type="text" data-refresh="volumes" placeholder="' + (p && p.r ? esc(p.r) : "reps") + '">' +
        (m.rUnit ? '<span class="unit">' + esc(m.rUnit) + "</span>" : "") +
        "</div>";
    }
    const last = prev
      ? '<div class="last">Last: ' + prev.map((s) => (s.w ? esc(s.w) + " kg × " : "") + (s.r ? esc(s.r) : "–")).join(", ") + "</div>"
      : "";
    const bandRow = banded ? bandPicker(cell, exId, ex) : ""; // the per-session band selector
    const setsEdit = editStruct
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
      (editStruct ? '<button class="remove" type="button" data-action="remove-exercise" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
      "</div>" +
      (ex.setup ? '<div class="setup">' + esc(ex.setup) + "</div>" : "") +
      setsEdit +
      bandRow +
      '<div class="sets">' + rows + "</div>" + last +
      "</div>";
  }).join("");
  // Compute the day's load inline so a fresh render is already correct;
  // renderVolumes() only re-patches the total during live (keystroke) edits.
  const { total, loadBearing } = dayLoad(currentBlock(), wk, d);
  return body + (loadBearing ? volumeLine(cell, total) : "");
}

function renderRecovery(d, wk, cell) {
  const rounds = circuitOf(d).rounds; // rounds drive the checkbox / reps count per move
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
          '<input type="number" inputmode="numeric" class="round-rep" data-k="' + roundRepKey(cell, exId, r) + '" data-type="text" data-refresh="volumes" placeholder="' + repsLabel(m) + '"></label>';
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
  // Recovery days are usually load-free; the day-volume line shows only once a
  // banded move makes the day load-bearing (so pure-cardio days stay uncluttered).
  const { total, loadBearing } = dayLoad(currentBlock(), wk, d);
  const volLine = loadBearing ? volumeLine(cell, total) : "";
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
      '<button class="link" type="button" data-action="form-open">' + o.createLabel + "</button>" +
      '<form class="picker-form" hidden>' + o.formFields +
        '<div class="form-actions"><button type="submit">' + o.submitLabel + "</button>" +
        '<button type="button" class="link" data-action="form-cancel">Cancel</button></div>' +
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

export function renderProgress() {
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
      const v = dayLoad(b, w, d).total;
      blockVol += v;
      if (w === wk) {
        weekVol += v;
        const cell = cellKey(b.id, w, d.day);
        // All matches: the body day-volume line AND the collapsed summary's figure.
        document.querySelectorAll('[data-vol-cell="' + cell + '"]')
          .forEach((el) => { el.textContent = fmt(v) + " kg"; });
        // Progressive-overload delta vs the same day last week — patched here too so it
        // tracks live edits, alongside both views' totals (same data-vol-delta on each).
        const prev = previousDayTotal(b, w, d);
        document.querySelectorAll('[data-vol-delta="' + cell + '"]').forEach((el) => setVolDelta(el, v, prev));
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
      '<input type="number" inputmode="decimal" class="measure-val" data-k="' + k + '" data-type="text" data-refresh="bmi" aria-label="' + esc(m.name) + " (" + esc(m.unit) + ')" value="' + esc(val) + '" placeholder="' + (prev != null ? esc(String(prev)) : "—") + '">' +
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

// The Nutrition card: a per-day breakdown of food entries with each day's *derived*
// kcal + macros, plus Week / Block totals and an avg kcal/day line. Each day shows its
// food list (quick entries now; pantry entries once a lookup populates them), a derived
// total line, and a quick-entry add form. Replaces the old hand-typed grid; the per-day
// block (renderDayFood) is the unit a later slice lifts into the day card as a tab.
function renderNutrition() {
  const card = document.getElementById("nutrition-card");
  if (!card) return;
  const block = currentBlock();
  const wk = state.ui.week;
  const days = block.days.map((d) => renderDayFood(cellKey(block.id, wk, d.day), "Day " + d.day)).join("");
  const allWeeks = Array.from({ length: WEEKS }, (_, i) => i + 1);
  const week = nutritionTotals(block, [wk]);
  const all = nutritionTotals(block, allWeeks);
  const perDay = (t) => (t.kcalDays ? fmt(t.kcal / t.kcalDays) + " kcal/day" : "—");
  const totalLine = (label, t) =>
    '<div class="nut-total-line"><span class="nut-total-label">' + label + "</span> " +
    '<span data-nut-line="' + label.toLowerCase() + '">' + nutritionLine(t) + "</span></div>";
  card.innerHTML =
    "<h2>Nutrition</h2>" +
    '<div class="food-days">' + days + "</div>" +
    '<div class="nut-totals">' + totalLine("Week", week) + totalLine("Block", all) + "</div>" +
    '<p class="nut-avg muted small">Avg ' + perDay(week) + " this week · " + perDay(all) + " this block</p>";
}

// One day's food block — its list of entries, the derived day total, and the quick-entry
// add form. The container carries data-cell so addQuickEntry / removeFood resolve the
// cell; `label` heads the block in the standalone card (the day card supplies its own
// header). A pantry entry shows its Food's name + grams; a quick entry shows its name.
function renderDayFood(cell, label) {
  const list = logList(foodKey(cell));
  const items = list.map((e, i) => {
    const n = entryNutrition(e);
    const food = e.barcode ? state.pantry[e.barcode] : null;
    const name = e.barcode ? ((food && food.name) || e.barcode) : (e.name || "Quick entry");
    const detail = e.barcode ? ' <span class="food-detail">' + fmt(parseFloat(e.grams) || 0) + " g</span>" : "";
    return '<li class="food-item"><span class="food-text">' +
      '<span class="food-name">' + esc(name) + "</span>" + detail +
      ' <span class="food-kcal">' + fmt(n.kcal) + " kcal</span></span>" +
      '<button class="remove" type="button" data-action="food-remove" data-cell="' + cell + '" data-i="' + i + '" aria-label="Remove food">×</button></li>';
  }).join("");
  const fields = NUTRIENTS.map((n) =>
    '<input type="number" inputmode="decimal" min="0" name="' + n.id + '" placeholder="' + esc(n.head) + '" aria-label="' + esc(n.label) + " (" + esc(n.unit) + ')">'
  ).join("");
  return '<div class="food" data-cell="' + cell + '">' +
    (label ? '<div class="food-day">' + esc(label) + "</div>" : "") +
    (list.length ? '<ul class="food-list">' + items + "</ul>" : "") +
    (list.length ? '<div class="food-total">' + nutritionLine(dayNutrition(cell)) + "</div>" : "") +
    '<div class="food-add">' +
      '<button class="link food-add-btn" type="button" data-action="food-open">＋ Add food</button>' +
      '<div class="food-finder" hidden>' +
        '<div class="food-search-row">' +
          '<input class="food-search" data-fh="food-search" placeholder="Search foods or barcode…" autocomplete="off" aria-label="Search foods or enter a barcode">' +
          '<button type="button" data-action="food-find">Find</button>' +
        "</div>" +
        '<ul class="food-results"></ul>' +
        '<div class="food-quick">' +
          '<button type="button" class="link" data-action="form-open">Quick entry (no barcode)</button>' +
          '<form class="food-quick-form" hidden>' +
            '<input name="name" placeholder="Food (optional)" autocomplete="off">' +
            fields +
            '<div class="form-actions"><button type="submit">Add</button>' +
            '<button type="button" class="link" data-action="form-cancel">Cancel</button></div>' +
          "</form>" +
        "</div>" +
        '<button type="button" class="link food-close" data-action="food-close">Close</button>' +
      "</div>" +
    "</div></div>";
}

// The finder's result rows — a Pantry quick-pick list or Open Food Facts hits — each a
// pick button (name + brand + kcal/100g) with a hidden grams form revealed on pick.
// Exported so events.js patches the list in place (like the exercise picker's repopulate)
// rather than via a full render, which would close the finder mid-flow.
export function foodResultsHTML(foods) {
  if (!foods.length) return '<li class="food-result-empty muted small">No matches — Find on Open Food Facts, or add a quick entry.</li>';
  return foods.map((f) =>
    '<li class="food-result" data-barcode="' + esc(f.barcode) + '">' +
      '<button type="button" class="food-result-pick" data-action="food-pick" data-barcode="' + esc(f.barcode) + '">' +
        '<span class="food-result-name">' + esc(f.name || f.barcode) + "</span>" +
        '<span class="food-result-meta">' + (f.brand ? esc(f.brand) + " · " : "") + fmt(f.per100g.kcal) + " kcal/100g</span>" +
      "</button>" +
      '<form class="food-grams-form" hidden data-barcode="' + esc(f.barcode) + '">' +
        '<input type="number" inputmode="decimal" min="0" name="grams" value="100" aria-label="Grams">' +
        '<span class="food-grams-unit">g</span><button type="submit">Add</button>' +
      "</form>" +
    "</li>"
  ).join("");
}

// Compact one-line nutrition figure shared by the day total and the Week / Block totals:
// "1850 cal · 77c / 45f / 154p". Macros use their id initial (c/f/p); kcal leads. Reads
// a { kcal, carb, fat, protein } object (dayNutrition / nutritionTotals).
function nutritionLine(n) {
  const macros = NUTRIENTS.filter((x) => x.id !== "kcal").map((x) => fmt(n[x.id]) + x.id[0]).join(" / ");
  return fmt(n.kcal) + " cal" + (macros ? " · " + macros : "");
}

// Reflect the log onto the existing #week-view DOM without rebuilding it: every
// data-k input, plus the per-cell day flags on each .day (completion styling and
// collapse state + its caret — both are absent-or-set flags on the cell). Because
// it patches in place, afterDone can re-sync through here and still animate the
// collapse. Exported so afterDone reuses this one reflect path rather than
// hand-mirroring it. Runs after each renderWeek too (a no-op vs the fresh markup).
export function hydrate() {
  document.querySelectorAll("#week-view [data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (el.dataset.type === "check") el.checked = !!state.log[k];
    else el.value = state.log[k] != null ? state.log[k] : "";
  });
  document.querySelectorAll("#week-view .day[data-cell]").forEach((dayEl) => {
    const cell = dayEl.dataset.cell;
    dayEl.classList.toggle("is-done", !!state.log[cell + ".done"]);
    const collapsed = !!state.log[cell + ".collapsed"];
    dayEl.classList.toggle("is-collapsed", collapsed);
    const chevron = dayEl.querySelector(".day-collapse");
    if (chevron) chevron.setAttribute("aria-expanded", String(!collapsed));
  });
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
  // be added to a strength day (or vice versa). The Holiday Workout is band-only
  // (its skip relies on banded moves carrying no cross-day history — ADR-0002), so
  // its picker is further narrowed to banded moves. (Create-new isn't constrained;
  // see the ADR caveat — adding a non-banded move there is the user's own choice.)
  const type = kindType(dayDef(day).kind);
  renderPickList(picker, state.library, dayDef(day).exercises.map((p) => p.id), query, (ex) =>
    '<button class="pick" type="button" data-action="add-ex" data-day="' + day + '" data-ex="' + ex.id + '">' +
    esc(ex.name) + ' <span class="tag">' + (ex.type === "circuit" ? "circuit" : esc(ex.targetReps || "")) + "</span></button>",
    (ex) => ex.type === type && (day !== "holiday" || ex.banded));
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
  else populatePicker(picker, parseDay(zone.dataset.day), query);
}
