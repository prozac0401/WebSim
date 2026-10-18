(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoutineBotStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'routinebot-save-v1';
  const BACKUP_KEY = KEY + '-backup';
  const MAX_TEXT = 256 * 1024;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({ version: 1, currentLevel: 1, completed: {}, programs: {}, settings: { speed: 1, muted: true } });

  // Only bounded command data survives. This does not replace engine validation:
  // chapter availability, budgets, and call-graph rules still belong to the engine.
  function cleanProgram(value) {
    if (!record(value)) return null;
    const seen = new Set();
    const ids = new Set();
    let count = 0;
    function cleanList(list, depth) {
      if (!Array.isArray(list) || depth > 4 || seen.has(list) || list.length > 128) throw new Error('structure');
      seen.add(list);
      return list.map(node => {
        if (!record(node) || seen.has(node) || ++count > 128 || typeof node.id !== 'string' || !node.id.length || node.id.length > 80 || ids.has(node.id)) throw new Error('node');
        seen.add(node); ids.add(node.id);
        const safe = { id: node.id, type: node.type };
        if (['forward', 'left', 'right', 'wait'].includes(node.type)) return safe;
        if (node.type === 'repeat' && integer(node.count, 2, 12)) return { ...safe, count: node.count, body: cleanList(node.body, depth + 1) };
        if (node.type === 'if' && ['blocked', 'mark'].includes(node.condition)) return { ...safe, condition: node.condition, then: cleanList(node.then, depth + 1), else: cleanList(node.else, depth + 1) };
        if (node.type === 'call' && ['F1', 'F2'].includes(node.target)) return { ...safe, target: node.target };
        throw new Error('command');
      });
    }
    try { return { main: cleanList(value.main, 0), F1: cleanList(value.F1, 0), F2: cleanList(value.F2, 0) }; }
    catch (_) { return null; }
  }

  function sanitize(value) {
    if (!record(value) || value.version !== 1) return null;
    const safe = defaults();
    if (integer(value.currentLevel, 1, 15)) safe.currentLevel = value.currentLevel;
    for (let level = 1; level <= 15; level++) {
      if (record(value.programs) && own(value.programs, level)) {
        const program = cleanProgram(value.programs[level]);
        if (program) safe.programs[level] = program;
      }
      if (record(value.completed) && own(value.completed, level)) {
        const result = value.completed[level];
        if (result === true) safe.completed[level] = true;
        else if (record(result) && integer(result.stored, 0, 128) && integer(result.executed, 0, 100000)) {
          safe.completed[level] = { stored: result.stored, executed: result.executed };
        }
      }
    }
    if (record(value.settings)) {
      if ([0.5, 1, 2, 4].includes(value.settings.speed)) safe.settings.speed = value.settings.speed;
      if (typeof value.settings.muted === 'boolean') safe.settings.muted = value.settings.muted;
    }
    return safe;
  }

  function readRecord(text) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
    try {
      const raw = JSON.parse(text), data = sanitize(raw);
      if (!data) return null;
      const damagedPrograms = [];
      for (let level = 1; level <= 15; level++) {
        if (record(raw.programs) && own(raw.programs, level) && !own(data.programs, level)) damagedPrograms.push(level);
      }
      if (own(raw, 'programs') && !record(raw.programs)) for (let level = 1; level <= 15; level++) damagedPrograms.push(level);
      return { data, damagedPrograms };
    } catch (_) { return null; }
  }
  const parse = text => readRecord(text)?.data || null;

  function create(storage) {
    let memory = defaults();
    let resolvedStorage;
    function getStorage() {
      if (resolvedStorage) return resolvedStorage;
      // Access itself can throw (blocked cookies/private contexts), so callers
      // keep this inside their try/catch as well as each method call.
      resolvedStorage = storage === undefined ? globalThis.localStorage : storage;
      if (!resolvedStorage || typeof resolvedStorage.getItem !== 'function' || typeof resolvedStorage.setItem !== 'function') throw new Error('unavailable');
      return resolvedStorage;
    }
    function load() {
      try {
        const target = getStorage();
        const raw = target.getItem(KEY);
        const saved = readRecord(raw);
        if (saved) {
          memory = saved.data;
          if (saved.damagedPrograms.length) {
            const backup = parse(target.getItem(BACKUP_KEY));
            if (backup) for (const level of saved.damagedPrograms) {
              if (own(backup.programs, level)) memory.programs[level] = backup.programs[level];
            }
            return { data: clone(memory), status: 'repaired' };
          }
          return { data: clone(memory), status: 'loaded' };
        }
        const backup = parse(target.getItem(BACKUP_KEY));
        if (backup) { memory = backup; return { data: clone(memory), status: 'recovered' }; }
        return { data: clone(memory), status: raw === null ? 'empty' : 'corrupt' };
      } catch (_) { return { data: clone(memory), status: 'unavailable' }; }
    }
    function save(value) {
      const safe = sanitize(value);
      if (!safe) return { ok: false, status: 'invalid', data: clone(memory) };
      memory = safe;
      try {
        const target = getStorage();
        // A backup failure must not prevent a primary write (e.g. quota leaves
        // room only for replacing the primary). Never back up corrupt text.
        try {
          const previous = readRecord(target.getItem(KEY));
          if (previous && !previous.damagedPrograms.length) target.setItem(BACKUP_KEY, JSON.stringify(previous.data));
        } catch (_) { /* best effort only */ }
        target.setItem(KEY, JSON.stringify(safe));
        return { ok: true, status: 'saved', data: clone(memory) };
      } catch (_) { return { ok: false, status: 'unavailable', data: clone(memory) }; }
    }
    return { load, save };
  }

  return { KEY, BACKUP_KEY, defaults, sanitize, cleanProgram, create };
});
