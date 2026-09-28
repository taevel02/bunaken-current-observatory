import "server-only";
import { GitHubDataError } from "./github-data-store.mjs";
import { ObservationStorageError } from "./observation-transaction.mjs";

const MESSAGE_KEYS = {
  request_invalid: "errors.observationInvalid",
  request_too_large: "auth.invalidRequest",
  idempotency_key_invalid: "errors.observationInvalid",
  idempotency_conflict: "errors.idempotencyConflict",
  revision_conflict: "errors.revisionConflict",
  branch_conflict: "errors.storageUnavailable",
  storage_unavailable: "errors.storageUnavailable",
  storage_corrupt: "errors.storageUnavailable",
};

export function mapStorageError(error) {
  if (error instanceof ObservationStorageError) {
    return {
      status: error.status,
      code: error.code,
      messageKey: MESSAGE_KEYS[error.code] ?? "errors.storageUnavailable",
      retryable: error.retryable,
    };
  }
  if (error instanceof GitHubDataError) {
    if (error.kind === "provider_auth_failed") {
      return { status: 503, code: "storage_auth_failed", messageKey: "errors.storageUnavailable", retryable: false };
    }
    if (error.kind === "provider_permission_denied") {
      return { status: 503, code: "storage_permission_denied", messageKey: "errors.storageUnavailable", retryable: false };
    }
    if (error.kind === "branch_conflict") {
      return { status: 409, code: "branch_conflict", messageKey: "errors.storageUnavailable", retryable: true };
    }
    if (error.kind === "provider_rate_limited") {
      return { status: 503, code: "storage_rate_limited", messageKey: "errors.storageUnavailable", retryable: true, retryAfter: error.retryAfter };
    }
    if (error.kind === "provider_unavailable") {
      return { status: 503, code: "storage_unavailable", messageKey: "errors.storageUnavailable", retryable: true };
    }
  }
  return { status: 503, code: "storage_unavailable", messageKey: "errors.storageUnavailable", retryable: false };
}
