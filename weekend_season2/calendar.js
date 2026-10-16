(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Calendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  // A sourced date table, not an algorithm guessing Korean lunar holidays.
  const holidays2026 = Object.freeze({
    '2026-01-01': '새해 첫날',
    '2026-02-16': '설 연휴', '2026-02-17': '설날', '2026-02-18': '설 연휴',
    '2026-03-01': '삼일절', '2026-03-02': '삼일절 대체공휴일',
    '2026-05-01': '노동절', '2026-05-05': '어린이날',
    '2026-05-24': '부처님오신날', '2026-05-25': '부처님오신날 대체공휴일',
    '2026-06-03': '전국동시지방선거일', '2026-06-06': '현충일',
    '2026-07-17': '제헌절',
    '2026-08-15': '광복절', '2026-08-17': '광복절 대체공휴일',
    '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
    '2026-10-03': '개천절', '2026-10-05': '개천절 대체공휴일', '2026-10-09': '한글날',
    '2026-12-25': '성탄절'
  });
  const holidaySources = Object.freeze([
    { title: '우주항공청 · 2026년 월력요항 (2025-06-30)', url: 'https://www.kasa.go.kr/bbs/BBSMSTR_000000000010/view.do?nttId=B000000001860Pe2zT3', note: '음력 명절·대체공휴일·지방선거일의 기본 자료', checked: '2026-10-17' },
    { title: '우주항공청 · 2027년 월력요항 (2026-06-29)', url: 'https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431', note: '2026년부터 노동절·제헌절 추가 적용, 2026년 주5일제 휴일 120일임을 확인', checked: '2026-10-17' },
    { title: '국가법령정보센터 · 관공서의 공휴일에 관한 규정 제2조', url: 'https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1018770105', note: '2026년 개정 공휴일 목록 교차 확인', checked: '2026-10-17' }
  ]);
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function parse(value) {
    if (!validDate(value)) throw new RangeError('날짜는 실제 존재하는 YYYY-MM-DD이어야 합니다.');
    return new Date(value + 'T00:00:00Z');
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(date, count) {
    if (!Number.isInteger(count)) throw new TypeError('날짜 간격은 정수여야 합니다.');
    return iso(new Date(parse(date).getTime() + count * DAY));
  }
  function day(date) { return parse(date).getUTCDay(); }
  function daysInMonth(year, month) {
    if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('연도·월 범위를 확인하세요.');
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
  function monthEnd(date) { return addDays(date, 1).slice(0, 7) !== date.slice(0, 7); }
  function addMonths(date, count, desiredDay) {
    const d = parse(date);
    if (!Number.isInteger(count)) throw new TypeError('월 간격은 정수여야 합니다.');
    const requested = desiredDay === undefined ? d.getUTCDate() : desiredDay;
    if (!Number.isInteger(requested) || requested < 1 || requested > 31) throw new RangeError('날짜는 1~31이어야 합니다.');
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1));
    first.setUTCDate(Math.min(requested, daysInMonth(first.getUTCFullYear(), first.getUTCMonth() + 1)));
    return iso(first);
  }
  function dates(year) {
    if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new RangeError('연도를 확인하세요.');
    const result = [];
    let cursor = year + '-01-01';
    const last = year + '-12-31';
    while (cursor <= last) { result.push(cursor); if (cursor === last) break; cursor = addDays(cursor, 1); }
    return result;
  }
  function holiday(date) { parse(date); return holidays2026[date] || ''; }
  function isOff(date) { const weekday = day(date); return weekday === 0 || weekday === 6 || !!holiday(date); }
  function holidayStatus(year) {
    return Number(year) === 2026 ? { verified: true, label: '대한민국 2026년 공휴일 확인됨 · 주5일제 가정' } : { verified: false, label: '공휴일 자료 미확인 · 토·일만 휴일로 표시' };
  }
  function weekDates(date) {
    parse(date);
    const last = date.slice(0, 4) + '-12-31';
    const result = [];
    let cursor = date;
    while (cursor <= last) {
      result.push(cursor);
      if (day(cursor) === 0 || cursor === last) break;
      cursor = addDays(cursor, 1);
    }
    return result;
  }
  return { dates, addDays, addMonths, day, monthEnd, daysInMonth, isOff, holiday, weekDates, validDate, holidayStatus, holidaySources };
});
