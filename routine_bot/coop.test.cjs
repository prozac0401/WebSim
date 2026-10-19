'use strict';
// Coordinates, phases and action outcomes here are independently hand-derived.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
let serial = 0;
const n = (type, extra = {}) => ({ id: 'coop-test-' + (++serial), type, ...extra });
const f = () => n('forward'), r = () => n('right'), l = () => n('left'), w = () => n('wait');
const iff = (condition, then, otherwise = []) => n('if', { condition, then, else: otherwise });
const rep = (count, body) => n('repeat', { count, body });
const call = target => n('call', { target });
const program = (main = [], F1 = [], F2 = []) => ({ main, F1, F2 });
const robot = (id, x, y, dir, home = { x: 6, y: id.charCodeAt(0) - 65 }) => ({ id, x, y, dir, home });
const point = (x, y) => ({ x, y });
const pos = value => ({ x: value.x, y: value.y, dir: value.dir });
function level(robots, boxes = [], extra = {}) {
  return { maxCommands: 128, maxSteps: 1000,
    unlocks: ['forward', 'left', 'right', 'wait', 'repeat', 'if', 'blocked', 'mark', 'box', 'home', 'call', 'F1', 'F2'],
    maps: [{ rows: ['.......', '.......', '.......', '.......', '.......'], robots, boxes,
      targets: boxes.map((_, i) => point(6 - i, 4)), ...extra }] };
}
const make = (p, robots, boxes = [], extra = {}) => E.createRunner(p, level(robots, boxes, extra));
const byId = s => Object.fromEntries(s.robots.map(a => [a.id, pos(a)]));
function finish(runner) {
  for (let i = 0; i < 1100; i++) { const s = runner.step(); if (!['ready', 'running'].includes(s.status)) return s; }
  throw new Error('Independent turn guard exceeded');
}

test('one forward pushes exactly one box and moves the robot atomically', () => {
  const s = make(program([f()]), [robot('A', 1, 2, 1)], [point(2, 2)]).step();
  assert.deepEqual(s.robot, { x: 2, y: 2, dir: 1 }); assert.deepEqual(s.boxes, [point(3, 2)]);
  assert.equal(s.event.actions[0].type, 'push'); assert.equal(s.event.actions[0].cancelled, false);
  assert.equal(s.movementCount, 1); assert.equal(s.steps, 1);
});

test('side-adjacent boxes do not prevent a single push; an in-line second box does', () => {
  const sideways = make(program([f()]), [robot('A', 1, 2, 1)], [point(2, 2), point(2, 3)]).step();
  assert.deepEqual(sideways.boxes, [point(3, 2), point(2, 3)]);
  const chain = make(program([f()]), [robot('A', 1, 2, 1)], [point(2, 2), point(3, 2)]).step();
  assert.deepEqual(chain.boxes, [point(2, 2), point(3, 2)]); assert.deepEqual(chain.robot, { x: 1, y: 2, dir: 1 });
  assert.equal(chain.event.actions[0].reason, 'box-chain'); assert.equal(chain.movementCount, 1);
});

test('box cannot be pushed into wall, outside map, or another robot even when it leaves', () => {
  const blockedWall = make(program([f()]), [robot('A', 1, 2, 1)], [point(2, 2)], { rows: ['.......', '.......', '...#...', '.......', '.......'] }).step();
  assert.equal(blockedWall.event.actions[0].reason, 'box-wall'); assert.deepEqual(blockedWall.boxes, [point(2, 2)]);
  const outside = make(program([f()]), [robot('A', 5, 2, 1)], [point(6, 2)]).step();
  assert.equal(outside.event.actions[0].reason, 'box-wall');
  const blockedRobot = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 3, 2, 1)], [point(2, 2)]).step();
  assert.equal(blockedRobot.event.actions[0].reason, 'box-robot'); assert.deepEqual(blockedRobot.boxes, [point(2, 2)]);
  assert.deepEqual(byId(blockedRobot), { A: { x: 1, y: 2, dir: 1 }, B: { x: 4, y: 2, dir: 1 } });
});

