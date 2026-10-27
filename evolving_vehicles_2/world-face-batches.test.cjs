'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Batches = require('./world-face-batches.js'), Renderer = require('./circuit-renderer.js');
const Race = require('./race-engine.js'), Road = require('./circuit-road.js'), Terrain = require('./circuit-terrain.js');
const Environment = require('./track-environment.js'), circuits = require('./circuits.js');
function renderer(width = 390, height = 844) { return Object.assign(Object.create(Renderer.prototype), { width, height }); }
function camera(r, target, distance, yaw = 0, pitch = 0, focal = r.height / (2 * Math.tan(16 * Math.PI / 180))) {
  return r._createCamera(target, distance, yaw, pitch, focal, r.width / 2, r.height * .64);
}
function queue(r, groups, view, filtered) {
  const out = [];
  for (const faces of groups) if (filtered) r._queueWorldFaces(faces, view, out); else for (const face of faces) r._queue(face, view, out);
  return out;
}
function exact(r, groups, view, label) {
  const before = queue(r, groups, view, false), after = queue(r, groups, view, true);
  assert.deepEqual(after, before, label + ': exact face order, vertices, depth and style after existing near clipping');
  return { queued: after.length, candidates: groups.reduce((sum, faces) => sum + r._worldFaceBatches.get(faces).stats.candidateFaces, 0), total: groups.reduce((sum, faces) => sum + faces.length, 0) };
}

test('static batch module works in script tags and does not modify source faces', () => {
  const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(require.resolve('./world-face-batches.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.WorldFaceBatches.build, 'function'); assert.throws(() => Batches.build(null), /array/);
  const faces = Object.freeze([Object.freeze({ vertices: Object.freeze([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }].map(Object.freeze)), fill: '#fff' })]);
  const batches = Batches.build(faces); assert.equal(batches.query(null, 100, 100), faces);
  const empty = []; assert.equal(Batches.build(empty).query(camera(renderer(), { x: 0, y: 0, z: 0 }, 10), 390, 844), empty);
});

test('near-crossing, horizon, huge offscreen-centred faces and distant return legs match legacy clipping', () => {
  const r = renderer(900, 565), make = (vertices, id) => ({ vertices: vertices.map(([x, y, z]) => ({ x, y, z })), fill: id, stroke: id, width: .7 });
  const faces = [
    make([[-2, 9, -.05], [2, 9, -.05], [2, 12, .05], [-2, 12, .05]], 'near-crossing'),
    make([[-2000, -300, 0], [2, -300, 0], [2, 20, 0]], 'offscreen-centroid'),
    make([[-200, -10000, 0], [200, -10000, 0], [0, -10000, 80]], 'distant-return'),
    make([[-2, 10.0001, -3], [2, 10.0001, -3], [2, 11, 3]], 'behind-eye'),
    make([[-200, 0, -50], [200, 0, -50], [200, 0, 50], [-200, 0, 50]], 'surrounds-screen')
  ];
  for (let i = 0; i < 200; i++) faces.push(make([[2000 + i * 5, 500 + i * 3, 0], [2002 + i * 5, 500 + i * 3, 0], [2000 + i * 5, 502 + i * 3, 0]], 'off-' + i));
  for (const [yaw, pitch, distance, offset] of [[0, 0, 10, 0], [0, .000001, 10, 0], [0, -.15, 10, 0], [1.2, .7, 30, 100], [-.5, 1.56, 200, -100]])
    exact(r, [faces], camera(r, { x: offset, y: 0, z: 0 }, distance, yaw, pitch), 'near/horizon ' + [yaw, pitch, distance]);
  const view = camera(r, { x: 0, y: 0, z: 0 }, 10), original = queue(r, [faces], view, false);
  assert.ok(original.some(f => f.fill === 'near-crossing')); assert.ok(original.some(f => f.fill === 'distant-return'));
  const candidates = r._worldFaceBatches.get(faces).query(view, r.width, r.height);
  assert.ok(candidates.length < faces.length / 4, 'entire distant offscreen cells are rejected before projection');
});

test('renderer caches static array identity and rebuilds replaced or extended geometry', () => {
  const r = renderer(), faces = [{ vertices: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }], fill: '#fff' }], view = camera(r, { x: 0, y: 0, z: 0 }, 20, 0, .5);
  exact(r, [faces], view, 'first'); const first = r._worldFaceBatches.get(faces);
  exact(r, [faces], view, 'cached'); assert.equal(r._worldFaceBatches.get(faces), first);
  const replacement = faces.slice(); exact(r, [replacement], view, 'replacement'); assert.notEqual(r._worldFaceBatches.get(replacement), first);
  faces.push({ ...faces[0], fill: '#000' }); exact(r, [faces], view, 'extended'); assert.notEqual(r._worldFaceBatches.get(faces), first);
});

