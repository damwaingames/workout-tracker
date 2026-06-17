/* Rendering: turns the store into DOM. Reads `state`/`editing` plus the queries
 * from state.js and the pure helpers; never mutates the store. The exported
 * entry points (render + the focus-preserving live patchers) are what events.js
 * calls after a mutation. */

import { WEEKS, ALL_WEEKS, MIN_SETS, MAX_SETS, DEFAULT_SETS, NUTRIENTS, LOAD_MODES, BANDS } from "./constants.js";
import {
  cellKey, setKey, roundKey, roundRepKey, bandKey, measureKey, classesKey, foodKey,
  circuitOf, circuitSummary, circuitTimeLabel, kindType, loadMode, repsLabel, bandFor, kcalBurn, parseRoutine, scheduledDate, fmtWeekday, esc, fmt,
} from "./helpers.js";
import {
  state, editing,
  currentBlock, currentBlockIndex, routineDef, weekSchedule,
  previousSets, routineLoad, holidaySwap, previousRoutineTotal, previousMeasure, bmiFor, nutritionTotals, routineNutrition, entryNutrition,
  classTotals, weekBodyweight, classRate, logList,
} from "./state.js";
import { scanSupported } from "./scan.js";

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
  const kg = weekBodyweight(block, wk); // per-week value — hoisted out of the routines loop (each renderClasses needs it)
  // In Edit mode the block name becomes an inline input; otherwise it's static.
  const nameHtml = editing
    ? '<input type="text" id="block-name-input" class="block-name-input" value="' + esc(block.name) + '" placeholder="Block name" aria-label="Block name" maxlength="40">'
    : esc(block.name);
  document.getElementById("week-view").innerHTML =
    '<p class="week-heading">' + nameHtml + " · Week " + wk + " of " + WEEKS +
    (editing ? ' <span class="edit-hint">— editing this block’s exercises</span>' : "") + "</p>" +
    // Block start date (the Monday weekdays derive from) — editable in Edit mode; a free
    // date (no snap), so a midweek start is representable (ADR-0005).
    (editing ? '<label class="block-start-l">Block starts <input type="date" id="block-start-input" class="block-start-input" value="' + esc(block.startDate) + '" aria-label="Block start date"></label>' : "") +
    // Shared autocomplete list of known class types — every add-class form's type
    // input references this by id, so adding a type makes it offered everywhere.
    '<datalist id="class-types">' + state.classTypes.map((t) => '<option value="' + esc(t.name) + '">').join("") + "</datalist>" +
    (editing ? renderHolidayEdit() : "") +
    (editing ? renderClassTypesEdit() : "") +
    weekSchedule(block, wk).map((n, i) => {
      // weekSchedule yields a bijection over block.routines, so find always hits.
      const d = block.routines.find((r) => r.routine === n);
      return renderRoutine(block, d, wk, kg, i);
    }).join("");
  hydrate();
}

