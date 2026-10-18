'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const levels = require('./levels.js');
const solutions = require('./solutions.cjs');
// Hand-counted stored nodes, including containers, both branches and function
// definitions. Deliberately independent of engine counting and level metadata.
const REFERENCE_BUDGETS = Object.freeze([3, 5, 6, 2, 6, 7, 4, 5, 6, 11, 9, 7, 9, 10, 11]);
let serial = 0;
const node = (type, extra = {}) => ({ id: 'test-' + (++serial), type, ...extra });
const forward = () => node('forward'), left = () => node('left'), right = () => node('right'), wait = () => node('wait');
const repeat = (count, body) => node('repeat', { count, body });
const iff = (condition, yes, no = []) => node('if', { condition, then: yes, else: no });
const call = target => node('call', { target });
const program = (main = [], F1 = [], F2 = []) => ({ main, F1, F2 });
const fixture = (extra = {}) => ({
  unlocks: ['forward', 'left', 'right', 'wait', 'repeat', 'if', 'blocked', 'mark', 'call', 'F1', 'F2'],
  maxCommands: 128, maxSteps: 1000,
  maps: [{ rows: ['#####', '#..H#', '#.*.#', '#...#', '#####'], start: { x: 1, y: 3, dir: 0 } }], ...extra
});
function finish(runner) {
  const frames = [];
  for (let i = 0; i < 2000; i++) {
    const state = runner.step(); frames.push(state);
    if (!['ready', 'running'].includes(state.status)) return { state, frames };
  }
  throw new Error('Runner did not stop within independent 2000-event guard');
}

