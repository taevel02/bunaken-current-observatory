import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { errorEnvelope } from "../api/error";

export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export function requestId() {
  return randomUUID();
}

export function apiError(status, code, messageKey, id = requestId()) {
  return NextResponse.json(
    { error: errorEnvelope(code, messageKey, id), meta: { request_id: id } },
    { status, headers: PRIVATE_NO_STORE },
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
