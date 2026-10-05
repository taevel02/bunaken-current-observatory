import assert from "node:assert/strict";
import test from "node:test";
import { RESEARCH_DOCUMENTS, canonicalResearch, validateResearchBundle, researchBody,renderResearchMetrics } from "@bunaken/contracts/research";
import { saveResearch,readResearchDraft } from "../src/server/research-transaction.mjs";
import { loadResearchLibrary } from "../src/server/research-public.mjs";
import { syntheticBundle,memoryResearchStore,hash } from "./fixtures/research.mjs";

function save(store,input,digit="1") {return saveResearch({store,input,keyDigest:digit.repeat(64),requestHash:hash(canonicalResearch(input)),actorAlias:"synthetic-observer",now:"2026-09-02T00:00:00Z"});}
async function advance(store,input,state,digit) {
  const current=await readResearchDraft(store,input.release.slug,input.release.version,await store.getHead());
  const next={...current,expected_revision:current.release.revision,release:{...current.release,state}};
  const result=await save(store,next,digit);return {...next,release:result.release};
}
test("four manuscripts share context, metrics and immutable hashes",()=>{
  const bundle=syntheticBundle();assert.equal(validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash,{publishing:true}),true);
  assert.match(renderResearchMetrics(researchBody(bundle.documents[RESEARCH_DOCUMENTS[0]],bundle.release,RESEARCH_DOCUMENTS[0]),bundle.results),/4/);
  for(const field of ["version","data_cutoff","model_version","dataset_sha256"]) {
    const changed=globalThis.structuredClone(bundle);changed.results[field]="different";
    assert.throws(()=>validateResearchBundle(changed.release,changed.documents,changed.results,hash));
  }
  const wrong=globalThis.structuredClone(bundle);wrong.release.results_sha256="b".repeat(64);assert.throws(()=>validateResearchBundle(wrong.release,wrong.documents,wrong.results,hash));
});
test("HTML, MDX, unsafe links, unknown context and missing documents rejected",()=>{
  for(const payload of ['<script>alert(1)</script>','import X from "x"','[x](javascript:alert(1))','![x](https://example.com/x)','{{metrics.unknown}}']) {
    const bundle=syntheticBundle();bundle.documents[RESEARCH_DOCUMENTS[0]]+=payload;bundle.release.files[RESEARCH_DOCUMENTS[0]]=hash(bundle.documents[RESEARCH_DOCUMENTS[0]]);
    assert.throws(()=>validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash));
  }
  const missing=syntheticBundle();delete missing.documents[RESEARCH_DOCUMENTS[0]];assert.throws(()=>validateResearchBundle(missing.release,missing.documents,missing.results,hash));
  const forbidden=syntheticBundle();forbidden.release.notes_private="never public";assert.throws(()=>validateResearchBundle(forbidden.release,forbidden.documents,forbidden.results,hash));
});
test("review flags, references and nonempty content gate publication",()=>{
  for(const key of Object.keys(syntheticBundle().release.reviews)) {
    const bundle=syntheticBundle();bundle.release.reviews[key]=false;
    assert.equal(validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash),true);
    assert.throws(()=>validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash,{publishing:true}));
  }
  const bundle=syntheticBundle();bundle.release.references=[];assert.throws(()=>validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash,{publishing:true}));
});
test("literal numeric tables cannot disagree with results in another language",()=>{
  const bundle=syntheticBundle();const file="guide.en.md";
  bundle.documents[file]+="\n| Metric | Value |\n| --- | --- |\n| observations | 999 |\n";
  bundle.release.files[file]=hash(bundle.documents[file]);
  assert.throws(()=>validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash,{publishing:true}),/research_table_literal_number/);
  bundle.documents[file]=bundle.documents[file].replace("999","{{metrics.observations}}");bundle.release.files[file]=hash(bundle.documents[file]);
  assert.equal(validateResearchBundle(bundle.release,bundle.documents,bundle.results,hash,{publishing:true}),true);
});
test("state chain commits revisions, index, ledger and audit atomically",async()=>{
  const store=memoryResearchStore();let input=syntheticBundle();await save(store,input);
  for(const [state,digit] of [['in_review','2'],['ready','3'],['published','4']])input=await advance(store,input,state,digit);
  assert.equal(store.commits.length,4);
  const files=store.commits.at(-1).files;
  assert.ok(files.some(row=>row.path==="research/index.json"));
  assert.ok(files.some(row=>row.path.startsWith("idempotency/research/")));
  assert.ok(files.some(row=>row.path.startsWith("audit/")));
  assert.equal(files.filter(row=>row.path.includes("/releases/")).length,6);
  const edited={...input,expected_revision:input.release.revision,release:{...input.release,state:"draft"}};
  await assert.rejects(()=>save(store,edited,"5"),/research_transition_invalid/);
  input=await advance(store,input,"withdrawn","6");assert.equal(input.release.state,"withdrawn");
  assert.ok(store.latest().has("research/synthetic-study/releases/1.0.0/technical.ko.md"));
});
test("same key retry recovers timeout, changed body conflicts and stale revision is 409",async()=>{
  const store=memoryResearchStore();store.loseResponse=true;const input=syntheticBundle();const saved=await save(store,input);
  assert.equal(store.commits.length,1);assert.equal(saved.idempotent_replay,true);
  await assert.rejects(()=>save(store,{...input,release:{...input.release,change_reason:"changed"}}),/idempotency_conflict/);
  await assert.rejects(()=>save(store,input,"2"),/revision_conflict/);
});
test("unrelated branch competition retries and review failures write no blobs",async()=>{
  const store=memoryResearchStore();store.conflictOnce=true;await save(store,syntheticBundle());assert.equal(store.commits.length,1);
  const input=syntheticBundle("1.1.0");input.release.state="published";
  await assert.rejects(()=>save(store,input,"2"),/research_transition_invalid/);assert.equal(store.commits.length,1);
});
test("new version preserves prior published bytes and marks superseded",async()=>{
  const store=memoryResearchStore();let input=syntheticBundle();await save(store,input);
  for(const [state,digit] of [['in_review','2'],['ready','3'],['published','4']])input=await advance(store,input,state,digit);
  const before=store.latest().get("research/synthetic-study/releases/1.0.0/manifest.json");
  input=syntheticBundle("1.1.0");await save(store,input,"5");
  for(const [state,digit] of [['in_review','6'],['ready','7'],['published','8']])input=await advance(store,input,state,digit);
  assert.equal(store.latest().get("research/synthetic-study/releases/1.0.0/manifest.json"),before);
  const index=JSON.parse(store.latest().get("research/index.json"));assert.equal(index.items.find(row=>row.version==="1.0.0").state,"superseded");
});
test("public reader freezes head, excludes drafts, verifies hashes and preserves withdrawal",async()=>{
  const store=memoryResearchStore();let input=syntheticBundle();await save(store,input);
  const fetcher=async url=>{
    if(url.includes('api.github.com'))return globalThis.Response.json({object:{sha:await store.getHead()}});
    const path=url.slice(url.indexOf('/research/')+1);const raw=store.latest().get(path);
    return new globalThis.Response(raw??"missing",{status:raw?200:404});
  };
  const options={owner:"synthetic",repo:"fixture",fetchImpl:fetcher};
  assert.equal((await loadResearchLibrary(options)).items.length,0);
  for(const [state,digit] of [['in_review','2'],['ready','3'],['published','4']])input=await advance(store,input,state,digit);
  let library=await loadResearchLibrary(options);assert.equal(library.items.length,1);assert.equal(library.status,"available");
  const path="research/synthetic-study/releases/1.0.0/guide.en.md";const original=store.latest().get(path);store.latest().set(path,"tampered");
  assert.equal((await loadResearchLibrary(options)).status,"unavailable");store.latest().set(path,original);
  await advance(store,input,"withdrawn","5");library=await loadResearchLibrary(options);assert.equal(library.items.length,0);assert.deepEqual(library.withdrawn,[{slug:"synthetic-study",version:"1.0.0"}]);
  assert.equal((await loadResearchLibrary({...options,fetchImpl:async()=>new globalThis.Response('',{status:503})})).status,"unavailable");
});

