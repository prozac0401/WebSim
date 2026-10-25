(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'websim.stopped-saturday.v1';
  const MAX_IMPORT_BYTES = 16384;
  const MAX_STORAGE_BYTES = 2 * 1024 * 1024;
  const MAX_RECORDS = 500;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const fail = message => { throw new Error(message); };
  function exactKeys(value, keys, label) {
    if (!plain(value)) fail(`${label} 형식이 올바르지 않습니다.`);
    if (Object.keys(value).length !== keys.length || keys.some(key => !own(value, key)) || Object.keys(value).some(key => !keys.includes(key))) {
      fail(`${label}의 필수 항목이 없거나 허용하지 않은 항목이 있습니다.`);
    }
  }
  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return encodeURIComponent(text).replace(/%[A-F\d]{2}/g, 'x').length;
  }
  function same(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
    if (!plain(a) || !plain(b)) return false;
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    return same(ak, bk) && ak.every(key => same(a[key], b[key]));
  }
  function defaultId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return `day-${root.crypto.randomUUID()}`;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'day-';
    for (let i = 0; i < 28; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  function create(options) {
    options = options || {};
    const engine = options.engine || root.SaturdayStory;
    if (!engine || typeof engine.normalizeStart !== 'function' || typeof engine.replay !== 'function' || typeof engine.getNode !== 'function') {
      fail('이야기 엔진을 먼저 불러와야 합니다.');
    }
    const scenarioVersion = engine.SCENARIO_VERSION;
    if (typeof scenarioVersion !== 'string' || !scenarioVersion) fail('이야기 버전을 확인할 수 없습니다.');
    const idFactory = options.idFactory || defaultId;
    let storage = null, preservedRaw = null, lastSavedRaw = null;
    let mode = 'saved', warning = '';
    let data = { schemaVersion: SCHEMA_VERSION, scenarioVersion, nextSerial: 1, current: null, completed: [], replays: [], imported: [] };

    function versionEngine(version) {
      let selected;
      try { selected = typeof engine.forVersion === 'function' ? engine.forVersion(version) : version === scenarioVersion ? engine : null; }
      catch (error) { fail(`지원하지 않는 이야기 버전입니다: ${String(version)}.`); }
      if (!selected || selected.SCENARIO_VERSION !== version) fail(`지원하지 않는 이야기 버전입니다: ${String(version)}.`);
      return selected;
    }
    function turnLimit(record) {
      const version = typeof record === 'string' ? record : record.scenarioVersion;
      const selected = versionEngine(version);
      const limit = typeof engine.turnLimit === 'function' ? engine.turnLimit(version)
        : selected.DAY_LENGTH || (version === '2' ? 5 : null);
      if (!Number.isSafeInteger(limit) || limit < 1) fail('이야기의 선택 횟수를 확인할 수 없습니다.');
      return limit;
    }
    function normalizeStart(input, version = scenarioVersion) {
      try {
        const normalized = versionEngine(version).normalizeStart(input || {});
        if (normalized.scenarioVersion !== version) fail('요청한 이야기 버전과 시작 조건의 버전이 일치하지 않습니다.');
        return normalized;
      }
      catch (error) { fail(`시작 조건을 확인해 주세요. ${error.message}`); }
    }
    function replay(record) {
      // Dispatch first: the preserved v2 engine accepts only these three fields.
      try { return versionEngine(record.scenarioVersion).replay({
        scenarioId: record.scenarioId, conditions: clone(record.conditions), choiceIds: [...record.choiceIds] }); }
      catch (error) { fail(`이 선택 기록을 재현할 수 없습니다. ${error.message}`); }
    }
    function validateChoices(ids, completed, limit) {
      if (!Array.isArray(ids) || ids.length > limit || (completed && ids.length !== limit)) fail(`이 버전의 완료 기록에는 정확히 ${limit}개의 선택 ID가 필요합니다.`);
      if (ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) fail('선택 ID 형식이 올바르지 않습니다.');
    }
    function validateStart(record) {
      const normalized = normalizeStart({ scenarioId: record.scenarioId, conditions: record.conditions }, record.scenarioVersion);
      if (normalized.scenarioVersion !== record.scenarioVersion || normalized.scenarioId !== record.scenarioId
        || !same(normalized.conditions, record.conditions)) fail('시작 조건이 완전하지 않거나 허용되지 않은 값입니다.');
      return normalized;
    }
    function canonical(record, completed) {
      validateStart(record);
      const limit = turnLimit(record);
      validateChoices(record.choiceIds, completed, limit);
      const state = replay(record);
      if (record.choiceIds.length === limit && state.scene !== 'end') fail(`${limit}번의 선택이 정상적인 결말로 이어지지 않습니다.`);
      if (record.choiceIds.length < limit && state.scene === 'end') fail('선택 기록이 결말과 일치하지 않습니다.');
      return state;
    }
    const recordKeys = ['id', 'serial', 'scenarioVersion', 'scenarioId', 'conditions', 'choiceIds', 'complete', 'phase', 'parentId', 'branchIndex', 'comparisonKind'];
    function validateRecord(record, bucket) {
      exactKeys(record, recordKeys, '저장 기록');
      if (typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(record.id)) fail('기록 식별자가 올바르지 않습니다.');
      if (!Number.isSafeInteger(record.serial) || record.serial < 1) fail('게임 안의 하루 번호가 올바르지 않습니다.');
      if (typeof record.complete !== 'boolean' || !['game', 'reaction', 'result'].includes(record.phase)) fail('진행 상태 형식이 올바르지 않습니다.');
      const limit = turnLimit(record);
      if (record.complete !== (Array.isArray(record.choiceIds) && record.choiceIds.length === limit)) fail('완료 여부와 선택 수가 일치하지 않습니다.');
      if (record.phase === 'result' && !record.complete || record.phase === 'reaction' && !record.choiceIds.length || record.complete && record.phase === 'game') fail('화면 단계와 선택 기록이 일치하지 않습니다.');
      if (record.parentId === null) {
        if (record.branchIndex !== null || record.comparisonKind !== null) fail('원본 기록에 잘못된 분기 정보가 있습니다.');
      } else if (typeof record.parentId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(record.parentId)
        || record.parentId === record.id || !Number.isInteger(record.branchIndex) || record.branchIndex < 0 || record.branchIndex >= limit
        || record.choiceIds.length < record.branchIndex || !['branch', 'door-contrast'].includes(record.comparisonKind)) {
        fail('부모 기록이나 분기 지점이 올바르지 않습니다.');
      }
      if (bucket !== 'current' && (!record.complete || record.phase !== 'result')) fail('일지에는 완료한 기록만 보관할 수 있습니다.');
      if (bucket === 'completed' && record.parentId !== null || bucket === 'replays' && record.parentId === null || bucket === 'imported' && record.parentId !== null) fail('기록의 보관 위치와 분기 정보가 일치하지 않습니다.');
      canonical(record, bucket !== 'current');
    }
    function validateEnvelope(value) {
      exactKeys(value, ['schemaVersion', 'scenarioVersion', 'nextSerial', 'current', 'completed', 'replays', 'imported'], '저장 묶음');
      if (value.schemaVersion !== SCHEMA_VERSION) fail(`저장 버전 ${String(value.schemaVersion)}은 읽기 전용으로 보존합니다.`);
      const upgradingV2 = scenarioVersion === '3' && value.scenarioVersion === '2';
      if (value.scenarioVersion !== scenarioVersion && !upgradingV2) fail(`이야기 버전 ${String(value.scenarioVersion)}의 기존 저장은 읽기 전용으로 보존합니다.`);
      if (!Number.isSafeInteger(value.nextSerial) || value.nextSerial < 1) fail('다음 하루 번호가 올바르지 않습니다.');
      const ids = new Set(), serials = new Set(); let count = 0;
      for (const bucket of ['completed', 'replays', 'imported']) {
        if (!Array.isArray(value[bucket])) fail('일지 목록 형식이 올바르지 않습니다.');
        count += value[bucket].length;
        if (count > MAX_RECORDS) fail('저장 기록 수가 지원 범위를 넘습니다.');
        for (const record of value[bucket]) {
          if (value.scenarioVersion === '2' && record.scenarioVersion !== '2') fail('이전 저장 묶음과 기록의 이야기 버전이 일치하지 않습니다.');
          validateRecord(record, bucket);
          if (ids.has(record.id) || serials.has(record.serial)) fail('저장 묶음에 중복된 기록이 있습니다.');
          ids.add(record.id); serials.add(record.serial);
          if (record.serial >= value.nextSerial) fail('하루 번호 순서가 올바르지 않습니다.');
        }
      }
      if (value.current !== null) {
        if (value.scenarioVersion === '2' && value.current.scenarioVersion !== '2') fail('이전 저장 묶음과 현재 기록의 이야기 버전이 일치하지 않습니다.');
        validateRecord(value.current, 'current');
        if (value.current.serial >= value.nextSerial) fail('현재 하루 번호가 올바르지 않습니다.');
        const archived = [...value.completed, ...value.replays].find(record => record.id === value.current.id);
        if (value.current.complete) {
          if (!archived || !same({ ...value.current, phase: 'result' }, archived)) fail('완료한 현재 하루와 보관 일지가 일치하지 않습니다.');
        } else if (ids.has(value.current.id) || serials.has(value.current.serial)) fail('현재 하루가 다른 기록과 중복됩니다.');
      }
      // Only a fully validated, known v2 envelope is upgraded. The individual
      // records stay byte-for-byte equivalent as data, including their phases.
      // Loading never writes: persist() saves this envelope on the next action.
      return upgradingV2 ? { ...value, scenarioVersion } : value;
    }

    try {
      storage = own(options, 'storage') ? options.storage : root.localStorage;
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('storage unavailable');
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== null) {
        preservedRaw = raw;
        try {
          if (typeof raw !== 'string' || byteLength(raw) > MAX_STORAGE_BYTES) fail('저장 내용이 지원 크기를 넘습니다.');
          data = validateEnvelope(JSON.parse(raw));
          lastSavedRaw = raw; preservedRaw = null;
        } catch (error) {
          mode = 'read-only'; warning = `기존 저장을 덮어쓰지 않았습니다. ${error.message} 현재 플레이는 이 탭에서 이어가며 백업할 수 있습니다.`;
        }
      }
    } catch (error) {
      mode = 'memory'; warning = '브라우저 저장소를 읽을 수 없습니다. 현재 진행은 이 탭에서 유지됩니다. 닫기 전에 백업을 저장해 주세요.';
    }

    function persist() {
      if (mode !== 'saved') return;
      try {
        const diskRaw = storage.getItem(STORAGE_KEY);
        if (diskRaw !== lastSavedRaw) {
          preservedRaw = diskRaw; mode = 'read-only';
          warning = '다른 탭에서 저장 내용이 바뀌어 덮어쓰지 않았습니다. 이 탭의 진행은 유지됩니다. 두 내용을 백업한 뒤 새로고침해 주세요.';
          return;
        }
        const raw = JSON.stringify(data);
        if (byteLength(raw) > MAX_STORAGE_BYTES) throw new Error('storage size');
        storage.setItem(STORAGE_KEY, raw); lastSavedRaw = raw;
      } catch (error) {
        mode = 'memory'; preservedRaw = lastSavedRaw;
        warning = '브라우저에 저장하지 못했습니다. 마지막 저장과 현재 탭의 진행을 보존했습니다. 이 탭을 닫기 전에 백업을 저장해 주세요.';
      }
    }
    function allRecords() { return [...data.completed, ...data.replays, ...data.imported]; }
    function findRecord(id) {
      const record = allRecords().find(entry => entry.id === id) || (data.current && data.current.id === id ? data.current : null);
      if (!record) fail('해당 기록을 찾을 수 없습니다.');
      return record;
    }
    function nextId() {
      const used = new Set(allRecords().map(record => record.id));
      if (data.current) used.add(data.current.id);
      for (let attempt = 0; attempt < 32; attempt++) {
        const id = idFactory();
        if (typeof id === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(id) && !used.has(id)) return id;
      }
      fail('새 기록 식별자를 만들지 못했습니다.');
    }
    function makeRecord(start, choiceIds, parent) {
      const complete = choiceIds.length === turnLimit(start);
      return {
        id: nextId(), serial: data.nextSerial++, scenarioVersion: start.scenarioVersion, scenarioId: start.scenarioId,
        conditions: clone(start.conditions), choiceIds: [...choiceIds], complete,
        phase: complete ? 'result' : 'game', parentId: parent ? parent.id : null,
        branchIndex: parent ? parent.index : null, comparisonKind: parent ? parent.kind : null
      };
    }
    function summary(record, state) {
      state = state || canonical(record, record.complete);
      const ending = record.complete ? versionEngine(record.scenarioVersion).determineEnding(state) : null;
      return {
        endingId: ending ? ending.id : null, endingName: ending ? ending.name : null,
        decisions: clone(state.decisions || []), traces: clone(state.traces || []), history: clone(state.history || []),
        context: clone(state.context || {}), energy: state.energy, mood: state.mood
      };
    }
    function recordView(record) { return { ...clone(record), summary: summary(record) }; }
    function currentView() {
      if (!data.current) return null;
      const state = canonical(data.current, data.current.complete);
      return { record: { ...clone(data.current), summary: summary(data.current, state) }, state: clone(state), phase: data.current.phase };
    }
    function getSnapshot() {
      return {
        current: currentView(), completed: data.completed.map(recordView), replays: data.replays.map(recordView), imported: data.imported.map(recordView),
        persistence: { mode, warning, rawPreserved: preservedRaw !== null, preservedRaw, storageKey: STORAGE_KEY },
        warnings: warning ? [warning] : []
      };
    }
    function ensureArchive() {
      if (!data.current || !data.current.complete) return false;
      const bucket = data.current.parentId ? data.replays : data.completed;
      if (bucket.some(record => record.id === data.current.id)) return false;
      if (allRecords().length >= MAX_RECORDS) fail('일지가 500개입니다. 백업한 뒤 필요 없는 기록을 직접 지워 주세요.');
      bucket.push({ ...clone(data.current), phase: 'result' }); return true;
    }
    function start(input) {
      const normalized = normalizeStart(input);
      canonical({ ...normalized, choiceIds: [] }, false);
      data.current = makeRecord(normalized, []); persist(); return getSnapshot();
    }
    function commit(choice) {
      if (!data.current) fail('먼저 새 하루를 시작하거나 이어 하기를 선택해 주세요.');
      if (data.current.phase !== 'game') return getSnapshot();
      const state = canonical(data.current, false), node = versionEngine(data.current.scenarioVersion).getNode(state);
      const index = typeof choice === 'string' ? node.choices.findIndex(item => item.id === choice) : choice;
      if (!Number.isInteger(index) || index < 0 || index >= node.choices.length) fail('지금 장면에서 선택할 수 없는 항목입니다.');
      const ids = [...data.current.choiceIds, node.choices[index].id];
      const updated = { ...data.current, choiceIds: ids, complete: ids.length === turnLimit(data.current), phase: 'reaction' };
      canonical(updated, updated.complete);
      if (updated.complete && allRecords().length >= MAX_RECORDS) fail('일지가 500개입니다. 백업한 뒤 필요 없는 기록을 직접 지워 주세요.');
      data.current = updated; ensureArchive(); persist(); return getSnapshot();
    }
    function continueDay() {
      if (data.current && data.current.phase === 'reaction') {
        data.current = { ...data.current, phase: data.current.complete ? 'result' : 'game' }; persist();
      }
      return getSnapshot();
    }
    function complete() {
      if (!data.current || !data.current.complete) fail('아직 이 이야기의 모든 선택을 마치지 않았습니다.');
      const archived = ensureArchive();
      if (data.current.phase !== 'result') { data.current = { ...data.current, phase: 'result' }; persist(); }
      else if (archived) persist();
      return getSnapshot();
    }
    function forkRecord(recordId, index, contrast) {
      const source = findRecord(recordId);
      if (!source.complete) fail('완료한 하루에서 다시 보기를 시작할 수 있습니다.');
      if (!Number.isInteger(index) || index < 0 || index >= turnLimit(source)) fail(`분기 지점은 첫 번째부터 ${turnLimit(source)}번째 선택 사이여야 합니다.`);
      const conditions = clone(source.conditions), ids = source.choiceIds.slice(0, index);
      if (contrast) {
        const prefix = replay({ ...source, choiceIds: ids });
        const node = versionEngine(source.scenarioVersion).getNode(prefix), sceneId = node && (node.sceneId || node.id || prefix.scene);
        if (!['S02', 'S03'].includes(sceneId)) fail('자동문 비교는 S02 또는 S03의 문 장면에서 시작해 주세요.');
        if (conditions.doorMode !== 'manual') fail('이 기록은 이미 자동문 조건입니다.');
        conditions.doorMode = 'automatic';
      }
      const normalized = normalizeStart({ scenarioId: source.scenarioId, conditions }, source.scenarioVersion);
      try { canonical({ ...normalized, choiceIds: ids }, false); }
      catch (error) { fail(`바뀐 문 조건에서는 앞선 선택을 그대로 재현할 수 없습니다. 첫 문 장면에서 비교해 주세요. ${error.message}`); }
      data.current = makeRecord(normalized, ids, { id: source.id, index, kind: contrast ? 'door-contrast' : 'branch' });
      persist(); return getSnapshot();
    }
    function portable(record) {
      if (!record.complete) fail('완료한 하루만 친구 비교용으로 내보낼 수 있습니다.');
      return { schemaVersion: SCHEMA_VERSION, scenarioVersion: record.scenarioVersion, scenarioId: record.scenarioId, conditions: clone(record.conditions), choiceIds: [...record.choiceIds] };
    }
    function previewImport(text) {
      if (typeof text !== 'string' || !text.trim()) fail('가져올 기록의 JSON 텍스트를 넣어 주세요.');
      if (byteLength(text) > MAX_IMPORT_BYTES) fail('가져올 기록이 16 KiB 제한을 넘습니다.');
      let payload;
      try { payload = JSON.parse(text); } catch (error) { fail('JSON 형식을 읽을 수 없습니다. 텍스트 전체를 확인해 주세요.'); }
      exactKeys(payload, ['schemaVersion', 'scenarioVersion', 'scenarioId', 'conditions', 'choiceIds'], '공유 기록');
      if (payload.schemaVersion !== SCHEMA_VERSION) fail('지원하지 않는 공유 기록 버전입니다.');
      const state = canonical(payload, true);
      return { payload: clone(payload), state: clone(state), summary: summary({ ...payload, complete: true }, state) };
    }
    function importRecord(text) {
      const preview = previewImport(text);
      if (allRecords().length >= MAX_RECORDS) fail('일지가 500개입니다. 백업한 뒤 필요 없는 기록을 직접 지워 주세요.');
      const start = normalizeStart({ scenarioId: preview.payload.scenarioId, conditions: preview.payload.conditions }, preview.payload.scenarioVersion);
      data.imported.push(makeRecord(start, preview.payload.choiceIds)); persist(); return getSnapshot();
    }
    function compare(leftId, rightId) {
      const leftRecord = findRecord(leftId), rightRecord = findRecord(rightId);
      const leftState = canonical(leftRecord, leftRecord.complete), rightState = canonical(rightRecord, rightRecord.complete);
      const reasons = [], changedConditions = [];
      if (leftRecord.scenarioVersion !== rightRecord.scenarioVersion) reasons.push('이야기 버전이 다릅니다.');
      if (leftRecord.scenarioId !== rightRecord.scenarioId) reasons.push('시나리오가 다릅니다.');
      for (const key of new Set([...Object.keys(leftRecord.conditions), ...Object.keys(rightRecord.conditions)])) {
        if (!same(leftRecord.conditions[key], rightRecord.conditions[key])) changedConditions.push(key);
      }
      const changedGameplayConditions = changedConditions.filter(key => !['appearance', 'roomLayout'].includes(key));
      if (changedGameplayConditions.length) reasons.push(`시작 조건이 다릅니다: ${changedGameplayConditions.join(', ')}. 같은 조건의 비교가 아닙니다.`);
      const choices = [];
      for (let i = 0; i < Math.max(leftRecord.choiceIds.length, rightRecord.choiceIds.length); i++) {
        if (leftRecord.choiceIds[i] !== rightRecord.choiceIds[i]) choices.push({ index: i,
          leftId: leftRecord.choiceIds[i] || null, rightId: rightRecord.choiceIds[i] || null,
          leftTitle: leftState.decisions[i] || null, rightTitle: rightState.decisions[i] || null });
      }
      const leftSummary = summary(leftRecord, leftState), rightSummary = summary(rightRecord, rightState);
      return { equivalent: !reasons.length, reasons, changedConditions,
        left: { record: recordView(leftRecord), state: clone(leftState), summary: leftSummary },
        right: { record: recordView(rightRecord), state: clone(rightState), summary: rightSummary },
        differences: { choices,
          leftOnlyTraces: leftSummary.traces.filter(trace => !rightSummary.traces.includes(trace)),
          rightOnlyTraces: rightSummary.traces.filter(trace => !leftSummary.traces.includes(trace)) } };
    }
    function resetCurrent() { data.current = null; persist(); return getSnapshot(); }
    function deleteRecord(id) {
      const existing = [...data.completed, ...data.replays].some(record => record.id === id);
      if (!existing) fail('삭제할 완료 일지를 찾을 수 없습니다.');
      data.completed = data.completed.filter(record => record.id !== id); data.replays = data.replays.filter(record => record.id !== id);
      if (data.current && data.current.id === id) data.current = null;
      persist(); return getSnapshot();
    }
    function deleteImported(id) {
      if (!data.imported.some(record => record.id === id)) fail('삭제할 가져온 기록을 찾을 수 없습니다.');
      data.imported = data.imported.filter(record => record.id !== id); persist(); return getSnapshot();
    }
    function deleteAllJournals() {
      data.completed = []; data.replays = []; data.imported = [];
      if (data.current && data.current.complete) data.current = null;
      persist(); return getSnapshot();
    }
    function exportBackup() {
      return JSON.stringify({ format: 'stopped-saturday-local-backup', schemaVersion: SCHEMA_VERSION,
        localData: clone(data), preservedStorage: { key: STORAGE_KEY, raw: preservedRaw, mode },
        note: '이 파일은 로컬 복구용 백업입니다. 친구 비교용 공유 기록과 형식이 다릅니다.' }, null, 2);
    }
    return {
      start, commit, continue: continueDay, resume: currentView, complete,
      branch: (id, index) => forkRecord(id, index, false), doorContrast: (id, index) => forkRecord(id, index, true),
      previewImport, importRecord, exportRecord: id => JSON.stringify(portable(findRecord(id)), null, 2), compare,
      getRecord: id => recordView(findRecord(id)), getSnapshot, resetCurrent, deleteRecord, deleteImported, deleteAllJournals, exportBackup
    };
  }
  return { create, SCHEMA_VERSION, STORAGE_KEY, MAX_IMPORT_BYTES, MAX_STORAGE_BYTES };
});
