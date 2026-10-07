import type { ResearchResults as Results } from "@bunaken/contracts/research";
import { messages } from "@/i18n/messages";
export function ResearchResults({results,locale}:{results:Results;locale:"ko"|"en"}) {
  const t=messages[locale].research;
  const keys=["lodo_mae","lodo_global_baseline_mae","lodo_site_baseline_mae"] as const;
  const rows=keys.map(key=>({key,value:results.metrics[key]})).filter(row=>typeof row.value==="number"&&row.value>=0);
  const maximum=Math.max(...rows.map(row=>row.value as number),.001);
  return <section className="my-5 border-t border-[#c8d6d0] pt-3"><h3 className="m-0 text-lg font-semibold">{t.results}</h3>
    {!results.operational_forecast&&<p className="my-2 text-sm">{t.diagnostic}</p>}
    {rows.length>0&&<figure className="my-3 max-w-xl"><figcaption className="mb-2 text-sm">{t.lodoComparison}</figcaption>{rows.map(row=><div key={row.key} className="mb-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><span className="text-sm">{t.metricLabels[row.key]}</span><span className="text-right text-sm tabular-nums">{row.value?.toFixed(5)}</span><div className="col-span-2 h-2 bg-[#edf3f0]"><div className="h-2 bg-[#54736a]" style={{width:`${(row.value as number)/maximum*100}%`}}/></div></div>)}</figure>}
    <details><summary className="min-h-11 cursor-pointer text-sm font-semibold">{t.resultTable}</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{Object.entries(results.metrics).map(([key,value])=><tr key={key}><th scope="row" className="border-b border-[#c8d6d0] py-2 pr-3 font-normal">{t.metricLabels[key as keyof typeof t.metricLabels]??key}</th><td className="border-b border-[#c8d6d0] py-2 text-right tabular-nums">{value===null?"null":String(value)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
