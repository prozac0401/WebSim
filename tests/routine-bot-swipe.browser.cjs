'use strict';
// Actual browser input: mouse drag on desktop, Chromium touch input on mobile.
// Access fixtures contain no code; the only program fixture is explicitly the
// legacy level-1 and level-4 migration inputs, repaired through player controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const catalog = require('../routine_bot/levels.js');
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/routine-bot/gestures/final/swipe');
fs.mkdirSync(output, { recursive: true });
const report = { started: new Date().toISOString(), base, command: 'node tests/routine-bot-swipe.browser.cjs', checks: [], actions: [], errors: [],
  classification: 'Source-informed rendered gesture verification; desktop mouse and CDP Input.dispatchTouchEvent emulate actual browser pointer streams, not synthetic DOM events. Access-only fixture for coop-gate; disclosed legacy five-forward level-1 and three-node level-4 migration fixtures. All other programs are authored through visible controls.',
  android: 'NOT RUN', ios: 'NOT RUN', viewports: [{ width: 1440, height: 900, touch: false }, { width: 320, height: 740, touch: true }, { width: 390, height: 844, touch: true }] };
const write = () => fs.writeFileSync(path.join(output, 'swipe-report.json'), JSON.stringify(report, null, 2));
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'PASS', ...detail }); console.log('PASS', name); fs.appendFileSync(path.join(output, 'stdout.txt'), 'PASS ' + name + '\n'); write(); };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const capture = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
const sel = (attribute, id) => `[${attribute}="${id}"]`;
const touchClients = new WeakMap();
async function press(page, selector, touch) {
  const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
  if (touch) {
    await page.waitForTimeout(150);
    const box = await target.boundingBox(), point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1, radiusX: 5, radiusY: 5, force: 1 };
    const cdp = touchClients.get(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }); await page.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
  } else await target.click();
  report.actions.push({ viewport: report.currentViewport, input: touch ? 'CDP touch tap' : 'click', selector });
}
async function reload(page) { await page.reload(); await page.waitForFunction(() => window.render_game_to_text); }
const op = type => ({ type });
const rep = (count, body) => ({ type: 'repeat', count, body });
const iff = (condition, then, otherwise = []) => ({ type: 'if', condition, then, else: otherwise });
function flat(program) { const nodes = []; function visit(list) { for (const node of list) { nodes.push(node); for (const branch of ['body', 'then', 'else']) if (node[branch]) visit(node[branch]); } } for (const scope of ['main', 'F1', 'F2']) visit(program[scope]); return nodes; }
async function addList(page, list, touch) {
  for (const node of list) {
    const previous = new Set(flat((await read(page)).program).map(n => n.id));
    await press(page, sel('data-add', node.type === 'if' ? node.condition : node.type === 'call' ? node.target : node.type), touch);
    const added = flat((await read(page)).program).find(n => !previous.has(n.id)); assert.ok(added);
    if (node.type === 'repeat') { await page.locator(sel('data-repeat', added.id)).selectOption(String(node.count)); await addList(page, node.body, touch); await press(page, '#scope-back', touch); }
    else if (node.type === 'if') { await addList(page, node.then, touch); await press(page, '#scope-back', touch); await press(page, sel('data-insert', added.id + ':else'), touch); await addList(page, node.else, touch); await press(page, '#scope-back', touch); }
  }
}
async function build(page, main, touch, F1 = []) {
  if (!await page.locator('#clear').isDisabled()) await press(page, '#clear', touch);
  await press(page, '[data-scope="main"]', touch); await addList(page, main, touch);
  if (F1.length) { await press(page, '[data-scope="F1"]', touch); await addList(page, F1, touch); }
  await press(page, '[data-scope="main"]', touch); await press(page, '#insert-end', touch);
}
async function pointer(page, cdp, touch, start, end, options = {}) {
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
  else { await page.mouse.move(start.x, start.y); await page.mouse.down(); }
  for (let i = 1; i <= 12; i++) {
    const point = { x: start.x + (end.x - start.x) * i / 12, y: start.y + (end.y - start.y) * i / 12 };
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
    else await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(12);
  }
  if (options.beforeRelease) await options.beforeRelease();
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: options.cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await page.waitForTimeout(180);
}
async function swipe(page, cdp, touch, id, dx, dy = 0, options = {}) {
  const selector = options.selector || sel('data-node', id), target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  const rect = await target.boundingBox(), viewport = page.viewportSize(); assert.ok(rect);
  const x = dx > 0 ? Math.max(rect.x + 10, Math.min(rect.x + rect.width / 2, viewport.width - dx - 8)) : Math.min(rect.x + rect.width - 10, Math.max(rect.x + rect.width / 2, -dx + 8));
  const start = { x, y: rect.y + rect.height / 2 }, end = { x: x + dx, y: start.y + dy };
  assert.ok(start.x >= rect.x && start.x <= rect.x + rect.width && start.y >= 0 && start.y < viewport.height, 'visible gesture start');
  report.actions.push({ viewport: report.currentViewport, input: touch ? 'CDP touch swipe' : 'mouse drag', selector, start, end, cancel: !!options.cancel });
  if (options.beforeStart) await options.beforeStart();
  await pointer(page, cdp, touch, start, end, options);
}

