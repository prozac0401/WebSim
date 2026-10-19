'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { gzipSync, gunzipSync } = require('node:zlib');
const source = fs.readFileSync(require.resolve('./manufacturer-models.js'), 'utf8');
const model = (id, marker = 'current') => ({ id, marker, bounds: { min: [0, 0, 0], max: [4, 2, 1.5] }, source: {}, primitives: [] });
const pack = data => gzipSync(JSON.stringify(data)).toString('base64');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function harness(options = {}) {
  let now = 0, sequence = 0, decodeCount = 0;
  const timers = new Map(), scripts = [], document = { currentScript: { src: 'https://example.test/game/manufacturer-models.js?v=cache-42' } };
  const setTimeout = (fn, ms) => { const id = ++sequence; timers.set(id, { at: now + ms, fn }); return id; };
  const clearTimeout = id => timers.delete(id);
  document.createElement = tag => {
    assert.equal(tag, 'script');
    return { removed: false, remove() { this.removed = true; } };
  };
  document.head = { append(script) { scripts.push(script); } };
  // Keep the real gzip/JSON decoding but make async completion controllable.
  // The real browser/Node stream decoder is covered by manufacturer-models.test.
  class Blob { constructor(chunks) { this.bytes = chunks[0]; } stream() { return { pipeThrough: () => ({ bytes: this.bytes }) }; } }
  class Response {
    constructor(stream) { this.stream = stream; }
    json() {
      decodeCount++;
      const data = JSON.parse(gunzipSync(this.stream.bytes).toString('utf8'));
      return options.decode ? options.decode(data, decodeCount) : Promise.resolve(data);
    }
  }
  const context = vm.createContext({ atob, Uint8Array, Uint16Array, Uint32Array, Float32Array, Blob, Response,
    DecompressionStream: class {}, document, setTimeout, clearTimeout });
  vm.runInContext(source, context); document.currentScript = null;
  const api = context.ManufacturerModels;
  async function advance(ms) {
    const target = now + ms;
    for (let i = 0; i < 1000; i++) {
      const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    now = target; await flush();
  }
  function execute(script, data, { compressed = true, payload } = {}) {
    document.currentScript = script;
    let task;
    try { task = compressed ? api.registerCompressed(payload ?? pack(data)) : api.register(data); }
    finally { document.currentScript = null; }
    script.onload?.();
    return task;
  }
  return { api, scripts, timers, advance, execute, context, document, decodes: () => decodeCount };
}

test('per-model single-flight includes reentrant listeners and reports registration completion', async () => {
  const h = harness(), events = [], reentrant = [];
  const unsubscribe = h.api.subscribe(state => { events.push(state); if (state.status === 'loading') reentrant.push(h.api.load(state.id)); });
  const task = h.api.load('bmw_m2');
  assert.equal(h.api.load('bmw_m2'), task); assert.ok(reentrant.every(p => p === task));
  assert.equal(h.scripts.length, 1); assert.equal(h.api.isLoading('bmw_m2'), true);
  assert.equal(h.scripts[0].src, 'https://example.test/game/assets/models/bmw_m2-runtime.js?v=cache-42');
  assert.equal(h.api.getLoadState('bmw_m2').phase, 'fetching');
  const registration = h.execute(h.scripts[0], model('bmw_m2'));
  const ready = h.api.ready;
  assert.equal(h.api.getLoadState('bmw_m2').phase, 'decoding');
  await ready; assert.equal(h.api.has('bmw_m2'), true, 'ready must expose the decoded model, not only a staged candidate');
  assert.equal(await registration, true); assert.equal(await task, true);
  assert.equal(events.at(-1).status, 'ready'); assert.equal(events.at(-1).error, null);
  assert.equal(h.api.has('bmw_m2'), true); assert.equal(h.api.isLoading('bmw_m2'), false);
  assert.equal(h.scripts[0].removed, true); assert.equal(h.scripts[0].onload, null); assert.equal(h.timers.size, 0);
  assert.ok(Object.isFrozen(h.api.getLoadState('bmw_m2')));
  const count = events.length; unsubscribe(); h.api.register(model('g70')); assert.equal(events.length, count);
  assert.equal(await h.api.load('bmw_m2'), true); assert.equal(h.scripts.length, 1, 'ready models do not load twice');
});

test('one stalled decoder cannot delay another model and completed registration tasks are released', async () => {
  const stalled = deferred(), h = harness({ decode: data => data.id === 'g80' ? stalled.promise : Promise.resolve(data) });
  const slow = h.api.load('g80'), fast = h.api.load('supra');
  h.execute(h.scripts[0], model('g80')); h.execute(h.scripts[1], model('supra'));
  assert.equal(await fast, true); assert.equal(h.api.getLoadState('g80').status, 'loading');
  assert.equal(h.api.has('g80'), false); assert.equal(h.api.has('supra'), true);
  stalled.resolve(model('g80')); assert.equal(await slow, true);
  assert.deepEqual(Array.from(await h.api.ready), [], 'ready retains no completed decoder task history');
});

test('network failures retry only once, clean up, then allow a fresh manual retry', async () => {
  const h = harness(), first = h.api.load('g70');
  h.scripts[0].onerror(); await flush();
  assert.equal(h.api.getLoadState('g70').phase, 'retrying'); assert.equal(h.api.getLoadState('g70').errorCode, 'network');
  assert.equal(h.scripts[0].removed, true); assert.equal(h.scripts.length, 1);
  await h.advance(500); assert.equal(h.scripts.length, 2); assert.match(h.scripts[1].src, /v=cache-42&retry=/);
  h.scripts[1].onerror(); assert.equal(await first, false);
  assert.equal(h.api.getLoadState('g70').status, 'error'); assert.equal(h.api.getLoadState('g70').attempt, 2);
  assert.equal(h.api.getLoadState('g70').retryable, true); assert.equal(h.api.isLoading('g70'), false);
  await h.advance(200000); assert.equal(h.scripts.length, 2, 'no infinite automatic retry');
  const retry = h.api.load('g70'); assert.notEqual(retry, first); assert.equal(h.scripts.length, 3);
  assert.match(h.scripts[2].src, /retry=/, 'manual retry also bypasses a failed cached response');
  h.execute(h.scripts[2], model('g70')); assert.equal(await retry, true);
  assert.equal(h.api.getLoadState('g70').attempt, 1); assert.equal(h.api.getLoadState('g70').error, null);
  assert.equal(h.api.failures.length, 2); assert.equal(h.timers.size, 0); assert.ok(h.scripts.every(s => s.removed));
});

test('a transient compressed response failure is observable and recovers on its own retry', async () => {
  const h = harness(), task = h.api.load('ray');
  assert.equal(await h.execute(h.scripts[0], null, { payload: Buffer.from('broken gzip').toString('base64') }), false);
  await flush(); assert.equal(h.api.getLoadState('ray').errorCode, 'decode'); assert.equal(h.api.has('ray'), false);
  await h.advance(500); h.execute(h.scripts[1], model('ray'));
  assert.equal(await task, true); assert.equal(h.api.getLoadState('ray').status, 'ready');
  assert.equal(h.api.failures.length, 1); assert.equal(h.timers.size, 0);
});

test('timeout invalidates a removed script before late execution and bounds silent network attempts', async () => {
  const h = harness(), task = h.api.load('ioniq5'), old = h.scripts[0];
  await h.advance(45000); assert.equal(h.api.getLoadState('ioniq5').phase, 'retrying');
  assert.equal(h.api.getLoadState('ioniq5').errorCode, 'timeout'); assert.equal(old.removed, true);
  await h.advance(500); assert.equal(h.scripts.length, 2);
  assert.equal(await h.execute(old, model('ioniq5', 'late-old-script')), false);
  assert.equal(h.decodes(), 0, 'the stale token is checked before doing expensive decompression');
  assert.equal(h.api.getLoadState('ioniq5').phase, 'fetching');
  assert.equal(h.execute(old, model('ioniq5', 'late-direct-register'), { compressed: false }), false);
  await h.advance(45000); assert.equal(await task, false);
  assert.equal(h.api.getLoadState('ioniq5').status, 'error'); assert.equal(h.api.has('ioniq5'), false);
  assert.equal(h.timers.size, 0); assert.ok(h.scripts.every(s => s.removed));
});

test('a decoder finishing after timeout cannot overwrite a successful retry or hold ready forever', async () => {
  const stalled = deferred(), h = harness({ decode: (data, count) => count === 1 ? stalled.promise : Promise.resolve(data) });
  const task = h.api.load('g80'), oldDecode = h.execute(h.scripts[0], model('g80', 'old'));
  const readyBeforeTimeout = h.api.ready;
  await flush(); await h.advance(45000);
  assert.deepEqual(Array.from(await readyBeforeTimeout), [false], 'ready snapshots also settle when their attempt expires');
  assert.deepEqual(Array.from(await h.api.ready), [], 'expired decoder leaves the active pending set');
  await h.advance(500); h.execute(h.scripts[1], model('g80', 'retry'));
  assert.equal(await task, true); assert.equal(h.api.get('g80').marker, 'retry');
  stalled.resolve(model('g80', 'late-old-decoder')); assert.equal(await oldDecode, false);
  assert.equal(h.api.get('g80').marker, 'retry'); assert.equal(h.api.getLoadState('g80').status, 'ready');
  assert.equal(h.api.failures.length, 1); assert.equal(h.timers.size, 0);
});

test('a script that registers no model or the wrong identity cannot report success', async () => {
  const h = harness(), task = h.api.load('carnival');
  h.scripts[0].onload(); await flush();
  assert.equal(h.api.getLoadState('carnival').errorCode, 'registration');
  await h.advance(500); await h.execute(h.scripts[1], model('staria'));
  assert.equal(await task, false); assert.equal(h.api.has('carnival'), false); assert.equal(h.api.has('staria'), false);
  assert.equal(h.api.getLoadState('carnival').status, 'error'); assert.equal(h.timers.size, 0);
});

test('all sixteen known identities support direct managed registration without changing asset format', async () => {
  const h = harness();
  const ids = ['g80', 'ioniq5', 'santafe', 'staria', 'carnival', 'morning', 'ray', 'k5', 'avante', 'grandeur', 'torres', 'musso_ev', 'porter2', 'g70', 'supra', 'bmw_m2'];
  for (const id of ids) {
    assert.equal(h.api.canLoad(id), true);
    const task = h.api.load(id); h.execute(h.scripts.at(-1), model(id), { compressed: false }); assert.equal(await task, true);
  }
  assert.deepEqual(Array.from(h.api.ids()).sort(), ids.sort());
  assert.equal(await h.api.load('unknown'), false); assert.equal(h.api.getLoadState('unknown').retryable, false);
  assert.equal(h.scripts.length, 16); assert.equal(h.api.failures.length, 0); assert.equal(h.timers.size, 0);
});

test('standalone Node/VM registrations retain ready and report decoder failures without unhandled rejections', async () => {
  const h = harness(); delete h.context.document;
  const registration = h.api.registerCompressed(pack(model('supra'))), ready = h.api.ready;
  assert.equal(await registration, true); assert.deepEqual(Array.from(await ready), [true]);
  assert.equal(h.api.getLoadState('supra').status, 'ready'); assert.equal(await h.api.load('supra'), true);
  assert.equal(await h.api.registerCompressed('invalid'), false); assert.equal(h.api.failures.length, 1);
  const copy = h.api.failures; copy.length = 0; assert.equal(h.api.failures.length, 1);
  assert.equal(await h.api.load('g80'), false); assert.equal(h.scripts.length, 0);
});
