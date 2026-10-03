import Link from "next/link";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { SelectControl } from "@/src/ui/select-control";
import { halfDay, witaDate, dayOffset, type Locale, type Dashboard, type Prediction, type Moon } from "@/src/public/model";
import { TideChart } from "@/src/public/tide-chart";
import { EnvironmentOverview, MoonSummary } from "@/src/public/environment-overview";
import { PCIChart } from "@/src/public/pci-chart";

type State={data:Dashboard;status:string;reason:string|null;releaseId:string|null};
export function DashboardView({locale,day,siteId,state,detail=false,moon=null}:{locale:Locale;day:string;siteId:string;state:State;detail?:boolean;moon?:Moon}) {
 const t=messages[locale].public;
 const today=witaDate(), days=Array.from({length:7},(_,i)=>dayOffset(today,i+1));
 const reason=(code:string)=>t.reasonLabels[code as keyof typeof t.reasonLabels]??t.unknownReason;
 const support=(code:string)=>t.supportLabels[code as keyof typeof t.supportLabels]??t.insufficient;
 const registry=state.data.sites.length?state.data.sites:sites;
 const chartSite=registry.find(site=>site.id===siteId)??registry[0];
 const commonDepth=registry.length&&registry.every(site=>site.reference_depth_m===registry[0].reference_depth_m)?registry[0].reference_depth_m:null;
 const inHorizon=(row:Prediction)=>state.data.valid_start!==null&&state.data.valid_end!==null&&Date.parse(row.start_at)>=Date.parse(state.data.valid_start)&&Date.parse(row.start_at)+3600000<=Date.parse(state.data.valid_end);
 const rows=state.data.predictions.filter(row=>row.zone_id===null&&witaDate(new Date(row.start_at))===day);
 const summaries=registry.map(site=>{
   const siteRows=rows.filter(row=>row.site_id===site.id);
   const safeRows=siteRows.map(row=>state.status==='available'&&inHorizon(row)?row:{...row,pci:null});
   const reasons=[...new Set([...(state.reason?[state.reason]:[]),...(state.status==='available'&&(!siteRows.length||siteRows.some(row=>!inHorizon(row)))?['outside_source_horizon']:[]),...siteRows.flatMap(row=>row.reason_codes)])];
   if(!reasons.length&&!siteRows.length) reasons.push('missing_required_features');
   return {site,morning:halfDay(safeRows,day,8),afternoon:halfDay(safeRows,day,12),reasons};
 });
 const current=summaries.find(summary=>summary.site.id===chartSite?.id);
 const name=(site:typeof sites[number])=>locale==='ko'?site.name_ko:site.name_en;
 const format=(value:number|null)=>value===null?t.noValue:value.toFixed(1);
 const stamp=(at:string|null)=>at?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Makassar',dateStyle:'short',timeStyle:'short'}).format(new Date(at)):t.noGenerated;
 const query=(date:string,id:string)=>new URLSearchParams({date,site:id}).toString();
 const tides=state.data.tides.filter(row=>row.site_id===chartSite?.id&&(row.zone_id??null)===null&&witaDate(new Date(row.valid_time))===day);
 const curveRows:Prediction[]=state.status==='available'?rows.filter(row=>row.site_id===chartSite?.id&&inHorizon(row)):[];
 const status=state.status==='stale'?t.stale:state.status==='unavailable'?t.unavailable:t.modelPending;
 const comparisonTitle=<h2 className="sr-only">{t.siteComparison}</h2>;
 return <>
 <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
  <form className="flex min-w-0 flex-wrap items-center gap-2" method="get" action={`/${locale}`}>
   <label className="flex min-w-0 items-center gap-2 text-sm font-semibold">{t.date}<input className="min-h-11 min-w-0 rounded-md border border-[#9fb7ae] bg-white px-2 text-base" name="date" type="date" min={today} max={days[6]} defaultValue={day}/></label>
   <label className="flex min-w-0 items-center gap-2 text-sm font-semibold">{t.site}<SelectControl name="site" defaultValue={chartSite?.id}><option value="">{t.allSites}</option>{registry.map(site=><option key={site.id} value={site.id}>{name(site)}</option>)}</SelectControl></label>
   <button className="min-h-11 rounded-md bg-[#145f53] px-4 font-semibold text-white active:translate-y-px">{t.apply}</button>
  </form>
  <nav className="flex flex-wrap gap-1" aria-label={t.date}>{[today,...days].map(date=><Link key={date} href={`?${query(date,siteId)}`} aria-current={date===day?'date':undefined} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-[#155f53] aria-[current=date]:bg-[#e8efec] active:translate-y-px">{date===today?t.today:date===days[0]?t.tomorrow:date.slice(5)}</Link>)}</nav>
  <MoonSummary moon={moon} locale={locale}/>
  <details className="relative ml-auto"><summary className="inline-flex min-h-11 cursor-pointer items-center text-[#155f53]">{t.releaseDetails}</summary><div className="mt-1 max-w-xl border border-[#c8d6d0] bg-white p-3"><p className="m-0">{t.snapshotModeHelp}</p><p className="my-1">{t.sourceGenerated}: {state.data.source_generated_at?stamp(state.data.source_generated_at):t.noData}</p><p className="my-1 break-all">{t.release}: {state.releaseId??t.noGenerated}</p><p className="m-0">{t.unit}</p></div></details>
 </div>
 <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#c8d6d0] pb-0 text-sm text-[#49625c]">
  <strong className="font-medium text-[#18302d]">{status}</strong><span>{t.experimental} · WITA · {commonDepth===null?t.siteDepthVaries:`${t.depth} ${commonDepth}m`}</span><span>{t.generated}: {stamp(state.data.generated_at)}</span>

 </div>
 <div className={detail?'grid min-w-0 gap-5':'grid min-w-0 gap-5 xl:grid-cols-[minmax(580px,0.9fr)_minmax(0,1.1fr)]'}>
 {!detail&&<section className="min-w-0">{comparisonTitle}
  <div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left text-sm"><thead><tr>{[t.site,...(commonDepth===null?[t.depth]:[]),t.morning,t.afternoon,t.reasons].map(text=><th key={text} className="px-3 pb-1 first:pl-0">{text}</th>)}</tr></thead><tbody>{summaries.map(({site,morning,afternoon,reasons})=><tr key={site.id} className={`border-t border-[#dce5e0] ${site.id===chartSite?.id?'bg-[#e8efec]':''}`}><th className="p-0 pr-4 align-middle font-medium"><Link aria-current={site.id===chartSite?.id?'true':undefined} className="flex min-h-11 items-center pl-2 text-base text-[#155f53] underline-offset-4 hover:underline" href={`/${locale}?${query(day,site.id)}`}>{name(site)}</Link></th>{commonDepth===null&&<td className="px-3 text-right tabular-nums">{site.reference_depth_m===null?t.unverified:`${site.reference_depth_m}m`}</td>}<td className="px-3 text-right tabular-nums"><span>{format(morning.median)}</span><span className="ml-2 text-xs text-[#49625c]">{morning.count}/8</span></td><td className="px-3 text-right tabular-nums"><span>{format(afternoon.median)}</span><span className="ml-2 text-xs text-[#49625c]">{afternoon.count}/8</span></td><td className="px-3">{[...new Set(reasons.map(reason))].join(' · ')||support(morning.support)}</td></tr>)}</tbody></table></div>
  <div className="grid gap-2 md:hidden">{summaries.map(({site,morning,afternoon,reasons})=><article key={site.id} className="border-b border-[#c8d6d0] py-2"><Link className="inline-flex min-h-11 items-center text-[#155f53] underline" href={`/${locale}?${query(day,site.id)}`}>{name(site)}</Link>{commonDepth===null&&<p className="my-1 text-sm">{t.depth}: {site.reference_depth_m===null?t.unverified:`${site.reference_depth_m}m`}</p>}<div className="flex gap-5 text-sm tabular-nums"><span>{t.morning}: {format(morning.median)} ({morning.count}/8)</span><span>{t.afternoon}: {format(afternoon.median)} ({afternoon.count}/8)</span></div><p className="my-1 text-sm">{[...new Set(reasons.map(reason))].join(' · ')}</p></article>)}</div>
 </section>}
 {chartSite&&<section className="order-first min-w-0 xl:order-none">
  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{name(chartSite)} · {t.pciCurve}</h2><span className="text-sm text-[#49625c]">{t.depth}: {chartSite.reference_depth_m===null?t.unverified:`${chartSite.reference_depth_m}m`}</span><Link className="inline-flex min-h-11 items-center text-sm text-[#155f53] underline" href={`/${locale}/sites/${chartSite.slug}?date=${day}`}>{t.details}</Link></div>
  <div className={detail?'grid min-w-0 gap-5 xl:grid-cols-2':'grid min-w-0 gap-2'}>
   <div className="min-w-0"><PCIChart rows={curveRows} day={day} locale={locale}/>
    {current&&<dl className="my-1 grid grid-cols-2 gap-4 border-y border-[#c8d6d0] py-1">{[current.morning,current.afternoon].map((summary,i)=><div key={i}><dt className="text-sm font-semibold">{i===0?t.morning:t.afternoon} · {t.median}</dt><dd className="m-0 tabular-nums"><strong className="text-xl">{format(summary.median)}</strong> <span className="text-sm">{summary.count}/8 · {support(summary.support)}</span></dd><dd className="m-0 mt-1 text-sm">{summary.partial?t.partialMaximum:t.maximum}: {format(summary.max)}<span className="hidden sm:inline"> · </span><span className="block sm:inline">{t.maxSupport}: <span className="whitespace-nowrap">{support(summary.maxSupport)}</span></span></dd></div>)}</dl>}
    <details><summary className="min-h-11 cursor-pointer py-2 text-sm text-[#155f53]">{t.readGraph}</summary><p className="my-2 text-sm">{t.graphHelp}</p><p className="my-2 text-sm">{t.pciReferenceMarker}</p><p className="my-2 text-sm">{t.method2}</p><p className="my-2 text-sm">{t.method4}</p></details>
   </div>
   <div className="min-w-0 border-t border-[#c8d6d0] pt-3 xl:pt-2"><h3 className="m-0 text-base font-semibold">{t.tide}</h3><p className="my-1 text-sm text-[#49625c]">{t.tideHelp}</p><TideChart rows={tides} locale={locale}/><p className="my-1 text-sm text-[#49625c]">{t.tideDatum}</p>
    <EnvironmentOverview data={state.data} day={day} siteId={chartSite.id} depth={chartSite.reference_depth_m} locale={locale} moon={moon} status={state.status}/>
    <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm text-[#155f53]">{t.anchor}</summary><p className="my-2 text-sm">{t.anchorHelp}</p><p className="my-2 text-sm">{state.data.anchor_similarity.value===null||!state.data.anchor_similarity.environment_restored?t.similarityUnavailable:`${t.similarity}: ${state.data.anchor_similarity.value.toFixed(2)} · ${t.similarityUnvalidated}`}</p></details>
   </div>
  </div>
 </section>}
 </div>
 </>;
}
