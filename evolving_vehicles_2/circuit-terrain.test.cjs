'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Terrain = require('./circuit-terrain.js');
const Race = require('./race-engine.js');
const Environment = require('./track-environment.js');
const circuits = require('./circuits.js');
const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function edgesFor(track) {
  const pts = track.points, half = track.width / 2, curb = Math.min(1.1, track.width * .065), step = pts.length > 1300 ? 2 : 1;
  const edges = [];
  for (let i = 0; i < pts.length; i += step) {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length], p = pts[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    const at = d => ({ x: p.x - (b.y - a.y) / length * d, y: p.y + (b.x - a.x) / length * d, z: p.z });
    edges.push({ outerLeft: at(-half - curb), left: at(-half), right: at(half), outerRight: at(half + curb) });
  }
  return edges;
}
function fixture() {
  // Two parallel legs only 30 m apart, with a 30 m height difference. The
  // nearest-road field jumps at y=15; the coarse grid used to cut across roads.
  const track = { width: 12, bounds: { minX: 0, maxX: 120, minY: 0, maxY: 30 }, points: [
    { x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, { x: 80, y: 0, z: 0 }, { x: 120, y: 0, z: 0 },
    { x: 120, y: 30, z: 30 }, { x: 80, y: 30, z: 30 }, { x: 40, y: 30, z: 30 }, { x: 0, y: 30, z: 30 }
  ] };
  const edges = edgesFor(track), options = { groundHeight: (x, y) => y < 15 ? -.07 : 29.93 };
  return { track, edges, options };
}
const fixtureData = fixture(), fixtureTerrain = Terrain.build(fixtureData.track, fixtureData.edges, fixtureData.options);

test('terrain module works as a script tag and rejects missing or unbounded geometry', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./circuit-terrain.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.CircuitTerrain.build, 'function');
  assert.throws(() => Terrain.build({}, []), /track/);
  assert.throws(() => Terrain.build(fixtureData.track, fixtureData.edges), /groundHeight/);
  assert.throws(() => Terrain.build(fixtureData.track, [], { groundHeight: () => NaN }), /finite/);
  assert.throws(() => Terrain.build(fixtureData.track, [], { groundHeight: () => 0, bounds: { minX: 0, maxX: 1e8, minY: 0, maxY: 1e8 } }), /budget/);
});

test('grid sampling interpolates the actual triangle rather than resampling an unrelated height function', () => {
  const groundHeight = (x, y) => x * x * .01 + y * y * .02;
  const model = Terrain.build(fixtureData.track, [], { groundHeight });
  const x = model.bounds.minX + .7 * model.grid.cell, y = model.bounds.minY + .3 * model.grid.cell;
  assert.ok(Math.abs(model.sampleHeight(x, y) - model.sampleBaseHeight(x, y)) < 1e-9);
  assert.ok(Math.abs(model.sampleHeight(x, y) - (groundHeight(x, y) - .22)) > 1, 'nonlinear source height is not the rendered triangle surface');
  assert.equal(model.sampleHeight(model.bounds.minX - 10, y), null);
});

test('nearby high and low road corridors stay clear while connected banks fill the space between them', () => {
  const model = fixtureTerrain;
  assert.ok(model.stats.bankFaces > 0); assert.ok(model.stats.underlayFaces > 0);
  assert.ok(model.sampleBaseHeight(60, 30) < 25, 'fixture exposes coarse-grid terrain leaving the high road unsupported');
  for (let x = 35; x <= 85; x += 2.5) for (const y of [-6, -3, 0, 3, 6, 24, 27, 30, 33, 36]) {
    const road = model.roadHeight(x, y), height = model.sampleHeight(x, y);
    assert.notEqual(road, null); assert.notEqual(height, null);
    assert.ok(height <= road - .06, `terrain must be below both road legs: ${x},${y}`);
    assert.ok(Math.abs(height - (road - model.clearanceM)) < 1e-6);
  }
  for (let x = 30; x <= 90; x += 5) for (let y = -10; y <= 40; y += .5)
    assert.ok(Number.isFinite(model.sampleHeight(x, y)), `no sky hole between the road and terrain at ${x},${y}`);
  for (const face of model.faces.filter(f => f.kind === 'terrain-bank')) {
    for (const weights of [[.333, .333, .334], [.1, .45, .45], [.45, .1, .45], [.45, .45, .1]]) {
      const p = face.vertices.reduce((p, v, i) => ({ x: p.x + v.x * weights[i], y: p.y + v.y * weights[i] }), { x: 0, y: 0 });
      assert.equal(model.roadHeight(p.x, p.y), null, 'sloping banks never span either road footprint');
    }
  }
});

