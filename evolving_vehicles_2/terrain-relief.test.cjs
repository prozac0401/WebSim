'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Terrain = require('./circuit-terrain.js');
const Race = require('./race-engine.js');
const Road = require('./circuit-road.js');
const Environment = require('./track-environment.js');
const circuits = require('./circuits.js');

function fixture(separation = 60) {
  const points = [{ x: 0, y: 0, z: 10 }, { x: 120, y: 0, z: 10 },
    { x: 120, y: separation, z: 40 }, { x: 0, y: separation, z: 40 }];
  const track = { width: 12, bounds: { minX: 0, maxX: 120, minY: 0, maxY: separation }, points };
  const edges = points.map((p, i) => {
    const a = points[(i + 3) % 4], b = points[(i + 1) % 4], length = Math.hypot(b.x - a.x, b.y - a.y);
    const at = d => ({ x: p.x - (b.y - a.y) / length * d, y: p.y + (b.x - a.x) / length * d, z: p.z });
    return { outerLeft: at(-7), left: at(-6), right: at(6), outerRight: at(7) };
  });
  return { track, edges, groundHeight: (x, y) => y < separation / 2 ? 9.93 : 39.93 };
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const xyzKey = p => [p.x, p.y, p.z].map(v => Math.round(v * 1e5)).join(',');
const top = f => !['terrain-base', 'terrain-boundary'].includes(f.kind);

test('absent relief preserves released geometry exactly, while an opt-in zero field still preserves road support', () => {
  const f = fixture(), model = Terrain.build(f.track, f.edges, { groundHeight: f.groundHeight });
  // Frozen before introducing the opt-in height field, including all vertex
  // heights, material, topology, ordering and the far-edge envelope.
  assert.equal(digest(model.faces), '215ddea645222f25c8abf9005ca3b0a126fee1b1f5eff280078bdb4c4a282d70');
  assert.equal(model.stats.relief, undefined);
  const zero = Terrain.build(f.track, f.edges, { groundHeight: f.groundHeight, relief: () => 0 });
  assert.equal(zero.heightAt, zero.sampleHeight, 'scenery receives the exact built surface sampler');
  for (let x = 30; x <= 90; x += 5) for (const y of [0, 60])
    assert.ok(Math.abs(zero.heightAt(x, y) - model.sampleHeight(x, y)) < 1e-6);
  assert.equal(zero.heightAt(60, -100), model.heightAt(60, -100));
});

test('relief uses display metres once and its public height field follows actual triangles rather than the analytic source', () => {
  const f = fixture(), groundHeight = (x, y) => 40 + x * x * .002 + y * y * .003;
  const flat = Terrain.build(f.track, [], { groundHeight }), samples = [];
  const model = Terrain.build(f.track, [], { groundHeight, relief(x, y, baseZ) {
    assert.equal(baseZ, groundHeight(x, y)); samples.push([x, y]); return 30;
  } });
  assert.equal(samples.length, (model.grid.columns + 1) * (model.grid.rows + 1));
  assert.equal(model.stats.relief.sampleCount, samples.length);
  assert.equal(model.stats.relief.minAppliedM, 30); assert.equal(model.stats.relief.maxAppliedM, 30);
  assert.equal(model.faces.length, flat.faces.length, 'relief adds no faces');
  for (let i = 0; i < model.faces.length; i++) for (let j = 0; j < 3; j++) {
    const p = model.faces[i].vertices[j], q = flat.faces[i].vertices[j];
    assert.equal(p.x, q.x); assert.equal(p.y, q.y); assert.ok(Math.abs(p.z - q.z - 30) < 1e-9);
  }
  const x = model.bounds.minX + model.grid.cell * .7, y = model.bounds.minY + model.grid.cell * .3;
  assert.ok(Math.abs(model.heightAt(x, y) - model.sampleBaseHeight(x, y)) < 1e-9);
  assert.ok(Math.abs(model.heightAt(x, y) - (groundHeight(x, y) + 30 - .22)) > .1,
    'trees/barriers must consume this sampler, not independently evaluate the nonlinear input');
});

test('road-distance blending respects every nearby and distant return leg, with exact low/high road support and closed seams', () => {
  for (const separation of [30, 240]) {
    const f = fixture(separation), before = JSON.stringify(f), base = Terrain.build(f.track, f.edges, { groundHeight: f.groundHeight });
    const model = Terrain.build(f.track, f.edges, { groundHeight: f.groundHeight, relief: () => 100, reliefRoadBlendM: 40 });
    assert.equal(JSON.stringify(f), before, 'track and road geometry are immutable');
    assert.ok(model.faces.length < base.faces.length * 6, 'refinement is bounded to the road shoulders');
    for (const face of model.faces.filter(f => f.kind === 'terrain-underlay')) {
      const p = face.vertices.reduce((p, v) => ({ x: p.x + v.x / 3, y: p.y + v.y / 3, z: p.z + v.z / 3 }), { x: 0, y: 0, z: 0 });
      assert.ok(p.z <= model.roadHeight(p.x, p.y) - .06, 'refined underlay remains below the exact road');
    }
    let checked = 0;
    for (let x = 15; x <= 105; x += 5) for (const center of [0, separation]) for (let offset = -2; offset <= 2; offset += .5) {
      const y = center + offset, road = model.roadHeight(x, y); if (road === null) continue;
      assert.ok(Math.abs(model.heightAt(x, y) - (road - .07)) < 1e-6, `${separation}: ${x},${y} keeps its own road height`); checked++;
    }
    assert.ok(checked > 200);
    assert.equal(model.stats.relief.maxAppliedM, 100);
    assert.ok(model.stats.relief.minAppliedM < 100, 'the road corridors actually attenuate relief');
    // Even a 100 m ridge cannot create an overlapping ground triangle above a
    // low return leg; shared bank/underlay heights remain one watertight mesh.
    const heights = new Map(), counts = new Map();
    for (const face of model.faces) for (let i = 0; i < 3; i++) {
      const p = face.vertices[i], q = face.vertices[(i + 1) % 3];
      assert.ok(Number.isFinite(p.x + p.y + p.z));
      const edge = [xyzKey(p), xyzKey(q)].sort().join('|'); counts.set(edge, (counts.get(edge) || 0) + 1);
      if (!top(face)) continue;
      const key = [p.x, p.y].map(v => Math.round(v * 1e5)).join(',');
      if (heights.has(key)) assert.ok(Math.abs(heights.get(key) - p.z) < 1e-6);
      heights.set(key, p.z);
    }
    for (const [edge, count] of counts) if (count === 1) {
      const nearRoad = edge.split('|').some(s => { const [x, y] = s.split(',').map(n => Number(n) / 1e5); return x > -20 && x < 140 && y > -20 && y < separation + 20; });
      assert.equal(nearRoad, false, 'no open edge at either road/bank seam');
    }
  }
});

test('invalid relief or blend distance fails explicitly, while the non-opt-in API ignores relief-only options', () => {
  const f = fixture(), options = { groundHeight: f.groundHeight };
  for (const value of [NaN, Infinity, undefined])
    assert.throws(() => Terrain.build(f.track, f.edges, { ...options, relief: () => value }), /relief height must be finite/);
  for (const value of [0, -1, Infinity, 1001])
    assert.throws(() => Terrain.build(f.track, f.edges, { ...options, relief: () => 20, reliefRoadBlendM: value }), /blend/);
  assert.doesNotThrow(() => Terrain.build(f.track, f.edges, { ...options, reliefRoadBlendM: Infinity }));
});

test('negative surveyed relief can lower valleys without lowering road supports or leaving scenery on the former ground', () => {
  const f = fixture(), baseline = Terrain.build(f.track, f.edges, { groundHeight: f.groundHeight });
  const model = Terrain.build(f.track, f.edges, { groundHeight: f.groundHeight, relief: () => -45 });
  assert.equal(model.stats.relief.minDeltaM, -45); assert.equal(model.stats.relief.minAppliedM, -45);
  assert.ok(model.stats.relief.maxAppliedM <= 0);
  for (let x = 30; x <= 90; x += 5) for (const y of [0, 60])
    assert.ok(Math.abs(model.heightAt(x, y) - baseline.heightAt(x, y)) < 1e-6);
  assert.ok(Math.abs(model.heightAt(60, -100) - baseline.heightAt(60, -100) + 45) < 1e-9,
    'the shared scenery field follows the lower rendered valley, without applying elevation scale twice');
  for (let y = -100; y <= 160; y += 2) assert.ok(Number.isFinite(model.heightAt(60, y)), 'connected banks remain filled');
});

test('an anchored expanded envelope retains the original lattice and sloped-site foundation heights', () => {
  const f = fixture(), groundHeight = (x, y) => 100 + .003 * x * x + .005 * y * y + .001 * x * y;
  const original = Terrain.build(f.track, [], { groundHeight });
  const bounds = { minX: -73, maxX: 251, minY: -19, maxY: 201 };
  const shifted = Terrain.build(f.track, [], { bounds, groundHeight });
  const gridAnchor = { x: original.bounds.minX, y: original.bounds.minY };
  const expanded = Terrain.build(f.track, [], { bounds, gridAnchor, groundHeight });
  assert.equal(expanded.grid.cell, original.grid.cell, 'this fixture expands without changing resolution');
  for (const axis of ['X', 'Y']) {
    const offset = (expanded.bounds['min' + axis] - original.bounds['min' + axis]) / original.grid.cell;
    assert.ok(Math.abs(offset - Math.round(offset)) < 1e-10, 'the old lattice is retained');
    assert.ok(expanded.bounds['min' + axis] <= bounds['min' + axis] - 180);
    assert.ok(expanded.bounds['max' + axis] >= bounds['max' + axis] + 180);
  }
  let unanchoredDifference = 0;
  for (let x = -25.3; x <= 140; x += 11.7) for (let y = -30.2; y <= 90; y += 9.3) {
    const z = original.sampleHeight(x, y);
    assert.ok(Math.abs(expanded.sampleHeight(x, y) - z) < 1e-9, 'the expanded mesh cannot bury an existing foundation');
    unanchoredDifference = Math.max(unanchoredDifference, Math.abs(shifted.sampleHeight(x, y) - z));
  }
  assert.ok(unanchoredDifference > .5, 'fixture demonstrates the meaningful height error caused by a shifted grid');
  assert.throws(() => Terrain.build(f.track, [], { groundHeight, gridAnchor: { x: NaN, y: 0 } }), /anchor/);
});

test('actual Taebaek DEM keeps road support and a continuous shoulder below the rock-face rails', t => {
  const circuit = circuits.find(c => c.id === 'taebaek'), sourceBefore = JSON.stringify(circuit);
  const track = Race.buildTrack(circuit), physicalBefore = JSON.stringify(track), datum = track.elevationMin;
  const display = { ...track, points: track.points.map(p => ({ ...p, z: datum + (p.z - datum) * 1.75 })) };
  const road = Road.build(display), geometryBefore = JSON.stringify(road.edges);
  const actualDisplay = { ...display, points: road.points };
  const environment = Environment.build(actualDisplay, 'taebaek', { coordinateSystem: 'local-metres', features: [] }, { backgroundVegetation: false });
  const data = require('./data/environment/korea/taebaek-features.json');
  const field = require('./track-relief.js').compile(data, z => datum + (z - datum) * 1.75, actualDisplay);
  assert.ok(field, 'the production source-backed relief field is present');
  const bounds = { minX: Math.min(display.bounds.minX, field.bounds.minX + 180), maxX: Math.max(display.bounds.maxX, field.bounds.maxX - 180),
    minY: Math.min(display.bounds.minY, field.bounds.minY + 180), maxY: Math.max(display.bounds.maxY, field.bounds.maxY - 180) };
  const model = Terrain.build(display, road.edges, { bounds, groundHeight: environment.groundHeight, relief: field.delta });
  for (const e of road.edges) for (const key of ['outerLeft', 'left', 'right', 'outerRight']) {
    const p = e[key], roadZ = model.roadHeight(p.x, p.y);
    assert.ok(Number.isFinite(roadZ));
    assert.ok(Math.abs(model.heightAt(p.x, p.y) - (roadZ - .07)) < 2e-5, 'every road/curb vertex retains its clearance');
  }
  for (const f of model.faces.filter(top)) {
    const p = f.vertices.reduce((s, v) => ({ x: s.x + v.x / 3, y: s.y + v.y / 3, z: s.z + v.z / 3 }), { x: 0, y: 0, z: 0 });
    const roadZ = model.roadHeight(p.x, p.y);
    if (roadZ !== null) assert.ok(p.z <= roadZ - .04, 'no lifted bank spans any actual road leg');
    const [a, b, c] = f.vertices, twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    // Clipping can produce overlapping micrometre-wide slivers; the sampler
    // correctly chooses the highest rendered surface at their shared edge.
    assert.ok(model.heightAt(p.x, p.y) >= p.z - 2e-5);
    if (twiceArea > .001) assert.ok(Math.abs(model.heightAt(p.x, p.y) - p.z) < 2e-5, 'scenery is grounded on the actual triangle');
  }
  assert.equal(JSON.stringify(circuit), sourceBefore); assert.equal(JSON.stringify(track), physicalBefore);
  assert.equal(JSON.stringify(road.edges), geometryBefore);
  let maximumShoulderError = 0, maximumExtraRise3m = 0; const samples = [];
  for (let s = 620; s <= 1010; s++) {
    const p = road.sample(s), x = p.x + Math.sin(p.angle) * 11, y = p.y - Math.cos(p.angle) * 11;
    const z = model.heightAt(x, y); assert.ok(Number.isFinite(z));
    maximumShoulderError = Math.max(maximumShoulderError, Math.abs(z - (p.z - .07)));
    samples.push({ z, roadZ: p.z });
    if (samples.length > 3) {
      const a = samples.at(-4); maximumExtraRise3m = Math.max(maximumExtraRise3m, Math.abs((z - a.z) - (p.z - a.roadZ)));
    }
  }
  assert.ok(maximumShoulderError < .15, 'rails share a physically continuous graded shoulder, not a separately smoothed height');
  assert.ok(maximumExtraRise3m < .08, 'the former 3.50 m / 3 m sawtooth is absent');
  assert.ok(model.stats.relief.sampleCount < 25000, 'only the narrow road corridor receives extra samples');
  assert.ok(model.faces.length < 50000); t.diagnostic(JSON.stringify({ ...model.stats, maximumShoulderError, maximumExtraRise3m }));
});
