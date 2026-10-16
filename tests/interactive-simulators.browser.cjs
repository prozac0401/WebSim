// Optional real-browser regression suite; serve the repository first.
// WEBSIM_URL=http://127.0.0.1:8000/ node tests/interactive-simulators.browser.cjs
// Uses local Playwright or the installed develop-web-game skill runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/ink-boids/final');
const checks = [], errors = [], metrics = [];
const touchSessions = new WeakMap();
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const pixelHash = bytes => createHash('sha256').update(bytes).digest('hex');
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const record = name => { checks.push(name); console.log('PASS', name); };
const screenshot = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
async function ready(page, file) {
  await page.goto(base + file);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await advance(page, 0);
}
async function drag(page, from, to) {
  await page.locator('#canvas').scrollIntoViewIfNeeded();
  const r = await page.locator('#canvas').boundingBox();
  await page.mouse.move(r.x + r.width * from[0], r.y + r.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * to[0], r.y + r.height * to[1], { steps: 14 });
  await page.mouse.up();
}
async function touch(page, action, x = .5, y = .5) {
  await page.locator('#canvas').scrollIntoViewIfNeeded();
  const r = await page.locator('#canvas').boundingBox();
  let client = touchSessions.get(page);
  if (!client) { client = await page.context().newCDPSession(page); touchSessions.set(page, client); }
  await client.send('Input.dispatchTouchEvent', { type: action,
    touchPoints: ['touchEnd', 'touchCancel'].includes(action) ? [] : [{ x: r.x + r.width * x, y: r.y + r.height * y, id: 0 }] });
}
async function reversible(page) {
  await ready(page, 'ink_time_machine/ink_time_machine.html');
  for (const flow of ['cylinder', 'square', 'vortices', 'plates']) {
    await page.selectOption('#flow', flow);
    for (const preset of ['heart', 'drops', 'stripes', 'rosette', 'galaxy', 'sunburst']) {
      await page.selectOption('#preset', preset);
      const initial = await state(page);
      await page.click('#mix'); await advance(page, 4200);
      assert.equal((await state(page)).turns, 3);
      assert.ok((await state(page)).errorPercent > 1);
      await page.click('#reverse'); await advance(page, 4200);
      const result = await state(page);
      assert.equal(result.turns, 0);
      assert.ok(result.errorPercent < 1e-6, `${flow}/${preset} reverse error`);
      assert.equal(result.particles, initial.particles);
    }
    record(`ink ${flow}: six presets mix/reverse`);
    await page.selectOption('#preset', 'heart');
    await page.locator('#diffusion').fill('10');
    await page.click('#mix'); await advance(page, 4200);
    await page.click('#reverse'); await advance(page, 4200);
    assert.ok((await state(page)).errorPercent > .1);
    await page.locator('#diffusion').fill('0'); await page.click('#restore');
    await page.click('#mix'); await advance(page, 700); await page.click('#pause');
    const paused = await state(page); await advance(page, 1200);
    assert.deepEqual(await state(page), paused);
    await page.click('#pause'); await advance(page, 200); await page.click('#reverse'); await advance(page, 2200);
    assert.ok((await state(page)).errorPercent < 1e-6);
    await page.click('#restore'); await page.click('#left'); await advance(page, 400);
    assert.equal((await state(page)).turns, -.25);
    await page.click('#reverse'); await advance(page, 400);
    assert.ok((await state(page)).errorPercent < 1e-6);
    await page.selectOption('#preset', 'blank'); await page.selectOption('#symmetry', '3');
    await drag(page, [.66, .45], [.71, .57]);
    assert.ok((await state(page)).particles > 0);
    await page.click('#undo-stroke'); assert.equal((await state(page)).particles, 0);
    record(`ink ${flow}: diffusion, pause, negative step, drawing and undo`);
  }
  await page.selectOption('#flow', 'vortices'); await page.selectOption('#preset', 'galaxy');
  await page.click('#mix'); await advance(page, 1800); await page.click('#pause');
  await screenshot(page, 'after-ink-reversible-desktop');
}
async function liveInk(page) {
  const preserved = await state(page);
  await page.click('#experiment-live');
  assert.equal((await state(page)).experiment, 'live');
  const initial = (await state(page)).live;
  assert.ok(initial.particleCount > 1000 && initial.particleCount <= initial.limit);
  await advance(page, 1600);
  assert.ok((await state(page)).live.time > initial.time);
  assert.notDeepEqual((await state(page)).live.sample, initial.sample);
  await page.locator('.live-swatches [data-color="2"]').click();
  const beforeDrop = (await state(page)).live.injections;
  await page.click('#live-drop');
  assert.ok((await state(page)).live.injections > beforeDrop);
  await drag(page, [.35, .45], [.65, .6]); await advance(page, 800);
  assert.ok((await state(page)).live.stirs > 0);
  await page.click('#live-pause');
  const paused = (await state(page)).live;
  const pixels = await page.locator('#canvas').screenshot();
  await advance(page, 1200);
  assert.deepEqual((await state(page)).live, paused);
  assert.equal(pixelHash(await page.locator('#canvas').screenshot()), pixelHash(pixels), 'paused ink visual stays frozen');
  await screenshot(page, 'after-ink-live-desktop');
  await page.click('#live-tool-stir');
  const beforeStir = (await state(page)).live;
  await drag(page, [.45, .5], [.6, .55]);
  const stirred = (await state(page)).live;
  assert.ok(stirred.stirs > beforeStir.stirs);
  assert.equal(stirred.injections, beforeStir.injections);
  assert.equal(stirred.time, beforeStir.time);
  await page.evaluate(() => window.WebSimAmbient.setEnabled(false));
  assert.equal((await state(page)).live.effects, false);
  assert.deepEqual((await state(page)).live.sample, stirred.sample);
  await page.evaluate(() => window.WebSimAmbient.setEnabled(true));
  await page.click('#experiment-reversible');
  const returned = await state(page);
  for (const key of ['flow', 'turns', 'time', 'particles', 'sample', 'target', 'errorPercent', 'mode']) assert.deepEqual(returned[key], preserved[key], `preserved reversible ${key}`);
  await page.click('#reverse'); await advance(page, 2400);
  assert.ok((await state(page)).errorPercent < 1e-6);
  await page.click('#experiment-live');
  assert.equal((await state(page)).live.time, stirred.time);
  await page.click('#live-clear'); assert.equal((await state(page)).live.particleCount, 0);
  await page.click('#live-tool-ink'); await drag(page, [.45, .5], [.6, .55]);
  assert.ok((await state(page)).live.particleCount > 0);
  await page.click('#live-reset'); assert.equal((await state(page)).live.time, 0);
  assert.ok((await state(page)).live.particleCount > 1000);
  await page.locator('#canvas').focus(); await page.keyboard.press('Space');
  assert.equal((await state(page)).live.running, false);
  await page.keyboard.press('Space'); assert.equal((await state(page)).live.running, true);
  await page.keyboard.press('f');
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.evaluate(() => document.exitFullscreen());
  const download = page.waitForEvent('download'); await page.click('#save');
  assert.ok((await download).suggestedFilename().endsWith('.png'));
  await page.click('#experiment-reversible'); await page.click('#restore');
  await page.click('#mix'); await advance(page, 700);
  let active = await state(page);
  await page.click('#experiment-live'); await advance(page, 500); await page.click('#experiment-reversible');
  assert.equal((await state(page)).mode, 'running');
  assert.deepEqual((await state(page)).sample, active.sample);
  await page.click('#reverse'); await advance(page, 200); active = await state(page);
  await page.click('#experiment-live'); await advance(page, 500); await page.click('#experiment-reversible');
  assert.deepEqual((await state(page)).sample, active.sample);
  await advance(page, 1000); assert.ok((await state(page)).errorPercent < 1e-6);
  await page.selectOption('#preset', 'blank'); await drag(page, [.4, .5], [.6, .6]);
  active = await state(page); assert.equal(active.undo, 1);
  await page.click('#experiment-live'); await page.click('#experiment-reversible');
  assert.deepEqual((await state(page)).sample, active.sample);
  await page.click('#undo-stroke'); assert.equal((await state(page)).particles, 0);
  record('ink live: motion, color injection, drag/stir, pause pixels, effects independence, preserved reversal, reset, keys, fullscreen, PNG');
  record('ink: running mix/reverse and undo history survive live mode round-trips');
}
async function mobileInk(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ready(page, 'ink_time_machine/ink_time_machine.html?experiment=live');
  let s = (await state(page)).live;
  assert.ok(s.limit <= 2000);
  await touch(page, 'touchStart', .4, .5);
  assert.equal((await state(page)).live.inputActive, true);
  await touch(page, 'touchMove', .65, .55); await advance(page, 250);
  assert.ok((await state(page)).live.injections > s.injections);
  await touch(page, 'touchEnd'); assert.equal((await state(page)).live.inputActive, false);
  await touch(page, 'touchStart'); await touch(page, 'touchCancel');
  assert.equal((await state(page)).live.inputActive, false);
  await touch(page, 'touchStart');
  await page.setViewportSize({ width: 400, height: 850 });
  await page.waitForFunction(() => !JSON.parse(render_game_to_text()).live.inputActive);
  assert.equal((await state(page)).live.inputActive, false, 'resize releases an active stroke');
  await touch(page, 'touchEnd');
  await page.click('#live-pause'); s = (await state(page)).live;
  await page.setViewportSize({ width: 844, height: 390 });
  assert.deepEqual((await state(page)).live.sample, s.sample);
  await page.setViewportSize({ width: 360, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot(page, 'after-ink-mobile');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal((await state(page)).live.effects, false);
  await ready(page, 'ink_time_machine/ink_time_machine.html?experiment=live');
  assert.equal((await state(page)).live.running, false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => JSON.parse(render_game_to_text()).live.effects);
  await page.click('#live-reset');
  assert.equal((await state(page)).live.running, true);
  record('ink live: real touch injection/end/cancel, mobile cap, rotation, reduced-motion initial pause');
}
async function boids(page) {
  await ready(page, 'boids_simulation/boids_simulation.html');
  await page.click('#boids-pause');
  const original = await state(page);
  await page.click('#view-lights');
  assert.equal((await state(page)).visualMode, 'lights');
  assert.deepEqual((await state(page)).boids, original.boids);
  await page.click('#view-birds'); assert.deepEqual((await state(page)).boids, original.boids);
  await page.click('#view-lights'); await page.click('#boids-start'); await advance(page, 1800);
  let s = await state(page); assert.ok(s.stepCount > original.stepCount);
  assert.ok(s.trailPoints > 0 && s.trailPoints <= s.boids.length * s.trailPointLimit);
  await page.click('#boids-pause'); s = await state(page);
  const pixels = await page.locator('#canvas').screenshot(); await advance(page, 1200);
  assert.deepEqual(await state(page), s);
  assert.equal(pixelHash(await page.locator('#canvas').screenshot()), pixelHash(pixels), 'paused boids visual stays frozen');
  await page.click('#boids-step'); assert.equal((await state(page)).stepCount, s.stepCount + 1);
  await page.click('#inspect-next'); assert.ok((await state(page)).inspection);
  await page.click('#inspect-clear'); assert.equal((await state(page)).inspection, null);
  await page.check('#heading-colors');
  const beforePreset = (await state(page)).boids;
  await page.click('[data-boids-preset=separate]');
  assert.deepEqual((await state(page)).boids, beforePreset);
  assert.equal((await state(page)).params.alignment, 0);
  await page.click('[data-boids-preset=balanced]');
  await page.locator('#boidCount').fill('200'); assert.equal((await state(page)).boids.length, 200);
  await page.click('#boids-reset'); s = await state(page);
  assert.equal(s.running, false); assert.equal(s.stepCount, 0); assert.equal(s.mouse, null);
  assert.equal(s.trailPoints, 0); assert.equal(s.visualMode, 'lights');
  await page.click('#boids-start'); await advance(page, 2200); await page.click('#boids-pause');
  await screenshot(page, 'after-boids-lights-desktop');
  await page.click('#view-birds'); await screenshot(page, 'after-boids-birds-desktop');
  record('boids: visual-only modes, trails, pause pixels, step, inspection, presets and reset');
  const fixed = [{ id: 1, x: 400, y: 250, vx: 1, vy: 0 }, { id: 2, x: 460, y: 250, vx: 1, vy: 0 }];
  await page.evaluate(points => document.querySelector('#sim-app')._model.setBoids(points), fixed);
  await page.locator('#canvas').scrollIntoViewIfNeeded();
  const r = await page.locator('#canvas').boundingBox();
  await page.mouse.move(r.x + r.width * .49, r.y + r.height * .5);
  assert.ok((await state(page)).mouse);
  const forces = await page.evaluate(() => { const m = document.querySelector('#sim-app')._model, s = m.state;
    return [m.forces(s.boids, s.params, null), m.forces(s.boids, s.params, s.mouse)]; });
  assert.notDeepEqual(forces[0], forces[1]);
  await page.uncheck('#mouseRepel'); assert.equal((await state(page)).mouse, null);
  await page.check('#mouseRepel');
  record('boids: mouse repulsion changes steering and toggle clears pointer');
}
async function mobileBoids(page) {
  await ready(page, 'boids_simulation/boids_simulation.html');
  await page.click('#view-lights');
  assert.ok(Number(await page.locator('#boidCount').getAttribute('max')) <= 180);
  await touch(page, 'touchStart', .45, .5);
  assert.equal((await state(page)).pointerActive, true);
  await touch(page, 'touchMove', .65, .55); await advance(page, 300);
  assert.ok((await state(page)).mouse);
  await touch(page, 'touchEnd');
  assert.equal((await state(page)).mouse, null); assert.equal((await state(page)).pointerActive, false);
  assert.equal((await state(page)).inspection, null, 'swipe must not select a bird');
  await touch(page, 'touchStart'); await touch(page, 'touchCancel');
  assert.equal((await state(page)).mouse, null); assert.equal((await state(page)).pointerActive, false);
  await page.locator('#canvas').tap({ position: { x: 100, y: 80 } });
  assert.ok((await state(page)).inspection); await page.click('#inspect-clear');
  await advance(page, 1200); await page.click('#boids-pause');
  const before = (await state(page)).boids;
  await page.setViewportSize({ width: 844, height: 390 });
  assert.deepEqual((await state(page)).boids, before);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot(page, 'after-boids-mobile');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => JSON.parse(render_game_to_text()).trailPoints === 0);
  assert.equal((await state(page)).effectsEnabled, false); assert.equal((await state(page)).trailPoints, 0);
  assert.deepEqual((await state(page)).boids, before);
  record('boids: real touch drag/end/cancel/tap, mobile cap, rotation, reduced motion');
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.WEBSIM_BROWSER ? { executablePath: process.env.WEBSIM_BROWSER } : {}) });
  browser.on('disconnected', () => {});
  const attach = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); attach(desktop);
    if (process.env.WEBSIM_ONLY !== 'boids') { await reversible(desktop); await liveInk(desktop); }
    if (process.env.WEBSIM_ONLY !== 'ink') await boids(desktop);
    await desktop.close();
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); attach(mobile);
    if (process.env.WEBSIM_ONLY !== 'ink') await mobileBoids(mobile);
    if (process.env.WEBSIM_ONLY !== 'boids') await mobileInk(mobile);
    assert.deepEqual(errors, []);
    record('zero browser console/page errors');
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ base, checks, errors, metrics }, null, 2));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
