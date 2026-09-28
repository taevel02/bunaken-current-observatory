import { NextRequest } from "next/server";
import { getAdminAuthConfig } from "../../../../src/server/admin-config.mjs";
import {
  createPreAuthContext,
  getPreAuthContext,
  issueCsrfToken,
  LOGIN_CSRF_SECONDS,
  setAuthCsrfContext,
} from "../../../../src/server/admin-csrf.mjs";
import { getAdminSession, ADMIN_SESSION_SECONDS } from "../../../../src/server/admin-session.mjs";
import { apiError, apiSuccess, createCookieSink } from "../../../../src/server/api-response.mjs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!getAdminAuthConfig().enabled) return apiError(503, "auth_unavailable", "auth.unavailable");

  const session = await getAdminSession();
  const cookieSink = createCookieSink();
  let identifier: string;
  let maxAge: number;

  if (session) {
    identifier = `auth:${session.session_id}`;
    maxAge = ADMIN_SESSION_SECONDS;
    setAuthCsrfContext(cookieSink.sink, session.session_id);
  } else {
    const context = getPreAuthContext(request) ?? createPreAuthContext(cookieSink.sink);
    identifier = context.identifier;
    maxAge = LOGIN_CSRF_SECONDS;
  }

  const csrfToken = issueCsrfToken(request, cookieSink.sink, identifier, maxAge);
  const response = apiSuccess({ csrf_token: csrfToken });
  response.headers.set("Vary", "Cookie");
  return cookieSink.apply(response);
}
