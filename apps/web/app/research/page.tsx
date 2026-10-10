import {Suspense} from "react";
import {ResearchSkeleton} from "@/src/public/loading-skeleton";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { researchBody, renderResearchMetrics } from "@bunaken/contracts/research";
import { loadResearchLibrary, loadResearchCatalog } from "@/src/server/research-public.mjs";
import { PublicShell } from "@/src/public/shell";
import { publicUrl } from "@/src/public/urls";
import { ResearchMarkdown } from "@/src/public/research-markdown";
import { publicMetadata } from "@/src/public/metadata";

type Query = {lang?: string; slug?: string; version?: string; audience?: string};
export async function generateMetadata({searchParams}: {searchParams: Promise<Query>}) {
  const query = await searchParams;
  return publicMetadata(query.lang === "en" ? "en" : "ko", true, query.audience, {...(query.slug ? {slug: query.slug} : {}), ...(query.version ? {version: query.version} : {})});
}
export default async function ResearchPage({searchParams}: {searchParams: Promise<Query>}) {
  const query = await searchParams;
  return <Suspense key={JSON.stringify(query)} fallback={<ResearchSkeleton locale={query.lang === "en" ? "en" : "ko"} audience={query.audience === "technical" ? "technical" : "guide"} values={Object.fromEntries(Object.entries(query).filter((entry): entry is [string,string]=>typeof entry[1]==="string"))}/> }><ResearchContent query={query}/></Suspense>;
}
async function ResearchContent({query}: {query: Query}) {
  const locale = query.lang === "en" ? "en" : "ko";
  const audience = query.audience === "technical" ? "technical" : "guide";
  const t = messages[locale].research;
  const catalog = query.slug ? null : await loadResearchCatalog({latestPublished: true});
  const selected = catalog?.items.find(row => row.display_state === "published");
  const slug = query.slug ?? selected?.release.slug;
  const library = slug ? await loadResearchLibrary({slug, version: query.version ?? selected?.release.version}) : {status: catalog?.partial ? "unavailable" : catalog?.status ?? "empty", items: [], withdrawn: catalog?.withdrawn ?? []};
  const item = library.items.find(row => query.version ? row.release.version === query.version : row.display_state === "published");
  const withdrawn = library.withdrawn.find(row => row.slug === query.slug && row.version === query.version);
  const values = {audience, ...(item ? {slug: item.release.slug, version: item.release.version} : {}), ...(query.slug ? {slug: query.slug} : {}), ...(query.version ? {version: query.version} : {})};
  return <PublicShell locale={locale} title={messages[locale].public.research} path="/research" query={"?" + new URLSearchParams(values)}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#c8d6d0] pb-2">
      <nav className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" aria-label={t.reports}>{(["guide", "technical"] as const).map(target => <Link key={target} aria-current={target === audience ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-md px-4 text-[#155f53] aria-[current=page]:bg-[#e8efec] aria-[current=page]:font-semibold active:translate-y-px" href={publicUrl("/research", locale, {...values, audience: target})}>{t[target]}</Link>)}</nav>
      {item && <span className="text-sm text-[#49625c]">{item.release.version} · {t.notPeerReviewed}</span>}
    </div>
    <p className="mx-auto mb-3 max-w-[90ch] text-sm text-[#49625c]">{t.ongoingResearch}</p>
    {library.status === "unavailable" ? <p role="status">{t.unavailable}</p> : withdrawn ? <p role="status">{t.withdrawnNotice}</p> : !item ? <p role="status">{t.empty}</p> : <article className="mx-auto min-w-0 max-w-[90ch] py-2 print:max-w-none">
      {item.display_state !== "published" && <p role="status">{t.states.superseded}</p>}
      <ResearchMarkdown codeCommit={item.release.code_commit} body={renderResearchMetrics(researchBody(item.documents[`${audience}.${locale}.md`], item.release, `${audience}.${locale}.md`), item.results)}/>
    </article>}
  </PublicShell>;
}