test('coordinates and turns match independently written positions', () => {
  const r = E.createRunner(program([forward(), right(), forward(), left(), forward()]), fixture());
  const expected = [
    { x: 1, y: 2, dir: 0 }, { x: 1, y: 2, dir: 1 }, { x: 2, y: 2, dir: 1 },
    { x: 2, y: 2, dir: 0 }, { x: 2, y: 1, dir: 0 }
  ];
  for (const robot of expected) assert.deepEqual(r.step().robot, robot);
  assert.equal(r.step().event.reason, 'exhausted');
});
test('four turns wrap exactly and turns do not translate', () => {
  for (const turn of [left, right]) {
    const r = E.createRunner(program([turn(), turn(), turn(), turn()]), fixture());
    for (let i = 0; i < 4; i++) r.step();
    assert.deepEqual(r.snapshot().robot, { x: 1, y: 3, dir: 0 });
  }
});
test('exhausted guidance encourages inspecting order without prescribing more blocks', () => {
  const { state } = finish(E.createRunner(program([right()]), fixture()));
  assert.equal(state.event.reason, 'exhausted'); assert.match(state.message, /명령의 순서/);
  assert.ok(!state.message.includes('더해'));
});
test('wall collision preserves last legal position and names attempted cell and block', () => {
  const bad = forward();
  const r = E.createRunner(program([left(), bad]), fixture()); r.step();
  const s = r.step();
  assert.equal(s.status, 'failure'); assert.equal(s.event.reason, 'collision');
  assert.deepEqual(s.robot, { x: 1, y: 3, dir: 3 }); assert.deepEqual(s.collision, { x: 0, y: 3 });
  assert.equal(s.currentId, bad.id); assert.equal(s.steps, 2); assert.deepEqual(r.step(), s);
});
test('out-of-map boundary is a wall even without a decorative wall border', () => {
  const level = fixture({ maps: [{ rows: ['.H'], start: { x: 0, y: 0, dir: 3 } }] });
  assert.equal(E.createRunner(program([forward()]), level).step().event.reason, 'collision');
});
test('early collision guidance does not mention locked conditional blocks', () => {
  const p = program([forward(), forward(), forward()]);
  const { state } = finish(E.createRunner(p, levels[1]));
  assert.equal(state.event.reason, 'collision'); assert.ok(!state.message.includes('조건'));
  assert.ok(state.message.includes('방향이나 이동 횟수'));
});
test('blocked condition independently covers true and false at evaluation time', () => {
  const p = program([iff('blocked', [left()], [right()]), iff('blocked', [left()], [right()])]);
  const r = E.createRunner(p, fixture());
  assert.equal(r.step().event.result, false); assert.equal(r.step().robot.dir, 1);
  assert.equal(r.step().event.result, false); assert.equal(r.step().robot.dir, 2);
  const trueRunner = E.createRunner(program([iff('blocked', [left()], [right()])]), fixture({ maps: [{ rows: ['.H'], start: { x: 0, y: 0, dir: 0 } }] }));
  assert.equal(trueRunner.step().event.result, true); assert.equal(trueRunner.step().robot.dir, 3);
});
test('mark condition reads the current tile after preceding movement', () => {
  const p = program([iff('mark', [right()], []), forward(), right(), forward(), iff('mark', [left()], [right()])]);
  const r = E.createRunner(p, fixture());
  assert.equal(r.step().event.result, false);
  r.step(); r.step(); r.step();
  assert.deepEqual(r.snapshot().robot, { x: 2, y: 2, dir: 1 });
  assert.equal(r.step().event.result, true); assert.equal(r.step().robot.dir, 0);
});
test('repeat counts 2 and 12 are inclusive; each iteration is a visible control step', () => {
  for (const count of [2, 12]) {
    const { state, frames } = finish(E.createRunner(program([repeat(count, [right()])]), fixture()));
    assert.equal(state.event.reason, 'exhausted'); assert.equal(state.steps, count * 2);
    assert.equal(state.robot.dir, count % 4);
    assert.deepEqual(frames.filter(s => s.event.type === 'repeat').map(s => s.event.iteration), Array.from({ length: count }, (_, i) => i + 1));
  }
});
test('nested repeats use independently expected order and count', () => {
  const { state, frames } = finish(E.createRunner(program([repeat(2, [repeat(2, [right()]), left()])]), fixture()));
  assert.deepEqual(frames.map(s => s.event.type), ['repeat', 'repeat', 'turn', 'repeat', 'turn', 'turn', 'repeat', 'repeat', 'turn', 'repeat', 'turn', 'turn', 'failure']);
  assert.equal(state.robot.dir, 2); assert.equal(state.steps, 12);
});
test('functions enter, return to caller, and then continue caller sequence', () => {
  const p = program([call('F2'), forward()], [right()], [call('F1'), left()]);
  const { state, frames } = finish(E.createRunner(p, fixture()));
  assert.deepEqual(frames.map(s => s.event.type), ['call', 'call', 'turn', 'return', 'turn', 'return', 'move', 'failure']);
  assert.deepEqual(frames.map(s => s.callStack.map(f => f.target)), [['F2'], ['F2', 'F1'], ['F2', 'F1'], ['F2'], ['F2'], [], [], []]);
  assert.deepEqual(state.robot, { x: 1, y: 2, dir: 0 }); assert.equal(state.steps, 5);
});
test('home arrival immediately stops, including during a nested function', () => {
  const p = program([call('F2'), left()], [forward(), forward()], [call('F1'), left()]);
  const level = fixture({ maps: [{ rows: ['.H'], start: { x: 0, y: 0, dir: 1 } }] });
  const r = E.createRunner(p, level), { state, frames } = finish(r);
  assert.equal(state.status, 'success'); assert.equal(state.steps, 3);
  assert.deepEqual(frames.map(s => s.event.type), ['call', 'call', 'success']);
  assert.deepEqual(r.step(), state);
});
test('step limit is exact and stops before applying the next operation', () => {
  const r = E.createRunner(program([repeat(12, [right()])]), fixture({ maxSteps: 3 }));
  r.step(); r.step(); r.step(); const s = r.step();
  assert.equal(s.event.reason, 'limit'); assert.equal(s.steps, 3); assert.equal(s.robot.dir, 1);
  assert.deepEqual(r.step(), s);
});
test('success on the last allowed step wins over limit failure', () => {
  const r = E.createRunner(program([forward()]), fixture({ maxSteps: 1, maps: [{ rows: ['.H'], start: { x: 0, y: 0, dir: 1 } }] }));
  assert.equal(r.step().status, 'success');
});
test('global execution ceiling applies even if a level asks for a larger budget', () => {
  const p = program([repeat(12, [repeat(12, [repeat(12, [right()])])])]);
  const { state } = finish(E.createRunner(p, fixture({ maxSteps: 99999 })));
  assert.equal(state.event.reason, 'limit'); assert.equal(state.steps, 1000);
});
test('cancel freezes pending execution, while a fresh runner resets without changing program', () => {
  const p = program([forward(), right()]); const original = JSON.stringify(p);
  const r = E.createRunner(p, fixture()); r.step(); const cancelled = r.cancel();
  assert.equal(cancelled.status, 'cancelled'); assert.deepEqual(r.step(), cancelled);
  const fresh = E.createRunner(p, fixture());
  assert.deepEqual(fresh.snapshot().robot, { x: 1, y: 3, dir: 0 }); assert.equal(fresh.snapshot().steps, 0);
  assert.equal(JSON.stringify(p), original);
});
test('running program and snapshots are independent from later editor mutations', () => {
  const p = program([forward()]); const r = E.createRunner(p, fixture());
  p.main[0].type = 'right'; const exposed = r.snapshot(); exposed.robot.dir = 2;
  assert.deepEqual(r.step().robot, { x: 1, y: 2, dir: 0 });
});
test('invalid, oversized, duplicate-ID, and recursive structures stop safely', () => {
  for (const p of [null, {}, program([node('javascript')]), program([null]), program([repeat(1, [])]), program([repeat(13, [])]), program([repeat(2.5, [])])]) {
    assert.equal(E.validate(p, fixture()).ok, false);
    assert.equal(E.createRunner(p, fixture()).snapshot().event.reason, 'validation');
  }
  const duplicate = forward(); assert.equal(E.validate(program([duplicate, { ...duplicate }]), fixture()).ok, false);
  assert.equal(E.validate(program(Array.from({ length: 129 }, forward)), fixture()).ok, false);
  let nested = [forward()]; for (let i = 0; i < 5; i++) nested = [repeat(2, nested)];
  assert.equal(E.validate(program(nested), fixture()).ok, false);
  const cyclic = repeat(2, []); cyclic.body.push(cyclic);
  assert.equal(E.validate(program([cyclic]), fixture()).ok, false);
});
test('four nested containers are allowed; the fifth is rejected', () => {
  let body = [forward()]; for (let i = 0; i < 4; i++) body = [repeat(2, body)];
  assert.equal(E.validate(program(body), fixture()).ok, true);
  assert.equal(E.validate(program([repeat(2, body)]), fixture()).ok, false);
});
test('direct, indirect, and unused function cycles are rejected', () => {
  for (const p of [program([call('F1')], [call('F1')]), program([call('F1')], [call('F2')], [call('F1')]), program([], [call('F2')], [call('F1')])]) {
    assert.equal(E.validate(p, fixture()).ok, false);
    assert.equal(E.createRunner(p, fixture()).step().event.reason, 'validation');
  }
});
test('locked instructions and definition banks cannot bypass level progression', () => {
  assert.equal(E.validate(program([right()]), levels[0]).ok, false);
  assert.equal(E.validate(program([], [forward()]), levels[0]).ok, false);
  assert.equal(E.validate(program([iff('mark', [], [])]), levels[6]).ok, false);
  assert.equal(E.validate(program([call('F2')]), levels[9]).ok, false);
});
test('stored-block count includes both branches and all function definitions exactly once', () => {
  const p = program([repeat(12, [iff('mark', [call('F1')], [right()])])], [forward()], [left()]);
  assert.equal(E.validate(p, fixture()).count, 6);
  assert.equal(E.validate(p, fixture({ maxCommands: 5 })).ok, false);
});
test('unknown metadata is ignored instead of serialized or executed', () => {
  const f = forward(); f.metadata = f;
  const r = E.createRunner(program([f]), fixture());
  assert.deepEqual(r.step().robot, { x: 1, y: 2, dir: 0 });
});
test('malformed maps produce friendly terminal state', () => {
  for (const map of [null, { rows: ['..'], start: { x: 0, y: 0, dir: 0 } }, { rows: ['H.', '...'], start: { x: 0, y: 0, dir: 0 } }, { rows: ['.H'], start: { x: 0, y: 0, dir: 4 } }, { rows: [, '.H'], start: { x: 0, y: 1, dir: 0 } }, { rows: ['.H', ,], start: { x: 0, y: 0, dir: 0 } }]) {
    assert.equal(E.createRunner(program(), fixture({ maps: [map] })).snapshot().event.reason, 'map');
  }
});

