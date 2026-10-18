'use strict';
// Visible-control timing regression. Completion fixtures unlock a scene only;
// no authored program, runner state or new successful completion is injected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/routine-bot/hazards/focused');
fs.mkdirSync(output, { recursive: true });
const report = { started: new Date().toISOString(), base, revision: 'timed-hazards-ui-v1', checks: [], errors: [],
  classification: 'Source-informed actual click/tap replay. Scenes seed completion 1–4 or 1–11 only for access; all code, repair, execution and wins use visible controls. Not blind play or full progression.',
  android: 'NOT RUN', viewports: [{ width: 1440, height: 900, touch: false }, { width: 320, height: 740, touch: true }, { width: 390, height: 844, touch: true }] };
const write = () => fs.writeFileSync(path.join(output, 'hazard-report.json'), JSON.stringify(report, null, 2));
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'PASS', ...detail }); write(); console.log('PASS', name); };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function press(page, selector, touch = false) { const target = page.locator(selector); await target.scrollIntoViewIfNeeded(); if (touch) await target.tap(); else await target.click(); }
const add = (page, kind, touch = false) => press(page, `[data-add="${kind}"]`, touch);
const capture = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
const op = type => ({ type });
const repeat = (count, body) => ({ type: 'repeat', count, body });
const iff = (condition, then, otherwise = []) => ({ type: 'if', condition, then, else: otherwise });
const call = target => ({ type: 'call', target });
function flatten(program) { const result = []; function visit(list) { for (const node of list) { result.push(node); for (const branch of ['body', 'then', 'else']) if (node[branch]) visit(node[branch]); } } for (const root of ['main', 'F1', 'F2']) visit(program[root]); return result; }
async function addList(page, list, touch = false) {
  for (const node of list) {
    const before = new Set(flatten((await read(page)).program).map(item => item.id));
    await add(page, node.type === 'if' ? node.condition : node.type === 'call' ? node.target : node.type, touch);
    const inserted = flatten((await read(page)).program).find(item => !before.has(item.id)); assert.ok(inserted);
    if (node.type === 'repeat') { await page.locator(`[data-repeat="${inserted.id}"]`).selectOption(String(node.count)); await addList(page, node.body, touch); await press(page, '#scope-back', touch); }
    if (node.type === 'if') { await addList(page, node.then, touch); await press(page, '#scope-back', touch); await press(page, `[data-insert="${inserted.id}:else"]`, touch); await addList(page, node.else, touch); await press(page, '#scope-back', touch); }
  }
}
async function build(page, program, touch = false) {
  if (!await page.locator('#clear').isDisabled()) await press(page, '#clear', touch);
  for (const root of ['main', 'F1', 'F2']) if (program[root]?.length) { await press(page, `[data-scope="${root}"]`, touch); await addList(page, program[root], touch); }
  await press(page, '[data-scope="main"]', touch);
}
async function stepUntil(page, predicate, touch = false, max = 180) { for (let n = 0; n < max; n++) { const state = await read(page); if (predicate(state)) return state; await press(page, '#step', touch); } throw new Error('Expected timing scene not reached'); }
async function win(page, touch = false) { await press(page, '#run', touch); await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.status === 'failure' || (s.status === 'success' && !document.querySelector('#success-panel').hidden); }, {}, { timeout: 45000 }); assert.equal((await read(page)).status, 'success'); }
function resetClock(state) { assert.equal(state.movementCount, 0); assert.equal(state.renderedTime, 0); assert.deepEqual(state.renderedHazards, state.hazards); assert.deepEqual(state.renderedRobot, state.robot); }

