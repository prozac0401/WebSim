'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Road = require('./circuit-road.js'), Pose = require('./driving-pose.js');
const Race = require('./race-engine.js'), Terrain = require('./circuit-terrain.js'), circuits = require('./circuits.js');
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const cases = circuits.map(circuit => {
  const track = Race.buildTrack(circuit), snapshot = JSON.stringify(track);
  track.points.forEach(Object.freeze); Object.freeze(track.points); Object.freeze(track);
  return { circuit, track, road: Road.build(track), snapshot };
});
function legacyEdges(track) {
  const points = track.points, edges = [], half = track.width / 2, outer = half + Math.min(1.1, track.width * .065), step = points.length > 1300 ? 2 : 1;
  for (let i = 0; i < points.length; i += step) {
    const p = points[i], a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length], norm = Math.hypot(b.x - a.x, b.y - a.y);
    const at = d => ({ x: p.x - (b.y - a.y) / norm * d, y: p.y + (b.x - a.x) / norm * d, z: p.z });
    edges.push({ p, s: i * track.centerlineSpacing, index: i, left: at(-half), right: at(half), outerLeft: at(-outer), outerRight: at(outer) });
  }
  return edges;
}
function maximumTurn(edges, from = -Infinity, to = Infinity) {
  let maximum = 0;
  for (let i = 0; i < edges.length; i++) {
    const a = edges[(i + edges.length - 1) % edges.length], b = edges[i], c = edges[(i + 1) % edges.length];
    if (b.s < from || b.s > to) continue;
    for (const side of ['outerLeft', 'outerRight']) maximum = Math.max(maximum, Math.abs(wrap(Math.atan2(c[side].y - b[side].y, c[side].x - b[side].x) - Math.atan2(b[side].y - a[side].y, b[side].x - a[side].x))));
  }
  return maximum * 180 / Math.PI;
}
function foldedQuads(edges) {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i], b = edges[(i + 1) % edges.length], quad = [a.outerLeft, b.outerLeft, b.outerRight, a.outerRight];
    const turns = quad.map((p, j) => cross(p, quad[(j + 1) % 4], quad[(j + 2) % 4]));
    if (!turns.every(v => v > 1e-10) && !turns.every(v => v < -1e-10)) count++;
  }
  return count;
}
function chordError(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy, p.z - a.z - t * dz);
}

test('road module supports script tags, validates geometry and requires the shared pose module', () => {
  const source = fs.readFileSync(require.resolve('./circuit-road.js'), 'utf8'), sandbox = { window: { DrivingPose: Pose } };
  vm.runInNewContext(source, sandbox); assert.equal(typeof sandbox.window.CircuitRoad.build, 'function');
  const missing = { window: {} }; vm.runInNewContext(source, missing);
  assert.throws(() => missing.window.CircuitRoad.build(cases[0].track), /driving-pose/);
  for (const track of [null, {}, { ...cases[0].track, width: NaN }, { ...cases[0].track, centerlineLength: 200000 },
    { ...cases[0].track, points: [{ x: 0, y: 0, z: NaN }, { x: 4, y: 0 }, { x: 0, y: 4 }] }]) assert.throws(() => Road.build(track), /finite/);
});

test('all eleven courses preserve physics data, road width, analytic normals and seam coordinates', () => {
  assert.equal(cases.length, 11);
  for (const { circuit, track, road, snapshot } of cases) {
    assert.equal(JSON.stringify(track), snapshot, circuit.id + ': original track, heights and racing line remain untouched');
    assert.equal(road.points.length, road.edges.length); assert.equal(road.edges[0].s, 0);
    for (let i = 0; i < road.edges.length; i++) {
      const e = road.edges[i]; assert.equal(road.points[i], e.p);
      if (i) assert.ok(e.s > road.edges[i - 1].s); assert.ok(e.s < track.centerlineLength);
      assert.ok(Math.abs(distance(e.left, e.right) - track.width) < 1e-9, circuit.id + ': unchanged asphalt width');
      for (const side of ['left', 'right', 'outerLeft', 'outerRight']) {
        const q = e[side]; assert.ok(Number.isFinite(q.x + q.y + q.z)); assert.equal(q.z, e.p.z);
        assert.ok(Math.abs((q.x - e.p.x) * Math.cos(e.p.angle) + (q.y - e.p.y) * Math.sin(e.p.angle)) < 1e-9, circuit.id + ': shared analytic normal');
      }
    }
    const a = road.sample(0), b = road.sample(track.centerlineLength);
    assert.ok(distance(a, b) < 1e-10); assert.ok(Math.abs(wrap(a.angle - b.angle)) < 1e-10);
    assert.ok(road.stats.originOffsetM < .4, circuit.id + ': source timing line stays inside the bounded road');
    if (road.stats.fallbackReason) continue;
    const before = road.sample(-.00001), after = road.sample(.00001);
    assert.ok(distance(before, after) < .0001); assert.ok(Math.abs(wrap(after.angle - before.angle)) < .0001);
    assert.equal(foldedQuads(road.edges), 0, circuit.id + ': no reversed or collapsed local road strips');
    assert.ok(maximumTurn(road.edges) < 3, circuit.id + ': outer boundary stays smooth');
    assert.ok(road.edges.length < track.points.length * 2, circuit.id + ': adaptive budget avoids uniformly multiplying every road cell');
    assert.ok(road.stats.maximumSpanM > 7.5 && road.stats.maximumSpanM <= 8 + 1e-8, circuit.id + ': straights retain long spans');
  }
});

