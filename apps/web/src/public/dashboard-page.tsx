import { countSiteObservations } from "@/src/public/observation-counts";
import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { PublicShell } from "@/src/public/shell";
import { DashboardView } from "@/src/public/dashboard";
import { loadMoon } from "@/src/server/moon";
import { loadPublicRelease } from "@/src/server/public-release";
import { validDay, witaDate, dayOffset } from "@/src/public/model";

export type DashboardQuery = {lang?: string; date?: string; site?: string; model?: string};
export async function DashboardPage({query}: {query: DashboardQuery}) {
  const locale = query.lang === "en" ? "en" : "ko";
  const today = witaDate();
  const day = validDay(query.date) && query.date >= today && query.date <= dayOffset(today, 7) ? query.date : dayOffset(today, 1);
  const state = await loadPublicRelease(day);
  const registry = state.data.sites.length ? state.data.sites : sites;
  const counts = countSiteObservations(state.data.observations);
  const ordered = [...registry].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const selected = registry.find(site => site.id === query.site) ?? ordered[0];
  const modelMode = query.model === "transfer" ? "transfer" : "baseline";
  const moon = await loadMoon(day, selected.lat, selected.lon);
  const preserved = "?" + new URLSearchParams({date: day, site: selected.id, model: modelMode, lang: locale});
  const t = messages[locale].public;
  const status = state.status === "available" ? t.dataAvailable : state.status === "stale" ? t.stale : state.status === "unavailable" ? t.unavailable : t.modelPending;
  const generated = state.data.generated_at ? new Intl.DateTimeFormat(locale, {timeZone: "Asia/Makassar", dateStyle: "short", timeStyle: "short"}).format(new Date(state.data.generated_at)) : t.noGenerated;
  const headerMeta = <div role="status" className="flex flex-wrap items-center gap-x-4 text-sm text-[#49625c]"><strong className="font-medium text-[#18302d]">{status}</strong><span>{t.generated}: {generated}</span></div>;
  return <PublicShell workspace headerMeta={headerMeta} locale={locale} title={messages[locale].public.dashboard} query={preserved}>
    <DashboardView locale={locale} day={day} siteId={selected.id} state={state} moon={moon} modelMode={modelMode}/>
  </PublicShell>;
}
