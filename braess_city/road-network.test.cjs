const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('./road-network.js');
const Classic = require('./traffic-engine.js');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (tolerance ${tolerance})`);
function validate(c, flows, tolerance = 2e-6) {
  c = N.config(c); const map = N.getMap(c.mapId), result = N.costs(c, flows);
  assert.equal(flows.length, map.routes.length); assert(flows.every(f => Number.isFinite(f) && f >= 0));
  near(flows.reduce((n, f) => n + f, 0), c.demand, tolerance);
  for (let i = 0; i < flows.length; i++) if (!result.available.includes(i)) assert.equal(flows[i], 0);
  for (let e = 0; e < map.edges.length; e++) if (c.closed.includes(map.edges[e].id)) assert.equal(result.edges[e], 0);
  for (const node of map.nodes) {
    const incoming = map.edges.reduce((n, e, i) => n + (e.to === node.id ? result.edges[i] : 0), 0);
    const outgoing = map.edges.reduce((n, e, i) => n + (e.from === node.id ? result.edges[i] : 0), 0);
    near(outgoing - incoming, node.id === map.source ? c.demand : node.id === map.sink ? -c.demand : 0, tolerance);
  }
  near(result.average, result.edges.reduce((n, f, i) => n + f * result.edgeTimes[i], 0) / c.demand, tolerance);
  return result;
}
function combinations(map) {
  const controls = map.edges.filter(e => e.controlled).map(e => e.id);
  return [0, 1, 2, 3].map(mask => controls.filter((_, i) => mask & (1 << i)));
}

test('four genuinely different directed networks expose complete stable routes within the mobile size budget', () => {
  assert.deepEqual(N.maps.map(m => m.id), ['river', 'ring', 'grid', 'double']);
  assert.deepEqual(N.maps.map(m => [m.nodes.length, m.edges.length, m.routes.length]), [[6, 8, 4], [7, 10, 6], [9, 12, 6], [7, 10, 9]]);
  for (const map of N.maps) {
    assert.equal(map.edges.filter(e => e.controlled).length, 2);
    assert.equal(new Set(map.nodes.map(n => n.id)).size, map.nodes.length);
    assert.equal(new Set(map.edges.map(e => e.id)).size, map.edges.length);
    assert(map.nodes.every(n => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1));
    assert(map.edges.every(e => map.nodes.some(n => n.id === e.from) && map.nodes.some(n => n.id === e.to) && e.a >= 0 && e.b >= 0));
    const enumerated = [];
    function visit(at, path, seen) {
      if (at === map.sink) { enumerated.push(path.join('|')); return; }
      for (const e of map.edges.filter(e => e.from === at)) if (!seen.has(e.to)) visit(e.to, [...path, e.id], new Set([...seen, e.to]));
    }
    visit(map.source, [], new Set([map.source]));
    assert.deepEqual(map.routes.map(r => r.edgeIds.join('|')).sort(), enumerated.sort());
  }
});

test('affine edge costs use the requested fixed-time scale and surcharge only on controlled edges', () => {
  for (const map of N.maps) {
    const c = N.config({ mapId: map.id, demand: 3000, fixed: 60, shortcut: 7 }), flows = map.routes.map(() => c.demand / map.routes.length), r = N.costs(c, flows);
    map.edges.forEach((e, i) => near(r.edgeTimes[i], e.a * r.edges[i] + e.b * 60 / 45 + (e.controlled ? 7 : 0)));
    map.routes.forEach((route, i) => near(r.times[i], route.edgeIds.reduce((n, id) => n + r.edgeTimes[map.edges.findIndex(e => e.id === id)], 0)));
    const tiny = .01, plus = [...flows], minus = [...flows]; plus[0] += tiny; plus[1] -= tiny; minus[0] -= tiny; minus[1] += tiny;
    near((N.potential(c, plus) - N.potential(c, minus)) / (2 * tiny), r.times[0] - r.times[1], 1e-5);
  }
});

test('equilibria satisfy flow conservation, closures and Wardrop across demand, cost and all four gate combinations', () => {
  for (const map of N.maps) for (const demand of [100, 500, 1000, 4000, 7000, 12000]) for (const fixed of [0, 20, 45, 70]) for (const shortcut of [0, 12, 30]) for (const closed of combinations(map)) {
    const c = { mapId: map.id, demand, fixed, shortcut, closed }, eq = N.equilibrium(c), r = validate(c, eq.flows);
    assert(eq.converged, JSON.stringify(c) + ' did not converge: ' + eq.gap);
    assert(r.gap <= N.TOLERANCE + 1e-9, JSON.stringify(c));
    const best = Math.min(...r.available.map(i => r.times[i]));
    for (const i of r.available) if (eq.flows[i] > 1e-7) near(r.times[i], best, 2e-6);
  }
});

test('each visible pairwise step conserves demand and lowers the convex routing potential', () => {
  for (const map of N.maps) for (const closed of combinations(map)) {
    const c = N.config({ mapId: map.id, demand: 4500, fixed: 37, shortcut: 8, closed });
    let flows = N.reroute(c, []), potential = N.potential(c, flows), converged = false;
    for (let i = 0; i < 2000; i++) {
      const result = N.step(c, flows), nextPotential = N.potential(c, result.flows); validate(c, result.flows);
      assert(nextPotential <= potential + 1e-7, `${map.id}: ${nextPotential} > ${potential}`);
      assert(result.moved >= 0); flows = result.flows; potential = nextPotential;
      if (result.settled) { converged = true; break; }
    }
    assert(converged, map.id); near(N.costs(c, flows).average, N.equilibrium(c).average, 5e-6);
  }
});

test('closing and reopening roads keeps total flow; disconnection is refused without mutating caller state', () => {
  for (const map of N.maps) {
    let c = N.config({ mapId: map.id }), flows = N.equilibrium(c).flows;
    for (const e of map.edges.filter(e => e.controlled)) {
      const snapshot = JSON.stringify({ c, flows }), changed = N.toggle(c, flows, e.id);
      assert(changed.ok); assert.equal(JSON.stringify({ c, flows }), snapshot); validate(changed.config, changed.flows);
      c = changed.config; flows = changed.flows;
    }
    for (const e of map.edges.filter(e => e.controlled)) {
      const changed = N.toggle(c, flows, e.id); assert(changed.ok); validate(changed.config, changed.flows); c = changed.config; flows = changed.flows;
    }
    // Only one edge leaves the source after these closures; closing the last must fail atomically.
    const exits = map.edges.filter(e => e.from === map.source).map(e => e.id);
    c = N.config({ mapId: map.id, closed: exits.slice(1) }); flows = N.equilibrium(c).flows;
    const snapshot = JSON.stringify({ c, flows }), refused = N.toggle(c, flows, exits[0]);
    assert.equal(refused.ok, false); assert.deepEqual(refused.config, c); assert.deepEqual(refused.flows, flows); assert.equal(JSON.stringify({ c, flows }), snapshot);
    const broken = { ...c, closed: exits }; assert.equal(N.reroute(broken, flows), null); assert.equal(N.equilibrium(broken).converged, false);
    assert.equal(N.toggle(c, flows, 'not-a-road').ok, false);
  }
});

test('series double network independently matches two untouched classic equilibria', () => {
  const controls = N.getMap('double').edges.filter(e => e.controlled).map(e => e.id);
  for (const demand of [1000, 4000, 7000, 12000]) for (const fixed of [20, 45, 70]) for (const shortcut of [0, 12, 30]) for (const closed of combinations(N.getMap('double'))) {
    const c = { mapId: 'double', demand, fixed, shortcut, closed }, expected = controls.reduce((n, id) => n + Classic.equilibrium({ demand, fixed, shortcut, open: !closed.includes(id) }).average, 0);
    near(N.equilibrium(c).average, expected, 3e-6);
  }
  assert.deepEqual(N.comparisons({ mapId: 'double' }).map(x => x.average), [160, 145, 145, 130]);
});

test('comparison holds demand, fixed times and surcharges constant; cache results and caller arrays cannot leak mutations', () => {
  for (const map of N.maps) {
    const c = N.config({ mapId: map.id, demand: 5300, fixed: 62, shortcut: 11 }), before = JSON.stringify(c), rows = N.comparisons(c);
    assert.equal(rows.length, 4); assert.equal(JSON.stringify(c), before);
    for (const row of rows) { const expected = N.equilibrium({ ...c, closed: row.closed }); assert(row.available && row.converged); near(row.average, expected.average); assert.deepEqual(row.flows, expected.flows); }
    assert.deepEqual(N.comparisons(c), rows);
    const first = N.equilibrium(c), pristine = structuredClone(first); first.flows.fill(-99); first.edges.fill(-99); first.available.length = 0;
    assert.deepEqual(N.equilibrium(c), pristine);
    let a = N.reroute(c, []), b = N.reroute(c, []); for (let i = 0; i < 20; i++) { a = N.step(c, a).flows; b = N.step(c, b).flows; } assert.deepEqual(a, b);
  }
});

test('configuration sanitizes invalid conditions and canonicalizes closures without mutating inputs', () => {
  const input = { mapId: 'missing', demand: NaN, fixed: Infinity, shortcut: -2, closed: ['not-a-road', 'middle-bridge', 'north-bridge', 'north-bridge'] };
  const c = N.config(input); assert.equal(c.mapId, 'river'); assert.equal(c.demand, 4000); assert.equal(c.fixed, 45); assert.equal(c.shortcut, 0); assert.deepEqual(c.closed, ['north-bridge', 'middle-bridge']); assert.equal(input.closed.length, 4);
  for (const missing of [null, undefined, '', ' ', false]) { assert.equal(N.config({ demand: missing }).demand, 4000); assert.equal(N.config({ fixed: missing }).fixed, 45); }
  assert.equal(N.config({ demand: -1 }).demand, 100); assert.equal(N.config({ demand: 1e20 }).demand, 1e6);
  assert.equal(N.config({ fixed: -3, shortcut: -4 }).fixed, 0); assert.equal(N.config({ fixed: 0 }).fixed, 0);
  for (const map of N.maps) validate({ mapId: map.id }, N.reroute({ mapId: map.id }, [NaN, -1, Infinity]));
});
