# Exercise validity is a set of contexts; behaviour comes from the routine

Exercises carried a single `type` (`strength`/`circuit`) that hard-gated which routine
kind could hold them. We replaced it with a set of **contexts** — the routine kinds a move
is valid to be placed in. Validity is the exercise's property, but how a placed move is
logged and counted belongs to the *routine*: the same bodyweight core move logs as
weight×reps in a strength routine and as a per-round station in a recovery circuit.

This reverses the earlier `kindType` rule that "a mismatched placement can't be built". We
chose it so one catalogue entry can serve several kinds (no more near-duplicate exercises),
and so the block **importer** can validate a placement against something true — steady-state
cardio is still rightly rejected as a strength set — instead of having no guard at all.
`banded` was the existing precedent: a cross-context property read per routine, not per
exercise type.

## Considered and rejected

Demoting `type` to a soft picker *hint* (offer every exercise, type-matches first). Lighter
to build, but it removes every guard, leaving the importer nothing to validate placements
against — the opposite of what the keystone feature needs.
