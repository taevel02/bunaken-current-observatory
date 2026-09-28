import "server-only";
import { Buffer } from "node:buffer";
import { GitHubDataError } from "./github-data-store.mjs";
import { ObservationStorageError } from "./observation-transaction.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;

export async function readObservation(store, id, head) {
  if (!UUID.test(id)) throw new ObservationStorageError("request_invalid", false, 400);
  let pointer;
  try {
    pointer = JSON.parse(await store.getFile(`observations/${id}/current.json`, head));
  } catch (error) {
    if (error instanceof GitHubDataError && error.kind === "file_not_found") return null;
    if (error instanceof SyntaxError) throw new ObservationStorageError("storage_corrupt", false, 503);
    throw error;
  }
  if (!pointer || typeof pointer !== "object" || Array.isArray(pointer)) throw new ObservationStorageError("storage_corrupt", false, 503);
  const expectedPath = `observations/${id}/revisions/${String(pointer.revision).padStart(6, "0")}.json`;
  if (pointer.id !== id || !Number.isSafeInteger(pointer.revision) || pointer.revision < 1 || pointer.revision_path !== expectedPath) {
    throw new ObservationStorageError("storage_corrupt", false, 503);
  }
  try {
    const revision = JSON.parse(await store.getFile(pointer.revision_path, head));
    if (revision.id !== id || revision.revision !== pointer.revision) throw new ObservationStorageError("storage_corrupt", false, 503);
    return { revision, etag: `"obs:${id}:rev:${pointer.revision}"` };
  } catch (error) {
    if (error instanceof SyntaxError) throw new ObservationStorageError("storage_corrupt", false, 503);
    throw error;
  }
}

function decodeCursor(cursor) {
  if (cursor === null) return null;
  if (typeof cursor !== "string" || cursor.length > 512) throw new ObservationStorageError("request_invalid", false, 400);
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!SHA.test(decoded.head) || !Number.isSafeInteger(decoded.offset) || decoded.offset < 1) throw new Error("invalid_cursor");
    return decoded;
  } catch {
    throw new ObservationStorageError("request_invalid", false, 400);
  }
}

async function mapLimit(items, limit, callback) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await callback(items[index]);
    }
  }));
  return output;
}

export async function listObservations(store, { limit = 20, cursor = null } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ObservationStorageError("request_invalid", false, 400);
  const page = decodeCursor(cursor);
  const head = page?.head ?? await store.getHead();
  const offset = page?.offset ?? 0;
  const ids = [...new Set(await store.listDirectory("observations", head))].filter((id) => UUID.test(id)).sort();
  const pageIds = ids.slice(offset, offset + limit);
  const observations = (await mapLimit(pageIds, 8, async (id) => {
    const result = await readObservation(store, id, head);
    return result?.revision ?? null;
  })).filter(Boolean);
  const items = observations;
  const nextOffset = offset + pageIds.length;
  const nextCursor = nextOffset < ids.length
    ? Buffer.from(JSON.stringify({ head, offset: nextOffset })).toString("base64url")
    : null;
  return { items, next_cursor: nextCursor, data_commit_sha: head };
}

export async function readRequestStatus(store, requestKeyDigest, requestHash = null) {
  if (!/^[a-f0-9]{64}$/.test(requestKeyDigest)) throw new ObservationStorageError("request_invalid", false, 400);
  const head = await store.getHead();
  const path = `idempotency/${requestKeyDigest}.json`;
  let ledger;
  try {
    ledger = JSON.parse(await store.getFile(path, head));
  } catch (error) {
    if (error instanceof GitHubDataError && error.kind === "file_not_found") return { found: false };
    if (error instanceof SyntaxError) throw new ObservationStorageError("storage_corrupt", false, 503);
    throw error;
  }
  if (requestHash && ledger.request_hash !== requestHash) throw new ObservationStorageError("idempotency_conflict");
  const commitSha = await store.getFileCommitSha(path, head);
  return { found: true, ...ledger.result, commit_sha: commitSha };
}
