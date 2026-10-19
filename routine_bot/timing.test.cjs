const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./timing.js');
const S = require('./storage.js');

test('reading help after completion cannot relabel the finished attempt as assisted', () => {
  const {tracker,advance}=fixture();tracker.start();advance(200);tracker.finish();
  tracker.pause('help');tracker.hint();advance(500);tracker.resume('help');
  assert.equal(tracker.snapshot().hintUsed,false);assert.equal(tracker.snapshot().elapsedMs,200);
  tracker.restart();tracker.hint();assert.equal(tracker.snapshot().hintUsed,true);
});

function fixture(saved, versionKey = 'map-1:rules-2') {
  let time = 0;
  const tracker = T.createTracker({ now: () => time, saved, versionKey });
  return { tracker, advance: amount => { time += amount; }, set: value => { time = value; } };
}

test('explicit start excludes preview time; editing, failed attempts and execution review accumulate', () => {
  const { tracker, advance } = fixture();
  advance(9000); assert.equal(tracker.snapshot().elapsedMs, 0);
  tracker.start(); advance(1100); tracker.attempt(); // thinking and editing
  advance(200); tracker.attempt(); // failed run, position reset, retry
  advance(400); // execution pause still counts as review time
  tracker.start(); // repeated start cannot erase an active attempt
  assert.deepEqual(tracker.snapshot(), { versionKey: 'map-1:rules-2', elapsedMs: 1700, attempts: 2, hintUsed: false, started: true, finished: false, resting: false });
  tracker.finish(); advance(30000); assert.equal(tracker.snapshot().elapsedMs, 1700);
  tracker.start(); assert.equal(tracker.snapshot().elapsedMs, 1700, 'only explicit restart can create a new record');
});

test('overlapping hidden, help, tutorial, level and rest exclusions are independent', () => {
  const { tracker, advance } = fixture();
  tracker.start(); advance(100); tracker.pause('help'); advance(200);
  tracker.pause('hidden'); tracker.pause('tutorial'); advance(300);
  tracker.resume('help'); advance(400); assert.equal(tracker.snapshot().elapsedMs, 100);
  tracker.resume('hidden'); advance(500); assert.equal(tracker.snapshot().elapsedMs, 100);
  tracker.resume('tutorial'); advance(100); tracker.pause('rest'); advance(200);
  assert.equal(tracker.snapshot().resting, true); assert.equal(tracker.isActive(), false);
  tracker.attempt(); assert.equal(tracker.snapshot().attempts, 0, 'rest cannot start another execution attempt');
  tracker.pause('level'); tracker.resume('rest'); advance(600); assert.equal(tracker.snapshot().elapsedMs, 200);
  tracker.resume('level'); advance(100); assert.equal(tracker.snapshot().elapsedMs, 300);
  assert.deepEqual(tracker.reasons(), []);
});

test('hidden before challenge start remains excluded until the matching resume', () => {
  const { tracker, advance } = fixture();
  tracker.pause('hidden'); tracker.start(); advance(1000);
  assert.equal(tracker.snapshot().elapsedMs, 0);
  tracker.resume('hidden'); advance(500); assert.equal(tracker.snapshot().elapsedMs, 500);
});

test('snapshot and reload keep elapsed time, attempts and assistance while excluding the closed gap', () => {
  const first = fixture(); first.tracker.start(); first.advance(1400); first.tracker.attempt(); first.tracker.hint();
  const data = S.defaults(); data.challenges['coop-intro'] = first.tracker.snapshot();
  const saved = S.sanitize(JSON.parse(JSON.stringify(data))).challenges['coop-intro'];
  const restored = fixture(saved); restored.advance(300);
  assert.equal(restored.tracker.snapshot().elapsedMs, 1700);
  assert.equal(restored.tracker.snapshot().attempts, 1); assert.equal(restored.tracker.snapshot().hintUsed, true);
  assert.equal(restored.tracker.snapshot().started, true);
  restored.tracker.pause('rest'); const resting = fixture(restored.tracker.snapshot()); resting.advance(50000);
  assert.equal(resting.tracker.snapshot().elapsedMs, 1700); assert.equal(resting.tracker.snapshot().resting, true);
  resting.tracker.resume('rest'); resting.advance(100); assert.equal(resting.tracker.snapshot().elapsedMs, 1800);
});

test('explicit new-record challenge clears accumulation; rule version mismatch starts fresh', () => {
  const first = fixture(); first.tracker.start(); first.advance(1000); first.tracker.attempt(); first.tracker.hint(); first.tracker.finish();
  const changed = fixture(first.tracker.snapshot(), 'map-2:rules-2');
  assert.equal(changed.tracker.snapshot().started, false); assert.equal(changed.tracker.snapshot().elapsedMs, 0);
  first.tracker.restart(); assert.equal(first.tracker.snapshot().elapsedMs, 0);
  assert.equal(first.tracker.snapshot().attempts, 0); assert.equal(first.tracker.snapshot().hintUsed, false);
  assert.equal(first.tracker.snapshot().finished, false); first.advance(400); assert.equal(first.tracker.snapshot().elapsedMs, 400);
});

test('nonmonotonic or invalid injected clock cannot make negative time or count a recovered interval twice', () => {
  const { tracker, set } = fixture(); tracker.start(); set(1000); assert.equal(tracker.snapshot().elapsedMs, 1000);
  set(-5000); assert.equal(tracker.snapshot().elapsedMs, 1000);
  set(NaN); assert.equal(tracker.snapshot().elapsedMs, 1000);
  set(500); assert.equal(tracker.snapshot().elapsedMs, 1000);
  set(1100); assert.equal(tracker.snapshot().elapsedMs, 1100);
});

test('periodic snapshots bound abnormal termination loss to unsaved active interval', () => {
  const original = fixture(); original.tracker.start(); original.advance(1000); const checkpoint = original.tracker.snapshot();
  original.advance(999); // process terminates before next one-second checkpoint
  const restored = fixture(checkpoint); assert.equal(restored.tracker.snapshot().elapsedMs, 1000);
  assert.equal(original.tracker.snapshot().elapsedMs - restored.tracker.snapshot().elapsedMs, 999);
});

test('wall-clock changes do not enter tracker and time formatting keeps legacy no-time distinct from zero', () => {
  const original = Date.now; Date.now = () => -9999999999999;
  try { const { tracker, advance } = fixture(); tracker.start(); advance(100); assert.equal(tracker.snapshot().elapsedMs, 100); }
  finally { Date.now = original; }
  assert.equal(T.formatTime(undefined), '시간 기록 없음'); assert.equal(T.formatTime(0), '0:00');
  assert.equal(T.formatTime(65000), '1:05'); assert.equal(T.formatTime(3661000), '1:01:01');
});
