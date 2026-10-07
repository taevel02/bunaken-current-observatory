import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { registerHooks } from "node:module";
import process from "node:process";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = (raw) => createHash("sha256").update(raw).digest("hex");

test("generated release reaches the production reader with integrity and stale guards", { skip: !process.env.BUNAKEN_PUBLIC_RELEASE_DIR }, async () => {
  const directory = resolve(process.env.BUNAKEN_PUBLIC_RELEASE_DIR);
  const pointerBytes = readFileSync(resolve(directory, "web/latest.json"));
  const pointer = JSON.parse(pointerBytes);
  const prefix = `releases/${pointer.release_id}/`;
  const manifestBytes = readFileSync(resolve(directory, "web", prefix, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const compressed = readFileSync(resolve(directory, "web", prefix, "dashboard.json.gz"));
  const payload = JSON.parse(gunzipSync(compressed));
  assert.equal(hash(manifestBytes), pointer.manifest_sha256);
  assert.equal(hash(compressed), manifest.files[0].sha256);
  assert.ok(compressed.length <= 1_250_000);
  assert.ok(gunzipSync(compressed).length <= 10_000_000);
  assert.equal(payload.sites.length, 19);
  assert.ok(payload.observations.length > 0);
  assert.ok(payload.predictions.length > 0);
  function assertPublic(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!["notes_private", "password", "token", "raw_idempotency_key", "model_context"].includes(key));
      assertPublic(item);
    }
  }
  assertPublic(payload);
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@config/site-transfer.json") return { url: "bunaken-test:site-transfer", format: "module", shortCircuit: true };
      if (specifier === "@config/source-registry.json") return { url: "bunaken-test:source-registry", format: "module", shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === "bunaken-test:site-transfer") return { format: "module", shortCircuit: true, source: `export default ${readFileSync(resolve(root, "config/site-transfer.json"), "utf8")}` };
      if (url === "bunaken-test:source-registry") return { format: "module", shortCircuit: true, source: `export default ${readFileSync(resolve(root, "config/source-registry.json"), "utf8")}` };
      return next(url, context);
    },
  });
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  const originalOwner = process.env.GITHUB_OWNER, originalRepo = process.env.GITHUB_REPO;
  const base = "https://raw.githubusercontent.com/synthetic-reader/fixture/data/web/";
  let files = new Map([["latest.json", pointerBytes], [prefix + "manifest.json", manifestBytes], [prefix + "dashboard.json.gz", compressed]]);
  try {
    process.env.GITHUB_OWNER = "synthetic-reader"; process.env.GITHUB_REPO = "fixture";
    globalThis.fetch = async (url) => {
      assert.ok(String(url).startsWith(base), "unexpected network request");
      const bytes = files.get(String(url).slice(base.length));
      return new globalThis.Response(bytes ?? "", { status: bytes ? 200 : 404 });
    };
    const { loadPublicRelease } = await import(pathToFileURL(resolve(root, "apps/web/src/server/public-release.ts")));
    const loaded = await loadPublicRelease();
    const sourceAge = originalNow() - Date.parse(payload.source_generated_at);
    assert.equal(loaded.status, sourceAge > 36 * 3600000 ? "stale" : "available");
    assert.equal(loaded.releaseId, pointer.release_id);
    assert.deepEqual(loaded.data, payload);
    for (const path of [prefix + "manifest.json", prefix + "dashboard.json.gz"]) {
      const prior = files.get(path); files.set(path, Buffer.concat([prior, Buffer.from("tampered")]));
      assert.equal((await loadPublicRelease()).status, "unavailable"); files.set(path, prior);
    }
    // Recomputed hashes cannot authorize an unlicensed provider variable.
    const altered = globalThis.structuredClone(payload);
    assert.ok(altered.environment_samples.length > 0);
    altered.environment_samples[0].variable = "synthetic-forbidden-variable";
    const badBytes = gzipSync(JSON.stringify(altered));
    const badManifest = Buffer.from(JSON.stringify({ ...manifest, files: [{ path: "dashboard.json.gz", sha256: hash(badBytes) }] }));
    const cleanFiles = files;
    files = new Map([["latest.json", Buffer.from(JSON.stringify({ ...pointer, manifest_sha256: hash(badManifest) }))], [prefix + "manifest.json", badManifest], [prefix + "dashboard.json.gz", badBytes]]);
    assert.equal((await loadPublicRelease()).status, "unavailable"); files = cleanFiles;
    if (payload.experimental_transfer) {
      const tampered=globalThis.structuredClone(payload);
      const numeric=tampered.experimental_transfer.predictions.find(item=>item.prediction.pci!==null);
      assert.ok(numeric, "generated fixture must exercise a numeric transfer");
      numeric.donor_site_count=1;
      const bytes=gzipSync(JSON.stringify(tampered));
      const info=Buffer.from(JSON.stringify({...manifest,files:[{path:"dashboard.json.gz",sha256:hash(bytes)}]}));
      files=new Map([["latest.json",Buffer.from(JSON.stringify({...pointer,manifest_sha256:hash(info)}))],[prefix+"manifest.json",info],[prefix+"dashboard.json.gz",bytes]]);
      assert.equal((await loadPublicRelease()).status,"unavailable");files=cleanFiles;
    }
    Date.now = () => Math.max(Date.parse(payload.source_generated_at) + 37 * 3600000, Date.parse(payload.generated_at)) + 1;
    assert.equal((await loadPublicRelease()).status, "stale");
    Date.now = () => Date.parse(payload.generated_at) - 1;
    assert.equal((await loadPublicRelease()).status, "unavailable");
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    for (const [key, value] of [["GITHUB_OWNER", originalOwner], ["GITHUB_REPO", originalRepo]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    hooks.deregister();
  }
});
