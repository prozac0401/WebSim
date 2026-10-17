// Chromium integration for age-limited new graduate lives and older saved lives.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const D=require('../weekend_season2/data.js');
let playwright;
try {playwright=require('playwright');}
catch {playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-roles');
const game='/weekend_season2/index.html',checks=[],errors=[],evidence={};
fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const stored=page=>page.evaluate(()=>S2Storage.load().state);
const pass=label=>{checks.push(label);console.log('PASS',label);};
async function makePage(browser,{mobile=false,seeds=[45],save=null}={}) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
  await page.addInitScript(({seeds,save})=>{
    const NativeDate=Date,instant='2027-01-01T03:00:00Z';
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return new NativeDate(instant).getTime();}};
    let index=0;window.crypto.getRandomValues=values=>{values[0]=seeds[Math.min(index++,seeds.length-1)];return values;};
    if(save!==null)localStorage.setItem('websim-weekend-season2-v1',save);
  },{seeds,save});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+game);await page.waitForFunction(()=>typeof render_game_to_text==='function');return page;
}
async function openAdvanced(page){if(!await page.locator('#advanced-settings').evaluate(element=>element.open))await page.locator('#advanced-settings > summary').click();}
async function field(page,name,value){await page.locator(`[name="${name}"]`).fill(String(value));await page.locator(`[name="${name}"]`).press('Tab');}
async function shot(page,name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  try {
    // Select representative seeds rather than asserting a population percentage
    // from a tiny browser sample; distribution accuracy belongs to model tests.
    const selected=[];let graduate=null;
    for(let seed=0;seed<10000&&(graduate===null||selected.length<8);seed++){
      const config=D.generateLife(seed).config;
      if(config.role==='graduate'&&graduate===null)graduate=seed;
      if(config.age>46&&seed%4===2&&selected.length<8)selected.push(seed);
    }
    assert.notEqual(graduate,null,'the lower-probability model must still generate a graduate');
    const seeds=[graduate,...selected],page=await makePage(browser,{seeds});
    const generated=[];
    for(let index=0;index<seeds.length;index++){
      if(index)await page.locator('#reroll-life').click();
      const expected=D.generateLife(seeds[index]).config;
      const actual=await page.evaluate(()=>({age:Number(document.querySelector('[name="age"]').value),role:document.querySelector('[name="role"]').value,year:JSON.parse(render_game_to_text()).year,save:localStorage.getItem('websim-weekend-season2-v1')}));
      assert.equal(actual.age,expected.age);assert.equal(actual.role,expected.role);assert.equal(actual.year,2027);assert.equal(actual.save,null);
      if(actual.age>46)assert.notEqual(actual.role,'graduate');
      assert.ok(actual.role!=='graduate'||actual.age<=46);
      generated.push({seed:seeds[index],age:actual.age,role:actual.role});
    }
    assert.equal(generated[0].role,'graduate');assert.ok(generated.slice(1).every(life=>life.age>46));
    await page.locator('#start-year').selectOption('2026');await page.locator('#reroll-life').click();assert.equal((await state(page)).year,2026);
    evidence.generated=generated;
    pass('representative generated lives include an eligible graduate and eight older lives with other roles; rerolls preserve the Korean current year or chosen year without writing a save');

    await page.locator('#life-basis > summary').click();
    const roleBasis=await page.locator('[data-role-basis]').innerText();
    assert.match(roleBasis,/46/);assert.match(roleBasis,/2%/);assert.match(roleBasis,/게임|가정|모형/);assert.match(roleBasis,/실제/);
    assert.equal(await page.evaluate(()=>localStorage.getItem(S2Storage.KEY)),null);
    await page.waitForFunction(()=>!document.querySelector('#notice')?.classList.contains('visible'));
    await page.locator('[data-role-basis]').screenshot({path:path.join(output,'role-generation-basis.png')});
    evidence.roleBasis=roleBasis;
    pass('the visible generation explanation identifies the two-percent eligible-age probability and the 46-year game limit as model assumptions');

    await openAdvanced(page);await page.locator('[data-preset="graduate"]').click();await field(page,'age',46);
    assert.equal(await page.locator('[name="role"]').inputValue(),'graduate');
    assert.equal(await page.locator('[name="role"] option[value="graduate"]').evaluate(option=>option.disabled),false);
    await page.locator('#custom-start-btn').click();
    assert.equal((await state(page)).mode,'planning');const boundary=await stored(page);
    assert.equal(boundary.config.age,46);assert.equal(boundary.config.role,'graduate');assert.equal(boundary.config.year,2026);
    await page.reload();await page.locator('#resume-game').click();assert.deepEqual(await stored(page),boundary);
    await shot(page,'graduate-age46-desktop');
    pass('a deliberately configured 46-year-old graduate can start and resume with the exact saved life');

    const restricted=await makePage(browser,{mobile:true});await openAdvanced(restricted);
    await restricted.locator('[data-preset="graduate"]').click();await field(restricted,'age',47);
    assert.equal(await restricted.locator('[name="role"]').inputValue(),'graduate','age edits must not silently change the chosen role');
    assert.equal(await restricted.locator('[name="age"]').getAttribute('max'),'46');
    assert.equal(await restricted.locator('[name="age"]').evaluate(input=>input.validity.rangeOverflow),true);
    assert.match(await restricted.locator('[data-role-age-note]').innerText(),/46/);
    await restricted.locator('#custom-start-btn').click();
    assert.equal((await state(restricted)).mode,'setup');assert.equal(await restricted.evaluate(()=>localStorage.getItem(S2Storage.KEY)),null);
    assert.equal(await restricted.locator('[name="age"]').inputValue(),'47');assert.equal(await restricted.locator('[name="role"]').inputValue(),'graduate');
    await shot(restricted,'graduate-age47-guard-mobile');
    await restricted.locator('[name="role"]').selectOption('worker');
    assert.equal(await restricted.locator('[name="age"]').getAttribute('max'),'100');
    await restricted.locator('#custom-start-btn').click();assert.equal((await state(restricted)).mode,'planning');
    assert.equal((await stored(restricted)).config.age,47);assert.equal((await stored(restricted)).config.role,'worker');
    pass('mobile new-life setup rejects a 47-year-old graduate with an age hint and no silent coercion or save, while changing to another role allows the same age to start');

    const legacy=await page.evaluate(()=>{
      const config={...S2Data.PRESETS.find(p=>p.id==='graduate').config,year:2026,age:59,seed:444,children:0,childProfiles:[],childAge:'none',preferences:['research'],startCash:10000000,personalBudget:1000000};
      const s=S2Engine.create(config,'graduate');
      const plan=S2Engine.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:'research',payment:'cash'});if(!plan.ok)throw Error(plan.reason);
      let attempts=0;while(s.log.filter(row=>row.type==='daily').length<2&&attempts++<20){const result=S2Engine.advanceAutomatic(s,{maxDays:1,decisions:'auto'});if(!result.ok)throw Error(result.reason);}
      const valid=S2Storage.save(s);if(!valid.ok)throw Error(valid.reason);
      return {state:s,serialized:S2Storage.serialize(s),raw:localStorage.getItem(S2Storage.KEY)};
    });
    assert.ok(legacy.state.log.some(row=>row.type==='activity'&&row.activityId==='research'));assert.equal(legacy.state.config.age,59);
    await page.reload();assert.equal((await state(page)).year,2027);assert.equal(await page.evaluate(()=>localStorage.getItem(S2Storage.KEY)),legacy.raw);
    await page.locator('#resume-game').click();assert.deepEqual(await stored(page),legacy.state);
    assert.equal(await page.evaluate(()=>localStorage.getItem(S2Storage.KEY)),legacy.raw);
    evidence.legacy={age:legacy.state.config.age,role:legacy.state.config.role,date:legacy.state.date,logCount:legacy.state.log.length,rng:legacy.state.rng};
    pass('an existing 59-year-old graduate with real research and daily records resumes without changing age, role, money, random streams or history');

    const mobile=await makePage(browser,{mobile:true});
    const chooserPromise=mobile.waitForEvent('filechooser');await mobile.locator('#import-save').click();const chooser=await chooserPromise;
    await chooser.setFiles({name:'older-graduate.json',mimeType:'application/json',buffer:Buffer.from(legacy.serialized)});
    await mobile.waitForFunction(()=>JSON.parse(render_game_to_text()).mode!=='setup');assert.deepEqual(await stored(mobile),legacy.state);
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await shot(mobile,'older-graduate-import-mobile');
    await mobile.reload();await mobile.locator('#resume-game').focus();await mobile.keyboard.press('Enter');assert.deepEqual(await stored(mobile),legacy.state);
    pass('mobile import and keyboard resume preserve the complete older graduate save without horizontal overflow');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,evidence,errors},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
