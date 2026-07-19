# Tonnage is a demoted volume-load readout, not a progression metric

ADR-0021 replaced the single scalar overload **delta** with a two-axis (volume × load) frontier as
the progression judge, but it did not rule on **tonnage** — a set's load × reps, summed — as a
*metric*. This ADR does.

Tonnage is **retired as a progression or comparison signal**: the frontier and **e1RM** carry
progression, and there is no tonnage-based "did I improve" verdict anywhere. It survives only as an
optional **volume-load readout** — total load × reps over a loaded rep-**Item** or a **Session**, a
"work done" figure that is never a progress verdict. (Named *volume-load*, not "volume", to keep it
distinct from an **Item**'s **Volume** axis.)

**Loading mode** (`standard` / `per-side` / `two-dumbbell`) keeps a real but narrowed job: it
relabels the logged inputs (`reps/side`, `kg/db`) so a logged number is read correctly, and its
`wMult`/`rMult` pair is what makes the volume-load readout honest (per-side counts the reps on both
sides; two-dumbbell the weight on both). It is **not** a progression input. A **band** exercise's
tier→kg equivalent likewise survives, feeding the volume-load readout and **e1RM** (which needs a
real kg) — not a resurrected tonnage-delta.

## Considered options

- **Retire tonnage entirely** — cleaner minimalism, and loading mode would collapse to a pure input
  label. Rejected: it discards a volume metric the user deliberately built (loading modes + band
  tonnage, v1.5.0/1.6.0), and the honest-load multipliers still have a home. Kept as a readout
  instead, and easily dropped later if it goes unused.

## Consequences

- No tonnage anywhere drives or compares progress — the frontier judges, e1RM advises.
- The volume-load readout is a pure display concern, tested at the e2e seam like any rendered figure.
- The progression frontier and e1RM read the *logged* per-limb / per-implement values directly; the
  loading-mode multipliers apply to the volume-load readout, not to the frontier.
