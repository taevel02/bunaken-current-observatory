import assert from "node:assert/strict";
import test from "node:test";
import { GitHubDataError, GitHubDataStore, getGitHubDataConfig } from "../src/server/github-data-store.mjs";

const config = { token: "synthetic-token", owner: "example", repo: "observatory", branch: "data" };

function mockFetch(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : undefined });
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return new globalThis.Response(next.status === 204 ? null : JSON.stringify(next.body ?? {}), {
        status: next.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

test("Git Data writes build one parented commit and update the data ref without force", async () => {
  const mock = mockFetch([
    { body: { tree: { sha: "b".repeat(40) } } },
    { body: { sha: "c".repeat(40) } },
    { body: { sha: "d".repeat(40) } },
    { status: 204 },
  ]);
  const store = new GitHubDataStore({ config, fetchImpl: mock.fetchImpl });
  const sha = await store.commitFiles("a".repeat(40), [
    { path: "observations/id/current.json", content: "{}" },
    { path: "audit/event.json", content: "{}" },
  ], "save observation");
  assert.equal(sha, "d".repeat(40));
  assert.equal(mock.calls[0].url.endsWith(`/git/commits/${"a".repeat(40)}`), true);
  assert.deepEqual(mock.calls[1].body, {
    base_tree: "b".repeat(40),
    tree: [
      { path: "observations/id/current.json", mode: "100644", type: "blob", content: "{}" },
      { path: "audit/event.json", mode: "100644", type: "blob", content: "{}" },
    ],
  });
  assert.deepEqual(mock.calls[2].body.parents, ["a".repeat(40)]);
  assert.deepEqual(mock.calls[3].body, { sha: "d".repeat(40), force: false });
  assert.equal(mock.calls.every(({ options }) => options.headers.authorization === "Bearer synthetic-token"), true);
});

test("Git Data refuses arbitrary paths and malformed server configuration", async () => {
  const store = new GitHubDataStore({ config, fetchImpl: () => assert.fail("must not call network") });
  await assert.rejects(store.commitFiles("a".repeat(40), [{ path: "../../.github/workflows/pwn.yml", content: "x" }], "bad"), (error) => error instanceof GitHubDataError && error.kind === "path_forbidden");
  assert.throws(() => getGitHubDataConfig({ GITHUB_WRITE_TOKEN: "token", GITHUB_OWNER: "owner", GITHUB_REPO: "repo", GITHUB_DATA_BRANCH: "../main" }), /configuration_invalid/);
});

test("GitHub provider failures are categorized without retaining response bodies", async () => {
  async function fail(status, headers = {}) {
    const store = new GitHubDataStore({
      config,
      fetchImpl: async () => new globalThis.Response("private provider detail", { status, headers }),
    });
    try {
      await store.getHead();
      assert.fail("expected provider failure");
    } catch (error) {
      assert.equal(error.message.includes("private provider detail"), false);
      return error;
    }
  }

  assert.equal((await fail(401)).kind, "provider_auth_failed");
  assert.equal((await fail(403)).kind, "provider_permission_denied");
  assert.equal((await fail(403, { "x-ratelimit-remaining": "0", "retry-after": "120" })).kind, "provider_rate_limited");
  const limited = await fail(429, { "retry-after": "45" });
  assert.equal(limited.retryable, true);
  assert.equal(limited.retryAfter, 45);
  const validationFailure = await fail(422);
  assert.equal(validationFailure.kind, "provider_rejected");
  assert.equal(validationFailure.retryable, false);
  const refConflict = await fail(409);
  assert.equal(refConflict.kind, "branch_conflict");
  assert.equal(refConflict.retryable, true);
  assert.equal((await fail(503)).kind, "provider_unavailable");
});

test("missing content files are distinct from a missing blob behind an existing file", async () => {
  const absent = new GitHubDataStore({ config, fetchImpl: async () => new globalThis.Response("{}", { status: 404 }) });
  await assert.rejects(absent.getFile("observations/item/current.json"), (error) => error.kind === "file_not_found");

  let requests = 0;
  const brokenBlob = new GitHubDataStore({
    config,
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) return new globalThis.Response(JSON.stringify({ type: "file", sha: "bad-blob" }), { status: 200 });
      return new globalThis.Response("{}", { status: 404 });
    },
  });
  await assert.rejects(brokenBlob.getFile("observations/item/current.json"), (error) => error.kind === "provider_not_found");
});
