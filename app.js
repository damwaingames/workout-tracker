(function () {
  "use strict";

  const WEEKS = 4;
  const STORAGE_KEY = "workout-tracker-v2";

  /* ---------------------------------------------------------------------- *
   * Seed data — straight from the training design doc.                     *
   * ---------------------------------------------------------------------- */
  function S(id, name, setup, targetReps) {
    return { id, name, type: "strength", setup, targetReps };
  }
  function C(id, name) {
    return { id, name, type: "circuit", duration: "1 min", rest: "15 sec", rounds: 2 };
  }

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
    const lib = {};
    list.forEach((e) => (lib[e.id] = e));
    return lib;
  }

  function seedBlock(id, name) {
    // Sets live on each placement, not the exercise — the program's strength days
    // all start at 2 sets; circuits carry none (they use rounds).
    const day = (n, kind, title, focus, ids) => ({
      day: n, kind, title, focus,
      exercises: ids.map((exId) => (kind === "strength" ? { id: exId, sets: 2 } : { id: exId })),
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
    return { version: 2, library: seedLibrary(), blocks: [seedBlock("b1", "Block 1")], log: {}, ui: { block: "b1", week: 1 }, notes: "" };
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
    migrateSets(s);
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
            return ex && ex.type === "strength" ? { id, sets: ex.defaultSets || 2 } : { id };
          });
        }
        delete d.exerciseIds;
      });
    });
    Object.keys(s.library).forEach((id) => delete s.library[id].defaultSets);
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
  function currentBlock() { return state.blocks.find((b) => b.id === state.ui.block) || state.blocks[0]; }
  function currentBlockIndex() { return Math.max(0, state.blocks.findIndex((b) => b.id === state.ui.block)); }
  function dayDef(day) { return currentBlock().days.find((d) => d.day === day); }

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
          const s = readSets(block.id, wk, d.day, exId, p.sets || 2);
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
      readSets(block.id, wk, d.day, p.id, p.sets || 2).forEach((s) => {
        const w = parseFloat(s.w), r = parseFloat(s.r);
        if (w > 0 && r > 0) v += w * r;
      });
    });
    return v;
  }

  /* ---------------------------------------------------------------------- *
   * Render                                                                 *
   * ---------------------------------------------------------------------- */
  function render() { renderHeader(); renderWeek(); renderProgress(); renderVolumes(); }

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
    document.getElementById("week-view").innerHTML =
      '<p class="week-heading">' + esc(block.name) + " · Week " + wk + " of " + WEEKS +
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
      const sets = place.sets || 2;
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
    return body +
      '<div class="day-volume">Day volume <strong data-vol-cell="' + cell + '">0 kg</strong></div>';
  }

  function renderRecovery(d, cell) {
    const moves = d.exercises.map((place) => {
      const exId = place.id;
      const ex = state.library[exId];
      if (!ex) return "";
      const rounds = ex.rounds || 2;
      let checks = "";
      for (let r = 0; r < rounds; r++) {
        checks += '<label class="round"><input type="checkbox" data-k="' + roundKey(cell, exId, r) + '" data-type="check"> R' + (r + 1) + "</label>";
      }
      return '<div class="exercise circuit" data-ex="' + exId + '">' +
        '<div class="ex-head"><span class="ex-name">' + esc(ex.name) + "</span>" +
        '<span class="ex-meta">' + esc(ex.duration || "1 min") + (ex.rest ? " · rest " + esc(ex.rest) : "") + "</span>" +
        (editing ? '<button class="remove" type="button" data-action="remove-exercise" data-day="' + d.day + '" data-ex="' + exId + '" aria-label="Remove">×</button>' : "") +
        '</div><div class="rounds">' + checks + "</div></div>";
    }).join("");
    return moves +
      '<div class="recovery-meta">' +
        '<label class="inline">Energy (1–10)<input type="number" min="1" max="10" data-k="' + cell + '.energy" data-type="text"></label>' +
        '<span class="circuit-note">Repeat the circuit twice — 10 min total.</span>' +
      "</div>";
  }

  function renderRest(cell) {
    return '<p class="rest-note">No structured exercise — focus on hydration, nutrition, and muscle repair.</p>' +
      '<label class="inline block">How your joints / knees feel<input type="text" data-k="' + cell + '.joints" data-type="text" placeholder="e.g. knees happy, left wrist a little tight"></label>';
  }

  function renderAddZone(d) {
    return '<div class="add-zone">' +
      '<button class="add-btn" type="button" data-action="add-open" data-day="' + d.day + '">＋ Add exercise</button>' +
      '<div class="picker" hidden>' +
        '<input type="text" class="picker-search" data-day="' + d.day + '" placeholder="Search exercises…">' +
        '<div class="picker-list"></div>' +
        '<button class="link" type="button" data-action="new-ex-open" data-day="' + d.day + '">＋ Create a new exercise</button>' +
        '<form class="new-ex-form" data-day="' + d.day + '" hidden>' +
          '<input name="name" placeholder="Exercise name" required>' +
          '<select name="type"><option value="strength">Strength — weight × reps</option><option value="circuit">Circuit — timed</option></select>' +
          '<input name="setup" placeholder="How-to / setup (optional)">' +
          '<input name="targetReps" placeholder="Target reps" value="8–12">' +
          '<label class="sets-field">Sets <input name="sets" type="number" min="1" max="6" value="2"></label>' +
          '<div class="form-actions"><button type="submit">Add to day</button><button type="button" class="link" data-action="new-ex-cancel">Cancel</button></div>' +
        "</form>" +
      "</div></div>";
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

  // Day volumes for the visible week, plus week and block tonnage totals.
  // Updated live (not via re-render) when a weight/reps field changes.
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

  function populatePicker(picker, day, query) {
    const list = picker.querySelector(".picker-list");
    const on = {};
    dayDef(day).exercises.forEach((p) => (on[p.id] = true));
    const q = (query || "").trim().toLowerCase();
    const items = Object.keys(state.library)
      .map((id) => state.library[id])
      .filter((ex) => !on[ex.id] && (!q || ex.name.toLowerCase().indexOf(q) >= 0))
      .sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = items.length
      ? items.map((ex) =>
          '<button class="pick" type="button" data-action="add-ex" data-day="' + day + '" data-ex="' + ex.id + '">' +
          esc(ex.name) + ' <span class="tag">' + (ex.type === "circuit" ? "circuit" : esc(ex.targetReps || "")) + "</span></button>"
        ).join("")
      : '<p class="muted small">No matches — create a new one below.</p>';
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
          p.sets = Math.min(6, Math.max(1, (p.sets || 2) + (el.dataset.action === "sets-inc" ? 1 : -1)));
          save(); render();
        }
        break;
      }
      case "add-open": {
        const picker = el.closest(".add-zone").querySelector(".picker");
        picker.hidden = !picker.hidden;
        if (!picker.hidden) {
          populatePicker(picker, day, "");
          const s = picker.querySelector(".picker-search");
          if (s) s.focus();
        }
        break;
      }
      case "add-ex": {
        const ex = state.library[el.dataset.ex];
        dayDef(day).exercises.push(ex && ex.type === "strength" ? { id: ex.id, sets: 2 } : { id: el.dataset.ex });
        save(); render(); break;
      }
      case "new-ex-open": {
        const picker = el.closest(".picker");
        picker.querySelector(".new-ex-form").hidden = false;
        el.hidden = true;
        const n = picker.querySelector('[name="name"]');
        if (n) n.focus();
        break;
      }
      case "new-ex-cancel": {
        const form = el.closest(".new-ex-form");
        form.hidden = true; form.reset();
        const link = el.closest(".picker").querySelector('[data-action="new-ex-open"]');
        if (link) link.hidden = false;
        break;
      }
      case "export": exportBackup(); break;
      case "reset": resetAll(); break;
    }
  }

  function handleSubmit(e) {
    const form = e.target.closest(".new-ex-form");
    if (!form) return;
    e.preventDefault();
    const day = Number(form.dataset.day);
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    if (!name) return;
    const type = fd.get("type") === "circuit" ? "circuit" : "strength";
    const id = uniqueId(slugify(name), (x) => state.library[x]);
    const ex = { id, name, type };
    const setup = String(fd.get("setup") || "").trim();
    if (setup) ex.setup = setup;
    if (type === "strength") {
      ex.targetReps = String(fd.get("targetReps") || "").trim() || "8–12";
    } else {
      ex.duration = "1 min"; ex.rest = "15 sec"; ex.rounds = 2;
    }
    state.library[id] = ex;
    const sets = Math.min(6, Math.max(1, Number(fd.get("sets")) || 2));
    dayDef(day).exercises.push(type === "strength" ? { id, sets } : { id });
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
    if (el.id === "block-select") { state.ui.block = el.value; state.ui.week = 1; save(); render(); return; }
    if (el.classList.contains("picker-search")) {
      const p = el.closest(".picker");
      if (p) populatePicker(p, Number(el.dataset.day), el.value);
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
    }
  }

  function afterDone(el, k) {
    const cell = k.slice(0, -5);
    if (el.checked && !state.log[cell + ".date"]) setLog(cell + ".date", today());
    // Re-render rather than hand-patch the date input and is-done class —
    // hydrate() already owns both, so there's no separate path to keep in sync.
    renderWeek();
    renderProgress();
    renderVolumes();
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
      days: src.days.map((d) => ({ day: d.day, kind: d.kind, title: d.title, focus: d.focus, exercises: d.exercises.map((p) => ({ ...p })) })),
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
      } catch (err) {
        window.alert("Could not read that backup file.");
        return;
      }
      if (!data || typeof data !== "object" || !Array.isArray(data.blocks) || !data.blocks.length) {
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

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();