function renderRoutine(block, d, wk, kg, position) {
  const cell = cellKey(block.id, wk, d.routine);
  // The routine's weekday + date, derived from the block start + week offset + its
  // position in this week's schedule (here the render index) — the header label that
  // replaces the old "Day N" (ADR-0005).
  const when = fmtWeekday(scheduledDate(block.startDate, wk, position));
  const lastPos = block.routines.length - 1; // for disabling the reorder arrows at the ends
  // Collapse is a persisted per-cell flag (absent = expanded), set on completion
  // and toggleable by hand. The collapsed view shows only routine-head + focus + the
  // totals summary; everything else lives in .routine-collapsible, hidden by CSS.
  const collapsed = !!state.log[cell + ".collapsed"];
  // Holiday: another per-cell flag that swaps the shared Holiday Workout in for
  // this routine. The routine number stays; the kind / title / focus / exercises come
  // from state.holiday. Its band moves log against this cell, so the routine's own
  // exercises stay un-logged and previousSets resumes against the last normal week.
  // The holiday body is structurally read-only here (the template is edited once in
  // renderHolidayEdit), so the inline sets / remove / add zone are suppressed.
  const eff = holidaySwap(cell, d);
  const holiday = eff !== d;
  const ed = holiday ? { ...eff, routine: d.routine } : d; // keep the real routine number for previousSets / the cell
  let body;
  if (ed.kind === "strength") body = renderStrength(ed, wk, cell, editing && !holiday);
  else if (ed.kind === "recovery") body = renderRecovery(ed, wk, cell);
  else body = renderRest(cell);

  return '<div class="routine ' + ed.kind + (collapsed ? " is-collapsed" : "") + (holiday ? " is-holiday" : "") + '" data-cell="' + cell + '">' +
    '<div class="routine-head">' +
      '<div class="routine-head-main">' +
        '<button class="routine-collapse" type="button" data-action="toggle-routine" aria-label="Collapse or expand this day" aria-expanded="' + (!collapsed) + '">▾</button>' +
        '<label class="done-toggle"><input type="checkbox" data-k="' + cell + '.done" data-type="check" data-after="done"><span class="routine-title">' + when + " · " + esc(ed.title) +
          (holiday ? ' <span class="holiday-badge">🏝 Holiday</span>' : "") + "</span></label>" +
      "</div>" +
      '<div class="routine-head-side">' +
        // Reorder this routine onto an earlier / later weekday in the week (Edit mode only).
        // Each click swaps with the neighbour in the week's schedule; disabled at the ends.
        (editing
          ? '<span class="routine-move-group">' +
              '<button class="routine-move" type="button" data-action="routine-up" data-routine="' + d.routine + '" aria-label="Move to an earlier weekday"' + (position === 0 ? " disabled" : "") + ">▲</button>" +
              '<button class="routine-move" type="button" data-action="routine-down" data-routine="' + d.routine + '" aria-label="Move to a later weekday"' + (position === lastPos ? " disabled" : "") + ">▼</button>" +
            "</span>"
          : "") +
        // The 🏝 toggle is a logged per-cell flag (like .done), shown on every routine so
        // any routine can be swapped to the band workout while you're away from your kit.
        '<label class="holiday-toggle" title="Swap in your Holiday Workout (bands only) for this day">' +
          '<input type="checkbox" data-k="' + cell + '.holiday" data-type="check" data-after="holiday" aria-label="Use the Holiday Workout for this day">' +
          '<span aria-hidden="true">🏝</span></label>' +
      "</div>" +
    "</div>" +
    '<div class="routine-focus">' + esc(ed.focus) + "</div>" +
    routineSummary(block, ed, wk, cell) +
    // .routine-collapsible is a one-row grid (1fr ↔ 0fr) so the inner height animates
    // to the content's natural size; the inner clips during the slide.
    '<div class="routine-collapsible"><div class="routine-collapsible-inner">' +
      // Per-routine tabs: Workout (exercises/circuit + classes) ↔ Nutrition (food entries +
      // derived totals). The active tab is the persisted .tab cell flag (absent =
      // workout), reflected by hydrate; both panels render and CSS shows the active one,
      // so switching is instant and an open finder survives a tab away-and-back.
      '<div class="routine-tabs" role="tablist">' +
        '<button class="routine-tab" type="button" role="tab" data-action="routine-tab" data-tab="workout" aria-selected="true">Workout</button>' +
        '<button class="routine-tab" type="button" role="tab" data-action="routine-tab" data-tab="nutrition" aria-selected="false">Nutrition</button>' +
      "</div>" +
      '<div class="routine-panel routine-panel-workout">' +
        '<div class="routine-body">' + body + "</div>" +
        (editing && ed.kind !== "rest" && !holiday ? renderAddZone(d) : "") +
        renderClasses(cell, kg) +
      "</div>" +
      '<div class="routine-panel routine-panel-nutrition">' + renderRoutineFood(cell) + "</div>" +
    "</div></div>" +
    "</div>";
}