const timedMap = (hazards, extra = {}) => ({ rows: ['...H'], start: { x: 0, y: 0, dir: 1 }, hazards, ...extra });
const hazard = (x, activePhases = [1], period = 2) => ({ x, y: 0, period, activePhases });

test('hazard phases and next-phase preview match a hand-written periodic schedule', () => {
  const map = timedMap([hazard(1, [0, 2], 3), hazard(2, [1], 2)]), original = JSON.stringify(map);
  const expected = [[1], [2], [1], [1, 2], [], [1, 2]];
  for (let time = 0; time < expected.length; time++) {
    const state = E.hazardState(map, time);
    assert.equal(state.time, time); assert.deepEqual(state.active.map(cell => cell.x), expected[time]);
    if (time + 1 < expected.length) assert.deepEqual(state.nextActive.map(cell => cell.x), expected[time + 1]);
    assert.equal(state.cells[0].phase, time % 3);
  }
  const exposed = E.hazardState(map, 0); exposed.cells[0].active = false; exposed.active[0].x = 99;
  assert.equal(JSON.stringify(map), original); assert.deepEqual(E.hazardState(map, 0).active, [{ x: 1, y: 0 }]);
  for (const time of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '1']) assert.equal(E.hazardState(map, time).time, 0);
  assert.equal(E.hazardState(map, Number.MAX_SAFE_INTEGER).cells[0].nextPhase, 2);
});

