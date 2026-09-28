import "server-only";
import process from "node:process";
import { createHash, createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { GitHubDataError } from "./github-data-store.mjs";

const SUBJECT = "bunaken-admin";
const MAX_ATTEMPTS = 3;

export class ObservationStorageError extends Error {
  constructor(code, retryable = false, status = 409) {
    super(code);
    this.name = "ObservationStorageError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createIdempotencyDigest(key, secret = process.env.IDEMPOTENCY_SECRET) {
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new ObservationStorageError("idempotency_key_invalid", false, 400);
  }
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(secret) || Buffer.from(secret, "base64url").byteLength !== 32) {
    throw new ObservationStorageError("storage_unavailable", false, 503);
  }
  return createHmac("sha256", Buffer.from(secret, "base64url")).update(`${SUBJECT}\0${key}`).digest("hex");
}

export function hashCanonicalPayload(value) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

async function readJson(store, path, head) {
  try {
    const text = await store.getFile(path, head);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof GitHubDataError && error.kind === "provider_not_found") return null;
    if (error instanceof SyntaxError) throw new ObservationStorageError("storage_corrupt", false, 503);
    throw error;
  }
}

const jsonFile = (path, value) => ({ path, content: `${JSON.stringify(value, null, 2)}\n` });

export async function commitObservationTransaction({
  store,
  requestKeyDigest,
  requestHash,
  requestType = "create",
  observationId,
  expectedRevision = null,
  revisionDocument,
  actorAlias,
  now = new Date().toISOString(),
  createEventId,
  pause = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)),
  random = Math.random,
}) {
  if (!/^[a-f0-9]{64}$/.test(requestKeyDigest) || !/^[a-f0-9]{64}$/.test(requestHash) || !/^[0-9a-f-]{36}$/i.test(observationId) || typeof actorAlias !== "string" || actorAlias.length < 1) {
    throw new ObservationStorageError("request_invalid", false, 400);
  }
  const revisionPathFor = (revision) => `observations/${observationId}/revisions/${String(revision).padStart(6, "0")}.json`;
  const currentPath = `observations/${observationId}/current.json`;
  const ledgerPath = `idempotency/${requestKeyDigest}.json`;
  const eventId = createEventId();
  const auditPath = `audit/${eventId}.json`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const head = await store.getHead();
    const ledger = await readJson(store, ledgerPath, head);
    if (ledger) {
      if (ledger.request_hash !== requestHash) throw new ObservationStorageError("idempotency_conflict");
      return { ...ledger.result, commit_sha: head, idempotent_replay: true };
    }

    const current = await readJson(store, currentPath, head);
    const actualRevision = current?.revision ?? null;
    if (actualRevision !== expectedRevision) throw new ObservationStorageError("revision_conflict", false);
    const revision = expectedRevision === null ? 1 : expectedRevision + 1;
    if (revisionDocument.id !== observationId || revisionDocument.revision !== revision) throw new ObservationStorageError("request_invalid", false, 400);
    const revisionPath = revisionPathFor(revision);
    const revisionContent = `${JSON.stringify(revisionDocument, null, 2)}\n`;
    const result = { id: observationId, revision, record_status: revisionDocument.record_status, revision_path: revisionPath };
    const requestLedger = {
      schema_version: "1.0.0",
      request_digest: requestKeyDigest,
      request_hash: requestHash,
      request_type: requestType,
      result,
      created_at: now,
    };
    const currentPointer = {
      schema_version: "1.0.0",
      id: observationId,
      revision,
      revision_path: revisionPath,
      revision_sha256: createHash("sha256").update(revisionContent).digest("hex"),
      updated_at: now,
    };
    const auditEvent = {
      schema_version: "1.0.0",
      id: eventId,
      actor_alias: actorAlias,
      action: requestType,
      observation_id: observationId,
      previous_revision: actualRevision,
      new_revision: revision,
      created_at: now,
      parent_commit_sha: head,
    };

    try {
      const commitSha = await store.commitFiles(head, [
        { path: revisionPath, content: revisionContent },
        jsonFile(currentPath, currentPointer),
        jsonFile(ledgerPath, requestLedger),
        jsonFile(auditPath, auditEvent),
      ], `data: ${requestType} observation ${observationId} revision ${revision}`);
      return { ...result, commit_sha: commitSha, idempotent_replay: false };
    } catch (error) {
      if (!(error instanceof GitHubDataError) || !error.retryable || error.kind === "provider_rate_limited") throw error;
      if (attempt === MAX_ATTEMPTS - 1) throw new ObservationStorageError("branch_conflict", true);
      await pause(Math.floor(20 + random() * 80) * (attempt + 1));
    }
  }
  throw new ObservationStorageError("branch_conflict", true);
}
