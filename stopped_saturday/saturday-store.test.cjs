const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('./saturday-store.js');

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[Store.STORAGE_KEY, initial]]);
  return {
    values, writes: 0,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { this.writes++; values.set(key, String(value)); }
  };
}

// A small deterministic fixture isolates persistence failures from prose changes.
// The final integration test also exercises every actual production scenario.
const fixture = {
  SCENARIO_VERSION: '2',
  normalizeStart(input = {}) {
    if (Object.keys(input).some(key => !['scenarioId', 'conditions'].includes(key))) throw Error('unknown start field');
    const scenarioId = input.scenarioId || 'classic';
    if (!['classic', 'home', 'doors', 'cafe', 'company', 'planning'].includes(scenarioId)) throw Error('unknown scenario');
    const conditions = { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false, ...(input.conditions || {}) };
    if (Object.keys(conditions).some(key => !['doorMode', 'helpStyle', 'phonePayment'].includes(key))
      || !['manual', 'automatic'].includes(conditions.doorMode) || !['takeover', 'ask'].includes(conditions.helpStyle)
      || typeof conditions.phonePayment !== 'boolean') throw Error('unknown condition');
    return { scenarioId, scenarioVersion: '2', conditions };
  },
  freshState(input) {
    const start = this.normalizeStart(input);
    return { ...start, initialConditions: { ...start.conditions }, choiceIds: [], scene: 'S01', energy: 6, mood: 4,
      decisions: [], traces: [], history: [], context: { cup: 'table' } };
  },
  getNode(state) {
    if (state.scene === 'end') return null;
    const sceneId = state.scene;
    const ids = sceneId === 'S02' && state.conditions.doorMode === 'automatic' ? ['S02-enter', 'S02-pause']
      : sceneId === 'S02' ? ['S02-request', 'S02-wait'] : [`${sceneId}-first`, `${sceneId}-second`];
    return { sceneId, title: sceneId, choices: ids.map(id => ({ id, title: `선택 ${id}` })) };
  },
  choose(state, index) {
    const node = this.getNode(state), choice = node.choices[index];
    if (!choice) throw Error('invalid choice');
    const count = state.choiceIds.length + 1;
    return { ...state, choiceIds: [...state.choiceIds, choice.id], scene: count === 5 ? 'end' : `S0${count + 1}`,
      energy: Math.max(0, state.energy - (index ? 0 : 1)), mood: Math.min(10, state.mood + index),
      decisions: [...state.decisions, choice.title], traces: [...state.traces, `흔적 ${choice.id}`],
      history: [...state.history, { id: choice.id, sceneId: node.sceneId, title: choice.title }],
      context: { cup: count === 1 && index ? 'window' : state.context.cup } };
  },
  replay(input) {
    let state = this.freshState({ scenarioId: input.scenarioId, conditions: input.conditions });
    for (const id of input.choiceIds) {
      const node = this.getNode(state);
      if (!node) throw Error('too many choices');
      const index = node.choices.findIndex(choice => choice.id === id);
      if (index < 0) throw Error('choice not eligible');
      state = this.choose(state, index);
    }
    return state;
  },
  determineEnding(state) { return { id: state.choiceIds[4].endsWith('first') ? 'rest' : 'observe', name: '허구의 토요일' }; }
};
// An intentionally different day length and clock expose accidental dispatch to
// the latest engine when a previous-version record is resumed or exported.
const fixtureV3 = {
  ...fixture, SCENARIO_VERSION: '3', DAY_LENGTH: 12,
  normalizeStart(input) { return { ...fixture.normalizeStart(input), scenarioVersion: '3' }; },
  choose(state, index) {
    const next = fixture.choose.call(this, state, index), count = next.choiceIds.length;
    return { ...next, scene: count === 12 ? 'end' : `S0${count + 1}`,
      elapsedMinutes: (state.elapsedMinutes || 0) + (index ? 37 : 11) };
  },
  determineEnding(state) { return { id: state.choiceIds.at(-1).endsWith('first') ? 'rest' : 'observe', name: '열두 번 선택한 토요일' }; }
};
const mixedFixture = {
  ...fixtureV3,
  forVersion(version) {
    if (version === '2') return fixture;
    if (version === '3') return fixtureV3;
    throw Error('unsupported version');
  },
  turnLimit(versionOrState) {
    const version = typeof versionOrState === 'string' ? versionOrState : versionOrState.scenarioVersion;
    return this.forVersion(version).SCENARIO_VERSION === '2' ? 5 : 12;
  },
  replay(input) { return this.forVersion(input.scenarioVersion || '3').replay(input); },
  getNode(state) { return this.forVersion(state.scenarioVersion).getNode(state); },
  determineEnding(state) { return this.forVersion(state.scenarioVersion).determineEnding(state); }
};
function create(storage = memoryStorage(), engine = fixture) { return Store.create({ storage, engine }); }
function finishCurrent(store, choices = []) {
  for (let count = 0; !store.resume().record.complete; count++) {
    assert.ok(count < 32, 'the fixture should finish within its declared day length');
    if (store.resume().phase === 'reaction') store.continue();
    store.commit(choices[store.resume().record.choiceIds.length] || 0);
    store.continue();
  }
  store.continue();
  return store.resume().record;
}
function finish(store, options = {}, choices = []) {
  store.start(options);
  return finishCurrent(store, choices);
}
function validPortable() {
  const store = create(); return JSON.parse(store.exportRecord(finish(store, { scenarioId: 'doors' }).id));
}

