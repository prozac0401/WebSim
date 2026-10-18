// Real Chromium integration: serve the repository, then set WEBSIM_URL.
// Completed years are engine-built fixtures; links, editing and mobile playback use the UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/weekend-life-plan');
const game = '/weekend_season2/index.html';
const planner = '/weekend_recovery_simulator/weekend_recovery_simulator.html';
const storageKey = 'websim-weekend-season2-v1';
const checks = [], errors = [];
fs.mkdirSync(output, {recursive:true});
const state = page => page.evaluate(() => JSON.parse(render_game_to_text()));
const sourceSave = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
const pass = label => { checks.push(label); console.log('PASS', label); };
const shot = (page, name) => page.screenshot({path:path.join(output, name + '.png'),fullPage:true});
async function newPage(browser, mobile=false) {
  const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  // Freeze the real-world date only, leaving browser timers available for autoplay.
  await page.addInitScript(() => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-17T12:00:00+09:00'])); }
      static now() { return new OriginalDate('2026-10-17T12:00:00+09:00').getTime(); }
    };
    window.crypto.getRandomValues = array => { array[0] = 45; return array; };
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
  return page;
}
async function completedLife(page, year) {
  await page.goto(base + game);
  const fixture = await page.evaluate(year => {
    const config = {...S2Data.PRESETS.find(p=>p.id==='worker').config,year,seed:444,preferences:['walk','read','cleaning']};
    const s = S2Engine.create(config,'worker');
    let loops = 0;
    while(s.phase!=='finished' && loops++ < 700) {
      const result = S2Engine.advanceAutomatic(s,{direction:'balanced',maxDays:7,decisions:'auto'});
      if(result.ok===false) throw Error(result.reason || 'Fixture did not advance');
    }
    const result = S2Storage.save(s);
    return {phase:s.phase,result,activityCount:s.log.filter(item=>item.type==='activity').length,dailyCount:s.log.filter(item=>item.type==='daily').length};
  },year);
  assert.equal(fixture.phase,'finished');
  assert.equal(fixture.result.ok,true,fixture.result.reason);
  assert.ok(fixture.activityCount > 20);
  assert.equal(fixture.dailyCount,year===2028?366:365);
  await page.reload();
  await page.locator('#resume-game').click();
  assert.equal((await state(page)).mode,'finished');
}
async function assertLocked(page,label) {
  const control=page.locator('#open-weekend-draft');
  assert.equal(await control.isDisabled(),true,label+' must disable transfer');
  const snapshot=()=>page.evaluate(key=>({url:location.href,save:localStorage.getItem(key),tokens:Object.keys(sessionStorage).filter(key=>key.startsWith('websim-season2-draft:')).sort()}),storageKey);
  const before=await snapshot();
  await control.scrollIntoViewIfNeeded();
  const box=await control.boundingBox();
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForTimeout(100);
  assert.deepEqual(await snapshot(),before,label+' must not navigate, create a draft, or change saved state');
}
async function openDraft(page, keyboard=false) {
  if(keyboard) { await page.locator('#open-weekend-draft').focus(); await page.keyboard.press('Enter'); }
  else await page.locator('#open-weekend-draft').click();
  await page.waitForURL(/weekend_recovery_simulator\.html\?season2Draft=/);
  await page.waitForFunction(() => typeof render_game_to_text==='function');
  const s = await state(page);
  assert.equal(s.mode,'weekend-recovery-planner');
  assert.ok(s.season2Draft,'the link must import the protagonist instead of an empty planner');
  assert.equal(s.season2Draft.source.completed,true);
  assert.equal(s.season2Draft.source.completedDays,s.season2Draft.source.totalDays);
  assert.equal(s.season2Draft.source.completedOn,s.season2Draft.source.year+'-12-31');
  assert.deepEqual(s.season2Draft.weekend,{saturday:'2026-10-17',sunday:'2026-10-18'});
  assert.ok(s.events.length > 0);
  assert.match(await page.locator('#wrs-draft-title').innerText(),new RegExp(s.season2Draft.source.persona));
  assert.equal(await page.locator('#wrs-season2-draft').isVisible(),true);
  assert.ok((await page.locator('#wrs-constraint-note').innerText()).includes('충족'));
  return s;
}

