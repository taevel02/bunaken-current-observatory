import { NextResponse } from "next/server";
import { loadPublicRelease } from "@/src/server/public-release";

export async function GET() {
  const state = await loadPublicRelease();
  return NextResponse.json({ status: state.status, reason: state.reason, release_id: state.releaseId, generated_at: state.data.generated_at, source_generated_at: state.data.source_generated_at, forecast_kind: state.data.forecast_kind }, { headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
