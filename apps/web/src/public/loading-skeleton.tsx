import {messages} from "@/i18n/messages";
import {PublicShell} from "@/src/public/shell";
import type {Locale} from "@/src/public/model";
export function LoadingBlock({className, label}: {className: string; label?: string}) {
  return <div className={`rounded bg-[#e8efec] motion-safe:animate-pulse ${className}`} aria-hidden={label ? undefined : true} role={label ? "status" : undefined} aria-label={label}/>;
}
export function DashboardSkeleton({locale}: {locale: Locale}) {
  const t = messages[locale].public;
  return <PublicShell locale={locale} title={t.dashboard} workspace><div role="status" aria-busy="true" data-loading-skeleton="dashboard"><span className="sr-only">{t.loadingData}</span><div aria-hidden="true"><div className="mb-4 flex flex-wrap gap-3">{[40,44,24].map((width,i)=><LoadingBlock key={i} className={`h-11 ${width===40?'w-40':width===44?'w-44':'w-24'}`}/>)}</div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"><div><LoadingBlock className="mb-3 h-6 w-40"/><div className="max-h-[44dvh] overflow-hidden xl:max-h-none">{Array.from({length:19},(_,i)=><div key={i} className="flex h-11 items-center gap-5 border-b border-[#dce5e0] px-3"><LoadingBlock className="h-4 w-32"/>{[0,1,2,3].map(j=><LoadingBlock key={j} className="h-4 w-12"/>)}</div>)}</div></div><div className="grid gap-4">{[0,1,2].map(i=><div key={i}><LoadingBlock className="mb-3 h-6 w-40"/><LoadingBlock className="h-44 w-full"/></div>)}</div></div></div></div></PublicShell>;
}
export function ResearchSkeleton({locale}: {locale: Locale}) {
  return <PublicShell locale={locale} title={messages[locale].public.research} path="/research"><div role="status" aria-busy="true" data-loading-skeleton="research"><span className="sr-only">{messages[locale].public.loadingData}</span><div aria-hidden="true" className="mx-auto max-w-[90ch]"><LoadingBlock className="my-4 h-11 w-72"/>{Array.from({length:12},(_,i)=><LoadingBlock key={i} className={`my-3 h-5 ${i%4===3?'w-2/3':'w-full'}`}/>)}</div></div></PublicShell>;
}
