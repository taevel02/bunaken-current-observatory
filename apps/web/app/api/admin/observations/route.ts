import "server-only";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { NextRequest } from "next/server";
import { validateCreateObservation, validateObservationRevision } from "@bunaken/contracts/validate";
import { getAdminAuthConfig } from "@/src/server/admin-config.mjs";
import { hasAuthCsrfContext, validateCsrfToken } from "@/src/server/admin-csrf.mjs";
import { apiError, apiSuccess } from "@/src/server/api-response.mjs";
import { getGitHubDataConfig, GitHubDataStore } from "@/src/server/github-data-store.mjs";
import { getAdminSession } from "@/src/server/admin-session.mjs";
import {
  commitObservationTransaction,
  createIdempotencyDigest,
  hashCanonicalPayload,
  ObservationStorageError,
} from "@/src/server/observation-transaction.mjs";
import { hasCanonicalOrigin } from "@/src/server/request-security.mjs";
import { mapStorageError } from "@/src/server/storage-error.mjs";
import { authorizeAdminRequest } from "@/src/server/admin-api-guard.mjs";
import { listObservations } from "@/src/server/observation-queries.mjs";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 16 * 1024;
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const access = await authorizeAdminRequest(request);
  if (access.response) return access.response;
  try {
    const rawLimit = request.nextUrl.searchParams.get("limit") ?? "20";
    if (!/^\d{1,3}$/.test(rawLimit)) throw new ObservationStorageError("request_invalid", false, 400);
    const result = await listObservations(new GitHubDataStore({ config: getGitHubDataConfig() }), {
      limit: Number(rawLimit),
      cursor: request.nextUrl.searchParams.get("cursor"),
    });
    return apiSuccess({ items: result.items, next_cursor: result.next_cursor });
  } catch (error) {
    return apiFailure(error);
  }
}

function localTimeToUtc(value: string) {
  const date = new Date(value + ":00+08:00");
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 16) !== value) {
    throw new ObservationStorageError("request_invalid", false, 422);
  }
  return date.toISOString();
}

async function readJsonBody(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES) throw new ObservationStorageError("request_too_large", false, 413);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ObservationStorageError("request_invalid", false, 400);
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new ObservationStorageError("request_too_large", false, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ObservationStorageError("request_invalid", false, 400);
  }
}

function apiFailure(error: unknown) {
  const mapped = mapStorageError(error);
  return apiError(mapped.status, mapped.code, mapped.messageKey, {
    retryable: mapped.retryable,
    retryAfter: mapped.retryAfter,
  });
}

export async function POST(request: NextRequest) {
  if (!hasCanonicalOrigin(request)) return apiError(403, "origin_invalid", "auth.csrfInvalid");
  const authConfig = getAdminAuthConfig();
  if (!authConfig.enabled) return apiError(503, "auth_unavailable", "auth.unavailable");
  const session = await getAdminSession();
  if (!session) return apiError(401, "unauthorized", "auth.unauthorized");
  if (!hasAuthCsrfContext(request, session.session_id) || !validateCsrfToken(request, "auth:" + session.session_id)) {
    return apiError(403, "csrf_invalid", "auth.csrfInvalid");
  }

  try {
    const requestBody = await readJsonBody(request);
    const validation = validateCreateObservation(requestBody);
    if (!validation.valid) throw new ObservationStorageError("request_invalid", false, 422);
    const key = request.headers.get("idempotency-key");
    const keyDigest = createIdempotencyDigest(key);
    const observerId = process.env.PUBLIC_OBSERVER_ID ?? "";
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(observerId)) throw new ObservationStorageError("storage_unavailable", false, 503);

    const now = new Date().toISOString();
    const startAt = localTimeToUtc(requestBody.local_start);
    const endAt = requestBody.local_end === null ? null : localTimeToUtc(requestBody.local_end);
    if (endAt && endAt <= startAt) throw new ObservationStorageError("request_invalid", false, 422);
    if (requestBody.peak_events.some((event: { pci: number | null }) => event.pci !== null && event.pci < requestBody.overall_pci)) {
      throw new ObservationStorageError("request_invalid", false, 422);
    }

    const revisionDocument: Record<string, unknown> = {
      ...requestBody,
      schema_version: "1.0",
      observer_id: observerId,
      rubric_version: "pci-overall-v1",
      revision: 1,
      start_at: startAt,
      end_at: endAt,
      observed_temperature: requestBody.observed_temperature ?? null,
      label_scope: "dive_overall",
      record_status: "active",
      created_at: now,
      updated_at: now,
      train_eligible: false,
    };
    const revisionValidation = validateObservationRevision(revisionDocument);
    if (!revisionValidation.valid) throw new ObservationStorageError("storage_unavailable", false, 503);

    const store = new GitHubDataStore({ config: getGitHubDataConfig() });
    const result = await commitObservationTransaction({
      store,
      requestKeyDigest: keyDigest,
      requestHash: hashCanonicalPayload(requestBody),
      observationId: requestBody.id,
      expectedRevision: null,
      revisionDocument,
      actorAlias: observerId,
      now,
      createEventId: randomUUID,
    });
    return apiSuccess({
      id: result.id,
      revision: result.revision,
      record_status: result.record_status,
      saved_to_public_repository: true,
      enrichment_status: "pending",
      website_status: "pending",
    }, result.idempotent_replay ? 200 : 201, {
      idempotent_replay: result.idempotent_replay,
      commit_sha: result.commit_sha,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
