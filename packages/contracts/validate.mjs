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
