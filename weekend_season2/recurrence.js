(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./calendar.js') : root.S2Calendar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Recurrence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function createRule(options) {
    const o = options || {};
    if (!C.validDate(o.anchor)) throw new RangeError('반복 시작 날짜가 올바르지 않습니다.');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(o.id || '') || !/^[a-zA-Z0-9_-]{1,80}$/.test(o.activityId || '')) throw new TypeError('반복 일정 ID가 올바르지 않습니다.');
    const rule = {
      id: o.id, activityId: o.activityId, anchor: o.anchor,
      kind: o.kind || 'weeks', interval: o.interval === undefined ? 1 : o.interval,
      dayOfMonth: o.dayOfMonth === undefined ? Number(o.anchor.slice(8)) : o.dayOfMonth,
      nth: o.nth === undefined ? 2 : o.nth, weekday: o.weekday === undefined ? 6 : o.weekday,
      basis: o.basis || 'scheduled', move: o.move || 'next-off', slot: o.slot === undefined ? 0 : o.slot,
      payment: o.payment || 'cash', active: true, completed: {}, skipped: {}, postponed: {},
      lastCompleted: null, nextOriginal: null
    };
    if (!['weeks', 'months', 'nth'].includes(rule.kind) || !Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 52) throw new RangeError('반복 주기 범위를 확인하세요.');
    if (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31 || !Number.isInteger(rule.nth) || rule.nth < 1 || rule.nth > 5 || !Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) throw new RangeError('반복 날짜 조건을 확인하세요.');
    if (!['scheduled', 'completed'].includes(rule.basis) || !['next-off', 'previous-off', 'keep'].includes(rule.move) || ![0, 1, 2].includes(rule.slot) || !['cash', 'card'].includes(rule.payment)) throw new RangeError('반복 일정 옵션이 올바르지 않습니다.');
    rule.nextOriginal = originalAt(rule, 0);
    if (rule.nextOriginal < rule.anchor) rule.nextOriginal = originalAt(rule, 1);
    return rule;
  }
  function nthInMonth(date, nth, weekday) {
    const first = date.slice(0, 8) + '01';
    const max = C.daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    let dom = 1 + (weekday - C.day(first) + 7) % 7 + (nth - 1) * 7;
    if (dom > max) dom -= 7; // A missing fifth occurrence uses the last matching weekday.
    return first.slice(0, 8) + String(dom).padStart(2, '0');
  }
  function originalAt(rule, index) {
    if (rule.kind === 'weeks') return C.addDays(rule.anchor, index * rule.interval * 7);
    const date = C.addMonths(rule.anchor, index * rule.interval, rule.dayOfMonth);
    return rule.kind === 'nth' ? nthInMonth(date, rule.nth, rule.weekday) : date;
  }
  function nextAfter(rule, base) {
    if (rule.kind === 'weeks') return C.addDays(base, rule.interval * 7);
    const date = C.addMonths(base, rule.interval, rule.kind === 'months' ? Number(base.slice(8)) : 1);
    return rule.kind === 'nth' ? nthInMonth(date, rule.nth, rule.weekday) : date;
  }
  function moveDate(date, move) {
    if (move === 'keep' || C.isOff(date)) return date;
    let cursor = date;
    for (let n = 0; n < 7; n++) { cursor = C.addDays(cursor, move === 'previous-off' ? -1 : 1); if (C.isOff(cursor)) return cursor; }
    return cursor;
  }
  function reservation(rule, original, from) {
    if (own(rule.completed, original) || own(rule.skipped, original)) return null;
    let date = own(rule.postponed, original) ? rule.postponed[original] : moveDate(original, rule.move);
    // Completion-based schedules retain one outstanding occurrence; never stack a backlog.
    if (rule.basis === 'completed' && date < from) date = moveDate(from, rule.move === 'keep' ? 'keep' : 'next-off');
    return { id: rule.id + ':' + original, ruleId: rule.id, date, originalDate: original, activityId: rule.activityId, slot: rule.slot, payment: rule.payment, moved: date !== original, status: 'reserved' };
  }
  function reservations(rules, from, to) {
    if (!C.validDate(from) || !C.validDate(to) || to < from) throw new RangeError('예약 조회 기간이 올바르지 않습니다.');
    const result = [];
    for (const rule of rules) {
      if (!rule.active) continue;
      if (rule.basis === 'completed') {
        const item = reservation(rule, rule.nextOriginal || rule.anchor, from);
        if (item && item.date >= from && item.date <= to) result.push(item);
        continue;
      }
      // Include future weekday originals that can move back into the requested week.
      const end = C.addDays(to, 7);
      const seen = new Set();
      for (let index = 0; index < 10000; index++) {
        const original = originalAt(rule, index);
        if (original > end) break;
        if (original < rule.anchor) continue;
        const item = reservation(rule, original, from);
        if (item && item.date >= from && item.date <= to) { result.push(item); seen.add(original); }
      }
      // Explicit deferrals may be arbitrarily far from their original occurrence.
      for (const original of Object.keys(rule.postponed)) {
        if (seen.has(original)) continue;
        const item = reservation(rule, original, from);
        if (item && item.date >= from && item.date <= to) result.push(item);
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot || a.id.localeCompare(b.id));
  }
  function complete(rule, date, originalDate) {
    const original = originalDate || date;
    if (!C.validDate(date) || !C.validDate(original)) throw new RangeError('완료 날짜를 확인하세요.');
    if (own(rule.completed, original) || own(rule.skipped, original)) return false;
    rule.completed[original] = date;
    rule.lastCompleted = date;
    delete rule.postponed[original];
    if (rule.basis === 'completed') rule.nextOriginal = nextAfter(rule, date);
    return true;
  }
  function skip(rule, originalDate, onDate) {
    if (!C.validDate(originalDate)) throw new RangeError('건너뛸 날짜를 확인하세요.');
    if (onDate !== undefined && !C.validDate(onDate)) throw new RangeError('건너뛰기 처리 날짜를 확인하세요.');
    if (own(rule.completed, originalDate) || own(rule.skipped, originalDate)) return false;
    rule.skipped[originalDate] = true;
    const deferred = rule.postponed[originalDate];
    delete rule.postponed[originalDate];
    if (rule.basis === 'completed') rule.nextOriginal = nextAfter(rule, onDate || deferred || originalDate);
    return true;
  }
  function postpone(rule, originalDate, newDate) {
    if (!C.validDate(originalDate) || !C.validDate(newDate)) throw new RangeError('미룰 날짜를 확인하세요.');
    const current = own(rule.postponed, originalDate) ? rule.postponed[originalDate] : moveDate(originalDate, rule.move);
    if (newDate <= current) throw new RangeError('미룰 날짜는 현재 예약 날짜 이후여야 합니다.');
    if (own(rule.completed, originalDate) || own(rule.skipped, originalDate)) return false;
    rule.postponed[originalDate] = newDate;
    return true;
  }
  function stop(rule) { rule.active = false; }
  return { createRule, reservations, complete, skip, postpone, stop, moveDate };
});
