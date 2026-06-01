(function () {
  "use strict";

  const WEEKS = 4;
  const STORAGE_KEY = "workout-tracker-v2";
  const MIN_SETS = 1, MAX_SETS = 6, DEFAULT_SETS = 2;
  const MIN_ROUNDS = 1, MAX_ROUNDS = 6;
  // A recovery day's circuit timing (all seconds, except rounds). These defaults
  // reproduce the original hardcoded behaviour: 2 rounds, 1 min stations, 15 sec
  // rest between stations, no rest between rounds.
  const CIRCUIT_DEFAULTS = { rounds: 2, workSec: 60, restSec: 15, roundRestSec: 0 };
  // Human-facing release version (semver), surfaced in the footer. Bump on each
  // deploy and keep CACHE in sw.js in lockstep — it carries the same number.
  const APP_VERSION = "1.2.0";

  /* ---------------------------------------------------------------------- *
   * Seed data — straight from the training design doc.                     *
   * ---------------------------------------------------------------------- */
  function S(id, name, setup, targetReps) {
    return { id, name, type: "strength", setup, targetReps };
  }
  // Circuit moves are just a name + type now — rounds and timing live on the day
  // (the circuit), not the individual move.
  function C(id, name) {
    return { id, name, type: "circuit" };
  }
  // A catalogue is an {id → record} map; both the exercise library and the
  // measurement catalogue are built this way.
  function keyById(list) { const o = {}; list.forEach((x) => (o[x.id] = x)); return o; }

  function seedLibrary() {
    const list = [
      S("goblet-squats", "Goblet Squats", "Hold a single dumbbell vertically against your chest.", "8–12"),
      S("bent-over-rows", "Bent Over Rows", "Hinge at the hips with a flat back, dumbbells hanging down. Pull your elbows up.", "8–12"),
      S("banded-clamshells", "Banded Clamshells", "Loop a resistance band around your thighs just above the knees. Open your knees out.", "10–15"),
      S("bicep-curls", "Bicep Curls", "Palms facing forward, curl the weights up keeping your elbows tucked at your sides.", "8–12"),
      S("wrist-curls", "Wrist Curls", "Forearms resting on thighs, palms facing up. Curl your wrists upward.", "8–12"),
      S("dumbbell-rdls", "Dumbbell RDLs", "Romanian deadlifts. Soft knees, push your hips straight back, slide the weights down your thighs.", "8–12"),
      S("floor-chest-presses", "Floor Chest Presses", "Lie on your back on the floor or a firm mattress. Press the dumbbells up.", "8–12"),
      S("glute-bridges", "Glute Bridges", "Lie on your back, knees bent, feet flat. Squeeze your glutes and lift your hips.", "10–15"),
      S("overhead-shoulder-presses", "Overhead Shoulder Presses", "Sit or stand tall. Press the dumbbells from shoulder height up overhead.", "8–12"),
      S("crunches", "Crunches", "Lie on your back, lift your shoulder blades slightly using your upper abs.", "8–12"),
      S("sumo-squats", "Sumo Squats", "Wide stance, toes pointed out. Hold one dumbbell down between your legs.", "8–12"),
      S("dumbbell-lateral-raises", "Dumbbell Lateral Raises", "Raise your arms straight out to the sides until parallel with the floor.", "8–12"),
      S("donkey-kicks", "Donkey Kicks", "On hands and knees (or leaning over a table). Drive one heel toward the ceiling.", "10–15 each leg"),
      S("dumbbell-tricep-extensions", "Dumbbell Tricep Extensions", "Hold a dumbbell overhead with both hands, bend your elbows behind your head, then extend.", "8–12"),
      S("wrist-extensions", "Wrist Extensions", "Forearms resting on thighs, palms facing down. Curl your wrists upward.", "8–12"),
      C("high-knees", "High Knees"),
      C("wall-press-ups", "Wall Press-Ups"),
      C("glute-squeezes", "Glute Squeezes"),
      C("calf-raises", "Calf Raises"),
      C("chest-opener-stretch", "Chest Opener Stretch"),
      C("banded-hip-abductions", "Banded Hip Abductions"),
      C("hollow-body-holds", "Hollow Body Holds"),
      C("seated-forward-fold-stretch", "Seated Forward Fold Stretch"),
      C("quad-stretch", "Quad Stretch"),
      C("childs-pose-or-seated-torso-twist", "Child's Pose or Seated Torso Twist"),
    ];
    return keyById(list);
  }

  // Body-measurement catalogue. Bodyweight is the only mass (kg); circumferences
  // are cm. The user tracks a subset (state.tracked) and can add their own.
  function M(id, name, unit) { return { id, name, unit }; }
  function seedMeasurements() {
    const list = [
      M("bodyweight", "Bodyweight", "kg"),
      M("waist", "Waist", "cm"),
      M("chest", "Chest", "cm"),
      M("hips", "Hips", "cm"),
      M("thigh", "Thigh", "cm"),
      M("calf", "Calf", "cm"),
      M("bicep", "Bicep", "cm"),
      M("forearm", "Forearm", "cm"),
      M("neck", "Neck", "cm"),
    ];
    return keyById(list);
  }

  function seedBlock(id, name) {
    // Sets live on each placement, not the exercise — the program's strength days
    // all start at 2 sets; circuit placements carry none (rounds/timing live on
    // the recovery day itself).
    const day = (n, kind, title, focus, ids) => ({
      day: n, kind, title, focus,
      exercises: ids.map((exId) => placement(kind, exId, DEFAULT_SETS)),
      ...(kind === "recovery" ? { ...CIRCUIT_DEFAULTS } : {}),
    });
    return {
      id, name, createdAt: today(),
      days: [
        day(1, "strength", "Workout A", "Squat & Row", ["goblet-squats", "bent-over-rows", "banded-clamshells", "bicep-curls", "wrist-curls"]),
        day(2, "recovery", "Recovery A", "Cardio Flush", ["high-knees", "wall-press-ups", "glute-squeezes", "calf-raises", "chest-opener-stretch"]),
        day(3, "strength", "Workout B", "Hinge & Press", ["dumbbell-rdls", "floor-chest-presses", "glute-bridges", "overhead-shoulder-presses", "crunches"]),
        day(4, "recovery", "Recovery B", "Glute & Core Activation", ["banded-hip-abductions", "hollow-body-holds", "glute-squeezes", "calf-raises", "seated-forward-fold-stretch"]),
        day(5, "strength", "Workout C", "Sumo & Accessory", ["sumo-squats", "dumbbell-lateral-raises", "donkey-kicks", "dumbbell-tricep-extensions", "wrist-extensions"]),
        day(6, "recovery", "Recovery C", "Mobility & Length", ["high-knees", "wall-press-ups", "banded-hip-abductions", "quad-stretch", "childs-pose-or-seated-torso-twist"]),
        day(7, "rest", "Rest Day", "Complete Decompression", []),
      ],
    };
  }

  function defaultState() {
    return {
      version: 2, library: seedLibrary(), blocks: [seedBlock("b1", "Block 1")],
      log: {}, ui: { block: "b1", week: 1 }, notes: "",
      // Body stats: the measurement catalogue, the user's tracked subset, and a
      // one-time profile (height → BMI). Weekly values live in `log` (measureKey).
      measurements: seedMeasurements(), tracked: ["bodyweight"], profile: {},
    };
  }

  /* ---------------------------------------------------------------------- *
   * State                                                                  *
   * ---------------------------------------------------------------------- */
  let state;
  let editing = false;

  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function normalise(s) {
    if (!s || s.version !== 2 || !Array.isArray(s.blocks) || !s.blocks.length) return defaultState();
    if (!s.log) s.log = {};
    if (!s.library) s.library = seedLibrary();
    // Body stats are additive — older v2 saves predate them, so backfill the
    // defaults rather than bumping the schema version (keeps old backups importable).
    if (!s.measurements) s.measurements = seedMeasurements();
    if (!Array.isArray(s.tracked)) s.tracked = ["bodyweight"];
    if (!s.profile || typeof s.profile !== "object") s.profile = {};
    migrateSets(s);
    migrateCircuit(s);
    if (!s.ui || !s.blocks.some((b) => b.id === s.ui.block)) s.ui = { block: s.blocks[0].id, week: 1 };
    if (typeof s.notes !== "string") s.notes = "";
    return s;
  }

  // Sets moved off the library record (defaultSets) onto each day's placement:
  // exerciseIds[] → exercises[{ id, sets }]. Idempotent — a no-op once migrated.
  function migrateSets(s) {
    s.blocks.forEach((b) => {
      (b.days || []).forEach((d) => {
        if (!Array.isArray(d.exercises)) {
          const ids = Array.isArray(d.exerciseIds) ? d.exerciseIds : [];
          d.exercises = ids.map((id) => {
            const ex = s.library[id];
            return placement(ex && ex.type, id, ex && ex.defaultSets);
          });
        }
        delete d.exerciseIds;
      });
    });
    Object.keys(s.library).forEach((id) => delete s.library[id].defaultSets);
  }

  // Circuit timing moved from the per-move library record onto the recovery day.
  // Backfill the day-level fields for older saves; the defaults match the prior
  // hardcoded behaviour. Additive + idempotent (a no-op once present).
  function migrateCircuit(s) {
    s.blocks.forEach((b) => {
      (b.days || []).forEach((d) => {
        if (d.kind !== "recovery") return;
        if (typeof d.rounds !== "number") d.rounds = CIRCUIT_DEFAULTS.rounds;
        if (typeof d.workSec !== "number") d.workSec = CIRCUIT_DEFAULTS.workSec;
        if (typeof d.restSec !== "number") d.restSec = CIRCUIT_DEFAULTS.restSec;
        if (typeof d.roundRestSec !== "number") d.roundRestSec = CIRCUIT_DEFAULTS.roundRestSec;
      });
    });
  }

  function load() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { parsed = null; }
    state = normalise(parsed);
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  /* ---------------------------------------------------------------------- *
   * Helpers                                                                *
   * ---------------------------------------------------------------------- */
  const cellKey = (blockId, wk, day) => blockId + ".w" + wk + ".d" + day;
  // The log-key grammar lives here and nowhere else — renderers (data-k) and
  // readers must build keys through these so the format stays authoritative.
  const setKey = (cell, exId, i, f) => cell + ".ex." + exId + ".s" + i + "." + f; // f: "w" | "r"
  const roundKey = (cell, exId, r) => cell + ".ex." + exId + ".r" + r;
  // Weekly body measurement (one value per block/week/measurement). Shares
  // state.log — the ".m." segment can't collide with a day's ".dN" cells, and
  // the block.id prefix means deleteBlock's purge sweeps these up for free.
  const measureKey = (blockId, wk, mId) => blockId + ".w" + wk + ".m." + mId;
  function currentBlock() { return state.blocks.find((b) => b.id === state.ui.block) || state.blocks[0]; }
  function currentBlockIndex() { return Math.max(0, state.blocks.findIndex((b) => b.id === state.ui.block)); }
  function dayDef(day) { return currentBlock().days.find((d) => d.day === day); }

  // Clamp a set count into [MIN_SETS, MAX_SETS]; non-numeric (missing) → DEFAULT_SETS.
  // NB: 0 must clamp to MIN_SETS, so we can't use `|| DEFAULT_SETS` (0 is falsy).
  function clampSets(n) {
    n = Math.round(n);
    return Number.isFinite(n) ? Math.min(MAX_SETS, Math.max(MIN_SETS, n)) : DEFAULT_SETS;
  }
  // The single place that knows a placement's shape: strength placements own a
  // (clamped) set count; circuit placements carry none (the day owns the timing).
  function placement(type, id, sets) {
    return type === "strength" ? { id, sets: clampSets(sets) } : { id };
  }
  // The exercise type a day accepts: strength days take strength exercises,
  // every other non-rest day (recovery) takes circuits. The single source of the
  // day-kind ↔ exercise-type rule, so the picker and the create form agree and a
  // mismatched placement can't be built.
  function kindType(kind) { return kind === "strength" ? "strength" : "circuit"; }

  function clampRounds(n) {
    n = Math.round(n);
    return Number.isFinite(n) ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, n)) : CIRCUIT_DEFAULTS.rounds;
  }
  const nonNegSec = (n) => { n = Math.round(+n); return Number.isFinite(n) && n > 0 ? n : 0; };
  // A recovery day's circuit settings, normalised (defaults applied, types coerced).
  // The single read-side accessor so the renderer and the time maths agree.
  function circuitOf(d) {
    return {
      rounds: clampRounds(d.rounds),
      workSec: nonNegSec(d.workSec),
      restSec: nonNegSec(d.restSec),
      roundRestSec: nonNegSec(d.roundRestSec),
    };
  }
  // Estimated total seconds for a circuit. Rest sits strictly between stations
  // within a round ((stations − 1) gaps) and between rounds ((rounds − 1) gaps),
  // so the workout ends on a work interval — nothing trailing.
  function circuitTime(stations, c) {
    if (stations <= 0) return 0;
    return c.rounds * stations * c.workSec +
      c.rounds * (stations - 1) * c.restSec +
      (c.rounds - 1) * c.roundRestSec;
  }
  // "90 sec" / "1 min" / "12 min 30 sec".
  function fmtSecs(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + " sec";
    const m = Math.floor(sec / 60), s = sec % 60;
    return s ? m + " min " + s + " sec" : m + " min";
  }
  // The one-line circuit summary shown under a recovery day: structure + estimate.
  function circuitSummary(d) {
    const c = circuitOf(d);
    const parts = [
      c.rounds + " round" + (c.rounds === 1 ? "" : "s"),
      fmtSecs(c.workSec) + " work",
      fmtSecs(c.restSec) + " rest",
    ];
    if (c.roundRestSec > 0) parts.push(fmtSecs(c.roundRestSec) + " between rounds");
    return parts.join(" · ") + " · ≈ " + fmtSecs(circuitTime(d.exercises.length, c));
  }

  function setLog(k, v) {
    if (v === "" || v === false || v == null) delete state.log[k];
    else state.log[k] = v;
    save();
  }

  function slugify(s) { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function uniqueId(base, has) {
    base = base || "exercise";
    let id = base, n = 2;
    while (has(id)) id = base + "-" + n++;
    return id;
  }
  function nextBlockNumber() {
    let max = 0;
    state.blocks.forEach((b) => { const m = /(\d+)/.exec(b.name || ""); if (m) max = Math.max(max, +m[1]); });
    return max + 1;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function fmt(n) { return Math.round(n).toLocaleString(); }

  function readSets(blockId, wk, day, exId, sets) {
    const cell = cellKey(blockId, wk, day);
    return Array.from({ length: sets }, (_, i) => ({
      w: state.log[setKey(cell, exId, i, "w")] || "",
      r: state.log[setKey(cell, exId, i, "r")] || "",
    }));
  }

  // The most recent earlier logged instance of an exercise — last week within a
  // block, or the previous block's last occurrence at a block boundary.
  function previousSets(exId, curBlockIdx, curWeek, curDay) {
    if (!state.library[exId]) return null;
    // A single monotonic rank over (block, week, day) — day ≤ 7 so *8 never
    // collides. Used both to filter "earlier than the cursor" and to pick the latest.
    const rank = (bi, wk, day) => (bi * (WEEKS + 1) + wk) * 8 + day;
    const cutoff = rank(curBlockIdx, curWeek, curDay);
    let best = null;
    state.blocks.forEach((block, bi) => {
      block.days.forEach((d) => {
        const p = d.exercises.find((x) => x.id === exId);
        if (!p) return;
        for (let wk = 1; wk <= WEEKS; wk++) {
          const order = rank(bi, wk, d.day);
          if (order >= cutoff) continue;
          const s = readSets(block.id, wk, d.day, exId, p.sets || DEFAULT_SETS);
          if (s.some((x) => x.w || x.r) && (!best || order > best.order)) best = { order, sets: s };
        }
      });
    });
    return best ? best.sets : null;
  }

  // Training volume (tonnage) for one day: sum of weight × reps over every
  // logged set. Only strength days carry load; circuits/rest contribute 0.
  function dayVolume(block, wk, d) {
    if (d.kind !== "strength") return 0;
    let v = 0;
    d.exercises.forEach((p) => {
      readSets(block.id, wk, d.day, p.id, p.sets || DEFAULT_SETS).forEach((s) => {
        const w = parseFloat(s.w), r = parseFloat(s.r);
        if (w > 0 && r > 0) v += w * r;
      });
    });
    return v;
  }

  // Most recent earlier value of a measurement, scanning (block, week) like
  // previousSets but without days — measurements are weekly, not per-day.
  function previousMeasure(mId, curBlockIdx, curWeek) {
    const rank = (bi, wk) => bi * (WEEKS + 1) + wk;
    const cutoff = rank(curBlockIdx, curWeek);
    let best = null;
    state.blocks.forEach((block, bi) => {
      for (let wk = 1; wk <= WEEKS; wk++) {
        const order = rank(bi, wk);
        if (order >= cutoff) continue;
        const v = state.log[measureKey(block.id, wk, mId)];
        if (v != null && v !== "" && (!best || order > best.order)) best = { order, value: v };
      }
    });
    return best ? best.value : null;
  }

  // BMI for a week = bodyweight / height² (metric). Null unless both a stored
  // height and that week's bodyweight are present.
  function bmiFor(block, wk) {
    const h = parseFloat(state.profile && state.profile.heightCm);
    const w = parseFloat(state.log[measureKey(block.id, wk, "bodyweight")]);
    if (!(h > 0) || !(w > 0)) return null;
    const m = h / 100;
    return w / (m * m);
  }

  /* ---------------------------------------------------------------------- *
   * Render                                                                 *
   * ---------------------------------------------------------------------- */
  function render() { renderHeader(); renderWeek(); renderProgress(); renderVolumes(); renderMeasurements(); }

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
    else if (d.kind === "recovery") body = renderRecovery(d, cell);
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

  function renderStrength(d, wk, cell) {
    const bi = currentBlockIndex();
    const body = d.exercises.map((place) => {
      const exId = place.id;
      const ex = state.library[exId];
      if (!ex) return "";
      const sets = place.sets || DEFAULT_SETS;
      const prev = previousSets(exId, bi, wk, d.day);
      let rows = "";
      for (let i = 0; i < sets; i++) {
        const p = prev && prev[i];
        rows +=
          '<div class="set"><span class="set-n">Set ' + (i + 1) + "</span>" +
          '<input type="number" inputmode="decimal" class="w" data-k="' + setKey(cell, exId, i, "w") + '" data-type="text" placeholder="' + (p && p.w ? esc(p.w) : "wt") + '">' +
          '<span class="unit">kg</span>' +
          '<span class="x">×</span>' +
          '<input type="number" inputmode="numeric" class="r" data-k="' + setKey(cell, exId, i, "r") + '" data-type="text" placeholder="' + (p && p.r ? esc(p.r) : "reps") + '"></div>';
      }
      const last = prev
        ? '<div class="last">Last: ' + prev.map((s) => (s.w ? esc(s.w) + " kg × " : "") + (s.r ? esc(s.r) : "–")).join(", ") + "</div>"
        : "";
      const setsEdit = editing
        ? '<div class="sets-edit">Sets <button class="step" type="button" data-action="sets-dec" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Fewer sets">−</button>' +
          '<span class="sets-count">' + sets + "</span>" +
          '<button class="step" type="button" data-action="sets-inc" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="More sets">＋</button></div>'
        : "";
      return '<div class="exercise" data-ex="' + exId + '">' +
        '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
        (ex.targetReps ? '<span class="ex-target">' + esc(ex.targetReps) + "</span>" : "") +
        (ex.setup ? '<button class="info" type="button" data-action="toggle-setup" aria-label="How to do this">ⓘ</button>' : "") +
        (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
        "</div>" +
        (ex.setup ? '<div class="setup">' + esc(ex.setup) + "</div>" : "") +
        setsEdit +
        '<div class="sets">' + rows + "</div>" + last +
        "</div>";
    }).join("");
    // Compute the day's volume inline so a fresh render is already correct;
    // renderVolumes() only re-patches this during live (keystroke) edits.
    return body +
      '<div class="day-volume">Day volume <strong data-vol-cell="' + cell + '">' + fmt(dayVolume(currentBlock(), wk, d)) + " kg</strong></div>";
  }

  function renderRecovery(d, cell) {
    const rounds = circuitOf(d).rounds; // how many R-checkboxes each station shows
    const moves = d.exercises.map((place) => {
      const exId = place.id;
      const ex = state.library[exId];
      if (!ex) return "";
      let checks = "";
      for (let r = 0; r < rounds; r++) {
        checks += '<label class="round"><input type="checkbox" data-k="' + roundKey(cell, exId, r) + '" data-type="check"> R' + (r + 1) + "</label>";
      }
      return '<div class="exercise circuit" data-ex="' + exId + '">' +
        '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
        (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
        '</div><div class="rounds">' + checks + "</div></div>";
    }).join("");
    return moves +
      (editing ? renderCircuitEdit(d) : "") +
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
      ' <input type="number" inputmode="numeric" min="0" class="circuit-field" data-day="' + d.day + '" data-field="' + field + '" value="' + val + '">s</label>';
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
  function patchCircuitTime(d) {
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
        '<input type="text" class="picker-search" placeholder="' + o.searchPlaceholder + '">' +
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
  function renderVolumes() {
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
  function renderBmi() {
    const line = document.getElementById("bmi-line");
    if (!line) return;
    const b = bmiFor(currentBlock(), state.ui.week);
    const out = document.getElementById("bmi-value");
    if (b == null) { line.hidden = true; if (out) out.textContent = ""; }
    else { line.hidden = false; if (out) out.textContent = b.toFixed(1); }
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

  function hydrateNotes() {
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
  function repopulate(zone, query) {
    const picker = zone.querySelector(".picker");
    if (!picker) return;
    if (zone.dataset.picker === "measure") populateMeasurePicker(picker, query);
    else populatePicker(picker, Number(zone.dataset.day), query);
  }

  /* ---------------------------------------------------------------------- *
   * Events                                                                 *
   * ---------------------------------------------------------------------- */
  function handleClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const day = el.dataset.day ? Number(el.dataset.day) : null;
    switch (el.dataset.action) {
      case "week":
        state.ui.week = Number(el.dataset.week); save(); render(); break;
      case "new-block": newBlock(); break;
      case "delete-block": deleteBlock(); break;
      case "edit-block": editing = !editing; render(); break;
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
      case "picker-new-open": {
        const picker = el.closest(".picker");
        picker.querySelector(".picker-form").hidden = false;
        el.hidden = true;
        const n = picker.querySelector('[name="name"]');
        if (n) n.focus();
        break;
      }
      case "picker-new-cancel": {
        const form = el.closest(".picker-form");
        form.hidden = true; form.reset();
        const link = el.closest(".picker").querySelector('[data-action="picker-new-open"]');
        if (link) link.hidden = false;
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
      case "export": exportBackup(); break;
      case "reset": resetAll(); break;
    }
  }

  function handleSubmit(e) {
    const form = e.target.closest(".picker-form");
    if (!form) return;
    e.preventDefault();
    const zone = form.closest(".add-zone");
    if (zone && zone.dataset.picker === "measure") return addNewMeasurement(form);
    addNewExercise(form, zone ? Number(zone.dataset.day) : NaN);
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

  function handleField(e) {
    const el = e.target;
    if (el.id === "import-input") {
      if (el.files && el.files[0]) importBackup(el.files[0]);
      el.value = "";
      return;
    }
    if (el.id === "notes-field") { state.notes = el.value; save(); return; }
    if (el.id === "block-name-input") {
      const block = currentBlock();
      block.name = el.value;
      save();
      // Hand-patch the picker label instead of a full render (which would steal
      // focus mid-type). Log keys use block.id, never the name, so nothing re-keys.
      const opt = document.querySelector('#block-select option[value="' + block.id + '"]');
      if (opt) opt.textContent = el.value;
      return;
    }
    if (el.id === "block-select") { state.ui.block = el.value; state.ui.week = 1; save(); render(); return; }
    if (el.id === "height-input") {
      const v = parseFloat(el.value);
      state.profile.heightCm = Number.isFinite(v) && v > 0 ? v : null;
      save(); renderBmi(); return;
    }
    if (el.classList.contains("picker-search")) {
      const zone = el.closest(".add-zone");
      if (zone) repopulate(zone, el.value);
      return;
    }
    if (el.classList.contains("circuit-field")) {
      const d = dayDef(Number(el.dataset.day));
      if (d) { d[el.dataset.field] = nonNegSec(el.value); save(); patchCircuitTime(d); }
      return;
    }
    const k = el.dataset.k;
    if (!k) return;
    if (el.dataset.type === "check") {
      setLog(k, el.checked);
      if (k.slice(-5) === ".done") afterDone(el, k);
    } else {
      setLog(k, el.value);
      if (el.classList.contains("w") || el.classList.contains("r")) renderVolumes();
      else if (el.classList.contains("measure-val")) renderBmi();
    }
  }

  function afterDone(el, k) {
    const cell = k.slice(0, -5);
    if (el.checked && !state.log[cell + ".date"]) setLog(cell + ".date", today());
    // Full re-render: the date stamp + is-done styling flow through hydrate()
    // rather than a separate hand-patch path. Nothing is focused after a tick.
    render();
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
    editing = true;
    save(); render();
  }

  function deleteBlock() {
    if (state.blocks.length <= 1) return;
    const b = currentBlock();
    if (!window.confirm("Delete " + b.name + " and all of its logged data? This cannot be undone.")) return;
    Object.keys(state.log).forEach((k) => { if (k.indexOf(b.id + ".") === 0) delete state.log[k]; });
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
      state = normalise(data);
      editing = false;
      save(); render(); hydrateNotes();
    };
    r.readAsText(file);
  }

  function resetAll() {
    if (!window.confirm("Erase ALL blocks, exercises, and logs and start fresh? This cannot be undone.")) return;
    state = defaultState();
    editing = false;
    save(); render(); hydrateNotes();
  }

  /* ---------------------------------------------------------------------- *
   * Init                                                                   *
   * ---------------------------------------------------------------------- */
  load();
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleField);
  // File inputs don't fire "input" — bind the importer's change directly so every
  // other field is handled once (via "input") rather than twice (input + change).
  document.getElementById("import-input").addEventListener("change", handleField);
  render();
  hydrateNotes();
  const versionTag = document.getElementById("version-tag");
  if (versionTag) versionTag.textContent = "v" + APP_VERSION;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();
