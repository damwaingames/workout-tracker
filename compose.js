/* Composing a Block (#45) — the Edit-mode rendering of the week: the authoring controls that let you
 * build a plan in the UI instead of hand-writing JSON (the original flaw — #40). Pure rendering, like
 * render.js: reads `state` + the pure helpers, never mutates. render.js delegates each routine card to
 * renderEditRoutine when `editing`; events.js owns the matching mutators (add/remove/move/set), so the
 * module graph stays acyclic (render → compose → state/helpers; events → compose is not needed).
 *
 * DOM contract: structural changes are data-action clicks (add-group, remove-group, group-up/down,
 * remove-item, kind, day-up/down, weeks-inc/dec); scalar edits carry data-fh="' + FH.compose + '" + data-target
 * (title/focus/rounds/rw/ra/rail-floor/rail-ceiling/item-time/class-type/class-dur) and don't re-render
 * (focus stays mid-type); adding an exercise is a data-fh="' + FH.itemAdd + '" select. data-pos/g/i locate the
 * routine / group / item, matching the plan indices. */

import { esc, fmtWeekday, scheduledDate, itemLogMode } from "./helpers.js";
import { state, libraryList, classList, awayEligible } from "./state.js";
import { ACTION, FH, TARGET } from "./actions.js";

const KIND_LABEL = { session: "Session", class: "Class", rest: "Rest" };

// One weekday's Routine as an editor card: its weekday, the day-reorder + kind switch, then the
// kind-specific body (compose a Session, configure a Class, or an empty Rest).
export function renderEditRoutine(block, r, wk, position) {
  const when = fmtWeekday(scheduledDate(block.startDate, wk, position));
  const head = '<div class="routine-head">' +
    '<span class="routine-when">' + esc(when) + "</span>" +
    dayMove(position, block.template.length) +
    kindSwitch(position, r.kind) +
    "</div>";
  let body;
  if (r.kind === "session") body = editSession(r, 'data-pos="' + position + '"', libraryList().filter((e) => !e.retired));
  else if (r.kind === "class") body = editClass(r, position);
  else body = '<p class="rest-note">Rest day — nothing scheduled.</p>';
  return '<div class="routine ' + r.kind + ' editing">' + head +
    '<div class="routine-edit-body">' + body + "</div></div>";
}

// The Holiday Session editor (#48/ADR-0025): the same Session composer, but located at the app-level
// `state.holiday` singleton (via `data-holiday`, which the events locators resolve) and with its
// exercise picker restricted to the away-eligible set (equipment ⊆ away kit). Shown once in Edit
// mode; there is no weekday, kind switch, or day-reorder — it is not a routine in the template.
export function renderHolidayEditor() {
  const h = state.holiday;
  return '<div class="holiday-editor">' +
    '<h3 class="holiday-editor-title">🏝 Holiday Session</h3>' +
    '<p class="muted small">One catch-all session built only from your away kit — mini-loops, resistance bands, and a door anchor. Swap it into any day with the 🏝 toggle while you’re travelling; your planned exercises wait untouched (ADR-0025).</p>' +
    editSession(h, 'data-holiday="1"', awayEligible()) +
    "</div>";
}

// The block-level knobs shown above the week in Edit mode: its length (N real weeks) and start date
// (ADR-0024). The name input lives in the week heading (render.js) already.
export function renderBlockConfig(block) {
  return '<div class="block-config">' +
    '<span class="cfg">Weeks ' +
      '<button type="button" class="mini" data-action="' + ACTION.weeksDec + '"' + (block.weeks <= 1 ? " disabled" : "") + ' aria-label="Fewer weeks">−</button>' +
      '<strong class="weeks-n">' + block.weeks + "</strong>" +
      '<button type="button" class="mini" data-action="' + ACTION.weeksInc + '" aria-label="More weeks">＋</button></span>' +
    '<label class="cfg">Start <input type="date" id="block-start-input" value="' + esc(block.startDate) + '"></label>' +
    "</div>";
}

function dayMove(pos, len) {
  return '<span class="day-move">' +
    '<button type="button" class="mini" data-action="' + ACTION.dayUp + '" data-pos="' + pos + '"' + (pos === 0 ? " disabled" : "") + ' aria-label="Move day earlier">↑</button>' +
    '<button type="button" class="mini" data-action="' + ACTION.dayDown + '" data-pos="' + pos + '"' + (pos === len - 1 ? " disabled" : "") + ' aria-label="Move day later">↓</button>' +
    "</span>";
}

function kindSwitch(pos, kind) {
  return '<span class="kind-switch">' +
    ["session", "class", "rest"].map((k) =>
      '<button type="button" class="kind-btn' + (k === kind ? " active" : "") + '" data-action="' + ACTION.kind + '" data-pos="' + pos + '" data-kind="' + k + '"' +
      (k === kind ? ' aria-pressed="true"' : "") + ">" + KIND_LABEL[k] + "</button>").join("") +
    "</span>";
}

/* ---- Session editor (reused by the block routines and the Holiday Session) ----
 * `loc` is the locator data-attribute the events mutators resolve the session from — `data-pos="N"`
 * for a block routine, `data-holiday="1"` for the singleton. `exList` is the exercise picker source
 * (the whole library for a block, the away-eligible set for the Holiday Session). */
