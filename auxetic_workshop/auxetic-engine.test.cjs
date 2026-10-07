const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./auxetic-engine.js');
const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);

test('both parities of every horizontal and vertical hinge share the actual polygon corner', () => {
  for (const aspect of [.5, .7, 1, 1.4, 2]) for (const fraction of [0, .1, .5, .85, 1]) {
    const state = E.createState(); E.setAspect(state, aspect); E.setExtension(state, E.maxExtension(aspect) * fraction);
    const g = E.geometry(state);
    assert.equal(g.cells.length, 20); assert.equal(g.hinges.length, 31);
    for (const h of g.hinges) {
      const first = g.cells[h.cell].vertices[h.vertex], second = g.cells[h.otherCell].vertices[h.otherVertex];
      near(first.x, second.x); near(first.y, second.y); near(h.x, first.x); near(h.y, first.y);
    }
    const vertices = g.cells.flatMap(c => c.vertices);
    near(Math.max(...vertices.map(v => v.x)) - Math.min(...vertices.map(v => v.x)), g.width);
    near(Math.max(...vertices.map(v => v.y)) - Math.min(...vertices.map(v => v.y)), g.height);
    for (const c of g.cells) {
      near(Math.hypot(c.vertices[0].x - c.vertices[1].x, c.vertices[0].y - c.vertices[1].y), aspect);
      near(Math.hypot(c.vertices[1].x - c.vertices[2].x, c.vertices[1].y - c.vertices[2].y), 1);
    }
  }
});
test('inverse extension stays on the monotone branch and clamps to feasible geometry', () => {
  for (const a of [.5, 1, 2]) for (const fraction of [0, .25, .8, 1]) {
    const target = fraction * E.maxExtension(a), angle = E.angleForExtension(a, target);
    near(E.extensionForAngle(a, angle), target, 1e-6);
    assert.ok(angle >= -1e-10 && angle <= Math.atan2(1, a) + 1e-10);
  }
  const s = E.createState(); E.setExtension(s, 1000); near(s.extension, E.maxExtension(s.aspect)); E.setExtension(s, -100); near(s.extension, 0);
});
test('one locked hinge blocks global motion until every locked hinge is released', () => {
  const s = E.createState(), before = E.geometry(s); E.toggleLock(s, 'h-1-2'); E.toggleLock(s, 'v-0-0');
  assert.equal(E.setExtension(s, 35).reason, 'locked'); near(E.geometry(s).width, before.width);
  E.toggleLock(s, 'h-1-2'); assert.equal(E.setExtension(s, 35).reason, 'locked');
  E.toggleLock(s, 'v-0-0'); assert.equal(E.setExtension(s, 35).moved, true);
  assert.equal(E.toggleLock(s, 'missing'), false);
});
test('square units expand in both axes; tall units shrink after their maximum-height reference', () => {
  const square = E.createState(); E.setExtension(square, 30); const g = E.geometry(square);
  near(g.strainX, 30); near(g.strainY, 30); assert.equal(g.response, 'expanding');
  near(g.width * g.comparisonHeight, g.referenceWidth * g.referenceHeight);
  const tall = E.createState(); E.loadMission(tall, 'turn'); const start = E.geometry(tall);
  near(start.strainX, 0); near(start.strainY, 0); assert.equal(start.response, 'turn');
  E.setExtension(tall, 115); const after = E.geometry(tall);
  assert.ok(after.width > start.width); assert.ok(after.height < start.height); assert.ok(after.strainY < 0); assert.equal(after.response, 'contracting');
});
test('each mission has an attainable target and preserves honest lock/geometry requirements', () => {
  const s = E.createState(); E.loadMission(s, 'window'); E.setExtension(s, 30); assert.equal(E.evaluateMission(s).success, true);
  E.loadMission(s, 'lock'); E.setExtension(s, 25); assert.equal(E.evaluateMission(s).success, false); E.toggleLock(s, 'h-1-2'); E.setExtension(s, 25); assert.equal(E.evaluateMission(s).success, true);
  E.loadMission(s, 'turn'); E.setExtension(s, 115); assert.equal(E.evaluateMission(s).success, true);
  E.loadMission(s, 'turn'); assert.equal(E.evaluateMission(s).success, false);
});

