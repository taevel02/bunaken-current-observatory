"use client";
import Link from "next/link";
import {useDashboardNavigation} from "@/src/public/dashboard-navigation";
import {useSearchParams,useRouter} from "next/navigation";
import type {FormEvent,MouseEvent,ReactNode} from "react";
import {messages} from "@/i18n/messages";
import {SelectControl} from "@/src/ui/select-control";
import {witaDate,dayOffset,type Locale} from "@/src/public/model";
import {publicUrl} from "@/src/public/urls";
export function DashboardToolbar({locale,day,moon}: {locale:Locale;day:string;moon:ReactNode}) {
  const t=messages[locale].public;
  const navigation=useDashboardNavigation();
  const displayDay=navigation?.pendingDay??day;
  const params=useSearchParams();const router=useRouter();
  const model=params.get("model")==="transfer"?"transfer":"baseline";
  const site=params.get("site");
  const today=witaDate();const days=Array.from({length:8},(_,i)=>dayOffset(today,i));
  const href=(date=day,mode=model)=>publicUrl("",locale,{date,model:mode,...(site?{site}:{})});
  function applyQuery(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    const date=String(values.get("date"));
    const mode=values.get("model")==="transfer"?"transfer":"baseline";
    const target=href(date,mode);
    if(date===day&&!navigation?.pendingDay) {
      window.history.pushState(null,"",target);
    } else if(navigation) {
      navigation.navigate(target,date);
    } else {
      router.push(target);
    }
  }
  function chooseDate(event:MouseEvent<HTMLAnchorElement>,date:string) {
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!navigation)return;
    event.preventDefault();
    navigation.navigate(href(date),date);
  }
  function dateLabel(date:string) {
    if(date===today)return t.today;
    if(date===days[1])return t.tomorrow;
    return date.slice(5);
  }
  return <div className="mb-2 flex flex-wrap items-center justify-between gap-2" data-dashboard-toolbar>
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2"><form className="flex min-w-0 flex-wrap items-center gap-2" method="get" action="/" onSubmit={applyQuery}>
      <input type="hidden" name="lang" value={locale}/>{site&&<input type="hidden" name="site" value={site}/>}
      <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.date}<input className="box-border h-11 rounded-md border border-[#9fb7ae] bg-white px-2 text-base" key={displayDay} name="date" type="date" min={today} max={days[7]} defaultValue={displayDay}/></label>
      <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold">{t.modelMode}<SelectControl className="h-11 min-h-11! py-2!" key={model} name="model" defaultValue={model}><option value="baseline">{t.baselineModel}</option><option value="transfer">{t.transferModel}</option></SelectControl></label>
      <button className="box-border h-11 rounded-md bg-[#145f53] px-4 font-semibold text-white active:translate-y-px">{t.apply}</button>
    </form><nav className="flex flex-wrap gap-1" aria-label={t.date}>{days.map(date=><Link prefetch={false} key={date} href={href(date)} onClick={event=>chooseDate(event,date)} aria-current={date===displayDay?"date":undefined} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-[#155f53] aria-[current=date]:bg-[#e8efec] active:translate-y-px">{dateLabel(date)}</Link>)}</nav></div>{moon}
  </div>;
}
