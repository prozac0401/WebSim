'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const N = require('./name-cohorts.js');

test('name cohorts preserve all nine source periods and 360 birth-name table entries', () => {
  assert.equal(N.COHORTS.length, 9); assert.equal(N.COVERAGE.tableEntries, 360);
  assert.equal(N.COVERAGE.fullPopulationDenominator, null);
  assert.equal(N.COVERAGE.representsPopulationFrequency, false);
  for (const c of N.COHORTS) for (const names of [c.men, c.women]) {
    assert.equal(names.length, 20); assert.equal(new Set(names).size, 20);
    assert.ok(names.every(name => /^[가-힣]{2}$/.test(name)));
  }
  assert.deepEqual(N.COHORTS.map(c => [c.men[0], c.women[0]]), [
    ['영수','영자'], ['영수','영숙'], ['영수','미숙'], ['정훈','은주'], ['지훈','지혜'],
    ['지훈','유진'], ['민준','유진'], ['민준','서윤'], ['서준','서아']
  ]);
  assert.equal(N.COHORTS[2].men[19], '종철'); assert.equal(N.COHORTS[6].women[19], '지우');
});

test('65-year-old and 26-year-old examples cannot receive the opposite era names', () => {
  for (let i=0; i<1000; i++) {
    const old=N.sample({year:2026,age:65,gender:'man'},()=>i/1000);
    const young=N.sample({year:2026,age:26,gender:'woman'},()=>i/1000);
    assert.equal(old.birthYear,1961); assert.equal(old.cohortId,'birth-1960-1969'); assert.notEqual(old.name,'민준');
    assert.equal(young.birthYear,2000); assert.equal(young.cohortId,'birth-2000-2009'); assert.notEqual(young.name,'미숙');
    assert.equal(old.extrapolated,false); assert.equal(young.extrapolated,false);
  }
});

test('selection uses birth year rather than permanently assigning names by current age', () => {
  for (const [year,age,start] of [[2026,22,2000],[2026,32,1990],[2026,42,1980],[2026,52,1970],[2026,62,1960],[2036,42,1990]]) {
    const s=N.sample({year,age,gender:'woman'},()=>0);
    assert.equal(s.referenceYear,start); assert.deepEqual(s.referencePeriod,[start,start+9]);
  }
  for (const c of N.COHORTS) for (const birthYear of [c.from,c.to]) {
    assert.equal(N.sample({year:birthYear+30,age:30},()=>0).cohortId,c.id);
  }
});

test('out-of-coverage birth years disclose clamping without inventing future observations', () => {
  const before=N.sample({year:2026,age:100},()=>0),after=N.sample({year:2100,age:26},()=>0);
  assert.equal(before.birthYear,1926); assert.deepEqual(before.referencePeriod,[1940,1949]); assert.equal(before.extrapolated,true);
  assert.equal(after.birthYear,2074); assert.deepEqual(after.referencePeriod,[2020,2021]); assert.equal(after.extrapolated,true);
  assert.equal(N.sample({year:2041,age:20},()=>0).extrapolated,false);
  assert.equal(N.sample({year:2042,age:20},()=>0).extrapolated,true);
});

test('explicit gender only selects a name pool; unspecified and other identities use a deduplicated union', () => {
  const c={year:2026,age:26},cohort=N.COHORTS[6],all=[...new Set([...cohort.men,...cohort.women])];
  for(let i=0;i<20;i++) {
    assert.equal(N.sample({...c,gender:'man'},()=>i/20).name,cohort.men[i]);
    assert.equal(N.sample({...c,gender:'female'},()=>i/20).name,cohort.women[i]);
  }
  for(const gender of ['unspecified','nonbinary','other',undefined])for(let i=0;i<all.length;i++) {
    assert.equal(N.sample({...c,gender},()=>i/all.length).name,all[i]);
  }
});

test('one supplied random draw is reproducible, ignores economic attributes and never mutates a life', () => {
  const config={year:2026,age:38,gender:'woman',salary:123,province:'seoul',role:'worker',personaName:'그대로둘이름',rng:{external:99,followup:44}};
  const before=JSON.stringify(config);let draws=0;
  const one=N.sample(config,()=>{draws++;return .35;});assert.equal(draws,1);assert.equal(JSON.stringify(config),before);
  assert.deepEqual(one,N.sample({...config,role:'graduate',salary:99999999,province:'jeju'},()=>.35));
  assert.equal(config.personaName,'그대로둘이름');
});

test('invalid configuration and random inputs fail explicitly and source exports remain immutable', () => {
  for(const config of [null,{},[],{year:2026,age:NaN},{year:2026,age:-1},{year:2026,age:121},{year:2026.5,age:30}])assert.throws(()=>N.sample(config,()=>0));
  for(const value of [-1,1,NaN,Infinity])assert.throws(()=>N.sample({year:2026,age:30},()=>value));
  assert.throws(()=>N.sample({year:2026,age:30}));
  assert.throws(()=>N.COHORTS[0].men.push('가짜')); assert.throws(()=>{N.MODEL.lastYear=2100;});
});

test('browser global and CommonJS expose identical standalone samples without DOM or network', () => {
  const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'name-cohorts.js'),'utf8'),sandbox);
  const c={year:2026,age:65,gender:'male'};
  assert.equal(JSON.stringify(sandbox.S2NameCohorts.sample(c,()=>.4)),JSON.stringify(N.sample(c,()=>.4)));
});
