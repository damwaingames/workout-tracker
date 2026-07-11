import { verify } from "./harness.mjs";

/* Dark mode (v3.3.0) — a re-skin driven by prefers-color-scheme: the palette lives in CSS custom
 * properties, and a @media (prefers-color-scheme: dark) block re-points them. This asserts the
 * *wiring* (not exact colors): the body background follows the emulated scheme, and a card surface
 * flips too — so the media query genuinely reaches the variables, page and components alike. */
verify(async ({ page, ck, reset }) => {
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const channel = (rgb) => Number(rgb.match(/\d+/g)[0]); // red channel — enough to tell light from dark

  await reset();

  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(50);
  const light = await bodyBg();
  ck("light scheme → light background (" + light + ")", channel(light) > 200);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(50);
  const dark = await bodyBg();
  ck("dark scheme → dark background (" + dark + ")", channel(dark) < 60);

  // A card surface flips too — proves the re-pointed variables reach components, not just <body>.
  const cardBg = await page.evaluate(() => {
    const el = document.querySelector(".routine") || document.querySelector(".week-btn");
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  ck("a card surface is dark under dark scheme (" + cardBg + ")", cardBg !== null && channel(cardBg) < 70);
});
