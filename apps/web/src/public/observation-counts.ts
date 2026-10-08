import type { Observation } from "@/src/public/model";

export function countSiteObservations(observations: Observation[], {distinctIds = false}: {distinctIds?: boolean} = {}) {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const observation of observations) {
    if (observation.record_status === "withdrawn") continue;
    if (distinctIds) {
      if (seen.has(observation.id)) continue;
      seen.add(observation.id);
    }
    counts.set(observation.site_id, (counts.get(observation.site_id) ?? 0) + 1);
  }
  return counts;
}
