'use strict';
// Level-design regressions. Expected cells/ticks below were worked out by hand;
// reference solvability alone cannot demonstrate that timing matters.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const levels = require('./levels.js');
const solutions = require('./solutions.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
function finish(program, level, mapIndex = 0) {
  const runner = E.createRunner(program, level, mapIndex); let state = runner.snapshot();
  for (let step = 0; step < 1200 && !['success', 'failure', 'cancelled'].includes(state.status); step++) state = runner.step();
  return state;
}
function withoutWait(program) {
  function clean(list) { return list.filter(node => node.type !== 'wait').map(node => {
    const copy = { ...node }; for (const branch of ['body', 'then', 'else']) if (node[branch]) copy[branch] = clean(node[branch]); return copy;
  }); }
  return Object.fromEntries(['main', 'F1', 'F2'].map(scope => [scope, clean(program[scope])]));
}
function hazardFailure(state, x, y, time) {
  assert.equal(state.status, 'failure'); assert.equal(state.event.reason, 'hazard');
  assert.deepEqual({ x: state.robot.x, y: state.robot.y }, { x, y }); assert.equal(state.movementCount, time);
}

test('timed hazards are introduced in four selected levels, with waiting unlocked from level 5', () => {
  assert.deepEqual(levels.filter(level => level.maps.some(map => map.hazards?.length)).map(level => level.id), [5, 8, 12, 15]);
  assert.equal(levels.flatMap(level => level.maps).flatMap(map => map.hazards || []).length, 13);
  for (const level of levels) assert.equal(level.unlocks.includes('wait'), level.id >= 5);
});

test('level 5 needs the safe departure phase: first move fails at tick 1, wait then staircase wins at tick 12', () => {
  const level = levels[4]; hazardFailure(finish(withoutWait(solutions[5]), level), 2, 1, 1);
  const state = finish(solutions[5], level); assert.equal(state.status, 'success'); assert.equal(state.steps, 15); assert.equal(state.movementCount, 12);
  assert.equal(E.validate(solutions[5], level).count, 6);
});

test('level 8 combines marker decisions with waiting before the timed crossing', () => {
  const level = levels[7]; hazardFailure(finish(withoutWait(solutions[8]), level), 3, 2, 4);
  const state = finish(solutions[8], level); assert.equal(state.status, 'success'); assert.equal(state.steps, 22); assert.equal(state.movementCount, 10);
});

for (const [index, failedTime, successTime, executed] of [[0, 2, 20, 54], [1, 3, 16, 44]]) {
  test(`level 12 map ${index + 1}: the same waiting function handles a different distance and hazard phase`, () => {
    const level = levels[11]; hazardFailure(finish(withoutWait(solutions[12]), level, index), 3, 1, failedTime);
    const state = finish(solutions[12], level, index); assert.equal(state.status, 'success'); assert.equal(state.movementCount, successTime); assert.equal(state.steps, executed);
  });
}

for (const [index, firstCell, laterCell, laterTime, successTime, executed] of [
  [0, [2, 6], [4, 4], 9, 40, 137], [1, [1, 6], [3, 4], 8, 40, 137], [2, [9, 1], [8, 1], 4, 43, 148]
]) {
  test(`level 15 map ${index + 1}: one beat or only a delayed start fails; repeated two-beat pacing succeeds`, () => {
    const level = levels[14];
    hazardFailure(finish(withoutWait(solutions[15]), level, index), ...firstCell, 1);
    const oneBeat = clone(solutions[15]); oneBeat.F1[0].count = 1;
    // Repeat has a minimum of two: replace it with one ordinary wait so this
    // probes hazard timing, not repeat-count validation.
    oneBeat.F1.splice(0, 1, oneBeat.F1[0].body[0]);
    hazardFailure(finish(oneBeat, level, index), ...firstCell, 2);
    const departureOnly = clone(solutions[15]);
    const waiting = departureOnly.F1.shift(); departureOnly.main.unshift(waiting);
    assert.equal(E.validate(departureOnly, level).ok, true);
    hazardFailure(finish(departureOnly, level, index), ...laterCell, laterTime);
    const state = finish(solutions[15], level, index); assert.equal(state.status, 'success'); assert.equal(state.movementCount, successTime); assert.equal(state.steps, executed);
  });
}
