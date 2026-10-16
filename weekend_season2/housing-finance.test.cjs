'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./finance.js'), C = require('./calendar.js');
const base = { startCash: 1000000, salary: 0, externalAllowance: 0, fixedCosts: 100000, personalBudget: 1000000, cardLimit: 1000000, payDay: 1 };

test('housing separates rent and monthly loan interest for every declared tenure', () => {
  for (const tenure of ['own', 'rent', 'jeonse']) {
    const c = { ...base, housingTenure: tenure, monthlyRent: 500000, housingLoanPrincipal: 120000000, housingLoanRateBps: 350 };
    const rent = tenure === 'rent' ? 500000 : 0;
    assert.deepEqual(F.housingCosts(c), { tenure, rent, interest: 350000, total: rent + 350000, loanPrincipal: 120000000, rateBps: 350 });
    assert.deepEqual(F.monthlyCosts(c), { living: 100000, housing: rent + 350000, rent, interest: 350000, total: rent + 450000 });
  }
});

test('legacy missing and unspecified housing add no inferred costs or principal', () => {
  const empty = { tenure: 'unspecified', rent: 0, interest: 0, total: 0, loanPrincipal: 0, rateBps: 0 };
  assert.deepEqual(F.housingCosts(), empty);
  assert.deepEqual(F.housingCosts({ monthlyRent: 500000, housingLoanPrincipal: 120000000, housingLoanRateBps: 350 }), empty);
  assert.deepEqual(F.housingCosts({ housingTenure: 'unspecified', monthlyRent: 500000, housingLoanPrincipal: 120000000, housingLoanRateBps: 350 }), empty);
  const f = F.create(base); F.beginDay(f, '2026-01-01', base);
  assert.equal(F.summary(f).consumption, base.fixedCosts);
  assert.equal(F.summary(f).debt, 0);
  assert.equal(F.summary(f).housingCosts, 0);
});

test('interest rounds each monthly won amount without losing bounded integer precision', () => {
  const quote = (principal, rateBps) => F.housingCosts({ housingTenure: 'jeonse', housingLoanPrincipal: principal, housingLoanRateBps: rateBps }).interest;
  assert.equal(quote(59999, 1), 0);
  assert.equal(quote(60000, 1), 1);
  assert.equal(quote(120000000, 0), 0);
  assert.equal(quote(0, 3000), 0);
  assert.equal(quote(10000000000, 3000), 250000000);
  assert.equal(quote(123456789, 437), Math.round(123456789 * 437 / 120000));
});

test('invalid housing values and unsafe combined expenses fail before a day mutates', () => {
  for (const invalid of [
    { housingTenure: 'hotel' }, { housingTenure: null }, { monthlyRent: -1 }, { monthlyRent: 0.5 },
    { monthlyRent: Number.MAX_SAFE_INTEGER + 1 }, { housingLoanPrincipal: 10000000001 }, { housingLoanPrincipal: -1 },
    { housingLoanPrincipal: 0.5 }, { housingLoanRateBps: -1 }, { housingLoanRateBps: 3001 },
    { housingLoanRateBps: 1.5 }, { housingLoanRateBps: NaN }, { housingLoanRateBps: '350' },
    { monthlyRent: Number.MAX_SAFE_INTEGER, housingLoanPrincipal: 120000, housingLoanRateBps: 100 }
  ]) {
    const c = { ...base, housingTenure: 'rent', ...invalid }, f = F.create(base), before = JSON.stringify(f);
    assert.throws(() => F.housingCosts(c), RangeError);
    assert.throws(() => F.create(c), RangeError);
    assert.throws(() => F.beginDay(f, '2026-01-01', c), RangeError);
    assert.equal(JSON.stringify(f), before);
  }
  assert.throws(() => F.monthlyCosts({ fixedCosts: Number.MAX_SAFE_INTEGER, housingTenure: 'rent', monthlyRent: 1 }), RangeError);
});

