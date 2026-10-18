'use strict';
// Inline-tree regression through visible controls. Only late-level access is
// seeded; programs, edits, executions and success are never injected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/routine-bot/tree');
fs.mkdirSync(output, { recursive: true });
const report = { started: new Date().toISOString(), base, suiteRevision: 'inline-tree-active-leaf-v2',
  viewports: [{ width: 1440, height: 900, touch: false }, { width: 320, height: 740, touch: true }, { width: 390, height: 844, touch: true }],
  reducedMotion: 'reduce', checks: [], errors: [], android: 'NOT RUN',
  classification: 'Source-informed visible-control tree regression, with completion 1–11 seeded only for access. Not blind play or full progression.' };
const write = () => fs.writeFileSync(path.join(output, 'tree-report.json'), JSON.stringify(report, null, 2));
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'PASS', ...detail }); write(); console.log('PASS', name); };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const selector = (attribute, value) => `[${attribute}="${value}"]`;
async function press(page, target, touch) {
  const element = page.locator(target); await element.scrollIntoViewIfNeeded();
  if (touch) await element.tap(); else await element.click();
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
async function add(page, type, touch) { await press(page, selector('data-add', type), touch); }
async function insert(page, id, branch, touch) { await press(page, selector('data-insert', id + ':' + branch), touch); }
async function toggle(page, id, branch, touch) { await press(page, selector('data-enter', id + ':' + branch), touch); }
async function treeScene(page, label, touch) {
  await add(page, 'forward', touch);
  await add(page, 'repeat', touch);
  const outerId = (await read(page)).program.main[1].id;
  await page.locator(selector('data-repeat', outerId)).selectOption('2');
  await add(page, 'left', touch); await add(page, 'blocked', touch);
  const conditionId = (await read(page)).program.main[1].body[1].id;
  await add(page, 'right', touch);
  await insert(page, conditionId, 'else', touch); await add(page, 'repeat', touch);
  const nestedId = (await read(page)).program.main[1].body[1].else[0].id;
  await add(page, 'forward', touch); await press(page, '#scope-back', touch); await add(page, 'left', touch);
  await press(page, '[data-scope="main"]', touch); await add(page, 'right', touch);
  let state = await read(page); const original = state.program;
  const outer = original.main[1], condition = outer.body[1];
  assert.deepEqual(original.main.map(node => node.type), ['forward', 'repeat', 'right']);
  assert.deepEqual(outer.body.map(node => node.type), ['left', 'if']);
  assert.deepEqual(condition.then.map(node => node.type), ['right']);
  assert.deepEqual(condition.else.map(node => node.type), ['repeat', 'left']);
  assert.equal(await page.locator('#program > .tree-node').count(), 3, 'Root siblings must remain visible while nested content is rendered');
  assert.equal(await page.locator('#program .block:visible').count(), state.stored);
  assert.equal(await page.locator('#program .tree-branch .tree-branch .tree-list').count() >= 1, true);
  assert.ok(!/안쪽/.test(await page.locator(selector('data-enter', outerId + ':body')).innerText()));
  assert.equal(await page.locator(selector('data-enter', outerId + ':body')).getAttribute('aria-expanded'), 'true');
  await screenshot(page, label + '-expanded-tree');
  pass(label + ': root siblings, nested repeat, and both condition branches remain visible in one inline tree', { touch, stored: state.stored });

  // Nested selection changes its own siblings, never the root list.
  const nestedLeft = condition.else[1].id;
  await press(page, selector('data-node', nestedLeft), touch); await press(page, '#move-up', touch);
  state = await read(page); assert.equal(state.program.main[1].body[1].else[0].id, nestedLeft);
  assert.deepEqual(state.program.main.map(node => node.id), original.main.map(node => node.id));
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, original);
  await press(page, selector('data-node', nestedLeft), touch); await press(page, '#delete', touch);
  assert.equal((await read(page)).program.main[1].body[1].else.length, 1);
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, original);
  pass(label + ': nested reorder, delete and undo preserve the surrounding tree and sibling scope');

  // Collapse an ancestor of the active insertion scope; a palette tap must
  // not silently modify the now-hidden descendant.
  await insert(page, nestedId, 'body', touch); await toggle(page, outerId, 'body', touch);
  assert.equal(await page.locator(selector('data-enter', outerId + ':body')).getAttribute('aria-expanded'), 'false');
  assert.match(await page.locator(selector('data-enter', outerId + ':body')).innerText(), /펼치기/);
  assert.equal(await page.locator(selector('data-node', nestedLeft)).isVisible(), false);
  assert.equal((await read(page)).editing, '시작');
  assert.deepEqual((await read(page)).program, original, 'Collapse must not mutate code');
  await screenshot(page, label + '-collapsed-tree');
  await add(page, 'forward', touch); state = await read(page);
  assert.equal(state.program.main.length, 4);
  assert.deepEqual(state.program.main[1], outer, 'Collapsed children must not receive hidden insertion');
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, original);
  await toggle(page, outerId, 'body', touch);
  assert.equal(await page.locator(selector('data-node', nestedLeft)).isVisible(), true);
  pass(label + ': collapse is visual only, resets hidden insertion to its parent, and expands with intact code');

  // Closing one branch leaves its sibling branch usable, and branch insertion
  // controls select the intended target instead of toggling visibility.
  await insert(page, conditionId, 'then', touch); await toggle(page, conditionId, 'then', touch);
  assert.equal(await page.locator(selector('data-node', condition.then[0].id)).isVisible(), false);
  assert.equal(await page.locator(selector('data-node', nestedLeft)).isVisible(), true);
  await insert(page, conditionId, 'else', touch); await add(page, 'right', touch);
  state = await read(page); assert.equal(state.program.main[1].body[1].else.length, 3);
  assert.deepEqual(state.program.main[1].body[1].then, condition.then);
  await press(page, '#undo', touch); await toggle(page, conditionId, 'then', touch);
  assert.deepEqual((await read(page)).program, original);
  pass(label + ': condition branches fold independently and their insertion controls choose the right branch');

  await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
  assert.deepEqual((await read(page)).program, original);
  assert.equal(await page.locator('#program .block:visible').count(), (await read(page)).stored);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  pass(label + ': reload retains the full nested program and the tree fits the viewport');

  // An actual player-entered repeated movement solves a level; this is not a
  // synthetic success state or a pure DOM formatting check.
  await page.locator('#level-select').selectOption('4');
  await add(page, 'repeat', touch); await page.locator(selector('data-repeat', (await read(page)).program.main[0].id)).selectOption('5'); await add(page, 'forward', touch);
  await page.locator('#speed').selectOption('4'); await press(page, '#run', touch);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 15000 });
  assert.ok((await read(page)).completed.includes(4));
  await screenshot(page, label + '-repeat-win');
  pass(label + ': visible repeat editing and actual execution solve level 4');

  await press(page, '#clear', touch); await add(page, 'repeat', touch);
  const boundedId = (await read(page)).program.main[0].id;
  for (let count = 0; count < 9; count++) await add(page, 'forward', touch);
  const beforeReject = (await read(page)).program;
  await add(page, 'forward', touch); state = await read(page);
  assert.equal(state.stored, 10); assert.deepEqual(state.program, beforeReject); assert.match(state.message, /10개/);
  // A rejected edit replaces the program with a rollback copy. A repeat's DOM
  // listener must resolve the live node, rather than mutating a stale closure.
  await page.locator(selector('data-repeat', boundedId)).selectOption('5');
  assert.equal((await read(page)).program.main[0].count, 5);
  assert.equal(await page.locator(selector('data-repeat', boundedId)).inputValue(), '5');
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, beforeReject);
  pass(label + ': after a rejected over-budget edit, repeat count changes affect the live program and undo restores it');

  await press(page, '#clear', touch);
  for (let depth = 0; depth < 4; depth++) await add(page, 'repeat', touch);
  await add(page, 'forward', touch);
  const foldedId = (await read(page)).program.main[0].id;
  await toggle(page, foldedId, 'body', touch);
  assert.equal(await page.locator(selector('data-enter', foldedId + ':body')).getAttribute('aria-expanded'), 'false');
  for (let count = 0; count < 5; count++) await press(page, '#step', touch);
  state = await read(page); assert.equal(state.event.type, 'move');
  assert.equal(await page.locator(selector('data-enter', foldedId + ':body')).getAttribute('aria-expanded'), 'true', 'Execution must reveal the active command inside a collapsed ancestor');
  const visible = await page.evaluate(id => {
    const bounds = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    return { card: bounds(document.querySelector(`[data-block="${id}"]`)), program: bounds(document.querySelector('#program')),
      stage: bounds(document.querySelector('.stage')), viewport: innerHeight };
  }, state.currentId);
  assert.ok(visible.card.top >= 0 && visible.card.bottom <= visible.viewport + 1, 'The executing leaf must be inside the viewport');
  if (touch) assert.ok(visible.card.top >= visible.stage.bottom - 1, 'The active leaf must be below the sticky map and controls');
  else {
    assert.ok(visible.card.top >= visible.program.top - 1, 'The active leaf must not be clipped above the program scroller');
    assert.ok(visible.card.bottom <= visible.program.bottom + 1, 'The active leaf must not be clipped below the program scroller');
  }
  await screenshot(page, label + '-active-deep-leaf');
  pass(label + ': execution brings a depth-four leaf inside the visible editor and below the mobile map', { visible });
}
async function tabTo(page, attribute, value) {
  for (let count = 0; count < 200; count++) {
    if (await page.evaluate(({ attribute, value }) => document.activeElement.getAttribute(attribute) === value, { attribute, value })) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard cannot reach ' + attribute + '=' + value);
}
async function keyboardScene(page) {
  await tabTo(page, 'data-add', 'repeat'); await page.keyboard.press('Enter');
  const id = (await read(page)).program.main[0].id;
  assert.equal(await page.evaluate(() => document.activeElement.dataset.add), 'repeat');
  await tabTo(page, 'data-enter', id + ':body'); await page.keyboard.press('Enter');
  assert.equal(await page.locator(selector('data-enter', id + ':body')).getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.enter), id + ':body');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(selector('data-enter', id + ':body')).getAttribute('aria-expanded'), 'true');
  await tabTo(page, 'data-insert', id + ':body'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.insert), id + ':body');
  await tabTo(page, 'data-repeat', id); await page.keyboard.press('Home');
  for (let count = 0; count < 3; count++) await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator(selector('data-repeat', id)).inputValue(), '5');
  await tabTo(page, 'data-add', 'forward'); await page.keyboard.press('Enter');
  assert.equal((await read(page)).program.main[0].body.length, 1);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.add), 'forward');
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 15000 });
  await screenshot(page, 'keyboard-tree-win');
  pass('Keyboard: Tab/Enter folds, unfolds, chooses a branch, retains focus, edits a repeat and solves level 4');
}
(async () => {
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  const contexts = [];
  async function session(viewport, touch, level) {
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' }); contexts.push(context);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await context.addInitScript(level => {
      const key = 'routinebot-tree-access-seeded';
      if (sessionStorage.getItem(key)) return;
      localStorage.setItem('routinebot-save-v1', JSON.stringify({ version: 1, currentLevel: level,
        completed: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i + 1, true])), programs: {}, settings: { speed: 1, muted: true } }));
      sessionStorage.setItem(key, '1');
    }, level);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(base + 'routine_bot/routine_bot.html'); await page.waitForFunction(() => window.render_game_to_text);
    return { context, page };
  }
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 740 }, { width: 390, height: 844 }]) {
      const touch = viewport.width < 500, label = touch ? 'touch-' + viewport.width : 'desktop';
      const { context, page } = await session(viewport, touch, 12);
      await treeScene(page, label, touch); await context.tracing.stop({ path: path.join(output, label + '-trace.zip') }); await context.close();
    }
    const { context, page } = await session({ width: 1440, height: 900 }, false, 4);
    await keyboardScene(page); await context.tracing.stop({ path: path.join(output, 'keyboard-trace.zip') }); await context.close();
    assert.deepEqual(report.errors, []); pass('No browser page or console errors'); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
  finally { report.finished = new Date().toISOString(); write(); await browser.close(); }
})();
