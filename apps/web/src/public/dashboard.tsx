import Link from "next/link";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { SelectControl } from "@/src/ui/select-control";
import { halfDay, witaDate, dayOffset, witaTime, type Locale, type Dashboard, type Prediction, type Moon } from "@/src/public/model";
import { MoonSummary } from "@/src/public/environment-overview";
import { SignalChart } from "@/src/public/signal-chart";
import { comparisonColumns, comparisonTime, sampleAt, signalRows } from "@/src/public/environment-samples";
import { PCIChart } from "@/src/public/pci-chart";
import { publicUrl } from "@/src/public/urls";

type State = {data: Dashboard; status: string; reason: string | null; releaseId: string | null};

export function DashboardView({locale, day, siteId, state, moon = null, modelMode = "baseline"}: {locale: Locale; day: string; siteId: string; state: State; moon?: Moon; modelMode?: "baseline" | "transfer"}) {
  const t = messages[locale].public;
  const registry = state.data.sites.length ? state.data.sites : sites;
  const selected = registry.find(site => site.id === siteId) ?? registry[0];
  const today = witaDate();
  const days = Array.from({length: 8}, (_, i) => dayOffset(today, i));
  const href = (date = day, site = selected.id, mode = modelMode) => publicUrl("", locale, {date, site, model: mode});
  const inHorizon = (row: Prediction) => state.data.valid_start !== null && state.data.valid_end !== null && Date.parse(row.start_at) >= Date.parse(state.data.valid_start) && Date.parse(row.start_at) + 3600000 <= Date.parse(state.data.valid_end);
  const modelRows = modelMode === "transfer" ? state.data.experimental_transfer?.predictions.map(item => item.prediction) ?? [] : state.data.predictions;
  const rows = modelRows.filter(row => row.zone_id === null && witaDate(new Date(row.start_at)) === day).map(row => state.status === "available" && inHorizon(row) ? row : {...row, pci: null});
  const counts = new Map<string, number>();
  const counted = new Set<string>();
  for (const row of state.data.observations) if (row.record_status !== "withdrawn" && !counted.has(row.id)) {
    counted.add(row.id); counts.set(row.site_id, (counts.get(row.site_id) ?? 0) + 1);
  }
  const ordered = [...registry].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const at = comparisonTime(state.data, day, registry);
  const name = (site: typeof selected) => locale === "ko" ? site.name_ko : site.name_en;
  const format = (value: number | null) => value === null ? t.noValue : value.toFixed(2);
  const environmentValue = (site: typeof selected, variable: string, source: string, unit: string) => {
    if (state.status !== "available") return t.noValue;
    const row = sampleAt(state.data, day, at, site.id, site.reference_depth_m, variable, source, unit);
    return row?.value === null || !row ? t.noValue : row.value.toFixed(unit === "degree" ? 0 : 2);
  };
  const status = state.status === "available" ? t.dataAvailable : state.status === "stale" ? t.stale : state.status === "unavailable" ? t.unavailable : t.modelPending;
  const curveRows = rows.filter(row => row.site_id === selected.id);
  const signals = (metric: "current" | "tide") => [{id: selected.id, name: name(selected), rows: state.status === "available" ? signalRows(state.data, day, selected.id, selected.reference_depth_m, metric).filter(row => state.data.valid_start && state.data.valid_end && Date.parse(row.at) >= Date.parse(state.data.valid_start) && Date.parse(row.at) <= Date.parse(state.data.valid_end)) : []}];
  const numericRows = curveRows.filter(row => row.pci !== null);
  const supportRanks = ["insufficient", "very_low", "low", "medium", "high"];
  const support = numericRows.length ? supportRanks[Math.min(...numericRows.map(row => Math.max(0, supportRanks.indexOf(row.support))))] : "insufficient";
  const reasons = [...new Set(curveRows.flatMap(row => row.reason_codes))];
  const generated = state.data.generated_at ? new Intl.DateTimeFormat(locale, {timeZone: "Asia/Makassar", dateStyle: "short", timeStyle: "short"}).format(new Date(state.data.generated_at)) : t.noGenerated;

  return <>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <form className="flex min-w-0 flex-wrap items-center gap-2" method="get" action="/">
        <input type="hidden" name="lang" value={locale}/><input type="hidden" name="site" value={selected.id}/>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.date}<input className="min-h-11 rounded-md border border-[#9fb7ae] bg-white px-2 text-base" name="date" type="date" min={today} max={days[7]} defaultValue={day}/></label>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.modelMode}<SelectControl name="model" defaultValue={modelMode}><option value="baseline">{t.baselineModel}</option><option value="transfer">{t.transferModel}</option></SelectControl></label>
        <button className="min-h-11 rounded-md bg-[#145f53] px-4 font-semibold text-white active:translate-y-px">{t.apply}</button>
      </form>
      <nav className="flex flex-wrap gap-1" aria-label={t.date}>{days.map(date => <Link key={date} href={href(date)} aria-current={date === day ? "date" : undefined} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-[#155f53] aria-[current=date]:bg-[#e8efec] active:translate-y-px">{date === today ? t.today : date === days[1] ? t.tomorrow : date.slice(5)}</Link>)}</nav>
      {moon && <MoonSummary moon={moon} locale={locale}/>}
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-[#49625c]" role="status">
      <div className="flex flex-wrap gap-x-3"><strong className="font-medium text-[#18302d]">{status}</strong><span>{t.experimental} · {t.forecastUnvalidated} · WITA · {selected.reference_depth_m}m</span></div><span>{t.generated}: {generated}</span>
      {state.reason === "date_history_unavailable" && <span>{t.dateHistoryUnavailable}</span>}{state.reason === "outside_source_horizon" && <span>{t.dateUnavailable}</span>}
    </div>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-dashboard-workspace>
      <section className="min-w-0" aria-label={t.siteComparison}>
        <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{t.siteComparison}</h2><span className="text-sm text-[#49625c]">{at ? `${t.environmentAt} ${witaTime(at)} WITA` : t.environmentTimeUnavailable}</span></div>
        <div className="max-h-[44dvh] min-w-0 overflow-auto border-y border-[#c8d6d0] focus-visible:outline-2 xl:max-h-[calc(100dvh-210px)]" role="region" aria-label={t.siteComparison} tabIndex={0}>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead><tr>{[t.site, t.dataCount, t.morning, t.afternoon, `${t.eastwardCurrent} (m/s)`, `${t.northwardCurrent} (m/s)`, `${t.environment.metrics.wind_direction_10m} (°)`, `${t.environment.metrics.wave_height} (m)`].map((label, index) => <th key={label} scope="col" className={`sticky top-0 z-10 bg-[#e8efec] px-3 py-2 font-semibold ${index ? "text-right" : "left-0 z-20 text-left"}`}>{label}</th>)}</tr></thead>
            <tbody>{ordered.map(site => {
              const siteRows = rows.filter(row => row.site_id === site.id);
              const summaries = [halfDay(siteRows, day, 8), halfDay(siteRows, day, 12)];
              return <tr key={site.id} className={`border-t border-[#dce5e0] ${site.id === selected.id ? "bg-[#e8efec]" : "bg-white"}`}>
                <th scope="row" className={`sticky left-0 z-10 px-3 text-left font-medium ${site.id === selected.id ? "bg-[#e8efec]" : "bg-white"}`}><Link href={href(day, site.id)} aria-current={site.id === selected.id ? "true" : undefined} className="flex min-h-11 items-center whitespace-nowrap text-base text-[#155f53] underline-offset-4 hover:underline active:translate-y-px">{name(site)}</Link></th>
                <td className="px-3 text-right tabular-nums">{counts.get(site.id) ?? 0}</td>
                {summaries.map((summary, index) => <td key={index} className="whitespace-nowrap px-3 text-right tabular-nums" title={`${summary.count}/8`}>{format(summary.median)}</td>)}
                {comparisonColumns.map(([variable, source, unit]) => <td key={variable} className="whitespace-nowrap px-3 text-right tabular-nums">{environmentValue(site, variable, source, unit)}</td>)}
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      <section className="min-w-0" aria-label={t.selectedSite}>
        <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold">{name(selected)}</h2><span className="text-sm text-[#49625c]">{selected.reference_depth_m}m · WITA</span></div>
        <div className="border-y border-[#c8d6d0] py-2"><div className="mb-1 flex justify-between gap-2"><h3 className="m-0 text-base font-semibold">{t.pciCurve}</h3><span className="text-sm tabular-nums">{numericRows.length}/16 · {t.supportLabels[support as keyof typeof t.supportLabels]}</span></div>
          {modelMode === "transfer" && <p className="my-1 text-sm text-[#705229]">{state.data.experimental_transfer ? t.transferNotice : t.transferPending}</p>}
          <PCIChart rows={curveRows} day={day} locale={locale} transfer={modelMode === "transfer"} siteName={name(selected)}/>
          {reasons.length > 0 && <p className="my-1 text-sm text-[#49625c]">{reasons.map(code => t.reasonLabels[code as keyof typeof t.reasonLabels] ?? t.unknownReason).join(" · ")}</p>}
        </div>
        {(["current", "tide"] as const).map(metric => <div key={metric} className="border-b border-[#c8d6d0] py-2"><div className="mb-1 flex justify-between gap-2"><h3 className="m-0 text-base font-semibold">{metric === "current" ? t.currentCurve : t.tide}</h3><span className="text-sm">{metric === "current" ? "m/s" : "m"}</span></div><SignalChart series={signals(metric)} day={day} metric={metric} locale={locale} compact/></div>)}
      </section>
    </div>
  </>;
}
