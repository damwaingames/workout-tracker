# The double-progression load step snaps to the adjustable-dumbbell discrete ladder

[ADR-0021](0021-double-progression-on-a-per-placement-rail.md) says double progression, at the rail
ceiling, "adds load and resets to the floor" — but left *how much* load open (the app first shipped a
flat +2.5 kg placeholder, with the discrete-load ladder deferred in the #40 spec). This ADR settles
it: the kg **load** step snaps to the **achievable per-dumbbell weights of the user's dumbbells** —
`2.5, 3, 3.5, 5, 6, 7, 8, 9.5, 10.5, 11.5, 13.5, 16, 18.5, 20.5, 23, 24` kg (`DUMBBELL_KG`). The
target's "add load" is the next **rung strictly above** the current load, so a suggested weight is
always one you can actually pick up. Most rungs are the adjustable dumbbells' settings; **3 kg is the
fixed moulded pair** (a real rung between 2.5 and 3.5 — you'd swap to it, not adjust). The **1 kg
punch weights are excluded**: they load a *time-volume* weighted-punch (no rail), which double
progression never touches — they're not a rep-loading rung. The rungs are per-dumbbell weights,
matching the logged magnitude in every **loading mode** (a two-dumbbell set logs kg/db). A band steps
by **tier** as before (ADR-0029); this ladder is kg only.

Two consequences of a *discrete* ladder that a flat increment didn't have:

- **A maxed load axis keeps climbing reps.** At the heaviest dumbbell (24 kg) — or, for a band, the
  top tier — there is no heavier load to add, so the target keeps adding reps at the same load rather
  than suggesting an impossible weight. (The heaviest tier already clamped; this makes the kg axis
  behave the same way.)
- **The cold-start guide ghost snaps too.** The e1RM-seeded starting load (ADR-0022) snaps *down* to
  the nearest rung ≤ the estimate, so even the estimate is a weight you can set (and never exceeds the
  heaviest dumbbell).

## Considered options

- **Keep a flat +2.5 kg step** — rejected: 42.5 kg isn't a weight these dumbbells can be set to, and
  the whole point of the target is to tell you the *next real thing to load*. A flat step also has no
  honest top: it would forever suggest a heavier weight past the dumbbells' 24 kg ceiling.
- **Gate the ladder on an equipment tag** — rejected as needless: every kg exercise loads from these
  dumbbells (the adjustable pair plus the moulded 3 kg), so every kg progression already lands on this
  ladder; gating would only add a branch for a case that can't arise. Revisit if fixed-increment kit
  with its own steps (a barbell + plate tree) is ever added — then the ladder becomes per-exercise,
  not global.

## Consequences

- `DUMBBELL_KG` lives in `constants.js` (the user's real gear — data, edited if the dumbbells change);
  `nextDumbbellKg` / `snapDownDumbbellKg` are pure helpers; `doubleProgression` and the guide seed read
  through them. The old flat `LOAD_STEP_KG` constant is removed.
- The ladder is tested pure-Node (the step lands on a rung; a maxed load climbs reps; the guide snaps).
