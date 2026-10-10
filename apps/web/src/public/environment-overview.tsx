import { messages } from "@/i18n/messages";
import type { Locale, Moon } from "@/src/public/model";

function MoonDisk({moon,label}:{moon:NonNullable<Moon>;label:string}) {
 const radius=Math.abs(1-2*moon.illumination)*18;
 const sweep=moon.illumination<.5?0:1;
 const waning=moon.phase.startsWith("Waning")||moon.phase==="Last Quarter";
 return <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" role="img" aria-label={label}><circle cx="20" cy="20" r="18" fill="#18302d"/><g transform={waning?'translate(40 0) scale(-1 1)':undefined}><path d={`M20 2 A18 18 0 0 1 20 38 A${Math.max(.001,radius)} 18 0 0 ${sweep} 20 2 Z`} fill="#f5efcf"/></g><circle cx="20" cy="20" r="18" fill="none" stroke="#9fb7ae"/></svg>;
}

export function MoonSummary({moon,locale}:{moon:Moon;locale:Locale}) {
 const t=messages[locale].public.environment;
 const phase=moon?t.phases[moon.phase as keyof typeof t.phases]:null;
 return <div data-moon-date={moon?.at.slice(0,10)} className="flex min-w-0 items-center gap-2 text-sm">{moon&&<MoonDisk moon={moon} label={`${phase} · ${Math.round(moon.illumination*100)}%`}/>}<div><strong className="font-semibold">{t.moon}: </strong>{moon?`${phase} · ${t.illuminated} ${Math.round(moon.illumination*100)}%`:t.moonUnavailable}</div></div>;
}