test('two robots trying to push the same box are both cancelled', () => {
  const s = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 2, 1, 2)], [point(2, 2)]).step();
  assert.deepEqual(s.event.actions.map(a => a.reason), ['same-box', 'same-box']);
  assert.deepEqual(s.boxes, [point(2, 2)]); assert.deepEqual(byId(s), { A: { x: 1, y: 2, dir: 1 }, B: { x: 2, y: 1, dir: 2 } });
});

test('same destination cancels every claimant without cancelling an unrelated move', () => {
  const s = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 3, 2, 3), robot('C', 1, 4, 1)]).step();
  assert.deepEqual(s.event.actions.map(a => a.reason || null), ['destination', 'destination', null]);
  assert.deepEqual(byId(s), { A: { x: 1, y: 2, dir: 1 }, B: { x: 3, y: 2, dir: 3 }, C: { x: 2, y: 4, dir: 1 } });
  assert.equal(s.movementCount, 1);
});

test('swaps and following into a newly vacated robot cell are prohibited', () => {
  const swap = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 2, 2, 3)]).step();
  assert.deepEqual(swap.event.actions.map(a => a.reason), ['robot', 'robot']);
  assert.deepEqual(byId(swap), { A: { x: 1, y: 2, dir: 1 }, B: { x: 2, y: 2, dir: 3 } });
  const follow = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 2, 2, 1)]).step();
  assert.equal(follow.event.actions[0].reason, 'robot'); assert.equal(follow.event.actions[1].cancelled, false);
  assert.deepEqual(byId(follow), { A: { x: 1, y: 2, dir: 1 }, B: { x: 3, y: 2, dir: 1 } });
});

test('move/push and push/push destination conflicts cancel the entire push', () => {
  const conflict = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 3, 1, 2)], [point(2, 2)]).step();
  assert.deepEqual(conflict.event.actions.map(a => a.reason), ['destination', 'destination']);
  assert.deepEqual(conflict.boxes, [point(2, 2)]); assert.deepEqual(conflict.robot, { x: 1, y: 2, dir: 1 });
  const bothPush = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 3, 0, 2)], [point(2, 2), point(3, 1)]).step();
  assert.deepEqual(bothPush.event.actions.map(a => a.reason), ['destination', 'destination']);
  assert.deepEqual(bothPush.boxes, [point(2, 2), point(3, 1)]);
});

test('a box scheduled to leave does not permit a chain push in the same turn', () => {
  const s = make(program([f()]), [robot('A', 1, 2, 1), robot('B', 3, 1, 2)], [point(2, 2), point(3, 2)]).step();
  assert.equal(s.event.actions[0].reason, 'box-chain'); assert.equal(s.event.actions[1].cancelled, false);
  assert.deepEqual(s.boxes, [point(2, 2), point(3, 3)]);
});

test('permuting robot arrays does not change world outcomes, events or diagnostics', () => {
  const robots = [robot('A', 1, 2, 1), robot('B', 3, 1, 2), robot('C', 1, 4, 1)];
  const p = program([f(), r(), f()]);
  function normalized(s) { return { ...s, robots: s.robots.slice().sort((a, b) => a.id.localeCompare(b.id)), robot: null, currentId: null, callStack: null }; }
  const a = make(p, robots, [point(2, 2)]), b = make(p, [robots[2], robots[0], robots[1]], [point(2, 2)]);
  for (let turn = 0; turn < 4; turn++) assert.deepEqual(normalized(a.step()), normalized(b.step()));
});

test('blocked means immediate snapshot movement feasibility, including pushable boxes and robots', () => {
  const p = program([iff('blocked', [r()], [f()])]);
  const openBox = make(p, [robot('A', 1, 2, 1)], [point(2, 2)]).step();
  assert.equal(openBox.robots[0].event.controls[0].result, false); assert.deepEqual(openBox.robot, { x: 2, y: 2, dir: 1 });
  const chain = make(p, [robot('A', 1, 2, 1)], [point(2, 2), point(3, 2)]).step();
  assert.equal(chain.robots[0].event.controls[0].result, true); assert.deepEqual(chain.robot, { x: 1, y: 2, dir: 2 });
  const occupied = make(p, [robot('A', 1, 2, 1), robot('B', 2, 2, 1)]).step();
  assert.equal(occupied.robots[0].event.controls[0].result, true); assert.equal(occupied.robots[1].event.controls[0].result, false);
});

