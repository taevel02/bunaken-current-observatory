import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { validateCreateObservation, validateObservationRevision } from "@bunaken/contracts/validate";
import { resolveSiteId } from "@bunaken/contracts/sites";
import { authorizeAdminRequest } from "@/src/server/admin-api-guard.mjs";
import { apiError, apiSuccess } from "@/src/server/api-response.mjs";
import { getGitHubDataConfig, GitHubDataStore } from "@/src/server/github-data-store.mjs";
import { hashCanonicalPayload, commitObservationTransaction, createIdempotencyDigest, ObservationStorageError } from "@/src/server/observation-transaction.mjs";
import { readObservation, readRequestStatus } from "@/src/server/observation-queries.mjs";
import { mapStorageError } from "@/src/server/storage-error.mjs";

export const runtime = "nodejs";
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 16 * 1024;

function failure(error: unknown) {
  const mapped = mapStorageError(error);
  return apiError(mapped.status, mapped.code, mapped.messageKey, { retryable: mapped.retryable, retryAfter: mapped.retryAfter });
}

function toUtc(local: string | null) {
  if (local === null) return null;
  const date = new Date(`${local}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 16) !== local) {
    throw new ObservationStorageError("request_invalid", false, 422);
  }
  return date.toISOString();
}

function toWitaLocal(utc: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(utc)).replace(" ", "T");
}

async function readJsonBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new ObservationStorageError("request_invalid", false, 400);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) throw new ObservationStorageError("request_too_large", false, 413);
  if (!request.body) throw new ObservationStorageError("request_invalid", false, 400);
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
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new ObservationStorageError("request_invalid", false, 400); }
}

function getIfMatchRevision(request: Request, id: string) {
  const value = request.headers.get("if-match");
  const prefix = `"obs:${id}:rev:`;
  const revisionText = value?.startsWith(prefix) && value.endsWith('"') ? value.slice(prefix.length, -1) : "";
  if (!/^[1-9]\d*$/.test(revisionText) || !Number.isSafeInteger(Number(revisionText))) throw new ObservationStorageError("request_invalid", false, 400);
  return Number(revisionText);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeAdminRequest(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const store = new GitHubDataStore({ config: getGitHubDataConfig() });
    const head = await store.getHead();
    const result = await readObservation(store, id, head);
    if (!result) return apiError(404, "observation_not_found", "errors.notFound");
    return apiSuccess(result.revision, 200, { data_commit_sha: head }, { ETag: result.etag });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeAdminRequest(request, { mutation: true });
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const expectedRevision = getIfMatchRevision(request, id);
    const rawBody = await readJsonBody(request);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) throw new ObservationStorageError("request_invalid", false, 400);
    const { correction_reason: reason, ...rawFields } = rawBody as Record<string, unknown>;
    if (typeof reason !== "string" || reason.trim().length < 1 || reason.trim().length > 1000 || rawFields.id !== id) {
      throw new ObservationStorageError("request_invalid", false, 422);
    }
    const keyDigest = createIdempotencyDigest(request.headers.get("idempotency-key") ?? "");
    const requestHash = hashCanonicalPayload({ id, request_type: "correct", expected_revision: expectedRevision, payload: rawFields, reason: reason.trim() });
    const store = new GitHubDataStore({ config: getGitHubDataConfig() });
    const replay = await readRequestStatus(store, keyDigest, requestHash);
    if (replay.found) return apiSuccess({ ...replay, saved_to_public_repository: true }, 200, { idempotent_replay: true }, { ETag: `"obs:${id}:rev:${replay.revision}"` });
    const body: Record<string, unknown> = { ...rawFields, site_id: resolveSiteId(rawFields.site_id) };
    if (!body.site_id) throw new ObservationStorageError("request_invalid", false, 422);
    const validation = validateCreateObservation(body);
    if (!validation.valid) throw new ObservationStorageError("request_invalid", false, 422);
    const correctedPeakEvents = body.peak_events as Array<{ pci: number | null }>;
    const correctedOverallPci = body.overall_pci as number;
    if (correctedPeakEvents.some((event) => event.pci !== null && event.pci < correctedOverallPci)) {
      throw new ObservationStorageError("request_invalid", false, 422);
    }
    const head = await store.getHead();
    const current = await readObservation(store, id, head);
    if (!current) return apiError(404, "observation_not_found", "errors.notFound");
    if (current.revision.record_status === "withdrawn") throw new ObservationStorageError("revision_conflict", false);
    const now = new Date().toISOString();
    const startAt = toUtc(body.local_start as string) as string;
    const endAt = toUtc(body.local_end as string | null);
    if (!endAt || endAt <= startAt) throw new ObservationStorageError("request_invalid", false, 422);
    const isWithinDive = (at: string) => Date.parse(at) >= Date.parse(startAt) && (endAt === null || Date.parse(at) <= Date.parse(endAt));
    const peakEvents = (body.peak_events as Array<{ local_at?: string | null; at?: string | null; depth_m?: number | null; zone_id?: string | null; duration_description?: string | null; context_description?: string | null }>).map((event) => {
      const at = event.local_at ? toUtc(event.local_at) : event.at ?? null;
      if (at && !isWithinDive(at)) throw new ObservationStorageError("request_invalid", false, 422);
      return {
        ...event,
        local_at: event.local_at ?? (at === null ? null : toWitaLocal(at)),
        at,
        depth_m: event.depth_m ?? null,
        zone_id: event.zone_id ?? null,
        duration_description: event.duration_description ?? null,
        context_description: event.context_description ?? null,
      };
    });
    const onset = (body.vertical_onset ?? null) as { local_at: string | null } | null;
    const verticalOnset = onset === null ? null : { ...onset, at: toUtc(onset.local_at) };
    if (verticalOnset?.at && !isWithinDive(verticalOnset.at)) throw new ObservationStorageError("request_invalid", false, 422);
    const revisionFields = { ...body };
    delete revisionFields.start_depth_m;
    delete revisionFields.time_samples;
    const document = {
      ...revisionFields,
      schema_version: "1.4",
      observer_id: current.revision.observer_id,
      rubric_version: current.revision.rubric_version,
      revision: expectedRevision + 1,
      start_at: startAt,
      end_at: endAt,
      peak_events: peakEvents,
      ...(current.revision.time_samples ? { time_samples: current.revision.time_samples } : {}),
      route_description: body.route_description ?? "",
      vertical_onset: verticalOnset,
      observed_temperature: body.observed_temperature ?? null,
      label_scope: current.revision.label_scope,
      record_status: "corrected",
      created_at: current.revision.created_at,
      updated_at: now,
      correction_reason: reason.trim(),
      train_eligible: false,
    };
    const revisionValidation = validateObservationRevision(document);
    if (!revisionValidation.valid) throw new ObservationStorageError("request_invalid", false, 422);
    const result = await commitObservationTransaction({
      store,
      requestKeyDigest: keyDigest,
      requestHash,
      requestType: "correct",
      observationId: id,
      expectedRevision,
      revisionDocument: document,
      actorAlias: current.revision.observer_id,
      now,
      createEventId: randomUUID,
    });
    return apiSuccess({ ...result, saved_to_public_repository: true }, 200, { idempotent_replay: result.idempotent_replay }, { ETag: `"obs:${id}:rev:${result.revision}"` });
  } catch (error) {
    return failure(error);
  }
}
