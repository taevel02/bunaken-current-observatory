import assert from 'node:assert/strict';
import test from 'node:test';
import {countSiteObservations} from '../src/public/observation-counts.ts';
test('counting preserves legacy row counts and distinct active observation mode',()=>{
 const observations=[{id:'a',site_id:'one',record_status:'active'},{id:'a',site_id:'one',record_status:'corrected'},{id:'b',site_id:'two',record_status:'withdrawn'},{id:'c',site_id:'two',record_status:'active'}];
 assert.deepEqual([...countSiteObservations(observations)],[['one',2],['two',1]]);
 assert.deepEqual([...countSiteObservations(observations,{distinctIds:true})],[['one',1],['two',1]]);
 assert.deepEqual([...countSiteObservations([])],[]);
});
