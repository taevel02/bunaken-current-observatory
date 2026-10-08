/* global document, innerWidth */
import {mkdtemp,cp,symlink,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import {sites} from '@bunaken/contracts/sites';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(app,'../..');
const delay=ms=>new Promise(resolve=>globalThis.setTimeout(resolve,ms));

test('experimental view, Site selection, environment units and locale survive on desktop and mobile',{skip:!process.env.BUNAKEN_PLAYWRIGHT_MODULE},async()=>{
 const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
 const artifacts=process.env.BUNAKEN_UI_ARTIFACT_DIR||path.join(tmpdir(),'bunaken-transfer-ui');await mkdir(artifacts,{recursive:true});
 const root=await mkdtemp(path.join(tmpdir(),'bunaken-transfer-fixture-')),isolated=path.join(root,'apps/web');let server,browser;
 try{
  await cp(app,isolated,{recursive:true,filter:src=>!src.includes('/node_modules')&&!src.includes('/.next')&&!path.basename(src).startsWith('.env')});
  await cp(path.join(repo,'config'),path.join(root,'config'),{recursive:true});
  await cp(path.join(repo,'docs/research/evidence-2026-10-05'),path.join(root,'docs/research/evidence-2026-10-05'),{recursive:true});
  await symlink(path.join(app,'node_modules'),path.join(isolated,'node_modules'),'dir');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000));
  const midnight=Date.parse(`${day}T00:00:00+08:00`),stamp=ms=>new Date(ms).toISOString();
  const predictions=[],estimates=[],tides=[],environment=[];
  for(const [index,site] of sites.entries()){
   for(let slot=0;slot<16;slot++){
    const base={site_id:site.id,zone_id:null,start_at:stamp(midnight+8*3600000+slot*1800000),reference_depth_m:18,pci:site.id==='mikes-point'?null:.3+.1*Math.sin(slot*.5+index*.1),reason_codes:site.id==='mikes-point'?['missing_same_site']:[],support:site.id==='mikes-point'?'insufficient':'very_low',prediction_status:site.id==='mikes-point'?'insufficient':'experimental',model_version:'weighted-analog-v1.3'};
    predictions.push(base);estimates.push({prediction:{...base,pci:.32+.11*Math.sin(slot*.5+index*.1),reason_codes:[],support:'very_low',prediction_status:'experimental',model_version:'site-transfer-v1'},donor_sites:['fukui','mandolin','lekuan-2'],donor_site_count:3});
   }
   for(let slot=0;slot<48;slot++)tides.push({site_id:site.id,zone_id:null,valid_time:stamp(midnight+slot*1800000),value:.6*Math.sin(slot*Math.PI/12),quality_flags:['synthetic'],source:'fes-height',unit:'m',variable:'tide_height'});
   for(const hour of [2,8,14,20])for(const variable of ['uo','vo'])environment.push({site_id:site.id,zone_id:null,valid_time:stamp(midnight+hour*3600000),value:.1+hour*.01,quality_flags:['synthetic'],source:'copernicus-currents',depth_m:18,unit:'m/s',variable});
  }
  const observations=Array.from({length:5},(_,index)=>({id:`synthetic-only-${index}`,site_id:index<3?'fukui':'mandolin',local_start:day+'T08:00',overall_pci:.3,record_status:'active',label_scope:'dive_overall',revision:1}));
  const data={forecast_kind:'experimental',schema_version:'1.2',sites,generated_at:stamp(Date.now()),source_generated_at:stamp(Date.now()),valid_start:stamp(midnight),valid_end:stamp(midnight+86400000),predictions,tides,environment_samples:environment,observations,sources:['fes-height','copernicus-currents'].map(id=>({id,public_export_allowed:true,reason_codes:[]})),experimental_transfer:{model_version:'site-transfer-v1',validation_status:'unvalidated',predictions:estimates},anchor_similarity:{value:null,environment_restored:false,validated:false,reason_codes:[]}};
  await writeFile(path.join(isolated,'src/server/public-release.ts'),`export async function loadPublicRelease(){return ${JSON.stringify({data,status:'available',reason:null,releaseId:'synthetic-ui-only'})};}\n`);
  await writeFile(path.join(isolated,'src/server/moon.ts'),'export async function loadMoon(){return null;}\n');
  await writeFile(path.join(isolated,'src/server/research-public.mjs'),'export async function loadResearchCatalog(){return {status:"available",items:[],withdrawn:[],partial:true};} export async function loadResearchLibrary(){throw new Error("unexpected_body_load");}\n');
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;listener.close();await once(listener,'close');const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:isolated,env:{...process.env,ADMIN_ENABLED:'false',GITHUB_WRITE_TOKEN:'',GITHUB_OWNER:'',GITHUB_REPO:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
  let ready=false;for(let i=0;i<150;i++){try{if((await globalThis.fetch(base+'/api/public/status')).ok){ready=true;break;}}catch{/* startup */}await delay(200);}assert.ok(ready,'local fixture server did not start');
  browser=await chromium.launch({headless:true,executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'America/Los_Angeles'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/?lang=ko&date=${day}`);await page.getByRole('img').first().waitFor();
  const panes=page.locator('[data-dashboard-workspace] section');
  assert.ok((await panes.nth(1).boundingBox()).x>(await panes.first().boundingBox()).x);
  assert.match(await page.locator('tbody tr').first().innerText(),/Fukui/);
  await page.locator('select[name=model]').selectOption('transfer');await page.getByRole('button',{name:'조회',exact:true}).click();
  await page.getByText(/다른 Site의 관측으로 추정한 미검증 PCI/).waitFor();assert.match(page.url(),/model=transfer/);
  assert.ok(await page.locator('svg path[d*=" C"]').count()>0);
  await page.locator('tbody a').filter({hasText:"Mike's Point"}).click();await page.waitForURL(url=>url.searchParams.get('site')==='mikes-point');
  assert.match(await page.getByRole('img').first().getAttribute('aria-label'),/16\/16/);
  assert.match(await page.locator('svg circle title').first().textContent(),/Mike's Point.*PCI/);
  await page.screenshot({path:path.join(artifacts,'desktop-selected-site.png'),fullPage:true});
  await page.locator('select[name=model]').selectOption('baseline');await page.getByRole('button',{name:'조회',exact:true}).click();await page.getByText('숫자 PCI 제공 조건 미충족',{exact:true}).waitFor();assert.match(await page.getByRole('img').first().getAttribute('aria-label'),/0\/16/);
  await page.locator('select[name=model]').selectOption('transfer');await page.getByRole('button',{name:'조회',exact:true}).click();await page.getByText(/다른 Site의 관측으로 추정한 미검증 PCI/).waitFor();
  assert.equal(await page.getByRole('img').count(),3);
  await page.getByRole('link',{name:'English',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('lang')==='en');assert.match(page.url(),/site=mikes-point/);assert.match(page.url(),/model=transfer/);
  await page.setViewportSize({width:360,height:800});await page.screenshot({path:path.join(artifacts,'mobile-workspace.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.goto(base+'/research?lang=en');const messages=JSON.parse(await readFile(path.join(app,'i18n/en.json'),'utf8'));await page.getByText(messages.research.unavailable,{exact:true}).waitFor();assert.equal(await page.getByText(messages.research.empty,{exact:true}).count(),0);
  process.stdout.write(JSON.stringify({status:'pass',fixture:'synthetic only, never published',screenshots:artifacts,checks:['ranking','1920TwoPane','transferOptIn','baselineAbstention','smoothPath','selectedSite','threeSignals','localeState','360NoOverflow']})+'\n');
 }finally{await browser?.close();if(server?.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),delay(3000)]);}await rm(root,{recursive:true,force:true});}
});
