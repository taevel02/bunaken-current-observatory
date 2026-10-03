import { messages } from "@/i18n/messages";
import { witaTime, type Locale, type Prediction } from "@/src/public/model";

// Only existing model output is drawn. Missing slots break the line.
export function PCIChart({rows,day,locale}:{rows:Prediction[];day:string;locale:Locale}) {
 const t=messages[locale].public;
 const start=Date.parse(`${day}T08:00:00+08:00`),end=start+8*3600000;
 const sorted=rows.filter(row=>Date.parse(row.start_at)>=start&&Date.parse(row.start_at)<end).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
 const valid=sorted.filter(row=>sorted.filter(candidate=>Date.parse(candidate.start_at)===Date.parse(row.start_at)).length===1&&row.pci!==null&&Number.isFinite(row.pci)&&row.pci>=0&&row.prediction_status!=='insufficient');
 const ceiling=Math.max(1.2,...valid.map(row=>row.pci as number));
 const x=(at:string)=>48+(Date.parse(at)-start)/(end-start)*700;
 const y=(value:number)=>230-value/ceiling*190;
 const segments:string[]=[];let points:string[]=[];let previous:number|null=null;
 for(const row of sorted){
  const at=Date.parse(row.start_at);
  if(!valid.includes(row)||previous!==null&&at-previous!==1800000){if(points.length)segments.push(points.join(' '));points=[];}
  if(valid.includes(row))points.push(`${x(row.start_at)},${y(row.pci as number)}`);
  previous=at;
 }
 if(points.length)segments.push(points.join(' '));
 return <div>
  <div className="relative"><svg viewBox="0 0 800 275" className="block min-h-44 w-full max-h-44" role="img" aria-label={`${t.pciCurve}: ${valid.length}/16`}>
   {[0,.2,.4,.6,.8,1].filter(value=>value<=ceiling).map(value=><g key={value}><line x1="48" x2="748" y1={y(value)} y2={y(value)} stroke="#dce5e0" strokeDasharray={value===1?'4 4':undefined}/><text x="38" y={y(value)+5} textAnchor="end" fontSize="20" fill="#49625c">{value.toFixed(1)}</text></g>)}
   {ceiling>1.2&&<text x="38" y="36" textAnchor="end" fontSize="20" fill="#49625c">{ceiling.toFixed(1)}</text>}
   {[8,10,12,14,16].map(hour=><text key={hour} x={48+(hour-8)/8*700} y="258" textAnchor={hour===8?'start':hour===16?'end':'middle'} fontSize="20" fill="#49625c">{hour}:00</text>)}
   {segments.map((points,i)=><polyline key={i} points={points} fill="none" stroke="#145f53" strokeWidth="3"/>)}
   {valid.map(row=><circle key={row.start_at} cx={x(row.start_at)} cy={y(row.pci as number)} r="4" fill="#145f53"><title>{witaTime(row.start_at)} · PCI {row.pci?.toFixed(2)} · {t.support}: {t.supportLabels[row.support as keyof typeof t.supportLabels]??t.insufficient}</title></circle>)}
  </svg>{valid.length===0&&<div className="absolute inset-x-8 top-1/4 grid gap-1 bg-white/95 px-2 py-1 text-center"><strong>{t.allNull}</strong><span className="text-sm text-[#49625c]">{t.pciCurvePending}</span></div>}</div>
  <p className="m-0 text-sm text-[#49625c]">{t.curveHelp} · {t.coverage}: {valid.length}/16</p>
  {valid.length>0&&<details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-[#155f53]">{t.viewData}</summary><div className="max-h-52 overflow-auto"><table className="w-full text-left"><thead><tr><th>{t.time}</th><th className="text-right">PCI</th><th className="text-right">{t.support}</th></tr></thead><tbody>{sorted.map(row=><tr key={row.start_at} className="border-t border-[#c8d6d0]"><td className="py-2">{witaTime(row.start_at)}</td><td className="text-right tabular-nums">{valid.includes(row)?row.pci?.toFixed(2):t.noData}</td><td className="text-right">{t.supportLabels[row.support as keyof typeof t.supportLabels]??t.insufficient}</td></tr>)}</tbody></table></div></details>}
 </div>;
}