test('conditions do not predict competing intents and independently choose branches', () => {
  const p = program([iff('blocked', [r()], [f()])]);
  const s = make(p, [robot('A', 1, 2, 1), robot('B', 3, 2, 3)]).step();
  assert.deepEqual(s.event.actions.map(a => a.controls[0].result), [false, false]);
  assert.deepEqual(s.event.actions.map(a => a.reason), ['destination', 'destination']);
  const branch = make(program([iff('mark', [r()], [l()])]), [robot('A', 1, 2, 1), robot('B', 3, 2, 1)], [],
    { rows: ['.......', '.......', '.*.....', '.......', '.......'] }).step();
  assert.deepEqual(byId(branch), { A: { x: 1, y: 2, dir: 2 }, B: { x: 3, y: 2, dir: 0 } });
  assert.equal(branch.steps, 4); assert.equal(branch.movementCount, 1);
});

test('box condition sees an unpushable box and home condition is own-home only', () => {
  const box = make(program([iff('box', [r()], [f()])]), [robot('A', 1, 2, 1)], [point(2, 2), point(3, 2)]).step();
  assert.equal(box.event.actions[0].controls[0].result, true); assert.equal(box.robot.dir, 2);
  const p = program([iff('home', [r()], [l()])]);
  const own = make(p, [robot('A', 1, 2, 1, point(1, 2)), robot('B', 3, 2, 1)]).step();
  assert.deepEqual(own.event.actions.map(a => a.controls[0].result), [true, false]);
  const other = make(p, [robot('A', 1, 2, 1, point(3, 2)), robot('B', 3, 2, 1, point(1, 2))]).step();
  assert.deepEqual(other.event.actions.map(a => a.controls[0].result), [false, false]);
});

test('robot instruction positions, repeat counters and call stacks are independent', () => {
  const conditional = iff('mark', [call('F1')], [call('F2')]);
  const p = program([conditional, f()], [rep(2, [r()])], [f()]);
  const runner = make(p, [robot('A', 1, 2, 1), robot('B', 3, 2, 1)], [], { rows: ['.......', '.......', '.*.....', '.......', '.......'] });
  const first = runner.step();
  assert.deepEqual(first.robots.map(a => a.callStack.map(c => c.target)), [['F1'], ['F2']]);
  assert.deepEqual(first.robots.map(a => a.repeatStack.map(c => c.iteration)), [[1], []]);
  assert.equal(first.robots[0].currentId, p.F1[0].body[0].id); assert.equal(first.robots[1].currentId, p.F2[0].id);
  const second = runner.step();
  assert.deepEqual(second.robots.map(a => a.callStack.map(c => c.target)), [['F1'], []]);
  assert.deepEqual(second.robots.map(a => a.repeatStack.map(c => c.iteration)), [[2], []]);
  assert.deepEqual(byId(second), { A: { x: 1, y: 2, dir: 3 }, B: { x: 5, y: 2, dir: 1 } });
  const third = runner.step();
  assert.equal(third.robots[1].status, 'ended'); assert.deepEqual(third.robots[0].callStack, []);
  assert.deepEqual(byId(third), { A: { x: 0, y: 2, dir: 3 }, B: { x: 5, y: 2, dir: 1 } });
  assert.equal(third.movementCount, 3);
});

