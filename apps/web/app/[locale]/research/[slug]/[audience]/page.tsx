import { notFound } from "next/navigation";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { researchBody,renderResearchMetrics } from "@bunaken/contracts/research";
import { loadResearchLibrary } from "@/src/server/research-public.mjs";
import { PublicShell } from "@/src/public/shell";
import { ResearchMarkdown } from "@/src/public/research-markdown";
import { ResearchResults } from "@/src/public/research-results";

export default async function ResearchArticle({params,searchParams}:{params:Promise<{locale:string;slug:string;audience:string}>;searchParams:Promise<{version?:string}>}) {
  const {locale,slug,audience}=await params;
  if((locale!=="ko"&&locale!=="en")||(audience!=="technical"&&audience!=="guide"))notFound();
  const query=await searchParams;const library=await loadResearchLibrary({slug,version:query.version});
  if(library.status==="unavailable")return <PublicShell locale={locale} title={messages[locale].public.research} path={`/research/${slug}/${audience}`} query={query.version?`?version=${query.version}`:""}><p role="status">{messages[locale].research.unavailable}</p></PublicShell>;
  const withdrawn=library.withdrawn.find(row=>row.slug===slug&&row.version===query.version);
  if(withdrawn)return <PublicShell locale={locale} title={messages[locale].research.states.withdrawn} path={`/research/${slug}/${audience}`} query={`?version=${withdrawn.version}`}><p role="status">{messages[locale].research.withdrawnNotice}</p><p>{withdrawn.slug} · {withdrawn.version}</p><Link className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/research`}>{messages[locale].public.research}</Link></PublicShell>;
  const item=library.items.find(row=>row.release.slug===slug&&(query.version?row.release.version===query.version:row.display_state==="published"));
  if(!item)notFound();
  const t=messages[locale].research;const release=item.release;
  const file=`${audience}.${locale}.md`;
  const body=renderResearchMetrics(researchBody(item.documents[file],release,file),item.results);
  return <PublicShell locale={locale} title={t[audience]} path={`/research/${slug}/${audience}`} query={`?version=${release.version}`}>
    <article className="mx-auto max-w-[80ch] py-4 print:max-w-none">
      <header className="border-b border-[#c8d6d0] pb-3"><h2 className="m-0 text-2xl font-semibold">{release.title[locale]}</h2><p className="mb-1 text-sm">{t.notPeerReviewed}</p><p className="my-1 text-sm">{release.version} · {t.cutoff}: {release.data_cutoff}</p><p className="my-1">{release.authors.map(author=>`${author.alias} (${author.role})`).join(" · ")}</p>
      {item.display_state!=="published"&&<p role="status" className="font-semibold">{t.states[item.display_state as "withdrawn"|"superseded"]}</p>}
      </header><ResearchMarkdown body={body}/><ResearchResults results={item.results} locale={locale}/>
      <footer className="mt-6 border-t border-[#c8d6d0] pt-3"><h3 className="text-lg font-semibold">{t.references}</h3><ul className="list-disc pl-5">{release.references.map(reference=><li key={reference.url}><a href={reference.url} className="text-[#155f53] underline" rel="noopener noreferrer">{reference.title}</a></li>)}</ul><p>{release.change_reason}</p><Link className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}/research`}>{messages[locale].public.research}</Link></footer>
    </article>
  </PublicShell>;
}
