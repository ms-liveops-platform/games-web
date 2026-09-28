import assert from "node:assert/strict";
import { once } from "node:events";
import { createStaticApp } from "../server.mjs";
const server = createStaticApp().listen(0, "127.0.0.1");
try {
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const root = await fetch(base + "/");
  assert.equal(root.status, 200);
  const html = await root.text();
  for (const path of [
    "/",
    "/lucky-wheel/",
    "/lucky-chests/",
    "/shooting-targets/",
    "/scratch-card/?count=4",
  ]) {
    const page = await fetch(base + path);
    assert.equal(page.status, 200, path);
    assert.equal(await page.text(), html, path);
    assert.equal(page.headers.get("cache-control"), "no-cache");
  }
  const js = html.match(/src="([^" ]+\.js)"/)[1];
  const asset = await fetch(base + js);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
  assert.equal((await fetch(base + "/assets/missing")).status, 404);
  assert.equal(
    (await fetch(base + "/scratch-card/", { method: "POST" })).status,
    404,
  );
  const health = await fetch(base + "/healthz");
  assert.deepEqual(await health.json(), { ready: true });
  assert.equal(
    (await fetch(base + "/lucky-wheel/", { method: "HEAD" })).status,
    200,
  );
  console.log(
    "Production server: SPA routes, assets, caching, 404s and health checks passed.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