test('entering an active cell fails after movement and identifies the exact command, time and cell', () => {
  const f = forward(), r = E.createRunner(program([f, forward()]), fixture({ maps: [timedMap([hazard(1)])] }));
  assert.equal(r.snapshot().movementCount, 0);
  const s = r.step();
  assert.equal(s.status, 'failure'); assert.equal(s.event.reason, 'hazard'); assert.equal(s.event.action, 'move');
  assert.equal(s.steps, 1); assert.equal(s.movementCount, 1); assert.equal(s.event.time, 1);
  assert.equal(s.currentId, f.id); assert.deepEqual(s.event.at, { x: 1, y: 0 }); assert.deepEqual(s.robot, { x: 1, y: 0, dir: 1 });
  assert.equal(s.collision, null); assert.deepEqual(s.hazards.active, [{ x: 1, y: 0 }]); assert.deepEqual(r.step(), s);
});

test('one wait shifts crossing safely and leaving a cell before it activates is allowed', () => {
  const r = E.createRunner(program([wait(), forward(), forward(), forward()]), fixture({ maps: [timedMap([hazard(1)])] }));
  const states = [r.step(), r.step(), r.step(), r.step()];
  assert.deepEqual(states.map(s => [s.robot.x, s.movementCount, s.status]), [[0, 1, 'running'], [1, 2, 'running'], [2, 3, 'running'], [3, 4, 'success']]);
  assert.equal(states[0].event.type, 'wait'); assert.equal(states[0].steps, 1);
  assert.deepEqual(states[2].hazards.active, [{ x: 1, y: 0 }], 'the cell just left may activate after departure');
});

test('turning or waiting on a newly active cell fails even without translation', () => {
  for (const command of [right, left, wait]) {
    const r = E.createRunner(program([command()]), fixture({ maps: [timedMap([hazard(0)])] }));
    const s = r.step(); assert.equal(s.event.reason, 'hazard'); assert.equal(s.movementCount, 1);
    assert.deepEqual(s.event.at, { x: 0, y: 0 });
    assert.equal(s.robot.dir, command === right ? 2 : command === left ? 0 : 1);
  }
});

test('time-zero start hazards fail before all execution, including a start on home', () => {
  for (const rows of [['...H'], ['H...']]) {
    const r = E.createRunner(program([wait()]), fixture({ maps: [timedMap([hazard(0, [0])], { rows })] }));
    const s = r.snapshot(); assert.equal(s.status, 'failure'); assert.equal(s.event.reason, 'hazard');
    assert.equal(s.event.action, 'start'); assert.equal(s.movementCount, 0); assert.equal(s.steps, 0); assert.equal(s.currentId, null);
    assert.deepEqual(r.step(), s);
  }
});

