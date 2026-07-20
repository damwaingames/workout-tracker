/* Rendering: turns the store into DOM. Reads `state`/`editing` plus the queries from state.js and
 * the pure helpers; never mutates the store. The exported entry points (render + the measurement
 * live-patchers) are what events.js calls after a mutation.
 *
 * The block renders as a real-calendar week grid (#43); each Session Item is loggable (#44) — its
 * planned rounds are input slots that read from / write to the exercise's Performances (ADR-0020, the
 * effort lives on the exercise, not the log). In Edit mode each routine card delegates to compose.js
 * to author the plan (#45). The Library shows each exercise's timeline + PRs. Measurements, notes,
 * footer are untouched infra. */

import {
  esc, fmt, fmtVolume, fmtLoad, fmtRail, zoneLabel, scheduledDate, fmtWeekday, measureKey,
  itemLogMode, loadMode, repsLabel,
} from "./helpers.js";
import { BAND_TIERS, DEFAULT_BAND_TIER } from "./constants.js";
import {
  state, editing,
  currentBlock, currentBlockIndex, libraryList, classList, performancesOf, performanceAt, prsOf,
  previousMeasure, bmiFor,
} from "./state.js";
import { renderEditRoutine, renderBlockConfig } from "./compose.js";

export function render() { renderTabs(); renderHeader(); renderWeek(); renderLibrary(); renderMeasurements(); applyView(); }

// Top-level view switch (Plan | Library). The Library grew large enough to want its own tab rather
// than hanging below the plan; the choice persists in state.ui.view (normalise owns the invariant
// that it's always "plan" | "library", so readers here just trust it). This is the nav scaffold the
// week grid and later views slot into — each is a sibling container toggled below.
function renderTabs() {
  const el = document.getElementById("view-tabs");
  if (!el) return;
  const v = state.ui.view;
  const tab = (id, label) => '<button class="view-tab' + (v === id ? " active" : "") + '" data-action="view" data-view="' + id + '" aria-pressed="' + (v === id) + '">' + label + "</button>";
  el.innerHTML = tab("plan", "Plan") + tab("library", "Library");
}
// Show only the active view's container. Membership is structural — Plan-scoped sections live inside
// #plan-view (block controls, week nav, plan overview, measurements, notes), the Library is its own
// section, and the footer (backups) sits outside both, so it stays on every view.
function applyView() {
  const lib = state.ui.view === "library";
  document.getElementById("plan-view").hidden = lib;
  document.getElementById("library-card").hidden = !lib;
}

function renderHeader() {
  const sel = document.getElementById("block-select");
  sel.innerHTML = state.blocks
    .map((b) => '<option value="' + b.id + '"' + (b.id === state.ui.block ? " selected" : "") + ">" + esc(b.name) + "</option>")
    .join("");
  const et = document.getElementById("edit-toggle");
  et.textContent = editing ? "Done" : "Edit";
  et.classList.toggle("active", editing);

  const block = currentBlock();
  let html = "";
  for (let w = 1; w <= block.weeks; w++) {
    html += '<button data-action="week" data-week="' + w + '" class="week-btn' + (w === state.ui.week ? " active" : "") + '">Week ' + w + "</button>";
  }
  // Deleting a block is a plan-only delete now (performances survive — ADR-0020), offered in Edit.
  if (editing && state.blocks.length > 1) {
    html += '<button data-action="delete-block" class="week-btn danger">Delete block</button>';
  }
  document.getElementById("week-nav").innerHTML = html;
}

/* ---------------------------------------------------------------------- *
 * The week grid (#43) + Session logging (#44).                           *
 * ---------------------------------------------------------------------- */
