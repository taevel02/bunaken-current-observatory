import assert from 'node:assert/strict';
import test from 'node:test';
import {URL} from 'node:url';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';

const messages=Object.fromEntries(['ko','en'].map(locale=>[locale,JSON.parse(readFileSync(new URL('../i18n/'+locale+'.json',import.meta.url)))]));
registerHooks({resolve(specifier,context,next){if(specifier==='@/i18n/messages')return {url:'data:text/javascript,export const messages='+encodeURIComponent(JSON.stringify(messages)),shortCircuit:true};return next(specifier,context);}});
const {publicMetadata}=await import('../src/public/metadata.ts');

test('public metadata has localized title, description and reciprocal canonical languages',()=>{
 for(const locale of ['ko','en']){
  const m=publicMetadata(locale);
  assert.ok(m.title.includes(messages[locale].title));assert.ok(m.description.length>0);
  assert.equal(m.robots.index,true);assert.equal(m.alternates.canonical,m.alternates.languages[locale]);
  assert.equal(m.openGraph.url,m.alternates.canonical);assert.equal(m.twitter.card,'summary');
 }
 assert.equal(publicMetadata('ko').alternates.languages['x-default'],'https://bunaken-current-observatory.vercel.app/');
});
test('research canonical preserves audience and explicit release identity with URL escaping',()=>{
 const m=publicMetadata('en',true,'technical',{slug:'study',version:'1.0.1&injected=yes'});
 const u=new URL(m.alternates.canonical);
 assert.equal(u.pathname,'/research');assert.equal(u.searchParams.get('lang'),'en');
 assert.equal(u.searchParams.get('audience'),'technical');assert.equal(u.searchParams.get('version'),'1.0.1&injected=yes');
 assert.equal(u.searchParams.get('injected'),null);
 assert.equal(new URL(m.alternates.languages.ko).searchParams.get('audience'),'technical');
});
