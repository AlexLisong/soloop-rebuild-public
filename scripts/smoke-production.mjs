import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Exercise the same Node server used by systemd, including its built assets.
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(Number(process.env.SMOKE_PORT || 0), "127.0.0.1", resolve);
});
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    "node_modules/vinext/dist/cli.js",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, NODE_ENV: "production" },
  },
);
let startup = "";
child.stdout.on("data", (data) => {
  startup += data.toString();
  process.stdout.write(data);
});
const assertAlive = () => {
  assert.equal(
    child.exitCode,
    null,
    "Production server exited during verification",
  );
  assert.equal(
    child.signalCode,
    null,
    "Production server was interrupted during verification",
  );
};

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assertAlive();
    if (!startup.includes(`Production server running at ${base}`)) {
      await delay(250);
      continue;
    }
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the child to begin listening. */
    }
    await delay(250);
  }
  assert(ready, "Production server did not become ready");

  let home = "";
  for (const route of [
    "/",
    "/about",
    "/terms",
    "/privacy",
    "/cookies",
    "/login",
    "/app",
  ]) {
    assertAlive();
    const response = await fetch(base + route, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<html/, `${route} must serve HTML`);
    if (route === "/") {
      home = html;
      assert.match(html, /From a rough idea to work you can use/);
    }
  }
  for (const route of ["/start"]) {
    const response = await fetch(base + route, { redirect: "manual" });
    assert.equal(response.status, 307, route);
    assert.equal(
      new URL(response.headers.get("location"), base).pathname,
      "/app",
    );
  }
  assert.equal((await fetch(base + "/not-a-real-page")).status, 404);

  const assets = new Set(
    [
      ...home.matchAll(
        /(?:src|href)="(\/[^"#?]+\.(?:js|css|svg|png|webp|woff2))"/g,
      ),
    ].map((m) => m[1]),
  );
  assert(
    [...assets].some((path) => path.endsWith(".js")),
    "Missing production scripts",
  );
  assert(
    [...assets].some((path) => path.endsWith(".css")),
    "Missing production CSS",
  );
  for (const path of assets) {
    assertAlive();
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, path);
    assert(
      !response.headers.get("content-type")?.includes("text/html"),
      `${path} returned HTML`,
    );
  }
  assertAlive();
  console.log(
    `Production smoke passed: 7 pages, 1 redirect, 404, ${assets.size} assets.`,
  );
} finally {
  child.kill("SIGTERM");
}
