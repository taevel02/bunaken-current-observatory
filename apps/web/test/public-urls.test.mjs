import assert from 'node:assert/strict';
import test from 'node:test';
import {URL} from 'node:url';
import {publicUrl} from '../src/public/urls.ts';
test('public routes retain date, site, model and research language through encoded queries',()=>{
 const home=new URL(publicUrl('', 'en', {date:'2026-10-08',site:'mikes-point',model:'transfer',lang:'ko'}),'https://fixture.test');
 assert.equal(home.pathname,'/');assert.equal(home.searchParams.get('lang'),'en');assert.equal(home.searchParams.get('site'),'mikes-point');assert.equal(home.searchParams.get('model'),'transfer');
 const report=new URL(publicUrl('/research','ko',{slug:'report/one',audience:'technical',version:'1.0.1'}),'https://fixture.test');
 assert.equal(report.pathname,'/research');assert.equal(report.searchParams.get('slug'),'report/one');assert.equal(report.searchParams.get('version'),'1.0.1');
});
