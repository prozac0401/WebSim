'use strict';
// Independent regression replay: seed only access to level 12, never a program
// or a successful runner. All commands, transitions, and failures use UI clicks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const keyboardOnly = process.argv.includes('--keyboard-only');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || (keyboardOnly ? 'output/playwright/routine-bot/final/safety/keyboard' : 'output/playwright/routine-bot/final/safety'));
fs.mkdirSync(output, { recursive: true });
const report = { started: new Date().toISOString(), base,
  classification: 'Independent source-informed safety regression using visible UI controls. Levels 1–11 completion is seeded solely for level-12 access. This is not blind play or end-to-end progression.',
  viewport: { width: 1440, height: 900 }, touch: false, reducedMotion: 'no-preference', android: 'NOT RUN', checks: [], errors: [] };
const write = () => fs.writeFileSync(path.join(output, 'safety-report.json'), JSON.stringify(report, null, 2));
const pass = (name, data) => { report.checks.push({ name, status: 'PASS', ...data }); write(); console.log('PASS ' + name); };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function click(page, selector) { const element = page.locator(selector); await element.scrollIntoViewIfNeeded(); await element.click(); }
const capture = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
async function stepUntil(page, predicate, max = 400) {
  for (let i = 0; i < max; i++) { const state = await read(page); if (predicate(state)) return state; await click(page, '#step'); }
  throw new Error('UI stepping did not reach expected condition within ' + max + ' events');
}
async function clear(page) { if (!await page.locator('#clear').isDisabled()) await click(page, '#clear'); await click(page, '[data-scope="main"]'); }
async function tabTo(page, attribute, value) {
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(({ attribute, value }) => document.activeElement.getAttribute(attribute) === value, { attribute, value })) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard could not reach ' + attribute + '=' + value);
}
async function keyboardReplay(page) {
  assert.equal((await read(page)).level, 1); assert.equal((await read(page)).stored, 0);
  await tabTo(page, 'data-add', 'forward');
  for (let count = 1; count <= 3; count++) {
    await page.keyboard.press('Enter');
    assert.equal((await read(page)).stored, count);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.add), 'forward', 'Palette focus must survive its DOM replacement');
  }
  const firstId = (await read(page)).program.main[0].id;
  await tabTo(page, 'data-node', firstId); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.node), firstId, 'Selected block must retain keyboard focus');
  await page.keyboard.press('Enter'); assert.equal((await read(page)).stored, 3);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.node), firstId);
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 10000 });
  assert.deepEqual((await read(page)).completed, [1]);
  await capture(page, 'keyboard-focus-after');
  pass('Tab/Enter alone inserts three blocks, preserves palette/block focus across rerenders, and solves level 1');
}
async function buildWallFollower(page) {
  await clear(page);
  await click(page, '[data-add="repeat"]'); await page.locator(`[data-repeat="${(await read(page)).program.main[0].id}"]`).selectOption('12');
  await click(page, '[data-add="blocked"]'); await click(page, '[data-add="right"]'); await click(page, '#scope-back');
  const conditionId = (await read(page)).program.main[0].body[0].id;
  await click(page, `[data-insert="${conditionId}:else"]`); await click(page, '[data-add="wait"]'); await click(page, '[data-add="forward"]');
  await click(page, '#scope-back'); await click(page, '#scope-back');
  assert.equal((await read(page)).stored, 5);
}
async function pendingFirstArrival(page) {
  await click(page, '#reset');
  await page.locator('#speed').selectOption('0.5');
  const before = await stepUntil(page, state => state.executed === 41);
  assert.equal(before.mapIndex, 0); assert.equal(before.status, 'running');
  await click(page, '#run'); // The next move reaches home; auto transition remains pending.
  const pending = await read(page);
  assert.equal(pending.mapIndex, 0); assert.equal(pending.verifiedMaps, 1);
  assert.equal(pending.event.type, 'success'); assert.ok(!pending.completed.includes(12));
  return pending;
}

