const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./music-engine.js');
test('same seed yields the same songs, arrivals and world histories', () => { assert.deepEqual(E.run(E.create()), E.run(E.create())); });
test('counterfactual conditions retain song qualities and audience profiles', () => {
  const a = E.create({ mode: 'independent' }), b = E.create({ mode: 'ranked' });
  assert.deepEqual(a.songs, b.songs); E.run(a, 10); E.run(b, 10);
  for (let i = 0; i < 4; i++) assert.deepEqual(a.worlds[i].last.taste, b.worlds[i].last.taste);
});
test('one listener picks one of exactly three distinct exposed songs in each world', () => {
  const s = E.create();
  for (let i = 0; i < 50; i++) { E.step(s); for (const w of s.worlds) { assert.equal(new Set(w.last.candidates).size, 3); assert(w.last.candidates.includes(w.last.selected)); assert.equal(w.counts.reduce((a, b) => a + b), i + 1); assert.equal(w.exposures.reduce((a, b) => a + b), (i + 1) * 3); } }
});
test('promotion guarantees exposure for 20 listeners and leaves other worlds unchanged', () => {
  const a = E.create(), b = E.create(); E.promote(a, 1, 7);
  assert.equal(E.promote(a, 1, 3), false);
  for (let i = 0; i < 20; i++) { E.step(a); E.step(b); assert(a.worlds[1].last.candidates.includes(7)); }
  assert.equal(a.worlds[1].promotion, null);
  for (const i of [0, 2, 3]) assert.deepEqual(a.worlds[i], b.worlds[i]);
  assert.equal(a.worlds[1].exposures[7], 20);
});
test('independent mode ignores social influence, while visible mode with zero influence matches it', () => {
  const a = E.run(E.create({ mode: 'independent', influence: 1.5 }));
  const b = E.run(E.create({ mode: 'visible', influence: 0 }));
  assert.deepEqual(a.worlds, b.worlds);
});
test('end boundary is stable and comparison is reproducible', () => {
  const s = E.run(E.create()); const before = E.stats(s);
  assert.equal(E.step(s), false); assert.equal(E.promote(s, 0, 0), false); assert.deepEqual(E.stats(s), before);
  assert.deepEqual(E.compare({ seed: 51 }), E.compare({ seed: 51 }));
});
