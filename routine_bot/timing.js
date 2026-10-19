(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoutineBotTiming = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_TIME = 10 * 366 * 24 * 60 * 60 * 1000;
  const bounded = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;

  // Only deltas from a monotonic clock are counted. A persisted snapshot never
  // stores a wall-clock timestamp: closed-tab and reload gaps cannot be added.
  function createTracker({ now = () => globalThis.performance.now(), saved, versionKey = 'map-1:rules-2' } = {}) {
    const previous = saved && saved.versionKey === versionKey ? saved : null;
    let elapsedMs = previous && bounded(previous.elapsedMs, MAX_TIME) ? previous.elapsedMs : 0;
    let attempts = previous && Number.isInteger(previous.attempts) && bounded(previous.attempts, 100000) ? previous.attempts : 0;
    let hintUsed = previous?.hintUsed === true;
    let started = previous?.started === true;
    let finished = started && previous?.finished === true;
    const exclusions = new Set(previous?.resting === true ? ['rest'] : []);
    let latest = 0;
    let initialized = false;

    function clock() {
      const value = now();
      if (Number.isFinite(value)) {
        latest = initialized ? Math.max(latest, value) : value;
        initialized = true;
      }
      return latest;
    }
    let anchor = clock();

    function isActive() { return started && !finished && exclusions.size === 0; }
    function checkpoint() {
      const current = clock();
      if (isActive()) elapsedMs = Math.min(MAX_TIME, elapsedMs + Math.max(0, current - anchor));
      anchor = current;
    }
    function snapshot() {
      checkpoint();
      return { versionKey, elapsedMs: Math.floor(elapsedMs), attempts, hintUsed, started, finished, resting: exclusions.has('rest') };
    }
    function start() {
      checkpoint();
      if (!started) started = true;
      return snapshot();
    }
    function restart() {
      checkpoint();
      elapsedMs = 0; attempts = 0; hintUsed = false; started = true; finished = false;
      exclusions.delete('rest');
      return snapshot();
    }
    function pause(reason) {
      if (typeof reason !== 'string' || !reason.length || reason.length > 32) throw new Error('An exclusion reason is required');
      checkpoint();
      exclusions.add(reason);
      return snapshot();
    }
    function resume(reason) {
      checkpoint();
      exclusions.delete(reason);
      return snapshot();
    }
    function attempt() {
      checkpoint();
      if (isActive()) attempts = Math.min(100000, attempts + 1);
      return snapshot();
    }
    function hint() { checkpoint(); if (!finished) hintUsed = true; return snapshot(); }
    function finish() {
      checkpoint();
      if (started) finished = true;
      return snapshot();
    }
    return { start, restart, pause, resume, attempt, hint, snapshot, finish, isActive, reasons: () => [...exclusions] };
  }

  function formatTime(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '시간 기록 없음';
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
    return `${hours ? hours + ':' : ''}${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  return { createTracker, formatTime };
});
