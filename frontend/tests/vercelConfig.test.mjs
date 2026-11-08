import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (url) => spawnSync(process.execPath, [
  "--input-type=module", "-e",
  `import { config } from "./vercel.mjs"; console.log(JSON.stringify(config));`
], {
  cwd: new URL("../", import.meta.url).pathname,
  env: { ...process.env, CULINARY_BACKEND_ORIGIN: url },
  encoding: "utf8"
});

test("routes /api before the client-side React fallback", () => {
  const result = run("https://example-backend.vercel.app");
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout.trim());
  assert.deepEqual(config.rewrites, [
    { source: "/api/:path*", destination: "https://example-backend.vercel.app/api/:path*" },
    { source: "/:path*", destination: "/index.html" }
  ]);
});

test("rejects missing, HTTP, and path-bearing backend URLs", () => {
  for (const value of ["", "http://example.com", "https://example.com/api", "https://name:pass@example.com"]) {
    const result = run(value);
    assert.notEqual(result.status, 0, `${value} should fail`);
    assert.match(result.stderr, /CULINARY_BACKEND_ORIGIN/);
  }
});