test("publication is bound to the exact reviewed content",async()=>{
  const store=memoryResearchStore();let input=syntheticBundle();await save(store,input);
  for(const [state,digit] of [["in_review","2"],["ready","3"]])input=await advance(store,input,state,digit);
  const changed=globalThis.structuredClone(input);changed.expected_revision=input.release.revision;changed.release.state="published";
  changed.documents["technical.ko.md"]+="\nChanged after approval\n";changed.release.files["technical.ko.md"]=hash(changed.documents["technical.ko.md"]);
  await assert.rejects(()=>save(store,changed,"4"),/research_review_changed/);assert.equal(store.commits.length,3);
  const titleChanged=globalThis.structuredClone(input);titleChanged.expected_revision=input.release.revision;titleChanged.release.state="published";titleChanged.release.title.ko="Changed title";
  await assert.rejects(()=>save(store,titleChanged,"5"),/research_review_changed/);
  input=await advance(store,input,"published","6");assert.equal(input.release.state,"published");
});
test("selected article ignores missing unrelated historical manuscripts",async()=>{
 const store=memoryResearchStore();let input=syntheticBundle();await save(store,input);
 for(const [state,digit] of [['in_review','2'],['ready','3'],['published','4']])input=await advance(store,input,state,digit);
 const index=JSON.parse(store.latest().get('research/index.json'));
 index.items.unshift({slug:'unrelated-study',version:'1.0.0',revision:4,state:'superseded',manifest_sha256:'a'.repeat(64)});
 store.latest().set('research/index.json',JSON.stringify(index));let manuscriptRequests=0;
 const fetchImpl=async url=>{if(url.includes('api.github.com'))return globalThis.Response.json({object:{sha:await store.getHead()}});const path=url.slice(url.indexOf('/research/')+1);if(path.endsWith('.md'))manuscriptRequests++;const raw=store.latest().get(path);return new globalThis.Response(raw??'missing',{status:raw?200:404});};
 const result=await loadResearchLibrary({owner:'synthetic',repo:'fixture',slug:'synthetic-study',version:'1.0.0',fetchImpl});
 assert.equal(result.status,'available');assert.equal(result.items.length,1);assert.equal(manuscriptRequests,4);
 const catalog=await loadResearchLibrary({owner:'synthetic',repo:'fixture',catalog:true,fetchImpl});
 assert.equal(catalog.items.length,1);assert.equal(catalog.partial,true);assert.equal(manuscriptRequests,4);
});
