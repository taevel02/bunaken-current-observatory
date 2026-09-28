import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getIronSession } from "iron-session";
import { getAdminAuthConfig } from "./admin-config.mjs";

export const ADMIN_SESSION_COOKIE = "__Host-bunaken_session";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
export const ADMIN_SUBJECT = "bunaken-admin";

function sessionOptions(config) {
  return {
    cookieName: ADMIN_SESSION_COOKIE,
    password: config.sessionSecret,
    ttl: ADMIN_SESSION_SECONDS,
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  };
}

async function openSession(config) {
  return getIronSession(await cookies(), sessionOptions(config));
}

export async function getAdminSession() {
  const config = getAdminAuthConfig();
  if (!config.enabled) return null;

  const session = await openSession(config);
  const now = Math.floor(Date.now() / 1000);
  if (
    session.sub !== ADMIN_SUBJECT
    || typeof session.issued_at !== "number"
    || typeof session.expires_at !== "number"
    || session.issued_at > now + 30
    || session.expires_at <= now
    || session.expires_at <= session.issued_at
    || session.expires_at - session.issued_at > ADMIN_SESSION_SECONDS
    || session.auth_version !== config.authVersion
    || typeof session.session_id !== "string"
    || !/^[0-9a-f-]{36}$/.test(session.session_id)
  ) return null;

  return session;
}

export async function createAdminSession() {
  const config = getAdminAuthConfig();
  if (!config.enabled) throw new Error("admin_auth_unavailable");

  const session = await openSession(config);
  const issuedAt = Math.floor(Date.now() / 1000);
  session.sub = ADMIN_SUBJECT;
  session.issued_at = issuedAt;
  session.expires_at = issuedAt + ADMIN_SESSION_SECONDS;
  session.auth_version = config.authVersion;
  session.session_id = randomUUID();
  await session.save();
  return session;
}

export async function destroyAdminSession() {
  const config = getAdminAuthConfig();
  if (!config.enabled) return;
  const session = await openSession(config);
  session.destroy();
}
