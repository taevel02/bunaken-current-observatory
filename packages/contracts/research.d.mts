export const RESEARCH_DOCUMENTS: string[];
export const RESEARCH_CONTEXT_KEYS: string[];
export type ResearchResults = { schema_version: "1.0"; version:string; data_cutoff:string; model_version:string; dataset_sha256:string; metrics:Record<string,number|null>; operational_forecast:boolean; evaluation_note:string };
export type ResearchRelease = { schema_version:"1.0"; slug:string; version:string; data_cutoff:string; model_version:string; dataset_sha256:string; revision:number; state:string; title:{ko:string;en:string}; authors:{alias:string;role:string}[]; source_data_commit:string; code_commit:string; results_sha256:string; peer_review_status:"not_peer_reviewed"; change_reason:string; created_at:string; updated_at:string; reviews:Record<string,boolean>; references:{title:string;url:string}[]; files:Record<string,string> };
export class ResearchError extends Error {code:string; fields:string[]; constructor(code:string,fields?:string[])}
export function canonicalResearch(value:unknown):string;
export function researchBody(text:string,release:ResearchRelease,file:string):string;
export function researchTemplate(release:ResearchRelease,file:string):string;
export function validateResearchBundle(release:ResearchRelease,documents:Record<string,string>,results:ResearchResults,hash:(raw:string)=>string,options?:{publishing?:boolean}):boolean;
export function renderResearchMetrics(body:string,results:ResearchResults):string;
