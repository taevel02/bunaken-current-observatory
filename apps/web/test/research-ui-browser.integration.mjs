/* global document, innerWidth */
import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const enabled=Boolean(process.env.BUNAKEN_UI_URL&&process.env.BUNAKEN_PLAYWRIGHT_MODULE);
async function launch(){
  const {chromium,webkit}=await import(process.env.BUNAKEN_PLAYWRIGHT_MODULE);
  const safari=process.env.BUNAKEN_BROWSER_ENGINE==='webkit';
  return (safari?webkit:chromium).launch({headless:true,...(process.env.BUNAKEN_BROWSER_EXECUTABLE?{executablePath:process.env.BUNAKEN_BROWSER_EXECUTABLE}:{})});
}
test('moon remains visible and follows the selected WITA date in both languages',{skip:!enabled},async()=>{
  const browser=await launch();
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    for(const lang of ['ko','en']){
      await page.goto(process.env.BUNAKEN_UI_URL+'/?lang='+lang,{waitUntil:'commit'});
      const moon=page.locator('[data-moon-date]');await moon.waitFor({timeout:30000});
      assert.match(await moon.textContent(),lang==='ko'?/달:.*%/:/Moon:.*%/);
      const date=page.locator('input[name=date]');const today=await date.getAttribute('min');
      await page.getByRole('link',{name:lang==='ko'?'오늘':'Today',exact:true}).click();
      await page.waitForFunction(today=>document.querySelector('[data-moon-date]')?.getAttribute('data-moon-date')===today,today,{timeout:60000});
      assert.equal(await moon.locator('svg').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  }finally{await browser.close();}
});
test('research mobile tabs stack and long references wrap with real public links',{skip:!enabled},async()=>{
  const browser=await launch();
  try{
    const page=await browser.newPage();
    for(const lang of ['ko','en'])for(const audience of ['guide','technical'])for(const width of [360,390,1920]){
      await page.setViewportSize({width,height:1080});
      await page.goto(`${process.env.BUNAKEN_UI_URL}/research?lang=${lang}&audience=${audience}`);
      await page.locator('article').waitFor({timeout:60000});
      const tabs=page.locator('nav').filter({has:page.locator('a[href*="audience=guide"]')}).last().locator('a');
      const boxes=await tabs.evaluateAll(items=>items.map(item=>({top:item.getBoundingClientRect().top,bottom:item.getBoundingClientRect().bottom})));
      assert.equal(boxes.length,2);
      if(width<640)assert.ok(boxes[1].top>=boxes[0].bottom,'mobile tabs must stack');
      else assert.equal(boxes[0].top,boxes[1].top,'desktop tabs remain a row');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${lang}/${audience}/${width} must not overflow`);
      assert.ok(await page.locator('article a[href^="https://"]').count()>0,'bare references must become real links');
      if(audience==='technical')assert.match(await page.locator('article a[href*="config/geometry.json"]').getAttribute('href'),/^https:\/\/github\.com\/taevel02\/bunaken-current-observatory\/blob\/[a-f0-9]{40}\/config\/geometry\.json$/);
      if(process.env.BUNAKEN_UI_ARTIFACT_DIR&&width===390){await mkdir(process.env.BUNAKEN_UI_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BUNAKEN_UI_ARTIFACT_DIR,`research-${lang}-${audience}-${width}.png`),fullPage:true});}
    }
  }finally{await browser.close();}
});
