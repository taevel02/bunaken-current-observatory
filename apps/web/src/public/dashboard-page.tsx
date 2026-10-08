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
  const counts = new Map<string, number>();
  for (const row of state.data.observations) if (row.record_status !== "withdrawn") counts.set(row.site_id, (counts.get(row.site_id) ?? 0) + 1);
  const ordered = [...registry].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const selected = registry.find(site => site.id === query.site) ?? ordered[0];
  const modelMode = query.model === "transfer" ? "transfer" : "baseline";
  const moon = await loadMoon(day, selected.lat, selected.lon);
  const preserved = "?" + new URLSearchParams({date: day, site: selected.id, model: modelMode, lang: locale});
  return <PublicShell locale={locale} title={messages[locale].public.dashboard} query={preserved}>
    <DashboardView locale={locale} day={day} siteId={selected.id} state={state} moon={moon} modelMode={modelMode}/>
  </PublicShell>;
}
