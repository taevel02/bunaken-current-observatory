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
