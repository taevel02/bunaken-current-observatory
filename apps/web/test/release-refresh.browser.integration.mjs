import assert from 'node:assert/strict';
import process from 'node:process';
import {URL} from 'node:url';
import test from 'node:test';

const configured=process.env.BUNAKEN_PLAYWRIGHT_MODULE&&process.env.BUNAKEN_DASHBOARD_URL;
test('new release refreshes visible dashboards while retaining unsent date and URL state',{skip:!configured},async()=>{
 const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE,headless:true});
 try {
  for(const width of [1280,360])for(const locale of ['ko','en']){
   const page=await browser.newPage({viewport:{width,height:900}});
   const status=await (await page.request.get(process.env.BUNAKEN_DASHBOARD_URL+'/api/public/status')).json();
   let published=status.release_id,polls=0,refreshes=0;
   await page.route('**/api/public/status',async route=>{polls++;await route.fulfill({json:{release_id:published}});});
   const isRefresh=request=>request.headers().rsc==='1'&&request.headers()['next-router-prefetch']!=='1'&&!request.headers()['next-router-segment-prefetch'];
   page.on('request',request=>{if(isRefresh(request))refreshes++;});
   await page.clock.install();
   await page.goto(`${process.env.BUNAKEN_DASHBOARD_URL}/?lang=${locale}&site=mandolin&model=transfer`,{waitUntil:'networkidle'});
   const date=page.locator('form input[type=date]');
   const unsent=await date.getAttribute('max');await date.fill(unsent);
   assert.equal(polls,1);assert.equal(refreshes,0);
   await page.clock.runFor(60000);await page.waitForTimeout(50);
   assert.equal(polls,2);assert.equal(refreshes,0);
   published='synthetic-new-release';
   const refreshed=page.waitForResponse(response=>isRefresh(response.request()));
   await page.clock.runFor(60000);await refreshed;await page.waitForLoadState('networkidle');
   assert.equal(refreshes,1);assert.equal(await date.inputValue(),unsent);
   const url=new URL(page.url());assert.equal(url.searchParams.get('site'),'mandolin');assert.equal(url.searchParams.get('lang'),locale);assert.equal(url.searchParams.get('model'),'transfer');
   const before=polls;
   await page.evaluate(()=>Object.defineProperty(globalThis.document,'visibilityState',{configurable:true,value:'hidden'}));
   await page.clock.runFor(60000);assert.equal(polls,before);
   const resumed=page.waitForResponse('**/api/public/status');
   await page.evaluate(()=>{Object.defineProperty(globalThis.document,'visibilityState',{configurable:true,value:'visible'});globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange'));});
   await resumed;assert.equal(polls,before+1);
   await page.close();
  }
 }finally{await browser.close();}
});
