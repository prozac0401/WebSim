'use strict';
// Source-informed rendered replay. Access only is seeded; every program, turn,
// repair and successful completion below is made with player-facing controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const catalog = require('../routine_bot/levels.js'), solutions = require('../routine_bot/solutions.cjs');
const phase = process.argv[2] || 'final';
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || `output/playwright/routine-bot/cooperation/${phase}`);
fs.mkdirSync(output, { recursive: true });
const traceEnabled = process.env.WEBSIM_TRACE === '1';
const report = { phase, base, started: new Date().toISOString(), checks: [], errors: [], progression: [], actions: [], trace: traceEnabled ? 'enabled' : 'NOT RUN: screenshots and actual control-action log retained; prior trace-export stream failure preserved in early-rerun',
  command: `node tests/routine-bot-cooperation.browser.cjs ${phase}`, environment: { WEBSIM_URL: base, WEBSIM_EVIDENCE: output, WEBSIM_TRACE: traceEnabled ? '1' : '0' },
  classification: 'Source-informed actual UI click/tap replay. Fixture grants completed original 1–15 and access to new stable IDs only. Programs, records, runner state and new wins are never injected. Not blind exploration or human enjoyment evidence.',
  android: 'NOT RUN', ios: 'NOT RUN', hiddenBrowser: 'NOT RUN: genuine hidden-document timing covered by deterministic timing.test.cjs, not simulated by a fake visibility event.',
  viewports: [{ width: 1440, height: 900, touch: false }, { width: 320, height: 740, touch: true }, { width: 390, height: 844, touch: true }] };
const write = () => fs.writeFileSync(path.join(output, 'cooperation-report.json'), JSON.stringify(report, null, 2));
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'PASS', ...detail }); write(); console.log('PASS', name); };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function press(page, selector, touch = false) { const el = page.locator(selector); await el.scrollIntoViewIfNeeded(); touch ? await el.tap() : await el.click(); report.actions.push({ viewport: report.currentViewport, selector, input: touch ? 'tap' : 'click' }); }
const capture = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
function flatten(program) { const result = []; function visit(nodes) { for (const n of nodes) { result.push(n); for (const branch of ['body', 'then', 'else']) if (n[branch]) visit(n[branch]); } } for (const root of ['main', 'F1', 'F2']) visit(program[root]); return result; }
async function addList(page, list, touch) {
  for (const node of list) {
    const ids = new Set(flatten((await read(page)).program).map(n => n.id));
    const kind = node.type === 'if' ? node.condition : node.type === 'call' ? node.target : node.type;
    await press(page, `[data-add="${kind}"]`, touch);
    const inserted = flatten((await read(page)).program).find(n => !ids.has(n.id)); assert.ok(inserted, 'palette adds a new block');
    if (node.type === 'repeat') { await page.locator(`[data-repeat="${inserted.id}"]`).selectOption(String(node.count)); await addList(page, node.body, touch); await press(page, '#scope-back', touch); }
    else if (node.type === 'if') { await addList(page, node.then, touch); await press(page, '#scope-back', touch); await press(page, `[data-insert="${inserted.id}:else"]`, touch); await addList(page, node.else, touch); await press(page, '#scope-back', touch); }
  }
}
async function build(page, program, touch) {
  if (!await page.locator('#clear').isDisabled()) await press(page, '#clear', touch);
  for (const root of ['main', 'F1', 'F2']) if (program[root]?.length) { await press(page, `[data-scope="${root}"]`, touch); await addList(page, program[root], touch); }
  await press(page, '[data-scope="main"]', touch);
}
async function win(page, touch) {
  await page.locator('#speed').selectOption('4'); await press(page, '#run', touch);
  await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.status === 'failure' || (s.status === 'success' && !document.querySelector('#success-panel').hidden); }, {}, { timeout: 60000 });
  const s = await read(page); assert.equal(s.status, 'success', s.message); assert.equal(s.challenge.finished, true);
  assert.equal(s.verifiedMaps, s.maps); assert.match(await page.locator('#success-detail').innerText(), /풀이 .*턴.*저장 .*시도 .*(힌트.*사용|도움 없음)/);
  return s;
}
const groups = s => Object.values(s.records)[0];

