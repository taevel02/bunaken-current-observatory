/* global document */
import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {fetch,TextDecoder}=globalThis;
import {performance} from 'node:perf_hooks';
const enabled=Boolean(process.env.BUNAKEN_LOADING_URL&&process.env.BUNAKEN_PLAYWRIGHT_MODULE);

test('dashboard streams a real skeleton before the loaded workspace', {skip:!enabled}, async()=>{
  const start=performance.now();const response=await fetch(process.env.BUNAKEN_LOADING_URL);
  assert.equal(response.status,200);
  const decoder=new TextDecoder();let html='',skeleton=null,workspace=null;
  for await(const bytes of response.body){
    html+=decoder.decode(bytes,{stream:true});
    if(skeleton===null&&html.includes('data-loading-skeleton'))skeleton=performance.now()-start;
    if(workspace===null&&html.includes('data-dashboard-workspace'))workspace=performance.now()-start;
  }
  assert.notEqual(skeleton,null,'loading skeleton missing');assert.notEqual(workspace,null,'loaded workspace missing');assert.ok(skeleton<=workspace);
  console.log(JSON.stringify({skeleton_ms:Math.round(skeleton),workspace_ms:Math.round(workspace)}));
});
test('Site selection works offline without an RSC fetch and retains URL state', {skip:!enabled},async()=>{
  const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,...(process.env.BUNAKEN_BROWSER_EXECUTABLE?{executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await page.goto(process.env.BUNAKEN_LOADING_URL,{waitUntil:'networkidle'});
    const original=await page.locator('[data-dashboard-workspace] section').nth(1).locator('h2').textContent();
    const link=page.locator('tbody th a:not([aria-current=true])').first();
    const name=await link.textContent();const href=await link.getAttribute('href');assert.ok(name&&name!==original);
    let requests=0;await page.route('**/*',route=>{requests++;return route.abort();});
    const start=performance.now();await link.click();
    await page.waitForFunction(name=>document.querySelectorAll('[data-dashboard-workspace] section')[1]?.querySelector('h2')?.textContent===name,name,{timeout:2500});
    const elapsed=performance.now()-start;assert.equal(requests,0);assert.ok(elapsed<1000);
    assert.equal(new URL(page.url()).searchParams.get('site'),new URL(href,page.url()).searchParams.get('site'));
    const english=await page.locator('header a[lang=en]').getAttribute('href');assert.equal(new URL(english,page.url()).searchParams.get('site'),new URL(page.url()).searchParams.get('site'));
    await page.goBack();await page.waitForFunction(original=>document.querySelectorAll('[data-dashboard-workspace] section')[1]?.querySelector('h2')?.textContent===original,original);
    console.log(JSON.stringify({site_selection_ms:Math.round(elapsed),network_requests:requests}));
  }finally{await browser.close();}
});
