import assert from 'node:assert/strict';
import test from 'node:test';
import {comparisonTime,sampleAt} from '../src/public/environment-samples.ts';
const sites=[{id:'a',reference_depth_m:18},{id:'b',reference_depth_m:18}];
const columns=[['uo','copernicus-currents','m/s'],['vo','copernicus-currents','m/s'],['wind_direction_10m','open-meteo-wind','degree'],['wave_height','open-meteo-wave','m']];
function fixture(){return {sources:[...new Set(columns.map(x=>x[1]))].map(id=>({id,public_export_allowed:true,reason_codes:[]})),environment_samples:sites.flatMap(site=>columns.flatMap(([variable,source,unit])=>[8,14,20].map(hour=>({site_id:site.id,zone_id:null,depth_m:source.startsWith('copernicus')?18:null,source,variable,unit,value:.1,quality_flags:[],valid_time:`2026-10-08T${String(hour-8).padStart(2,'0')}:00:00Z`})) ))};}
test('all sites and columns share a real timestamp nearest noon, without interpolation',()=>{
 const data=fixture();assert.equal(comparisonTime(data,'2026-10-08',sites),'2026-10-08T06:00:00.000Z');
 assert.equal(sampleAt(data,'2026-10-08',comparisonTime(data,'2026-10-08',sites),'a',18,...columns[0]).value,.1);
 assert.equal(sampleAt(data,'2026-10-08','2026-10-08T04:00:00Z','a',18,...columns[0]),null);
 data.environment_samples=data.environment_samples.filter(r=>!(r.site_id==='b'&&r.variable==='wave_height'&&r.valid_time.includes('T06:')));
 assert.equal(comparisonTime(data,'2026-10-08',sites),'2026-10-08T00:00:00.000Z');
});
test('missing, stale, duplicate and invalid rows never become numeric values',()=>{
 const data=fixture(),at=comparisonTime(data,'2026-10-08',sites);
 const row=data.environment_samples.find(r=>r.site_id==='a'&&r.variable==='uo'&&r.valid_time.includes('T06:'));
 row.quality_flags=['land_cell'];assert.equal(sampleAt(data,'2026-10-08',at,'a',18,...columns[0]),null);
 row.quality_flags=[];data.environment_samples.push({...row});assert.equal(sampleAt(data,'2026-10-08',at,'a',18,...columns[0]),null);
 data.environment_samples.pop();data.sources[0].reason_codes=['stale_required_source'];assert.equal(sampleAt(data,'2026-10-08',at,'a',18,...columns[0]),null);
 data.environment_samples=data.environment_samples.filter(r=>r.variable!=='wave_height');assert.equal(comparisonTime(data,'2026-10-08',sites),null);
 assert.equal(comparisonTime(data,'2026-10-09',sites),null);assert.equal(sampleAt(data,'2026-10-08',null,'a',18,...columns[0]),null);
});
