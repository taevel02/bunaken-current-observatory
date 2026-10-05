import { createHash } from "node:crypto";
import { RESEARCH_DOCUMENTS, canonicalResearch, researchTemplate } from "@bunaken/contracts/research";
import { GitHubDataError } from "../../src/server/github-data-store.mjs";
export const hash=raw=>createHash("sha256").update(raw).digest("hex");
export function syntheticBundle(version="1.0.0") {
  const results={schema_version:"1.0",version,data_cutoff:"2026-09-01T00:00:00Z",model_version:"synthetic-model",dataset_sha256:"a".repeat(64),metrics:{observations:4,mae:null},operational_forecast:false,evaluation_note:"Synthetic fixture, not research evidence"};
  const release={schema_version:"1.0",slug:"synthetic-study",version,data_cutoff:results.data_cutoff,model_version:results.model_version,dataset_sha256:results.dataset_sha256,revision:1,state:"draft",title:{ko:"합성 검증용 보고서",en:"Synthetic report fixture"},authors:[{alias:"synthetic-observer",role:"fixture"}],source_data_commit:"a".repeat(40),code_commit:"b".repeat(40),results_sha256:hash(canonicalResearch(results)),peer_review_status:"not_peer_reviewed",change_reason:"Synthetic fixture",created_at:"2026-09-02T00:00:00Z",updated_at:"2026-09-02T00:00:00Z",reviews:{translation:true,narrative:true,rights:true,real_synthetic:true,results:true},references:[{title:"Synthetic reference",url:"https://example.com/synthetic"}],files:{}};
  const documents=Object.fromEntries(RESEARCH_DOCUMENTS.map(file=>[file,researchTemplate(release,file)+"# Synthetic fixture\n\n{{metrics.observations}}\n\n{{results}}\n"]));
  release.files=Object.fromEntries(RESEARCH_DOCUMENTS.map(file=>[file,hash(documents[file])]));
  return {release,documents,results,expected_revision:null};
}
export function memoryResearchStore() {
  let head="a".repeat(40),serial=0;const snapshots=new Map([[head,new Map()]]);
  const commits=[];
  return {commits,conflictOnce:false,loseResponse:false,
    async getHead(){return head;},
    async getFile(path,ref){const value=snapshots.get(ref)?.get(path);if(value===undefined)throw new GitHubDataError("file_not_found",404);return value;},
    async getFileCommitSha(path){return [...commits].reverse().find(commit=>commit.files.some(file=>file.path===path)).sha;},
    async commitFiles(parent,files){
      if(this.conflictOnce){this.conflictOnce=false;head=String(++serial).padStart(40,"0");snapshots.set(head,new Map(snapshots.get(parent)));throw new GitHubDataError("branch_conflict",409,true);}
      if(parent!==head)throw new GitHubDataError("branch_conflict",409,true);
      const next=new Map(snapshots.get(head));for(const file of files)next.set(file.path,file.content);
      head=String(++serial).padStart(40,"0");snapshots.set(head,next);commits.push({sha:head,files});
      if(this.loseResponse){this.loseResponse=false;throw new GitHubDataError("provider_unavailable",503,true);}return head;
    },latest(){return snapshots.get(head);},
  };
}