(async () => {
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  const context = await browser.newContext({ viewport: report.viewport, reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    const probe = window.__routineAudioProbe = { constructed: 0, starts: 0, resumes: 0 };
    if (!NativeAudioContext) return;
    const resume = NativeAudioContext.prototype.resume;
    NativeAudioContext.prototype.resume = function (...args) { probe.resumes++; return resume.apply(this, args); };
    const start = window.OscillatorNode.prototype.start;
    window.OscillatorNode.prototype.start = function (...args) { probe.starts++; return start.apply(this, args); };
    window.AudioContext = class extends NativeAudioContext { constructor(...args) { super(...args); probe.constructed++; } };
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  try {
    await page.goto(base + 'routine_bot/routine_bot.html'); await page.waitForFunction(() => window.render_game_to_text);
    await keyboardReplay(page);
    if (keyboardOnly) { report.classification = 'Focused keyboard regression on a fresh save, no progress fixture; actual Tab/Enter inputs.'; assert.deepEqual(report.errors, []); report.status = 'PASS'; return; }
    await page.evaluate(() => {
      const fixture = { version: 1, currentLevel: 12, completed: {}, programs: {}, settings: { speed: 0.5, muted: true } };
      for (let level = 1; level <= 11; level++) fixture.completed[level] = true;
      localStorage.setItem('routinebot-save-v1', JSON.stringify(fixture)); localStorage.removeItem('routinebot-save-v1-backup');
    });
    await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
    assert.equal((await read(page)).level, 12); assert.equal((await read(page)).stored, 0);
    await buildWallFollower(page); const program = (await read(page)).program;

    const pending = await pendingFirstArrival(page); await click(page, '#pause');
    await page.waitForTimeout(1300);
    let state = await read(page);
    assert.equal(state.mapIndex, 0); assert.equal(state.verifiedMaps, 1); assert.equal(state.executed, pending.executed);
    assert.deepEqual(state.robot, pending.robot); assert.ok(!state.completed.includes(12));
    await capture(page, 'transition-paused');
    pass('pause freezes an actual pending map transition beyond its old playback interval');

    await click(page, '#step'); state = await read(page);
    assert.equal(state.mapIndex, 1); assert.equal(state.status, 'ready'); assert.equal(state.event, null);
    assert.deepEqual(state.robot, { x: 1, y: 1, dir: 1 });
    assert.deepEqual(state.renderedRobot, state.robot, 'Old-map animation must not override the new-map start');
    assert.equal(state.movementCount, 0); assert.equal(state.renderedTime, 0);
    assert.deepEqual(state.renderedHazards, state.hazards, 'Old-map hazard phase must not override the new-map start');
    await page.waitForTimeout(250); state = await read(page); assert.deepEqual(state.renderedRobot, state.robot);
    await capture(page, 'second-map-start');
    pass('new-map rendered robot matches logical start with no stale animation', { state });

    await page.locator('#speed').selectOption('4'); await click(page, '#run');
    await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.completed.includes(12) && s.status === 'success'; }, {}, { timeout: 30000 });
    state = await read(page); assert.equal(state.verifiedMaps, 2); assert.deepEqual(state.program, program);
    assert.equal(state.executed, 76); await capture(page, 'two-map-success');
    pass('only both maps produce completion; same UI-entered waiting program is retained and counts sum to 76');

    // Remove only the earned completion and reload so it cannot hide a false win.
    await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('routinebot-save-v1')); delete data.completed[12]; localStorage.setItem('routinebot-save-v1', JSON.stringify(data)); });
    await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
    await pendingFirstArrival(page); await click(page, '#reset'); await page.waitForTimeout(1300);
    state = await read(page); assert.equal(state.mapIndex, 0); assert.equal(state.verifiedMaps, 0); assert.equal(state.executed, 0);
    assert.deepEqual(state.robot, { x: 1, y: 1, dir: 1 }); assert.deepEqual(state.renderedRobot, state.robot);
    assert.deepEqual(state.program, program); assert.ok(!state.completed.includes(12));
    pass('reset cancels pending map transition and preserves the program after the old interval');

    await pendingFirstArrival(page); await page.locator('#level-select').selectOption('11'); await page.waitForTimeout(1300);
    state = await read(page); assert.equal(state.level, 11); assert.equal(state.mapIndex, 0); assert.equal(state.executed, 0);
    assert.equal(state.verifiedMaps, 0); assert.equal(state.event, null); assert.deepEqual(state.renderedRobot, state.robot); assert.ok(!state.completed.includes(12));
    await capture(page, 'level-switch-after-pending');
    pass('level change cancels prior map, count, success and animation');

    await page.locator('#level-select').selectOption('12'); await clear(page);
    await click(page, '[data-scope="F1"]'); const empty = (await read(page)).program;
    await click(page, '[data-add="F1"]'); state = await read(page);
    assert.deepEqual(state.program, empty); assert.match(state.message, /자기 자신|서로/);
    await page.waitForTimeout(350); assert.match((await read(page)).message, /자기 자신|서로/);
    pass('F1 self-call is rejected before save/execution with a persistent explanation');

    await click(page, '[data-add="F2"]'); await click(page, '[data-scope="F2"]'); const beforeCycle = (await read(page)).program;
    await click(page, '[data-add="F1"]'); state = await read(page);
    assert.deepEqual(state.program, beforeCycle); assert.match(state.message, /자기 자신|서로/);
    await capture(page, 'cycle-rejected'); await click(page, '[data-add="right"]'); assert.equal((await read(page)).stored, 2);
    pass('F1→F2→F1 is rejected without changing the program; ordinary editing still works');

    await clear(page);
    for (let depth = 0; depth < 4; depth++) await click(page, '[data-add="repeat"]');
    const nested = (await read(page)).program;
    await click(page, '[data-add="repeat"]'); state = await read(page);
    assert.equal(state.stored, 4); assert.deepEqual(state.program, nested); assert.match(state.message, /4단계/);
    await page.waitForTimeout(350); assert.match((await read(page)).message, /4단계/);
    await click(page, '[data-add="forward"]'); assert.equal((await read(page)).stored, 5);
    pass('fifth nesting level is rejected with unchanged code and responsive editor');

    await page.locator('#level-select').selectOption('1'); await clear(page);
    for (let i = 0; i < 3; i++) await click(page, '[data-add="forward"]');
    const atBudget = (await read(page)).program; await click(page, '[data-add="forward"]'); state = await read(page);
    assert.equal(state.stored, 3); assert.deepEqual(state.program, atBudget); assert.match(state.message, /3개/);
    await page.waitForTimeout(350); assert.match((await read(page)).message, /3개/);
    await capture(page, 'size-limit'); pass('level block budget rejects only the attempted edit and keeps its explanation');

    await page.locator('#level-select').selectOption('12'); await clear(page);
    await click(page, '[data-add="repeat"]'); await page.locator(`[data-repeat="${(await read(page)).program.main[0].id}"]`).selectOption('12');
    await click(page, '[data-add="repeat"]'); await page.locator(`[data-repeat="${(await read(page)).program.main[0].body[0].id}"]`).selectOption('12');
    await click(page, '[data-add="right"]'); await click(page, '#scope-back'); await click(page, '#scope-back');
    state = await stepUntil(page, current => current.status === 'failure');
    assert.equal(state.event.reason, 'limit'); assert.equal(state.executed, 150); assert.equal(state.stored, 3); assert.match(state.message, /150단계/);
    await page.waitForTimeout(350); assert.match((await read(page)).message, /150단계/);
    await capture(page, 'execution-limit'); await click(page, '#reset'); state = await read(page);
    assert.equal(state.status, 'ready'); assert.equal(state.stored, 3); assert.equal(state.executed, 0);
    pass('runtime step budget stops exactly at 150 with reason visible and reset responsive');

    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await page.evaluate(() => window.__routineAudioProbe), { constructed: 0, starts: 0, resumes: 0 });
    await click(page, '#sound');
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    assert.equal((await page.evaluate(() => window.__routineAudioProbe)).constructed, 1);
    await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => window.__routineAudioProbe), { constructed: 0, starts: 0, resumes: 0 });
    await click(page, '#step');
    let audio = await page.evaluate(() => window.__routineAudioProbe);
    assert.equal(audio.constructed, 1); assert.ok(audio.starts >= 1); assert.ok(audio.resumes >= 1);
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
    assert.deepEqual(await page.evaluate(() => window.__routineAudioProbe), { constructed: 0, starts: 0, resumes: 0 });
    await click(page, '#run'); await click(page, '#pause');
    audio = await page.evaluate(() => window.__routineAudioProbe);
    assert.equal(audio.constructed, 1); assert.ok(audio.starts >= 1);
    await click(page, '#sound'); const beforeMutedStep = await page.evaluate(() => window.__routineAudioProbe.starts);
    await click(page, '#step');
    assert.equal(await page.evaluate(() => window.__routineAudioProbe.starts), beforeMutedStep);
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    await capture(page, 'audio-preference-after-reload');
    pass('sound preference survives reload without autoplay; step/run unlock audio only after a user click; mute suppresses subsequent sounds', { audioHardware: 'NOT RUN; Web Audio calls observed in Chromium' });
    assert.deepEqual(report.errors, []); pass('no browser page or console errors'); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.failure = error.stack; console.error(error); process.exitCode = 1; await capture(page, 'failure').catch(() => {}); }
  finally { report.finished = new Date().toISOString(); write(); await context.tracing.stop({ path: path.join(output, 'safety-trace.zip') }); await browser.close(); }
})();
