# A Block is a weekly template repeated over N real calendar weeks

A **Block**'s plan is a **weekly template** — an ordered set of **routines**, one per weekday, each a
**Session**, a **Class**, or **rest** — repeated over **N weeks**. N is block-owned and variable
(the hard-coded 4 is gone). Weeks are *real* calendar weeks anchored to the block's **start date**,
and all seven days are always shown: a day with no Session or Class renders as a **rest** placeholder,
never collapsed away, so the grid reads true and you can't log to the wrong day.

The old **schedule** — a reorderable permutation of routines onto weekdays, with a lazy-lookback
default (ADR-0005) — dissolves. The template maps **weekday → content** directly; reordering a day
is a plain plan edit; and an *ad-hoc* shift ("meant to squat Wednesday, did it Thursday") needs no
re-planning at all, because a **performance** is dated on its **exercise** (ADR-0020), not filed
under a routine-slot. Supersedes ADR-0005.

## Consequences

- A **weekday** is now simply a real calendar date, not derived from a start-Monday plus a schedule
  position.
- Per-week plan *variation* is a separate decision (there is none — ADR-0026); away-from-kit days
  are a session swap (ADR-0025).
