"use client";

import { useState } from "react";
import { addMinutes, combineDiveTimes, initialDiveTimes } from "@/src/ui/dive-time.mjs";

type Times = { local_start: string | null; local_end: string | null };
export function DiveTimeFields({ prefix, initialStart, initialEnd, today, text: t, onChange }: {
  prefix: string; initialStart?: string | null; initialEnd?: string | null; today: string;
  text: Record<string, string>; onChange?: (times: Times) => void;
}) {
  const [times, setTimes] = useState(() => initialDiveTimes(initialStart, initialEnd, today));
  const [manualEnd, setManualEnd] = useState(Boolean(initialEnd));
  const local = combineDiveTimes(times.date, times.start, times.end, times.endDay);
  function update(next: typeof times) {
    setTimes(next); onChange?.(combineDiveTimes(next.date, next.start, next.end, next.endDay));
  }
  function startChanged(start: string) {
    const next = { ...times, start };
    if (!manualEnd) {
      const end = addMinutes(`${times.date}T${start}`);
      next.end = end.slice(11, 16); next.endDay = end && end.slice(0, 10) !== times.date ? 1 : 0;
    }
    update(next);
  }
  return <div className="grid min-w-0 gap-3">
    <label className="grid min-w-0 gap-2">{t.date}<input name={`${prefix}_date`} type="date" required value={times.date} onChange={(event) => update({ ...times, date: event.target.value })} /></label>
    <div className="grid min-w-0 grid-cols-1 min-[400px]:grid-cols-2 items-start gap-3">
      <label className="grid min-w-0 gap-2">{t.startTime}<input name={`${prefix}_start_time`} type="time" required value={times.start} onChange={(event) => startChanged(event.target.value)} /></label>
      <label className="grid min-w-0 gap-2">{t.endTime}<input name={`${prefix}_end_time`} type="time" required value={times.end} onChange={(event) => { setManualEnd(true); update({ ...times, end: event.target.value }); }} /></label>
    </div>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
      <span>{t.defaultDiveTime}</span>
      <label className="!flex min-h-11 items-center gap-2 !font-normal"><input name={`${prefix}_end_day`} type="hidden" value={times.endDay} /><input type="checkbox" className="size-5 shrink-0" checked={times.endDay > 0} onChange={(event) => update({ ...times, endDay: event.target.checked ? 1 : 0 })} />{t.nextDayEnd}</label>
    </div>
    {times.endDay > 0 && <small>{t.endDate}: {local.local_end?.slice(0, 10)}</small>}
    {local.local_start && local.local_end && local.local_end <= local.local_start && <p className="m-0 text-sm text-[#8c3026]" role="alert">{t.endBeforeStart}</p>}
  </div>;
}
