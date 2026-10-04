const DAY_MS = 86400000;
const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export function todayWita(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addMinutes(local, minutes = 50) {
  if (!MINUTE.test(local)) return '';
  const date = new Date(`${local}:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== local) return '';
  return new Date(date.getTime() + minutes * 60000).toISOString().slice(0, 16);
}
export function combineDiveTimes(date, start, end, endDay = 0) {
  const localStart = date && start ? `${date}T${start}` : null;
  const shifted = date ? addMinutes(`${date}T00:00`, Number(endDay) * DAY_MS / 60000).slice(0, 10) : '';
  return { local_start: localStart, local_end: shifted && end ? `${shifted}T${end}` : null };
}
export function initialDiveTimes(start, end, today) {
  return { date: start?.slice(0, 10) || today, start: start?.slice(11, 16) || '', end: end?.slice(11, 16) || '',
    endDay: start && end ? Math.round((Date.parse(`${end.slice(0, 10)}T00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00Z`)) / DAY_MS) : 0 };
}
