import { notFound } from "next/navigation";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { PublicShell, headingClass, sectionClass } from "@/src/public/shell";
import { ResearchDetails } from "@/src/public/research-details";
import { ResearchLibrary } from "@/src/public/research-library";
import { PCIReference } from "@/src/ui/pci-reference";
import { loadPublicRelease } from "@/src/server/public-release";
import { validDay,witaDate,dayOffset } from "@/src/public/model";

const sections=['observations','pci','methodology','status','research'] as const;
export default async function PublicPage({params,searchParams}:{params:Promise<{locale:string;section:string}>;searchParams:Promise<{date?:string;site?:string;offset?:string}>}) {
 const {locale,section}=await params;if(locale!=='ko'&&locale!=='en')notFound();
 if(!sections.includes(section as typeof sections[number]))notFound();
 const t=messages[locale].public,title=t[section as typeof sections[number]];
 const query=await searchParams,today=witaDate();
 const date=validDay(query.date)&&query.date>=today&&query.date<=dayOffset(today,7)?query.date:dayOffset(today,1);
 const site=sites.some(site=>site.id===query.site)?query.site as string:'';
 const state=await loadPublicRelease();
 const observations=state.data.observations.filter(row=>!site||row.site_id===site);
 const label=(siteId:string)=>{const site=(state.data.sites.length?state.data.sites:sites).find(site=>site.id===siteId);return site?(locale==='ko'?site.name_ko:site.name_en):t.unverified;};
 return <PublicShell locale={locale} title={title} path={`/${section}`} query={'?'+new URLSearchParams({date,site})}>
 {section==='research'&&<><ResearchLibrary locale={locale} offset={/^\d{1,4}$/.test(query.offset??"")?Number(query.offset):0}/><ResearchDetails state={state} locale={locale} day={date}/></>}
 {section==='pci'&&<section className={sectionClass}><p>{t.method1}</p><PCIReference locale={locale}/><h2 className={`${headingClass} mt-6`}>{t.anchor}</h2><p>{t.anchorHelp}</p></section>}
 {section==='methodology'&&<section className={`${sectionClass} grid gap-4`}>{[t.method1,t.method2,t.method3,t.method4,t.method5].map(text=><p key={text} className="m-0">{text}</p>)}</section>}
 {section==='observations'&&<section className={sectionClass}><p>{t.publicRead}</p>{observations.length===0?<p>{t.emptyObservations}</p>:observations.map(row=><article key={row.id} className="border-t border-[#c8d6d0] py-4"><h2 className={headingClass}>{label(row.site_id)}</h2><p>{row.local_start.replace('T',' ')} WITA · {t.revision} {row.revision}</p>{row.record_status==='withdrawn'?<p>{t.withdrawn}</p>:<><p className="tabular-nums">{messages[locale].observations.pci}: {row.overall_pci}</p>{row.label_scope==='legacy_unspecified'&&<p>{t.insufficient}</p>}{row.notes_public&&<p className="whitespace-pre-wrap break-words">{row.notes_public}</p>}</>}</article>)}</section>}
 {section==='status'&&<><section className={sectionClass}><h2 className={headingClass}>{t.release}</h2><p className="break-all">{state.releaseId??t.noGenerated}</p><p>{state.status==='stale'?t.staleHelp:state.status==='unavailable'?t.unavailable:t.modelPending}</p>{state.data.generated_at&&<p>{t.generated}: {new Intl.DateTimeFormat(locale,{timeZone:'Asia/Makassar',dateStyle:'medium',timeStyle:'short'}).format(new Date(state.data.generated_at))}</p>}</section><section className={sectionClass}><h2 className={headingClass}>{t.source}</h2>{state.data.sources.length===0?<p>{t.sourcesMissing}</p>:state.data.sources.map(source=><article key={source.id} className="min-w-0 border-t border-[#c8d6d0] py-4"><h3 className="m-0 break-all text-lg">{source.dataset}</h3><p>{source.version??t.unverified} · {source.public_export_allowed?t.exportAllowed:t.exportPending}</p><p className="break-words text-sm">{source.attribution}</p><a className="inline-flex min-h-11 items-center text-[#155f53] underline" href={/^https:\/\//.test(source.license_url)?source.license_url:undefined} rel="noopener noreferrer">{t.license}</a></article>)}</section></>}
 <Link className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}?${new URLSearchParams({date,site})}`}>{t.dashboard}</Link>
 </PublicShell>;
}
