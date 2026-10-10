import {Suspense} from "react";
import {comparisonColumns} from "@/src/public/environment-samples";
import {MoonSummary} from "@/src/public/environment-overview";
import {LoadingBlock} from "@/src/public/loading-block";
import {DashboardSkeleton} from "@/src/public/loading-skeleton";
import {DashboardToolbar} from "@/src/public/dashboard-toolbar";
import { countSiteObservations } from "@/src/public/observation-counts";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { PublicShell } from "@/src/public/shell";
import { DashboardView } from "@/src/public/dashboard";
import { loadMoon } from "@/src/server/moon";
import { loadPublicRelease } from "@/src/server/public-release";
import { validDay, witaDate, dayOffset } from "@/src/public/model";

export type DashboardQuery = {lang?: string; date?: string; site?: string; model?: string};
export function DashboardPage({query}: {query: DashboardQuery}) {
  const locale = query.lang === "en" ? "en" : "ko";
  const today = witaDate();
  const day = validDay(query.date) && query.date >= today && query.date <= dayOffset(today, 7) ? query.date : dayOffset(today, 1);
  const modelMode = query.model === "transfer" ? "transfer" : "baseline";
  const preserved = "?" + new URLSearchParams({date:day,model:modelMode,lang:locale,...(query.site?{site:query.site}:{})});
  const moonSite=sites.find(site=>site.id===query.site)??sites[0];
  const moon=<Suspense fallback={<div className="flex items-center gap-2 text-sm"><strong>{messages[locale].public.environment.moon}:</strong><LoadingBlock className="h-4 w-28" label={messages[locale].public.loadingMoon}/></div>}><DashboardMoon day={day} locale={locale} lat={moonSite.lat} lon={moonSite.lon}/></Suspense>;
  return <PublicShell workspace headerMeta={<Suspense fallback={<span role="status" className="text-sm text-[#49625c]">{messages[locale].public.loadingData}</span>}><DashboardStatus day={day} locale={locale}/></Suspense>} locale={locale} title={messages[locale].public.dashboard} query={preserved}>
    <DashboardToolbar locale={locale} day={day} moon={moon}/>
    <Suspense key={`${locale}:${day}:${modelMode}`} fallback={<DashboardSkeleton locale={locale} day={day} siteId={query.site} modelMode={modelMode}/>}><DashboardData query={query} locale={locale} day={day} modelMode={modelMode}/></Suspense>
  </PublicShell>;
}

async function DashboardData({query,locale,day,modelMode}: {query:DashboardQuery;locale:"ko"|"en";day:string;modelMode:"baseline"|"transfer"}) {
  const state = await loadPublicRelease(day);
  const registry = state.data.sites.length ? state.data.sites : sites;
  const counts = countSiteObservations(state.data.observations);
  const ordered = [...registry].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const selected = registry.find(site => site.id === query.site) ?? ordered[0];
  const onDay = (at: string) => witaDate(new Date(at)) === day;
  const data = {...state.data, predictions: state.data.predictions.filter(row => onDay(row.start_at)), tides: state.data.tides.filter(row => onDay(row.valid_time)), environment_samples: state.data.environment_samples?.filter(row => onDay(row.valid_time) && comparisonColumns.some(([variable, source, unit]) => row.variable === variable && row.source === source && row.unit === unit) && (!row.source.startsWith("copernicus-") || row.depth_m === registry.find(site => site.id === row.site_id)?.reference_depth_m)), ...(state.data.experimental_transfer ? {experimental_transfer: {...state.data.experimental_transfer, predictions: state.data.experimental_transfer.predictions.filter(row => onDay(row.prediction.start_at))}} : {})};
  return <DashboardView key={`${locale}:${day}:${modelMode}`} locale={locale} day={day} siteId={selected.id} state={{...state,data}} modelMode={modelMode}/>;
}

async function DashboardStatus({day,locale}: {day:string;locale:"ko"|"en"}) {
  const state=await loadPublicRelease(day);
  const t = messages[locale].public;
  const status = state.status === "available" ? t.dataAvailable : state.status === "stale" ? t.stale : state.status === "unavailable" ? t.unavailable : t.modelPending;
  const generated = state.data.generated_at ? new Intl.DateTimeFormat(locale, {timeZone: "Asia/Makassar", dateStyle: "short", timeStyle: "short"}).format(new Date(state.data.generated_at)) : t.noGenerated;
  const headerMeta = <div role="status" className="flex flex-wrap items-center gap-x-4 text-sm text-[#49625c]"><strong className="font-medium text-[#18302d]">{status}</strong><span>{t.generated}: {generated}</span></div>;
  return headerMeta;
}

async function DashboardMoon({day, locale, lat, lon}: {day: string; locale: "ko" | "en"; lat: number | null; lon: number | null}) {
  const moon = await loadMoon(day, lat, lon);
  return moon ? <MoonSummary moon={moon} locale={locale}/> : null;
}
