import assert from "node:assert/strict";
import test from "node:test";
import { GitHubDataError } from "../src/server/github-data-store.mjs";
import { listObservations, readObservation, readRequestStatus } from "../src/server/observation-queries.mjs";
import { ObservationStorageError } from "../src/server/observation-transaction.mjs";

const head = "a".repeat(40);
const firstId = "4f6f6c58-84a8-4dd5-b882-8ce58ee14b38";
const secondId = "6f6f6c58-84a8-4dd5-b882-8ce58ee14b38";

function fakeStore() {
  const files = new Map();
  const reads = [];
  const originalCommit = "b".repeat(40);
  for (const [id, revision, updatedAt] of [[firstId, 1, "2026-09-27T03:00:00.000Z"], [secondId, 2, "2026-09-27T04:00:00.000Z"]]) {
    const revisionPath = `observations/${id}/revisions/${String(revision).padStart(6, "0")}.json`;
    files.set(`observations/${id}/current.json`, JSON.stringify({ id, revision, revision_path: revisionPath }));
    files.set(revisionPath, JSON.stringify({ id, revision, updated_at: updatedAt, record_status: "active" }));
  }
  files.set(`idempotency/${"1".repeat(64)}.json`, JSON.stringify({ request_hash: "2".repeat(64), result: { id: firstId, revision: 1 } }));
  return {
    files,
    reads,
    async getHead() { return head; },
    async getFile(path) {
      reads.push(path);
      if (!files.has(path)) throw new GitHubDataError("file_not_found", 404);
      return files.get(path);
    },
    async listDirectory() { return [firstId, secondId, "research-note"]; },
    async getFileCommitSha() { return originalCommit; },
  };
}

test("lists observations in stable ID order and reads only the requested page", async () => {
  const store = fakeStore();
  const firstPage = await listObservations(store, { limit: 1 });
  assert.equal(firstPage.items[0].id, firstId);
  assert.deepEqual(store.reads, [`observations/${firstId}/current.json`, `observations/${firstId}/revisions/000001.json`]);
  assert.ok(firstPage.next_cursor);
  const secondPage = await listObservations(store, { limit: 1, cursor: firstPage.next_cursor });
  assert.equal(secondPage.items[0].id, secondId);
  assert.equal(secondPage.next_cursor, null);
});

test("reads only the revision named by a valid current pointer", async () => {
  const store = fakeStore();
  const record = await readObservation(store, firstId, head);
  assert.equal(record.revision.revision, 1);
  assert.equal(record.etag, `"obs:${firstId}:rev:1"`);
  store.files.set(`observations/${firstId}/current.json`, JSON.stringify({ id: firstId, revision: 1, revision_path: "audit/unsafe.json" }));
  await assert.rejects(readObservation(store, firstId, head), (error) => error.code === "storage_corrupt");
  store.files.set(`observations/${firstId}/current.json`, "null");
  await assert.rejects(readObservation(store, firstId, head), (error) => error.code === "storage_corrupt");
});

test("resolves a stored idempotency result and distinguishes an absent key", async () => {
  const store = fakeStore();
  assert.deepEqual(await readRequestStatus(store, "1".repeat(64), "2".repeat(64)), {
    found: true, id: firstId, revision: 1, commit_sha: "b".repeat(40),
  });
  assert.deepEqual(await readRequestStatus(store, "3".repeat(64)), { found: false });
  await assert.rejects(readRequestStatus(store, "1".repeat(64), "4".repeat(64)), (error) => error instanceof ObservationStorageError && error.code === "idempotency_conflict");
});
