"use client";

import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n/messages";
import { witaTime, type Locale, type Prediction } from "@/src/public/model";
import { smoothPath } from "@/src/public/chart-curves.mjs";

export type PCISeries = { id: string; name: string; rows: Prediction[]; selected: boolean };

// Each Site keeps its own slots: duplicate, missing and withheld values break its line.
export function PCIChart({ rows, series, day, locale, transfer = false, siteName = "" }: { rows: Prediction[]; series?: PCISeries[]; day: string; locale: Locale; transfer?: boolean; siteName?: string }) {
  const t = messages[locale].public;
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1600);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(280, Math.round(element.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const start = Date.parse(`${day}T08:00:00+08:00`), end = start + 8 * 3600000;
  const groups = (series ?? [{ id: "site", name: siteName, rows, selected: true }]).map(site => {
    const sorted = site.rows.filter(row => Date.parse(row.start_at) >= start && Date.parse(row.start_at) < end).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
    const counts = new Map<number, number>();
    for (const row of sorted) { const at = Date.parse(row.start_at); counts.set(at, (counts.get(at) ?? 0) + 1); }
    const valid = new Set(sorted.filter(row => counts.get(Date.parse(row.start_at)) === 1 && row.pci !== null && Number.isFinite(row.pci) && row.pci >= 0 && row.prediction_status !== "insufficient"));
    return { ...site, sorted, valid };
  });
  const validRows = groups.flatMap(site => [...site.valid]);
  const ceiling = Math.max(1.2, ...validRows.map(row => row.pci as number));
  const height = width < 640 ? 224 : 288;
  const left = 44, right = width - 16, bottom = height - 34;
  const x = (at: string) => left + (Date.parse(at) - start) / (end - start) * (right - left);
  const y = (value: number) => bottom - value / ceiling * (bottom - 24);
  const paths = groups.map(site => {
    const segments: {x:number;y:number}[][] = []; let points: {x:number;y:number}[] = []; let previous: number | null = null;
    for (const row of site.sorted) {
      const at = Date.parse(row.start_at);
      if (!site.valid.has(row) || previous !== null && at - previous !== 1800000) { if (points.length) segments.push(points); points = []; }
      if (site.valid.has(row)) points.push({x:x(row.start_at),y:y(row.pci as number)});
      previous = at;
    }
    if (points.length) segments.push(points);
    return { ...site, segments };
  }).sort((a, b) => Number(a.selected) - Number(b.selected));
  const expected = groups.length * 16;

  return <div ref={container} className="min-w-0">
    <div className="relative"><svg viewBox={`0 0 ${width} ${height}`} className="block h-56 w-full sm:h-72" role="img" aria-label={`${t.pciCurve}: ${validRows.length}/${expected}`}>
      {[0, .2, .4, .6, .8, 1].map(value => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#dce5e0" strokeDasharray={value === 1 ? "4 4" : undefined} /><text x={left - 8} y={y(value) + 5} textAnchor="end" fontSize="14" fill="#49625c">{value.toFixed(1)}</text></g>)}
      {ceiling > 1.2 && <text x={left - 8} y="24" textAnchor="end" fontSize="14" fill="#49625c">{ceiling.toFixed(1)}</text>}
      {[8, 10, 12, 14, 16].map(hour => <text key={hour} x={left + (hour - 8) / 8 * (right - left)} y={height - 6} textAnchor={hour === 8 ? "start" : hour === 16 ? "end" : "middle"} fontSize="14" fill="#49625c">{hour}:00</text>)}
      {paths.map(site => <g key={site.id} opacity={series && !site.selected ? .4 : 1}>
        {site.segments.map((points, index) => <path key={index} d={smoothPath(points)} fill="none" stroke="#145f53" strokeDasharray={transfer && (!series || series.length === 1) ? "6 4" : undefined} strokeWidth={site.selected ? 3 : 1.5}><title>{site.name}</title></path>)}
        {[...site.valid].map(row => <circle key={row.start_at} cx={x(row.start_at)} cy={y(row.pci as number)} r={site.selected ? 4 : 1.5} fill="#145f53"><title>{`${site.name} · ${witaTime(row.start_at)} · PCI ${row.pci?.toFixed(2)} · ${t.support}: ${t.supportLabels[row.support as keyof typeof t.supportLabels] ?? t.insufficient}`}</title></circle>)}
      </g>)}
    </svg>{validRows.length === 0 && <div className="absolute left-12 right-4 top-1/3 grid gap-1 bg-white/95 px-2 py-1 text-center"><strong>{t.allNull}</strong><span className="text-sm text-[#49625c]">{t.pciCurvePending}</span></div>}</div>
  </div>;
}
