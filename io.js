/* Data I/O — serialise / restore / merge / Drive. The file-backup verbs (Export + wholesale
 * Restore), the block-import merge verb (ADR-0009), and the Drive transport (ADR-0006) live here,
 * lifted out of events.js so that module keeps only event dispatch. events.js wires the exported
 * entry points to the footer's data-action / file-input handlers. Reads the Store and drive.js;
 * never owns event routing, and nothing imports back into events — the module graph stays acyclic. */

import { SUPPORTED_VERSIONS } from "./constants.js";
import { state, setState, setEditing, save, normalise } from "./state.js";
import { render, hydrateNotes } from "./render.js";
import { today } from "./helpers.js";
import { authorize, findBackup, readBackup, writeBackup } from "./drive.js";

export function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workout-log-" + today() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Validate a parsed backup, then swap it in — the one place the structural + version
// gate lives, shared by file Import and Drive Restore so neither can skip it. Returns
// whether it applied; on a bad/incompatible payload it alerts and leaves the Store
// untouched (the all-or-nothing contract — local data is only ever replaced wholesale).
function applyBackup(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.blocks) || !data.blocks.length) {
    window.alert("Could not read that backup.");
    return false;
  }
  // Gate on version explicitly (the shared SUPPORTED_VERSIONS list): normalise() resets unknown
  // input to defaults, so without this an incompatible backup would silently wipe current data.
  if (!SUPPORTED_VERSIONS.includes(data.version)) {
    window.alert("That backup is from an incompatible version — not importing. Your current data is unchanged.");
    return false;
  }
  setState(normalise(data));
  setEditing(false);
  save(); render(); hydrateNotes();
  return true;
}

export function importBackup(file) {
  const r = new FileReader();
  r.onload = function () {
    let data;
    try { data = JSON.parse(r.result); }
    catch (err) { window.alert("Could not read that backup file."); return; }
    applyBackup(data);
  };
  r.readAsText(file);
}

/* ---------------------------------------------------------------------- *
 * Drive backup (Phase 1 of device sync — ADR-0006)                       *
 * The remote transport for the same blob exportBackup serialises: Back   *
 * up overwrites the hidden Drive copy with this device's Store, Restore   *
 * overwrites this device's Store with it. Whole-blob last-write-wins, so  *
 * both confirms surface the Drive copy's age to inform the overwrite.     *
 * ---------------------------------------------------------------------- */

// The Drive copy's modifiedTime as a human, locale-aware stamp for the confirm dialogs.
const fmtDriveTime = (iso) => new Date(iso).toLocaleString();

// Transient "Backed up · 14:32" line beside the Drive buttons (success feedback; errors
// use alert, matching importBackup). The footer isn't re-rendered, so it simply persists.
function driveStatus(text) {
  const el = document.getElementById("drive-status");
  if (el) el.textContent = text;
}

// A closed sign-in popup is the user's choice — stay silent; anything else is the
// generic "couldn't reach Drive" path (offline, blocked popup, API error). The local
// Store is never touched on a failure, so the message can promise it's unchanged.
function driveError(e) {
  if (e && e.cancelled) return;
  window.alert("Couldn't reach Google Drive — you may be offline, or sign-in was blocked. Your data is unchanged.");
}

// Authorise, then locate the existing blob (id + age) — the shared opening both ops need
// before they can show their confirm. Auth is cached for the session, so the second op
// of a back-up-then-restore reuses the token.
async function driveConnect() {
  const t = await authorize();
  return { t, existing: await findBackup(t) };
}

export async function drivePush() {
  driveStatus(""); // clear any prior result so the line never contradicts this op's outcome
  let t, existing;
  try { ({ t, existing } = await driveConnect()); }
  catch (e) { return driveError(e); }
  const msg = existing
    ? "Your Drive backup was last updated " + fmtDriveTime(existing.modifiedTime) +
      ".\n\nOverwrite it with this device's data?"
    : "Create a Drive backup from this device's data?";
  if (!window.confirm(msg)) return;
  try {
    const modified = await writeBackup(t, existing, JSON.stringify(state));
    driveStatus("Backed up to Drive · " + fmtDriveTime(modified));
  } catch (e) { driveError(e); }
}

export async function drivePull() {
  driveStatus(""); // clear any prior result so the line never contradicts this op's outcome
  let t, existing;
  try { ({ t, existing } = await driveConnect()); }
  catch (e) { return driveError(e); }
  if (!existing) {
    window.alert("No Drive backup found yet — back up from a device that has your data first.");
    return;
  }
  if (!window.confirm("Restore the Drive backup from " + fmtDriveTime(existing.modifiedTime) +
    "?\n\nThis replaces all data on this device.")) return;
  let data;
  try { data = await readBackup(t, existing.id); }
  catch (e) { return driveError(e); }
  if (applyBackup(data)) driveStatus("Restored from Drive · " + fmtDriveTime(existing.modifiedTime));
}
