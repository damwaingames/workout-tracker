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

- `constants.js` — shared constants (`APP_VERSION`, `SUPPORTED_VERSIONS`, zones, the two band families + tier→kg tables, equipment, loading modes).
- `helpers.js` — pure helpers: log-key grammar, date maths, progression maths (rail/zone/Epley e1RM/band kg), and formatting.
- `migrate.js` — the pure v5→v6 forward migration (ADRs 0019–0030): old cell-keyed logs → per-exercise `performances` + per-class-type `attendances`, and old blocks/routines → the new weekly template. Imports only `constants`+`helpers`; run by `state.js`'s `normalise`.
- `state.js` — seed data, the mutable store (`state`/`editing` + setters), schema normalisation (delegating the v5→v6 transform to `migrate.js`), persistence, and the queries that read over the store.
- `render.js` — turns the store into DOM (the read/log week grid, Library, measurements) plus the focus-preserving live patchers; delegates each routine card to `compose.js` in Edit mode.
- `actions.js` — the dispatch vocabulary: every `data-action` / `data-fh` / `data-target` name that routes an event, plus the valueless `data-mark-*` markers a handler locates elements by. Declared once, emitted through this module's own builders and used as the dispatch maps' keys, so the two sides can't drift. Imports only `helpers` (the shared attribute builder).
- `slot.js` — the slot ctx contract: builds a **Performance**'s six-part ctx (and an **Attendance**'s coarser one) into `data-*` and reads it back off a dataset, plus the in-slot field-name vocabulary. Pure (imports only `helpers`); imported by `render.js` and `events.js` so the render→handler agreement lives in one module.
- `plan.js` — the plan-editing verbs: add / remove / move a **Group** or **Item**, switch a **Routine**'s kind, reorder the days, set the **Block**'s length, and the scalar edits beside them. Each takes a plan location (a block position, or the Holiday Session singleton) and indices — never a DOM element — and repairs or retires the **Performances** whose slot back-reference it just invalidated (ADR-0032). Mutates and returns; the caller saves.
- `compose.js` — the Edit-mode authoring UI (compose a block in the UI, no JSON): the Session/Class/Rest kind switch, Group/Item editors, rails, rounds/rests, day reorder, the block config, and the Holiday Session editor (the same Session composer, restricted to away-eligible exercises). Pure rendering, imported by `render.js`.
- `events.js` — click / submit / field handlers, the plan-authoring mutators (#45), and the block, backup & Drive operations.
- `io.js` — data I/O: file export / import (wholesale restore) and the Drive backup transport, lifted out of `events.js`.
- `drive.js` — the Google Drive backup transport. Imports only constants and is imported by `events.js` / `io.js`.
- `main.js` — entry point: load, wire listeners, first render, register the service worker.

Imports flow one way (`constants ← helpers ← migrate ← state ← render ← events ← main`, with `slot` and `actions` both hanging off `helpers` into `render`/`compose`/`events`, `plan` sitting on `state` and imported by `events`, and `drive`/`io` as leaves into `events`), so there are no circular dependencies. The store never imports the routing vocabulary — `events.js` translates a DOM target into a domain call, so `state.js` carries no DOM names.

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