test('nested function entry and returns consume no turns', () => {
  const p = program([call('F2'), w()], [r()], [call('F1'), l()]);
  const runner = make(p, [robot('A', 1, 2, 1), robot('B', 4, 2, 3)]);
  const first = runner.step(); assert.equal(first.movementCount, 1);
  assert.deepEqual(first.robots.map(a => a.callStack.map(c => c.target)), [['F2', 'F1'], ['F2', 'F1']]);
  const second = runner.step(); assert.equal(second.movementCount, 2);
  assert.deepEqual(second.robots.map(a => a.callStack.map(c => c.target)), [['F2'], ['F2']]);
  const third = runner.step(); assert.equal(third.movementCount, 3); assert.deepEqual(third.robots.map(a => a.callStack), [[], []]);
  assert.equal(third.steps, 10);
});

test('blocked actions consume a turn and advance to the next instruction without failure', () => {
  const first = f(), next = r(), runner = make(program([first, next]), [robot('A', 0, 2, 3)]);
  const blocked = runner.step(); assert.equal(blocked.status, 'running'); assert.equal(blocked.currentId, first.id); assert.equal(blocked.movementCount, 1);
  const turn = runner.step(); assert.equal(turn.currentId, next.id); assert.equal(turn.robot.dir, 0); assert.equal(turn.movementCount, 2);
  const ended = runner.step(); assert.equal(ended.event.reason, 'exhausted'); assert.equal(ended.movementCount, 2);
});

test('exhaustion preserves each last physical action and blocked reason for fast-play inspection', () => {
  const command = f(), runner = make(program([command]), [robot('A', 0, 2, 3), robot('B', 4, 2, 1)]);
  const action = runner.step(); assert.equal(action.event.actions[0].reason, 'wall');
  const ended = runner.step(); assert.equal(ended.event.reason, 'exhausted'); assert.equal(ended.movementCount, 1);
  assert.match(ended.message, /마지막 막힘.*A:.*벽/);
  assert.match(ended.robots[0].message, /프로그램 종료.*벽/);
  assert.deepEqual(ended.robots[0].event.lastAction, action.event.actions[0]);
  assert.equal(ended.robots[0].event.lastAction.id, command.id);
  assert.equal(ended.robots[1].event.lastAction.cancelled, false);
  assert.deepEqual(ended.event.lastActions, action.event.actions);
});

test('one robot at home can leave again and a delivered box remains movable', () => {
  const runner = make(program([f(), f()]), [robot('A', 1, 2, 1, point(1, 2)), robot('B', 0, 3, 1)], [point(2, 2)], { targets: [point(3, 2)] });
  const first = runner.step(); assert.equal(first.status, 'running'); assert.equal(first.robots[0].x, 2); assert.deepEqual(first.boxes, [point(3, 2)]);
  const second = runner.step(); assert.equal(second.status, 'running'); assert.equal(second.robots[0].x, 3); assert.deepEqual(second.boxes, [point(4, 2)]);
});

test('all own homes and all interchangeable box targets must hold simultaneously', () => {
  const runner = make(program([f()]), [robot('A', 1, 2, 1, point(2, 2)), robot('B', 0, 3, 1, point(1, 3))], [point(2, 2)], { targets: [point(3, 2)] });
  const s = runner.step(); assert.equal(s.status, 'success'); assert.equal(s.movementCount, 1); assert.deepEqual(runner.step(), s);
  const missingDelivery = make(program([f()]), [robot('A', 1, 2, 1, point(2, 2))], [point(4, 2)], { targets: [point(5, 2)] }).step();
  assert.equal(missingDelivery.status, 'running');
  const wrongHomes = make(program(), [robot('A', 1, 2, 1, point(3, 2)), robot('B', 3, 2, 3, point(1, 2))]);
  assert.equal(wrongHomes.step().event.reason, 'exhausted');
  const interchangeable = make(program(), [robot('A', 1, 2, 1, point(1, 2))], [point(2, 3), point(4, 3)], { targets: [point(4, 3), point(2, 3)] });
  assert.equal(interchangeable.step().status, 'success');
});

