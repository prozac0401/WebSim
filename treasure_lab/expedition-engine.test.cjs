const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./expedition-engine.js');
test('policies receive identical terrain, initial supplies, resource field and indexed randomness', () => {
  const s = E.create();
  assert.deepEqual(s.worlds.map(w => w.agents.map(a => [a.cell, a.budget])), Array(3).fill(s.worlds[0].agents.map(a => [a.cell, a.budget])));
  assert.deepEqual(s.worlds[0].remaining, s.worlds[1].remaining);
  const a = E.run(E.create()), b = E.run(E.create()); assert.deepEqual(a, b);
});
test('river is blocked, bridges permit a continuous costed route, island has unreachable land', () => {
  const s = E.create(); assert.equal(E.preview(s, 0, 0, 5).reachable, false);
  const p = E.preview(s, 0, 0, 22); assert.ok(p.affordable); assert.ok(p.path.some(c => s.terrain[c] === 'bridge'));
  assert.equal(p.days, p.path.slice(1).reduce((n, c) => n + E.costOf(s.terrain[c]), 0));
  for (let i = 1; i < p.path.length; i++) assert.equal(Math.abs(p.path[i] % 12 - p.path[i - 1] % 12) + Math.abs(Math.floor(p.path[i] / 12) - Math.floor(p.path[i - 1] / 12)), 1);
  assert.equal(E.preview(E.create({ expeditionMap: 'island' }), 0, 0, 22).reachable, false);
});
test('adjacent order spends one travel day then one mining day and reveals no resources in transit', () => {
  const s = E.create(), from = s.worlds[0].agents[0].cell, to = from - 12;
  assert.equal(E.order(s, to, 0), true); E.step(s);
  for (const w of s.worlds) { assert.equal(w.agents[0].cell, to); assert.equal(w.agents[0].earned, 0); assert.equal(w.agents[0].budget, 41); assert.equal(to in w.visited, false); }
  E.step(s); for (const w of s.worlds) { assert.ok(to in w.visited); assert.ok(w.agents[0].earned > 0); assert.equal(w.agents[0].budget, 40); }
});
test('mountain entry requires three paid days and does not teleport or mine early', () => {
  const s = E.create({ expeditionMap: 'passes' });
  s.worlds.forEach(w => { const a = w.agents[0]; a.cell = 4 * 12 + 5; a.known = { [a.cell]: 1 }; });
  const to = 4 * 12 + 6; assert.equal(E.preview(s, 0, 0, to).days, 3); E.order(s, to);
  E.step(s); assert.equal(s.worlds[0].agents[0].cell, to - 1);
  E.step(s); assert.equal(s.worlds[0].agents[0].cell, to - 1);
  E.step(s); assert.equal(s.worlds[0].agents[0].cell, to); assert.equal(s.worlds[0].agents[0].earned, 0);
  E.step(s); assert.ok(s.worlds[0].agents[0].earned > 0);
});
test('cost preview contains no hidden resource value and refuses unaffordable or blocked orders', () => {
  const s = E.create({ budget: 1 }); assert.equal(E.preview(s, 0, 0, 22).knownReward, null);
  assert.equal(E.order(s, 22), false); assert.equal(E.order(s, 5), false);
  E.run(s); assert.ok(s.worlds.every(w => w.agents.every(a => a.budget === 0)));
  const before = structuredClone(s); assert.equal(E.step(s), false); assert.deepEqual(s, before);
});
test('selected agent receives the same destination in each policy, reset restores its budget and journey', () => {
  const s = E.create(), target = 3 * 12 + 2;
  E.order(s, target, 3); E.step(s); assert.ok(s.worlds.every(w => w.agents[3].target === target));
  const clean = E.create(s.config); assert.equal(clean.day, 0); assert.equal(clean.interventions.length, 0); assert.ok(clean.worlds.every(w => w.agents.every(a => a.budget === 42 && a.journey.length === 1)));
});
test('unobserved resource values cannot affect planning or public route preview', () => {
  const a = E.create(), b = E.create();
  const observed = new Set(Object.keys(a.worlds[0].visited).map(Number));
  b.field = b.field.map((value, cell) => observed.has(cell) ? value : value + 10000);
  assert.deepEqual(E.preview(a, 0, 0, 22), E.preview(b, 0, 0, 22));
  E.step(a); E.step(b);
  assert.deepEqual(a.worlds.map(w => w.agents.map(x => ({ cell: x.cell, target: x.target, route: x.route }))), b.worlds.map(w => w.agents.map(x => ({ cell: x.cell, target: x.target, route: x.route }))));
});

for (const kind of ['meander', 'ring']) {
  test(kind + ' has valid starts, reachable prospects, reproducible 60-day policies and no hidden planning advantage', () => {
    const a = E.create({ expeditionMap: kind }), b = E.create({ expeditionMap: kind });
    assert.deepEqual(a.worlds.map(w => w.agents.map(x => [x.cell, x.budget])), Array(3).fill(a.worlds[0].agents.map(x => [x.cell, x.budget])));
    for (const w of a.worlds) for (const agent of w.agents) assert.equal(a.terrain[agent.cell], 'plain');
    for (const target of a.prospects) { const p = E.preview(a, 0, 0, target); assert(p.reachable); assert.equal(p.days, p.path.slice(1).reduce((n, i) => n + E.costOf(a.terrain[i]), 0)); }
    const hidden = structuredClone(a), known = new Set(Object.keys(a.worlds[0].visited).map(Number));
    hidden.field = hidden.field.map((v, i) => known.has(i) ? v : v + 10000);
    E.step(a); E.step(hidden);
    assert.deepEqual(a.worlds.map(w => w.agents.map(x => x.target)), hidden.worlds.map(w => w.agents.map(x => x.target)));
    E.run(a); E.run(b); assert.deepEqual(a, b); assert.equal(a.day, 60);
    assert(a.worlds.every(w => w.agents.every(x => x.budget === 0 && Number.isFinite(E.costOf(a.terrain[x.cell])))));
  });
}
test('new geography changes routes and exposes only three bridges or four ring passes', () => {
  const river = E.create(), meander = E.create({ expeditionMap: 'meander' }), ring = E.create({ expeditionMap: 'ring' });
  assert.equal(meander.terrain.filter(v => v === 'bridge').length, 3);
  assert.equal(ring.terrain.filter(v => v === 'pass').length, 4);
  assert.notEqual(E.preview(river, 0, 0, 66).days, E.preview(meander, 0, 0, 66).days);
  const intoRing = E.preview(ring, 0, 0, 55); assert(intoRing.path.some(i => ring.terrain[i] === 'pass'));
  assert.notEqual(E.preview(river, 0, 0, 55).days, intoRing.days);
});