test('a hazard on home wins over arrival, while the same destination at a safe phase succeeds', () => {
  const level = fixture({ maps: [timedMap([hazard(1)], { rows: ['.H'] })] });
  const failed = E.createRunner(program([forward()]), level).step();
  assert.equal(failed.event.reason, 'hazard'); assert.equal(failed.robot.x, 1); assert.equal(failed.status, 'failure');
  const { state } = finish(E.createRunner(program([wait(), forward()]), level));
  assert.equal(state.status, 'success'); assert.equal(state.movementCount, 2);
});

test('repeats, branches, calls and returns do not advance hazard time', () => {
  const p = program([repeat(2, [call('F1')])], [iff('blocked', [], [wait()])]);
  const { state, frames } = finish(E.createRunner(p, fixture({ maps: [timedMap([hazard(1)], { rows: ['.H'] })] })));
  assert.deepEqual(frames.map(s => s.event.type), ['repeat', 'call', 'condition', 'wait', 'return', 'repeat', 'call', 'condition', 'wait', 'return', 'failure']);
  assert.deepEqual(frames.map(s => s.movementCount), [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2]);
  assert.equal(state.steps, 8); assert.equal(state.event.reason, 'exhausted');
  assert.equal(frames[7].event.result, false, 'an active hazard ahead is still not a wall');
});

test('wall collisions consume one action tick and report collision before a current-cell hazard', () => {
  const r = E.createRunner(program([forward()]), fixture({ maps: [timedMap([hazard(0)], { start: { x: 0, y: 0, dir: 0 } })] }));
  const s = r.step(); assert.equal(s.event.reason, 'collision'); assert.equal(s.movementCount, 1); assert.equal(s.steps, 1);
  assert.deepEqual(s.hazards.active, [{ x: 0, y: 0 }]); assert.deepEqual(s.robot, { x: 0, y: 0, dir: 0 });
});

test('wait is one saved node and one executed action, remains locked until offered, and obeys execution limits', () => {
  assert.equal(E.validate(program([wait()]), fixture()).count, 1);
  assert.equal(E.validate(program([wait()]), levels[0]).ok, false);
  const r = E.createRunner(program([wait(), wait()]), fixture({ maxSteps: 1 }));
  assert.equal(r.step().movementCount, 1); const limited = r.step();
  assert.equal(limited.event.reason, 'limit'); assert.equal(limited.movementCount, 1); assert.equal(limited.steps, 1);
});

test('cancel freezes hazard time and fresh/reset/map-transition runners each start at time zero', () => {
  const p = program([wait(), forward()]);
  const level = fixture({ maps: [timedMap([hazard(1)]), timedMap([hazard(2, [0], 3)])] });
  const r = E.createRunner(p, level); r.step(); const cancelled = r.cancel();
  assert.equal(cancelled.movementCount, 1); assert.deepEqual(r.step(), cancelled);
  for (const mapIndex of [0, 1]) {
    const fresh = E.createRunner(p, level, mapIndex).snapshot();
    assert.equal(fresh.movementCount, 0); assert.equal(fresh.steps, 0); assert.equal(fresh.status, 'ready');
    assert.deepEqual(fresh.hazards.active, mapIndex === 0 ? [] : [{ x: 2, y: 0 }]);
  }
});

test('running hazard maps and returned previews are isolated from later source mutations', () => {
  const map = timedMap([hazard(1)]), r = E.createRunner(program([forward()]), fixture({ maps: [map] }));
  map.hazards[0].activePhases.length = 0; map.rows[0] = 'H...';
  const preview = r.snapshot(); preview.hazards.nextActive[0].x = 3; preview.hazards.cells[0].nextActive = false;
  assert.equal(r.step().event.reason, 'hazard');
});