function editSession(r, loc, exList) {
  const groups = (r.groups || []).map((g, gi) => editGroup(g, gi, loc, exList)).join("");
  return '<input class="compose-input" data-fh="' + FH.compose + '" data-target="' + TARGET.title + '" ' + loc + ' value="' + esc(r.title || "") + '" placeholder="Session name" aria-label="Session name" maxlength="40">' +
    '<input class="compose-input" data-fh="' + FH.compose + '" data-target="' + TARGET.focus + '" ' + loc + ' value="' + esc(r.focus || "") + '" placeholder="Focus (optional)" aria-label="Session focus" maxlength="60">' +
    '<div class="groups-edit">' + groups + "</div>" +
    '<button type="button" class="add-btn" data-action="' + ACTION.addGroup + '" ' + loc + ">＋ Add group</button>";
}

function editGroup(g, gi, loc, exList) {
  const a = " " + loc + ' data-g="' + gi + '"';
  const items = (g.items || []).map((it, ii) => editItem(it, ii, loc, gi)).join("");
  return '<div class="group-edit">' +
    '<div class="group-edit-head">' +
      '<span class="group-edit-title">Group ' + (gi + 1) + "</span>" +
      '<span class="group-move">' +
        '<button type="button" class="mini" data-action="' + ACTION.groupUp + '"' + a + (gi === 0 ? " disabled" : "") + ' aria-label="Move group up">↑</button>' +
        '<button type="button" class="mini" data-action="' + ACTION.groupDown + '"' + a + ' aria-label="Move group down">↓</button>' +
      "</span>" +
      '<button type="button" class="remove" data-action="' + ACTION.removeGroup + '"' + a + ' aria-label="Remove group">×</button>' +
    "</div>" +
    '<div class="group-config">' +
      cfgNum("rounds", "rounds", g.rounds, 1, a) +
      cfgNum("rest within", "rw", g.restWithin || 0, 0, a, "s") +
      cfgNum("rest after", "ra", g.restAfter || 0, 0, a, "s") +
    "</div>" +
    '<div class="items-edit">' + items + "</div>" +
    itemAddSelect(loc, gi, exList) +
    "</div>";
}

function editItem(it, ii, loc, gi) {
  const ex = state.library[it.exId];
  const name = ex ? esc(ex.name) : esc(it.exId);
  const a = " " + loc + ' data-g="' + gi + '" data-i="' + ii + '"';
  let controls = "";
  if (Array.isArray(it.rail)) {
    controls = '<span class="rail-edit">' +
      railInput("rail-floor", it.rail[0], a) + " – " + railInput("rail-ceiling", it.rail[1], a) + " reps</span>";
  } else if (it.time != null) {
    // A steady effort is edited in minutes (its natural unit), a station in seconds — read through the
    // one itemLogMode classifier so "what is steady" stays defined in a single place (ADR-0019).
    const isSteady = itemLogMode(it, ex) === "steady";
    const val = isSteady ? Number(it.time) / 60 : Number(it.time);
    controls = '<span class="time-edit">' +
      '<input type="number" min="0" inputmode="decimal" class="cfg-input" data-fh="' + FH.compose + '" data-target="' + TARGET.itemTime + '" data-unit="' + (isSteady ? "min" : "sec") + '"' + a +
      ' value="' + (val === "" || val == null ? "" : esc(String(val))) + '" aria-label="Duration"> ' + (isSteady ? "min" : "s") + "</span>";
  }
  return '<div class="item-edit"><span class="item-name">' + name + "</span>" + controls +
    '<button type="button" class="remove" data-action="' + ACTION.removeItem + '"' + a + ' aria-label="Remove exercise">×</button></div>';
}

function itemAddSelect(loc, gi, exList) {
  const opts = exList.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.name) + "</option>").join("");
  return '<select class="item-add" data-fh="' + FH.itemAdd + '" ' + loc + ' data-g="' + gi + '" aria-label="Add exercise">' +
    '<option value="">＋ Add exercise…</option>' + opts + "</select>";
}

/* ---- Class editor ---- */
function editClass(r, pos) {
  const opts = classList().map((c) => '<option value="' + esc(c.id) + '"' + (c.id === r.classType ? " selected" : "") + ">" + esc(c.name) + "</option>").join("");
  return '<label class="cfg">Type <select class="compose-input" data-fh="' + FH.compose + '" data-target="' + TARGET.classType + '" data-pos="' + pos + '">' + opts + "</select></label>" +
    '<label class="cfg">Duration <input type="number" min="0" inputmode="numeric" class="cfg-input" data-fh="' + FH.compose + '" data-target="' + TARGET.classDur + '" data-pos="' + pos + '" value="' + esc(String(r.durationMin || "")) + '"> min</label>';
}

/* ---- shared little inputs ---- */
function cfgNum(label, target, val, min, attrs, unit) {
  return '<label class="cfg">' + label + " " +
    '<input type="number" min="' + min + '" inputmode="numeric" class="cfg-input" data-fh="' + FH.compose + '" data-target="' + target + '"' + attrs +
    ' value="' + esc(String(val)) + '">' + (unit ? esc(unit) : "") + "</label>";
}

function railInput(target, val, attrs) {
  return '<input type="number" min="1" inputmode="numeric" class="cfg-input rail-input" data-fh="' + FH.compose + '" data-target="' + target + '"' + attrs +
    ' value="' + esc(String(val)) + '" aria-label="' + (target === "rail-floor" ? "Rep floor" : "Rep ceiling") + '">';
}
