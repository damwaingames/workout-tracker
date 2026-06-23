/* Event handling and the block / backup operations they trigger. Mutates the
 * store (through its setters), then calls into render.js to reflect the change.
 * The store reassignments (setState/setEditing) all funnel through state.js —
 * an importer can read `state`/`editing` but can't reassign the binding here. */

import { DEFAULT_SETS, DEFAULT_BAND, NUTRIENTS } from "./constants.js";
import {
  placement, clampSets, clampRounds, circuitOf,
  nonNegSec, slugify, uniqueId, today, mondayOf, bandKey, classesKey, foodKey, scheduleKey, parseRoutine,
} from "./helpers.js";
import {
  state, editing, setState, setEditing, save, setLog, logList, logPush, logRemoveAt, logReplaceAt, purgeBlockLog,
  currentBlock, routineDef, weekSchedule, nextBlockNumber, normalise, defaultState, M, findClassType, pantryList,
} from "./state.js";
import {
  render, renderProgress, renderBmi, renderVolumes, renderClassTotal, patchCircuitTime, hydrate, repopulate, hydrateNotes, foodResultsHTML,
} from "./render.js";
import { lookupBarcode, searchFoods } from "./off.js";
import { scanBarcode } from "./scan.js";
import { authorize, findBackup, readBackup, writeBackup } from "./drive.js";

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
      const p = routineDef(routine).exercises.find((x) => x.id === el.dataset.ex);
      if (p) {
        p.sets = clampSets((p.sets || DEFAULT_SETS) + (el.dataset.action === "sets-inc" ? 1 : -1));
        save(); render();
      }
      break;
    }
    case "rounds-inc":
    case "rounds-dec": {
      const d = routineDef(routine);
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
      // Placement shape follows the routine's kind, not the exercise (a cross-context move
      // gets a strength placement in a strength routine, a bare one elsewhere — ADR-0007).
      // routineDef re-parses the sentinel / scans the block, so resolve it once.
      const def = routineDef(routine);
      def.exercises.push(placement(def.kind, el.dataset.ex, DEFAULT_SETS));
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
    case "food-add-local": foodAddLocal(el); break;
    case "food-edit": foodEdit(el); break;
    case "food-grams-edit": revealRowEdit(el, ".food-grams-edit-form"); break;
    case "food-quick-edit": revealRowEdit(el, ".food-quick-edit-form"); break;
    case "food-edit-cancel": { const f = el.closest("form"); f.hidden = true; f.reset(); break; }
    case "toggle-routine": toggleRoutine(el); break;
    case "routine-tab": routineTab(el); break;
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

// Switch a routine's Workout / Nutrition tab in place — a CSS class flip plus the persisted
// .tab flag, no full render (both panels are already in the DOM, so it's instant and an
// open finder survives). setLog deletes on "", so Workout = absent (the default).
function routineTab(el) {
  const routineEl = el.closest(".routine");
  const nutrition = el.dataset.tab === "nutrition";
  routineEl.classList.toggle("tab-nutrition", nutrition);
  setLog(routineEl.dataset.cell + ".tab", nutrition ? "nutrition" : "");
  routineEl.querySelectorAll(".routine-tab").forEach((b) => b.setAttribute("aria-selected", String(b === el)));
}

export function handleSubmit(e) {
  const classForm = e.target.closest(".class-form");
  if (classForm) { e.preventDefault(); return addClass(classForm); }
  const foodForm = e.target.closest(".food-quick-form");
  if (foodForm) { e.preventDefault(); return addQuickEntry(foodForm); }
  const gramsForm = e.target.closest(".food-grams-form");
  if (gramsForm) { e.preventDefault(); return addFoodEntry(gramsForm); }
  const gramsEditForm = e.target.closest(".food-grams-edit-form");
  if (gramsEditForm) { e.preventDefault(); return saveGramsEdit(gramsEditForm); }
  const quickEditForm = e.target.closest(".food-quick-edit-form");
  if (quickEditForm) { e.preventDefault(); return saveQuickEdit(quickEditForm); }
  const detailForm = e.target.closest(".food-detail-form");
  if (detailForm) { e.preventDefault(); return saveFoodDetail(detailForm); }
  const form = e.target.closest(".picker-form");
  if (!form) return;
  e.preventDefault();
  const zone = form.closest(".add-zone");
  if (zone && zone.dataset.picker === "measure") return addNewMeasurement(form);
  addNewExercise(form, zone ? parseRoutine(zone.dataset.routine) : NaN);
}

// Log a class on a routine cell: type (required) + free-text note + minutes (>0).
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
  logPush(classesKey(cell), { type: canonical, desc, mins });
  render();
}

