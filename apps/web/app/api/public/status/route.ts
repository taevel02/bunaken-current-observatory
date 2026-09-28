import { NextResponse } from "next/server";
import { errorEnvelope } from "@/src/api/error";

export function GET() {
  return NextResponse.json({ status: "unavailable", reason: "no_snapshot_configured" });
}

export function notFoundResponse(requestId: string) {
  return NextResponse.json(errorEnvelope("not_found", "errors.notFound", requestId), { status: 404 });
}
