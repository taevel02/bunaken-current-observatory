import Link from "next/link";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { SelectControl } from "@/src/ui/select-control";
import { halfDay, witaDate, dayOffset, type Locale, type Dashboard, type Prediction, type Moon } from "@/src/public/model";
import { TideChart } from "@/src/public/tide-chart";
import { EnvironmentOverview, MoonSummary } from "@/src/public/environment-overview";
import { SignalChart } from "@/src/public/signal-chart";
import { noonSample, signalRows } from "@/src/public/environment-samples";
import { PCIChart } from "@/src/public/pci-chart";

type State={data:Dashboard;status:string;reason:string|null;releaseId:string|null};
export function DashboardView({locale,day,siteId,state,detail=false,moon=null,modelMode="baseline",signal="pci"}:{locale:Locale;day:string;siteId:string;state:State;detail?:boolean;moon?:Moon;modelMode?:"baseline"|"transfer";signal?:"pci"|"current"|"tide"}) {
 const t=messages[locale].public;
 const today=witaDate(), days=Array.from({length:7},(_,i)=>dayOffset(today,i+1));
 const reason=(code:string)=>t.reasonLabels[code as keyof typeof t.reasonLabels]??t.unknownReason;
 const support=(code:string)=>t.supportLabels[code as keyof typeof t.supportLabels]??t.insufficient;
 const registry=state.data.sites.length?state.data.sites:sites;
 const chartSite=registry.find(site=>site.id===siteId)??registry[0];
 const commonDepth=registry.length&&registry.every(site=>site.reference_depth_m===registry[0].reference_depth_m)?registry[0].reference_depth_m:null;
 const inHorizon=(row:Prediction)=>state.data.valid_start!==null&&state.data.valid_end!==null&&Date.parse(row.start_at)>=Date.parse(state.data.valid_start)&&Date.parse(row.start_at)+3600000<=Date.parse(state.data.valid_end);
 const modelRows=modelMode==='transfer'?(state.data.experimental_transfer?.predictions.map(item=>item.prediction)??[]):state.data.predictions;
 const rows=modelRows.filter(row=>row.zone_id===null&&witaDate(new Date(row.start_at))===day);
 const observationCounts=new Map<string,number>();
 const countedObservations=new Set<string>();
 for(const observation of state.data.observations){
  if(observation.record_status!=='withdrawn'&&!countedObservations.has(observation.id)){
   countedObservations.add(observation.id);
   observationCounts.set(observation.site_id,(observationCounts.get(observation.site_id)??0)+1);
  }
 }
 const summaries=registry.map(site=>{
   const siteRows=rows.filter(row=>row.site_id===site.id);
   const safeRows=siteRows.map(row=>state.status==='available'&&inHorizon(row)?row:{...row,pci:null});
   const reasons=[...new Set([...(state.reason?[state.reason]:[]),...(state.status==='available'&&(!siteRows.length||siteRows.some(row=>!inHorizon(row)))?['outside_source_horizon']:[]),...siteRows.flatMap(row=>row.reason_codes)])];
   if(!reasons.length&&!siteRows.length) reasons.push('missing_required_features');
   return {site,morning:halfDay(safeRows,day,8),afternoon:halfDay(safeRows,day,12),reasons};
 });
 const orderedSummaries=[...summaries].sort((a,b)=>(observationCounts.get(b.site.id)??0)-(observationCounts.get(a.site.id)??0));
 const current=summaries.find(summary=>summary.site.id===chartSite?.id);
 const name=(site:typeof sites[number])=>locale==='ko'?site.name_ko:site.name_en;
 const format=(value:number|null)=>value===null?t.noValue:value.toFixed(1);
 const stamp=(at:string|null)=>at?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Makassar',dateStyle:'short',timeStyle:'short'}).format(new Date(at)):t.noGenerated;
 const query=(date:string,id:string)=>new URLSearchParams({date,site:id,model:modelMode,signal}).toString();
 const tides=state.data.tides.filter(row=>row.site_id===chartSite?.id&&(row.zone_id??null)===null&&witaDate(new Date(row.valid_time))===day);
 const curveRows:Prediction[]=state.status==='available'?rows.filter(row=>row.site_id===chartSite?.id&&inHorizon(row)):[];
 const series=detail||siteId?undefined:orderedSummaries.map(({site})=>site).map(site=>({id:site.id,name:name(site),selected:site.id===siteId,rows:state.status==='available'?rows.filter(row=>row.site_id===site.id&&inHorizon(row)):[]}));
 const siteHref=(slug:string)=>`/${locale}/sites/${slug}?${query(day,siteId)}`;
 const environmentValue=(id:string,depth:number|null,variable:string,source:string,unit:string)=>{
  if(state.status!=='available')return t.noValue;
  const sample=noonSample(state.data,day,id,depth,variable,source,unit);
  return sample?.value===null||!sample?t.noValue:sample.value.toFixed(unit==='degree'?0:2);
 };
 const status=state.status==='stale'?t.stale:state.status==='unavailable'?t.unavailable:state.status==='available'?t.dataAvailable:t.modelPending;
 const signalSites=detail||siteId?registry.filter(site=>site.id===chartSite?.id):orderedSummaries.map(({site})=>site);
 const signalSeries=signalSites.map(site=>({id:site.id,name:name(site),rows:state.status==='available'&&signal!=='pci'?
  signalRows(state.data,day,site.id,site.reference_depth_m,signal).filter(row=>state.data.valid_start&&state.data.valid_end&&Date.parse(row.at)>=Date.parse(state.data.valid_start)&&Date.parse(row.at)<=Date.parse(state.data.valid_end)):[]}));
 const donors=(id:string)=>new Set((state.data.experimental_transfer?.predictions??[]).filter(item=>item.prediction.site_id===id&&item.prediction.pci!==null&&witaDate(new Date(item.prediction.start_at))===day).flatMap(item=>item.donor_sites)).size;


 return <>
 <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
  <form className="flex min-w-0 flex-wrap items-center gap-2" method="get" action={`/${locale}`}>
   <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.date}<input className="min-h-11 min-w-0 rounded-md border border-[#9fb7ae] bg-white px-2 text-base" name="date" type="date" min={today} max={days[6]} defaultValue={day}/></label>
   <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.site}<SelectControl name="site" defaultValue={detail?chartSite?.id:siteId}><option value="">{t.allSites}</option>{orderedSummaries.map(({site})=><option key={site.id} value={site.id}>{name(site)}</option>)}</SelectControl></label>
   <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.modelMode}<SelectControl name="model" defaultValue={modelMode}><option value="baseline">{t.baselineModel}</option><option value="transfer">{t.transferModel}</option></SelectControl></label>
   <input type="hidden" name="signal" value={signal}/>
   <button className="min-h-11 rounded-md bg-[#145f53] px-4 font-semibold text-white active:translate-y-px">{t.apply}</button>
  </form>
  <nav className="flex flex-wrap gap-1" aria-label={t.date}>{[today,...days].map(date=><Link key={date} href={`?${query(date,siteId)}`} aria-current={date===day?'date':undefined} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-[#155f53] aria-[current=date]:bg-[#e8efec] active:translate-y-px">{date===today?t.today:date===days[0]?t.tomorrow:date.slice(5)}</Link>)}</nav>
  <MoonSummary moon={moon} locale={locale}/>

 </div>
 <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#c8d6d0] pb-0 text-sm text-[#49625c]">
  <strong className="font-medium text-[#18302d]">{status}</strong><span>{t.experimental} · {t.forecastUnvalidated} · WITA · {commonDepth===null?t.siteDepthVaries:`${t.depth} ${commonDepth}m`}</span><span>{t.generated}: {stamp(state.data.generated_at)}</span>{state.reason==='date_history_unavailable'&&<span>{t.dateHistoryUnavailable}</span>}{state.reason==='outside_source_horizon'&&<span>{t.dateUnavailable}</span>}

 </div>
 <section className="min-w-0 border-b border-[#c8d6d0] pb-1">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{(detail||siteId)&&chartSite?name(chartSite):t.allSites} · {signal==='pci'?t.pciCurve:signal==='current'?t.currentCurve:t.tide}</h2><nav className="flex flex-wrap gap-1" aria-label={t.viewData}>{([['pci',t.pciCurve],['current',t.currentCurve],['tide',t.tide]] as const).map(([metric,label])=><Link key={metric} href={`?${new URLSearchParams({date:day,site:siteId,model:modelMode,signal:metric})}`} aria-current={metric===signal?'page':undefined} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-[#155f53] aria-[current=page]:bg-[#e8efec] active:translate-y-px">{label}</Link>)}</nav><span className="text-sm text-[#49625c]">{signal==='pci'?t.unit:signal==='current'?'m/s':'m'}</span></div>
  {modelMode==='transfer'&&signal==='pci'&&<p className="my-1 text-sm text-[#705229]">{state.data.experimental_transfer?t.transferNotice:t.transferPending}{siteId&&donors(siteId)>0?` · ${t.donorSites}: ${donors(siteId)}`:''}</p>}
  {signal==='pci'?<PCIChart rows={curveRows} series={series} day={day} locale={locale} showData={detail} transfer={modelMode==='transfer'} siteName={chartSite?name(chartSite):''}/>:<SignalChart series={signalSeries} day={day} metric={signal} locale={locale}/>}

 </section>
 {!detail&&<section className="mt-3 min-w-0">
  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{t.siteComparison}</h2><span className="text-sm text-[#49625c]">{t.environmentAtNoon}</span></div>
  <div className="max-h-[46dvh] min-w-0 overflow-auto border-y border-[#c8d6d0] focus-visible:outline-2" role="region" aria-label={t.siteComparison} tabIndex={0}>
   <table className="w-full min-w-[900px] border-collapse text-left text-sm"><thead><tr>{[t.site,t.dataCount,...(modelMode==='transfer'?[t.donorSites]:[]),...(commonDepth===null?[t.depth]:[]),t.morning,t.afternoon,`${t.environment.metrics.uo} (m/s)`,`${t.environment.metrics.vo} (m/s)`,`${t.environment.metrics.wind_direction_10m} (°)`,`${t.environment.metrics.wave_height} (m)`,t.details].map((text,index)=><th key={text} scope="col" className={`sticky top-0 z-10 bg-[#e8efec] px-4 py-2 font-semibold ${index>0?'text-right':'left-0 z-20'}`}>{text}</th>)}</tr></thead><tbody>{orderedSummaries.map(({site,morning,afternoon})=><tr key={site.id} className={`border-t border-[#dce5e0] ${site.id===siteId?'bg-[#e8efec]':''}`}>
    <th scope="row" className={`sticky left-0 z-10 min-w-44 p-0 px-4 text-left font-medium ${site.id===siteId?'bg-[#e8efec]':'bg-white'}`}><Link aria-current={site.id===siteId?'true':undefined} className="flex min-h-11 items-center whitespace-nowrap text-base text-[#155f53] underline-offset-4 hover:underline active:translate-y-px" href={`/${locale}?${query(day,site.id)}`}>{name(site)}</Link></th>
    <td className="px-4 text-right tabular-nums">{observationCounts.get(site.id)??0}</td>
    {modelMode==='transfer'&&<td className="px-4 text-right tabular-nums">{donors(site.id)||t.noValue}</td>}
    {commonDepth===null&&<td className="px-4 text-right tabular-nums">{site.reference_depth_m===null?t.unverified:`${site.reference_depth_m}m`}</td>}
    {[morning,afternoon].map((summary,index)=><td key={index} className="whitespace-nowrap px-4 text-right tabular-nums">{format(summary.median)} <span className="text-xs text-[#49625c]">{summary.count}/8</span></td>)}
    {[["uo","copernicus-currents","m/s"],["vo","copernicus-currents","m/s"],["wind_direction_10m","open-meteo-wind","degree"],["wave_height","open-meteo-wave","m"]].map(([variable,source,unit])=><td key={variable} className="whitespace-nowrap px-4 text-right tabular-nums">{environmentValue(site.id,site.reference_depth_m,variable,source,unit)}</td>)}
    <td className="px-4 text-right"><Link className="inline-flex min-h-11 items-center whitespace-nowrap text-[#155f53] underline active:translate-y-px" href={siteHref(site.slug)} aria-label={`${name(site)} · ${t.details}`}>{t.details}</Link></td>
   </tr>)}</tbody></table>
  </div>
 </section>}
 {detail&&<div className="mt-3 grid min-w-0 items-start gap-4 xl:grid-cols-2">
 {detail&&current&&<section className="min-w-0"><h2 className="m-0 text-lg font-semibold">{t.siteComparison}</h2><dl className="my-2 grid grid-cols-2 gap-4 border-y border-[#c8d6d0] py-2">{[current.morning,current.afternoon].map((summary,i)=><div key={i}><dt className="text-sm font-semibold">{i===0?t.morning:t.afternoon} · {t.median}</dt><dd className="m-0 tabular-nums"><strong className="text-xl">{format(summary.median)}</strong> <span className="text-sm">{summary.count}/8 · {support(summary.support)}</span></dd><dd className="m-0 mt-1 text-sm">{summary.partial?t.partialMaximum:t.maximum}: {format(summary.max)}<span className="hidden sm:inline"> · </span><span className="block sm:inline">{t.maxSupport}: {support(summary.maxSupport)}</span></dd></div>)}</dl><p className="m-0 text-sm">{[...new Set(current.reasons.map(reason))].join(' · ')}</p></section>}
 {chartSite&&<section className="min-w-0">
  <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{name(chartSite)}</h2><span className="text-sm text-[#49625c]">{t.depth}: {chartSite.reference_depth_m===null?t.unverified:`${chartSite.reference_depth_m}m`}</span></div>
  <h3 className="m-0 text-base font-semibold">{t.tide}</h3><p className="my-1 text-sm text-[#49625c]">{t.tideHelp}</p><TideChart rows={tides} locale={locale}/><p className="my-1 text-sm text-[#49625c]">{t.tideDatum}</p>
  <EnvironmentOverview data={state.data} day={day} siteId={chartSite.id} depth={chartSite.reference_depth_m} locale={locale} moon={moon} status={state.status}/>

 </section>}
 </div>}
 </>;
}