test('facility batches retain visible distant architecture and its existing outline style', () => {
  const r=renderer(900,565),view=camera(r,{x:0,y:0,z:3},12,0,.02);
  const faces=[{vertices:[{x:-65,y:-900,z:0},{x:65,y:-900,z:0},{x:65,y:-900,z:28},{x:-65,y:-900,z:28}],fill:'#e1e5dd'},
    {vertices:[{x:3000,y:400,z:0},{x:3002,y:400,z:0},{x:3000,y:400,z:20}],fill:'#aabbbb'}];
  const before=JSON.stringify(faces),expected=[],actual=[];
  for(const f of faces)r._queue({...f,stroke:f.fill,width:.55},view,expected);
  r._queueWorldFaces(faces,view,actual,true);
  assert(expected.length>0,'hotel 900 m ahead is actually on screen');
  assert.deepEqual(actual,expected,'same projection, depth, ordering and facility outline');
  assert.equal(JSON.stringify(faces),before,'shared source geometry is immutable');
  assert(r._worldFaceBatches.get(faces).stats.candidateFaces<faces.length,'offscreen facility is rejected');
});

test('all eleven real road and terrain meshes keep exact queues through follow, orbit, pan, zoom, top and horizon views', t => {
  const reports = [];
  for (const circuit of circuits) {
    const raw = Race.buildTrack(circuit), datum = raw.elevationMin || 0;
    const source = { ...raw, points: raw.points.map(p => ({ ...p, z: datum + (p.z - datum) * 1.75 })) };
    const road = Road.build(source), track = { ...source, points: road.points };
    // Terrain height is the production nearest-road field. Scenery objects and
    // pit buildings are separate renderer loops and are deliberately untouched.
    const environment = Environment.build(track, circuit.id, { features: [], sources: [] }, { backgroundVegetation: false });
    const ground = Terrain.build(track, road.edges, { groundHeight: environment.groundHeight }).faces;
    const roadFaces = [];
    for (let i = 0; i < road.edges.length; i++) {
      const a = road.edges[i], b = road.edges[(i + 1) % road.edges.length];
      for (const vertices of [[a.outerLeft, b.outerLeft, b.left, a.left], [a.left, b.left, b.right, a.right], [a.right, b.right, b.outerRight, a.outerRight]]) roadFaces.push({ vertices, road: true, fill: '#465250' });
    }
    const groups = [ground, roadFaces], r = renderer();
    const peak = raw.points.reduce((a, b) => Math.abs(a.curvature) > Math.abs(b.curvature) ? a : b);
    const s = circuit.id === 'taebaek' ? 535 : circuit.id === 'spa' ? 240 : peak.s;
    const p = road.sample(s), rear = road.sample(s - 22), target = { x: p.x, y: p.y, z: p.z + .65 };
    const horizontal = Math.hypot(p.x - rear.x, p.y - rear.y), rise = rear.z + 1.15 - target.z;
    const yaw = Math.atan2(p.y - rear.y, p.x - rear.x) + Math.PI / 2;
    const follow = camera(r, target, Math.hypot(horizontal, rise), yaw, Math.atan2(rise, horizontal));
    const metric = exact(r, groups, follow, circuit.id + ': low follow');
    const center = { x: (track.bounds.minX + track.bounds.maxX) / 2, y: (track.bounds.minY + track.bounds.maxY) / 2, z: datum }, span = Math.max(track.bounds.width, track.bounds.height);
    for (const [label, view] of [
      ['orbit-pan-zoom', camera(r, { x: target.x + 57, y: target.y - 93, z: target.z + 8 }, 44, yaw + 1.4, .31)],
      ['horizon', camera(r, target, 25, yaw, -.00001)],
      ['near-zoom', camera(r, target, .8, yaw - .8, -.08)],
      ['top', camera(r, center, span * 2, 0, Math.PI / 2 - .008, r.height * 1.15)],
      ['overview', camera(r, center, span * 2.2, -.42, .9, r.height * 1.15)]
    ]) exact(r, groups, view, circuit.id + ': ' + label);
    assert.ok(metric.candidates < metric.total * .65, circuit.id + ': low follow rejects most world faces before per-face clipping');
    reports.push({ id: circuit.id, total: metric.total, candidates: metric.candidates, queued: metric.queued, retained: +(metric.candidates / metric.total).toFixed(3) });
  }
  assert.equal(reports.length, 11); t.diagnostic(JSON.stringify(reports));
});