// The collapsed routine's one-line totals (CSS-hidden while expanded). Strength routines
// show tonnage; recovery routines show the circuit's estimated total time, plus tonnage
// when a banded move makes the routine load-bearing; any routine adds logged class minutes.
// Empty (no line) for a rest routine with nothing logged.
function routineSummary(block, d, wk, cell) {
  const bits = [];
  // The volume figure carries the SAME data-vol-cell as the body's routine-volume line,
  // so renderVolumes patches both (querySelectorAll) on every volume-affecting edit.
  // They are two views of one routineLoad().total and must never be patched independently
  // — collapse then just reveals an already-fresh number, no work in toggleRoutine/afterDone.
  const volBit = (total) => 'Volume <strong data-vol-cell="' + cell + '">' + fmt(total) + ' kg</strong><span class="vol-delta" data-vol-delta="' + cell + '"></span>';
  if (d.kind === "recovery") {
    bits.push(circuitTimeLabel(d));
    const { total, loadBearing } = routineLoad(block, wk, d);
    if (loadBearing) bits.push(volBit(total));
  } else if (d.kind === "strength") {
    bits.push(volBit(routineLoad(block, wk, d).total));
  }
  const mins = logList(classesKey(cell)).reduce((s, c) => s + (parseFloat(c.mins) || 0), 0);
  if (mins > 0) bits.push("Classes " + fmt(mins) + " min");
  // Nutrition: once any food is logged, the routine's derived kcal + full macro line — so a
  // collapsed routine still shows what it ate (CONTEXT.md "Collapsed routine"). Rebuilt on every
  // full render (food add/remove renders), so it needs no live-patch hook like volume.
  if (logList(foodKey(cell)).length) bits.push(nutritionLine(routineNutrition(cell)));
  return bits.length ? '<div class="routine-summary">' + bits.join(" · ") + "</div>" : "";
}

// The per-routine class logger — a list of logged classes (type · note · minutes ·
// ~kcal, each removable) and an add form, on every routine kind. Classes are logged
// activity (shown in both modes), not part of the routine template. `kg` is the
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

// Edit-mode editor for the shared Holiday Workout — the band-only routine any routine can
// swap in via its 🏝 toggle. Structural only (no per-set logging): each move shows
// its sets stepper + loading controls + remove, plus the add picker. Edits apply
// everywhere it's ticked in, since it's one shared definition; the placement
// handlers reach it through the data-routine="holiday" sentinel (routineDef → state.holiday).
function renderHolidayEdit() {
  const hd = state.holiday;
  const moves = hd.exercises.map((place) => {
    const ex = state.library[place.id];
    if (!ex) return "";
    const sets = place.sets || DEFAULT_SETS;
    return '<div class="exercise" data-ex="' + place.id + '">' +
      '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
      (ex.targetReps ? '<span class="ex-target">' + esc(ex.targetReps) + "</span>" : "") +
      '<button class="remove" type="button" data-action="remove-exercise" data-routine="holiday" data-ex="' + place.id + '" aria-label="Remove">×</button>' +
      "</div>" +
      '<div class="sets-edit">Sets ' +
        '<button class="step" type="button" data-action="sets-dec" data-routine="holiday" data-ex="' + place.id + '" aria-label="Fewer sets">−</button>' +
        '<span class="sets-count">' + sets + "</span>" +
        '<button class="step" type="button" data-action="sets-inc" data-routine="holiday" data-ex="' + place.id + '" aria-label="More sets">＋</button>' +
        loadingEdit(hd, ex) +
      "</div></div>";
  }).join("");
  return '<div class="holiday-edit">' +
    '<h2 class="holiday-edit-h">🏝 Holiday Workout</h2>' +
    '<p class="muted small">A band-only day you can swap into any day with its 🏝 toggle — for when you’re away from your kit. It logs separately, so your normal progression picks up where it left off.</p>' +
    '<div class="routine-body">' + moves + "</div>" +
    renderAddZone({ kind: hd.kind, routine: "holiday" }) +
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
  const block = classTotals(b, ALL_WEEKS);
  const part = (t) => "<strong>" + fmt(t.mins) + " min</strong>" + (t.kcal > 0 ? " · <strong>~" + fmt(t.kcal) + " kcal</strong>" : "");
  el.innerHTML = (week.mins || block.mins)
    ? "Classes · " + part(week) + " this week · " + part(block) + " this block"
    : "";
}

