const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, profiles, createBlindServer } = require('./routine-bot-blind-env.cjs');
test('access fixture grants only target access, with no programs or success', () => {
  for (const id of ['wait-beat', 'condition-fork', 'coop-finale']) {
    const value = fixture(id);
    assert.equal(value.currentLevel, id);
    assert.deepEqual(value.unlocked, ['wait-beat', 'condition-fork', 'coop-finale']);
    for (const key of ['completed', 'programs', 'records', 'challenges']) assert.deepEqual(value[key], {});
  }
  assert.throws(() => fixture('other'));
  assert.equal(profiles.filter(p => p.hasTouch && p.isMobile).length, 2);
});
test('isolated entry serves normal assets and rejects unknown stages', async t => {
  const server = createBlindServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(origin + '/blind-play?level=condition-fork')).text();
  assert.match(html, /<base href="\/WebSim\/routine_bot\/">/);
  assert.match(html, /localStorage.getItem\('routinebot-save-v1'\)===null/);
  assert.match(html, /"currentLevel":"condition-fork"/);
  assert.equal((await fetch(origin + '/blind-play?level=other')).status, 400);
  const production = await (await fetch(origin + '/WebSim/routine_bot/routine_bot.html')).text();
  assert.doesNotMatch(production, /localStorage.setItem/);
  assert.equal((await fetch(origin + '/WebSim/routine_bot/storage.js')).status, 200);
});
