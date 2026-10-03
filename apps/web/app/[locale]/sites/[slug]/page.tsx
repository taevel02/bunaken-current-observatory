import { notFound } from "next/navigation";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { DashboardView } from "@/src/public/dashboard";
import { PublicShell } from "@/src/public/shell";
import { loadPublicRelease } from "@/src/server/public-release";
import { validDay,witaDate,dayOffset } from "@/src/public/model";

export default async function SitePage({params,searchParams}:{params:Promise<{locale:string;slug:string}>;searchParams:Promise<{date?:string}>}) {
 const {locale,slug}=await params;if(locale!=='ko'&&locale!=='en')notFound();
 const state=await loadPublicRelease();
 const registry=state.data.sites.length?state.data.sites:sites;
 const site=registry.find(site=>site.slug===slug);if(!site)notFound();
 const query=await searchParams,today=witaDate();
 const day=validDay(query.date)&&query.date>=today&&query.date<=dayOffset(today,7)?query.date:dayOffset(today,1);
 const t=messages[locale].public;
 return <PublicShell locale={locale} title={locale==='ko'?site.name_ko:site.name_en} path={`/sites/${site.slug}`} query={'?'+new URLSearchParams({date:day,site:site.id})}>
 <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#49625c]"><span>{t.reference}: {site.lat}, {site.lon}</span><span>{t.depth}: {site.reference_depth_m}m</span><span>{t.geometryPending}</span></div><DashboardView locale={locale} day={day} siteId={site.id} state={state} detail/></PublicShell>;
}
