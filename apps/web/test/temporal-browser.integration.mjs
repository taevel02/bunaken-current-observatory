/* global document, innerWidth */
import {mkdtemp,cp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
const {fetch,setTimeout}=globalThis;
const app=resolve('apps/web');

test('native temporal inputs fit new and correction forms on mobile', {skip:!process.env.BUNAKEN_PLAYWRIGHT_MODULE},async()=>{
 const root=await mkdtemp(join(tmpdir(),'bco-temporal-'));const isolated=join(root,'apps/web');let server,browser;
 try {
  await cp(app,isolated,{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/.next')&&!p.split('/').at(-1).startsWith('.env')});
  await symlink(join(app,'node_modules'),join(isolated,'node_modules'),'dir');await cp(resolve('config'),join(root,'config'),{recursive:true});
  // This public test-only route exists solely in the temporary fixture, never in production.
  await mkdir(join(isolated,'app/temporal-fixture'),{recursive:true});
  await writeFile(join(isolated,'app/temporal-fixture/page.tsx'),`import {ObservationWorkspace} from '@/app/admin/observations/observation-workspace';export default function Page(){return <ObservationWorkspace locale="ko" observerAlias="synthetic-layout" today="2026-10-10"/>;}`);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;listener.close();await once(listener,'close');const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[join(app,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:isolated,env:{PATH:process.env.PATH,HOME:process.env.HOME,ADMIN_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
  for(let i=0;i<150;i++){try{if((await fetch(base+'/api/public/status')).ok)break;}catch{/* Startup pending. */}await new Promise(r=>setTimeout(r,200));}
  const engines=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);const engine=process.env.BUNAKEN_BROWSER_ENGINE||'chromium';
  browser=await engines[engine].launch({headless:true,executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE||undefined});
  const context=await browser.newContext({viewport:{width:360,height:800},...(engine==='webkit'?{isMobile:true,hasTouch:true}:{})});const page=await context.newPage();
  const row={id:'4f6f6c58-84a8-4dd5-b882-8ce58ee14b38',revision:1,site_id:'mandolin',local_start:'2026-10-03T11:00',local_end:'2026-10-03T11:50',overall_pci:0.3,peak_events:[],vertical:{direction:'unknown',intensity:null},confidence:'normal',time_precision:'reported_minute',record_status:'active',use_for_model:true,representative_depth_m:18,notes_public:''};
  await page.route('**/api/admin/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:{data:route.request().url().includes('/session')?{observer_alias:'synthetic-layout'}:route.request().url().includes('?')?{items:[row],next_cursor:null}:row}});});
  await page.goto(base+'/temporal-fixture');await page.locator('[name=create_date]').waitFor();await page.getByRole('button',{name:/Mandolin|만돌린/}).first().click();await page.locator('article details > summary').first().click();
  for(const lang of ['ko','en'])for(const width of [360,375,390]) {
   await page.setViewportSize({width,height:800});if(lang==='en')await page.getByRole('link',{name:'English',exact:true}).click();
   await page.addStyleTag({content:'input[type=date],input[type=time],input[type=datetime-local]{font-size:24px!important}'});
   await page.locator('[name=create_start_time]').fill('11:06');await page.locator('[name=create_end_time]').fill('11:56');
   const boxes=await page.locator('input[type=date],input[type=time],input[type=datetime-local]').evaluateAll(inputs=>inputs.filter(input=>input.getClientRects().length).map(input=>{const box=input.getBoundingClientRect(),label=input.closest('label').getBoundingClientRect();return {name:input.name||input.type,width:box.width,labelWidth:label.width,right:box.right,labelRight:label.right,scroll:input.scrollWidth,client:input.clientWidth};}));
   assert.ok(boxes.length>=6);for(const box of boxes){assert.ok(box.width<=box.labelWidth+1,`temporal input exceeds label: ${JSON.stringify(box)}`);assert.ok(box.right<=box.labelRight+1,`temporal input spills: ${JSON.stringify(box)}`);assert.ok(box.scroll<=box.client+1,`temporal input content overflows: ${JSON.stringify(box)}`);}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   process.stdout.write(JSON.stringify({engine,lang,width,boxes})+'\n');
   if(process.env.BUNAKEN_UI_ARTIFACT_DIR){await mkdir(process.env.BUNAKEN_UI_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BUNAKEN_UI_ARTIFACT_DIR,`${engine}-${lang}-${width}.png`),fullPage:true});}
  }
 }finally{await browser?.close();if(server?.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),new Promise(r=>setTimeout(r,3000))]);}await rm(root,{recursive:true,force:true});}
});
