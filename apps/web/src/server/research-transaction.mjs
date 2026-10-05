import "server-only";
import { createHash } from "node:crypto";
import { RESEARCH_DOCUMENTS, canonicalResearch, validateResearchBundle, ResearchError } from "@bunaken/contracts/research";
import { GitHubDataError } from "#server/github-data-store.mjs";
import { ObservationStorageError } from "#server/observation-transaction.mjs";

export const researchHash = raw => createHash("sha256").update(raw).digest("hex");
const documentFile = (path,value) => ({path,content:typeof value==="string"?value:canonicalResearch(value)+"\n"});
const reviewContent = bundle => {
  const release = {...bundle.release};
  for (const key of ["state","revision","created_at","updated_at","change_reason","reviews"]) delete release[key];
  return canonicalResearch({release,documents:bundle.documents,results:bundle.results});
};
const readable = new Set(["published","superseded","withdrawn"]);
const transitions = {draft:["draft","in_review"],in_review:["draft","in_review","ready"],ready:["draft","in_review","ready","published"],published:["withdrawn"],withdrawn:[],superseded:[]};

export async function readResearchJson(store,path,head) {
  try { return JSON.parse(await store.getFile(path,head)); }
  catch(error) {
    if (error instanceof GitHubDataError && error.kind==="file_not_found") return null;
    if (error instanceof SyntaxError) throw new ObservationStorageError("storage_corrupt",false,503);
    throw error;
  }
}

export function validateResearchIndex(index) {
  if (!index || Object.keys(index).sort().join()!=="items,schema_version" || index.schema_version!=="1.0" || !Array.isArray(index.items) || index.items.length>1000) throw new ResearchError("research_index_invalid");
  const identities = new Set();
  for (const row of index.items) {
    if (!row || Object.keys(row).sort().join()!=="manifest_sha256,revision,slug,state,version" || !/^[a-z][a-z0-9-]{0,63}$/.test(row.slug) || !/^\d+\.\d+\.\d+$/.test(row.version) || !Object.hasOwn(transitions,row.state) || !Number.isInteger(row.revision) || row.revision<1 || (row.manifest_sha256!==null && !/^[a-f0-9]{64}$/.test(row.manifest_sha256)) || (readable.has(row.state) && row.manifest_sha256===null)) throw new ResearchError("research_index_invalid");
    const key = `${row.slug}/${row.version}`;
    if (identities.has(key)) throw new ResearchError("research_index_invalid");
    identities.add(key);
  }
  return index;
}

export async function readResearchDraft(store,slug,version,head) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(slug) || !/^\d+\.\d+\.\d+$/.test(version)) throw new ResearchError("research_invalid");
  const base = `research/${slug}/versions/${version}`;
  const pointer = await readResearchJson(store,base+"/current.json",head);
  if (!pointer) return null;
  if (!Number.isInteger(pointer.revision) || pointer.revision<1 || !/^[a-f0-9]{64}$/.test(pointer.manifest_sha256)) throw new ResearchError("research_index_invalid");
  const prefix = `${base}/revisions/${String(pointer.revision).padStart(6,"0")}`;
  const raw = await store.getFile(prefix+"/manifest.json",head);
  if (researchHash(raw)!==pointer.manifest_sha256) throw new ResearchError("research_hash_mismatch");
  const release = JSON.parse(raw);
  const documents = Object.fromEntries(await Promise.all(RESEARCH_DOCUMENTS.map(async file=>[file,await store.getFile(`${prefix}/${file}`,head)])));
  const results = await readResearchJson(store,prefix+"/results.json",head);
  validateResearchBundle(release,documents,results,researchHash);
  if (release.slug!==slug || release.version!==version || release.revision!==pointer.revision) throw new ResearchError("research_context_mismatch");
  return {release,documents,results};
}

