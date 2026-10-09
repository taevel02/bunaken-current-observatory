import type { Metadata } from "next";
import { messages } from "@/i18n/messages";
import type { Locale } from "@/src/public/model";

export const publicOrigin = "https://bunaken-current-observatory.vercel.app";

export function publicMetadata(locale: Locale, research = false, audience = "guide", publication: Record<string, string> = {}): Metadata {
  const t = messages[locale];
  const title = research ? `${t.public.research} · ${t.research[audience === "technical" ? "technical" : "guide"]} | ${t.title}` : `${t.public.dashboard} | ${t.title}`;
  const description = t.metadata[research ? "research" : "dashboard"];
  const url = (language: Locale) => {
    const result = new URL(research ? "/research" : "/", publicOrigin);
    if (research) {
      result.searchParams.set("audience", audience === "technical" ? "technical" : "guide");
      for (const key of ["slug", "version"]) if (publication[key]) result.searchParams.set(key, publication[key]);
    }
    if (language === "en") result.searchParams.set("lang", "en");
    return result.href;
  };
  return {
    metadataBase: new URL(publicOrigin), title, description,
    alternates: {canonical: url(locale), languages: {ko: url("ko"), en: url("en"), "x-default": url("ko")}},
    robots: {index: true, follow: true},
    openGraph: {title, description, url: url(locale), siteName: t.project, type: "website", locale: locale === "ko" ? "ko_KR" : "en_US"},
    twitter: {card: "summary", title, description},
  };
}
