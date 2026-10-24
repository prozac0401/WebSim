const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./story-engine.js');
const Store = require('./saturday-store.js');

const appearances = ['male', 'female'].flatMap(gender =>
  ['crop', 'side-part', 'wavy', 'bob', 'ponytail', 'bun'].map(hairStyle => ({ gender, hairStyle })));
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
  return Store.create({ storage, engine, idFactory: () => `appearance-test-${++nextId}` });
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
  Math.random = () => { throw new Error('Stored appearance must never be drawn again.'); };
  try { return work(); } finally { Math.random = original; }
}
function withoutAppearance(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.initialConditions.appearance;
  return copy;
}

test('appearance normalization accepts all combinations, copies the input, and remains optional', () => {
  for (const appearance of appearances) {
    const supplied = { appearance: { ...appearance } };
    const normalized = E.normalizeStart({ conditions: supplied });
    assert.deepEqual(normalized.conditions.appearance, appearance);
    assert.notEqual(normalized.conditions.appearance, supplied.appearance);
    supplied.appearance.hairStyle = 'changed-after-normalization';
    assert.deepEqual(normalized.conditions.appearance, appearance);
  }
  for (const scenarioVersion of ['2', '3']) {
    const state = E.freshState({ scenarioVersion });
    assert.equal(Object.hasOwn(state.initialConditions, 'appearance'), false);
    assert.deepEqual(state.initialConditions, { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false });
  }
  const input = Object.freeze({ appearance: Object.freeze({ gender: 'female', hairStyle: 'crop' }) });
  assert.deepEqual(E.freshState({ conditions: input }).initialConditions.appearance, input.appearance);
});

test('appearance rejects malformed objects, unknown fields and unsupported values', () => {
  const invalid = [null, undefined, true, 1, 'female', [], new Date(), {},
    { gender: 'female' }, { hairStyle: 'bob' },
    { gender: 'female', hairStyle: 'bob', color: 'black' },
    { gender: 'other', hairStyle: 'bob' }, { gender: 'Female', hairStyle: 'bob' },
    { gender: 0, hairStyle: 'bob' }, { gender: 'male', hairStyle: 'short' },
    { gender: 'male', hairStyle: ['crop'] },
    Object.create({ gender: 'male', hairStyle: 'crop' })];
  for (const appearance of invalid) {
    assert.throws(() => E.normalizeStart({ conditions: { appearance } }), /외형/);
    assert.throws(() => E.replay({ scenarioId: 'home', conditions: { appearance }, choiceIds: [] }), /외형/);
  }
  assert.throws(() => E.normalizeStart({ conditions: { appearance: appearances[0], outfit: 'blue' } }), /허용하지 않는 조건/);
  assert.throws(() => E.freshState({ scenarioVersion: '2', conditions: { appearance: appearances[0] } }));
});

test('all six stories retain any appearance through twelve choices and prefix replays without changing outcomes', () => {
  withoutRandom(() => {
    for (const scenario of E.SCENARIOS) for (const appearance of appearances) {
      const conditions = { doorMode: 'revolving', helpStyle: 'ask', phonePayment: true, verticalRoute: 'escalator', orderMode: 'kiosk' };
      let baseline = E.freshState({ scenarioId: scenario.id, conditions });
      let actual = E.freshState({ scenarioId: scenario.id, conditions: { ...conditions, appearance } });
      while (E.getNode(actual)) {
        const choiceId = E.getNode(actual).choices[0].id;
        baseline = E.choose(baseline, choiceId);
        actual = E.choose(actual, choiceId);
        assert.deepEqual(actual.initialConditions.appearance, appearance);
        assert.deepEqual(withoutAppearance(actual), baseline);
        assert.deepEqual(E.replay({ scenarioVersion: '3', scenarioId: scenario.id, conditions: actual.initialConditions, choiceIds: actual.choiceIds }), actual);
      }
      assert.equal(actual.choiceIds.length, 12);
      assert.deepEqual(E.determineEnding(actual), E.determineEnding(baseline));
    }
  });
});

