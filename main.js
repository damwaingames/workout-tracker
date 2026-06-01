/* Entry point: load the store, wire the global listeners, do the first render,
 * stamp the version, and register the service worker. Module scripts are
 * deferred, so the DOM is parsed by the time this runs. */

import { APP_VERSION } from "./constants.js";
import { load } from "./state.js";
import { render, hydrateNotes } from "./render.js";
import { handleClick, handleSubmit, handleField } from "./events.js";

load();
document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", handleField);
// File inputs don't fire "input" — bind the importer's change directly so every
// other field is handled once (via "input") rather than twice (input + change).
document.getElementById("import-input").addEventListener("change", handleField);
render();
hydrateNotes();
const versionTag = document.getElementById("version-tag");
if (versionTag) versionTag.textContent = "v" + APP_VERSION;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  });
}
