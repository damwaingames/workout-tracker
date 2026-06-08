/* Event handling and the block / backup operations they trigger. Mutates the
 * store (through its setters), then calls into render.js to reflect the change.
 * The store reassignments (setState/setEditing) all funnel through state.js —
 * an importer can read `state`/`editing` but can't reassign the binding here. */

import { DEFAULT_SETS, DEFAULT_BAND, NUTRIENTS } from "./constants.js";
import {
  placement, clampSets, clampRounds, circuitOf, kindType,
  nonNegSec, slugify, uniqueId, today, bandKey, classesKey, foodKey, parseDay,
} from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog, logList, purgeBlockLog,
  currentBlock, dayDef, nextBlockNumber, normalise, defaultState, M, findClassType, pantryList,
} from "./state.js";
import {
  render, renderProgress, renderBmi, renderVolumes, renderClassTotal, patchCircuitTime, hydrate, repopulate, hydrateNotes, foodResultsHTML,
} from "./render.js";
import { lookupBarcode, searchFoods } from "./off.js";
import { scanBarcode } from "./scan.js";

/* ---------------------------------------------------------------------- *
 * Events                                                                  *
 * ---------------------------------------------------------------------- */
export function handleClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  // "holiday" sentinel (the shared Holiday Workout editor) survives the parse; a
  // real day stays a number. dayDef resolves "holiday" → state.holiday.
  const day = el.dataset.day ? parseDay(el.dataset.day) : null;
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
    case "class-remove": removeClass(el.dataset.cell, Number(el.dataset.i)); break;
    case "food-remove": removeFood(el.dataset.cell, Number(el.dataset.i)); break;
    case "food-open": foodOpen(el); break;
    case "food-close": foodClose(el); break;
    case "food-find": foodFind(el); break;
    case "food-scan": foodScan(el); break;
    case "food-scan-cancel": foodScanCancel(); break;
    case "food-pick": foodPick(el); break;
    case "toggle-day": toggleDay(el); break;
    case "day-tab": dayTab(el); break;
    case "export": exportBackup(); break;
    case "reset": resetAll(); break;
  }
}

// Collapse / expand a day in place — a CSS class flip plus the persisted flag, no
// full render (snappy, and the collapsed summary is already in the DOM). setLog
// deletes the key on `false`, so expanded = absent, which is what renderDay reads.
function toggleDay(el) {
  const dayEl = el.closest(".day");
  const collapsed = dayEl.classList.toggle("is-collapsed"); // CSS rotates the caret + slides the body
  setLog(dayEl.dataset.cell + ".collapsed", collapsed);
  el.setAttribute("aria-expanded", String(!collapsed));
}

// Switch a day's Workout / Nutrition tab in place — a CSS class flip plus the persisted
// .tab flag, no full render (both panels are already in the DOM, so it's instant and an
// open finder survives). setLog deletes on "", so Workout = absent (the default).
function dayTab(el) {
  const dayEl = el.closest(".day");
  const nutrition = el.dataset.tab === "nutrition";
  dayEl.classList.toggle("tab-nutrition", nutrition);
  setLog(dayEl.dataset.cell + ".tab", nutrition ? "nutrition" : "");
  dayEl.querySelectorAll(".day-tab").forEach((b) => b.setAttribute("aria-selected", String(b === el)));
}

export function handleSubmit(e) {
  const classForm = e.target.closest(".class-form");
  if (classForm) { e.preventDefault(); return addClass(classForm); }
  const foodForm = e.target.closest(".food-quick-form");
  if (foodForm) { e.preventDefault(); return addQuickEntry(foodForm); }
  const gramsForm = e.target.closest(".food-grams-form");
  if (gramsForm) { e.preventDefault(); return addFoodEntry(gramsForm); }
  const form = e.target.closest(".picker-form");
  if (!form) return;
  e.preventDefault();
  const zone = form.closest(".add-zone");
  if (zone && zone.dataset.picker === "measure") return addNewMeasurement(form);
  addNewExercise(form, zone ? parseDay(zone.dataset.day) : NaN);
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
  // Match an existing type case-insensitively so "Box-Fit" / "box-fit" don't fork
  // duplicates; reuse its canonical spelling (and log the class under that), else
  // remember the new type (rate starts at 0; set it in the Edit-mode editor).
  const known = findClassType(type);
  const canonical = known ? known.name : type;
  if (!known) state.classTypes.push({ name: canonical, rate: 0 });
  const key = classesKey(cell);
  const list = logList(key);
  list.push({ type: canonical, desc, mins });
  setLog(key, list);
  render();
}

function removeClass(cell, i) {
  const key = classesKey(cell);
  const list = logList(key).slice();
  list.splice(i, 1);
  setLog(key, list.length ? list : ""); // "" deletes the key once the last class goes
  render();
}

