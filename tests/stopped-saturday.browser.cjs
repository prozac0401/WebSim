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
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if(msg.type()==='error') errors.push(msg.text()); });
}
function findEndings(current=story.freshState(), route=[]) {
  if(current.scene==='end') { const ending=story.determineEnding(current); endings[ending.name] ||= route; return; }
  story.getNode(current).choices.forEach((_,i) => findEndings(story.choose(current,i),[...route,i]));
}
async function ready(page) {
  await page.goto(base+gamePath);
  await page.waitForFunction(() => typeof window.render_game_to_text==='function');
  await advance(page,0);
}
async function choice(page,index,touch=false) {
  const b=page.locator('#choices button').nth(index);
  if(touch) await b.tap(); else await b.click();
  assert.equal((await state(page)).mode,'reaction');
  assert.equal(await page.locator('#reaction-text p').count() >= 2,true);
  await advance(page,7000);
  if(touch) await page.locator('#continue-button').tap(); else await page.locator('#continue-button').click();
}
async function play(page,route,touch=false) {
  for(const index of route) await choice(page,index,touch);
  const s=await state(page); assert.equal(s.mode,'result'); assert.equal(s.step,5); return s;
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth+1),true,'horizontal overflow');
}
(async () => {
  fs.mkdirSync(out,{recursive:true}); findEndings(); assert.equal(Object.keys(endings).length,6);
  const browser=await playwright.chromium.launch({headless:true});
  try {
    const context=await browser.newContext({ viewport:{width:1440,height:1100}, acceptDownloads:true, permissions:['clipboard-read','clipboard-write'] });
    const page=await context.newPage(); watch(page);
    await ready(page); assert.equal((await state(page)).mode,'cover'); await shot(page,'01-cover-desktop');
    await page.locator('#start-button').focus(); await page.keyboard.press('Enter');
    assert.equal((await state(page)).step,0); assert.equal(await page.locator('#choices button').count(),4);
    assert.equal(await page.evaluate(() => document.activeElement.id),'scene-title');
    await shot(page,'02-choice-desktop'); record('Start with Enter, four initial routes, heading focus');
    await page.keyboard.press('1'); assert.equal((await state(page)).route,'outside');
    const movement0=(await state(page)).motion; await advance(page,600); const movement1=(await state(page)).motion;
    await advance(page,700); const movement2=(await state(page)).motion;
    assert.equal(movement0.kind,'walk'); assert.notEqual(movement1.x,movement2.x); assert.notDeepEqual(movement1.rightFoot,movement2.rightFoot);
    await shot(page,'03-moving-desktop'); await advance(page,10000); assert.equal((await state(page)).motion.moving,false);
    record('Number selection, translated walking with articulated feet, finite movement');
    await page.locator('#body-notes summary').click(); assert.equal(await page.locator('#body-list .body-item').count(),6); await shot(page,'04-body-notes-desktop');
    await page.locator('#continue-button').focus(); await page.keyboard.press('Enter');
    await page.locator('#choices button').first().focus(); await page.keyboard.press('2'); assert.equal((await state(page)).mode,'game');
    await page.keyboard.press('Enter'); assert.equal((await state(page)).mode,'reaction');
    await page.locator('#continue-button').click();
    await play(page,[0,0,0]); record('Focused buttons ignore number shortcuts; Enter progresses; five choices end');
    await shot(page,'05-ending-desktop');
    await page.locator('.journal summary').click(); assert.equal(await page.locator('#journal-list li').count(),5); await shot(page,'06-journal-desktop');
    await page.locator('#copy-result').click(); const copied=await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes((await state(page)).ending)); assert.ok(!/localhost|127\.0\.0\.1|github\.io/.test(copied)); record('Real clipboard copy includes ending, omits unpublished/local URL');
    const downloadPromise=page.waitForEvent('download'); await page.locator('#save-image').click(); const download=await downloadPromise;
    const png=path.join(out,'ending-card.png'); await download.saveAs(png);
    const bytes=fs.readFileSync(png); assert.equal(bytes.subarray(1,4).toString(),'PNG'); assert.equal(bytes.readUInt32BE(16),1080); assert.equal(bytes.readUInt32BE(20),1350); record('Actual PNG download has valid 1080×1350 image');
    await page.locator('#restart').click(); let reset=await state(page); const fresh=story.freshState();
    assert.equal(reset.step,0); assert.equal(reset.route,null); assert.deepEqual(reset.body,fresh.body); assert.equal(reset.energy,fresh.energy); assert.equal(reset.mood,fresh.mood); assert.deepEqual(reset.traces,[]); record('Restart resets all story/body state and journal');
    for(const [name,route] of Object.entries(endings)) {
      const result=await play(page,route); assert.equal(result.ending,name); await page.locator('#restart').click();
    }
    record('All six named endings reached through visible controls');
    for(const [route,expected,label] of [[[1],'desk','desk'],[[3],'observe','window'],[[0,0],'sit','street']]) {
      await ready(page); await page.locator('#start-button').click();
      for(const index of route) await choice(page,index);
      await advance(page,12000); const arrived=(await state(page)).motion;
      assert.equal(arrived.poseKind,expected); assert.equal(arrived.support,'seat'); assert.equal(arrived.moving,false);
      await shot(page,`12-arrived-${label}`);
    }
    record('Desk, window and street arrivals finish seated and match the narrative');
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
    for(let i=0;i<5;i++) {
      await phone.locator('#choices button').nth(i%4).tap();
      await advance(phone,900); await noOverflow(phone);
      const rect=await phone.locator('#day-canvas').boundingBox(); assert.ok(rect.y>=0 && rect.y<250,'reaction movement should be in mobile viewport');
      if(i===0) await shot(phone,'09-moving-mobile');
      const touchSize=await phone.locator('#continue-button').boundingBox(); assert.ok(touchSize.height>=44);
      await phone.locator('#continue-button').tap();
    }
    assert.equal((await state(phone)).mode,'result'); await noOverflow(phone); await shot(phone,'10-ending-mobile'); record('Mobile touch completes five choices with visible movement and no overflow');
    for(const width of [320,360,768]) {
      await phone.setViewportSize({width,height:900}); await ready(phone); await noOverflow(phone); await phone.locator('#start-button').tap(); await noOverflow(phone);
      for(const button of await phone.locator('#choices button').all()) assert.ok((await button.boundingBox()).height>=44);
      await shot(phone,`11-choice-${width}`);
    }
    record('320/360/390/768px layouts and minimum 44px choice targets');
    await mobile.close();
    const reducedContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const reducedPage=await reducedContext.newPage(); watch(reducedPage); await ready(reducedPage); await reducedPage.locator('#start-button').click(); await reducedPage.locator('#choices button').first().click();
    const still=(await state(reducedPage)).motion; await advance(reducedPage,2000); assert.deepEqual((await state(reducedPage)).motion,still); assert.equal(still.moving,false);
    await reducedPage.locator('#motion-toggle').click(); assert.equal((await state(reducedPage)).reducedMotion,false); await advance(reducedPage,400); assert.equal((await state(reducedPage)).motion.moving,true);
    await reducedPage.locator('#motion-toggle').click(); assert.equal((await state(reducedPage)).motion.moving,false); record('OS reduced-motion and manual motion toggle');
    await reducedContext.close();
    assert.deepEqual(errors,[]); record('No JavaScript exceptions or console errors');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,endings,untested:['Actual screen-reader speech','Physical iOS/Android browsers and native OS sharing','All internal behaviors of existing simulators']},null,2));
  } finally { await browser.close(); }
})().catch(error => { fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.stack},null,2)); console.error(error); process.exitCode=1; });
