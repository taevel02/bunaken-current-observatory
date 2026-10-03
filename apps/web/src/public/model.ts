import type { RegisteredSite } from "@bunaken/contracts/sites";
export type Locale = "ko" | "en";
export type Prediction = {
  site_id: string; zone_id: string | null; start_at: string; pci: number | null;
  reference_depth_m: number | null; reason_codes: string[]; support: string;
  prediction_status: string; model_version: string;
};
export type Tide = { site_id?: string; zone_id?: string | null; valid_time: string; value: number | null; quality_flags: string[]; unit: string; variable: string };
export type EnvironmentSample = Tide & {
 source: string; dataset: string; product: string; version: string | null;
 source_updated_at?: string | null; depth_m: number | null; issued_at: string | null; retrieved_at: string;
 native_resolution: string | null;
 interpolation_method: string | null; grid_distance_km?: number;
};
export type Moon = { phase: string; illumination: number; at: string; retrievedAt: string; apiVersion: string } | null;
export type Observation = { id: string; site_id: string; local_start: string; overall_pci: number; record_status: string; label_scope: string; notes_public?: string; revision: number };
export type Dashboard = {
  forecast_kind: "experimental"; sites: RegisteredSite[]; source_generated_at: string | null; schema_version: string; generated_at: string | null; valid_start: string | null; valid_end: string | null;
  predictions: Prediction[]; tides: Tide[]; environment_samples?: EnvironmentSample[]; observations: Observation[];
  sources: { id: string; dataset: string; version: string | null; attribution: string; license_url: string; public_export_allowed: boolean; reason_codes: string[] }[];
  anchor_similarity: { value: number | null; environment_restored: boolean; validated: false; reason_codes: string[] };
};
export const witaDate = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export function dayOffset(day: string, offset: number) {
  return witaDate(new Date(new Date(`${day}T00:00:00+08:00`).getTime() + offset * 86400000));
}
export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && witaDate(date) === value;
}
export function witaTime(at: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}
export function halfDay(rows: Prediction[], day: string, startHour: number) {
  const expected = Array.from({length: 8}, (_,i) => new Date(`${day}T${String(startHour).padStart(2,"0")}:00:00+08:00`).getTime()+i*1800000);
  const slots = expected.map(time => rows.filter(row => new Date(row.start_at).getTime() === time));
  const valid = slots.flatMap(matches => matches.length === 1 && matches[0].pci !== null && Number.isFinite(matches[0].pci) && matches[0].pci >= 0 && matches[0].prediction_status !== "insufficient" ? matches : []);
  const numbers = valid.map(row => row.pci as number).sort((a,b)=>a-b);
  const middle = Math.floor(numbers.length/2);
  const median = numbers.length >= 6 ? numbers.length%2 ? numbers[middle] : (numbers[middle-1]+numbers[middle])/2 : null;
  const strongest = valid.reduce<Prediction | null>((best,row)=>best === null || (row.pci as number) > (best.pci as number) ? row : best,null);
  const ranks=["insufficient","very_low","low","medium","high"];
  const support=valid.length ? ranks[Math.min(...valid.map(row=>Math.max(0,ranks.indexOf(row.support))))] : "insufficient";
  return {median,count:valid.length,total:8,max:strongest?.pci ?? null,maxSupport:strongest?.support ?? "insufficient",support,partial:valid.length<8};
}
