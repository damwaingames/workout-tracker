import { chromium } from "playwright";

const URL = process.env.WT_URL || "http://localhost:8765/";
const errors = [];
const b = await chromium.launch();
const p = await b.newPage();
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
p.on("pageerror", (e) => errors.push(e.message));

await p.goto(URL, { waitUntil: "load" });
// Seed two blocks: a SHORT-named one (selected) and a LONG-named one. The widest
// option is the long one; the select must size to it, not the short selection.
await p.evaluate(() => localStorage.removeItem("workout-tracker-v2"));
await p.reload({ waitUntil: "load" });
// Rename block 1 to something long, add a 2nd block (short auto name), select short.
await p.click("#edit-toggle");
await p.fill("#block-name-input", "Glute Hypertrophy Mesocycle Phase Two");
await p.click("#edit-toggle");
await p.click('[data-action="new-block"]'); // creates "Block 2", selects it, enters edit
await p.click("#edit-toggle"); // leave edit
await p.selectOption("#block-select", { index: 1 }); // select the SHORT "Block 2"
await p.waitForTimeout(80);

const m = await p.evaluate(() => {
  const sel = document.getElementById("block-select");
  // Measure the widest option by rendering its text in a probe span.
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" + getComputedStyle(sel).font;
  document.body.appendChild(probe);
  let widest = 0;
  for (const o of sel.options) { probe.textContent = o.textContent; widest = Math.max(widest, probe.offsetWidth); }
  probe.remove();
  return { selectW: sel.getBoundingClientRect().width, widestOptText: widest, selected: sel.value, selectedText: sel.options[sel.selectedIndex].textContent };
});
console.log(JSON.stringify(m, null, 0));
// The select box should be at least as wide as the widest option's text (plus
// padding + arrow), i.e. clearly wider than the short selected label alone.
const ok = m.selectW > m.widestOptText && errors.length === 0;
await b.close();
if (errors.length) console.log("ERRORS:", errors.join("; "));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
