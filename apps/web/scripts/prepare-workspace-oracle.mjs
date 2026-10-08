import { registerHooks } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { witaDate, dayOffset } from "../src/public/model.ts";
import { comparisonTime, sampleAt } from "../src/public/environment-samples.ts";
import { countSiteObservations } from "../src/public/observation-counts.ts";

const destination = process.argv[2];
if (!destination) throw new Error("usage: prepare-workspace-oracle.mjs <new-output.json> [WITA-date]");
const root = new URL("../../../", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@config/")) return {url: new URL("config/" + specifier.slice(8), root).href, shortCircuit: true};
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(new URL("config/", root).href) && url.endsWith(".json")) return {format: "module", shortCircuit: true, source: "export default " + readFileSync(fileURLToPath(url), "utf8")};
    return next(url, context);
  },
});
try {
  const {loadPublicRelease} = await import("../src/server/public-release.ts");
  const first = process.argv[3] || witaDate();
  const oracle = [];
  for (let offset = 0; offset < 3; offset++) {
    const day = dayOffset(first, offset);
    const state = await loadPublicRelease(day);
    if (state.status !== "available") throw new Error("live_package_unavailable");
    const counts = countSiteObservations(state.data.observations);
    const site = [...state.data.sites].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
    const at = comparisonTime(state.data, day, state.data.sites);
    const u = sampleAt(state.data, day, at, site.id, site.reference_depth_m, "uo", "copernicus-currents", "m/s")?.value;
    const v = sampleAt(state.data, day, at, site.id, site.reference_depth_m, "vo", "copernicus-currents", "m/s")?.value;
    if (!at || u === null || u === undefined || v === null || v === undefined) throw new Error("live_environment_unavailable");
    const numeric = state.data.predictions.filter(row => row.site_id === site.id && row.zone_id === null && witaDate(new Date(row.start_at)) === day && row.pci !== null && row.prediction_status !== "insufficient").length;
    oracle.push({day, site: site.id, numeric, at, u, v, release: state.releaseId});
  }
  writeFileSync(destination, JSON.stringify(oracle, null, 2) + "\n", {flag: "wx"});
  process.stdout.write(JSON.stringify({days: oracle.length, source: "validated live public packages"}) + "\n");
} finally { hooks.deregister(); }