test('principal neither deposits cash nor becomes spending or an automatic repayment', () => {
  const c = { ...base, housingTenure: 'own', housingLoanPrincipal: 120000000, housingLoanRateBps: 100 }, f = F.create(c);
  assert.equal(f.cash, base.startCash);
  assert.equal(F.summary(f, c).debt, 120000000);
  assert.equal(F.summary(f, c).income, 0);
  assert.equal(F.summary(f, c).consumption, 0);
  F.beginDay(f, '2026-01-01', c); F.endDay(f, '2026-01-01', c);
  assert.equal(f.cash, 800000);
  assert.equal(F.summary(f, c).consumption, 200000);
  assert.equal(F.summary(f, c).housingLoanPrincipal, 120000000);
  assert.equal(F.summary(f, c).debt, 120000000);
  assert.equal(c.housingLoanPrincipal, 120000000);
});

test('one monthly fixed transaction discloses living costs, rent and loan terms', () => {
  const c = { ...base, housingTenure: 'rent', monthlyRent: 200000, housingLoanPrincipal: 12000000, housingLoanRateBps: 250 }, f = F.create(c);
  const transactions = F.beginDay(f, '2026-01-01', c), fixed = transactions.find(t => t.type === 'fixed-cost');
  assert.equal(transactions.filter(t => t.type === 'fixed-cost').length, 1);
  assert.equal(fixed.amount, 325000); assert.equal(fixed.consumption, 325000); assert.equal(fixed.paid, 325000);
  assert.deepEqual([fixed.livingCosts, fixed.rent, fixed.loanInterest, fixed.housingTenure, fixed.loanPrincipal, fixed.housingLoanRateBps], [100000, 200000, 25000, 'rent', 12000000, 250]);
  assert.equal(F.summary(f, c).housingRent, 200000); assert.equal(F.summary(f, c).housingInterest, 25000);
  assert.equal(F.summary(f, c).housingCosts, 225000);
});

test('available budget reserves all current housing essentials, not the whole loan balance', () => {
  const c = { ...base, housingTenure: 'rent', monthlyRent: 200000, housingLoanPrincipal: 12000000, housingLoanRateBps: 1000 }, f = F.create(c);
  assert.equal(F.available(f, c), 600000);
  assert.equal(F.canSpend(f, 600001, 'cash', c).ok, false);
  F.beginDay(f, '2026-01-01', c);
  assert.equal(f.cash, 600000); assert.equal(F.available(f, c), 600000);
  assert.equal(F.canSpend(f, 600000, 'cash', c).ok, true);
});

test('all tenures charge twelve months once in ordinary and leap years', () => {
  for (const year of [2026, 2028]) for (const tenure of ['own', 'rent', 'jeonse']) {
    const c = { ...base, startCash: 20000000, housingTenure: tenure, monthlyRent: 200000, housingLoanPrincipal: 12000000, housingLoanRateBps: 1000 };
    let f = F.create(c);
    for (const date of C.dates(year)) {
      F.beginDay(f, date, c); F.endDay(f, date, c);
      if (date.endsWith('-02-28')) f = JSON.parse(JSON.stringify(f));
      const saved = JSON.stringify(f);
      assert.deepEqual(F.beginDay(f, date, c), []); assert.deepEqual(F.endDay(f, date, c), []);
      assert.equal(JSON.stringify(f), saved);
    }
    const costs = F.monthlyCosts(c), summary = F.summary(f, c);
    assert.equal(f.ledger.filter(t => t.type === 'fixed-cost').length, 12);
    assert.equal(summary.consumption, costs.total * 12); assert.equal(summary.paid, costs.total * 12);
    assert.equal(summary.housingRent, costs.rent * 12); assert.equal(summary.housingInterest, costs.interest * 12);
    assert.equal(summary.housingCosts, costs.housing * 12); assert.equal(summary.cash, c.startCash - costs.total * 12);
    assert.equal(summary.debt, c.housingLoanPrincipal);
  }
});

test('salary precedes housing costs even when a later payday is clamped in leap February', () => {
  const c = { ...base, startCash: 0, salary: 500000, payDay: 31, housingTenure: 'rent', monthlyRent: 200000, housingLoanPrincipal: 12000000, housingLoanRateBps: 1000 }, f = F.create(c);
  F.beginDay(f, '2028-02-01', c); F.endDay(f, '2028-02-01', c);
  assert.equal(f.fixedArrears, 400000);
  const income = F.beginDay(f, '2028-02-29', c);
  assert.deepEqual(income.map(t => t.type), ['salary', 'fixed-arrears-payment']);
  assert.equal(f.cash, 100000); assert.equal(f.fixedArrears, 0);
  assert.equal(F.summary(f, c).consumption, 400000);
  const first = { ...c, payDay: 1 }, other = F.create(first);
  assert.deepEqual(F.beginDay(other, '2028-02-01', first).map(t => t.type), ['salary', 'fixed-cost']);
});

