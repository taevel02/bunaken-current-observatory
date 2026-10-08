import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import process from 'node:process';
import test from 'node:test';

const hash=raw=>createHash('sha256').update(raw).digest('hex');
test('date selection retains today after latest advances, preserves freshness and rejects tampering',async()=>{
 const hooks=registerHooks({resolve(s,c,next){if(s.startsWith('@config/'))return {url:new URL('../../../config/'+s.slice(8),import.meta.url).href,shortCircuit:true};return next(s,c);},load(u,c,next){if(u.includes('/config/')&&u.endsWith('.json'))return {format:'module',shortCircuit:true,source:'export default '+readFileSync(new URL(u),'utf8')};return next(u,c);}});
 const savedFetch=globalThis.fetch,savedNow=Date.now,env={GITHUB_OWNER:process.env.GITHUB_OWNER,GITHUB_REPO:process.env.GITHUB_REPO};
 const history='a'.repeat(40),current='b'.repeat(40),files=new Map();
 function pack(id,start,ref){
  const payload={schema_version:'1.1',forecast_kind:'experimental',generated_at:'2026-10-07T18:00:00Z',source_generated_at:'2026-10-07T17:00:00Z',valid_start:start,valid_end:new Date(Date.parse(start)+7*86400000).toISOString(),sites:JSON.parse(readFileSync(new URL('../../../packages/contracts/data/sites.json',import.meta.url))),predictions:[],tides:[],environment_samples:[],observations:[],sources:[],anchor_similarity:{value:null,environment_restored:false,validated:false,reason_codes:['anchor_environment_unavailable']}};
  const raw=gzipSync(JSON.stringify(payload)),prefix='releases/'+id+'/';
  const manifest=Buffer.from(JSON.stringify({schema_version:'1.1',release_id:id,generated_at:payload.generated_at,source_data_commit_sha:'c'.repeat(40),snapshot_ids:[],status:'published',files:[{path:'dashboard.json.gz',sha256:hash(raw)}]}));
  files.set(ref+'/latest.json',Buffer.from(JSON.stringify({schema_version:'1.0',release_id:id,manifest_sha256:hash(manifest)})));files.set(ref+'/'+prefix+'manifest.json',manifest);files.set(ref+'/'+prefix+'dashboard.json.gz',raw);return ref+'/'+prefix+'dashboard.json.gz';
 }
 const oldId='11111111-1111-4111-8111-111111111111',newId='22222222-2222-4222-8222-222222222222';
 const oldPath=pack(oldId,'2026-10-07T16:00:00Z',history);pack(newId,'2026-10-08T16:00:00Z','data');pack(newId,'2026-10-08T16:00:00Z',current);
 let apiStatus=200,requests=[];
 try {
  process.env.GITHUB_OWNER='fixture';process.env.GITHUB_REPO='synthetic';Date.now=()=>Date.parse('2026-10-08T00:00:00Z');
  globalThis.fetch=async url=>{requests.push(String(url));if(String(url).startsWith('https://api.github.com/'))return new globalThis.Response(JSON.stringify([{sha:current},{sha:history}]),{status:apiStatus});const key=String(url).split('/synthetic/')[1]?.replace('/web/','/');return new globalThis.Response(files.get(key)??'',{status:files.has(key)?200:404});};
  const {loadPublicRelease}=await import('../src/server/public-release.ts');
  assert.equal((await loadPublicRelease()).releaseId,newId);
  assert.equal((await loadPublicRelease('2026-10-08')).releaseId,oldId);
  requests=[];assert.equal((await loadPublicRelease('2026-10-09')).releaseId,newId);assert.ok(!requests.some(url=>url.includes('api.github.com')));
  Date.now=()=>Date.parse('2026-10-09T10:00:00Z');assert.equal((await loadPublicRelease('2026-10-08')).status,'stale');
  Date.now=()=>Date.parse('2026-10-08T00:00:00Z');apiStatus=403;assert.equal((await loadPublicRelease('2026-10-08')).reason,'date_history_unavailable');apiStatus=200;
  files.set(oldPath,Buffer.from('tampered'));assert.equal((await loadPublicRelease('2026-10-08')).status,'unavailable');
  assert.equal((await loadPublicRelease('2026-02-30')).status,'unavailable');
 }finally{globalThis.fetch=savedFetch;Date.now=savedNow;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}hooks.deregister();}
});
