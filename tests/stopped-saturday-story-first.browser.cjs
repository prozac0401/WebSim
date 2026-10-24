// Serve the repository, then run: node tests/stopped-saturday-story-first.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { storyViewport, animationViewport, skipAnimation } = require('./saturday-story-viewport.cjs');
const { STORAGE_KEY } = require('../stopped_saturday/saturday-store.js');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const url = base + 'stopped_saturday/stopped_saturday.html';
const out = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/saturday-story-first');
const checks = [], errors = [], measurements = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const canonical = s => ({step:s.step,energy:s.energy,mood:s.mood,body:s.body,minuteOfDay:s.minuteOfDay,elapsedMinutes:s.elapsedMinutes,conditions:s.conditions,context:s.context,traces:s.traces});
const advance = (page,ms) => page.evaluate(ms => window.advanceTime(ms),ms);
const pass = name => { checks.push(name); console.log('PASS', name); };
const observe = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
};
async function check(page, label, options) {
  try {
    const measure = (await state(page)).mode === 'animation' ? await animationViewport(page,label) : await storyViewport(page, label, options);
    measurements.push(measure);
    return measure;
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failed-viewport.png') });
    throw error;
  }
}
async function shot(page, name) { await page.screenshot({ path: path.join(out, name + '.png') }); }
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await advance(page,0);
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await advance(page,0);
}
async function scrollToIllustration(page) {
  // Simulate inspecting the illustration below the prose before the next transition.
  await page.locator('#day-canvas').scrollIntoViewIfNeeded();
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const width of [320, 390, 768]) {
      const context = await browser.newContext({ viewport: { width, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await context.addInitScript(() => { Math.random = () => 0; });
      const page = await context.newPage(); observe(page); await ready(page);
      await check(page, `${width}: initial cover`, { focus: false }); await shot(page, `${width}-cover`);
      await page.locator('#scenario-select').selectOption('classic');
      await page.locator('#start-button').tap();
      await check(page, `${width}: start`); await shot(page, `${width}-start`);
      // Select the lowest choice, forcing scrolling before the animation focus runs.
      await page.locator('#choices button').last().tap();
      await check(page, `${width}: first animation`); await shot(page, `${width}-animation`);
      const committed = await state(page);
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).current.phase,STORAGE_KEY),'reaction','transient animation is saved as a committed reaction');
      await advance(page,60000);
      await check(page,`${width}: natural animation completion`); await shot(page,`${width}-reaction`);
      assert.equal((await state(page)).mode, 'reaction');
      assert.deepEqual(canonical(await state(page)),canonical(committed),'animation completion does not commit the choice again');
      await advance(page,60000);assert.equal((await state(page)).mode,'reaction','reading never continues automatically');
      await scrollToIllustration(page); await reload(page); await check(page,`${width}: restored finished reaction`);
      assert.deepEqual(canonical(await state(page)),canonical(committed));
      await page.locator('#home-button').tap(); await check(page, `${width}: cover after reaction`); await page.locator('#resume-button').tap();
      await check(page, `${width}: explicit resume reaction`);
      await page.locator('#continue-button').tap();
      await check(page, `${width}: next scene`); await shot(page, `${width}-next`);
      await scrollToIllustration(page); await reload(page); await check(page, `${width}: restored game`);
      await page.locator('#home-button').tap(); await check(page, `${width}: cover after game`); await page.locator('#resume-button').tap();
      await check(page, `${width}: explicit resume game`);
      // Number keys still activate choices after programmatic heading focus.
      await page.keyboard.press('1');
      await check(page, `${width}: keyboard animation`);
      const beforeToggle = await state(page);
      await advance(page,600);const moving=await state(page);
      assert.notEqual(moving.motion.x,beforeToggle.motion.x,'walking actually moves before the result is shown');
      await page.locator('#motion-toggle').tap();
      assert.equal((await state(page)).reducedMotion, true);
      assert.equal((await state(page)).mode,'reaction','reducing motion immediately reveals committed text');
      await check(page,`${width}: reduced during animation`);
      const still = (await state(page)).motion;
      await advance(page,1500);
      assert.deepEqual((await state(page)).motion, still);
      await page.locator('#motion-toggle').tap();
      assert.equal((await state(page)).reducedMotion, false);
      assert.equal((await state(page)).energy, beforeToggle.energy);
      assert.equal((await state(page)).minuteOfDay, beforeToggle.minuteOfDay);
      await advance(page,1500);assert.equal((await state(page)).mode,'reaction');assert.equal((await state(page)).motion.moving,false,'finished animation does not replay');
      await page.locator('#continue-button').tap(); await check(page, `${width}: after illustration controls`);
      await page.locator('#choices button').last().tap();await check(page,`${width}: animation before reload`);
      await advance(page,400);const interrupted=await state(page);
      const interruptedRaw=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
      await reload(page);await check(page,`${width}: mid-animation reload reveals text`);
      assert.equal((await state(page)).mode,'reaction');
      assert.deepEqual(canonical(await state(page)),canonical(interrupted));
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY),interruptedRaw,'reload does not add a second commit');
      await page.locator('#continue-button').tap();await check(page,`${width}: next after interrupted animation`);
      await page.locator('#choices button').last().tap();await check(page,`${width}: animation before cover`);
      const abandonedAnimation=canonical(await state(page));
      await page.locator('#home-button').tap();await check(page,`${width}: cancel presentation to cover`);
      await advance(page,60000);assert.equal((await state(page)).mode,'cover','cancelled animation cannot later reveal stale text');
      await page.locator('#resume-button').tap();await check(page,`${width}: resume interrupted animation as text`);
      assert.equal((await state(page)).mode,'reaction');assert.deepEqual(canonical(await state(page)),abandonedAnimation);
      await page.locator('#continue-button').tap();await check(page,`${width}: next after resumed animation`);
      let guard = 0;
      while ((await state(page)).mode !== 'result') {
        assert.ok(++guard <= 24, 'day reaches result');
        const current = await state(page);
        if (current.mode === 'game') {
          await page.locator('#choices button').last().tap();
          await check(page, `${width}: later animation ${current.step + 1}`);
          const beforeSkip=canonical(await state(page));
          if(current.step === 4) {
            await page.locator('#backup-button').tap();
            assert.equal(await page.locator('#export-dialog').isVisible(),true);
            await page.keyboard.press('Escape');
            await page.locator('#export-dialog').waitFor({state:'hidden'});
            assert.equal((await state(page)).mode,'animation','Escape closes the open backup dialog without skipping the presentation');
            assert.deepEqual(canonical(await state(page)),beforeSkip,'opening and closing backup does not change the choice');
            await page.keyboard.press('Escape');
            assert.equal((await state(page)).mode,'reaction','the next Escape skips the presentation');
          }
          else await skipAnimation(page,true);
          await check(page,`${width}: skipped to reaction ${current.step + 1}`);
          if(current.step === 4) await shot(page,`${width}-skipped-reaction`);
          assert.deepEqual(canonical(await state(page)),beforeSkip,'skip changes presentation only');
        } else {
          await page.locator('#continue-button').tap();
          await check(page, `${width}: later transition ${current.step}`);
        }
      }
      const done = await state(page);
      assert.equal(done.step, done.maxSteps);
      await check(page, `${width}: result`); await shot(page, `${width}-result`);
      await scrollToIllustration(page); await reload(page); await check(page, `${width}: restored result`);
      assert.equal((await state(page)).ending, done.ending);
      await page.locator('#restart').tap(); await check(page, `${width}: restart`);
      assert.equal((await state(page)).step, 0);
      await context.close();
      pass(`${width}×700: choice → visible animation with skip → text; automatic completion, skip, interruption/reload, reduced motion, next, result and restart preserve committed state`);
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); observe(page); await ready(page);
    await page.locator('#start-button').click();
    const desktop = await check(page, 'desktop story-first columns', { stacked: false });
    assert.ok(desktop.story.right <= desktop.aside.left, 'desktop story is the left column');
    assert.ok(desktop.story.width > desktop.aside.width, 'desktop story has the wider column');
    await shot(page, 'desktop-start'); await context.close();
    pass('Desktop prose is wider and left of the illustration; DOM and focus order agree');
    const reducedContext=await browser.newContext({viewport:{width:390,height:700},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const reduced=await reducedContext.newPage();observe(reduced);await ready(reduced);
    await reduced.locator('#start-button').tap();await reduced.locator('#choices button').first().tap();
    assert.equal((await state(reduced)).mode,'reaction');await check(reduced,'OS reduced motion skips directly to text');
    assert.equal(await reduced.locator('#animation-view').isVisible(),false);
    const reducedState=canonical(await state(reduced));await advance(reduced,60000);assert.deepEqual(canonical(await state(reduced)),reducedState);
    await shot(reduced,'reduced-motion-reaction');await reducedContext.close();
    pass('OS reduced-motion shows result text immediately and does not repeat story effects');
    assert.deepEqual(errors, []); pass('No JavaScript exceptions or console errors');
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors, measurements }, null, 2));
  } finally { await browser.close(); }
})().catch(error => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ checks, errors, measurements, error: error.stack }, null, 2));
  console.error(error); process.exitCode = 1;
});
