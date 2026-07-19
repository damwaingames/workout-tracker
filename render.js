/* Rendering: turns the store into DOM. Reads `state`/`editing` plus the queries
 * from state.js and the pure helpers; never mutates the store. The exported
 * entry points (render + the focus-preserving live patchers) are what events.js
 * calls after a mutation. */

import { WEEKS, ALL_WEEKS, MIN_SETS, MAX_SETS, DEFAULT_SETS, LOAD_MODES, BANDS } from "./constants.js";
import {
  cellKey, setKey, roundKey, roundRepKey, bandKey, measureKey, cellScalarKey,
  circuitOf, circuitSummary, circuitTimeLabel, steadyOf, classOf, loadMode, repsLabel, bandFor, parseRoutine, scheduledDate, fmtWeekday, esc, fmt,
} from "./helpers.js";
import {
  state, editing,
  currentBlock, currentBlockIndex, routineDef, weekSchedule,
  previousSets, effectiveSets, effectiveRounds, routineLoad, holidaySwap, previousRoutineTotal, previousSteady, previousMeasure, bmiFor,
  classTotals, classTypeNames,
} from "./state.js";

export function render() { renderHeader(); renderWeek(); renderProgress(); renderVolumes(); renderMeasurements(); renderClassTotal(); }

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
    // Block start date (the Monday weekdays derive from) — editable in Edit mode; a free
    // date (no snap), so a midweek start is representable (ADR-0005).
    (editing ? '<label class="block-start-l">Block starts <input type="date" id="block-start-input" class="block-start-input" value="' + esc(block.startDate) + '" aria-label="Block start date"></label>' : "") +
    // Shared autocomplete list of known class types — a class routine's Edit-mode type input
    // references this by id. The names are derived (seeds ∪ class routines in use — classTypeNames).
    '<datalist id="class-types">' + classTypeNames().map((n) => '<option value="' + esc(n) + '">').join("") + "</datalist>" +
    (editing ? renderHolidayEdit() : "") +
    (editing ? renderWinddownEdit() : "") +
    weekSchedule(block, wk).map((n, i) => {
      // weekSchedule yields a bijection over block.routines, so find always hits.
      const d = block.routines.find((r) => r.routine === n);
      return renderRoutine(block, d, wk, i);
    }).join("");
  hydrate();
}

function renderRoutine(block, d, wk, position) {
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
  else if (ed.kind === "steady") body = renderSteady(ed, wk, cell);
  else if (ed.kind === "class") body = renderClass(ed, wk, cell);
  else body = renderRest(cell);

  // A rest routine is only its note — no session extras. Every other kind gets the session block:
  // the felt-intensity Session RPE (ADR-0012), the Edit-mode add-zone (never on class — ADR-0010),
  // and the view-mode shared wind-down (ADR-0013). Named once so "rest has no session" lives in one
  // place, not re-derived on three adjacent lines.
  const sessionExtras = ed.kind === "rest" ? "" :
    renderSessionRpe(cell, "rpe", "Session RPE") +
    (editing && ed.kind !== "class" && !holiday ? renderAddZone(d) : "") +
    (!editing ? renderWinddown(cell) : "");

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
      '<div class="routine-body">' + body + "</div>" +
      sessionExtras +
    "</div></div>" +
    "</div>";
}

