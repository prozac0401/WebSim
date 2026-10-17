// Real Chromium checks for a Korean-calendar default year and older saved lives.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;
try {playwright=require('playwright');}
catch {playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-default-year');
const game='/weekend_season2/index.html',storageKey='websim-weekend-season2-v1';
const checks=[],cases=[],errors=[];
fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const saved=page=>page.evaluate(key=>localStorage.getItem(key),storageKey);
const pass=label=>{checks.push(label);console.log('PASS',label);};
async function pageAt(browser,instant,{timezoneId='UTC',mobile=false,save=null}={}) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,timezoneId,reducedMotion:'reduce'});
  // Freeze only zero-argument Date and Date.now; explicit dates, UTC helpers and
  // the browser's native timers remain available to the simulation and autoplay.
  await page.addInitScript(({instant,save,storageKey})=>{
    const NativeDate=Date,now=NativeDate.parse(instant);
    window.Date=class extends NativeDate {
      constructor(...args){super(...(args.length?args:[now]));}
      static now(){return now;}
    };
    let seed=45;window.crypto.getRandomValues=values=>{values[0]=seed++;return values;};
    if(save!==null)localStorage.setItem(storageKey,save);
  },{instant,save,storageKey});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+game);
  await page.waitForFunction(()=>typeof render_game_to_text==='function');
  return page;
}
async function setupYear(page,year) {
  const s=await state(page);
  assert.equal(s.mode,'setup');assert.equal(s.year,year);
  assert.equal(await page.locator('#start-year').inputValue(),String(year));
  assert.equal(s.scene.date,year+'-01-01');
  assert.match(await page.locator('.scene-stamp').innerText(),new RegExp(String(year)));
}
async function startYear(page,year,keyboard=false) {
  if(keyboard){await page.locator('#start-btn').focus();await page.keyboard.press('Enter');}
  else await page.locator('#start-btn').click();
  const s=await state(page);assert.equal(s.mode,'planning');assert.equal(s.year,year);assert.equal(s.date,year+'-01-01');
  assert.equal(JSON.parse(await saved(page)).state.config.year,year);
  assert.match(await page.locator('.play-heading h1').innerText(),new RegExp(year+'년'));
}
async function shot(page,name) {
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
}

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  try {
    for(const timezoneId of ['UTC','America/Los_Angeles']) {
      for(const [instant,year] of [['2026-12-31T14:59:59.000Z',2026],['2026-12-31T15:00:00.000Z',2027]]) {
        const page=await pageAt(browser,instant,{timezoneId});
        await setupYear(page,year);
        const date=await page.evaluate(()=>({localYear:new Date().getFullYear(),instant:new Date().toISOString(),explicit:new Date('2001-02-03T04:05:06.000Z').toISOString(),epoch:new Date(0).getTime(),utc:new Date(Date.UTC(2000,1,29)).toISOString(),parts:[new Date(2024,1,29).getFullYear(),new Date(2024,1,29).getMonth(),new Date(2024,1,29).getDate()]}));
        assert.equal(date.localYear,2026,'both host time zones are still in 2026 at Korean New Year');
        assert.equal(date.instant,instant);assert.equal(date.explicit,'2001-02-03T04:05:06.000Z');assert.equal(date.epoch,0);assert.equal(date.utc,'2000-02-29T00:00:00.000Z');assert.deepEqual(date.parts,[2024,1,29]);
        await startYear(page,year);
        cases.push({instant,timezoneId,localYear:date.localYear,defaultYear:year});
        await page.close();
      }
    }
    pass('the default changes from 2026 to 2027 exactly at Korean midnight, even while UTC and Los Angeles are still in 2026; explicit Date/UTC behavior remains intact');

    for(const [instant,year] of [['2028-02-29T03:00:00.000Z',2028],['2030-08-20T03:00:00.000Z',2030],['2025-06-01T03:00:00.000Z',2026],['2101-06-01T03:00:00.000Z',2100]]) {
      const page=await pageAt(browser,instant,{timezoneId:'America/Los_Angeles'});
      await setupYear(page,year);
      assert.equal(await page.locator('#start-year option').count(),75);
      assert.equal(await page.locator('#start-year option').first().getAttribute('value'),'2026');
      assert.equal(await page.locator('#start-year option').last().getAttribute('value'),'2100');
      await startYear(page,year);
      assert.equal(await page.locator('[role="progressbar"][aria-label="올해 진행"]').getAttribute('aria-valuemax'),year===2028?'366':'365');
      cases.push({instant,timezoneId:'America/Los_Angeles',defaultYear:year});
      await page.close();
    }
    pass('later real years default to 2028 and 2030, leap years retain 366 days, and the existing selectable range remains 2026–2100');

    const manual=await pageAt(browser,'2027-01-01T03:00:00.000Z');
    await setupYear(manual,2027);
    await manual.locator('#start-year').selectOption('2026');
    for(let i=0;i<3;i++){await manual.locator('#reroll-life').click();await setupYear(manual,2026);}
    await manual.locator('#advanced-settings > summary').click();
    for(const preset of ['worker','seeker','graduate','caregiver']) {
      await manual.locator('[data-preset="'+preset+'"]').click();await setupYear(manual,2026);
    }
    await startYear(manual,2026);
    const manualSave=await saved(manual);
    await manual.reload();await setupYear(manual,2027);
    assert.equal(await saved(manual),manualSave,'reopening the setup must preserve the manually selected saved life');
    await manual.locator('#resume-game').click();
    assert.equal((await state(manual)).year,2026);assert.equal((await state(manual)).date,'2026-01-01');
    assert.equal(await saved(manual),manualSave);
    pass('a manually selected 2026 survives rerolls, every preset and start; reload defaults new lives to 2027 while resuming the saved life in 2026');
    await manual.close();

    const source=await pageAt(browser,'2026-12-31T14:59:59.000Z');
    const old=await source.evaluate(()=>{
      const s=S2Engine.create({...S2Data.PRESETS[0].config,year:2026,seed:444},'worker');
      let attempts=0;
      while(s.log.filter(row=>row.type==='daily').length<14&&attempts++<30){const result=S2Engine.advanceAutomatic(s,{maxDays:1,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      const result=S2Storage.save(s);if(!result.ok)throw Error(result.reason);
      return {state:s,text:localStorage.getItem(S2Storage.KEY)};
    });
    assert.equal(old.state.log.filter(row=>row.type==='daily').length,14);
    await source.close();
    const resume=await pageAt(browser,'2027-01-01T03:00:00.000Z',{save:old.text});
    await setupYear(resume,2027);assert.equal(await saved(resume),old.text);
    await resume.locator('#resume-game').click();
    assert.equal((await state(resume)).year,2026);assert.equal((await state(resume)).date,old.state.date);
    assert.equal(await saved(resume),old.text);
    assert.deepEqual(await resume.evaluate(()=>S2Storage.load().state),old.state,'resume must preserve the entire recorded 2026 life');
    await shot(resume,'saved-2026-under-2027');
    await resume.close();
    const imported=await pageAt(browser,'2027-01-01T03:00:00.000Z');
    await setupYear(imported,2027);
    const chooserPromise=imported.waitForEvent('filechooser');await imported.locator('#import-save').click();
    const chooser=await chooserPromise;
    await chooser.setFiles({name:'recorded-2026.json',mimeType:'application/json',buffer:Buffer.from(old.text)});
    await imported.waitForFunction(date=>JSON.parse(render_game_to_text()).date===date,old.state.date);
    assert.equal((await state(imported)).year,2026);
    assert.deepEqual(await imported.evaluate(()=>S2Storage.load().state),old.state,'import must preserve recorded configuration, dates, finance, history and RNG');
    await shot(imported,'imported-2026-under-2027');
    pass('a 2026 life with fourteen recorded days resumes and imports unchanged in real 2027, preserving its year, dates, money, history and RNG');
    await imported.close();

    const mobile=await pageAt(browser,'2026-12-31T15:00:00.000Z',{timezoneId:'America/Los_Angeles',mobile:true});
    await setupYear(mobile,2027);
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await shot(mobile,'default-2027-mobile');
    await startYear(mobile,2027,true);
    await shot(mobile,'started-2027-mobile');
    await mobile.locator('#auto-play').click();
    await mobile.waitForFunction(()=>JSON.parse(render_game_to_text()).date>'2027-01-01');
    await mobile.locator('#auto-play').click();
    const paused=(await state(mobile)).date;
    await mobile.waitForTimeout(800);
    assert.equal((await state(mobile)).date,paused,'native timers and autoplay pause remain functional with the fixed test date');
    assert.equal((await state(mobile)).automatic.active,false);
    assert.equal((await state(mobile)).year,2027);
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    pass('390px mobile opens and starts 2027 by keyboard at Korean New Year, with working autoplay timers, pause and no overflow or browser errors');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,cases,errors},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
