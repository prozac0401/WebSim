// Real browser transfers across completed lives. Speculative variety is unit-tested
// separately: browser exports must retain actual records and completed-year averages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const D = require('../weekend_season2/data.js');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright'); }
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-planner-variety');
const game='/weekend_season2/index.html';
const storageKey='websim-weekend-season2-v1';
const checks=[],errors=[],cases=[];
fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const savedState=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,storageKey);
const pass=label=>{checks.push(label);console.log('PASS',label);};
const shot=async(page,name)=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});};
async function newPage(browser,mobile=false){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    const OriginalDate=Date;
    window.Date=class extends OriginalDate{
      constructor(...args){super(...(args.length?args:['2026-10-17T12:00:00+09:00']));}
      static now(){return new OriginalDate('2026-10-17T12:00:00+09:00').getTime();}
    };
    window.crypto.getRandomValues=array=>{array[0]=45;return array;};
  });
  return page;
}
async function fixture(page,settings){
  await page.goto(base+game);
  const result=await page.evaluate(settings=>{
    const preset=S2Data.PRESETS.find(item=>item.id===settings.preset);
    const s=S2Engine.create({...preset.config,year:2027,seed:444,...settings.config},preset.id);
    if(settings.stats)Object.assign(s.stats,settings.stats);
    if(settings.household)Object.assign(s.household,settings.household);
    let loops=0;
    while(s.phase!=='finished'&&loops++<700){
      const result=S2Engine.advanceAutomatic(s,{direction:'balanced',maxDays:7,decisions:'auto'});
      if(result.ok===false)throw Error(result.reason||'Fixture did not advance');
    }
    if(s.phase!=='finished')throw Error('Fixture year did not finish');
    return S2Storage.save(s);
  },settings);
  assert.equal(result.ok,true,result.reason);
  await page.reload();await page.locator('#resume-game').click();
}
async function transfer(page,keyboard=false){
  const before=await savedState(page);
  assert.equal(before.phase,'finished');
  assert.equal(before.log.filter(item=>item.type==='daily').length,365);
  if(keyboard){await page.locator('#open-weekend-draft').focus();await page.keyboard.press('Enter');}
  else await page.locator('#open-weekend-draft').click();
  await page.waitForURL(/weekend_recovery_simulator\.html\?season2Draft=/);
  const after=await state(page);
  assert.ok(after.season2Draft);
  assert.equal(after.season2Draft.source.completed,true);
  assert.equal(after.season2Draft.source.completedDays,365);
  assert.deepEqual(after.season2Draft.weekend,{saturday:'2026-10-17',sunday:'2026-10-18'});
  assert.deepEqual(await savedState(page),before,'transfer cannot advance the source date, RNG, money, health or logs');
  assert.match(await page.locator('#wrs-constraint-note').innerText(),/충족/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),page.viewportSize().width);
  return {before,after};
}
async function checkAverage(page,name){
  const {before,after}=await transfer(page,name==='default-mobile');
  assert.equal(after.season2Draft.source.mode,'year-average');
  assert.ok(after.events.every(event=>event.sourceKind==='average'&&event.sourceDate===null),`${name}: completed-year facts cannot be replaced by speculative variety`);
  const recordedDates=before.log.filter(log=>log.type==='daily'&&[0,6].includes(new Date(log.date+'T12:00:00Z').getUTCDay())).map(log=>log.date);
  assert.deepEqual(after.season2Draft.source.dates,recordedDates);
  assert.equal(after.season2Draft.source.sampleDays,recordedDates.length);
  const sat=after.events.filter(event=>event.day==='sat').map(event=>event.sourceLabel);
  const sun=after.events.filter(event=>event.day==='sun').map(event=>event.sourceLabel);
  const repeated=[...new Set(sat.filter(label=>sun.includes(label)))];
  for(const event of after.events){
    const activity=D.ACTIVITIES.find(item=>item.name===event.sourceLabel);
    if(activity)assert.ok(before.log.some(log=>log.type==='activity'&&log.activityId===activity.id),`${name}: an averaged activity must exist in the completed life`);
    assert.ok(Number.isFinite(event.sourceMinutes)&&event.sourceMinutes>0);
  }
  if(name==='caregiver'){
    assert.equal(after.events.filter(event=>event.sourceLabel==='기본 돌봄 시간').length,2,'recorded care averages remain on both days');
  }
  cases.push({name,persona:after.season2Draft.source.persona,saturday:sat,sunday:sun,repeated});
  await shot(page,name);
  // Reopening a completed life retains the same facts without spending RNG.
  await page.locator('#wrs-season2-draft a').click();await page.locator('#resume-game').click();
  const repeatedTransfer=await transfer(page);
  assert.deepEqual(repeatedTransfer.after.events,after.events,`${name}: reopening the same life/weekend is deterministic`);
  assert.deepEqual(repeatedTransfer.before,before);
  return after;
}

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  try{
    const mobile=await newPage(browser,true);
    await mobile.goto(base+game);await mobile.locator('#start-year').selectOption('2027');await mobile.locator('#start-btn').click();
    const finished=await mobile.evaluate(()=>{
      const s=S2Storage.load().state;let loops=0;
      while(s.phase!=='finished'&&loops++<700){const result=S2Engine.advanceAutomatic(s,{maxDays:7,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      return {phase:s.phase,save:S2Storage.save(s)};
    });
    assert.equal(finished.phase,'finished');assert.equal(finished.save.ok,true);
    await mobile.reload();await mobile.locator('#resume-game').click();
    await checkAverage(mobile,'default-mobile');
    pass('a genuinely completed generated life exports reproducible weekday averages by keyboard on mobile without changing its history');

    const page=await newPage(browser);
    for(const preset of ['worker','graduate','caregiver']){
      await fixture(page,{preset});await checkAverage(page,preset);
    }
    pass('completed worker, graduate and caregiver years retain their recorded activities, sampled weekends and care averages');

    await fixture(page,{preset:'graduate',config:{age:80,preferences:['pt','parttime'],startCash:0,personalBudget:0,salary:0,externalAllowance:0,fixedCosts:0},stats:{fatigue:56,health:55}});
    await checkAverage(page,'low-cash-tired');
    pass('a completed older low-budget life exports its recorded year rather than speculative variety');

    await fixture(page,{preset:'worker',config:{year:2026,preferences:['walk','read','cleaning']}});
    const actual=await transfer(page);
    assert.equal(actual.after.season2Draft.source.mode,'experienced');
    const logs=actual.before.log.filter(item=>item.type==='activity'&&['2026-10-17','2026-10-18'].includes(item.date));
    assert.ok(logs.length>0);
    for(const log of logs){
      const label=D.ACTIVITY_MAP[log.activityId].name;
      const event=actual.after.events.find(item=>item.sourceDate===log.date&&item.sourceLabel===label);
      assert.ok(event,`completed ${label} stays present on ${log.date}`);
      assert.equal(event.sourceKind,'actual');
      assert.equal(event.sourceMinutes,log.minutes,'this no-care fixture keeps its actual occupied duration');
      assert.equal(event.start_slot,{morning:2,afternoon:12,evening:20}[log.slot]);
    }
    assert.ok(actual.after.events.every(event=>event.sourceKind==='actual'),'completed days must not receive invented variety');
    await shot(page,'experienced-unchanged');
    pass('completed weekend records retain their real activities, dates, duration and provenance');

    await fixture(page,{preset:'worker'});
    const editable=(await transfer(page)).after;
    const free=Array.from({length:30},(_,start)=>start).find(start=>!editable.events.some(event=>event.day==='sat'&&start<event.start_slot+event.duration_slots&&event.start_slot<start+3));
    assert.notEqual(free,undefined,'the completed-year draft retains space for a manual activity');
    await page.locator('#wrs-palette .chip[data-template="s2_haircut_men"]').click();
    await page.locator('.slots[data-day="sat"] .slot').nth(free).click();
    let added=(await state(page)).events.find(event=>!editable.events.some(original=>original.id===event.id));
    assert.ok(added);assert.equal(added.label,'남성 커트');assert.equal(added.sourceKind,undefined);
    await page.locator('#ins-dur').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
    added=(await state(page)).events.find(event=>event.id===added.id);
    assert.equal(added.duration_slots,2);
    for(const original of editable.events)assert.deepEqual((await state(page)).events.find(event=>event.id===original.id),original);
    await shot(page,'varied-with-manual-edit');
    assert.deepEqual(errors,[]);
    pass('completed-year drafts accept and edit a manual Season 2 activity without altering imported facts');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,cases,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
