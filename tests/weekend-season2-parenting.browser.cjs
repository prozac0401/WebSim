// Chromium integration for age-specific parenting and automatic grooming cadence.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;
try {playwright=require('playwright');}
catch {playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-parenting');
const game='/weekend_season2/index.html',planner='/weekend_recovery_simulator/weekend_recovery_simulator.html';
const bands=[{ages:[0,2],ids:['baby_feed','baby_change','baby_sleep']},{ages:[3,6],ids:['preschool_hygiene','preschool_play','preschool_ready']},{ages:[7,12],ids:['school_homework','school_reading','school_tidy']}];
const ids=bands.flatMap(band=>band.ids),checks=[],errors=[],evidence={};
fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const stored=page=>page.evaluate(()=>S2Storage.load().state);
const pass=label=>{checks.push(label);console.log('PASS',label);};
async function makePage(browser,mobile=false) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  await page.addInitScript(()=>{const NativeDate=Date;window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:['2026-10-17T12:00:00+09:00']));}static now(){return new NativeDate('2026-10-17T12:00:00+09:00').getTime();}};window.crypto.getRandomValues=values=>{values[0]=45;return values;};});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+game);await page.waitForFunction(()=>typeof render_game_to_text==='function');return page;
}
async function reveal(page,target) {
  const closed=await target.evaluate(element=>[...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(element)&&!details.open&&!details.querySelector(':scope > summary')?.contains(element)).map(({index})=>index));
  for(const index of closed)await page.locator('details').nth(index).locator(':scope > summary').click();
}
async function click(page,selector){const target=page.locator(selector);await reveal(page,target);await target.click();}
async function shot(page,name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
async function loadLife(page,ages,preferences=[]) {
  const result=await page.evaluate(({ages,preferences})=>{
    const config={...S2Data.PRESETS[0].config,year:2026,age:40,gender:'man',maritalStatus:'married',children:ages.length,childAge:ages.length?S2Data.childStage(Math.min(...ages)):'none',childProfiles:ages.map((age,i)=>({age,gender:i%2?'woman':'man',militaryStatus:'none'})),careShare:100,startCash:20000000,personalBudget:10000000,salary:4000000,preferences,seed:444};
    return S2Storage.save(S2Engine.create(config,'worker'));
  },{ages,preferences});
  assert.equal(result.ok,true,result.reason);await page.reload();await page.locator('#resume-game').click();assert.equal((await state(page)).mode,'planning');
}
async function quickAdd(page,id) {
  const before=(await state(page)).plan;
  await reveal(page,page.locator('#quick-activity'));await page.locator('#quick-activity').selectOption(id);await click(page,'#quick-add');
  const added=(await state(page)).plan.filter(item=>!before.some(old=>old.id===item.id));assert.equal(added.length,1,id+' must add one manual plan');return added[0];
}

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  try {
    const desktop=await makePage(browser);
    await click(desktop,'[data-preset="worker"]');
    await desktop.locator('[name="children"]').fill('1');await desktop.locator('[name="childAge"]').selectOption('toddler');
    await reveal(desktop,desktop.locator('[name="child-age-0"]'));
    for(const age of [2,6,12,13]) {
      await desktop.locator('[name="child-age-0"]').fill(String(age));
      const eligible=bands.filter(band=>age>=band.ages[0]&&age<=band.ages[1]).flatMap(band=>band.ids);
      for(const id of ids)assert.equal(await desktop.locator(`#setup-form [name="preferences"][value="${id}"]`).isDisabled(),!eligible.includes(id),`setup age ${age} preference ${id}`);
    }
    for(const ages of [[0],[2],[3],[6],[7],[12],[13],[]]) {
      await loadLife(desktop,ages);
      const eligible=bands.filter(band=>ages.some(age=>age>=band.ages[0]&&age<=band.ages[1])).flatMap(band=>band.ids);
      assert.deepEqual((await desktop.locator('[data-parenting-add]').evaluateAll(items=>items.map(item=>item.dataset.parentingAdd))).sort(),eligible.slice().sort());
      for(const id of ids) {
        const enabled=eligible.includes(id);
        assert.equal(await desktop.locator(`[data-auto-preference="${id}"]`).isDisabled(),!enabled,`age ${ages} preference ${id}`);
        assert.equal(await desktop.locator(`#quick-activity option[value="${id}"]`).evaluate(option=>option.disabled),!enabled,`age ${ages} quick option ${id}`);
        assert.equal(await desktop.locator(`[data-activity="${id}"]`).isDisabled(),!enabled,`age ${ages} manual card ${id}`);
      }
      if(ages[0]===0){
        await click(desktop,'.tab[data-tab="routines"]');
        for(const id of ids)assert.equal(await desktop.locator(`#rule-form [name="activityId"] option[value="${id}"]`).evaluate(option=>option.disabled),!eligible.includes(id));
        await click(desktop,'.tab[data-tab="planner"]');
        await reveal(desktop,desktop.locator('[data-parenting-add="baby_feed"]'));await shot(desktop,'infant-choices-desktop');
      }
    }
    pass('ages 0/2, 3/6 and 7/12 enable only their three parenting tasks; age 13 and no children disable all nine across quick, preference and manual controls');

    await loadLife(desktop,[1,5,10]);
    assert.equal(await desktop.locator('[data-parenting-add]').count(),9);
    for(const id of ids) {
      const before=(await state(desktop)).plan;
      await click(desktop,`[data-parenting-add="${id}"]`);
      const added=(await state(desktop)).plan.filter(item=>!before.some(old=>old.id===item.id));
      assert.equal(added.length,1);assert.equal(added[0].activityId,id);assert.ok(!added[0].automatic);
      await click(desktop,`.slot[data-date="${added[0].date}"][data-slot="${added[0].slot}"]`);
      assert.deepEqual((await state(desktop)).plan,before,'removing one task leaves the previous plan unchanged');
    }
    await click(desktop,'[data-parenting-add="baby_feed"]');
    const manual=(await state(desktop)).plan[0];
    assert.equal(manual.slot,'morning');
    const beforeRestore=await stored(desktop);
    await desktop.reload();await desktop.locator('#resume-game').click();
    assert.deepEqual(await stored(desktop),beforeRestore,'new task IDs and mixed child ages survive saved restore unchanged');
    for(let attempts=0;attempts<20&&(await state(desktop)).mode!=='review';attempts++) {
      if((await state(desktop)).mode==='event')await desktop.locator('[data-choice]').first().click();
      else await click(desktop,'#step-week');
    }
    const actual=await desktop.evaluate(({id,date})=>{
      const s=S2Storage.load().state,a=S2Data.ACTIVITY_MAP[id],logs=s.log.filter(row=>row.date===date);
      const care=logs.filter(row=>row.type==='care'),blocks=logs.filter(row=>row.type==='time'&&row.slot==='morning').reduce((sum,row)=>sum+row.minutes,0);
      return {mode:s.phase,activity:logs.find(row=>row.type==='activity'&&row.activityId===id),care,minutes:a.minutes,prep:a.prep,travel:S2Engine.travelMinutes(s,a),baseline:care.reduce((sum,row)=>sum+row.minutes,0),blocks};
    },{id:'baby_feed',date:manual.date});
    assert.equal(actual.mode,'review');assert.ok(actual.activity);assert.equal(actual.care.length,1);
    assert.equal(actual.care[0].minutes,actual.baseline);
    assert.equal(actual.activity.careOverlapMinutes,Math.min(actual.minutes,actual.baseline));
    assert.equal(actual.activity.minutes,actual.prep+actual.travel+Math.max(actual.minutes,actual.baseline)+actual.blocks);
    evidence.overlap=actual;
    pass('mixed-age families can add and remove all nine tasks; saved tasks restore, execute, and overlap the once-daily baseline care without counting those minutes twice');

    await loadLife(desktop,[1,5,10]);
    const kept=await quickAdd(desktop,'read');
    await click(desktop,'[data-direction="family"]');
    let plan=(await state(desktop)).plan;
    assert.deepEqual(plan.find(item=>item.id===kept.id),kept,'family replanning preserves a manual appointment');
    assert.equal(plan.filter(item=>item.automatic&&ids.includes(item.activityId)).length,1);
    await shot(desktop,'mixed-parenting-auto-desktop');
    const rotation=await desktop.evaluate(()=>{
      const config={...S2Storage.load().state.config,preferences:[]};
      const s=S2Engine.create(config,'worker');let attempts=0;
      while(s.date<'2026-02-02'&&attempts++<20){const result=S2Engine.advanceAutomatic(s,{direction:'family',maxDays:7,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      const logs=s.log.filter(row=>row.type==='activity'&&S2Data.ACTIVITY_MAP[row.activityId].parenting);
      const byWeek={};for(const log of logs){const day=S2Calendar.day(log.date),week=S2Calendar.addDays(log.date,-((day+6)%7));(byWeek[week]??=[]).push(log.activityId);}
      const absent=[[],[13]].map(ages=>{const config={...s.config,children:ages.length,childProfiles:ages.map(age=>({age,gender:'man',militaryStatus:'none'})),childAge:ages.length?'teen':'none'};const life=S2Engine.create(config,'worker');const result=S2Engine.prepareAutoWeek(life,{direction:'family'});if(!result.ok)throw Error(result.reason);return life.plan.filter(item=>S2Data.ACTIVITY_MAP[item.activityId].parenting);});
      return {byWeek,logs:logs.map(({date,activityId})=>({date,activityId})),absent};
    });
    assert.ok(rotation.logs.length>=3);assert.ok(new Set(rotation.logs.map(row=>row.activityId)).size>=3);
    assert.ok(Object.values(rotation.byWeek).every(items=>items.length===1));assert.deepEqual(rotation.absent,[[],[]]);
    evidence.rotation=rotation;
    pass('family automation preserves manual plans, rotates one eligible parenting task per week, and adds none for childless or teenage-only households');

    await loadLife(desktop,[]);
    const grooming=[['haircut','weeks',3,'3주에 한 번'],['haircut_men','weeks',3,'3주에 한 번'],['haircut_women','weeks',3,'3주에 한 번'],['perm','months',2,'2개월에 한 번'],['dye','months',3,'3개월에 한 번']];
    for(const [id,,,label] of grooming){await reveal(desktop,desktop.locator('#quick-activity'));await desktop.locator('#quick-activity').selectOption(id);assert.ok((await desktop.locator(`[data-cadence="${id}"]`).allTextContents()).some(text=>text.includes(label)));await reveal(desktop,desktop.locator(`[data-activity="${id}"]`));assert.ok((await desktop.locator(`[data-activity="${id}"]`).innerText()).includes(label),id+' visible cadence');}
    await click(desktop,'.tab[data-tab="routines"]');
    for(const [id,kind,interval] of grooming){await desktop.locator('#rule-form [name="activityId"]').selectOption(id);assert.equal(await desktop.locator('#rule-form [name="kind"]').inputValue(),kind);assert.equal(await desktop.locator('#rule-form [name="interval"]').inputValue(),String(interval));}
    await click(desktop,'.tab[data-tab="planner"]');
    const firstCut=await quickAdd(desktop,'haircut'),secondCut=await quickAdd(desktop,'haircut_men');
    assert.notEqual(firstCut.id,secondCut.id);assert.ok(!firstCut.automatic&&!secondCut.automatic);
    assert.equal(await desktop.evaluate(()=>S2Engine.activityCadence(S2Storage.load().state,'haircut_women').allowed),false,'the three cut IDs share one automatic cadence while manual additions remain available');
    const cadence=await desktop.evaluate(()=>{
      const config={...S2Data.PRESETS[0].config,year:2026,seed:444,startCash:100000000,personalBudget:100000000,salary:4000000,preferences:['haircut','haircut_men','haircut_women','perm','dye']};
      const s=S2Engine.create(config,'worker');let attempts=0;
      while(s.date<'2026-05-01'&&attempts++<40){const result=S2Engine.advanceAutomatic(s,{direction:'balanced',maxDays:7,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      const logs=s.log.filter(row=>row.type==='activity'&&S2Data.ACTIVITY_MAP[row.activityId].cadence);
      const groups={};for(const log of logs){const rule=S2Data.ACTIVITY_MAP[log.activityId].cadence;(groups[rule.group]??=[]).push({date:log.date,id:log.activityId,unit:rule.unit,interval:rule.interval});}
      return {date:s.date,groups};
    });
    assert.ok(cadence.date>='2026-05-01');assert.equal(Object.keys(cadence.groups).length,3);
    for(const items of Object.values(cadence.groups)){
      assert.ok(items.length>=2,'each grooming cadence must be exercised at least twice');
      for(let i=1;i<items.length;i++){
        const previous=items[i-1],allowed=await desktop.evaluate(({date,unit,interval})=>unit==='weeks'?S2Calendar.addDays(date,7*interval):S2Calendar.addMonths(date,interval),previous);
        assert.ok(items[i].date>=allowed,`${items[i].id} ${items[i].date} must follow ${allowed}`);
      }
    }
    evidence.cadence=cadence;
    pass('grooming labels and new recurrence defaults show three weeks/two months/three months; manual early cuts remain possible and four months of actual automatic records respect all shared cadence intervals');

    const mobile=await makePage(browser,true);await loadLife(mobile,[0]);
    const task=mobile.locator('[data-parenting-add="baby_change"]');await reveal(mobile,task);await task.focus();await mobile.keyboard.press('Enter');
    const mobilePlan=(await state(mobile)).plan;
    assert.equal(mobilePlan.length,1);assert.equal(mobilePlan[0].activityId,'baby_change');
    assert.equal(await mobile.evaluate(()=>document.activeElement?.dataset.parentingAdd),'baby_change');
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await shot(mobile,'infant-parenting-mobile');
    const mobileSaved=await stored(mobile);await mobile.reload();await mobile.locator('#resume-game').click();assert.deepEqual(await stored(mobile),mobileSaved);
    pass('390px mobile adds an infant task by keyboard, retains button focus and saved family plans, and has no horizontal overflow');

    await desktop.goto(base+planner);await desktop.locator('[data-palette-group="season2"]').click();
    const catalogCount=await desktop.evaluate(()=>S2Activities.ACTIVITIES.length);
    assert.equal(await desktop.locator('#wrs-palette .chip').count(),catalogCount);
    for(const id of ids){
      await desktop.locator('#wrs-clear').click();await desktop.locator(`.chip[data-template="s2_${id}"]`).click();await desktop.locator('.slots[data-day="sat"] .slot').nth(2).click();
      const event=(await state(desktop)).events[0];assert.equal(event.activity_id,id);assert.equal(event.tone,'social');assert.equal(event.sourceKind,undefined);
      assert.match(await desktop.locator('#wrs-ins').innerText(),/가족/);
    }
    await desktop.locator('#ins-dur').focus();await desktop.keyboard.press('Home');await desktop.keyboard.press('ArrowRight');
    const remembered=(await state(desktop)).events;await desktop.locator('#wrs-remember').click();await desktop.locator('#wrs-clear').click();await desktop.locator('#wrs-restore').click();assert.deepEqual((await state(desktop)).events,remembered);
    await shot(desktop,'parenting-original-planner');
    assert.deepEqual(errors,[]);
    pass(`the original planner exposes all ${catalogCount} activities and freely adds, edits and restores the nine parenting blocks as family activities without inventing source provenance`);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,evidence,errors},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
