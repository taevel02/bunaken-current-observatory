import "server-only";
import { cache } from "react";
import { validDay, type Moon } from "@/src/public/model";

const phases = new Set(["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"]);
// Astronomical display metadata, independent of forecast snapshots and model features.
export const loadMoon = cache(async (day: string, lat: number | null, lon: number | null): Promise<Moon> => {
  if (!validDay(day) || lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  try {
    const url = new URL("https://aa.usno.navy.mil/api/rstt/oneday");
    url.search = new URLSearchParams({ date: day, coords: `${lat},${lon}`, tz: "8" }).toString();
    const response = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000), redirect: "error" });
    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 16000) return null;
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const data = payload.properties?.data;
    if (!data || `${data.year}-${String(data.month).padStart(2,"0")}-${String(data.day).padStart(2,"0")}` !== day || data.tz !== 8 || data.isdst !== false || !phases.has(data.curphase) || typeof data.fracillum !== "string" || !/^\d+(?:\.\d+)?%$/.test(data.fracillum) || typeof payload.apiversion !== "string") return null;
    const illumination = Number(data.fracillum.slice(0,-1)) / 100;
    if (!Number.isFinite(illumination) || illumination < 0 || illumination > 1) return null;
    return { phase: data.curphase, illumination, at: `${day}T12:00:00+08:00`, retrievedAt: new Date().toISOString(), apiVersion: payload.apiversion };
  } catch { return null; }
});