async function drag(page, cdp, touch, id, destination, options = {}) {
  const handle = page.locator(sel('data-drag', id)); await handle.scrollIntoViewIfNeeded();
  const rect = await handle.boundingBox(); assert.ok(rect);
  let point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const start = { ...point }, viewport = page.viewportSize();
  const move = async to => {
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
    else await page.mouse.move(to.x, to.y, { steps: 4 });
    point = to;
  };
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
  else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
  await move({ x: point.x + 12, y: point.y });
  await page.waitForTimeout(30);
  // Offscreen destinations are reached by the game's actual edge autoscroll.
  // Read geometry only; do not scroll or mutate the page while dragging.
  let edgeMoves = 0, end;
  for (let attempt = 0; attempt < 90; attempt++) {
    const target = await page.locator(destination).evaluate(element => {
      const rect = element.getBoundingClientRect(), area = element.closest('#program'), container = area?.getBoundingClientRect();
      const clip = area && area.scrollHeight > area.clientHeight ? { top: Math.max(0, container.top), bottom: Math.min(innerHeight, container.bottom) } : { top: 0, bottom: innerHeight };
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, clip };
    });
    // Use the target's actual center rather than a visible sliver, which can
    // overlap a neighboring drop zone. Keep clear of viewport scrolling edges;
    // the first/last editor item can legitimately touch its inner scroll edge.
    const top = Math.max(target.clip.top + 6, 75), bottom = Math.min(target.clip.bottom - 6, viewport.height - 75), center = target.y + target.height / 2;
    if (center >= top && center <= bottom) {
      end = { x: Math.max(12, Math.min(viewport.width - 12, target.x + target.width / 2)), y: center };
      await move(end);
      const landed = await page.locator(destination).evaluate((element, point) => {
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-drop-scope]');
        return hit && ['dropRoot', 'dropParent', 'dropBranch', 'dropIndex'].every(key => hit.dataset[key] === element.dataset[key]);
      }, end);
      if (landed) break;
      // The approach itself can trigger edge scrolling; read the new position
      // and aim again instead of dropping onto a now-adjacent block.
      end = null; continue;
    }
    const up = center < top;
    await move({ x: Math.max(12, Math.min(viewport.width - 12, target.x + target.width / 2)), y: up ? Math.max(8, target.clip.top + 8) : Math.min(viewport.height - 8, target.clip.bottom - 8) });
    edgeMoves++; await page.waitForTimeout(90);
  }
  assert.ok(end, 'Drag destination must become reachable through edge autoscroll: ' + destination);
  const hit = await page.evaluate(({ x, y }) => { const element = document.elementFromPoint(x, y)?.closest('[data-drop-scope]'); return element ? { tag: element.tagName, ...element.dataset } : null; }, end);
  const intended = await page.locator(destination).evaluate(element => ({ root: element.dataset.dropRoot, parent: element.dataset.dropParent, branch: element.dataset.dropBranch, index: element.dataset.dropIndex }));
  assert.deepEqual(hit && { root: hit.dropRoot, parent: hit.dropParent, branch: hit.dropBranch, index: hit.dropIndex }, intended, 'Pointer must land on the intended visible drop target');
  if (options.beforeRelease) await options.beforeRelease();
  report.actions.push({ viewport: report.currentViewport, input: touch ? 'CDP touch grip drag' : 'mouse grip drag', source: id, destination, start, end, edgeMoves, hit, cancel: !!options.cancel });
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: options.cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await page.waitForTimeout(180);
}