test('confirmed choices and reaction/game/result phases survive store recreation without reapplying effects', () => {
  const disk = memoryStorage(); let store = create(disk);
  store.start({ scenarioId: 'doors' });
  const reaction = store.commit(0).current;
  assert.equal(reaction.phase, 'reaction'); assert.equal(reaction.state.energy, 5);
  store = create(disk);
  assert.deepEqual(store.resume(), reaction);
  const afterDuplicate = store.commit(0).current;
  assert.deepEqual(afterDuplicate, reaction);
  store.continue(); store = create(disk);
  assert.equal(store.resume().phase, 'game'); assert.equal(store.resume().record.choiceIds.length, 1);
  for (let i = 1; i < 5; i++) { store.commit(0); if (i < 4) store.continue(); }
  assert.equal(store.getSnapshot().completed.length, 1);
  assert.equal(store.resume().phase, 'reaction');
  store = create(disk); store.continue();
  assert.equal(store.resume().phase, 'result'); assert.equal(store.resume().state.energy, 1);
  assert.equal(store.getSnapshot().completed.length, 1);
});

test('starting and resetting a current day preserve separately completed journals and fictional serials', () => {
  const disk = memoryStorage(), store = create(disk);
  const first = finish(store), second = finish(store, {}, [1, 1, 1, 1, 1]);
  assert.notEqual(first.id, second.id); assert.equal(second.serial, first.serial + 1);
  store.start({ scenarioId: 'home' }); store.commit(0); store.resetCurrent();
  const reloaded = create(disk).getSnapshot();
  assert.equal(reloaded.current, null); assert.equal(reloaded.completed.length, 2);
  assert.deepEqual(reloaded.completed.map(record => record.id), [first.id, second.id]);
});

test('fifth commit, repeated complete and repeated continue archive a record exactly once', () => {
  const store = create(); const record = finish(store);
  for (let i = 0; i < 5; i++) { store.complete(); store.continue(); store.commit(0); }
  assert.equal(store.getSnapshot().completed.length, 1);
  assert.equal(store.getSnapshot().completed[0].id, record.id);
  assert.equal(store.resume().record.choiceIds.length, 5);
});

test('invalid choice and invalid start leave the confirmed record and storage unchanged', () => {
  const disk = memoryStorage(), store = create(disk); store.start();
  const before = disk.getItem(Store.STORAGE_KEY), snapshot = store.getSnapshot();
  for (const bad of [-1, 99, NaN, 'unknown', null]) assert.throws(() => store.commit(bad));
  assert.throws(() => store.start({ scenarioId: 'never' }));
  assert.equal(disk.getItem(Store.STORAGE_KEY), before); assert.deepEqual(store.getSnapshot(), snapshot);
});

test('branch replays the strict prefix with a new identifier, then preserves the original when changed or abandoned', () => {
  const disk = memoryStorage(), store = create(disk), original = finish(store, { scenarioId: 'doors' });
  const originalJson = JSON.stringify(store.getRecord(original.id));
  const branched = store.branch(original.id, 2).current;
  assert.notEqual(branched.record.id, original.id); assert.equal(branched.record.parentId, original.id);
  assert.equal(branched.record.branchIndex, 2); assert.equal(branched.record.comparisonKind, 'branch');
  assert.deepEqual(branched.record.choiceIds, original.choiceIds.slice(0, 2));
  assert.deepEqual(branched.state, fixture.replay({ ...original, choiceIds: original.choiceIds.slice(0, 2) }));
  for (let i = 2; i < 5; i++) { store.commit(1); store.continue(); }
  assert.equal(store.getSnapshot().replays.length, 1);
  assert.equal(JSON.stringify(store.getRecord(original.id)), originalJson);
  assert.equal(store.compare(original.id, store.resume().record.id).equivalent, true);
  assert.equal(store.compare(original.id, store.resume().record.id).differences.choices.length, 3);
  store.branch(original.id, 0); store.resetCurrent();
  assert.equal(JSON.stringify(store.getRecord(original.id)), originalJson);
  assert.equal(create(disk).getSnapshot().replays.length, 1);
});

test('automatic-door contrast changes only doorMode and starts before S02 while preserving the source', () => {
  const store = create(), original = finish(store, { scenarioId: 'doors', conditions: { helpStyle: 'ask', phonePayment: true } });
  const before = store.getRecord(original.id);
  const contrast = store.doorContrast(original.id, 1).current;
  assert.equal(contrast.record.parentId, original.id); assert.equal(contrast.record.comparisonKind, 'door-contrast');
  assert.deepEqual(contrast.record.conditions, { ...original.conditions, doorMode: 'automatic' });
  assert.deepEqual(contrast.record.choiceIds, original.choiceIds.slice(0, 1));
  assert.equal(contrast.state.energy, 5);
  assert.deepEqual(fixture.getNode(contrast.state).choices.map(choice => choice.id), ['S02-enter', 'S02-pause']);
  for (let i = 1; i < 5; i++) { store.commit(0); store.continue(); }
  const comparison = store.compare(original.id, store.resume().record.id);
  assert.equal(comparison.equivalent, false); assert.deepEqual(comparison.changedConditions, ['doorMode']);
  assert.ok(comparison.reasons.some(reason => reason.includes('같은 조건')));
  assert.deepEqual(store.getRecord(original.id), before);
});

