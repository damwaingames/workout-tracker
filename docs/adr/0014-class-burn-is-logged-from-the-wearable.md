# A class's calorie burn is logged from the wearable, not modeled

Class burn was *modeled*: `kcalBurn = classRate(type) × minutes × bodyweight`, with each
**class type** carrying a hand-tuned `rate`. The user now wears a heart-rate device that
*measures* the burn, which is strictly better data than a per-type rate guess. So a class cell
logs an **actual calorie burn** — the number off the watch — and the modeled path is retired
wholesale: `kcalBurn`, `classRate`, the per-type `rate`, and its rate editor all go, and a
**class type** collapses to just a name. The header "Classes" total sums the logged actuals.

Burn is kept **class-only**. It isn't burn-in-general moving into the app: strength and steady
already have their own absolute-output metrics (tonnage; resistance/level), so calorie burn is
specifically *a class's* output measure — the thing a class has instead of weight or a machine
setting. It is logged, not progressed (a class is conditioning, not a progression surface —
ADR-0010).

This is the calorie half of the boundary ADR-0012 draws for fatigue: **the app records
what-you-did; the wearable owns physiological measurement.** We take its number rather than
re-deriving one.

## Considered and rejected

- **Keep the model as a fallback** when no wearable number is to hand — rejected: it preserves
  an entire subsystem for a guess the user will no longer trust, and a class with no logged
  burn simply showing none is a fine, honest gap.
