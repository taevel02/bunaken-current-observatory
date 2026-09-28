import assert from "node:assert/strict";
import test from "node:test";
import { GitHubDataError } from "../src/server/github-data-store.mjs";
import { ObservationStorageError } from "../src/server/observation-transaction.mjs";
import { mapStorageError } from "../src/server/storage-error.mjs";

test("expired PAT and missing Contents permission map to distinct non-retryable storage errors", () => {
  const expired = mapStorageError(new GitHubDataError("provider_auth_failed", 401));
  const denied = mapStorageError(new GitHubDataError("provider_permission_denied", 403));
  assert.deepEqual([expired.status, expired.code, expired.retryable], [503, "storage_auth_failed", false]);
  assert.deepEqual([denied.status, denied.code, denied.retryable], [503, "storage_permission_denied", false]);
  assert.equal(expired.messageKey, denied.messageKey);
});

test("provider outage, rate limit and Git ref conflict expose retryability without provider details", () => {
  const outage = mapStorageError(new GitHubDataError("provider_unavailable", 503, true));
  const rateLimit = mapStorageError(new GitHubDataError("provider_rate_limited", 429, true, 90));
  const branchConflict = mapStorageError(new GitHubDataError("branch_conflict", 409, true));
  assert.deepEqual([outage.status, outage.code, outage.retryable], [503, "storage_unavailable", true]);
  assert.deepEqual([rateLimit.status, rateLimit.code, rateLimit.retryable, rateLimit.retryAfter], [503, "storage_rate_limited", true, 90]);
  assert.deepEqual([branchConflict.status, branchConflict.code, branchConflict.retryable], [409, "branch_conflict", true]);
});

test("same-key body conflicts and stale observation revisions are not retryable", () => {
  const idem = mapStorageError(new ObservationStorageError("idempotency_conflict", false));
  const revision = mapStorageError(new ObservationStorageError("revision_conflict", false));
  assert.deepEqual([idem.status, idem.code, idem.retryable], [409, "idempotency_conflict", false]);
  assert.deepEqual([revision.status, revision.code, revision.retryable], [409, "revision_conflict", false]);
});
