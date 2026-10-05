import { NextRequest } from "next/server";
import { ResearchError } from "@bunaken/contracts/research";
import { authorizeAdminRequest } from "@/src/server/admin-api-guard.mjs";
import { apiError, apiSuccess } from "@/src/server/api-response.mjs";
import { GitHubDataStore } from "@/src/server/github-data-store.mjs";
import { createIdempotencyDigest, hashCanonicalPayload, ObservationStorageError } from "@/src/server/observation-transaction.mjs";
import { readResearchJson, readResearchDraft, saveResearch, validateResearchIndex } from "@/src/server/research-transaction.mjs";
import { mapStorageError } from "@/src/server/storage-error.mjs";

export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof ResearchError) return apiError(422,error.code,"research.invalid",{fieldErrors:Object.fromEntries(error.fields.map(field=>[field,error.code]))});
  const mapped=mapStorageError(error);
  return apiError(mapped.status,mapped.code,mapped.messageKey,{retryable:mapped.retryable,retryAfter:mapped.retryAfter});
}
export async function GET(request: NextRequest) {
  const access=await authorizeAdminRequest(request);if(access.response)return access.response;
  try {
    const store=new GitHubDataStore();const head=await store.getHead();
    const slug=request.nextUrl.searchParams.get("slug"),version=request.nextUrl.searchParams.get("version");
    if(slug&&version) {
      const draft=await readResearchDraft(store,slug,version,head);
      return draft?apiSuccess(draft):apiError(404,"research_not_found","research.notFound");
    }
    return apiSuccess(validateResearchIndex(await readResearchJson(store,"research/index.json",head)??{schema_version:"1.0",items:[]}));
  } catch(error) {return failure(error);}
}
export async function POST(request: NextRequest) {
  const access=await authorizeAdminRequest(request,{mutation:true});if(access.response)return access.response;
  try {
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??"")||!request.body) throw new ObservationStorageError("request_invalid",false,400);
    const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>600_000)throw new ObservationStorageError("request_too_large",false,413);chunks.push(value);}}
    finally{await reader.cancel();}
    let input;
    try {input=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}
    catch {throw new ObservationStorageError("request_invalid",false,400);}
    const actorAlias=process.env.PUBLIC_OBSERVER_ID;
    if(!actorAlias||!/^[a-z][a-z0-9_-]{0,63}$/.test(actorAlias))throw new ObservationStorageError("storage_unavailable",false,503);
    const result=await saveResearch({store:new GitHubDataStore(),input,keyDigest:createIdempotencyDigest(request.headers.get("idempotency-key")),requestHash:hashCanonicalPayload(input),actorAlias});
    return apiSuccess(result,result.idempotent_replay?200:201);
  } catch(error) {return failure(error);}
}
