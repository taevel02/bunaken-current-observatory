import "server-only";
import argon2 from "argon2";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getAdminAuthConfig } from "../../../../src/server/admin-config.mjs";
import {
  getPreAuthContext,
  issueCsrfToken,
  setAuthCsrfContext,
  validateCsrfToken,
} from "../../../../src/server/admin-csrf.mjs";
import { createAdminSession, ADMIN_SESSION_SECONDS } from "../../../../src/server/admin-session.mjs";
import { apiError, apiSuccess, createCookieSink } from "../../../../src/server/api-response.mjs";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_PASSWORD_BYTES = 1024;

function sameUsername(submitted: string, expected: string) {
  const submittedBytes = Buffer.from(submitted, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return submittedBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(submittedBytes, expectedBytes);
}

export async function POST(request: NextRequest) {
  const config = getAdminAuthConfig();
  if (!config.enabled) return apiError(503, "auth_unavailable", "auth.unavailable");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return apiError(413, "request_too_large", "auth.invalidRequest");
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return apiError(400, "invalid_request", "auth.invalidRequest");
  }

  const context = getPreAuthContext(request);
  if (!context || !validateCsrfToken(request, context.identifier)) {
    return apiError(403, "csrf_invalid", "auth.csrfInvalid");
  }

  let body: unknown;
  try {
    const rawBody = await readLimitedBody(request, MAX_REQUEST_BYTES);
    body = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof RangeError) return apiError(413, "request_too_large", "auth.invalidRequest");
    return apiError(400, "invalid_request", "auth.invalidRequest");
  }

  if (
    typeof body !== "object" || body === null || Array.isArray(body)
    || Object.keys(body).length !== 2
    || typeof (body as { username?: unknown }).username !== "string"
    || typeof (body as { password?: unknown }).password !== "string"
  ) return apiError(400, "invalid_request", "auth.invalidRequest");

  const { username, password } = body as { username: string; password: string };
  if (Buffer.byteLength(password, "utf8") === 0 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return apiError(400, "invalid_request", "auth.invalidRequest");
  }

  let passwordMatches: boolean;
  try {
    passwordMatches = await argon2.verify(config.passwordHash, password);
  } catch {
    return apiError(503, "auth_unavailable", "auth.unavailable");
  }

  if (!sameUsername(username, config.username) || !passwordMatches) {
    return apiError(401, "invalid_credentials", "auth.invalidCredentials");
  }

  const session = await createAdminSession();
  const cookieSink = createCookieSink();
  setAuthCsrfContext(cookieSink.sink, session.session_id);
  const csrfToken = issueCsrfToken(request, cookieSink.sink, `auth:${session.session_id}`, ADMIN_SESSION_SECONDS, true);
  return cookieSink.apply(apiSuccess({ authenticated: true, csrf_token: csrfToken }));
}

async function readLimitedBody(request: Request, maxBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RangeError("request_too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}
