import "server-only";
import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "../../../../../src/server/admin-api-guard.mjs";
import { apiError, apiSuccess } from "../../../../../src/server/api-response.mjs";
import { getGitHubDataConfig, GitHubDataStore } from "../../../../../src/server/github-data-store.mjs";
import { createIdempotencyDigest, ObservationStorageError } from "../../../../../src/server/observation-transaction.mjs";
import { readRequestStatus } from "../../../../../src/server/observation-queries.mjs";
import { mapStorageError } from "../../../../../src/server/storage-error.mjs";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 1024;

async function readBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new ObservationStorageError("request_invalid", false, 400);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new ObservationStorageError("request_too_large", false, 413);
  if (!request.body) throw new ObservationStorageError("request_invalid", false, 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new ObservationStorageError("request_too_large", false, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ObservationStorageError("request_invalid", false, 400); }
}

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest(request, { mutation: true });
  if (access.response) return access.response;
  try {
    const body = await readBody(request) as { idempotency_key?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "idempotency_key") || typeof body.idempotency_key !== "string") throw new ObservationStorageError("request_invalid", false, 400);
    const digest = createIdempotencyDigest(body.idempotency_key);
    const result = await readRequestStatus(new GitHubDataStore({ config: getGitHubDataConfig() }), digest);
    return apiSuccess(result);
  } catch (error) {
    const mapped = mapStorageError(error);
    return apiError(mapped.status, mapped.code, mapped.messageKey, { retryable: mapped.retryable, retryAfter: mapped.retryAfter });
  }
}
