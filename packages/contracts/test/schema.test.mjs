import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { witaDate, witaLocalToUtc } from "../time.mjs";
import { validateCreateObservation, validateObservationRevision } from "../validate.mjs";
import { resolveSiteId, sites } from "../sites.mjs";

const base = new URL("../", import.meta.url);
test("registered Bunaken Sites have stable unique IDs and resolve display names", () => {
  assert.equal(sites.length, 19);
  assert.equal(new Set(sites.map(site => site.id)).size, 19);
  assert.ok(sites.every(site => resolveSiteId(site.name_en) === site.id && site.lat === null && site.lon === null && site.geometry_status === "unverified"));
  assert.equal(resolveSiteId("Johnson's Wall"), "johnsons-wall");
  assert.equal(resolveSiteId("mikes-point"), "mikes-point");
  assert.equal(resolveSiteId("unregistered-site"), null);
});
const schemaNames = ["create-request", "observation-revision", "source-sample", "snapshot", "prediction", "release", "error-envelope"];
const schemas = await Promise.all(schemaNames.map(async name => JSON.parse(await readFile(new URL(`json-schema/${name}.schema.json`, base), "utf8"))));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);

async function fixture(name) { return JSON.parse(await readFile(new URL(`fixtures/synthetic/${name}.json`, base), "utf8")); }
const legacyTimeSamples = [{ id: "41ea51b8-6e14-474c-8fe4-43b25c98b35c", local_at: "2026-09-27T11:12", at: "2026-09-27T03:12:00.000Z", zone_id: "synthetic-zone", depth_m: 18, temperature_c: 28.4, perceived_pci: 0.7, horizontal_direction: "against_route" }];

test("synthetic observation validates in shared create-request contract", async () => {
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/create-request.schema.json");
  assert.ok(validate);
  assert.equal(validate(await fixture("observation-create")), true, JSON.stringify(validate.errors));
});

test("public observation exporter rejects unknown request fields and validates server revision shape", async () => {
  const request = await fixture("observation-create");
  assert.equal(validateCreateObservation(request).valid, true);
  assert.equal(validateCreateObservation({ ...request, train_eligible: true, notes_private: "secret" }).valid, false);
  const revision = {
    ...request,
    schema_version: "1.2",
    observer_id: "synthetic-alias",
    rubric_version: "pci-overall-v1",
    revision: 1,
    start_at: "2026-09-27T03:00:00.000Z",
    end_at: "2026-09-27T03:20:00.000Z",
    peak_events: request.peak_events.map(event => ({ ...event, at: "2026-09-27T03:10:00.000Z" })),
    time_samples: legacyTimeSamples,
    vertical_onset: null,
    label_scope: "dive_overall",
    record_status: "active",
    created_at: "2026-09-27T03:01:00.000Z",
    updated_at: "2026-09-27T03:01:00.000Z",
    train_eligible: false,
    observed_temperature: null,
  };
  assert.equal(validateObservationRevision(revision).valid, true);
  const newRevision = { ...revision, schema_version: "1.3" };
  delete newRevision.time_samples;
  assert.equal(validateObservationRevision(newRevision).valid, true);
  const correctedLegacyRevision = { ...revision, schema_version: "1.3", revision: 2, record_status: "corrected", correction_reason: "Preserve legacy samples", updated_at: "2026-09-27T03:02:00.000Z" };
  assert.equal(validateObservationRevision(correctedLegacyRevision).valid, true);
  const contextOnlyPeak = { ...revision, peak_events: [{ id: request.peak_events[0].id, local_at: null, at: null, depth_m: null, zone_id: null, pci: null, duration_description: null, context_description: "Current changed near the entrance.", vertical_direction: "unknown", vertical_intensity: null }] };
  assert.equal(validateObservationRevision(contextOnlyPeak).valid, true);
  const emptyPeakRequest = { ...request, peak_events: [{ id: request.peak_events[0].id, local_at: null, at: null, depth_m: null, zone_id: null, pci: null, duration_description: null, context_description: null, vertical_direction: "unknown", vertical_intensity: null }] };
  assert.equal(validateCreateObservation(emptyPeakRequest).valid, false);
  const emptyLegacyPeak = { ...emptyPeakRequest, start_depth_m: 15 };
  assert.equal(validateCreateObservation(emptyLegacyPeak).valid, true);
  const previousRevision = { ...revision, schema_version: "1.1", peak_events: revision.peak_events.map(({ context_description, ...event }) => event) };
  assert.equal(validateObservationRevision(previousRevision).valid, true);
  const missingPeakContext = { ...revision, peak_events: revision.peak_events.map(({ context_description, ...event }) => event) };
  assert.equal(validateObservationRevision(missingPeakContext).valid, false);
  assert.equal(validateObservationRevision({ ...revision, password: "never-public" }).valid, false);
  const legacyRevision = { ...revision, schema_version: "1.0", start_depth_m: 15 };
  delete legacyRevision.route_description;
  delete legacyRevision.vertical_onset;
  delete legacyRevision.time_samples;
  delete legacyRevision.peak_events[0].local_at;
  assert.equal(validateObservationRevision(legacyRevision).valid, true);
});

