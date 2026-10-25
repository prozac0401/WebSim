const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./story-engine.js');
const Store = require('./saturday-store.js');

let nextId = 0;
function memoryStorage() {
  const values = new Map();
  return { writes: 0,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { this.writes++; values.set(key, String(value)); } };
}
function create(storage = memoryStorage(), engine = E) {
  return Store.create({ storage, engine, idFactory: () => `injury-side-${++nextId}` });
}
function finishCurrent(store) {
  while (!store.resume().record.complete) {
    if (store.resume().phase === 'reaction') store.continue();
    store.commit(0);
  }
  store.continue();
  return store.resume();
}
function withoutRandom(work) {
  const original = Math.random;
  Math.random = () => { throw new Error('Saved injury side must not be sampled again.'); };
  try { return work(); } finally { Math.random = original; }
}
function canonical(value, fromLeft = false) {
  if (typeof value === 'string') return fromLeft ? value.replace(/(오른쪽|왼쪽|오른|왼)(\s*(?:발목|다리|발|허벅지|엉덩이))/g,
    (_, side, part) => ({ 오른쪽: '왼쪽', 왼쪽: '오른쪽', 오른: '왼', 왼: '오른' })[side] + part) : value;
  if (Array.isArray(value)) return value.map(item => canonical(item, fromLeft));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'injuredSide').map(([key, item]) => [key, canonical(item, fromLeft)]));
  return value;
}
function until(state, sceneId) {
  while (E.getNode(state) && E.getNode(state).sceneId !== sceneId) state = E.choose(state, 0);
  assert.equal(E.getNode(state)?.sceneId, sceneId);
  return state;
}

test('injury side is a strictly validated optional condition and legacy records keep their original shape', () => {
  for (const injuredSide of ['right', 'left']) assert.equal(E.freshState({ conditions: { injuredSide } }).initialConditions.injuredSide, injuredSide);
  for (const injuredSide of [undefined, null, true, 0, '', 'Left', 'both', ['left'], { side: 'left' }]) {
    assert.throws(() => E.normalizeStart({ conditions: { injuredSide } }), /injuredSide/);
    assert.throws(() => E.replay({ conditions: { injuredSide }, choiceIds: [] }), /injuredSide/);
  }
  assert.throws(() => E.normalizeStart({ conditions: { injuredSide: 'left', injuredArm: 'right' } }), /injuredArm/);
  for (const scenarioVersion of ['2', '3']) {
    const state = E.freshState({ scenarioVersion });
    assert.equal(Object.hasOwn(state.initialConditions, 'injuredSide'), false);
    assert.match(E.bodyDescription(state).find(part => part.key === 'ankle').label, /오른쪽 발목/);
  }
  assert.throws(() => E.freshState({ scenarioVersion: '2', conditions: { injuredSide: 'left' } }));
});

test('body labels, short labels and anatomical sides identify the injured and supporting legs', () => {
  for (const injuredSide of ['right', 'left']) {
    const state = E.freshState({ conditions: { injuredSide } });
    const parts = E.bodyDescription(state), ankle = parts.find(part => part.key === 'ankle'), leg = parts.find(part => part.key === 'goodLeg');
    const injuredPrefix = injuredSide === 'right' ? '오른' : '왼', supportPrefix = injuredSide === 'right' ? '왼' : '오른';
    assert.equal(ankle.side, injuredSide);
    assert.equal(ankle.label, `${injuredPrefix}쪽 발목`);
    assert.equal(ankle.short, `${injuredPrefix}발목`);
    assert.equal(leg.side, injuredSide === 'right' ? 'left' : 'right');
    assert.equal(leg.label, `몸을 받치는 ${supportPrefix}쪽 다리`);
    assert.equal(leg.short, `${supportPrefix}쪽 다리`);
    assert.ok(parts.filter(part => !['ankle', 'goodLeg'].includes(part.key)).every(part => part.side === null));
    state.body.goodLeg = 4;
    assert.match(E.bodyContext(state), new RegExp(`${supportPrefix}쪽 허벅지`));
  }
  const legacy = E.freshState({ scenarioVersion: '2' });
  assert.deepEqual(E.bodyDescription(legacy), E.forVersion('2').bodyDescription(legacy));
});

