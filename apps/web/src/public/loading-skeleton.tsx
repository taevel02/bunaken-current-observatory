import {messages} from "@/i18n/messages";
import {PublicShell} from "@/src/public/shell";
import {DashboardView} from "@/src/public/dashboard";
import {LoadingBlock} from "@/src/public/loading-block";
import {sites} from "@bunaken/contracts/sites";
import type {Locale,Dashboard} from "@/src/public/model";
import Link from "next/link";
import {publicUrl} from "@/src/public/urls";

const pending: Dashboard={forecast_kind:"experimental",sites:[...sites],source_generated_at:null,schema_version:"1.0",generated_at:null,valid_start:null,valid_end:null,predictions:[],tides:[],observations:[],sources:[],anchor_similarity:{value:null,environment_restored:false,validated:false,reason_codes:[]}};
export function DashboardSkeleton({locale,day,siteId,modelMode}: {locale:Locale;day:string;siteId?:string;modelMode?:"baseline"|"transfer"}) {
  return <div data-loading-skeleton="dashboard" className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"><span role="status" className="sr-only">{messages[locale].public.loadingData}</span><DashboardView loading locale={locale} day={day} siteId={siteId??""} modelMode={modelMode} state={{data:pending,status:"loading",reason:null,releaseId:null}}/></div>;
}
export function ResearchSkeleton({locale,audience="guide",values={}}: {locale: Locale;audience?:"guide"|"technical";values?:Record<string,string>}) {
  return <PublicShell locale={locale} title={messages[locale].public.research} path="/research" query={"?"+new URLSearchParams(values)}><div className="mb-4 border-b border-[#c8d6d0] pb-2"><nav className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" aria-label={messages[locale].research.reports}>{(["guide","technical"] as const).map(target=><Link prefetch={false} key={target} aria-current={target===audience?"page":undefined} className="inline-flex min-h-11 items-center rounded-md px-4 text-[#155f53] aria-[current=page]:bg-[#e8efec] aria-[current=page]:font-semibold active:translate-y-px" href={publicUrl("/research",locale,{...values,audience:target})}>{messages[locale].research[target]}</Link>)}</nav></div><p className="mx-auto mb-3 max-w-[90ch] text-sm text-[#49625c]">{messages[locale].research.ongoingResearch}</p><div role="status" aria-busy="true" data-loading-skeleton="research"><span className="sr-only">{messages[locale].public.loadingData}</span><div aria-hidden="true" className="mx-auto max-w-[90ch]">{Array.from({length:12},(_,i)=><LoadingBlock key={i} className={`my-3 h-5 ${i%4===3?'w-2/3':'w-full'}`}/>)}</div></div></PublicShell>;
}
