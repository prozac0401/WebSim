const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./storage.js');

test('new timing records keep legacy evaluated instructions distinct from physical turns', () => {
  const data = S.defaults();
  S.recordCompletion(data, 4, 'map-1:rules-solo-1', {elapsedMs:1000,stored:2,turns:5,executed:10,attempts:1,hintUsed:false});
  assert.equal(data.completed[4].executed,10);
  assert.equal(data.records[4]['map-1:rules-solo-1'].first.turns,5);
  S.recordCompletion(data, 4, 'map-1:rules-solo-1', {elapsedMs:900,stored:2,turns:4,executed:12,attempts:1,hintUsed:false});
  assert.equal(data.completed[4].executed,10);
  assert.equal(data.records[4]['map-1:rules-solo-1'].unassisted.best.elapsedMs,900);
});

function fakeStorage() {
  const entries = new Map();
  return { entries, getItem: key => entries.has(key) ? entries.get(key) : null, setItem: (key, value) => entries.set(key, value) };
}
function fixture() {
  const data = S.defaults();
  data.currentLevel = 12;
  data.completed = { 1: true, 11: { stored: 8, executed: 21 } };
  data.programs[12] = {
    main: [{ id: 'r', type: 'repeat', count: 3, body: [{ id: 'c', type: 'call', target: 'F1' }] }],
    F1: [{ id: 'i', type: 'if', condition: 'blocked', then: [{ id: 't', type: 'right' }], else: [{ id: 'e', type: 'forward' }] }],
    F2: [{ id: 'm', type: 'if', condition: 'mark', then: [{ id: 'l', type: 'left' }], else: [{ id: 'w', type: 'wait' }] }]
  };
  data.settings = { speed: 2, muted: false };
  return data;
}

test('empty storage and round trip preserve each supported command, progress and settings', () => {
  const storage = fakeStorage(), persistence = S.create(storage);
  assert.equal(persistence.load().status, 'empty');
  assert.deepEqual(persistence.load().data, S.defaults());
  assert.equal(persistence.save(fixture()).ok, true);
  assert.deepEqual(S.create(storage).load(), { status: 'loaded', data: fixture() });
});

test('saved and loaded data are detached from caller mutations', () => {
  const persistence = S.create(fakeStorage()), data = fixture();
  const saved = persistence.save(data);
  data.programs[12].main.length = 0;
  saved.data.currentLevel = 2;
  const loaded = persistence.load(); loaded.data.programs[12].main.length = 0;
  assert.deepEqual(persistence.load().data, fixture());
});

test('malformed JSON and unsupported save versions recover safely', () => {
  for (const raw of ['{broken', 'null', '[]', '{"version":999}', 'x'.repeat(300000)]) {
    const storage = fakeStorage(); storage.setItem(S.KEY, raw);
    assert.deepEqual(S.create(storage).load(), { status: 'corrupt', data: S.defaults() });
  }
});

test('valid backup survives a corrupt primary, and corrupt primary never replaces backup', () => {
  const storage = fakeStorage(), persistence = S.create(storage);
  persistence.save(fixture()); persistence.save({ ...fixture(), currentLevel: 13 });
  storage.setItem(S.KEY, '{broken');
  assert.deepEqual(S.create(storage).load(), { status: 'recovered', data: fixture() });
  persistence.save({ ...fixture(), currentLevel: 14 });
  assert.deepEqual(JSON.parse(storage.getItem(S.BACKUP_KEY)), fixture());
});

test('wait blocks survive primary, backup recovery and denied storage without retaining unknown fields', () => {
  const data = fixture();
  data.programs[5] = { main: [{ id: 'wait-main', type: 'wait', duration: 999, source: 'ignored' }], F1: [], F2: [] };
  const expected = { main: [{ id: 'wait-main', type: 'wait' }], F1: [], F2: [] };
  const storage = fakeStorage(), persistence = S.create(storage);
  assert.equal(persistence.save(data).ok, true);
  assert.deepEqual(S.create(storage).load().data.programs[5], expected);
  persistence.save({ ...data, currentLevel: 5 });
  storage.setItem(S.KEY, '{broken');
  const recovered = S.create(storage).load();
  assert.equal(recovered.status, 'recovered'); assert.deepEqual(recovered.data.programs[5], expected);
  const denied = S.create({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } });
  assert.equal(denied.save(data).ok, false);
  assert.deepEqual(denied.load().data.programs[5], expected);
});

