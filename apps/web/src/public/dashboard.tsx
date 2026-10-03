import Link from "next/link";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { SelectControl } from "@/src/ui/select-control";
import { controlClass } from "@/src/ui/form-styles";
import { halfDay, witaDate, dayOffset, type Locale, type Dashboard, type Prediction } from "@/src/public/model";
import { TideChart } from "@/src/public/tide-chart";
import { headingClass, sectionClass } from "@/src/public/shell";

type State={data:Dashboard;status:string;reason:string|null;releaseId:string|null};
export function DashboardView({locale,day,siteId,state}:{locale:Locale;day:string;siteId:string;state:State}) {
 const t=messages[locale].public;
 const today=witaDate(), days=Array.from({length:7},(_,i)=>dayOffset(today,i+1));
 const reason=(code:string)=>t.reasonLabels[code as keyof typeof t.reasonLabels]??t.unknownReason;
 const support=(code:string)=>t.supportLabels[code as keyof typeof t.supportLabels]??t.insufficient;
 const registry=state.data.sites.length?state.data.sites:sites;
 const selected=registry.filter(site=>!siteId||site.id===siteId);
 const inHorizon=(row:Prediction)=>state.data.valid_start!==null&&state.data.valid_end!==null&&Date.parse(row.start_at)>=Date.parse(state.data.valid_start)&&Date.parse(row.start_at)+3600000<=Date.parse(state.data.valid_end);
 const rows=state.data.predictions.filter(row=>row.zone_id===null&&witaDate(new Date(row.start_at))===day);
 const summaries=selected.map(site=>{
   const siteRows=rows.filter(row=>row.site_id===site.id);
   const safeRows=siteRows.map(row=>state.status==='available'&&inHorizon(row)?row:{...row,pci:null});
   const reasons=[...new Set([...(state.reason?[state.reason]:[]),...(state.status==='available'&&(!siteRows.length||siteRows.some(row=>!inHorizon(row)))?['outside_source_horizon']:[]),...siteRows.flatMap(row=>row.reason_codes)])];
   if(!reasons.length&&!siteRows.length) reasons.push('missing_required_features');
   return {site,morning:halfDay(safeRows,day,8),afternoon:halfDay(safeRows,day,12),reasons};
 });
 const name=(site:typeof sites[number])=>locale==='ko'?site.name_ko:site.name_en;
 const format=(value:number|null)=>value===null?'—':value.toFixed(1);
 function period(summary:ReturnType<typeof halfDay>) {
   return <div className="grid gap-1"><strong className="tabular-nums">{format(summary.median)}</strong><span className="text-sm">{t.coverage}: {summary.count}/8{summary.partial&&summary.count>0?` · ${t.partial}`:''}</span><span className="text-sm">{support(summary.support)}</span></div>;
 }
 const chartSite=selected[0];
 const tides=state.data.tides.filter(row=>row.site_id===chartSite?.id&&(row.zone_id??null)===null&&witaDate(new Date(row.valid_time))===day);
 const curveRows:Prediction[]=state.status==='available'?rows.filter(row=>row.site_id===chartSite?.id&&inHorizon(row)):[];
 return <>
 <form className="mb-5 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" method="get" action={`/${locale}`}>
  <label className="grid min-w-0 gap-2 font-semibold">{t.date}<input className={controlClass} name="date" type="date" min={today} max={days[6]} defaultValue={day}/></label>
  <label className="grid min-w-0 gap-2 font-semibold">{t.site}<SelectControl name="site" defaultValue={siteId}><option value="">{t.allSites}</option>{registry.map(site=><option key={site.id} value={site.id}>{name(site)}</option>)}</SelectControl></label>
  <button className="min-h-12 rounded-md border border-[#145f53] bg-[#145f53] px-5 py-3 font-semibold text-white active:translate-y-px">{t.apply}</button>
 </form>
 <nav className="mb-6 flex flex-wrap gap-2" aria-label={t.date}>{[today,...days].map(date=><Link key={date} href={`?${new URLSearchParams({date,site:siteId})}`} aria-current={date===day?'date':undefined} className="inline-flex min-h-11 items-center rounded-md border border-[#c8d6d0] px-3 py-2 text-[#155f53] aria-[current=date]:bg-[#e8efec]">{date===today?t.today:date===days[0]?t.tomorrow:date.slice(5)}</Link>)}</nav>
 <div className="grid gap-2 border-y border-[#c8d6d0] py-4 text-sm"><p className="m-0">{t.generated}: {state.data.generated_at?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Makassar',dateStyle:'medium',timeStyle:'short'}).format(new Date(state.data.generated_at)):t.noGenerated}</p><p className="m-0">{t.snapshotModeHelp}</p>{state.data.source_generated_at&&<p className="m-0">{t.sourceGenerated}: {new Intl.DateTimeFormat(locale,{timeZone:"Asia/Makassar",dateStyle:"medium",timeStyle:"short"}).format(new Date(state.data.source_generated_at))}</p>}<p className="m-0">{t.unit} · WITA (UTC+08:00)</p><p className="m-0">{state.status==='stale'?t.staleHelp:state.status==='unavailable'?t.unavailable:t.modelPending}</p>{state.releaseId&&<p className="m-0 break-all">{t.release}: {state.releaseId}</p>}</div>
 <section className={sectionClass}><h2 className={headingClass}>{t.dashboard}</h2><p>{t.curveHelp}</p>
  <div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><thead><tr>{[t.site,t.depth,t.morning,t.afternoon,t.reasons].map(text=><th key={text} className="px-3 py-3 first:pl-0">{text}</th>)}</tr></thead><tbody>{summaries.map(({site,morning,afternoon,reasons})=><tr key={site.id} className="border-t border-[#c8d6d0]"><th className="py-4 pr-4 font-semibold"><Link className="text-[#155f53] underline underline-offset-4" href={`/${locale}/sites/${site.slug}?date=${day}`}>{name(site)}</Link></th><td className="px-3 py-4 text-right tabular-nums">{site.reference_depth_m??'—'}m</td><td className="px-3 py-4 text-right">{period(morning)}</td><td className="px-3 py-4 text-right">{period(afternoon)}</td><td className="px-3 py-4 text-sm">{[...new Set(reasons.map(reason))].join(' · ')}</td></tr>)}</tbody></table></div>
  <div className="grid gap-4 md:hidden">{summaries.map(({site,morning,afternoon,reasons})=><article key={site.id} className="min-w-0 border-b border-[#c8d6d0] pb-4"><h3 className="m-0 mb-3 text-lg"><Link className="text-[#155f53] underline underline-offset-4" href={`/${locale}/sites/${site.slug}?date=${day}`}>{name(site)}</Link></h3><p className="text-sm">{t.depth}: {site.reference_depth_m}m</p><div className="grid grid-cols-2 gap-4"><div><h4 className="m-0 mb-2">{t.morning}</h4>{period(morning)}</div><div><h4 className="m-0 mb-2">{t.afternoon}</h4>{period(afternoon)}</div></div><p className="mb-0 text-sm">{[...new Set(reasons.map(reason))].join(' · ')}</p></article>)}</div>
 </section>
 {chartSite&&<section className={sectionClass}><h2 className={headingClass}>{name(chartSite)} · {t.tide}</h2><p>{t.tideHelp}</p><TideChart rows={tides} locale={locale}/><p className="text-sm text-[#49625c]">{t.tideDatum}</p>
 <h3 className="mt-6 text-lg">{t.prediction}</h3>{!curveRows.some(row=>row.pci!==null)?<p>{t.allNull}</p>:<table className="w-full border-collapse text-left"><thead><tr><th>{t.time}</th><th className="text-right">PCI</th><th className="text-right">{t.support}</th></tr></thead><tbody>{curveRows.map(row=><tr key={row.start_at} className="border-t border-[#c8d6d0]"><td className="py-2">{new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit'}).format(new Date(row.start_at))}</td><td className="py-2 text-right tabular-nums">{format(row.pci)}</td><td className="py-2 text-right">{support(row.support)}</td></tr>)}</tbody></table>}
 <dl className="grid gap-3 sm:grid-cols-2">{summaries.find(item=>item.site.id===chartSite.id)&&[summaries[0].morning,summaries[0].afternoon].map((summary,i)=><div key={i}><dt className="font-semibold">{i===0?t.morning:t.afternoon} · {summary.partial?t.partialMaximum:t.maximum}</dt><dd className="m-0 tabular-nums">{format(summary.max)} · {t.maxSupport}: {support(summary.maxSupport)}</dd></div>)}</dl></section>}
 <section className={sectionClass}><h2 className={headingClass}>{t.anchor}</h2><p>{t.anchorHelp}</p><p>{state.data.anchor_similarity.value===null||!state.data.anchor_similarity.environment_restored?t.similarityUnavailable:`${t.similarity}: ${state.data.anchor_similarity.value.toFixed(2)} · ${t.similarityUnvalidated}`}</p></section>
 </>;
}
