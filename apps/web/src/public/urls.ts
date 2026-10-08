import type { Locale } from "@/src/public/model";

export function publicUrl(path: "" | "/research", locale: Locale, values: Record<string, string> = {}) {
  const query = new URLSearchParams(values);
  query.set("lang", locale);
  return `${path || "/"}?${query}`;
}