test('an ended robot remains solid while other robots continue', () => {
  const p = program([iff('mark', [], [f(), f()])]);
  const runner = make(p, [robot('A', 2, 2, 1), robot('B', 0, 2, 1)], [], { rows: ['.......', '.......', '..*....', '.......', '.......'] });
  const first = runner.step(); assert.equal(first.robots[0].status, 'ended'); assert.equal(first.robots[1].x, 1);
  const second = runner.step(); assert.equal(second.event.actions[0].reason, 'robot'); assert.equal(second.robots[1].x, 1);
  assert.equal(runner.step().event.reason, 'exhausted');
});

test('hazard clock ticks once per world turn and fails before simultaneous goal success', () => {
  const runner = make(program([f()]), [robot('A', 1, 2, 1, point(2, 2)), robot('B', 1, 3, 1, point(2, 3))], [],
    { hazards: [{ x: 2, y: 2, period: 2, activePhases: [1] }] });
  const s = runner.step(); assert.equal(s.status, 'failure'); assert.equal(s.event.reason, 'hazard'); assert.equal(s.movementCount, 1);
  assert.deepEqual(s.event.at, point(2, 2)); assert.deepEqual(s.event.robots, ['A']);
  assert.deepEqual(byId(s), { A: { x: 2, y: 2, dir: 1 }, B: { x: 2, y: 3, dir: 1 } });
  assert.equal(s.hazards.time, 1); assert.equal(s.steps, 2);
});

test('simultaneous hazard diagnostics and initial hazard failure ignore robot array order', () => {
  const robots = [robot('A', 1, 2, 1), robot('B', 3, 2, 1)];
  for (const activePhases of [[0], [1]]) {
    const extra = { hazards: [{ x: 1, y: 2, period: 2, activePhases }, { x: 3, y: 2, period: 2, activePhases }] };
    const normal = make(program([w()]), robots, [], extra), reversed = make(program([w()]), robots.slice().reverse(), [], extra);
    const a = activePhases[0] === 0 ? normal.snapshot() : normal.step(), b = activePhases[0] === 0 ? reversed.snapshot() : reversed.step();
    assert.equal(a.event.reason, 'hazard'); assert.deepEqual(a.event.robots, ['A', 'B']); assert.deepEqual(a.event.at, point(1, 2));
    assert.deepEqual(a.event.robots, b.event.robots); assert.deepEqual(a.event.at, b.event.at); assert.equal(a.message, b.message);
  }
});

test('rotation, waiting, cancelled movement and ended robots are all checked for hazards', () => {
  for (const command of [r(), w(), f()]) {
    const s = make(program([command]), [robot('A', 0, 2, 3)], [], { hazards: [{ x: 0, y: 2, period: 2, activePhases: [1] }] }).step();
    assert.equal(s.event.reason, 'hazard'); assert.equal(s.movementCount, 1); assert.deepEqual(s.event.at, point(0, 2));
  }
  const p = program([iff('mark', [], [w()])]);
  const s = make(p, [robot('A', 1, 2, 1), robot('B', 4, 2, 1)], [], { rows: ['.......', '.......', '.*.....', '.......', '.......'],
    hazards: [{ x: 1, y: 2, period: 2, activePhases: [1] }] }).step();
  assert.equal(s.robots[0].status, 'ended'); assert.equal(s.event.reason, 'hazard');
});

test('initial active hazards reject before code or goal checks and only-control exhaustion does not advance time', () => {
  const initial = make(program(), [robot('A', 1, 2, 1, point(1, 2))], [], { hazards: [{ x: 1, y: 2, period: 2, activePhases: [0] }] }).snapshot();
  assert.equal(initial.event.reason, 'hazard'); assert.equal(initial.movementCount, 0); assert.equal(initial.steps, 0);
  const controls = make(program([rep(2, [iff('box', [], [])]), call('F1')]), [robot('A', 1, 2, 1)]).step();
  assert.equal(controls.event.reason, 'exhausted'); assert.equal(controls.movementCount, 0); assert.equal(controls.steps, 5);
});

