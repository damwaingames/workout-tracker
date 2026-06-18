import { verify } from "./harness.mjs";
import { GOOGLE_CLIENT_ID } from "../constants.js";

/* Drive backup (ADR-0006): Phase-1 manual, whole-blob, last-write-wins to the hidden
 * appDataFolder. Headless has no Google session, so the GIS token client is stubbed via
 * addInitScript (hands back a fake access token) and the Drive REST endpoints are routed
 * to a single in-memory blob — the same mock-the-network shape verify-scan uses for OFF.
 * Exercises: the dormant-until-configured gate (buttons hidden with no Client ID), a
 * create → restore round-trip through the shared applyBackup path, and the empty-restore
 * message. The service-worker same-origin guard isn't covered here — the harness blocks
 * the SW outright, and it's offline-only progressive enhancement. */
verify(async ({ page, ck, reset, ls }) => {
  const wKey = "b1.w1.d1.ex.goblet-squats.s0.w";

  // --- the fake Drive: one blob in appDataFolder (null until first backup) ---
  let file = null;
  let nextId = 1;
  const stamp = () => new Date().toISOString();
  // Pull the media (state JSON) part out of writeBackup's multipart create body.
  const mediaOf = (body) => {
    const first = body.indexOf("\r\n\r\n");
    const second = body.indexOf("\r\n\r\n", first + 4);
    return body.slice(second + 4, body.lastIndexOf("\r\n--"));
  };
  await page.route(/googleapis\.com/, async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    // List the appDataFolder
    if (url.includes("/drive/v3/files?") && url.includes("spaces=appDataFolder")) {
      return json({ files: file ? [{ id: file.id, modifiedTime: file.modifiedTime }] : [] });
    }
    // Download the blob
    if (req.method() === "GET" && /\/drive\/v3\/files\/[^?]+\?alt=media/.test(url)) {
      return route.fulfill({ contentType: "application/json", body: file.content });
    }
    // Overwrite (media PATCH)
    if (req.method() === "PATCH" && url.includes("/upload/drive/v3/files/")) {
      file.content = req.postData();
      file.modifiedTime = stamp();
      return json({ modifiedTime: file.modifiedTime });
    }
    // Create (multipart POST)
    if (req.method() === "POST" && url.includes("/upload/drive/v3/files")) {
      file = { id: "f" + nextId++, content: mediaOf(req.postData()), modifiedTime: stamp() };
      return json({ modifiedTime: file.modifiedTime });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });

  // --- stub the GIS token client: requestAccessToken → fake token via the callback ---
  await page.addInitScript(() => {
    window.google = { accounts: { oauth2: {
      initTokenClient: (cfg) => ({
        callback: cfg.callback,
        requestAccessToken() { this.callback({ access_token: "fake-token", expires_in: 3600 }); },
      }),
    } } };
  });

  // Auto-accept (proceed through) every confirm/alert, recording the messages.
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });

  // ---- 1) Visibility tracks driveEnabled(): buttons show iff a Client ID is configured ----
  // Read from source (like verify-version reads APP_VERSION), so this holds whether or not
  // GOOGLE_CLIENT_ID is set — main.js reveals the buttons only when it is.
  const configured = !!GOOGLE_CLIENT_ID;
  await reset();
  ck("Back up button visibility matches configured state",
    (await page.isVisible("#drive-backup")) === configured);
  ck("Restore button visibility matches configured state",
    (await page.isVisible("#drive-restore")) === configured);

  // The handlers don't re-check the gate, so for the round-trip just ensure the buttons are
  // present to click — reveal them only when they'd otherwise be hidden (no Client ID).
  if (!configured) {
    await page.evaluate(() => {
      document.getElementById("drive-backup").hidden = false;
      document.getElementById("drive-restore").hidden = false;
    });
  }

  // ---- 2) Back up: a logged value pushes the whole Store to the Drive blob ----
  await page.fill('[data-cell="b1.w1.d1"] .w', "42");
  await page.waitForTimeout(40);
  await page.click('[data-action="drive-push"]');
  await page.waitForFunction(() => document.getElementById("drive-status").textContent.includes("Backed up"));
  ck("backup created a Drive blob", !!file);
  ck("backup pushed the whole Store (logged value present)",
    JSON.parse(file.content).log[wKey] === "42");

  // ---- 3) Restore: a local change is replaced wholesale by the Drive blob ----
  await page.fill('[data-cell="b1.w1.d1"] .w', "99");
  await page.waitForTimeout(40);
  ck("local value changed before restore", (await ls()).log[wKey] === "99");
  await page.click('[data-action="drive-pull"]');
  await page.waitForFunction(() => document.getElementById("drive-status").textContent.includes("Restored"));
  ck("restore replaced local Store from the Drive blob", (await ls()).log[wKey] === "42");
  ck("restore re-rendered the field", (await page.inputValue('[data-cell="b1.w1.d1"] .w')) === "42");

  // ---- 4) Empty restore: no blob yet → a plain message, nothing destroyed ----
  file = null;
  await page.fill('[data-cell="b1.w1.d1"] .w', "77");
  await page.waitForTimeout(40);
  await page.click('[data-action="drive-pull"]');
  await page.waitForTimeout(80);
  ck("empty restore shows the no-backup message",
    dialogs.some((m) => m.includes("No Drive backup found yet")));
  ck("empty restore left local data untouched", (await ls()).log[wKey] === "77");
});
