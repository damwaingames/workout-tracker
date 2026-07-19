# Progression is double progression on a per-placement rail, threaded per (exercise, zone)

A loaded **exercise** progresses by **double progression**: at a fixed **load**, climb the
**volume** toward the top of a programmed range, then add load and reset to the bottom. To drive
that, a **placement** (an **item** on a **session**) carries an explicit **rail** — a
`[floor, ceiling]` range (the coach's real prescription: 8–12, 10–15) — and "progress" is *beat the
ceiling, then step the load.* The **zone** (strength ≤6 / hypertrophy 7–14 / endurance ≥15) is
*derived* from the rail and used only to classify and trend, never as the mechanic. Because reps and
load are independent axes, "best" is a two-axis frontier — more volume at the same load, **or** more
load at the same volume — so there is no single scalar overload delta. Progression **threads per
(exercise, zone)** over the exercise's **performance** timeline (ADR-0020): the working load carries
across a rail tweak *within* a zone (8–12 → 10–15 keeps your weight; the **target** just re-reads the
new rail), and a zone change starts a fresh thread. The rule generalizes across load metrics —
reps+kg and minutes+machine-level read identically.

## Considered options

- **A single estimated-1RM scalar as the progress metric** — rejected: collapsing reps and load into
  one number needs a formula the standard ones disagree on at the margin (Epley says progress where
  Brzycki says regress); double progression uses the programmed range as its rails and needs no
  formula. e1RM's (advisory) role is ADR-0022.
- **Strict two-axis dominance** (progress only if you beat one axis losing nothing on the other) —
  rejected: it calls the most common real move, "add load, reps drop," a non-event.
- **Thread per exact rail** — rejected: it fragments (8–12, 8–10, 10–15 each a separate thread) and
  orphans your working load on a cosmetic range change; zone-threading carries load where the
  training is the same and only starts fresh where it genuinely differs.

## Consequences

- The old per-routine overload delta (a signed `+N kg`) is replaced by a two-axis progress
  indicator.
- Zone boundaries are a classification, so re-tuning them changes only how history groups, never
  what was logged.
- A time-**volume** item (a steady effort, a plank) has no rep-zone; it threads per exercise on its
  single time×load axis.
