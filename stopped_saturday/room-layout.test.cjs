const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./story-engine.js');
const Store = require('./saturday-store.js');

const roomLayouts = ['window-left', 'window-right', 'wide-living', 'compact-studio'];
let nextId = 0;
function memoryStorage() {
  const values = new Map();
  return {
    writes: 0,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { this.writes++; values.set(key, String(value)); }
  };
}
function create(storage = memoryStorage(), engine = E) {
  return Store.create({ storage, engine, idFactory: () => `room-test-${++nextId}` });
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
  Math.random = () => { throw new Error('Stored rooms must not be drawn again.'); };
  try { return work(); } finally { Math.random = original; }
}
function withoutRoom(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.initialConditions.roomLayout;
  return copy;
}

test('room layout is optional, accepts only four names and leaves old conditions unchanged', () => {
  for (const roomLayout of roomLayouts) {
    const input = Object.freeze({ roomLayout });
    assert.equal(E.normalizeStart({ conditions: input }).conditions.roomLayout, roomLayout);
    assert.equal(E.freshState({ conditions: input }).initialConditions.roomLayout, roomLayout);
  }
  for (const roomLayout of [undefined, null, true, 1, '', 'Window-left', 'other-room', [], ['window-left'], { id: 'window-left' }]) {
    assert.throws(() => E.normalizeStart({ conditions: { roomLayout } }), /roomLayout/);
    assert.throws(() => E.replay({ conditions: { roomLayout }, choiceIds: [] }), /roomLayout/);
  }
  assert.throws(() => E.normalizeStart({ conditions: { roomLayout: 'window-left', roomSize: 'large' } }), /roomSize/);
  for (const scenarioVersion of ['2', '3']) {
    const state = E.freshState({ scenarioVersion });
    assert.equal(Object.hasOwn(state.initialConditions, 'roomLayout'), false);
    assert.deepEqual(state.initialConditions, { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false });
  }
  assert.throws(() => E.freshState({ scenarioVersion: '2', conditions: { roomLayout: 'window-left' } }));
});

test('all room layouts preserve every action, clock and ending in all six stories', () => {
  withoutRandom(() => {
    for (const scenario of E.SCENARIOS) for (const roomLayout of roomLayouts) {
      const conditions = { doorMode: 'revolving', helpStyle: 'ask', phonePayment: true,
        verticalRoute: 'escalator', orderMode: 'kiosk', appearance: { gender: 'female', hairStyle: 'crop' } };
      let baseline = E.freshState({ scenarioId: scenario.id, conditions });
      let actual = E.freshState({ scenarioId: scenario.id, conditions: { ...conditions, roomLayout } });
      while (E.getNode(actual)) {
        assert.deepEqual(E.getNode(actual), E.getNode(baseline));
        const choiceId = E.getNode(actual).choices[0].id;
        baseline = E.choose(baseline, choiceId);
        actual = E.choose(actual, choiceId);
        assert.equal(actual.initialConditions.roomLayout, roomLayout);
        assert.deepEqual(withoutRoom(actual), baseline);
        assert.deepEqual(E.replay({ scenarioVersion: '3', scenarioId: scenario.id, conditions: actual.initialConditions, choiceIds: actual.choiceIds }), actual);
      }
      assert.equal(actual.choiceIds.length, 12);
      assert.deepEqual(E.determineEnding(actual), E.determineEnding(baseline));
    }
  });
});

