import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "../../../../../../src/server/admin-api-guard.mjs";
import { apiError, apiSuccess } from "../../../../../../src/server/api-response.mjs";
import { validateObservationRevision } from "@bunaken/contracts/validate";
import { getGitHubDataConfig, GitHubDataStore } from "../../../../../../src/server/github-data-store.mjs";
import { hashCanonicalPayload, commitObservationTransaction, createIdempotencyDigest, ObservationStorageError } from "../../../../../../src/server/observation-transaction.mjs";
import { readObservation, readRequestStatus } from "../../../../../../src/server/observation-queries.mjs";
import { mapStorageError } from "../../../../../../src/server/storage-error.mjs";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 2048;

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeAdminRequest(request, { mutation: true });
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const ifMatch = request.headers.get("if-match");
    const prefix = `"obs:${id}:rev:`;
    const revisionText = ifMatch?.startsWith(prefix) && ifMatch.endsWith('"') ? ifMatch.slice(prefix.length, -1) : "";
    if (!/^[1-9]\d*$/.test(revisionText) || !Number.isSafeInteger(Number(revisionText))) throw new ObservationStorageError("request_invalid", false, 400);
    const expectedRevision = Number(revisionText);
    const raw = await readBody(request) as { reason?: unknown };
    if (!raw || typeof raw.reason !== "string" || raw.reason.trim().length < 1 || raw.reason.trim().length > 1000) {
      throw new ObservationStorageError("request_invalid", false, 422);
    }
    const reason = raw.reason.trim();
    const requestKeyDigest = createIdempotencyDigest(request.headers.get("idempotency-key") ?? "");
    const requestHash = hashCanonicalPayload({ id, request_type: "withdraw", expected_revision: expectedRevision, reason });
    const store = new GitHubDataStore({ config: getGitHubDataConfig() });
    const replay = await readRequestStatus(store, requestKeyDigest, requestHash);
    if (replay.found) return apiSuccess({ ...replay, saved_to_public_repository: true }, 200, { idempotent_replay: true }, { ETag: `"obs:${id}:rev:${replay.revision}"` });
    const head = await store.getHead();
    const current = await readObservation(store, id, head);
    if (!current) return apiError(404, "observation_not_found", "errors.notFound");
    if (current.revision.record_status === "withdrawn") throw new ObservationStorageError("revision_conflict", false);
    const now = new Date().toISOString();
    const revisionDocument = {
      ...current.revision,
      revision: expectedRevision + 1,
      record_status: "withdrawn",
      correction_reason: reason,
      created_at: current.revision.created_at,
      updated_at: now,
    };
    const revisionValidation = validateObservationRevision(revisionDocument);
    if (!revisionValidation.valid) throw new ObservationStorageError("storage_corrupt", false, 503);
    const result = await commitObservationTransaction({
      store,
      requestKeyDigest,
      requestHash,
      requestType: "withdraw",
      observationId: id,
      expectedRevision,
      revisionDocument,
      actorAlias: current.revision.observer_id,
      now,
      createEventId: randomUUID,
    });
    return apiSuccess({ ...result, saved_to_public_repository: true }, 200, { idempotent_replay: result.idempotent_replay }, { ETag: `"obs:${id}:rev:${result.revision}"` });
  } catch (error) {
    const mapped = mapStorageError(error);
    return apiError(mapped.status, mapped.code, mapped.messageKey, { retryable: mapped.retryable, retryAfter: mapped.retryAfter });
  }
}