// The per-session band picker for a banded move (logged via bandKey, so it gets
// no data-k — hydrate would blank an unlogged select; we pre-select the resolved
// tier here and let the band-pick handler persist changes). Shown on both routine
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

// The routine's tonnage line. One source for the markup, since renderVolumes patches
// the inner <strong> (by data-vol-cell) during live edits — both routine kinds emit it.
function volumeLine(cell, v) {
  return '<div class="routine-volume">Day volume <strong data-vol-cell="' + cell + '">' + fmt(v) + ' kg</strong>' +
    '<span class="vol-delta" data-vol-delta="' + cell + '"></span></div>';
}

// Fill (or clear) a routine-volume delta chip: the progressive-overload change vs the
// same routine last week, as a signed "+N kg" / "−N kg" coloured up (green) / down. Empty
// when there's nothing to compare — no prior same-routine load, the routine not yet logged,
// or an exact match. previousRoutineTotal already gates to like-for-like (holiday) weeks.
function setVolDelta(el, cur, prev) {
  el.classList.remove("up", "down");
  if (!(cur > 0) || !(prev > 0) || cur === prev) { el.textContent = ""; return; }
  const diff = cur - prev;
  el.classList.add(diff > 0 ? "up" : "down");
  el.textContent = (diff > 0 ? "+" : "−") + fmt(Math.abs(diff)) + " kg";
}

// `editStruct` gates the per-exercise structural edit chrome (sets stepper,
// loading controls, remove). It's the global `editing` for a normal routine, but
// false for a holiday-substituted routine — that routine's structure is the shared
// Holiday Workout, edited once in renderHolidayEdit, not per placed routine.
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
    const prev = previousSets(exId, bi, wk, d.routine);
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
      ? '<div class="sets-edit">Sets <button class="step" type="button" data-action="sets-dec" data-routine="' + d.routine + '" data-ex="' + exId + '" aria-label="Fewer sets">−</button>' +
        '<span class="sets-count">' + sets + "</span>" +
        '<button class="step" type="button" data-action="sets-inc" data-routine="' + d.routine + '" data-ex="' + exId + '" aria-label="More sets">＋</button>' +
        // How this exercise is loaded (band vs free weight, and its tonnage mode) —
        // a property of the exercise, so it persists on the library record.
        loadingEdit(d, ex) + "</div>"
      : "";
    return '<div class="exercise" data-ex="' + exId + '">' +
      '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
      (ex.targetReps ? '<span class="ex-target">' + esc(ex.targetReps) + "</span>" : "") +
      (ex.setup ? '<button class="info" type="button" data-action="toggle-setup" aria-label="How to do this">ⓘ</button>' : "") +
      (editStruct ? '<button class="remove" type="button" data-action="remove-exercise" data-routine="' + d.routine + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
      "</div>" +
      (ex.setup ? '<div class="setup">' + esc(ex.setup) + "</div>" : "") +
      setsEdit +
      bandRow +
      '<div class="sets">' + rows + "</div>" + last +
      "</div>";
  }).join("");
  // Compute the routine's load inline so a fresh render is already correct;
  // renderVolumes() only re-patches the total during live (keystroke) edits.
  const { total, loadBearing } = routineLoad(currentBlock(), wk, d);
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
      (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-routine="' + d.routine + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
      "</div>" +
      (editing ? '<div class="sets-edit">' + loadingEdit(d, ex) + "</div>" : "") +
      inner + "</div>";
  }).join("");
  // Recovery routines are usually load-free; the routine-volume line shows only once a
  // banded move makes the routine load-bearing (so pure-cardio routines stay uncluttered).
  const { total, loadBearing } = routineLoad(currentBlock(), wk, d);
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
    ' <input type="number" inputmode="numeric" min="0" class="circuit-field" data-fh="circuit-field" data-routine="' + d.routine + '" data-field="' + field + '" value="' + val + '">s</label>';
  return '<div class="circuit-edit">' +
    '<div class="rounds-edit">Rounds ' +
      '<button class="step" type="button" data-action="rounds-dec" data-routine="' + d.routine + '" aria-label="Fewer rounds">−</button>' +
      '<span class="sets-count">' + c.rounds + "</span>" +
      '<button class="step" type="button" data-action="rounds-inc" data-routine="' + d.routine + '" aria-label="More rounds">＋</button></div>' +
    secField("workSec", "Work", c.workSec) +
    secField("restSec", "Rest", c.restSec) +
    secField("roundRestSec", "Round rest", c.roundRestSec) +
    "</div>";
}

