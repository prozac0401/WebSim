const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./storage.js');

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
  assert.deepEqual(clean, { ...S.defaults(), completed: { 1: true, 2: { stored: 2, executed: 6 } } });
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
  assert.equal(persistence.save({ version: 2 }).status, 'invalid');
  assert.deepEqual(persistence.load().data, fixture());
});