test('invalid contrast and an incompatible automatic prefix cannot replace the current day', () => {
  const store = create(), original = finish(store, { scenarioId: 'doors' });
  const before = store.getSnapshot();
  assert.throws(() => store.doorContrast(original.id, 0), /S02/);
  assert.throws(() => store.doorContrast(original.id, 2), /첫 문 장면/);
  assert.throws(() => store.branch(original.id, 5));
  assert.deepEqual(store.getSnapshot(), before);
  store.doorContrast(original.id, 1);
  for (let i = 1; i < 5; i++) { store.commit(0); store.continue(); }
  assert.throws(() => store.doorContrast(store.resume().record.id, 1), /이미 자동문/);
});

test('friend export contains only version, scenario, conditions and choice IDs, with no local identity or derived health data', () => {
  const store = create(), record = finish(store), payload = JSON.parse(store.exportRecord(record.id));
  assert.deepEqual(Object.keys(payload).sort(), ['choiceIds', 'conditions', 'scenarioId', 'scenarioVersion', 'schemaVersion']);
  for (const forbidden of ['id', 'serial', 'parentId', 'body', 'energy', 'mood', 'history', 'createdAt', 'timestamp', 'name', 'message']) assert.equal(own(payload, forbidden), false);
  assert.equal(payload.choiceIds.length, 5); assert.equal(payload.scenarioVersion, '2');
  store.start(); assert.throws(() => store.exportRecord(store.resume().record.id), /완료/);
});
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }

test('import preview does not store or change current; explicit import has a fresh local ID in its separate bucket', () => {
  const store = create(), record = finish(store), raw = store.exportRecord(record.id), before = store.getSnapshot();
  const preview = store.previewImport(raw);
  assert.deepEqual(store.getSnapshot(), before); assert.equal(preview.state.scene, 'end');
  store.importRecord(raw);
  const imported = store.getSnapshot().imported[0];
  assert.notEqual(imported.id, record.id); assert.equal(imported.parentId, null);
  assert.equal(store.getSnapshot().completed.length, 1); assert.equal(store.resume().record.id, record.id);
  assert.equal(store.compare(record.id, imported.id).equivalent, true);
  assert.equal(store.compare(record.id, imported.id).differences.choices.length, 0);
});

test('import rejects unknown keys, unknown conditions, malformed JSON, HTML, versions and incomplete or ineligible choice logs', () => {
  const store = create(), good = validPortable(), before = store.getSnapshot();
  const invalid = [
    '', '<script>alert(1)</script>', 'null', '[]', '{}', JSON.stringify({ ...good, health: 'private' }),
    JSON.stringify({ ...good, schemaVersion: 2 }), JSON.stringify({ ...good, scenarioVersion: '1' }),
    JSON.stringify({ ...good, scenarioId: '<img src=x onerror=alert(1)>' }),
    JSON.stringify({ ...good, conditions: { ...good.conditions, diagnosis: 'private' } }),
    JSON.stringify({ ...good, conditions: { doorMode: 'manual' } }),
    JSON.stringify({ ...good, conditions: { ...good.conditions, phonePayment: 'true' } }),
    JSON.stringify({ ...good, choiceIds: good.choiceIds.slice(0, 4) }),
    JSON.stringify({ ...good, choiceIds: [...good.choiceIds, 'S06-first'] }),
    JSON.stringify({ ...good, choiceIds: ['S01-first', 'S02-enter', ...good.choiceIds.slice(2)] }),
    JSON.stringify({ ...good, choiceIds: ['<script>', ...good.choiceIds.slice(1)] }),
    JSON.stringify(good).replace('"schemaVersion":1', '"__proto__":{"polluted":true},"schemaVersion":1')
  ];
  for (const raw of invalid) assert.throws(() => store.previewImport(raw), undefined, raw);
  assert.deepEqual(store.getSnapshot(), before); assert.equal({}.polluted, undefined);
});

test('import size uses UTF-8 bytes and rejects oversized input before parsing', () => {
  const store = create();
  assert.throws(() => store.previewImport('가'.repeat(6000)), /16 KiB/);
  assert.throws(() => store.previewImport(' '.repeat(Store.MAX_IMPORT_BYTES + 1) + '{}'), /16 KiB/);
});

test('corrupt and unsupported stored contents remain byte-for-byte unchanged through play and deletion operations', () => {
  for (const raw of ['{broken-json', JSON.stringify({ schemaVersion: 99 }), JSON.stringify({ ...validPortable(), scenarioVersion: '1' })]) {
    const disk = memoryStorage(raw), store = create(disk);
    assert.equal(store.getSnapshot().persistence.mode, 'read-only');
    assert.equal(store.getSnapshot().persistence.preservedRaw, raw);
    const record = finish(store); store.branch(record.id, 0); store.resetCurrent(); store.deleteAllJournals();
    assert.equal(disk.getItem(Store.STORAGE_KEY), raw); assert.equal(disk.writes, 0);
    const backup = JSON.parse(store.exportBackup());
    assert.equal(backup.preservedStorage.raw, raw); assert.equal(backup.localData.schemaVersion, 1);
  }
});

