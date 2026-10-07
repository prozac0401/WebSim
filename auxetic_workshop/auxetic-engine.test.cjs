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
