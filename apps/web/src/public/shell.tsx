import Link from "next/link";
import { messages } from "@/i18n/messages";
import type { Locale } from "@/src/public/model";
import type { ReactNode } from "react";

export const shellClass = "mx-auto box-border w-full max-w-[1800px] px-4 py-2 font-[system-ui] text-base leading-6 text-[#18302d] lg:px-6";
export const sectionClass = "min-w-0 border-t border-[#c8d6d0] py-4";
export const headingClass = "m-0 mb-3 text-lg font-semibold";
export function PublicShell({ locale, title, query = "", path = "", children }: {locale: Locale; title: string; query?: string; path?: string; children: ReactNode}) {
 const t=messages[locale].public;
 return <main lang={locale} className={shellClass}>
   <a className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:z-10 focus:bg-white focus:p-3" href="#public-content">{t.skipToData}</a>
   <header className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[#c8d6d0] pb-0">
    <div className="flex min-w-0 flex-wrap items-center gap-x-4"><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#155f53]" href={`/${locale}${query}`}>{messages[locale].title}</Link><h1 className="m-0 text-xl font-semibold">{title}</h1></div>
    <nav className="flex flex-wrap gap-x-4 lg:ml-auto" aria-label={t.dashboard}>{([['',t.dashboard],['/observations',t.observations],['/pci',t.pci],['/methodology',t.methodology],['/status',t.status]] as const).map(([href,label])=><Link className="inline-flex min-h-11 items-center text-sm text-[#155f53] underline-offset-4 hover:underline active:translate-y-px" key={href} href={`/${locale}${href}${query}`}>{label}</Link>)}</nav>
    <nav aria-label={messages[locale].language} className="flex gap-3"><Link className="inline-flex min-h-11 items-center text-sm text-[#155f53]" href={`/ko${path}${query}`} lang="ko" aria-current={locale === "ko" ? "page" : undefined}>한국어</Link><Link className="inline-flex min-h-11 items-center text-sm text-[#155f53]" href={`/en${path}${query}`} lang="en" aria-current={locale === "en" ? "page" : undefined}>English</Link></nav>
   </header><div id="public-content">{children}</div>
 </main>;
}