// Live-patch a recovery routine's summary line when its work/rest seconds change,
// so the second input keeps focus mid-type (rounds re-render via the stepper).
export function patchCircuitTime(d) {
  const el = document.querySelector('[data-circuit-cell="' + cellKey(currentBlock().id, state.ui.week, d.routine) + '"]');
  if (el) el.textContent = circuitSummary(d);
}

function renderRest(cell) {
  return '<p class="rest-note">No structured exercise — focus on hydration, nutrition, and muscle repair.</p>' +
    '<label class="inline block">How your joints / knees feel<input type="text" data-k="' + cell + '.joints" data-type="text" placeholder="e.g. knees happy, left wrist a little tight"></label>';
}

// Shared picker chrome — an add button, search box, result list, a create-new
// link, and a create form whose fields differ per kind. data-picker (+ optional
// data-routine) drives the generic open/search/create handlers; only the catalogue,
// row markup, and these form fields are kind-specific.
function pickerZone(o) {
  const routineAttr = o.routine != null ? ' data-routine="' + o.routine + '"' : "";
  return '<div class="add-zone" data-picker="' + o.kind + '"' + routineAttr + ">" +
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
  // The routine's kind fixes the exercise type, so there's no type picker: a
  // strength routine's form collects reps + sets, a recovery routine's collects neither
  // (circuits use fixed rounds). This is what stops a mismatched placement.
  const strength = d.kind === "strength";
  return pickerZone({
    kind: "exercise",
    routine: d.routine,
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
  const routines = b.routines.length;
  let weekDone = 0, blockDone = 0;
  for (let wk = 1; wk <= WEEKS; wk++) {
    for (let i = 0; i < routines; i++) {
      if (state.log[cellKey(b.id, wk, b.routines[i].routine) + ".done"]) {
        blockDone++;
        if (wk === state.ui.week) weekDone++;
      }
    }
  }
  document.getElementById("progress").innerHTML =
    "<strong>" + weekDone + "</strong> / " + routines + " this week · <strong>" + blockDone + "</strong> / " + (routines * WEEKS) + " this block";
}

// The focus-preserving live updater: re-patches the visible week's routine volumes
// plus the week/block totals without a re-render, so a weight/reps input keeps
// focus mid-edit. Full renders already emit correct routine volumes via renderStrength.
export function renderVolumes() {
  const b = currentBlock();
  const wk = state.ui.week;
  let weekVol = 0, blockVol = 0;
  for (let w = 1; w <= WEEKS; w++) {
    b.routines.forEach((d) => {
      const v = routineLoad(b, w, d).total;
      blockVol += v;
      if (w === wk) {
        weekVol += v;
        const cell = cellKey(b.id, w, d.routine);
        // All matches: the body routine-volume line AND the collapsed summary's figure.
        document.querySelectorAll('[data-vol-cell="' + cell + '"]')
          .forEach((el) => { el.textContent = fmt(v) + " kg"; });
        // Progressive-overload delta vs the same routine last week — patched here too so it
        // tracks live edits, alongside both views' totals (same data-vol-delta on each).
        const prev = previousRoutineTotal(b, w, d);
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

// The Nutrition card: the week / block kcal + macro totals and an avg kcal/day line.
// The per-routine food breakdown moved into each routine card's Nutrition tab (renderRoutineFood);
// this card keeps only the roll-ups — the one place to read how the week is tracking.
function renderNutrition() {
  const card = document.getElementById("nutrition-card");
  if (!card) return;
  const block = currentBlock();
  const wk = state.ui.week;
  const week = nutritionTotals(block, [wk]);
  const all = nutritionTotals(block, ALL_WEEKS);
  const perDay = (t) => (t.kcalDays ? fmt(t.kcal / t.kcalDays) + " kcal/day" : "—");
  const totalLine = (label, t) =>
    '<div class="nut-total-line"><span class="nut-total-label">' + label + "</span> " +
    '<span data-nut-line="' + label.toLowerCase() + '">' + nutritionLine(t) + "</span></div>";
  card.innerHTML =
    "<h2>Nutrition</h2>" +
    '<p class="muted small">Log food per day on each day card’s <strong>Nutrition</strong> tab.</p>' +
    '<div class="nut-totals">' + totalLine("Week", week) + totalLine("Block", all) + "</div>" +
    '<p class="nut-avg muted small">Avg ' + perDay(week) + " this week · " + perDay(all) + " this block</p>";
}

// NUTRIENTS as a row of number inputs. `value(n)` prefills the field (edit forms) or is
// omitted (add forms, blank); `per100g` switches the placeholder suffix + aria-label to
// per-100-gram wording. One builder for the add / quick-edit / Food-details forms — options
// object so the call sites self-document (no positional `null, true`).
function nutrientInputs({ value, per100g } = {}) {
  return NUTRIENTS.map((n) => {
    const v = value ? value(n) : "";
    return '<input type="number" inputmode="decimal" step="any" min="0" name="' + n.id +
      '" placeholder="' + esc(n.head) + (per100g ? " /100g" : "") +
      '" aria-label="' + esc(n.label) + (per100g ? " per 100 g" : " (" + esc(n.unit) + ")") + '"' +
      (v === "" ? "" : ' value="' + v + '"') + ">";
  }).join("");
}

// The grams portion input — one shared validation contract (step="any" so tenths submit,
// PR #21), used by both the finder pick form and the in-place row edit so the two can't
// drift apart on it again (this bug was a per-call-site step). Mirrors nutrientInputs.
function gramsInput(value) {
  return '<input type="number" inputmode="decimal" step="any" min="0" name="grams" value="' + value + '" aria-label="Grams">';
}

// One logged food row: name + portion/own numbers + the full macro line, plus its in-place
// editors. A pantry row edits grams (logReplaceAt, barcode preserved) and can correct the
// *food's* nutrition (→ trusted, propagates — ADR-0004); a quick row edits its own numbers.
function foodItemHTML(e, i, cell) {
  const n = entryNutrition(e);
  const food = e.barcode ? state.pantry[e.barcode] : null;
  const name = e.barcode ? ((food && food.name) || e.barcode) : (e.name || "Quick entry");
  // Grams shown without rounding (a 12.5 g portion must read "12.5 g", not "13 g") —
  // toLocaleString keeps up to 3 decimals + thousands separators. Macros below stay
  // rounded via fmt (the precise typed values still drive the maths; only the roll-up rounds).
  const detail = e.barcode ? ' <span class="food-detail">' + (parseFloat(e.grams) || 0).toLocaleString() + " g</span>" : "";
  const macros = macroLine(n);
  const edit = e.barcode
    ? '<button class="link food-edit-btn" type="button" data-action="food-grams-edit" aria-label="Edit grams" title="Edit grams">✎ g</button>' +
      '<button class="link food-edit-btn" type="button" data-action="food-edit" data-barcode="' + esc(e.barcode) + '" aria-label="Correct nutrition" title="Correct nutrition">✎ kcal</button>' +
      '<form class="food-grams-edit-form" hidden data-cell="' + cell + '" data-i="' + i + '">' +
        gramsInput(parseFloat(e.grams) || 0) +
        '<span class="food-grams-unit">g</span><button type="submit">Save</button>' +
        '<button type="button" class="link" data-action="food-edit-cancel">Cancel</button>' +
      "</form>"
    : '<button class="link food-edit-btn" type="button" data-action="food-quick-edit" aria-label="Edit entry">✎</button>' +
      '<form class="food-quick-edit-form" hidden data-cell="' + cell + '" data-i="' + i + '">' +
        '<input name="name" placeholder="Food (optional)" autocomplete="off" value="' + esc(e.name || "") + '">' +
        nutrientInputs({ value: (nt) => parseFloat(e[nt.id]) || 0 }) +
        '<div class="form-actions"><button type="submit">Save</button>' +
        '<button type="button" class="link" data-action="food-edit-cancel">Cancel</button></div>' +
      "</form>";
  return '<li class="food-item"><span class="food-text">' +
    '<span class="food-name">' + esc(name) + "</span>" + detail +
    ' <span class="food-kcal">' + fmt(n.kcal) + " kcal</span>" +
    (macros ? ' <span class="food-macros">' + macros + "</span>" : "") + "</span>" +
    edit +
    '<button class="remove" type="button" data-action="food-remove" data-cell="' + cell + '" data-i="' + i + '" aria-label="Remove food">×</button></li>';
}

// One routine's food block — its list of entries, the derived routine total, and the add finder
// (search / barcode / scan / Pantry pick / quick entry). Lives in the routine card's
// Nutrition tab; the container carries data-cell so the food handlers resolve the cell.
// A pantry entry shows its Food's name + grams; a quick entry shows its name.
function renderRoutineFood(cell) {
  const list = logList(foodKey(cell));
  const items = list.map((e, i) => foodItemHTML(e, i, cell)).join("");
  return '<div class="food" data-cell="' + cell + '">' +
    (list.length ? '<ul class="food-list">' + items + "</ul>" : "") +
    (list.length ? '<div class="food-total">' + nutritionLine(routineNutrition(cell)) + "</div>" : "") +
    '<div class="food-add">' +
      '<button class="link food-add-btn" type="button" data-action="food-open">＋ Add food</button>' +
      '<div class="food-finder" hidden>' +
        '<div class="food-search-row">' +
          '<input class="food-search" data-fh="food-search" placeholder="Search foods or barcode…" autocomplete="off" aria-label="Search foods or enter a barcode">' +
          '<button type="button" data-action="food-find">Find</button>' +
          // Camera scan is native-BarcodeDetector only (Chrome/Android) — the button is
          // drawn solely where the API exists, so it's deliberately absent elsewhere
          // (ADR-0003); the search / barcode-type / Pantry / quick-entry paths stand alone.
          (scanSupported() ? '<button type="button" class="food-scan-btn" data-action="food-scan" aria-label="Scan a barcode with the camera">Scan</button>' : "") +
        "</div>" +
        '<ul class="food-results"></ul>' +
        // Live camera preview, revealed by Scan: the <video> the scanner decodes against
        // plus a Cancel. playsinline + muted so a phone autoplays it inline.
        '<div class="food-scanner" hidden>' +
          '<video class="scan-video" playsinline muted></video>' +
          '<button type="button" class="link food-scan-cancel" data-action="food-scan-cancel">Cancel</button>' +
        "</div>" +
        '<div class="food-quick">' +
          '<button type="button" class="link" data-action="form-open">Quick entry (no barcode)</button>' +
          '<form class="food-quick-form" hidden>' +
            '<input name="name" placeholder="Food (optional)" autocomplete="off">' +
            nutrientInputs() +
            '<div class="form-actions"><button type="submit">Add</button>' +
            '<button type="button" class="link" data-action="form-cancel">Cancel</button></div>' +
          "</form>" +
        "</div>" +
        '<button type="button" class="link food-close" data-action="food-close">Close</button>' +
      "</div>" +
    "</div>" +
    // The Food details form (author / correct) — one per food block, revealed and prefilled
    // by openFoodDetail; Save writes a trusted Food to the Pantry (ADR-0004 amendment).
    '<form class="food-detail-form" hidden data-cell="' + cell + '">' +
      '<p class="food-detail-head muted small">Nutrition per 100 g — straight off the label.</p>' +
      '<input name="name" placeholder="Name" autocomplete="off">' +
      '<input name="brand" placeholder="Brand (optional)" autocomplete="off">' +
      nutrientInputs({ per100g: true }) +
      '<div class="form-actions"><button type="submit">Save</button>' +
      '<button type="button" class="link" data-action="food-edit-cancel">Cancel</button></div>' +
    "</form>" +
    "</div>";
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
        '<span class="food-result-meta">' + (f.brand ? esc(f.brand) + " · " : "") + fmt(f.per100g.kcal) + " kcal" +
          (macroLine(f.per100g) ? " · " + macroLine(f.per100g) : "") + " /100g</span>" +
      "</button>" +
      // ✎ corrects this food's numbers (→ trusted) before logging — ADR-0004 amendment.
      '<button type="button" class="link food-edit-btn" data-action="food-edit" data-barcode="' + esc(f.barcode) + '" aria-label="Edit nutrition">✎</button>' +
      '<form class="food-grams-form" hidden data-barcode="' + esc(f.barcode) + '">' +
        gramsInput(100) +
        '<span class="food-grams-unit">g</span><button type="submit">Add</button>' +
      "</form>" +
    "</li>"
  ).join("");
}

// Compact one-line nutrition figure shared by the routine total and the Week / Block totals:
// "1850 cal · 77c / 45f / 154p". Macros use their id initial (c/f/p); kcal leads. Reads
// a { kcal, carb, fat, protein } object (routineNutrition / nutritionTotals).
function nutritionLine(n) {
  const macros = macroLine(n);
  return fmt(n.kcal) + " cal" + (macros ? " · " + macros : "");
}
// Just the macros ("65c / 17f / 4p"), kcal omitted — id initials (c/f/p). Shared so the
// routine total, the per-entry rows, and the pick cards format macros identically.
function macroLine(n) {
  return NUTRIENTS.filter((x) => x.id !== "kcal").map((x) => fmt(n[x.id]) + x.id[0]).join(" / ");
}

// Reflect the log onto the existing #week-view DOM without rebuilding it: every
// data-k input, plus the per-cell routine flags on each .routine (completion styling, collapse
// state + its caret, and the active tab — all absent-or-set flags on the cell). Because
// it patches in place, afterDone can re-sync through here and still animate the
// collapse. Exported so afterDone reuses this one reflect path rather than
// hand-mirroring it. Runs after each renderWeek too (a no-op vs the fresh markup).
export function hydrate() {
  document.querySelectorAll("#week-view [data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (el.dataset.type === "check") el.checked = !!state.log[k];
    else el.value = state.log[k] != null ? state.log[k] : "";
  });
  document.querySelectorAll("#week-view .routine[data-cell]").forEach((routineEl) => {
    const cell = routineEl.dataset.cell;
    routineEl.classList.toggle("is-done", !!state.log[cell + ".done"]);
    const collapsed = !!state.log[cell + ".collapsed"];
    routineEl.classList.toggle("is-collapsed", collapsed);
    const chevron = routineEl.querySelector(".routine-collapse");
    if (chevron) chevron.setAttribute("aria-expanded", String(!collapsed));
    // Active tab: another absent-or-set per-cell flag (absent = Workout). CSS shows the
    // matching panel off this class; mirror the buttons' aria-selected for a11y.
    const nutrition = state.log[cell + ".tab"] === "nutrition";
    routineEl.classList.toggle("tab-nutrition", nutrition);
    routineEl.querySelectorAll(".routine-tab").forEach((b) =>
      b.setAttribute("aria-selected", String((b.dataset.tab === "nutrition") === nutrition)));
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

function populatePicker(picker, routine, query) {
  // Only offer exercises whose type matches the routine's kind, so a circuit can't
  // be added to a strength routine (or vice versa). The Holiday Workout is band-only
  // (its skip relies on banded moves carrying no cross-routine history — ADR-0002), so
  // its picker is further narrowed to banded moves. (Create-new isn't constrained;
  // see the ADR caveat — adding a non-banded move there is the user's own choice.)
  const type = kindType(routineDef(routine).kind);
  renderPickList(picker, state.library, routineDef(routine).exercises.map((p) => p.id), query, (ex) =>
    '<button class="pick" type="button" data-action="add-ex" data-routine="' + routine + '" data-ex="' + ex.id + '">' +
    esc(ex.name) + ' <span class="tag">' + (ex.type === "circuit" ? "circuit" : esc(ex.targetReps || "")) + "</span></button>",
    (ex) => ex.type === type && (routine !== "holiday" || ex.banded));
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
  else populatePicker(picker, parseRoutine(zone.dataset.routine), query);
}
