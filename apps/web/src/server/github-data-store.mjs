import "server-only";
import process from "node:process";
import { Buffer } from "node:buffer";

const API_ROOT = "https://api.github.com";
const ALLOWED_ROOTS = ["audit/", "idempotency/", "observations/"];

export class GitHubDataError extends Error {
  constructor(kind, status, retryable = false) {
    super(kind);
    this.name = "GitHubDataError";
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

export function getGitHubDataConfig(env = process.env) {
  const { GITHUB_WRITE_TOKEN: token, GITHUB_OWNER: owner, GITHUB_REPO: repo } = env;
  const branch = env.GITHUB_DATA_BRANCH ?? "data";
  if (!token || !owner || !repo || !/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo) || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) {
    throw new GitHubDataError("configuration_invalid", 503);
  }
  return { token, owner, repo, branch };
}

function encodePath(path) {
  if (typeof path !== "string" || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || !ALLOWED_ROOTS.some((root) => path.startsWith(root))) {
    throw new GitHubDataError("path_forbidden", 400);
  }
  return path.split("/").map(encodeURIComponent).join("/");
}

export class GitHubDataStore {
  constructor({ config = getGitHubDataConfig(), fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.repositoryUrl = `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }

  async request(path, { method = "GET", body } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.repositoryUrl}${path}`, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.config.token}`,
          "x-github-api-version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
      });
    } catch {
      throw new GitHubDataError("provider_unavailable", 503, true);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new GitHubDataError("provider_permission", response.status);
      if (response.status === 404) throw new GitHubDataError("provider_not_found", 404);
      if (response.status === 409 || response.status === 422) throw new GitHubDataError("branch_conflict", 409, true);
      throw new GitHubDataError(response.status >= 500 ? "provider_unavailable" : "provider_rejected", response.status >= 500 ? 503 : response.status, response.status === 429 || response.status >= 500);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async getHead() {
    const ref = await this.request(`/git/ref/heads/${encodeURIComponent(this.config.branch)}`);
    return ref.object.sha;
  }

  async getFile(path, ref) {
    const encoded = encodePath(path);
    const file = await this.request(`/contents/${encoded}?ref=${encodeURIComponent(ref ?? this.config.branch)}`);
    if (file.type !== "file" || typeof file.sha !== "string") throw new GitHubDataError("provider_rejected", 502);
    const blob = await this.request(`/git/blobs/${encodeURIComponent(file.sha)}`);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new GitHubDataError("provider_rejected", 502);
    return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
  }

  async commitFiles(parentSha, files, message) {
    if (!/^[0-9a-f]{40}$/i.test(parentSha) || !Array.isArray(files) || files.length === 0) throw new GitHubDataError("request_invalid", 400);
    const tree = files.map((file) => ({
      path: encodePath(file.path),
      mode: "100644",
      type: "blob",
      content: file.content,
    }));
    const parent = await this.request(`/git/commits/${encodeURIComponent(parentSha)}`);
    const createdTree = await this.request("/git/trees", { method: "POST", body: { base_tree: parent.tree.sha, tree } });
    const commit = await this.request("/git/commits", { method: "POST", body: { message, tree: createdTree.sha, parents: [parentSha] } });
    await this.request(`/git/refs/heads/${encodeURIComponent(this.config.branch)}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
    return commit.sha;
  }
}
