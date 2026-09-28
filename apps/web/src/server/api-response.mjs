import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { errorEnvelope } from "../api/error";
import { errorResponseHeaders } from "../api/error-response.mjs";

export const PRIVATE_NO_STORE = errorResponseHeaders();

export function requestId() {
  return randomUUID();
}

/** @param {{id?: string, retryable?: boolean, retryAfter?: number}} options */
export function apiError(status, code, messageKey, options = {}) {
  const { id = requestId(), retryable = false, retryAfter } = options;
  return NextResponse.json(
    { error: errorEnvelope(code, messageKey, id, retryable), meta: { request_id: id } },
    { status, headers: errorResponseHeaders(retryAfter) },
  );
}

export function apiSuccess(data, status = 200, extraMeta = {}) {
  return NextResponse.json(
    { data, meta: { request_id: requestId(), ...extraMeta } },
    { status, headers: PRIVATE_NO_STORE },
  );
}

export function createCookieSink() {
  const pending = [];
  return {
    sink: { cookies: { set: (...args) => pending.push(args) } },
    apply(response) {
      for (const [name, value, options] of pending) response.cookies.set(name, value, options);
      return response;
    },
  };
}