// The viewed block week renders as a real calendar week (ADR-0024): its seven weekdays anchored to
// the block's start date, every day drawn, an empty day shown as Rest so the week reads true. A
// Session's Items are loggable — each planned round is an input slot recording a Performance on the
// exercise (ADR-0020); a Class shows its type + planned duration (Class logging is #50).
function renderWeek() {
  const block = currentBlock();
  const wk = Math.min(state.ui.week, block.weeks);
  const nameHtml = editing
    ? '<input type="text" id="block-name-input" class="block-name-input" value="' + esc(block.name) + '" placeholder="Block name" aria-label="Block name" maxlength="40">'
    : esc(block.name);
  const note = editing
    ? '<p class="muted small readonly-note edit-hint">Compose the week — switch a day between Session / Class / Rest, add Groups and exercises, set rounds &amp; rests, and reorder the days.</p>'
    : '<p class="muted small readonly-note">Log your sets, rounds, and steady work below as you train — or hit Edit to compose the plan.</p>';
  document.getElementById("week-view").innerHTML =
    '<p class="week-heading">' + nameHtml + " · Week " + wk + " of " + block.weeks + "</p>" +
    (editing ? renderBlockConfig(block) : "") + note +
    '<div class="week-grid">' +
    block.template.map((r, i) => (editing ? renderEditRoutine(block, r, wk, i) : renderRoutine(block, r, wk, i))).join("") +
    "</div>";
}

// One weekday's Routine as a grid card, headed by its real calendar Weekday date (ADR-0024).
function renderRoutine(block, r, wk, position) {
  const when = fmtWeekday(scheduledDate(block.startDate, wk, position));
  let title, body;
  if (r.kind === "class") {
    title = esc(classNameOf(r.classType));
    body = '<div class="routine-focus">Class · ' + esc(String(r.durationMin || "")) + " min</div>";
  } else if (r.kind === "session") {
    title = esc(r.title || "Session");
    body = (r.focus ? '<div class="routine-focus">' + esc(r.focus) + "</div>" : "") +
      '<div class="routine-body">' +
      (Array.isArray(r.groups) ? r.groups.map((g, gi) => renderGroup(g, gi, block.id, wk, position)).join("") : "") +
      "</div>";
  } else {
    title = "Rest";
    body = '<p class="rest-note">Rest day.</p>';
  }
  return '<div class="routine ' + r.kind + '">' +
    '<div class="routine-head"><span class="routine-when">' + when + "</span>" +
      '<span class="routine-title">' + title + "</span></div>" +
    body + "</div>";
}

const classNameOf = (id) => (state.classes[id] && state.classes[id].name) || id || "Class";

// A steady effort: one timed Item worked against a machine level (ADR-0019). The single definition
// of "steady" — the Group's kind, the Item's axis label, and its log inputs all read through the one
// itemLogMode classifier, so they can't drift.
function isSteadyItem(it) {
  return itemLogMode(it, state.library[it.exId]) === "steady";
}

// Which config of the one Group primitive this is (ADR-0019), for styling + the meta line. A
// multi-item Group is a superset (no rest-within) or a circuit (timed stations with rest between);
// a lone steady Item is a steady effort; anything else is straight sets.
function groupKind(g) {
  const items = g.items || [];
  if (items.length > 1) return g.restWithin > 0 ? "circuit" : "superset";
  return isSteadyItem(items[0]) ? "steady" : "straight";
}

// A Group card: its Items (each with its planned target + per-round log slots), then a meta line
// stating the rotation (rounds + the rests that make it a superset, circuit, steady, or straight).
function renderGroup(g, gi, blockId, wk, pos) {
  const kind = groupKind(g);
  const items = (g.items || []).map((it, ii) => renderItem(it, { block: blockId, week: wk, routine: pos, group: gi, item: ii, rounds: g.rounds, kind })).join("");
  const bits = [g.rounds + " round" + (g.rounds === 1 ? "" : "s")];
  if (kind === "steady") bits.push("steady");
  if (g.restWithin > 0) bits.push(fmt(g.restWithin) + "s within");
  else if (kind === "superset") bits.push("no rest (superset)");
  if (g.restAfter > 0) bits.push(fmt(g.restAfter) + "s after");
  return '<div class="group ' + kind + '"><div class="group-items">' + items + "</div>" +
    '<div class="group-meta muted small">' + bits.join(" · ") + "</div></div>";
}

// An Item: its planned target line (#43), then its log — one slot per planned round (ADR-0019).
function renderItem(it, c) {
  const ex = state.library[it.exId];
  const name = ex ? esc(ex.name) : esc(it.exId);
  let target = "";
  if (Array.isArray(it.rail)) target = fmtRail(it.rail) + " reps";
  else if (it.time != null) {
    target = fmtVolume({ type: "time", val: it.time });
    // A steady effort works against a machine level; the magnitude is a per-session progression
    // target (logged, not planned), so the plan just names the axis it's tracked on (ADR-0019).
    if (isSteadyItem(it)) target += " · machine level";
  }
  return '<div class="item">' +
    '<div class="item-head"><span class="item-name">' + name + "</span>" +
      (target ? '<span class="item-target">' + esc(target) + "</span>" : "") + "</div>" +
    renderItemLog(it, ex, c) + "</div>";
}

