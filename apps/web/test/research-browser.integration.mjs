/* global document, innerWidth -- these names run inside browser callbacks */
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
import { syntheticBundle } from "./fixtures/research.mjs";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(app, "../..");
const fetch = globalThis.fetch;
const setTimeout = globalThis.setTimeout;
const textEvidence = (value) => process.stdout.write(value + "\n");

test("research editing, revision reload, pending retry and responsive preview", { skip: !process.env.BUNAKEN_PLAYWRIGHT_MODULE }, async () => {
 const { chromium } = await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
 const artifacts=process.env.BUNAKEN_UI_ARTIFACT_DIR || path.join(os.tmpdir(), "bunaken-research-browser-artifacts");
 await fs.mkdir(artifacts,{recursive:true});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bunaken-research-ui-')),isolated=path.join(root,'apps/web');
 let server,browser;
 try {
 await fs.cp(app,isolated,{recursive:true,filter:src=>!src.includes('/node_modules')&&!src.includes('/.next')&&!path.basename(src).startsWith('.env')});
 await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.copyFile(path.join(repo,'config/source-registry.json'),path.join(root,'config/source-registry.json'));await fs.symlink(path.join(app,'node_modules'),path.join(isolated,'node_modules'),'dir');
await fs.copyFile(path.join(repo,'config/site-transfer.json'),path.join(root,'config/site-transfer.json'));
await fs.copyFile(path.join(repo,'config/public-release-limits.json'),path.join(root,'config/public-release-limits.json'));
 await fs.cp(path.join(repo,'docs/research/evidence-2026-10-05'),path.join(root,'docs/research/evidence-2026-10-05'),{recursive:true});
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;listener.close();await once(listener,'close');const base=`http://127.0.0.1:${port}`;
 const password='synthetic-only browser verification';const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
 server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:isolated,env:{...process.env,ADMIN_ENABLED:'true',ADMIN_USERNAME:'synthetic-admin',ADMIN_PASSWORD_HASH:hash,ADMIN_AUTH_VERSION:'ui-check',SESSION_SECRET:crypto.randomBytes(32).toString('base64url'),IDEMPOTENCY_SECRET:crypto.randomBytes(32).toString('base64url'),CANONICAL_ORIGIN:base,PUBLIC_OBSERVER_ID:'synthetic-alias',GITHUB_WRITE_TOKEN:'',GITHUB_OWNER:'',GITHUB_REPO:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/public/status')).ok)break;}catch { /* Server startup is polled until ready. */ } await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE || undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080},timezoneId:'America/Los_Angeles'});const page=await context.newPage();
 await page.goto(base+'/ko/admin/login');await page.locator('input[name="username"]').fill('synthetic-admin');await page.locator('input[name="password"]').fill(password);await page.locator('button[type="submit"]').click();await page.waitForURL('**/ko/admin');
 const bundle=syntheticBundle();bundle.release.revision=2;
 let calls=[];
 await page.route('**/api/admin/research?*',route=>route.fulfill({json:{data:bundle}}));
 await page.route('**/api/admin/research',async route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();calls.push({body,key:route.request().headers()['idempotency-key']});
   if(calls.length===1)await route.fulfill({status:503,json:{error:{retryable:true,message_key:'errors.storageUnavailable',field_errors:{}}}});
   else await route.fulfill({json:{data:{release:{...body.release,revision:3},revision:3}}});
  }else await route.fulfill({json:{data:{items:[{slug:bundle.release.slug,version:bundle.release.version,revision:1,state:'draft'}]}}});
 });
 await page.goto(base+'/ko/admin/research');await page.getByRole('button',{name:/synthetic-study/}).click();
 const metadata=page.getByRole('textbox',{name:'연구 정보(JSON)',exact:true});
 const body=page.getByRole('textbox',{name:'전문가용 · 한국어',exact:true});
 await body.waitFor();await page.waitForFunction(()=>document.querySelector('textarea')?.value.includes('synthetic-study'));
 await body.fill('# Synthetic edited draft\n\n{{metrics.observations}}\n');
 assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);
 await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'공개 저장소에 초안 저장',exact:true}).click();await page.getByRole('button',{name:'미확인 요청 재시도',exact:true}).waitFor();
 assert.equal(calls[0].body.expected_revision,2);assert.equal(await body.isDisabled(),true);
 const before=await body.inputValue();await page.getByRole('button',{name:'미확인 요청 재시도',exact:true}).click();
 await page.getByRole('button',{name:'공개 저장소에 초안 저장',exact:true}).waitFor();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(await body.inputValue(),before);
 await page.setViewportSize({width:360,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'미리보기',exact:true}).click();await page.getByRole('heading',{name:'Synthetic edited draft',exact:true}).waitFor();
 assert.match(await metadata.inputValue(),/"revision": 3/);
 textEvidence(JSON.stringify({status:'pass',checks:['latestRevision','editInvalidatesReviews','pendingBlocksEdits','sameKeyBodyRetry','inputPreserved','360pxNoOverflow','preview'],screenshots:['desktop.png','mobile.png']}));
 }finally{await browser?.close();if(server?.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),new Promise(r=>setTimeout(r,3000))]);}await fs.rm(root,{recursive:true,force:true});}
});