function vertices(g) { return [...g.paths.flatMap(p => p.points), ...g.hinges]; }
function finiteDimensions(g) {
  for (const key of ['width', 'height', 'baseWidth', 'baseHeight', 'referenceWidth', 'referenceHeight', 'maxWidth', 'maxHeight', 'theta', 'strainX', 'strainY', 'comparisonHeight']) {
    assert.ok(Number.isFinite(g[key]), `${key} must be finite`);
  }
  assert.ok(g.width > 0 && g.height > 0);
  const points = vertices(g);
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  near(Math.max(...xs) - Math.min(...xs), g.width, 1e-7);
  near(Math.max(...ys) - Math.min(...ys), g.height, 1e-7);
  near(Math.max(...xs) + Math.min(...xs), 0, 1e-7);
  near(Math.max(...ys) + Math.min(...ys), 0, 1e-7);
  assert.ok(g.width <= g.maxWidth + 1e-7);
  assert.ok(g.height <= g.maxHeight + 1e-7);
}

test('eighteen presets expose complete shape metadata, selectable nodes and honest dimensions at every aspect/limit', () => {
  assert.equal(E.PRESETS.length, 18);
  assert.equal(new Set(E.PRESETS.map(p => p.id)).size, 18);
  assert.equal(E.PRESETS.filter(p => p.kind === 'linkage').length, 13);
  for (const preset of E.PRESETS) {
    for (const key of ['label', 'family', 'description', 'mechanism', 'aspectLabel', 'aspectHelp']) assert.ok(preset[key]);
    for (const aspect of [.5, .7, 1, 1.4, 2]) {
      const s = E.createState(); E.loadPreset(s, preset.id); E.setAspect(s, aspect);
      const max = E.maxExtension(s), viewport = E.geometry(s);
      assert.ok(Number.isFinite(max) && max > 0);
      for (const fraction of [0, .01, .2, .5, .8, .99, 1]) {
        E.setExtension(s, max * fraction);
        const g = E.geometry(s);
        finiteDimensions(g);
        near(g.width, g.baseWidth * (1 + s.extension / 100), 1e-7);
        near(g.maxWidth, viewport.maxWidth); near(g.maxHeight, viewport.maxHeight);
        assert.ok(g.paths.length > 0 && g.hinges.length > 0);
        assert.equal(new Set(g.hinges.map(h => h.id)).size, g.hinges.length);
        for (const path of g.paths) {
          assert.ok(path.points.length >= 2);
          assert.equal(typeof path.closed, 'boolean'); assert.equal(typeof path.fill, 'boolean');
          assert.ok(['body', 'ring', 'ligament', 'cut'].includes(path.role));
        }
        assert.ok(E.selectHinge(s, g.hinges.at(-1).id));
        if (preset.kind === 'linkage') {
          assert.equal(g.openingFraction, null);
          assert.ok(g.modelNote.includes('물리'));
          near(g.strainX, s.extension, 1e-8);
          assert.ok(g.strainY >= -1e-8);
          if (fraction === 1) assert.equal(g.response, 'limit');
        }
      }
    }
  }
});

test('new structures widen and grow taller continuously through their whole deployment', () => {
  for (const preset of E.PRESETS.filter(p => p.kind === 'linkage')) {
    const s = E.createState(); E.loadPreset(s, preset.id); E.setExtension(s, 0);
    let previous = E.geometry(s);
    for (let i = 1; i <= 160; i++) {
      E.setExtension(s, E.maxExtension(s) * i / 160);
      const current = E.geometry(s);
      assert.ok(current.width > previous.width, `${preset.id}: width must increase`);
      assert.ok(current.height > previous.height, `${preset.id}: height must increase`);
      assert.ok(current.width - previous.width < current.maxWidth / 50, `${preset.id}: width must not jump`);
      assert.ok(current.height - previous.height < current.maxHeight / 50, `${preset.id}: height must not jump`);
      for (let j = 0; j < current.hinges.length; j++) {
        const before = previous.hinges[j], after = current.hinges[j];
        assert.equal(before.id, after.id, `${preset.id}: stable joint identities`);
        assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < Math.max(current.maxWidth, current.maxHeight) / 100,
          `${preset.id}: attachment point must move continuously`);
      }
      previous = current;
    }
  }
});

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const fraction = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - fraction * dx, p.y - a.y - fraction * dy);
}
function onPath(point, path) {
  return path.points.some((a, i) => {
    const b = path.points[i + 1] || (path.closed ? path.points[0] : a);
    return distanceToSegment(point, a, b) < 1e-7;
  });
}

