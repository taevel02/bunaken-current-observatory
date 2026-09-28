import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

process.env.ADMIN_ENABLED = "true";
process.env.ADMIN_USERNAME = "operator";
process.env.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdDEyMzQ$ZGlnaWVzdC0xMjM0NTY3OA";
process.env.ADMIN_AUTH_VERSION = "csrf-test";
process.env.SESSION_SECRET = "A".repeat(43);

const { issueCsrfToken, validateCsrfToken } = await import("../src/server/admin-csrf.mjs");

function requestFor(cookies, token = "") {
  return {
    method: "POST",
    headers: { get: (name) => (name === "x-csrf-token" ? token : null) },
    cookies: {
      getAll: () => [...cookies.entries()].map(([name, value]) => ({ name, value })),
    },
  };
}

test("signed double-submit token validates only with the same cookie and session context", () => {
  const cookies = new Map();
  const setCookie = { cookies: { set: (name, value, options) => {
    cookies.set(name, value);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.path, "/");
  } } };
  const context = "pre:11111111-1111-4111-8111-111111111111:2000000000";
  const token = issueCsrfToken(requestFor(cookies), setCookie, context, 300);

  assert.equal(validateCsrfToken(requestFor(cookies, token), context), true);
  assert.equal(validateCsrfToken(requestFor(cookies, "tampered"), context), false);
  assert.equal(validateCsrfToken(requestFor(cookies, token), "pre:another-context:2000000000"), false);

  cookies.set("__Host-bunaken_csrf", `${token}tampered`);
  assert.equal(validateCsrfToken(requestFor(cookies, token), context), false);
});
