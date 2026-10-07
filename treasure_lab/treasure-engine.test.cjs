const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./treasure-engine.js');
test('same seed and interventions reproduce every policy exactly', () => {
  const a = E.create(), b = E.create();
  E.order(a, 18); E.order(b, 18); E.run(a); E.run(b);
  assert.deepEqual(a, b);
  assert.equal(a.day, 100);
});
test('all policies start on identical terrain and use distinct knowledge objects', () => {
  const s = E.create();
  assert.deepEqual(s.worlds[0].agents.map(a => a.cell), s.worlds[2].agents.map(a => a.cell));
  assert.equal(Object.keys(s.worlds[0].agents[0].known).length, 6);
  assert.equal(Object.keys(s.worlds[2].agents[0].known).length, 1);
  s.worlds[0].agents[0].known[0] = 50;
  assert.equal(s.worlds[0].agents[1].known[0], undefined);
});
test('periodic information transfer occurs only at the configured boundary', () => {
  const s = E.create({ period: 4 });
  E.order(s, 0); E.step(s);
  assert.equal(s.worlds[1].agents[1].known[0], undefined);
  E.run(s, 3);
  for (const a of s.worlds[1].agents) assert.equal(a.known[0], s.field[0]);
  assert.equal(s.worlds[1].lastShared, 4);
});
test('a player order applies to the same first agent in all three worlds', () => {
  const s = E.create(); E.order(s, 3); E.step(s);
  for (const w of s.worlds) { assert.equal(w.agents[0].cell, 3); assert.equal(w.agents[0].action, '지정 시추'); }
  assert.equal(s.order, null); assert.equal(s.interventions.length, 1);
  assert.equal(E.order(s, -1), false);
});
test('depletion lowers stock; no depletion leaves stock unchanged', () => {
  const a = E.create({ terrain: 'depleting' }), b = E.create({ terrain: 'hidden' });
  E.run(a, 25); E.run(b, 25);
  assert(a.worlds.every(w => w.remaining.some(v => v < 1)));
  assert(b.worlds.every(w => w.remaining.every(v => v === 1)));
  assert(a.worlds.every(w => w.remaining.every(v => v >= .02 && v <= 1)));
});
test('a day total equals the six recorded receipts and simulation stops at its horizon', () => {
  const s = E.create(); E.step(s);
  for (const w of s.worlds) assert.equal(w.total, w.agents.reduce((n, a) => n + a.earned, 0));
  E.run(s); const result = E.summary(s); assert.equal(E.step(s), false); assert.deepEqual(E.summary(s), result);
});
test('teaching scenarios demonstrate a sharing benefit and a discovery trade-off under the same agent rule', () => {
  const complex = E.summary(E.run(E.create({ seed: 4, terrain: 'hidden', exploration: .35 })));
  const simple = E.summary(E.run(E.create({ seed: 7319, terrain: 'simple', exploration: .5 })));
  assert(complex[1].best > complex[0].best);
  assert(complex[1].total > complex[0].total);
  assert(simple[0].total > simple[1].total && simple[0].total > simple[2].total);
});
