import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { witaDate, witaLocalToUtc } from "../time.mjs";

const base = new URL("../", import.meta.url);
const schemaNames = ["create-request", "observation-revision", "source-sample", "snapshot", "prediction", "release", "error-envelope"];
const schemas = await Promise.all(schemaNames.map(async name => JSON.parse(await readFile(new URL(`json-schema/${name}.schema.json`, base), "utf8"))));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);

async function fixture(name) { return JSON.parse(await readFile(new URL(`fixtures/synthetic/${name}.json`, base), "utf8")); }

test("synthetic observation validates in shared create-request contract", async () => {
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/create-request.schema.json");
  assert.ok(validate);
  assert.equal(validate(await fixture("observation-create")), true, JSON.stringify(validate.errors));
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
