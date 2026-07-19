# The nutrition publish is an idempotent per-day upsert, keyed by cell

> **Status: Superseded by [ADR-0018](0018-nutrition-domain-removed.md).** The nutrition publish
> was removed with the whole nutrition domain. Kept as history.

Re-publishing must **update** a day's Health Connect record, never **duplicate** it: the same
day published twice is one record, not two. Health Connect upserts on a caller-supplied
`clientRecordId` (it overwrites when the id already exists *and* the incoming
`clientRecordVersion` is higher, otherwise ignores the write). So the **nutrition projection**
sets `clientId` to the day's **cell** key, and the contract is:

- **The cell key is the upsert identity.** One record per logged **weekday**, keyed by its
  `block/week/routine` **cell** — stable across everything that is not "a different day". A
  **schedule** reorder moves the record's *date* but not its `clientId`, because the cell key
  is routine-numbered, not weekday-numbered (ADR-0005) — so rearranging a week re-dates a
  record in place rather than orphaning the old one and inserting a new one. Per-day, not
  per-**food-entry**: per-entry would need stable ids on entries (they are index-addressed)
  for no charting gain, since Health Connect charts the day's total whatever feeds it.
- **The version is stamped at write time, in the conduit — never in the projection.** The
  projection stays a *pure, clock-free* derived value (the reason `health.js` emits no
  timestamp), and the companion sets `clientRecordVersion = System.currentTimeMillis()` as it
  writes. That gives monotonic last-write-wins: a re-published edited day beats the stored one
  because its version is newer, and an unchanged day is harmlessly re-written identical.
- **The conduit builds the time interval from the device's zone.** `NutritionRecord` is a
  time-interval record; the projection carries a bare `date` (`YYYY-MM-DD`), and the companion
  expands it to `[00:00, 24:00)` in the device timezone at write time — keeping the PWA
  timezone-agnostic (as the builder already is) and the zone a native concern.

This contract is deliberately **independent of the architecture** (ADR-0015): cell-keyed,
write-time-versioned, per-day would survive a future pure-Kotlin rewrite unchanged, because it
describes *what a published record is*, not *who writes it*.

## Consequences

- **Last-write-wins, single publish source.** As with the Drive backup (ADR-0006), a stale
  publish silently overwrites fresher data — but the footgun is defanged by there being one
  publish source: you log and publish on the phone, from the phone's Store. Publishing from a
  second device's older Store is the one unsupported case, accepted exactly as ADR-0006
  accepts its own.