export async function saveResearch({store,input,keyDigest,requestHash,actorAlias,now=new Date().toISOString()}) {
  if (!input || Object.keys(input).sort().join()!=="documents,expected_revision,release,results" || !/^[a-f0-9]{64}$/.test(keyDigest) || !/^[a-f0-9]{64}$/.test(requestHash) || !actorAlias || (input.expected_revision!==null && (!Number.isInteger(input.expected_revision)||input.expected_revision<1))) throw new ResearchError("research_invalid");
  validateResearchBundle(input.release,input.documents,input.results,researchHash);
  const {slug,version} = input.release;
  const ledgerPath = `idempotency/research/${keyDigest}.json`;
  for (let attempt=0;attempt<3;attempt++) {
    const head = await store.getHead();
    const ledger = await readResearchJson(store,ledgerPath,head);
    if (ledger) {
      if (ledger.request_hash!==requestHash) throw new ObservationStorageError("idempotency_conflict");
      return {...ledger.result,idempotent_replay:true,commit_sha:await store.getFileCommitSha(ledgerPath,head)};
    }
    const existing = await readResearchDraft(store,slug,version,head);
    if ((existing?.release.revision??null)!==input.expected_revision) throw new ObservationStorageError("revision_conflict");
    const state = input.release.state;
    if ((!existing && state!=="draft") || (existing && !transitions[existing.release.state].includes(state))) throw new ResearchError("research_transition_invalid",["state"]);
    if (state==="published" && reviewContent(existing)!==reviewContent(input)) throw new ResearchError("research_review_changed");
    if (existing && readable.has(existing.release.state)) {
      const before = {...existing.release,state,revision:input.release.revision,updated_at:input.release.updated_at,change_reason:input.release.change_reason};
      if (canonicalResearch(before)!==canonicalResearch(input.release) || canonicalResearch(existing.documents)!==canonicalResearch(input.documents) || canonicalResearch(existing.results)!==canonicalResearch(input.results)) throw new ResearchError("research_published_immutable");
    }
    const release = {...input.release,revision:(input.expected_revision??0)+1,created_at:existing?.release.created_at??now,updated_at:now};
    if (existing && !release.change_reason.trim()) throw new ResearchError("research_change_reason_required",["change_reason"]);
    validateResearchBundle(release,input.documents,input.results,researchHash,{publishing:["ready","published"].includes(state)});
    const index = validateResearchIndex(await readResearchJson(store,"research/index.json",head)??{schema_version:"1.0",items:[]});
    if (!existing && index.items.some(row=>row.slug===slug && readable.has(row.state)) && !release.change_reason.trim()) throw new ResearchError("research_change_reason_required",["change_reason"]);
    const prefix = `research/${slug}/versions/${version}/revisions/${String(release.revision).padStart(6,"0")}`;
    const encoded = canonicalResearch(release)+"\n";
    const files = [documentFile(prefix+"/manifest.json",encoded),documentFile(prefix+"/results.json",input.results),...RESEARCH_DOCUMENTS.map(file=>documentFile(`${prefix}/${file}`,input.documents[file]))];
    const row = {slug,version,revision:release.revision,state,manifest_sha256:null};
    if (state==="published") {
      const publicPrefix = `research/${slug}/releases/${version}`;
      for (const file of files.slice()) {
        const path = file.path.replace(prefix,publicPrefix);
        try { await store.getFile(path,head); throw new ResearchError("research_published_immutable"); }
        catch(error) { if (!(error instanceof GitHubDataError)||error.kind!=="file_not_found") throw error; }
        files.push({...file,path});
      }
      row.manifest_sha256 = researchHash(encoded);
      for (const item of index.items) if (item.slug===slug && item.state==="published") item.state="superseded";
    } else if (state==="withdrawn") row.manifest_sha256=index.items.find(item=>item.slug===slug&&item.version===version)?.manifest_sha256??null;
    index.items=index.items.filter(item=>!(item.slug===slug&&item.version===version));index.items.push(row);
    validateResearchIndex(index);
    const result = {slug,version,revision:release.revision,state,saved_to_public_repository:true,release};
    files.push(documentFile(`research/${slug}/versions/${version}/current.json`,{revision:release.revision,manifest_sha256:researchHash(encoded)}),documentFile("research/index.json",index),documentFile(ledgerPath,{request_hash:requestHash,result}),documentFile(`audit/research-${keyDigest}.json`,{schema_version:"1.0",actor_alias:actorAlias,action:"research_"+state,slug,version,revision:release.revision,created_at:now,parent_commit_sha:head}));
    try {
      const commit = await store.commitFiles(head,files,`data: save research ${slug} ${version} ${state}`);
      const confirmedHead = await store.getHead();
      const visible = await readResearchJson(store,ledgerPath,confirmedHead);
      if (!visible || visible.request_hash!==requestHash) throw new GitHubDataError("provider_unavailable",503,true);
      return {...result,commit_sha:commit,idempotent_replay:false};
    } catch(error) {
      if (!(error instanceof GitHubDataError)||!error.retryable||error.kind==="provider_rate_limited"||attempt===2) throw error;
      if (error.kind==="branch_conflict" && await store.getHead()===head) throw new GitHubDataError("provider_rejected",503);
    }
  }
  throw new ObservationStorageError("branch_conflict",true);
}