test('a structurally valid envelope with a tampered current choice enters read-only mode instead of executing or repairing it', () => {
  const disk = memoryStorage(), store = create(disk); store.start(); store.commit(0);
  const tampered = JSON.parse(disk.getItem(Store.STORAGE_KEY)); tampered.current.choiceIds = ['S01-not-eligible'];
  const raw = JSON.stringify(tampered); disk.values.set(Store.STORAGE_KEY, raw);
  const restored = create(disk);
  assert.equal(restored.getSnapshot().persistence.mode, 'read-only'); assert.equal(restored.resume(), null);
  restored.start(); assert.equal(disk.getItem(Store.STORAGE_KEY), raw);
});

test('missing or denied storage keeps the complete flow in memory and exposes a visible warning plus backup', () => {
  for (const storage of [null, {}, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }]) {
    const store = create(storage), record = finish(store);
    assert.equal(store.getSnapshot().persistence.mode, 'memory');
    assert.ok(store.getSnapshot().warnings[0].includes('백업'));
    assert.equal(store.getRecord(record.id).complete, true);
    assert.equal(JSON.parse(store.exportBackup()).localData.completed.length, 1);
  }
});

test('a quota/write failure preserves last saved raw, current in-memory state and both in backup', () => {
  const disk = memoryStorage(), store = create(disk); store.start();
  const lastSaved = disk.getItem(Store.STORAGE_KEY);
  disk.setItem = () => { throw Error('quota'); };
  store.commit(0);
  assert.equal(store.resume().record.choiceIds.length, 1); assert.equal(store.resume().state.energy, 5);
  assert.equal(store.getSnapshot().persistence.mode, 'memory');
  assert.equal(disk.getItem(Store.STORAGE_KEY), lastSaved);
  const backup = JSON.parse(store.exportBackup());
  assert.equal(backup.preservedStorage.raw, lastSaved); assert.equal(backup.localData.current.choiceIds.length, 1);
  store.continue(); store.commit(0); assert.equal(store.resume().record.choiceIds.length, 2);
});

test('an externally changed storage value is never overwritten by a stale tab', () => {
  const disk = memoryStorage(), store = create(disk); store.start();
  const foreignRaw = '{another-tab-or-future-version}'; disk.values.set(Store.STORAGE_KEY, foreignRaw);
  store.commit(0);
  assert.equal(store.getSnapshot().persistence.mode, 'read-only');
  assert.equal(disk.getItem(Store.STORAGE_KEY), foreignRaw); assert.equal(store.resume().record.choiceIds.length, 1);
  assert.equal(JSON.parse(store.exportBackup()).preservedStorage.raw, foreignRaw);
});

test('individual journal deletion preserves other journals, imports and parent references without resurrecting a completed current', () => {
  const disk = memoryStorage(), store = create(disk), first = finish(store), second = finish(store);
  store.importRecord(store.exportRecord(first.id)); const imported = store.getSnapshot().imported[0];
  store.branch(first.id, 1); for (let i = 1; i < 5; i++) { store.commit(0); store.continue(); }
  const child = store.resume().record;
  store.deleteRecord(first.id);
  assert.equal(store.getRecord(child.id).parentId, first.id); assert.throws(() => store.getRecord(first.id));
  assert.equal(store.getRecord(second.id).id, second.id); assert.equal(store.getRecord(imported.id).id, imported.id);
  store.deleteRecord(child.id); assert.equal(store.resume(), null);
  const restored = create(disk).getSnapshot(); assert.equal(restored.current, null); assert.equal(restored.replays.length, 0);
  assert.equal(restored.completed.length, 1); assert.equal(restored.imported.length, 1);
});

test('import deletion and all-journal deletion have explicit separate scopes and preserve an unfinished current day', () => {
  const store = create(), first = finish(store); store.importRecord(store.exportRecord(first.id));
  const imported = store.getSnapshot().imported[0]; store.deleteImported(imported.id);
  assert.equal(store.getSnapshot().completed.length, 1); assert.equal(store.getSnapshot().imported.length, 0);
  store.importRecord(store.exportRecord(first.id)); store.start({ scenarioId: 'home' }); store.commit(1);
  const current = store.resume(); store.deleteAllJournals();
  assert.deepEqual(store.resume(), current);
  assert.equal(store.getSnapshot().completed.length, 0); assert.equal(store.getSnapshot().replays.length, 0); assert.equal(store.getSnapshot().imported.length, 0);
});

test('comparison rejects equivalence for scenario or starting-condition differences without ranking either day', () => {
  const store = create(), first = finish(store, { scenarioId: 'home' }), second = finish(store, { scenarioId: 'doors', conditions: { phonePayment: true } });
  const result = store.compare(first.id, second.id);
  assert.equal(result.equivalent, false); assert.equal(result.reasons.length, 2);
  assert.deepEqual(result.changedConditions, ['phonePayment']);
  assert.equal(own(result, 'winner'), false); assert.equal(own(result, 'score'), false);
});

test('snapshot and record callers cannot mutate the store by editing returned objects', () => {
  const store = create(), first = finish(store); const expected = store.getSnapshot();
  const snapshot = store.getSnapshot(), record = store.getRecord(first.id);
  snapshot.completed[0].choiceIds[0] = 'tamper'; snapshot.current.state.energy = 999;
  record.conditions.doorMode = 'automatic'; record.summary.history.length = 0;
  assert.deepEqual(store.getSnapshot(), expected);
});