// The collapsed routine's one-line totals (CSS-hidden while expanded). Strength routines
// show tonnage; recovery routines show the circuit's estimated total time, plus tonnage
// when a banded move makes the routine load-bearing; steady shows minutes + resistance; a
// class shows its type, minutes + logged burn. Empty (no line) for a rest routine with nothing logged.
function routineSummary(block, d, wk, cell) {
  const bits = [];
  // The volume figure carries the SAME data-vol-cell as the body's routine-volume line,
  // so renderVolumes patches both (querySelectorAll) on every volume-affecting edit.
  // They are two views of one routineLoad().total and must never be patched independently
  // — collapse then just reveals an already-fresh number, no work in toggleRoutine/afterDone.
  const volBit = (total) => 'Volume <strong data-vol-cell="' + cell + '">' + fmt(total) + ' kg</strong><span class="vol-delta" data-vol-delta="' + cell + '"></span>';
  if (d.kind === "recovery") {
    bits.push(circuitTimeLabel(d, effectiveRounds(cell, d)));
    const { total, loadBearing } = routineLoad(block, wk, d);
    if (loadBearing) bits.push(volBit(total));
  } else if (d.kind === "steady") {
    // Steady carries no tonnage; its line is the duration done (actual, else planned) + the
    // logged resistance/level — the two facts a collapsed steady day is worth showing.
    const mins = state.log[cellScalarKey(cell, "mins")], resist = state.log[cellScalarKey(cell, "resist")];
    bits.push((mins || steadyOf(d).durationMin) + " min" + (resist ? " · L" + esc(resist) : ""));
  } else if (d.kind === "strength") {
    bits.push(volBit(routineLoad(block, wk, d).total));
  } else if (d.kind === "class") {
    // A class carries no tonnage; its line is the type, the minutes done (actual, else planned)
    // and the wearable's logged burn if there is one (ADR-0010/0014).
    const c = classOf(d);
    const cmins = state.log[cellScalarKey(cell, "mins")] || c.durationMin;
    const kcal = parseFloat(state.log[cellScalarKey(cell, "kcal")]);
    bits.push((c.classType ? esc(c.classType) + " · " : "") + cmins + " min" + (kcal > 0 ? " · ~" + fmt(kcal) + " kcal" : ""));
  }
  // Session RPE (ADR-0012): the day's felt intensity, echoed here so a collapsed routine still
  // shows how hard it was. A logged record, not a total — shown only once entered.
  const rpe = state.log[cellScalarKey(cell, "rpe")];
  if (rpe) bits.push("RPE " + esc(rpe));
  return bits.length ? '<div class="routine-summary">' + bits.join(" · ") + "</div>" : "";
}

// A class routine: a scheduled group class (Box-Fit, Pilates) — no Library exercise, just a
// class type + planned duration (ADR-0010). Per session it logs actual minutes, the wearable's
// calorie burn (typed, not modeled — ADR-0014), and a free-text note (what you did). Not
// load-bearing and not progression-tracked — a class is conditioning you show up to. The mins /
// calories inputs carry data-refresh="classes" so the header Classes total re-patches live.
function renderClass(d, wk, cell) {
  const c = classOf(d);
  return '<div class="class-session" data-cell="' + cell + '">' +
      '<div class="ex-head"><span class="ex-name" data-class-name="' + cell + '">' + (c.classType ? esc(c.classType) : "No class set") + "</span>" +
      '<span class="ex-target" data-class-target="' + cell + '">Target ' + c.durationMin + " min</span></div>" +
    "</div>" +
    '<div class="class-log">' +
      '<label class="inline">Minutes<input type="number" inputmode="numeric" min="0" data-k="' + cellScalarKey(cell, "mins") + '" data-type="text" data-refresh="classes" placeholder="' + c.durationMin + '"></label>' +
      '<label class="inline">Calories<input type="number" inputmode="numeric" min="0" data-k="' + cellScalarKey(cell, "kcal") + '" data-type="text" data-refresh="classes" placeholder="kcal"></label>' +
      '<label class="inline class-note-l">Notes<input type="text" data-k="' + cellScalarKey(cell, "note") + '" data-type="text" placeholder="What you did"></label>' +
    "</div>" +
    (editing ? renderClassEdit(d) : "");
}

// Edit-mode class controls: the class type (a name, autocompleted from the shared class-types
// list) and the planned duration. Both live on the routine template; changing either live-patches
// the session card (patchClass) so a text input keeps focus mid-type (mirrors renderSteadyEdit).
function renderClassEdit(d) {
  const c = classOf(d);
  return '<div class="circuit-edit">' +
    '<label class="circuit-field-l">Class ' +
      '<input type="text" list="class-types" class="class-type-field" data-fh="class-field" data-routine="' + d.routine + '" data-field="classType" value="' + esc(c.classType) + '" placeholder="e.g. Box-Fit"></label>' +
    '<label class="circuit-field-l">Duration ' +
      '<input type="number" inputmode="numeric" min="1" class="circuit-field" data-fh="class-field" data-routine="' + d.routine + '" data-field="durationMin" value="' + c.durationMin + '">min</label>' +
    "</div>";
}