function removeClass(cell, i) {
  logRemoveAt(classesKey(cell), i);
  render();
}

// Read the NUTRIENTS fields off a form as { values, any } — `any` flags whether any nutrient
// is > 0, so callers can reject an all-zero set ("a blank set adds nothing", in one place).
// Shared by the quick-entry forms and the Food-details form.
function readNutrients(fd) {
  const values = {}; let any = false;
  NUTRIENTS.forEach((n) => { const v = parseFloat(fd.get(n.id)); values[n.id] = v > 0 ? v : 0; if (v > 0) any = true; });
  return { values, any };
}

// Read a quick entry { name, kcal, carb, fat, protein } from a form, or null when every
// nutrient is zero (a blank row would add nothing and shift no total). A name is optional.
// Shared by the add form and the in-place edit form, so they can't drift apart.
function readQuickEntry(form) {
  const fd = new FormData(form);
  const { values, any } = readNutrients(fd);
  return any ? { name: String(fd.get("name") || "").trim(), ...values } : null;
}

// Log an ad-hoc quick entry on a routine cell — un-barcoded food (loose fruit, meals out) that
// carries its own kcal + macros, the snapshot exception to the pantry-reference model
// (ADR-0004). Food entries are an array under one cell key, exactly like classes.
function addQuickEntry(form) {
  const entry = readQuickEntry(form);
  if (!entry) return;
  logPush(foodKey(form.closest(".food").dataset.cell), entry);
  render();
}

function removeFood(cell, i) {
  logRemoveAt(foodKey(cell), i);
  render();
}

// Reveal a hidden form and focus/select its first input. Shared by the row editors, the
// Food-details author tail, and foodPick's grams reveal.
function reveal(form) {
  form.hidden = false;
  const first = form.querySelector("input");
  if (first) { first.focus(); first.select(); }
}

// Reveal a logged row's in-place edit form (grams for a pantry row, name + nutrients for a
// quick row). Shared by both row editors.
function revealRowEdit(el, cls) {
  reveal(el.closest(".food-item").querySelector(cls));
}

// Save an in-place grams edit: replace the entry at its index, preserving the barcode
// (read from the stored entry, not the DOM). Re-renders so the row + routine total re-derive.
function saveGramsEdit(form) {
  const cell = form.dataset.cell;
  const i = Number(form.dataset.i);
  const grams = parseFloat(new FormData(form).get("grams"));
  const entry = logList(foodKey(cell))[i];
  if (!entry || !entry.barcode || !(grams > 0)) return;
  logReplaceAt(foodKey(cell), i, { barcode: entry.barcode, grams });
  render();
}

// Save an in-place quick-entry edit: same shape + all-zero guard as the add form (shared
// readQuickEntry), but replacing the entry at its index rather than appending.
function saveQuickEdit(form) {
  const entry = readQuickEntry(form);
  if (!entry) return;
  logReplaceAt(foodKey(form.dataset.cell), Number(form.dataset.i), entry);
  render();
}

/* --- Food finder: search / barcode / pick foods from Open Food Facts into the Pantry,
 * then log a portion. The finder is patched in place (no full render) so it stays open
 * across a search; only confirming a portion renders. --- */
// The most recent Find's hits, by barcode, so foodPick can cache the chosen one (its
// fresh OFF data) into the Pantry. Cleared whenever the local Pantry view is shown.
let foundFoods = {};