test('v3 uses twelve confirmed choices and restores its clock without repeating a committed effect', () => {
  const disk = memoryStorage(); let store = create(disk, mixedFixture);
  store.start({ scenarioId: 'home' });
  assert.equal(store.resume().record.scenarioVersion, '3');
  for (let index = 0; index < 11; index++) {
    const reaction = store.commit(index % 2).current;
    assert.equal(reaction.record.complete, false);
    assert.equal(store.getSnapshot().completed.length, 0);
    const writes = disk.writes;
    store = create(disk, mixedFixture);
    assert.deepEqual(store.resume(), reaction);
    assert.equal(disk.writes, writes, 'reading a current envelope must not write');
    assert.deepEqual(store.commit(0).current, reaction, 'double commit must not advance time or choices');
    store.continue();
  }
  assert.throws(() => store.complete(), /모든 선택/);
  assert.throws(() => store.exportRecord(store.resume().record.id), /완료/);
  const reaction = store.commit(1).current;
  assert.equal(reaction.record.complete, true); assert.equal(reaction.record.choiceIds.length, 12);
  assert.equal(reaction.state.elapsedMinutes, 6 * 11 + 6 * 37);
  assert.equal(store.getSnapshot().completed.length, 1);
  store = create(disk, mixedFixture); assert.deepEqual(store.resume(), reaction);
  for (let index = 0; index < 3; index++) { store.complete(); store.continue(); store.commit(0); }
  assert.equal(store.resume().phase, 'result'); assert.equal(store.getSnapshot().completed.length, 1);
  assert.equal(store.resume().record.summary.endingName, '열두 번 선택한 토요일');
});

test('known v2 envelopes upgrade only in memory and preserve game, reaction and result phases', () => {
  for (const phase of ['game', 'reaction', 'final-reaction', 'result']) {
    const disk = memoryStorage(), oldStore = create(disk); oldStore.start();
    if (phase === 'game' || phase === 'reaction') {
      oldStore.commit(1); if (phase === 'game') oldStore.continue();
    } else {
      for (let index = 0; index < 5; index++) { oldStore.commit(0); if (index < 4) oldStore.continue(); }
      if (phase === 'result') oldStore.continue();
    }
    const oldRaw = disk.getItem(Store.STORAGE_KEY), original = oldStore.resume(), writes = disk.writes;
    const upgraded = create(disk, mixedFixture);
    assert.equal(disk.writes, writes); assert.equal(disk.getItem(Store.STORAGE_KEY), oldRaw);
    assert.deepEqual(upgraded.resume(), original);
    assert.deepEqual(JSON.parse(upgraded.exportBackup()).localData, { ...JSON.parse(oldRaw), scenarioVersion: '3' });
    assert.equal(upgraded.getSnapshot().persistence.mode, 'saved');
    if (phase === 'game') upgraded.commit(0);
    else if (phase === 'result') upgraded.start();
    else upgraded.continue();
    const saved = JSON.parse(disk.getItem(Store.STORAGE_KEY));
    assert.equal(saved.schemaVersion, 1); assert.equal(saved.scenarioVersion, '3');
    assert.equal(saved.current.scenarioVersion, phase === 'result' ? '3' : '2');
    assert.equal(disk.writes, writes + 1);
    assert.deepEqual(create(disk, mixedFixture).resume(), upgraded.resume());
  }
});

test('v2 upgrade preserves all journal buckets, identifiers, parent links and a partially played day', () => {
  const disk = memoryStorage(), oldStore = create(disk), source = finish(oldStore, { scenarioId: 'doors' });
  oldStore.branch(source.id, 2); finishCurrent(oldStore, [0, 0, 1, 0, 1]);
  oldStore.importRecord(oldStore.exportRecord(source.id));
  oldStore.start({ scenarioId: 'home' }); oldStore.commit(1); oldStore.continue(); oldStore.commit(0);
  const oldRaw = disk.getItem(Store.STORAGE_KEY), oldData = JSON.parse(oldRaw), before = oldStore.getSnapshot(), writes = disk.writes;
  const upgraded = create(disk, mixedFixture);
  assert.equal(disk.writes, writes); assert.deepEqual(upgraded.getSnapshot(), before);
  assert.deepEqual(JSON.parse(upgraded.exportBackup()).localData, { ...oldData, scenarioVersion: '3' });
  finishCurrent(upgraded);
  assert.equal(upgraded.resume().record.scenarioVersion, '2');
  assert.equal(upgraded.resume().record.choiceIds.length, 5);
  assert.equal(own(upgraded.resume().state, 'elapsedMinutes'), false);
  const persisted = JSON.parse(disk.getItem(Store.STORAGE_KEY));
  assert.deepEqual(persisted.completed.slice(0, 1), oldData.completed);
  assert.deepEqual(persisted.replays, oldData.replays); assert.deepEqual(persisted.imported, oldData.imported);
  const modern = finish(upgraded); assert.equal(modern.scenarioVersion, '3'); assert.equal(modern.choiceIds.length, 12);
  assert.equal(create(disk, mixedFixture).getSnapshot().completed.length, 3);
});

