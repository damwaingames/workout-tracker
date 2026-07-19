# RIR is an advisory per-set marker, not a progression gate

A set (a **performance**) can carry an optional **RIR** marker — proximity to failure in three
buckets: *too easy* (RIR 4+), *ideal* (RIR 2–3), *too hard / to failure* (RIR 0). It is **advisory**,
exactly like **e1RM** (ADR-0022): it is logged on the performance and can *nudge* the **target** —
"you capped the rail with reps to spare, add load"; "you're grinding to failure below the ceiling,
hold" — but it **never gates** progression. **Double progression** stays the judge (ADR-0021).

RIR is distinct from **Session RPE** (ADR-0012): Session RPE is whole-session fatigue ("how wrecked
am I today"); RIR is per-set intensity calibration ("was this set the right weight"). Optional per
set — most sets carry none.

## Considered options

- **A hard gate** — block the double-progression load-step until you cap the rail at *ideal* or
  easier — rejected: it makes the app argue with you and amends the double-progression mechanic.
  Advisory keeps the mechanic clean and the human in charge, consistent with how e1RM and Session
  RPE are already treated (log honestly; you interpret).
