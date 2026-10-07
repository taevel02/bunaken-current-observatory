import "server-only";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { cache } from "react";
import { validateLatest, validatePublicRelease, validatePublicDashboard } from "@bunaken/contracts/validate";
import sourceRegistry from "@config/source-registry.json";
import transferConfig from "@config/site-transfer.json";
import { canonicalTransfer, validTransfer } from "#public/transfer-guard.mjs";
import type { Dashboard } from "@/src/public/model";

const hash = (raw: string | Uint8Array) => createHash("sha256").update(raw).digest("hex");
export const loadPublicRelease = cache(async () => {
  const empty: Dashboard = { forecast_kind: "experimental", sites: [], source_generated_at: null, schema_version: "1.0", generated_at: null, valid_start: null, valid_end: null, predictions: [], tides: [], observations: [], sources: [], anchor_similarity: { value: null, environment_restored: false, validated: false, reason_codes: ["anchor_environment_unavailable"] } };
  const owner = process.env.GITHUB_OWNER, repo = process.env.GITHUB_REPO;
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return { data: empty, releaseId: null, status: "unavailable", reason: "no_release_configured" };
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/data/web/`;
  async function read(path: string) {
    const response = await fetch(base + path, { ...(path === "latest.json" ? { next: { revalidate: 60 } } : { cache: "force-cache" as const }), signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw new Error("release_unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("release_unavailable");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1_250_000) throw new Error("release_unavailable");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks);
  }
  try {
    const pointer = JSON.parse((await read("latest.json")).toString("utf8"));
    if (!validateLatest(pointer)) throw new Error("release_invalid");
    const prefix = `releases/${pointer.release_id}/`;
    const rawManifest = await read(prefix + "manifest.json");
    if (hash(rawManifest) !== pointer.manifest_sha256) throw new Error("release_invalid");
    const manifestInput = JSON.parse(rawManifest.toString("utf8"));
    if (!validatePublicRelease(manifestInput)) throw new Error("release_invalid");
    const manifest = manifestInput as { release_id: string; schema_version: string; status: string; files: {path:string;sha256:string}[]; generated_at: string };
    if (manifest.release_id !== pointer.release_id || manifest.status !== "published" || !(["1.1","1.2"].includes(manifest.schema_version)) || manifest.files.length !== 1 || manifest.files[0].path !== "dashboard.json.gz") throw new Error("release_invalid");
    const raw = await read(prefix + "dashboard.json.gz");
    if (hash(raw) !== manifest.files[0].sha256) throw new Error("release_invalid");
    const payloadInput = JSON.parse(gunzipSync(raw,{maxOutputLength:10_000_000}).toString("utf8"));
    if (!validatePublicDashboard(payloadInput)) throw new Error("release_invalid");
    const payload = payloadInput as Dashboard;
    if (payload.schema_version !== manifest.schema_version || payload.generated_at !== manifest.generated_at || payload.tides.some((row: { variable: string; unit: string }) => row.variable !== "tide_height" || row.unit !== "m") || (payload.anchor_similarity.value !== null && !payload.anchor_similarity.environment_restored)) throw new Error("release_invalid");
    for (const row of [...payload.tides, ...(payload.environment_samples ?? [])]) {
      if (!("source" in row) || !("product" in row) || !("dataset" in row)) throw new Error("release_invalid");
      const source = sourceRegistry.sources.find(item=>item.id===row.source);
      if (!source || !source.redistribution.derived_allowed || !(source.redistribution.public_variables as string[]).includes(row.variable) || row.product!==source.product || row.dataset!==source.dataset || (source.variables as Record<string,string|undefined>)[row.variable]!==row.unit) throw new Error("release_invalid");
    }
    if (payload.environment_samples?.some(row=>row.variable==="tide_height")) throw new Error("release_invalid");
    if (payload.experimental_transfer && !validTransfer(payload.experimental_transfer, transferConfig,
      hash(canonicalTransfer(transferConfig) + "\n"), payload.sites.map(site=>site.id))) throw new Error("release_invalid");
    const data = payload as Dashboard;
    const generatedAge = Date.now() - new Date(data.generated_at as string).getTime();
    if (generatedAge < 0) throw new Error("release_invalid");
    const age = data.source_generated_at ? Date.now() - new Date(data.source_generated_at).getTime() : 0;
    if (age < 0) throw new Error("release_invalid");
    return { data, releaseId: manifest.release_id as string, status: !data.source_generated_at ? "insufficient" : age > 36 * 3600000 ? "stale" : "available", reason: !data.source_generated_at ? "insufficient_numeric_labels" : age > 36 * 3600000 ? "stale_required_source" : null };
  } catch {
    return { data: empty, releaseId: null, status: "unavailable", reason: "release_unavailable" };
  }
});
