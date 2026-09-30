import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "unavailable", reason: "no_snapshot_configured" });
}
