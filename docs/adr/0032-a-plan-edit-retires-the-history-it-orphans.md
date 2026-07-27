# A plan edit retires the history it orphans

A **Performance** back-references the plan slot it was logged in (ADR-0020) by index: the **Block**,
the week, the **Routine** position, the **Group**, the **Item**, the round. Some plan edits destroy a
slot outright — removing a **Group**, removing an **Item**, switching a **Routine**'s kind. The
history keyed to those slots has to go somewhere.

**It is retired, not deleted and not refused.** The **Performance** stays on its **Exercise**, and
its ctx is coarsened to the day it was logged: `{block, week, routine}`, with the group / item / round
dropped. The set keeps counting towards **PRs**, **ghosts** and the **e1RM** trend; it stops
pre-filling a slot and stops being tallied into that **Session**'s **tonnage**, because it is no
longer part of any planned slot. An **Attendance**'s ctx *is* that coarse triple, so retiring it means
dropping the ctx entirely.

This is the shape the v5→v6 migration already produces for pre-v6 history, which is why it is safe:
`sameItemSlot` cannot match a ctx with no group, so a retired **Performance** provably never collides
with a live slot — including one that later reappears at the same index.

The alternatives were refusing an edit that would orphan logged work, and confirming every such edit.
Refusing makes ordinary authoring adversarial: the plan is a living document and a **Block** you have
trained is exactly the one you most want to correct. Deleting would falsify a set that really
happened, which is the thing ADR-0020 exists to protect. So: retire by default, and **confirm before
the destructive edits** — remove-**Group**, remove-**Item**, kind switch — quoting how much logged
work it affects. Lossless edits (adding, reordering) ask nothing.

## Consequences

- Every plan verb owns the ctx consequence of its own edit; the verbs live in one module (`plan.js`)
  so the obligation is visible where a new plan-editing control gets added.
- A reorder is *not* an orphaning edit: moving a **Group** or a day swaps the affected indices, so
  the history follows the plan rather than being retired.
- Which **Performances** an edit touches depends on the **Holiday** swap (ADR-0025). A swapped cell's
  sets were logged against the **Holiday Session**, so a **Block** **Routine**'s verbs skip those
  cells and the singleton's verbs cover exactly them — a kind switch cannot retire an away workout.
- A **Session RPE** goes with the **Session** a kind switch replaces; `collapsed` and the `holiday`
  flag are properties of the cell, not the **Routine**, and stay.
- Shortening a **Block** retires nothing. It destroys no structure and is undone by lengthening
  again, so the weeks beyond the new end keep their history for when they come back.
- **Stores** already mis-keyed by the defect this fixes are not repaired — a separate decision and a
  separate migration.
