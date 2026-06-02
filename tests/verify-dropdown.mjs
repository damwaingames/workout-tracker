import { verify } from "./harness.mjs";

verify(async ({ page, ck, reset }) => {
  await reset();

  // Seed two blocks: a LONG-named one and a SHORT one (selected). The widest
  // option is the long one; the select must size to it, not the short selection.
  await page.click("#edit-toggle");
  await page.fill("#block-name-input", "Glute Hypertrophy Mesocycle Phase Two");
  await page.click("#edit-toggle");
  await page.click('[data-action="new-block"]'); // creates "Block 2", selects it, enters edit
  await page.click("#edit-toggle"); // leave edit
  await page.selectOption("#block-select", { index: 1 }); // select the SHORT "Block 2"
  await page.waitForTimeout(80);

  const m = await page.evaluate(() => {
    const sel = document.getElementById("block-select");
    // Measure the widest option by rendering its text in a probe span.
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" + getComputedStyle(sel).font;
    document.body.appendChild(probe);
    let widest = 0;
    for (const o of sel.options) { probe.textContent = o.textContent; widest = Math.max(widest, probe.offsetWidth); }
    probe.remove();
    return { selectW: sel.getBoundingClientRect().width, widestOptText: widest, selectedText: sel.options[sel.selectedIndex].textContent };
  });
  console.log(JSON.stringify(m));
  // The select box should be at least as wide as the widest option's text (plus
  // padding + arrow), i.e. clearly wider than the short selected label alone.
  ck("select sizes to widest option, not the short selection", m.selectW > m.widestOptText);
});
