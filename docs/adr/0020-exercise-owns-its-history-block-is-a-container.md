# An Exercise owns its performance history; a Block is only a plan container

Supersedes [ADR-0001](0001-keep-temporal-scans-separate.md).

Progression, **PRs**, and estimated 1RM (**e1RM**) are properties of the **exercise** — that is
the whole point of tiered progressive overload — so the exercise **owns its history**: a
chronological timeline of **performances**, each a single logged effort (its date, **load**,
**volume**, and derived rep-zone, tagged with the **session** it came from so a Session can still
render it). Everything derived — PRs, e1RM, the per-zone frontier, the progression ghost — reads
that per-exercise timeline directly.

A **Block** is only a **container**: it assembles a sequence of **routines** (the *plan* — Sessions,
Groups, items, rails, schedule, length) and owns **no** logged data. So **deleting a Block removes a
plan and never touches history** — you can delete blocks freely to declutter and keep every PR,
because the data lives where it belongs: on the exercise. "Blocks are containers; exercises know
about themselves."

## Considered options

- **Keep the log block-owned but never purge it — archive Blocks instead of deleting** — rejected.
  It makes history durable only by *refusing to move it*, leaving progression data keyed to the
  wrong owner (the block) and forbidding real block deletion. That is churn-aversion, not the right
  home — and the right home is the exercise.

## Consequences

- The on-disk log **re-homes** from the block-cell key grammar onto the exercise timeline. The
  routine-keyed temporal scans (ADR-0001) and the `.d{n}` progression ordering (the ranking half of
  ADR-0005) are replaced by "sort the exercise's performances by date." The v5→v6 migration carries
  every existing logged set across onto its exercise.
- A performance records the session/cell it was logged in, so a **Session** view renders its values
  by looking them up on the exercises it references — the reference runs plan → exercise, never the
  reverse.
- The **schedule**/**weekday** reckoning (the rest of ADR-0005) and a Block's length/shape are
  settled separately (the variable-length-block work), not here.
