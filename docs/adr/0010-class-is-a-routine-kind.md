# A class is a routine kind, not an add-on

> **Status: Superseded by [ADR-0019](0019-training-is-sessions-of-groups-of-items.md).** The
> routine-kind taxonomy collapsed; ADR-0019 keeps the essential holding — a class is first-class,
> never a degenerate exercise — by making Class the deliberate exception to the Session model.

A **class** used to be an ad-hoc session (`{type, desc, mins}`) logged on top of any
routine's cell — you anchored a Box-Fit onto whatever workout that weekday happened to
hold. That encouraged stacking a hard class on top of a training day, which was
over-cooking recovery. We make `class` the fifth routine **kind** (alongside
`strength`/`recovery`/`steady`/`rest`): a class now owns its own **weekday**, holds one
**class type** + a planned **duration**, and its cell logs done, actual minutes, a
**note**, and calorie burn (its source is ADR-0014). The old "add a class to any day"
logger, the `.classes` cell array, and
`renderClasses` are **retired**; the header Classes total re-derives from `class`-kind cells.
A class routine is the twin of `steady` — but carries no progression **ghost** (it's
conditioning you show up to, not a number you chase) and is never **load-bearing**.

The cost, accepted deliberately: an *unplanned* drop-in class has nowhere to go — every
class must be a scheduled `class` routine in the block, and the seven routine slots are full.
That is the point. The user's week is built entirely from fixed weekly classes (Mon/Sat
Box-Fit), and forbidding the squeeze-it-onto-a-lifting-day path is the behaviour change the
whole feature exists to enforce.

## Considered and rejected

- **Keep a thin "extra class" add-on** as an escape hatch for one-offs — rejected: it
  re-introduces the exact anchoring we're removing and gives a class two homes again.
- **Stackable class routines** (a weekday holds a scheduled routine *plus* a class) —
  rejected: breaks the one-routine-per-weekday model for a spontaneity the user doesn't need.

Migration is non-destructive: old blocks keep working; pre-existing `.classes` add-on logs go
inert (unread, not rendered) rather than being converted or purged.