test('room layout survives partial reload, completed journals, branches and friend records', () => {
  withoutRandom(() => {
    for (const roomLayout of roomLayouts) {
      const storage = memoryStorage();
      let store = create(storage);
      store.start({ scenarioId: 'home', conditions: { roomLayout, appearance: { gender: 'male', hairStyle: 'bun' } } });
      for (let index = 0; index < 3; index++) { store.commit(0); store.continue(); }
      const partial = store.resume(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
      store = create(storage);
      assert.deepEqual(store.resume(), partial);
      assert.equal(storage.getItem(Store.STORAGE_KEY), raw);
      assert.equal(storage.writes, writes);
      const completed = finishCurrent(store), original = store.getRecord(completed.record.id);
      assert.equal(original.conditions.roomLayout, roomLayout);
      const portable = store.exportRecord(original.id);
      assert.equal(JSON.parse(portable).conditions.roomLayout, roomLayout);
      assert.deepEqual(store.previewImport(portable).state, completed.state);
      store.branch(original.id, 4);
      assert.equal(store.resume().state.initialConditions.roomLayout, roomLayout);
      store.commit(1);
      assert.equal(finishCurrent(store).record.conditions.roomLayout, roomLayout);
      assert.deepEqual(store.getRecord(original.id), original);
      const receiver = create();
      receiver.importRecord(portable);
      const imported = receiver.getSnapshot().imported[0];
      assert.equal(imported.conditions.roomLayout, roomLayout);
      assert.equal(receiver.exportRecord(imported.id), portable);
      receiver.branch(imported.id, 8);
      assert.equal(finishCurrent(receiver).state.initialConditions.roomLayout, roomLayout);
      const backup = JSON.parse(store.exportBackup());
      assert.equal(backup.localData.completed[0].conditions.roomLayout, roomLayout);
      assert.equal(backup.localData.replays[0].conditions.roomLayout, roomLayout);
    }
  });
});

test('v2 and existing v3 records without a room keep their exact stored form on reload', () => {
  withoutRandom(() => {
    for (const [version, conditions] of [['2', {}], ['3', {}], ['3', { appearance: { gender: 'female', hairStyle: 'bob' } }]]) {
      const storage = memoryStorage(), originalStore = create(storage, E.forVersion(version));
      originalStore.start({ scenarioId: 'home', conditions });
      originalStore.commit(0);
      const saved = originalStore.resume(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
      const restored = create(storage);
      assert.deepEqual(restored.resume(), saved);
      assert.equal(storage.getItem(Store.STORAGE_KEY), raw);
      assert.equal(storage.writes, writes);
      const completed = finishCurrent(restored), portable = restored.exportRecord(completed.record.id);
      assert.equal(Object.hasOwn(completed.record.conditions, 'roomLayout'), false);
      assert.equal(Object.hasOwn(JSON.parse(portable).conditions, 'roomLayout'), false);
      assert.equal(Object.hasOwn(restored.previewImport(portable).state.initialConditions, 'roomLayout'), false);
      restored.branch(completed.record.id, 2);
      assert.equal(Object.hasOwn(finishCurrent(restored).record.conditions, 'roomLayout'), false);
    }
  });
});

test('room and appearance differences stay visible in comparison without changing gameplay equivalence', () => {
  const store = create();
  const complete = conditions => {
    store.start({ scenarioId: 'home', conditions });
    return finishCurrent(store).record;
  };
  const original = complete({ roomLayout: 'window-left', appearance: { gender: 'female', hairStyle: 'crop' } });
  const roomOnly = complete({ roomLayout: 'wide-living', appearance: { gender: 'female', hairStyle: 'crop' } });
  const cosmetics = complete({ roomLayout: 'compact-studio', appearance: { gender: 'male', hairStyle: 'bun' } });
  const withoutLayout = complete({ appearance: { gender: 'female', hairStyle: 'crop' } });
  for (const [other, changed] of [[roomOnly, ['roomLayout']], [cosmetics, ['roomLayout', 'appearance']], [withoutLayout, ['roomLayout']]]) {
    const comparison = store.compare(original.id, other.id);
    assert.equal(comparison.equivalent, true);
    assert.deepEqual(comparison.reasons, []);
    assert.deepEqual(comparison.changedConditions, changed);
    assert.deepEqual(comparison.differences.choices, []);
  }
  const differentDoor = complete({ doorMode: 'automatic', roomLayout: 'window-right', appearance: { gender: 'male', hairStyle: 'bob' } });
  const comparison = store.compare(original.id, differentDoor.id);
  assert.equal(comparison.equivalent, false);
  assert.deepEqual(comparison.changedConditions, ['doorMode', 'roomLayout', 'appearance']);
  assert.equal(comparison.reasons.length, 1);
  assert.match(comparison.reasons[0], /doorMode/);
  assert.doesNotMatch(comparison.reasons[0], /roomLayout|appearance/);
});

test('invalid room imports fail before changing records or storage', () => {
  const storage = memoryStorage(), store = create(storage);
  store.start({ scenarioId: 'home', conditions: { roomLayout: 'window-right' } });
  const completed = finishCurrent(store), payload = JSON.parse(store.exportRecord(completed.record.id));
  const before = store.getSnapshot(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
  for (const roomLayout of [null, true, 3, '', 'other-room', ['window-left'], { roomLayout: 'window-left' }]) {
    const malformed = JSON.stringify({ ...payload, conditions: { ...payload.conditions, roomLayout } });
    assert.throws(() => store.previewImport(malformed), /roomLayout/);
    assert.throws(() => store.importRecord(malformed), /roomLayout/);
    assert.deepEqual(store.getSnapshot(), before);
    assert.equal(storage.getItem(Store.STORAGE_KEY), raw);
    assert.equal(storage.writes, writes);
  }
});