test("synthetic source sample validates and stale/null remain explicit", async () => {
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/source-sample.schema.json");
  const sample = await fixture("source-sample");
  assert.equal(validate(sample), true, JSON.stringify(validate.errors));
  assert.equal(sample.value, null);
  assert.deepEqual(sample.quality_flags, ["stale"]);
});

test("PCI above one remains valid; unknown and zero are not conflated", async () => {
  const observation = await fixture("observation-create");
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/create-request.schema.json");
  assert.equal(validate(observation), true);
  assert.equal(observation.overall_pci, 1.24);
  assert.equal(observation.vertical.intensity, null);
  assert.deepEqual((await fixture("core")).cases[0].values, { unknown: "unknown", missing: null, none: "none", zero: 0 });
});

test("client-only training and unknown fields are rejected", async () => {
  const observation = await fixture("observation-create");
  observation.train_eligible = true;
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/create-request.schema.json");
  assert.equal(validate(observation), false);
});

test("legacy unsent drafts remain valid while new revisions omit dive start depth", async () => {
  const observation = await fixture("observation-create");
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/create-request.schema.json");
  const legacyDraft = { ...observation, start_depth_m: 15 };
  delete legacyDraft.route_description;
  delete legacyDraft.vertical_onset;
  delete legacyDraft.time_samples;
  legacyDraft.peak_events = [{ id: "26d24fe7-5bc9-4a18-9df0-a602aefc8304", pci: null, vertical_direction: "unknown", vertical_intensity: null }];
  assert.equal(validate(legacyDraft), true);
  const revision = {
    ...observation,
    schema_version: "1.2",
    observer_id: "synthetic-alias",
    rubric_version: "pci-overall-v1",
    revision: 1,
    start_at: "2026-09-27T03:00:00.000Z",
    end_at: "2026-09-27T03:20:00.000Z",
    peak_events: observation.peak_events.map(event => ({ ...event, at: "2026-09-27T03:10:00.000Z" })),
    time_samples: legacyTimeSamples,
    label_scope: "dive_overall",
    record_status: "active",
    created_at: "2026-09-27T03:01:00.000Z",
    updated_at: "2026-09-27T03:01:00.000Z",
    train_eligible: false,
    observed_temperature: null,
  };
  assert.equal(validateObservationRevision({ ...revision, start_depth_m: 15 }).valid, false);
});

test("WITA local timestamps and day grouping match shared cross-midnight vectors", async () => {
  const cases = await fixture("time-cases");
  for (const item of cases) {
    assert.equal(witaLocalToUtc(item.local), item.utc);
    assert.equal(witaDate(item.utc), item.wita_date);
  }
  assert.throws(() => witaLocalToUtc("2026-09-27T11:00:00"), TypeError);
});

test("core enums, units and revision shape are explicit", async () => {
  const sample = await fixture("source-sample");
  assert.equal(sample.unit, "m/s");
  assert.equal(sample.quality_flags.includes("stale"), true);
  const core = await fixture("core");
  assert.equal(core.cases.at(-1).label_scope, "legacy_unspecified");
  assert.equal(core.cases.at(-1).train_eligible, false);
  assert.deepEqual(core.cases.find(item => item.name === "revision-conflict").error_code, "revision_conflict");
  const validateSample = ajv.getSchema("https://bunaken-current-observatory.example/schemas/source-sample.schema.json");
  assert.equal(validateSample({ ...sample, unit: "knots" }), false);
});

test("all schemas compile; locales expose the same translation keys and errors use the contract", async () => {
  for (const name of schemaNames) assert.ok(ajv.getSchema(`https://bunaken-current-observatory.example/schemas/${name}.schema.json`));
  const [ko, en] = await Promise.all([
    readFile(new URL("../../../apps/web/i18n/ko.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../../apps/web/i18n/en.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const keys = value => Object.keys(value).sort().map(key => [key, typeof value[key] === "object" && value[key] !== null ? keys(value[key]) : typeof value[key]]);
  assert.deepEqual(keys(ko), keys(en));
  const validateError = ajv.getSchema("https://bunaken-current-observatory.example/schemas/error-envelope.schema.json");
  assert.equal(validateError({ code: "revision_conflict", message_key: "errors.notFound", field_errors: {}, retryable: false, request_id: "req-1" }), true);
});
