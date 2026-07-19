# Training is composed of Sessions of Groups of Items; the structural routine-kinds collapse, Class excepted

Supersedes [ADR-0010](0010-class-is-a-routine-kind.md).

The old model split routines into five **kinds** (`strength` / `recovery` / `steady` / `rest` /
`class`), but `strength`, `recovery`, and `steady` differ only in *what their exercises track*,
not in structure — a strength routine's **sets** and a circuit's **rounds** are the same thing
counted differently. So the training model unifies:

- A **Session** — a routine you compose — is an ordered list of **Groups**.
- A **Group** is a rotation of **Items** for N **rounds**, with a `rest-within` (between items;
  `0` = a superset) and a `rest-after` (after each round).
- An **Item** carries a **volume** — measured in *time* (a duration) or *reps* (a count) — and a
  **load** — a magnitude on a *metric* (kg / band tier / machine level / none).

Straight sets, supersets, and circuits are then all just Groups: a straight set is a **one-item
Group** run for N rounds; a superset is a Group of >1 item with `rest-within = 0`; today's
recovery circuit is a single Group of timed items with `rest-within` > 0; a steady effort is a
one-item, one-round Group whose item is time-volume + level-load. So `strength`/`recovery`/
`steady` collapse into the single **Session**, and loaded-vs-conditioning-vs-cardio becomes
*emergent from the Items*, not a kind picked up front.

**Class is the deliberate exception.** A class is an external attended event — you do not compose
it from Items, do not program it, do not progress it — so it is not a Session. Forcing it into
the composed-workout model (as every other tracker does, cramming a class in as a degenerate
exercise) is exactly the anti-pattern this avoids. **rest** stops being a kind: it is just a
Routine with an empty body.

## Considered options

- **Keep the kinds distinct and add a separate grouping layer for supersets** — rejected: the
  strength/recovery/steady split has no structural basis once sets ≡ rounds, so it is redundant
  machinery layered over a false distinction.
- **Fold Class into the Session model too** — rejected: it erases the external-event semantics
  that are the whole reason to model a class well rather than as a degenerate exercise.

## Consequences

- Today's recovery **circuit** is exactly a one-Group Session, so this collapse is a strict
  *generalization* and migrates forward (store schema v5→v6).
- The frozen on-disk key grammar and per-circuit fields (ADR-0005's `.d{n}`, `CIRCUIT_DEFAULTS`)
  are redesigned as part of this — the rewrite license permits it, and the migration carries the
  user's logged history across.
- **Count-overrides** (sets/rounds — ADR-0008), **exercise contexts** (ADR-0011), the **wind-down**
  / **holiday** segments, and **Session RPE** (ADR-0012) are re-examined in follow-on decisions,
  not here. This ADR fixes only the structural spine.
