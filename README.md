# Workout Tracker

A personal, client-side **4-week full-body & glute training tracker**, installable as an offline PWA.

**Live:** https://damwaingames.github.io/workout-tracker/

## What it does

- **Strength days** — log every set as **weight (kg) × reps**; the previous session's numbers appear as a ghost placeholder so you always know what to beat. Each exercise carries its own rep target and a tap-to-expand how-to.
- **Volume tracking** — each strength day totals its tonnage (sum of weight × reps over all sets), rolled up to week and block totals shown in the header.
- **Recovery days** — tap through each circuit move (two rounds) and log an energy score.
- **Body stats** — a weekly Measurements card tracks bodyweight (kg) and any circumferences you add (waist, chest, hips, etc.) per block/week, with the previous reading shown as a ghost and BMI auto-computed once you set your height.
- **Repeatable blocks** — each block is one 4-week run. **＋ Block** clones the program so you keep all history; progression carries across the boundary. Rename the current block in **Edit** mode.
- **Editable library** — in **Edit** mode, add or create exercises and moves, remove them, or adjust how many sets a strength exercise gets. The picker matches the day: strength days offer strength exercises, recovery days offer circuit moves. New entries are saved for reuse in future blocks.
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

Push to `main`; GitHub Pages redeploys automatically. Each release carries a semver version, shown in the footer (`vX.Y.Z`). When you change `index.html`, `styles.css`, or `app.js`, bump `APP_VERSION` in `app.js` and the matching `CACHE` in `sw.js` (kept in lockstep) so installed devices pick up the new version on next launch.

## Icons

Regenerate the app icons with:

```bash
python3 tools/gen_icons.py icons
```