// Live-patch a class routine's session card (name + target) when its type or duration changes in
// Edit mode, keeping the input focused mid-type. Patches via dedicated data-class-name /
// data-class-target hooks (not by position in the borrowed .ex-head), mirroring patchSteadyTime.
export function patchClass(d) {
  const cell = cellKey(currentBlock().id, state.ui.week, d.routine);
  const c = classOf(d);
  const name = document.querySelector('[data-class-name="' + cell + '"]');
  const target = document.querySelector('[data-class-target="' + cell + '"]');
  if (name) name.textContent = c.classType || "No class set";
  if (target) target.textContent = "Target " + c.durationMin + " min";
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

// The wind-down as it appears under a training day (ADR-0013): the shared mobility checklist
// (defined once in renderWinddownEdit) plus a per-cell done-tick. A reminder + a tick — the
// moves aren't logged and count toward no total. Nothing shows until moves are set in Edit mode.
function renderWinddown(cell) {
  const names = state.winddown.exercises.map((p) => state.library[p.id]).filter(Boolean).map((ex) => esc(ex.name));
  if (!names.length) return "";
  return '<div class="winddown" data-cell="' + cell + '">' +
    '<label class="winddown-done"><input type="checkbox" data-k="' + cellScalarKey(cell, "winddown") + '" data-type="check">' +
      '🧘 Wind-down · ' + state.winddown.durationMin + " min</label>" +
    '<div class="winddown-moves">' + names.join(" · ") + "</div>" +
    // The wind-down carries its own Session RPE (ADR-0012), logged separately from the day's
    // main session (typically much lower — a cool-down, not the workout).
    renderSessionRpe(cell, "wdrpe", "RPE") +
    "</div>";
}

// A Session RPE input (ADR-0012): a 1–10 fatigue score for how hard the session felt today,
// logged per cell under `field`. A record only — no data-refresh, and read by no progression
// scan. Reused for a routine's own session (field "rpe") and the wind-down's ("wdrpe").
function renderSessionRpe(cell, field, label) {
  return '<label class="inline session-rpe">' + esc(label) +
    '<input type="number" inputmode="numeric" min="1" max="10" data-k="' + cellScalarKey(cell, field) + '" data-type="text" placeholder="1–10"></label>';
}

// Edit-mode editor for the shared Wind-down (ADR-0013) — one definition shown under every
// non-rest day, edited once here. The move rows (name + how-to + remove) and the mobility picker
// reach state.winddown through the "winddown" sentinel (routineDef); the duration is a target.
// The per-day done-tick lives on each routine card, not here.
function renderWinddownEdit() {
  const wd = state.winddown;
  const moves = wd.exercises.map((p) => {
    const ex = state.library[p.id];
    return ex ? activityCard({ kind: "mobility", routine: "winddown" }, ex, "") : "";
  }).join("");
  return '<div class="winddown-edit">' +
    '<h2 class="winddown-edit-h">🧘 Wind-down</h2>' +
    '<p class="muted small">A short cool-down shown under every training day — the same stretches, ticked off per day. Edit it once here.</p>' +
    '<div class="circuit-edit">' +
      '<label class="circuit-field-l">Duration ' +
      '<input type="number" inputmode="numeric" min="1" class="circuit-field" data-fh="winddown-field" value="' + wd.durationMin + '">min</label>' +
    "</div>" +
    '<div class="routine-body">' + moves + "</div>" +
    renderAddZone({ kind: "mobility", routine: "winddown" }) +
    "</div>";
}

// The header's Classes line (week + block: minutes, plus the wearable's logged burn). Shown
// only once a class logs minutes or calories so it doesn't clutter an empty header. Parallels
// the Volume line; exported so a live minutes/calories edit can re-patch it without a full render.
export function renderClassTotal() {
  const el = document.getElementById("class-total");
  if (!el) return;
  const b = currentBlock();
  const week = classTotals(b, [state.ui.week]);
  const block = classTotals(b, ALL_WEEKS);
  const part = (t) => "<strong>" + fmt(t.mins) + " min</strong>" + (t.kcal > 0 ? " · <strong>~" + fmt(t.kcal) + " kcal</strong>" : "");
  el.innerHTML = (week.mins || block.mins || week.kcal || block.kcal)
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
    const sets = effectiveSets(cell, place); // this week's count (per-week override, else template)
    const tmpl = place.sets || DEFAULT_SETS; // block-wide template, for the "all weeks" affordance
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
        // Per-week override active (differs from the template) → offer to apply it to every week.
        (sets !== tmpl ? '<button class="apply-all" type="button" data-action="sets-all" data-routine="' + d.routine + '" data-ex="' + exId + '">all weeks</button>' : "") +
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
  const rounds = effectiveRounds(cell, d); // per-week round count drives the checkbox / reps count per move
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
    return activityCard(d, ex, (editing ? '<div class="sets-edit">' + loadingEdit(d, ex) + "</div>" : "") + inner);
  }).join("");
  // Recovery routines are usually load-free; the routine-volume line shows only once a
  // banded move makes the routine load-bearing (so pure-cardio routines stay uncluttered).
  const { total, loadBearing } = routineLoad(currentBlock(), wk, d);
  const volLine = loadBearing ? volumeLine(cell, total) : "";
  return moves +
    (editing ? renderCircuitEdit(d, cell) : "") +
    volLine +
    '<div class="recovery-meta">' +
      '<label class="inline">Energy (1–10)<input type="number" min="1" max="10" data-k="' + cell + '.energy" data-type="text"></label>' +
      '<span class="circuit-note" data-circuit-cell="' + cell + '">' + esc(circuitSummary(d, rounds)) + "</span>" +
    "</div>";
}

