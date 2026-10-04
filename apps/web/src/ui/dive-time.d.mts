export function todayWita(now?: Date): string;
export function addMinutes(local: string, minutes?: number): string;
export function combineDiveTimes(date: string, start: string, end: string, endDay?: number): { local_start: string | null; local_end: string | null };
export function initialDiveTimes(start: string | null | undefined, end: string | null | undefined, today: string): { date: string; start: string; end: string; endDay: number };