// Log an ad-hoc quick entry on a day cell — un-barcoded food (loose fruit, meals out)
// that carries its own kcal + macros, the snapshot exception to the pantry-reference
// model (ADR-0004). A name is optional; at least one nutrient must be > 0 (an all-zero
// entry would add a blank row and shift no total, so it's dropped). Food entries are an
// array under one cell key, exactly like classes.
function addQuickEntry(form) {
  const cell = form.closest(".food").dataset.cell;
  const fd = new FormData(form);
  const entry = { name: String(fd.get("name") || "").trim() };
  let any = false;
  NUTRIENTS.forEach((n) => {
    const v = parseFloat(fd.get(n.id));
    entry[n.id] = v > 0 ? v : 0;
    if (v > 0) any = true;
  });
  if (!any) return;
  const key = foodKey(cell);
  const list = logList(key);
  list.push(entry);
  setLog(key, list);
  render();
}

function removeFood(cell, i) {
  const key = foodKey(cell);
  const list = logList(key).slice();
  list.splice(i, 1);
  setLog(key, list.length ? list : ""); // "" deletes the key once the last entry goes
  render();
}

/* --- Food finder: search / barcode / pick foods from Open Food Facts into the Pantry,
 * then log a portion. The finder is patched in place (no full render) so it stays open
 * across a search; only confirming a portion renders. --- */
// The most recent Find's hits, by barcode, so foodPick can cache the chosen one (its
// fresh OFF data) into the Pantry. Cleared whenever the local Pantry view is shown.
let foundFoods = {};

// Hide a finder and restore its "＋ Add food" trigger — the close half, shared by the
// Close button and the one-finder-at-a-time sweep in foodOpen.
function closeFinder(finder) {
  finder.hidden = true;
  const btn = finder.parentNode.querySelector(".food-add-btn");
  if (btn) btn.hidden = false;
}

// Reveal the finder, seeding its results with the whole Pantry — the offline quick-pick.
function foodOpen(el) {
  // One finder open at a time: stop any scan and close a finder left open on another day
  // card first, so the module-global foundFoods only ever holds THIS finder's hits. A
  // stale finder's OFF results are cleared here and were never cached to the Pantry, so
  // without this a pick on one would silently no-op — this makes that invariant real.
  if (activeScan) activeScan.cancel();
  document.querySelectorAll(".food-finder:not([hidden])").forEach(closeFinder);
  const finder = el.closest(".food-add").querySelector(".food-finder");
  el.hidden = true;
  finder.hidden = false;
  foundFoods = {};
  const input = finder.querySelector(".food-search");
  input.value = "";
  finder.querySelector(".food-results").innerHTML = foodResultsHTML(pantryList(""));
  input.focus();
}

function foodClose(el) {
  if (activeScan) activeScan.cancel(); // stop the camera if a scan is mid-flight
  closeFinder(el.closest(".food-finder"));
}

// Typing filters the Pantry locally (instant, offline) and returns to that view, so a
// stale Open Food Facts result list can't linger under a changed query.
function foodSearch(el) {
  foundFoods = {};
  el.closest(".food-finder").querySelector(".food-results").innerHTML = foodResultsHTML(pantryList(el.value));
}

// Find on Open Food Facts from the typed query.
async function foodFind(el) {
  const finder = el.closest(".food-finder");
  const q = finder.querySelector(".food-search").value.trim();
  if (q) await runFinderQuery(finder, q);
}

// Run an Open Food Facts lookup for `q` and paint the results in place (no full render,
// so the finder stays open across it). An all-digits query of ≥ 8 chars is a barcode
// lookup, anything else a name search. A network failure (offline) falls back to the
// Pantry / a quick entry. Shared by the Find button and a successful camera scan — a
// scanned barcode is just an all-digits query routed through the same path.
async function runFinderQuery(finder, q) {
  const results = finder.querySelector(".food-results");
  results.innerHTML = '<li class="food-result-empty muted small">Searching Open Food Facts…</li>';
  const digits = q.replace(/\D/g, "");
  try {
    const foods = digits.length >= 8 && digits === q
      ? [await lookupBarcode(digits)].filter(Boolean)
      : await searchFoods(q);
    foundFoods = {};
    foods.forEach((f) => { foundFoods[f.barcode] = f; });
    results.innerHTML = foods.length ? foodResultsHTML(foods)
      : '<li class="food-result-empty muted small">No Open Food Facts match — add a quick entry instead.</li>';
  } catch (err) {
    results.innerHTML = '<li class="food-result-empty muted small">Can’t reach Open Food Facts (offline?) — pick from your foods or add a quick entry.</li>';
  }
}

