import {LanguageLinks} from "@/src/public/language-links";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { publicUrl } from "@/src/public/urls";
import type { Locale } from "@/src/public/model";
import type { ReactNode } from "react";

export const shellClass = "mx-auto box-border w-full max-w-[1920px] px-4 py-2 font-[system-ui] text-base leading-6 text-[#18302d] lg:px-6";
export const sectionClass = "min-w-0 border-t border-[#c8d6d0] py-4";
export const headingClass = "m-0 mb-3 text-lg font-semibold";
export function PublicShell({locale, title, query = "", path = "", workspace = false, headerMeta, children}: {locale: Locale; title: string; query?: string; path?: string; workspace?: boolean; headerMeta?: ReactNode; children: ReactNode}) {
  const t = messages[locale].public;
  const values = Object.fromEntries(new URLSearchParams(query));
  const currentPath = path.startsWith("/research") ? "/research" : "";
  return <main lang={locale} className={`${shellClass}${workspace ? " xl:flex xl:h-dvh xl:flex-col" : ""}`}>
    <a className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:z-10 focus:bg-white focus:p-3" href="#public-content">{t.skipToData}</a>
    <header className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-[#c8d6d0]">
      <Link className="inline-flex min-h-11 items-center text-base font-semibold text-[#155f53] active:translate-y-px" href={publicUrl("", locale)}>{messages[locale].title}</Link>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">{headerMeta}<nav className="flex flex-wrap items-center gap-x-3 sm:gap-x-5" aria-label={t.dashboard}>
        {([["", t.dashboard], ["/research", t.research]] as const).map(([href, label]) => <Link key={href} aria-current={currentPath === href ? "page" : undefined} className="inline-flex min-h-11 items-center text-sm text-[#155f53] underline-offset-4 aria-[current=page]:font-semibold hover:underline active:translate-y-px" href={publicUrl(href, locale)}>{label}</Link>)}
        <a className="inline-flex min-h-11 items-center text-sm text-[#155f53] underline-offset-4 hover:underline active:translate-y-px" href="https://github.com/taevel02/bunaken-current-observatory" aria-label={t.sourceCode}><span className="sm:hidden">GitHub</span><span className="hidden sm:inline">{t.sourceCode}</span></a>
        <LanguageLinks locale={locale} path={currentPath} values={values}/>
      </nav></div>
    </header>
    <h1 className="sr-only">{title}</h1><div id="public-content" className={workspace ? "xl:flex xl:min-h-0 xl:flex-1 xl:flex-col" : undefined}>{children}</div>
  </main>;
}
