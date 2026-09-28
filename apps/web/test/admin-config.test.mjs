import assert from "node:assert/strict";
import test from "node:test";
import { getAdminAuthConfig } from "../src/server/admin-config.mjs";

const validEnvironment = {
  ADMIN_ENABLED: "true",
  ADMIN_USERNAME: "operator",
  ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdDEyMzQ$ZGlnaWVzdC0xMjM0NTY3OA",
  ADMIN_AUTH_VERSION: "1",
  SESSION_SECRET: "A".repeat(43),
};

test("admin auth remains disabled when disabled or unspecified", () => {
  assert.deepEqual(getAdminAuthConfig({}), { enabled: false, reason: "disabled" });
  assert.deepEqual(getAdminAuthConfig({ ADMIN_ENABLED: "false" }), { enabled: false, reason: "disabled" });
});

test("invalid enable flag fails closed", () => {
  assert.deepEqual(getAdminAuthConfig({ ADMIN_ENABLED: "yes" }), {
    enabled: false,
    reason: "invalid_settings",
    invalidKeys: ["ADMIN_ENABLED"],
  });
});

test("enabled auth requires every server setting", () => {
  assert.deepEqual(getAdminAuthConfig({ ADMIN_ENABLED: "true" }), {
    enabled: false,
    reason: "invalid_settings",
    missingKeys: ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_AUTH_VERSION", "SESSION_SECRET"],
  });
});

test("valid Argon2id settings produce a server configuration", () => {
  assert.deepEqual(getAdminAuthConfig(validEnvironment), {
    enabled: true,
    username: "operator",
    passwordHash: validEnvironment.ADMIN_PASSWORD_HASH,
    authVersion: "1",
    sessionSecret: validEnvironment.SESSION_SECRET,
  });
});

test("malformed hash and non-32-byte session secret fail closed without echoing values", () => {
  const result = getAdminAuthConfig({
    ...validEnvironment,
    ADMIN_PASSWORD_HASH: "not-a-hash",
    SESSION_SECRET: "short",
  });
  assert.deepEqual(result, {
    enabled: false,
    reason: "invalid_settings",
    invalidKeys: ["ADMIN_PASSWORD_HASH", "SESSION_SECRET"],
  });
  assert.equal(JSON.stringify(result).includes("short"), false);
});

test("Argon2id hashes below the configured work minimum fail closed", () => {
  const result = getAdminAuthConfig({
    ...validEnvironment,
    ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=1024,t=1,p=1$c2FsdDEyMzQ$ZGlnaWVzdC0xMjM0NTY3OA",
  });
  assert.deepEqual(result, {
    enabled: false,
    reason: "invalid_settings",
    invalidKeys: ["ADMIN_PASSWORD_HASH"],
  });
});
