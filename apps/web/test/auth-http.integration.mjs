import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import process from "node:process";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import argon2 from "argon2";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBinary = resolve(appDirectory, "node_modules/next/dist/bin/next");
const testPassword = "integration-only synthetic passphrase";

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  return address.port;
}

function updateCookies(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const maxAge = attributes.find((attribute) => attribute.trim().toLowerCase().startsWith("max-age="));
    if (value === "" || maxAge?.trim().toLowerCase() === "max-age=0") jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Next.js dev server exited before readiness.");
    try {
      const response = await globalThis.fetch(`${url}/api/public/status`);
      if (response.ok) return;
    } catch {
      await new Promise((resolveDelay) => globalThis.setTimeout(resolveDelay, 200));
    }
  }
  throw new Error("Next.js dev server readiness timed out.");
}

test("login, session, CSRF rotation and logout work over HTTP", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "bunaken-auth-http-"));
  const isolatedApp = join(temporaryRoot, "apps", "web");
  await cp(appDirectory, isolatedApp, { recursive: true, filter: (source) => !source.includes("/node_modules") && !source.includes("/.next") });
  await symlink(join(appDirectory, "node_modules"), join(isolatedApp, "node_modules"), "dir");
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const hash = await argon2.hash(testPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const child = spawn(process.execPath, [nextBinary, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: isolatedApp,
    env: {
      ...process.env,
      ADMIN_ENABLED: "true",
      ADMIN_USERNAME: "synthetic-admin",
      ADMIN_PASSWORD_HASH: hash,
      ADMIN_AUTH_VERSION: "integration-1",
      CANONICAL_ORIGIN: baseUrl,
      PUBLIC_OBSERVER_ID: "synthetic-admin-alias",
      IDEMPOTENCY_SECRET: randomBytes(32).toString("base64url"),
      GITHUB_WRITE_TOKEN: "",
      GITHUB_OWNER: "",
      GITHUB_REPO: "",
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let serverError = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { serverError = `${serverError}${chunk}`.slice(-3000); });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), new Promise((resolveDelay) => globalThis.setTimeout(resolveDelay, 5_000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  try {
    await waitForServer(baseUrl, child);
  } catch {
    throw new Error(`Next.js dev server did not start. ${serverError}`);
  }

  const jar = new Map();
  const csrfResponse = await globalThis.fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrfResponse.status, 200);
  assert.match(csrfResponse.headers.get("cache-control"), /private, no-store/);
  updateCookies(jar, csrfResponse);
  let csrfToken = (await csrfResponse.json()).data.csrf_token;
  assert.equal(jar.has("__Host-bunaken_csrf"), true);
  assert.equal(jar.has("__Host-bunaken_csrf_context"), true);

  const unauthenticated = await globalThis.fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: cookieHeader(jar) } });
  assert.equal(unauthenticated.status, 401);
  const koreanLoginPage = await globalThis.fetch(`${baseUrl}/ko/admin/login`);
  const englishLoginPage = await globalThis.fetch(`${baseUrl}/en/admin/login`);
  assert.equal(koreanLoginPage.status, 200);
  assert.equal(englishLoginPage.status, 200);
  assert.match(await koreanLoginPage.text(), /관리자 로그인/);
  assert.match(await englishLoginPage.text(), /Administrator sign in/);
  const adminRedirect = await globalThis.fetch(`${baseUrl}/admin`, { redirect: "manual" });
  assert.equal(adminRedirect.status, 307);
  assert.equal(adminRedirect.headers.get("location"), "/admin/login");

  const login = async (credentials, token = csrfToken) => {
    const response = await globalThis.fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { origin: baseUrl, cookie: cookieHeader(jar), "content-type": "application/json", "x-csrf-token": token },
      body: JSON.stringify(credentials),
    });
    updateCookies(jar, response);
    return response;
  };

  const csrfFailure = await login({ username: "synthetic-admin", password: testPassword }, "tampered");
  assert.equal(csrfFailure.status, 403);
  const badOrigin = await globalThis.fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { origin: "https://attacker.example", cookie: cookieHeader(jar), "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ username: "synthetic-admin", password: testPassword }),
  });
  assert.equal(badOrigin.status, 403);
  const missingOrigin = await globalThis.fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { cookie: cookieHeader(jar), "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ username: "synthetic-admin", password: testPassword }),
  });
  assert.equal(missingOrigin.status, 403);
  const wrongUsername = await login({ username: "unknown-user", password: testPassword });
  const wrongPassword = await login({ username: "synthetic-admin", password: "wrong synthetic passphrase" });
  assert.equal(wrongUsername.status, 401);
  assert.equal(wrongPassword.status, 401);
  const wrongUsernameBody = await wrongUsername.json();
  const wrongPasswordBody = await wrongPassword.json();
  assert.equal(wrongUsernameBody.error.code, wrongPasswordBody.error.code);
  assert.equal(wrongUsernameBody.error.message_key, wrongPasswordBody.error.message_key);
  assert.match(wrongUsername.headers.get("cache-control"), /private, no-store/);

  const successfulLogin = await login({ username: "synthetic-admin", password: testPassword });
  assert.equal(successfulLogin.status, 200);
  const sessionCookie = successfulLogin.headers.getSetCookie().find((header) => header.startsWith("__Host-bunaken_session="));
  assert.ok(sessionCookie);
  assert.match(sessionCookie, /;\s*Path=\//i);
  assert.match(sessionCookie, /;\s*HttpOnly/i);
  assert.match(sessionCookie, /;\s*Secure/i);
  assert.match(sessionCookie, /;\s*SameSite=Lax/i);
  assert.doesNotMatch(sessionCookie, /;\s*Domain=/i);
  const successBody = await successfulLogin.json();
  csrfToken = successBody.data.csrf_token;
  assert.equal(jar.has("__Host-bunaken_session"), true);
  const authContext = jar.get("__Host-bunaken_csrf_context");
  assert.equal(typeof authContext === "string" && decodeURIComponent(authContext).startsWith("auth:"), true);

  const authenticated = await globalThis.fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: cookieHeader(jar) } });
  assert.equal(authenticated.status, 200);
  const rejectedPublicFields = await globalThis.fetch(`${baseUrl}/api/admin/observations`, {
    method: "POST",
    headers: {
      origin: baseUrl,
      cookie: cookieHeader(jar),
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ id: "4f6f6c58-84a8-4dd5-b882-8ce58ee14b38", train_eligible: true, notes_private: "never public" }),
  });
  const rejectedBody = await rejectedPublicFields.text();
  assert.equal(rejectedPublicFields.status, 422, `${rejectedBody} ${serverError}`);
  assert.equal(JSON.parse(rejectedBody).error.code, "request_invalid");
  const publicObservation = await readFile(resolve(appDirectory, "../../packages/contracts/fixtures/synthetic/observation-create.json"), "utf8");
  const saveWithMissingProvider = async () => globalThis.fetch(`${baseUrl}/api/admin/observations`, {
    method: "POST",
    headers: {
      origin: baseUrl,
      cookie: cookieHeader(jar),
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
      "idempotency-key": "6f5cf4c1-f809-4f6c-b521-7b7ed5ac6b1c",
    },
    body: publicObservation,
  });
  const providerFailure = await saveWithMissingProvider();
  const providerFailureBody = await providerFailure.json();
  const retryFailure = await saveWithMissingProvider();
  assert.equal(providerFailure.status, 503);
  assert.equal(providerFailureBody.error.code, "storage_unavailable");
  assert.equal(providerFailureBody.error.retryable, false);
  assert.equal(retryFailure.status, 503);
  assert.equal((await retryFailure.json()).error.code, "storage_unavailable");
  assert.equal(providerFailure.headers.get("cache-control"), "private, no-store");
  const adminPage = await globalThis.fetch(`${baseUrl}/admin`, { headers: { cookie: cookieHeader(jar) } });
  assert.equal(adminPage.status, 200);

  const tamperedJar = new Map(jar);
  const sealedSession = tamperedJar.get("__Host-bunaken_session");
  const alteredCharacter = sealedSession[10] === "a" ? "b" : "a";
  tamperedJar.set("__Host-bunaken_session", `${sealedSession.slice(0, 10)}${alteredCharacter}${sealedSession.slice(11)}`);
  const tamperedSession = await globalThis.fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: cookieHeader(tamperedJar) } });
  assert.equal(tamperedSession.status, 401);

  const logoutFailure = await globalThis.fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { origin: baseUrl, cookie: cookieHeader(jar) },
  });
  assert.equal(logoutFailure.status, 403);
  const logout = await globalThis.fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { origin: baseUrl, cookie: cookieHeader(jar), "x-csrf-token": csrfToken },
  });
  assert.equal(logout.status, 204);
  updateCookies(jar, logout);

  const afterLogout = await globalThis.fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: cookieHeader(jar) } });
  assert.equal(afterLogout.status, 401);
});
