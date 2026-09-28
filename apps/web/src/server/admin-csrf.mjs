import "server-only";
import { randomUUID } from "node:crypto";
import { doubleCsrf } from "csrf-csrf";
import { getAdminAuthConfig } from "./admin-config.mjs";

export const CSRF_COOKIE = "__Host-bunaken_csrf";
export const CSRF_CONTEXT_COOKIE = "__Host-bunaken_csrf_context";
export const LOGIN_CSRF_SECONDS = 5 * 60;

function createCsrfTools(config) {
  return doubleCsrf({
    getSecret: () => config.sessionSecret,
    getSessionIdentifier: (request) => request.headers["x-bunaken-session-id"],
    cookieName: CSRF_COOKIE,
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  });
}

function adaptRequest(request, sessionIdentifier) {
  const cookies = Object.fromEntries(request.cookies.getAll().map(({ name, value }) => [name, value]));
  return {
    method: request.method,
    cookies,
    headers: {
      "x-bunaken-session-id": sessionIdentifier,
      "x-csrf-token": request.headers.get("x-csrf-token") ?? undefined,
    },
  };
}

function setCsrfCookie(response, name, value, options) {
  response.cookies.set(name, value, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    ...(options.maxAge === undefined ? {} : { maxAge: Math.floor(options.maxAge / 1000) }),
  });
}

export function issueCsrfToken(request, response, sessionIdentifier, maxAgeSeconds, overwrite = false) {
  const config = getAdminAuthConfig();
  if (!config.enabled) throw new Error("admin_auth_unavailable");
  const tools = createCsrfTools(config);
  const adapted = adaptRequest(request, sessionIdentifier);
  return tools.generateCsrfToken(adapted, { cookie: (name, value, options) => setCsrfCookie(response, name, value, options) }, {
    overwrite,
    cookieOptions: { maxAge: maxAgeSeconds * 1000 },
  });
}

export function validateCsrfToken(request, sessionIdentifier) {
  const config = getAdminAuthConfig();
  if (!config.enabled || !sessionIdentifier) return false;
  return createCsrfTools(config).validateRequest(adaptRequest(request, sessionIdentifier));
}

export function getPreAuthContext(request) {
  const value = request.cookies.get(CSRF_CONTEXT_COOKIE)?.value;
  if (!value) return null;
  const [id, expiresText, extra] = value.split(".");
  const expiresAt = Number(expiresText);
  const now = Math.floor(Date.now() / 1000);
  if (extra !== undefined || !/^[0-9a-f-]{36}$/.test(id) || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + LOGIN_CSRF_SECONDS + 30) {
    return null;
  }
  return { identifier: `pre:${id}:${expiresAt}`, cookieValue: value, expiresAt };
}

export function createPreAuthContext(response) {
  const expiresAt = Math.floor(Date.now() / 1000) + LOGIN_CSRF_SECONDS;
  const id = randomUUID();
  const value = `${id}.${expiresAt}`;
  response.cookies.set(CSRF_CONTEXT_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: LOGIN_CSRF_SECONDS,
  });
  return { identifier: `pre:${id}:${expiresAt}`, cookieValue: value, expiresAt };
}

export function setAuthCsrfContext(response, sessionIdentifier) {
  response.cookies.set(CSRF_CONTEXT_COOKIE, `auth:${sessionIdentifier}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export function hasAuthCsrfContext(request, sessionIdentifier) {
  return request.cookies.get(CSRF_CONTEXT_COOKIE)?.value === `auth:${sessionIdentifier}`;
}