async function introduction(page, label, touch) {
  let state = await read(page); assert.equal(state.level, 5); resetClock(state); assert.equal(state.hazards.active.length, 3);
  assert.equal(await page.locator('[data-add="wait"]').isVisible(), true);
  assert.equal(await page.locator('#hazard-guide').isVisible(), true);
  assert.match(await page.locator('#hazard-guide summary').innerText(), /× 지금 위험/); assert.match(await page.locator('#hazard-guide summary').innerText(), /! 다음 위험/);
  await press(page, '#hazard-guide summary', touch); assert.equal(await page.locator('.hazard-row').count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await capture(page, label + '-timetable'); await press(page, '#hazard-guide summary', touch);
  pass(label + ': current/next danger symbols, logical time and an expandable timetable are visible without horizontal overflow');

  await build(page, { main: [repeat(3, ['forward', 'right', 'forward', 'left'].map(op))] }, touch);
  const original = (await read(page)).program;
  if (!touch) await press(page, '#hazard-guide summary');
  await press(page, '#step', touch); state = await read(page); assert.equal(state.executed, 1); assert.equal(state.movementCount, 0);
  await press(page, '#step', touch); state = await read(page);
  assert.equal(state.event.reason, 'hazard'); assert.equal(state.movementCount, 1); assert.equal(state.executed, 2);
  assert.deepEqual(state.program, original); assert.ok(!state.completed.includes(5)); assert.equal(await page.locator('.block.crashed').count(), 1);
  assert.deepEqual(state.renderedRobot, state.robot); assert.equal(state.renderedTime, 1); assert.deepEqual(state.renderedHazards, state.hazards);
  assert.match(state.message, /시간 1/);
  let openGuideViewport;
  if (!touch) {
    openGuideViewport = await page.evaluate(() => ({ scrollY, height: innerHeight, elements: Object.fromEntries(['#run', '#step', '#message'].map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector, { top: r.top, bottom: r.bottom }]; })) }));
    report.openGuideViewport = openGuideViewport; write(); await capture(page, label + '-open-guide-failure-fullpage');
    for (const rect of Object.values(openGuideViewport.elements)) { assert.ok(rect.top >= 0); assert.ok(rect.bottom <= openGuideViewport.height); }
  }
  await capture(page, label + '-first-hazard-failure');
  if (!touch) await press(page, '#hazard-guide summary');
  pass(label + ': a repeat control consumes an execution step but no time; its first move fails on the active tile and identifies the command', { openGuideViewport });

  await press(page, '[data-scope="main"]', touch); await add(page, 'wait', touch); await press(page, '#move-up', touch);
  state = await read(page); assert.equal(state.program.main[0].type, 'wait'); assert.deepEqual(state.program.main[1], original.main[0]);
  const repaired = state.program;
  await page.locator('#speed').selectOption('0.5'); await press(page, '#run', touch); await press(page, '#pause', touch);
  await page.waitForTimeout(450); const paused = await read(page); assert.equal(paused.movementCount, 1); assert.equal(paused.executed, 1);
  await page.locator('#speed').selectOption('4'); await page.waitForTimeout(700); state = await read(page);
  assert.equal(state.movementCount, paused.movementCount); assert.equal(state.executed, paused.executed); assert.deepEqual(state.hazards, paused.hazards);
  await press(page, '#step', touch); state = await read(page); assert.equal(state.movementCount, 1); assert.equal(state.executed, 2);
  await press(page, '#step', touch); await page.waitForTimeout(100); state = await read(page);
  assert.equal(state.movementCount, 2); assert.equal(state.executed, 3); assert.equal(state.renderedTime, 2); assert.equal(state.hazards.active.length, 0);
  pass(label + ': prepend one wait by visible editing; pause, wall-clock delay and speed changes leave hazard time unchanged; repeat control is timeless');

  await page.locator('#speed').selectOption('0.5'); state = await read(page);
  assert.equal(state.movementCount, 2); assert.equal(state.renderedTime, 2); assert.deepEqual(state.renderedRobot, state.robot); assert.deepEqual(state.renderedHazards, state.hazards);
  await page.waitForTimeout(150); state = await read(page); assert.equal(state.renderedTime, 2); assert.deepEqual(state.renderedRobot, state.robot);
  await capture(page, label + '-slower-speed-no-rewind'); await page.locator('#speed').selectOption('4');
  pass(label + ': changing from 4× to 0.5× after a completed movement never rewinds its robot, time or hazard phase');

  await press(page, '#run', touch); await press(page, '#reset', touch); await page.waitForTimeout(700); state = await read(page); resetClock(state);
  assert.deepEqual(state.program, repaired); assert.equal(state.executed, 0); assert.ok(!state.completed.includes(5));
  await press(page, '#run', touch); await page.locator('#level-select').selectOption('4'); await page.waitForTimeout(700); state = await read(page); resetClock(state);
  assert.equal(state.level, 4); assert.equal(state.hazards.cells.length, 0); assert.equal(await page.locator('#hazard-guide').isVisible(), false);
  await page.locator('#level-select').selectOption('5'); resetClock(await read(page)); assert.deepEqual((await read(page)).program, repaired);
  pass(label + ': reset and level change cancel prior playback and restore time zero while preserving code');

  await win(page, touch); state = await read(page); assert.equal(state.stored, 6); assert.equal(state.executed, 15); assert.equal(state.movementCount, 12); assert.ok(state.completed.includes(5));
  await capture(page, label + '-wait-repair-win');
  await page.reload(); await page.waitForFunction(() => window.render_game_to_text); state = await read(page); resetClock(state); assert.deepEqual(state.program, repaired); assert.ok(state.completed.includes(5));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  pass(label + ': the retained repeat plus wait actually solves level 5; save/reload keeps wait and progress but restarts the logical clock', { stored: 6, executed: 15, logicalTime: 12 });
}

async function stationaryFailures(page) {
  for (const kind of ['wait', 'left']) {
    await build(page, { main: ['wait', 'forward', kind, kind].map(op) });
    for (let count = 0; count < 3; count++) await press(page, '#step');
    let state = await read(page); const before = state.robot; assert.equal(state.movementCount, 3); assert.equal(state.hazards.active.length, 0);
    await press(page, '#step'); state = await read(page);
    assert.equal(state.event.reason, 'hazard'); assert.equal(state.movementCount, 4); assert.equal(state.robot.x, before.x); assert.equal(state.robot.y, before.y);
    assert.equal(state.program.main.at(-1).id, state.currentId); assert.equal(state.renderedTime, 4); assert.deepEqual(state.renderedRobot, state.robot); assert.deepEqual(state.renderedHazards, state.hazards);
    assert.equal(await page.locator('.block.crashed').count(), 1); await capture(page, 'stationary-' + kind + '-hazard');
    pass('Staying on a hazard with ' + kind + ' advances time and fails immediately when that same cell switches on');
  }
}

