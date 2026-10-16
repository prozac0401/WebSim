'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const I = require('./income-data.js');

test('official population, geography, year and income basis are explicit', () => {
  assert.equal(I.SOURCE.tableId, 'DT_133N_427');
  assert.equal(I.SOURCE.year, 2024);
  assert.equal(I.SOURCE.nationalTotal, 21078535);
  assert.match(I.SOURCE.url, /^https:\/\/kosis\.kr\//);
  assert.match(I.SOURCE.population, /과세미달자/);
  assert.match(I.SOURCE.geography, /주소지/);
  assert.match(I.SOURCE.measure, /연간.*세전/);
  assert.match(I.SOURCE.notes.join(' '), /중복/);
  assert.match(I.SOURCE.notes.join(' '), /외국인/);
  assert.match(I.MODEL.withinBand, /게임 가정/);
  assert.match(I.MODEL.nonWorker, /게임 모형/);
});

test('17 regional subtotals and all 15 columns reconcile with published national controls', () => {
  assert.equal(I.ROWS.length, 17);
  assert.equal(new Set(I.ROWS.map(r => r.id)).size, 17);
  for (const row of I.ROWS) {
    assert.equal(row.counts.length, 15, row.id);
    assert.equal(row.counts.reduce((s, n) => s + n, 0), row.total, row.id);
    assert.ok(row.counts.every(n => Number.isSafeInteger(n) && n >= 0), row.id);
    assert.ok(Math.abs(row.bands.reduce((s, b) => s + b.weight, 0) - 1) < 1e-12, row.id);
  }
  for (let b = 0; b < I.BANDS.length; b++) {
    assert.equal(I.ROWS.reduce((s, row) => s + row.counts[b], 0) + I.RAW_COUNTS.other[b], I.RAW_COUNTS.national[b], `national bracket ${b}`);
  }
  assert.equal(I.ROWS.reduce((s, r) => s + r.total, 0), 21073526);
  assert.equal(I.RAW_COUNTS.other.reduce((s, n) => s + n, 0), 5009);
  assert.equal(I.RAW_COUNTS.national.reduce((s, n) => s + n, 0), 21078535);
});

test('independent source anchors preserve region placement and the high-income tail', () => {
  assert.equal(I.BY_REGION.seoul.total, 4102880);
  assert.equal(I.BY_REGION.gyeonggi.total, 6035122);
  assert.equal(I.BY_REGION.sejong.total, 177178);
  assert.equal(I.BY_REGION.jeju.total, 245027);
  assert.deepEqual(I.BY_REGION.ulsan.counts, [57909,23793,23585,68145,65846,26378,21688,34277,47290,32856,55369,2827,732,236,45]);
  assert.equal(I.BY_REGION.sejong.counts[6], 8877);
  assert.equal(I.BY_REGION.seoul.counts[14], 3419);
  assert.equal(I.RAW_COUNTS.national[14], 5241);
});

test('mutually exclusive annual brackets retain an unbounded top and exact monthly conversion', () => {
  assert.equal(I.BANDS[0].min, 0);
  assert.equal(I.BANDS[0].minInclusive, true);
  const annualMaxima = [10000000,15000000,20000000,30000000,40000000,45000000,50000000,60000000,80000000,100000000,200000000,300000000,500000000,1000000000,null];
  assert.deepEqual(I.BANDS.map(b => b.max), annualMaxima);
  for (let index = 0; index < I.BANDS.length; index++) {
    const b = I.BANDS[index];
    if (index) {
      assert.equal(b.min, I.BANDS[index - 1].max);
      assert.equal(b.minInclusive, false);
      assert.ok(b.monthlyMin * 12 > b.min);
    }
    if (b.max !== null) {
      assert.ok(b.monthlyMax * 12 <= b.max);
      assert.ok((b.monthlyMax + 1) * 12 > b.max);
    } else assert.equal(b.monthlyMax, null);
  }
});

test('weighted sampling selects every actual region bracket and both closed endpoints', () => {
  for (const row of I.ROWS) {
    let before = 0;
    for (let index = 0; index < I.BANDS.length; index++) {
      const b = I.BANDS[index];
      const middle = (before + row.counts[index] / 2) / row.total;
      for (const inside of [0, 1 - Number.EPSILON]) {
        let draws = 0;
        const result = I.sample(row.id, () => ++draws === 1 ? middle : inside);
        assert.equal(result.bandId, b.id, row.id);
        assert.equal(draws, 2);
        assert.equal(result.amount, b.max === null ? 100000000 : inside === 0 ? b.monthlyMin : b.monthlyMax);
        assert.equal(result.sourceId, I.SOURCE.id);
        assert.equal(result.openBandRepresentative, b.max === null);
        assert.ok(Number.isSafeInteger(result.amount));
      }
      before += row.counts[index];
    }
  }
});

test('the same supplied random stream gives the same result without global random access', () => {
  function stream(seed) { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
  const first = stream(123456), second = stream(123456);
  for (let i = 0; i < 1000; i++) assert.deepEqual(I.sample('chungnam', first), I.sample('chungnam', second));
  assert.equal(I.sample('seoul', () => 0).amount, 0);
  assert.equal(I.sample('seoul', () => 1 - Number.EPSILON).amount, 100000000);
});

test('invalid regions and random values fail rather than silently falling back to a distribution', () => {
  for (const id of ['national','other','unspecified','constructor','__proto__','toString',null]) assert.throws(() => I.sample(id, () => .5), RangeError);
  assert.throws(() => I.sample('busan'), TypeError);
  for (const value of [-.1, 1, NaN, Infinity, '.5', null, undefined]) assert.throws(() => I.sample('busan', () => value), RangeError);
  assert.throws(() => { I.BY_REGION.jeju.counts[0] = 0; }, TypeError);
});

test('browser UMD is self-contained and produces the CommonJS result without network dependencies', () => {
  const sandbox = { Math: Object.create(Math) };
  sandbox.Math.random = () => { throw new Error('unseeded random'); };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('./income-data.js'), 'utf8'), sandbox);
  const expected = I.sample('daejeon', () => .75);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.S2IncomeData.sample('daejeon', () => .75))), expected);
});
