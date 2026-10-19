'use strict';
// Complete finite searches, independent geometric reachability, and production
// solution replay. No search timeout is interpreted as an impossibility proof.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const levels = require('./levels.js');
const solutions = require('./solutions.cjs');
const level = id => levels.find(item => item.id === id);
let serial = 0;
const node = (type, extra = {}) => ({ id: 'proof-' + ++serial, type, ...extra });
const program = (main, F1 = []) => ({ main, F1, F2: [] });
function finish(p, l, index = 0) {
  const runner = E.createRunner(p, l, index); let state = runner.snapshot();
  for (let guard = 0; guard < 2000; guard++) {
    if (!['ready', 'running'].includes(state.status)) return state;
    state = runner.step();
  }
  throw new Error('Verifier guard exceeded: inconclusive, never a no-solution result');
}
function* words(alphabet, size, prefix = []) {
  if (!size) { yield prefix; return; }
  for (const type of alphabet) yield* words(alphabet, size - 1, prefix.concat(type));
}
function exhaustiveFlat(l, alphabet, max) {
  let tested = 0;
  for (let size = 0; size <= max; size++) for (const word of words(alphabet, size)) {
    const p = program(word.map(type => node(type))); tested++;
    assert.equal(E.validate(p, l).ok, true);
    assert.notEqual(finish(p, l).status, 'success', JSON.stringify(word));
  }
  return tested;
}
function shortestPrimitivePath(map) {
  const queue = [{ ...map.start, cost: 0 }], seen = new Set();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const s = queue[cursor], key = [s.x, s.y, s.dir].join(','); if (seen.has(key)) continue; seen.add(key);
    if (map.rows[s.y][s.x] === 'H') return s.cost;
    queue.push({ ...s, dir: (s.dir + 1) % 4, cost: s.cost + 1 }, { ...s, dir: (s.dir + 3) % 4, cost: s.cost + 1 });
    const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][s.dir], x = s.x + dx, y = s.y + dy;
    if (map.rows[y]?.[x] && map.rows[y][x] !== '#') queue.push({ x, y, dir: s.dir, cost: s.cost + 1 });
  }
  return Infinity;
}
// A complete no-condition AST grammar under a three-node budget. Empty repeat
// bodies are included, all repeat counts 2..12 are included, and sequence and
// nested-repeat shapes are enumerated. No function bank is available here.
function* loopLists(cost) {
  if (!cost) { yield []; return; }
  for (let headCost = 1; headCost <= cost; headCost++) {
    for (const head of loopNodes(headCost)) for (const tail of loopLists(cost - headCost)) yield [head, ...tail];
  }
}
function* loopNodes(cost) {
  if (cost === 1) for (const type of ['forward', 'left', 'right', 'wait']) yield { type };
  for (let count = 2; count <= 12; count++) for (const body of loopLists(cost - 1)) yield { type: 'repeat', count, body };
}
const nameNodes = list => list.map(item => node(item.type, item.type === 'repeat' ? { count: item.count, body: nameNodes(item.body) } : {}));

// This relaxed Sokoban search gives a lone A more power than the game: arbitrary
// direction changes cost nothing, no program/node/turn limits, and B is removed.
// Exhausting the finite state space without delivery therefore proves that A
// cannot do B's path-clearing work in the real, more constrained game.
function soloDeliveryReachability(map) {
  const initial = { robot: { x: map.robots[0].x, y: map.robots[0].y }, boxes: map.boxes.map(b => ({ ...b })) };
  const key = state => `${state.robot.x},${state.robot.y}|${state.boxes.map(b => `${b.x},${b.y}`).sort().join(';')}`;
  const equal = (a, b) => a.x === b.x && a.y === b.y;
  const floor = p => map.rows[p.y]?.[p.x] && map.rows[p.y][p.x] !== '#';
  const queue = [initial], seen = new Set([key(initial)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor];
    if (map.targets.every(t => state.boxes.some(b => equal(t, b)))) return { solved: true, states: seen.size };
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: state.robot.x + dx, y: state.robot.y + dy };
      if (!floor(next)) continue;
      const boxes = state.boxes.map(b => ({ ...b }));
      const index = boxes.findIndex(b => equal(b, next));
      if (index >= 0) {
        const target = { x: next.x + dx, y: next.y + dy };
        if (!floor(target) || boxes.some(b => equal(b, target))) continue;
        boxes[index] = target;
      }
      const result = { robot: next, boxes }, encoded = key(result);
      if (!seen.has(encoded)) { seen.add(encoded); queue.push(result); }
    }
  }
  return { solved: false, states: seen.size };
}

