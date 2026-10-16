// Focused, actual Chromium checks for the life indicators and household UI.
// Start a local static server, then set WEBSIM_URL when it is not port 8766.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/weekend-season2-life-ui');
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser = await playwright.chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  const errors=[],checks=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
  const pass=message=>{checks.push(message);console.log('PASS',message);};
  try {
    await page.goto(base+'/weekend_season2/index.html');
    const start=await page.locator('#start-btn').boundingBox();
    assert.ok(start.y+start.height<=844);
    await page.screenshot({path:path.join(output,'setup-mobile.png'),fullPage:true});
    await page.locator('#advanced-settings>summary').click();
    await page.locator('[name=age]').fill('65');
    await page.locator('[name=children]').fill('3');
    // Blur must not replace a just-clicked disclosure and lose the opening click.
    await page.locator('#child-profiles>summary').click();
    await page.locator('[name=child-age-0]').fill('1');
    await page.locator('[name=child-age-1]').fill('22');
    await page.locator('[name=child-gender-1]').selectOption('man');
    await page.locator('[name=child-military-1]').selectOption('serving');
    await page.locator('[name=child-age-2]').fill('35');
    await page.locator('[name=child-gender-2]').selectOption('woman');
    assert.equal(await page.locator('[name=child-military-2]').isDisabled(),true);
    await page.locator('[name=salary]').fill('350.1234');
    await page.locator('[name=externalAllowance]').fill('0');
    await page.locator('[name=startCash]').fill('1000');
    await page.locator('[name=personalBudget]').fill('200');
    await page.locator('[name=careShare]').fill('20');
    await page.locator('#custom-start-btn').click();
    let current=await state();
    assert.equal(current.mode,'planning');
    assert.equal(current.scene.family.visibleChildCount,2);
    assert.equal(current.scene.family.awayChildren.length,1);
    assert.equal(current.scene.family.children.find(child=>child.age===35).ageStage,'adult');
    assert.equal(await page.locator('[data-stat]').count(),6);
    assert.ok(await page.locator('[data-stat=family]').isVisible());
    assert.equal(await page.locator('.slot:visible').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight)<1450);
    const automatic=await page.locator('#auto-play').boundingBox();
    assert.ok(automatic.y+automatic.height<=844);
    await page.screenshot({path:path.join(output,'life-mobile.png'),fullPage:true});
    pass('mobile first-screen start/automatic controls, six indicators, actual child ages and serving absence');

    await page.locator('#auto-preferences>summary').click();
    for(const id of ['study','culture','cleaning']){
      if(!(await state()).preferences.includes(id))await page.locator(`[data-auto-preference="${id}"]`).click();
    }
    await page.locator('[data-auto-preference=cleaning]').scrollIntoViewIfNeeded();
    const listScroll=await page.locator('.auto-preference-grid').evaluate(element=>element.scrollTop);
    await page.locator('[data-auto-preference=cleaning]').click();
    assert.equal(await page.locator('.auto-preference-grid').evaluate(element=>element.scrollTop),listScroll);
    await page.locator('[data-auto-preference=cleaning]').click();
    current=await state();
    for(const id of ['study','culture','cleaning']){
      assert.ok(current.preferences.includes(id));
      assert.equal(await page.locator(`[data-auto-preference="${id}"]`).getAttribute('aria-pressed'),'true');
    }
    await page.screenshot({path:path.join(output,'multiple-preferences.png'),fullPage:false});
    await page.locator('#auto-preferences>summary').click();
    await page.locator('#quick-plan-tools>summary').click();
    await page.locator('#quick-activity').selectOption('cinema');
    await page.locator('#quick-add').click();
    const cinema=(await state()).plan.find(item=>item.activityId==='cinema');
    assert.ok(cinema);
    await page.locator('[data-direction=selfdev]').click();
    current=await state();
    assert.equal(current.direction,'selfdev');
    assert.ok(current.plan.some(item=>item.id===cinema.id));
    await page.locator('#replan-auto').click();
    assert.ok((await state()).plan.some(item=>item.id===cinema.id));
    pass('multiple desired activities, explicit cinema addition and direction replanning preserve the manual plan');

    await page.locator('#manual-tools>summary').click();
    await page.locator('.tab[data-tab=routines]').click();
    await page.locator('#evening-rule-form [name=weekday]').selectOption('5');
    await page.locator('#evening-rule-form button[type=submit]').click();
    current=await state();
    assert.ok(current.reservations.some(item=>item.slot==='evening'&&new Date(item.date+'T12:00:00Z').getUTCDay()===5));
    await page.locator('#auto-play').click();
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).date>='2026-01-04');
    await page.locator('#auto-play').click();
    current=await state();
    assert.equal(current.automatic.active,false);
    const afterAutomatic=await page.evaluate(()=>S2Storage.load().state);
    assert.ok(afterAutomatic.log.some(item=>item.type==='activity'&&item.activityId==='culture'));
    pass('automatic living confirms and completes a weekday evening reservation without another click');

    await page.locator('#save-tools>summary').click();
    await page.locator('#save-game').click();
    const saved=await page.evaluate(()=>S2Storage.load());
    assert.equal(saved.ok,true,saved.reason);
    assert.equal(saved.state.config.salary,3501234);
    const favorites=[...current.preferences];
    await page.reload();
    await page.locator('#resume-game').click();
    current=await state();
    assert.deepEqual(current.preferences,favorites);
    assert.equal(current.scene.family.awayChildren[0].age,22);
    assert.equal(current.direction,'selfdev');
    pass('integer-won input precision and preferences, direction, family survive save/resume');

    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