test('Taebaek and Spa T1 replace coarse corner facets with sub-three-degree boundaries', t => {
  const reports = [];
  for (const [id, from, to] of [['taebaek', 480, 580], ['spa', 180, 300]]) {
    const { track, road } = cases.find(c => c.circuit.id === id), before = maximumTurn(legacyEdges(track), from, to), after = maximumTurn(road.edges, from, to);
    assert.equal(road.stats.method, 'adaptive-c2-centreline'); assert.ok(before > 20); assert.ok(after < 3 && after < before * .15);
    let maximumError = 0;
    for (let i = 0; i < road.edges.length; i++) {
      const a = road.edges[i], b = road.edges[(i + 1) % road.edges.length], end = i + 1 < road.edges.length ? b.s : track.centerlineLength;
      if (a.s < from || a.s > to) continue;
      for (let j = 1; j < 16; j++) {
        const p = road.sample(a.s + (end - a.s) * j / 16), outer = track.width / 2 + Math.min(1.1, track.width * .065);
        for (const [side, offset] of [['outerLeft', -outer], ['outerRight', outer]]) {
          const q = { x: p.x - Math.sin(p.angle) * offset, y: p.y + Math.cos(p.angle) * offset, z: p.z };
          maximumError = Math.max(maximumError, chordError(q, a[side], b[side]));
        }
      }
      if (Math.abs(a.p.curvature) > .04) assert.ok(end - a.s <= 1.01, id + ': tight bends receive sub-metre sampling');
    }
    assert.ok(maximumError < .03, id + ': dense independent curve probes stay within 3 cm of the ribbon boundary');
    reports.push({ id, beforeDeg: +before.toFixed(3), afterDeg: +after.toFixed(3), chordErrorM: +maximumError.toFixed(4), edges: road.edges.length });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('Pocheon explicitly preserves the prior whole-course ribbon when fixed-width offsets would reverse', () => {
  const { track, road } = cases.find(c => c.circuit.id === 'pocheon'), original = legacyEdges(track);
  assert.equal(road.stats.method, 'legacy-offset-fallback'); assert.equal(road.stats.fallbackReason, 'source-turn-tighter-than-road-width');
  assert.ok(road.stats.maximumOffsetCurvature > 1); assert.equal(road.edges.length, original.length);
  for (let i = 0; i < original.length; i++) for (const side of ['p', 'left', 'right', 'outerLeft', 'outerRight']) assert.ok(distance(road.edges[i][side], original[i][side]) < 1e-10);
  assert.equal(foldedQuads(road.edges), foldedQuads(original)); assert.equal(foldedQuads(original), 3, 'document the imported width/turn conflict rather than claiming it was fixed');
});

test('road sampling uses centreline distance even when race length describes a shorter racing line', () => {
  const { track, road } = cases.find(c => c.circuit.id === 'taebaek');
  const other = Road.build({ ...track, length: track.racingLine.length, spacing: track.racingLine.spacing });
  assert.deepEqual(other.edges, road.edges);
});

test('terrain underlay and road ribbon consume exactly the same adaptive edges', () => {
  const radius = 50, count = 80, points = Array.from({ length: count }, (_, i) => ({ x: radius * Math.cos(i * 2 * Math.PI / count), y: radius * Math.sin(i * 2 * Math.PI / count), z: 4 }));
  const track = { points, width: 12, length: radius * Math.PI * 2, hasElevation: true, bounds: { minX: -radius, maxX: radius, minY: -radius, maxY: radius } };
  const road = Road.build(track), terrain = Terrain.build(track, road.edges, { groundHeight: () => 0 });
  assert.equal(terrain.stats.roadTriangles, road.edges.length * 6);
  for (let i = 0; i < road.edges.length; i += 7) {
    const e = road.edges[i];
    assert.ok(Math.abs(terrain.sampleHeight(e.p.x, e.p.y) - (e.p.z - .07)) < 1e-8, 'terrain closes exactly below the smoothed road');
  }
});