test('catalog preserves old identities and explicitly orders 24 stages / 28 maps', () => {
  assert.equal(levels.length, 24); assert.equal(levels.reduce((n, l) => n + l.maps.length, 0), 28);
  assert.equal(new Set(levels.map(l => l.id)).size, levels.length);
  assert.deepEqual(levels.filter(l => typeof l.id === 'number').map(l => l.id), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(levels.map(l => l.displayOrder), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.deepEqual(levels.map(l => l.prerequisites), levels.map((l, i) => i ? [levels[i - 1].id] : []));
  for (const l of levels) assert.ok(l.version && l.rulesVersion);
});
const newBudgets = { 'box-intro': 1, 'box-detour': 17, 'wait-beat': 2, 'condition-fork': 3, 'function-reuse': 7, 'coop-intro': 2, 'coop-gate': 13, 'coop-delivery': 4, 'coop-finale': 9 };
const newTurns = { 'box-intro': [1], 'box-detour': [17], 'wait-beat': [2], 'condition-fork': [2, 1], 'function-reuse': [8], 'coop-intro': [2], 'coop-gate': [8], 'coop-delivery': [4], 'coop-finale': [10] };
for (const [id, budget] of Object.entries(newBudgets)) test(`new stage ${id}: every map solves through production engine; exact budget and budget+1`, () => {
  const l = level(id), p = solutions[id];
  assert.equal(l.maxCommands, budget); assert.equal(E.validate(p, l).count, budget); assert.equal(E.validate(p, l).ok, true);
  assert.equal(l.hints.length, 3);
  l.maps.forEach((map, index) => {
    assert.equal(E.validMap(map), true);
    const s = finish(p, l, index);
    assert.equal(s.status, 'success', s.message); assert.equal(s.movementCount, newTurns[id][index]);
    assert.ok(s.steps <= l.maxSteps);
    if (map.robots) {
      assert.equal(s.robots.every(r => r.x === r.home.x && r.y === r.home.y), true);
      assert.equal(map.targets.every(t => s.boxes.some(b => t.x === b.x && t.y === b.y)), true);
    }
  });
  const oversized = structuredClone(p); oversized.main.push(node('forward'));
  assert.equal(E.validate(oversized, l).count, budget + 1); assert.equal(E.validate(oversized, l).ok, false);
  assert.equal(finish(oversized, l).event.reason, 'validation');
});
test('repeat is necessary on legacy level 4: all 13 no-repeat programs within two nodes fail', () => {
  assert.equal(exhaustiveFlat(level(4), ['forward', 'left', 'right'], 2), 13);
  assert.equal(finish(solutions[4], level(4)).status, 'success');
});
test('legacy 4..9 each need repetition: even hazard-free shortest paths exceed total stored nodes', () => {
  for (const [id, expected] of [[4, 5], [5, 11], [6, 20], [7, 11], [8, 8], [9, 11]]) {
    const l = level(id);
    assert.equal(l.unlocks.includes('call'), false);
    assert.equal(shortestPrimitivePath(l.maps[0]), expected);
    assert.ok(expected > l.maxCommands);
    // Without repeat/call, every physical command is visited at most once,
    // including conditional branches; it cannot exceed total stored nodes.
  }
});
test('wait-beat: every no-wait program in the disclosed two-node grammar fails', () => {
  const l = level('wait-beat'); assert.deepEqual(l.unlocks, ['forward', 'wait']);
  assert.equal(exhaustiveFlat(l, ['forward'], 2), 3);
  assert.equal(finish(solutions[l.id], l).movementCount, 2);
});
test('function-reuse: every no-call program of 0..7 primitive nodes fails (3280 programs)', () => {
  const l = level('function-reuse'); assert.deepEqual(l.unlocks, ['forward', 'left', 'right', 'call', 'F1']);
  assert.equal(exhaustiveFlat(l, ['forward', 'left', 'right'], 7), 3280);
  assert.equal(finish(solutions[l.id], l).movementCount, 8);
  // Definitions without calls are unreachable and cannot improve these traces.
  // Independent shortest path in oriented position space proves eight actions.
  const shortest = shortestPrimitivePath(l.maps[0]);
  assert.equal(shortest, 8); assert.ok(l.maxCommands < shortest);
});
test('condition-fork: complete no-if repeat grammar fails across both maps', () => {
  const l = level('condition-fork'); let tested = 0;
  for (let cost = 0; cost <= l.maxCommands; cost++) for (const shape of loopLists(cost)) {
    const p = program(nameNodes(shape)); assert.equal(E.validate(p, l).ok, true); tested++;
    assert.equal(l.maps.every((map, index) => finish(p, l, index).status === 'success'), false);
  }
  // Independent grammar count: L0=1, N1=4+11=15, L1=15,
  // N2=11*15=165, L2=15*15+165=390, N3=11*390=4290,
  // L3=15*390+165*15+4290=12615. Sum L0..L3 = 13021.
  assert.equal(tested, 13021);
});
test('gate cooperation: even relaxed exhaustive solo-A reachability cannot deliver the box', () => {
  for (const id of ['coop-gate', 'coop-finale']) {
    const result = soloDeliveryReachability(level(id).maps[0]);
    // Box x=3 admits two A cells, x=4 admits five, x=5 admits six.
    assert.equal(result.solved, false); assert.equal(result.states, 13);
    assert.deepEqual(level(id).requiredFeatures, ['push', 'cooperation']);
  }
});
test('chain challenge requires side access; the initial direct forward is blocked and consumes its turn', () => {
  const l = level('box-detour'), state = E.createRunner(program([node('forward')]), l).step();
  assert.equal(state.movementCount, 1); assert.equal(state.robot.x, 1); assert.equal(state.robot.y, 2);
  assert.deepEqual(state.boxes.map(b => ({ x: b.x, y: b.y })), l.maps[0].boxes);
  assert.equal(finish(solutions[l.id], l).status, 'success');
});
test('new introductory cooperative maps exclude hazards; finale makes an otherwise valid fast crossing fail', () => {
  for (const id of ['box-intro', 'box-detour', 'coop-intro', 'coop-gate', 'coop-delivery']) assert.ok(level(id).maps.every(map => !map.hazards?.length));
  const l = level('coop-finale');
  const p = program([node('if', { condition: 'box',
    then: [node('forward'), node('right'), node('right'), node('forward')],
    else: [node('repeat', { count: 4, body: [node('wait')] }), node('repeat', { count: 4, body: [node('forward')] })]
  })]);
  // Compress the gate's four waits/four forwards into nine stored nodes,
  // preserving its timing while respecting the published finale budget.
  assert.equal(l.maxCommands, 9);
  assert.equal(E.validate(p, l).ok, true); assert.equal(E.validate(p, l).count, 9);
  const s = finish(p, l);
  assert.equal(s.status, 'failure'); assert.equal(s.event.reason, 'hazard'); assert.equal(s.movementCount, 7);
  assert.equal(finish(solutions[l.id], l).status, 'success');
});
