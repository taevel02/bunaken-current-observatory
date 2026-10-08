import { notFound } from "next/navigation";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { PublicShell } from "@/src/public/shell";
import { DashboardView } from "@/src/public/dashboard";
import { loadMoon } from "@/src/server/moon";
import { loadPublicRelease } from "@/src/server/public-release";
import { validDay, witaDate, dayOffset } from "@/src/public/model";

export default async function Home({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{date?:string;site?:string;model?:string;signal?:string}>}) {
 const {locale}=await params;if(locale!=='ko'&&locale!=='en')notFound();
 const query=await searchParams;const today=witaDate();
 const day=validDay(query.date)&&query.date>=today&&query.date<=dayOffset(today,7)?query.date:dayOffset(today,1);
 const siteId=sites.some(site=>site.id===query.site)?query.site as string:'';
 const modelMode=query.model==='transfer'?'transfer':'baseline';
 const signal=query.signal==='current'?'current':query.signal==='tide'?'tide':'pci';
 const preserved='?'+new URLSearchParams({date:day,site:siteId,model:modelMode,signal});
 const state=await loadPublicRelease(day);
 const registry=state.data.sites.length?state.data.sites:sites;
 const selected=registry.find(site=>site.id===siteId)??registry[0];
 const moon=await loadMoon(day,selected.lat,selected.lon);
 return <PublicShell locale={locale} title={messages[locale].public.dashboard} query={preserved}><DashboardView locale={locale} day={day} siteId={siteId} state={state} moon={moon} modelMode={modelMode} signal={signal}/></PublicShell>;
}