// Edit-mode circuit controls: a rounds stepper (re-renders, since it changes
// the R-checkbox count) plus work / rest / round-rest second inputs (live patch).
function renderCircuitEdit(d, cell) {
  const c = circuitOf(d);
  const rounds = effectiveRounds(cell, d); // per-week override else the template
  const secField = (field, label, val) =>
    '<label class="circuit-field-l">' + label +
    ' <input type="number" inputmode="numeric" min="0" class="circuit-field" data-fh="circuit-field" data-routine="' + d.routine + '" data-field="' + field + '" value="' + val + '">s</label>';
  return '<div class="circuit-edit">' +
    '<div class="rounds-edit">Rounds ' +
      '<button class="step" type="button" data-action="rounds-dec" data-routine="' + d.routine + '" aria-label="Fewer rounds">−</button>' +
      '<span class="sets-count">' + rounds + "</span>" +
      '<button class="step" type="button" data-action="rounds-inc" data-routine="' + d.routine + '" aria-label="More rounds">＋</button>' +
      // Per-week round override active → offer to apply it to every week (work/rest secs stay block-wide).
      (rounds !== c.rounds ? '<button class="apply-all" type="button" data-action="rounds-all" data-routine="' + d.routine + '">all weeks</button>' : "") +
    "</div>" +
    secField("workSec", "Work", c.workSec) +
    secField("restSec", "Rest", c.restSec) +
    secField("roundRestSec", "Round rest", c.roundRestSec) +
    "</div>";
}

// Live-patch a recovery routine's summary line when its work/rest seconds change,
// so the second input keeps focus mid-type (rounds re-render via the stepper).
export function patchCircuitTime(d) {
  const cell = cellKey(currentBlock().id, state.ui.week, d.routine);
  const el = document.querySelector('[data-circuit-cell="' + cell + '"]');
  if (el) el.textContent = circuitSummary(d, effectiveRounds(cell, d));
}

function renderRest(cell) {
  return '<p class="rest-note">No structured exercise — focus on hydration, nutrition, and muscle repair.</p>' +
    '<label class="inline block">How your joints / knees feel<input type="text" data-k="' + cellScalarKey(cell, "joints") + '" data-type="text" placeholder="e.g. knees happy, left wrist a little tight"></label>';
}

// A steady routine: cardio activity card(s) with their how-to, then a single per-session log
// — actual minutes + the machine's resistance/level — against the planned duration. Not
// load-bearing (the effort target is the routine's focus); the "Last:" ghost (resistance ·
// minutes) is its progression prompt, since a steady routine carries no tonnage (CONTEXT "Steady").
function renderSteady(d, wk, cell) {
  const dur = steadyOf(d).durationMin;
  const ex = d.exercises[0] && state.library[d.exercises[0].id]; // a steady routine holds one activity
  const levels = ex && ex.levels;
  const prev = previousSteady(currentBlock(), wk, d);
  const ghost = prev
    ? '<div class="last">Last: ' + (prev.resist ? "L" + esc(prev.resist) + " · " : "") + esc(prev.mins || "—") + " min</div>"
    : "";
  return (ex ? activityCard(d, ex, "") : '<p class="muted small">No activity set — add one in Edit mode.</p>') +
    '<div class="steady-log">' +
      '<span class="steady-target" data-steady-cell="' + cell + '">Target ' + dur + " min</span>" +
      '<label class="inline">Minutes<input type="number" inputmode="numeric" min="0" data-k="' + cellScalarKey(cell, "mins") + '" data-type="text" placeholder="' + dur + '"></label>' +
      '<label class="inline">Resistance' + (levels ? " /" + levels : "") + '<input type="number" inputmode="numeric" min="0"' + (levels ? ' max="' + levels + '"' : "") + ' data-k="' + cellScalarKey(cell, "resist") + '" data-type="text"></label>' +
    "</div>" + ghost +
    (editing ? renderSteadyEdit(d) : "");
}

