# Workout Tracker

A personal, client-side **4-week full-body & glute training tracker**, installable as an offline PWA.

**Live:** https://damwaingames.github.io/workout-tracker/

## What it does

- **Strength days** — log every set as **weight (kg) × reps**; the previous session's numbers appear as a ghost placeholder so you always know what to beat. Each exercise carries its own rep target and a tap-to-expand how-to.
- **Volume tracking** — each day totals its tonnage (sum of weight × reps over all sets), rolled up to week and block totals shown in the header. Each exercise carries a **loading mode** so the tonnage reflects how it's really done: _two dumbbells_ counts the weight twice (you log one dumbbell), _per side_ counts the reps twice (you log one side), or _both sides_ (the default) counts it as entered.
- **Resistance bands** — mark a move as **banded** and it logs a band tier (X-Light → X-Heavy, each with an approximate kg) plus reps instead of a typed weight; tonnage is band kg × reps. You pick the band **per session** (it defaults to the exercise's usual band), so moving up a band week to week shows as progression. Banded moves count even on recovery days — a banded circuit move logs reps per round, and that day starts showing a volume total. A banded move can also be **per side** (the reps double, as with free weights).
- **Recovery days** — a configurable circuit: set the **rounds**, **work** per station, **rest** between stations, and **rest** between rounds (seconds), and the estimated total workout time is calculated for you. Tap through each move's rounds and log an energy score.
- **Body stats** — a weekly Measurements card tracks bodyweight (kg) and any circumferences you add (waist, chest, hips, etc.) per block/week, with the previous reading shown as a ghost and BMI auto-computed once you set your height.
- **Nutrition** — a daily grid for logging calories (kcal) and carbs / fat / protein (g), copied from whatever app you track in, with running week and block totals and an average kcal/day.
- **Classes** — log an extra session on any day (a yoga, pilates, or box-fit class, say) with a type, a free-text note of what you did, and a time in minutes. Add as many as you like per day; the type list is editable (type a new one and it's remembered — matched case-insensitively, so "box-fit" and "Box-Fit" stay one type). Each type carries a **burn rate** (kcal/min/kg, editable in **Edit** mode), so a class estimates a **calorie burn** from `rate × minutes × your bodyweight` (taken from the Measurements card). Minutes and estimated kcal roll up to week and block totals in the header, alongside Volume.
- **Holiday days** — define one **Holiday Workout** (a band-only day, in **Edit** mode), then tick the 🏝 toggle on any day to swap it in for that day while you're away from your kit. It logs separately, so your normal exercises stay un-logged that week and their progression picks up against your last normal session when the day comes round again. Works on any day kind; untick to restore the day.
- **Repeatable blocks** — each block is one 4-week run. **＋ Block** clones the program so you keep all history; progression carries across the boundary. Rename the current block in **Edit** mode.
- **Editable library** — in **Edit** mode, add or create exercises and moves, remove them, adjust how many sets a strength exercise gets, set its loading mode (both sides / per side / two dumbbells), or mark it **banded** and choose its default band. The picker matches the day: strength days offer strength exercises, recovery days offer circuit moves. New entries are saved for reuse in future blocks.
- **Offline** — works without a connection once installed; everything is stored in your browser's `localStorage`.

## Run locally

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

(Opening `index.html` directly works too, minus the service worker.)

## Install on a phone

Open the live URL on your phone → **Share → Add to Home Screen**.

## Data & backups

All data lives in `localStorage` on whichever device you use — there is no server and no sync between devices. Use **Export backup** / **Import backup** (JSON) to move or safeguard your history.

## Updating

Push to `main`; GitHub Pages redeploys automatically. Each release carries a semver version, shown in the footer (`vX.Y.Z`). When you change `index.html`, `styles.css`, or any of the JS modules, bump `APP_VERSION` in `constants.js` and the matching `CACHE` in `sw.js` (kept in lockstep) so installed devices pick up the new version on next launch. If you add a **new** JS module, also add it to `ASSETS` in `sw.js` — otherwise an offline launch serves an incomplete shell.

## Code layout

The app is plain ES modules (no build step), loaded from `index.html` via `<script type="module" src="./main.js">`:

- `constants.js` — shared constants (`APP_VERSION`, bounds, `CIRCUIT_DEFAULTS`).
- `helpers.js` — pure helpers: log-key grammar, clamps, formatting, circuit maths.
- `state.js` — seed data, the mutable store (`state`/`editing` + setters), schema migrations, persistence, and the queries that read over the store.
- `render.js` — turns the store into DOM (plus the focus-preserving live patchers).
- `events.js` — click / submit / field handlers and the block & backup operations.
- `main.js` — entry point: load, wire listeners, first render, register the service worker.

Imports flow one way (`constants ← helpers ← state ← render ← events ← main`), so there are no circular dependencies.

## Tests

End-to-end checks (Playwright) live in [`tests/`](tests/) and drive real events against the live DOM, asserting behaviour plus zero console errors. Dev-only — they don't affect the deployed app.

```bash
cd tests
npm install     # installs Playwright + Chromium
npm test        # serves the app on a temp port and runs every verify-*.mjs
```

See [`tests/README.md`](tests/README.md) for running a single script or pointing the suite at the live deploy.

## Icons

Regenerate the app icons with:

```bash
python3 tools/gen_icons.py icons
```