async function swipeScene(page, cdp, label, touch) {
  await build(page, [op('forward'), op('right'), op('left')], touch);
  const original = (await read(page)).program, ids = original.main.map(n => n.id);
  await swipe(page, cdp, touch, ids[1], 124, 0, { beforeRelease: async () => { assert.deepEqual((await read(page)).program, original); assert.equal(await page.locator('.swipe-ready').count(), 1, 'ready-to-delete feedback must remain visible until release'); await capture(page, label + '-right-swipe-ready'); } });
  assert.deepEqual((await read(page)).program.main.map(n => n.id), [ids[0], ids[2]]);
  assert.equal(await page.locator('[data-node][aria-pressed="true"]').count(), 0, 'release must not select a neighboring command');
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, original);
  await swipe(page, cdp, touch, ids[0], -124);
  assert.deepEqual((await read(page)).program.main.map(n => n.id), [ids[1], ids[2]]);
  const deleted = (await read(page)).program; await reload(page); assert.deepEqual((await read(page)).program, deleted);
  pass(label + ': right and left release delete exactly the targeted command; no premature deletion/sibling selection; undo and reload preserve changes');

  const remaining = deleted.main[0].id;
  await swipe(page, cdp, touch, remaining, 35); assert.deepEqual((await read(page)).program, deleted);
  let scrollBefore;
  await swipe(page, cdp, touch, remaining, 4, 100, { beforeStart: async () => { scrollBefore = await page.evaluate(() => scrollY); } }); assert.deepEqual((await read(page)).program, deleted);
  const scrollAfter = await page.evaluate(() => scrollY);
  await swipe(page, cdp, touch, remaining, 100, -90); assert.deepEqual((await read(page)).program, deleted);
  if (touch) {
    await swipe(page, cdp, touch, remaining, 124, 0, { cancel: true }); assert.deepEqual((await read(page)).program, deleted);
    assert.notEqual(scrollAfter, scrollBefore, 'vertical touch scrolling must remain available');
  }
  pass(label + ': short, predominantly vertical and diagonal gestures preserve code; touch scrolling/cancel do not delete', { scrollBefore, scrollAfter });

  await build(page, [op('forward'), rep(2, [op('forward'), iff('blocked', [op('right')], [op('left')])]), op('wait')], touch, [op('forward'), op('right')]);
  const nested = (await read(page)).program, parent = nested.main[1], branch = parent.body[1], nestedId = branch.else[0].id;
  await swipe(page, cdp, touch, nestedId, -124);
  let after = await read(page); assert.equal(after.program.main[1].body[1].else.length, 0); assert.deepEqual(after.program.main.map(n => n.id), nested.main.map(n => n.id));
  assert.deepEqual(after.program.main[1].body[1].then, branch.then); await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, nested);
  await swipe(page, cdp, touch, parent.id, 124); after = await read(page);
  assert.deepEqual(after.program.main.map(n => n.id), [nested.main[0].id, nested.main[2].id]); assert.deepEqual(after.program.F1, nested.F1);
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, nested);
  pass(label + ': nested else deletion preserves its sibling branch; swiping a parent removes its subtree only and undo restores the full tree');

  await swipe(page, cdp, touch, parent.id, -104, 0, { selector: sel('data-enter', parent.id + ':body') });
  await page.keyboard.press('Escape'); assert.deepEqual((await read(page)).program, nested);
  if (await page.locator(sel('data-enter', parent.id + ':body')).getAttribute('aria-expanded') === 'false') await press(page, sel('data-enter', parent.id + ':body'), touch);
  await swipe(page, cdp, touch, parent.id, -104, 0, { selector: sel('data-repeat', parent.id) });
  await page.keyboard.press('Escape'); assert.deepEqual((await read(page)).program, nested);
  await page.locator(sel('data-repeat', parent.id)).selectOption('3'); assert.equal((await read(page)).program.main[1].count, 3);
  await press(page, sel('data-enter', parent.id + ':body'), touch); assert.equal(await page.locator(sel('data-node', nestedId)).isVisible(), false);
  await press(page, sel('data-enter', parent.id + ':body'), touch); assert.equal(await page.locator(sel('data-node', nestedId)).isVisible(), true);
  pass(label + ': fold and repeat-count controls reject deletion gestures and remain normally operable');

  await press(page, '[data-scope="F1"]', touch); const beforeFunction = (await read(page)).program;
  await swipe(page, cdp, touch, beforeFunction.F1[0].id, 124); after = await read(page);
  assert.deepEqual(after.program.main, beforeFunction.main); assert.deepEqual(after.program.F1, beforeFunction.F1.slice(1));
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, beforeFunction);
  await press(page, '#challenge-start', touch); await press(page, '#rest', touch);
  await swipe(page, cdp, touch, beforeFunction.F1[0].id, -124); assert.deepEqual((await read(page)).program, beforeFunction); assert.equal((await read(page)).challenge.resting, true);
  await press(page, '#rest', touch);
  pass(label + ': swipes target the active function body and undo correctly; resting prevents gesture edits');
}