test('legacy branches, automatic-door contrasts and friend exports retain version two under the v3 engine', () => {
  const disk = memoryStorage(), oldStore = create(disk), source = finish(oldStore, { scenarioId: 'doors' });
  const original = oldStore.getRecord(source.id), portable = oldStore.exportRecord(source.id);
  const store = create(disk, mixedFixture);
  assert.equal(store.exportRecord(source.id), portable);
  const branch = store.branch(source.id, 4).current;
  assert.equal(branch.record.scenarioVersion, '2'); assert.equal(branch.record.branchIndex, 4);
  assert.deepEqual(branch.state, fixture.replay({ ...source, choiceIds: source.choiceIds.slice(0, 4) }));
  finishCurrent(store); assert.equal(store.resume().record.choiceIds.length, 5);
  const before = store.getSnapshot(); assert.throws(() => store.branch(source.id, 5), /5번째/); assert.deepEqual(store.getSnapshot(), before);
  store.doorContrast(source.id, 1); assert.equal(store.resume().record.scenarioVersion, '2');
  finishCurrent(store); assert.equal(store.resume().record.choiceIds.length, 5);
  assert.deepEqual(store.getRecord(source.id), original);
  const newStore = create(memoryStorage(), mixedFixture);
  assert.equal(newStore.previewImport(portable).state.scenarioVersion, '2'); newStore.importRecord(portable);
  const imported = newStore.getSnapshot().imported[0];
  assert.equal(imported.scenarioVersion, '2'); assert.equal(imported.choiceIds.length, 5);
  assert.equal(newStore.exportRecord(imported.id), portable);
  newStore.branch(imported.id, 4); finishCurrent(newStore); assert.equal(newStore.resume().record.scenarioVersion, '2');
});

test('v3 branches can start at the twelfth choice and keep their source immutable', () => {
  const disk = memoryStorage(), store = create(disk, mixedFixture), source = finish(store);
  const before = store.getRecord(source.id), branch = store.branch(source.id, 11).current;
  assert.equal(branch.record.scenarioVersion, '3'); assert.equal(branch.record.choiceIds.length, 11);
  assert.equal(branch.record.complete, false); assert.equal(branch.phase, 'game');
  assert.deepEqual(branch.state, fixtureV3.replay({ ...source, choiceIds: source.choiceIds.slice(0, 11) }));
  store.commit(1); store.continue();
  assert.equal(store.getSnapshot().replays.length, 1); assert.equal(store.resume().record.complete, true);
  assert.equal(store.compare(source.id, store.resume().record.id).equivalent, true);
  assert.equal(store.compare(source.id, store.resume().record.id).differences.choices[0].index, 11);
  assert.deepEqual(store.getRecord(source.id), before);
  const current = store.resume(); assert.throws(() => store.branch(source.id, 12), /12번째/); assert.deepEqual(store.resume(), current);
  assert.deepEqual(create(disk, mixedFixture).resume(), current);
});

test('mixed-version comparisons are explicitly non-equivalent even with identical starting conditions', () => {
  const disk = memoryStorage(), oldStore = create(disk), oldRecord = finish(oldStore);
  const store = create(disk, mixedFixture), currentRecord = finish(store);
  const comparison = store.compare(oldRecord.id, currentRecord.id);
  assert.equal(comparison.equivalent, false); assert.deepEqual(comparison.reasons, ['이야기 버전이 다릅니다.']);
  assert.deepEqual(comparison.changedConditions, []);
  assert.equal(comparison.left.record.scenarioVersion, '2'); assert.equal(comparison.right.record.scenarioVersion, '3');
  assert.equal(comparison.left.state.scene, 'end'); assert.equal(comparison.right.state.scene, 'end');
  assert.equal(comparison.differences.choices.length, 7);
  assert.equal(own(comparison, 'winner'), false); assert.equal(own(comparison, 'score'), false);
});

test('portable records keep exactly five fields while validating completion against each story version', () => {
  const store = create(memoryStorage(), mixedFixture), current = finish(store), raw = store.exportRecord(current.id), payload = JSON.parse(raw);
  assert.deepEqual(Object.keys(payload).sort(), ['choiceIds', 'conditions', 'scenarioId', 'scenarioVersion', 'schemaVersion']);
  assert.equal(payload.schemaVersion, 1); assert.equal(payload.scenarioVersion, '3'); assert.equal(payload.choiceIds.length, 12);
  const before = store.getSnapshot(); assert.deepEqual(store.previewImport(raw).state, store.resume().state);
  for (const invalid of [
    { ...payload, choiceIds: payload.choiceIds.slice(0, 5) }, { ...payload, choiceIds: payload.choiceIds.slice(0, 11) },
    { ...payload, choiceIds: [...payload.choiceIds, 'S013-first'] }, { ...payload, scenarioVersion: '2' },
    { ...payload, scenarioVersion: '1' }, { ...payload, scenarioVersion: '4' },
    { ...payload, elapsedMinutes: 120 }, { ...payload, createdAt: '2026-01-01' }
  ]) assert.throws(() => store.previewImport(JSON.stringify(invalid)));
  assert.deepEqual(store.getSnapshot(), before);
  store.importRecord(raw); const imported = store.getSnapshot().imported[0];
  assert.equal(imported.scenarioVersion, '3'); assert.equal(imported.choiceIds.length, 12);
  assert.equal(store.compare(current.id, imported.id).equivalent, true);
});

