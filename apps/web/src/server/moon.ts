import "server-only";
import {cache} from "react";
import {validDay, type Moon} from "@/src/public/model";
import {calculateMoon} from "@/src/server/moon-calculation";

// Astronomical display metadata, independent of forecast snapshots and features.
export const loadMoon = cache(async (day: string, lat: number | null, lon: number | null): Promise<Moon> => {
  if (!validDay(day) || lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const at = `${day}T12:00:00+08:00`;
  return {...calculateMoon(new Date(at)), at, calculationVersion: "astronomy-engine@2.1.19"};
});
