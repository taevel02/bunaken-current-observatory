"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {publicUrl} from "@/src/public/urls";
import type {Locale} from "@/src/public/model";
export function LanguageLinks({locale, path, values}: {locale: Locale; path: "" | "/research"; values: Record<string,string>}) {
  const params = useSearchParams();
  const current = {...values, ...Object.fromEntries(params)};
  return <span className="inline-flex gap-x-3 sm:gap-x-5">{(["ko", "en"] as const).map(language => <Link prefetch={false} key={language} lang={language} aria-current={locale === language ? "page" : undefined} className="inline-flex min-h-11 items-center text-sm text-[#155f53] aria-[current=page]:font-semibold active:translate-y-px" href={publicUrl(path, language, current)}>{language === "ko" ? "한국어" : "English"}</Link>)}</span>;
}
