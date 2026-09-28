import assert from "node:assert/strict";
import test from "node:test";
import argon2 from "argon2";
import { getAdminAuthConfig } from "../src/server/admin-config.mjs";

test("Argon2id hashes verify the original password and reject a different one", async () => {
  const password = "synthetic-password-for-test-only";
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    saltLength: 16,
  });

  assert.match(hash, /^\$argon2id\$v=19\$/);
  assert.equal(await argon2.verify(hash, password), true);
  assert.equal(await argon2.verify(hash, "different-synthetic-password"), false);
  assert.equal(getAdminAuthConfig({
    ADMIN_ENABLED: "true",
    ADMIN_USERNAME: "operator",
    ADMIN_PASSWORD_HASH: hash,
    ADMIN_AUTH_VERSION: "1",
    SESSION_SECRET: "A".repeat(43),
  }).enabled, true);
});
