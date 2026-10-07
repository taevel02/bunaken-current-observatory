import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {URL} from 'node:url';
import {canonicalTransfer,validTransfer} from '#public/transfer-guard.mjs';
const config=JSON.parse(readFileSync(new URL('../../../config/site-transfer.json',import.meta.url)));
const hash=createHash('sha256').update(canonicalTransfer(config)+'\n').digest('hex');
const sites=['mikes-point','fukui','mandolin','lekuan-2'];
function fixture(){return {config,config_sha256:hash,model_version:config.version,validation_status:'unvalidated',model_context_sha256:'b'.repeat(64),predictions:[{
  prediction:{site_id:'mikes-point',zone_id:null,start_at:'2026-10-07T00:00:00Z',pci:1.2,model_version:config.version,reference_depth_m:18,prediction_status:'experimental',support:'very_low',same_site_days:0,distinct_days:3,n_eff:3,n_eff_days:3,feature_coverage:{total:1},reason_codes:[]},
  donor_sites:['fukui','mandolin','lekuan-2'],donor_site_count:3,n_eff_sites:3,max_site_share:1/3,analog_count:3,validation_status:'unvalidated',config_sha256:hash
}]};}

test('JS config digest agrees with the frozen Python canonical vector',()=>{
 assert.equal(hash,'449630effb68f3ee2ba5d822d45c30f367331cb44811de53743b4762aa0cc3cb');
 assert.equal(validTransfer(fixture(),config,hash,sites),true);
});
test('public reader rejects promoted status, weak donor evidence and swapped configuration',()=>{
 for(const alter of [b=>b.predictions[0].prediction.support='high',b=>b.predictions[0].donor_site_count=2,b=>b.predictions[0].n_eff_sites=1,b=>b.predictions[0].max_site_share=.7,b=>b.predictions[0].prediction.n_eff_days=1,b=>b.model_context_sha256=null,b=>b.predictions[0].donor_sites[0]='mikes-point',b=>b.config.minimum_sites=1,b=>b.predictions.push(b.predictions[0])]){
  const bad=globalThis.structuredClone(fixture());alter(bad);assert.equal(validTransfer(bad,config,hash,sites),false);
 }
});