test('bank and underlay vertices share heights and form a finite closed envelope', () => {
  const model = fixtureTerrain, heights = new Map(), edges = new Map();
  const key = p => [p.x, p.y, p.z].map(v => Math.round(v * 1e5)).join(',');
  for (const face of model.faces) {
    assert.equal(face.vertices.length, 3); assert.equal(face.estimated, true);
    assert.ok(!['retaining-wall', 'guardrail'].includes(face.kind));
    for (let i = 0; i < 3; i++) {
      const a = face.vertices[i], b = face.vertices[(i + 1) % 3];
      assert.ok(Number.isFinite(a.x + a.y + a.z));
      const edge = [key(a), key(b)].sort().join('|'); edges.set(edge, (edges.get(edge) || 0) + 1);
      if (['terrain-base', 'terrain-boundary'].includes(face.kind)) continue;
      const xy = [a.x, a.y].map(v => Math.round(v * 1e5)).join(',');
      if (heights.has(xy)) assert.ok(Math.abs(a.z - heights.get(xy)) < 1e-6, 'shared vertices have a single terrain height');
      heights.set(xy, a.z);
    }
  }
  // Boundary strips and the base may have harmless collinear T-junctions at
  // the far perimeter, but the entire road-connected top must be closed.
  const open = [...edges].filter(([edge, count]) => count === 1).map(([edge]) => edge);
  const roadOpen = open.filter(edge => edge.split('|').some(s => { const [x, y] = s.split(',').map(Number); return x > -100e5 && x < 200e5 && y > -100e5 && y < 130e5; }));
  assert.equal(roadOpen.length, 0, 'no unmatched edge around the road corridor');
  assert.ok(model.faces.some(f => f.kind === 'terrain-base'));
});

test('terrain construction is deterministic and never mutates track or road vertices', () => {
  const before = JSON.stringify(fixtureData);
  const second = Terrain.build(fixtureData.track, fixtureData.edges, fixtureData.options);
  assert.deepEqual(second.faces, fixtureTerrain.faces); assert.deepEqual(second.stats, fixtureTerrain.stats);
  assert.equal(JSON.stringify(fixtureData), before);
});

test('Taebaek relief uses the display heights once and keeps sampled road triangles above terrain', t => {
  const track = Race.buildTrack(circuits.find(c => c.id === 'taebaek'));
  const before = JSON.stringify(track), datum = track.elevationMin;
  const display = { ...track, points: track.points.map(p => ({ ...p, z: datum + (p.z - datum) * 1.75 })) };
  const env = Environment.build(display, 'taebaek', { coordinateSystem: 'local-metres', features: [] }, { backgroundVegetation: false });
  const model = Terrain.build(display, edgesFor(display), { groundHeight: env.groundHeight });
  const surfaces = model.faces.filter(f => !['terrain-base', 'terrain-boundary'].includes(f.kind));
  for (const face of surfaces) {
    const p = face.vertices.reduce((s, v) => ({ x: s.x + v.x / 3, y: s.y + v.y / 3, z: s.z + v.z / 3 }), { x: 0, y: 0, z: 0 });
    const road = model.roadHeight(p.x, p.y);
    if (road !== null) assert.ok(p.z < road - .04, 'grid and bank surfaces do not intrude into the actual graded road');
    assert.ok(cross(...face.vertices) >= -1e-6, 'surface triangle winding stays upward');
  }
  for (const p of display.points) assert.ok(Number.isFinite(model.sampleHeight(p.x, p.y)), 'every road center is supported');
  assert.equal(JSON.stringify(track), before);
  assert.ok(model.faces.length < 50000, 'terrain stays bounded for the real course');
  t.diagnostic(JSON.stringify(model.stats));
});