async function migrationScene(page, cdp, label, touch) {
  const original = (await read(page)).program; assert.equal(original.main.length, 5); assert.equal((await read(page)).stored, 5);
  await capture(page, label + '-legacy-five-blocks');
  await swipe(page, cdp, touch, original.main[4].id, 124); assert.equal((await read(page)).stored, 4); assert.match((await read(page)).message, /4개|1개 줄인/);
  await reload(page); assert.deepEqual((await read(page)).program.main, original.main.slice(0, 4));
  await swipe(page, cdp, touch, original.main[3].id, -124); assert.equal((await read(page)).stored, 3);
  await press(page, '#undo', touch); assert.equal((await read(page)).stored, 4);
  await swipe(page, cdp, touch, original.main[3].id, 124); assert.equal((await read(page)).stored, 3);
  assert.equal(await page.locator('#speed').inputValue(), '4'); await press(page, '#run', touch);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 10000 });
  assert.deepEqual((await read(page)).completed, [1]); await capture(page, label + '-swipe-repaired-win');
  await reload(page); assert.deepEqual((await read(page)).program.main, original.main.slice(0, 3)); assert.deepEqual((await read(page)).completed, [1]);
  pass(label + ': legacy over-budget five-block save repairs one swipe at a time, survives undo/reload, then wins through normal execution');
}

