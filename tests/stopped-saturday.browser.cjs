// Serve the repository, then run: node tests/stopped-saturday.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const story = require('../stopped_saturday/story-engine.js');
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const out = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/stopped-saturday');
const checks = [], errors = [], endings = {};
const record = name => { checks.push(name); console.log('PASS', name); };
const gamePath = 'stopped_saturday/stopped_saturday.html';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
async function shot(page, name) { await page.screenshot({ path:path.join(out, name+'.png'), fullPage:true }); }
function watch(page) {
  page.on('dialog', dialog => dialog.accept()); // This suite starts fresh classic days in disposable contexts.
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if(msg.type()==='error') errors.push(msg.text()); });
}
function findEndings() {
  // Bounded sampling replaces the five-turn exhaustive search.
  let seed=14217;
  for(let attempt=0;attempt<3000 && Object.keys(endings).length<6;attempt++) {
    let current=story.freshState(),route=[];
    while(current.scene!=='end') {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const i=Math.floor(seed/4294967296*story.getNode(current).choices.length);
      route.push(i);current=story.choose(current,i);
    }
    endings[story.determineEnding(current).name] ||= route;
  }
}
async function ready(page) {
  await page.goto(base+gamePath);
  await page.waitForFunction(() => typeof window.render_game_to_text==='function');
  if((await state(page)).mode!=='cover') await page.locator('#home-button').click();
  await page.locator('#scenario-select').selectOption('classic');
  await advance(page,0);
}
async function choice(page,index,touch=false) {
  const before=await state(page);
  const b=page.locator('#choices button').nth(index);
  if(touch) await b.tap(); else await b.click();
  assert.equal((await state(page)).mode,'reaction');
  assert.equal((await state(page)).minuteOfDay,before.minuteOfDay+before.choiceDurations[index]);
  assert.equal(await page.locator('#reaction-text p').count() >= 2,true);
  await advance(page,7000);
  assert.equal((await state(page)).minuteOfDay,before.minuteOfDay+before.choiceDurations[index],'animation does not spend story time');
  if(touch) await page.locator('#continue-button').tap(); else await page.locator('#continue-button').click();
}
async function play(page,route,touch=false) {
  for(const index of route) await choice(page,index,touch);
  const s=await state(page); assert.equal(s.mode,'result'); assert.equal(s.step,12); return s;
}
async function skipRhythm(page,touch=false) {
  while((await state(page)).mode==='game' && /^R\d/.test((await state(page)).sceneId)) await choice(page,0,touch);
}
async function coreChoice(page,index,touch=false) {
  await skipRhythm(page,touch);await choice(page,index,touch);
}
async function finish(page,touch=false) {
  while((await state(page)).mode==='game') await choice(page,0,touch);
  assert.equal((await state(page)).step,12);assert.equal((await state(page)).mode,'result');
}
async function toStairs(page,touch=false) {
  await ready(page);await page.locator('#start-button').click();
  await coreChoice(page,0,touch);await coreChoice(page,0,touch);await skipRhythm(page,touch);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth+1),true,'horizontal overflow');
}
async function compactBody(page) {
  const body=(await state(page)).body;
  assert.equal(await page.locator('#body-overview').isVisible(),false,'the large body map stays hidden');
  const descriptions=story.bodyDescription({body});
  assert.equal(await page.locator('#body-list .body-item').count(),6);
  for(const [index,item] of descriptions.entries()){
    const value=body[item.key], level=value===0?0:value<=2?1:value<=6?2:3;
    const row=page.locator('#body-list .body-item').nth(index);
    assert.equal(await row.locator('header strong').textContent(),item.label);
    assert.equal(await row.locator('header span').textContent(),`${['없음','약함','보통','심함'][level]} · ${value}/10`);
    assert.equal(await row.locator('p').textContent(),item.text);
  }
}
(async () => {
  fs.mkdirSync(out,{recursive:true}); findEndings(); assert.equal(Object.keys(endings).length,6);
  const browser=await playwright.chromium.launch({headless:true});
  try {
    const context=await browser.newContext({ viewport:{width:1440,height:1100}, acceptDownloads:true, permissions:['clipboard-read','clipboard-write'] });
    const page=await context.newPage(); watch(page);
    await ready(page); assert.equal((await state(page)).mode,'cover');
    assert.match(await page.locator('#cover').innerText(),/깁스.*첫 주말/s);assert.match(await page.locator('#opening-story').innerText(),/병원.*목발/s);
    assert.ok((await page.locator('#opening-story').boundingBox()).y<(await page.locator('.day-setup').boundingBox()).y);
    await shot(page,'01-cover-desktop');
    await page.locator('#start-button').focus(); await page.keyboard.press('Enter');
    assert.equal((await state(page)).step,0); assert.equal(await page.locator('#choices button').count(),3);
    assert.equal((await state(page)).maxSteps,12);assert.equal((await state(page)).minuteOfDay,612);
    assert.equal(await page.locator('#progress-track li').count(),12);
    assert.equal(await page.locator('.choice-duration').count(),3);
    assert.match(await page.locator('#scene-clock').innerText(),/^오전 10:12$/);
    assert.equal(await page.evaluate(() => document.activeElement.id),'scene-title');
    await compactBody(page);assert.equal(await page.locator('#body-notes').evaluate(el=>el.open),false);await shot(page,'02-choice-desktop'); record('Start with Enter, twelve-step progress, duration previews and heading focus');
    await advance(page,60000);assert.equal((await state(page)).minuteOfDay,612);
    await choice(page,0);const shorter=(await state(page)).minuteOfDay;
    await ready(page);await page.locator('#start-button').click();await choice(page,2);
    assert.notEqual((await state(page)).minuteOfDay,shorter);
    record('Choices consume different minutes; reading and animation do not advance the story clock');
    await page.keyboard.press('1'); assert.equal((await state(page)).route,'outside');
    const movement0=(await state(page)).motion; await advance(page,600); const movement1=(await state(page)).motion;
    await advance(page,700); const movement2=(await state(page)).motion;
    assert.equal(movement0.kind,'walk'); assert.notEqual(movement1.x,movement2.x); assert.notDeepEqual(movement1.rightFoot,movement2.rightFoot);
    await shot(page,'03-moving-desktop'); await advance(page,10000); assert.equal((await state(page)).motion.moving,false);
    record('Number selection, translated walking with articulated feet, finite movement');
    await page.locator('#body-notes summary').click(); assert.equal(await page.locator('#body-list .body-item').count(),6);await compactBody(page); await shot(page,'04-body-notes-desktop');
    record('Cast-and-crutches prologue precedes setup; large body map stays hidden and optional details match story state');
    await page.locator('#continue-button').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#body-notes').evaluate(el=>el.open),false,'body details fold when moving to the next scene');
    await page.locator('#choices button').first().focus(); await page.keyboard.press('2'); assert.equal((await state(page)).mode,'game');
    await page.keyboard.press('Enter'); assert.equal((await state(page)).mode,'reaction');
    await page.locator('#continue-button').click();
    await finish(page); record('Focused buttons ignore number shortcuts; Enter progresses; twelve choices end');
    await compactBody(page);assert.equal(await page.locator('#body-notes').evaluate(el=>el.open),false);await shot(page,'05-ending-desktop');
    assert.match(await page.locator('#result-time').innerText(),/^오후/);
    await page.locator('.journal summary').click(); assert.equal(await page.locator('#journal-list li').count(),12); await shot(page,'06-journal-desktop');
    for(const time of await page.locator('#journal-list .journal-entry-time').allTextContents()) assert.match(time,/(오전|오후).*→.*(오전|오후)/);
    await page.locator('#copy-result').click(); const copied=await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes((await state(page)).ending)); assert.ok(!/localhost|127\.0\.0\.1|github\.io/.test(copied)); record('Real clipboard copy includes ending, omits unpublished/local URL');
    const downloadPromise=page.waitForEvent('download'); await page.locator('#save-image').click(); const download=await downloadPromise;
    const png=path.join(out,'ending-card.png'); await download.saveAs(png);
    const bytes=fs.readFileSync(png); assert.equal(bytes.subarray(1,4).toString(),'PNG'); assert.equal(bytes.readUInt32BE(16),1080); assert.equal(bytes.readUInt32BE(20),1350); record('Actual PNG download has valid 1080×1350 image');
    await page.locator('#restart').click(); let reset=await state(page); const fresh=story.freshState();
    assert.equal(reset.step,0); assert.equal(reset.minuteOfDay,612);assert.equal(reset.route,null); assert.deepEqual(reset.body,fresh.body); assert.equal(reset.energy,fresh.energy); assert.equal(reset.mood,fresh.mood); assert.deepEqual(reset.traces,[]); record('Restart resets clock, all story/body state and journal');
    for(const [name,route] of Object.entries(endings)) {
      const result=await play(page,route); assert.equal(result.ending,name); await page.locator('#restart').click();
    }
    record('All six named endings reached through visible controls');
    for(const [route,expected,label] of [[[1],'desk','desk'],[[3],'observe','window'],[[0,0],'sit','street']]) {
      await ready(page); await page.locator('#start-button').click();
      for(const index of route) await coreChoice(page,index);
      await advance(page,12000); const arrived=(await state(page)).motion;
      assert.equal(arrived.poseKind,expected); assert.equal(arrived.support,'seat'); assert.equal(arrived.moving,false);
      await shot(page,`12-arrived-${label}`);
    }
    record('Desk, window and street arrivals finish seated and match the narrative');
    await toStairs(page);
    assert.equal((await state(page)).scene,'outing_lunch');
    assert.match(await page.locator('#story-text').innerText(),/2층/);
    await shot(page,'13-stairs-decision');
    await page.locator('#choices button').first().click();
    const stairsStart=await state(page);
    assert.equal(stairsStart.motion.kind,'stairs');
    assert.equal(await page.locator('#effort-monitor').isVisible(),true);
    const canonical=s=>({energy:s.energy,mood:s.mood,body:s.body,step:s.step,traces:s.traces,minuteOfDay:s.minuteOfDay});
    await advance(page,4300); const stairsMiddle=await state(page);
    assert.ok(stairsMiddle.motion.y<stairsStart.motion.y,'stairs ascend vertically');
    assert.ok(stairsMiddle.motion.x>stairsStart.motion.x,'stairs advance horizontally');
    assert.ok(stairsMiddle.motion.effort.displayEnergy<=stairsStart.motion.effort.displayEnergy);
    assert.deepEqual(canonical(stairsMiddle),canonical(stairsStart),'animation must not repeatedly drain energy');
    await shot(page,'14-stairs-moving-desktop');
    await advance(page,20000); const stairsEnd=await state(page);
    assert.equal(stairsEnd.motion.moving,false);
    assert.equal(stairsEnd.motion.support,'seat');
    assert.equal(stairsEnd.motion.poseKind,'sit');
    assert.equal(stairsEnd.motion.effort.displayEnergy,stairsEnd.energy);
    assert.deepEqual(canonical(stairsEnd),canonical(stairsStart));
    assert.match(await page.locator('#effort-value').innerText(),new RegExp(`${stairsEnd.energy*10}%`));
    await shot(page,'15-stairs-arrival-desktop');
    await page.locator('#continue-button').click();
    assert.equal(await page.locator('#choices button').count(),3,'the next added daily-life scene remains available');
    record('Actual 2F ascent and imagined step monitor; elapsed time cannot spend story energy twice');
    // The other lobby decisions must remain distinct and never imply stairs were climbed.
    for(const index of [1,2,3]) {
      await toStairs(page);
      await page.locator('#choices button').nth(index).click();
      assert.notEqual((await state(page)).motion.kind,'stairs');
      await page.locator('#continue-button').click();
      await shot(page,`16-lobby-alternative-${index}`);
    }
    record('Elevator, ground-floor pickup and delivery remain separate from the staircase experience');
    await ready(page); await page.locator('#start-button').click();
    // Emulate denied browser capabilities to validate fallbacks, not native OS UI.
    await play(page,Object.values(endings)[0]);
    await page.evaluate(() => {
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}});
      document.execCommand=()=>false;
    });
    await page.locator('#copy-result').click(); assert.equal(await page.locator('#manual-copy').isVisible(),true);
    assert.ok((await page.locator('#manual-copy').inputValue()).includes('멈춘 토요일')); record('Denied clipboard exposes selectable manual-copy text');
    await page.evaluate(() => { navigator.share=async data=>{window.__shared=data;}; });
    await page.locator('#restart').click(); await play(page,Object.values(endings)[1]);
    await page.locator('#native-share').click(); assert.ok(await page.evaluate(()=>window.__shared.text.includes('멈춘 토요일'))); record('Web Share API branch passes expected payload (API emulated)');
    await page.goto(base); assert.equal(await page.locator('.tool-card').count(),31);
    assert.ok((await page.locator('.hero').innerText()).includes('주말 계획표'));
    await page.locator('#search').fill('이동 제약'); assert.equal(await page.locator('.tool-card:visible').count(),1);
    await page.locator('[data-category="생활·도구"]').filter({hasText:'생활·도구'}).first().click();
    assert.equal(await page.locator('.tool-card:visible').count(),1);
    await page.locator('.tool-card:visible .try-link').click(); assert.ok(page.url().endsWith(gamePath)); record('31-card catalog, search/category filter, game link and retained season2 hero');
    await page.goto(base+'stopped_saturday/stopped_saturday_doc.html'); await page.locator('#intent summary').click(); assert.ok((await page.locator('#intent').innerText()).includes('의료')); record('Guide loads with scope and privacy explanation');
    await context.close();

    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const phone=await mobile.newPage(); watch(phone); await ready(phone); await noOverflow(phone); await shot(phone,'07-cover-mobile');
    await phone.locator('#start-button').tap(); await noOverflow(phone); await shot(phone,'08-choice-mobile');
    for(let i=0;i<12;i++) {
      const before=await state(phone),index=i%before.choices.length;
      await phone.locator('#choices button').nth(index).tap();
      assert.equal((await state(phone)).minuteOfDay,before.minuteOfDay+before.choiceDurations[index]);
      await advance(phone,900); await noOverflow(phone);
      const rect=await phone.locator('#day-canvas').boundingBox(); assert.ok(rect.y>=0 && rect.y<250,'reaction movement should be in mobile viewport');
      if(i===0) await shot(phone,'09-moving-mobile');
      const touchSize=await phone.locator('#continue-button').boundingBox(); assert.ok(touchSize.height>=44);
      await phone.locator('#continue-button').tap();
    }
    assert.equal((await state(phone)).mode,'result'); await noOverflow(phone); await shot(phone,'10-ending-mobile'); record('Mobile touch completes twelve timed choices with visible movement and no overflow');
    for(const width of [320,360,768]) {
      await phone.setViewportSize({width,height:900}); await ready(phone); await noOverflow(phone); await phone.locator('#start-button').tap(); await noOverflow(phone);
      for(const button of await phone.locator('#choices button').all()) assert.ok((await button.boundingBox()).height>=44);
      await shot(phone,`11-choice-${width}`);
    }
    record('320/360/390/768px layouts and minimum 44px choice targets');
    await phone.setViewportSize({width:320,height:844}); await toStairs(phone,true);await phone.locator('#choices button').first().tap();
    await advance(phone,4300); await noOverflow(phone);
    assert.equal(await phone.locator('#effort-monitor').isVisible(),true);
    await shot(phone,'17-stairs-mobile-320');
    record('320px touch staircase and energy monitor remain readable without overflow');
    await mobile.close();
    const reducedContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const reducedPage=await reducedContext.newPage(); watch(reducedPage); await ready(reducedPage); await reducedPage.locator('#start-button').click(); await skipRhythm(reducedPage);await reducedPage.locator('#choices button').first().click();
    const still=(await state(reducedPage)).motion; await advance(reducedPage,2000); assert.deepEqual((await state(reducedPage)).motion,still); assert.equal(still.moving,false);
    await reducedPage.locator('#motion-toggle').click(); assert.equal((await state(reducedPage)).reducedMotion,false); await advance(reducedPage,400); assert.equal((await state(reducedPage)).motion.moving,true);
    await reducedPage.locator('#motion-toggle').click(); assert.equal((await state(reducedPage)).motion.moving,false); record('OS reduced-motion and manual motion toggle');
    await toStairs(reducedPage);
    await reducedPage.locator('#choices button').first().click(); const reducedStairs=(await state(reducedPage)).motion;
    assert.equal(reducedStairs.kind,'stairs'); assert.equal(reducedStairs.moving,false);
    await advance(reducedPage,20000); assert.deepEqual((await state(reducedPage)).motion,reducedStairs);
    assert.equal(reducedStairs.effort.displayEnergy,(await state(reducedPage)).energy);
    await shot(reducedPage,'18-stairs-reduced-motion');
    record('Reduced-motion stairs show the settled landing and final energy immediately');
    await reducedContext.close();
    assert.deepEqual(errors,[]); record('No JavaScript exceptions or console errors');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,endings,untested:['Actual screen-reader speech','Physical iOS/Android browsers and native OS sharing','All internal behaviors of existing simulators']},null,2));
  } finally { await browser.close(); }
})().catch(error => { fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.stack},null,2)); console.error(error); process.exitCode=1; });