// A non-strength move's display card — name + how-to (setup behind ⓘ) + any intrinsic cue —
// shared by steady activities and recovery circuit moves so both surface the coaching the old
// circuit renderer dropped. `inner` is the kind-specific body (rounds/band for recovery; empty
// for steady, whose logging is cell-level).
function activityCard(d, ex, inner) {
  return '<div class="exercise ' + (d.kind === "steady" ? "steady-move" : "circuit") + '" data-ex="' + ex.id + '">' +
    '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
      (ex.setup ? ' <button class="info" type="button" data-action="toggle-setup" aria-label="How to do this">ⓘ</button>' : "") +
      (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-routine="' + d.routine + '" data-ex="' + ex.id + '" aria-label="Remove">×</button>' : "") +
    "</div>" +
    (ex.setup ? '<div class="setup">' + esc(ex.setup) + "</div>" : "") +
    (ex.cue ? '<div class="cue">' + esc(ex.cue) + "</div>" : "") +
    (inner || "") +
    "</div>";
}

// Edit-mode steady control: the planned duration (minutes). Live-patches the target text so
// the input keeps focus while typing (mirrors the circuit work/rest fields).
function renderSteadyEdit(d) {
  return '<div class="circuit-edit">' +
    '<label class="circuit-field-l">Duration ' +
    '<input type="number" inputmode="numeric" min="1" class="circuit-field" data-fh="steady-field" data-routine="' + d.routine + '" value="' + steadyOf(d).durationMin + '">min</label>' +
    "</div>";
}

// Live-patch a steady routine's target line when its duration changes, keeping the input
// focused mid-type (mirrors patchCircuitTime).
export function patchSteadyTime(d) {
  const el = document.querySelector('[data-steady-cell="' + cellKey(currentBlock().id, state.ui.week, d.routine) + '"]');
  if (el) el.textContent = "Target " + steadyOf(d).durationMin + " min";
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

// The picker's per-surface labels — one row per placement surface, so adding a surface is a row
// here rather than a new arm on four parallel ternaries. `recovery` is the fallback (circuit
// moves). The only genuinely kind-specific part left — strength's reps+sets fields — stays an
// explicit branch in renderAddZone; everything else a placement surface differs by is just copy.
const ADD_ZONE = {
  strength: { add: "＋ Add exercise", search: "Search strength exercises…", create: "＋ Create a new exercise", noun: "Exercise", submit: "Add to day" },
  steady:   { add: "＋ Add activity", search: "Search cardio…",             create: "＋ Create a new activity", noun: "Activity", submit: "Add to day" },
  mobility: { add: "＋ Add stretch",  search: "Search stretches…",          create: "＋ Create a new stretch",  noun: "Stretch",  submit: "Add to wind-down" },
  recovery: { add: "＋ Add move",     search: "Search circuit moves…",      create: "＋ Create a new move",     noun: "Move",     submit: "Add to day" },
};

function renderAddZone(d) {
  // The surface fixes how a placed move is logged, so there's no type picker — only the labels
  // and (for strength) the extra reps+sets fields differ. A move's contexts gate which surfaces
  // will accept it (ADR-0011).
  const z = ADD_ZONE[d.kind] || ADD_ZONE.recovery;
  return pickerZone({
    kind: "exercise",
    routine: d.routine,
    addLabel: z.add,
    searchPlaceholder: z.search,
    createLabel: z.create,
    submitLabel: z.submit,
    formFields:
      '<input name="name" placeholder="' + z.noun + ' name" required>' +
      '<input name="setup" placeholder="How-to / setup (optional)">' +
      (d.kind === "strength"
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
  // Only offer exercises whose contexts include the routine's kind, so a recovery-only move
  // can't be added to a strength routine (or vice versa) — validity follows the exercise,
  // behaviour the routine (ADR-0007). The Holiday Workout is band-only (its skip relies on
  // banded moves carrying no cross-routine history — ADR-0002), so its picker is further
  // narrowed to banded moves. (Create-new isn't constrained; see the ADR caveat — adding a
  // non-banded move there is the user's own choice.)
  const kind = routineDef(routine).kind;
  renderPickList(picker, state.library, routineDef(routine).exercises.map((p) => p.id), query, (ex) =>
    '<button class="pick" type="button" data-action="add-ex" data-routine="' + routine + '" data-ex="' + ex.id + '">' +
    // Chip: a multi-context move shows its validity-set (the cross-kind capability is the
    // point), a single-context one its rep target (else its lone context) — PR #23 note 2.
    esc(ex.name) + ' <span class="tag">' + esc(ex.contexts.length > 1 ? ex.contexts.join(" · ") : (ex.targetReps || ex.contexts[0])) + "</span></button>",
    (ex) => ex.contexts.includes(kind) && (routine !== "holiday" || ex.banded));
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
