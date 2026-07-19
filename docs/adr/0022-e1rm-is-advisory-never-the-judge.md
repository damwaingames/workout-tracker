# e1RM is an advisory derived signal, never the per-session progress judge

Estimated one-rep max (**e1RM**) is computed from a **performance** by a standard formula, but it is
**advisory only** — it never decides whether a set was progress. That verdict is **double
progression**'s (ADR-0021). e1RM has three jobs, all "your strength expressed zone-free": a long-arc
cross-**zone** **trend**, the headline max **readout** (the tentative "1RM category" — a tested or
estimated max, not a rep-count bucket), and a **cold-start guide**: when a zone has no history, seed
a starting **load** for it by inverting the formula for the new **rail**'s reps, shown as an
estimate (conservative, rounded down) that self-retires the instant a real in-zone performance is
logged. e1RM needs load > 0, so a pure-bodyweight item yields none until a plate is added.

## Considered options

- **e1RM as the headline progress metric** (what most trackers do) — rejected: it is a
  formula-dependent estimate the common formulas disagree on at the margin, so letting it judge each
  session makes "did I progress?" a coin-flip. Double progression judges; e1RM advises.

## Consequences

- The "before you lift" fallback — real **ghost** → **guide ghost** → blank — is presentation, not
  stored state; the estimate is always derived, never a stored **PR**.
