import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthConfig } from "../../../../src/server/admin-config.mjs";
import {
  CSRF_CONTEXT_COOKIE,
  CSRF_COOKIE,
  hasAuthCsrfContext,
  validateCsrfToken,
} from "../../../../src/server/admin-csrf.mjs";
import { destroyAdminSession, getAdminSession, ADMIN_SESSION_COOKIE } from "../../../../src/server/admin-session.mjs";
import { apiError, PRIVATE_NO_STORE } from "../../../../src/server/api-response.mjs";
import { hasCanonicalOrigin } from "../../../../src/server/request-security.mjs";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasCanonicalOrigin(request)) return apiError(403, "origin_invalid", "auth.originInvalid");
  if (!getAdminAuthConfig().enabled) return apiError(503, "auth_unavailable", "auth.unavailable");
  const session = await getAdminSession();
  if (!session) return apiError(401, "unauthorized", "auth.unauthorized");
  if (!hasAuthCsrfContext(request, session.session_id) || !validateCsrfToken(request, `auth:${session.session_id}`)) {
    return apiError(403, "csrf_invalid", "auth.csrfInvalid");
  }

  await destroyAdminSession();
  const response = new NextResponse(null, { status: 204, headers: PRIVATE_NO_STORE });
  response.cookies.set(CSRF_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(CSRF_CONTEXT_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
