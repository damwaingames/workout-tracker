# The wind-down is one shared app-level segment, not a per-routine list

> **Status: Superseded by [ADR-0028](0028-wind-down-is-a-standalone-daily-session.md).** The
> wind-down is a daily freeform mobility *habit* (weekly-adherence tracked, outside the block), not
> a cool-down segment shown beneath every training routine — the framing here had the wrong shape.

A **wind-down** is a short cool-down (a curated list of `mobility`-context stretches + a target
**duration**) that appears beneath every non-rest routine, with its own per-cell done-tick. We
store it as a single app-level `state.winddown = { durationMin, exercises: [{id}, …] }`,
defined once in Edit mode — **not** a list carried per routine, and **not** part of a block
**import**.

This is the same shape as the **Holiday Workout** (ADR-0002, shape 2): one definition, edited
in one place, reused everywhere. Chosen over a per-routine wind-down for simplicity and
consolidation, and it matches the user's actual plan — the same ~10-minute stretch on every
training day. The accepted cost is that you cannot make one day's wind-down differ from
another's; if per-day variation is ever genuinely needed, that is the reason to reopen this,
and a per-routine list is the path.

Left out of block **import** for the same reason the Holiday Workout is: it's an app-level
fixture, not block content, so an imported block never carries one. A wind-down is a checklist
only — it feeds no tonnage, calorie, or overload total; its sole logged state is the per-cell
done-tick (and the day's **Session RPE**, ADR-0012, which is not the wind-down's own).
