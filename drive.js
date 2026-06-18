/* Google Drive backup — the app's second window onto the network (off.js is the first).
 * A Drive backup is the whole Store as one JSON blob in the app's *hidden* per-app Drive
 * folder (the `appDataFolder` alias, scope drive.appdata), moved by hand: Phase 1 of
 * device sync, whole-blob last-write-wins, no merge (ADR-0006). Pure transport — imports
 * only the config constants, touches no store and no DOM. Auth is the Google Identity
 * Services token client, loaded lazily on first use (so a non-Drive session pays no
 * network cost and the service worker never has to cache it); Drive itself is plain
 * RESTful fetch, no `gapi`/Drive SDK (consistent with ADR-0003's native-API line).
 *
 * The four exports are the transport verbs events.js orchestrates around its confirm
 * dialogs: authorize() → token, findBackup() → the blob's id+age (or null), readBackup()
 * → the parsed Store, writeBackup() → the new modifiedTime. A cancelled sign-in rejects
 * with { cancelled: true } so the caller can stay silent; every other failure rejects
 * plainly for the generic "couldn't reach Drive" path. */

import { GOOGLE_CLIENT_ID, DRIVE_SCOPE, DRIVE_FILENAME } from "./constants.js";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

// The feature ships dormant until a client ID is configured — left empty, the Drive
// buttons stay hidden (main.js reads this) and nothing here is ever reached.
export const driveEnabled = () => !!GOOGLE_CLIENT_ID;

/* --- Auth: lazy GIS load + an in-memory token cached for its hour --------------- */

let gisPromise;
// Inject the GIS script once, on first use. Resolves when google.accounts.oauth2 is
// ready. A test that pre-defines window.google.accounts.oauth2 skips the injection.
function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error("drive-gis-load-failed")); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

let tokenClient;
// One token-response promise per requestAccessToken call: the GIS callback/error_callback
// are reassigned each time so concurrent calls don't cross wires. A closed popup or a
// denied scope surfaces as a { cancelled: true } rejection — the caller stays silent.
function requestToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
      });
    }
    tokenClient.callback = (resp) => {
      if (resp && resp.access_token) resolve(resp);
      else reject(Object.assign(new Error("drive-auth-failed"), { cancelled: true }));
    };
    tokenClient.error_callback = () =>
      reject(Object.assign(new Error("drive-auth-cancelled"), { cancelled: true }));
    // prompt:"" attempts a silent grant when there's an active Google session, falling
    // back to the consent popup; either way the callback above resolves the token.
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

let token = null;
let tokenExp = 0;
// A valid cached access token, or a fresh one. Cached for its lifetime less a 60s margin,
// so a back-up-then-restore in the same session is a single grant.
export async function authorize() {
  if (token && Date.now() < tokenExp - 60000) return token;
  await loadGis();
  const resp = await requestToken();
  token = resp.access_token;
  tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
  return token;
}

/* --- Drive REST: one blob in the hidden appDataFolder --------------------------- */

const authHeader = (t) => ({ Authorization: "Bearer " + t });

// The single backup blob's { id, modifiedTime }, or null if none exists yet. Listing is
// scoped to appDataFolder, so it only ever sees this app's own hidden file.
export async function findBackup(t) {
  const res = await fetch(
    DRIVE + "/files?spaces=appDataFolder&pageSize=1&fields=" + encodeURIComponent("files(id,modifiedTime)"),
    { headers: authHeader(t) },
  );
  if (!res.ok) throw new Error("drive-list-failed");
  const data = await res.json();
  const f = data.files && data.files[0];
  return f ? { id: f.id, modifiedTime: f.modifiedTime } : null;
}

// Download and parse the blob — the same shape a file export / import round-trips.
export async function readBackup(t, id) {
  const res = await fetch(DRIVE + "/files/" + id + "?alt=media", { headers: authHeader(t) });
  if (!res.ok) throw new Error("drive-read-failed");
  return res.json();
}

// Overwrite the blob (media PATCH) or create it (multipart POST with the appDataFolder
// parent). Returns the new modifiedTime, which the caller shows as "Backed up · <time>".
export async function writeBackup(t, existing, json) {
  let res;
  if (existing && existing.id) {
    res = await fetch(UPLOAD + "/files/" + existing.id + "?uploadType=media&fields=modifiedTime", {
      method: "PATCH",
      headers: { ...authHeader(t), "Content-Type": "application/json" },
      body: json,
    });
  } else {
    const boundary = "wt-boundary-" + Date.now();
    const meta = { name: DRIVE_FILENAME, parents: ["appDataFolder"] };
    const body =
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(meta) + "\r\n" +
      "--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" +
      json + "\r\n" +
      "--" + boundary + "--";
    res = await fetch(UPLOAD + "/files?uploadType=multipart&fields=modifiedTime", {
      method: "POST",
      headers: { ...authHeader(t), "Content-Type": "multipart/related; boundary=" + boundary },
      body,
    });
  }
  if (!res.ok) throw new Error("drive-write-failed");
  const data = await res.json();
  return data.modifiedTime;
}
