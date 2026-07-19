# 3. Scan barcodes with the native BarcodeDetector, no decoder library

> **Status: Superseded by [ADR-0018](0018-nutrition-domain-removed.md).** The nutrition domain,
> barcode scanning included, was removed whole. Kept as history.

Date: 2026-06-08

## Status

Accepted

## Context

The nutrition feature looks foods up in Open Food Facts by barcode, and the user
wants to scan with the phone camera. Turning a camera frame into a barcode number is
the hard part — robust decoding is exactly what barcode libraries exist for.

The app is hand-written vanilla ES modules with **no build step and no runtime
dependencies**; its whole payload is ~150 KB, and every module it loads is listed in
`sw.js` ASSETS for offline. Browser support for the native `BarcodeDetector` (the
Shape Detection API) is split: **Chrome on Android ships it** (backed by Play
Services); **Firefox and Safari implement it nowhere**. `getUserMedia` (the camera
stream) is available everywhere; only the *decoder* is missing on Firefox/Safari.

The user daily-drives Firefox on Android but will run *this* PWA in Chrome
specifically — a PWA's data exports and re-imports cleanly (`exportBackup` /
`importBackup`), so the one-time Firefox→Chrome hop is theirs to make, not the app's.

Three shapes were considered:

1. **Native `BarcodeDetector` only** — a few lines, zero deps. Works on Chrome/Android,
   absent on Firefox/Safari.
2. **Bundle a JS/WASM decoder** (zxing-wasm, via the `barcode-detector` polyfill that
   backfills the same standard API) — cross-browser, but ~1 MB of WASM vendored as a
   static asset and added to the SW cache: the app's *first runtime dependency* and
   roughly a 7× jump in cached payload.
3. **No camera scanning** — manual barcode entry + name search only.

## Decision

Take shape 1. Scan via `new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a",
"upc_e"] })` over a `getUserMedia` camera stream. **Feature-detect**
`"BarcodeDetector" in window`; where it's absent, hide the scan button and leave the
other add paths — manual barcode entry, OFF name search, Pantry pick, quick entry —
which stand on their own. The user runs the PWA in Chrome/Android, where the API is
present.

## Consequences

- **Zero new dependency.** The app stays vanilla / no-build / ~150 KB. The "first
  runtime dep" cost of a bundled decoder (shape 2) is avoided entirely.

- **Scanning is Chrome/Android-only, by design.** On Firefox, Safari, and most desktop
  browsers the scan button simply isn't rendered — *deliberately absent, not broken*. A
  future reader on an iPhone wondering "why can't I scan?" should land here. The
  non-scan add paths cover those browsers; they just cost more typing.

- **Decoding is local, so scanning works offline** up to the Open Food Facts lookup.
  A barcode already in the Pantry resolves with no network; only a *brand-new* barcode
  needs signal to fetch its Food.

- **The standard API is the seam, so cross-browser is reopenable cheaply.** If scanning
  on Firefox/Safari is ever genuinely needed, the path is the `barcode-detector`
  polyfill (zxing-wasm). Because the code is written against the *native* API surface,
  swapping the native impl for the polyfill is near-drop-in — paid for with the ~1 MB
  WASM asset in the SW cache (shape 2). Don't pre-pay that until the need is real.

- **Camera access needs HTTPS and a one-time grant.** GitHub Pages serves HTTPS; the
  permission prompt is a first-scan cost only.