async function repeatMigrationScene(page, cdp, label, touch) {
  const original = (await read(page)).program, [forward, repeat] = original.main;
  assert.equal((await read(page)).stored, 3); assert.equal(repeat.count, 3);
  await capture(page, label + '-legacy-repeat-three-blocks');
  await drag(page, cdp, touch, forward.id, sel('data-block', repeat.id));
  assert.deepEqual((await read(page)).program.main, [{ ...repeat, body: [repeat.body[0], forward] }]);
  assert.equal((await read(page)).stored, 3);
  await press(page, '#run', touch); assert.equal((await read(page)).executed, 0); assert.notEqual((await read(page)).status, 'success');
  assert.match((await read(page)).message, /제한|2개|줄인/, 'count-neutral repair still respects the public cap');
  await capture(page, label + '-legacy-repeat-grouped');
  await swipe(page, cdp, touch, repeat.body[0].id, -124);
  assert.equal((await read(page)).stored, 2);
  await page.locator(sel('data-repeat', repeat.id)).selectOption('5');
  const repaired = (await read(page)).program; await reload(page); assert.deepEqual((await read(page)).program, repaired);
  assert.equal(await page.locator('#speed').inputValue(), '4'); await press(page, '#run', touch);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'success', {}, { timeout: 10000 });
  assert.equal((await read(page)).completed.includes(4), true);
  await capture(page, label + '-legacy-repeat-repaired-win');
  pass(label + ': pictured legacy level-4 three-node program permits count-neutral drag into repeat while over budget; swipe repair, repeat count and reload lead to a real UI win');
}

async function dragScene(page, cdp, label, touch) {
  await build(page, [op('forward'), rep(2, [op('right')]), op('left'), op('wait')], touch);
  const initial = (await read(page)).program, [forward, repeat, left, wait] = initial.main;
  await press(page, sel('data-enter', repeat.id + ':body'), touch);
  assert.equal(await page.locator(sel('data-enter', repeat.id + ':body')).getAttribute('aria-expanded'), 'false');
  await drag(page, cdp, touch, forward.id, sel('data-block', repeat.id), { beforeRelease: async () => { assert.deepEqual((await read(page)).program, initial); await capture(page, label + '-drag-into-repeat-ready'); } });
  let state = await read(page);
  assert.deepEqual(state.program.main.map(n => n.id), [repeat.id, left.id, wait.id]);
  assert.deepEqual(state.program.main[0].body, [repeat.body[0], forward]);
  assert.equal(await page.locator(sel('data-node', forward.id)).isVisible(), true, 'collapsed repeat must reveal moved child');
  assert.equal(state.stored, flat(initial).length, 'moving preserves stored node count');
  await capture(page, label + '-dragged-into-repeat');
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, initial);
  await drag(page, cdp, touch, forward.id, sel('data-block', repeat.id));
  await drag(page, cdp, touch, forward.id, '[data-scope="main"]');
  state = await read(page);
  assert.deepEqual(state.program.main, [repeat, left, wait, forward]);
  pass(label + ': grip moves an existing command into a collapsed repeat and opens it; undo restores original; main tab moves it back out without duplicating');

  await drag(page, cdp, touch, wait.id, sel('data-drop-before', left.id));
  const reordered = (await read(page)).program;
  assert.deepEqual(reordered.main, [repeat, wait, left, forward]);
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program.main, [repeat, left, wait, forward]);
  await drag(page, cdp, touch, wait.id, sel('data-drop-before', left.id));
  await reload(page); assert.deepEqual((await read(page)).program, reordered);
  pass(label + ': before-block drop zones reorder siblings; undo and reload retain exact node identities and contents');

  await build(page, [rep(2, [iff('blocked', [op('right')], [op('left')])]), rep(3, [op('wait')]), op('forward')], touch);
  const nested = (await read(page)).program, [subtree, destination, tail] = nested.main;
  await drag(page, cdp, touch, subtree.id, sel('data-insert', destination.id + ':body'));
  state = await read(page);
  assert.deepEqual(state.program.main, [{ ...destination, body: [destination.body[0], subtree] }, tail]);
  assert.equal(state.stored, flat(nested).length);
  await capture(page, label + '-subtree-moved');
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program, nested);
  await drag(page, cdp, touch, subtree.id, sel('data-block', subtree.id));
  assert.deepEqual((await read(page)).program, nested); assert.match((await read(page)).message, /자기 안쪽/);
  await drag(page, cdp, touch, subtree.id, sel('data-insert', subtree.body[0].id + ':then'));
  assert.deepEqual((await read(page)).program, nested); assert.match((await read(page)).message, /자기 안쪽/);
  pass(label + ': moving a parent retains its nested condition and both branches; self/descendant drops leave the original tree intact');

  await drag(page, cdp, touch, subtree.id, '[data-scope="F1"]');
  state = await read(page); assert.deepEqual(state.program.main, [destination, tail]); assert.deepEqual(state.program.F1, [subtree]);
  await drag(page, cdp, touch, subtree.id, '[data-scope="main"]');
  assert.deepEqual((await read(page)).program.main, [destination, tail, subtree]); assert.deepEqual((await read(page)).program.F1, []);
  await press(page, '#undo', touch); assert.deepEqual((await read(page)).program.F1, [subtree]);
  if (touch) {
    const before = (await read(page)).program;
    await drag(page, cdp, touch, subtree.id, '[data-scope="main"]', { cancel: true }); assert.deepEqual((await read(page)).program, before);
  }
  pass(label + ': scope tabs move complete subtrees into and out of function storage; undo and touch cancellation preserve the intended scope');

  await build(page, [rep(2, [rep(2, [rep(2, [rep(2, [op('forward')])])])]), rep(2, [op('wait')])], touch);
  const deep = (await read(page)).program, outer = deep.main[0], extra = deep.main[1], innermost = outer.body[0].body[0].body[0];
  await drag(page, cdp, touch, extra.id, sel('data-insert', innermost.id + ':body'));
  assert.deepEqual((await read(page)).program, deep); assert.match((await read(page)).message, /깊|중첩|4단계/);
  pass(label + ': a drop exceeding the nesting limit is rejected atomically with the entire original program retained');

  await build(page, [{ type: 'call', target: 'F1' }], touch);
  const acyclic = (await read(page)).program;
  await drag(page, cdp, touch, acyclic.main[0].id, '[data-scope="F1"]');
  assert.deepEqual((await read(page)).program, acyclic); assert.match((await read(page)).message, /함수가 자기 자신/);
  pass(label + ': moving an F1 call into F1 rejects the recursive program and retains the original call in main');
}

