import assert from 'node:assert/strict';
import test from 'node:test';
import {curveSegments,smoothPath,timeSegments} from '#public/chart-curves.mjs';

test('smooth curves pass through data and never overshoot adjacent endpoints',()=>{
  for(const values of [[0,.8,.1,1.4,.3],[.2,.2,.2],[0,0,1],[3,2,1,0]]){
    const points=values.map((y,i)=>({x:i*30,y}));
    for(const s of curveSegments(points)){
      for(let i=0;i<=100;i++){
        const t=i/100,u=1-t,y=u**3*s.from.y+3*u*u*t*s.c1.y+3*u*t*t*s.c2.y+t**3*s.to.y;
        assert.ok(y>=Math.min(s.from.y,s.to.y)-1e-12&&y<=Math.max(s.from.y,s.to.y)+1e-12);
      }
    }
    assert.ok(smoothPath(points).includes(' C'));
  }
  assert.throws(()=>smoothPath([{x:0,y:0},{x:0,y:1}]),/invalid_chart_points/);
});

test('null, duplicate instants and missing slots cannot be bridged',()=>{
  const at=n=>new Date(Date.UTC(2026,9,7,0,n)).toISOString();
  const rows=[{at:at(0),value:.2},{at:at(30),value:null},{at:at(60),value:.3},{at:at(60),value:.4},{at:at(90),value:.5},{at:at(150),value:.6}];
  assert.deepEqual(timeSegments(rows,30).map(s=>s.map(p=>p.value)),[[.2],[.5],[.6]]);
  assert.equal(timeSegments([{at:at(0),value:null}],30).length,0);
});