test('next-day earnings pay current housing, old housing and card arrears in that order', () => {
  const original = { ...base, startCash: 0, fixedCosts: 0, salary: 1000, payDay: 31 }, f = F.create(original);
  F.beginDay(f, '2026-01-01', original); assert.ok(F.spend(f, '2026-01-01', 100, 'card', '이전 소비', original).ok); F.endDay(f, '2026-01-01', original);
  const noPay = { ...original, salary: 0 }; F.beginDay(f, '2026-01-31', noPay); F.endDay(f, '2026-01-31', noPay);
  const c = { ...noPay, fixedCosts: 100, housingTenure: 'rent', monthlyRent: 200, housingLoanPrincipal: 120000, housingLoanRateBps: 100 };
  F.beginDay(f, '2026-02-01', c); F.endDay(f, '2026-02-01', c);
  assert.equal(f.fixedArrears, 400); assert.equal(f.arrears, 100);
  assert.equal(F.canSpend(f, 1, 'card', c).ok, false); assert.equal(F.canSpend(f, 0, 'cash', c).ok, true);
  F.beginDay(f, '2026-02-28', c); assert.ok(F.addEarnedPay(f, '2026-02-28', 1000, '일한 보상', { reference: 'housing-recovery' }).ok); F.endDay(f, '2026-02-28', c);
  const paid = F.beginDay(f, '2026-03-01', c);
  assert.deepEqual(paid.map(t => t.type), ['extra-pay', 'fixed-cost', 'fixed-arrears-payment', 'arrears-payment']);
  assert.deepEqual(paid.map(t => t.amount), [1000, 400, 400, 100]);
  assert.equal(f.cash, 100); assert.equal(f.fixedArrears, 0); assert.equal(f.arrears, 0);
  const summary = F.summary(f, c); assert.equal(summary.consumption, 900); assert.equal(summary.housingRent, 400); assert.equal(summary.housingInterest, 200);
  assert.equal(summary.unpaidDebt, 0); assert.equal(summary.debt, 120000);
});

test('unpaid annual rent and interest remain one consumption and survive year-end restoration', () => {
  const c = { ...base, startCash: 0, fixedCosts: 0, housingTenure: 'jeonse', housingLoanPrincipal: 12000000, housingLoanRateBps: 1000 }, f = F.create(c);
  for (const date of C.dates(2026)) { F.beginDay(f, date, c); F.endDay(f, date, c); }
  const restored = JSON.parse(JSON.stringify(f)), summary = F.summary(restored, c);
  assert.equal(summary.cash, 0); assert.equal(summary.consumption, 1200000); assert.equal(summary.paid, 0);
  assert.equal(summary.housingInterest, 1200000); assert.equal(summary.unpaidDebt, 1200000); assert.equal(summary.debt, 13200000);
  const before = JSON.stringify(restored); F.beginDay(restored, '2026-12-31', c); F.endDay(restored, '2026-12-31', c); assert.equal(JSON.stringify(restored), before);
});

test('housing totals sum historical fixed entries and never reclassify old unspecified spending', () => {
  const old = { ...base, startCash: 3000000 }, f = F.create(old); F.beginDay(f, '2026-01-01', old); F.endDay(f, '2026-01-01', old);
  const historical = f.ledger[0]; for (const key of ['livingCosts', 'rent', 'loanInterest', 'housingTenure', 'loanPrincipal', 'housingLoanRateBps']) delete historical[key];
  const c = { ...old, housingTenure: 'rent', monthlyRent: 300000, housingLoanPrincipal: 12000000, housingLoanRateBps: 100 };
  F.beginDay(f, '2026-02-01', c); F.endDay(f, '2026-02-01', c);
  assert.equal(F.summary(f, c).housingCosts, 310000); assert.equal(F.summary(f, c).consumption, 510000);
  assert.equal(F.summary(f).housingCosts, 310000); assert.equal(F.summary(f).housingLoanPrincipal, 0);
});