/* ---------------------------------------------------------------------- *
 * Logging an Item (#44) — a slot per planned round.                      *
 * ---------------------------------------------------------------------- */
// The Item's log: one input slot per planned round (a steady Item is a single round), each pre-filled
// from its own Performance (matched by ctx) so a reload re-hydrates what you logged. A slot with no
// Performance is an unlogged round — honest under-completion (ADR-0026).
function renderItemLog(it, ex, c) {
  const mode = itemLogMode(it, ex);
  if (!mode) return "";
  const rounds = mode === "steady" ? 1 : Math.max(1, c.rounds || 1);
  const slotWord = c.kind === "straight" ? "Set" : "Round";
  let rows = "";
  for (let round = 0; round < rounds; round++) {
    const ctx = { block: c.block, week: c.week, routine: c.routine, group: c.group, item: c.item, round };
    rows += renderSlot(it, ex, mode, ctx, mode === "steady" ? "" : slotWord + " " + (round + 1));
  }
  return '<div class="item-log">' + rows + "</div>";
}

// One round's slot: the full ctx baked into data-* so the input handler can find the Performance to
// upsert without re-deriving it, plus the mode-specific inputs pre-filled from any logged Performance.
function renderSlot(it, ex, mode, ctx, label) {
  const perf = performanceAt(it.exId, ctx);
  // The ctx is baked into data-* under the SAME names logField reads back (block/week/routine/
  // group/item/round), so the render→handler contract can't drift into a silent abbreviation.
  return '<div class="log-slot' + (perf ? " logged" : "") + '"' +
    ' data-ex="' + esc(it.exId) + '" data-mode="' + mode + '"' +
    ' data-block="' + esc(ctx.block) + '" data-week="' + ctx.week + '" data-routine="' + ctx.routine +
    '" data-group="' + ctx.group + '" data-item="' + ctx.item + '" data-round="' + ctx.round + '">' +
    (label ? '<span class="slot-n">' + esc(label) + "</span>" : "") +
    slotInputs(mode, ex, it, perf) + "</div>";
}

// The inputs a slot draws for its mode, pre-filled from a logged Performance (empty otherwise).
function slotInputs(mode, ex, it, perf) {
  switch (mode) {
    case "load-reps": {
      const m = loadMode(ex);
      return numInput("w", perf ? perf.load.mag : "", m.wUnit || "kg") + numInput("r", perf ? perf.volume.val : "", repsLabel(m));
    }
    case "band-reps":
      return tierSelect(perf ? perf.load.mag : DEFAULT_BAND_TIER) + numInput("r", perf ? perf.volume.val : "", repsLabel(loadMode(ex)));
    case "reps":
      return numInput("r", perf ? perf.volume.val : "", "reps");
    case "steady":
      // Prefill the exact minutes (seconds / 60, un-rounded) so a re-save can't drift the stored
      // duration — rounding here would resave e.g. 12.5 min as 13 the next time the slot is touched.
      return numInput("mins", perf ? Number(perf.volume.val) / 60 : "", "min") +
        numInput("level", perf && perf.load.mag != null ? perf.load.mag : "", "level");
    case "station": {
      const t = it.time != null ? it.time : 0;
      return '<label class="done-tick"><input type="checkbox" data-fh="log" data-field="done" data-time="' + t + '"' + (perf ? " checked" : "") + "> Done</label>";
    }
    // Unreachable — renderItemLog only draws a slot for a mode itemLogMode returned; a throw makes
    // any future drift between the classifier and this renderer loud instead of a blank slot.
    default: throw new Error("Unknown log mode: " + mode);
  }
}

