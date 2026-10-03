import Link from "next/link";
import { messages } from "@/i18n/messages";
import type { Locale } from "@/src/public/model";
import type { ReactNode } from "react";

export const shellClass = "mx-auto box-border w-full max-w-6xl px-4 py-6 font-[system-ui] text-base leading-6 text-[#18302d] sm:px-6";
export const sectionClass = "min-w-0 border-t border-[#c8d6d0] py-6";
export const headingClass = "m-0 mb-4 text-xl font-semibold";
export function PublicShell({ locale, title, query = "", path = "", children }: {locale: Locale; title: string; query?: string; path?: string; children: ReactNode}) {
 const t=messages[locale].public;
 return <main lang={locale} className={shellClass}>
   <header className="mb-6 grid gap-4 border-b border-[#c8d6d0] pb-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-semibold text-[#155f53]" href={`/${locale}${query}`}>{messages[locale].title}</Link>
      <nav aria-label={messages[locale].language} className="flex gap-4"><Link className="inline-flex min-h-11 items-center" href={`/ko${path}${query}`} lang="ko" aria-current={locale === "ko" ? "page" : undefined}>한국어</Link><Link className="inline-flex min-h-11 items-center" href={`/en${path}${query}`} lang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link></nav></div>
    <h1 className="m-0 text-3xl font-semibold tracking-tight">{title}</h1>
    <nav className="flex flex-wrap gap-x-5 gap-y-1" aria-label={t.dashboard}>{([['',t.dashboard],['/observations',t.observations],['/pci',t.pci],['/methodology',t.methodology],['/status',t.status]] as const).map(([href,label])=><Link className="inline-flex min-h-11 items-center text-[#155f53] underline underline-offset-4" key={href} href={`/${locale}${href}${query}`}>{label}</Link>)}</nav>
   </header>{children}
 </main>;
}