test('unsupported or inconsistent envelope versions and damaged v2 data stay raw and read-only under v3', () => {
  const legacyDisk = memoryStorage(), legacyStore = create(legacyDisk); const source = finish(legacyStore);
  const oldData = JSON.parse(legacyDisk.getItem(Store.STORAGE_KEY));
  const damaged = JSON.parse(JSON.stringify(oldData)); damaged.completed[0].choiceIds[0] = 'S01-not-an-option';
  const mixed = JSON.parse(JSON.stringify(oldData)); mixed.current.scenarioVersion = '3';
  for (const value of [
    { ...oldData, schemaVersion: 99 }, { ...oldData, scenarioVersion: '1' }, { ...oldData, scenarioVersion: '4' },
    damaged, mixed, { ...oldData, scenarioVersion: '3', current: { ...oldData.current, scenarioVersion: 'unknown' } }
  ]) {
    const raw = JSON.stringify(value), disk = memoryStorage(raw), store = create(disk, mixedFixture);
    assert.equal(store.getSnapshot().persistence.mode, 'read-only'); assert.equal(store.resume(), null);
    assert.equal(store.getSnapshot().completed.length, 0);
    finish(store); store.resetCurrent(); store.deleteAllJournals();
    assert.equal(disk.getItem(Store.STORAGE_KEY), raw); assert.equal(disk.writes, 0);
    assert.equal(JSON.parse(store.exportBackup()).preservedStorage.raw, raw);
  }
  assert.equal(legacyStore.getRecord(source.id).complete, true);
});

test('a stale migrated tab preserves another tab v2 save instead of replacing it with v3', () => {
  const disk = memoryStorage(), oldTab = create(disk); oldTab.start();
  const migratedTab = create(disk, mixedFixture); oldTab.commit(0);
  const foreignRaw = disk.getItem(Store.STORAGE_KEY), writes = disk.writes;
  migratedTab.commit(1);
  assert.equal(migratedTab.getSnapshot().persistence.mode, 'read-only');
  assert.equal(disk.writes, writes); assert.equal(disk.getItem(Store.STORAGE_KEY), foreignRaw);
  assert.equal(migratedTab.resume().state.mood, 5);
  const backup = JSON.parse(migratedTab.exportBackup());
  assert.equal(backup.preservedStorage.raw, foreignRaw); assert.equal(backup.localData.scenarioVersion, '3');
  assert.equal(backup.localData.current.scenarioVersion, '2');
});

test('a failed first migrated write preserves both original v2 raw and progressed v2 state in its v3 backup', () => {
  const disk = memoryStorage(), oldStore = create(disk); oldStore.start();
  const oldRaw = disk.getItem(Store.STORAGE_KEY), store = create(disk, mixedFixture);
  disk.setItem = () => { throw Error('quota'); }; store.commit(1);
  assert.equal(store.getSnapshot().persistence.mode, 'memory'); assert.equal(disk.getItem(Store.STORAGE_KEY), oldRaw);
  const backup = JSON.parse(store.exportBackup());
  assert.equal(backup.preservedStorage.raw, oldRaw); assert.equal(backup.localData.scenarioVersion, '3');
  assert.equal(backup.localData.current.scenarioVersion, '2'); assert.equal(backup.localData.current.choiceIds.length, 1);
});

test('actual preserved v2 engine: all six stories retain their reaction, consequences and ending through a mixed-version store', () => {
  const legacy = require('./legacy/story-engine-v2.js');
  const bridge = { ...mixedFixture, forVersion(version) { return version === '2' ? legacy : mixedFixture.forVersion(version); } };
  for (const scenarioId of ['classic', 'home', 'doors', 'cafe', 'company', 'planning']) {
    const disk = memoryStorage(), oldStore = create(disk, legacy);
    oldStore.start({ scenarioId }); oldStore.commit(0);
    const before = oldStore.resume(), raw = disk.getItem(Store.STORAGE_KEY), writes = disk.writes;
    const upgraded = create(disk, bridge);
    assert.deepEqual(upgraded.resume(), before); assert.equal(disk.getItem(Store.STORAGE_KEY), raw); assert.equal(disk.writes, writes);
    assert.deepEqual(upgraded.commit(0).current, before);
    const completed = finishCurrent(upgraded), state = upgraded.resume().state;
    assert.equal(completed.scenarioVersion, '2'); assert.equal(completed.choiceIds.length, 5);
    assert.deepEqual(state, legacy.replay({ scenarioId, conditions: completed.conditions, choiceIds: completed.choiceIds }));
    assert.equal(completed.summary.endingName, legacy.determineEnding(state).name);
    assert.deepEqual(create(disk, bridge).resume(), upgraded.resume());
    const portable = upgraded.exportRecord(completed.id);
    upgraded.importRecord(portable); const imported = upgraded.getSnapshot().imported[0];
    assert.equal(imported.scenarioVersion, '2'); assert.equal(upgraded.exportRecord(imported.id), portable);
    const branch = upgraded.branch(completed.id, 4).current;
    assert.equal(branch.record.choiceIds.length, 4); assert.equal(branch.record.scenarioVersion, '2');
    finishCurrent(upgraded); assert.deepEqual(upgraded.resume().state, state);
  }
});

