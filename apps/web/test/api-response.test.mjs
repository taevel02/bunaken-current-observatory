import assert from "node:assert/strict";
import test from "node:test";
import { errorEnvelope } from "../src/api/error.mjs";
import { errorResponseHeaders } from "../src/api/error-response.mjs";

test("retryable storage envelopes retain retry state and return safe no-store headers", () => {
  const envelope = errorEnvelope("storage_unavailable", "errors.storageUnavailable", "request-1", true);
  const headers = errorResponseHeaders(45);
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers["Retry-After"], "45");
  assert.equal(envelope.retryable, true);
  assert.equal(envelope.code, "storage_unavailable");
  assert.equal(envelope.message_key, "errors.storageUnavailable");
});