test('both sides have identical rules and timing while all six stories render and replay anatomical text once', () => {
  withoutRandom(() => {
    for (const scenario of E.SCENARIOS) for (const variant of [false, true]) for (let pattern = 0; pattern < 4; pattern++) {
      const conditions = { doorMode: variant ? 'revolving' : 'manual', helpStyle: variant ? 'ask' : 'takeover',
        phonePayment: variant, verticalRoute: variant ? 'escalator' : 'stairs', orderMode: variant ? 'kiosk' : 'counter',
        appearance: { gender: 'female', hairStyle: 'crop' }, roomLayout: 'window-left' };
      let right = E.freshState({ scenarioId: scenario.id, conditions: { ...conditions, injuredSide: 'right' } });
      let left = E.freshState({ scenarioId: scenario.id, conditions: { ...conditions, injuredSide: 'left' } });
      while (E.getNode(right)) {
        const rightNode = E.getNode(right), leftNode = E.getNode(left);
        assert.deepEqual(canonical(leftNode, true), canonical(rightNode));
        assert.deepEqual(E.getNode(left), leftNode, 'reading the same scene again must not reverse its anatomy');
        assert.doesNotMatch(JSON.stringify(leftNode), /\[\[(injured|support):/);
        const choiceId = rightNode.choices[pattern % rightNode.choices.length].id;
        const previous = JSON.stringify(left);
        right = E.choose(right, choiceId);
        const next = E.choose(left, choiceId);
        assert.equal(JSON.stringify(left), previous);
        left = next;
        assert.deepEqual(canonical(left, true), canonical(right), `${scenario.id}/${choiceId}`);
        assert.equal(left.initialConditions.roomLayout, 'window-left');
        assert.doesNotMatch(JSON.stringify(left), /\[\[(injured|support):/);
        assert.deepEqual(E.replay({ scenarioVersion: '3', scenarioId: scenario.id,
          conditions: left.initialConditions, choiceIds: left.choiceIds }), left);
      }
      assert.equal(left.choiceIds.length, 12);
      assert.deepEqual(canonical(E.determineEnding(left), true), E.determineEnding(right));
    }
  });
});

test('left-side injury changes cast and movement wording while preserving room and door directions', () => {
  let state = E.freshState({ conditions: { injuredSide: 'left', roomLayout: 'window-right' } });
  assert.match(E.getNode(state).lines.join(' '), /깁스를 한 왼다리/);
  state = until(state, 'morning');
  assert.match(E.getNode(state).lines.join(' '), /왼다리에 깁스.*오른발에 힘/);
  state = E.choose(state, 'morning-outside');
  assert.match(state.motion.caption, /왼발을 보호/);
  state = until(state, 'outing_lunch');
  state = E.choose(state, 'outing-stairs');
  assert.match(state.reaction.lines.join(' '), /오른쪽 허벅지/);
  assert.match(state.reaction.lines.join(' '), /몸을 받치던 오른쪽 다리/);
  assert.deepEqual(state.history.at(-1).reaction, state.reaction);
  assert.equal(state.initialConditions.roomLayout, 'window-right');
  let home = E.freshState({ scenarioId: 'home', conditions: { injuredSide: 'left' } });
  while (E.getNode(home)) home = E.choose(home, 0);
  home.context.facts = ['왼쪽 창문과 오른쪽 문을 확인했다'];
  assert.match(E.determineEnding(home).body, /왼쪽 창문과 오른쪽 문/);
});

test('injury side and side-specific journal text survive reload, branches and friend exports without rerolling', () => {
  withoutRandom(() => {
    for (const injuredSide of ['right', 'left']) {
      const storage = memoryStorage(); let store = create(storage);
      store.start({ scenarioId: 'classic', conditions: { injuredSide, roomLayout: 'window-right' } });
      for (let count = 0; count < 4; count++) { store.commit(0); store.continue(); }
      const partial = store.resume(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
      store = create(storage);
      assert.deepEqual(store.resume(), partial);
      assert.equal(storage.getItem(Store.STORAGE_KEY), raw); assert.equal(storage.writes, writes);
      const complete = finishCurrent(store), original = store.getRecord(complete.record.id);
      const portable = store.exportRecord(original.id);
      assert.equal(JSON.parse(portable).conditions.injuredSide, injuredSide);
      assert.deepEqual(store.previewImport(portable).state, complete.state);
      store.branch(original.id, 3);
      assert.equal(store.resume().state.initialConditions.injuredSide, injuredSide);
      store.commit(1); finishCurrent(store);
      assert.deepEqual(store.getRecord(original.id), original);
      const receiver = create(); receiver.importRecord(portable);
      const imported = receiver.getSnapshot().imported[0];
      assert.equal(receiver.exportRecord(imported.id), portable);
      assert.deepEqual(receiver.getRecord(imported.id).summary.history, original.summary.history);
      receiver.branch(imported.id, 8);
      assert.equal(finishCurrent(receiver).state.initialConditions.injuredSide, injuredSide);
    }
  });
});

test('old v2 and v3 saves stay untouched without gaining an injury-side field', () => {
  withoutRandom(() => {
    for (const version of ['2', '3']) {
      const storage = memoryStorage(), oldStore = create(storage, E.forVersion(version));
      oldStore.start({ scenarioId: 'classic' }); oldStore.commit(0);
      const saved = oldStore.resume(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
      const restored = create(storage);
      assert.deepEqual(restored.resume(), saved);
      assert.equal(storage.getItem(Store.STORAGE_KEY), raw); assert.equal(storage.writes, writes);
      const complete = finishCurrent(restored);
      const payload = JSON.parse(restored.exportRecord(complete.record.id));
      assert.equal(Object.hasOwn(payload.conditions, 'injuredSide'), false);
      restored.branch(complete.record.id, 2);
      assert.equal(Object.hasOwn(finishCurrent(restored).record.conditions, 'injuredSide'), false);
    }
  });
});

test('injury-side comparison records the difference but other changed gameplay conditions remain non-equivalent', () => {
  const store = create();
  const complete = conditions => { store.start({ scenarioId: 'home', conditions }); return finishCurrent(store).record; };
  const right = complete({ injuredSide: 'right' }), left = complete({ injuredSide: 'left' }), old = complete({});
  for (const other of [left, old]) {
    const comparison = store.compare(right.id, other.id);
    assert.equal(comparison.equivalent, true);
    assert.deepEqual(comparison.changedConditions, ['injuredSide']);
    assert.deepEqual(comparison.reasons, []);
  }
  const different = complete({ injuredSide: 'left', doorMode: 'automatic' });
  const comparison = store.compare(right.id, different.id);
  assert.equal(comparison.equivalent, false);
  assert.deepEqual(comparison.changedConditions, ['doorMode', 'injuredSide']);
  assert.match(comparison.reasons.join(' '), /doorMode/);
  assert.doesNotMatch(comparison.reasons.join(' '), /injuredSide/);
});

test('malformed imported injury sides do not alter saved records', () => {
  const storage = memoryStorage(), store = create(storage);
  store.start({ scenarioId: 'home', conditions: { injuredSide: 'left' } });
  const complete = finishCurrent(store), payload = JSON.parse(store.exportRecord(complete.record.id));
  const before = store.getSnapshot(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
  for (const injuredSide of [null, true, 0, 'both', ['left'], { side: 'left' }]) {
    const malformed = JSON.stringify({ ...payload, conditions: { ...payload.conditions, injuredSide } });
    assert.throws(() => store.previewImport(malformed), /injuredSide/);
    assert.throws(() => store.importRecord(malformed), /injuredSide/);
    assert.deepEqual(store.getSnapshot(), before);
    assert.equal(storage.getItem(Store.STORAGE_KEY), raw); assert.equal(storage.writes, writes);
  }
});
