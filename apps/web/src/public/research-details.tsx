import { messages } from "@/i18n/messages";
import { sites } from "@bunaken/contracts/sites";
import { headingClass, sectionClass } from "@/src/public/shell";
import { witaDate, type Dashboard, type Locale } from "@/src/public/model";

type State = { data: Dashboard; status: string; reason: string | null; releaseId: string | null };

export function ResearchDetails({ state, locale, day }: { state: State; locale: Locale; day: string }) {
  const t = messages[locale].public;
  const stamp = (at: string | null) => at ? new Intl.DateTimeFormat(locale, { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short" }).format(new Date(at)) : t.noGenerated;
  const registry = state.data.sites.length ? state.data.sites : sites;
  const reason = (code: string) => t.reasonLabels[code as keyof typeof t.reasonLabels] ?? t.unknownReason;
  const siteReasons = registry.map(site => {
    const rows = state.data.predictions.filter(row => row.site_id === site.id && row.zone_id === null && witaDate(new Date(row.start_at)) === day);
    const outside = rows.some(row => state.data.valid_start === null || state.data.valid_end === null || Date.parse(row.start_at) < Date.parse(state.data.valid_start) || Date.parse(row.start_at) + 3600000 > Date.parse(state.data.valid_end));
    const codes = [...new Set([...(state.reason ? [state.reason] : []), ...(state.status === "stale" ? ["stale_required_source"] : []), ...(!rows.length ? ["missing_required_features"] : []), ...(outside ? ["outside_source_horizon"] : []), ...rows.flatMap(row => row.reason_codes)])];
    return { site, codes };
  });
  return <>
    <section className={`${sectionClass} grid gap-2`}><h2 className={`${headingClass} mb-0`}>{t.readGraph}</h2><p className="m-0">{t.graphHelp}</p><p className="m-0">{t.pciReferenceMarker}</p><p className="m-0">{t.environmentComparisonHelp}</p><p className="m-0">{t.environment.help}</p></section>
    <section className={`${sectionClass} grid gap-2`}><h2 className={`${headingClass} mb-0`}>{t.methodology}</h2>{[t.method1, t.method2, t.method3, t.method4, t.method5].map(text => <p key={text} className="m-0">{text}</p>)}</section>
    <section className={`${sectionClass} grid gap-2`}><h2 className={`${headingClass} mb-0`}>{t.anchor}</h2><p className="m-0">{t.anchorHelp}</p><p className="m-0">{state.data.anchor_similarity.value === null || !state.data.anchor_similarity.environment_restored ? t.similarityUnavailable : `${t.similarity}: ${state.data.anchor_similarity.value.toFixed(2)} · ${t.similarityUnvalidated}`}</p></section>
    <section className={sectionClass}><h2 className={headingClass}>{t.reasons} · {day} WITA</h2><ul className="m-0 grid gap-2 pl-5">{siteReasons.map(({ site, codes }) => <li key={site.id}><strong>{locale === "ko" ? site.name_ko : site.name_en}</strong>: {codes.length ? [...new Set(codes.map(reason))].join(" · ") : t.noDisplayBlockers}</li>)}</ul></section>
    <section className={`${sectionClass} grid gap-2`}><h2 className={`${headingClass} mb-0`}>{t.releaseDetails}</h2><p className="m-0">{t.snapshotModeHelp}</p><dl className="m-0 grid gap-2"><div><dt>{t.generated}</dt><dd className="m-0">{stamp(state.data.generated_at)}</dd></div><div><dt>{t.sourceGenerated}</dt><dd className="m-0">{stamp(state.data.source_generated_at)}</dd></div><div><dt>{t.release}</dt><dd className="m-0 break-all">{state.releaseId ?? t.noGenerated}</dd></div></dl></section>
    <section className={sectionClass}><h2 className={headingClass}>{t.source}</h2>{state.data.sources.length === 0 ? <p className="m-0">{t.sourcesMissing}</p> : state.data.sources.map(source => <article key={source.id} className="grid min-w-0 gap-2 border-t border-[#c8d6d0] py-3"><h3 className="m-0 break-all text-base">{source.dataset}</h3><p className="m-0">{source.version ?? t.unverified} · {source.public_export_allowed ? t.exportAllowed : t.exportPending}</p><p className="m-0 break-words text-sm">{source.attribution}</p><a className="inline-flex min-h-11 items-center text-[#155f53] underline" href={/^https:\/\//.test(source.license_url) ? source.license_url : undefined} rel="noopener noreferrer">{t.license}</a></article>)}</section>
  </>;
}
