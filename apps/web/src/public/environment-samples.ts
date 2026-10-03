import type { Dashboard, EnvironmentSample } from "@/src/public/model";

const rejected = new Set(["geometry_unverified", "land_cell", "grid_distance_exceeded", "outside_depth_range", "outside_time_range", "unverified_geometry", "grid_too_far", "source_age_unknown", "source_time_in_future", "stale_required_source"]);

export function environmentSamples(data: Dashboard, day: string, siteId: string, depth: number | null, variable: string, source: string, unit: string) {
  const start = Date.parse(`${day}T00:00:00+08:00`), end = start + 86400000;
  const rows = (data.environment_samples ?? []).filter(row => {
    if (row.site_id !== siteId || (row.zone_id ?? null) !== null || row.variable !== variable || row.source !== source || row.unit !== unit || row.depth_m !== (source.startsWith("copernicus-") ? depth : null)) return false;
    const at = Date.parse(row.valid_time);
    return at >= start && at < end;
  }).sort((a, b) => Date.parse(a.valid_time) - Date.parse(b.valid_time));
  const provider = data.sources.find(item => item.id === source);
  const values = provider?.public_export_allowed && !provider.reason_codes.length ? rows.filter(row => row.value !== null && Number.isFinite(row.value) && !row.quality_flags.some(flag => rejected.has(flag))) : [];
  return { rows, values, provider };
}

// A comparison uses the same actual timestamp for every Site, without nearest-cell/time substitution.
export function noonSample(data: Dashboard, day: string, siteId: string, depth: number | null, variable: string, source: string, unit: string): EnvironmentSample | null {
  const { rows, values } = environmentSamples(data, day, siteId, depth, variable, source, unit);
  const at = Date.parse(`${day}T12:00:00+08:00`);
  const matches = rows.filter(row => Date.parse(row.valid_time) === at);
  return matches.length === 1 && values.includes(matches[0]) ? matches[0] : null;
}
