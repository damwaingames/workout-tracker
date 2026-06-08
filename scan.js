/* Camera barcode scanner — the app's one window onto the camera, the visual sibling
 * of off.js's window onto the network. Wraps the native Shape Detection API
 * (BarcodeDetector) over a getUserMedia stream with no decoder library (ADR-0003),
 * so it's Chrome/Android-only and feature-detected. Touches the DOM only through the
 * <video> element it's handed (detection needs a media source); it knows nothing of
 * the Pantry or food entries — it just turns the camera into a barcode string. */

// The retail-barcode symbologies a food carton actually uses — EAN/UPC. Narrowing the
// detector to these (vs all formats) keeps it fast and avoids false QR/Code-128 hits.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

// Is native barcode scanning available? Chrome on Android ships BarcodeDetector
// (backed by Play Services); Firefox and Safari don't (ADR-0003). Render and the
// Scan button gate on this, so where it's absent the button simply isn't drawn.
export function scanSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

// Start the camera into `video` and resolve with the first barcode seen. Returns
// { done, cancel }: `done` is the promise (a barcode string on a hit, or a rejection
// — AbortError on cancel, the getUserMedia error otherwise); `cancel()` stops early
// (the Cancel button, or the finder closing). Either way the stream + detect loop are
// torn down on settle, so the camera light goes out. Decoding is local, so a barcode
// already in the Pantry resolves with no network — only a new one needs signal.
export function scanBarcode(video) {
  const detector = new BarcodeDetector({ formats: FORMATS });
  let stream = null, raf = 0, settled = false, resolve, reject;
  const done = new Promise((res, rej) => { resolve = res; reject = rej; });

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) video.srcObject = null;
  };
  // Settle exactly once: stop everything, then resolve/reject. Guards against a hit
  // and a cancel racing, or a late getUserMedia resolving after a cancel.
  const finish = (fn, v) => { if (settled) return; settled = true; cleanup(); fn(v); };

  // Poll the live frame for a barcode. detect() is awaited, so the loop self-throttles
  // to decode speed; a transient per-frame error (a blurry frame) is swallowed and the
  // scan continues. requestAnimationFrame also pauses the loop if the tab is hidden.
  const tick = async () => {
    if (settled) return;
    try {
      const codes = await detector.detect(video);
      const hit = codes && codes.find((c) => c && c.rawValue);
      if (hit) return finish(resolve, String(hit.rawValue));
    } catch (e) { /* one bad frame — keep scanning */ }
    if (!settled) raf = requestAnimationFrame(tick);
  };

  (async () => {
    try {
      // environment = the rear camera, where the barcode is pointed.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (settled) { cleanup(); return; } // cancelled during the permission prompt — drop the stream we just got
      video.srcObject = stream;
      video.play().catch(() => {}); // best-effort; detection reads the live element regardless
      tick();
    } catch (err) {
      finish(reject, err); // no camera / permission denied
    }
  })();

  return { done, cancel: () => finish(reject, new DOMException("Scan cancelled", "AbortError")) };
}
