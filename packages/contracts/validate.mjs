import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import createRequestSchema from "./json-schema/create-request.schema.json" with { type: "json" };
import observationRevisionSchema from "./json-schema/observation-revision.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(createRequestSchema);
ajv.addSchema(observationRevisionSchema);

export function validateCreateObservation(value) {
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/create-request.schema.json");
  const valid = validate(value);
  return { valid, errors: validate.errors ?? [] };
}

export function validateObservationRevision(value) {
  const validate = ajv.getSchema("https://bunaken-current-observatory.example/schemas/observation-revision.schema.json");
  const valid = validate(value);
  return { valid, errors: validate.errors ?? [] };
}

import predictionSchema from "./json-schema/prediction.schema.json" with { type: "json" };
import sampleSchema from "./json-schema/source-sample.schema.json" with { type: "json" };
import dashboardSchema from "./json-schema/dashboard.schema.json" with { type: "json" };
import releaseSchema from "./json-schema/release.schema.json" with { type: "json" };
import latestSchema from "./json-schema/latest.schema.json" with { type: "json" };
import experimentalTransferSchema from "./json-schema/experimental-transfer.schema.json" with { type: "json" };
for (const schema of [predictionSchema, sampleSchema, experimentalTransferSchema, dashboardSchema, releaseSchema, latestSchema]) ajv.addSchema(schema);
export const validatePublicDashboard = ajv.compile(dashboardSchema);
export const validatePublicRelease = ajv.compile(releaseSchema);
export const validateLatest = ajv.compile(latestSchema);

import researchReleaseSchema from "./json-schema/research-release.schema.json" with { type: "json" };
import researchResultsSchema from "./json-schema/research-results.schema.json" with { type: "json" };
export const validateResearchRelease = ajv.compile(researchReleaseSchema);
export const validateResearchResults = ajv.compile(researchResultsSchema);
