import "server-only";
import { getAdminAuthConfig } from "./admin-config.mjs";
import { hasAuthCsrfContext, validateCsrfToken } from "./admin-csrf.mjs";
import { getAdminSession } from "./admin-session.mjs";
import { apiError } from "./api-response.mjs";
import { hasCanonicalOrigin } from "./request-security.mjs";

export async function authorizeAdminRequest(request, { mutation = false } = {}) {
  if (mutation && !hasCanonicalOrigin(request)) {
    return { response: apiError(403, "origin_invalid", "auth.originInvalid") };
  }
  if (!getAdminAuthConfig().enabled) return { response: apiError(503, "auth_unavailable", "auth.unavailable") };
  const session = await getAdminSession();
  if (!session) return { response: apiError(401, "unauthorized", "auth.unauthorized") };
  if (mutation && (!hasAuthCsrfContext(request, session.session_id) || !validateCsrfToken(request, `auth:${session.session_id}`))) {
    return { response: apiError(403, "csrf_invalid", "auth.csrfInvalid") };
  }
  return { session };
}
