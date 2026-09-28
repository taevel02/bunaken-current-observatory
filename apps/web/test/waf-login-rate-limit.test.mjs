import assert from "node:assert/strict";
import test from "node:test";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 10;

function createWafMock() {
  const windows = new Map();
  return function handle({ path, method, ip }, now) {
    if (path !== "/api/auth/login" || method !== "POST") return 200;
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const key = `${ip}:${windowStart}`;
    const requests = windows.get(key) ?? 0;
    windows.set(key, requests + 1);
    return requests < MAX_REQUESTS ? 200 : 429;
  };
}

test("local WAF mock models the documented path, method, per-IP window and 429 threshold", () => {
  const handle = createWafMock();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(handle({ path: "/api/auth/login", method: "POST", ip: "198.51.100.10" }, 1_000), 200);
  }
  assert.equal(handle({ path: "/api/auth/login", method: "POST", ip: "198.51.100.10" }, 1_000), 429);
  assert.equal(handle({ path: "/api/auth/login", method: "POST", ip: "198.51.100.11" }, 1_000), 200);
  assert.equal(handle({ path: "/api/auth/login", method: "GET", ip: "198.51.100.10" }, 1_000), 200);
  assert.equal(handle({ path: "/api/auth/login", method: "POST", ip: "198.51.100.10" }, WINDOW_MS), 200);
});