test('appearance survives save reload, journal, branch, friend export and import', () => {
  withoutRandom(() => {
    for (const appearance of appearances) {
      const storage = memoryStorage();
      let store = create(storage);
      store.start({ scenarioId: 'doors', conditions: { appearance } });
      for (let index = 0; index < 4; index++) { store.commit(0); store.continue(); }
      const beforeReload = store.resume(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
      store = create(storage);
      assert.deepEqual(store.resume(), beforeReload);
      assert.equal(storage.getItem(Store.STORAGE_KEY), raw);
      assert.equal(storage.writes, writes);
      const completed = finishCurrent(store), original = store.getRecord(completed.record.id);
      assert.deepEqual(original.conditions.appearance, appearance);
      assert.deepEqual(completed.state.initialConditions.appearance, appearance);
      const portable = store.exportRecord(original.id);
      assert.deepEqual(JSON.parse(portable).conditions.appearance, appearance);
      assert.deepEqual(store.previewImport(portable).state, completed.state);
      store.branch(original.id, 4);
      assert.deepEqual(store.resume().record.conditions.appearance, appearance);
      assert.deepEqual(store.resume().state.initialConditions.appearance, appearance);
      store.commit(1);
      const branch = finishCurrent(store);
      assert.deepEqual(branch.record.conditions.appearance, appearance);
      assert.deepEqual(store.getRecord(original.id), original);
      const receivingStore = create();
      receivingStore.importRecord(portable);
      const imported = receivingStore.getSnapshot().imported[0];
      assert.deepEqual(imported.conditions.appearance, appearance);
      assert.equal(receivingStore.exportRecord(imported.id), portable);
      receivingStore.branch(imported.id, 8);
      assert.deepEqual(finishCurrent(receivingStore).state.initialConditions.appearance, appearance);
      const backup = JSON.parse(store.exportBackup());
      assert.deepEqual(backup.localData.completed[0].conditions.appearance, appearance);
      assert.deepEqual(backup.localData.replays[0].conditions.appearance, appearance);
    }
  });
});

test('old v2 and v3 records stay byte-for-byte untouched on restore and receive no appearance', () => {
  withoutRandom(() => {
    for (const version of ['2', '3']) {
      const storage = memoryStorage(), oldStore = create(storage, E.forVersion(version));
      oldStore.start({ scenarioId: 'home' });
      oldStore.commit(0);
      const saved = oldStore.resume(), raw = storage.getItem(Store.STORAGE_KEY), writes = storage.writes;
      const restored = create(storage);
      assert.deepEqual(restored.resume(), saved);
      assert.equal(storage.getItem(Store.STORAGE_KEY), raw);
      assert.equal(storage.writes, writes);
      assert.equal(Object.hasOwn(restored.resume().record.conditions, 'appearance'), false);
      const completed = finishCurrent(restored);
      const portable = restored.exportRecord(completed.record.id);
      assert.equal(Object.hasOwn(JSON.parse(portable).conditions, 'appearance'), false);
      assert.equal(Object.hasOwn(restored.previewImport(portable).state.initialConditions, 'appearance'), false);
      restored.branch(completed.record.id, 2);
      assert.equal(Object.hasOwn(finishCurrent(restored).record.conditions, 'appearance'), false);
    }
  });
});

test('friend imports reject invalid nested appearance without changing saved records', () => {
  const store = create();
  store.start({ scenarioId: 'home', conditions: { appearance: { gender: 'female', hairStyle: 'crop' } } });
  const completed = finishCurrent(store);
  const payload = JSON.parse(store.exportRecord(completed.record.id));
  const before = store.getSnapshot();
  for (const appearance of [null, [], { gender: 'male' }, { gender: 'male', hairStyle: 'unsupported' },
    { gender: 'female', hairStyle: 'bun', nickname: 'unexpected' }]) {
    const malformed = JSON.stringify({ ...payload, conditions: { ...payload.conditions, appearance } });
    assert.throws(() => store.previewImport(malformed), /외형/);
    assert.throws(() => store.importRecord(malformed), /외형/);
    assert.deepEqual(store.getSnapshot(), before);
  }
});

test('comparison reports appearance changes without treating them as different gameplay conditions', () => {
  const store = create();
  const complete = conditions => {
    store.start({ scenarioId: 'home', conditions });
    return finishCurrent(store).record;
  };
  const original = complete({ appearance: { gender: 'female', hairStyle: 'crop' } });
  const anotherAppearance = complete({ appearance: { gender: 'male', hairStyle: 'bun' } });
  const oldWithoutAppearance = complete({});
  for (const other of [anotherAppearance, oldWithoutAppearance]) {
    const comparison = store.compare(original.id, other.id);
    assert.equal(comparison.equivalent, true);
    assert.deepEqual(comparison.reasons, []);
    assert.deepEqual(comparison.changedConditions, ['appearance']);
    assert.deepEqual(comparison.differences.choices, []);
    assert.deepEqual(comparison.left.state.body, comparison.right.state.body);
    assert.equal(comparison.left.summary.endingName, comparison.right.summary.endingName);
  }
  const changedDoor = complete({ doorMode: 'automatic', appearance: { gender: 'male', hairStyle: 'bob' } });
  const differentRules = store.compare(original.id, changedDoor.id);
  assert.equal(differentRules.equivalent, false);
  assert.deepEqual(differentRules.changedConditions, ['doorMode', 'appearance']);
  assert.equal(differentRules.reasons.length, 1);
  assert.match(differentRules.reasons[0], /doorMode/);
  assert.doesNotMatch(differentRules.reasons[0], /appearance/);
});