test('actual production engine: six scenarios persist, restore, export and replay to the same ending', () => {
  const engine = require('./story-engine.js');
  assert.equal(engine.SCENARIO_VERSION, '3'); assert.equal(engine.turnLimit('3'), 12);
  for (const scenarioId of ['classic', 'home', 'doors', 'cafe', 'company', 'planning']) {
    const disk = memoryStorage(), store = create(disk, engine), record = finish(store, { scenarioId });
    assert.equal(record.scenarioVersion, '3'); assert.equal(record.choiceIds.length, 12);
    const restored = create(disk, engine);
    assert.deepEqual(restored.resume(), store.resume());
    const preview = restored.previewImport(restored.exportRecord(record.id));
    assert.deepEqual(preview.state, restored.resume().state);
    assert.equal(preview.summary.endingName, record.summary.endingName);
    restored.importRecord(restored.exportRecord(record.id));
    assert.equal(restored.compare(record.id, restored.getSnapshot().imported[0].id).equivalent, true);
  }
});

test('actual production engine: automatic-door and changed-choice replays keep their manual original immutable', () => {
  const engine = require('./story-engine.js'), disk = memoryStorage(), store = create(disk, engine);
  const source = finish(store, { scenarioId: 'doors' });
  const original = store.getRecord(source.id);
  const doorIndex = source.summary.history.findIndex(entry => entry.sceneId === 'S02');
  assert.ok(doorIndex >= 0);
  const prefix = engine.replay({ scenarioVersion: source.scenarioVersion, scenarioId: source.scenarioId,
    conditions: source.conditions, choiceIds: source.choiceIds.slice(0, doorIndex) });
  const contrast = store.doorContrast(source.id, doorIndex).current;
  assert.equal(engine.getNode(contrast.state).sceneId, 'S02');
  assert.equal(contrast.state.energy, prefix.energy);
  assert.deepEqual(contrast.record.conditions, { ...source.conditions, doorMode: 'automatic' });
  assert.ok(engine.getNode(contrast.state).choices.every(choice => !/잡아 달/.test(choice.title)));
  finishCurrent(store);
  const changedEnvironment = store.resume().record;
  assert.equal(store.compare(source.id, changedEnvironment.id).equivalent, false);
  assert.deepEqual(store.compare(source.id, changedEnvironment.id).changedConditions, ['doorMode']);
  store.branch(source.id, 2); store.commit(1); store.continue();
  while (!store.resume().record.complete) { store.commit(0); store.continue(); }
  assert.equal(store.compare(source.id, store.resume().record.id).equivalent, true);
  assert.equal(store.getSnapshot().replays.length, 2);
  assert.deepEqual(store.getRecord(source.id), original);
  assert.deepEqual(create(disk, engine).getRecord(source.id), original);
});

test('actual v3 facade: a saved v2 day finishes unchanged and coexists with twelve-choice games and imported records', () => {
  const engine = require('./story-engine.js'), legacy = engine.forVersion('2'), disk = memoryStorage();
  const oldStore = create(disk, legacy); oldStore.start({ scenarioId: 'doors' });
  oldStore.commit(0); oldStore.continue(); oldStore.commit(0);
  const legacyReaction = oldStore.resume(), oldRaw = disk.getItem(Store.STORAGE_KEY), writes = disk.writes;
  const store = create(disk, engine);
  assert.deepEqual(store.resume(), legacyReaction); assert.equal(disk.getItem(Store.STORAGE_KEY), oldRaw); assert.equal(disk.writes, writes);
  const oldRecord = finishCurrent(store), oldState = store.resume().state;
  assert.equal(oldRecord.scenarioVersion, '2'); assert.equal(oldRecord.choiceIds.length, 5);
  assert.deepEqual(oldState, engine.replay({ scenarioVersion: '2', scenarioId: 'doors', conditions: oldRecord.conditions, choiceIds: oldRecord.choiceIds }));
  const oldPortable = store.exportRecord(oldRecord.id);
  store.branch(oldRecord.id, 4); finishCurrent(store);
  assert.deepEqual(store.resume().state, oldState);
  store.doorContrast(oldRecord.id, 0); finishCurrent(store);
  assert.equal(store.resume().record.scenarioVersion, '2'); assert.equal(store.resume().record.choiceIds.length, 5);
  store.importRecord(oldPortable); assert.equal(store.getSnapshot().imported[0].scenarioVersion, '2');
  const modern = finish(store, { scenarioId: 'doors' });
  assert.equal(modern.scenarioVersion, '3'); assert.equal(modern.choiceIds.length, 12);
  const comparison = store.compare(oldRecord.id, modern.id);
  assert.equal(comparison.equivalent, false); assert.deepEqual(comparison.reasons, ['이야기 버전이 다릅니다.']);
  const snapshot = store.getSnapshot();
  assert.deepEqual(create(disk, engine).getSnapshot(), snapshot);
  const saved = JSON.parse(disk.getItem(Store.STORAGE_KEY));
  assert.equal(saved.scenarioVersion, '3');
  assert.deepEqual(saved.completed.map(record => record.scenarioVersion), ['2', '3']);
  assert.ok(saved.replays.every(record => record.scenarioVersion === '2'));
});
