import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMoon, lunarPhaseName} from '../src/server/moon-calculation.ts';

test('moon display sectors distinguish waxing and waning across the phase wrap',()=>{
  assert.deepEqual([0,45,90,135,180,225,270,315,359].map(lunarPhaseName),['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent','New Moon']);
});
test('moon calculation is deterministic without an API and bounded for all displayed dates',()=>{
  const at=new Date('2026-10-10T12:00:00+08:00');
  assert.deepEqual(calculateMoon(at),calculateMoon(new Date('2026-10-10T04:00:00Z')));
  const values=[];
  for(let i=0;i<32;i++){
    const moon=calculateMoon(new Date(at.getTime()+i*86400000));
    assert.ok(moon.illumination>=0&&moon.illumination<=1);
    assert.ok(typeof moon.phase==='string');
    values.push(moon.illumination);
  }
  assert.ok(Math.min(...values)<0.02,'a complete lunar cycle includes a dark phase');
  assert.ok(Math.max(...values)>0.98,'a complete lunar cycle includes a bright phase');
});
