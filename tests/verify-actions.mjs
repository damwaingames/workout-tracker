/* Dispatch-vocabulary guard (#62). actions.js declares every name that routes an event, and the JS
 * emitters interpolate those constants — so render/compose can't drift from the events maps without
 * an import breaking. But the app shell (index.html) authors six data-action values as literals, and
 * HTML can't import a constant. This is what covers them: it scrapes every routing attribute out of
 * the live DOM and asserts each value is declared.
 *
 * So it fails on exactly the two mistakes the constants can't catch: a hand-written attribute in
 * index.html that no handler answers, and an emitter that went back to spelling a literal.
 *
 * The reverse direction — every declared name has a live handler — is covered behaviourally by the
 * other twenty scripts, which click and type through the whole app. */

import { verify } from "./harness.mjs";
import { ACTION, FH, TARGET, EX_FIELD } from "../actions.js";

const declared = (o) => new Set(Object.values(o));

verify(async ({ page, ck, reset }) => {
  const ACTIONS = declared(ACTION), FHS = declared(FH);
  const TARGETS = new Set([...declared(TARGET), ...declared(EX_FIELD)]);

  // Scrape both modes: the log view + Library carry one set of controls, Edit mode renders the whole
  // compose surface (kind switch, group/item editors, rails, block config, Holiday editor) and the
  // Library's exercise editors. Together they cover every emitter in the app.
  const scrape = () => page.evaluate(() => {
    const vals = (attr) => [...document.querySelectorAll("[" + attr + "]")].map((e) => e.getAttribute(attr));
    return { action: vals("data-action"), fh: vals("data-fh"), target: vals("data-target") };
  });
  const merge = (a, b) => ({ action: [...a.action, ...b.action], fh: [...a.fh, ...b.fh], target: [...a.target, ...b.target] });

  await reset();
  await page.click('[data-action="edit-block"]'); // the shell's own literal — if this breaks, so has the contract
  await page.waitForTimeout(150);
  const editMode = await scrape();
  await page.click('[data-action="edit-block"]');
  await page.click('[data-action="view"][data-view="library"]');
  await page.waitForTimeout(150);
  const found = merge(editMode, await scrape());

  ck("the app emits routing attributes at all (the scrape found something)",
    found.action.length > 10 && found.fh.length > 0 && found.target.length > 0);

  const undeclared = (list, set) => [...new Set(list)].filter((v) => !set.has(v));
  const badActions = undeclared(found.action, ACTIONS);
  const badFh = undeclared(found.fh, FHS);
  const badTargets = undeclared(found.target, TARGETS);

  ck("every data-action in the DOM is declared in actions.js" + (badActions.length ? " — stray: " + badActions.join(", ") : ""), badActions.length === 0);
  ck("every data-fh in the DOM is declared in actions.js" + (badFh.length ? " — stray: " + badFh.join(", ") : ""), badFh.length === 0);
  ck("every data-target in the DOM is declared in actions.js" + (badTargets.length ? " — stray: " + badTargets.join(", ") : ""), badTargets.length === 0);

  // The shell's six literals are the reason this script exists — assert they're actually reached, so
  // the guard can't quietly pass by scraping a DOM that never contained them.
  const shell = ["new-block", "edit-block", "export", "drive-push", "drive-pull", "reset"];
  const seen = new Set(found.action);
  ck("the index.html-authored actions are among what was scraped", shell.every((a) => seen.has(a)));
  ck("...and every one of them is declared", shell.every((a) => ACTIONS.has(a)));
});
