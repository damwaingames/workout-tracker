# Session RPE is a logged fatigue metric, not a progression input

Each routine (and the **wind-down**) carries an optional **Session RPE** — a 1–10 felt
intensity for how hard *that session* was *today* (Box-Fit ~9, strength ~6–7, wind-down ~2–3),
logged once per cell.

This looks like a flat contradiction of the glossary's rule that "RPE is never the logged
metric", so the reconciliation matters: that rule is about **progression**. RPE is
self-normalising — a 7 stays a 7 as you get fitter — so it can't be what you progress *by*,
which is why strength logs tonnage and steady logs resistance/level instead. But the very same
self-normalising property makes RPE the *right* tool for **fatigue monitoring**: a 9 always
means "this hammered me today", whatever your fitness. Same number, opposite job. So the rule
stands unchanged (RPE never drives progression) and Session RPE sits beside it as a distinct,
legitimately-logged datum. It is never read by `previousSets`, the overload delta, or any
progression scan.

The trigger was concrete: the user was over-reaching by stacking classes onto training days,
and already tags every session with a felt intensity on a separate device. Bringing that
number into this app is the point.

## Scope boundary (a deliberate no)

The app logs the raw Session RPE and shows it (card + collapsed summary). It does **not**
compute training-**load** or recovery **trends** from it — no Σ(RPE × minutes), no readiness
score. Those belong to the wearable, which has the sleep / resting-HR / HRV data to do them
honestly; a load engine on a hand-typed RPE would be a worse guess wearing a number. This is
the same boundary ADR-0014 draws for calories: **the app records felt/what-I-did data; the
wearable owns physiological analysis.**