async function timingAndTutorial(page, label, touch) {
  assert.equal((await read(page)).level, 'coop-gate');
  assert.equal((await read(page)).challenge.started, false); await page.waitForTimeout(250); assert.equal((await read(page)).challenge.elapsedMs, 0);
  await press(page, '#challenge-start', touch); await build(page, solutions['coop-gate'], touch);
  let s = await read(page); assert.ok(s.challenge.elapsedMs > 0); assert.equal(s.challenge.attempts, 0);
  await page.locator('#speed').selectOption('0.5'); await press(page, '#run', touch); await press(page, '#pause', touch);
  s = await read(page); assert.equal(s.movementCount, 1); assert.equal(s.challenge.attempts, 1);
  assert.deepEqual(s.event.actions.map(a => a.type), ['wait', 'push']);
  const paused = s; await page.waitForTimeout(350); s = await read(page);
  assert.equal(s.movementCount, paused.movementCount); assert.ok(s.challenge.elapsedMs >= paused.challenge.elapsedMs + 300);
  await press(page, '[data-robot="B"]', touch); s = await read(page); assert.equal(s.selectedRobot, 'B');
  assert.equal(s.currentId, s.robots.find(r => r.id === 'B').currentId); assert.equal(await page.locator(`[data-block="${s.currentId}"].executing`).count(), 1);
  assert.match(await page.locator('#execution-path').innerText(), /^B 실행:/); await capture(page, label + '-independent-branch-push');
  pass(label + ': explicit start includes editing and paused review; both robots use independent branches, selected B command is highlighted');

  await press(page, '#help-open', touch); const opened = await read(page); assert.equal(opened.helpOpen, true);
  await page.waitForTimeout(400); s = await read(page); assert.equal(s.challenge.elapsedMs, opened.challenge.elapsedMs); assert.equal(s.movementCount, opened.movementCount);
  const lessonCount = Number((await page.locator('#tutorial-page').innerText()).split('/')[1].trim());
  for (let i = 0; i < lessonCount && !/^규칙 1 /.test(await page.locator('#tutorial-page').innerText()); i++) await press(page, '#tutorial-next', touch);
  for (let index = 1; index <= lessonCount; index++) {
    assert.match(await page.locator('#tutorial-page').innerText(), new RegExp('규칙 ' + index + ' / ' + lessonCount));
    await press(page, '#tutorial-act', touch); let result = await page.locator('#tutorial-result').innerText();
    for (let control = 0; control < 5 && /^0턴/.test(result); control++) { await press(page, '#tutorial-act', touch); result = await page.locator('#tutorial-result').innerText(); }
    assert.match(result, /1턴/);
    if (index === 1) assert.match(result, /모든 상자/);
    if (index === 2) assert.match(result, /상자가 이어져/);
    if (index === 3) assert.match(result, /A:.*기다려.*B:.*밀고/);
    if (index === 4) assert.match(result, /같은 목적 칸/);
    await capture(page, label + '-tutorial-' + index);
    if (index < lessonCount) await press(page, '#tutorial-next', touch);
  }
  assert.equal((await read(page)).challenge.elapsedMs, opened.challenge.elapsedMs);
  await press(page, '#tutorial-skip', touch); s = await read(page); assert.equal(s.helpOpen, false); assert.equal(s.paused, true);
  await page.waitForTimeout(300); assert.equal((await read(page)).movementCount, opened.movementCount); assert.equal((await read(page)).challenge.hintUsed, true);
  pass(label + ': all ' + lessonCount + ' interactive tutorial rules respond to taps, show blocking/branch/collision, exclude time, preserve paused game and require explicit resume');

  await press(page, '#rest', touch); const rest = await read(page);
  assert.equal(rest.challenge.resting, true); assert.equal(await page.locator('.editor').evaluate(el => el.inert), true);
  assert.equal(await page.locator('#run').isDisabled(), true); assert.equal(await page.locator('#step').isDisabled(), true); assert.equal(await page.locator('#reset').isDisabled(), true);
  await page.waitForTimeout(350); assert.equal((await read(page)).challenge.elapsedMs, rest.challenge.elapsedMs);
  await page.reload(); await page.waitForFunction(() => window.render_game_to_text); s = await read(page);
  assert.equal(s.challenge.resting, true); assert.equal(s.challenge.elapsedMs, rest.challenge.elapsedMs); assert.equal(s.challenge.attempts, 1);
  assert.deepEqual(s.program, rest.program); assert.equal(s.movementCount, 0); assert.equal(await page.locator('.editor').evaluate(el => el.inert), true);
  await capture(page, label + '-rest-reload'); await press(page, '#rest', touch); assert.equal((await read(page)).challenge.resting, false);
  await page.waitForTimeout(200); assert.ok((await read(page)).challenge.elapsedMs >= rest.challenge.elapsedMs + 180);
  await press(page, '#step', touch); s = await read(page); assert.equal(s.challenge.attempts, 2);
  await press(page, '#reset', touch); const reset = await read(page); assert.equal(reset.challenge.attempts, 2); assert.ok(reset.challenge.elapsedMs >= s.challenge.elapsedMs); assert.deepEqual(reset.program, s.program);
  pass(label + ': rest locks editing/execution and survives reload; resume continues accumulated time; reset preserves code, attempts and elapsed time');

  await page.locator('#level-select').selectOption('1'); assert.match(await page.locator('#record-summary').innerText(), /기존 완료 · 시간 기록 없음/);
  await page.waitForTimeout(350); await page.locator('#level-select').selectOption('coop-gate'); s = await read(page);
  assert.equal(s.challenge.attempts, 2); assert.ok(s.challenge.elapsedMs >= reset.challenge.elapsedMs); assert.ok(s.challenge.elapsedMs - reset.challenge.elapsedMs < 350);
  await win(page, touch); s = await read(page); assert.equal(s.challenge.attempts, 3); assert.equal(s.challenge.hintUsed, true); assert.ok(groups(s).assisted); assert.equal(groups(s).unassisted, undefined);
  await capture(page, label + '-assisted-gate-win');
  pass(label + ': level switch retains in-progress challenge while away time is excluded; legacy records have no invented time; assisted win stores three attempts separately');
  await press(page, '#tutorial-open', touch); assert.match(await page.locator('#tutorial-practice').innerText(), /완료한 도전 다시 보기/);
  const linkedProgram = (await read(page)).program;
  const openedPage = page.context().waitForEvent('page'); await press(page, '#help-dialog a', touch); const manual = await openedPage;
  await manual.waitForLoadState(); assert.match(manual.url(), /routine_bot_doc\.html$/); assert.ok((await manual.locator('body').innerText()).includes('상자')); await manual.close();
  await press(page, '#tutorial-practice', touch); s = await read(page); assert.equal(s.level, 'coop-gate'); assert.equal(s.helpOpen, false); assert.deepEqual(s.program, linkedProgram); assert.ok(s.completed.includes('coop-gate'));
  pass(label + ': separate game-method page opens from help; tutorial practice links back to the existing completed stage without losing code or progress');
}

