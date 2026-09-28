import "server-only";
import process from "node:process";
import { URL } from "node:url";

export function hasCanonicalOrigin(request, env = process.env) {
  const configured = env.CANONICAL_ORIGIN;
  if (typeof configured !== "string") return false;
  let canonical;
  try {
    const parsed = new URL(configured);
    if (parsed.origin !== configured || parsed.pathname !== "/" || parsed.search || parsed.hash) return false;
    const localDevelopmentOrigin = env.NODE_ENV !== "production"
      && parsed.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(parsed.hostname)
      && parsed.port !== "";
    if (parsed.protocol !== "https:" && !localDevelopmentOrigin) return false;
    canonical = parsed.origin;
  } catch {
    return false;
  }
  return request.headers.get("origin") === canonical;
}
