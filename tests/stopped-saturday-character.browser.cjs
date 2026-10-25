// Verify the real game integration, not only the renderer's appearance API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright');
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const out = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/saturday-characters');
const checks = [], errors = [], appearances = [], timings = [];
const state = page => page.evaluate(() => JSON.parse(render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => advanceTime(ms), ms);
const canonical = s => ({ step:s.step, conditions:s.conditions, energy:s.energy, mood:s.mood, body:s.body, minuteOfDay:s.minuteOfDay, context:s.context });
const pass = name => { checks.push(name); console.log('PASS', name); };
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
}
(async () => {
  fs.mkdirSync(out, { recursive:true });
  const browser = await chromium.launch({ headless:true });
  try {
    const styles = ['crop','side-part','wavy','bob','ponytail','bun'];
    const pictures = new Set();
    for(const gender of ['male','female']) for(const [index,hairStyle] of styles.entries()) {
      const context = await browser.newContext({ viewport:{width:390,height:700} });
      await context.addInitScript(values => {
        window.appearanceDraws = 0;
        Math.random = () => values[window.appearanceDraws++] ?? 0;
      }, [0,0,0,gender === 'male' ? 0 : .75,(index+.5)/6,0,0]);
      const page = await context.newPage(); watch(page);
      await page.goto(base+'stopped_saturday/stopped_saturday.html');
      await advance(page,0);
      assert.equal(await page.evaluate(() => appearanceDraws),0,'cover does not consume a new character');
      await page.locator('#start-button').click();
      const initial = await state(page), expected = {gender,hairStyle};
      assert.deepEqual(initial.conditions.appearance,expected);
      assert.deepEqual(initial.motion.appearance,expected,'sampled appearance reaches the visible character');
      assert.equal(await page.evaluate(() => appearanceDraws),7);
      pictures.add(await page.locator('#day-canvas').evaluate(c => c.toDataURL()));
      // The third preparation option is a short seated rest action.
      await page.locator('#choices button').last().click();
      const committed = await state(page);
      assert.equal(committed.mode,'animation');
      assert.equal(committed.animation.minimumMs,3000);
      await advance(page,2999);
      assert.equal((await state(page)).mode,'animation','no automatic cut before three seconds');
      assert.deepEqual(canonical(await state(page)),canonical(committed));
      assert.deepEqual((await state(page)).motion.appearance,expected);
      await advance(page,1);
      assert.equal((await state(page)).mode,'reaction','short action finishes at three seconds');
      assert.deepEqual(canonical(await state(page)),canonical(committed));
      assert.equal(await page.evaluate(() => appearanceDraws),7,'animation never rerolls the character, room or injury');
      appearances.push(expected);
      if(index === 4) await page.screenshot({path:path.join(out,gender+'-ponytail-result.png')});
      await context.close();
    }
    assert.equal(pictures.size,12,'all twelve gender/style combinations produce different pictures');
    pass('All 12 independently sampled gender/hair combinations reach the canvas and stay fixed during a three-second action');
    const context = await browser.newContext({viewport:{width:390,height:700}});
    const page = await context.newPage(); watch(page);
    await page.goto(base+'stopped_saturday/stopped_saturday.html');
    await page.locator('#start-button').click();
    // Observe real animation frames without the deterministic test clock.
    await page.evaluate(() => {
      window.realStart = 0; window.realEnd = 0;
      document.querySelector('#choices').addEventListener('click',() => {window.realStart=performance.now();},{once:true});
      new MutationObserver(() => {
        if(window.realStart && !document.querySelector('#animation-view').hidden) return;
        if(window.realStart && !window.realEnd && JSON.parse(render_game_to_text()).mode==='reaction') window.realEnd=performance.now();
      }).observe(document.querySelector('#animation-view'),{attributes:true,attributeFilter:['hidden']});
    });
    await page.locator('#choices button').last().click();
    await page.waitForFunction(() => window.realEnd > 0,null,{timeout:10000});
    const elapsed = await page.evaluate(() => realEnd-realStart); timings.push(elapsed);
    assert.ok(elapsed>=3000,`real presentation was ${elapsed}ms`);
    assert.ok(elapsed<9000,'short action completes without an excessive idle delay');
    pass('Actual requestAnimationFrame playback keeps the illustration visible for at least three seconds');
    await advance(page,0); await page.locator('#continue-button').click();
    await page.locator('#choices button').first().click();
    const beforeSkip = await state(page);
    await page.locator('#skip-animation').click();
    assert.equal((await state(page)).mode,'reaction');
    assert.deepEqual(canonical(await state(page)),canonical(beforeSkip));
    await advance(page,60000); assert.equal((await state(page)).mode,'reaction');
    pass('Explicit skip is available before three seconds and never repeats the committed choice');
    await context.close();
    assert.deepEqual(errors,[]); pass('No JavaScript or console errors');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,appearances,timings},null,2));
  } finally { await browser.close(); }
})().catch(error => { fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,appearances,timings,error:error.stack},null,2)); console.error(error); process.exitCode=1; });
