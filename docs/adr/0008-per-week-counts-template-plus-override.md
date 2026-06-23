# Per-week counts are a template plus per-cell overrides, not lazy-lookback

A strength placement's **set count** and a recovery routine's **round count** were block-wide.
To let them vary by week (2 sets in week 1 then 3, or rounds climbing across a cardio block),
each gains an optional per-cell **override**; absent, the week inherits the block-wide
**template** (`place.sets` / `routine.rounds`). One feature, two surfaces.

We deliberately did *not* reuse the **schedule**'s lazy-lookback pattern (ADR-0005: an absent
week falls back to the nearest earlier arranged week). A count is read *inside* the temporal
scans (`previousSets`, `routineLoad`/`bandedReps`), which already iterate weeks; nesting a
per-week lookback there would multiply the work and the branching ADR-0001 warns against. A
flat template-or-override keeps every count a direct lookup through one `effectiveCount`, so
the scans stay flat. The schedule can afford lookback precisely because it's read once per
render, not inside a scan.

Lowering a week's count hides the surplus rows/rounds non-destructively — the logged data
under them is retained, so raising the count back restores it.
