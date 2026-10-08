/* global document, innerWidth */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {URL} from 'node:url';
import process from 'node:process';
import test from 'node:test';
const configured=process.env.BUNAKEN_PLAYWRIGHT_MODULE&&process.env.BUNAKEN_DASHBOARD_URL&&process.env.BUNAKEN_WORKSPACE_ORACLE;
test('two pane workspace selects sites without leaving root and retains live environmental data', {skip:!configured},async()=>{
 const {chromium}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
 const oracle=JSON.parse(await readFile(process.env.BUNAKEN_WORKSPACE_ORACLE,'utf8'));
 const directory=process.env.BUNAKEN_UI_ARTIFACT_DIR||'/private/tmp/bco-workspace-screens';await mkdir(directory,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE,headless:true});const errors=[];
 try{for(const width of [1920,375,360])for(const locale of ['ko','en']){
  const messages=JSON.parse(await readFile(new URL('../i18n/'+locale+'.json',import.meta.url),'utf8')).public;
  const page=await browser.newPage({viewport:{width,height:1080}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
  for(const expected of oracle){
   await page.goto(`${process.env.BUNAKEN_DASHBOARD_URL}/?lang=${locale}&date=${expected.day}&site=${expected.site}&model=baseline`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-dashboard-workspace] svg[role="img"]')].every(svg=>Math.abs(svg.viewBox.baseVal.width-Math.max(280,Math.round(svg.getBoundingClientRect().width)))<=1));
   assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('main tbody tr').count(),19);
   assert.equal(await page.locator('[data-dashboard-workspace] svg').count(),3);
   const svgHeights=await page.locator('[data-dashboard-workspace] svg').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(svgHeights.every(height=>height===176));
   const graph=page.locator('[data-dashboard-workspace] section').nth(1);
   const spacing=await graph.evaluate(section=>{const charts=[...section.querySelectorAll('svg')],titles=[...section.querySelectorAll('h3')];return {title:charts.map((chart,index)=>chart.getBoundingClientRect().top-titles[index].getBoundingClientRect().bottom),between:charts.slice(0,-1).map((chart,index)=>titles[index+1].getBoundingClientRect().top-chart.getBoundingClientRect().bottom)};});assert.ok(spacing.title.every(gap=>Math.abs(gap-8)<=1));assert.ok(spacing.between.every(gap=>gap>=16));
   assert.equal(await graph.locator('svg').first().locator('circle').count(),expected.numeric);
   assert.equal(await page.getByText(messages.dataAvailable,{exact:true}).count(),1);
   const heights=await page.locator('form input[type=date],form select,form button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(heights.every(height=>height===44));
   if(width===1920){const metadata=await page.locator('header [role=status]').boundingBox();const menu=await page.locator('header nav a').first().boundingBox();assert.ok(metadata.x+metadata.width<=menu.x);const button=await page.locator('form button').boundingBox();const dates=await page.getByRole('navigation',{name:messages.date,exact:true}).boundingBox();assert.ok(dates.x>=button.x+button.width&&dates.x-button.x-button.width<=32);}
   assert.equal(await page.getByText(messages.modelPending,{exact:true}).count(),0);
   assert.equal(await page.locator('main details').count(),0);
   const row=page.locator('main tbody tr').filter({has:page.locator(`a[href*="site=${expected.site}"]`)});
   assert.equal(await row.locator('td').nth(3).textContent(),expected.u.toFixed(2));assert.equal(await row.locator('td').nth(4).textContent(),expected.v.toFixed(2));
   assert.ok(await graph.locator('svg').nth(1).locator('circle').count()>0);assert.ok(await graph.locator('svg').nth(2).locator('path').count()>0);
   const tableBounds=await page.locator('[data-dashboard-workspace] section').first().boundingBox(),graphBounds=await graph.boundingBox();
   if(width===1920){assert.ok(graphBounds.x>tableBounds.x+tableBounds.width);const footer=await page.locator("footer").boundingBox();assert.ok(footer.y+footer.height<=1080,"source credits must fit the desktop viewport");}else assert.ok(graphBounds.y>tableBounds.y);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(expected===oracle[0])await page.screenshot({path:`${directory}/${locale}-${width}-overview.png`,fullPage:true});
  }
  const siteLink=page.locator('main tbody a').filter({hasText:"Mike's Point"});await siteLink.click();await page.waitForURL(url=>url.searchParams.get('site')==='mikes-point');assert.equal(new URL(page.url()).pathname,'/');
  assert.ok((await page.locator('[data-dashboard-workspace] section').nth(1).locator('h2').textContent()).includes("Mike's Point"));
  const language=new URL(await page.locator(`a[lang="${locale==='ko'?'en':'ko'}"]`).getAttribute('href'),process.env.BUNAKEN_DASHBOARD_URL);assert.equal(language.pathname,'/');assert.equal(language.searchParams.get('site'),'mikes-point');
  const links=await page.locator('header nav a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname));assert.ok(links.every(path=>path==='/'||path==='/research'));
  await page.goto(`${process.env.BUNAKEN_DASHBOARD_URL}/research?lang=${locale}`,{waitUntil:'networkidle'});assert.ok(await page.locator('article h1, article h2').count()>0);
  await page.locator('a[href*="audience=technical"]').click();await page.waitForURL(url=>url.searchParams.get('audience')==='technical');assert.equal(new URL(page.url()).pathname,'/research');assert.ok(await page.locator('article').textContent());
  await page.close();
 }assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({viewports:[1920,375,360],locales:['ko','en'],dates:oracle.map(x=>x.day),errors})+'\n');}
 finally{await browser.close();}
});