// A number field for a logged value: reps/level are whole (numeric), weight/minutes decimal.
function numInput(field, val, label) {
  const decimal = field === "w" || field === "mins";
  return '<input type="number" inputmode="' + (decimal ? "decimal" : "numeric") + '" min="0" class="log-input"' +
    ' data-fh="log" data-field="' + field + '" value="' + (val === "" || val == null ? "" : esc(String(val))) + '"' +
    ' placeholder="' + esc(label) + '" aria-label="' + esc(label) + '">';
}

// The band-tier picker for a banded set (ADR-0029): the shared x-light→x-heavy ladder.
function tierSelect(tier) {
  return '<select class="log-select" data-fh="log" data-field="tier" aria-label="Band tier">' +
    BAND_TIERS.map((t) => '<option value="' + t.id + '"' + (t.id === tier ? " selected" : "") + ">" + esc(t.label) + " band</option>").join("") +
    "</select>";
}

/* ---------------------------------------------------------------------- *
 * The Library — the #42 deliverable: exercise timelines + PRs (read-only)*
 * ---------------------------------------------------------------------- */
function renderLibrary() {
  const card = document.getElementById("library-card");
  if (!card) return;
  const exs = libraryList().map(renderLibraryExercise).join("");
  const classes = classList().map(renderLibraryClass).join("");
  card.innerHTML =
    "<h2>Library</h2>" +
    '<p class="muted small">Every exercise owns its performance history — progression and PRs follow the movement, not a block, so deleting a block never loses them (ADR-0020).</p>' +
    '<div class="lib-list">' + exs + "</div>" +
    "<h2>Classes</h2>" +
    '<p class="muted small">Each class type owns its attendance history the same way (ADR-0030).</p>' +
    '<div class="lib-list">' + (classes || '<p class="muted small">No class types yet.</p>') + "</div>";
}

// A definition summary line: what the exercise intrinsically tracks (ADR-0023).
function metaLine(ex) {
  const bits = [ex.volume, ex.loadMetric];
  if (ex.loadMode) bits.push(ex.loadMode);
  if (Array.isArray(ex.defaultRail)) bits.push("rail " + fmtRail(ex.defaultRail));
  if (Array.isArray(ex.equipment) && ex.equipment.length) bits.push(ex.equipment.join(", "));
  return esc(bits.join(" · "));
}

function renderLibraryExercise(ex) {
  const perfs = performancesOf(ex.id);
  const timeline = perfs.length
    ? perfs.slice().reverse().map(perfRow).join("")
    : '<p class="muted small">No performances logged yet.</p>';
  return '<details class="lib-ex" data-ex="' + esc(ex.id) + '">' +
    "<summary>" +
      '<span class="lib-ex-name">' + esc(ex.name) + "</span>" +
      (ex.retired ? '<span class="tag">retired</span>' : "") +
      '<span class="lib-ex-count">' + perfs.length + " logged</span>" +
    "</summary>" +
    '<div class="lib-ex-body">' +
      '<div class="lib-meta muted small">' + metaLine(ex) + "</div>" +
      prBadges(ex) +
      '<div class="perf-timeline">' + timeline + "</div>" +
    "</div></details>";
}

// One performance row: date · load · volume · zone — the atomic history line (ADR-0020).
function perfRow(p) {
  return '<div class="perf" data-date="' + esc(p.date) + '">' +
    '<span class="perf-date">' + esc(p.date) + "</span>" +
    (fmtLoad(p.load) ? '<span class="perf-load">' + esc(fmtLoad(p.load)) + "</span>" : "") +
    '<span class="perf-vol">' + esc(fmtVolume(p.volume)) + "</span>" +
    (p.zone ? '<span class="perf-zone">' + esc(zoneLabel(p.zone)) + "</span>" : "") +
    "</div>";
}

// The derived PR badges (ADRs 0020/0021/0022): a headline e1RM + a per-zone frontier for a rep
// exercise; the longest effort + top level for a time exercise. All derived, never stored.
function prBadges(ex) {
  const pr = prsOf(ex.id);
  if (!pr) return "";
  const badge = (t) => '<span class="pr-badge">' + esc(t) + "</span>";
  const bits = [];
  if (pr.kind === "reps") {
    if (pr.topE1rm) bits.push(badge("e1RM " + fmt(pr.topE1rm.value) + " kg"));
    ["strength", "hypertrophy", "endurance"].forEach((z) => {
      const b = pr.byZone[z];
      if (b) bits.push(badge(zoneLabel(z) + ": " + (fmtLoad(b.perf.load) || "BW") + " × " + b.perf.volume.val));
    });
  } else {
    if (pr.longest) bits.push(badge("Longest " + fmtVolume(pr.longest.volume)));
    if (pr.topLevel) bits.push(badge("Top " + fmtLoad(pr.topLevel.load)));
  }
  return bits.length ? '<div class="pr-badges">PRs · ' + bits.join(" ") + "</div>" : "";
}