test('invalid hazard coordinates, periods, phase lists and duplicate cells fail map validation safely', () => {
  const invalid = [null, {}, 'hazards', [null], new Array(1), [hazard(1, new Array(1))], [hazard(-1)], [hazard(4)], [{ ...hazard(1), y: 1 }],
    [hazard(1, [1], 1)], [hazard(1, [1], 13)], [hazard(1, [1], 2.5)], [hazard(1, [], 2)],
    [hazard(1, [2], 2)], [hazard(1, [-1], 2)], [hazard(1, [0.5], 2)], [hazard(1, [1, 1], 2)],
    [hazard(1), hazard(1, [0])], Array.from({ length: 901 }, () => hazard(1))];
  for (const hazards of invalid) {
    const map = timedMap(hazards); assert.equal(E.validMap(map), false);
    assert.equal(E.createRunner(program(), fixture({ maps: [map] })).snapshot().event.reason, 'map');
    assert.deepEqual(E.hazardState(map, 1), { time: 1, cells: [], active: [], nextActive: [] });
  }
  assert.equal(E.validMap(timedMap([hazard(1)], { rows: ['.#.H'] })), false);
  assert.equal(E.validMap(timedMap([hazard(1, [0, 1])])), true, 'always-active cells are valid, though unsafe to enter');
  assert.equal(E.validMap(timedMap([hazard(1)], { rows: ['.*.H'] })), true);
});
test('levels expose exactly 12 core levels and 3 post-core challenges', () => {
  assert.deepEqual(levels.map(l => l.id), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(levels.map(l => l.chapter), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]);
  assert.ok(levels.some(l => l.id >= 10 && l.maps.length > 1));
  assert.equal(levels.reduce((total, level) => total + level.maps.length, 0), 18);
});
test('each hard stored-block budget matches the independently counted reference budget', () => {
  assert.deepEqual(levels.map(level => level.maxCommands), REFERENCE_BUDGETS);
  assert.deepEqual(levels.map(level => E.validate(solutions[level.id], level).count), REFERENCE_BUDGETS);
});
test('reference budgets limit total nodes without imposing per-type quotas or requiring the reference structure', () => {
  // Level 2's reference has no left turns. Three left turns still form a legal
  // program below its five-node budget, even though that program does not win.
  const checked = E.validate(program([left(), left(), left()]), levels[1]);
  assert.equal(checked.ok, true); assert.equal(checked.count, 3);
  // A direct timed wall follower also solves both level-12 maps with five
  // saved nodes, below its seven-node function reference. The budget is a cap.
  const alternate = program([repeat(12, [iff('blocked', [right()], [wait(), forward()])])]);
  assert.equal(E.validate(alternate, levels[11]).count, 5);
  for (let mapIndex = 0; mapIndex < 2; mapIndex++) {
    assert.equal(finish(E.createRunner(alternate, levels[11], mapIndex)).state.status, 'success');
  }
});

for (const level of levels) test('reference level ' + level.id + ': all maps solved with one unchanged program inside limits', () => {
  const p = solutions[level.id], serialized = JSON.stringify(p), checked = E.validate(p, level);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  assert.equal(checked.count, REFERENCE_BUDGETS[level.id - 1]);
  assert.equal(checked.count, level.maxCommands);
  assert.equal(level.hints.length, 3);
  for (let mapIndex = 0; mapIndex < level.maps.length; mapIndex++) {
    const map = level.maps[mapIndex]; assert.equal(E.validMap(map), true);
    const { state } = finish(E.createRunner(p, level, mapIndex));
    assert.equal(state.status, 'success', 'map ' + mapIndex + ': ' + state.message);
    assert.equal(map.rows[state.robot.y][state.robot.x], 'H'); assert.ok(state.steps <= level.maxSteps);
    assert.equal(JSON.stringify(p), serialized);
  }
});

for (const level of levels) test('reference level ' + level.id + ': one extra saved block is rejected before any execution', () => {
  const oversized = JSON.parse(JSON.stringify(solutions[level.id]));
  // Appending after the winning code also proves that unreachable trailing
  // commands count toward the stored budget; reaching home cannot bypass it.
  oversized.main.push({ id: 'over-budget-' + level.id, type: 'forward' });
  const checked = E.validate(oversized, level);
  assert.equal(checked.count, REFERENCE_BUDGETS[level.id - 1] + 1);
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.errors, ['이 레벨은 저장 블록 ' + level.maxCommands + '개까지 사용할 수 있어요.']);
  for (let mapIndex = 0; mapIndex < level.maps.length; mapIndex++) {
    const runner = E.createRunner(oversized, level, mapIndex), rejected = runner.snapshot();
    assert.equal(rejected.status, 'failure'); assert.equal(rejected.event.reason, 'validation');
    assert.equal(rejected.steps, 0); assert.deepEqual(rejected.robot, level.maps[mapIndex].start);
    assert.deepEqual(runner.step(), rejected);
  }
});
