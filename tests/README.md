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
  ck("nutrition card present", await page.isVisible("#nutrition-card"));
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
node verify-nutrition.mjs
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
| `verify-version` | Footer version tag matches `APP_VERSION` (read from `../constants.js`, so no manual bump here on release) |
| `verify-rename` | Inline block rename in Edit mode: live picker-label patch, focus retention, persistence |
| `verify-bodystats` | Measurements card: log/track/create/remove, BMI, previous-value ghost, additive migration, key purge |
| `verify-pickers` | Shared picker chrome: open/search/add/create/cancel/remove for exercises and measurements |
| `verify-crosstype` | Day-kind ↔ exercise-type rule: pickers and create forms respect strength vs recovery |
| `verify-circuit` | Recovery circuit timing: defaults, rounds stepper, live work/rest patch, clone, migration |
| `verify-backups` | Export/import/reset paths (the cross-module `setState`/`setEditing` reassignments) |
| `verify-nutrition` | Daily nutrition grid: `.nut.` persistence, live week/block totals, avg kcal/day, week isolation, clear-deletes-key |
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
