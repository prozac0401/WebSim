'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Demographics = require('./demographics.js');

test('demographics: 17 distinct regions reconcile with the published 2024 population denominator', () => {
  const expectedIds = ['seoul','busan','daegu','incheon','gwangju','daejeon','ulsan','sejong','gyeonggi','gangwon','chungbuk','chungnam','jeonbuk','jeonnam','gyeongbuk','gyeongnam','jeju'];
  assert.deepEqual(Demographics.regions.map(region => region.id), expectedIds);
  assert.equal(new Set(Demographics.regions.map(region => region.label)).size, 17);
  for (const region of Demographics.regions) {
    assert.ok(Number.isSafeInteger(region.population) && region.population > 0);
    assert.equal(typeof region.capital, 'boolean');
    assert.equal(Demographics.regionMap[region.id], region);
  }
  assert.equal(Demographics.regions.reduce((sum, region) => sum + region.population, 0), 51217221);
  assert.equal(Demographics.population.total, 51217221);
  assert.equal(Demographics.population.asOf, '2024-12-31');
  assert.match(Demographics.population.scope, /모든 연령/);
  assert.match(Demographics.population.scope, /외국인 제외/);
});

test('demographics: capital area is the sum of Seoul, Incheon and Gyeonggi, never a duplicate region', () => {
  const capital = Demographics.regions.filter(region => region.capital);
  assert.deepEqual(capital.map(region => region.id), ['seoul','incheon','gyeonggi']);
  assert.equal(capital.reduce((sum, region) => sum + region.population, 0), 26047523);
  assert.equal(Demographics.population.capitalTotal, 26047523);
  assert.equal(Demographics.population.capitalShare, 26047523 / 51217221);
  const normalizedTotal = Demographics.regions.reduce((sum, region) => sum + region.population / Demographics.population.total, 0);
  assert.ok(Math.abs(normalizedTotal - 1) < 1e-12);
});

test('demographics: complete reported names retain provenance after duplicate removal, without invented frequency weights', () => {
  assert.deepEqual(Demographics.nameLists.map(list => list.names.length), [100, 30, 52]);
  assert.equal(Demographics.names.length, 140);
  assert.equal(Demographics.nameCoverage.count, 140);
  const sourceNames = new Map();
  for (const list of Demographics.nameLists) for (const name of list.names) {
    const ids = sourceNames.get(name) || new Set();
    ids.add(list.sourceId); sourceNames.set(name, ids);
  }
  assert.equal(sourceNames.size, Demographics.names.length);
  for (const entry of Demographics.names) {
    assert.match(entry.name, /^[가-힣]{1,3}$/);
    assert.deepEqual(new Set(entry.sourceIds), sourceNames.get(entry.name));
    assert.deepEqual(Object.keys(entry).sort(), ['name', 'sourceIds']);
  }
  // Historical cohorts and genuinely reported one-syllable names remain usable.
  for (const name of ['영수','영자','정훈','미영','민준','서연','솔','봄']) assert.ok(sourceNames.has(name));
  assert.equal(Demographics.nameCoverage.representsPopulationFrequency, false);
  assert.equal(Demographics.nameCoverage.includesHistoricalAdultCohorts, true);
});

test('demographics: surname weights cover only the selected hanja-specific 20 entries', () => {
  assert.equal(Demographics.surnames.length, 20);
  assert.equal(new Set(Demographics.surnames.map(entry => entry.hanja)).size, 20);
  const sum = Demographics.surnames.reduce((total, entry) => total + entry.population, 0);
  assert.equal(sum, 38663948);
  assert.equal(Demographics.surnameCoverage.selectedPopulation, sum);
  assert.equal(Demographics.surnameCoverage.populationTotal, 49705663);
  assert.equal(Demographics.surnameCoverage.shareOfPopulation, sum / 49705663);
  assert.ok(sum < Demographics.surnameCoverage.populationTotal);
  for (const entry of Demographics.surnames) {
    assert.ok(Number.isSafeInteger(entry.population) && entry.population > 0);
    assert.equal(entry.weight, entry.population);
    assert.equal(entry.sourceId, 'kostat-surnames-2015');
  }
  assert.deepEqual(Demographics.surnames.find(entry => entry.name === '정'), {name:'정', hanja:'鄭', population:2151879, weight:2151879, sourceId:'kostat-surnames-2015'});
  assert.match(Demographics.surnameCoverage.limitations, /다른 한자 성씨/);
});

test('demographics: every aggregate resolves to a dated source and secondary name evidence is identified', () => {
  const sources = new Map(Demographics.sources.map(source => [source.id, source]));
  assert.equal(sources.size, Demographics.sources.length);
  for (const source of sources.values()) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.title && source.publisher && source.scope && source.limitations && source.asOf);
    assert.equal(source.verifiedOn, '2026-10-17');
    assert.equal(typeof source.primary, 'boolean');
  }
  assert.equal(sources.get(Demographics.population.sourceId).primary, true);
  assert.match(sources.get(Demographics.population.sourceId).scope, /거주불명자·재외국민/);
  for (const list of Demographics.nameLists) assert.equal(sources.get(list.sourceId).primary, false);
  for (const entry of Demographics.surnames) assert.equal(sources.get(entry.sourceId).primary, true);
});

test('demographics: browser and CommonJS share an immutable offline snapshot without prototype-key lookups', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'demographics.js'), 'utf8'), sandbox);
  assert.equal(JSON.stringify(sandbox.S2Demographics), JSON.stringify(Demographics));
  assert.equal(Object.getPrototypeOf(Demographics.regionMap), null);
  for (const key of ['__proto__','constructor','toString']) assert.equal(Demographics.regionMap[key], undefined);
  assert.throws(() => { Demographics.regions[0].population = 1; }, TypeError);
  assert.throws(() => { Demographics.names[0].sourceIds.push('unverified'); }, TypeError);
  assert.throws(() => { Demographics.sources[0].asOf = '2026-10-17'; }, TypeError);
});
