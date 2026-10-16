'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./calendar.js');
const R = require('./recurrence.js');
const F = require('./finance.js');
const base = { startCash: 1000000, salary: 2000000, externalAllowance: 0, fixedCosts: 1000000, personalBudget: 1000000, cardLimit: 1000000, payDay: 1 };
function rule(options = {}) { return R.createRule({ id: 'habit', activityId: 'walk', anchor: '2026-01-03', ...options }); }
function runMonth(finance, config, month) {
  for (const date of C.dates(2026).filter(d => d.slice(5, 7) === month)) { F.beginDay(finance, date, config); F.endDay(finance, date, config); }
}

test('date engine covers complete years, leap day, partial first and final weeks', () => {
  assert.equal(C.dates(2026).length, 365);
  assert.equal(C.dates(2024).length, 366);
  assert.equal(C.dates(2100).length, 365);
  assert.equal(C.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(C.weekDates('2026-01-01'), ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.deepEqual(C.weekDates('2026-12-28'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
  const stitched = [];
  for (let date = '2026-01-01'; date <= '2026-12-31';) { const week = C.weekDates(date); stitched.push(...week); date = C.addDays(week.at(-1), 1); }
  assert.deepEqual(stitched, C.dates(2026));
});
test('verified 2026 holidays include amended May 1 and July 17 without duplicate days', () => {
  assert.equal(C.holiday('2026-05-01'), '노동절');
  assert.equal(C.holiday('2026-07-17'), '제헌절');
  assert.equal(C.isOff('2026-06-03'), true);
  assert.equal(C.isOff('2026-03-01'), true);
  assert.equal(C.isOff('2026-03-02'), true);
  assert.equal(C.isOff('2026-06-08'), false); // Memorial Day has no inferred substitute.
  assert.equal(C.dates(2026).filter(C.isOff).length, 120);
  assert.equal(C.holidayStatus(2028).verified, false);
  assert.equal(C.holiday('2028-01-01'), '');
  assert.equal(C.holidaySources.length, 3);
});
test('official 2027 table has 24 holiday dates, seven substitutes and 119 unique days off', () => {
  const listed=C.dates(2027).filter(date=>C.holiday(date));
  assert.equal(C.holidayStatus(2027).verified,true);
  assert.equal(listed.length,24);
  assert.equal(listed.filter(date=>C.holiday(date).includes('대체공휴일')).length,7);
  assert.equal(C.dates(2027).filter(date=>C.day(date)===0||C.holiday(date)).length,72);
  assert.equal(C.dates(2027).filter(C.isOff).length,119);
  assert.deepEqual(listed,['2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-02-09','2027-03-01','2027-05-01','2027-05-03','2027-05-05','2027-05-13','2027-06-06','2027-07-17','2027-07-19','2027-08-15','2027-08-16','2027-09-14','2027-09-15','2027-09-16','2027-10-03','2027-10-04','2027-10-09','2027-10-11','2027-12-25','2027-12-27']);
  assert.equal(C.holiday('2027-05-03'),'노동절 대체공휴일');
  assert.equal(C.holiday('2027-07-19'),'제헌절 대체공휴일');
  assert.equal(C.holiday('2027-05-13'),'부처님오신날');
  assert.equal(C.isOff('2027-06-07'),false,'Memorial Day does not imply a substitute');
  assert.equal(C.isOff('2027-06-03'),false,'The 2026 local election does not repeat');
  assert.ok(C.holidaySources.some(source=>source.attachmentUrl?.includes('198497802')));
});
test('2027 boundary weeks and moved reservations use verified dates while later years remain unknown', () => {
  assert.deepEqual(C.weekDates('2027-01-01'),['2027-01-01','2027-01-02','2027-01-03']);
  assert.deepEqual(C.weekDates('2027-12-27'),['2027-12-27','2027-12-28','2027-12-29','2027-12-30','2027-12-31']);
  const r=rule({anchor:'2027-05-03'}),[reservation]=R.reservations([r],'2027-05-03','2027-05-09');
  assert.equal(reservation.date,'2027-05-03');assert.equal(reservation.moved,false);
  for(const year of [2028,2029,2030]){
    assert.equal(C.holidayStatus(year).verified,false);
    assert.equal(C.dates(year).filter(date=>C.holiday(date)).length,0);
    assert.equal(C.dates(year).filter(C.isOff).length,C.dates(year).filter(date=>[0,6].includes(C.day(date))).length);
  }
});
test('date validation rejects normalized invalid dates and checks month boundaries', () => {
  assert.equal(C.validDate('2026-02-29'), false);
  assert.equal(C.validDate('2026-13-01'), false);
  assert.throws(() => C.addDays('2026-02-30', 1));
  assert.equal(C.monthEnd('2024-02-29'), true);
  assert.equal(C.monthEnd('2026-02-27'), false);
  assert.equal(C.addMonths('2026-01-31', 1), '2026-02-28');
});
test('scheduled monthly anchors clamp February without drifting March', () => {
  const r = rule({ anchor: '2026-01-31', kind: 'months', move: 'keep' });
  assert.deepEqual(R.reservations([r], '2026-01-01', '2026-04-30').map(x => x.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});
test('monthly nth weekday and N month recurrence use actual calendar dates', () => {
  const r = rule({ anchor: '2026-01-01', kind: 'nth', interval: 2, nth: 2, weekday: 6 });
  assert.deepEqual(R.reservations([r], '2026-01-01', '2026-05-31').map(x => x.date), ['2026-01-10', '2026-03-14', '2026-05-09']);
  const fifth = rule({ anchor: '2026-02-01', kind: 'nth', nth: 5, weekday: 6 });
  assert.equal(R.reservations([fifth], '2026-02-01', '2026-02-28')[0].date, '2026-02-28');
});
test('weekday shifts remain explicit reservations, preserving original identity', () => {
  const next = rule({ anchor: '2026-01-05', interval: 2 });
  const [item] = R.reservations([next], '2026-01-05', '2026-01-11');
  assert.equal(item.originalDate, '2026-01-05'); assert.equal(item.date, '2026-01-10');
  assert.equal(item.moved, true); assert.equal(item.status, 'reserved');
  const prev = rule({ anchor: '2026-01-12', move: 'previous-off' });
  assert.equal(R.reservations([prev], '2026-01-05', '2026-01-11')[0].date, '2026-01-11');
  const holiday = rule({ anchor: '2026-03-02' });
  assert.equal(R.reservations([holiday], '2026-03-02', '2026-03-08')[0].moved, false);
});
test('skip, completion, deferral, and stop do not replay past scheduled occurrences', () => {
  const r = rule();
  R.skip(r, '2026-01-03'); R.complete(r, '2026-01-10', '2026-01-10');
  R.postpone(r, '2026-01-17', '2026-01-25');
  const items = R.reservations([r], '2026-01-01', '2026-01-31');
  assert.deepEqual(items.map(x => x.date), ['2026-01-24', '2026-01-25', '2026-01-31']);
  assert.equal(R.complete(r, '2026-01-10', '2026-01-10'), false);
  assert.equal(R.reservations([rule()], '2026-04-01', '2026-04-05').length, 1);
  R.stop(r); assert.equal(R.reservations([r], '2026-01-01', '2026-12-31').length, 0);
});
test('completion basis retains one overdue occurrence and schedules after actual completion', () => {
  const r = rule({ basis: 'completed', interval: 2 });
  const offered = R.reservations([r], '2026-03-01', '2026-03-31');
  assert.equal(offered.length, 1); assert.equal(offered[0].originalDate, '2026-01-03');
  R.complete(r, offered[0].date, offered[0].originalDate);
  assert.equal(r.nextOriginal, C.addDays(offered[0].date, 14));
  assert.equal(R.reservations([r], '2026-03-01', '2026-12-31').length, 1);
});
test('completion-based overdue skip advances from the offered date without catch-up', () => {
  const r = rule({ basis: 'completed' });
  const item = R.reservations([r], '2026-06-06', '2026-06-07')[0];
  R.skip(r, item.originalDate, item.date);
  assert.equal(r.nextOriginal, '2026-06-13');
  assert.deepEqual(R.reservations([r], '2026-06-06', '2026-06-07'), []);
});
test('completion monthly basis uses actual completion day while scheduled basis keeps anchor day', () => {
  const completed = rule({ anchor: '2026-01-31', kind: 'months', basis: 'completed', move: 'keep' });
  R.complete(completed, '2026-01-31', '2026-01-31');
  assert.equal(completed.nextOriginal, '2026-02-28');
  R.complete(completed, '2026-02-28', '2026-02-28');
  assert.equal(completed.nextOriginal, '2026-03-28');
  const scheduled = rule({ anchor: '2026-01-31', kind: 'months', move: 'keep' });
  R.complete(scheduled, '2026-02-28', '2026-02-28');
  assert.equal(R.reservations([scheduled], '2026-03-01', '2026-03-31')[0].date, '2026-03-31');
});
test('invalid skip date cannot partially mutate a rule', () => {
  const r = rule({ basis: 'completed' }), snapshot = JSON.stringify(r);
  assert.throws(() => R.skip(r, '2026-01-03', 'invalid'));
  assert.equal(JSON.stringify(r), snapshot);
});
test('postponement must move beyond the currently offered date, including earlier deferrals', () => {
  const r = rule({ anchor: '2026-01-05' }); // Monday shifts to Saturday January 10.
  assert.throws(() => R.postpone(r, '2026-01-05', '2026-01-10'));
  assert.equal(R.postpone(r, '2026-01-05', '2026-01-11'), true);
  const snapshot = JSON.stringify(r);
  assert.throws(() => R.postpone(r, '2026-01-05', '2026-01-11'));
  assert.throws(() => R.postpone(r, '2026-01-05', '2026-01-10'));
  assert.equal(JSON.stringify(r), snapshot);
});
test('recurrence configuration rejects invalid inputs before state is created', () => {
  for (const invalid of [{ interval: 0 }, { slot: 3 }, { anchor: 'bad' }, { dayOfMonth: 32 }, { payment: 'loan' }]) assert.throws(() => rule(invalid));
});
test('salary and external allowance are income; personal budget is never income', () => {
  const config = { ...base, externalAllowance: 100000, personalBudget: 300000 };
  const f = F.create(config);
  F.beginDay(f, '2026-01-01', config);
  assert.equal(F.summary(f).income, 2100000);
  assert.equal(f.cash, 2100000);
  assert.equal(F.available(f, config), 300000);
  assert.deepEqual(f.ledger.map(x => x.type), ['salary', 'allowance', 'fixed-cost']);
});
test('cash and card consumption count exactly once; month-end settlement is idempotent', () => {
  const f = F.create(base); F.beginDay(f, '2026-01-01', base);
  assert.equal(F.spend(f, '2026-01-01', 50000, 'cash', '식사', base).ok, true);
  assert.equal(F.spend(f, '2026-01-01', 100000, 'card', '수업', base).ok, true);
  assert.equal(f.cash, 1950000); assert.equal(f.cardPending, 100000);
  runMonth(f, base, '01');
  assert.equal(f.cash, 1850000); assert.equal(f.cardPending, 0);
  assert.equal(F.summary(f).consumption, 1150000);
  assert.equal(F.summary(f).paid, 1150000);
  const snapshot = JSON.stringify(f);
  F.beginDay(f, '2026-01-01', base); F.endDay(f, '2026-01-31', base);
  assert.equal(JSON.stringify(f), snapshot);
  assert.equal(F.spend(f, '2026-01-31', 1, 'cash', '늦은 거래', base).cause, 'closed-day');
});
test('same-day extra work pays on the next payday, including carryover after year end', () => {
  const f = F.create(base); F.beginDay(f, '2026-01-01', base);
  F.addPendingPay(f, '2026-01-01', 120000, '추가근무');
  F.beginDay(f, '2026-01-01', base); assert.equal(f.pendingPay, 120000);
  F.beginDay(f, '2026-02-01', base); assert.equal(f.pendingPay, 0);
  assert.equal(F.summary(f).income, 4120000);
  F.addPendingPay(f, '2026-12-31', 90000, '연말근무');
  assert.equal(F.summary(f).pendingPay, 90000);
  assert.equal(F.summary(f).income, 4120000);
});
test('payday 31 clamps to February month end and income precedes settlement', () => {
  const c = { ...base, payDay: 31 }, f = F.create(c);
  F.beginDay(f, '2026-02-01', c); assert.equal(f.cash, 0);
  assert.equal(F.spend(f, '2026-02-01', 500000, 'card', '월중 활동', c).ok, true);
  F.beginDay(f, '2026-02-28', c); F.endDay(f, '2026-02-28', c);
  assert.equal(f.cash, 1500000); assert.equal(f.arrears, 0);
  assert.deepEqual(f.ledger.slice(-2).map(x => x.type), ['salary', 'card-payment']);
});
test('insufficient month-end cash records arrears and freezes credit with free recovery available', () => {
  const c = { ...base, startCash: 0, fixedCosts: 0, payDay: 31 }, f = F.create(c);
  F.beginDay(f, '2026-01-01', c);
  assert.equal(F.spend(f, '2026-01-01', 200000, 'card', '수업', c).ok, true);
  const lostIncome = { ...c, salary: 0 };
  F.beginDay(f, '2026-01-31', lostIncome); F.endDay(f, '2026-01-31', lostIncome);
  assert.equal(f.arrears, 200000); assert.equal(f.cash, 0);
  assert.equal(F.canSpend(f, 1, 'card', c).cause, 'arrears');
  assert.equal(F.canSpend(f, 0, 'card', c).ok, true);
  assert.equal(F.summary(f).consumption, 200000);
  F.beginDay(f, '2026-02-28', c);
  assert.equal(f.arrears, 0); assert.equal(f.cash, 1800000);
  assert.equal(F.summary(f).consumption, 200000);
});
test('incoming cash pays newly due essentials then fixed arrears then card arrears', () => {
  const c = { ...base, startCash: 0, salary: 0, fixedCosts: 100000 }, f = F.create(c);
  F.beginDay(f, '2026-01-01', c); assert.equal(f.fixedArrears, 100000);
  f.arrears = 90000;
  F.beginDay(f, '2026-02-01', { ...c, salary: 250000 });
  assert.equal(f.cash, 0); assert.equal(f.fixedArrears, 0); assert.equal(f.arrears, 40000);
  assert.deepEqual(f.ledger.slice(-4).map(x => x.type), ['salary', 'fixed-cost', 'fixed-arrears-payment', 'arrears-payment']);
  assert.equal(F.summary(f).consumption, 200000);
});
test('spending enforces card limit, budget, cash, and bill reservations without automatic loans', () => {
  const c = { ...base, startCash: 100000, salary: 0, fixedCosts: 0, cardLimit: 50000 }, f = F.create(c);
  F.beginDay(f, '2026-01-01', c);
  assert.equal(F.canSpend(f, 50001, 'card', c).cause, 'card-limit');
  assert.equal(F.spend(f, '2026-01-01', 50000, 'card', '사진 수업', c).ok, true);
  assert.equal(F.available(f, c), 50000);
  assert.equal(F.canSpend(f, 50001, 'cash', c).cause, 'money');
  assert.equal(F.canSpend(f, 1, 'cash', { ...c, personalBudget: 50000 }).cause, 'budget');
  assert.equal(F.canSpend(f, 100001, 'cash', c).cause, 'cash');
  assert.equal(F.canSpend(f, 1.5, 'cash', c).ok, false);
  assert.equal(f.cash, 100000);
});
test('zero income and cash finish a year without debt disappearing or negative cash', () => {
  const c = { ...base, startCash: 0, salary: 0, fixedCosts: 100000, personalBudget: 0 }, f = F.create(c);
  for (const date of C.dates(2026)) { F.beginDay(f, date, c); F.endDay(f, date, c); assert.ok(f.cash >= 0); }
  assert.equal(F.summary(f).debt, 1200000);
  assert.equal(F.summary(f).consumption, 1200000);
  assert.equal(F.summary(f).paid, 0);
  assert.equal(f.ledger.filter(x => x.type === 'fixed-unpaid').length, 12);
});
test('JSON roundtrip retains recurrence decisions and financial idempotence markers', () => {
  const r = rule({ kind: 'months' }); R.postpone(r, '2026-01-03', '2026-01-11');
  const f = F.create(base); F.beginDay(f, '2026-01-01', base); F.spend(f, '2026-01-01', 20000, 'card', '책', base);
  const copy = JSON.parse(JSON.stringify({ r, f }));
  assert.deepEqual(R.reservations([copy.r], '2026-01-01', '2026-01-31'), R.reservations([r], '2026-01-01', '2026-01-31'));
  F.beginDay(copy.f, '2026-01-01', base);
  assert.deepEqual(copy.f, f);
  assert.deepEqual(F.summary(copy.f), F.summary(f));
});
