"use client";

import {useEffect,useRef,useState} from "react";
import {smoothPath,timeSegments} from "@/src/public/chart-curves.mjs";
import {messages} from "@/i18n/messages";
import {witaTime,type Locale} from "@/src/public/model";

export type SignalSeries={id:string;name:string;rows:{at:string;value:number|null}[]};
export function SignalChart({series,day,metric,locale}:{series:SignalSeries[];day:string;metric:"current"|"tide";locale:Locale}){
 const t=messages[locale].public;
 const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1600);
 useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(()=>setWidth(Math.max(280,Math.round(element.getBoundingClientRect().width))));observer.observe(element);return()=>observer.disconnect();},[]);
 const start=Date.parse(`${day}T08:00:00+08:00`),end=start+8*3600000;
 const visible=series.map(site=>({...site,segments:timeSegments(site.rows.filter(row=>Date.parse(row.at)>=start&&Date.parse(row.at)<=end),metric==="current"?360:30)}));
 const points=visible.flatMap(site=>site.segments.flat());
 const min=metric==="current"?0:Math.min(0,...points.map(p=>p.value)),max=Math.max(metric==="current"?.1:.5,...points.map(p=>p.value));
 const height=width<640?224:288,left=52,right=width-16,bottom=height-34;
 const x=(at:string)=>left+(Date.parse(at)-start)/(end-start)*(right-left),y=(value:number)=>bottom-(value-min)/(max-min)*(bottom-24);
 const colors=["#145f53","#9b5b29","#385b91","#9c466c","#576f30","#76613e"];
 return <div ref={container} className="relative min-w-0"><svg viewBox={`0 0 ${width} ${height}`} className="block h-56 w-full sm:h-72" role="img" aria-label={`${metric==='current'?t.currentCurve:t.tide}: ${points.length}`}>
  {Array.from({length:5},(_,i)=>min+(max-min)*i/4).map(value=><g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#dce5e0"/><text x={left-8} y={y(value)+5} textAnchor="end" fontSize="14" fill="#49625c">{value.toFixed(2)}</text></g>)}
  {[8,10,12,14,16].map(hour=><text key={hour} x={left+(hour-8)/8*(right-left)} y={height-6} textAnchor={hour===8?'start':hour===16?'end':'middle'} fontSize="14" fill="#49625c">{hour}:00</text>)}
  {visible.map((site,index)=><g key={site.id}>{site.segments.map((segment,i)=><path key={i} d={smoothPath(segment.map(p=>({x:x(p.at),y:y(p.value)})))} stroke={colors[index%colors.length]} strokeWidth={series.length===1?3:1.5} fill="none"><title>{site.name}</title></path>)}{site.segments.flat().map(point=><circle key={point.at} cx={x(point.at)} cy={y(point.value)} r={series.length===1?4:2.5} fill={colors[index%colors.length]}><title>{`${site.name} · ${witaTime(point.at)} · ${point.value.toFixed(2)} ${metric==='current'?'m/s':'m'}`}</title></circle>)}</g>)}
 </svg>{points.length===0&&<div className="absolute left-14 right-4 top-1/3 bg-white/95 py-1 text-center text-sm">{t.noData}</div>}<p className="mb-0 mt-2 text-sm text-[#49625c]">{metric==='current'?t.currentCurveHelp:t.tideHelp} · {t.signalCurveHelp}</p></div>;
}
