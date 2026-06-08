/* Open Food Facts client — the app's one window onto the network. Two plain RESTful
 * GETs, no SDK: a product-by-barcode lookup and a name search, both on the v2 API and
 * the same CORS-enabled host (search-a-licious sends no CORS header, so a browser can't
 * call it; the legacy cgi/search.pl is being retired — /api/v2/search is the durable,
 * CORS-friendly middle). Pure async I/O — imports only NUTRIENTS (for the per-100g field
 * mapping), touches no store and no DOM. Returns normalised Food records
 * { barcode, name, brand, per100g }, or null/[] when a product isn't found. A *network*
 * failure (offline) rejects — callers catch that to fall back to the Pantry / a quick
 * entry; a found-but-empty result resolves empty, so the two stay distinguishable. */

import { NUTRIENTS, APP_VERSION } from "./constants.js";

const BASE = "https://world.openfoodfacts.org";
// OFF requires a custom User-Agent (AppName/Version (contact)) to identify the app and
// not be throttled as a bot. A browser forbids setting `User-Agent` on fetch, but OFF's
// CORS allow-list includes `X-User-Agent` (a settable custom header) as the browser-
// compatible equivalent — so identify ourselves through that. Rate limits are per IP
// (15/min product, 10/min search), which the explicit Find button (no search-as-you-
// type) stays under.
const UA = "workout-tracker/" + APP_VERSION + " (alyssa@damwaingames.co.uk)";
const get = (url) => fetch(url, { headers: { "X-User-Agent": UA } });
// OFF leaves a nutriment absent or "" when unknown; coerce anything non-positive to 0.
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// Map one OFF product object to a Food. `brands` is normally a comma string, but some
// OFF surfaces return an array — normalise both. Returns null for junk (no barcode), so
// a search result list can .filter(Boolean) the gaps out.
function toFood(p) {
  if (!p || !p.code) return null;
  const nutr = p.nutriments || {};
  const per100g = {};
  NUTRIENTS.forEach((n) => { per100g[n.id] = num(nutr[n.off]); });
  return {
    barcode: String(p.code),
    name: String(p.product_name || "").trim(),
    brand: (Array.isArray(p.brands) ? p.brands.join(", ") : String(p.brands || "")).trim(),
    per100g,
  };
}

// Look one product up by barcode (the OFF primary key). Resolves to a Food, or null if
// OFF has no such product. Rejects only on a network error (→ offline fallback).
export async function lookupBarcode(barcode) {
  const code = String(barcode).replace(/\D/g, "");
  if (!code) return null;
  const res = await get(BASE + "/api/v2/product/" + code + ".json?fields=code,product_name,brands,nutriments");
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.status === 1 ? toFood(data.product) : null;
}

// Search products by name (v2 search). Resolves to an array of Foods (possibly empty);
// hits live under `data.products`. Rejects only on a network error. Capped at 20.
export async function searchFoods(query) {
  const q = String(query).trim();
  if (!q) return [];
  const res = await get(BASE + "/api/v2/search?search_terms=" + encodeURIComponent(q) + "&page_size=20&fields=code,product_name,brands,nutriments");
  if (!res.ok) return [];
  const data = await res.json();
  return (data && Array.isArray(data.products) ? data.products : []).map(toFood).filter(Boolean);
}
