import { Buffer } from "node:buffer";
import process from "node:process";

const passwordHashPattern = /^\$argon2id\$v=19\$([^$]+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function isCanonicalBase64(value) {
  return Buffer.from(value, "base64").toString("base64").replace(/=+$/, "") === value;
}

function hasValidPasswordHash(value) {
  const match = passwordHashPattern.exec(value);
  if (!match) return false;

  const [, encodedParameters, salt, digest] = match;
  const parts = encodedParameters.split(",");
  if (parts.length !== 3 || parts.some((part) => !/^[mtp]=\d+$/.test(part))) return false;
  const parameters = Object.fromEntries(parts.map((part) => part.split("=")));
  if (Object.keys(parameters).length !== 3 || !["m", "t", "p"].every((key) => key in parameters)) return false;
  if (Object.values(parameters).some((part) => !/^\d+$/.test(part) || !Number.isSafeInteger(Number(part)) || Number(part) < 1)) {
    return false;
  }

  return isCanonicalBase64(salt) && Buffer.from(salt, "base64").byteLength >= 8
    && isCanonicalBase64(digest) && Buffer.from(digest, "base64").byteLength >= 16;
}

function hasValidSessionSecret(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const secret = Buffer.from(value, "base64url");
  return secret.byteLength === 32 && secret.toString("base64url") === value;
}

/** Server-only configuration. Never import this module from client components. */
export function getAdminAuthConfig(env = process.env) {
  if (env.ADMIN_ENABLED === undefined || env.ADMIN_ENABLED === "false") {
    return { enabled: false, reason: "disabled" };
  }

  if (env.ADMIN_ENABLED !== "true") {
    return { enabled: false, reason: "invalid_settings", invalidKeys: ["ADMIN_ENABLED"] };
  }

  const missingKeys = [];
  for (const key of ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_AUTH_VERSION", "SESSION_SECRET"]) {
    if (typeof env[key] !== "string" || env[key].trim() === "") missingKeys.push(key);
  }
  if (missingKeys.length > 0) {
    return { enabled: false, reason: "invalid_settings", missingKeys };
  }

  const invalidKeys = [];
  if (env.ADMIN_USERNAME !== env.ADMIN_USERNAME.trim()) invalidKeys.push("ADMIN_USERNAME");
  if (env.ADMIN_AUTH_VERSION !== env.ADMIN_AUTH_VERSION.trim() || env.ADMIN_AUTH_VERSION.length > 128) {
    invalidKeys.push("ADMIN_AUTH_VERSION");
  }
  if (!hasValidPasswordHash(env.ADMIN_PASSWORD_HASH)) invalidKeys.push("ADMIN_PASSWORD_HASH");
  if (!hasValidSessionSecret(env.SESSION_SECRET)) invalidKeys.push("SESSION_SECRET");
  if (invalidKeys.length > 0) return { enabled: false, reason: "invalid_settings", invalidKeys };

  return {
    enabled: true,
    username: env.ADMIN_USERNAME,
    passwordHash: env.ADMIN_PASSWORD_HASH,
    authVersion: env.ADMIN_AUTH_VERSION,
    sessionSecret: env.SESSION_SECRET,
  };
}
