const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./ant-engine.js');
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
test('resource cycle conserves all five stocks, including sealed walls and manual input', () => {
  for (const mask of [0, 1, 2, 3]) {
    const s = E.create({ settings: { count: 20, supply: false } });
    for (let y = 0; y < 30; y++) E.setWall(s, y * 30 + 14, y * 30 + 15, mask);
    E.addPatch(s, 0, 50); E.addPatch(s, 899, 23);
    for (let i = 0; i < 900; i++) E.step(s);
    near(E.totals(s).total, 223); assert.equal(s.totalInput, 223);
    assert.ok(s.soil.every(c => c.org >= 0 && c.nit >= 0 && c.plant >= 0));
    assert.ok(s.ants.every(a => a.carryAmount >= 0));
  }
});
test('blocked diffusion stays at source; transport-only wall does not affect diffusion', () => {
  const plain = E.create(), transport = E.create(), sealed = E.create();
  for (const s of [plain, transport, sealed]) { s.soil.forEach(c => { c.org = c.nit = c.plant = 0; }); s.soil[465].nit = 100; }
  E.neighbors(465).forEach(n => { E.setWall(transport, 465, n, 1); E.setWall(sealed, 465, n, 2); });
  E.diffuse(plain); E.diffuse(transport); E.diffuse(sealed);
  assert.deepEqual(plain.soil, transport.soil); near(sealed.soil[465].nit, 100);
  E.neighbors(465).forEach(n => assert.equal(sealed.soil[n].nit, 0)); near(E.totals(sealed).available, 100);
});
test('pathfinding routes around transport wall, ignores diffusion-only wall, handles enclosure', () => {
  const s = E.create(); E.setWall(s, 464, 465, 1);
  const detour = E.path(s, 464, 465); assert.equal(detour.length, 4); assert.ok(detour.every((c, i) => !i || !E.blocked(s, detour[i - 1], c, 1)));
  E.setWall(s, 464, 465, 2); assert.deepEqual(E.path(s, 464, 465), [464, 465]);
  E.neighbors(464).forEach(n => E.setWall(s, 464, n, 3)); assert.deepEqual(E.path(s, 464, 465), []);
});
test('carrying ant remains on its side of a new wall, resumes after opening, deposits exactly', () => {
  const s = E.create({ nest: 465, settings: { count: 10, supply: false } });
  const a = s.ants[0]; Object.assign(a, { x: 14.7, y: 15.5, waypoint: 465, carryAmount: 5, goal: 465 });
  E.neighbors(464).forEach(n => E.setWall(s, 464, n, 1));
  for (let i = 0; i < 100; i++) E.moveAnt(s, a);
  assert.equal(a.mode, '막힘'); assert.equal(a.x, 14.5); assert.equal(a.carryAmount, 5);
  const before = s.soil[465].org; E.setWall(s, 464, 465, 0);
  for (let i = 0; i < 15; i++) E.moveAnt(s, a);
  assert.equal(a.carryAmount, 0); near(s.soil[465].org - before, 5); assert.equal(s.delivered, 5);
});
test('seed and interventions replay exactly; rendering and viewport are absent from engine', () => {
  const a = E.create({ seed: 119, preset: 'transport', settings: { count: 20 } }), b = E.create({ seed: 119, preset: 'transport', settings: { count: 20 } });
  for (const s of [a, b]) { E.addPatch(s, 250, 100); for (let i = 0; i < 300; i++) E.step(s); E.setWall(s, 465, 466, 3); for (let i = 0; i < 300; i++) E.step(s); }
  assert.deepEqual(a, b); assert.notDeepEqual(E.create({ seed: 120 }).ants, E.create({ seed: 119 }).ants);
});
test('manual placement validates cells and amount; outer edges cannot wrap rows', () => {
  const s = E.create(); const before = E.totals(s);
  assert.equal(E.addPatch(s, s.nest, 50), false); assert.equal(E.addPatch(s, 1, NaN), false); assert.equal(E.addPatch(s, -1, 20), false); assert.equal(E.setWall(s, 29, 30, 1), false);
  assert.deepEqual(E.totals(s), before); E.addPatch(s, 0, 100); near(E.totals(s).total - before.total, 100); near(E.totals(s).food - before.food, 70); near(E.totals(s).organic - before.organic, 30);
});
test('automatic supply uses model steps and stops without changing conserved stock', () => {
  const s = E.create({ settings: { count: 10, interval: 1, amount: 20, supply: true } });
  for (let i = 0; i < 90; i++) E.step(s); near(s.totalInput, 120); s.settings.supply = false;
  for (let i = 0; i < 90; i++) E.step(s); near(s.totalInput, 120); near(E.totals(s).total, 120);
});

test('maze and branching maps connect every cell, retain seeded initial populations and conserve resources',()=>{const open=E.create({seed:73,settings:{count:20,supply:false}});for(const preset of['maze','branches']){const a=E.create({seed:73,preset,settings:{count:20,supply:false}}),b=E.create({seed:73,preset,settings:{count:20,supply:false}});assert.deepEqual(a.ants,open.ants);assert.deepEqual(a.foods,open.foods);assert.equal(E.totals(a).input,E.totals(open).input);assert.ok(Object.keys(a.walls).length>50);assert.ok(Object.values(a.walls).every(mask=>mask===(preset==='maze'?3:1)));for(let cell=0;cell<900;cell++)assert.ok(E.path(a,cell,a.nest).length>0,'connected cell '+cell);assert.ok(E.path(a,0,29).length>E.path(open,0,29).length);for(let i=0;i<180;i++){E.step(a);E.step(b);}assert.ok(Math.abs(E.totals(a).error)<1e-7);assert.deepEqual(a,b);}});