test('ligament endpoints remain attached to cell outlines or wave/rib paths as structures deploy', () => {
  for (const preset of E.PRESETS.filter(p => p.kind === 'linkage')) {
    const s = E.createState(); E.loadPreset(s, preset.id); E.setAspect(s, 1.7);
    for (const fraction of [0, .27, .73, 1]) {
      E.setExtension(s, E.maxExtension(s) * fraction);
      const g = E.geometry(s), outlines = g.paths.filter(p => !p.connector && p.role !== 'cut');
      for (const connector of g.paths.filter(p => p.connector)) {
        near(connector.points[0].x, connector.endpoints[0].x); near(connector.points[0].y, connector.endpoints[0].y);
        near(connector.points.at(-1).x, connector.endpoints[1].x); near(connector.points.at(-1).y, connector.endpoints[1].y);
        for (const end of connector.endpoints) assert.ok(outlines.some(path => onPath(end, path)), `${preset.id}: detached ligament endpoint`);
      }
    }
  }
});

test('aspect edits retain the chosen structure, proportional deployment and custom reset destination', () => {
  for (const preset of E.PRESETS) {
    const s = E.createState(); E.loadPreset(s, preset.id);
    const reference = E.geometry(s), first = reference.hinges[0].id;
    E.setExtension(s, .37 * E.maxExtension(s));
    E.toggleLock(s, first);
    assert.equal(E.setExtension(s, .6 * E.maxExtension(s)).reason, 'locked');
    assert.ok(E.setAspect(s, 1.8));
    assert.equal(s.structure, preset.id); assert.equal(s.preset, 'custom'); assert.equal(E.getPreset(s), preset);
    assert.deepEqual(s.locked, []); near(s.extension / E.maxExtension(s), .37);
    const customized = E.geometry(s);
    if (preset.kind === 'linkage') near(customized.baseWidth / reference.baseWidth, 1.8 / preset.aspect);
    E.toggleLock(s, customized.hinges.at(-1).id);
    assert.equal(E.setExtension(s, 0).reason, 'locked');
    E.loadPreset(s, s.structure);
    assert.equal(s.preset, preset.id); assert.equal(s.structure, preset.id); assert.deepEqual(s.locked, []);
    near(E.geometry(s).width, reference.width);
    E.setExtension(s, -100); near(s.extension, 0);
    E.setExtension(s, 10000); near(s.extension, E.maxExtension(s));
    assert.equal(E.setExtension(s, NaN).reason, 'invalid');
  }
});

test('new structures have distinct motifs and change internal shape instead of merely scaling', () => {
  const signatures = new Set();
  for (const preset of E.PRESETS.filter(p => p.kind === 'linkage')) {
    const s = E.createState(); E.loadPreset(s, preset.id); E.setExtension(s, 0);
    const start = E.geometry(s); E.setExtension(s, E.maxExtension(s)); const end = E.geometry(s);
    signatures.add(JSON.stringify(start.paths.map(p => [p.closed, p.fill, p.role, p.points.map(v => [+(v.x / start.width).toFixed(3), +(v.y / start.height).toFixed(3)])])));
    let normalizedChange = 0;
    for (let i = 0; i < start.paths.length; i++) for (let j = 0; j < start.paths[i].points.length; j++) {
      const a = start.paths[i].points[j], b = end.paths[i].points[j];
      normalizedChange = Math.max(normalizedChange, Math.hypot(a.x / start.width - b.x / end.width, a.y / start.height - b.y / end.height));
    }
    assert.ok(normalizedChange > .012, `${preset.id}: needs internal shape change`);
  }
  assert.equal(signatures.size, 13);
});
