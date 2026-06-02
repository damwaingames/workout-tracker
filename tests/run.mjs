/* Test runner: serves the app from the repo root on an ephemeral port, then runs
 * every verify-*.mjs in this directory against it and reports a summary.
 *
 * Self-contained — no external web server (the app has no build step, so a plain
 * static file server is all it needs). Each verify script is a standalone Node +
 * Playwright program that exits 0 on pass / 1 on fail; we pass them the base URL
 * via the WT_URL env var and aggregate their exit codes. */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname, sep } from "node:path";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testsDir);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Static file server rooted at the repo. ES modules need a correct JS MIME type
// or the browser refuses them, so the map above is load-bearing.
const server = createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    // Resolve inside the repo root; reject anything that escapes it. The trailing
    // separator stops a sibling like `<repoRoot>-evil` from matching the prefix.
    const filePath = normalize(join(repoRoot, urlPath));
    if (!filePath.startsWith(repoRoot + sep) || !statSync(filePath).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
// Use the literal IPv4 address, not "localhost": on macOS localhost resolves to
// ::1 (IPv6) first, which this 127.0.0.1-bound server isn't listening on.
const baseURL = `http://127.0.0.1:${port}/`;
console.log(`Serving ${repoRoot} at ${baseURL}\n`);

// Run each script in its own async child process — async (not spawnSync) so this
// process's event loop stays free to actually serve the static files the child
// is requesting. They run one at a time so their output stays readable.
const runScript = (script) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(testsDir, script)], {
    cwd: testsDir,
    stdio: "inherit",
    env: { ...process.env, WT_URL: baseURL },
  });
  child.on("close", (code) => resolve(code === 0));
});

const scripts = readdirSync(testsDir).filter((f) => /^verify-.*\.mjs$/.test(f)).sort();
const results = [];
for (const script of scripts) {
  console.log(`──────── ${script} ────────`);
  results.push([script, await runScript(script)]);
  console.log("");
}

server.close();

const passed = results.filter(([, ok]) => ok);
const failed = results.filter(([, ok]) => !ok);
console.log("════════ summary ════════");
results.forEach(([s, ok]) => console.log(`${ok ? "PASS" : "FAIL"}  ${s}`));
console.log(`\n${passed.length}/${results.length} scripts passed`);
process.exit(failed.length ? 1 : 0);
