import { environmentSamples } from "@/src/public/environment-samples";
import { Disclosure } from "@/src/ui/disclosure";
import { messages } from "@/i18n/messages";
import { witaTime, type Dashboard, type Locale, type Moon } from "@/src/public/model";

const metrics = [
 ["uo","copernicus-currents","m/s"], ["vo","copernicus-currents","m/s"],
 ["thetao","copernicus-temperature","°C"], ["so","copernicus-salinity","PSU"],
 ["wind_speed_10m","open-meteo-wind","m/s"], ["wind_direction_10m","open-meteo-wind","degree"],
 ["wave_height","open-meteo-wave","m"], ["wave_period","open-meteo-wave","s"],
 ["wave_direction","open-meteo-wave","degree"], ["swell_wave_height","open-meteo-wave","m"],
 ["swell_wave_period","open-meteo-wave","s"], ["swell_wave_direction","open-meteo-wave","degree"],
] as const;
function MoonDisk({moon,label}:{moon:NonNullable<Moon>;label:string}) {
 const radius=Math.abs(1-2*moon.illumination)*18;
 const sweep=moon.illumination<.5?0:1;
 const waning=moon.phase.startsWith("Waning")||moon.phase==="Last Quarter";
 return <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" role="img" aria-label={label}><circle cx="20" cy="20" r="18" fill="#18302d"/><g transform={waning?'translate(40 0) scale(-1 1)':undefined}><path d={`M20 2 A18 18 0 0 1 20 38 A${Math.max(.001,radius)} 18 0 0 ${sweep} 20 2 Z`} fill="#f5efcf"/></g><circle cx="20" cy="20" r="18" fill="none" stroke="#9fb7ae"/></svg>;
}
export function EnvironmentOverview({data,day,siteId,depth,locale,moon,status}:{data:Dashboard;day:string;siteId:string;depth:number|null;locale:Locale;moon:Moon;status:string}) {
 const t=messages[locale].public.environment;
 const start=Date.parse(`${day}T00:00:00+08:00`);
 const groups=metrics.map(([variable,source,unit])=>{
  const {rows,values,provider}=environmentSamples(data,day,siteId,depth,variable,source,unit);
  const min=values.length?Math.min(...values.map(row=>row.value as number)):null;
  const max=values.length?Math.max(...values.map(row=>row.value as number)):null;
  const reasons=provider?.reason_codes??[];
  const unavailable=provider?.public_export_allowed===false?t.licensePending:reasons.includes("stale_required_source")?t.stale:reasons.includes("unverified_geometry")?t.geometryPending:reasons.includes("source_age_unknown")?t.ageUnknown:rows.length?t.invalidSamples:t.awaitingSamples;
  return {variable,source,unit,rows,values,min,max,unavailable};
 });

 return <section className="min-w-0 border-t border-[#c8d6d0] pt-2" aria-labelledby="environment-heading">
  <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 id="environment-heading" className="m-0 text-base font-semibold">{t.title}</h3><span className="text-xs text-[#49625c]">{t.dailyRange} · 00–24 WITA</span></div>
  {status==='stale'&&<p className="my-1 text-sm">{messages[locale].public.stale}</p>}
  <dl className="my-1 grid min-w-0 grid-cols-1 gap-x-5 sm:grid-cols-2">{groups.map(group=><div key={group.variable} className="flex min-w-0 items-center justify-between gap-3 border-b border-[#e2e9e5] py-1 text-sm"><dt>{t.metrics[group.variable]}</dt><dd className="m-0 flex shrink-0 items-center gap-2 tabular-nums">
   {group.min===null?<span className="text-xs text-[#49625c]">{group.unavailable}</span>:<>
    {group.unit==='degree'?<span>{t.directionSeries}</span>:<span>{group.min.toFixed(2)}{group.max!==group.min?`–${group.max?.toFixed(2)}`:''} {group.unit}</span>}
    <svg viewBox="0 0 100 24" className="h-6 w-20" role="img" aria-label={`${t.metrics[group.variable]}: ${t.samplePoints}`}><line x1="1" x2="99" y1="23" y2="23" stroke="#c8d6d0"/>{group.values.map((row,i)=><circle key={i} cx={1+(Date.parse(row.valid_time)-start)/86400000*98} cy={21-((row.value as number)-(group.min as number))/Math.max(.001,(group.max as number)-(group.min as number))*18} r="1.8" fill="#145f53"><title>{`${witaTime(row.valid_time)} · ${row.value} ${group.unit}`}</title></circle>)}</svg>
   </>}
  </dd></div>)}</dl>

  <Disclosure summary={t.details}><p className="my-2 text-sm">{t.help}</p>{moon&&<p className="my-2 text-sm">{t.moonSource}: {witaTime(moon.at)} WITA · API {moon.apiVersion}</p>}
   {groups.map(group=><div key={group.variable} className="mb-3 text-sm"><h4 className="my-1 font-semibold">{t.metrics[group.variable]} · {group.unit}</h4>{group.rows.length?<div className="max-h-52 overflow-auto"><table className="w-full text-left"><thead><tr><th>{messages[locale].public.time}</th><th>{t.value}</th><th>{t.provenance}</th></tr></thead><tbody>{group.rows.map((row,i)=><tr key={i} className="border-t border-[#e2e9e5]"><td className="py-1 pr-3">{witaTime(row.valid_time)}</td><td className="py-1 pr-3 tabular-nums">{group.values.includes(row)?row.value:t.invalidSamples}</td><td className="py-1"><span className="block break-words">{row.dataset} · {row.native_resolution??t.unknownResolution}</span><span className="block break-words">{row.issued_at?`${t.issueTime}: ${row.issued_at}`:t.quality.issued_time_unavailable} · {t.retrieved}: {row.retrieved_at}<br/>{row.source_updated_at?`${t.updated}: ${row.source_updated_at}`:t.ageUnknown}<br/>{row.quality_flags.map(flag=>t.quality[flag as keyof typeof t.quality]??t.qualityUnavailable).join(' · ')}</span></td></tr>)}</tbody></table></div>:<p className="my-1">{group.unavailable}</p>}</div>)}
  </Disclosure>
 </section>;
}

export function MoonSummary({moon,locale}:{moon:Moon;locale:Locale}) {
 const t=messages[locale].public.environment;
 const phase=moon?t.phases[moon.phase as keyof typeof t.phases]:null;
 return <div className="flex min-w-0 items-center gap-2 text-sm">{moon&&<MoonDisk moon={moon} label={`${phase} · ${Math.round(moon.illumination*100)}%`}/>}<div><strong className="font-semibold">{t.moon}: </strong>{moon?`${phase} · ${t.illuminated} ${Math.round(moon.illumination*100)}%`:t.moonUnavailable}<span className="block text-xs text-[#49625c]">{t.moonHelp} · <a className="text-[#155f53] underline" href="https://aa.usno.navy.mil/data/api">USNO</a></span></div></div>;
}
