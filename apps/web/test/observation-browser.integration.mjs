/* global document, innerWidth, indexedDB -- these names run inside browser callbacks */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import * as crypto from "node:crypto";
import process from "node:process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import argon2 from "argon2";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(app, "../..");
const fetch = globalThis.fetch;
const setTimeout = globalThis.setTimeout;
const textEvidence = (value) => process.stdout.write(value + "\n");

test("observation browser flow and legacy draft recovery", { skip: !process.env.BUNAKEN_PLAYWRIGHT_MODULE }, async () => {
 const { chromium } = await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
 const artifacts=process.env.BUNAKEN_UI_ARTIFACT_DIR || path.join(os.tmpdir(), "bunaken-observation-browser-artifacts");
 await fs.mkdir(artifacts,{recursive:true});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bunaken-observation-ui-')),isolated=path.join(root,'apps/web');
 let server,browser;
 try {
 await fs.cp(app,isolated,{recursive:true,filter:src=>!src.includes('/node_modules')&&!src.includes('/.next')&&!path.basename(src).startsWith('.env')});
 await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.copyFile(path.join(repo,'config/source-registry.json'),path.join(root,'config/source-registry.json'));await fs.symlink(path.join(app,'node_modules'),path.join(isolated,'node_modules'),'dir');
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;listener.close();await once(listener,'close');const base=`http://127.0.0.1:${port}`;
 const password='synthetic-only browser verification';const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
 server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:isolated,env:{...process.env,ADMIN_ENABLED:'true',ADMIN_USERNAME:'synthetic-admin',ADMIN_PASSWORD_HASH:hash,ADMIN_AUTH_VERSION:'ui-check',SESSION_SECRET:crypto.randomBytes(32).toString('base64url'),IDEMPOTENCY_SECRET:crypto.randomBytes(32).toString('base64url'),CANONICAL_ORIGIN:base,PUBLIC_OBSERVER_ID:'synthetic-alias',GITHUB_WRITE_TOKEN:'',GITHUB_OWNER:'',GITHUB_REPO:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/public/status')).ok)break;}catch { /* Server startup is polled until ready. */ } await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE || undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080},timezoneId:'America/Los_Angeles'});const page=await context.newPage();
 await page.goto(base+'/ko/admin/login');await page.locator('input[name="username"]').fill('synthetic-admin');await page.locator('input[name="password"]').fill(password);await page.locator('button[type="submit"]').click();await page.waitForURL('**/ko/admin');
 // Read-only synthetic fixtures; all writes intercepted. No GitHub credentials.
 const row={id:'4f6f6c58-84a8-4dd5-b882-8ce58ee14b38',revision:1,site_id:'mandolin',local_start:'2026-10-03T11:00',local_end:'2026-10-03T11:50',overall_pci:0.3,peak_events:[],vertical:{direction:'unknown',intensity:null},confidence:'normal',time_precision:'reported_minute',record_status:'active',use_for_model:true,representative_depth_m:18,notes_public:''};
 let release;const gate=new Promise(r=>release=r);let captured;
 await page.route('**/api/admin/observations?*',async route=>{await gate;await route.fulfill({json:{data:{items:[row],next_cursor:null}}});});
 await page.route('**/api/admin/observations/'+row.id,route=>route.fulfill({headers:{etag:'"obs:'+row.id+':rev:1"'},json:{data:row}}));
 await page.route('**/api/admin/observations',async route=>{if(route.request().method()==='POST'){captured=route.request().postDataJSON();await route.fulfill({status:503,json:{error:{code:'storage_unavailable'}}});}else await route.continue();});
 await page.goto(base+'/ko/admin');await page.getByText('관측 기록을 불러오는 중', {exact:false}).waitFor();assert.equal(await page.getByText('아직 표시할 기록이 없습니다.',{exact:true}).count(),0);release();await page.getByRole('button',{name:/Mandolin|만돌린/}).first().waitFor();
 assert.equal(await page.locator("[name=representative_depth_m]").inputValue(),"18");assert.equal(await page.locator("[name=representative_depth_m]").getAttribute("required"),"");
 const date=page.locator('[name=create_date]');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(await date.inputValue(),today);
 await page.locator('[name=create_start_time]').fill('11:06');assert.equal(await page.locator('[name=create_end_time]').inputValue(),'11:56');assert.equal(await page.locator('[name=create_end_time]').getAttribute('required'),'');
 await page.locator('[name=create_end_time]').fill('12:10');await page.locator('[name=create_start_time]').fill('11:10');assert.equal(await page.locator('[name=create_end_time]').inputValue(),'12:10');
 await page.locator('[name=create_end_time]').fill('10:50');assert.ok(await page.getByRole('alert').count());await page.locator('[name=site_id]').selectOption('mandolin');await page.locator('[name=overall_pci]').fill('1.2');await page.locator('form button').filter({hasText:'공개 저장'}).first().click();assert.equal(captured,undefined);
 await page.locator('[name=create_start_time]').fill('23:40');await page.locator('[name=create_end_time]').fill('00:30');await page.locator('[name=create_end_day]').locator('..').locator('input[type=checkbox]').check();
 await page.locator('[name=site_id]').selectOption('mandolin');await page.locator('[name=overall_pci]').fill('1.2');
 await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
 await page.getByRole('button',{name:/Mandolin|만돌린/}).first().click();await page.locator('article details > summary').first().click();await page.locator('[name=correct_start_time]').fill('12:00');
 await page.getByRole('button',{name:/Mandolin|만돌린/}).first().click();await page.waitForFunction(()=>document.querySelector('[name=correct_start_time]')?.value==='11:00');assert.equal(await page.locator('[name=correct_start_time]').inputValue(),'11:00');assert.equal(await page.locator('article legend').count(),0);
 await page.setViewportSize({width:360,height:800});await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const submit=page.locator('form button[type=submit],form button').filter({hasText:/공개 저장/}).first();await submit.click();await page.waitForTimeout(700);assert.ok(captured);assert.ok(captured.local_end>captured.local_start);assert.equal(captured.overall_pci,1.2);assert.equal(captured.representative_depth_m,18);assert.equal(await page.locator('[name=create_start_time]').inputValue(),'23:40');
 await page.goto(base+'/ko/admin');
 const legacy={...row,id:'6f6f6c58-84a8-4dd5-b882-8ce58ee14b38',timezone:'Asia/Makassar',zone_id:'legacy-zone',route_description:'legacy-route',local_start:'2026-10-01T11:00',local_end:'2026-10-03T12:00',vertical_onset:{local_at:'2026-10-03T11:20',at:null,depth_m:18},peak_events:[{id:'41ea51b8-6e14-474c-8fe4-43b25c98b35c',pci:0.4,local_at:'2026-10-02T11:20',at:null,depth_m:18,zone_id:null,duration_description:null,context_description:'synthetic preserved event',vertical_direction:'unknown',vertical_intensity:null}]};
 legacy.peak_events.push({...legacy.peak_events[0],id:'51ea51b8-6e14-474c-8fe4-43b25c98b35c',pci:0.5});
 await page.evaluate(async(payload)=>{const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('bunaken-observation-drafts',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({id:'active',payload,key:'7e1cd78a-79f8-4fa3-a6f2-4414e37d4490',savedAt:Date.now()});tx.oncomplete=resolve;tx.onerror=reject;});db.close();},legacy);
 await page.locator('[name=draft_consent]').check();await page.getByRole('button',{name:'저장 전 입력 불러오기'}).first().click();await page.waitForFunction(()=>document.querySelector('[name=create_date]')?.value==='2026-10-01');
 await page.locator('details').filter({hasText:'복원된 기존 Peak 사건'}).locator('summary').click();await page.locator('[data-restored-peak] input[type=number]').first().fill('0.6');
 await page.waitForFunction(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('bunaken-observation-drafts',1);q.onsuccess=()=>r(q.result)});const result=await new Promise(r=>{const q=db.transaction('drafts').objectStore('drafts').get('active');q.onsuccess=()=>r(q.result)});db.close();return result?.payload?.peak_events?.[0]?.pci===0.6;});
 await page.getByRole('button',{name:'기존 Peak 사건 제거'}).nth(1).click();
 await page.waitForFunction(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('bunaken-observation-drafts',1);q.onsuccess=()=>r(q.result)});const result=await new Promise(r=>{const q=db.transaction('drafts').objectStore('drafts').get('active');q.onsuccess=()=>r(q.result)});db.close();return result?.payload?.peak_events?.length===1;});
 await page.locator('[name=draft_consent]').uncheck();assert.equal(await page.locator('[name=vertical_onset_day]').inputValue(),'2');
 await page.locator('form button').filter({hasText:'공개 저장'}).first().click();await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===true);await page.waitForTimeout(400);assert.equal(captured.zone_id,'legacy-zone');assert.equal(captured.route_description,'legacy-route');assert.equal(captured.peak_events[0].pci,0.6);assert.equal(captured.vertical_onset.local_at,'2026-10-03T11:20');assert.equal(captured.local_end,'2026-10-03T12:00');
 textEvidence(JSON.stringify({status:'pass',checks:['required18mDepth','loading','todayWita','50minutes','manualEnd','invalidEnd','overnight','reselectReset','emptyPeakHidden','360pxNoOverflow','failedSavePreservesInput','restoredPeakPersistence','restoredPeakDeletionPersistence','consentKeepsMetadata','multiDayOnsetPreserved'],screenshots:['desktop.png','mobile.png']}));
 }finally{await browser?.close();if(server?.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),new Promise(r=>setTimeout(r,3000))]);}await fs.rm(root,{recursive:true,force:true});}
});