test('control-only nested repeats terminate at evaluation/step safety budget', () => {
  const p = program([rep(12, [rep(12, [rep(12, [])])])]);
  const runner = make(p, [robot('A', 1, 2, 1)]), s = runner.step();
  assert.equal(s.event.reason, 'limit'); assert.equal(s.steps, 1000); assert.equal(s.movementCount, 0); assert.deepEqual(runner.step(), s);
  const recursive = make(program([call('F1')], [call('F2')], [call('F1')]), [robot('A', 1, 2, 1)]).snapshot();
  assert.equal(recursive.event.reason, 'validation');
});

test('whole-turn budget failure applies no partial movement', () => {
  const fixture = level([robot('A', 1, 2, 1), robot('B', 4, 2, 1)]); fixture.maxSteps = 1;
  const s = E.createRunner(program([f()]), fixture).step();
  assert.equal(s.event.reason, 'limit'); assert.equal(s.movementCount, 0);
  assert.deepEqual(byId(s), { A: { x: 1, y: 2, dir: 1 }, B: { x: 4, y: 2, dir: 1 } });
});

test('cancel and defensive clones preserve independent program, map and snapshot data', () => {
  const p = program([f(), f()]), fixture = level([robot('A', 1, 2, 1)], [point(2, 2)]);
  p.main[0].metadata = p.main[0]; fixture.maps[0].metadata = fixture;
  const runner = E.createRunner(p, fixture); p.main[0].type = 'right'; fixture.maps[0].boxes[0].x = 5;
  const snapshot = runner.snapshot(); snapshot.robots[0].x = 5; snapshot.boxes[0].x = 6;
  assert.deepEqual(runner.step().boxes, [point(3, 2)]);
  const cancelled = runner.cancel(); assert.equal(cancelled.status, 'cancelled'); assert.deepEqual(runner.step(), cancelled);
});

test('cooperative maps reject ambiguous, overlapping, hostile or mismatched schemas', () => {
  const good = level([robot('A', 1, 2, 1), robot('B', 4, 2, 3)], [point(2, 2)]).maps[0];
  assert.equal(E.validMap(good), true);
  const cases = [
    { ...good, robots: [] }, { ...good, robots: null }, { ...good, robots: [, good.robots[1]] },
    { ...good, robots: [good.robots[0], { ...good.robots[1], id: 'A' }] },
    { ...good, robots: [good.robots[0], { ...good.robots[1], x: 1 }] },
    { ...good, robots: [{ ...good.robots[0], dir: 4 }] },
    { ...good, robots: [{ ...good.robots[0], home: point(-1, 0) }] },
    { ...good, robots: [good.robots[0], { ...good.robots[1], home: good.robots[0].home }] },
    { ...good, targets: [] }, { ...good, targets: [good.robots[0].home] },
    { ...good, boxes: [point(1, 2)] }, { ...good, boxes: [point(9, 2)] }, { ...good, boxes: [null] },
    { ...good, boxes: [point(2, 2), point(2, 2)], targets: [point(5, 4), point(6, 4)] },
    { ...good, boxes: [point(2, 2), point(3, 2)], targets: [point(5, 4), point(5, 4)] },
    { ...good, rows: ['H......', '.......', '.......', '.......', '.......'] }
  ];
  for (const map of cases) {
    assert.equal(E.validMap(map), false, JSON.stringify(map));
    assert.equal(E.createRunner(program(), { ...level([]), maps: [map] }).snapshot().event.reason, 'map');
  }
});

test('legacy single robot still fails on a wall and stops instantly on home', () => {
  const old = { unlocks: ['forward', 'right', 'wait'], maxCommands: 5, maxSteps: 20, maps: [{ rows: ['.H'], start: { x: 0, y: 0, dir: 3 } }] };
  const failure = E.createRunner(program([f(), r()]), old).step(); assert.equal(failure.status, 'failure'); assert.equal(failure.event.reason, 'collision');
  old.maps[0].start.dir = 1;
  const win = E.createRunner(program([f(), f()]), old).step(); assert.equal(win.status, 'success'); assert.equal(win.movementCount, 1); assert.equal(win.robots, undefined);
});
