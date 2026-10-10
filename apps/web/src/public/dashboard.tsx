"use client";

import { countSiteObservations } from "@/src/public/observation-counts";
import {useMemo, useEffect, type MouseEvent} from "react";
import {useSearchParams} from "next/navigation";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import {LoadingBlock,LoadingChart} from "@/src/public/loading-block";
import { halfDay, witaDate, witaTime, type Locale, type Dashboard, type Prediction } from "@/src/public/model";
import { SignalChart } from "@/src/public/signal-chart";
import { comparisonColumns, comparisonTime, sampleAt, signalRows } from "@/src/public/environment-samples";
import { PCIChart } from "@/src/public/pci-chart";
import { publicUrl } from "@/src/public/urls";

type State = {data: Dashboard; status: string; reason: string | null; releaseId: string | null};

export function DashboardView({locale, day, siteId, state, loading = false, modelMode = "baseline"}: {locale: Locale; day: string; siteId: string; state: State; loading?: boolean; modelMode?: "baseline" | "transfer"}) {
  const t = messages[locale].public;
  const registry = state.data.sites.length ? state.data.sites : sites;
  const params = useSearchParams();
  const activeModel = params.has("model") ? params.get("model") === "transfer" ? "transfer" : "baseline" : modelMode;
  const selected = registry.find(site => site.id === params.get("site")) ?? registry.find(site => site.id === siteId) ?? registry[0];
  useEffect(() => {
    if (loading || registry.some(site=>site.id===params.get("site"))) return;
    window.history.replaceState(null,"",publicUrl("",locale,{date:day,site:selected.id,model:activeModel}));
  },[loading,registry,params,locale,day,selected.id,activeModel]);
  const chooseSite = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, "", event.currentTarget.href);
  };
  const href = (date = day, site = selected.id, mode = activeModel) => publicUrl("", locale, {date, site, model: mode});
  const inHorizon = (row: Prediction) => state.data.valid_start !== null && state.data.valid_end !== null && Date.parse(row.start_at) >= Date.parse(state.data.valid_start) && Date.parse(row.start_at) + 3600000 <= Date.parse(state.data.valid_end);
  const modelRows = activeModel === "transfer" ? state.data.experimental_transfer?.predictions.map(item => item.prediction) ?? [] : state.data.predictions;
  const rows = modelRows.filter(row => row.zone_id === null && witaDate(new Date(row.start_at)) === day).map(row => state.status === "available" && inHorizon(row) ? row : {...row, pci: null});
  const counts = countSiteObservations(state.data.observations, {distinctIds: true});
  const ordered = [...registry].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const at = useMemo(() => comparisonTime(state.data, day, registry), [state.data, day, registry]);
  const name = (site: typeof selected) => locale === "ko" ? site.name_ko : site.name_en;
  const format = (value: number | null) => value === null ? t.noValue : value.toFixed(2);
  const environmentValue = (site: typeof selected, variable: string, source: string, unit: string) => {
    if (state.status !== "available") return t.noValue;
    const row = sampleAt(state.data, day, at, site.id, site.reference_depth_m, variable, source, unit);
    return row?.value === null || !row ? t.noValue : row.value.toFixed(unit === "degree" ? 0 : 2);
  };
  const curveRows = rows.filter(row => row.site_id === selected.id);
  const signals = (metric: "current" | "tide") => [{id: selected.id, name: name(selected), rows: state.status === "available" ? signalRows(state.data, day, selected.id, selected.reference_depth_m, metric).filter(row => state.data.valid_start && state.data.valid_end && Date.parse(row.at) >= Date.parse(state.data.valid_start) && Date.parse(row.at) <= Date.parse(state.data.valid_end)) : []}];
  const numericRows = curveRows.filter(row => row.pci !== null);
  const supportRanks = ["insufficient", "very_low", "low", "medium", "high"];
  const support = numericRows.length ? supportRanks[Math.min(...numericRows.map(row => Math.max(0, supportRanks.indexOf(row.support))))] : "insufficient";
  const reasons = [...new Set(curveRows.flatMap(row => row.reason_codes))];
  const credits = [...new Map(state.data.sources.map(source => [source.attribution + source.license_url, source])).values()];

  return <>
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#49625c]">
      <span>{t.experimental} · {t.forecastUnvalidated} · WITA · {selected.reference_depth_m}m</span>
      {state.reason === "date_history_unavailable" && <span>{t.dateHistoryUnavailable}</span>}{state.reason === "outside_source_horizon" && <span>{t.dateUnavailable}</span>}
    </div>
    <div className="grid min-w-0 items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-dashboard-workspace={loading ? undefined : true} data-dashboard-pending={loading ? true : undefined} aria-busy={loading}>
      <section className="min-w-0 xl:flex xl:h-full xl:min-h-0 xl:flex-col" aria-label={t.siteComparison}>
        <div className="mb-1 flex min-h-8 flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{t.siteComparison}</h2><span className="text-sm text-[#49625c]">{loading ? <LoadingBlock className="h-4 w-44"/> : at ? `${t.environmentAt} ${witaTime(at)} WITA` : t.environmentTimeUnavailable}</span></div>
        <div className="max-h-[44dvh] min-w-0 overflow-auto border-y border-[#c8d6d0] focus-visible:outline-2 xl:max-h-none xl:min-h-0 xl:flex-1" role="region" aria-label={t.siteComparison} tabIndex={0}>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead><tr>{[t.site, t.dataCount, t.morning, t.afternoon, `${t.eastwardCurrent} (m/s)`, `${t.northwardCurrent} (m/s)`, `${t.environment.metrics.wind_direction_10m} (°)`, `${t.environment.metrics.wave_height} (m)`].map((label, index) => <th key={label} scope="col" className={`sticky top-0 z-10 bg-[#e8efec] px-3 py-2 font-semibold ${index ? "text-right" : "left-0 z-20 text-left"}`}>{label}</th>)}</tr></thead>
            <tbody>{ordered.map(site => {
              const siteRows = rows.filter(row => row.site_id === site.id);
              const summaries = [halfDay(siteRows, day, 8), halfDay(siteRows, day, 12)];
              return <tr key={site.id} className={`border-t border-[#dce5e0] ${site.id === selected.id && (!loading || params.get("site") === site.id) ? "bg-[#e8efec]" : "bg-white"}`}>
                <th scope="row" className={`sticky left-0 z-10 px-3 text-left font-medium ${site.id === selected.id && (!loading || params.get("site") === site.id) ? "bg-[#e8efec]" : "bg-white"}`}><a href={href(day, site.id)} onClick={chooseSite} aria-current={site.id === selected.id && (!loading || params.get("site") === site.id) ? "true" : undefined} className="flex min-h-11 items-center whitespace-nowrap text-base text-[#155f53] underline-offset-4 hover:underline active:translate-y-px">{name(site)}</a></th>
                {loading ? Array.from({length:7},(_,i)=><td key={i} className="px-3 text-right"><LoadingBlock className="h-4 w-12"/></td>) : <>
                <td className="px-3 text-right tabular-nums">{counts.get(site.id) ?? 0}</td>
                {summaries.map((summary, index) => <td key={index} className="whitespace-nowrap px-3 text-right tabular-nums" title={`${summary.count}/8`}>{format(summary.median)}</td>)}
                {comparisonColumns.map(([variable, source, unit]) => <td key={variable} className="whitespace-nowrap px-3 text-right tabular-nums">{environmentValue(site, variable, source, unit)}</td>)}
                </>}

              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      <section className="min-w-0 xl:h-full xl:min-h-0 xl:overflow-y-auto" aria-label={t.selectedSite}>
        <div className="mb-1 flex min-h-8 flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{loading && !registry.some(site=>site.id===params.get("site")) ? t.selectedSite : name(selected)}</h2><span className="text-sm text-[#49625c]">{selected.reference_depth_m}m · WITA</span></div>
        <div className="grid gap-4"><div className="border-t border-[#c8d6d0] pt-2"><div className="mb-2 flex justify-between gap-2"><h3 className="m-0 text-base font-semibold">{t.pciCurve}</h3><span className="text-sm tabular-nums">{loading ? <LoadingBlock className="h-4 w-28"/> : `${numericRows.length}/16 · ${t.supportLabels[support as keyof typeof t.supportLabels]}`}</span></div>
          {!loading && activeModel === "transfer" && <p className="my-1 text-sm text-[#705229]">{state.data.experimental_transfer ? t.transferNotice : t.transferPending}</p>}
          {loading ? <LoadingChart label={t.loadingData}/> : <PCIChart rows={curveRows} day={day} locale={locale} transfer={activeModel === "transfer"} siteName={name(selected)}/>}
          {reasons.length > 0 && <p className="my-1 text-sm text-[#49625c]">{reasons.map(code => t.reasonLabels[code as keyof typeof t.reasonLabels] ?? t.unknownReason).join(" · ")}</p>}
        </div>
        {(["current", "tide"] as const).map(metric => <div key={metric} className="border-t border-[#c8d6d0] pt-2"><div className="mb-2 flex justify-between gap-2"><h3 className="m-0 text-base font-semibold">{metric === "current" ? t.currentCurve : t.tide}</h3><span className="text-sm">{metric === "current" ? "m/s" : "m"}</span></div>{loading ? <LoadingChart label={t.loadingData}/> : <SignalChart series={signals(metric)} day={day} metric={metric} locale={locale} compact/>}</div>)}
        </div>
      </section>
    </div>
    {credits.length > 0 && <footer className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#c8d6d0] pt-1 text-sm leading-5 text-[#49625c]" aria-label={t.source}>{credits.map(source => <a key={source.id} href={/^https:\/\//.test(source.license_url) ? source.license_url : undefined} title={source.attribution} rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[#155f53] underline-offset-4 hover:underline active:translate-y-px">{source.attribution.split(";")[0]}{source.attribution.includes("CC BY 4.0") ? " · CC BY 4.0" : ""}</a>)}</footer>}
  </>;
}
