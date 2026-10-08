/* global document, innerWidth */
import assert from 'node:assert/strict';
import {URL} from 'node:url';
import {readFile,mkdir} from 'node:fs/promises';
import process from 'node:process';
import test from 'node:test';
const configured=process.env.BUNAKEN_PLAYWRIGHT_MODULE&&process.env.BUNAKEN_DASHBOARD_URL&&process.env.BUNAKEN_DATE_ORACLE;
test('today and following dates render real PCI, connected state and shared provider values', {skip:!configured},async()=>{
 const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
 const oracle=JSON.parse(await readFile(process.env.BUNAKEN_DATE_ORACLE,'utf8'));
 const directory=process.env.BUNAKEN_UI_ARTIFACT_DIR||'/private/tmp/bco-date-screens';await mkdir(directory,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE,headless:true});const errors=[];
 try{for(const width of [1920,360])for(const locale of ['ko','en']){
  const messages=JSON.parse(await readFile(new URL('../i18n/'+locale+'.json',import.meta.url),'utf8')).public;
  const page=await browser.newPage({viewport:{width,height:1080}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
  for(const expected of oracle){
   const response=await page.goto(`${process.env.BUNAKEN_DASHBOARD_URL}/${locale}?date=${expected.day}&model=baseline`,{waitUntil:'networkidle'});assert.equal(response.status(),200);
   await page.waitForFunction(()=>{const svg=document.querySelector('main section svg[role="img"]');return svg&&Math.abs(svg.viewBox.baseVal.width-Math.max(280,Math.round(svg.getBoundingClientRect().width)))<=1;});
   assert.equal(await page.locator('select[name="site"] option').count(),20);
   assert.equal(await page.locator('main section').first().locator('svg[role="img"] circle').count(),expected.numeric);
   assert.equal(await page.getByText(messages.dataAvailable,{exact:true}).count(),1);
   assert.equal(await page.getByText(messages.modelPending,{exact:true}).count(),0);
   assert.equal(await page.getByText(messages.forecastUnvalidated,{exact:false}).count(),1);
   const clock=new Intl.DateTimeFormat(locale,{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(expected.at));
   assert.equal(await page.getByText(`${messages.environmentAt} ${clock} WITA`,{exact:true}).count(),1);
   const row=page.locator('main tbody tr').filter({has:page.locator(`a[href*="site=${expected.firstSite}"]`)});
   assert.equal(await row.locator('td').nth(3).textContent(),expected.u.toFixed(2));assert.equal(await row.locator('td').nth(4).textContent(),expected.v.toFixed(2));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(expected===oracle[0])await page.screenshot({path:`${directory}/${locale}-${width}-today.png`,fullPage:true});
  }await page.close();
 }assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({viewports:[1920,360],locales:['ko','en'],dates:oracle.map(x=>x.day),errors})+'\n');}
 finally{await browser.close();}
});
