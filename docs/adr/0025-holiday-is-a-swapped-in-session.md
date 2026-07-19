# Holiday is a swapped-in catch-all Holiday Session

Away from your full kit, you swap a day's planned **Session** for the **Holiday Session** — a single
catch-all **Session** assembled from exercises whose required **equipment** ⊆ the reduced
away-from-home set (mini-loops + resistance-bands + door-anchor), defined once.

Because progression is per-**exercise** (ADR-0020), the old machinery is unnecessary: ADR-0002's
per-cell `.holiday` flag, its shared band-only Holiday Workout, and its careful "keep the slot's
identity so progression resumes against the last non-holiday week" all dissolve into plain session
substitution. On a holiday day the band exercises simply accrue their own **performances**, and the
planned exercises' **ghosts** sit untouched until you are back to them — the outcome ADR-0002
engineered now falls out for free. Supersedes ADR-0002.

## Consequences

- One catch-all Holiday Session, not per-planned-session variants — simplest, and extensible later
  (a "holiday push" vs "holiday pull") if it ever earns its keep.
- It depends on **equipment** being a real, filterable property of an exercise (ADR-0023) — that is
  what lets the Holiday Session assemble itself.
