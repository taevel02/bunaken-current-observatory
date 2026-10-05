import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {syntheticBundle,hash} from './fixtures/research.mjs';
import {RESEARCH_DOCUMENTS,researchBody,validateResearchBundle} from '@bunaken/contracts/research';
test('local bundle CLI creates a validated unreviewed draft and never overwrites',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bunaken-research-cli-'));
 try{
  const bundle=syntheticBundle();await writeFile(join(root,'metadata.json'),JSON.stringify(bundle.release));await writeFile(join(root,'results.json'),JSON.stringify(bundle.results));
  for(const name of RESEARCH_DOCUMENTS)await writeFile(join(root,name),researchBody(bundle.documents[name],bundle.release,name));
  const args=['apps/web/scripts/create-research-bundle.mjs','--metadata',join(root,'metadata.json'),'--results',join(root,'results.json'),'--documents',root,'--output',join(root,'bundle.json')];
  const created=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(created.status,0,created.stderr);assert.match(created.stdout,/draft bundle validated/);
  const saved=JSON.parse(await readFile(join(root,'bundle.json'),'utf8'));assert.equal(saved.release.state,'draft');assert.ok(Object.values(saved.release.reviews).every(value=>value===false));assert.equal(validateResearchBundle(saved.release,saved.documents,saved.results,hash),true);
  const repeated=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(repeated.status,1);assert.deepEqual(JSON.parse(await readFile(join(root,'bundle.json'),'utf8')),saved);
 }finally{await rm(root,{recursive:true,force:true});}
});