test('denied reads and writes keep playing with session data and explicit failure status', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const persistence = S.create(denied);
  assert.equal(persistence.load().status, 'unavailable');
  assert.equal(persistence.save(fixture()).ok, false);
  assert.deepEqual(persistence.load().data, fixture());
  assert.equal(S.create(null).save(fixture()).status, 'unavailable');
});

test('global localStorage getter failures are contained', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const persistence = S.create();
    assert.equal(persistence.load().status, 'unavailable');
    assert.equal(persistence.save(fixture()).status, 'unavailable');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('backup quota failure permits replacing primary; primary failure preserves prior valid save', () => {
  const storage = fakeStorage(), originalSet = storage.setItem;
  S.create(storage).save(fixture());
  storage.setItem = (key, value) => { if (key === S.BACKUP_KEY) throw new Error('quota'); originalSet(key, value); };
  assert.equal(S.create(storage).save({ ...fixture(), currentLevel: 13 }).ok, true);
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(S.create(storage).save({ ...fixture(), currentLevel: 14 }).ok, false);
  assert.equal(S.create(storage).load().data.currentLevel, 13);
});

test('whitelist rejects invalid command data and ignores prototype and unknown settings', () => {
  const data = JSON.parse('{"version":1,"currentLevel":999,"__proto__":{"polluted":true},"completed":{"1":true,"2":{"stored":2,"executed":6,"html":"bad"},"99":true},"settings":{"speed":1000,"muted":"no","volume":2},"programs":{"1":{"main":[{"id":"a","type":"eval","code":"bad"}],"F1":[],"F2":[]}}}');
  const clean = S.sanitize(data);
  assert.deepEqual(clean, { ...S.defaults(), completed: { 1: true, 2: { stored: 2, executed: 6 } }, unlocked: [1, 2, 3] });
  assert.equal({}.polluted, undefined);
});

test('program nesting, size, repetition and duplicate IDs are bounded', () => {
  const wrap = node => ({ main: [node], F1: [], F2: [] });
  assert.equal(S.cleanProgram(wrap({ id: 'r', type: 'repeat', count: 13, body: [] })), null);
  assert.equal(S.cleanProgram({ main: [{ id: 'a', type: 'left' }, { id: 'a', type: 'right' }], F1: [], F2: [] }), null);
  assert.equal(S.cleanProgram({ main: Array.from({ length: 129 }, (_, i) => ({ id: '' + i, type: 'left' })), F1: [], F2: [] }), null);
  let node = { id: 'base', type: 'forward' };
  for (let i = 0; i < 6; i++) node = { id: 'r' + i, type: 'repeat', count: 2, body: [node] };
  assert.equal(S.cleanProgram(wrap(node)), null);
  const cycle = { id: 'cycle', type: 'repeat', count: 2, body: [] }; cycle.body.push(cycle);
  assert.equal(S.cleanProgram(wrap(cycle)), null);
});

test('one damaged level does not erase other valid level programs', () => {
  const data = fixture(); data.programs[1] = { main: 'invalid', F1: [], F2: [] };
  const clean = S.sanitize(data);
  assert.equal(clean.programs[1], undefined);
  assert.deepEqual(clean.programs[12], fixture().programs[12]);
});

test('partial corruption is disclosed and only damaged programs recover from backup', () => {
  const storage = fakeStorage();
  storage.setItem(S.BACKUP_KEY, JSON.stringify(fixture()));
  const damaged = fixture(); damaged.currentLevel = 13;
  damaged.programs[12].main[0].count = 999;
  damaged.programs[1] = { main: [{ id: 'new', type: 'forward' }], F1: [], F2: [] };
  storage.setItem(S.KEY, JSON.stringify(damaged));
  const loaded = S.create(storage).load();
  assert.equal(loaded.status, 'repaired');
  assert.equal(loaded.data.currentLevel, 13);
  assert.deepEqual(loaded.data.programs[12], fixture().programs[12]);
  assert.deepEqual(loaded.data.programs[1], damaged.programs[1]);
  S.create(storage).save(loaded.data);
  assert.deepEqual(JSON.parse(storage.getItem(S.BACKUP_KEY)), fixture(), 'partial corruption must not replace the good backup');
});

test('damaged program collection can recover with an explicit notice', () => {
  const storage = fakeStorage();
  storage.setItem(S.KEY, JSON.stringify({ ...fixture(), programs: 'broken' }));
  storage.setItem(S.BACKUP_KEY, JSON.stringify(fixture()));
  assert.deepEqual(S.create(storage).load(), { status: 'repaired', data: fixture() });
});

test('invalid whole save is rejected without overwriting prior data', () => {
  const persistence = S.create(fakeStorage()); persistence.save(fixture());
  assert.equal(persistence.save({ version: 999 }).status, 'invalid');
  assert.deepEqual(persistence.load().data, fixture());
});

test('version 1 migration preserves original IDs, over-budget programs and legacy completions without fabricating time', () => {
  const storage = fakeStorage();
  const original = { version: 1, currentLevel: 12, completed: { 1: true, 3: { stored: 6, executed: 6 }, 11: true, 15: true },
    programs: { 1: { main: Array.from({ length: 5 }, (_, index) => ({ id: 'old-' + index, type: 'forward' })), F1: [], F2: [] }, 12: fixture().programs[12] },
    settings: { speed: 4, muted: false } };
  storage.setItem(S.KEY, JSON.stringify(original));
  const catalog = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 'box-intro' }, { id: 4 }, { id: 11 }, { id: 'function-challenge' }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15 }, { id: 'coop-final' }];
  const loaded = S.create(storage, catalog).load();
  assert.equal(loaded.status, 'loaded'); assert.equal(loaded.data.version, 2);
  assert.equal(loaded.data.currentLevel, 12); assert.deepEqual(loaded.data.programs, original.programs);
  assert.deepEqual(loaded.data.completed, original.completed); assert.deepEqual(loaded.data.settings, original.settings);
  assert.deepEqual(loaded.data.records, {}); assert.deepEqual(loaded.data.challenges, {});
  assert.equal(S.isUnlocked(loaded.data, 12, catalog), true, 'insertion cannot relock an existing available original level');
  assert.equal(S.isUnlocked(loaded.data, 15, catalog), true, 'completed levels remain available');
  assert.equal(loaded.data.completed['box-intro'], undefined, 'a new map is a new challenge');
  assert.equal(S.isUnlocked(loaded.data, 'box-intro', catalog), true);
  assert.equal(S.nextLevelId(3, catalog), 'box-intro'); assert.equal(S.nextLevelId('box-intro', catalog), 4);
  assert.equal(S.nextLevelId('coop-final', catalog), null);
  assert.equal(S.create(storage, catalog).save(loaded.data).ok, true);
  assert.deepEqual(S.create(storage, catalog).load().data, loaded.data);
});

