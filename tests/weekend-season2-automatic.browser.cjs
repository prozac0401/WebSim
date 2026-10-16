// Actual Chromium timer tests. No simulated-time or engine stepping is used to
// progress the UI; one engine-created event fixture tests optional decisions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;
try{playwright=require('playwright');}catch{playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-automatic');
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  const errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
  const saved=()=>page.evaluate(()=>S2Storage.load());
  const pass=message=>{checks.push(message);console.log('PASS',message);};
  try{
    await page.goto(base+'/weekend_season2/index.html');
    await page.locator('#start-year').selectOption('2028');
    assert.match(await page.locator('.setup-year-note').innerText(),/미확인/);
    await page.locator('#reroll-life').click();
    assert.equal(await page.locator('#start-year').inputValue(),'2028');
    await page.locator('#advanced-settings>summary').click();
    await page.locator('[data-preset=worker]').click();
    assert.equal(await page.locator('#start-year').inputValue(),'2028');
    await page.locator('#advanced-settings>summary').click();
    const start=await page.locator('#start-btn').boundingBox();
    assert.ok(start.y+start.height<=844,'future-year start must fit first mobile viewport');
    await page.screenshot({path:path.join(output,'future-year-setup.png'),fullPage:true});
    await page.locator('#start-btn').click();
    assert.equal((await state()).date,'2028-01-01');
    assert.equal((await state()).scene.date,'2028-01-01');
    assert.equal((await state()).automatic.active,false);
    pass('future year stays selected through reroll/preset, shows unverified holidays and starts on January 1');

    await page.locator('#auto-preferences>summary').click();
    for(const id of (await state()).preferences)await page.locator(`[data-auto-preference="${id}"]`).click();
    for(const id of ['delivery','parttime','sideproject','read'])await page.locator(`[data-auto-preference="${id}"]`).click();
    await page.locator('#auto-preferences>summary').click();
    await page.locator('#manual-tools>summary').click();
    await page.locator('.tab[data-tab=routines]').click();
    await page.locator('#evening-rule-form [name=weekday]').selectOption('5');
    await page.locator('#evening-rule-form button[type=submit]').click();
    const initialRules=(await saved()).state.rules.length;
    assert.equal(initialRules,1);
    await page.locator('#auto-play').click();
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).date>='2028-02-01',{},{timeout:20000});
    let current=await state();
    assert.equal(current.automatic.running,true);
    assert.equal(current.automatic.awaitingDecision,false);
    assert.ok(current.automatic.recentNarration.length>0);
    assert.ok(await page.locator('.automatic-narration').isVisible());
    // Reading the details is not an implicit request to stop automatic living.
    await page.locator('#state-details>summary').click();
    assert.equal((await state()).automatic.active,true);
    await page.locator('#state-details>summary').click();
    await page.locator('#auto-play').click();
    const paused=(await state()).date;
    await page.waitForTimeout(1300);
    assert.equal((await state()).date,paused);
    const firstMonth=(await saved()).state;
    assert.ok(firstMonth.log.some(l=>l.type==='activity'&&l.activityId==='culture'&&l.ruleId));
    assert.ok(firstMonth.log.some(l=>l.type==='automation'));
    await page.screenshot({path:path.join(output,'automatic-month-paused.png'),fullPage:true});
    pass('one start progresses a month, handles choices and recurring classes, narrates real actions and obeys pause');

    await page.locator('#auto-play').click();
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).mode==='finished',{},{timeout:110000});
    current=await state();
    assert.equal(current.automatic.active,false);
    const finished=await saved();
    assert.equal(finished.ok,true,finished.reason);
    assert.equal(finished.state.log.filter(l=>l.type==='daily').length,366);
    assert.ok(finished.state.log.some(l=>l.type==='daily'&&l.date==='2028-02-29'));
    for(const id of ['delivery','parttime','sideproject'])assert.ok(finished.state.log.some(l=>l.type==='activity'&&l.activityId===id),`${id} must really happen`);
    assert.ok(finished.state.finance.ledger.some(l=>l.type==='extra-pay'&&l.kind==='sidejob'));
    await page.screenshot({path:path.join(output,'automatic-leap-yearbook.png'),fullPage:true});
    pass('automatic living reaches a 366-day yearbook without decision clicks, rotating all selected side jobs');

    const fixture=await page.evaluate(()=>{
      const config={...S2Data.PRESETS[0].config,seed:444,preferences:['read','walk']};
      const s=S2Engine.create(config,'worker');
      s.queue.unshift({catalogId:'illness_influenza',date:s.date,context:{}});
      S2Engine.advance(s);
      return {phase:s.phase,pending:s.pendingEvent?.catalogId,save:S2Storage.save(s)};
    });
    assert.equal(fixture.phase,'event');
    assert.equal(fixture.pending,'illness_influenza');
    assert.equal(fixture.save.ok,true,fixture.save.reason);
    await page.reload();
    await page.locator('#resume-game').click();
    assert.equal((await state()).automatic.active,false,'restore must not start a timer');
    await page.locator('#important-decisions').check();
    await page.locator('#auto-play').click();
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).automatic.awaitingDecision);
    current=await state();
    assert.equal(current.automatic.active,true);
    assert.equal(current.automatic.running,false);
    assert.equal(await page.locator('#auto-play').isEnabled(),true);
    assert.ok(await page.locator('.auto-resume-hint').isVisible());
    const waitingDate=current.date;
    await page.waitForTimeout(1200);
    assert.equal((await state()).date,waitingDate);
    await page.screenshot({path:path.join(output,'important-decision-waiting.png'),fullPage:true});
    await page.locator('[data-choice=rest]').click();
    assert.equal((await state()).automatic.active,true);
    assert.equal((await state()).automatic.awaitingDecision,false);
    await page.waitForFunction(date=>JSON.parse(render_game_to_text()).date>date,waitingDate,{timeout:6000});
    await page.locator('#auto-play').click();
    const afterChoice=(await state()).date;
    await page.waitForTimeout(1200);
    assert.equal((await state()).date,afterChoice);
    assert.equal((await saved()).state.flags.autoDecisions,'important');
    await page.reload();
    await page.locator('#resume-game').click();
    assert.equal((await state()).automatic.active,false);
    assert.equal(await page.locator('#important-decisions').isChecked(),true);
    pass('optional important decision waits, resumes automatically after the choice, pauses reliably and restores without autoplay');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
