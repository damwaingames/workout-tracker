# Nutrition is published to Health Connect one-way, via a stateless companion

> **Status: Superseded by [ADR-0018](0018-nutrition-domain-removed.md).** The nutrition projection
> and its Health Connect publish pipeline were removed with the whole nutrition domain; the
> companion app is orphaned. Kept as history.

The app records nutrition; Google's charts live in **Health Connect**, which is a native
Android SDK with **no cloud REST** — a PWA cannot reach it. So the app **publishes** a
**nutrition projection** (CONTEXT) — a per-day, derived, lossy view of the Store, one
`NutritionRecord` per logged **weekday** — *out* to Health Connect. This is deliberately the
export counterpart of the ADR-0012/0014 boundary: the app owns what-you-ate/did, and rather
than growing charts of its own it hands that data to Google's chart surface.

Three properties make it a **publish**, not a **sync** or a **backup**:

- **One-way, no read-back.** The Store is the sole source of truth; Health Connect is a
  downstream sink. There is no "restore from Health Connect" and no merge, so none of the
  Drive-backup Phase-2 machinery (ADR-0006) applies. (The concurrency model — last-write-wins
  from a single phone publish source — is ADR-0016.)
- **A stateless companion, not a second place.** Reaching Health Connect needs *some* native
  surface, but the smallest possible one: a tiny Kotlin **companion** that owns no training
  data, persists nothing, and has no real UI — it receives a projection, writes it, and
  forgets it. It exists solely to clear the platform requirement. The PWA stays the single
  **place** ([[keep-features-simple-consolidation]]); the companion is a pipe, so it cannot
  drift from the Store (it holds nothing to drift) and cannot accrete features (there is
  nothing to build on).
- **Manual, over a share intent.** The PWA hands the projection to the companion through the
  Android share sheet (`navigator.share` → the companion's `ACTION_SEND` filter) — a
  transport that carries the payload in the intent, needing no account or token on either
  side. Publishing is a user gesture, mirroring Drive backup's deliberately-manual model
  (ADR-0006), not a background push.

## Considered and rejected

- **A Capacitor hybrid, or a full Kotlin rewrite.** Rejected for the minimal conduit: no
  maintained Capacitor plugin writes `NutritionRecord` (forking one *and* turning the static,
  build-free PWA into a hybrid build is two costs at once), and a full rewrite throws away a
  clean PWA for a publish convenience.
- **Drive `appdata` as the transport** (the PWA writes the projection to Drive, the companion
  reads it). Rejected: `appdata` is scoped per-OAuth-client, so the companion would need its
  own token, the Drive scope, and the *same* signed-in account — making it stateful and
  re-coupling it to the Drive/Workspace account this design deliberately keeps separate. The
  stateless-conduit property is what forecloses it.
- **Automatic / background publish** (on every food edit). Rejected for the same reason Drive
  backup is manual (ADR-0006): a PWA can't push to a native app unprompted, and it implies
  machinery the one-way model doesn't need. **This is the named revisit trigger:** if the
  manual share-sheet gesture becomes a genuine daily nuisance, that — and only that — is the
  reason to reconsider a pure-Kotlin rewrite, where the app could publish as you log.

Distribution (a free Limited Distribution developer account under a personal Gmail, installed
with no developer mode so it coexists with the phone's banking apps, decoupled from the
Workspace/Drive account) is a forced platform **constraint**, not a decision with
alternatives — its home is the companion's own docs, not this log.
