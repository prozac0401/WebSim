(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoutineBotStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'routinebot-save-v1';
  const BACKUP_KEY = KEY + '-backup';
  const MAX_TEXT = 256 * 1024;
  const MAX_TIME = 10 * 366 * 24 * 60 * 60 * 1000;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  const clone = value => JSON.parse(JSON.stringify(value));
  const validId = id => integer(id, 1, 15) || (typeof id === 'string' && /^(?:[1-9]|1[0-5]|[a-z][a-z0-9_-]{0,63})$/.test(id) && !['constructor', 'prototype'].includes(id));
  const normalizedId = id => /^\d+$/.test(String(id)) ? Number(id) : id;
  const validVersion = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value) && !['constructor', 'prototype'].includes(value);
  const defaults = (catalog = []) => ({ version: 2, currentLevel: validId(catalog[0]?.id) ? catalog[0].id : 1,
    completed: {}, programs: {}, settings: { speed: 1, muted: true }, unlocked: [validId(catalog[0]?.id) ? catalog[0].id : 1],
    records: {}, challenges: {}, tutorialSeen: {} });
  const versionKey = level => `map-${level.version || 1}:rules-${level.rulesVersion || '2'}`;

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
        if (node.type === 'if' && ['blocked', 'mark', 'box', 'home'].includes(node.condition)) return { ...safe, condition: node.condition, then: cleanList(node.then, depth + 1), else: cleanList(node.else, depth + 1) };
        if (node.type === 'call' && ['F1', 'F2'].includes(node.target)) return { ...safe, target: node.target };
        throw new Error('command');
      });
    }
    try { return { main: cleanList(value.main, 0), F1: cleanList(value.F1, 0), F2: cleanList(value.F2, 0) }; }
    catch (_) { return null; }
  }

  function cleanResult(value) {
    if (!record(value) || !integer(value.elapsedMs, 0, MAX_TIME) || !integer(value.stored, 0, 128) ||
      !integer(value.turns, 0, 100000) || !integer(value.attempts, 0, 100000) || typeof value.hintUsed !== 'boolean') return null;
    return { elapsedMs: value.elapsedMs, stored: value.stored, turns: value.turns, attempts: value.attempts, hintUsed: value.hintUsed };
  }

  function cleanChallenge(value) {
    if (!record(value) || !validVersion(value.versionKey) || !integer(value.elapsedMs, 0, MAX_TIME) || !integer(value.attempts, 0, 100000) ||
      !['started', 'finished', 'resting', 'hintUsed'].every(key => typeof value[key] === 'boolean') || (value.finished && !value.started)) return null;
    return { versionKey: value.versionKey, elapsedMs: value.elapsedMs, attempts: value.attempts, hintUsed: value.hintUsed,
      started: value.started, finished: value.finished, resting: value.resting };
  }

  function sanitize(value, catalog = []) {
    if (!record(value) || ![1, 2].includes(value.version)) return null;
    const safe = defaults(catalog);
    if (validId(value.currentLevel)) safe.currentLevel = normalizedId(value.currentLevel);
    const levelIds = new Set(Object.keys(record(value.programs) ? value.programs : {}).concat(Object.keys(record(value.completed) ? value.completed : {})).filter(validId).slice(0, 256));
    for (const level of levelIds) {
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
    if (value.version === 1) {
      // Preserve every formerly available original level when new stages are
      // inserted. Numeric identities are never remapped to catalog positions.
      const frontier = Math.max(integer(safe.currentLevel, 1, 15) ? safe.currentLevel : 1,
        ...Object.keys(safe.completed).filter(id => integer(Number(id), 1, 15)).map(id => Math.min(15, Number(id) + 1)));
      safe.unlocked = Array.from({ length: frontier }, (_, index) => index + 1);
    } else if (Array.isArray(value.unlocked)) {
      safe.unlocked = [...new Set(safe.unlocked.concat(value.unlocked.filter(validId).map(normalizedId)))].slice(0, 256);
    }
    for (const level of Object.keys(record(value.records) ? value.records : {}).filter(validId).slice(0, 256)) {
      if (!record(value.records[level])) continue;
      const versions = {};
      for (const key of Object.keys(value.records[level]).filter(validVersion).slice(0, 32)) {
        const source = value.records[level][key];
        if (!record(source)) continue;
        const groups = {};
        const first = cleanResult(source.first);
        if (first) groups.first = first;
        for (const group of ['assisted', 'unassisted']) {
          if (!record(source[group])) continue;
          const first = cleanResult(source[group].first), best = cleanResult(source[group].best);
          if (first && best && first.hintUsed === (group === 'assisted') && best.hintUsed === (group === 'assisted')) groups[group] = { first, best };
        }
        if (Object.keys(groups).length) versions[key] = groups;
      }
      if (Object.keys(versions).length) safe.records[level] = versions;
    }
    for (const level of Object.keys(record(value.challenges) ? value.challenges : {}).filter(validId).slice(0, 256)) {
      const challenge = cleanChallenge(value.challenges[level]);
      if (challenge) safe.challenges[level] = challenge;
    }
    for (const key of Object.keys(record(value.tutorialSeen) ? value.tutorialSeen : {}).filter(validId).slice(0, 256)) {
      if (value.tutorialSeen[key] === true) safe.tutorialSeen[key] = true;
    }
    if (record(value.settings)) {
      if ([0.5, 1, 2, 4].includes(value.settings.speed)) safe.settings.speed = value.settings.speed;
      if (typeof value.settings.muted === 'boolean') safe.settings.muted = value.settings.muted;
    }
    return safe;
  }

  function readRecord(text, catalog = []) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
    try {
      const raw = JSON.parse(text), data = sanitize(raw, catalog);
      if (!data) return null;
      const damagedPrograms = [];
      for (const level of Object.keys(record(raw.programs) ? raw.programs : {}).filter(validId)) {
        if (record(raw.programs) && own(raw.programs, level) && !own(data.programs, level)) damagedPrograms.push(level);
      }
      if (own(raw, 'programs') && !record(raw.programs)) damagedPrograms.push('*');
      return { data, damagedPrograms };
    } catch (_) { return null; }
  }
  const parse = (text, catalog) => readRecord(text, catalog)?.data || null;

  function isUnlocked(data, id, catalog) {
    if (!validId(id)) return false;
    if (own(data.completed || {}, id) || (data.unlocked || []).some(saved => String(saved) === String(id))) return true;
    const index = catalog.findIndex(level => String(level.id) === String(id));
    if (index < 0) return false;
    const prerequisites = catalog[index].prerequisites || (index ? [catalog[index - 1].id] : []);
    return prerequisites.every(required => own(data.completed || {}, required));
  }

  function grantUnlocked(data, catalog) {
    data.unlocked = [...new Set((data.unlocked || []).concat(catalog.filter(level => isUnlocked(data, level.id, catalog)).map(level => level.id)))];
    return data;
  }

  function nextLevelId(id, catalog) {
    const index = catalog.findIndex(level => String(level.id) === String(id));
    return index >= 0 && index + 1 < catalog.length ? catalog[index + 1].id : null;
  }

  function recordCompletion(data, id, key, result) {
    const clean = cleanResult(result);
    if (!validId(id) || !validVersion(key) || !clean) throw new Error('Invalid personal completion record');
    if (!record(data.completed)) data.completed = {};
    const previous = data.completed[id], executed = integer(result.executed, 0, 100000) ? result.executed : clean.turns;
    if (!record(previous) || clean.stored < previous.stored || (clean.stored === previous.stored && executed < previous.executed))
      data.completed[id] = { stored: clean.stored, executed };
    if (!record(data.records)) data.records = {};
    if (!own(data.records, id)) data.records[id] = {};
    if (!own(data.records[id], key)) data.records[id][key] = {};
    const versions = data.records[id][key], group = clean.hintUsed ? 'assisted' : 'unassisted';
    if (!versions.first) versions.first = clone(clean);
    if (!versions[group]) versions[group] = { first: clone(clean), best: clone(clean) };
    const best = versions[group].best;
    if (clean.elapsedMs < best.elapsedMs || (clean.elapsedMs === best.elapsedMs && clean.stored < best.stored) ||
      (clean.elapsedMs === best.elapsedMs && clean.stored === best.stored && clean.turns < best.turns)) versions[group].best = clone(clean);
    return clone(versions[group]);
  }

  function create(storage, catalog = []) {
    let memory = defaults(catalog);
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
        const saved = readRecord(raw, catalog);
        if (saved) {
          memory = saved.data;
          if (saved.damagedPrograms.length) {
            const backup = parse(target.getItem(BACKUP_KEY), catalog);
            if (backup) for (const level of saved.damagedPrograms) {
              if (level === '*') { memory.programs = clone(backup.programs); continue; }
              if (own(backup.programs, level)) memory.programs[level] = backup.programs[level];
            }
            return { data: clone(memory), status: 'repaired' };
          }
          return { data: clone(memory), status: 'loaded' };
        }
        const backup = parse(target.getItem(BACKUP_KEY), catalog);
        if (backup) { memory = backup; return { data: clone(memory), status: 'recovered' }; }
        return { data: clone(memory), status: raw === null ? 'empty' : 'corrupt' };
      } catch (_) { return { data: clone(memory), status: 'unavailable' }; }
    }
    function save(value) {
      const safe = sanitize(value, catalog);
      if (!safe) return { ok: false, status: 'invalid', data: clone(memory) };
      memory = safe;
      try {
        const target = getStorage();
        // A backup failure must not prevent a primary write (e.g. quota leaves
        // room only for replacing the primary). Never back up corrupt text.
        try {
          const previous = readRecord(target.getItem(KEY), catalog);
          if (previous && !previous.damagedPrograms.length) target.setItem(BACKUP_KEY, JSON.stringify(previous.data));
        } catch (_) { /* best effort only */ }
        const text = JSON.stringify(safe);
        if (text.length > MAX_TEXT) return { ok: false, status: 'too-large', data: clone(memory) };
        target.setItem(KEY, text);
        return { ok: true, status: 'saved', data: clone(memory) };
      } catch (_) { return { ok: false, status: 'unavailable', data: clone(memory) }; }
    }
    return { load, save };
  }

  return { KEY, BACKUP_KEY, MAX_TIME, defaults, sanitize, cleanProgram, cleanResult, cleanChallenge, create,
    isUnlocked, grantUnlocked, nextLevelId, versionKey, recordCompletion };
});
