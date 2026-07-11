# Workout Tracker

A personal, client-side **4-week full-body & glute training tracker**, installable as an offline PWA.

**Live:** https://damwaingames.github.io/workout-tracker/

## What it does

- **Weekly schedule** — your seven **routines** are laid out across real weekdays. Each block has a **start date** (this week's Monday by default, editable in **Edit** mode), and every routine shows the actual **date** it falls on — derived from the schedule, never hand-typed, so days can't drift out of order. Rearrange the week with up/down arrows in **Edit** mode: a pure reordering (all seven routines still happen each week, just in the order you train them); a week you haven't rearranged follows the most recent one you did.
- **Strength routines** — log every set as **weight (kg) × reps**; the previous session's numbers appear as a ghost placeholder so you always know what to beat. Each exercise carries its own rep target and a tap-to-expand how-to.
- **Volume tracking** — each routine totals its tonnage (sum of weight × reps over all sets), rolled up to week and block totals shown in the header. The volume line also shows a **progressive-overload delta** vs the **same routine last week** — tracked by routine, so it holds even when you move that routine to a different weekday (a green `+N kg` when you've gone heavier, amber when lighter). Each exercise carries a **loading mode** so the tonnage reflects how it's really done: _two dumbbells_ counts the weight twice (you log one dumbbell), _per side_ counts the reps twice (you log one side), or _both sides_ (the default) counts it as entered.
- **Resistance bands** — mark a move as **banded** and it logs a band tier (X-Light → X-Heavy, each with an approximate kg) plus reps instead of a typed weight; tonnage is band kg × reps. You pick the band **per session** (it defaults to the exercise's usual band), so moving up a band week to week shows as progression. Banded moves count even on recovery routines — a banded circuit move logs reps per round, and that routine starts showing a volume total. A banded move can also be **per side** (the reps double, as with free weights).
- **Recovery routines** — a configurable circuit: set the **rounds**, **work** per station, **rest** between stations, and **rest** between rounds (seconds), and the estimated total workout time is calculated for you. Tap through each move's rounds and log an energy score.
- **Body stats** — a weekly Measurements card tracks bodyweight (kg) and any circumferences you add (waist, chest, hips, etc.) per block/week, with the previous reading shown as a ghost and BMI auto-computed once you set your height.
- **Nutrition** — log food per day from **Open Food Facts**: search by name, type or **scan a barcode** (camera, Chrome/Android), then pick a portion in grams — calories and the full carbs / fat / protein line are derived from the product's per-100g data and roll up to week and block totals with an average kcal/day. Looked-up foods are cached in your **Pantry** for offline quick-picking and re-scanning. No barcode (loose fruit, meals out)? Add a **quick entry** with its own numbers. Not on Open Food Facts — or the label doesn't match what it looked up? **Add it to your foods**, or **correct** a food's numbers from a search result or a logged row; your edits are **trusted**, so a later scan won't overwrite them, and a correction flows through to every day that logged that food. Tap a logged entry to fix its grams (or a quick entry's numbers) in place.
- **Classes** — log an extra session on any day (a yoga, pilates, or box-fit class, say) with a type, a free-text note of what you did, and a time in minutes. Add as many as you like per day; the type list is editable (type a new one and it's remembered — matched case-insensitively, so "box-fit" and "Box-Fit" stay one type). Each type carries a **burn rate** (kcal/min/kg, editable in **Edit** mode), so a class estimates a **calorie burn** from `rate × minutes × your bodyweight` (taken from the Measurements card). Minutes and estimated kcal roll up to week and block totals in the header, alongside Volume.
- **Holiday routines** — define one **Holiday Workout** (a band-only routine, in **Edit** mode), then tick the 🏝 toggle on any routine to swap it in while you're away from your kit. It logs separately, so your normal exercises stay un-logged that week and their progression picks up against your last normal session when that routine comes round again. Works on any routine kind; untick to restore it.
- **Repeatable blocks** — each block is one 4-week run. **＋ Block** clones the program (starting a fresh week) so you keep all history; progression carries across the boundary. Rename the current block — or set its start date — in **Edit** mode.
- **Editable library** — in **Edit** mode, add or create exercises and moves, remove them, adjust how many sets a strength exercise gets, set its loading mode (both sides / per side / two dumbbells), or mark it **banded** and choose its default band. The picker matches the routine kind: strength routines offer strength exercises, recovery routines offer circuit moves. New entries are saved for reuse in future blocks.
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

All data lives in `localStorage` on whichever device you use — there is no server. Use **Export backup** / **Import backup** (JSON) to move or safeguard your history as a file.

### Google Drive backup (carry history between devices)

**Back up to Drive** / **Restore from Drive** store the same backup as a single blob in a *hidden*, app-only folder in your Google Drive, so you can move your history between devices. It's a manual, whole-snapshot backup/restore — **last-write-wins**, no per-item merge (see [ADR-0006](docs/adr/0006-drive-backup-phase-1-of-sync.md); true device sync is the planned next step). Both buttons show the Drive copy's last-updated time before they overwrite anything, so you can tell which side is newer.

The buttons stay hidden until you wire up a Google OAuth Client ID (one-time, ~15 min, free, no backend):

1. In the [Google Cloud Console](https://console.cloud.google.com/), **create a project**.
2. **Enable the Google Drive API** for it (APIs & Services → Library → *Google Drive API* → Enable).
3. Configure the **OAuth consent screen**. If the project is in a Google **Workspace organisation** (as this one is), choose User type **Internal** — the app is then usable by any account in your org with **no verification and no "unverified app" warning**. Add the single scope `…/auth/drive.appdata`. *(No org? Choose **External**, add yourself as a **test user**, and leave publishing status on **Testing** — same result for personal use, but you'll click through a one-time "this app isn't verified" screen per device.)*
4. Create an **OAuth 2.0 Client ID**, type *Web application*. Under **Authorized JavaScript origins** add your deployed origin (scheme + host only, no path — e.g. `https://damwaingames.github.io`) and `http://localhost:8765` if you want to test locally. Leave **Authorized redirect URIs** empty — the browser token flow doesn't use them.
5. Copy the **Client ID** into `GOOGLE_CLIENT_ID` in `constants.js`. It's public — safe to commit. **Ignore the client *secret*** — the browser token flow doesn't use it; never commit it.

Sign in on each device with an account in your organisation. Drive backup needs a connection; everything else still works offline.

## Updating

Push to `main`; GitHub Pages redeploys automatically. Each release carries a semver version, shown in the footer (`vX.Y.Z`). When you change `index.html`, `styles.css`, or any of the JS modules, bump `APP_VERSION` in `constants.js` and the matching `CACHE` in `sw.js` (kept in lockstep) so installed devices pick up the new version on next launch. If you add a **new** JS module, also add it to `ASSETS` in `sw.js` — otherwise an offline launch serves an incomplete shell.

## Code layout

The app is plain ES modules (no build step), loaded from `index.html` via `<script type="module" src="./main.js">`:

- `constants.js` — shared constants (`APP_VERSION`, bounds, `CIRCUIT_DEFAULTS`).
- `helpers.js` — pure helpers: log-key grammar, clamps, formatting, circuit maths.
- `state.js` — seed data, the mutable store (`state`/`editing` + setters), schema migrations, persistence, and the queries that read over the store.
- `render.js` — turns the store into DOM (plus the focus-preserving live patchers).
- `render-nutrition.js` — the nutrition view (the roll-up card, each routine's Nutrition-tab food block, finder rows, macro line). Split out of `render.js` as a self-contained cluster; `render.js` imports its three entry points, `events.js` imports `foodResultsHTML`.
- `events.js` — click / submit / field handlers and the block, backup & Drive operations.
- `io.js` — data I/O: file export / import, the block-import merge, and the Drive backup transport, lifted out of `events.js`.
- `off.js` / `scan.js` / `drive.js` — the network/device leaves: Open Food Facts lookups, the camera barcode scanner, and the Google Drive backup transport. Each imports only constants and is imported by `events.js` / `io.js`.
- `health.js` — the Health Connect export adapter: derives per-day `NutritionRecord` payloads (stable cell-key `clientId` for idempotent upsert) from the logged nutrition, for a future native companion app to write. A leaf reading `state`/`helpers`/`constants`; no in-app consumer yet (the write is native).
- `main.js` — entry point: load, wire listeners, first render, register the service worker.

Imports flow one way (`constants ← helpers ← state ← render ← events ← main`, with `render-nutrition` a leaf into `render`/`events`, and `off`/`scan`/`drive`/`io` as leaves into `events`; `health` is a staged leaf reading `state` with no consumer yet), so there are no circular dependencies.

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