// Is a barcode a *trusted* Pantry record — numbers hand-vouched, not OFF's (ADR-0004
// amendment)? The single predicate, read by the re-lookup short-circuit and freshestFood.
const isTrusted = (barcode) => !!(state.pantry[barcode] && state.pantry[barcode].trusted);

// The record to use for a barcode, with the trusted-vs-OFF precedence in one place: a trusted
// Pantry record wins over any OFF hit (ADR-0004 amendment), else the just-found OFF data, else
// whatever's cached. Used by foodPick (what to log) and foodEdit (what to prefill).
function freshestFood(barcode) {
  return isTrusted(barcode) ? state.pantry[barcode] : (foundFoods[barcode] || state.pantry[barcode]);
}

// Hide a finder and restore its "＋ Add food" trigger — the close half, shared by the
// Close button and the one-finder-at-a-time sweep in foodOpen.
function closeFinder(finder) {
  finder.hidden = true;
  const btn = finder.parentNode.querySelector(".food-add-btn");
  if (btn) btn.hidden = false;
}

// Reveal the finder, seeding its results with the whole Pantry — the offline quick-pick.
function foodOpen(el) {
  // One finder open at a time: stop any scan and close a finder left open on another routine
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
  const digits = q.replace(/\D/g, "");
  const isBarcode = digits.length >= 8 && digits === q;
  // A trusted barcode resolves from the Pantry — OFF is never consulted, so a hand-vouched
  // record can't be clobbered by a re-lookup, and it works offline (ADR-0004 amendment).
  if (isBarcode && isTrusted(digits)) {
    foundFoods = {};
    results.innerHTML = foodResultsHTML([state.pantry[digits]]);
    return;
  }
  results.innerHTML = '<li class="food-result-empty muted small">Searching Open Food Facts…</li>';
  try {
    const foods = isBarcode ? [await lookupBarcode(digits)].filter(Boolean) : await searchFoods(q);
    foundFoods = {};
    foods.forEach((f) => { foundFoods[f.barcode] = f; });
    if (foods.length) { results.innerHTML = foodResultsHTML(foods); return; }
    // A barcode miss can be authored locally (it has a barcode to hang a Food on); a name
    // miss can't, so it still routes to a quick entry (ADR-0004: no barcode ⇒ quick entry).
    results.innerHTML = isBarcode
      ? '<li class="food-result-empty muted small">Not on Open Food Facts — ' +
        '<button type="button" class="link" data-action="food-add-local" data-barcode="' + digits + '">add it to your foods</button>.</li>'
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

// Pick a found / pantry food: cache the chosen record into the Pantry (freshestFood applies
// the trusted-vs-OFF precedence — re-finding an untrusted one refreshes it from OFF, a
// trusted one is never overwritten; ADR-0004), then reveal its grams form to confirm the
// portion. A plain Pantry pick reuses the cached record, no network.
function foodPick(el) {
  const barcode = el.dataset.barcode;
  const food = freshestFood(barcode);
  if (!food) return;
  state.pantry[barcode] = food;
  save();
  const form = el.closest(".food-result").querySelector(".food-grams-form");
  el.closest(".food-finder").querySelectorAll(".food-grams-form").forEach((f) => { if (f !== form) f.hidden = true; });
  reveal(form);
}

// Confirm the portion: push a pantry entry { barcode, grams } onto the routine, then render
// (which closes the finder). The food is already in the Pantry from foodPick.
function addFoodEntry(form) {
  const cell = form.closest(".food").dataset.cell;
  const barcode = form.dataset.barcode;
  const grams = parseFloat(new FormData(form).get("grams"));
  if (!state.pantry[barcode] || !(grams > 0)) return;
  logPush(foodKey(cell), { barcode, grams });
  render();
}

/* --- Trusted Foods (ADR-0004 amendment): author a Food locally when OFF has no record of a
 * barcode, or hand-correct one's numbers. Either way the Food is marked `trusted`, so a later
 * re-lookup won't clobber it. One "Food details" form serves both, revealed + prefilled by
 * openFoodDetail; dataset.mode tells saveFoodDetail what to do once it's written. --- */

// Reveal + prefill the Food details form. `food` is null when authoring (blank fields) or
// the record being corrected (prefilled). mode is "author" | "correct".
function openFoodDetail(form, barcode, mode, food) {
  form.hidden = false;
  form.dataset.barcode = barcode;
  form.dataset.mode = mode;
  form.querySelector('input[name="name"]').value = (food && food.name) || "";
  form.querySelector('input[name="brand"]').value = (food && food.brand) || "";
  const per = (food && food.per100g) || {};
  NUTRIENTS.forEach((n) => { form.querySelector('input[name="' + n.id + '"]').value = parseFloat(per[n.id]) || ""; });
  form.querySelector('input[name="name"]').focus();
}

// Author a not-found barcode: open the form blank, the barcode preserved from the message.
function foodAddLocal(el) {
  openFoodDetail(el.closest(".food").querySelector(".food-detail-form"), el.dataset.barcode, "author", null);
}

// Correct a food's details (from a finder result row or a logged routine row): open the Food
// details form prefilled in correct mode, with the freshest record for the barcode (a trusted
// Pantry record beats a possibly-stale same-barcode OFF hit — see freshestFood).
function foodEdit(el) {
  const barcode = el.dataset.barcode;
  openFoodDetail(el.closest(".food").querySelector(".food-detail-form"), barcode, "correct", freshestFood(barcode));
}

// Save the Food details form: write a trusted Food to the Pantry (the user vouches for these
// numbers from the label). Authoring then drops into logging a portion (the new food, grams
// open); correcting just re-renders, so the corrected numbers propagate to every routine (ADR-0004).
function saveFoodDetail(form) {
  const barcode = form.dataset.barcode;
  if (!barcode) return;
  const fd = new FormData(form);
  const { values: per100g, any } = readNutrients(fd);
  const name = String(fd.get("name") || "").trim();
  if (!any && !name) return; // nothing worth storing
  state.pantry[barcode] = { barcode, name, brand: String(fd.get("brand") || "").trim(), per100g, trusted: true };
  save();
  if (form.dataset.mode === "author") {
    // Drop straight into logging a portion: show the new food as a pickable row, grams open.
    const results = form.closest(".food").querySelector(".food-results");
    results.innerHTML = foodResultsHTML([state.pantry[barcode]]);
    form.hidden = true;
    const grams = results.querySelector(".food-grams-form");
    if (grams) reveal(grams);
  } else {
    render(); // correction: reflect the new numbers everywhere (ADR-0004 propagation)
  }
}

function addNewExercise(form, routine) {
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  // Contexts follow the routine's kind, not a form field — so a created exercise is seeded
  // valid for exactly the routine it's added to (widen it later to share with another kind).
  const kind = routineDef(routine).kind;
  const id = uniqueId(slugify(name), (x) => state.library[x]);
  const ex = { id, name, contexts: [kind] };
  const setup = String(fd.get("setup") || "").trim();
  if (setup) ex.setup = setup;
  // Strength moves carry a rep target; circuit moves carry nothing extra
  // (rounds/timing live on the recovery routine).
  if (kind === "strength") ex.targetReps = String(fd.get("targetReps") || "").trim() || "8–12";
  state.library[id] = ex;
  // parseFloat so an empty field arrives as NaN → DEFAULT_SETS (not 0).
  routineDef(routine).exercises.push(placement(kind, id, parseFloat(fd.get("sets"))));
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
  volumes: renderVolumes,  // weight / reps / banded round-reps → routine + week + block tonnage
  bmi: renderBmi,          // a measurement value → the BMI line
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

// Validate a parsed backup, then swap it in — the one place the structural + version
// gate lives, shared by file Import and Drive Restore so neither can skip it. Returns
// whether it applied; on a bad/incompatible payload it alerts and leaves the Store
// untouched (the all-or-nothing contract — local data is only ever replaced wholesale).
function applyBackup(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.blocks) || !data.blocks.length) {
    window.alert("Could not read that backup.");
    return false;
  }
  // Gate on version explicitly: normalise() resets unknown input to defaults,
  // so without this an incompatible backup would silently wipe current data.
  if (data.version !== 2 && data.version !== 3) {
    window.alert("That backup is from an incompatible version — not importing. Your current data is unchanged.");
    return false;
  }
  setState(normalise(data));
  setEditing(false);
  save(); render(); hydrateNotes();
  return true;
}

function importBackup(file) {
  const r = new FileReader();
  r.onload = function () {
    let data;
    try { data = JSON.parse(r.result); }
    catch (err) { window.alert("Could not read that backup file."); return; }
    applyBackup(data);
  };
  r.readAsText(file);
}

/* ---------------------------------------------------------------------- *
 * Drive backup (Phase 1 of device sync — ADR-0006)                       *
 * The remote transport for the same blob exportBackup serialises: Back   *
 * up overwrites the hidden Drive copy with this device's Store, Restore   *
 * overwrites this device's Store with it. Whole-blob last-write-wins, so  *
 * both confirms surface the Drive copy's age to inform the overwrite.     *
 * ---------------------------------------------------------------------- */

// The Drive copy's modifiedTime as a human, locale-aware stamp for the confirm dialogs.
const fmtDriveTime = (iso) => new Date(iso).toLocaleString();

// Transient "Backed up · 14:32" line beside the Drive buttons (success feedback; errors
// use alert, matching importBackup). The footer isn't re-rendered, so it simply persists.
function driveStatus(text) {
  const el = document.getElementById("drive-status");
  if (el) el.textContent = text;
}

// A closed sign-in popup is the user's choice — stay silent; anything else is the
// generic "couldn't reach Drive" path (offline, blocked popup, API error). The local
// Store is never touched on a failure, so the message can promise it's unchanged.
function driveError(e) {
  if (e && e.cancelled) return;
  window.alert("Couldn't reach Google Drive — you may be offline, or sign-in was blocked. Your data is unchanged.");
}

// Authorise, then locate the existing blob (id + age) — the shared opening both ops need
// before they can show their confirm. Auth is cached for the session, so the second op
// of a back-up-then-restore reuses the token.
async function driveConnect() {
  const t = await authorize();
  return { t, existing: await findBackup(t) };
}

async function drivePush() {
  driveStatus(""); // clear any prior result so the line never contradicts this op's outcome
  let t, existing;
  try { ({ t, existing } = await driveConnect()); }
  catch (e) { return driveError(e); }
  const msg = existing
    ? "Your Drive backup was last updated " + fmtDriveTime(existing.modifiedTime) +
      ".\n\nOverwrite it with this device's data?"
    : "Create a Drive backup from this device's data?";
  if (!window.confirm(msg)) return;
  try {
    const modified = await writeBackup(t, existing, JSON.stringify(state));
    driveStatus("Backed up to Drive · " + fmtDriveTime(modified));
  } catch (e) { driveError(e); }
}

async function drivePull() {
  driveStatus(""); // clear any prior result so the line never contradicts this op's outcome
  let t, existing;
  try { ({ t, existing } = await driveConnect()); }
  catch (e) { return driveError(e); }
  if (!existing) {
    window.alert("No Drive backup found yet — back up from a device that has your data first.");
    return;
  }
  if (!window.confirm("Restore the Drive backup from " + fmtDriveTime(existing.modifiedTime) +
    "?\n\nThis replaces all data on this device.")) return;
  let data;
  try { data = await readBackup(t, existing.id); }
  catch (e) { return driveError(e); }
  if (applyBackup(data)) driveStatus("Restored from Drive · " + fmtDriveTime(existing.modifiedTime));
}

function resetAll() {
  if (!window.confirm("Erase ALL blocks, exercises, and logs and start fresh? This cannot be undone.")) return;
  setState(defaultState());
  setEditing(false);
  save(); render(); hydrateNotes();
}
