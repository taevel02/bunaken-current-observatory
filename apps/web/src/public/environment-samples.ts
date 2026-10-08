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

// Every column and Site uses one actual provider timestamp; no nearest-row substitution.
export function comparisonTime(data: Dashboard, day: string, sites: {id: string; reference_depth_m: number | null}[]): string | null {
  let common: Set<string> | undefined;
  const columns = [["uo", "copernicus-currents", "m/s"], ["vo", "copernicus-currents", "m/s"],
    ["wind_direction_10m", "open-meteo-wind", "degree"], ["wave_height", "open-meteo-wave", "m"]];
  for (const site of sites) for (const [variable, source, unit] of columns) {
    const { rows } = environmentSamples(data, day, site.id, site.reference_depth_m, variable, source, unit);
    const times = new Set(rows.map(row => new Date(row.valid_time).toISOString()));
    common = common === undefined ? times : new Set([...common].filter(at => times.has(at)));
    if (!common.size) return null;
  }
  const noon = Date.parse(`${day}T12:00:00+08:00`);
  return [...(common ?? [])].sort((a, b) => Math.abs(Date.parse(a) - noon) - Math.abs(Date.parse(b) - noon) || Date.parse(a) - Date.parse(b))[0] ?? null;
}

export function sampleAt(data: Dashboard, day: string, at: string | null, siteId: string, depth: number | null, variable: string, source: string, unit: string): EnvironmentSample | null {
  if (!at) return null;
  const { rows, values } = environmentSamples(data, day, siteId, depth, variable, source, unit);
  const matches = rows.filter(row => Date.parse(row.valid_time) === Date.parse(at));
  return matches.length === 1 && values.includes(matches[0]) ? matches[0] : null;
}

export function signalRows(data: Dashboard, day: string, siteId: string, depth: number | null, metric: "current" | "tide") {
  if (metric === "tide") {
    const provider=data.sources.find(item=>item.id==="fes-height");
    const source=data.tides.filter(row=>row.site_id===siteId&&(row.zone_id??null)===null)
      .filter(row=>Date.parse(row.valid_time)>=Date.parse(`${day}T00:00:00+08:00`)&&Date.parse(row.valid_time)<Date.parse(`${day}T00:00:00+08:00`)+86400000);
    return source.map(row=>({at:row.valid_time,value:provider?.public_export_allowed&&!provider.reason_codes.length&&
      !row.quality_flags.some(flag=>rejected.has(flag)||flag==='fes_undefined'||flag==='fes_extrapolation_rejected')?row.value:null}));
  }
  const east=environmentSamples(data,day,siteId,depth,"uo","copernicus-currents","m/s");
  const north=environmentSamples(data,day,siteId,depth,"vo","copernicus-currents","m/s");
  const times=[...new Set([...east.rows,...north.rows].map(row=>Date.parse(row.valid_time)))].sort((a,b)=>a-b);
  return times.map(at=>{
    const u=east.rows.filter(row=>Date.parse(row.valid_time)===at),v=north.rows.filter(row=>Date.parse(row.valid_time)===at);
    return {at:new Date(at).toISOString(),value:u.length===1&&v.length===1&&east.values.includes(u[0])&&north.values.includes(v[0])?
      Math.hypot(u[0].value as number,v[0].value as number):null};
  });
}
