import assert from "node:assert/strict";
import test from "node:test";
import { hasCanonicalOrigin } from "../src/server/request-security.mjs";

test("canonical origin requires an exact configured Origin and HTTPS in production", () => {
  const env = { CANONICAL_ORIGIN: "https://observatory.example" };
  assert.equal(hasCanonicalOrigin(new globalThis.Request("https://observatory.example/api", { headers: { origin: env.CANONICAL_ORIGIN } }), env), true);
  assert.equal(hasCanonicalOrigin(new globalThis.Request("https://observatory.example/api"), env), false);
  assert.equal(hasCanonicalOrigin(new globalThis.Request("https://observatory.example/api", { headers: { origin: "https://evil.example" } }), env), false);
  assert.equal(hasCanonicalOrigin(new globalThis.Request("http://observatory.example/api", { headers: { origin: "https://observatory.example" } }), env), true);
  assert.equal(hasCanonicalOrigin(new globalThis.Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3000" } }), { CANONICAL_ORIGIN: "http://localhost:3000", NODE_ENV: "development" }), true);
  assert.equal(hasCanonicalOrigin(new globalThis.Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3000" } }), { CANONICAL_ORIGIN: "http://localhost:3000", NODE_ENV: "production" }), false);
  assert.equal(hasCanonicalOrigin(new globalThis.Request("https://observatory.example/api", { headers: { origin: "https://observatory.example" } }), { CANONICAL_ORIGIN: "https://observatory.example/path" }), false);
});
