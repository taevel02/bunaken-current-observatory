import assert from 'node:assert/strict';
import test from 'node:test';
import {releaseChanged} from '../src/public/release-refresh.ts';

test('refresh only after a new published release, including recovery from unavailable data', async()=>{
 const original=globalThis.fetch;
 const originalTimeout=globalThis.AbortSignal.timeout;
 const signal=new globalThis.AbortController().signal;
 try {
  globalThis.AbortSignal.timeout=ms=>{assert.equal(ms,10000);return originalTimeout(ms);};
  let body={release_id:'first'};
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'/api/public/status');assert.equal(options.cache,'no-store');assert.notEqual(options.signal,signal);assert.ok(options.signal instanceof globalThis.AbortSignal);
   return globalThis.Response.json(body);
  };
  assert.equal(await releaseChanged('first',signal),false);
  assert.equal(await releaseChanged(null,signal),true);
  body={release_id:'second'};assert.equal(await releaseChanged('first',signal),true);
  for(const invalid of [null,{}, {release_id:null},{release_id:3}]){
   body=invalid;assert.equal(await releaseChanged('first',signal),false);
  }
  globalThis.fetch=async()=>new globalThis.Response('',{status:503});assert.equal(await releaseChanged('first',signal),false);
  globalThis.fetch=async()=>{throw new Error('offline');};assert.equal(await releaseChanged('first',signal),false);
  const controller=new globalThis.AbortController();
  globalThis.fetch=async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  const pending=releaseChanged('first',controller.signal);controller.abort();assert.equal(await pending,false);
 }finally{globalThis.fetch=original;globalThis.AbortSignal.timeout=originalTimeout;}
});