(async () => {
  const browser = await playwright.chromium.launch({headless:true});
  try {
    const desktop = await newPage(browser);
    await desktop.goto(base);
    assert.match(await desktop.locator('h1').innerText(),/주말 계획표[\s\S]*시즌2/);
    assert.equal(await desktop.locator('.tool-card').count(),30);
    assert.match(await desktop.locator('.tool-card').first().locator('h3').innerText(),/시즌2/);
    for(const selector of ['.hero-link','.featured-link','.tool-card:first-child .try-link'])
      assert.equal(await desktop.locator(selector).getAttribute('href'),'weekend_season2/index.html');
    await shot(desktop,'homepage-desktop');
    await desktop.locator('#search').fill('주말시즌계획표2');
    assert.equal(await desktop.locator('.tool-card:visible').count(),1);
    await desktop.locator('#search').fill('');
    await desktop.locator('.hero-link').focus();await desktop.keyboard.press('Enter');
    await desktop.waitForURL('**/weekend_season2/index.html');
    pass('homepage features Season 2, retains 30 tools, searches alternate title and opens by keyboard');

    await desktop.locator('#start-btn').click();
    await assertLocked(desktop,'newly started life');
    await shot(desktop,'incomplete-year-locked');
    const lastDay=await desktop.evaluate(()=>{
      const s=S2Engine.create({...S2Data.PRESETS.find(p=>p.id==='worker').config,year:2026,seed:444},'worker');
      let guard=0;
      while(s.date!=='2026-12-31'&&guard++<700){const result=S2Engine.advanceAutomatic(s,{maxDays:1,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      return {date:s.date,phase:s.phase,days:s.log.filter(item=>item.type==='daily').length,save:S2Storage.save(s)};
    });
    assert.equal(lastDay.date,'2026-12-31');assert.equal(lastDay.days,364);assert.notEqual(lastDay.phase,'finished');assert.equal(lastDay.save.ok,true);
    await desktop.reload();await desktop.locator('#resume-game').click();
    await assertLocked(desktop,'December 31 before completing its day');
    await shot(desktop,'last-day-locked');
    pass('a new life and December 31 with only 364 completed days cannot transfer or alter the source');

    await completedLife(desktop,2026);
    const before = await sourceSave(desktop);
    const actual = await openDraft(desktop,true);
    assert.equal(actual.season2Draft.source.year,2026);
    assert.equal(actual.season2Draft.source.mode,'experienced');
    assert.ok(actual.events.some(event=>event.sourceKind==='actual'));
    assert.ok(actual.events.filter(event=>event.sourceKind==='actual').every(event=>['2026-10-17','2026-10-18'].includes(event.sourceDate)));
    assert.deepEqual(await sourceSave(desktop),before,'opening the planner must preserve source save, money, RNG and log');
    await shot(desktop,'experienced-weekend-desktop');
    await desktop.locator('#wrs-remember').click();
    await desktop.locator('.ev').first().focus();await desktop.keyboard.press('Enter');
    assert.ok(await desktop.locator('#wrs-ins .source-origin').isVisible());
    await desktop.locator('#ins-del').click();
    assert.equal((await state(desktop)).events.length,actual.events.length-1);
    await desktop.locator('#wrs-restore').click();
    assert.deepEqual((await state(desktop)).events,actual.events);
    await desktop.locator('#wrs-sample').click();
    assert.equal((await state(desktop)).season2Draft,null,'sample must not claim to be the protagonist history');
    await desktop.locator('#wrs-restore').click();
    assert.deepEqual((await state(desktop)).season2Draft,actual.season2Draft);
    await desktop.reload();
    assert.deepEqual((await state(desktop)).events,actual.events,'reload retains the original session draft');
    await desktop.locator('#wrs-season2-draft a').click();
    await desktop.locator('#resume-game').click();
    assert.equal((await state(desktop)).automatic.active,false);
    assert.deepEqual(await sourceSave(desktop),before);
    const pending = await desktop.evaluate(() => {
      const s = S2Engine.create({...S2Data.PRESETS.find(p=>p.id==='worker').config,year:2026,seed:444},'worker');
      s.queue.unshift({catalogId:'illness_influenza',date:s.date,context:{}});
      S2Engine.advance(s);
      return {phase:s.phase,save:S2Storage.save(s)};
    });
    assert.equal(pending.phase,'event');assert.equal(pending.save.ok,true);
    await desktop.reload();await desktop.locator('#resume-game').click();
    assert.equal((await state(desktop)).mode,'event');
    const pendingSave = await sourceSave(desktop);
    await assertLocked(desktop,'pending event');
    assert.deepEqual(await sourceSave(desktop),pendingSave,'export during a pending choice must not choose or progress time');
    pass('365-day completion unlocks actual records, while a pending choice stays locked; editing, reload and return preserve the life');

    await completedLife(desktop,2027);
    const otherYearBefore = await sourceSave(desktop);
    const average = await openDraft(desktop);
    assert.equal(average.season2Draft.source.year,2027);
    assert.equal(average.season2Draft.source.mode,'year-average');
    assert.ok(average.season2Draft.source.sampleDays > 2);
    assert.ok(average.events.some(event=>event.sourceKind==='average'));
    assert.ok(average.season2Draft.source.explanation.includes('평균'));
    assert.deepEqual(await sourceSave(desktop),otherYearBefore);
    await shot(desktop,'year-average-desktop');
    // A valid label is still untrusted text, even when read from session storage.
    const token = await desktop.evaluate(() => {
      const current = new URLSearchParams(location.search).get('season2Draft');
      const draft = JSON.parse(sessionStorage.getItem('websim-season2-draft:'+current));
      draft.source.persona = '<b>테스트 인물</b>';
      draft.planner.events[0].sourceLabel = '<img src=x onerror=alert(1)>';
      const checked = S2PlannerBridge.validateDraft(draft);
      if(!checked.ok) throw Error(checked.reason);
      const id = crypto.randomUUID();sessionStorage.setItem('websim-season2-draft:'+id,JSON.stringify(draft));return id;
    });
    await desktop.goto(base + planner + '?season2Draft=' + token);
    assert.match(await desktop.locator('#wrs-draft-title').innerText(),/<b>테스트 인물<\/b>/);
    assert.equal(await desktop.locator('#wrs-draft-title b,.ev img').count(),0);
    await desktop.locator('.ev').first().click();
    assert.equal(await desktop.locator('#wrs-ins img').count(),0);
    pass('another simulated year uses accumulated weekend averages and imported names stay literal text');

    const mobile = await newPage(browser,true);
    await mobile.goto(base);
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
    await shot(mobile,'homepage-mobile');
    await mobile.locator('.hero-link').click();
    await mobile.locator('#start-btn').focus();await mobile.keyboard.press('Enter');
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollHeight)<=1450,'initial mobile life stays compact');
    await mobile.locator('#auto-play').click();
    await mobile.waitForFunction(()=>JSON.parse(render_game_to_text()).date>'2026-01-01');
    await mobile.locator('#auto-play').click();
    const pausedDate = (await state(mobile)).date;
    await mobile.waitForTimeout(1000);
    assert.equal((await state(mobile)).date,pausedDate);
    const mobileBefore = await sourceSave(mobile);
    await mobile.locator('#planner-transfer-title').scrollIntoViewIfNeeded();
    await shot(mobile,'source-link-mobile');
    await assertLocked(mobile,'partially lived year');
    assert.deepEqual(await sourceSave(mobile),mobileBefore);
    await completedLife(mobile,2028);
    assert.equal(await mobile.locator('#open-weekend-draft').isEnabled(),true);
    const completedBefore=await sourceSave(mobile);
    await shot(mobile,'completed-leap-year-mobile');
    const estimated = await openDraft(mobile,true);
    assert.equal(estimated.season2Draft.source.year,2028);
    assert.equal(estimated.season2Draft.source.completedDays,366);
    assert.equal(estimated.season2Draft.source.mode,'year-average');
    assert.ok(estimated.events.every(event=>event.sourceKind==='average'));
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
    assert.deepEqual(await sourceSave(mobile),completedBefore);
    await shot(mobile,'draft-mobile');
    await mobile.locator('#wrs-remember').click();await mobile.locator('#wrs-clear').click();
    assert.equal((await state(mobile)).events.length,0);
    assert.equal((await state(mobile)).season2Draft,null);
    await mobile.locator('#wrs-restore').click();
    assert.deepEqual((await state(mobile)).events,estimated.events);
    pass('mobile partial play stays locked; a genuine 366-day leap year unlocks keyboard transfer of recorded averages without changing the life');

    const uncertified=await mobile.evaluate(()=>{
      const current=new URLSearchParams(location.search).get('season2Draft');
      const original=JSON.parse(sessionStorage.getItem('websim-season2-draft:'+current));
      return ['missing','false','short'].map(kind=>{
        const draft=structuredClone(original);
        if(kind==='missing')delete draft.source.completed;
        if(kind==='false')draft.source.completed=false;
        if(kind==='short')draft.source.completedDays--;
        const id=crypto.randomUUID();sessionStorage.setItem('websim-season2-draft:'+id,JSON.stringify(draft));return id;
      });
    });
    for(const token of uncertified){
      await mobile.goto(base+planner+'?season2Draft='+token);
      assert.match(await mobile.locator('#wrs-draft-title').innerText(),/불러오지 못/);
      assert.equal((await state(mobile)).season2Draft,null);
      assert.equal((await state(mobile)).events.length,9);
    }

    for(const token of ['not-a-valid-token','00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000001']) {
      if(token.endsWith('1'))await mobile.evaluate(id=>sessionStorage.setItem('websim-season2-draft:'+id,'{"version":1,"planner":{}}'),token);
      await mobile.goto(base + planner + '?season2Draft=' + token);
      assert.match(await mobile.locator('#wrs-draft-title').innerText(),/불러오지 못/);
      assert.equal((await state(mobile)).events.length,9);
      assert.equal((await state(mobile)).season2Draft,null);
    }
    await mobile.goto(base + planner);
    assert.equal((await state(mobile)).events.length,0,'direct legacy entry retains original blank-plan behavior');
    assert.equal(await mobile.locator('#wrs-season2-draft').isVisible(),false);
    await mobile.locator('#wrs-sample').click();
    assert.equal((await state(mobile)).events.length,9);
    assert.deepEqual(errors,[]);
    pass('uncertified, incomplete, missing and malformed transfers are rejected; the direct legacy planner remains usable with no browser errors');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