test('fresh progression follows catalog and explicit prerequisites, independently of identifier arithmetic', () => {
  const catalog = [{ id: 1 }, { id: 'box-intro' }, { id: 3 }, { id: 'coop-intro', prerequisites: [1, 3] }, { id: 2 }];
  const data = S.defaults(catalog);
  assert.equal(S.isUnlocked(data, 1, catalog), true); assert.equal(S.isUnlocked(data, 'box-intro', catalog), false);
  assert.equal(S.isUnlocked(data, 2, catalog), false);
  data.completed[1] = true; S.grantUnlocked(data, catalog);
  assert.equal(S.isUnlocked(data, 'box-intro', catalog), true); assert.equal(S.isUnlocked(data, 3, catalog), false);
  data.completed['box-intro'] = true; data.completed[3] = true; S.grantUnlocked(data, catalog);
  assert.equal(S.isUnlocked(data, 'coop-intro', catalog), true);
  assert.equal(S.isUnlocked(data, 2, catalog), false);
  const reordered = [catalog[4], ...catalog.slice(0, 4)];
  assert.equal(S.isUnlocked(data, 'box-intro', reordered), true, 'persistent grants survive subsequent catalog reordering');
  assert.equal(S.isUnlocked(data, 'unknown-id', catalog), false);
});

