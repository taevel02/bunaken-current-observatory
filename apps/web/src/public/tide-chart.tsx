import { Disclosure } from "@/src/ui/disclosure";
import { messages } from "@/i18n/messages";
import { witaTime, type Locale, type Tide } from "@/src/public/model";

export function TideChart({ rows, locale }: {rows: Tide[]; locale: Locale}) {
 const t=messages[locale].public;
 const sorted=[...rows].sort((a,b)=>Date.parse(a.valid_time)-Date.parse(b.valid_time));
 const values=sorted.filter(row=>row.value!==null && Number.isFinite(row.value) && !row.quality_flags.includes('fes_undefined') && !row.quality_flags.includes('fes_extrapolation_rejected'));
 if (values.length<2) return <p className="my-1 text-sm">{t.noData}</p>;
 const min=Math.min(...values.map(row=>row.value as number)),max=Math.max(...values.map(row=>row.value as number));
 const start=Date.parse(sorted[0].valid_time),end=Date.parse(sorted[sorted.length-1].valid_time);
 const x=(at:string)=>50+(Date.parse(at)-start)/Math.max(1,end-start)*520;
 const y=(value:number)=>180-(value-min)/Math.max(.01,max-min)*140;
 const segments: string[]=[]; let points: string[]=[]; let previous=0;
 for (const row of sorted) {
   const at=Date.parse(row.valid_time);
   if (row.value===null || !Number.isFinite(row.value) || row.quality_flags.includes('fes_undefined') || row.quality_flags.includes('fes_extrapolation_rejected') || (previous && at-previous>1800000)) {
     if(points.length) segments.push(points.join(' '));points=[];
   }
   if(values.includes(row)) points.push(`${x(row.valid_time)},${y(row.value as number)}`);
   previous=at;
 }
 if(points.length) segments.push(points.join(' '));
 return <div className="min-w-0"><svg viewBox="0 0 620 225" className="block w-full max-h-32" role="img" aria-label={t.tide}>
  <line x1="50" x2="570" y1="180" y2="180" stroke="#9aafa7"/>
  <text x="4" y="45" fill="#49625c" fontSize="22">{max.toFixed(2)}</text><text x="4" y="185" fill="#49625c" fontSize="22">{min.toFixed(2)}</text>
  {segments.map((points,i)=><polyline key={i} points={points} fill="none" stroke="#145f53" strokeWidth="3"/>)}
  <text x="50" y="215" fill="#49625c" fontSize="22">{witaTime(sorted[0].valid_time)}</text><text x="570" y="215" textAnchor="end" fill="#49625c" fontSize="22">{witaTime(sorted[sorted.length-1].valid_time)}</text>
 </svg><Disclosure summary={t.viewData}><div className="max-h-80 overflow-auto"><table className="w-full border-collapse"><caption className="text-left">{t.tide}</caption><thead><tr><th className="py-2 text-left">{t.time}</th><th className="py-2 text-right">m</th></tr></thead><tbody>{sorted.map(row=><tr key={row.valid_time} className="border-t border-[#c8d6d0]"><td className="py-2">{witaTime(row.valid_time)}</td><td className="py-2 text-right tabular-nums">{values.includes(row)?row.value?.toFixed(2):t.noData}</td></tr>)}</tbody></table></div></Disclosure></div>;
}
