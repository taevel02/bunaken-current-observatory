const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function witaLocalToUtc(local) {
  if (!LOCAL_MINUTE.test(local)) throw new TypeError("Expected WITA local minute YYYY-MM-DDTHH:mm");
  const date = new Date(`${local}:00+08:00`);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid WITA date-time");
  return date.toISOString().replace(".000Z", "Z");
}

export function witaDate(instant) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid instant");
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