/* --- Camera scan (ADR-0003): scan.js owns the stream + BarcodeDetector loop; here we
 * just reveal the preview and route a decoded barcode through the same lookup the Find
 * button uses. The Scan button is feature-detected away off Chrome/Android (render.js),
 * so this only runs where the API exists. --- */
// The in-flight scan (one finder open at a time), so Cancel / closing the finder can
// stop the camera.
let activeScan = null;

async function foodScan(el) {
  const finder = el.closest(".food-finder");
  const scanner = finder.querySelector(".food-scanner");
  const results = finder.querySelector(".food-results");
  scanner.hidden = false;
  activeScan = scanBarcode(scanner.querySelector(".scan-video"));
  try {
    const barcode = await activeScan.done;
    scanner.hidden = true;
    finder.querySelector(".food-search").value = barcode; // show what was scanned
    await runFinderQuery(finder, barcode);
  } catch (err) {
    scanner.hidden = true;
    // A real failure (no camera / permission denied) gets a note; a user Cancel is silent.
    if (!err || err.name !== "AbortError") {
      results.innerHTML = '<li class="food-result-empty muted small">Couldn’t start the camera — check the permission, or type the barcode in.</li>';
    }
  } finally {
    activeScan = null;
  }
}

function foodScanCancel() { if (activeScan) activeScan.cancel(); }

// Pick a found / pantry food: cache it into the Pantry (re-finding then picking refreshes
// a cached one with the new OFF data — ADR-0004), then reveal its grams form to confirm
// the portion. A plain Pantry pick reuses the cached record, no network.
function foodPick(el) {
  const barcode = el.dataset.barcode;
  const food = foundFoods[barcode] || state.pantry[barcode];
  if (!food) return;
  state.pantry[barcode] = food;
  save();
  const form = el.closest(".food-result").querySelector(".food-grams-form");
  el.closest(".food-finder").querySelectorAll(".food-grams-form").forEach((f) => { if (f !== form) f.hidden = true; });
  form.hidden = false;
  const g = form.querySelector('input[name="grams"]');
  g.focus(); g.select();
}

// Confirm the portion: push a pantry entry { barcode, grams } onto the day, then render
// (which closes the finder). The food is already in the Pantry from foodPick.
function addFoodEntry(form) {
  const cell = form.closest(".food").dataset.cell;
  const barcode = form.dataset.barcode;
  const grams = parseFloat(new FormData(form).get("grams"));
  if (!state.pantry[barcode] || !(grams > 0)) return;
  const key = foodKey(cell);
  const list = logList(key);
  list.push({ barcode, grams });
  setLog(key, list);
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
  // both dayLoad and the renderer treat false exactly like not-banded.
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
  "food-search": foodSearch,
  "circuit-field": circuitField,
  "load-mode": loadModeField,
  // Band selects/toggles carry no data-k (logged out-of-band so hydrate can't
  // blank an unlogged default), so they're dispatched here, ahead of data-k.
  "band-pick": bandPickField,
  "banded-toggle": bandedToggleField,
  "band-default": bandDefaultField,
  "ct-rate": classRateField,
};

// Live-patch refreshers keyed by an input's data-refresh tag — the same data-*→map
// dispatch as fieldByName / handleClick. A logged field declares which running total
// it feeds, so handleField needn't scan CSS classes (which exist for styling, and
// shouldn't double as routing). The full render already emits correct totals; these
// only re-patch in place so the edited input keeps focus mid-type.
const refreshBy = {
  volumes: renderVolumes,  // weight / reps / banded round-reps → day + week + block tonnage
  bmi: renderBmi,          // a measurement value → the BMI line
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
    // Toggling the holiday flag swaps the whole day body in/out, so re-render.
    else if (k.slice(-8) === ".holiday") render();
  } else {
    setLog(k, el.value);
    const r = el.dataset.refresh; // which running total this field feeds (if any)
    if (r && Object.prototype.hasOwnProperty.call(refreshBy, r)) refreshBy[r]();
  }
}

function afterDone(el, k) {
  const cell = k.slice(0, -5);
  const done = el.checked;
  if (done && !state.log[cell + ".date"]) setLog(cell + ".date", today());
  // Completing a day auto-collapses it (less to scroll past); reopening expands it.
  // setLog deletes on false, so un-completing clears the flag → expanded.
  setLog(cell + ".collapsed", done);
  // Reflect the changed flags through hydrate — the canonical "log → existing DOM"
  // pass (is-done, is-collapsed + caret, the date stamp). It patches in place rather
  // than rebuilding, so the collapse still animates; then refresh the one off-day
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
  purgeBlockLog(b.id);
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