async function lateScenes(page) {
  await build(page, { main: [repeat(6, [iff('mark', [op('wait'), op('right')]), op('forward')])] });
  let state = await stepUntil(page, s => s.robot.x === 3 && s.robot.y === 1 && s.movementCount === 2);
  assert.equal(await page.locator('#tile-state').isVisible(), true); assert.match(await page.locator('#tile-state').innerText(), /별/);
  const steps = state.executed;
  await press(page, '#step'); state = await read(page); assert.equal(state.event.type, 'repeat'); assert.equal(state.movementCount, 2); assert.equal(state.executed, steps + 1);
  await press(page, '#step'); state = await read(page); assert.equal(state.event.type, 'condition'); assert.equal(state.event.result, true); assert.equal(state.movementCount, 2); assert.equal(state.executed, steps + 2);
  await press(page, '#step'); state = await read(page); assert.equal(state.event.type, 'wait'); assert.equal(state.movementCount, 3); assert.equal(await page.locator('#tile-state').isVisible(), true);
  await capture(page, 'marker-and-timed-wait'); await page.locator('#speed').selectOption('4'); await win(page); state = await read(page);
  assert.equal(state.movementCount, 10); assert.equal(state.executed, 22); assert.equal(state.stored, 5);
  pass('Level 8: the current-star label remains visible during waiting; condition decisions cost no time and a marked wait route wins');

  await page.locator('#level-select').selectOption('12');
  await build(page, { main: [call('F2')], F1: [iff('blocked', [op('right')], [op('wait'), op('forward')])], F2: [repeat(12, [call('F1')])] });
  for (const expected of ['call', 'repeat', 'call', 'condition']) { await press(page, '#step'); state = await read(page); assert.equal(state.event.type, expected); assert.equal(state.movementCount, 0); }
  await press(page, '#step'); await press(page, '#step'); state = await read(page); assert.equal(state.movementCount, 2); assert.equal(state.executed, 6);
  await press(page, '#step'); state = await read(page); assert.equal(state.event.type, 'return'); assert.equal(state.movementCount, 2); assert.equal(state.executed, 6);
  pass('Level 12: nested function calls, a repeat, a branch and function return leave the logical clock unchanged');
  state = await stepUntil(page, s => s.verifiedMaps === 1); assert.equal(state.movementCount, 20); assert.equal(state.executed, 54); assert.ok(!state.completed.includes(12));
  await press(page, '#step'); state = await read(page); assert.equal(state.mapIndex, 1); resetClock(state); assert.equal(state.executed, 54);
  await page.waitForTimeout(250); resetClock(await read(page)); await capture(page, 'second-map-time-zero');
  pass('Level 12: the next map starts with its own time zero and hazard phase; previous-map completion is not a level win');
  await win(page); state = await read(page); assert.equal(state.verifiedMaps, 2); assert.equal(state.movementCount, 16); assert.equal(state.executed, 98); assert.equal(state.stored, 7);
  await capture(page, 'two-timed-maps-one-function');
  pass('Level 12: one UI-entered waiting function solves both differently timed maps with separate clocks');
}

(async () => {
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  async function session(viewport, touch, level, access) {
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, reducedMotion: touch ? 'reduce' : 'no-preference' });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await context.addInitScript(({ level, access }) => {
      if (sessionStorage.getItem('routinebot-hazard-access')) return;
      localStorage.setItem('routinebot-save-v1', JSON.stringify({ version: 1, currentLevel: level, completed: Object.fromEntries(Array.from({ length: access }, (_, i) => [i + 1, true])), programs: {}, settings: { speed: 4, muted: true } }));
      sessionStorage.setItem('routinebot-hazard-access', '1');
    }, { level, access });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(base + 'routine_bot/routine_bot.html'); await page.waitForFunction(() => window.render_game_to_text); return { page, context };
  }
  try {
    for (const view of report.viewports) {
      const label = view.touch ? 'touch-' + view.width : 'desktop'; const { page, context } = await session({ width: view.width, height: view.height }, view.touch, 5, 4);
      await introduction(page, label, view.touch); if (!view.touch) await stationaryFailures(page);
      await context.tracing.stop({ path: path.join(output, label + '-trace.zip') }); await context.close();
    }
    const { page, context } = await session({ width: 1440, height: 900 }, false, 8, 11);
    await lateScenes(page); await context.tracing.stop({ path: path.join(output, 'late-trace.zip') }); await context.close();
    assert.deepEqual(report.errors, []); pass('No browser page or console errors'); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
  finally { report.finished = new Date().toISOString(); write(); await browser.close(); }
})();