function renderLibraryClass(ct) {
  const att = ct.attendances || [];
  const rows = att.length
    ? att.slice().reverse().map((a) =>
        '<div class="perf">' +
          '<span class="perf-date">' + esc(a.date) + "</span>" +
          '<span class="perf-vol">' + esc(String(a.mins)) + " min</span>" +
          (a.kcal ? '<span class="perf-load">~' + fmt(a.kcal) + " kcal</span>" : "") +
          (a.note ? '<span class="perf-note">' + esc(a.note) + "</span>" : "") +
        "</div>").join("")
    : '<p class="muted small">No attendances logged yet.</p>';
  return '<details class="lib-ex" data-class="' + esc(ct.id) + '">' +
    "<summary><span class=\"lib-ex-name\">" + esc(ct.name) + "</span>" +
      '<span class="lib-ex-count">' + att.length + " attended</span></summary>" +
    '<div class="lib-ex-body"><div class="perf-timeline">' + rows + "</div></div></details>";
}

/* ---------------------------------------------------------------------- *
 * Measurements card (untouched infra)                                    *
 * ---------------------------------------------------------------------- */
function renderMeasurements() {
  const card = document.getElementById("measurements-card");
  if (!card) return;
  const block = currentBlock();
  const wk = Math.min(state.ui.week, block.weeks);
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

// Live patcher for the BMI line: recomputes from the current week's bodyweight + stored height.
export function renderBmi() {
  const line = document.getElementById("bmi-line");
  if (!line) return;
  const b = bmiFor(currentBlock(), Math.min(state.ui.week, currentBlock().weeks));
  const out = document.getElementById("bmi-value");
  if (b == null) { line.hidden = true; if (out) out.textContent = ""; }
  else { line.hidden = false; if (out) out.textContent = b.toFixed(1); }
}

export function hydrateNotes() {
  const nf = document.getElementById("notes-field");
  if (nf) nf.value = state.notes || "";
}

/* ---------------------------------------------------------------------- *
 * Measurement picker (the one add-zone that survives this slice)         *
 * ---------------------------------------------------------------------- */
function renderMeasureAddZone() {
  return '<div class="add-zone" data-picker="measure">' +
    '<button class="add-btn" type="button" data-action="picker-open">＋ Add measurement</button>' +
    '<div class="picker" hidden>' +
      '<input type="text" class="picker-search" data-fh="picker-search" placeholder="Search measurements…">' +
      '<div class="picker-list"></div>' +
      '<button class="link" type="button" data-action="form-open">＋ Create a new measurement</button>' +
      '<form class="picker-form" hidden>' +
        '<input name="name" placeholder="Measurement name" required>' +
        '<select name="unit"><option value="cm">cm</option><option value="kg">kg</option></select>' +
        '<div class="form-actions"><button type="submit">Add</button>' +
        '<button type="button" class="link" data-action="form-cancel">Cancel</button></div>' +
      "</form>" +
    "</div></div>";
}

// Re-render the measurement picker's list, minus already-tracked measurements, name-filtered.
export function repopulate(zone, query) {
  const picker = zone.querySelector(".picker");
  if (!picker) return;
  const on = {};
  state.tracked.forEach((id) => (on[id] = true));
  const q = (query || "").trim().toLowerCase();
  const items = Object.values(state.measurements)
    .filter((m) => !on[m.id] && (!q || m.name.toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => a.name.localeCompare(b.name));
  picker.querySelector(".picker-list").innerHTML = items.length
    ? items.map((m) => '<button class="pick" type="button" data-action="m-add" data-m="' + m.id + '">' + esc(m.name) + ' <span class="tag">' + esc(m.unit) + "</span></button>").join("")
    : '<p class="muted small">No matches — create a new one below.</p>';
}
