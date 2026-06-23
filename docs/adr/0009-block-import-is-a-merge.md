# Block import is a merge, a separate verb from Restore

Restore (file or Drive, ADR-0006) is wholesale: `applyBackup` replaces the entire Store after
a version gate. Importing a block design must instead *merge* — add new library exercises and
append a block while leaving existing blocks, the log, the pantry, and profile intact — so it
gets its own apply path and never routes through `applyBackup`. The import file is a strict
subset of an export (`{ version, library?, blocks? }`), kept symmetric so an export is also a
valid import.

Validation is all-or-nothing per block. Structural/semantic faults — a placement referencing
an exercise not in the (merged) library, a placement whose exercise **contexts** don't include
the routine's kind, an unknown routine kind, a broken 1–7 routine set — reject the whole block
with an error list (you regenerate and retry). Cosmetic faults — a non-Monday `startDate`, an
unknown `loadMode` — are coerced (`mondayOf`, drop) and reported. A half-imported block is
worse than a clear "fix this". As built the import is atomic as a whole — any block's fault
rejects every block and changes nothing — since an import is typically a single block and a
clean retry beats a confusing partial apply.

## Why not reuse applyBackup
Its contract is "local data is only ever replaced wholesale" — routing a partial subset through
it would either fail its `blocks.length`/version gate or, with a stripped payload, silently
wipe the log. The merge verb is deliberately the opposite contract: additive, never destructive
to existing data.
