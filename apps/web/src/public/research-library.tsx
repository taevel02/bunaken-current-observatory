import Link from "next/link";
import { messages } from "@/i18n/messages";
import { loadResearchCatalog } from "@/src/server/research-public.mjs";
import { sectionClass, headingClass } from "@/src/public/shell";
import type { Locale } from "@/src/public/model";

export async function ResearchLibrary({locale,offset=0}:{locale:Locale;offset?:number}) {
  const t=messages[locale].research;const library=await loadResearchCatalog({offset});
  return <section className={sectionClass}>
    <h2 className={headingClass}>{t.reports}</h2><p className="m-0 mb-3">{t.pilot}</p>
    {library.status==="unavailable"?<p role="status">{t.unavailable}</p>:library.items.filter(item=>item.display_state==="published").length===0?<p>{t.empty}</p>:library.items.filter(item=>item.display_state==="published").map(item=><article key={`${item.release.slug}/${item.release.version}`} className="border-t border-[#c8d6d0] py-3">
      <h3 className="m-0 text-lg font-semibold">{item.release.title[locale]}</h3><p className="my-1 text-sm">{item.release.version} · {item.release.data_cutoff} · {t.states[item.display_state as "published"|"superseded"|"withdrawn"]}</p>
      <div className="flex flex-wrap gap-x-5">{(["technical","guide"] as const).map(audience=><Link key={audience} className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/research/${item.release.slug}/${audience}?version=${item.release.version}`}>{t[audience]}</Link>)}</div>
    </article>)}
    {(library.items.some(item=>item.display_state==="superseded")||library.withdrawn.length>0)&&<details className="mt-3"><summary className="min-h-11 cursor-pointer font-semibold">{t.archive}</summary>{library.items.filter(item=>item.display_state==="superseded").map(item=><div key={`${item.release.slug}/${item.release.version}`} className="flex flex-wrap items-center gap-x-4"><span>{item.release.title[locale]} · {item.release.version}</span>{(["technical","guide"] as const).map(audience=><Link key={audience} className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/research/${item.release.slug}/${audience}?version=${item.release.version}`}>{t[audience]}</Link>)}</div>)}{library.withdrawn.map(row=><Link key={`${row.slug}/${row.version}`} className="flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/research/${row.slug}/technical?version=${row.version}`}>{row.slug} · {row.version} · {t.states.withdrawn}</Link>)}</details>}
    {library.partial&&<p role="status">{t.unavailable}</p>}
    <nav className="flex gap-5">{offset>0&&<Link className="inline-flex min-h-11 items-center underline" href={`/${locale}/research?offset=${Math.max(0,offset-20)}`}>{t.previousPage}</Link>}{library.next_offset!==null&&library.next_offset!==undefined&&<Link className="inline-flex min-h-11 items-center underline" href={`/${locale}/research?offset=${library.next_offset}`}>{t.nextPage}</Link>}</nav>
    <nav className="mt-3 flex flex-wrap gap-x-5" aria-label={t.resources}>{(["pci","observations","status"] as const).map(page=><Link key={page} className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/${page}`}>{messages[locale].public[page]}</Link>)}</nav>
  </section>;
}
