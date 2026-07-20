# Tests — end-to-end verification harness

Browser-driven checks for the Workout Tracker PWA, using [Playwright](https://playwright.dev/).
Each `verify-*.mjs` is a standalone script that drives real events against the live DOM and
asserts behaviour **plus** zero `console.error` / `pageerror`. This is **dev-only tooling** — it
has no effect on the deployed app (which still has no build step).

`harness.mjs` owns the shared lifecycle — browser launch, console/error capture, the check tally,
and the pass/fail exit — so each script is just its own assertions:

```js
import { verify } from "./harness.mjs";
verify(async ({ page, ck, ls, reset }) => {
  await reset();                                  // fresh load (wipes storage, reloads)
  ck("Library card present", await page.isVisible("#library-card"));
  // …only the assertions that make this script different…
});
```

`verify()` does its own launch + `process.exit`, so a script still runs standalone against any
origin (see below); the runner just spawns each file.

## Setup

```bash
cd tests
npm install        # installs Playwright; postinstall fetches the Chromium browser
```

Requires Node 18+ (for the built-in `fetch`/static server in `run.mjs`).

## Run

```bash
npm test
```

`run.mjs` serves the repo root on a temporary port, runs every `verify-*.mjs` against it, prints a
per-script summary, and exits non-zero if any script fails. No separate web server to start.

### Running one script, or against another origin

The scripts take their base URL from `WT_URL` (default `http://localhost:8765/`). To run a single
script you need a server up yourself:

```bash
# from the repo root, in another terminal:
python3 -m http.server 8765
# then, in tests/:
node verify-library.mjs
```

Or point the whole suite at the **live deploy** to smoke-test it:

```bash
WT_URL=https://damwaingames.github.io/workout-tracker/ node verify-version.mjs
```

> The scripts wipe `localStorage` for the origin they hit. That's safe — Playwright uses a throwaway
> browser context, so it never touches your real device's saved data, even when pointed at the live site.

## What each script covers

| Script | Covers |
| --- | --- |
| `verify-migration` | **Pure-Node** (no browser): inject a v5 store → assert the v6 shape + no data loss — every logged set/round/steady → a Performance, class → Attendance, blocks → template, PRs/zone/e1RM, block-delete keeps history. Also the progression maths (zone, Epley e1RM) and nutrition purge |
| `verify-library` | v6 Library / exercise-history view (in-browser): fresh-install seed, migration-by-reload, the migrated plan overview, an exercise's performance timeline + PRs on expand, and block-delete keeping performances |
| `verify-week` | Week grid (#43): a block renders as seven real-calendar days (empty → Rest), Sessions render their Groups/Items (straight, superset, circuit, steady), a Class its type + duration, and switching weeks advances the dates |
| `verify-logging` | Session logging (#44): filling a round records a Performance on the exercise (loaded set weight×reps, band tier×reps, station done-tick, steady minutes+level), under-completion leaves unfilled rounds unlogged, clearing a field un-logs it, and everything persists + re-hydrates across reload |
| `verify-compose` | Authoring a block (#45): a new block is blank (not a clone), a day switches Session/Class/Rest, a Session grows Groups + Items with editable rails/rounds/rests (→ superset), weeks + start date are editable, days reorder, and the composed plan renders + persists |
| `verify-progression` | **Pure-Node** (no browser): the #46 maths + queries — spanned-set rail→zone threading, the double-progression target across kg / band / bodyweight and at the rail cap, the adjustable-dumbbell discrete-load ladder (ADR-0031 — kg steps snap to a real rung, a maxed load/tier climbs reps), Epley guide-ghost seeding + snap, the e1RM trend, and the ghost / target / guide / load-carries-across-a-rail-change behaviour over a real timeline |
| `verify-progression-ui` | Progression surfaced (#46, in-browser): a rep-Item shows the ghost of its last in-zone set + the double-progression target, a cold zone shows an e1RM-seeded guide ghost (estimated), the Library shows the e1RM trend arrow, and logging a fresh below-ceiling set climbs the target a rep (double progression, not an e1RM verdict) |
| `verify-tonnage` | **Pure-Node** (no browser): the #47 maths + queries — a rep set carries an optional RIR marker (not station/steady), the advisory RIR nudge, the loading-mode-honest tonnage readout (session + block, per-side reps / two-dumbbell weight, bodyweight adds nothing), and `swapDays` moving the per-occurrence log scalars (RPE / collapsed) with a reordered day across every week |
| `verify-rir-rpe` | RIR / Session RPE / tonnage surfaced (#47, in-browser): a ghost's RIR raises an advisory nudge, a fresh set can be tagged RIR (stored on the Performance) while the target still climbs (never gated), a per-session RPE logs to the cell-scalar log and shows on the card + collapsed summary, the Session + block show their tonnage, and the collapse chevron folds the card (persisted across reload) |
| `verify-version` | Footer version tag matches `APP_VERSION` (read from `../constants.js`, so no manual bump here on release) |
| `verify-rename` | Inline block rename in Edit mode: live picker-label patch, focus retention, persistence |
| `verify-bodystats` | Measurements card: log/track/create/remove, BMI, previous-value ghost, additive migration, key purge |
| `verify-darkmode` | Dark-mode re-skin: body/card surfaces follow `prefers-color-scheme`, every palette token resolves in both schemes |
| `verify-drive` | Drive backup (ADR-0006): dormant-until-configured gate, create→restore round-trip, empty + incompatible-blob handling |
| `verify-backups` | Export/import/reset paths (the cross-module `setState`/`setEditing` reassignments), incl. a v2→v6 import migration |
| `verify-dropdown` | Block chooser sizes to its widest option, not the current selection |

## Maintaining these

- Scripts key off DOM contracts — `data-action` names, `data-k`/`data-cell` keys, and classes like
  `picker-search` / `circuit-field` / `measure-val` / `nut-val`. Keep those stable across refactors,
  or update the scripts in lockstep.
- **Fresh load gotcha:** `localStorage` is `null` until the first `save()`, and `normalise()` backfills
  migrations in memory until the next save — so assert against the **DOM** for pre-save state, not storage.
- Adding a feature? Drop a `verify-<feature>.mjs` next to these — wrap the body in `verify(...)` from
  `harness.mjs` and use the `{ page, ck, ls, reset, key }` it hands you. `run.mjs` discovers the file
  automatically (it globs `verify-*.mjs`, so `harness.mjs` itself is never run as a script).
- `STORAGE_KEY` and `APP_VERSION` come from `../constants.js` (via the harness / `verify-version`), so
  neither is hand-copied in the suite — there's nothing to bump here on a release.
