# An exercise is described by intrinsic properties, not gated by contexts

Supersedes [ADR-0011](0011-contexts-are-placement-surfaces.md) (which had already superseded
ADR-0007).

The old model gated an **exercise** by its **contexts** — the placement surfaces (`strength` /
`recovery` / `steady` / `mobility`) it was valid on. With the routine-kinds collapsed (ADR-0019)
there are no surfaces to gate against, so the gate is removed. An exercise instead carries only
*intrinsic descriptive* properties — its **volume type** (time or reps), its **load metric** (kg /
mini-loop / long-band / machine-level / none), and the **equipment** it requires — and these
**filter, never gate**: any exercise can be an **Item** in any **Group**.

So the moves the old gate had nowhere to put stop being special cases: a boxing combo, a stretch, a
plank are ordinary exercises with the appropriate volume/load/equipment (a weighted 1-2s is
time-volume + kg-load; a plank is time-volume + none). **Equipment** is a set of tags drawn from the
user's *actual* kit; its first job is the **Holiday Session**, which assembles from exercises whose
required equipment is a subset of the reduced kit taken away from home.

## Consequences

- The picker no longer filters by kind — filtering (by equipment, by volume type) is *convenience*,
  never *validity*. ADR-0011's "behaviour follows the surface, validity follows the exercise"
  reaches its end state: behaviour follows the **Item** (its volume/load), and there is no validity
  gate at all.
- Equipment is a curated set matched to real gear, not a generic catalogue — the same principle as
  pinning the two real **band** families rather than an open list.