async function stages(page, label, touch) {
  for (const stage of catalog.filter(l => typeof l.id === 'string' && l.id !== 'coop-gate')) {
    await page.locator('#level-select').selectOption(stage.id); await press(page, '#challenge-start', touch);
    if (stage.id === 'box-detour') {
      await build(page, { main: [{ type: 'forward' }], F1: [], F2: [] }, touch); await press(page, '#step', touch);
      let blocked = await read(page); assert.equal(blocked.event.actions[0].reason, 'box-chain'); assert.equal(blocked.movementCount, 1);
      assert.equal(blocked.status, 'running'); assert.match(await page.locator('#message').innerText(), /상자가 이어져/); assert.equal(await page.locator('.block.crashed').count(), 1);
      await capture(page, label + '-blocked-box-chain'); await press(page, '#step', touch); blocked = await read(page); assert.equal(blocked.event.reason, 'exhausted');
      assert.equal(blocked.robots[0].event.lastAction.reason, 'box-chain'); assert.match(blocked.message, /상자가 이어져/); assert.match(await page.locator('[data-robot="A"]').innerText(), /상자가 이어져/); await capture(page, label + '-exhausted-preserves-blockage');
      const elapsed = blocked.challenge.elapsedMs; await press(page, '#reset', touch); assert.equal((await read(page)).challenge.attempts, 1); assert.ok((await read(page)).challenge.elapsedMs >= elapsed);
      pass(label + ': two in-line boxes visibly refuse a push, consume one turn and reach next command/end; failure/reset keep active challenge');
    }
    await build(page, solutions[stage.id], touch);
    if (stage.id === 'box-intro') await page.waitForTimeout(650);
    const result = await win(page, touch); assert.ok(result.completed.includes(stage.id));
    report.progression.push({ viewport: label, level: stage.id, stored: result.stored, turns: result.turns, executed: result.executed, maps: result.maps, elapsedMs: result.challenge.elapsedMs, attempts: result.challenge.attempts });
    await capture(page, label + '-' + stage.id + '-success');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    pass(label + ': ' + stage.id + ' solved through visible block editing and actual execution', { maps: result.maps, stored: result.stored, turns: result.turns });
    if (stage.id === 'box-intro') {
      await press(page, '#help-open', touch); const completedHelp = await read(page);
      assert.equal(completedHelp.challenge.finished, true); assert.equal(completedHelp.challenge.hintUsed, false); assert.deepEqual(completedHelp.records, result.records);
      assert.doesNotMatch(await page.locator('#solve-time').innerText(), /도움\/예시 사용/); await press(page, '#help-close', touch);
      pass(label + ': help opened after an unassisted completion does not relabel or mutate that finished record');
      const first = groups(result).unassisted.first; await press(page, '#hint', touch); const oldHint = await page.locator('#hint-text').innerText(); await press(page, '#new-record', touch);
      const restarted = await read(page); assert.equal(restarted.challenge.attempts, 0); assert.equal(restarted.challenge.finished, false); assert.deepEqual(restarted.program, result.program);
      assert.equal(restarted.challenge.hintUsed, false); assert.notEqual(await page.locator('#hint-text').innerText(), oldHint); assert.match(await page.locator('#hint-text').innerText(), /막히면/); assert.equal(await page.locator('#hint').isDisabled(), false);
      const faster = await win(page, touch); assert.equal(faster.stored, result.stored); assert.ok(faster.challenge.elapsedMs < first.elapsedMs);
      assert.deepEqual(groups(faster).unassisted.first, first); assert.equal(groups(faster).unassisted.best.elapsedMs, faster.challenge.elapsedMs);
      await page.reload(); await page.waitForFunction(() => window.render_game_to_text); const reloaded = await read(page);
      assert.equal(groups(reloaded).unassisted.best.elapsedMs, faster.challenge.elapsedMs); assert.equal(reloaded.challenge.finished, true);
      pass(label + ': separate new-record action clears prior visible hints, preserves code, resets challenge, updates equal-node faster best and preserves first record through reload');
    }
    if (stage.id === 'coop-delivery') {
      await press(page, '#new-record', touch); await press(page, '#step', touch); const delivered = await read(page);
      assert.equal(delivered.status, 'running'); assert.ok(delivered.targets.every(t => delivered.boxes.some(b => b.x === t.x && b.y === t.y)));
      assert.ok(delivered.robots.every(r => r.x !== r.home.x || r.y !== r.home.y)); await capture(page, label + '-delivery-before-home');
      await win(page, touch); pass(label + ': delivery alone is not success; both labelled robots return to their own homes for completion');
    }
    if (stage.id === 'coop-finale') {
      assert.equal(result.turns, 10); assert.equal(result.challenge.hintUsed, false); assert.match(await page.locator('#success-title').innerText(), /모든 길/);
      pass(label + ': final shared function/condition/wait/push stage completes at ten global turns with hazard-before-win rules');
    }
  }
  if (touch) {
    const height = await page.evaluate(() => innerHeight);
    const brief = await page.locator('#brief').boundingBox(), mapAccess = await page.locator('.map-access summary').boundingBox();
    assert.ok(mapAccess.y >= brief.y + brief.height, 'map text disclosure must not overlap the cooperative briefing');
    for (const selector of ['#canvas', '#run', '[data-scope="main"]', '[data-add="forward"]']) {
      await page.locator(selector).scrollIntoViewIfNeeded(); const rect = await page.locator(selector).boundingBox(); assert.ok(rect.y >= 0 && rect.y + rect.height <= height, selector + ' reachable by scrolling');
    }
    assert.equal((await read(page)).reducedMotion, true); pass(label + ': cooperative board, execution controls and editor are reachable by portrait scrolling without overflow; reduced motion is respected (cooperative board intentionally not sticky)');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  try {
    for (const viewport of report.viewports) {
      const label = viewport.touch ? 'touch-' + viewport.width : 'desktop';
      report.currentViewport = label;
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch, reducedMotion: viewport.touch ? 'reduce' : 'no-preference' });
      if (traceEnabled) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      await context.addInitScript(ids => {
        if (sessionStorage.getItem('routinebot-coop-access')) return;
        localStorage.setItem('routinebot-save-v1', JSON.stringify({ version: 2, currentLevel: 'coop-gate', completed: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, true])), unlocked: ids, programs: {}, settings: { speed: 4, muted: true } }));
        sessionStorage.setItem('routinebot-coop-access', '1');
      }, catalog.map(l => l.id));
      const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(base + 'routine_bot/routine_bot.html'); await page.waitForFunction(() => window.render_game_to_text);
      try { await timingAndTutorial(page, label, viewport.touch); await stages(page, label, viewport.touch); }
      catch (error) { await capture(page, label + '-failure'); throw error; }
      finally { if (traceEnabled) await context.tracing.stop({ path: path.join(output, label + '-trace.zip') }); await context.close(); }
    }
    assert.deepEqual(report.errors, []); pass('No browser console or page errors'); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
  finally { report.finished = new Date().toISOString(); write(); await browser.close(); }
})();
