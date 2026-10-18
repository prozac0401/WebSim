'use strict';
// Migration fixture: a structurally valid program written under the previous
// level budget. Only this old save and explicitly disclosed level access are
// seeded. All repairs, new code, execution and wins use rendered controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/routine-bot/budgets/migration');
fs.mkdirSync(output, { recursive: true });
const report = { started: new Date().toISOString(), base, suiteRevision: 'reference-block-budget-v1', checks: [], errors: [],
  classification: 'Source-informed migration and hard-budget regression. An old over-budget level-1 save is seeded, with no completion. Separate level-4 session seeds access 1–3 only. All repairs, new programs and wins use visible controls. Not blind play or full progression.',
  reducedMotion: 'reduce', viewports: [{ width: 1440, height: 900, touch: false }, { width: 320, height: 740, touch: true }, { width: 390, height: 844, touch: true }], android: 'NOT RUN' };
const write = () => fs.writeFileSync(path.join(output, 'budget-report.json'), JSON.stringify(report, null, 2));
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'PASS', ...detail }); write(); console.log('PASS', name); };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function press(page, target, touch) { const node = page.locator(target); await node.scrollIntoViewIfNeeded(); if (touch) await node.tap(); else await node.click(); }
async function capture(page, name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
async function reload(page) { await page.reload(); await page.waitForFunction(() => window.render_game_to_text); }
async function removeLast(page, touch) { const state = await read(page); await press(page, `[data-node="${state.program.main.at(-1).id}"]`, touch); await press(page, '#delete', touch); }
async function legacyScene(page, label, touch) {
  let state = await read(page); const legacy = state.program;
  assert.equal(state.level, 1); assert.equal(state.stored, 5); assert.equal(state.executed, 0); assert.deepEqual(state.completed, []);
  assert.equal(legacy.main.length, 5); assert.equal(await page.locator('[data-node]').count(), 5);
  assert.match(await page.locator('#command-count').innerText(), /5\s*\/\s*3/);
  assert.match(state.message, /3개|초과|제한/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await capture(page, label + '-legacy-preserved');
  pass(label + ': five old blocks remain visible and saved with an explicit three-block limit', { touch });

  await press(page, '#run', touch); await page.waitForTimeout(650);
  state = await read(page); assert.equal(state.executed, 0); assert.deepEqual(state.completed, []); assert.deepEqual(state.program, legacy); assert.match(state.message, /3개|초과|제한/);
  await press(page, '#step', touch); state = await read(page); assert.equal(state.executed, 0); assert.deepEqual(state.program, legacy);
  await press(page, '[data-add="forward"]', touch); state = await read(page); assert.equal(state.stored, 5); assert.deepEqual(state.program, legacy);
  assert.match(state.message, /3개|초과|제한/);
  pass(label + ': run, step and adding a block reject old over-budget code without motion, false completion or data loss');

  await removeLast(page, touch); state = await read(page); assert.equal(state.stored, 4); assert.deepEqual(state.program.main, legacy.main.slice(0, 4));
  assert.match(state.message, /저장 4개/); assert.match(state.message, /1개 줄인/);
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, legacy);
  pass(label + ': deleting a single block works while still over limit and undo restores the whole old program');

  await reload(page); assert.deepEqual((await read(page)).program, legacy);
  await removeLast(page, touch); await reload(page); state = await read(page);
  assert.equal(state.stored, 4); assert.deepEqual(state.program.main, legacy.main.slice(0, 4)); assert.deepEqual(state.completed, []);
  await press(page, '#run', touch); assert.equal((await read(page)).executed, 0);
  await capture(page, label + '-partial-repair-retained');
  pass(label + ': reload preserves both an undone old save and a partially repaired four-block save; execution remains blocked');

  await removeLast(page, touch); state = await read(page);
  assert.equal(state.stored, 3); assert.deepEqual(state.program.main, legacy.main.slice(0, 3));
  assert.match(state.message, /제한 안에/); assert.doesNotMatch(state.message, /넘어요|줄인 뒤/);
  assert.match(await page.locator('#command-count').innerText(), /3\s*\/\s*3/);
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('routinebot-save-v1')))).programs[1].main.length, 3);
  await page.locator('#speed').selectOption('4'); await press(page, '#run', touch);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 10000 });
  state = await read(page); assert.deepEqual(state.completed, [1]); assert.equal(state.stored, 3); assert.equal(state.executed, 3);
  await capture(page, label + '-repaired-win');
  pass(label + ': visible one-at-a-time repairs reach the cap and the retained three-block program actually solves level 1');

  await reload(page); state = await read(page); assert.deepEqual(state.completed, [1]); assert.equal(state.stored, 3);
  const repaired = state.program;
  await press(page, '[data-add="forward"]', touch); assert.deepEqual((await read(page)).program, repaired);
  await press(page, '#reset', touch); assert.deepEqual((await read(page)).program, repaired); assert.equal((await read(page)).executed, 0);
  pass(label + ': repaired progress survives reload and the hard cap still rejects a fourth block without clearing code');
}
async function repeatScene(page) {
  assert.equal((await read(page)).level, 4);
  await press(page, '[data-add="forward"]', false); await press(page, '[data-add="forward"]', false);
  const two = (await read(page)).program;
  await press(page, '[data-add="forward"]', false);
  let state = await read(page); assert.equal(state.stored, 2); assert.deepEqual(state.program, two); assert.match(state.message, /2개/);
  await press(page, '#run', false);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'failure', {}, { timeout: 10000 });
  assert.equal((await read(page)).executed, 2); assert.ok(!(await read(page)).completed.includes(4));
  await capture(page, 'repeat-two-block-limit');
  pass('Level 4: two forward blocks fit but do not reach home; the hard cap prevents expanding into a five-step flat program');
  await press(page, '#clear', false); await press(page, '[data-add="repeat"]', false);
  const id = (await read(page)).program.main[0].id;
  await page.locator(`[data-repeat="${id}"]`).selectOption('5'); await press(page, '[data-add="forward"]', false);
  await press(page, '#run', false);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 15000 });
  state = await read(page); assert.equal(state.stored, 2); assert.ok(state.executed > state.stored); assert.ok(state.completed.includes(4));
  await capture(page, 'repeat-two-block-win');
  pass('Level 4: a visibly entered repeat and one forward solve the same map at the required two-block cap', { stored: state.stored, executed: state.executed });
}
(async () => {
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  async function session(viewport, touch, legacy) {
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await context.addInitScript(legacy => {
      if (sessionStorage.getItem('routinebot-budget-fixture')) return;
      const program = { main: Array.from({ length: 5 }, (_, i) => ({ id: 'old-' + i, type: 'forward' })), F1: [], F2: [] };
      localStorage.setItem('routinebot-save-v1', JSON.stringify({ version: 1, currentLevel: legacy ? 1 : 4,
        completed: legacy ? {} : { 1: true, 2: true, 3: true }, programs: legacy ? { 1: program } : {}, settings: { speed: 4, muted: true } }));
      sessionStorage.setItem('routinebot-budget-fixture', '1');
    }, legacy);
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(base + 'routine_bot/routine_bot.html'); await page.waitForFunction(() => window.render_game_to_text);
    return { context, page };
  }
  try {
    for (const entry of report.viewports) {
      const label = entry.touch ? 'touch-' + entry.width : 'desktop';
      const { context, page } = await session({ width: entry.width, height: entry.height }, entry.touch, true);
      await legacyScene(page, label, entry.touch); await context.tracing.stop({ path: path.join(output, label + '-trace.zip') }); await context.close();
    }
    const { context, page } = await session({ width: 1440, height: 900 }, false, false);
    await repeatScene(page); await context.tracing.stop({ path: path.join(output, 'repeat-trace.zip') }); await context.close();
    assert.deepEqual(report.errors, []); pass('No browser page or console errors'); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
  finally { report.finished = new Date().toISOString(); write(); await browser.close(); }
})();
