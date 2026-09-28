import { getAdminAuthConfig } from "@/src/server/admin-config.mjs";
import { getAdminSession } from "@/src/server/admin-session.mjs";
import { apiError, apiSuccess } from "@/src/server/api-response.mjs";
import process from "node:process";

export const runtime = "nodejs";

export async function GET() {
  if (!getAdminAuthConfig().enabled) return apiError(503, "auth_unavailable", "auth.unavailable");
  const session = await getAdminSession();
  if (!session) return apiError(401, "unauthorized", "auth.unauthorized");
  const observerAlias = process.env.PUBLIC_OBSERVER_ID;
  return apiSuccess({ authenticated: true, observer_alias: observerAlias && /^[a-z][a-z0-9_-]{0,63}$/.test(observerAlias) ? observerAlias : null });
}