test('stable string level programs, both new conditions and challenge snapshots survive primary and backup', () => {
  const data = fixture(); data.currentLevel = 'coop-delivery';
  data.programs['coop-delivery'] = { main: [{ id: 'box', type: 'if', condition: 'box', then: [{ id: 'f', type: 'forward' }], else: [] },
    { id: 'home', type: 'if', condition: 'home', then: [{ id: 'w', type: 'wait' }], else: [] }], F1: [], F2: [] };
  data.unlocked.push('coop-delivery'); data.tutorialSeen['box-intro'] = true;
  data.challenges['coop-delivery'] = { versionKey: 'map-1:rules-2', elapsedMs: 12500, attempts: 3, hintUsed: true, started: true, finished: false, resting: true };
  const storage = fakeStorage(), persistence = S.create(storage);
  assert.equal(persistence.save(data).ok, true); assert.deepEqual(S.create(storage).load().data, data);
  persistence.save({ ...data, currentLevel: 12 }); storage.setItem(S.KEY, '{broken');
  assert.deepEqual(S.create(storage).load(), { status: 'recovered', data });
});

test('first and best times update with the same command count and remain separate by assistance and version', () => {
  const data = S.defaults(), record = { elapsedMs: 120000, stored: 6, turns: 10, attempts: 2, hintUsed: false };
  S.recordCompletion(data, 'coop-intro', 'map-1:rules-2', record);
  S.recordCompletion(data, 'coop-intro', 'map-1:rules-2', { ...record, elapsedMs: 110000, attempts: 1 });
  let records = data.records['coop-intro']['map-1:rules-2'];
  assert.equal(records.first.elapsedMs, 120000); assert.equal(records.unassisted.first.elapsedMs, 120000);
  assert.equal(records.unassisted.best.elapsedMs, 110000);
  S.recordCompletion(data, 'coop-intro', 'map-1:rules-2', { ...record, elapsedMs: 50000, hintUsed: true });
  assert.equal(records.assisted.best.elapsedMs, 50000); assert.equal(records.unassisted.best.elapsedMs, 110000);
  S.recordCompletion(data, 'coop-intro', 'map-2:rules-2', { ...record, elapsedMs: 1000 });
  assert.equal(records.unassisted.best.elapsedMs, 110000);
  assert.equal(data.records['coop-intro']['map-2:rules-2'].unassisted.best.elapsedMs, 1000);
  S.recordCompletion(data, 'coop-intro', 'map-1:rules-2', { ...record, elapsedMs: 115000, stored: 4 });
  assert.equal(records.unassisted.best.elapsedMs, 110000, 'fastest time and fewest saved commands are different metrics');
  assert.equal(data.completed['coop-intro'].stored, 4);
  assert.deepEqual(S.sanitize(JSON.parse(JSON.stringify(data))), data);
  record.elapsedMs = 0; assert.equal(records.first.elapsedMs, 120000, 'caller mutations cannot rewrite first completion');
});

test('new data rejects hostile IDs, versions, timings, impossible challenge states and malformed record groups', () => {
  const data = JSON.parse('{"version":2,"currentLevel":"__proto__","unlocked":["__proto__","constructor","prototype",99,"safe-stage"],"programs":{"__proto__":{"main":[],"F1":[],"F2":[]}},"records":{"constructor":{},"safe-stage":{"__proto__":{}}},"challenges":{"__proto__":{}},"tutorialSeen":{"constructor":true,"safe-stage":true}}');
  const invalid = { versionKey: 'map-1:rules-2', elapsedMs: -1, attempts: 1, hintUsed: false, started: true, finished: false, resting: false };
  data.challenges['bad-time'] = invalid;
  data.challenges['bad-state'] = { ...invalid, elapsedMs: 0, started: false, finished: true };
  data.challenges['bad-version'] = { ...invalid, elapsedMs: 0, versionKey: '__proto__' };
  data.records['safe-stage']['map-1:rules-2'] = { unassisted: { first: { elapsedMs: 0, stored: 2, turns: 1, attempts: 1, hintUsed: true }, best: {} } };
  const clean = S.sanitize(data);
  assert.equal(clean.currentLevel, 1); assert.deepEqual(clean.unlocked, [1, 'safe-stage']);
  assert.deepEqual(clean.programs, {}); assert.deepEqual(clean.records, {}); assert.deepEqual(clean.challenges, {});
  assert.deepEqual(clean.tutorialSeen, { 'safe-stage': true }); assert.equal({}.polluted, undefined);
  assert.throws(() => S.recordCompletion(clean, 'constructor', 'map-1:rules-2', {}));
});
