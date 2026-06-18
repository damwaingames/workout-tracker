# 6. Manual whole-blob Drive backup as Phase 1 of device sync

Date: 2026-06-18

## Status

Accepted

## Context

The app is a static, backend-less PWA on GitHub Pages; data lives in one localStorage
**Store** per device, with no way to carry it between devices except the manual file
**Export**/**Import** (events.js). The user trains on a phone and reviews on a laptop and
wants her history on both. The eventual want is **device sync** — two replicas kept in
agreement. The question was how much of that to build now, on a host with no server, no
secret store, and a hard "keep features simple, consolidate" preference.

## Decision

1. **A Drive backup is the existing backup blob, with Drive as a second transport.** Push
   serialises the whole Store exactly as `exportBackup` does; pull runs the bytes back
   through the **shared `applyBackup` gate** (structural check → `version === 2` →
   `normalise` → `setState`) that file Import already uses. The Drive blob and an export
   file are interchangeable — the same data either way (the export file is pretty-printed,
   the Drive blob compact). No new data shape, no schema change.

2. **The blob lives in the hidden `appDataFolder`** (scope `drive.appdata`), not the
   user's visible Drive. One file, invisible, app-managed.

3. **Manual, not automatic.** Two buttons — *Back up to Drive* / *Restore from Drive* —
   mirroring Export/Import. No pull-on-open, no push-on-save, no background sync.

4. **Whole-blob last-write-wins, no merge — and we name it Phase 1.** A restore replaces
   the whole local Store; a backup replaces the whole remote blob. There is no per-item
   reconciliation. This is a deliberate *subset* of the eventual sync, chosen because LWW
   forecloses no path: the merge can be built later without undoing anything here.

5. **The conflict guard is information, not machinery.** Both confirm dialogs surface the
   Drive copy's `modifiedTime` ("last updated Tue 17 Jun, 14:30 — overwrite?"), so the
   human makes an informed last-write-wins call. **Nothing is stored** to track sync
   state — a last-seen timestamp would have to live *outside* the blob (or it round-trips
   and every device inherits the others' clock), and that machinery belongs to Phase 2.

6. **Native `fetch` + the GIS token client, no `gapi`/Drive SDK** (consistent with
   ADR-0003). Auth is loaded lazily on first use, so a non-Drive session pays no network
   cost; the browser token flow carries no client secret, so the Client ID is public and
   committed.

7. **The service worker gains a same-origin guard.** It now caches the app shell only and
   lets every cross-origin request pass to the network untouched — required so a failed
   Drive call errors instead of falling back to `index.html`, and so API responses don't
   pollute the versioned shell cache.

## Considered options

- **Visible file (`drive.file`, non-sensitive scope).** Gentler consent screen, no
  "unverified app" warning, and the backup would be a file the user could see and
  download. Rejected for the tidier hidden folder: a visible `workout-tracker.json`
  sitting in Drive root invites manual fiddling, and the app never needs the user to
  touch it. The nominal cost — the sensitive-scope "unverified app" warning — is removed
  entirely by deploying with an Internal Workspace consent screen (see Consequences).
- **Automatic sync now** (pull-on-open / push-on-save). Rejected: it implies conflict
  handling the whole-blob model can't honestly provide, and contradicts the simple,
  manual mental model of the existing Export/Import.
- **Pay toward merge now** — per-key timestamps on `state.log`, or a stored base
  snapshot for future three-way reconciliation. Rejected for Phase 1: per-key timestamps
  touch every write path for no present benefit; the base snapshot is speculative until
  the merge exists. Phase 2's most likely mechanism is **three-way reconciliation against
  a stored base** (so newest-wins falls out per item without per-key clocks); **Library**
  and **Pantry** already carry their merge rules — append-only membership, and ADR-0004's
  trusted-Food precedence — so the hard part is `state.log` and concurrent block edits.
- **A stored "last synced" guard.** Rejected for Phase 1 in favour of showing the remote
  timestamp in the dialog: same footgun protection, zero stored state, schema stays clean.

## Consequences

- **Phase 1 is schema-clean.** Nothing about the Store changes; an older build reads a
  Drive-restored Store unchanged, and the LWW behaviour is a strict subset of the sync to
  come.
- **The same-origin guard also corrects a latent OFF bug.** OFF responses were being
  cached in the app shell, so a re-lookup could be served a stale product — undermining
  ADR-0004's "an untrusted Food *is* refreshed by an OFF re-lookup." Re-lookups now reach
  the network. **Trusted Foods are unaffected**: they short-circuit at `events.js:353`
  *before* the network, so they never touched the cache in either direction.
- **The known footgun.** Backing up from a device whose Store is older than the Drive copy
  silently overwrites newer cloud data. Mitigated, not prevented, by the timestamp in the
  dialog; the automatic guard is a Phase-2 deliverable.
- **Drive is online-only.** The deployment uses an **Internal** Workspace consent screen,
  so any account in the org can authorise with **no verification and no "unverified app"
  warning** — the data lives in the org's Drive, and only org accounts can sign in. (A
  non-org deployment would instead use External + "Testing" mode: a one-time unverified
  warning per device, capped at 100 test users, still no verification for personal use.)
- When real sync lands, the user-facing language graduates from **backup/restore** to
  **sync**; until then the buttons say what they do (CONTEXT.md flags "sync" as a term to
  avoid for the current behaviour).
