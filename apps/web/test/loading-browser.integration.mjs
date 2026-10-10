/* global document */
import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {fetch,TextDecoder}=globalThis;
import {performance} from 'node:perf_hooks';
import {cp,mkdtemp,readFile,writeFile,symlink,rm,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import net from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
const {setTimeout}=globalThis;
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
  const beforeWorkspace=html.slice(0,html.indexOf('data-dashboard-workspace'));
  assert.ok(beforeWorkspace.includes('data-dashboard-toolbar'),'controls must precede loaded data');
  assert.ok(beforeWorkspace.includes('data-dashboard-pending'),'only pending data regions should be skeletons');
  assert.ok(beforeWorkspace.includes('name="date"'),'date must be available before data');
  assert.ok(beforeWorkspace.includes('Lekuan 1'),'Site names must be visible while data is pending');
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


test('pending data retains static controls and an unsent date edit', {skip:!process.env.BUNAKEN_PLAYWRIGHT_MODULE},async()=>{
 const app=resolve('apps/web');const root=await mkdtemp(join(tmpdir(),'bco-pending-'));const isolated=join(root,'apps/web');let server,browser;
 try {
  await cp(app,isolated,{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/.next')&&!p.split('/').at(-1).startsWith('.env')});
  await symlink(join(app,'node_modules'),join(isolated,'node_modules'),'dir');await cp(resolve('config'),join(root,'config'),{recursive:true});
  // Test-only latency in the temporary copy; no production service or credential.
  const reader=join(isolated,'src/server/public-release.ts');const source=await readFile(reader,'utf8');
  const entry='export const loadPublicRelease = cache(async (day?: string) => {';assert.ok(source.includes(entry));
  await writeFile(reader,source.replace(entry,entry+'\n await new Promise(resolve=>setTimeout(resolve,5000));'));
  await writeFile(join(isolated,'src/server/moon.ts'),'import "server-only"; export async function loadMoon(){return null;}');
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;listener.close();await once(listener,'close');const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[join(app,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:isolated,env:{PATH:process.env.PATH,HOME:process.env.HOME,ADMIN_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
  for(let i=0;i<150;i++){try{if((await fetch(base+'/api/public/status')).ok)break;}catch{/* Startup pending. */}await new Promise(r=>setTimeout(r,200));}
  const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
  browser=await chromium.launch({headless:true,executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  for(const lang of ['ko','en']){
  await page.setViewportSize({width:1920,height:1080});await page.goto(base+'/?lang='+lang,{waitUntil:'commit'});
  const date=page.locator('[data-dashboard-toolbar] input[name=date]');await date.waitFor();
  const today=await date.getAttribute('min');await date.fill(today);
  assert.equal(await page.locator('[data-dashboard-pending]').count(),1);
  assert.equal(await page.locator('[data-dashboard-pending] tbody th').count(),19);
  assert.ok(await page.locator('[data-dashboard-pending] tbody td').evaluateAll(cells=>cells.every(cell=>cell.textContent.trim()==='')));
  assert.equal(await page.locator('[data-dashboard-pending] h3').count(),3);
  if(process.env.BUNAKEN_UI_ARTIFACT_DIR){await mkdir(process.env.BUNAKEN_UI_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BUNAKEN_UI_ARTIFACT_DIR,`pending-${lang}-1920.png`),fullPage:true});}
  await page.setViewportSize({width:360,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  if(process.env.BUNAKEN_UI_ARTIFACT_DIR)await page.screenshot({path:join(process.env.BUNAKEN_UI_ARTIFACT_DIR,`pending-${lang}-360.png`),fullPage:true});
  await page.locator('[data-dashboard-workspace]').waitFor();assert.equal(await date.inputValue(),today,'data completion must not reset an unapplied date');
  }
 }finally{await browser?.close();if(server?.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),new Promise(r=>setTimeout(r,3000))]);}await rm(root,{recursive:true,force:true});}
});


test('date navigation hides previous data until the requested server day arrives', {skip:!enabled}, async()=>{
  const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE||undefined});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(process.env.BUNAKEN_LOADING_URL);
    await page.locator('[data-dashboard-workspace]').waitFor({timeout:60000});
    const date=page.locator('[data-dashboard-toolbar] input[name=date]');
    const today=await date.getAttribute('min');const tomorrow=await date.inputValue();
    assert.notEqual(today,tomorrow,'fixture must start on tomorrow');
    let release;let intercepted;
    const waiting=new Promise(resolve=>{intercepted=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/*_rsc*',async route=>{intercepted();await gate;await route.continue();});
    await page.getByRole('link',{name:'오늘',exact:true}).click();await waiting;
    await page.waitForFunction(today=>document.querySelector('input[name=date]')?.value===today,today,{timeout:2500});
    assert.equal(await page.locator('[data-dashboard-pending]').count(),1);
    assert.equal(await page.locator('[data-dashboard-workspace]').count(),0);
    assert.equal(await page.locator('[data-dashboard-pending] tbody th').count(),19);
    assert.ok(await page.locator('[data-dashboard-pending] tbody td').evaluateAll(cells=>cells.every(cell=>cell.textContent.trim()==='')));
    const site=page.locator('[data-dashboard-pending] tbody th a').nth(4);
    const selectedSite=new URL(await site.getAttribute('href'),page.url()).searchParams.get('site');
    assert.equal(new URL(await site.getAttribute('href'),page.url()).searchParams.get('date'),today);
    await site.click();
    if(process.env.BUNAKEN_UI_ARTIFACT_DIR){await mkdir(process.env.BUNAKEN_UI_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BUNAKEN_UI_ARTIFACT_DIR,'date-pending-390.png'),fullPage:true});}
    release();await page.locator('[data-dashboard-workspace]').waitFor({timeout:60000});
    assert.equal(await page.locator('[data-dashboard-workspace]').getAttribute('data-dashboard-day'),today);
    assert.equal(new URL(page.url()).searchParams.get('date'),today);
    assert.equal(new URL(page.url()).searchParams.get('site'),selectedSite);
    await date.fill(tomorrow);await page.getByRole('button',{name:'조회',exact:true}).click();
    await page.waitForFunction(day=>document.querySelector('[data-dashboard-workspace]')?.getAttribute('data-dashboard-day')===day,tomorrow,{timeout:60000});
    assert.equal(new URL(page.url()).searchParams.get('date'),tomorrow);
    await page.goBack();await page.waitForFunction(day=>document.querySelector('[data-dashboard-workspace]')?.getAttribute('data-dashboard-day')===day,today,{timeout:60000});
  } finally {await browser.close();}
});
