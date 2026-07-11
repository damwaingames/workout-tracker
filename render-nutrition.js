/* Nutrition rendering — the food / Open Food Facts view: the header roll-up card, each routine's
 * Nutrition-tab food block, the finder result rows, and the shared macro line. Split out of
 * render.js (which kept growing per feature) as a self-contained cluster — it reads the Store
 * and the pure helpers, calls nothing back in render.js, and the food *logic* already lives in
 * off.js / scan.js, so this is its symmetric view half. render.js imports the three entry points
 * it composes (renderNutrition / renderRoutineFood / nutritionLine); events.js imports
 * foodResultsHTML to patch the finder list in place. */

import { NUTRIENTS, ALL_WEEKS } from "./constants.js";
import { foodKey, esc, fmt } from "./helpers.js";
import { state, currentBlock, nutritionTotals, entryNutrition, routineNutrition, logList } from "./state.js";
import { scanSupported } from "./scan.js";
import { nutritionShareSupported } from "./health.js";

// The per-routine food breakdown moved into each routine card's Nutrition tab (renderRoutineFood);
// this card keeps only the roll-ups — the one place to read how the week is tracking.
export function renderNutrition() {
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
    '<p class="nut-avg muted small">Avg ' + perDay(week) + " this week · " + perDay(all) + " this block</p>" +
    // Publish the whole nutrition projection to Health Connect via the Android share sheet — only
    // where there's something to publish and the browser can share files (Chrome/Android). The
    // companion app receives it (ADR-0015); the write is native. Absent elsewhere, like Scan.
    (all.kcal > 0 && nutritionShareSupported()
      ? '<button type="button" class="ghost nut-publish" data-action="publish-nutrition">Publish to Health Connect</button>'
      : "");
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
export function renderRoutineFood(cell) {
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
export function nutritionLine(n) {
  const macros = macroLine(n);
  return fmt(n.kcal) + " cal" + (macros ? " · " + macros : "");
}
// Just the macros ("65c / 17f / 4p"), kcal omitted — id initials (c/f/p). Shared so the
// routine total, the per-entry rows, and the pick cards format macros identically.
function macroLine(n) {
  return NUTRIENTS.filter((x) => x.id !== "kcal").map((x) => fmt(n[x.id]) + x.id[0]).join(" / ");
}
