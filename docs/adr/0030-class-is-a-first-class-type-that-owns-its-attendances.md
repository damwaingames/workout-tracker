# A Class is a first-class type that owns its attendance history

Amends [ADR-0014](0014-class-burn-is-logged-from-the-wearable.md) (which held that "a class type is
just a name", with no persisted entity). Parallels [ADR-0020](0020-exercise-owns-its-history-block-is-a-container.md).

An **exercise** owns its **performance** history so progression follows the movement, not the block
it was done in (ADR-0020). A **class** has the same need for the same reason — you want your Box-Fit
attendance and calorie-burn history over time — but a class is deliberately *not* an exercise and not
composed from **items** (ADR-0019), so its history has nowhere to live on the exercise timeline. So a
**class type** becomes a **first-class entity** that **owns its attendance history**, exactly
parallel to how an exercise owns its performances:

- A **ClassType** — a stored entity (id + name) in a `state.classes` catalogue, the class sibling of
  the exercise **Library** — owning a chronological list of **Attendances**.
- An **Attendance** — one logged occurrence of a class: its date, actual **minutes**, the wearable's
  **calorie burn** (ADR-0014, unchanged), and a **note**. The class analogue of a Performance.
- A **Block**'s **class** **routine** references a ClassType by id and carries only the *plan* (the
  chosen type + a planned duration), never the logged occurrences — just as a session **item**
  references an exercise and the log lives on the exercise (ADR-0020).

So the model is uniform: **history lives on the entity, the block is only a container.** Deleting a
block removes a plan and never touches history — both performances *and* attendances survive.

## Considered options

- **Keep class occurrences in a per-cell log (the pre-v6 grammar)** — rejected. It re-homes exercise
  history off the block-cell log (ADR-0020) but leaves class history keyed to the block-cell, so a
  block delete would still destroy class attendance + burn history — the exact wrong-owner problem
  ADR-0020 fixed, left half-fixed. And it forks the model (exercises own history; classes don't).
- **Model a class as a degenerate exercise so it reuses the performance timeline** — rejected as the
  anti-pattern ADR-0019 exists to avoid: it erases the external-event semantics that are the whole
  reason to model a class well.

## Consequences

- `state.classes` is a new catalogue, append-only in membership like the Library, ids are slugs so
  case can't fork a type ("box-fit" → "Box-Fit"). The derived `classTypeNames`/`findClassType`
  helpers are replaced by reading the catalogue.
- The v5→v6 migration builds the catalogue from the class types blocks referenced and re-homes every
  logged class occurrence (minutes / kcal / note) into an Attendance dated by its derived weekday.
- The slim occurrence **log** that remains after v6 (ADR-0020) holds only per-session metadata no
  entity owns — **Session RPE** (ADR-0012) and the done flag — plus body measurements. Class
  actuals leave it entirely.
