export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export function errorResponseHeaders(retryAfter) {
  const headers = { ...PRIVATE_NO_STORE };
  if (retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter >= 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfter));
  }
  return headers;
}