(async () => {
  report.channel = process.env.WEBSIM_BROWSER_CHANNEL || 'bundled';
  fs.writeFileSync(path.join(output, 'stdout.txt'), `WEBSIM_URL=${base}\nWEBSIM_EVIDENCE=${output}\nWEBSIM_BROWSER_CHANNEL=${report.channel}\nGESTURE_VIEWPORT=${process.env.GESTURE_VIEWPORT || 'all'}\nGESTURE_SCENE=${process.env.GESTURE_SCENE || 'all'}\nnode tests/routine-bot-swipe.browser.cjs\n`);
  const browser = await chromium.launch({ headless: true, ...(process.env.WEBSIM_BROWSER_CHANNEL ? { channel: process.env.WEBSIM_BROWSER_CHANNEL } : {}) }); report.browser = browser.version();
  async function session(view, migration) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.touch, hasTouch: view.touch, reducedMotion: 'reduce' });
    await context.addInitScript(({ migration, ids }) => {
      window.__gestureLayoutLog = [];
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__gestureLayoutLog.push({ type: 'layout-shift', time: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput }); }).observe({ type: 'layout-shift', buffered: true });
      for (const type of ['scroll', 'scrollend']) document.addEventListener(type, () => window.__gestureLayoutLog.push({ type, time: performance.now(), scrollY }), true);
      window.__gestureInputLog = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) document.addEventListener(type, event => {
        const button = event.target.closest('button');
        const entry = { type, time: performance.now(), pointer: event.pointerId, primary: event.isPrimary, detail: event.detail, x: event.clientX, y: event.clientY, target: button ? { id: button.id, ...button.dataset } : event.target.tagName };
        window.__gestureInputLog.push(entry);
        queueMicrotask(() => { entry.defaultPrevented = event.defaultPrevented; entry.scrollY = scrollY; entry.active = document.activeElement?.id; entry.disabled = button?.disabled; entry.rect = button ? { top: button.getBoundingClientRect().top, left: button.getBoundingClientRect().left, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height } : null; });
        if (window.__gestureInputLog.length > 150) window.__gestureInputLog.shift();
      }, { capture: true, passive: true });
      if (sessionStorage.getItem('routinebot-gesture-fixture')) return;
      const data = migration === 'repeat' ? { version: 1, currentLevel: 4, completed: { 1: true, 2: true, 3: true }, programs: { 4: { main: [{ id: 'old-forward', type: 'forward' }, { id: 'old-repeat', type: 'repeat', count: 3, body: [{ id: 'old-child', type: 'forward' }] }], F1: [], F2: [] } }, settings: { speed: 4, muted: true } } : migration ? { version: 1, currentLevel: 1, completed: {}, programs: { 1: { main: Array.from({ length: 5 }, (_, i) => ({ id: 'old-' + i, type: 'forward' })), F1: [], F2: [] } }, settings: { speed: 4, muted: true } } :
        { version: 2, currentLevel: 'coop-gate', completed: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, true])), unlocked: ids, programs: {}, settings: { speed: 4, muted: true } };
      localStorage.setItem('routinebot-save-v1', JSON.stringify(data)); sessionStorage.setItem('routinebot-gesture-fixture', '1');
    }, { migration, ids: catalog.map(l => l.id) });
    const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(base + 'routine_bot/routine_bot.html'); await page.waitForFunction(() => window.render_game_to_text);
    const cdp = await context.newCDPSession(page); touchClients.set(page, cdp);
    return { context, page, cdp };
  }
  try {
    report.sessionFailures = [];
    report.filter = { viewport: process.env.GESTURE_VIEWPORT || 'all', scene: process.env.GESTURE_SCENE || 'all' };
    for (const view of report.viewports.filter(view => !process.env.GESTURE_VIEWPORT || String(view.width) === process.env.GESTURE_VIEWPORT)) {
      const label = view.touch ? 'touch-' + view.width : 'desktop'; report.currentViewport = label;
      for (const migration of [false, true, 'repeat']) {
        if (process.env.GESTURE_SCENE && process.env.GESTURE_SCENE !== (migration === 'repeat' ? 'repeat' : migration ? 'migration' : 'gestures')) continue;
        const { context, page, cdp } = await session(view, migration);
        try { if (migration === 'repeat') await repeatMigrationScene(page, cdp, label, view.touch); else if (migration) await migrationScene(page, cdp, label, view.touch); else { await swipeScene(page, cdp, label, view.touch); await dragScene(page, cdp, label, view.touch); } }
        catch (error) { await capture(page, label + (migration === 'repeat' ? '-repeat-migration' : migration ? '-migration' : '') + '-failure'); report.sessionFailures.push({ viewport: label, migration, failure: error.stack, inputEvents: await page.evaluate(() => window.__gestureInputLog), layoutEvents: await page.evaluate(() => window.__gestureLayoutLog) }); write(); console.error(error); }
        finally { await context.close(); }
      }
    }
    assert.deepEqual(report.sessionFailures, [], 'Every gesture and migration session must pass');
    assert.deepEqual(report.errors, []); pass('No console or page errors'); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.failure = error.stack; fs.appendFileSync(path.join(output, 'stdout.txt'), error.stack + '\n'); console.error(error); process.exitCode = 1; }
  finally { report.finished = new Date().toISOString(); write(); await browser.close(); }
})();
