import "server-only";
import process from "node:process";
import { Buffer } from "node:buffer";
import { validateResearchRelease } from "@bunaken/contracts/validate";
import { RESEARCH_DOCUMENTS, validateResearchBundle, ResearchError } from "@bunaken/contracts/research";
import { researchHash, validateResearchIndex } from "#server/research-transaction.mjs";

export async function loadResearchLibrary({owner=process.env.GITHUB_OWNER,repo=process.env.GITHUB_REPO,fetchImpl=globalThis.fetch,slug,version,catalog=false,offset=0,latestPublished=false}={}) {
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return {status:"unavailable",items:[],withdrawn:[]};
  const deadline=Date.now()+15000;let total=0;
  async function read(url) {
    if(Date.now()>=deadline)throw new ResearchError("research_unavailable");
    const response = await fetchImpl(url,{next:{revalidate:60},signal:globalThis.AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now()))),redirect:"error"});
    if (!response.ok || !response.body) throw new ResearchError(response.status===404?"research_not_found":"research_unavailable");
    const reader = response.body.getReader(); const chunks=[];let size=0;
    try {
      while (true) {
        const {done,value}=await reader.read(); if(done) break;
        size+=value.length;total+=value.length;if(size>600_000||total>8_000_000) throw new ResearchError("research_too_large");chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks).toString("utf8");
  }
  try {
    const ref = JSON.parse(await read(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/data`));
    const head = ref?.object?.sha;
    if (!/^[a-f0-9]{40}$/.test(head)) throw new ResearchError("research_unavailable");
    const base = `https://raw.githubusercontent.com/${owner}/${repo}/${head}/research/`;
    // Public readers never follow mutable draft pointers or execute data branch content.
    let index;
    try { index=validateResearchIndex(JSON.parse(await read(base+"index.json"))); }
    catch(error) { if(error instanceof ResearchError && error.code==="research_not_found") return {status:"empty",items:[],withdrawn:[]};throw error; }
    const items=[];
    const withdrawn=index.items.filter(row=>row.state==="withdrawn").map(row=>({slug:row.slug,version:row.version}));
    const candidates=index.items.filter(row=>(latestPublished?row.state==="published":["published","superseded"].includes(row.state))&&(!slug||row.slug===slug)&&(version?row.version===version:!slug||row.state==="published")).reverse();
    const start=catalog&&Number.isSafeInteger(offset)&&offset>=0?offset:0;
    const selected=latestPublished?candidates.slice(0,1):catalog?candidates.slice(start,start+20):candidates.slice(0,20);
    const next_offset=catalog&&start+20<candidates.length?start+20:null;
    let partial=false;
    for (const row of selected) {
      try {
      const prefix = `${row.slug}/releases/${row.version}/`;
      const raw = await read(base+prefix+"manifest.json");
      if (researchHash(raw)!==row.manifest_sha256) throw new ResearchError("research_hash_mismatch");
      const release=JSON.parse(raw);
      if (!validateResearchRelease(release)||release.slug!==row.slug||release.version!==row.version||release.state!=="published")throw new ResearchError("research_context_mismatch");
      if(catalog){items.push({release,display_state:row.state});continue;}
      const results=JSON.parse(await read(base+prefix+"results.json"));
      const documents=Object.fromEntries(await Promise.all(RESEARCH_DOCUMENTS.map(async file=>[file,await read(base+prefix+file)])));
      validateResearchBundle(release,documents,results,researchHash,{publishing:true});
      if (release.slug!==row.slug || release.version!==row.version || release.state!=="published") throw new ResearchError("research_context_mismatch");
      items.push({release,results,documents,display_state:row.state});
      } catch(error){if(!catalog)throw error;partial=true;}
    }
    return {status:items.length||withdrawn.length?"available":"empty",items,withdrawn,next_offset,partial};
  } catch { return {status:"unavailable",items:[],withdrawn:[]}; }
}

export function loadResearchCatalog(options={}) {return loadResearchLibrary({...options,catalog:true});}
