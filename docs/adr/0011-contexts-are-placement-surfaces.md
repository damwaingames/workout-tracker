# An exercise's contexts are placement surfaces, not just routine kinds

Supersedes [ADR-0007](0007-exercise-contexts-behaviour-from-routine.md).

An exercise carries a set of **contexts** — the places a move is valid to be placed — rather
than a single hard-gating `type`. Validity is the exercise's property; how a placed move is
logged and counted belongs to the *surface* it sits on (the same bodyweight core move logs as
weight×reps in a strength routine and as a per-round station in a recovery circuit). `banded`
is the precedent: a cross-context property read per surface, not per exercise type. This lets
one catalogue entry serve several surfaces (no near-duplicate exercises) and gives the block
**importer** something true to validate a placement against.

ADR-0007 defined those contexts as the routine **kinds** a move is valid in. The **wind-down**
(ADR-0013) adds a placement surface that is *not* a routine kind, so we widen the definition:
a context is a **placement surface** — the routine kinds that accept placed exercises
(`strength`, `recovery`, `steady`) **plus** the wind-down (`mobility`). The surfaces and the
kinds are no longer the same set and never quite were: `mobility` is a context with no routine
kind, while `class` is a routine kind with no context (it holds a class *type*, not a Library
exercise) and `rest` holds nothing. The mechanism is unchanged — a wind-down's stretch picker
filters by `contextsOf(ex).includes("mobility")`, character-for-character how a routine
placement filters by `includes(kind)`. One validity mechanism, one more surface.

## Considered and rejected

- **A separate `mobility: true` flag** distinct from `contexts` — keeps ADR-0007 literally
  intact but maintains two validity mechanisms for one job. Rejected for the duplication.
- **Reusing the `recovery` context** for wind-down moves — no new concept, but the wind-down
  picker would then offer the whole circuit roster (high-knees, wall-press-ups) instead of a
  curated stretch list. Rejected on usability.
