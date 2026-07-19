# The weekly template is a fixed target; there are no per-week plan variations

A **Group**'s `rounds` and an **Item**'s **rail** are a fixed target for the whole block — there is
no per-week override of counts (the old deload/ramp mechanism, ADR-0008, where a single week could
carry its own set or round count).

Falling short of the target — two of three sets — is logged honestly as under-completion, a recovery
signal, and is **never** masked as a planned lighter week: the plan is the target, the
**performance** timeline is the truth. Supersedes ADR-0008.

## Consequences

- The user does not currently program deloads. If that ever changes, a *planned deload* is a new,
  first-class decision — not a resurrection of per-cell count overrides, which reshaped the plan to
  match reality and so hid the recovery signal.
