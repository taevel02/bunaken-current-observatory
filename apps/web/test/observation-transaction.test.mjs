import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { GitHubDataError } from "../src/server/github-data-store.mjs";
import {
  commitObservationTransaction,
  createIdempotencyDigest,
  hashCanonicalPayload,
  ObservationStorageError,
} from "../src/server/observation-transaction.mjs";

const id = "4f6f6c58-84a8-4dd5-b882-8ce58ee14b38";
const genesis = "a".repeat(40);
const digest = "1".repeat(64);
const requestHash = "2".repeat(64);

function createMemoryStore({ conflictCount = 0, loseResponseAfterCommit = false, failureKind } = {}) {
  let head = genesis;
  let serial = 0;
  const commits = [];
  const snapshots = new Map([[head, new Map()]]);
  return {
    commits,
    async getHead() { return head; },
    async getFile(path, ref) {
      const content = snapshots.get(ref)?.get(path);
      if (content === undefined) throw new GitHubDataError("file_not_found", 404);
      return content;
    },
    readLatest(path) { return snapshots.get(head).get(path); },
    async commitFiles(parent, files) {
      if (failureKind) throw new GitHubDataError(failureKind, failureKind === "branch_conflict" ? 409 : 503, true);
      if (conflictCount > 0) {
        conflictCount -= 1;
        const competingSha = (++serial).toString(16).padStart(40, "0");
        const competingSnapshot = new Map(snapshots.get(head));
        competingSnapshot.set("research/unrelated.json", "{\"preserved\":true}\n");
        snapshots.set(competingSha, competingSnapshot);
        head = competingSha;
        throw new GitHubDataError("branch_conflict", 409, true);
      }
      if (parent !== head) throw new GitHubDataError("branch_conflict", 409, true);
      const sha = (++serial).toString(16).padStart(40, "0");
      const snapshot = new Map(snapshots.get(parent));
      for (const file of files) snapshot.set(file.path, file.content);
      snapshots.set(sha, snapshot);
      head = sha;
      commits.push({ sha, parent, files });
      if (loseResponseAfterCommit) {
        loseResponseAfterCommit = false;
        throw new GitHubDataError("provider_unavailable", 503, true);
      }
      return sha;
    },
  };
}

function revisionDocument(revision = 1) {
  return {
    id, schema_version: "1.0.0", observer_id: "synthetic-alias", rubric_version: "pci-v1",
    revision, start_at: "2026-09-27T03:00:00.000Z", end_at: null,
    local_start: "2026-09-27T11:00", local_end: null, timezone: "Asia/Makassar",
    time_precision: "approximate", site_id: "synthetic-site", zone_id: null,
    overall_pci: 1.24, vertical: { direction: "down", intensity: null },
    label_scope: "dive_overall", record_status: "active", created_at: "2026-09-27T03:01:00.000Z",
    updated_at: "2026-09-27T03:01:00.000Z", train_eligible: false, use_for_model: false,
  };
}

function run(store, overrides = {}) {
  return commitObservationTransaction({
    store,
    requestKeyDigest: digest,
    requestHash,
    observationId: id,
    revisionDocument: revisionDocument(overrides.revision ?? 1),
    actorAlias: "synthetic-alias",
    now: "2026-09-27T03:01:00.000Z",
    createEventId: () => "7e02bfe8-55c2-4acb-a6cd-6fc18e0a3c1d",
    pause: async () => {},
    random: () => 0,
    ...overrides,
  });
}

test("revision, current pointer, idempotency ledger and audit share one commit", async () => {
  const store = createMemoryStore();
  const result = await run(store);
  assert.equal(result.revision, 1);
  assert.equal(result.idempotent_replay, false);
  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0].files.length, 4);
  const paths = store.commits[0].files.map(({ path }) => path);
  assert.deepEqual(paths, [
    "observations/" + id + "/revisions/000001.json",
    "observations/" + id + "/current.json",
    "idempotency/" + digest + ".json",
    "audit/7e02bfe8-55c2-4acb-a6cd-6fc18e0a3c1d.json",
  ]);
  const audit = JSON.parse(store.commits[0].files[3].content);
  assert.equal(audit.parent_commit_sha, genesis);
});

test("canonical request hashing is key-order independent and raw idempotency keys are HMACed", () => {
  assert.equal(hashCanonicalPayload({ z: 1, a: { y: true, x: null } }), hashCanonicalPayload({ a: { x: null, y: true }, z: 1 }));
  const secret = Buffer.alloc(32, 7).toString("base64url");
  const key = "6f5cf4c1-f809-4f6c-b521-7b7ed5ac6b1c";
  const keyDigest = createIdempotencyDigest(key, secret);
  assert.match(keyDigest, /^[a-f0-9]{64}$/);
  assert.equal(keyDigest.includes(key), false);
  assert.throws(() => createIdempotencyDigest(key, "short"), ObservationStorageError);
});

test("retries after unrelated branch commits preserve their files", async () => {
  const store = createMemoryStore({ conflictCount: 2 });
  const result = await run(store);
  assert.equal(result.revision, 1);
  assert.equal(store.commits.length, 1);
  assert.equal(store.readLatest("research/unrelated.json"), "{\"preserved\":true}\n");
});

test("concurrent duplicate writes create one commit; concurrent different payloads conflict", async () => {
  const duplicateStore = createMemoryStore();
  const duplicateResults = await Promise.all([run(duplicateStore), run(duplicateStore)]);
  assert.equal(duplicateStore.commits.length, 1);
  assert.equal(duplicateResults.filter((result) => result.idempotent_replay).length, 1);

  const conflictingStore = createMemoryStore();
  const conflictingResults = await Promise.allSettled([
    run(conflictingStore, { requestHash: "a".repeat(64) }),
    run(conflictingStore, { requestHash: "b".repeat(64) }),
  ]);
  assert.equal(conflictingStore.commits.length, 1);
  assert.equal(conflictingResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(conflictingResults.find((result) => result.status === "rejected").reason.code, "idempotency_conflict");
});

test("same observation written with different keys yields a non-retryable revision conflict", async () => {
  const store = createMemoryStore();
  await run(store);
  await assert.rejects(run(store, { requestKeyDigest: "4".repeat(64) }), (error) => error.code === "revision_conflict" && error.retryable === false);
  assert.equal(store.commits.length, 1);
});

test("successful ref update with a lost response is recovered from the same ledger key", async () => {
  const store = createMemoryStore({ loseResponseAfterCommit: true });
  const result = await run(store);
  assert.equal(result.idempotent_replay, true);
  assert.equal(store.commits.length, 1);
});

test("persistent provider outages remain retryable 503 failures, while exhausted branch races remain 409", async () => {
  const outage = createMemoryStore({ failureKind: "provider_unavailable" });
  await assert.rejects(run(outage), (error) => error instanceof GitHubDataError && error.kind === "provider_unavailable" && error.retryable);
  const contention = createMemoryStore({ failureKind: "branch_conflict" });
  await assert.rejects(run(contention), (error) => error.code === "branch_conflict" && error.status === 409 && error.retryable);
});
